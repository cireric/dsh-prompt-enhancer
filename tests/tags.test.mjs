/**
 * `src/tags.ts` 单测（审查 #7 的收敛点）。
 *
 * 它守的是**宿主与客户端共用的那一条标签规则**：去空 + 保序去重 + 逗号切分（半角/全角）。
 * 收口前宿主 store.ts 与客户端标签输入框各写一份，同一次输入在界面上与落库后可能得到不同的标签集。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const { normalizeTagName, normalizeTags, parseTagList } = await import("../src/tags.ts");

test("normalizeTagName：只去首尾空白，内部空白不动", () => {
  assert.equal(normalizeTagName("  x  "), "x");
  assert.equal(normalizeTagName(""), "");
  assert.equal(normalizeTagName("   "), "", "全空白 = 不算一个标签");
  assert.equal(normalizeTagName("a b"), "a b");
});

test("normalizeTags：逐项去空白、丢空项、**保序**去重", () => {
  assert.deepEqual(normalizeTags(undefined), []);
  assert.deepEqual(normalizeTags([]), []);
  assert.deepEqual(normalizeTags([" 甲 ", "", "   ", "乙"]), ["甲", "乙"]);
  assert.deepEqual(normalizeTags(["甲", " 甲 ", "乙", "甲"]), ["甲", "乙"], "重复项去掉，首次出现的位置胜出");
  assert.deepEqual(normalizeTags(["乙", "甲"]), ["乙", "甲"], "不得重排（顺序是用户输入的一部分）");
});

test("parseTagList：半角/全角逗号都切，之后与 normalizeTags 同一条归一", () => {
  assert.deepEqual(parseTagList(""), []);
  assert.deepEqual(parseTagList("   "), []);
  assert.deepEqual(parseTagList("单标签"), ["单标签"]);
  assert.deepEqual(parseTagList("写作, 翻译， 代码 "), ["写作", "翻译", "代码"], "全角逗号也要切");
  assert.deepEqual(parseTagList("a,,b, ,a"), ["a", "b"], "空项丢掉、重复去掉（保序）");
  assert.deepEqual(parseTagList("  甲  ， 甲 "), ["甲"], "切分后的空白由同一条归一处理");
});
