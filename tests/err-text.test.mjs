/**
 * `src/err-text.ts` 的行为表（候选 2 切片 1）。
 *
 * 为什么值得一测：这条表达式此前在仓内以 14 处重复存在（7 个同名本地函数 + 7 处内联），
 * 没有任何一处被判据直接覆盖。收成一份之后，语义在这里钉住；调用点的正确性由 typecheck 保证
 * （本地定义删掉后，调用点必须走 import——少一处 import 就编不过）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const { reasonOf } = await import("../src/err-text.ts");

test("reasonOf：Error 取可读 message（含承载宿主原文的 ApiError）", () => {
  assert.equal(reasonOf(new Error("磁盘只读")), "磁盘只读");
  assert.equal(reasonOf(new TypeError("类型不对")), "类型不对", "子类同样走 message");
});

test("reasonOf：非 Error 一律 String() 兜底（不抛）", () => {
  assert.equal(reasonOf("字符串错误"), "字符串错误");
  assert.equal(reasonOf(42), "42");
  assert.equal(reasonOf(undefined), "undefined");
  assert.equal(reasonOf({ code: "x" }), "[object Object]");
});

test("reasonOf：Error 的 message 为空时返回空串（不是 String(err) 的那串前缀）", () => {
  assert.equal(reasonOf(new Error("")), "");
});
