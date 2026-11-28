/**
 * 输入框旁「词库」按钮：打开快速列表，三动作写入草稿，含变量的先弹变量填窗。
 *
 * 注册在 `conversation.input.left`；props 由 `PropsRuntime`（session 标准 props
 * 已内含 `useInput` / `inputActions`）与 `PropsLocale` 组成。
 *
 * 副作用都在官方动作面上：读草稿走 `useInput`，写草稿走 `inputActions`，
 * 发送走 `inputActions.submit`（规格 §7.2）；过滤/替换/插入语义一律复用
 * `src/client/utils/` 的纯函数，组件不重复实现。
 */
import * as React from "react";
import type { PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import { canRender } from "../../overlay-claim.ts";
import type { Prompt } from "../../types.ts";
import { api } from "../utils/api.ts";
import { showsLabel } from "../utils/icon-only.ts";
import { useSettings } from "../utils/settings-store.ts";
import type { PromptEnhancerKey } from "../utils/i18n.ts";
import { filterPrompts } from "../utils/hash-token.ts";
import { promptSummary, recentPrompts, type InsertMode } from "../utils/insert.ts";
import {
  applyVerifiedPrompt, discardSubmittedInsertion, markInsertionSubmitted, prepareLibraryUse,
  type InsertionConfirmation, type LibraryInsertion, type LibraryUse,
} from "../utils/library-insertion.ts";
import { parseVariables } from "../utils/template.ts";
import { TOKEN, overlayBase } from "../utils/theme.ts";
import {
  claimOverlay,
  getOverlayClaimSnapshot,
  openManager,
  pushCapture,
  releaseOverlay,
  subscribeOverlayClaim,
  useHashSuggestVisible,
  useOverlayClaim,
} from "../utils/ui-state.ts";
import { SelectionAddPrompt } from "./SelectionAddPrompt.tsx";
import { TemplateVariablesDialog } from "./TemplateVariablesDialog.tsx";
import { useDismissOnOutside } from "../utils/dismiss-outside.ts";
import { useAsyncList } from "../utils/async-list.ts";

/** 输入框旁「词库」按钮（任务 5 落地完整行为）。 */
export type PromptLibraryButtonProps =
  PropsRuntime<"conversation.input.left"> & PropsLocale<"prompt-enhancer">;

/** 三种插入模式的动作文案。 */
const ACTION_LABELS: Record<InsertMode, PromptEnhancerKey> = {
  insert: "action.insert",
  overwrite: "action.overwrite",
  "insert-send": "action.send",
};
const SECONDARY_MODES = ["overwrite", "insert-send"] as const;

/** 「该提示词已不存在」的停留时长（自动消失，不打断输入）。 */
const NOTICE_MS = 4000;

/**
 * 快速列表一次渲染的条数上限。
 *
 * 为什么要有上限：本面板此前**无条件渲染整库**（`api.listPrompts({ sort: "default" })` 不带
 * limit，上限 300 条时 300 行全进 DOM）。快速列表的定位是「快速取用」而不是浏览全库——超出部分
 * 由底部一行「另有 N 条」引向管理面板（那边有服务端搜索 + 排序 + 标签筛选）。
 */
const QUICK_LIST_LIMIT = 50;

/**
 * 词库图标：内联书签形（取自上游参考项目词库按钮的原始图标，`.tmp/dsh-prompt-library`
 * `data/PromptLibraryButton.tsx:1023-1029`）——与 `AIPolishButton` 的 `SparkleIcon`（四角星）
 * **刻意不同形**：输入框工具行两个相邻按钮同图标会被误认（反馈 2026-09-25）。只图标模式
 * （`composerButtonIconOnly`）下它是按钮唯一可见物，名字由 `aria-label` / `title` 承担
 * （无障碍面不丢名字）。不引任何图标依赖。
 */
function PromptLibraryIcon(): React.ReactElement {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={ICON}>
      <path
        d="M4 5h11a3 3 0 0 1 3 3v11l-3-2-3 2V8a3 3 0 0 0-3-3H4Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M8 9h3M8 12h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function PromptLibraryButton({
  t,
  useInput,
  inputActions,
}: PromptLibraryButtonProps): React.ReactElement | null {
  const input = useInput((s) => s);
  const { draft } = input;
  /**
   * R53：`#` 候选浮层**此刻是否真的可见**——由浮层自己发布到 `ui-state.ts` 的共享信号，
   * 本组件订阅它（P8 把 `hashTriggerEnabled` 接进浮层时，两侧自动同改，无需再维护第二个判定）。
   *
   * 不再自算「草稿里是否有令牌」：那个判定拿不到浮层的 `dismissedKey`（浮层被「点浮层外部」
   * 收起后令牌仍在草稿里），于是两侧的「门」不同源——R49 的边沿因此漏掉「面板已开着时在同一
   * 令牌内就地改写查询词」（令牌一直在 → 无边沿可观察 → 面板不关 → 两浮层同屏重叠）。
   */
  const hashVisible = useHashSuggestVisible();
  /**
   * 设置改读**共享响应式 store**（P8 T1）：宿主 scope 每次已提交变更都推一次快照，消费点随之重渲染
   * ——不再是「mount 时读一次」。无 scope（无 ui-settings 的部署）时 store 给默认值，且不再有
   * 「未就绪的 null 态」（读失败经归一化回落默认，按钮照常可用）。
   */
  const settings = useSettings();
  const [open, setOpen] = React.useState(false);
  /** null = 本次打开还没加载完。 */
  /**
   * 已删除提示。带 seq 而不是裸字符串：同一条文案再次触发时 React 不为同值 setState
   * 重跑 effect，4s 计时器就不会重置——seq 每次 +1 让 effect 依赖真的变化。
   */
  const [notice, setNotice] = React.useState<{ text: string; seq: number } | null>(null);
  const [pending, setPending] = React.useState<LibraryUse | null>(null);
  const [checking, setChecking] = React.useState(false);
  const application = React.useRef<AbortController | null>(null);
  const latestTarget = React.useRef({ input, actions: inputActions });
  React.useLayoutEffect(() => {
    latestTarget.current = { input, actions: inputActions };
  }, [input, inputActions]);
  /**
   * 过滤查询词（2026-09-30 裁定：打开即聚焦、**关闭不记忆**）。
   * 不记忆是刻意的：记住上次的词会让下次打开看到一份「被筛过的库」，看起来像东西丢了。
   */
  const [query, setQuery] = React.useState("");
  const [usageRevision, setUsageRevision] = React.useState(0);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const rows = React.useRef<Array<HTMLButtonElement | null>>([]);
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  /**
   * 共享 claim（T1 的接线）：`claimed` 是**当前占屏的那个面**，与另外两面读同一帧的同一个值。
   */
  const claimed = useOverlayClaim();
  /**
   * R55 的渲染不变式（T1 起**升级为 claim 读法**）：面板此刻是否真的渲染 = 「用户打开了它」**且**
   * 「共享 claim 此刻持有 `library`」。两处渲染门与 `aria-expanded` **共用这一个派生值**，
   * 不会出现「面板没渲染但 aria 说展开了」。
   *
   * **判定仍在渲染期求值**（不是边沿动作）：边沿动作只覆盖订阅得到的那几次跳变，盖不住「面板已开时
   * 条件如何变化」的全部入口——键盘把焦点移到词库按钮后按 Enter/Space 激活，**没有任何 pointerdown**，
   * R47 不触发、信号不产生下降沿，边沿动作盖不住它。条件放进渲染门后，同屏在**结构上**不可能。
   *
   * 与 P6 的 `shouldShowLibraryPanel({open, hashSuggestVisible})` 逐格同值：R55 说的「浮层可见时词库
   * 面板根本不渲染」现在由 claim 覆盖——`#` 浮层可见时它必然抢到屏（见 `HashSuggestOverlay` 的
   * claim 接线），故「浮层可见」⇔「claim 在 `hash` 手里」。
   */
  const panelOpen = open && canRender("library", claimed);
  const cancelApplication = React.useCallback((): void => {
    application.current?.abort();
    application.current = null;
  }, []);
  const discardSubmitted = React.useCallback((): void => {
    cancelApplication();
    setChecking(false);
    setPending(discardSubmittedInsertion);
  }, [cancelApplication]);
  React.useLayoutEffect(() => {
    if (!settings.showComposerButton) discardSubmitted();
    return cancelApplication;
  }, [settings.showComposerButton, inputActions, cancelApplication, discardSubmitted]);
  React.useLayoutEffect(() => subscribeOverlayClaim(() => {
    if (getOverlayClaimSnapshot() === "library") return;
    // Invalidate even if losing and regaining the overlay are batched into one render.
    discardSubmitted();
    setOpen(false);
  }), [discardSubmitted]);

  // The host supplies a stable action object per session. Discard pending UI on rebinding too.
  React.useLayoutEffect(() => {
    setOpen(false);
    setPending(null);
    setChecking(false);
    setSelectedId(null);
    setNotice(null);
  }, [inputActions]);
  /**
   * 关闭即清空查询词（**关闭不记忆**）。一条规则覆盖全部「面板真的不在了」的路径——显式
   * `close()`、点面板外、「位移即收回意图」那条把 `open` 收回的 effect，以及
   * **`showComposerButton=false` 的早退**（那时组件 `return null` 而 `open` 仍为真，
   * 只盯 `open` 会漏掉它 ⇒ 再次打开带着旧查询词）。写进各关闭函数必然漏掉后两类。
   */
  React.useEffect(() => {
    if (open && settings.showComposerButton) return;
    setQuery("");
    setSelectedId(null);
  }, [open, settings.showComposerButton]);

  // 每次打开都重新拉取（列表可能在管理面板里被改过）。
  // 用量写入成功后也刷新，覆盖用户在请求返回前就重开选择器的情况。
  const loadPrompts = React.useCallback(() => api.listPrompts({ sort: "default" }), [usageRevision]);
  const { items: prompts, error: loadError, setItems: setPrompts } = useAsyncList(loadPrompts, {
    label: "提示词列表加载失败",
    active: open,
    clearOnStart: true,
    clearErrorOnStart: true,
  });

  // 点浮层外收起（三处浮层共用同一实现，见 utils/dismiss-outside.ts；宿主标准 props 没有这个座位，
  // 与官方 ui-commands 的 PopupSelectView 同款：document 捕获阶段的纯监听，不改宿主 DOM）。
  useDismissOnOutside(rootRef, open, () => close());

  // 已删除提示自动消失。
  React.useEffect(() => {
    if (notice === null) return;
    const id = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => {
      window.clearTimeout(id);
    };
  }, [notice]);

  /**
   * **用户显式关闭**面板（点按钮/点浮层外/取消/已插入/存为提示词/去管理）：连未提交的变量填窗
   * 选择一起丢弃。R54：浮层抢屏的那条收起路径走下面「位移即收回意图」的 `setOpen(false)`，**不**经过
   * 这里。布局 effect 作废已提交的确认，但保留尚未提交的填窗选择。
   */
  const close = (): void => {
    cancelApplication();
    setOpen(false);
    setPending(null);
    setChecking(false);
  };
  const backFromUse = (): void => {
    cancelApplication();
    setChecking(false);
    if (pending) setPending(null);
    else setSelectedId(null);
  };

  /**
   * 隐藏即释放：`open` 收回/关闭后，claim 不得停在 `library` 上（P6 的教训——留成占位会把别的面
   * 压住：`claimed === "library"` 而面板已关 ⇒ 另外两面都渲染不出来，且 `claimOverlay` 的幂等守卫
   * 会连带吞掉下一次真实边沿）。释放是**条件式**的：`#` 浮层在自己的收尾里 release 时，若屏已经在
   * 别面手里就不会被连带清掉。
   */
  React.useEffect(() => {
    if (open) return;
    releaseOverlay("library");
  }, [open]);

  /** 卸载即释放（宿主收走插槽时；此时组件不再渲染，`open` 那条 effect 不会跑）。 */
  React.useEffect(() => () => releaseOverlay("library"), []);

  /**
   * 沉淀入口 B 的落库前段（R4：pushCapture 由本组件调用）：选中正文推进 store，再打开管理面板。
   * 真正的落库发生在面板新建态的保存（走 `capture.ts#createFromCapture`，R28）；预填由面板在
   * 「新建」点击那一刻用 takeCapture() 消费（T2 已实现的消费侧）——本组件不自己创建记录。
   */
  const saveSelection = (text: string): void => {
    pushCapture({ body: text });
    openManager("list");
  };

  /** 沉淀入口 C（TBD-P6-6(a)：挂在本快速列表面板里，不新增座位）：当前草稿存为提示词。 */
  const saveDraft = (): void => {
    if (draft.trim() === "") return;
    close();
    pushCapture({ body: draft });
    openManager("list");
  };

  const showNotice = (key: PromptEnhancerKey): void => {
    setNotice((prev) => ({ text: t(key), seq: (prev?.seq ?? 0) + 1 }));
  };

  const apply = async (insertion: LibraryInsertion, confirmation: InsertionConfirmation): Promise<void> => {
    if (application.current || getOverlayClaimSnapshot() !== "library") return;
    const controller = new AbortController();
    application.current = controller;
    setPending(markInsertionSubmitted);
    setChecking(true);
    setNotice(null);
    try {
      const result = await applyVerifiedPrompt({
        insertion, confirmation, signal: controller.signal,
        current: () => getOverlayClaimSnapshot() === "library" ? latestTarget.current : undefined,
      });
      if (result.kind === "applied") {
        void result.usage.then(() => setUsageRevision((revision) => revision + 1)).catch((error: unknown) => {
          console.warn("[prompt-enhancer] " + t("error.use"), error);
          if (latestTarget.current.actions === inputActions && !controller.signal.aborted) showNotice("list.usageFailed");
        });
      }
      if (application.current !== controller) return;
      switch (result.kind) {
        case "applied":
          // The write is complete. Closing the panel must not invalidate its usage receipt.
          application.current = null;
          setChecking(false);
          close();
          break;
        case "cancelled":
        case "memory-failed":
          break;
        case "missing":
          setPrompts((prev) => prev?.filter((item) => item.id !== insertion.id) ?? null);
          setPending(null);
          setSelectedId(null);
          showNotice("list.missingBeforeInsert");
          break;
        case "reconfirm":
          setPending({ kind: "confirm", insertion, confirmation: { review: result.review } });
          break;
        case "unverified":
          console.warn("[prompt-enhancer] " + t("list.verifyFailed"), result.error);
          showNotice("list.verifyFailed");
          break;
        case "rejected":
          showNotice("error.insert");
          break;
      }
    } catch (error) {
      console.warn("[prompt-enhancer] " + t("error.insert"), error);
      if (application.current === controller) showNotice("error.insert");
    } finally {
      if (application.current === controller) {
        application.current = null;
        setChecking(false);
      }
    }
  };

  const choose = (prompt: Prompt, mode: InsertMode): void => {
    if (application.current || getOverlayClaimSnapshot() !== "library") return;
    const use = prepareLibraryUse(prompt, mode, latestTarget.current);
    setPending(use);
    if (use.kind === "confirm") void apply(use.insertion, use.confirmation);
  };

  if (!settings.showComposerButton) return null;

  /**
   * 本次面板要渲染的候选：过滤 + 渲染上限。
   *
   * 过滤和排名复用 `#` 浮层的 `hash-token.ts#filterPrompts`。
   *
   * 上限在这里 `slice`，而不是把 `QUICK_LIST_LIMIT` 塞给 `filterPrompts`：那个函数的
   * limit 语义有自己的用例（`tests/hash-token.test.mjs`），而这里需要「先拿到全部命中数、
   * 再截前 N 条」——截断出来的条数要用来渲染底部的「另有 N 条」。
   *
   * **必须用 `panelOpen` 门住**：本组件订阅了草稿（`useInput`）⇒ composer 每敲一键都重渲染，
   * 而 `prompts` 在关闭后**不清空**（下次打开直接复用上次那份）。不门住的话，首次打开过之后
   * 面板关着也在每次按键对整库 filter + sort——一条与列表毫无关系的热路径。
   */
  const matched = panelOpen ? filterPrompts(prompts ?? [], query, Number.MAX_SAFE_INTEGER) : [];
  const recent = query.trim() ? [] : recentPrompts(matched);
  const recentIds = new Set(recent.map((prompt) => prompt.id));
  const shown = matched.filter((prompt) => !recentIds.has(prompt.id)).slice(0, QUICK_LIST_LIMIT - recent.length);
  const visible = [...recent, ...shown];
  const selected = visible.find((prompt) => prompt.id === selectedId);
  const variables = selected ? parseVariables(selected.body) : [];
  const confirmation = pending?.kind === "confirm" ? pending.confirmation : null;
  const review = confirmation && "review" in confirmation ? confirmation.review : null;
  const hiddenCount = matched.length - visible.length;

  const navigateRows = (event: React.KeyboardEvent, index: number): void => {
    if (event.nativeEvent.isComposing || !visible.length) return;
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    event.stopPropagation();
    const offset = event.key === "ArrowDown" ? 1 : -1;
    const next = index === -1 && offset < 0 ? visible.length - 1 : index + offset;
    rows.current[Math.max(0, Math.min(next, visible.length - 1))]?.focus();
  };

  const renderRows = (items: Prompt[], offset: number): React.ReactElement => (
    <span role="list" style={LIST}>
      {items.map((prompt, index) => (
        <span key={prompt.id} role="listitem">
          <button
            ref={(node) => { rows.current[offset + index] = node; }}
            type="button"
            style={ROW}
            onKeyDown={(event) => navigateRows(event, offset + index)}
            onClick={() => setSelectedId(prompt.id)}
          >
            <span style={ROW_TITLE}>{prompt.title}</span>
            <span style={ROW_SUMMARY}>{promptSummary(prompt, 72)}</span>
          </button>
        </span>
      ))}
    </span>
  );

  return (
    <div
      ref={rootRef}
      onKeyDown={(event) => {
        if (!panelOpen || event.key !== "Escape" || event.nativeEvent.isComposing) return;
        if (event.target instanceof HTMLInputElement && event.target.type === "search" && query) return;
        event.preventDefault();
        event.stopPropagation();
        if (pending || selected) backFromUse();
        else { close(); triggerRef.current?.focus(); }
      }}
      style={WRAP}
      // T5 活体验收的**单源读数**（T1 的判定表判据）：本行是 composer 工具行里常驻的根节点，
      // 逐帧读它即可知道「此刻谁占屏」，不必从三处几何反推。照 P6 的 data-prompt-enhancer-manager /
      // -confirm 口径：声明式渲染，不是 DOM 注入（零 DOM 写入/零 querySelector）。
      data-prompt-enhancer-claim={claimed}
    >
      <button
        ref={triggerRef}
        type="button"
        style={BUTTON}
        title={t("button.tip")}
        aria-label={t("button.tip")}
        aria-haspopup="dialog"
        aria-expanded={panelOpen}
        onClick={(event) => {
          // R59（F-1 / I-3）+ R60（F1-1）：**动作侧闸门**，且按「激活通道」而非「时刻」分叉。
          //
          // 为什么只拦**非指针**激活（`detail === 0`：键盘 Enter/空格、AT 合成激活）：
          // 指针点击时 `hashVisible` 可能是**陈旧的 true**——真实鼠标在浮层可见时点本按钮，
          // pointerdown 收起浮层（信号转 false）与 click 派发之间若间隔过短（F1-1 活体实测：
          // 0/5/10ms **全吞**、≥20ms 全开），React 尚未重渲染，onClick 拿到的仍是旧闭包；
          // 无条件闸门于是把这次点击**整口吞掉**（面板 0 帧、`open` 连置位都没有，用户须再点一次）。
          // 非指针激活没有 pointerdown，那一拍的 `hashVisible` 必是当前值（浮层在场 ⇒ 本组件必然
          // 已按 true 渲染过 ⇒ 闭包不陈旧），闸门在那里才是安全的。
          // `detail` 判据与宿主同口径：`packages/client/ui-primitives/src/user-text.tsx:145` 用
          // `event.detail !== 0` 区分是否指针交互。
          //
          // 键盘路径保留闸门（R57 的初衷）：若不拦，Enter 会置位一个渲染不出来的 `open`（浮层在场
          // 时面板不渲染）；随后用户改用鼠标点同一按钮——那时浮层已被 pointerdown 收起、`panelOpen`
          // 转真 → 走 close()，一次点击既没开面板、又**连带清掉 pending**（绕过 R54 的保护）。
          //
          // 放行后的判定只经 `panelOpen`（不再用 `open`）：面板真的在屏上 ⇒ 本次渲染必然是最新的 ⇒
          // 闭包不陈旧 → close()；面板不在屏上（浮层刚被这次 pointerdown 收起、或从未打开）→
          // setOpen(true)。控制者最初给的 `panelOpen ? close() : setOpen(true)` 当初被否，是因为它
          // **没有消除背离状态本身**（Enter 造出的 `open=true` 会让 pointerdown 之后的新闭包读到
          // `panelOpen=true` 而 close()）；R59 从源头掐掉了那个状态，R60 再把闸门收窄到非指针通道。
          if (event.detail === 0 && hashVisible) return;
          if (panelOpen) close();
          else {
            // **激活即抢屏**（T1 的 claim 接线）：在**动作侧同步**取，不放 effect。
            // 理由是可实测的时序（F1-1）：指针点击时 `panelOpen` / `hashVisible` 可能是**陈旧闭包**
            // （0/5/10ms 全吞），而 `claimOverlay` 同步写寄存器并同步通知订阅者 ⇒ 本次点击引发的**这一次**
            // 渲染读到的就是新值，面板在同一次提交里出现（不需要「先渲染一遍、下一帧再补上」）。
            // `#` 浮层随后收尾时调 `releaseOverlay("hash")`，因「只释放自己持有的」而不会连带清掉我们。
            claimOverlay("library");
            setOpen(true);
          }
        }}
      >
        <PromptLibraryIcon />
        {/*
         * P8 T2：与 AI 优化按钮共用 `showsLabel` 一个判定（两处 `*IconOnly` 语义统一）。
         * 只改**可见文字**：`aria-label` / `title` / `aria-haspopup` / `aria-expanded` 全不动，
         * 故活体定位（R-P8-4）与无障碍名不受影响。
         */}
        {showsLabel(settings.composerButtonIconOnly) && <span>{t("button.title")}</span>}
      </button>
      {/* 沉淀入口 B：选中聊天文字浮出的「存为提示词」（不新增座位：渲染在本组件根节点内）。 */}
      <SelectionAddPrompt
        enabled={settings.selectionAddEnabled}
        rootRef={rootRef}
        label={t("selection.save")}
        onSave={saveSelection}
      />
      {(checking || notice !== null) && (
        <span role="status" aria-live="polite" style={NOTICE}>
          {checking ? t("list.checking") : notice?.text}
        </span>
      )}
      {panelOpen && pending?.kind === "fill" && (
        <div style={ANCHOR}>
          <TemplateVariablesDialog
            body={pending.prompt.body}
            variables={pending.prompt.variables}
            promptId={pending.prompt.id}
            t={t}
            confirmLabel={t(ACTION_LABELS[pending.insertion.mode])}
            onCancel={backFromUse}
            applying={checking}
            onConfirm={(body, remember) => void apply(pending.insertion, { body, remember })}
          />
        </div>
      )}
      {panelOpen && pending?.kind === "confirm" && (
        <div style={ANCHOR}>
          <div role="dialog" aria-label={t(review ? "list.reviewDraft" : "list.reviewBody")} aria-busy={checking} style={PANEL}>
            {review && <span role="alert" style={MUTED}>{t("list.reconfirm")}</span>}
            <div style={PANEL_BODY}>
              {review && (
                <>
                  <span style={HEADER}>{t("list.reviewDraft")}</span>
                  <pre style={PREVIEW_BODY} tabIndex={0}>{review.draft || t("list.emptyDraft")}</pre>
                  {pending.insertion.mode === "insert-send" && (
                    <span style={MUTED}>
                      {t("list.reviewAttachments")}{review.attachmentIds.length} · {t("list.checkAttachments")}
                    </span>
                  )}
                </>
              )}
              <span style={HEADER}>{t("list.reviewBody")}</span>
              <pre style={PREVIEW_BODY} tabIndex={0}>
                {"review" in pending.confirmation ? pending.confirmation.review.body : pending.confirmation.body}
              </pre>
            </div>
            <span style={PANEL_ACTIONS}>
              <button type="button" autoFocus style={ACTION_BUTTON} onClick={backFromUse}>{t("vars.cancel")}</button>
              <button type="button" style={PRIMARY} disabled={checking}
                onClick={() => void apply(pending.insertion, pending.confirmation)}>
                {t(ACTION_LABELS[pending.insertion.mode])}
              </button>
            </span>
          </div>
        </div>
      )}
      {panelOpen && pending === null && (
        <div style={ANCHOR}>
          <div role="dialog" aria-label={t("list.title")} style={PANEL}>
            <span style={PANEL_HEADER}>
              <span style={HEADER}>{t("list.title")}</span>
              <span style={PANEL_ACTIONS}>
                {/* 沉淀入口 C（TBD-P6-6(a)）：当前草稿空时不给点（空正文宿主会回 400）。 */}
                <button
                  type="button"
                  style={{
                    ...ACTION_BUTTON,
                    opacity: draft.trim() === "" ? 0.6 : 1,
                    cursor: draft.trim() === "" ? "default" : "pointer",
                  }}
                  title={t("list.saveDraft")}
                  aria-label={t("list.saveDraft")}
                  disabled={draft.trim() === ""}
                  onClick={saveDraft}
                >
                  {t("list.saveDraft")}
                </button>
                {/* 「管理」动作（规格 §7.1/§7.3）：只经 ui-state 的 openManager 打开面板，
                    与左侧入口不互相引用（D-P6-1）。先收起源浮层，再把弹窗交给 shell.overlay。 */}
                <button
                  type="button"
                  style={ACTION_BUTTON}
                  title={t("list.manage")}
                  aria-label={t("list.manage")}
                  aria-haspopup="dialog"
                  onClick={() => {
                    close();
                    openManager();
                  }}
                >
                  {t("list.manage")}
                </button>
              </span>
            </span>
            {/*
             * 过滤输入（2026-09-30 裁定）：**打开即聚焦**——否则「准确定位」还要多一次点击，等于没解决。
             * autoFocus 是 React 的声明式属性，不是 DOM 注入（硬约束 3 禁的是 MutationObserver /
             * querySelector 那类旁路）。
             */}
            {!selected && (
              <>
                <input
                  type="search"
                  autoFocus
                  aria-label={t("list.filter")}
                  placeholder={t("list.filterPlaceholder")}
                  value={query}
                  onChange={(ev) => setQuery(ev.target.value)}
                  onKeyDown={(event) => {
                    navigateRows(event, -1);
                    if (event.key === "Enter" && !event.nativeEvent.isComposing && visible[0] && !loadError) {
                      event.preventDefault();
                      event.stopPropagation();
                      setSelectedId(visible[0].id);
                    }
                  }}
                  style={FILTER}
                />
                <span style={PANEL_BODY}>
                  {loadError !== null && (
                    <span role="alert" style={ERROR}>
                      <span>{t("error.load")}</span>
                      <span style={ERROR_DETAIL} title={loadError}>
                        {loadError}
                      </span>
                    </span>
                  )}
                  {loadError === null && prompts === null && <span style={MUTED}>{t("list.loading")}</span>}
                  {loadError === null && prompts !== null && prompts.length === 0 && (
                    <span style={MUTED}>{t("list.empty")}</span>
                  )}
                  {/* 有内容但筛不出结果：与管理面板的「搜索无结果」同一种说法（复用 `hash.empty`）。 */}
                  {loadError === null && prompts !== null && prompts.length > 0 && matched.length === 0 && (
                    <span style={MUTED}>{t("hash.empty")}</span>
                  )}
                  {loadError === null && recent.length > 0 && (
                    <div role="group" aria-label={t("list.recent")}>
                      <div style={MUTED}>{t("list.recent")}</div>
                      {renderRows(recent, 0)}
                    </div>
                  )}
                  {loadError === null && shown.length > 0 && renderRows(shown, recent.length)}
                  {/* 渲染上限的越界提示：整行可点，直接把用户送到真正能搜全库的地方。 */}
                  {loadError === null && hiddenCount > 0 && (
                    <button
                      type="button"
                      style={MORE}
                      onClick={() => {
                        close();
                        openManager();
                      }}
                    >
                      {hiddenCount}{t("list.overflow")}
                    </button>
                  )}
                </span>
              </>
            )}
            {loadError === null && selected && (
              <section style={PREVIEW} aria-label={t("list.preview")}>
                <header style={PANEL_HEADER}>
                  <h3 style={PREVIEW_TITLE}>{selected.title}</h3>
                  <button type="button" autoFocus style={ACTION_BUTTON} onClick={backFromUse}>
                    {t("manager.edit.back")}
                  </button>
                </header>
                {selected.summary && <span style={ROW_SUMMARY}>{selected.summary}</span>}
                {(selected.tags?.length || variables.length) > 0 && (
                  <div style={TAGS}>
                    {(selected.tags ?? []).map((tag) => <span key={`tag:${tag}`} style={TAG}>{tag}</span>)}
                    {variables.map((name) => <span key={name} style={TAG}>{`{{${name}}}`}</span>)}
                  </div>
                )}
                <pre key={selected.id} style={PREVIEW_BODY} tabIndex={0} aria-label={t("manager.edit.body")}>
                  {selected.body}
                </pre>
                <span style={PANEL_ACTIONS}>
                  <button type="button" style={PRIMARY} disabled={checking} onClick={() => choose(selected, "insert")}>
                    {t(variables.length ? "list.fillInsert" : "action.insert")}
                  </button>
                  <details key={selected.id}>
                    <summary style={ACTION_BUTTON}>{t("list.moreActions")}</summary>
                    <span style={PANEL_ACTIONS}>
                      {SECONDARY_MODES.map((mode) => (
                        <button key={mode} type="button" style={ACTION_BUTTON} disabled={checking} onClick={() => choose(selected, mode)}>
                          {t(ACTION_LABELS[mode])}
                        </button>
                      ))}
                    </span>
                  </details>
                </span>
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const WRAP: React.CSSProperties = {
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const ICON: React.CSSProperties = { display: "block", flex: "0 0 auto" };

/** 过滤输入框：与面板同宽，外观与其它行内控件同源（不引第三种控件外观）。 */
const FILTER: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "4px 6px",
  color: TOKEN.fg,
  background: "transparent",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  font: "inherit",
  fontSize: 12,
};

/** 底部「另有 N 条」：整行是一个动作（点击开管理面板），故用无边框按钮而不是一行静态文字。 */
const MORE: React.CSSProperties = {
  alignSelf: "flex-start",
  padding: "2px 0",
  color: TOKEN.accent,
  background: "transparent",
  border: 0,
  font: "inherit",
  fontSize: 11,
  textAlign: "left",
  cursor: "pointer",
};

const BUTTON: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  height: 24,
  padding: "0 8px",
  fontSize: 12,
  color: TOKEN.fg,
  background: "transparent",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  cursor: "pointer",
};

const NOTICE: React.CSSProperties = { color: TOKEN.muted, fontSize: 11, whiteSpace: "nowrap" };

/** 浮层落点：贴按钮上沿；只负责定位，卡片外观由内容自带。 */
const ANCHOR: React.CSSProperties = {
  position: "absolute",
  bottom: "calc(100% + 6px)",
  left: 0,
  zIndex: 30,
  maxWidth: "calc(100vw - 24px)",
};

/**
 * 搜索和预览共用面板尺寸。各自的正文区滚动，头部与插入动作留在视野内。
 */
const PANEL: React.CSSProperties = {
  ...overlayBase,
  display: "flex",
  flexDirection: "column",
  gap: 6,
  width: "min(540px, calc(100vw - 96px))",
  height: "min(490px, calc(100dvh - 132px))",
  boxSizing: "border-box",
  overflow: "hidden",
  padding: 12,
  fontSize: 12,
};

/**
 * 列表滚动区：本卡唯一可滚的部分（加载 / 错误 / 空态、提示词行、底部「另有 N 条」都在这里）。
 * minHeight: 0 不可省：flex 子项的自动最小尺寸是内容高度，不覆盖它就永远不收缩、滚动不生效。
 */
const PANEL_BODY: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  flex: "1 1 auto",
  minHeight: 0,
  overflowY: "auto",
};

/** 面板头：标题 + 动作组（草稿存为提示词 / 管理）；窄面板下动作组换行，不挤掉标题。 */
const PANEL_HEADER: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: 6,
};

/** 面板头右侧的动作组（沉淀入口 C 与「管理」）。 */
const PANEL_ACTIONS: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  flexWrap: "wrap",
};

const HEADER: React.CSSProperties = { color: TOKEN.fg, fontSize: 13, fontWeight: 600 };

const MUTED: React.CSSProperties = { color: TOKEN.muted, fontSize: 11 };

const ERROR: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  color: TOKEN.fg,
  fontSize: 11,
};

const ERROR_DETAIL: React.CSSProperties = { color: TOKEN.muted, overflowWrap: "anywhere" };

const LIST: React.CSSProperties = { display: "flex", flexDirection: "column" };

const ROW: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 2, textAlign: "left",
  width: "100%", padding: "6px 8px", border: 0, borderRadius: 6,
  cursor: "pointer", font: "inherit", background: "transparent",
};

const ROW_TITLE: React.CSSProperties = {
  color: TOKEN.fg,
  fontSize: 12,
  fontWeight: 600,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const ROW_SUMMARY: React.CSSProperties = { color: TOKEN.muted, fontSize: 11, overflowWrap: "anywhere" };

const TAGS: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 };

const TAG: React.CSSProperties = {
  color: TOKEN.accent,
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 999,
  padding: "0 6px",
  fontSize: 10,
};

const ACTION_BUTTON: React.CSSProperties = {
  padding: "1px 6px",
  fontSize: 11,
  lineHeight: "16px",
  color: TOKEN.fg,
  background: "transparent",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  cursor: "pointer",
};


const PRIMARY: React.CSSProperties = { ...ACTION_BUTTON, color: TOKEN.accent, borderColor: TOKEN.accent };
const PREVIEW: React.CSSProperties = {
  display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0, gap: 8,
};
const PREVIEW_TITLE: React.CSSProperties = {
  fontSize: 15, fontWeight: 600, margin: 0, overflowWrap: "anywhere",
};
const PREVIEW_BODY: React.CSSProperties = {
  flex: "1 1 0", minHeight: 0, margin: 0, padding: 12, borderRadius: 6,
  color: TOKEN.fg, background: TOKEN.hover, font: "inherit", fontSize: 13, lineHeight: 1.65,
  whiteSpace: "pre-wrap", overflowWrap: "anywhere", overflowY: "auto",
};
