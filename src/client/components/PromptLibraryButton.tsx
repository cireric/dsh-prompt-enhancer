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
import { openManager, pushCapture } from "../utils/ui-state.ts";
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

  const close = (): void => {
    setOpen(false);
    setPending(null);
  };

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
        aria-expanded={open}
        onClick={() => {
          if (open) close();
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
      {open && pending !== null && (
        <span style={ANCHOR}>
          <TemplateVariablesDialog
            body={pending.prompt.body}
            t={t}
            onCancel={() => setPending(null)}
            onFilled={(filled) => apply(pending.prompt, filled, pending.mode)}
          />
        </span>
      )}
      {open && pending === null && (
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
