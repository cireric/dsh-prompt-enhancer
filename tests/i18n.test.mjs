import { test } from "node:test";
import assert from "node:assert/strict";
const i18n = await import("../src/client/utils/i18n.ts");

/**
 * 键名形态：点分多级，每段 [a-z][A-Za-z0-9]*（宿主命名空间下的 2..N 级键）。
 * P6 起引入三级键（如 manager.list.title），故正则支持多级——但仍拒绝空段、
 * 首尾点与连续点（"a..b" / ".a" / "a." 都不是合法键）。
 */
const KEY_RE = /^[a-z][A-Za-z0-9]*(?:\.[a-z][A-Za-z0-9]*)+$/;

// P4 的编译期校验（en 的类型是 Record<keyof typeof zh, string>）拦得住漏译，
// 拦不住「值写成空串」；这四条是运行期双保险。

test("i18n：NS 是本插件的命名空间（同时用于 PropsLocale）", () => {
  assert.equal(i18n.NS, "prompt-enhancer");
});

test("i18n：zh 与 en 键集完全相等", () => {
  assert.deepEqual(Object.keys(i18n.en).sort(), Object.keys(i18n.zh).sort());
  assert.ok(Object.keys(i18n.zh).length > 0, "字典不应为空");
});

test("i18n：两套字典都没有空值（编译期拦不住空字符串）", () => {
  for (const [name, dict] of [["zh", i18n.zh], ["en", i18n.en]]) {
    for (const [key, value] of Object.entries(dict)) {
      assert.equal(typeof value, "string", name + "." + key + " 应是字符串");
      assert.notEqual(value.trim(), "", name + "." + key + " 不应为空");
    }
  }
});

test("i18n：键名一律是点分多级形态（宿主命名空间下的 a.b / a.b.c…）", () => {
  for (const [name, dict] of [["zh", i18n.zh], ["en", i18n.en]]) {
    for (const key of Object.keys(dict)) {
      assert.match(key, KEY_RE, name + " 的键 " + key + " 不符点分形态");
    }
  }
});

// P6 提前项（R7）：后续任务会引入三级键，正则必须先支持，否则 T2 的 npm test 必红。
test("i18n：键名正则接受三级键（P6 起引入 a.b.c）", () => {
  assert.match("a.b.c", KEY_RE);
  assert.match("manager.list.title", KEY_RE);
});

test("i18n：键名正则拒绝空段、首尾点与首字母大写的段（a..b / .a / a. / A.b）", () => {
  for (const bad of ["a..b", ".a", "a.", "a.b.", "a..b.c", "A.b", "a.B"]) {
    assert.doesNotMatch(bad, KEY_RE, bad + " 不是合法键名");
  }
});
