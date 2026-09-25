import { test } from "node:test";
import assert from "node:assert/strict";

const { api } = await import("../src/client/utils/api.ts");

/**
 * 请求计数与可替换实现必须在 import settings-store **之前**装好：只有这样，
 * 「仅 import 不消费 ⇒ 零请求」才是可判定的（导入期做 I/O 是缺陷，P8 T1 修复轮 2）。
 */
let getCalls = 0;
const realGetSettings = api.getSettings.bind(api);
let getImpl = realGetSettings;
api.getSettings = (...args) => {
  getCalls++;
  return getImpl(...args);
};

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

/** 让降级读的 promise 落定（只让出事件循环，不引入定时器语义）。 */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** 捕获 console.warn：降级读失败是**被断言的行为**，不是散落噪声。 */
function spyWarn() {
  const seen = [];
  const real = console.warn;
  console.warn = (...args) => { seen.push(args.map((a) => String(a)).join(" ")); };
  return { seen, restore: () => { console.warn = real; } };
}

test("settings-store：仅 import 不消费 ⇒ 一次降级请求都不发（导入期零 I/O）", () => {
  assert.equal(getCalls, 0, "导入 settings-store 本身不得发请求");
});

test("settings-store：首次消费且无 scope ⇒ 恰好一次降级读；失败 ⇒ 默认值 + 一条 warn 被断言 + 不广播", async () => {
  const { seen, restore } = spyWarn();
  const before = getCalls;
  getImpl = () => Promise.reject(new Error("模拟降级读取失败"));
  try {
    let n = 0;
    const off = store.subscribeSettings(() => { n++; }); // 首次消费 = 惰性触发点
    assert.equal(getCalls - before, 1, "首次消费恰好发一次降级读");
    const snap = store.getSettingsSnapshot();
    assert.deepEqual(snap, DEFAULT_SETTINGS, "失败后快照等于默认值");
    snap.panelWidth = 1;
    assert.equal(store.getSettingsSnapshot().panelWidth, DEFAULT_SETTINGS.panelWidth, "返回的是副本");
    await tick();
    assert.equal(seen.length, 1, "失败必须恰好一条可读 warn（被断言，不是散落噪声）");
    assert.match(seen[0], /降级读取设置失败/);
    assert.equal(n, 0, "失败不得广播");
    off();
  } finally {
    getImpl = realGetSettings;
    restore();
  }
});

test("settings-store：setSettingsScope(null) 是保留的触发点——降级读成功后经归一化采纳并恰好广播一次", async () => {
  const before = getCalls;
  getImpl = () => Promise.resolve({ panelWidth: 733, showSidebarButton: false });
  store.setSettingsScope(null); // 显式跃迁：重新武装 + 触发
  assert.equal(getCalls - before, 1, "注销跃迁恰好发一次");
  let n = 0;
  // 订阅放在跃迁**之后**：跃迁自身 derive 的那次广播不计入，只数「采纳」这一次。
  const off = store.subscribeSettings(() => { n++; });
  await tick();
  const snap = store.getSettingsSnapshot();
  assert.equal(snap.panelWidth, 733, "HTTP 结果必须被采纳");
  assert.equal(snap.showSidebarButton, false);
  assert.equal(snap.aiModel, DEFAULT_SETTINGS.aiModel, "未给的字段回落默认");
  assert.equal(n, 1, "采纳恰好广播一次");
  snap.panelWidth = 1;
  assert.equal(store.getSettingsSnapshot().panelWidth, 733, "快照是副本");
  off();
  // 复位到「无 scope」：让降级读成功但为空，避免复位本身产生 warn。
  getImpl = () => Promise.resolve({});
  store.setSettingsScope(null);
  await tick();
  getImpl = realGetSettings;
  assert.equal(store.getSettingsSnapshot().panelWidth, DEFAULT_SETTINGS.panelWidth, "复位后回到默认值");
});

test("settings-store：同一缺失期内再次消费不得重发（不重试、不轮询）", async () => {
  const { seen, restore } = spyWarn();
  getImpl = () => Promise.reject(new Error("模拟降级读取失败"));
  try {
    store.setSettingsScope(null); // 进入新的缺失期，尝试一次
    const after = getCalls;
    store.getSettingsSnapshot();
    const off = store.subscribeSettings(() => {});
    store.getSettingsSnapshot();
    await tick();
    assert.equal(getCalls, after, "本期已尝试过 ⇒ 一次都不再发");
    assert.equal(seen.length, 1, "只有跃迁那一次失败 warn，消费不再产生新 warn");
    off();
  } finally {
    getImpl = realGetSettings;
    restore();
  }
});

test("settings-store：有 scope ⇒ 归一化（缺字段回落默认）", () => {
  store.setSettingsScope(fakeScope().scope);
  assert.equal(store.getSettingsSnapshot().panelWidth, 512);
  assert.equal(store.getSettingsSnapshot().aiModel, DEFAULT_SETTINGS.aiModel);
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
});

test("settings-store：updateSettings 逐字段调 scope.set（一次写 13 键里的两个）", async () => {
  const f = fakeScope();
  store.setSettingsScope(f.scope);
  await store.updateSettings({ hashTriggerEnabled: false, panelWidth: 600 });
  assert.deepEqual(f.sets, [["hashTriggerEnabled", false], ["panelWidth", 600]]);
});
