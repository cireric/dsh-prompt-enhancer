import { test } from "node:test";
import assert from "node:assert/strict";
const store = await import("../src/client/utils/settings-store.ts");
const { DEFAULT_SETTINGS } = await import("../src/types.ts");

/** 假 scope：可推送快照、记录 set 调用。 */
function fakeScope() {
  let value = { panelWidth: 512 };
  const listeners = new Set();
  const sets = [];
  return {
    sets,
    push(next) { value = next; for (const l of [...listeners]) l(); },
    scope: {
      getSnapshot: () => ({ status: "ready", value }),
      subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
      set: (field, v) => { sets.push([field, v]); return Promise.resolve(); },
    },
  };
}

test("settings-store：无 scope ⇒ 快照等于默认值，且是副本", () => {
  store.setSettingsScope(null);
  const snap = store.getSettingsSnapshot();
  assert.deepEqual(snap, DEFAULT_SETTINGS);
  snap.panelWidth = 1;
  assert.equal(store.getSettingsSnapshot().panelWidth, DEFAULT_SETTINGS.panelWidth);
});

test("settings-store：有 scope ⇒ 归一化（缺字段回落默认）", () => {
  store.setSettingsScope(fakeScope().scope);
  assert.equal(store.getSettingsSnapshot().panelWidth, 512);
  assert.equal(store.getSettingsSnapshot().aiModel, DEFAULT_SETTINGS.aiModel);
  store.setSettingsScope(null);
});

test("settings-store：订阅在 scope 推送后才通知；退订后不再通知", () => {
  const f = fakeScope();
  store.setSettingsScope(f.scope);
  let n = 0;
  const off = store.subscribeSettings(() => { n++; });
  assert.equal(n, 0, "订阅本身不派发");
  f.push({ panelWidth: 640 });
  assert.equal(n, 1);
  assert.equal(store.getSettingsSnapshot().panelWidth, 640);
  off();
  f.push({ panelWidth: 700 });
  assert.equal(n, 1, "退订后不再通知");
  store.setSettingsScope(null);
});

test("settings-store：updateSettings 逐字段调 scope.set（一次写 13 键里的两个）", async () => {
  const f = fakeScope();
  store.setSettingsScope(f.scope);
  await store.updateSettings({ hashTriggerEnabled: false, panelWidth: 600 });
  assert.deepEqual(f.sets, [["hashTriggerEnabled", false], ["panelWidth", 600]]);
  store.setSettingsScope(null);
});
const { api } = await import("../src/client/utils/api.ts");

/** 让降级读的 promise 落定（只让出事件循环，不引入定时器语义）。 */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("settings-store：无 scope ⇒ 降级读一次 HTTP GET 并采纳（只广播一次，未给的字段回落默认）", async () => {
  const real = api.getSettings;
  api.getSettings = () => Promise.resolve({ panelWidth: 733, showSidebarButton: false });
  try {
    store.setSettingsScope(null); // 触发降级读（同步先把快照落回默认值）
    let n = 0;
    const off = store.subscribeSettings(() => { n++; });
    await tick();
    const snap = store.getSettingsSnapshot();
    assert.equal(snap.panelWidth, 733, "HTTP 结果必须被采纳");
    assert.equal(snap.showSidebarButton, false);
    assert.equal(snap.aiModel, DEFAULT_SETTINGS.aiModel, "未给的字段回落默认");
    assert.equal(n, 1, "采纳恰好广播一次");
    off();
  } finally {
    api.getSettings = real;
    store.setSettingsScope(null);
  }
});

test("settings-store：无 scope 且降级读失败 ⇒ 快照仍为默认值、无人收到通知、无未捕获 rejection", async () => {
  const real = api.getSettings;
  api.getSettings = () => Promise.reject(new Error("模拟降级读取失败"));
  try {
    store.setSettingsScope(null);
    let n = 0;
    const off = store.subscribeSettings(() => { n++; });
    await tick();
    assert.deepEqual(store.getSettingsSnapshot(), { ...DEFAULT_SETTINGS });
    assert.equal(n, 0, "失败不得广播");
    off();
  } finally {
    api.getSettings = real;
    store.setSettingsScope(null);
  }
});
