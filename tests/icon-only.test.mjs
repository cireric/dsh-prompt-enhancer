import { test } from "node:test";
import assert from "node:assert/strict";
const { showsLabel } = await import("../src/client/utils/icon-only.ts");

test("icon-only：iconOnly 为 true ⇒ 不出文字（只图标）", () => {
  assert.equal(showsLabel(true), false);
});

test("icon-only：iconOnly 为 false ⇒ 图标 + 文字", () => {
  assert.equal(showsLabel(false), true);
});

test("icon-only：缺省（undefined）按 true 处理 —— 与 DEFAULT_SETTINGS 的默认值同向", () => {
  assert.equal(showsLabel(undefined), false);
});
