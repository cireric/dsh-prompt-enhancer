/**
 * 选中文字捕获的**纯判定**（R13）：组件只做只读 DOM 读取，所有「该不该浮出」的语义都在这里。
 *
 * 本模块不 import 任何宿主/浏览器对象，故 `tests/selection.test.mjs` 可直接 import 它跑 Node。
 * 依据：规格 §7.3 表末行（选中文字捕获保留）+ D2/G2 的监听面裁定（无键盘监听）+ TBD-P6-3(a)。
 */

/** 判定用到的全部事实（由 `SelectionAddPrompt` 从 DOM 只读采集）。 */
export interface SelectionFacts {
  /** `getSelection().toString()` 的原文。 */
  text: string;
  /** `getSelection().isCollapsed`（拿不到选区时组件传 true）。 */
  collapsed: boolean;
  /** 锚点在 `[data-conversation-scroll]` 内（宿主长期契约，TBD-P6-3(a) 允许只读该标记）。 */
  inConversation: boolean;
  /** 锚点在 `[data-composer-seat]` 内（输入框自身；我方按钮也坐在这个座位里）。 */
  inComposerSeat: boolean;
  /** 锚点落在我方 `PromptLibraryButton` 根节点内（只读 `Node.contains()`，不是 DOM 写入）。 */
  inOurRoot: boolean;
  /** `settings.selectionAddEnabled`。 */
  enabled: boolean;
}

/** 不浮出的原因（机器可读的稳定标识；只有测试断言用它，不面向用户）。 */
export type SelectionSkipReason =
  | "disabled"
  | "collapsed"
  | "empty"
  | "composer"
  | "own-root"
  | "outside-conversation";

/** 判定结果：`show` 为 false 时 `text` 一律是空串（调用方无需再判空）。 */
export interface SelectionDecision {
  show: boolean;
  text: string;
  reason: SelectionSkipReason | "ok";
}

/**
 * 选区文本归一化：统一换行（`\r\n` / `\r` → `\n`）并去掉首尾空白。
 * 只动边界，**不动正文内部**——正文原样进库（R13：不设长度上限）。
 */
export function normalizeSelection(text: string): string {
  return text.replace(/\r\n?/g, "\n").trim();
}

/**
 * 同一段选区的稳定标识：点击浮出按钮后据此认定「还是那一段选区」，不再弹回（R29）。
 * 文本相同但起止偏移不同 = 另一段选区（另一次选择动作），故偏移必须进键。
 */
export function selectionKey(text: string, anchorOffset: number, focusOffset: number): string {
  return text + "\u0000" + anchorOffset + ":" + focusOffset;
}

/**
 * 判定顺序即 R13 的枚举顺序：`enabled` → 折叠 → 归一化后为空 → 输入框座位 → 我方根节点 →
 * 聊天区之外。任一条命中即不浮出；全部通过才 `show: true`（text = 归一化后的正文）。
 *
 * 刻意**没有**长度上限：正文可以很长（长正文进库后标题走 `clampTitle`）。
 */
export function decideSelection(facts: SelectionFacts): SelectionDecision {
  if (!facts.enabled) return { show: false, text: "", reason: "disabled" };
  if (facts.collapsed) return { show: false, text: "", reason: "collapsed" };
  const text = normalizeSelection(facts.text);
  if (text === "") return { show: false, text: "", reason: "empty" };
  if (facts.inComposerSeat) return { show: false, text: "", reason: "composer" };
  if (facts.inOurRoot) return { show: false, text: "", reason: "own-root" };
  if (!facts.inConversation) return { show: false, text: "", reason: "outside-conversation" };
  return { show: true, text, reason: "ok" };
}
