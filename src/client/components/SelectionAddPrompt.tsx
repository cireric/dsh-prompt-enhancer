/**
 * 选中文字 → 浮出「存为提示词」（入口 B，规格 §7.3 表末行 / D-P6-3 / R29）。
 *
 * 分工（R13）：**只读 DOM** 在本文件，**判定语义**在 `../utils/selection.ts`（纯函数，Node 可跑）。
 * 监听集合 = `document` 的 `selectionchange` + 捕获阶段 `pointerdown`/`pointerup` + `window` 的
 * `scroll`，卸载时逐一解除；**没有任何 keydown/keyup/keypress**（D2 裁定——上游
 * `SelectionAddPrompt.tsx` 注册了它们，那一面不得照抄）。
 *
 * 浮出按钮渲染在**我方根节点内**（调用方 `PromptLibraryButton` 的 span，不新增座位）：自身
 * `position: fixed`，坐标取自 `Range.getBoundingClientRect()`，只占自身那个小矩形——不铺满、
 * 不拦截其它区域的点击。点击后立即隐藏并记住该选区（同一选区不再弹回）。
 *
 * 不渲染状态、不持数据：点中后只把正文交回 `onSave`（`pushCapture` + `openManager` 由入口负责）。
 */
import * as React from "react";
import { TOKEN, overlayBase } from "../utils/theme.ts";
import { decideSelection, selectionKey } from "../utils/selection.ts";

export interface SelectionAddPromptProps {
  /** `settings.selectionAddEnabled`（调用方 mount 时读一次；即时生效归 P8）。 */
  enabled: boolean;
  /** 我方根节点（PromptLibraryButton 的 span）：锚点落在其内的选区一律不浮出。 */
  rootRef: React.RefObject<HTMLElement | null>;
  /** 浮出按钮文案（已本地化，R30）。 */
  label: string;
  /** 点击浮出按钮：把选中正文交回入口。 */
  onSave: (text: string) => void;
}

/** 浮出按钮的落点（视口坐标，配合 `position: fixed`）。 */
interface Anchor {
  top: number;
  left: number;
  /** true = 落在选区上方（用 `translateY(-100%)` 抬到选区上沿）。 */
  above: boolean;
}

/** 选区上沿余量不足时翻到选区下方（阈值 44px：够放一个按钮 + 一点呼吸位）。 */
const ABOVE_MIN_TOP = 44;

/** 取节点所属元素（文本节点取 parentElement）；只读，不做任何 DOM 写入。 */
function elementOf(node: Node | null): Element | null {
  if (node === null) return null;
  return node.nodeType === 1 ? (node as Element) : node.parentElement;
}

export function SelectionAddPrompt({
  enabled,
  rootRef,
  label,
  onSave,
}: SelectionAddPromptProps): React.ReactElement | null {
  const [anchor, setAnchor] = React.useState<Anchor | null>(null);
  /** 与渲染状态同步的「当前可点选区」：点击回调据此取正文，不依赖闭包里的旧状态。 */
  const liveRef = React.useRef<{ text: string; key: string } | null>(null);
  /** 已被点掉的选区标识（R29：同一选区不再弹回）。 */
  const dismissedRef = React.useRef<string | null>(null);
  /**
   * 指针正压在本按钮上。这期间浏览器可能把选区折叠掉（点按非编辑区会清掉选取）；
   * 若因此撤掉按钮，随后的 click 就落空了——故这期间不因（selectionchange/scroll）收起。
   */
  const pressingRef = React.useRef(false);
  /**
   * 指针正处在一次「非本按钮按下」的进行中状态（拖选 / 点他处）。拖选过程中不浮出
   * （上游同款做法）：只在 pointerup 之后按**最终**选区评估一次，按钮不会跟着拖选乱跑、
   * 也不会在拖选中途压在光标下。
   */
  const draggingRef = React.useRef(false);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    liveRef.current = null;
    dismissedRef.current = null;
    pressingRef.current = false;
    draggingRef.current = false;
    setAnchor(null);
    if (!enabled) return;

    /** 只读采证 + 纯判定 + 换算坐标；显示与隐藏全部由它决定。 */
    const evaluate = (): void => {
      const sel = window.getSelection();
      const anchorNode = sel === null ? null : sel.anchorNode;
      const el = elementOf(anchorNode);
      const root = rootRef.current;
      const decision = decideSelection({
        text: sel === null ? "" : sel.toString(),
        collapsed: sel === null ? true : sel.isCollapsed,
        inConversation: el !== null && el.closest("[data-conversation-scroll]") !== null,
        inComposerSeat: el !== null && el.closest("[data-composer-seat]") !== null,
        inOurRoot: root !== null && anchorNode !== null && root.contains(anchorNode),
        enabled: true,
      });
      if (!decision.show || sel === null) {
        liveRef.current = null;
        // 选区被清空 / 折叠（点他处、重新拖选）是一次真实的「选区变化」：解除上一轮的「不再弹回」。
        if (decision.reason === "collapsed" || decision.reason === "empty") dismissedRef.current = null;
        setAnchor(null);
        return;
      }
      const key = selectionKey(decision.text, sel.anchorOffset, sel.focusOffset);
      if (key === dismissedRef.current) {
        liveRef.current = null;
        setAnchor(null);
        return;
      }
      const range = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
      const rect = range === null ? null : range.getBoundingClientRect();
      // 量不出盒子就不浮出（不猜坐标，也就不会占住任何区域）。
      if (rect === null || (rect.width === 0 && rect.height === 0)) {
        liveRef.current = null;
        setAnchor(null);
        return;
      }
      const above = rect.top >= ABOVE_MIN_TOP;
      liveRef.current = { text: decision.text, key };
      setAnchor({
        top: above ? rect.top - 8 : rect.bottom + 8,
        left: Math.max(8, rect.left),
        above,
      });
    };

    /** 事件目标是否落在我方浮出按钮内（只读 contains）。 */
    const isOnButton = (target: EventTarget | null): boolean =>
      buttonRef.current !== null && target instanceof Node && buttonRef.current.contains(target);

    const onSelectionChange = (): void => {
      // 拖选中 / 按在按钮上：只收起，不评估（评估留给 pointerup）。
      if (pressingRef.current || draggingRef.current) {
        liveRef.current = null;
        setAnchor(null);
        return;
      }
      evaluate();
    };
    const onPointerDown = (ev: PointerEvent): void => {
      // 不管按在哪，pressing 都精确等于「按在本按钮上」，不会卡死。
      pressingRef.current = isOnButton(ev.target);
      if (pressingRef.current) return;
      // 一次新的选择动作开始：先收起，等 pointerup 再按最终选区评估。
      draggingRef.current = true;
      liveRef.current = null;
      setAnchor(null);
      /**
       * 修复轮 1：**抑制只存活一次选择动作**。`dismissedRef` 的键是「文本 + 起止偏移」，
       * 在同一文本节点里重新拖选同一段文字得到的就是同一个键（跨节点的同文本同偏移也会碰撞）；
       * 若不复位，上一次「存为提示词」的记账会跨这次选择存活 → 浮出按钮**静默不再出现**
       * （R29 的措辞是「直到**选区再次变化**」，重新拖选本身就是一次变化）。
       * 这一行是「新一次选择动作」的唯一入口（按在本按钮上的那次在上面已经 return）。
       */
      dismissedRef.current = null;
    };
    const onPointerUp = (): void => {
      // 只有「这一按从 pointerdown 起就落在按钮上」才跳过评估：隐藏与落库交给它自己的 click
      // （这里再评估会把按钮撤走，click 就落空了）。拖选恰好收在按钮上时仍要评估，免得落点变陈旧。
      const pressedOnButton = pressingRef.current;
      pressingRef.current = false;
      draggingRef.current = false;
      if (pressedOnButton) return;
      evaluate();
    };
    const onScroll = (): void => {
      if (pressingRef.current || draggingRef.current) return;
      evaluate();
    };

    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", onPointerUp, true);
    // 捕获阶段：网页内滚动容器（[data-conversation-scroll]）的 scroll 不冒泡，只有捕获能收到，
    // 否则选区滚动后浮出按钮会停在原处（R29 的坐标口径要求跟着选区走）。
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [enabled, rootRef]);

  /** 点浮出按钮：先隐藏并记账（R29），再把正文交回入口。 */
  const pick = (): void => {
    const live = liveRef.current;
    if (live === null) return;
    dismissedRef.current = live.key;
    liveRef.current = null;
    setAnchor(null);
    onSave(live.text);
  };

  if (!enabled || anchor === null) return null;
  return (
    <button
      ref={buttonRef}
      type="button"
      style={{
        ...FLOATING,
        top: anchor.top,
        left: anchor.left,
        transform: anchor.above ? "translateY(-100%)" : undefined,
      }}
      title={label}
      aria-label={label}
      onClick={pick}
    >
      {label}
    </button>
  );
}

/** 浮出按钮：只占自身小矩形（fixed + 不铺满），主题色走宿主 token。 */
const FLOATING: React.CSSProperties = {
  ...overlayBase,
  position: "fixed",
  zIndex: 60,
  padding: "2px 10px",
  fontSize: 11,
  lineHeight: "18px",
  color: TOKEN.fg,
  whiteSpace: "nowrap",
  cursor: "pointer",
};
