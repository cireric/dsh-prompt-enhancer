/**
 * 设置模块单测（规格测试清单未列，属 P3 新增面：设置读写是新的对外契约，必须有回归网）。
 *
 * 无宿主依赖：注入假 scope 即可覆盖默认值兜底、非法值、写失败等路径。
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

const settings = await import("../src/host/settings.ts");
const { DEFAULT_SETTINGS } = await import("../src/types.ts");

/** 极简假 scope：只实现被依赖的 get / update。 */
function fakeScope(initial = {}, options = {}) {
  const state = { ...initial };
  const patches = [];
  return {
    patches,
    state,
    get() {
      if (options.getThrows) throw new Error("宿主读取失败（模拟）");
      return state;
    },
    update(patch) {
      if (options.updateThrows) return Promise.reject(new Error("宿主写入失败（模拟）"));
      patches.push(patch);
      Object.assign(state, patch);
    },
  };
}

beforeEach(() => settings.registerSettings(undefined)); // 每个用例从「无宿主」开始，避免串态

test("无设置服务时：getSettings 必须等于默认值，且返回的是副本", () => {
  const got = settings.getSettings();
  assert.deepEqual(got, DEFAULT_SETTINGS);
  got.panelWidth = 9999;
  assert.equal(settings.getSettings().panelWidth, DEFAULT_SETTINGS.panelWidth, "改返回值不得污染默认值");
  assert.equal(settings.isSettingsAvailable(), false);
});

test("部分字段缺失 / 类型不符时：逐字段回落默认值", () => {
  settings.registerSettings(
    fakeScope({
      panelWidth: 500, // 合法
      panelHeight: "560", // 类型错 → 默认
      showComposerButton: false, // 合法（显式 false 必须保留，不能被当成缺失）
      maxPromptCount: Number.NaN, // 非有限数 → 默认
      aiProvider: "deepseek", // 合法
      aiModel: null, // 类型错 → 默认
    }),
  );
  const got = settings.getSettings();
  assert.equal(got.panelWidth, 500);
  assert.equal(got.panelHeight, DEFAULT_SETTINGS.panelHeight);
  assert.equal(got.showComposerButton, false, "显式的 false 不得被默认值覆盖");
  assert.equal(got.maxPromptCount, DEFAULT_SETTINGS.maxPromptCount);
  assert.equal(got.aiProvider, "deepseek");
  assert.equal(got.aiModel, DEFAULT_SETTINGS.aiModel);
  assert.equal(got.hashTriggerEnabled, DEFAULT_SETTINGS.hashTriggerEnabled, "未出现的键取默认");
  assert.equal(settings.isSettingsAvailable(), true);
});

test("scope.get() 抛错时：回落默认值且不抛（错误可见）", () => {
  settings.registerSettings(fakeScope({}, { getThrows: true }));
  const got = settings.getSettings();
  assert.deepEqual(got, DEFAULT_SETTINGS, "读取异常不得让整个插件崩掉");
});

test("scope 返回非对象时：整体回落默认值", () => {
  settings.registerSettings({ get: () => undefined, update: () => {} });
  assert.deepEqual(settings.getSettings(), DEFAULT_SETTINGS);
  settings.registerSettings({ get: () => "不是对象", update: () => {} });
  assert.deepEqual(settings.getSettings(), DEFAULT_SETTINGS);
});

test("updateSettings：无设置服务时必须拒绝（不得静默丢弃用户设置）", async () => {
  await assert.rejects(() => settings.updateSettings({ panelWidth: 500 }), /设置服务不可用/);
});

test("updateSettings：补丁透传给宿主，并返回合并后的完整设置", async () => {
  const scope = fakeScope({ panelWidth: 400 });
  settings.registerSettings(scope);
  const merged = await settings.updateSettings({ panelWidth: 640, showSidebarButton: false });
  assert.deepEqual(scope.patches, [{ panelWidth: 640, showSidebarButton: false }], "补丁必须原样交给宿主");
  assert.equal(merged.panelWidth, 640, "返回值必须是合并后的结果");
  assert.equal(merged.showSidebarButton, false);
  assert.equal(merged.panelHeight, DEFAULT_SETTINGS.panelHeight, "未改动的字段保持默认");
});

test("updateSettings：宿主写入失败时必须把错误抛出去（路由层转 503）", async () => {
  settings.registerSettings(fakeScope({}, { updateThrows: true }));
  await assert.rejects(() => settings.updateSettings({ panelWidth: 500 }), /宿主写入失败/);
});

test("schema：空输入给出全部 13 个默认值，越界值被拦下", () => {
  const resolved = settings.PromptEnhancerSettingsSchema({});
  assert.deepEqual(
    Object.keys(resolved).sort(),
    Object.keys(DEFAULT_SETTINGS).sort(),
    "schema 字段必须与 DEFAULT_SETTINGS 一一对应（漏一个键就会静默回默认）",
  );
  assert.equal(resolved.panelWidth, DEFAULT_SETTINGS.panelWidth);
  assert.equal(resolved.maxPromptCount, DEFAULT_SETTINGS.maxPromptCount);
  assert.throws(() => settings.PromptEnhancerSettingsSchema({ panelWidth: 99999 }), /expected number/);
  assert.throws(() => settings.PromptEnhancerSettingsSchema({ maxPromptCount: 0 }), /expected number/);
});
