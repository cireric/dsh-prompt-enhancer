/**
 * `src/first-line.ts` 单测（审查 #7 的收敛点）。
 *
 * 判据两侧都要钉：**跳过空行**（否则草稿以空行开头时落库 title 为空）与**换行方言**
 * （`\r\n` / `\n` / `\r` 三种都算——只认 \`\n\` 会让 CR-only 正文整段被当成一行）。
 * 另外三处调用点（capture / ai-flow / PromptManagerModal）的接线由各自既有用例覆盖。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const { firstNonEmptyLine } = await import("../src/first-line.ts");

test("firstNonEmptyLine：跳过空行与前导空白，三种换行都算，全空返回空串", () => {
  assert.equal(firstNonEmptyLine(""), "");
  assert.equal(firstNonEmptyLine("\n\n   \n"), "", "全空白 → 空串（调用方据此回落默认值）");
  assert.equal(firstNonEmptyLine("第一行\n第二行"), "第一行");
  assert.equal(firstNonEmptyLine("\n\n   标题   \n正文"), "标题", "跳过空行且 trim 前导/尾随空白");
  assert.equal(firstNonEmptyLine("甲\r\n乙"), "甲", "CRLF");
  assert.equal(firstNonEmptyLine("甲\r乙"), "甲", "CR-only 也必须切分（与收敛前的三处方言一致）");
  assert.equal(firstNonEmptyLine("   \r  \n 唯一  "), "唯一");
  assert.equal(firstNonEmptyLine("  前导空格行"), "前导空格行");
});
