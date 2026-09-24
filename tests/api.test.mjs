import { test } from "node:test";
import assert from "node:assert/strict";

const { api, ApiError, AI_TIMEOUT_MS } = await import("../src/client/utils/api.ts");

/** 打桩 globalThis.fetch：记录每次调用，调用方必须 try/finally 复原。 */
function stubFetch(handler) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init);
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

function jsonRes(body, status = 200) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

test("信封失败：ok:false 且无 data → 抛 ApiError，message 为服务端文案、status 为 HTTP 状态", async () => {
  const s = stubFetch(() => jsonRes({ ok: false, error: "提示词不存在" }, 404));
  try {
    await assert.rejects(api.listPrompts(), (err) => {
      assert.ok(err instanceof ApiError, "应是 ApiError");
      assert.equal(err.message, "提示词不存在");
      assert.equal(err.status, 404);
      return true;
    });
  } finally {
    s.restore();
  }
});

test("非 JSON 响应（HTML）→ 抛可读 ApiError 且 message 含 HTTP 状态", async () => {
  const s = stubFetch(() => ({
    status: 500,
    ok: false,
    json: async () => { throw new SyntaxError("Unexpected token < in JSON at position 0"); },
  }));
  try {
    await assert.rejects(api.getSettings(), (err) => {
      assert.ok(err instanceof ApiError, "应是 ApiError");
      assert.match(err.message, /500/);
      assert.equal(err.status, 500);
      return true;
    });
  } finally {
    s.restore();
  }
});

// 超时路径不在此伪造 120s 真超时（不可等待）：AbortSignal 的存在性在此断言，
// TimeoutError → "ai.timeout" 的映射由 ai-flow.test.mjs 的 DOMException("TimeoutError") 用例覆盖。
test("polishPrompt：请求体 {body,keepVariables,withSummary:false} 且带未中断的 AbortSignal，返回 polished", async () => {
  const s = stubFetch(() => jsonRes({ ok: true, data: { polished: "AI 完善稿" } }));
  try {
    const out = await api.polishPrompt("原文草稿");
    assert.deepEqual(out, { polished: "AI 完善稿" });
    assert.equal(s.calls.length, 1);
    const { url, init } = s.calls[0];
    assert.equal(url, "/api/prompt-enhancer/ai/polish");
    assert.equal(init.method, "POST");
    assert.deepEqual(JSON.parse(init.body), { body: "原文草稿", keepVariables: true, withSummary: false });
    assert.ok(init.signal instanceof AbortSignal, "init.signal 应是 AbortSignal");
    assert.equal(init.signal.aborted, false);
  } finally {
    s.restore();
  }
});

test("polishPrompt：keepVariables:false 透传 false", async () => {
  const s = stubFetch(() => jsonRes({ ok: true, data: { polished: "x" } }));
  try {
    await api.polishPrompt("原文", { keepVariables: false });
    assert.deepEqual(JSON.parse(s.calls[0].init.body), { body: "原文", keepVariables: false, withSummary: false });
  } finally {
    s.restore();
  }
});

test("refinePrompt：{title,tags,summary,body} 原样透传，并带 AbortSignal", async () => {
  const payload = { title: "标题", tags: ["a"], summary: "摘要", body: "正文" };
  const s = stubFetch(() => jsonRes({ ok: true, data: payload }));
  try {
    const out = await api.refinePrompt("原文草稿");
    assert.deepEqual(out, payload);
    assert.equal(s.calls[0].url, "/api/prompt-enhancer/ai/refine");
    assert.ok(s.calls[0].init.signal instanceof AbortSignal);
  } finally {
    s.restore();
  }
});

test("createPrompt：返回 {prompt, evicted}，evicted 不丢", async () => {
  const s = stubFetch(() => jsonRes({ ok: true, data: { prompt: { id: "p1", title: "t" }, evicted: ["p2", "p3"] } }));
  try {
    const out = await api.createPrompt({ title: "t", body: "b" });
    assert.deepEqual(out.prompt, { id: "p1", title: "t" });
    assert.deepEqual(out.evicted, ["p2", "p3"]);
    assert.equal(s.calls[0].url, "/api/prompt-enhancer/prompts");
    assert.deepEqual(JSON.parse(s.calls[0].init.body), { title: "t", body: "b" });
  } finally {
    s.restore();
  }
});

test("updatePrompt：PUT 到带编码的 id 路径并透传补丁", async () => {
  const s = stubFetch(() => jsonRes({ ok: true, data: { id: "a/b", title: "改后" } }));
  try {
    const out = await api.updatePrompt("a/b", { title: "改后" });
    assert.equal(out.title, "改后");
    assert.equal(s.calls[0].url, "/api/prompt-enhancer/prompts/a%2Fb");
    assert.equal(s.calls[0].init.method, "PUT");
    assert.deepEqual(JSON.parse(s.calls[0].init.body), { title: "改后" });
  } finally {
    s.restore();
  }
});

test("rollbackPrompt 400：抛 ApiError 且 message 含「没有可回退的原文」", async () => {
  const s = stubFetch(() => jsonRes({ ok: false, error: "该提示词没有可回退的原文（sourceBody 为空）" }, 400));
  try {
    await assert.rejects(api.rollbackPrompt("p1"), (err) => {
      assert.ok(err instanceof ApiError);
      assert.match(err.message, /没有可回退的原文/);
      assert.equal(err.status, 400);
      return true;
    });
    assert.equal(s.calls[0].url, "/api/prompt-enhancer/prompts/p1/rollback");
  } finally {
    s.restore();
  }
});

test("listAiProviders：数组原样透传", async () => {
  const providers = [{ provider: "deepseek", name: "DeepSeek", models: [{ id: "m1", name: "M1" }] }];
  const s = stubFetch(() => jsonRes({ ok: true, data: providers }));
  try {
    assert.deepEqual(await api.listAiProviders(), providers);
    assert.equal(s.calls[0].url, "/api/prompt-enhancer/ai/providers");
    assert.equal(s.calls[0].init.method, "GET");
  } finally {
    s.restore();
  }
});

test("api 表面：P4 的 5 个方法与 P5 新增的 6 个方法都在，且 AI 超时为 120000ms", () => {
  for (const name of ["listPrompts", "recordUsage", "getSettings", "getMeta", "setMeta"]) {
    assert.equal(typeof api[name], "function", name + " 应保留");
  }
  for (const name of ["createPrompt", "updatePrompt", "rollbackPrompt", "listAiProviders", "polishPrompt", "refinePrompt"]) {
    assert.equal(typeof api[name], "function", name + " 应新增");
  }
  assert.equal(AI_TIMEOUT_MS, 120000);
});
