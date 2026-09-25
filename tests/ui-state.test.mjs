import { test } from "node:test";
import assert from "node:assert/strict";

// store 是模块级单例，用例之间共享状态，故每个用例自行收敛（不引入 test-only 复位 API）。
const {
  closeManager,
  getCaptureSnapshot,
  getHashSuggestVisibleSnapshot,
  getSnapshot,
  openManager,
  pushCapture,
  setHashSuggestVisible,
  subscribe,
  subscribeHashSuggestVisible,
  takeCapture,
  useCapture,
  useHashSuggestVisible,
  useManagerState,
} = await import("../src/client/utils/ui-state.ts");
// 抽取后的共用解析口（R24 修复轮 1）：直接覆盖它自己，而不是只覆盖两个消费者。
const reactHooks = await import("../src/client/utils/react-hooks.ts");

function settle() {
  closeManager();
  takeCapture();
  // R53：`#` 浮层可见性也是模块级单例，用例之间同样自行收敛。
  setHashSuggestVisible(false);
}

test("getSnapshot：初始为关闭 + 默认页签 list", () => {
  settle();
  assert.deepEqual(getSnapshot(), { open: false, panel: "list" });
});

test("openManager：页签落库；同页签重复打开不重复通知（幂等）", () => {
  settle();
  const seen = [];
  const off = subscribe(() => seen.push(getSnapshot()));
  openManager("tags");
  openManager("tags");
  assert.equal(seen.length, 1, "同页签重复打开只通知一次");
  assert.deepEqual(getSnapshot(), { open: true, panel: "tags" });
  openManager("trash");
  assert.equal(seen.length, 2, "换页签是真实变更，要通知");
  assert.deepEqual(getSnapshot(), { open: true, panel: "trash" });
  off();
  settle();
});

test("closeManager：幂等（已关再关不通知）；关闭保持关闭前的页签", () => {
  settle();
  const seen = [];
  const off = subscribe(() => seen.push(1));
  closeManager();
  assert.equal(seen.length, 0, "本就关闭：不通知");
  openManager("trash");
  closeManager();
  closeManager();
  assert.equal(seen.length, 2, "开一次 + 关一次，多余的 close 不通知");
  assert.deepEqual(getSnapshot(), { open: false, panel: "trash" }, "关闭保持页签选择");
  openManager();
  assert.deepEqual(getSnapshot(), { open: true, panel: "list" }, "不带参数重开回默认页签");
  off();
  settle();
});

test("pushCapture / takeCapture：覆盖式写入，取出即清（第二次取为 null）", () => {
  settle();
  pushCapture({ body: "B1", title: "T1" });
  assert.deepEqual(getCaptureSnapshot(), { body: "B1", title: "T1" });
  assert.deepEqual(takeCapture(), { body: "B1", title: "T1" });
  assert.equal(takeCapture(), null, "取出即清：第二次必须是 null（否则面板会二次预填）");
  assert.equal(getCaptureSnapshot(), null);
  pushCapture({ body: "B2" });
  assert.deepEqual(takeCapture(), { body: "B2", title: "" }, "缺省标题归一为空串");
  pushCapture({ body: "first" });
  pushCapture({ body: "second" });
  assert.deepEqual(takeCapture(), { body: "second", title: "" }, "后写覆盖先写");
});

test("subscribe：变更时被通知，退订后不再被通知（重复退订安全）", () => {
  settle();
  let count = 0;
  const off = subscribe(() => { count += 1; });
  openManager("list");
  assert.equal(count, 1);
  off();
  closeManager();
  pushCapture({ body: "x" });
  takeCapture();
  assert.equal(count, 1, "退订后任何变更都不再通知");
  off();
  settle();
});

test("takeCapture：没有载荷时不派发（不制造假变更）", () => {
  settle();
  let count = 0;
  const off = subscribe(() => { count += 1; });
  assert.equal(takeCapture(), null);
  assert.equal(count, 0);
  off();
});

test("subscribe 快照引用：状态未变不换引用（useSyncExternalStore 兼容形态）", () => {
  settle();
  assert.equal(getSnapshot(), getSnapshot());
  openManager("list");
  const open = getSnapshot();
  openManager("list");
  assert.equal(getSnapshot(), open, "幂等打开不得换引用");
  closeManager();
  assert.notEqual(getSnapshot(), open, "关闭是真实变更，换引用");
  settle();
});

// ---- R53：`#` 浮层可见性共享信号（库侧订阅的就是它，取代 R49 的 hashOpen 边沿） ----

// 本用例断言模块级初值，故必须在任何 setHashSuggestVisible(true) 之前跑：node:test 同文件内
// 顶层用例按声明顺序串行，且此前所有用例的 settle() 只会把它收敛为 false。
test("getHashSuggestVisibleSnapshot：模块初值为 false（首屏 `#` 浮层未渲染）", () => {
  assert.equal(getHashSuggestVisibleSnapshot(), false);
  assert.equal(typeof getHashSuggestVisibleSnapshot(), "boolean");
});

test("setHashSuggestVisible：真实变更才通知（幂等）；退订后不再通知；与面板订阅互不串扰", () => {
  setHashSuggestVisible(false);
  const seen = [];
  const off = subscribeHashSuggestVisible(() => seen.push(getHashSuggestVisibleSnapshot()));
  // 面板订阅是另一个域：浮层可见性变化**不得**惊动它（否则库侧会跟着空转重渲染）。
  let managerCount = 0;
  const offManager = subscribe(() => { managerCount += 1; });

  setHashSuggestVisible(false);
  assert.equal(seen.length, 0, "同值重复设置不派发");

  setHashSuggestVisible(true);
  assert.equal(seen.length, 1, "false→true 是真实变更，必须派发");
  assert.deepEqual(seen, [true], "订阅者看到的是新快照");
  assert.equal(getHashSuggestVisibleSnapshot(), true);
  assert.equal(managerCount, 0, "浮层可见性不得串扰管理面板的订阅者");

  setHashSuggestVisible(true);
  assert.equal(seen.length, 1, "同值重复设置不派发（幂等，避免无谓重渲染）");

  // R53 的清除语义：浮层卸载/收起时发布 false，订阅者必须看到 false（否则面板被永久压住）。
  setHashSuggestVisible(false);
  assert.deepEqual(seen, [true, false], "清除语义：订阅者看到 false");
  assert.equal(getHashSuggestVisibleSnapshot(), false);

  off();
  off();
  setHashSuggestVisible(true);
  assert.equal(seen.length, 2, "退订后不再通知（重复退订安全）");
  offManager();
  settle();
});

// R1 的形态落地在客户端：本模块在 Node 下**必须可 import**（上面所有用例即是证明）。
// React 只能在宿主里解析（react 是 external，Node 侧没有安装），拿不到时必须抛可读错误，
// 不得静默返回一个永不更新的死快照。抽取共用解析口后，这条同时覆盖 react-hooks.ts 本身。
test("useManagerState / useCapture / useHashSuggestVisible / react-hooks：Node 侧无 react 时抛可读错误（不静默降级）", () => {
  const original = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.map(String).join(" "));
  try {
    assert.throws(() => reactHooks.hooks(), /react 运行时不可用/, "共用解析口自己要抛可读错误");
    assert.throws(() => useManagerState(), /react 运行时不可用/);
    assert.throws(() => useCapture(), /react 运行时不可用/);
    assert.throws(() => useHashSuggestVisible(), /react 运行时不可用/);
  } finally {
    console.warn = original;
  }
  assert.ok(warnings.some((w) => w.includes("无法解析 react")), "解析失败必须留下可见痕迹（不吞异常）");
});
