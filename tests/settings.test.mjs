/**
 * 设置模块单测（dsh 0.2.0 契约版）。
 *
 * 0.2.0 起设置即插件 Config：schema 全部 volatile，读路径是「Config 引用解包 + 归一化」，
 * 写路径是宿主 ctx.settings.update(条目 id, patch)。无宿主依赖：注入假 host / 假 config
 * 即可覆盖默认值兜底、非法值、写失败等路径。
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

const settings = await import("../src/host/settings.ts");
const { DEFAULT_SETTINGS } = await import("../src/types.ts");

/** 把普通对象包成 volatile 引用形态（resolvePluginSettings 只认 ref.get()）。 */
function vol(value) {
  return { get: () => value };
}

/** 假宿主：ctx.settings.update 记录补丁（options.onUpdate 模拟 loader 的引用更新）。 */
function fakeHost(options = {}) {
  const patches = [];
  return {
    patches,
    host: {
      settings: {
        writable: options.writable ?? true,
        update(ns, patch) {
          if (options.updateThrows) return Promise.reject(new Error("宿主写入失败（模拟）"));
          patches.push({ ns, patch });
          options.onUpdate?.(patch);
          return Promise.resolve();
        },
      },
    },
  };
}

/** 假 Config：13 键 volatile 引用，get 动态取 state（与 loader 原地 updateVolatile 的语义一致）。 */
function fakeConfig(initial = {}) {
  const state = { ...DEFAULT_SETTINGS, ...initial };
  const config = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) config[key] = { get: () => state[key] };
  return { config, state };
}

beforeEach(() => settings.bindSettingsHost(undefined, undefined)); // 每个用例从「无宿主」开始，避免串态

test("无宿主时：getSettings 必须等于默认值，且返回的是副本", () => {
  const got = settings.getSettings();
  assert.deepEqual(got, DEFAULT_SETTINGS);
  got.panelWidth = 9999;
  assert.equal(settings.getSettings().panelWidth, DEFAULT_SETTINGS.panelWidth, "改返回值不得污染默认值");
  assert.equal(settings.isSettingsAvailable(), false);
});

test("Config 引用解包：volatile ref.get() 的值进入归一化，类型不符回落默认", () => {
  const { config } = fakeConfig({
    panelWidth: 500, // 合法
  });
  config.panelHeight = vol("560"); // 类型错 → 默认
  config.maxPromptCount = vol(Number.NaN); // 非有限数 → 默认
  config.aiModel = vol(null); // 类型错 → 默认
  config.showComposerButton = vol(false); // 显式 false 必须保留
  settings.bindSettingsHost(undefined, config);
  const got = settings.getSettings();
  assert.equal(got.panelWidth, 500);
  assert.equal(got.panelHeight, DEFAULT_SETTINGS.panelHeight);
  assert.equal(got.maxPromptCount, DEFAULT_SETTINGS.maxPromptCount);
  assert.equal(got.aiModel, DEFAULT_SETTINGS.aiModel);
  assert.equal(got.showComposerButton, false, "显式的 false 不得被默认值覆盖");
  assert.equal(got.hashTriggerEnabled, DEFAULT_SETTINGS.hashTriggerEnabled, "未出现的键取默认");
});

test("volatile 变更后 getSettings 必须读到新值（loader 原地更新引用，不得缓存解包结果）", () => {
  const { config, state } = fakeConfig({ panelWidth: 500 });
  settings.bindSettingsHost(undefined, config);
  assert.equal(settings.getSettings().panelWidth, 500);
  state.panelWidth = 640; // 模拟 loader updateVolatile：ref.get() 从此返回新值
  assert.equal(settings.getSettings().panelWidth, 640, "同一 config 引用，变更后必须读到新值");
});

test("部分字段不是引用（裸值）时：按普通值归一化，不抛", () => {
  settings.bindSettingsHost(undefined, { panelWidth: 480, showSidebarButton: false });
  const got = settings.getSettings();
  assert.equal(got.panelWidth, 480, "裸值直接进归一化");
  assert.equal(got.showSidebarButton, false);
});

test("isSettingsAvailable：settings 服务缺席 ⇒ false；在场 ⇒ true；writable=false ⇒ false", () => {
  const { config } = fakeConfig();
  assert.equal(settings.isSettingsAvailable(), false, "未绑定");
  settings.bindSettingsHost({}, config);
  assert.equal(settings.isSettingsAvailable(), false, "host 无 settings 服务");
  const f = fakeHost();
  settings.bindSettingsHost(f.host, config);
  assert.equal(settings.isSettingsAvailable(), true);
  settings.bindSettingsHost({ settings: { writable: false, update: () => {} } }, config);
  assert.equal(settings.isSettingsAvailable(), false, "宿主声明不可写");
});

test("updateSettings：无设置服务时必须拒绝（不得静默丢弃用户设置）", async () => {
  await assert.rejects(() => settings.updateSettings({ panelWidth: 500 }), /设置服务不可用/);
});

test("updateSettings：补丁透传给宿主 update（条目 id + patch），返回合并后的完整设置", async () => {
  const { config, state } = fakeConfig({ panelWidth: 400 });
  // 真实宿主时序：SettingsForms.update 提交 profile patch → loader 原地更新 volatile 引用
  // → 调用方读值即新值。假 host 在 update 内把补丁合进与 config 共享的 state 模拟之。
  const f = fakeHost({ onUpdate: (patch) => Object.assign(state, patch) });
  settings.bindSettingsHost(f.host, config);
  const merged = await settings.updateSettings({ panelWidth: 640, showSidebarButton: false });
  assert.deepEqual(f.patches, [{ ns: settings.CONFIG_NAMESPACE, patch: { panelWidth: 640, showSidebarButton: false } }], "补丁必须带着条目 id 原样交给宿主");
  assert.equal(merged.panelWidth, 640, "返回值必须是合并后的结果（经 Config 解包）");
  assert.equal(merged.showSidebarButton, false);
  assert.equal(merged.panelHeight, DEFAULT_SETTINGS.panelHeight, "未改动的字段保持默认");
});

test("updateSettings：宿主写入失败时必须把错误抛出去（路由层转 503）", async () => {
  const { config } = fakeConfig();
  const f = fakeHost({ updateThrows: true });
  settings.bindSettingsHost(f.host, config);
  await assert.rejects(() => settings.updateSettings({ panelWidth: 500 }), /宿主写入失败/);
});

test("schema：13 个字段全部 volatile（0.2.0 表单投影与热编辑的前提）", () => {
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    const meta = settings.PromptEnhancerSettingsSchema.dict[key].meta;
    assert.equal(meta.volatile, true, "字段 " + key + " 必须 .volatile()，否则设置页投影不到、写回被拒");
  }
});

test("schema：空输入给出全部 13 个默认值，越界值被拦下", () => {
  const resolved = settings.PromptEnhancerSettingsSchema({});
  assert.deepEqual(
    Object.keys(resolved).sort(),
    Object.keys(DEFAULT_SETTINGS).sort(),
    "schema 字段必须与 DEFAULT_SETTINGS 一一对应（漏一个键就会静默回默认）",
  );
  assert.equal(resolved.panelWidth.get(), DEFAULT_SETTINGS.panelWidth, "volatile 字段解析成引用");
  assert.equal(resolved.maxPromptCount.get(), DEFAULT_SETTINGS.maxPromptCount);
  assert.throws(() => settings.PromptEnhancerSettingsSchema({ panelWidth: 99999 }), /expected number/);
  assert.throws(() => settings.PromptEnhancerSettingsSchema({ maxPromptCount: 0 }), /expected number/);
});
