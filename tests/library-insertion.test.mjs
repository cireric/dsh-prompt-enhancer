import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyVerifiedPrompt, discardSubmittedInsertion, markInsertionSubmitted, prepareLibraryInsertion, prepareLibraryUse,
} from "../src/client/utils/library-insertion.ts";

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
    const httpStatus = (delayed && requests.length === 1 ? await response.promise : undefined) ?? status;
    return Response.json(httpStatus === 200 ? { data: { id: "chosen/id", body: "服务器上的正文" } }
      : { error: "not available" }, { status: httpStatus });
  };
  t.after(() => { globalThis.fetch = original; });

  const sessionActions = new Map();
  let target = makeTarget("A", "原稿", 1);
  function makeTarget(session, draft, draftRev, { accept = true, attachmentIds = [], phase = "plain" } = {}) {
    const input = { draft, draftRev, occurrences: [], attachmentIds, phase };
    if (!sessionActions.has(session)) {
      sessionActions.set(session, {
        captureInsertion: () => ({ draftRev: target.input.draftRev }),
        insertText: (text, { start, end }) => {
          if (!target.accept) return false;
          const { draft } = target.input;
          writes.push([session, draft.slice(0, start) + text + draft.slice(end)]);
          return true;
        },
        setDraft: (text) => writes.push([session, text]),
        submit: () => writes.push([session, "submitted"]),
      });
    }
    return { input, actions: sessionActions.get(session), accept };
  }
  const prepare = () => prepareLibraryInsertion("chosen/id", mode, target);
  let insertion;
  return {
    requests, writes, controller, response,
    setTarget: (...args) => { target = makeTarget(...args); },
    clearTarget: () => { target = undefined; },
    choose: (body) => prepareLibraryUse({ id: "chosen/id", body }, mode, target),
    applyUse: ({ insertion, confirmation }) => applyVerifiedPrompt({
      insertion, confirmation, signal: controller.signal, current: () => target,
    }),
    apply: (confirmation = { body: "用户确认的正文" }) => applyVerifiedPrompt({
      insertion: insertion ??= prepare(), confirmation,
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

test("无变量发送遇延迟 503，重试同一意图仍须复核变化的草稿", async (t) => {
  const f = setup(t, { mode: "insert-send", delayed: true });
  const use = f.choose("预览确认的正文");
  const applying = f.applyUse(use);
  f.setTarget("A", "核验失败期间的新版", 2);
  f.response.resolve(503);
  assert.equal((await applying).kind, "unverified");
  const retry = await f.applyUse(use);
  assert.equal(retry.kind, "reconfirm");
  assert.equal(retry.review.draft, "核验失败期间的新版");
  assert.equal(retry.review.body, "预览确认的正文");
  assert.deepEqual(f.requests.map(({ method }) => method), ["GET"]);
  assert.deepEqual(f.writes, []);
  const applied = await f.applyUse({ ...use, confirmation: { review: retry.review } });
  assert.equal(applied.kind, "applied");
  await applied.usage;
  assert.deepEqual(f.writes, [["A", "核验失败期间的新版\n预览确认的正文"], ["A", "submitted"]]);
});

test("抢屏只保留尚未提交的变量填窗", async (t) => {
  const f = setup(t, { mode: "overwrite" });
  const fill = f.choose("请检查 {{文件}}");
  assert.equal(discardSubmittedInsertion(fill), fill);
  assert.equal(discardSubmittedInsertion(markInsertionSubmitted(fill)), null);
  const direct = f.choose("无变量正文");
  assert.equal(discardSubmittedInsertion(direct), null);
  f.setTarget("A", "需要再次确认的新版", 2);
  const result = await f.applyUse(direct);
  assert.equal(result.kind, "reconfirm");
  assert.equal(discardSubmittedInsertion({ ...direct, confirmation: { review: result.review } }), null);
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
    assert.deepEqual(await applying, {
      kind: "reconfirm", review: { body: "用户确认的正文", draft: "原稿", draftRev: 2, attachmentIds: [] },
    });
    assert.deepEqual(f.writes, []);
    assert.equal(f.requests.length, 1);
  });
}

for (const mode of ["insert", "overwrite", "insert-send"]) {
  test(`${mode}：填值记忆完成后复核，再决定是否查询或写入`, async (t) => {
    const f = setup(t, { mode });
    const memory = Promise.withResolvers();
    const applying = f.apply({ body: "填好的正文", remember: () => memory.promise });
    f.setTarget("A", "记忆期间的新版", 2);
    assert.deepEqual(f.requests, []);
    memory.resolve(true);
    const result = await applying;
    if (mode === "insert") {
      assert.equal(result.kind, "applied");
      await result.usage;
      assert.deepEqual(f.writes, [["A", "记忆期间的新版\n填好的正文"]]);
    } else {
      assert.deepEqual(result, {
        kind: "reconfirm", review: { body: "填好的正文", draft: "记忆期间的新版", draftRev: 2, attachmentIds: [] },
      });
      assert.deepEqual(f.writes, []);
      assert.deepEqual(f.requests, []);
    }
  });
}

for (const mode of ["overwrite", "insert-send"]) {
  test(`${mode}：重确认只授权已经展示的草稿，保留填好的正文`, async (t) => {
    const f = setup(t, { mode, delayed: true });
    const memory = Promise.withResolvers();
    const applying = f.apply({ body: "填好的正文", remember: () => memory.promise });
    f.setTarget("A", "第一次展示", 2);
    memory.resolve(true);
    const first = await applying;
    assert.equal(first.kind, "reconfirm");
    f.setTarget("A", "第二次展示", 3);
    const confirming = f.apply({ review: first.review });
    assert.deepEqual(f.requests, [], "未展示最新草稿前不得继续核验");
    const second = await confirming;
    assert.equal(second.kind, "reconfirm");
    assert.equal(second.review.draft, "第二次展示");
    const verifying = f.apply({ review: second.review });
    f.setTarget("A", "第三次展示", 4);
    f.response.resolve();
    const third = await verifying;
    assert.equal(third.kind, "reconfirm");
    assert.equal(third.review.draft, "第三次展示");
    assert.deepEqual(f.writes, []);
    const applied = await f.apply({ review: third.review });
    assert.equal(applied.kind, "applied");
    await applied.usage;
    assert.deepEqual(f.writes, mode === "overwrite" ? [["A", "填好的正文"]]
      : [["A", "第三次展示\n填好的正文"], ["A", "submitted"]]);
    assert.deepEqual(f.requests.map(({ method }) => method), ["GET", "GET", "POST"]);
  });
}

for (const wait of ["填值记忆", "ID 查询"]) {
  test(`${wait}：同数量换附件也须重新确认发送`, async (t) => {
    const f = setup(t, { mode: "insert-send", delayed: wait === "ID 查询" });
    const memory = Promise.withResolvers();
    f.setTarget("A", "原稿", 1, { attachmentIds: ["old"] });
    const applying = f.apply(wait === "填值记忆"
      ? { body: "填好的正文", remember: () => memory.promise }
      : { body: "填好的正文" });
    f.setTarget("A", "原稿", 1, { attachmentIds: ["new"] });
    memory.resolve(true);
    f.response.resolve();
    const result = await applying;
    assert.equal(result.kind, "reconfirm");
    assert.deepEqual(result.review.attachmentIds, ["new"]);
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.requests.map(({ method }) => method), wait === "填值记忆" ? [] : ["GET"]);
  });

  for (const invalidation of ["关闭后重开", "换会话"]) {
    test(`${wait}：${invalidation}后，迟到结果不能写稿、发送或记用量`, async (t) => {
      const f = setup(t, { mode: "insert-send", delayed: wait === "ID 查询" });
      const memory = Promise.withResolvers();
      const applying = f.apply(wait === "填值记忆"
        ? { body: "填好的正文", remember: () => memory.promise }
        : { body: "填好的正文" });
      if (invalidation === "关闭后重开") f.controller.abort();
      else f.setTarget("B", "原稿", 1);
      memory.resolve(true);
      f.response.resolve();
      assert.deepEqual(await applying, { kind: "cancelled" });
      assert.deepEqual(f.writes, []);
      assert.deepEqual(f.requests.map(({ method }) => method), wait === "填值记忆" ? [] : ["GET"]);
    });
  }
}

test("只调换相同附件的顺序也须重新确认发送", async (t) => {
  const f = setup(t, { mode: "insert-send", delayed: true });
  f.setTarget("A", "原稿", 1, { attachmentIds: ["a", "b"] });
  const applying = f.apply();
  f.setTarget("A", "原稿", 1, { attachmentIds: ["b", "a"] });
  f.response.resolve();
  const result = await applying;
  assert.equal(result.kind, "reconfirm");
  assert.deepEqual(result.review.attachmentIds, ["b", "a"]);
  assert.deepEqual(f.writes, []);
});

for (const mode of ["insert", "overwrite"]) {
  test(`${mode}：仅改变附件不影响不发送的动作`, async (t) => {
    const f = setup(t, { mode, delayed: true });
    const applying = f.apply();
    f.setTarget("A", "原稿", 1, { attachmentIds: ["added"] });
    f.response.resolve();
    const result = await applying;
    assert.equal(result.kind, "applied");
    await result.usage;
    assert.deepEqual(f.writes, [["A", mode === "insert" ? "原稿\n用户确认的正文" : "用户确认的正文"]]);
  });
}

test("记忆失败不自动继续；用户可用填好的正文主动重试", async (t) => {
  const f = setup(t);
  assert.deepEqual(await f.apply({ body: "填好的正文", remember: async () => false }), { kind: "memory-failed" });
  assert.deepEqual(f.requests, []);
  assert.deepEqual(f.writes, []);
  const applied = await f.apply({ body: "填好的正文" });
  assert.equal(applied.kind, "applied");
  await applied.usage;
  assert.deepEqual(f.writes, [["A", "原稿\n填好的正文"]]);
});

for (const phase of ["adjudicating", "submitting", "sending"]) {
  test(`${phase}：查询期间编辑器锁定时拒绝覆盖`, async (t) => {
    const f = setup(t, { mode: "overwrite", delayed: true });
    const applying = f.apply();
    f.setTarget("A", "原稿", 1, { phase });
    f.response.resolve();
    assert.deepEqual(await applying, { kind: "rejected" });
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.requests.map(({ method }) => method), ["GET"]);
  });
}

test("宿主拒绝草稿写入时，不发送也不记用量", async (t) => {
  const f = setup(t, { mode: "insert-send" });
  f.setTarget("A", "原稿", 1, { accept: false });
  assert.deepEqual(await f.apply(), { kind: "rejected" });
  assert.deepEqual(f.writes, []);
  assert.equal(f.requests.length, 1);
});
