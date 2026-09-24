import { test } from "node:test";
import assert from "node:assert/strict";

const { MAX_BACKUP_BYTES, parseBackupFile, classifyImportResult } = await import("../src/client/utils/transfer.ts");

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
  // A10：detail 是**纯数据**「实际值/上限」，故断言精确相等（比旧的 includes 更强——它把整个值钉死），
  // 并额外钉住「不得含中文」：旧实现把「文件 N 字节，超过上限 M 字节」写进 detail，en 语言下会显示中文。
  assert.equal(parsed.detail, `${MAX_BACKUP_BYTES + 1}/${MAX_BACKUP_BYTES}`);
  assert.doesNotMatch(parsed.detail, /[\u4e00-\u9fff]/, "detail 不得含中文：措辞由 transfer.tooLarge 承担（A10）");
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

// ── 确认导入后的回执分类（A9 / R40）──────────────────────────────────────────
//
// 宿主 POST /import 的成功信封有两种：{ok:true, applied:false, stats} 是**预览**（只算条数、
// 没落库），{ok:true, applied:true, stats} 才是落库。只认 ok 就会把「宿主只回预览」渲染成
// 「导入完成」= 静默假成功，故成功判据只有一个：applied === true。
// 让 classifyImportResult 忽略 applied（恒返回 {ok:true}），下面两条必红。

test("classifyImportResult：applied === true → ok（真的落库了）", () => {
  assert.deepEqual(classifyImportResult({ ok: true, applied: true, stats: { added: 1, overwritten: 0, total: 1 } }), {
    ok: true,
  });
});

test("classifyImportResult：applied 不是严格 true（false / 缺失 / 字符串 / 数字）→ 一律不 ok", () => {
  const stats = { added: 2, overwritten: 1, total: 3 };
  for (const applied of [false, undefined, "true", 1]) {
    const verdict = classifyImportResult({ ok: true, applied, stats });
    assert.equal(verdict.ok, false, "applied=" + String(applied) + " 不得当成落库成功（宿主只回预览）");
    assert.equal(verdict.errorKey, "manager.transfer.importFailed", "失败必须给出 i18n 键，由渲染点翻译");
  }
});
