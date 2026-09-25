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

/** 首次 import 期间发生的请求数：在任何用例之前固定下来，用例只读它 ⇒ 与声明顺序无关。 */
const importPhaseCalls = getCalls;

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

/**
 * **本进程首次消费的探测**：在全部用例之前跑完，把「惰性触发」的证据固定成只读结果。
 *
 * 为什么放在模块作用域：降级读是「每缺失期至多一次」，而**唯一**能观测到「首次消费即触发」的
 * 时刻就是进程首消费那一刻。若把它写成一条用例，该用例就必须跑在其它消费之前——那正是
 * 「依赖声明顺序」的脆弱性（重排 / 抽取 / 用例级并发下静默失效）。固定成模块作用域的探测后，
 * 用例只读结果，与声明顺序无关。
 */
async function probeFirstConsumption() {
  const before = getCalls;
  const { seen, restore } = spyWarn();
  getImpl = () => Promise.reject(new Error("模拟降级读取失败"));
  let notified = 0;
  const off = store.subscribeSettings(() => { notified++; }); // ← 本进程的首次消费
  const delta = getCalls - before;
  const snap = store.getSettingsSnapshot();
  await tick();
  off();
  restore();
  getImpl = realGetSettings;
  return { delta, warn: [...seen], notified, snapshot: snap };
}

const lazyProbe = await probeFirstConsumption();

test("settings-store：仅 import 不消费 ⇒ 导入期零请求（计数桩装在 import 之前）", () => {
  assert.equal(importPhaseCalls, 0, "导入 settings-store 本身不得发请求");
});

test("settings-store：首次消费且无 scope ⇒ 恰好一次降级读；失败 ⇒ 默认值 + 一条 warn 被断言 + 不广播", () => {
  assert.equal(lazyProbe.delta, 1, "首次消费恰好发一次降级读");
  assert.deepEqual(lazyProbe.snapshot, DEFAULT_SETTINGS, "失败后快照等于默认值");
  assert.equal(lazyProbe.warn.length, 1, "失败必须恰好一条可读 warn（被断言，不是散落噪声）");
  assert.match(lazyProbe.warn[0], /降级读取设置失败/);
  assert.equal(lazyProbe.notified, 0, "失败不得广播");
});

test("settings-store：无 scope ⇒ 快照等于默认值，且返回副本", async () => {
  getImpl = () => Promise.resolve({}); // 前置：成功但为空 ⇒ 快照确定地落回默认值
  try {
    store.setSettingsScope(null);
    await tick();
    const snap = store.getSettingsSnapshot();
    assert.deepEqual(snap, DEFAULT_SETTINGS);
    snap.panelWidth = 1;
    assert.equal(store.getSettingsSnapshot().panelWidth, DEFAULT_SETTINGS.panelWidth, "返回的是副本");
  } finally {
    getImpl = realGetSettings;
  }
});

test("settings-store：setSettingsScope(null) 是保留的触发点——降级读成功后经归一化采纳并恰好广播一次", async () => {
  const before = getCalls;
  getImpl = () => Promise.resolve({ panelWidth: 733, showSidebarButton: false });
  try {
    store.setSettingsScope(null); // 前置：显式跃迁（重新武装 + 触发）
    assert.equal(getCalls - before, 1, "跃迁恰好发一次（增量）");
    let n = 0;
    // 订阅放在跃迁之后：跃迁自身 derive 的那次广播不计入，只数「采纳」这一次。
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
  } finally {
    getImpl = realGetSettings;
  }
});

test("settings-store：同一缺失期内再次消费不得重发（不重试、不轮询）", async () => {
  const { seen, restore } = spyWarn();
  getImpl = () => Promise.reject(new Error("模拟降级读取失败"));
  try {
    store.setSettingsScope(null); // 前置：本期已尝试一次
    const after = getCalls;
    store.getSettingsSnapshot();
    const off = store.subscribeSettings(() => {});
    store.getSettingsSnapshot();
    await tick();
    assert.equal(getCalls - after, 0, "本期已尝试过 ⇒ 一次都不再发（增量 0）");
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
