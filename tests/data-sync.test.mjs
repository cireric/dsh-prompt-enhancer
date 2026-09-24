import { test } from "node:test";
import assert from "node:assert/strict";

const { DATA_CHANGED, notifyDataChanged, subscribeDataChanged, useDataChanged } = await import(
  "../src/client/utils/data-sync.ts",
);

test("DATA_CHANGED：事件名是 prompt-enhancer:data-changed（规格 §3.3 的同页同步契约）", () => {
  assert.equal(DATA_CHANGED, "prompt-enhancer:data-changed");
});

test("notifyDataChanged：派发同名事件（订阅者收到，且 type 就是契约名）", () => {
  const seen = [];
  const off = subscribeDataChanged((ev) => seen.push(ev.type));
  try {
    notifyDataChanged();
    assert.deepEqual(seen, [DATA_CHANGED]);
  } finally {
    off();
  }
});

test("退订后不再被通知（notifyDataChanged 不再触发该监听器）", () => {
  let count = 0;
  const off = subscribeDataChanged(() => { count += 1; });
  notifyDataChanged();
  assert.equal(count, 1);
  off();
  notifyDataChanged();
  assert.equal(count, 1, "退订之后不得再被触发");
});

test("notifyDataChanged：每次调用恰好派发一次（不重不漏）", () => {
  let count = 0;
  const off = subscribeDataChanged(() => { count += 1; });
  try {
    notifyDataChanged();
    notifyDataChanged();
    assert.equal(count, 2);
  } finally {
    off();
  }
});

test("重复退订是安全的（第二次退订不得抛错，也不得影响其它监听器）", () => {
  let count = 0;
  const off = subscribeDataChanged(() => { count += 1; });
  off();
  off();
  notifyDataChanged();
  assert.equal(count, 0);
});

test("useDataChanged：Node 侧无 react 时抛可读错误（与 ui-state 同形态，不静默不刷新）", () => {
  const original = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.map(String).join(" "));
  try {
    assert.throws(() => useDataChanged(() => {}), /react 运行时不可用/);
  } finally {
    console.warn = original;
  }
  assert.ok(warnings.some((w) => w.includes("react")), "解析失败必须留下可见痕迹（不吞异常）");
});
