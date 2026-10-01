/**
 * 润色 system prompt 的两条**已裁定约束** + 变量授权（2026-09-30 需求讨论落定）。
 *
 * 观察面 = 假 LlmRuntime 收到的 `options.system` **与** `options.messages`：`polishSystemPrompt`
 * 是模块私有的，而「实际发出去的那份请求」才是这些约束真正的作用面（注释不承重，发出去的文本
 * 才承重）。记 messages 的第二个理由：① 的理由是「请求侧从不提供风格证据」——只断言 system
 * 就能被绕过（把风格提示挪进 user content，system 依旧干净）。
 *
 * 负样本纪律（先变异验证能抓到对应缺陷，再留用例）：
 *  · ① 把「擅长贴合用户的写作风格」加回 system，或往 user content 加风格证据 ⇒ 必红；
 *  · ② 删掉长度约束行 ⇒ 必红；
 *  · ④ 去掉「长度约束有一个例外」这个标记，或让关掉授权的草稿也带授权 ⇒ 必红。
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

globalThis.__DEV__ = false;
const HOME_BEFORE = process.env.DSH_HOME;
process.env.DSH_HOME = mkdtempSync(join(tmpdir(), "dpe-polish-prompt-"));

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

/** 假 runtime：记下每次调用收到的 system 与 messages，回一段能被剥套话逻辑原样留下的润色稿。 */
function capturingRuntime(capture) {
  return {
    listProviders: () => [{ id: "fake", name: "Fake" }],
    listModels: async () => [{ id: "fake-chat", name: "Fake Chat" }],
    stream: (options) => {
      capture.push({ system: options.system, messages: options.messages });
      return (async function* () {
        yield { type: "text-delta", index: 0, text: "润色稿" };
        yield { type: "finish", reason: { kind: "stop" } };
      })();
    },
  };
}

const settings = { aiProvider: "", aiModel: "" };
/** 探针草稿刻意不含「风格」二字：下面要对整份请求断言「不含风格证据」，草稿本身不能贡献假阳性。 */
const PLAIN_DRAFT = "写一份周报";

test("① system 不得声明「贴合用户的写作风格」，且请求侧确实没有风格证据", async () => {
  const capture = [];
  ai.registerLlm(capturingRuntime(capture));
  const result = await ai.polishPromptBodyCore(PLAIN_DRAFT, settings);
  assert.equal(result.ok, true, "前置：本次调用必须真的走到模型出口（否则断言打在空气上）");
  assert.equal(capture.length, 1);
  assert.ok(
    !capture[0].system.includes("写作风格"),
    "system prompt 声明了请求里根本不存在的风格证据（user 侧只有草稿正文）",
  );
  // 前提也要真验：只断言 system，「把风格提示挪进 user content」就是现成的绕过路径。
  const request = JSON.stringify(capture[0].messages);
  assert.ok(request.includes(PLAIN_DRAFT), "前提：请求里必须真的带上草稿正文");
  assert.ok(!request.includes("写作风格"), "请求侧任何位置都不得出现风格证据");
});

test("② 必须写明长度约束：等长或更精炼 / 不得扩写 / 不得加原文没有的事实", async () => {
  const capture = [];
  ai.registerLlm(capturingRuntime(capture));
  await ai.polishPromptBodyCore(PLAIN_DRAFT, settings);
  const system = capture[0].system;
  assert.ok(system.includes("等长或更精炼"), "缺少长度契约（此前只有代码注释写了，prompt 里没有）");
  assert.ok(system.includes("不得扩写"), "缺少扩写刹车");
  assert.ok(system.includes("不得增加原文没有的要求"), "缺少「不得增加事实」这另一半");
});

test("④ 变量授权：含变量的草稿才拿到，且被显式标为长度约束的例外", async () => {
  const withVars = [];
  ai.registerLlm(capturingRuntime(withVars));
  await ai.polishPromptBodyCore("给{{对象}}写一份周报", settings);
  assert.ok(
    withVars[0].system.includes("模板变量占位符"),
    "含变量的草稿必须保留变量授权（既有的通用化能力）",
  );
  assert.ok(
    withVars[0].system.includes("长度约束有一个例外"),
    "授权必须显式标成长度约束的例外——否则它与「不得增加原文没有的内容」自相矛盾",
  );

  // 无变量的草稿：客户端发的是 keepVariablesFor(draft) === needsValues(draft) === false
  // （见 client/utils/ai-flow.ts 与 AIPolishButton 的调用点）。**不能省略 opts**——省略时
  // `opts?.keepVariables !== false` 判成 true，授权照样下发，这条用例就打在空气上。
  const plain = [];
  ai.registerLlm(capturingRuntime(plain));
  await ai.polishPromptBodyCore(PLAIN_DRAFT, settings, { keepVariables: false });
  // 断言的是**语义锚点**而不是「不含 {{」：后者会被将来任何一行无关的花括号误伤。
  assert.ok(!plain[0].system.includes("模板变量占位符"), "关掉授权的草稿不得出现变量保留规则");
  assert.ok(
    !plain[0].system.includes("长度约束有一个例外"),
    "关掉授权的草稿不得出现变量授权（授权与内容同生共死）",
  );
});
