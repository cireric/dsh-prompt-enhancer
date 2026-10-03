/**
 * R1 + R3 负样本（2026-10-03 代码审查）。
 *
 * R1：润色的**诊断重试**不得要求 JSON。诊断块原先写死「本次请严格输出一个 JSON 对象」，而润色是
 * 纯文本能力（system 说「直接输出润色后的提示词正文」）——重试消息与 system 正面冲突，实测会把
 * JSON 带进用户的提示词正文。修复后润色传 `"text"`，一键完善/摘要/技能描述符仍传 `"json"`。
 *
 * R3：一次能力共享一个总预算（110s < 客户端 120s），每次尝试的超时 = min(30s, 剩余)。
 * 预算耗尽必须**直接停手**（零模型调用），而不是「发出去立刻超时」。
 *
 * 隔离纪律：先把 DSH_HOME 指向临时目录，**再**动态 import 宿主模块（见 tests/store.test.mjs 顶部）。
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

globalThis.__DEV__ = false;
const HOME_BEFORE = process.env.DSH_HOME;
process.env.DSH_HOME = mkdtempSync(join(tmpdir(), "dpe-ai-budget-"));

const ai = await import("../src/host/ai.ts");
const budgetMod = await import("../src/host/ai-budget.ts");
const { aiResultCache } = await import("../src/host/ai-cache.ts");
/** 客户端 AI 超时（跨层不变量的另一端）。api.ts 是纯模块，import 它不触 DOM / fetch。 */
const { AI_TIMEOUT_MS } = await import("../src/client/utils/api.ts");

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

const settings = { aiProvider: "", aiModel: "" };
const STOP = { type: "finish", reason: { kind: "stop" } };
const EMPTY = [STOP];

/**
 * 假流：字符串 = 一段 text-delta；对象 = 原样产出的 chunk（与 ai-errors-route 同款）；
 * `{ wait: ms }` = 先等一会儿再继续——让**墙钟预算**真的走掉（否则假 runtime 瞬间返回，
 * 剩余预算永远是满的，共享预算那条用例就测不出任何东西）。
 */
function fakeStream(script) {
  return async function* () {
    for (const step of script) {
      if (typeof step === "object" && step !== null && typeof step.wait === "number") {
        await new Promise((resolve) => setTimeout(resolve, step.wait));
        continue;
      }
      if (typeof step === "string") yield { type: "text-delta", index: 0, text: step };
      else yield step;
    }
  };
}

/** 记录「调用次数 + 每次的 user 消息」的假 runtime；剧本耗尽后重复最后一份。 */
function capturingRuntime(scripts) {
  const queue = [...scripts];
  const messages = [];
  let calls = 0;
  return {
    messages,
    get calls() { return calls; },
    runtime: {
      listProviders: () => [{ id: "fake", name: "Fake" }],
      listModels: async () => [{ id: "fake-chat", name: "Fake Chat" }],
      stream: (options) => {
        calls++;
        messages.push(options.messages[0].content[0].text);
        return fakeStream(queue.length > 1 ? queue.shift() : queue[0])();
      },
    },
  };
}

// ── R3：预算算术（纯模块）──────────────────────────────────────────────────

test("R3 预算算术：单次尝试 = min(30s, 剩余)；耗尽返回 0", () => {
  const b = budgetMod.startAiBudget(110_000, 0);
  assert.equal(budgetMod.attemptTimeoutMs(b, 0), 30_000, "起步时给满单次上限");
  assert.equal(budgetMod.attemptTimeoutMs(b, 80_000), 30_000, "剩余 30s ⇒ 仍是单次上限");
  assert.equal(budgetMod.attemptTimeoutMs(b, 100_000), 10_000, "剩余 10s ⇒ 超时被预算截断");
  assert.equal(budgetMod.attemptTimeoutMs(b, 110_000), 0, "到点即耗尽");
  assert.equal(budgetMod.attemptTimeoutMs(b, 999_999), 0, "超支仍返回 0");
  assert.equal(budgetMod.attemptTimeoutMs(budgetMod.startAiBudget(0, 0), 0), 0, "零预算立刻耗尽");
  assert.equal(budgetMod.remainingMs(b, 110_000), 0);
});

test("R3 上界：候选与重试再多，一次能力的累计耗时也不超过总预算", () => {
  const b = budgetMod.startAiBudget(110_000, 0);
  let now = 0;
  let calls = 0;
  while (calls < 50) {
    const t = budgetMod.attemptTimeoutMs(b, now);
    if (t === 0) break;
    calls++;
    now += t; // 最坏情况：每次尝试都用满自己的超时
  }
  assert.ok(now <= budgetMod.AI_TOTAL_BUDGET_MS, "累计 " + now + "ms 必须 ≤ 总预算 " + budgetMod.AI_TOTAL_BUDGET_MS);
  assert.ok(calls >= 3, "不得保守到一两次就放弃（否则候选轮询形同废止）");
});

test("R3 跨层不变量：宿主总预算严格小于客户端 AI 超时（防「宿主还在烧额度、用户已看到超时」复活）", () => {
  assert.ok(
    budgetMod.AI_TOTAL_BUDGET_MS < AI_TIMEOUT_MS,
    "AI_TOTAL_BUDGET_MS(" + budgetMod.AI_TOTAL_BUDGET_MS + ") 必须 < 客户端 AI_TIMEOUT_MS(" + AI_TIMEOUT_MS + ")",
  );
});

// ── R1：诊断文案按能力分形 ─────────────────────────────────────────────────

test("R1 润色：重试诊断必须是纯文本口径（不得出现 JSON 字样）", async () => {
  const cap = capturingRuntime([
    EMPTY,                                  // 首试：空输出 ⇒ 触发诊断重试
    ["润色稿A", STOP],                       // 重试：正文
  ]);
  ai.registerLlm(cap.runtime);
  const r = await ai.polishPromptBodyCore("草稿", settings);

  assert.deepEqual(r, { ok: true, polished: "润色稿A" });
  assert.equal(cap.messages.length, 2, "首试 + 一次重试");
  assert.ok(!cap.messages[0].includes("上一次尝试失败"), "首试不得携带诊断");
  assert.ok(!/JSON/i.test(cap.messages[1]), "润色的重试诊断不得出现 JSON 字样（会与 system 的「直接输出正文」冲突）");
  assert.ok(cap.messages[1].includes("正文"), "诊断要明说本次直接输出正文");
  assert.ok(cap.messages[1].includes("empty-output"), "仍要携带失败类型");
});

test("R1 回归：一键完善的诊断仍要求 JSON（不得被润色的口径带跑）", async () => {
  // 注意：`schema-mismatch`（拿到文本但解析不出字段）**不触发**诊断重试——它发生在
  // `callLlmWithRetry` 返回之后的解析步；重试只包在「这一次尝试本身失败」（超时 / 空输出 / 抛错）外面。
  // 故这里用「首试空输出」触发重试，正是 JSON 诊断该出现的那条路径。
  const cap = capturingRuntime([
    EMPTY,                                    // 首试：空输出 ⇒ 触发诊断重试
    ['{"title":"t","tags":[],"summary":"s","body":"完善稿"}', STOP],
  ]);
  ai.registerLlm(cap.runtime);
  const r = await ai.refinePromptCore("草稿", settings, []);

  assert.equal(r.ok, true, "重试成功后一键完善必须整体成功");
  assert.equal(r.refined.body, "完善稿");
  assert.equal(cap.messages.length, 2);
  assert.ok(/JSON/.test(cap.messages[1]), "JSON 能力的诊断必须继续要求 JSON 对象");
  assert.ok(!/直接输出正文/.test(cap.messages[1]), "JSON 能力不得被纯文本口径带跑");
});

// ── R3：预算接线的端到端判据 ───────────────────────────────────────────────

test("R3 预算耗尽：润色一次模型调用都不发（不是「发出去立刻超时」）", async () => {
  const cap = capturingRuntime([["不该被调用", STOP]]);
  ai.registerLlm(cap.runtime);
  const r = await ai.polishPromptBodyCore("草稿", settings, { budget: budgetMod.startAiBudget(0) });

  assert.equal(r.ok, false, "预算耗尽必须失败");
  assert.equal(r.code, "timeout", "失败码取 timeout（预算耗尽的归类）");
  assert.equal(cap.calls, 0, "预算耗尽必须直接停手，不得再打模型");
});

test("R3 预算耗尽：技能描述符的 3 轮循环同样不发请求", async () => {
  const cap = capturingRuntime([["不该被调用", STOP]]);
  ai.registerLlm(cap.runtime);
  const r = await ai.generateSkillDescriptor({ title: "t", body: "正文" }, settings, budgetMod.startAiBudget(0));

  assert.deepEqual(r, { fail: "timeout" });
  assert.equal(cap.calls, 0);
});

