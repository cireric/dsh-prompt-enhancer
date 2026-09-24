import { test } from "node:test";
import assert from "node:assert/strict";
const ins = await import("../src/client/utils/insert.ts");

test("composeDraft：追加 / 覆盖 / 插入并发送（规格 §7.2）", () => {
  assert.deepEqual(ins.composeDraft("已有内容", "新提示词", "insert"), { draft: "已有内容\n新提示词", send: false });
  assert.deepEqual(ins.composeDraft("", "新提示词", "insert"), { draft: "新提示词", send: false });
  assert.deepEqual(ins.composeDraft("已有内容", "新提示词", "overwrite"), { draft: "新提示词", send: false });
  assert.deepEqual(ins.composeDraft("已有内容", "新提示词", "insert-send"), { draft: "已有内容\n新提示词", send: true });
  assert.deepEqual(ins.composeDraft("", "新提示词", "insert-send"), { draft: "新提示词", send: true });
});

// promptSummary：列表行摘要（P4 已实现，本任务只补覆盖，不改实现）。
test("promptSummary：有 summary 时优先，并去掉首尾换行/空白", () => {
  assert.equal(ins.promptSummary({ summary: "\nAI 摘要\n", body: "正文内容" }), "AI 摘要");
  assert.equal(ins.promptSummary({ summary: "  AI 摘要  ", body: "正文内容" }), "AI 摘要");
  assert.equal(ins.promptSummary({ summary: "   ", body: "正文内容" }), "正文内容");
});

test("promptSummary：无 summary 时取正文并把连续空白压成单空格", () => {
  assert.equal(ins.promptSummary({ body: "第一行\n\n第二行   第三行" }), "第一行 第二行 第三行");
  assert.equal(ins.promptSummary({ body: "  首尾  \t 空白  " }), "首尾 空白");
});

test("promptSummary：超过 max 时截断并补 …（恰好等于 max 不截断）", () => {
  const long = "字".repeat(80);
  const out = ins.promptSummary({ body: long });
  assert.equal(out, "字".repeat(60) + "…");
  assert.equal(out.length, 61);
  assert.equal(ins.promptSummary({ body: "12345678901" }, 10), "1234567890…");
  assert.equal(ins.promptSummary({ body: "字".repeat(60) }), "字".repeat(60));
});

test("promptSummary：空正文 → 空串", () => {
  assert.equal(ins.promptSummary({ body: "" }), "");
  assert.equal(ins.promptSummary({ body: "   \n\t " }), "");
});

