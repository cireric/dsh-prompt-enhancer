/**
 * T3 端到端（host 侧）：假 LlmRuntime → `ai.ts` 能力层 → `routes.ts` 真分发，
 * 逐失败形态断言**信封里的跨层 code**（issue #4 验收 1、3）。
 *
 * 隔离：先把 `DSH_HOME` 指向临时目录**再** import 宿主模块（本仓纪律，见 tests/meta-delete.test.mjs
 * 顶部注释）；假 runtime 经 `ai.registerLlm` 注入（ai.ts 不 import 宿主包之外的任何东西）。
 * `routes.ts` 由 `tests/helpers/fake-http.mjs` 真跑一次分发（本仓「信封形状必须真分发核对」的口径）。
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * `__DEV__` 是 esbuild define 注入的构建期常量（src/ambient.d.ts）：node --test 直跑 TS 没有 define，
 * 这里落到 globalThis 兜底（裸标识符在 globalThis 上解析即不抛 ReferenceError；打包时 define
 * 文本替换优先于全局查找，两条通道互不干扰）。false = 与生产构建同口径，顺带钉「dev 诊断不下发」。
 */
globalThis.__DEV__ = false;

const HOME_BEFORE = process.env.DSH_HOME;
process.env.DSH_HOME = mkdtempSync(join(tmpdir(), "dpe-ai-errors-"));

const { makeRoutes } = await import("../src/host/routes.ts");
const { API_PREFIX } = await import("../src/types.ts");
const ai = await import("../src/host/ai.ts");
const { makeDispatch } = await import("./helpers/fake-http.mjs");

const dispatch = makeDispatch({ makeRoutes, API_PREFIX });

/**
 * 每条用例前清两份进程级缓存（T2a 结果缓存 + 30s 路由缓存）：结果缓存键 = system+user+route，
 * 多条用例喂同一份 body「草稿」——不清缓存，前一条用例的成功结果会被后一条直接命中（串测）。
 * 这也是缓存语义的活证据：同键**就该**命中，测试的职责是给每条用例一个干净的起点。
 */
const { aiResultCache } = await import("../src/host/ai-cache.ts");
beforeEach(() => {
  aiResultCache.clear();
  ai.clearRouteCache();
});

/** 假流：按剧本产出 chunk / 抛错。字符串 = 一段 text-delta；对象 = 原样产出的 chunk。 */
function fakeStream(script) {
  return async function* () {
    for (const step of script) {
      if (step === "throw") throw new Error("网络炸了");
      if (typeof step === "string") yield { type: "text-delta", index: 0, text: step };
      else yield step;
    }
  };
}

/** 假 LlmRuntime：一次 provider，一个模型；按调用序消费剧本（耗尽后重复最后一份）。 */
function fakeRuntime(scripts) {
  const queue = [...scripts];
  return {
    listProviders: () => [{ id: "fake", name: "Fake" }],
    listModels: async () => [{ id: "fake-chat", name: "Fake Chat" }],
    stream: () => {
      const script = queue.length > 1 ? queue.shift() : queue[0];
      return fakeStream(script)();
    },
  };
}

/** 进程退出前清临时 DSH_HOME（node:test 的顶层 after 钩子）。 */
after(() => {
  rmSync(process.env.DSH_HOME, { recursive: true, force: true });
  if (HOME_BEFORE === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = HOME_BEFORE;
});

// ── 失败形态 → code 映射（真流归因）────────────────────────────────────────

test("归因 timeout：finish=aborted（30s 超时到点）→ 信封 error.code === 'timeout'", async () => {
  ai.registerLlm(fakeRuntime([[{ type: "finish", reason: { kind: "aborted", failure: { code: "aborted", message: "timeout" } } }]]));
  const out = await dispatch("POST", "/ai/polish", { body: "草稿" });
  assert.equal(out.status, 503);
  assert.equal(out.envelope.ok, false);
  assert.equal(out.envelope.error.code, "timeout");
});

test("归因 empty-output：流成功但零文本 → error.code === 'empty-output'", async () => {
  ai.registerLlm(fakeRuntime([[{ type: "finish", reason: { kind: "stop" } }]]));
  const out = await dispatch("POST", "/ai/polish", { body: "草稿" });
  assert.equal(out.status, 503);
  assert.equal(out.envelope.error.code, "empty-output");
});

test("归因 schema-mismatch：模型回了合法 JSON 但缺 body → /ai/refine error.code === 'schema-mismatch'", async () => {
  ai.registerLlm(fakeRuntime([['{"title":"只有标题","tags":[]}', { type: "finish", reason: { kind: "stop" } }]]));
  const out = await dispatch("POST", "/ai/refine", { body: "草稿" });
  assert.equal(out.status, 503);
  assert.equal(out.envelope.error.code, "schema-mismatch");
});

test("归因 unknown：流抛错 → error.code === 'unknown'", async () => {
  ai.registerLlm(fakeRuntime([["throw"]]));
  const out = await dispatch("POST", "/ai/polish", { body: "草稿" });
  assert.equal(out.status, 503);
  assert.equal(out.envelope.error.code, "unknown");
});

// ── 既有形态的 code 化（issue #4 验收 1 的「既有 no-llm / route / parse」）────

test("归因 no-llm：未注入 LLM → error.code === 'no-llm'", async () => {
  ai.registerLlm(undefined);
  const out = await dispatch("POST", "/ai/polish", { body: "草稿" });
  assert.equal(out.status, 503);
  assert.equal(out.envelope.error.code, "no-llm");
});

test("归因 route：注入了 LLM 但一个 provider 都没有 → error.code === 'route'", async () => {
  ai.registerLlm({ listProviders: () => [], listModels: async () => [], stream: () => fakeStream([])() });
  const out = await dispatch("POST", "/ai/polish", { body: "草稿" });
  assert.equal(out.status, 503);
  assert.equal(out.envelope.error.code, "route");
});

test("归因 parse（fail:parse 由技能描述符经 parseSkillJson 之外的 JSON 失败路径……本仓归并为 schema-mismatch；此处钉 refine 的合法 JSON + 空 body 同判）", async () => {
  // 说明：refine 的解析（parseRefineResult）对「JSON 合法但 body 缺失」与「根本不是 JSON」
  // 都返回 undefined——本设计统一归因为 schema-mismatch（对客户端而言两者要做的事相同：重试）。
  ai.registerLlm(fakeRuntime([["完全不是 JSON 的闲聊", { type: "finish", reason: { kind: "stop" } }]]));
  const out = await dispatch("POST", "/ai/refine", { body: "草稿" });
  assert.equal(out.status, 503);
  assert.equal(out.envelope.error.code, "schema-mismatch");
});

// ── 诊断注入重试（端到端：剧本 = 首试空回复，重试成功）──────────────────────

test("诊断重试（端到端）：首试空回复 → 恰好两次调用，重试请求携带上次失败诊断，最终成功", async () => {
  const bodies = [];
  ai.registerLlm({
    listProviders: () => [{ id: "fake", name: "Fake" }],
    listModels: async () => [{ id: "fake-chat", name: "Fake Chat" }],
    stream: (options) => {
      bodies.push(options.messages[0].content[0].text);
      return fakeStream(bodies.length === 1
        ? [{ type: "finish", reason: { kind: "stop" } }] // 首试：空回复
        : ["{\"title\":\"t\",\"tags\":[],\"summary\":\"s\",\"body\":\"完善正文\"}", { type: "finish", reason: { kind: "stop" } }])(); // 重试：给全字段
    },
  });
  const out = await dispatch("POST", "/ai/refine", { body: "草稿" });
  assert.equal(out.status, 200, "重试成功后应整体成功");
  assert.equal(out.envelope.ok, true);
  assert.equal(out.envelope.data.body, "完善正文");
  assert.equal(bodies.length, 2, "只重试一次：两次模型调用");
  assert.ok(bodies[1].includes("empty-output"), "重试请求必须携带上次失败诊断（失败类型）");
  assert.ok(!bodies[0].includes("上一次尝试失败"), "首试不得携带诊断");
});

test("诊断重试（端到端）：重试仍失败 → 信封返回最终 code", async () => {
  ai.registerLlm(fakeRuntime([[{ type: "finish", reason: { kind: "aborted", failure: { code: "aborted", message: "timeout" } } }]]));
  const out = await dispatch("POST", "/ai/polish", { body: "草稿" });
  assert.equal(out.status, 503);
  assert.equal(out.envelope.error.code, "timeout");
});

// ── 成功路径回归：code 化不改变成功信封与 data 形状 ─────────────────────────

test("成功路径回归：/ai/polish data 仍是 {polished}（不泄能力层的 ok 键）；/ai/refine data 仍是四字段", async () => {
  ai.registerLlm({
    listProviders: () => [{ id: "fake", name: "Fake" }],
    listModels: async () => [{ id: "fake-chat", name: "Fake Chat" }],
    stream: (options) => {
      const isPolish = options.system?.startsWith("你是一名专业的提示词润色助手");
      return fakeStream([
        isPolish ? "润色后的正文" : "{\"title\":\"t\",\"tags\":[],\"summary\":\"s\",\"body\":\"正文\"}",
        { type: "finish", reason: { kind: "stop" } },
      ])();
    },
  });
  const polish = await dispatch("POST", "/ai/polish", { body: "草稿" });
  assert.equal(polish.status, 200);
  assert.deepEqual(polish.envelope.data, { polished: "润色后的正文" });

  const refine = await dispatch("POST", "/ai/refine", { body: "草稿" });
  assert.equal(refine.status, 200);
  assert.deepEqual(refine.envelope.data, { title: "t", tags: [], summary: "s", body: "正文" });
});

// ── dev 诊断 message 门（宿主零文案承诺）───────────────────────────────────

test("信封 error.message：普通 node --test 进程（非 dev 构建）不下发诊断 message", async () => {
  ai.registerLlm(undefined);
  const out = await dispatch("POST", "/ai/polish", { body: "草稿" });
  assert.equal(out.envelope.error.code, "no-llm");
  assert.equal(out.envelope.error.message, undefined, "__DEV__ 为 false 时 message 必须缺省（宿主零文案）");
  assert.deepEqual(Object.keys(out.envelope.error).sort(), ["code"]);
});
