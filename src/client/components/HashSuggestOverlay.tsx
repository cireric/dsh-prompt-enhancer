/**
 * `#` 候选浮层：草稿**末尾**出现 `#查询词` 令牌时列出匹配的提示词，点行即替换。
 *
 * 落点在 `conversation.input.overlay`（composer 卡内的浮动层）：宿主容器
 * `.overlayAnchor` 是 `position: absolute; inset: 0 0 auto; height: 0` 的零高
 * 锚点，故本组件自行绝对定位到锚点上方（与官方 `MenuView` 同款落点）。
 *
 * **T1（P7）**：本浮层是共享 claim 的三个面之一（`hash`）。`visible`（下面 `shouldShowSuggest` 的判定）
 * 既是 P6 的**可见性信号**（R53，库侧的 R60 通道分叉要用）的输入，也是**抢屏**的输入；渲染门读
 * `canRender("hash", claimed)`，故与词库面板 / AI 面板**同屏在结构上不可能**（不再是三处各自的边沿规则）。
 *
 * **D2（用户 2026-09-24 裁定）**：只做鼠标点击选择，**不接管键盘**——本文件
 * 没有任何 keydown/keyup/keypress 处理、没有 `tabIndex`、不挂任何键盘监听。
 * 关闭路径有两条：① 令牌消失（用户删掉 `#` 或补了空格）；② R47 起，点浮层**外部**收起自己——
 * 与词库面板 / AI 面板同一套互斥约定（document 捕获阶段的 pointerdown **纯监听**，
 * 不改宿主 DOM，见 `PromptLibraryButton` / `AIPolishButton`）。它只关自身、不抢键、不改草稿；
 * 被关掉后令牌没变，故浮层保持收起，直到草稿被继续编辑（令牌位置或查询词变化 = 一次新的打开）；
 * **令牌消失也会把收起态复位**（R48）——否则「收起 → 删光令牌 → 在同一起点重打同一查询词」
 * 会复现同一个令牌身份，浮层被永久静默抑制。该判定是 `utils/hash-token.ts` 的纯函数，本组件只消费。
 *
 * 职责单一：读草稿 → 判尾令牌 → 渲染候选 → 点击改草稿。纯逻辑一律复用既有
 * 函数：令牌检测/替换/过滤走 `../utils/hash-token.ts`，变量判定走
 * `../utils/template.ts`，含变量的提示词复用任务 5 的 `TemplateVariablesDialog`
 * （本任务只复用、不另建弹窗）。
 */
import * as React from "react";
import type { PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import { canRender, canRetakeHash, canTakeHash } from "../../overlay-claim.ts";
import type { Prompt } from "../../types.ts";
import { api } from "../utils/api.ts";
import {
  filterPrompts,
  nextDismissedKey,
  readHashToken,
  replaceHashToken,
  shouldShowSuggest,
} from "../utils/hash-token.ts";
import { promptSummary } from "../utils/insert.ts";
import { useSettings } from "../utils/settings-store.ts";
import { needsValues } from "../utils/template.ts";
import { TOKEN, overlayBase } from "../utils/theme.ts";
import {
  claimOverlay,
  getOverlayClaimSnapshot,
  releaseOverlay,
  setHashSuggestVisible,
  useOverlayClaim,
} from "../utils/ui-state.ts";
import { TemplateVariablesDialog } from "./TemplateVariablesDialog.tsx";
import { reasonOf } from "../../err-text.ts";
import { useDismissOnOutside } from "../utils/dismiss-outside.ts";

/** `#` 候选浮层（任务 6 落地完整行为）。 */
export type HashSuggestOverlayProps =
  PropsRuntime<"conversation.input.overlay"> & PropsLocale<"prompt-enhancer">;

export function HashSuggestOverlay({
  t,
  useInput,
  inputActions,
}: HashSuggestOverlayProps): React.ReactElement | null {
  const draft = useInput((s) => s.draft);
  /**
   * 设置改读**订阅式** store（P8 T1 的唯一真源）：宿主 scope 每次已提交变更都推一次快照 ⇒ 关掉
   * `#` 触发开关时本组件下一次渲染就读到新值（验收 12 的「不刷新页面即时生效」）。
   */
  const settings = useSettings();
  const token = readHashToken(draft);
  const open = token !== null;
  /** 令牌身份（start + 查询词）：用它记住「这一次打开被点浮层外部关掉了」。 */
  const tokenKey = token === null ? null : `${token.start}:${token.query}`;
  /**
   * R47：已被点外部收起的令牌身份。只对**同一个令牌**生效——草稿继续被编辑（令牌位移或
   * 查询词变化）就是一次新的打开，浮层重新出现。
   */
  const [dismissedKey, setDismissedKey] = React.useState<string | null>(null);
  // R48：判定抽在 `utils/hash-token.ts`（纯模块），组件只消费——组件面没有渲染测试通道，
  // 判定留在组件里就只能靠活体验收，变异无从证起。
  /**
   * 浮层**自己想不想在场**（R47/R48 的判定）：令牌在 **且** 这个令牌没被「点浮层外部」收起过。
   * 它与下面两件事的关系是 T1 定下的：① 它是 P6 的**可见性信号**（R53）的输入；② 它同时是**抢屏**
   * （claim）的输入——可见即抢（见下面的 claim 接线）。
   *
   * **P8 T3（TBD-P8-3 选 (a)）：`#` 触发开关并进渲染门。** 关闭 ⇒ 本面**根本不成立**：同一个
   * `visible` 既喂 R53 的可见性信号（词库按钮的非指针闸门读它），又喂 claim 的两条守卫
   * （`canTakeHash` / `canRetakeHash`）与渲染门 `onScreen`，故开关写在这里——关掉那一刻
   * `visible` 转假 ⇒ 在屏浮层**立刻收起**、寄存器与信号一并退场，**没有新增 effect / effect cleanup**。
   *
   * 为什么不只加在 `onScreen` 上（渲染门字面）：那样 `visible` 仍为真 ⇒ A 段照抢 `hash`、R53 照发
   * true，而浮层什么都不渲染 ⇒ 寄存器停在 `hash`，且词库按钮取屏后 B 段会把它重取回去
   * （`canRetakeHash(true, "library") === true`）⇒ **词库面板再也打不开**——P7 反复修过的静默形态。
   * 默认值 true 时 `true && x === x`，与接线前**逐字同值**。
   */
  const visible = settings.hashTriggerEnabled && shouldShowSuggest({ open, tokenKey, dismissedKey });
  /** 共享 claim（T1 的接线）：`claimed` 是**当前占屏的那个面**，与另外两面读同一帧的同一个值。 */
  const claimed = useOverlayClaim();
  /**
   * 渲染门（T1 起读共享 claim）：**想在场** `visible` **且** 屏**真的在本面手里**。
   *
   * 为什么两个条件都要：`visible` 只说明「草稿末尾有令牌」，不说明「此刻轮到本面上屏」；claim 只说明
   * 「寄存器归谁」，不说明「令牌还在」。两者相与后，同屏在**结构上**不可能——三面的门读的是同一帧的
   * 同一个 `claimed`，与 R55 把词库面板的门做成渲染期求值同一个道理。
   */
  const onScreen = visible && canRender("hash", claimed);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  /** null = 本次打开还没加载完。 */
  const [prompts, setPrompts] = React.useState<Prompt[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  /** 已点击的含变量提示词：非空即变量填窗打开（列表让位给弹窗）。 */
  const [pending, setPending] = React.useState<Prompt | null>(null);

  // 每次打开拉一次并缓存：查询词变化只走本地 filterPrompts，不再请求宿主。
  // 只依赖 open（布尔）：失败文案的本地化由渲染期的 t 负责，把 t 放进依赖会让
  // 「t 身份不稳定」的实现变成重拉循环。令牌消失时顺带丢弃未完成的变量填窗，
  // 否则下次 `#` 会复现上一次的旧弹窗。
  React.useEffect(() => {
    if (!open) {
      setPending(null);
      // R48：令牌消失必须把「已收起」一并复位，否则「收起 → 删光令牌 → 在同一起点重打同一查询词」
      // 会复现同一个 tokenKey，浮层被**永久静默**抑制（同一状态值重复设置会被 React 跳过，无渲染环）。
      setDismissedKey((prev) => nextDismissedKey(open, prev));
      return;
    }
    let alive = true;
    setPrompts(null);
    setLoadError(null);
    api.listPrompts().then(
      (list) => {
        if (alive) setPrompts(list);
      },
      (err: unknown) => {
        if (!alive) return;
        // 加载失败必须可见：既留 console 痕迹，也在浮层里显示一行错误（不是空态）。
        console.warn("[prompt-enhancer] 提示词列表加载失败", err);
        setPrompts([]);
        setLoadError(reasonOf(err));
      },
    );
    return () => {
      alive = false;
    };
  }, [open]);

  // R47：与词库面板 / AI 面板同一套「点外面关」约定（P5 起沿用的 document 捕获阶段 pointerdown 纯监听，
  // 不改宿主 DOM）——点浮层外部收起自己。于是「草稿带 `#` 令牌时点词库按钮」这一下先关掉本浮层、
  // 再打开词库面板。
  //
  // T1 起这条指针监听**不再承担互斥职责**：它只是本面自己的收起入口（用户意图），把它关掉的后果是
  // `visible` 转 false ⇒ 下面的 claim effect 释放 `hash` ⇒ 别面可以取屏。互斥由共享 claim 在全通道
  // 上保证（键盘/AT 激活没有 pointerdown 也挡得住——P6 的实测路径正是那样绕过边沿规则的）。
  useDismissOnOutside(rootRef, visible, () => {
    if (tokenKey !== null) setDismissedKey(tokenKey);
    setPending(null);
  });

  /** 落草稿（替换尾令牌）+ 上报用量（规格 §4.4：「# 选中」也算一次使用）。 */
  const apply = (prompt: Prompt, body: string): void => {
    inputActions.setDraft(replaceHashToken(draft, body));
    setPending(null);
    // 选中后浮层立即随令牌消失，故失败只能留痕迹（没有可显示提示的行）。
    void api.recordUsage(prompt.id).catch((err: unknown) => {
      console.warn("[prompt-enhancer] " + t("error.use"), err);
    });
  };

  // R53：把「浮层此刻是否真的可见」发布为共享信号（唯一订阅方 = 词库面板）。
  // 依赖 `visible` 而不是 `token`：被点外部收起时令牌仍在，但浮层已不可见，不得再算「可见」。
  // **卸载必须清除**（cleanup 置 false）：令牌消失/被收起时本组件只是 `return null`（仍挂载，
  // effect 照跑）；真正卸载发生在宿主收走插槽时。信号若停在 true 的后果（R55 后复核、T1 的 claim 读法下同理）：
  // 词库面板的门 `open && canRender("library", claimed)` 恒不通过 ⇒ 它**再也渲染不出来**（按钮点了没反应），
  // 同时 `setHashSuggestVisible` 的幂等守卫会把下一次「可见」的边沿一并吞掉。
  // 注：R55 **之前**面板的渲染只看 `open`，那时残留的后果轻得多（只吞掉一次上升沿、同类重叠
  // 可再复现一次，直到下一次 visible→false 自愈）——评审实测的正是那一版的后果；渲染门落地后，
  // 这条 cleanup 由「防复发」升级为「面板能不能渲染」的必要条件。
  React.useEffect(() => {
    setHashSuggestVisible(visible);
    return () => {
      setHashSuggestVisible(false);
    };
  }, [visible]);

  /**
   * claim 接线（T1）：**可见即抢屏**，不可见/卸载即释放。
   *
   * 为什么抢：`#` 浮层的前置条件是**草稿末端的令牌**——它只在用户**正在敲字的那一刻**成立，是三者里
   * 最新鲜的意图；若它不抢，词库面板（或 AI 面板）在场时敲 `#` 就会**什么都不出现**（P4 的核心可用性
   * 反而被 claim 弄丢）。抢屏后：词库面板由它自己的「位移即收回意图」effect 收回 `open`（R49 的效果
   * 保住、浮层消失后不自动重现），AI 面板让位并在屏空出来后自行取回（它的面板状态不受影响）。
   *
   * 为什么是 effect 而不是渲染期：抢屏是一次**副作用**（写共享寄存器）；而**判定**仍在渲染期
   * （`onScreen` 在每次渲染时重算）——R55 的纪律针对的是判定，不是这次写入。令牌出现到抢到屏之间
   * 最多差一次提交，那一提交里本面不渲染（不会与任何面同屏）。
   *
   * **持续形态**（修复轮 1 的评审发现）：被别面抢走后必须能**重取**。为什么不能是一次性写入
   * （deps 只有 `[visible]`）：`visible` 由令牌派生，**被位移时它不跳变**——一次性写入下，浮层被
   * 别面抢走后**没有任何重取时机**，令牌仍在草稿里却永远不再上屏（其 pending 变量填窗也一并消失）
   * = 永久静默。这句话同时是报告 §4.1「浮层可见 ⇔ 浮层持 claim」这条等价前提的成立条件。
   *
   * **修复轮 2（R-P7-R）：拆成两个 effect，让终止性来自代码自身的自限性，而不是宿主的批处理语义。**
   * 合并成一条（deps `[visible, claimed]` + 无条件 cleanup）时，每次寄存器跳变都会走一遍
   * 「cleanup **真写释放**（hash→none）→ 体**真写重取**（none→hash）」：那 2 次派发在 React 18 的自动
   * 批处理下被合并、末态与上一次渲染相同 ⇒ deps 不变 ⇒ 表面终止；但**终止性因此建在宿主的批处理语义
   * 上**——宿主若退回非批处理语义（React 17 legacy：effect 内 setState 同步重渲染）就是无界重渲染环，
   * 而 UI 冻结比同屏与静默都严重。本项目已三次因「把承重结论建在别人的行为上」返工（R35 / R55 / R60），
   * 故收成下面两条：
   *
   *  - **A（取 + 释放）**：deps 只有 `[visible]`。可见性跳变时写一次；`visible` 转 false 或**卸载**时
   *    cleanup 释放一次。它的 deps 里**没有寄存器** ⇒ 别面（或 B）造成的跳变**绝不**会重跑 A。
   *  - **B（只重取，无 cleanup）**：deps `[visible, claimed]`。只在「可见**且**寄存器不在本面手里」时写；
   *    写完寄存器即 `hash` ⇒ B 再跑时读到 `hash` ⇒ **不写** ⇒ 不派发 ⇒ 不再唤醒任何人 ⇒ 静默。
   *    没有 cleanup ⇒ 不存在「无谓释放再重取」的那两次写。
   *  ⇒ 「被夺 → B 写**一次** → 终止」由**自身条件从「不满足」变「满足」时才写一次**保证：**与批处理
   *    语义无关**（宿主换批处理语义不会改变终止性）。残余依赖只有 `useEffect` 的 **deps 契约**本身
   *    （effect 只在自身 deps 变化时重跑）——那是 React 的公开契约，不是偶然行为。注意：字面意义的
   *    「每轮重跑所有 effect、连 deps 相等跳过都不要」**不是有效模型**——它连本文件既有的 R53 信号发布
   *    effect 都不终止，与 `useEffect` 契约矛盾。
   *    正面证据是 `tests/overlay-claim.test.mjs` 的**非批处理**调度模型 + **写者归属插桩**：每次写入
   *    立即推进「渲染 + 跑 effect」（legacy 语义：effect 内 setState 同步重渲染）并按 deps 契约跳过未变的
   *    effect；断言「令牌出现 ⇒ **A** 写一次」「被夺 ⇒ **B** 写一次且 A 不写」「隐藏 ⇒ A 的 cleanup 释放
   *    一次」，且**删掉 B 该用例必红**（B 是否承重的反向证据）。
   *
   * B 里读**活寄存器**而不是本次渲染的 `claimed` 快照：本 effect 在**提交之后**才跑，快照两个方向都会陈旧，
   * 而**致命的是「向上错」**——快照说「已经是 hash」而寄存器其实已归别面 ⇒ 守卫判成「不用写」⇒ 漏掉必要
   * 的重取 ⇒ 退回「被夺后永久静默」（发现 2 的形态）；反方向「向下漏」（快照说在别面手里、其实是自己）
   * **无害**：那次写会被 store 的**同值守卫**挡下（不写入、不派发）。`getOverlayClaimSnapshot()` 读的是
   * 此刻的真值。
   *
   * 释放是**条件式**的（`releaseOverlay` 只清自己持有的）：pointerdown 收起本浮层与「点击词库按钮」
   * 可能落在同一拍上（F1-1 的 0/5/10ms），A 的 cleanup 晚于词库的取屏时**不得**把它清掉。
   */
  React.useEffect(() => {
    // 守卫不是内联算式：它是 `overlay-claim.ts#canTakeHash`（T7 ③ 起与测试模型**同一份**，
    // 见那里的注释：本函数刻意不收 claimed，A 的 deps 里没有寄存器）。
    if (canTakeHash(visible)) claimOverlay("hash");
    return () => {
      releaseOverlay("hash");
    };
  }, [visible]);

  React.useEffect(() => {
    // 同理：守卫 = `overlay-claim.ts#canRetakeHash`，第二个实参是**活寄存器**的读值。
    if (canRetakeHash(visible, getOverlayClaimSnapshot())) claimOverlay("hash");
  }, [visible, claimed]);

  // R47：被点外部收起之后（仅当前这个令牌）不再渲染；令牌消失或变化即自动复位。
  // T1：另一个条件由 claim 提供（想在场 ≠ 屏在本面手里），见上面的 `onScreen`。
  // `token === null` 那半是给 TS 的收窄（`visible` 为假已覆盖它，P6 的原行同样这么写）——不是第三条判定。
  if (token === null || !onScreen) return null;

  // 含变量的提示词：先开任务 5 的变量填窗，填完再落草稿。
  if (pending !== null) {
    return (
      <div ref={rootRef} style={ANCHOR}>
        <TemplateVariablesDialog
          body={pending.body}
          t={t}
          onCancel={() => setPending(null)}
          onFilled={(filled) => apply(pending, filled)}
        />
      </div>
    );
  }

  const filtered = filterPrompts(prompts ?? [], token.query);

  return (
    <div ref={rootRef} style={ANCHOR}>
      <div role="group" aria-label={t("hash.title")} style={PANEL}>
        <div style={HEADER}>{t("hash.title")}</div>
        {loadError !== null && (
          <div role="alert" style={ERROR} title={loadError}>
            {t("error.load")}
          </div>
        )}
        {loadError === null && prompts === null && <div style={MUTED}>{t("list.loading")}</div>}
        {loadError === null && prompts !== null && filtered.length === 0 && (
          <div style={MUTED}>{t("hash.empty")}</div>
        )}
        {loadError === null &&
          filtered.map((prompt) => (
            <button
              key={prompt.id}
              type="button"
              style={ROW}
              title={prompt.title}
              aria-label={prompt.title}
              onClick={() => {
                if (needsValues(prompt.body)) setPending(prompt);
                else apply(prompt, prompt.body);
              }}
            >
              <span style={ROW_TITLE}>{prompt.title}</span>
              <span style={ROW_SUMMARY}>{promptSummary(prompt)}</span>
              {prompt.tags.length > 0 && (
                <span style={TAGS}>
                  {prompt.tags.map((tag) => (
                    <span key={tag} style={TAG}>
                      {tag}
                    </span>
                  ))}
                </span>
              )}
            </button>
          ))}
      </div>
    </div>
  );
}

/**
 * 浮层落点：只负责定位，不画卡片。
 *
 * 容器（`overlayBase` + 卡片外观）要么是候选列表、要么是变量填窗——后者自带
 * `overlayBase`（任务 5 的 `TemplateVariablesDialog` 不接 style），把 `overlayBase`
 * 同时放在定位容器上会出现「双层卡片」（两层描边与阴影叠在一起）。故外观一律
 * 由内容自带，与任务 5 的 `PromptLibraryButton` 的 ANCHOR/PANEL 分工一致。
 * `left: 8` 对齐 composer 左缘。`zIndex: 30` 与词库面板同级；**同屏互斥与 z-index 无关**，由
 * `ui-state.ts` 的共享 claim 保证（T1 起三面共用一个寄存器；z-index 只决定「谁压在谁上面」这种
 * 已经不可能发生的情形）。
 */
const ANCHOR: React.CSSProperties = {
  position: "absolute",
  bottom: 8,
  left: 8,
  zIndex: 30,
  maxWidth: "calc(100vw - 24px)",
};

/** 候选列表卡片：设计上限 320，超出在卡内滚动。 */
const PANEL: React.CSSProperties = {
  ...overlayBase,
  display: "flex",
  flexDirection: "column",
  gap: 4,
  width: 300,
  maxHeight: 320,
  overflowY: "auto",
  padding: 6,
  fontSize: 12,
};

const HEADER: React.CSSProperties = { color: TOKEN.muted, fontSize: 11, fontWeight: 600 };

const MUTED: React.CSSProperties = { color: TOKEN.muted, fontSize: 11 };

const ERROR: React.CSSProperties = { color: TOKEN.fg, fontSize: 11 };

const ROW: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 2,
  width: "100%",
  padding: "5px 4px",
  color: TOKEN.fg,
  background: "transparent",
  border: 0,
  borderTop: `1px solid ${TOKEN.border}`,
  textAlign: "left",
  font: "inherit",
  fontSize: 12,
  cursor: "pointer",
};

const ROW_TITLE: React.CSSProperties = {
  color: TOKEN.fg,
  fontSize: 12,
  fontWeight: 600,
  maxWidth: "100%",
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
