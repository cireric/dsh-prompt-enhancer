import assert from "node:assert/strict";
import test from "node:test";
import { retryTemplateWriteBack, saveTemplate } from "../src/client/utils/template-save.ts";

const original = "原文 {{topic}}";
const metadata = { title: "  AI 标题  ", tags: ["模板", "额外"], summary: "摘要" };
const body = "优化稿 {{topic}}";
const variables = [{ name: "topic", description: "主题", defaultValue: "默认主题" }];
const prompt = { id: "created", body: original, contentVersion: "v1" };
const updated = { ...prompt, body, sourceBody: original, contentVersion: "v2" };
const created = { ok: true, prompt, evicted: ["old"] };
const input = { original, metadata, body, variables };
const createInput = { title: "AI 标题", body: original, tags: ["模板"], summary: "摘要" };
const updateCall = ["update", "created", { body, contentVersion: "v1", aiWriteBack: true, variables }];

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function setup({ create = async () => created, update = async () => updated, seed = async () => {} } = {}) {
  let alive = true;
  const events = [];
  const dependencies = {
    create: async (payload) => {
      events.push(["create", payload]);
      const outcome = await create();
      // The existing capture entry point owns the first notification.
      if (outcome.ok) events.push("notify:create");
      return outcome;
    },
    update: async (id, patch) => { events.push(["update", id, patch]); return update(); },
    seed: async (id) => { events.push(["seed", id]); return seed(); },
    notify: () => events.push("notify:writeBack"),
    isAlive: () => alive,
  };
  return { dependencies, events, unmount: () => { alive = false; } };
}

test("取消淘汰确认返回模板结果，不写回或通知", async () => {
  const { dependencies, events } = setup({ create: async () => ({ ok: false, reason: "cancelled" }) });
  assert.deepEqual(await saveTemplate(input, dependencies), { kind: "cancelled" });
  assert.deepEqual(events, [["create", createInput]]);
});

test("创建失败保留原因，不启动写回", async (t) => {
  t.mock.method(console, "warn", () => {});
  const { dependencies, events } = setup({ create: async () => { throw new Error("创建名单已变"); } });
  assert.deepEqual(await saveTemplate(input, dependencies), { kind: "saveFailed", reason: "创建名单已变" });
  assert.deepEqual(events, [["create", createInput]]);
});

test("正文逐字相同，变量随创建保存而不写回、不播种", async () => {
  const { dependencies, events } = setup();
  assert.deepEqual(await saveTemplate({ ...input, body: original }, dependencies), { kind: "saved", prompt, evicted: true });
  assert.deepEqual(events, [["create", { ...createInput, variables }], "notify:create"]);
});

test("仅尾部空白有差异也写回；通知先创建，后写回及播种", async () => {
  const { dependencies, events } = setup();
  const body = original + " ";
  assert.deepEqual(await saveTemplate({ ...input, body }, dependencies), { kind: "saved", prompt: updated, evicted: true });
  assert.deepEqual(events, [["create", createInput], "notify:create",
    ["update", "created", { body, contentVersion: "v1", aiWriteBack: true, variables }], ["seed", "created"], "notify:writeBack"]);
});

test("部分成功保留淘汰；冲突重试仍使用原回执和载荷，不重建条目", async (t) => {
  t.mock.method(console, "warn", () => {});
  const conflict = Object.assign(new Error("宿主：内容版本已过期"), { status: 409 });
  const failures = [new Error("写回失败原因"), conflict];
  const { dependencies, events } = setup({ update: async () => {
    if (failures.length) throw failures.shift();
    return updated;
  } });
  const result = await saveTemplate(input, dependencies);
  assert.equal(result.kind, "writeBackFailed");
  assert.equal(result.reason, "写回失败原因");
  assert.equal(result.pending.evicted, true);
  assert.deepEqual(events, [["create", createInput], "notify:create", updateCall]);

  const retry = await retryTemplateWriteBack(result.pending, dependencies);
  assert.equal(retry.kind, "writeBackFailed");
  assert.equal(retry.reason, "宿主：内容版本已过期");
  assert.equal(retry.pending.evicted, true);
  assert.deepEqual(events.slice(3), [updateCall]);

  assert.deepEqual(await retryTemplateWriteBack(retry.pending, dependencies), { kind: "saved", prompt: updated, evicted: true });
  assert.deepEqual(events.slice(4), [updateCall, ["seed", "created"], "notify:writeBack"]);
});

test("播种失败只告警，写回成功仍通知", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const { dependencies, events } = setup({ seed: async () => { throw new Error("播种失败"); } });
  assert.deepEqual(await saveTemplate(input, dependencies), { kind: "saved", prompt: updated, evicted: true });
  assert.deepEqual(events, [["create", createInput], "notify:create", updateCall, ["seed", "created"], "notify:writeBack"]);
  assert.equal(warn.mock.callCount(), 1);
});

test("创建回执晚于卸载，保留创建通知但不启动写回", async () => {
  const receipt = deferred();
  const { dependencies, events, unmount } = setup({ create: () => receipt.promise });
  const saving = saveTemplate(input, dependencies);
  unmount();
  receipt.resolve(created);
  assert.equal(await saving, undefined);
  assert.deepEqual(events, [["create", createInput], "notify:create"]);
});

test("写回出发后卸载，成功仍播种并通知但无界面结果", async () => {
  const started = deferred();
  const receipt = deferred();
  const { dependencies, events, unmount } = setup({ update: () => {
    started.resolve();
    return receipt.promise;
  } });
  const saving = saveTemplate(input, dependencies);
  await started.promise;
  assert.deepEqual(events, [["create", createInput], "notify:create", updateCall]);
  unmount();
  receipt.resolve(updated);
  assert.equal(await saving, undefined);
  assert.deepEqual(events.slice(3), [["seed", "created"], "notify:writeBack"]);
});
