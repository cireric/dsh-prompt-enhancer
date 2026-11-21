import assert from "node:assert/strict";
import { test } from "node:test";
import { applyVerifiedPrompt } from "../src/client/utils/library-insertion.ts";

function setup(t, { status = 200, usageStatus = 200, delayed = false, mode = "insert" } = {}) {
  const requests = [];
  const writes = [];
  const controller = new AbortController();
  const response = Promise.withResolvers();
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    requests.push({ url, ...options });
    if (options.method === "POST") {
      return usageStatus === 200
        ? Response.json({ data: { id: "chosen/id" } })
        : Response.json({ error: "not available" }, { status: usageStatus });
    }
    if (delayed) await response.promise;
    return Response.json(status === 200 ? { data: { id: "chosen/id", body: "服务器上的正文" } } : { error: "not available" }, { status });
  };
  t.after(() => { globalThis.fetch = original; });

  let target = makeTarget("A", "原稿", 1);
  function makeTarget(session, draft, draftRev, accept = true) {
    return {
      input: { draft, draftRev, occurrences: [] },
      actions: {
        captureInsertion: () => ({ draftRev }),
        insertText: (text, { start, end }) => {
          if (!accept) return false;
          writes.push([session, draft.slice(0, start) + text + draft.slice(end)]);
          return true;
        },
        setDraft: (text) => writes.push([session, text]),
        submit: () => writes.push([session, "submitted"]),
      },
    };
  }
  return {
    requests, writes, controller, response,
    setTarget: (...args) => { target = makeTarget(...args); },
    clearTarget: () => { target = undefined; },
    apply: () => applyVerifiedPrompt({
      id: "chosen/id", body: "用户确认的正文", mode, before: target.input,
      signal: controller.signal, current: () => target,
    }),
  };
}

test("已删除：只读所选 ID，不写草稿、不发送、不记用量", async (t) => {
  const f = setup(t, { status: 404, mode: "insert-send" });
  assert.deepEqual(await f.apply(), { kind: "missing" });
  assert.deepEqual(f.writes, []);
  assert.deepEqual(f.requests.map(({ url, method }) => [method, url]), [
    ["GET", "/api/prompt-enhancer/prompts/chosen%2Fid"],
  ]);
});

test("服务错误不是已删除，也不应用缓存正文", async (t) => {
  const f = setup(t, { status: 503 });
  const result = await f.apply();
  assert.equal(result.kind, "unverified");
  assert.equal(result.error.status, 503);
  assert.deepEqual(f.writes, []);
  assert.equal(f.requests.length, 1);
});

test("校验通过后追加已确认正文到最新草稿，仅给所选条目记一次用量", async (t) => {
  const f = setup(t, { delayed: true });
  const applying = f.apply();
  assert.deepEqual(f.writes, [], "校验响应前不得写草稿");
  assert.equal(f.requests[0].cache, "no-store");
  f.setTarget("A", "更新的原稿", 2);
  f.response.resolve();
  const result = await applying;
  assert.equal(result.kind, "applied");
  await result.usage;
  assert.deepEqual(f.writes, [["A", "更新的原稿\n用户确认的正文"]]);
  assert.deepEqual(f.requests.map(({ url, method }) => [method, url]), [
    ["GET", "/api/prompt-enhancer/prompts/chosen%2Fid"],
    ["POST", "/api/prompt-enhancer/prompts/chosen%2Fid/use"],
  ]);
});

test("发起会话作废后，即使请求仍返回 200 也不能写入另一个会话", async (t) => {
  const f = setup(t, { delayed: true });
  const applying = f.apply();
  f.controller.abort();
  f.setTarget("B", "同修订号的另一份草稿", 1);
  f.response.resolve();
  assert.deepEqual(await applying, { kind: "cancelled" });
  assert.equal(f.requests[0].signal.aborted, true);
  assert.deepEqual(f.writes, []);
  assert.equal(f.requests.length, 1);
});

test("会话或面板不再是当前目标时，不执行已核对的确认", async (t) => {
  const f = setup(t, { delayed: true });
  const applying = f.apply();
  f.clearTarget();
  f.response.resolve();
  assert.deepEqual(await applying, { kind: "cancelled" });
  assert.deepEqual(f.writes, []);
  assert.equal(f.requests.length, 1);
});

test("写入成功后的用量 404 不会被误报为未插入，也不撤回草稿", async (t) => {
  const f = setup(t, { usageStatus: 404 });
  const result = await f.apply();
  assert.equal(result.kind, "applied");
  await assert.rejects(result.usage, { status: 404 });
  assert.deepEqual(f.writes, [["A", "原稿\n用户确认的正文"]]);
});

for (const mode of ["overwrite", "insert-send"]) {
  test(`${mode}：校验期间草稿版本变化，需要重新确认，不能写入或发送`, async (t) => {
    const f = setup(t, { delayed: true, mode });
    const applying = f.apply();
    f.setTarget("A", "原稿", 2);
    f.response.resolve();
    assert.deepEqual(await applying, { kind: "reconfirm", before: { draft: "原稿", draftRev: 2 } });
    assert.deepEqual(f.writes, []);
    assert.equal(f.requests.length, 1);
  });
}

test("宿主拒绝草稿写入时，不发送也不记用量", async (t) => {
  const f = setup(t, { mode: "insert-send" });
  f.setTarget("A", "原稿", 1, false);
  assert.deepEqual(await f.apply(), { kind: "rejected" });
  assert.deepEqual(f.writes, []);
  assert.equal(f.requests.length, 1);
});
