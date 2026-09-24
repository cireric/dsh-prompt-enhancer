import { test } from "node:test";
import assert from "node:assert/strict";
const t = await import("../src/client/utils/template.ts");

test("parseVariables：去重保序、忽略空白名", () => {
  assert.deepEqual(t.parseVariables("把 {{文本}} 翻成 {{ 目标语言 }}，再用 {{文本}} 复述"), ["文本", "目标语言"]);
  assert.deepEqual(t.parseVariables("{{   }} {{a}}"), ["a"]);
  assert.deepEqual(t.parseVariables("没有变量"), []);
});

test("fillTemplate：替换已提供的变量，未提供的原样保留", () => {
  assert.equal(t.fillTemplate("把 {{a}} 翻成 {{b}}", { a: "你好" }), "把 你好 翻成 {{b}}");
  assert.equal(t.fillTemplate("{{a}}", { a: "" }), "{{a}}", "空值不算已填写，必须保留占位");
  assert.equal(t.fillTemplate("无变量", {}), "无变量");
});

test("needsValues 与 pickRemembered", () => {
  assert.equal(t.needsValues("{{a}}"), true);
  assert.equal(t.needsValues("没有"), false);
  assert.deepEqual(t.pickRemembered("把 {{a}} 翻成 {{b}}", { a: "上次A", c: "无关" }), { a: "上次A" });
});
