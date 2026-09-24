/**
 * 输入框旁「AI 优化」按钮：把当前草稿交给宿主 `/ai/polish`，在结果面板里
 * 对比原文/优化稿后再写入输入框。
 *
 * 注册在 `conversation.input.left`（order 11，紧跟 P4 的词库按钮）；props 由
 * `PropsRuntime`（session 标准 props 已内含 `useInput` / `inputActions`）与
 * `PropsLocale` 组成。
 *
 * 副作用只走官方动作面：读草稿 `useInput`，写草稿 `inputActions.setDraft`（规格 §7.2）。
 * 「AI 是否可用」与「是否保留 {{变量}}」一律复用任务 1 的纯函数
 * （`ai-flow.ts#keepVariablesFor` / `#aiErrorKey`），组件不重复判定；超时由
 * `api.polishPrompt` 内部的 120s signal 负责，本组件不传也不设超时。
 */
import * as React from "react";
import type { PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import { DEFAULT_SETTINGS, type PluginSettings } from "../../types.ts";
import { aiErrorKey, keepVariablesFor } from "../utils/ai-flow.ts";
import { api, type AiSelectable } from "../utils/api.ts";
import type { PromptEnhancerKey } from "../utils/i18n.ts";
import { TOKEN, overlayBase } from "../utils/theme.ts";

/** 输入框旁「AI 优化」按钮。 */
export type AIPolishButtonProps =
  PropsRuntime<"conversation.input.left"> & PropsLocale<"prompt-enhancer">;

/**
 * 面板状态机。任务 3 在 `done` 的动作区追加「一键完善 / 存入词库」，并恢复
 * 「原文 ↔ 优化稿」双向切换；本任务只走润色主线。
 */
type Status = "idle" | "polishing" | "done" | "error";

/** 「已复制」的回退时长（与 P4 notice 同款：自动消失，不打断输入）。 */
const COPIED_MS = 2000;

/** 润色星标：内联四角星，不引任何图标依赖（不引 ui-primitives）。 */
function SparkleIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={ICON}>
      <path
        d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AIPolishButton({ t, useInput, inputActions }: AIPolishButtonProps): React.ReactElement | null {
  const draft = useInput((s) => s.draft);
  /** null = 设置未就绪：先不渲染按钮，避免「本该隐藏却又闪一下」。 */
  const [settings, setSettings] = React.useState<PluginSettings | null>(null);
  const [status, setStatus] = React.useState<Status>("idle");
  /** 点击那一刻的草稿快照（D-P5-5）：「原文」永远是它，不随输入框继续变。 */
  const [original, setOriginal] = React.useState("");
  const [polished, setPolished] = React.useState("");
  const [showOriginal, setShowOriginal] = React.useState(false);
  const [errorKey, setErrorKey] = React.useState<PromptEnhancerKey | null>(null);
  const [copied, setCopied] = React.useState(false);
  const rootRef = React.useRef<HTMLSpanElement | null>(null);
  /** 可用性探测缓存（D-P5-7）：null = 未探测；组件重挂载才重探，失败不落缓存。 */
  const providersRef = React.useRef<AiSelectable[] | null>(null);

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

  // 点浮层外收起。宿主标准 props 没有「点外面关」的座位；官方 ui-commands 的
  // PopupSelectView 同样用 document 捕获阶段的 pointerdown（纯监听，不改宿主 DOM）。
  // 只在面板「已定型」（有心跳的结果或错误）时挂：调用中关面板会让回来的结果无处安放。
  const settled = status === "done" || status === "error";
  React.useEffect(() => {
    if (!settled) return;
    const onPointerDown = (ev: PointerEvent): void => {
      const root = rootRef.current;
      if (root !== null && ev.target instanceof Node && root.contains(ev.target)) return;
      setStatus("idle");
      setErrorKey(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [settled]);

  // 已复制提示自动消失。
  React.useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), COPIED_MS);
    return () => {
      window.clearTimeout(id);
    };
  }, [copied]);

  /** 面板整体收起：状态、两份文本、错误、复制提示一并归零（探测缓存刻意保留）。 */
  const close = (): void => {
    setStatus("idle");
    setOriginal("");
    setPolished("");
    setShowOriginal(false);
    setErrorKey(null);
    setCopied(false);
  };

  /** 点击那一刻的草稿快照 → 探测 → 调用 → 结果/错误。 */
  const run = (snapshot: string): void => {
    void (async () => {
      let providers = providersRef.current;
      if (providers === null) {
        try {
          providers = await api.listAiProviders();
        } catch (err) {
          // 探测失败不落缓存：可能是瞬时故障，下次点击值得重试。
          console.warn("[prompt-enhancer] AI 可用性探测失败", err);
          setErrorKey(aiErrorKey(err));
          setStatus("error");
          return;
        }
        providersRef.current = providers;
      }
      if (providers.length === 0) {
        // 未配置任何可用模型：只出这一行，不调 AI（验收 13）。
        setErrorKey("ai.unavailable");
        setStatus("error");
        return;
      }
      setErrorKey(null);
      setOriginal(snapshot);
      setShowOriginal(false);
      setCopied(false);
      setStatus("polishing");
      try {
        const result = await api.polishPrompt(snapshot, { keepVariables: keepVariablesFor(snapshot) });
        setPolished(result.polished);
        setStatus("done");
      } catch (err) {
        console.warn("[prompt-enhancer] AI 优化失败", err);
        setErrorKey(aiErrorKey(err));
        setStatus("error");
      }
    })();
  };

  const polishing = status === "polishing";
  const empty = draft.trim() === "";
  const hint = polishing ? t("ai.polishing") : empty ? t("ai.empty") : t("ai.tip");

  const copy = (): void => {
    const text = polished;
    void (async () => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
      } catch (err) {
        console.warn("[prompt-enhancer] 复制失败", err);
      }
    })();
  };

  /** 「应用到输入框」：覆盖**当前**草稿（原文只是快照，不回写）。 */
  const applyResult = (): void => {
    inputActions.setDraft(polished);
    close();
  };

  if (settings === null || settings.showAIPolishButton === false) return null;

  return (
    <span ref={rootRef} style={WRAP}>
      <button
        type="button"
        style={{ ...BUTTON, cursor: empty || polishing ? "default" : "pointer", opacity: empty || polishing ? 0.6 : 1 }}
        title={hint}
        aria-label={t("ai.button")}
        aria-busy={polishing}
        disabled={empty || polishing}
        onClick={() => {
          if (empty) return;
          run(draft);
        }}
      >
        <SparkleIcon />
        {settings.aiPolishButtonIconOnly === false && <span>{t("ai.button")}</span>}
      </button>
      {status !== "idle" && (
        <span style={ANCHOR}>
          <span role="dialog" aria-label={status === "done" ? t("ai.result") : t("ai.button")} style={PANEL}>
            {polishing && (
              <span role="status" aria-live="polite" style={MUTED}>
                {t("ai.polishing")}
              </span>
            )}
            {status === "error" && errorKey !== null && (
              <span role="status" aria-live="polite" style={MUTED}>
                {t(errorKey)}
              </span>
            )}
            {status === "done" && (
              <>
                <span style={HEADER}>{t("ai.result")}</span>
                <span style={PILLS}>
                  <button
                    type="button"
                    style={pill(!showOriginal)}
                    aria-pressed={!showOriginal}
                    onClick={() => setShowOriginal(false)}
                  >
                    {t("ai.polished")}
                  </button>
                  <button
                    type="button"
                    style={pill(showOriginal)}
                    aria-pressed={showOriginal}
                    onClick={() => setShowOriginal(true)}
                  >
                    {t("ai.original")}
                  </button>
                </span>
                <textarea
                  value={showOriginal ? original : polished}
                  readOnly={showOriginal}
                  rows={7}
                  aria-label={t(showOriginal ? "ai.original" : "ai.polished")}
                  onChange={(ev) => setPolished(ev.target.value)}
                  style={{ ...TEXTAREA, opacity: showOriginal ? 0.75 : 1 }}
                />
                <span style={ACTIONS}>
                  <button type="button" style={PANEL_BUTTON} onClick={copy}>
                    {copied ? t("ai.copied") : t("ai.copy")}
                  </button>
                  <button type="button" style={PANEL_BUTTON} onClick={close}>
                    {t("ai.close")}
                  </button>
                  <button type="button" style={{ ...PANEL_BUTTON, borderColor: TOKEN.accent, color: TOKEN.accent }} onClick={applyResult}>
                    {t("ai.apply")}
                  </button>
                </span>
              </>
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

const ICON: React.CSSProperties = { display: "block", flex: "0 0 auto" };

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

/** 浮层落点：贴按钮上沿（同 P4 词库面板）；zIndex 31 压在词库面板（30）之上。 */
const ANCHOR: React.CSSProperties = {
  position: "absolute",
  bottom: "calc(100% + 6px)",
  left: 0,
  zIndex: 31,
  maxWidth: "calc(100vw - 24px)",
};

/** 面板容器：设计上限 380，超出在卡内滚动。 */
const PANEL: React.CSSProperties = {
  ...overlayBase,
  display: "flex",
  flexDirection: "column",
  gap: 6,
  width: 380,
  maxHeight: 420,
  overflowY: "auto",
  padding: 8,
  fontSize: 12,
};

const HEADER: React.CSSProperties = { color: TOKEN.muted, fontSize: 11, fontWeight: 600 };

const MUTED: React.CSSProperties = { color: TOKEN.muted, fontSize: 11, overflowWrap: "anywhere" };

const PILLS: React.CSSProperties = { display: "flex", gap: 4, alignItems: "center" };

/** 原文/优化稿切换 pill；选中态用 accent 描边。 */
const pill = (active: boolean): React.CSSProperties => ({
  padding: "1px 10px",
  fontSize: 11,
  lineHeight: "16px",
  color: active ? TOKEN.accent : TOKEN.muted,
  background: "transparent",
  border: `1px solid ${active ? TOKEN.accent : TOKEN.border}`,
  borderRadius: 999,
  cursor: "pointer",
});

const TEXTAREA: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  resize: "vertical",
  padding: "6px 8px",
  color: TOKEN.fg,
  background: "transparent",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  fontSize: 12,
  fontFamily: "inherit",
  outline: "none",
};

const ACTIONS: React.CSSProperties = { display: "flex", gap: 6, justifyContent: "flex-end" };

const PANEL_BUTTON: React.CSSProperties = {
  padding: "2px 8px",
  fontSize: 11,
  lineHeight: "16px",
  color: TOKEN.fg,
  background: "transparent",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  cursor: "pointer",
};
