/**
 * T2a 缓存接入收尾（issue #4 验收 5）：润色 / 一键完善经 `ai.ts` 的接入点。
 *
 * - 键含 route 维度：换候选路由不命中旧缓存；
 * - 失败结果不入缓存：失败后再调 = 再次真实调用（两次都打到假 runtime）；
 * - 命中仅开发日志：`__DEV__` = false 时命中行为与生产一致（零写盘），开发构建才落盘；
 * - 写回类操作（技能描述符）不接缓存：同一输入两次调用 = 两次真实调用。
 *
 * 用假 LlmRuntime 经 `registerLlm` 注入（ai.ts 的公开注入面），DSH_HOME 指向临时目录。
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

globalThis.__DEV__ = false;
const HOME_BEFORE = process.env.DSH_HOME;
process.env.DSH_HOME = mkdtempSync(join(tmpdir(), "dpe-ai-cache-"));

const ai = await import("../src/host/ai.ts");
const { aiResultCache } = await import("../src/host/ai-cache.ts");

after(() => {
  rmSync(process.env.DSH_HOME, { recursive: true, force: true });
  if (HOME_BEFORE === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = HOME_BEFORE;
});

beforeEach(() => {
  aiResultCache.clear();
  ai.clearRouteCache();
  ai.registerLlm(undefined);
});

function fakeStream(script) {
  return async function* () {
    for (const step of script) {
      if (typeof step === "string") yield { type: "text-delta", index: 0, text: step };
      else yield step;
    }
  };
}

const settings = { aiProvider: "", aiModel: "" };

/** 记调用次数的假 runtime；剧本耗尽后重复最后一份。 */
function countingRuntime(scripts) {
  const queue = [...scripts];
  let calls = 0;
  return {
    runtime: {
      listProviders: () => [{ id: "fake", name: "Fake" }],
      listModels: async () => [{ id: "fake-chat", name: "Fake Chat" }],
      stream: () => {
        calls++;
        const script = queue.length > 1 ? queue.shift() : queue[0];
        return fakeStream(script)();
      },
    },
    get calls() {
      return calls;
    },
  };
}

test("缓存命中：同输入第二次润色零模型调用、结果一致", async () => {
  const fake = countingRuntime([["润色稿 A", { type: "finish", reason: { kind: "stop" } }]]);
  ai.registerLlm(fake.runtime);
  const first = await ai.polishPromptBodyCore("草稿", settings);
  const second = await ai.polishPromptBodyCore("草稿", settings);
  assert.deepEqual(first, { ok: true, polished: "润色稿 A" });
  assert.deepEqual(second, first, "命中缓存返回同一结果");
  assert.equal(fake.calls, 1, "第二次调用必须命中缓存（0 次模型调用）");
});

test("键含 route 维度：换候选路由不命中旧缓存", async () => {
  // 两个 runtime 的 route 必须**不同**（键含 route ⇒ 同 route 命中是正确行为，不构成本用例）。
  const runtimeA = {
    listProviders: () => [{ id: "fake-a", name: "Fake A" }],
    listModels: async () => [{ id: "chat-a", name: "Chat A" }],
    stream: () => fakeStream([["A 的润色稿", { type: "finish", reason: { kind: "stop" } }]])(),
  };
  ai.registerLlm(runtimeA);
  await ai.polishPromptBodyCore("草稿", settings);

  const fakeB = countingRuntime([["B 的润色稿", { type: "finish", reason: { kind: "stop" } }]]);
  // 给 B 一个不同的 provider id：listProviders 返回 fake-b ⇒ 候选路由 fake-b/... ≠ fake-a/...
  fakeB.runtime.listProviders = () => [{ id: "fake-b", name: "Fake B" }];
  ai.registerLlm(fakeB.runtime); // registerLlm 顺带清路由缓存
  ai.clearRouteCache();
  const second = await ai.polishPromptBodyCore("草稿", settings);
  assert.deepEqual(second, { ok: true, polished: "B 的润色稿" }, "route 不同 ⇒ 不得命中 A 的缓存");
  assert.equal(fakeB.calls, 1, "换路由后必须真实调用");
});

test("失败不入缓存：失败后再次调用 = 再次真实调用（拿到第二次机会）", async () => {
  // 注意：能力调用内部自带诊断重试（首试失败会再试一次），故**两个轮次都失败**才算整体失败；
  // 第三份剧本给「失败之后的那次调用」成功——若失败结果被错误入缓存，第三次调用会命中缓存拿不到它。
  const fake = countingRuntime([
    [{ type: "finish", reason: { kind: "stop" } }], // 首调重试轮 1：空回复
    [{ type: "finish", reason: { kind: "stop" } }], // 首调重试轮 2：仍空回复 ⇒ 整体失败
    ["失败后的成功稿", { type: "finish", reason: { kind: "stop" } }],
  ]);
  ai.registerLlm(fake.runtime);
  const first = await ai.polishPromptBodyCore("草稿", settings);
  assert.equal(first.ok, false);
  const second = await ai.polishPromptBodyCore("草稿", settings);
  assert.deepEqual(second, { ok: true, polished: "失败后的成功稿" }, "失败不入缓存 ⇒ 第二次调用真实执行并成功");
  assert.equal(fake.calls, 3, "2（首调含重试）+ 1（第二次调用）= 3 次模型调用");
});

test("refine 同规则：同输入命中缓存；写回类（技能描述符）不接缓存", async () => {
  const refineFake = countingRuntime([
    ['{"title":"t","tags":[],"summary":"s","body":"完善正文"}', { type: "finish", reason: { kind: "stop" } }],
  ]);
  ai.registerLlm(refineFake.runtime);
  const r1 = await ai.refinePromptCore("草稿", settings, []);
  const r2 = await ai.refinePromptCore("草稿", settings, []);
  assert.deepEqual(r2, r1);
  assert.equal(refineFake.calls, 1, "refine 同输入第二次命中缓存");

  const descFake = countingRuntime([
    ['{"name":"skill-a","description":"d","whenToUse":"w"}', { type: "finish", reason: { kind: "stop" } }],
  ]);
  ai.registerLlm(descFake.runtime);
  const prompt = { title: "t", body: "正文" };
  await ai.generateSkillDescriptor(prompt, settings);
  await ai.generateSkillDescriptor(prompt, settings);
  assert.equal(descFake.calls, 2, "技能描述符是写回类操作的输入，不接缓存");
});

test("命中日志仅开发构建：__DEV__=false 时命中不写任何 AI 日志", async () => {
  const fake = countingRuntime([["润色稿", { type: "finish", reason: { kind: "stop" } }]]);
  ai.registerLlm(fake.runtime);
  await ai.polishPromptBodyCore("草稿", settings);
  await ai.polishPromptBodyCore("草稿", settings); // 命中
  const logRoot = join(process.env.DSH_HOME, "prompt-enhancer", "log");
  assert.equal(existsSync(logRoot), false, "非 dev 构建不得创建日志目录（命中与未命中都不写）");
});
