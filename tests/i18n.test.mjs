import { test } from "node:test";
import assert from "node:assert/strict";
const i18n = await import("../src/client/utils/i18n.ts");

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

test("i18n：键名一律是 a.b 点分形态（宿主命名空间下的两级键）", () => {
  for (const [name, dict] of [["zh", i18n.zh], ["en", i18n.en]]) {
    for (const key of Object.keys(dict)) {
      assert.match(key, /^[a-z][A-Za-z0-9]*\.[a-z][A-Za-z0-9]*$/, name + " 的键 " + key + " 不符 a.b 形态");
    }
  }
});
