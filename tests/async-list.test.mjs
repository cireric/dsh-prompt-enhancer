/**
 * `src/client/utils/async-list.ts` 里**可脱离浏览器验证**的那一半（候选 2 切片 3 的补判据）。
 *
 * hook 本体的生命周期要 react（本仓不装），只能活体验收；选项解析与失败态归一抽出来钉住——
 * 这两处正是评审点名的「静默配错」风险面。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const { resolveOptions, failureState } = await import("../src/client/utils/async-list.ts");

test("resolveOptions：active 缺省为真，两个 clear* 缺省为假（必须显式传 true）", () => {
  assert.deepEqual(resolveOptions({ label: "x" }), { label: "x", active: true, clearOnStart: false, clearErrorOnStart: false });
  assert.equal(resolveOptions({ label: "x", active: false }).active, false);
  assert.equal(resolveOptions({ label: "x", active: true }).active, true);
  assert.equal(resolveOptions({ label: "x", clearOnStart: true }).clearOnStart, true);
  assert.equal(resolveOptions({ label: "x", clearErrorOnStart: true }).clearErrorOnStart, true);
});

test("resolveOptions：非布尔的假值不算 true（两条判定口径不同，这里是契约）", () => {
  assert.equal(resolveOptions({ label: "x", clearOnStart: 1 }).clearOnStart, false, "clearOnStart 只在 === true 时为真");
  assert.equal(resolveOptions({ label: "x", clearErrorOnStart: "yes" }).clearErrorOnStart, false);
  assert.equal(resolveOptions({ label: "x", active: 0 }).active, true, "active 的判定是 !== false");
});

test("failureState：失败归一 = 空数组 + 一行可读原因（绝不是 null）", () => {
  assert.deepEqual(failureState(new Error("磁盘只读")), { items: [], error: "磁盘只读" });
  assert.deepEqual(failureState("字符串错误"), { items: [], error: "字符串错误" });
  assert.deepEqual(failureState(new Error("")), { items: [], error: "" });
});
