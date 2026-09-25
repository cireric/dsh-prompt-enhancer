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
