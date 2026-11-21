import crypto from "node:crypto";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeDispatch } from "./helpers/fake-http.mjs";

const home = mkdtempSync(join(tmpdir(), "dpe-backup-limits-"));
process.env.DSH_HOME = home;
after(() => rmSync(home, { recursive: true, force: true }));

const { makeRoutes } = await import("../src/host/routes.ts");
const { API_PREFIX } = await import("../src/types.ts");
const store = await import("../src/host/store.ts");
const transfer = await import("../src/client/utils/transfer.ts");
const dispatch = makeDispatch({ makeRoutes, API_PREFIX });
const limit = 5 * 1024 * 1024;

function directory(name) {
  const dir = join(home, name);
  mkdirSync(dir);
  return dir;
}

test("两次同秒导出保留各自的文件内容", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-05T09:33:42.000Z") });
  const dir = directory("same-second");
  const first = await dispatch("POST", "/export/save", { dir });
  assert.equal(first.status, 200);
  const firstPath = first.envelope.data.path;
  const original = readFileSync(firstPath, "utf8");
  const p = store.createPrompt({ title: "两次导出之间", body: "新添正文" });
  const second = await dispatch("POST", "/export/save", { dir });
  assert.equal(second.status, 200);
  assert.notEqual(second.envelope.data.path, firstPath);
  assert.equal(readFileSync(firstPath, "utf8"), original);
  assert.ok(JSON.parse(readFileSync(second.envelope.data.path, "utf8")).prompts.some((entry) => entry.id === p.id));
  assert.equal(readdirSync(dir).length, 2);
});

test("目标文件已存在时不会覆盖，写入失败时清理半成品", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-05T09:33:42.000Z") });
  const dir = directory("write-failure");
  const uuid = t.mock.method(crypto, "randomUUID", () => "fixed");
  syncBuiltinESMExports();
  try {
    const first = await dispatch("POST", "/export/save", { dir });
    assert.equal(first.status, 200);
    const path = first.envelope.data.path;
    const original = readFileSync(path, "utf8");
    const duplicate = await dispatch("POST", "/export/save", { dir });
    assert.equal(duplicate.status, 500);
    assert.equal(readFileSync(path, "utf8"), original);

    uuid.mock.mockImplementation(() => "partial");
    const writeFile = fs.writeFileSync;
    const write = t.mock.method(fs, "writeFileSync", (fd) => {
      writeFile(fd, "模拟半成品", "utf8");
      throw new Error("模拟写盘失败");
    });
    syncBuiltinESMExports();
    try {
      const failed = await dispatch("POST", "/export/save", { dir });
      assert.equal(failed.status, 500);
      assert.match(failed.envelope.error, /模拟写盘失败/);
      assert.equal(readdirSync(dir).length, 1);
      assert.equal(readFileSync(path, "utf8"), original);
    } finally {
      write.mock.restore();
    }
  } finally {
    uuid.mock.restore();
    syncBuiltinESMExports();
  }
});

test("导出在导入请求上限处往返，预览比确认多一字节", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-05T09:33:42.000Z") });
  const dir = directory("round-trip");
  const p = store.createPrompt({ title: "边界", body: "字😀" });
  const emptyBytes = Buffer.byteLength(JSON.stringify({ backup: store.exportPrompts(), confirm: false }));
  const body = "字😀" + "x".repeat(limit - emptyBytes);
  store.updatePrompt(p.id, { body });

  try {
    const saved = await dispatch("POST", "/export/save", { dir });
    assert.equal(saved.status, 200);
    const path = saved.envelope.data.path;
    const file = readFileSync(path);
    assert.ok(file.length <= limit);
    const parsed = transfer.parseBackupFile(file.toString("utf8"), file.length);
    assert.equal(parsed.ok, true, parsed.detail);
    const preview = { backup: parsed.backup, confirm: false };
    assert.equal(Buffer.byteLength(JSON.stringify(preview)), limit);
    const staged = await dispatch("POST", "/import", preview);
    assert.equal(staged.status, 200);
    assert.equal(staged.envelope.data.applied, false);
    const applied = await dispatch("POST", "/import", { ...preview, confirm: true });
    assert.equal(applied.status, 200);
    assert.equal(applied.envelope.data.applied, true);
    assert.equal(store.getPrompt(p.id).body, body);

    store.updatePrompt(p.id, { body: body + "x" });
    const oversized = await dispatch("POST", "/export/save", { dir });
    assert.equal(oversized.status, 400);
    assert.match(oversized.envelope.error, /上限/);
    assert.equal(readdirSync(dir).length, 1);
    assert.deepEqual(readFileSync(path), file);
  } finally {
    store.updatePrompt(p.id, { body: "恢复短正文" });
  }
});

test("30 条各 180 KiB 的正文不能生成无法导入的备份", async () => {
  const dir = directory("oversized");
  const body = "字".repeat(60 * 1024);
  assert.equal(Buffer.byteLength(body), 180 * 1024);
  const prompts = Array.from({ length: 30 }, (_, index) =>
    store.createPrompt({ title: String(index), body }),
  );
  try {
    const saved = await dispatch("POST", "/export/save", { dir });
    assert.equal(saved.status, 400);
    assert.match(saved.envelope.error, /上限/);
    assert.deepEqual(readdirSync(dir), []);
  } finally {
    for (const prompt of prompts) store.deletePrompt(prompt.id);
  }
});

test("超限文件在读取前拒绝，旧版带空白的文件仍可用", async () => {
  let reads = 0;
  const oversized = await transfer.readBackupFile({
    size: limit + 1,
    text: async () => {
      reads++;
      return "{}";
    },
  });
  assert.equal(oversized.ok, false);
  assert.equal(oversized.errorKey, "transfer.tooLarge");
  assert.equal(reads, 0);
  const legacy = "{}" + " ".repeat(limit - 2);
  assert.deepEqual(transfer.parseBackupFile(legacy, Buffer.byteLength(legacy)), { ok: true, backup: {} });
});

test("客户端按 UTF-8 计算实际预览请求大小", () => {
  const preview = JSON.stringify({ backup: { body: "" }, confirm: false });
  const file = JSON.stringify({ body: "字😀" + "x".repeat(limit - preview.length - 6) });
  assert.ok(Buffer.byteLength(file) <= limit);
  assert.equal(Buffer.byteLength(JSON.stringify({ backup: JSON.parse(file), confirm: false })), limit + 1);
  const result = transfer.parseBackupFile(file, Buffer.byteLength(file));
  assert.equal(result.ok, false);
  assert.equal(result.errorKey, "transfer.tooLarge");
  assert.equal(result.detail, `${limit + 1}/${limit}`);
});

test("拒绝备份中的无效整数，保留旧版缺省字段和可安全使用的最大次数", async () => {
  const prompt = { id: "backup-numbers", body: "外部正文" };
  const backup = { version: 1, prompts: [prompt] };
  for (const field of ["aiRefinedAt", "createdAt", "updatedAt", "usageCount", "lastUsedAt", "skillExportedAt"]) {
    for (const confirm of [false, true]) {
      const entry = { ...prompt, [field]: Number.MAX_SAFE_INTEGER + 1 };
      const response = await dispatch("POST", "/import", { backup: { ...backup, prompts: [entry] }, confirm });
      assert.equal(response.status, 400, `${field} 的超限整数必须拒绝`);
      assert.match(response.envelope.error, new RegExp(field));
    }
  }
  for (const value of [-1, 0.1, "123", null]) {
    const response = await dispatch("POST", "/import", {
      backup: { ...backup, prompts: [{ ...prompt, usageCount: value }] }, confirm: true,
    });
    assert.equal(response.status, 400);
  }
  const invalidTag = await dispatch("POST", "/import", {
    backup: { ...backup, tags: [{ name: "不应落库", createdAt: Number.MAX_SAFE_INTEGER + 1 }] }, confirm: true,
  });
  assert.equal(invalidTag.status, 400);
  assert.match(invalidTag.envelope.error, /createdAt/);
  assert.equal(store.getPrompt(prompt.id), undefined);

  const legacy = await dispatch("POST", "/import", { backup, confirm: true });
  assert.equal(legacy.status, 200);
  assert.equal(store.getPrompt(prompt.id).usageCount, 0);
  assert.equal(store.getPrompt(prompt.id).createdAt, 0);

  const capped = await dispatch("POST", "/import", {
    backup: { ...backup, prompts: [{ ...prompt, usageCount: Number.MAX_SAFE_INTEGER }] }, confirm: true,
  });
  assert.equal(capped.status, 200);
  const used = await dispatch("POST", `/prompts/${prompt.id}/use`);
  assert.equal(used.status, 200);
  assert.equal(used.envelope.data.usageCount, Number.MAX_SAFE_INTEGER);
  assert.ok(used.envelope.data.lastUsedAt > 0);
  assert.equal((await dispatch("GET", "/prompts")).status, 200);
  assert.equal((await dispatch("DELETE", `/prompts/${prompt.id}`)).status, 200);
});

test("普通 PUT 拒绝非负安全整数范围之外的只读 skillExportedAt 值", async () => {
  const p = store.createPrompt({ title: "技能", body: "正文" });
  for (const skillExportedAt of [Number.MAX_SAFE_INTEGER + 1, 0.1, -1]) {
    const response = await dispatch("PUT", `/prompts/${p.id}`, { skillExportedAt });
    assert.equal(response.status, 400);
    assert.match(response.envelope.error, /skillExportedAt/);
  }
  assert.equal(store.getPrompt(p.id).skillExportedAt, 0);
});
