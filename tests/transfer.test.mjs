import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_BACKUP_BYTES, parseBackupFile, confirmBackupImport } from "../src/client/utils/transfer.ts";
import { subscribeDataChanged } from "../src/client/utils/data-sync.ts";

test("transfer：MAX_BACKUP_BYTES 是 5 MiB（字节）", () => {
  assert.equal(MAX_BACKUP_BYTES, 5 * 1024 * 1024);
});

test("体积闸边界：恰好等于上限 → 放行", () => {
  assert.deepEqual(parseBackupFile("{}", MAX_BACKUP_BYTES), { ok: true, backup: {} });
});

test("体积闸：上限 +1 字节 → tooLarge，detail 同时给出实际值与上限", () => {
  assert.deepEqual(parseBackupFile("{}", MAX_BACKUP_BYTES + 1), {
    ok: false, errorKey: "transfer.tooLarge", detail: `${MAX_BACKUP_BYTES + 1}/${MAX_BACKUP_BYTES}`,
  });
});

test("两道闸的顺序：超限 + 非法 JSON → tooLarge（先体积后解析）", () => {
  assert.equal(parseBackupFile("{ 这不是 JSON", MAX_BACKUP_BYTES + 1).errorKey, "transfer.tooLarge");
});

test("JSON.parse 失败 → badJson，detail 是解析器原文（非空）", () => {
  const parsed = parseBackupFile("{ not json", 10);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.errorKey, "transfer.badJson");
  assert.equal(typeof parsed.detail, "string");
  assert.notEqual(parsed.detail.trim(), "");
});

test("只做两道闸：合法 JSON 对象原样透传，backup 与解析结果同构", () => {
  const backup = { hello: 1, nested: [{ text: "中" }] };
  assert.deepEqual(parseBackupFile(JSON.stringify(backup), 1024), { ok: true, backup });
});

const backup = { version: 1, prompts: [{ id: "overwritten" }, { id: "fresh" }] };
const stats = { added: 1, overwritten: 1, total: 2 };

function observe(t, receipt, deleteResponse = () => Response.json({ ok: true, data: { deleted: true } })) {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    requests.push({ url: decodeURIComponent(url), method: init.method, body: init.body });
    if (url.endsWith("/import")) return Response.json({ ok: true, data: receipt });
    if (init.method === "DELETE") return deleteResponse();
    throw new Error("unexpected request: " + url);
  });
  let changes = 0;
  t.after(subscribeDataChanged(() => { changes++; }));
  return { requests, changes: () => changes };
}

test("确认导入不预读词库；仅清理回执列出的覆盖 ID，并立即通知变更", { timeout: 500 }, async (t) => {
  const cleanup = Promise.withResolvers();
  t.after(() => cleanup.resolve(Response.json({ ok: true, data: { deleted: true } })));
  const f = observe(t, { ok: true, applied: true, stats, overwrittenIds: ["overwritten"] },
    async () => (await cleanup.promise).clone());
  const receipt = await confirmBackupImport(backup);
  assert.equal(receipt.applied, true);
  assert.deepEqual(receipt.stats, stats);
  assert.equal(f.changes(), 1);
  await new Promise(setImmediate);
  assert.deepEqual(f.requests, [
    { url: "/api/prompt-enhancer/import", method: "POST", body: JSON.stringify({ backup, confirm: true }) },
    { url: "/api/prompt-enhancer/meta/pl:refined-dir:overwritten", method: "DELETE", body: undefined },
    { url: "/api/prompt-enhancer/meta/pl:skill-descriptor:overwritten", method: "DELETE", body: undefined },
    { url: "/api/prompt-enhancer/meta/pl:template-var-memory:overwritten", method: "DELETE", body: undefined },
  ]);
});

for (const applied of [false, undefined, "true", 1]) {
  test(`未确认写入 (${String(applied)}) 不清理元数据、不广播`, async (t) => {
    const f = observe(t, { ok: true, applied, stats, overwrittenIds: ["overwritten"] });
    assert.equal((await confirmBackupImport(backup)).applied, false);
    assert.deepEqual(f.requests.map(({ method }) => method), ["POST"]);
    assert.equal(f.changes(), 0);
  });
}

test("明确无覆盖时只广播、不清键", async (t) => {
  const f = observe(t, { ok: true, applied: true, stats: { added: 2, overwritten: 0, total: 2 }, overwrittenIds: [] });
  assert.equal((await confirmBackupImport(backup)).applied, true);
  assert.deepEqual(f.requests.map(({ method }) => method), ["POST"]);
  assert.equal(f.changes(), 1);
});

test("旧宿主缺少覆盖回执或回执无效时不猜清理名单，仍确认导入成功", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  for (const overwrittenIds of [undefined, [42], [""], ["same", "same"], []]) {
    await t.test(JSON.stringify(overwrittenIds) ?? "missing", async (sub) => {
      const f = observe(sub, { ok: true, applied: true, stats, overwrittenIds });
      assert.equal((await confirmBackupImport(backup)).applied, true);
      assert.deepEqual(f.requests.map(({ method }) => method), ["POST"]);
      assert.equal(f.changes(), 1);
    });
  }
  assert.equal(warn.mock.callCount(), 5);
});

test("清键失败只告警，不改变导入成功结果或广播", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const f = observe(t, { ok: true, applied: true, stats, overwrittenIds: ["overwritten"] }, () => {
    throw new Error("清键失败");
  });
  assert.equal((await confirmBackupImport(backup)).applied, true);
  assert.equal(f.changes(), 1);
  await new Promise(setImmediate);
  assert.equal(warn.mock.callCount(), 3);
});
