import { test } from "node:test";
import assert from "node:assert/strict";

// 纯模块：只读判定，不碰 DOM / 宿主（R13 的「厚判定在纯模块」）。
const { normalizeSelection, decideSelection, selectionKey } = await import(
  "../src/client/utils/selection.ts"
);

/** 默认事实：可浮出的那一组（逐条用例只翻转自己关心的项）。 */
function facts(overrides = {}) {
  return {
    text: "把这段话翻译成日语",
    collapsed: false,
    inConversation: true,
    inComposerSeat: false,
    inOurRoot: false,
    enabled: true,
    ...overrides,
  };
}

// ── 归一化 ─────────────────────────────────────────────────────────────────

test("normalizeSelection：统一换行（CRLF / 孤立 CR → LF）并去掉首尾空白", () => {
  assert.equal(normalizeSelection("\r\n第一行\r\n第二行\r\n"), "第一行\n第二行");
  assert.equal(normalizeSelection("a\rb"), "a\nb", "孤立 CR 也是换行");
  assert.equal(normalizeSelection("  \t 前后有空白  "), "前后有空白");
});

test("normalizeSelection：只动边界——正文内部的换行、缩进与多空格原样保留", () => {
  assert.equal(normalizeSelection("  a\n\n    b  \n"), "a\n\n    b");
});

test("normalizeSelection：纯空白（含仅换行）归一为空串", () => {
  for (const blank of ["", " ", "\n", "\t\r\n "]) {
    assert.equal(normalizeSelection(blank), "", JSON.stringify(blank) + " 应归一为空串");
  }
});

// ── 判定：可显示的唯一入口 ──────────────────────────────────────────────────

test("decideSelection：六项全通过才浮出，且带出的是归一化后的正文", () => {
  const got = decideSelection(facts({ text: "  选中的正文\r\n第二行  " }));
  assert.deepEqual(got, { show: true, text: "选中的正文\n第二行", reason: "ok" });
});

test("decideSelection：enabled === false 不浮出（选中的东西再多也不弹）", () => {
  assert.deepEqual(decideSelection(facts({ enabled: false })), {
    show: false,
    text: "",
    reason: "disabled",
  });
});

test("decideSelection：折叠选区不浮出（isCollapsed 的守卫）", () => {
  assert.deepEqual(decideSelection(facts({ collapsed: true })), {
    show: false,
    text: "",
    reason: "collapsed",
  });
});

test("decideSelection：归一化后为空不浮出（纯空白选区）", () => {
  assert.deepEqual(decideSelection(facts({ text: " \r\n\t " })), {
    show: false,
    text: "",
    reason: "empty",
  });
});

test("decideSelection：落在输入框座位（[data-composer-seat]）内不浮出", () => {
  assert.deepEqual(decideSelection(facts({ inComposerSeat: true })), {
    show: false,
    text: "",
    reason: "composer",
  });
});

test("decideSelection：落在我方根节点内不浮出（零 DOM 注入：只读 contains 的结果）", () => {
  assert.deepEqual(decideSelection(facts({ inOurRoot: true })), {
    show: false,
    text: "",
    reason: "own-root",
  });
});

test("decideSelection：不在聊天区（[data-conversation-scroll]）内不浮出（P6-3(a)）", () => {
  assert.deepEqual(decideSelection(facts({ inConversation: false })), {
    show: false,
    text: "",
    reason: "outside-conversation",
  });
});

test("decideSelection：判定顺序固定——先 disabled，再 collapsed，再 empty", () => {
  assert.equal(decideSelection(facts({ enabled: false, collapsed: true, text: "x" })).reason, "disabled");
  assert.equal(decideSelection(facts({ collapsed: true, text: "   " })).reason, "collapsed");
  assert.equal(decideSelection(facts({ text: "   " })).reason, "empty");
});

test("decideSelection：输入框守卫先于我方圆点守卫（我方按钮就坐在输入框座位里）", () => {
  assert.equal(decideSelection(facts({ inComposerSeat: true, inOurRoot: true })).reason, "composer");
});

test("decideSelection：不设长度上限——超长正文照样浮出，正文原样带出", () => {
  const long = "长".repeat(5000);
  const got = decideSelection(facts({ text: long }));
  assert.equal(got.show, true);
  assert.equal(got.text.length, 5000);
  assert.equal(got.text, long);
});

test("decideSelection：任何不浮出的结果都把 text 归零（调用方无需再判空）", () => {
  const hidden = [
    facts({ enabled: false }),
    facts({ collapsed: true }),
    facts({ text: " " }),
    facts({ inComposerSeat: true }),
    facts({ inOurRoot: true }),
    facts({ inConversation: false }),
  ];
  for (const f of hidden) {
    const got = decideSelection(f);
    assert.equal(got.show, false);
    assert.equal(got.text, "");
    assert.notEqual(got.reason, "ok");
  }
});

// ── 同一段选区的标识（R29 的「点击后不再弹回」边界） ────────────────────────

test("selectionKey：同一段选区稳定，偏移或正文不同即不同段", () => {
  const a = selectionKey("正文", 3, 5);
  assert.equal(selectionKey("正文", 3, 5), a, "同输入必须同键");
  assert.notEqual(selectionKey("正文", 3, 6), a, "focus 偏移不同 = 另一次选择");
  assert.notEqual(selectionKey("正文", 4, 5), a, "anchor 偏移不同 = 另一次选择");
  assert.notEqual(selectionKey("别的正文", 3, 5), a, "正文不同 = 另一次选择");
});
