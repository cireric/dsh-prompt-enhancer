/**
 * 输入框旁「AI 优化」按钮：把点击那一刻的草稿快照交给宿主 `/ai/polish` 润色，
 * 在结果面板里对比原文/优化稿后定稿；面板里还能把**同一份快照**交给 `/ai/refine`
 * 做一键完善，并把完善稿「存入词库」（先存原文、再写回完善稿两步）。
 *
 * 注册在 `conversation.input.left`（order 11，紧跟 P4 的词库按钮）；props 由
 * `PropsRuntime`（session 标准 props 已内含 `useInput` / `inputActions`）与
 * `PropsLocale` 组成。
 *
 * 副作用只走官方动作面：读草稿 `useInput`，写草稿 `inputActions.setDraft`（规格 §7.2）；
 * 落库走 `capture.ts#createFromCapture`（R31：与其它沉淀入口同一入口，故 §4.4 的淘汰二次确认
 * 同样覆盖这里，不再有「AI 面板静默物理删除」的口子），写回只调 `api.updatePrompt`
 * （`aiWriteBack` 是 §4.4 的唯一写回缝），
 * `api.rollbackPrompt` 已随切换入口一并迁往管理面板详情页（§13.8 决定二）；
 * 不改宿主路由、不直接写 `sourceBody`。落库入参、是否需要写回、能否切换一律交给任务 1 的纯函数
 * （`ai-flow.ts#libraryCreateInput` / `#needsWriteBack` / `#canToggle`），组件不重复判定；
 * 「AI 是否可用」「是否保留 {{变量}}」同理（`ai-flow.ts#aiErrorKey` / `#keepVariablesFor`）。
 * 超时由 `api.polishPrompt` / `api.refinePrompt` 内部的 120s signal 负责，本组件不传也不设超时。
 */
import * as React from "react";
import type { PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import { DEFAULT_SETTINGS, type PluginSettings, type Prompt } from "../../types.ts";
import { aiErrorKey, canToggle, keepVariablesFor, libraryCreateInput, needsWriteBack } from "../utils/ai-flow.ts";
import { api, type AiRefineResult, type AiSelectable } from "../utils/api.ts";
import { createFromCapture, type CaptureOutcome } from "../utils/capture.ts";
import type { PromptEnhancerKey } from "../utils/i18n.ts";
import { TOKEN, overlayBase } from "../utils/theme.ts";

/** 输入框旁「AI 优化」按钮。 */
export type AIPolishButtonProps =
  PropsRuntime<"conversation.input.left"> & PropsLocale<"prompt-enhancer">;

/**
 * 面板状态机。三条主线各自成型，`refining` 失败退回 `done`（面板内加一行错误），
 * `error` 是润色失败的唯一出口：
 *   - 润色：polishing → done / error
 *   - 完善：refining → refined（面内是 AI 标题/标签/摘要 + 可编辑完善稿）
 *   - 存库：saving → saved / saveFailed / writeBackFailed
 * 注意面板里的 pill 对比（`done` 态）只是**同一份结果的两种样子**，不是库侧的版本切换：
 * 规格 §13.8 决定二把「原文 ↔ 优化稿」的并排对比与 `rollbackPrompt` swap 迁到管理面板详情页
 * （`PromptManagerModal`），故 `saved` 态只剩「已存入词库」+ **指向详情页的提示**，不再有切换按钮。
 */
type Status =
  | "idle"
  | "polishing"
  | "done"
  | "error"
  | "refining"
  | "refined"
  | "saving"
  | "saved"
  | "saveFailed"
  | "writeBackFailed";

/** 「已复制」的回退时长（与 P4 notice 同款：自动消失，不打断输入）。 */
const COPIED_MS = 2000;

/** `saved` 态的 body 预览上限：截断后配合 `overflowWrap:anywhere`，让用户看见切换真的换了版本。 */
const PREVIEW_MAX = 120;

/** 长正文截断成一行预览（不改变正文，只影响展示）。 */
function previewText(body: string): string {
  return body.length > PREVIEW_MAX ? body.slice(0, PREVIEW_MAX) + "…" : body;
}

/** 失败原因给人看的那一行：Error 自带可读 message，其余 String()。 */
function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

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
  /** 点击那一刻的草稿快照（D-P5-5）：「原文」永远是它，润色与完善都用它当输入。 */
  const [original, setOriginal] = React.useState("");
  const [polished, setPolished] = React.useState("");
  const [showOriginal, setShowOriginal] = React.useState(false);
  /** 一键完善的 AI 产出（标题/标签/摘要 + 正文）；正文可编辑，存库与落草稿都取它。 */
  const [refined, setRefined] = React.useState<AiRefineResult | null>(null);
  /** 存库后的本地记录：create 之后是它，写回/回滚各用返回值整条替换。 */
  const [saved, setSaved] = React.useState<Prompt | null>(null);
  /** 本次 create 触发了超限淘汰（二次确认归 P6，本任务只做可见性）。 */
  const [evicted, setEvicted] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [errorKey, setErrorKey] = React.useState<PromptEnhancerKey | null>(null);
  /** 一键完善的失败：只作 `done` 面板内一行，不推翻已有润色结果。 */
  const [refineErrorKey, setRefineErrorKey] = React.useState<PromptEnhancerKey | null>(null);
  const [copied, setCopied] = React.useState(false);
  const rootRef = React.useRef<HTMLSpanElement | null>(null);
  /** 可用性探测缓存（D-P5-7）：null = 未探测；组件重挂载才重探，失败不落缓存。 */
  const providersRef = React.useRef<AiSelectable[] | null>(null);
  /** 调用闸门：ref 同步生效（state 的 disabled 要等渲染），覆盖「探测 → 润色/完善/存库/切换」整段。 */
  const busyRef = React.useRef(false);
  /** 卸载守卫（P4 惯例）：异步回调不再 setState；重挂载时复位，避免 StrictMode 双挂后永久失活。 */
  const aliveRef = React.useRef(true);

  React.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

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

  /**
   * 面板整体收起：状态、两份文本、完善结果、库记录、三类错误、复制提示一并归零
   * （探测缓存刻意保留）。**所有**关闭路径（关闭按钮 / 外面 click / 应用后）都走这里，
   * 任何半清空都会让切换与预览读到 stale 记录。
   */
  const close = (): void => {
    setStatus("idle");
    setOriginal("");
    setPolished("");
    setShowOriginal(false);
    setRefined(null);
    setSaved(null);
    setEvicted(false);
    setSaveError(null);
    setErrorKey(null);
    setRefineErrorKey(null);
    setCopied(false);
  };

  // 点浮层外收起。宿主标准 props 没有「点外面关」的座位；官方 ui-commands 的
  // PopupSelectView 同样用 document 捕获阶段的 pointerdown（纯监听，不改宿主 DOM）。
  // 只在面板「已定型」（有可停留的结果）时挂：调用/存库中关面板会让回来的结果无处安放。
  const settled =
    status === "done" ||
    status === "error" ||
    status === "refined" ||
    status === "saved" ||
    status === "saveFailed" ||
    status === "writeBackFailed";
  React.useEffect(() => {
    if (!settled) return;
    const onPointerDown = (ev: PointerEvent): void => {
      const root = rootRef.current;
      if (root !== null && ev.target instanceof Node && root.contains(ev.target)) return;
      close();
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

  /**
   * 润色主线：点击那一刻的草稿快照 → 探测 → 调用 → 结果/错误。
   *
   * 重入闸门覆盖**整段**（含探测期）：`busyRef` 在第一个 await 之前同步置位
   * （state 的 disabled 要等渲染，ref 不用），状态也在同一拍切到 `polishing`，
   * 因此探测期间按钮已 disabled、aria-busy、状态行可见——双击不会重发 GET，
   * 也不会让两个 run 去争同一个 LLM 锁。
   */
  const run = (snapshot: string): void => {
    if (busyRef.current) return;
    busyRef.current = true;
    setErrorKey(null);
    setRefineErrorKey(null);
    setOriginal(snapshot);
    setShowOriginal(false);
    setCopied(false);
    setStatus("polishing");
    void (async () => {
      try {
        let providers = providersRef.current;
        if (providers === null) {
          try {
            providers = await api.listAiProviders();
          } catch (err) {
            // 探测失败不落缓存：可能是瞬时故障，下次点击值得重试（闸门由 finally 打开）。
            console.warn("[prompt-enhancer] AI 可用性探测失败", err);
            if (!aliveRef.current) return;
            setErrorKey(aiErrorKey(err));
            setStatus("error");
            return;
          }
          providersRef.current = providers;
        }
        if (providers.length === 0) {
          // 未配置任何可用模型：只出这一行，不调 AI（验收 13）。
          if (!aliveRef.current) return;
          setErrorKey("ai.unavailable");
          setStatus("error");
          return;
        }
        try {
          const result = await api.polishPrompt(snapshot, { keepVariables: keepVariablesFor(snapshot) });
          if (!aliveRef.current) return;
          setPolished(result.polished);
          setStatus("done");
        } catch (err) {
          console.warn("[prompt-enhancer] AI 优化失败", err);
          if (!aliveRef.current) return;
          setErrorKey(aiErrorKey(err));
          setStatus("error");
        }
      } finally {
        // 三条出口（探测失败 / 不可用 / 调用成功或失败）都必须开闸，否则一次失败就再也点不动。
        busyRef.current = false;
      }
    })();
  };

  /**
   * 一键完善：输入是**点击时的草稿快照** `original`（与润色一致，不是当前草稿）。
   * 失败只退回去 `done` 加一行错误——已有的润色结果是有效产物，不为一次完善失败而丢弃
   * （润色本身要等最长 2 分钟，丢掉等于让用户重来）。
   */
  const refine = (): void => {
    if (busyRef.current) return;
    busyRef.current = true;
    setRefineErrorKey(null);
    setSaveError(null);
    setStatus("refining");
    void (async () => {
      try {
        const result = await api.refinePrompt(original);
        if (!aliveRef.current) return;
        setRefined(result);
        setStatus("refined");
      } catch (err) {
        console.warn("[prompt-enhancer] 一键完善失败", err);
        if (!aliveRef.current) return;
        setRefineErrorKey(aiErrorKey(err));
        setStatus("done");
      } finally {
        busyRef.current = false;
      }
    })();
  };

  /**
   * 存入词库（严格两步，每步失败都有可见后果）：
   *   1. `createPrompt` 落**原文**（`libraryCreateInput` 的 body 恒为 original）——库里不留半成品；
   *   2. 完善稿 ≠ 原文时 `updatePrompt(id, { body: 完善稿, aiWriteBack: true })` 触发宿主回填 `sourceBody`。
   * 第 2 步失败**必须明说**：库里那条的 body 是原文（不是损坏数据），但优化稿没写回，
   * 面内给 `ai.writeBackFail` + 原因 + 「重试写回」，不得假装已存好。
   * 完善稿 ≡ 原文则不写回（宿主不回填 `sourceBody`），界面按 `canToggle` 显示 `ai.sameAsOriginal`。
   */
  const save = (): void => {
    if (busyRef.current || refined === null) return;
    busyRef.current = true;
    setSaveError(null);
    setStatus("saving");
    void (async () => {
      try {
        let outcome: CaptureOutcome;
        try {
          outcome = await createFromCapture(libraryCreateInput(refined, original));
        } catch (err) {
          console.warn("[prompt-enhancer] 存入词库失败", err);
          if (!aliveRef.current) return;
          setSaveError(reasonOf(err));
          setStatus("saveFailed");
          return;
        }
        if (!aliveRef.current) return;
        // 淘汰二次确认里被取消（R31 + §4.4）：**第 2 步不进入**（没有 id 可写回），
        // 静静退回完善态——取消不是失败，不得走 saveFailed。
        if (!outcome.ok) {
          setStatus("refined");
          return;
        }
        setSaved(outcome.prompt);
        setEvicted(outcome.evicted.length > 0);
        if (!needsWriteBack(refined.body, original)) {
          setStatus("saved");
          return;
        }
        try {
          const updated = await api.updatePrompt(outcome.prompt.id, { body: refined.body, aiWriteBack: true });
          if (!aliveRef.current) return;
          setSaved(updated);
          setStatus("saved");
        } catch (err) {
          console.warn("[prompt-enhancer] 优化稿写回失败（原文已入库）", err);
          if (!aliveRef.current) return;
          setSaveError(reasonOf(err));
          setStatus("writeBackFailed");
        }
      } finally {
        busyRef.current = false;
      }
    })();
  };

  /** 写回重试：只重跑第 2 步（记录 id 来自第 1 步的返回值，仍在 `saved` 里）。 */
  const retryWriteBack = (): void => {
    if (busyRef.current || saved === null || refined === null) return;
    busyRef.current = true;
    setSaveError(null);
    setStatus("saving");
    void (async () => {
      try {
        const updated = await api.updatePrompt(saved.id, { body: refined.body, aiWriteBack: true });
        if (!aliveRef.current) return;
        setSaved(updated);
        setStatus("saved");
      } catch (err) {
        console.warn("[prompt-enhancer] 优化稿写回重试失败", err);
        if (!aliveRef.current) return;
        setSaveError(reasonOf(err));
        setStatus("writeBackFailed");
      } finally {
        busyRef.current = false;
      }
    })();
  };

  const copy = (text: string): void => {
    void (async () => {
      try {
        await navigator.clipboard.writeText(text);
        if (aliveRef.current) setCopied(true);
      } catch (err) {
        console.warn("[prompt-enhancer] 复制失败", err);
      }
    })();
  };

  /** 「应用到输入框」：覆盖**当前**草稿（原文只是快照，不回写）；完善稿可能含 `{{变量}}`，交给 P4 既有行为。 */
  const apply = (text: string): void => {
    inputActions.setDraft(text);
    close();
  };

  if (settings === null || settings.showAIPolishButton === false) return null;

  // 调用/完善/存库三态同属「忙」：按钮置灰、aria-busy、状态行可见，重入由 busyRef 兜底。
  // 提示文案按阶段取值：refining 是另一次 AI 调用、saving 是本地写库，都不该沿用
  // polishing 那句「正在调用 AI…（最长约 2 分钟）」。
  const busyKey: PromptEnhancerKey | null =
    status === "polishing"
      ? "ai.polishing"
      : status === "refining"
        ? "ai.refining"
        : status === "saving"
          ? "ai.saving"
          : null;
  const empty = draft.trim() === "";
  const hint = busyKey !== null ? t(busyKey) : empty ? t("ai.empty") : t("ai.tip");
  /** 淘汰提示：写回失败时也必须可见（那时 status 不是 saved，但淘汰已经真实发生）。 */
  const evictedNotice = evicted ? <span style={MUTED}>{t("ai.evicted")}</span> : null;
  const showRefined = status === "refined" || status === "saveFailed";
  const dialogLabel =
    status === "done"
      ? t("ai.result")
      : showRefined || status === "saving" || status === "writeBackFailed"
        ? t("ai.refined")
        : status === "saved"
          ? t("ai.saved")
          : t("ai.button");

  return (
    <span ref={rootRef} style={WRAP}>
      <button
        type="button"
        style={{ ...BUTTON, cursor: empty || busyKey !== null ? "default" : "pointer", opacity: empty || busyKey !== null ? 0.6 : 1 }}
        title={hint}
        aria-label={t("ai.button")}
        aria-busy={busyKey !== null}
        disabled={empty || busyKey !== null}
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
          <span role="dialog" aria-label={dialogLabel} style={PANEL}>
            {busyKey !== null && (
              <span role="status" aria-live="polite" style={MUTED}>
                {t(busyKey)}
              </span>
            )}
            {status === "error" && (
              <>
                <span role="status" aria-live="polite" style={MUTED}>
                  {errorKey === null ? t("ai.fail") : t(errorKey)}
                </span>
                <span style={ACTIONS}>
                  <button type="button" style={PANEL_BUTTON} onClick={close}>
                    {t("ai.close")}
                  </button>
                </span>
              </>
            )}
            {status === "done" && (
              <>
                <span style={HEADER}>{t("ai.result")}</span>
                {refineErrorKey !== null && (
                  <span role="status" aria-live="polite" style={MUTED}>
                    {t(refineErrorKey)}
                  </span>
                )}
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
                  <button type="button" style={PANEL_BUTTON} onClick={refine}>
                    {t("ai.refine")}
                  </button>
                  <button type="button" style={PANEL_BUTTON} onClick={() => copy(polished)}>
                    {copied ? t("ai.copied") : t("ai.copy")}
                  </button>
                  <button type="button" style={PANEL_BUTTON} onClick={close}>
                    {t("ai.close")}
                  </button>
                  <button
                    type="button"
                    style={{ ...PANEL_BUTTON, borderColor: TOKEN.accent, color: TOKEN.accent }}
                    onClick={() => apply(polished)}
                  >
                    {t("ai.apply")}
                  </button>
                </span>
              </>
            )}
            {showRefined && refined !== null && (
              <>
                <span style={HEADER}>{t("ai.refined")}</span>
                {status === "saveFailed" && (
                  <span role="alert" style={ERROR}>
                    <span>{t("ai.saveFail")}</span>
                    {saveError !== null && (
                      <span style={ERROR_DETAIL} title={saveError}>
                        {saveError}
                      </span>
                    )}
                  </span>
                )}
                <span style={META}>
                  <span style={META_KEY}>{t("ai.fieldTitle")}</span>
                  <span style={META_VALUE}>{refined.title}</span>
                  <span style={META_KEY}>{t("ai.fieldTags")}</span>
                  <span style={META_VALUE}>{refined.tags.join(" / ")}</span>
                  <span style={META_KEY}>{t("ai.fieldSummary")}</span>
                  <span style={META_VALUE}>{refined.summary}</span>
                </span>
                <textarea
                  value={refined.body}
                  rows={7}
                  aria-label={t("ai.refined")}
                  onChange={(ev) => setRefined({ ...refined, body: ev.target.value })}
                  style={TEXTAREA}
                />
                <span style={ACTIONS}>
                  <button type="button" style={PANEL_BUTTON} onClick={save}>
                    {t("ai.save")}
                  </button>
                  <button type="button" style={PANEL_BUTTON} onClick={() => copy(refined.body)}>
                    {copied ? t("ai.copied") : t("ai.copy")}
                  </button>
                  <button type="button" style={PANEL_BUTTON} onClick={close}>
                    {t("ai.close")}
                  </button>
                  <button
                    type="button"
                    style={{ ...PANEL_BUTTON, borderColor: TOKEN.accent, color: TOKEN.accent }}
                    onClick={() => apply(refined.body)}
                  >
                    {t("ai.apply")}
                  </button>
                </span>
              </>
            )}
            {status === "writeBackFailed" && (
              <>
                <span role="alert" style={ERROR}>
                  <span>{t("ai.writeBackFail")}</span>
                  {saveError !== null && (
                    <span style={ERROR_DETAIL} title={saveError}>
                      {saveError}
                    </span>
                  )}
                </span>
                {evictedNotice}
                <span style={ACTIONS}>
                  <button type="button" style={PANEL_BUTTON} onClick={retryWriteBack}>
                    {t("ai.retryWriteBack")}
                  </button>
                  <button type="button" style={PANEL_BUTTON} onClick={close}>
                    {t("ai.close")}
                  </button>
                </span>
              </>
            )}
            {status === "saved" && saved !== null && (
              <>
                <span role="status" aria-live="polite" style={MUTED}>
                  {t("ai.saved")}
                </span>
                {evictedNotice}
                {/* §13.8 决定二：库侧的「原文 ↔ 优化稿」并排对比与切换已迁往管理面板详情页，
                    这里只留指向它的提示（验收 6 的切换能力由详情页承担）。 */}
                {canToggle(saved) ? (
                  <span style={MUTED}>{t("ai.toggleMoved")}</span>
                ) : (
                  <span style={MUTED}>{t("ai.sameAsOriginal")}</span>
                )}
                <span style={PREVIEW}>{previewText(saved.body)}</span>
                <span style={ACTIONS}>
                  <button type="button" style={PANEL_BUTTON} onClick={close}>
                    {t("ai.close")}
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

const ERROR: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  color: TOKEN.fg,
  fontSize: 11,
};

const ERROR_DETAIL: React.CSSProperties = { color: TOKEN.muted, overflowWrap: "anywhere" };

/** AI 标题/标签/摘要的只读展示：两列贴齐，值允许为空（P6 才给编辑面）。 */
const META: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  columnGap: 6,
  rowGap: 2,
  alignItems: "baseline",
};

const META_KEY: React.CSSProperties = { color: TOKEN.muted, fontSize: 11, whiteSpace: "nowrap" };

const META_VALUE: React.CSSProperties = { color: TOKEN.fg, fontSize: 11, overflowWrap: "anywhere" };

/** 当前 body 预览：截断 + 任意断行，长 URL / 无空格正文不撑破面板。 */
const PREVIEW: React.CSSProperties = {
  color: TOKEN.muted,
  fontSize: 11,
  overflowWrap: "anywhere",
  whiteSpace: "pre-wrap",
  maxHeight: 72,
  overflowY: "auto",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  padding: "4px 6px",
};

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
