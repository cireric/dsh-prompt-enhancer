import { test } from "node:test";
import assert from "node:assert/strict";

const { MAX_BACKUP_BYTES, parseBackupFile } = await import("../src/client/utils/transfer.ts");

// 体积上限口径：5 MiB，单位是**字节**（与浏览器 File.size 同单位）。
test("transfer：MAX_BACKUP_BYTES 是 5 MiB（字节）", () => {
  assert.equal(MAX_BACKUP_BYTES, 5 * 1024 * 1024);
});

// 体积闸的唯一焦点：边界取 ">"，即**恰好等于上限放行**（改成 ">=" 这条必红）。
test("体积闸边界：恰好等于上限 → 放行", () => {
  const parsed = parseBackupFile("{}", MAX_BACKUP_BYTES);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.backup, {});
});

test("体积闸：上限 +1 字节 → tooLarge，detail 同时给出实际值与上限", () => {
  const parsed = parseBackupFile("{}", MAX_BACKUP_BYTES + 1);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.errorKey, "transfer.tooLarge");
  // 带上标签精确匹配：避免 "5242881".includes("524288") 这类子串假通过。
  assert.ok(parsed.detail.includes(`${MAX_BACKUP_BYTES + 1} 字节`), "detail 应含实际值：" + parsed.detail);
  assert.ok(parsed.detail.includes(`上限 ${MAX_BACKUP_BYTES} 字节`), "detail 应含上限：" + parsed.detail);
});

// 顺序不可换：超限文件即使不是合法 JSON 也必须先被体积闸拒绝（不解析）。
test("两道闸的顺序：超限 + 非法 JSON → tooLarge（先体积后解析）", () => {
  const parsed = parseBackupFile("{ 这不是 JSON", MAX_BACKUP_BYTES + 1);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.errorKey, "transfer.tooLarge");
});

test("JSON.parse 失败 → badJson，detail 是解析器原文（非空）", () => {
  const parsed = parseBackupFile("{ not json", 10);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.errorKey, "transfer.badJson");
  assert.equal(typeof parsed.detail, "string");
  assert.notEqual(parsed.detail.trim(), "");
});

// 信封判定归宿主（validateBackup 在 store.ts）：合法 JSON 一律**原样透传**，客户端不重塑、不校验。
// 这条边界断言挡住「顺手在客户端复制一份校验」造成的第二处真源。
test("只做两道闸：合法 JSON 对象原样透传，backup 与解析结果同构", () => {
  const source = { hello: 1, nested: [{ text: "中" }] };
  const parsed = parseBackupFile(JSON.stringify(source), 1024);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.backup, source);
});
