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

test("parseMemory：空串/非法 JSON/非对象/非字符串值一律按无记忆处理（下移自 TemplateVariablesDialog）", () => {
  const original = console.warn;
  const warns = [];
  console.warn = (...args) => { warns.push(args); };
  try {
    assert.deepEqual(t.parseMemory(""), {}, "空串 → 空对象");
    assert.deepEqual(t.parseMemory("   "), {}, "纯空白 → 空对象");
    // 只保留 string 值：数字 / 嵌套对象 / null / 数组都被丢掉（上游客户端口径）。
    assert.deepEqual(t.parseMemory('{"a":"1","b":2,"c":{},"d":null,"e":["x"]}'), { a: "1" });
    assert.deepEqual(t.parseMemory("[1,2]"), {}, "数组不是记忆对象");
    assert.deepEqual(t.parseMemory("null"), {}, "null 不是记忆对象");
    assert.deepEqual(t.parseMemory('"str"'), {}, "字符串不是记忆对象");
    assert.deepEqual(t.parseMemory("{bad"), {}, "非法 JSON → 空对象");
    assert.equal(warns.length, 1, "只有非法 JSON 那一次留痕（合法输入不得 warn）");
    assert.match(String(warns[0][0]), /模板变量记忆/, "warn 说明解析失败的内容");
  } finally {
    console.warn = original;
  }
});

test("填参预览和未填清单使用相同判定，空白值保留占位符", () => {
  const body = "{{范围}} / {{ 格式 }} / {{constructor}}";
  const values = { 范围: "  插件源码  ", 格式: "  " };
  assert.deepEqual(t.unfilledVariables(t.parseVariables(body), values), ["格式", "constructor"]);
  assert.equal(t.fillTemplate(body, values), "  插件源码   / {{ 格式 }} / {{constructor}}");
});

test("同名变量使用各自模板的默认值，只预填正文出现的变量", () => {
  const body = "检查 {{范围}} 和 {{格式}}";
  assert.deepEqual(t.initialTemplateValues(body, [
    { name: "范围", defaultValue: "插件源码" },
    { name: "格式", description: "填报告格式" },
    { name: "旧字段", defaultValue: "已删除" },
  ]), { 范围: "插件源码" });
  assert.deepEqual(t.initialTemplateValues(body, [
    { name: "范围", defaultValue: "本次验收" },
  ]), { 范围: "本次验收" });
});
