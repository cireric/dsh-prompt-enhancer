/**
 * 输入框旁「词库」按钮：打开快速列表，三动作写入草稿，含变量的先弹变量填窗。
 *
 * 注册在 `conversation.input.left`；props 由 `PropsRuntime`（session 标准 props
 * 已内含 `useInput` / `inputActions`）与 `PropsLocale` 组成。
 *
 * 副作用都在官方动作面上：读草稿走 `useInput`，写草稿走 `inputActions.setDraft`，
 * 发送走 `inputActions.submit`（规格 §7.2）；过滤/替换/插入语义一律复用
 * `src/client/utils/` 的纯函数，组件不重复实现。
 */
import * as React from "react";
import type { PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import { canRender } from "../../overlay-claim.ts";
import type { Prompt } from "../../types.ts";
import { api } from "../utils/api.ts";
import { useSettings } from "../utils/settings-store.ts";
import type { PromptEnhancerKey } from "../utils/i18n.ts";
import { composeDraft, promptSummary, type InsertMode } from "../utils/insert.ts";
import { needsValues } from "../utils/template.ts";
import { TOKEN, overlayBase } from "../utils/theme.ts";
import {
  claimOverlay,
  openManager,
  pushCapture,
  releaseOverlay,
  useHashSuggestVisible,
  useOverlayClaim,
} from "../utils/ui-state.ts";
import { SelectionAddPrompt } from "./SelectionAddPrompt.tsx";
import { TemplateVariablesDialog } from "./TemplateVariablesDialog.tsx";

/** 输入框旁「词库」按钮（任务 5 落地完整行为）。 */
export type PromptLibraryButtonProps =
  PropsRuntime<"conversation.input.left"> & PropsLocale<"prompt-enhancer">;

/** 已点动作、正等变量填窗回填的那一次插入。 */
interface PendingUse {
  prompt: Prompt;
  mode: InsertMode;
}

/** 每行三个动作（顺序即按钮顺序）。 */
const ACTIONS: ReadonlyArray<{ mode: InsertMode; label: PromptEnhancerKey }> = [
  { mode: "insert", label: "action.insert" },
  { mode: "overwrite", label: "action.overwrite" },
  { mode: "insert-send", label: "action.send" },
];

/** 「该提示词已不存在」的停留时长（自动消失，不打断输入）。 */
const NOTICE_MS = 4000;

export function PromptLibraryButton({
  t,
  useInput,
  inputActions,
}: PromptLibraryButtonProps): React.ReactElement | null {
  const draft = useInput((s) => s.draft);
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
  const [prompts, setPrompts] = React.useState<Prompt[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  /**
   * 已删除提示。带 seq 而不是裸字符串：同一条文案再次触发时 React 不为同值 setState
   * 重跑 effect，4s 计时器就不会重置——seq 每次 +1 让 effect 依赖真的变化。
   */
  const [notice, setNotice] = React.useState<{ text: string; seq: number } | null>(null);
  const [pending, setPending] = React.useState<PendingUse | null>(null);
  const rootRef = React.useRef<HTMLSpanElement | null>(null);

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
  // 每次打开都重新拉取（列表可能在管理面板里被改过）。
  // 只依赖 open：失败文案的本地化由渲染期的 t 负责，把它放进依赖会让
  // 「t 身份不稳定」的实现变成重拉循环。
  React.useEffect(() => {
    if (!open) return;
    let alive = true;
    setPrompts(null);
    setLoadError(null);
    api.listPrompts({ sort: "default" }).then(
      (list) => {
        if (alive) setPrompts(list);
      },
      (err: unknown) => {
        if (!alive) return;
        console.warn("[prompt-enhancer] 提示词列表加载失败", err);
        setPrompts([]);
        setLoadError(err instanceof Error ? err.message : String(err));
      },
    );
    return () => {
      alive = false;
    };
  }, [open]);

  // 点浮层外收起。宿主标准 props 没有「点外面关」的座位；官方 ui-commands 的
  // PopupSelectView 同样用 document 捕获阶段的 pointerdown（纯监听，不改宿主 DOM）。
  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (ev: PointerEvent): void => {
      const root = rootRef.current;
      if (root !== null && ev.target instanceof Node && root.contains(ev.target)) return;
      setOpen(false);
      setPending(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open]);

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
   * 这里（它刻意不清 `pending`），故「已点动作、正等回填」的选择不会被静默丢弃。
   */
  const close = (): void => {
    setOpen(false);
    setPending(null);
  };

  /**
   * 位移即收回意图（R58 ② 的**一般化**；R49 的效果保住）：`open` 为真但屏**不在本面手里** ⇒ 收回
   * `open`。为什么必须收回：留着就造出「`open` 为真而面板不可见」的背离——用户再点一次按钮时
   * `setOpen(true)` 与旧值相同，React 不重渲染、下面的 effect 也不重跑，面板**再也打不开**；
   * R60 的通道分叉当初正是为了从源头掐掉这个状态。
   *
   * 覆盖范围（以 claim 为准，而不是只看 `#` 浮层这一个对手）：
   * - 「面板已开、草稿无令牌时敲出 `#`」：浮层抢屏 ⇒ `claimed === "hash"` ⇒ 面板收起（R49 保住）；
   * - 将来任何新面抢屏：同一行就覆盖了（P7 的收口意义正在这里——不再为每一对补一条局部规则）；
   * - AI 面板**不抢屏**（它的前置条件是长驻状态、只取空屏），故它不会触发本行；它的那一路由动作侧的
   *   R60 闸门挡在源头（非指针激活 + 浮层在场 ⇒ 直接 return，不置位 `open`）。
   *
   * **R57：不延后兑现**——`open` 在这里已被收回，浮层消失后**不会自动重现**，用户须**再激活一次**；
   * 而键盘路径（浮层在场时 Enter/Space）连 `open` 都不会被置位（R60 的闸门），所以也不存在「排队的
   * 意图被兑现」这回事。收回 `open` 时**不清 `pending`**（R54）：浮层抢屏不是用户放弃变量填窗，
   * 清掉会让「已点动作、正等回填」的填窗选择静默消失——显式关闭路径（`close()`）才连它一起丢弃。
   */
  React.useEffect(() => {
    if (!open) return;
    if (claimed === "library") return;
    setOpen(false);
  }, [open, claimed]);

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

  /** 真正落草稿 + 上报用量（上报不阻塞 UI，但失败必须可见）。 */
  const apply = (prompt: Prompt, body: string, mode: InsertMode): void => {
    const next = composeDraft(draft, body, mode);
    inputActions.setDraft(next.draft);
    if (next.send) inputActions.submit();
    close();
    void api.recordUsage(prompt.id).catch((err: unknown) => {
      console.warn("[prompt-enhancer] " + t("error.use"), err);
      const reason = err instanceof Error ? err.message : String(err);
      // 宿主 `POST /prompts/:id/use` 对已删除的提示词回 404「提示词不存在」。
      if (reason.includes("不存在")) {
        setPrompts((prev) => (prev === null ? prev : prev.filter((item) => item.id !== prompt.id)));
        setNotice((prev) => ({ text: t("error.noPrompt"), seq: (prev?.seq ?? 0) + 1 }));
      }
    });
  };

  /** 有变量先填变量，填完再走 apply。 */
  const choose = (prompt: Prompt, mode: InsertMode): void => {
    if (needsValues(prompt.body)) setPending({ prompt, mode });
    else apply(prompt, prompt.body, mode);
  };

  if (!settings.showComposerButton) return null;

  return (
    <span
      ref={rootRef}
      style={WRAP}
      // T5 活体验收的**单源读数**（T1 的判定表判据）：本行是 composer 工具行里常驻的根节点，
      // 逐帧读它即可知道「此刻谁占屏」，不必从三处几何反推。照 P6 的 data-prompt-enhancer-manager /
      // -confirm 口径：声明式渲染，不是 DOM 注入（零 DOM 写入/零 querySelector）。
      data-prompt-enhancer-claim={claimed}
    >
      <button
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
        {t("button.title")}
      </button>
      {/* 沉淀入口 B：选中聊天文字浮出的「存为提示词」（不新增座位：渲染在本组件根节点内）。 */}
      <SelectionAddPrompt
        enabled={settings.selectionAddEnabled}
        rootRef={rootRef}
        label={t("selection.save")}
        onSave={saveSelection}
      />
      {notice !== null && (
        <span role="status" aria-live="polite" style={NOTICE}>
          {notice.text}
        </span>
      )}
      {panelOpen && pending !== null && (
        <span style={ANCHOR}>
          <TemplateVariablesDialog
            body={pending.prompt.body}
            t={t}
            onCancel={() => setPending(null)}
            onFilled={(filled) => apply(pending.prompt, filled, pending.mode)}
          />
        </span>
      )}
      {panelOpen && pending === null && (
        <span style={ANCHOR}>
          <span role="dialog" aria-label={t("list.title")} style={PANEL}>
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
            {loadError === null && prompts !== null && prompts.length > 0 && (
              <span role="list" style={LIST}>
                {prompts.map((prompt) => (
                  <span key={prompt.id} role="listitem" aria-label={prompt.title} style={ROW}>
                    <span style={ROW_TEXT}>
                      <span style={ROW_TITLE}>{prompt.title}</span>
                      <span style={ROW_SUMMARY}>{promptSummary(prompt)}</span>
                      {(prompt.summary ?? "").trim() !== "" && (prompt.tags ?? []).length > 0 && (
                        <span style={TAGS}>
                          {(prompt.tags ?? []).map((tag) => (
                            <span key={tag} style={TAG}>
                              {tag}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                    <span style={ROW_ACTIONS}>
                      {ACTIONS.map(({ mode, label }) => (
                        <button
                          key={mode}
                          type="button"
                          style={ACTION_BUTTON}
                          title={`${t(label)} ${prompt.title}`}
                          aria-label={`${t(label)} ${prompt.title}`}
                          onClick={() => choose(prompt, mode)}
                        >
                          {t(label)}
                        </button>
                      ))}
                    </span>
                  </span>
                ))}
              </span>
            )}
          </span>
        </span>
      )}
    </span>
  );
}

const WRAP: React.CSSProperties = {
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const BUTTON: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
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

/** 列表容器：设计上限 320，超出在卡内滚动。 */
const PANEL: React.CSSProperties = {
  ...overlayBase,
  display: "flex",
  flexDirection: "column",
  gap: 6,
  width: 320,
  maxHeight: 320,
  overflowY: "auto",
  padding: 8,
  fontSize: 12,
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
  flex: "0 0 auto",
};

const HEADER: React.CSSProperties = { color: TOKEN.muted, fontSize: 11, fontWeight: 600 };

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
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  padding: "6px 2px",
  borderTop: `1px solid ${TOKEN.border}`,
};

const ROW_TEXT: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  flex: "1 1 auto",
  minWidth: 0,
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

const ROW_ACTIONS: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flex: "0 0 auto",
  gap: 4,
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
