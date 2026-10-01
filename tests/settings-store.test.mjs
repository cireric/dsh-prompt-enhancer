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
      set: (field, v) => { sets.push([field, v]); return Promise.resolve(true); }, // 0.2.0：true = 宿主接受
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

/** 0.2.0 ConfigForm.set 契约：宿主拒绝返回 false（不 reject）；store 必须把它转成抛错。 */
test("settings-store：scope.set 返回 false（宿主拒绝）⇒ updateSettings 必须抛出，不得静默成功", async () => {
  const calls = [];
  store.setSettingsScope({
    getSnapshot: () => ({ status: "ready", value: {} }),
    subscribe: () => () => {},
    set: (field, v) => { calls.push([field, v]); return Promise.resolve(false); },
  });
  await assert.rejects(
    () => store.updateSettings({ panelWidth: 640 }),
    /设置写入被宿主拒绝/,
  );
  assert.deepEqual(calls, [["panelWidth", 640]], "拒绝也必须真的发出过写请求（判据是返回值）");
});

// ── 就绪面（P8 二审 I2）───────────────────────────────────────────────────────
//
// 「当前快照是否可信」是命令式消费者（淘汰预检 / 导入后超限提示）按快照行事之前必须问的一句：
// 有 scope ⇒ 看宿主镜像的 `status`（此前被整个丢掉）；无 scope ⇒ 看那次降级读有没有**成功落地**。
// 两条无 scope 用例正负成对——「失败开放」的写法在反面那条必红。

/** 假 scope 的 status 可变体：就绪面的唯一判据是 status，不是 value。 */
function scopedWithStatus(status) {
  return {
    getSnapshot: () => ({ status, value: { panelWidth: 640 } }),
    subscribe: () => () => {},
    set: () => Promise.resolve(),
  };
}

test("settings-store：有 scope ⇒ 就绪看宿主快照的 status（ready 为真；非 ready 为假）", () => {
  store.setSettingsScope(scopedWithStatus("syncing"));
  assert.equal(store.isSettingsReady(), false, "镜像未就绪 ⇒ 快照不可信（status 被丢掉正是缺陷形态之一）");
  store.setSettingsScope(scopedWithStatus("ready"));
  assert.equal(store.isSettingsReady(), true);
});

test("settings-store：无 scope + 降级读成功 ⇒ 就绪为真（快照按真实值落地，不是默认值）", async () => {
  getImpl = () => Promise.resolve({ maxPromptCount: 20 });
  try {
    store.setSettingsScope(null); // 显式进入缺失期并触发那一次降级读
    await tick();
    assert.equal(store.isSettingsReady(), true, "成功落地 ⇒ 快照可信");
    assert.equal(store.getSettingsSnapshot().maxPromptCount, 20, "落地的是宿主真值");
  } finally {
    getImpl = realGetSettings;
  }
});

test("settings-store：无 scope + 降级读失败 ⇒ **永远**不就绪（失败关闭，绝不拿默认值当权威）", async () => {
  const { seen, restore } = spyWarn();
  getImpl = () => Promise.reject(new Error("模拟降级读取失败"));
  try {
    store.setSettingsScope(null);
    await tick();
    assert.equal(store.isSettingsReady(), false);
    // 再多消费几轮也不得翻转：本期「至多一次」，失败即定论。
    store.getSettingsSnapshot();
    store.subscribeSettings(() => {})();
    await tick();
    assert.equal(store.isSettingsReady(), false, "失败后反复消费不得把就绪翻转成真");
    assert.equal(seen.length, 1, "只有跃迁那一条可读 warn");
  } finally {
    getImpl = realGetSettings;
    restore();
  }
});

/** 0.2.0 补充：有 resolver 时的重试契约（注入部署 ns 兜底）。 */
test("settings-store：set 被拒 ⇒ 调 resolver 后重试一次；重试成功则不抛", async () => {
  let attempts = 0;
  let resolverCalled = 0;
  store.setSettingsNsResolver(() => { resolverCalled++; return "802a95b9"; });
  store.setSettingsScope({
    getSnapshot: () => ({ status: "ready", value: {} }),
    subscribe: () => () => {},
    set: () => { attempts++; return Promise.resolve(attempts > 1); },
  });
  await store.updateSettings({ panelWidth: 640 });
  assert.equal(attempts, 2, "必须恰好重试一次");
  assert.equal(resolverCalled, 1, "resolver 恰好被调一次");
  store.setSettingsNsResolver(undefined);
});

test("settings-store：set 被拒 ⇒ resolver 重试后仍被拒 ⇒ 抛出（不得无限重试）", async () => {
  let attempts = 0;
  store.setSettingsNsResolver(() => undefined);
  store.setSettingsScope({
    getSnapshot: () => ({ status: "ready", value: {} }),
    subscribe: () => () => {},
    set: () => { attempts++; return Promise.resolve(false); },
  });
  await assert.rejects(() => store.updateSettings({ panelWidth: 640 }), /设置写入被宿主拒绝/);
  assert.equal(attempts, 2, "恰好两次（原写 + 一次重试），不循环");
  store.setSettingsNsResolver(undefined);
});

/** resolveNsFromDescribe：13 键签名匹配（官方固定 id 与注入随机 id 两形态都覆盖）。 */
test("settings-store：resolveNsFromDescribe 按 13 键签名认出本条目，认不出返回 undefined", () => {
  const keys = [
    "aiProvider", "aiModel", "panelWidth", "panelHeight",
    "showComposerButton", "composerButtonIconOnly", "showAIPolishButton", "aiPolishButtonIconOnly",
    "hashTriggerEnabled", "contextRecommendEnabled", "selectionAddEnabled", "showSidebarButton",
    "maxPromptCount",
  ];
  const sig = Object.fromEntries(keys.map((k) => [k, k === "panelWidth" ? 420 : true]));
  const view = {
    namespaces: [
      { ns: "llm-deepseek", value: { baseURL: "x" } },
      { ns: "802a95b9", schema: { dict: sig } },
    ],
  };
  assert.equal(store.resolveNsFromDescribe(view), "802a95b9", "按 schema dict 签名命中");
  assert.equal(
    store.resolveNsFromDescribe({ namespaces: [{ ns: "prompt-enhancer", value: sig }] }),
    "prompt-enhancer",
    "value 键集形态（无 schema dict 时回落 value）也命中",
  );
  assert.equal(store.resolveNsFromDescribe({ namespaces: [{ ns: "x", value: { a: 1 } }] }), undefined, "无命中 undefined");
  assert.equal(store.resolveNsFromDescribe(undefined), undefined, "坏视图安全");
});
