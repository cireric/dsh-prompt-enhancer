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
import { DEFAULT_SETTINGS, type PluginSettings, type Prompt } from "../../types.ts";
import { api } from "../utils/api.ts";
import type { PromptEnhancerKey } from "../utils/i18n.ts";
import { composeDraft, promptSummary, type InsertMode } from "../utils/insert.ts";
import { needsValues } from "../utils/template.ts";
import { TOKEN, overlayBase } from "../utils/theme.ts";
import { openManager, pushCapture, shouldShowLibraryPanel, useHashSuggestVisible } from "../utils/ui-state.ts";
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
  /** null = 设置未就绪：先不渲染按钮，避免「本该隐藏却又闪一下」。 */
  const [settings, setSettings] = React.useState<PluginSettings | null>(null);
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
   * R55：面板此刻是否真的渲染 = 「用户打开了它」**且**「`#` 浮层没在屏上」（不变式走渲染门，
   * 见 `ui-state.ts#shouldShowLibraryPanel`）。两处渲染门与 `aria-expanded` **共用**它，
   * 避免「面板没渲染但 aria 说展开了」。下方订阅边沿（`hashVisible` 上升沿那条）是**互补**的一条：
   * 它把 `open` 也收回 false：按钮的「再点一次收起」由此自洽，而**浮层消失时面板不会自动重现**
   * （R58 ② 订正：这条 effect 是 `setOpen(false)`，恰恰**阻止**自动重现；用户须再点一次按钮）。
   */
  const panelOpen = shouldShowLibraryPanel({ open, hashSuggestVisible: hashVisible });
  // 设置只读一次；读失败退回默认值（按钮照常可用），原因留在 console。
  React.useEffect(() => {
    let alive = true;
    api.getSettings().then(
      (value) => {
        if (alive) setSettings(value);
      },
      (err: unknown) => {
        console.warn("[prompt-enhancer] 设置读取失败，本次按默认设置显示按钮", err);
        if (alive) setSettings(DEFAULT_SETTINGS);
      },
    );
    return () => {
      alive = false;
    };
  }, []);

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
   * 选择一起丢弃。R54：浮层抢屏的那条收起路径走下面信号边沿的 `setOpen(false)`，**不**经过这里，
   * 故「已点动作、正等回填」的选择不会被静默丢弃。
   */
  const close = (): void => {
    setOpen(false);
    setPending(null);
  };

  /**
   * R53：`#` 候选浮层**此刻真实可见**时收起词库面板（R47 只覆盖「点词库按钮」这一个指针入口，
   * 反向入口——输入框仍持焦点时敲 `#`、或浮层在同一令牌内被改写查询词后重现——会让两浮层同屏）。
   * R59 起「点词库按钮」这一入口的判定在**动作侧**（按钮 onClick 的 `if (hashVisible) return;`）：
   * 它让本组件不再产生「open 为真而面板不可见」的状态，本 effect 仍是把 open 收回 false 的那条。
   *
   * 订阅的是浮层自己发布的可见性（取代 R49 的 `hashOpen` 边沿：**一个门而不是两个**），
   * 且只观察 **false→true 边沿**（effect 依赖该布尔值，同值不重跑）：
   * - 草稿里本就有 `#令牌` 时点词库按钮：浮层在自己的捕获阶段 pointerdown 里先收起自己 →
   *   信号 true→**false**（下降沿）→ 面板打开时没有上升沿，**不得**被当场收掉（P4 既有行为）；
   * - 面板开着、草稿无令牌时敲出 `#`：信号 false→**true**（上升沿）→ 面板收起（R49 的效果保住）；
   * - 浮层已被收起（令牌仍在）时：信号恒 false，库侧无需关，也不存在上升沿。
   *
   * R55 起这条是**互补**的：同屏已由渲染门 `panelOpen = open && !hashVisible` 在结构上挡死，
   * 本 effect 负责把 `open` 也收回 false。R58 ②（措辞订正）：收回 `open` 的后果恰恰是**浮层消失时
   * 面板不会自动重现**——用户须再点一次按钮（这正是「一个门、一个派生值」的自洽形态，不是漏做）。
   *
   * R54：这里**只关面板、不清 pending**——浮层抢屏不是用户放弃变量填窗，清掉会让「已点动作、
   * 正等回填」的填窗选择静默消失。显式关闭路径（`close()`：点按钮/点浮层外/取消/已插入）才连
   * `pending` 一起丢弃。
   */
  React.useEffect(() => {
    if (!hashVisible) return;
    setOpen(false);
  }, [hashVisible]);

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

  if (settings === null || !settings.showComposerButton) return null;

  return (
    <span ref={rootRef} style={WRAP}>
      <button
        type="button"
        style={BUTTON}
        title={t("button.tip")}
        aria-label={t("button.tip")}
        aria-haspopup="dialog"
        aria-expanded={panelOpen}
        onClick={() => {
          // R59（F-1 / I-3）：**动作侧闸门**，消除「open 为真而面板不可见」这个状态本身。
          //
          // 必须在最前：键盘 Enter/Space 激活这一拍**没有 pointerdown**（R57 路径），此时
          // `hashVisible` 仍为 true——若这里不拦，Enter 就会置位一个渲染不出来的 open；
          // 随后用户改用鼠标点同一按钮 → 那时 `panelOpen` 已随 pointerdown 转真 → 走 close()，
          // 一次点击既没开面板、又**连带清掉 pending**（绕过 R54 对「已点动作、正等回填」的保护）。
          // 这里直接 return，连 open 都不置位，背离状态无从产生。
          //
          // 鼠标路径不经此分支：按钮上的 pointerdown 已先让浮层收起 → hashVisible=false →
          // panelOpen===open===false → 下面 setOpen(true) 正常打开。
          //
          // 不判 open 的原因（控制者原修法已被评审者否掉）：pointerdown 收起浮层后 React 会在
          // click 派发**之前**重渲染，onClick 拿到的是新闭包——两种判定在鼠标路径下都会读到「真」。
          if (hashVisible) return;
          if (panelOpen) close();
          else setOpen(true);
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
