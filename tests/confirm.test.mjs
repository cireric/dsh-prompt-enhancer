/**
 * 共享确认（`src/client/utils/confirm.ts`，R36）的单测：promise 落地、并发语义、安全 no-op。
 * 本模块设计上可被非 React 代码（capture.ts）调用，故必须在 Node 侧可直接 import 执行。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const confirm = await import("../src/client/utils/confirm.ts");

/** 一次请求的必填字段（文案字段是 i18n 键，由唯一渲染点翻译）。 */
const req = (title, detail = ["x"]) => ({
  title,
  message: "manager.confirm.purgeMessage",
  detail,
  confirmLabel: "manager.confirm.confirm",
  cancelLabel: "manager.confirm.cancel",
});

test("requestConfirm：确认前 promise 不落地；resolveConfirm(true) → true，并清空在途请求", async () => {
  assert.equal(confirm.getConfirmSnapshot(), null, "起始态必须无在途请求");

  let settled = null;
  const promise = confirm.requestConfirm(req("first")).then((value) => {
    settled = value;
    return value;
  });
  const published = confirm.getConfirmSnapshot();
  assert.ok(published, "请求发布后必须能读到快照");
  assert.equal(published.title, "first");
  assert.equal(published.id, 1, "首个请求的 id 从 1 开始");
  assert.deepEqual(published.detail, ["x"], "明细原样带上（例如将永久删除的标题）");
  assert.equal(settled, null, "用户还没答复：promise 不得落地");

  confirm.resolveConfirm(true);
  assert.equal(await promise, true, "确认 → true");
  assert.equal(settled, true);
  assert.equal(confirm.getConfirmSnapshot(), null, "落地后必须清空在途请求");
});

test("requestConfirm：取消 → false，且 id 逐次递增（每次都是独立的请求对象）", async () => {
  const second = confirm.requestConfirm(req("second"));
  const id2 = confirm.getConfirmSnapshot().id;
  assert.equal(id2, 2, "第二次请求的 id 递增");
  confirm.resolveConfirm(false);
  assert.equal(await second, false, "取消 → false");

  const third = confirm.requestConfirm(req("third"));
  assert.equal(confirm.getConfirmSnapshot().id, 3);
  assert.notEqual(confirm.getConfirmSnapshot().title, "second", "旧请求不得残留");
  confirm.resolveConfirm(true);
  assert.equal(await third, true);
});

test("并发语义：第二个请求以 false 立即落地、不替换在途请求，并留下可见痕迹", async () => {
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => warnings.push(args.map(String).join(" "));
  try {
    const first = confirm.requestConfirm(req("first"));
    const second = confirm.requestConfirm(req("second"));

    assert.equal(await second, false, "后来者按「取消」立即落地（不排队、不替换）");
    assert.equal(confirm.getConfirmSnapshot().title, "first", "在途请求必须仍是 first");
    assert.equal(warnings.some((w) => w.includes("不排队")), true, "并发拒绝必须留下可见痕迹");

    confirm.resolveConfirm(true);
    assert.equal(await first, true, "first 不受影响，仍由 resolveConfirm 落地");
    assert.equal(confirm.getConfirmSnapshot(), null);
  } finally {
    console.warn = original;
  }
});

test("无在途请求时 resolveConfirm 是安全 no-op（不抛、不派发假变更）", () => {
  let notified = 0;
  const off = confirm.subscribeConfirm(() => {
    notified += 1;
  });
  try {
    confirm.resolveConfirm(true);
    confirm.resolveConfirm(false);
    assert.equal(notified, 0, "没有在途请求时不得派发");
    assert.equal(confirm.getConfirmSnapshot(), null);
  } finally {
    off();
  }
});

test("订阅：请求发布与落地各派发一次，退订后不再收到", async () => {
  const seen = [];
  const off = confirm.subscribeConfirm(() => seen.push(confirm.getConfirmSnapshot() === null ? "none" : "request"));
  try {
    const promise = confirm.requestConfirm(req("observed"));
    assert.deepEqual(seen, ["request"], "发布派发一次");
    confirm.resolveConfirm(false);
    assert.equal(await promise, false);
    assert.deepEqual(seen, ["request", "none"], "落地（清空）再派发一次");
  } finally {
    off();
  }
  const promise = confirm.requestConfirm(req("after-unsubscribe"));
  confirm.resolveConfirm(true);
  await promise;
  assert.deepEqual(seen, ["request", "none"], "退订后任何变更都不再通知");
});

test("useConfirmRequest：Node 侧无 react 时抛可读错误（不静默降级成死快照）", () => {
  // 「不静默降级」这半句原先只靠 `console.warn = () => {}` 把告警吞掉来回避——告警本身没有判据
  // （2026-10-03 补：与 skill-badge 那三处同形）。改成捕获并断言文案，顺手也不再往输出里丢裸告警。
  const warns = [];
  const original = console.warn;
  console.warn = (...args) => {
    warns.push(args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(" "));
  };
  try {
    assert.throws(() => confirm.useConfirmRequest(), /react 运行时不可用/);
  } finally {
    console.warn = original;
  }
  assert.ok(
    warns.some((w) => w.includes("hook 不可用") || w.includes("无法解析 react")),
    "必须留下可读告警（这才是「不静默」），实收 " + JSON.stringify(warns),
  );
});
