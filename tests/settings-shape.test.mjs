import { test } from "node:test";
import assert from "node:assert/strict";
const shape = await import("../src/settings-shape.ts");
const { DEFAULT_SETTINGS } = await import("../src/types.ts");

test("settings-shape：SETTINGS_KEYS 与 DEFAULT_SETTINGS 的键集逐字相等（13 键）", () => {
  assert.deepEqual([...shape.SETTINGS_KEYS].sort(), Object.keys(DEFAULT_SETTINGS).sort());
  assert.equal(shape.SETTINGS_KEYS.length, 13);
});

test("settings-shape：缺字段与类型不符的字段一律回落默认值", () => {
  const out = shape.normalizeSettings({ panelWidth: "宽", showComposerButton: 1, aiProvider: 42 });
  assert.equal(out.panelWidth, DEFAULT_SETTINGS.panelWidth);
  assert.equal(out.showComposerButton, DEFAULT_SETTINGS.showComposerButton);
  assert.equal(out.aiProvider, DEFAULT_SETTINGS.aiProvider);
});

test("settings-shape：合法值原样通过；且返回的是副本（改它不影响 DEFAULT_SETTINGS）", () => {
  const out = shape.normalizeSettings({ panelWidth: 512, contextRecommendEnabled: false });
  assert.equal(out.panelWidth, 512);
  assert.equal(out.contextRecommendEnabled, false);
  out.panelWidth = 1;
  assert.equal(DEFAULT_SETTINGS.panelWidth, 420);
});

test("settings-shape：入参非对象（null / 字符串）也不抛，整体回落默认", () => {
  assert.deepEqual(shape.normalizeSettings(null), { ...DEFAULT_SETTINGS });
  assert.deepEqual(shape.normalizeSettings("nope"), { ...DEFAULT_SETTINGS });
});
