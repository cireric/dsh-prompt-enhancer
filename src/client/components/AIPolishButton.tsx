/** Composer 的 AI 优化入口。每种模式都基于发起时的草稿快照。 */
import * as React from "react";
import type { PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import { canRender } from "../../overlay-claim.ts";
import type { Prompt, PromptCheckResult, TemplateVariable } from "../../types.ts";
import { PromptDraftForm } from "./PromptDraftForm.tsx";
import {
  confirmDraftApplication, createDraftSession, draftCheckIsStale, draftSuggestionFeedback, editDraftSession,
  generateDraft, prepareDraftGeneration, prepareDraftHandoff, requestDraftApplication,
  type DraftEdit, type DraftGeneration, type DraftReplacement, type DraftSession,
} from "../utils/draft-session.ts";
import {
  aiErrorKey,
  canToggle,
  composeRefinedBody,
  keepVariablesFor,
  libraryCreateInput,
  markAddedVariables,
  missingVariables,
  refinedBodySections,
  needsWriteBack,
  writeBackRefined,
} from "../utils/ai-flow.ts";
import { showsLabel } from "../utils/icon-only.ts";
import { TemplateVariableFields } from "./TemplateVariableFields.tsx";
import { TemplateVariablesDialog } from "./TemplateVariablesDialog.tsx";
import { needsValues, parseVariables, updateTemplateVariable } from "../utils/template.ts";
import { api, type AiRefineResult } from "../utils/api.ts";
import { notifyDataChanged } from "../utils/data-sync.ts";
import { useSettings } from "../utils/settings-store.ts";
import { createFromCapture, type CaptureOutcome } from "../utils/capture.ts";
import type { PromptEnhancerKey } from "../utils/i18n.ts";
import { seedRefinedDirection } from "../utils/refined-direction.ts";
import { TOKEN, TONE, overlayBase } from "../utils/theme.ts";
import { claimOverlayIfFree, releaseOverlay, useOverlayClaim } from "../utils/ui-state.ts";
import { reasonOf } from "../../err-text.ts";
import { useDismissOnOutside } from "../utils/dismiss-outside.ts";

/** 输入框旁「AI 优化」按钮。 */
export type AIPolishButtonProps =
  PropsRuntime<"conversation.input.left"> & PropsLocale<"prompt-enhancer">;

/**
 * 面板状态机。AI 请求失败进入 error，可返回模式选择：
 *   - 润色：polishing → done / error
 *   - 检查：checking → checked / error
 *   - 完善：refining → refined（面内是 AI 标题/标签/摘要 + 可编辑完善稿）
 *   - 存库：saving → saved / saveFailed / writeBackFailed
 * 注意面板里的 pill 对比（`done` 态）只是**同一份结果的两种样子**，不是库侧的版本切换：
 * 规格 §13.8 决定二把「原文 ↔ 优化稿」的并排对比与 `rollbackPrompt` swap 迁到管理面板详情页
 * （`PromptManagerModal`），故 `saved` 态只剩「已存入词库」+ **指向详情页的提示**，不再有切换按钮。
 */
type Status =
  | "idle"
  | "choose"
  | "polishing"
  | "done"
  | "checking"
  | "checked"
  | "draftingPrompt"
  | "searchingDraft"
  | "draftPrompt"
  | "error"
  | "refining"
  | "refined"
  | "saving"
  | "saved"
  | "saveFailed"
  | "writeBackFailed";

type OptimizeMode = "polish" | "check" | "template";

/** 「已复制」的回退时长（与 P4 notice 同款：自动消失，不打断输入）。 */
const COPIED_MS = 2000;

/** `saved` 态的 body 预览上限：截断后配合 `overflowWrap:anywhere`，让用户看见切换真的换了版本。 */
const PREVIEW_MAX = 120;

/** 长正文截断成一行预览（不改变正文，只影响展示）。 */
function previewText(body: string): string {
  return body.length > PREVIEW_MAX ? body.slice(0, PREVIEW_MAX) + "…" : body;
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
  /**
   * 设置改读**共享响应式 store**（P8 T1）：宿主 scope 每次已提交变更都推一次快照，按钮的显隐与
   * 形状随之即时生效——不再是「mount 时读一次」。无 scope 时 store 给默认值，且无未就绪的 null 态。
   */
  const settings = useSettings();
  const [status, setStatus] = React.useState<Status>("idle");
  const [mode, setMode] = React.useState<OptimizeMode>("polish");
  /** 点击那一刻的草稿快照（D-P5-5）：「原文」永远是它，润色与完善都用它当输入。 */
  const [original, setOriginal] = React.useState("");
  const [polished, setPolished] = React.useState("");
  const [composerCheck, setComposerCheck] = React.useState<PromptCheckResult | null>(null);
  const [draftSession, setDraftSession] = React.useState<DraftSession | null>(null);
  const [replacement, setReplacement] = React.useState<DraftReplacement | null>(null);
  const [resultView, setResultView] = React.useState<"final" | "edit" | "original">("final");
  const showOriginal = resultView === "original";
  /**
   * 本次调用**实际发出的**变量授权。`run()` 里算一次存这里，渲染期的提示文案读同一个值——
   * 不是渲染期重算的推断。理由：提示说「可能新增变量」而请求根本没授权（或反过来），是组件面
   * 唯一无人能自动发现的那类静默不一致（本仓库没有渲染测试通道）。
   */
  const [keepVars, setKeepVars] = React.useState(false);
  /** 一键完善的 AI 产出（标题/标签/摘要 + 正文）；正文可编辑，存库与落草稿都取它。 */
  const [refined, setRefined] = React.useState<AiRefineResult | null>(null);
  /** 存库后的本地记录：create 之后是它，写回/回滚各用返回值整条替换。 */
  const [saved, setSaved] = React.useState<Prompt | null>(null);
  /** 本次 create 触发了超限淘汰（二次确认归 P6，本任务只做可见性）。 */
  const [evicted, setEvicted] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [errorKey, setErrorKey] = React.useState<PromptEnhancerKey | null>(null);
  const [variables, setVariables] = React.useState<TemplateVariable[]>([]);
  const [selectedSuggestions, setSelectedSuggestions] = React.useState<number[]>([]);
  const [fillTarget, setFillTarget] = React.useState<string | null>(null);
  const [draftChanged, setDraftChanged] = React.useState(false);
  const refinedBody = refined ? composeRefinedBody(refined.body, refined.suggestions ?? [], selectedSuggestions) : "";
  const variableNames = parseVariables(refinedBody);
  const templateVariables = variables.filter(({ name }) => variableNames.includes(name));
  const resultBody = refined ? refinedBody : polished;
  const missing = missingVariables(original, resultBody);
  const [copied, setCopied] = React.useState(false);
  /** 复制失败：在**按钮文案**上可见（不占用面板的 error 视图——那会顶掉用户刚拿到的结果）。 */
  const [copyFailed, setCopyFailed] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  /** 调用闸门：ref 同步生效（state 的 disabled 要等渲染），覆盖「探测 → 润色/完善/存库/切换」整段。 */
  const busyRef = React.useRef(false);
  const requestRef = React.useRef<{ controller: AbortController; startedAt: number; returnTo: Status } | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0);
  /** 卸载守卫（P4 惯例）：异步回调不再 setState；重挂载时复位，避免 StrictMode 双挂后永久失活。 */
  const aliveRef = React.useRef(true);

  React.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      const request = requestRef.current;
      if (request) {
        requestRef.current = null;
        busyRef.current = false;
        request.controller.abort();
      }
    };
  }, []);

  const waiting = status === "polishing" || status === "checking" || status === "refining" ||
    status === "draftingPrompt" || status === "searchingDraft";
  React.useEffect(() => {
    if (!waiting) return;
    const id = window.setInterval(() => {
      const request = requestRef.current;
      if (request) setElapsedSeconds(Math.floor((performance.now() - request.startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [waiting]);

  const beginRequest = (returnTo: Status): AbortController => {
    const controller = new AbortController();
    requestRef.current = { controller, startedAt: performance.now(), returnTo };
    busyRef.current = true;
    setElapsedSeconds(0);
    return controller;
  };

  const isCurrentRequest = (controller: AbortController): boolean =>
    aliveRef.current && requestRef.current?.controller === controller;

  const finishRequest = (controller: AbortController): boolean => {
    if (!isCurrentRequest(controller)) return false;
    requestRef.current = null;
    busyRef.current = false;
    return true;
  };

  const cancelRequest = (): void => {
    const request = requestRef.current;
    if (!request || !finishRequest(request.controller)) return;
    request.controller.abort();
    setStatus(request.returnTo);
  };

  const claimed = useOverlayClaim();
  const aiWanted = settings.showAIPolishButton && status !== "idle";
  const aiVisible = aiWanted && canRender("ai", claimed);

  // 其他浮层可临时接管，AI 结果保留到用户关闭或应用。
  React.useEffect(() => {
    if (aiWanted) claimOverlayIfFree("ai");
    else releaseOverlay("ai");
  }, [aiWanted, claimed]);

  React.useEffect(() => () => releaseOverlay("ai"), []);

  const close = (): void => {
    setStatus("idle");
    setOriginal("");
    setPolished("");
    setComposerCheck(null);
    setDraftSession(null);
    setReplacement(null);
    setResultView("final");
    setRefined(null);
    setSaved(null);
    setEvicted(false);
    setSaveError(null);
    setErrorKey(null);
    setVariables([]);
    setSelectedSuggestions([]);
    setFillTarget(null);
    setDraftChanged(false);
    setCopied(false);
    setCopyFailed(false);
  };

  const settled = status === "choose" || status === "done" || status === "checked" || status === "error" ||
    status === "refined" || status === "saved" || status === "saveFailed" || status === "writeBackFailed";
  useDismissOnOutside(rootRef, aiVisible && settled && draftSession === null, close);

  // 已复制提示自动消失。
  React.useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), COPIED_MS);
    return () => {
      window.clearTimeout(id);
    };
  }, [copied]);

  const updateDraft = (edit: DraftEdit): void => {
    setDraftSession((session) => session && editDraftSession(session, edit));
  };

  const run = (mode: OptimizeMode): void => {
    const handoff = draftSession ? prepareDraftHandoff(draftSession) : undefined;
    const snapshot = draftSession ? handoff?.body : draft;
    if (busyRef.current || !snapshot?.trim()) return;
    const controller = beginRequest(draftSession ? "draftPrompt" : "choose");
    setMode(mode);
    // 授权**算一次、两处共用**：这一份发给宿主，下面 done 分支的提示读同一个 state。
    const keepVariables = keepVariablesFor(snapshot);
    setKeepVars(keepVariables);
    setErrorKey(null);
    setVariables([]);
    setSelectedSuggestions([]);
    setFillTarget(null);
    setDraftChanged(false);
    setOriginal(snapshot);
    setResultView("final");
    setCopied(false);
    setCopyFailed(false);
    setPolished("");
    setComposerCheck(null);
    setRefined(null);
    setStatus(mode === "polish" ? "polishing" : mode === "check" ? "checking" : "refining");
    void (async () => {
      try {
        if (mode === "template") {
          const result = await api.refinePrompt(snapshot, controller.signal);
          if (!isCurrentRequest(controller)) return;
          setRefined(result);
          setStatus("refined");
        } else if (mode === "check") {
          const report = await api.checkPrompt(snapshot, controller.signal, handoff?.generatedFrom);
          if (!isCurrentRequest(controller)) return;
          if (handoff) updateDraft({ type: "checked", snapshot: handoff, report });
          else setComposerCheck(report);
          setStatus("checked");
        } else {
          const result = await api.polishPrompt(snapshot, { keepVariables }, controller.signal);
          if (!isCurrentRequest(controller)) return;
          setPolished(result.polished);
          setStatus("done");
        }
      } catch (err) {
        if (!isCurrentRequest(controller)) return;
        console.warn("[prompt-enhancer] AI 优化失败", err);
        setErrorKey(aiErrorKey(err));
        setStatus("error");
      } finally {
        finishRequest(controller);
      }
    })();
  };

  const startDraft = (): void => {
    setErrorKey(null);
    setDraftSession(createDraftSession(draft));
    setStatus("draftPrompt");
  };

  const backToDraft = (): void => {
    setErrorKey(null);
    setDraftChanged(false);
    setReplacement(null);
    setCopied(false);
    setCopyFailed(false);
    setStatus("draftPrompt");
  };

  const runDraftGeneration = (action: DraftGeneration): void => {
    if (busyRef.current || !draftSession) return;
    const request = prepareDraftGeneration(draftSession, action);
    if (!request) return;
    const controller = beginRequest("draftPrompt");
    setErrorKey(null);
    setCopied(false);
    setCopyFailed(false);
    setStatus("draftingPrompt");
    void (async () => {
      try {
        const next = await generateDraft(draftSession, request, controller.signal, api.draftPrompt);
        if (next && isCurrentRequest(controller)) setDraftSession(next);
      } catch (err) {
        if (!isCurrentRequest(controller)) return;
        console.warn("[prompt-enhancer] 提示词起草失败", err);
        setErrorKey(aiErrorKey(err));
      } finally {
        if (finishRequest(controller)) setStatus("draftPrompt");
      }
    })();
  };

  const searchDraft = async (query: string): Promise<void> => {
    if (busyRef.current || !query.trim()) return;
    const controller = beginRequest("draftPrompt");
    setStatus("searchingDraft");
    try {
      const search = await api.searchDraft(query.trim(), controller.signal);
      if (isCurrentRequest(controller)) updateDraft({ type: "searched", search });
    } catch (err) {
      if (!isCurrentRequest(controller)) return;
      console.warn("[prompt-enhancer] 起草搜索失败", err);
      updateDraft({ type: "searched", search: { status: "failed" } });
    } finally {
      if (finishRequest(controller)) setStatus("draftPrompt");
    }
  };

  /**
   * 存入词库（严格两步，每步失败都有可见后果）：
   *   1. `createPrompt` 落**原文**（`libraryCreateInput` 的 body 恒为 original）——库里不留半成品；
   *   2. 完善稿 ≠ 原文时 `writeBackRefined(…)` → `updatePrompt(id, { body: 完善稿, aiWriteBack: true })`
   *      触发宿主回填 `sourceBody`，**成功之后**播种方向记录（`refined`）。
   * 第 2 步失败**必须明说**：库里那条的 body 是原文（不是损坏数据），但优化稿没写回，
   * 面内给 `ai.writeBackFail` + 原因 + 「重试写回」，不得假装已存好。
   * 完善稿 ≡ 原文则不写回（宿主不回填 `sourceBody`），界面按 `canToggle` 显示 `ai.sameAsOriginal`。
   */
  const save = (): void => {
    if (busyRef.current || refined === null || !refinedBody.trim()) return;
    busyRef.current = true;
    setSaveError(null);
    setStatus("saving");
    const writeBack = needsWriteBack(refinedBody, original);
    void (async () => {
      try {
        let outcome: CaptureOutcome;
        try {
          outcome = await createFromCapture({
            ...libraryCreateInput(refined, original),
            ...(!writeBack && templateVariables.length ? { variables: templateVariables } : {}),
          });
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
        if (!writeBack) {
          setStatus("saved");
          return;
        }
        try {
          const updated = await writeBackRefined({
            promptId: outcome.prompt.id,
            contentVersion: outcome.prompt.contentVersion,
            body: refinedBody,
            variables: templateVariables,
            update: api.updatePrompt,
            seed: seedRefinedDirection,
          });
          notifyDataChanged();
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
        const updated = await writeBackRefined({
          promptId: saved.id,
          contentVersion: saved.contentVersion,
          body: refinedBody,
          variables: templateVariables,
          update: api.updatePrompt,
          seed: seedRefinedDirection,
        });
        notifyDataChanged();
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
        if (aliveRef.current) {
          setCopied(true);
          setCopyFailed(false);
        }
      } catch (err) {
        // 失败必须**在用户点的地方**可见（审查 #9）：先前只进 console.warn，用户看到的只是
        // 按钮没变成「已复制」，无从判断发生了什么。
        console.warn("[prompt-enhancer] 复制失败", err);
        if (aliveRef.current) {
          setCopied(false);
          setCopyFailed(true);
        }
      }
    })();
  };

  const writeComposer = (text: string): void => {
    inputActions.setDraft(text);
    close();
  };

  /** 草稿仍与发起时一致才允许覆盖。 */
  const apply = (text: string): void => {
    if (draftSession) {
      const application = requestDraftApplication(draftSession, draft, text);
      if (application.kind === "apply") writeComposer(application.text);
      else {
        setReplacement(application);
        setFillTarget(null);
      }
    } else if (draft !== original) {
      setDraftChanged(true);
      setFillTarget(null);
    } else writeComposer(text);
  };

  const confirmReplacement = (): void => {
    if (replacement === null) return;
    const application = confirmDraftApplication(replacement, draft);
    if (application.kind === "apply") writeComposer(application.text);
    else setReplacement(application);
  };

  const tryResult = (variable = ""): void => {
    if (needsValues(resultBody)) setFillTarget(variable);
    else apply(resultBody);
  };

  if (settings.showAIPolishButton === false) return null;

  // 调用/完善/存库三态同属「忙」：按钮置灰、aria-busy、状态行可见，重入由 busyRef 兜底。
  // 提示文案按阶段取值：refining 是另一次 AI 调用、saving 是本地写库，都不该沿用
  // polishing 那句「正在调用 AI…（最长约 2 分钟）」。
  const busyKey: PromptEnhancerKey | null =
    status === "polishing"
      ? "ai.polishing"
      : status === "checking" ? "ai.checking"
      : status === "draftingPrompt" ? "ai.draft.generating"
      : status === "searchingDraft" ? "ai.draft.searching"
      : status === "refining" ? "ai.refining"
      : status === "saving" ? "ai.saving"
      : null;
  const empty = draft.trim() === "";
  const triggerDisabled = busyKey !== null;
  const hint = busyKey !== null ? t(busyKey) : t("ai.tip");
  /** 淘汰提示：写回失败时也必须可见（那时 status 不是 saved，但淘汰已经真实发生）。 */
  const evictedNotice = evicted ? <span style={MUTED}>{t("ai.evicted")}</span> : null;
  const showRefined = status === "refined" || status === "saveFailed";
  const needsFill = needsValues(resultBody);
  const showCheck = status === "checking" || status === "checked";
  const showDraft = status === "draftPrompt" || status === "draftingPrompt" || status === "searchingDraft";
  const showMenu = status === "choose" || (status === "error" && !draftSession);
  const failedHandoffKey = mode === "check" ? "ai.check" : "ai.refine";
  const checkReport = draftSession ? draftSession.checked?.report : composerCheck;
  const checkInput = draftSession?.body ?? draft;
  const checkStale = draftSession ? draftCheckIsStale(draftSession) : checkInput !== original;
  const dialogLabel =
    status === "error" && draftSession ? t(failedHandoffKey)
    : showDraft ? t("ai.draft.title")
    : showCheck ? t("ai.check")
    : status === "done"
      ? t("ai.result")
      : showRefined || status === "saving" || status === "writeBackFailed"
        ? t("ai.refined")
        : status === "saved"
          ? t("ai.saved")
          : t("ai.button");

  return (
    <div ref={rootRef} style={WRAP}>
      <button
        type="button"
        style={{ ...BUTTON, cursor: triggerDisabled ? "default" : "pointer", opacity: triggerDisabled ? 0.6 : 1 }}
        title={hint}
        aria-label={t("ai.button")}
        aria-busy={busyKey !== null}
        aria-haspopup="dialog"
        aria-expanded={aiVisible}
        disabled={triggerDisabled}
        onClick={() => {
          if (aiVisible) close();
          else if (status === "idle") setStatus("choose");
        }}
      >
        <SparkleIcon />
        {showsLabel(settings.aiPolishButtonIconOnly) && <span>{t("ai.button")}</span>}
      </button>
      {aiVisible && (
        <div style={ANCHOR}>
          {fillTarget !== null ? (
            <TemplateVariablesDialog
              body={resultBody}
              variables={templateVariables}
              t={t}
              panelSize={refined ? TEMPLATE_PANEL : { width: PANEL.width }}
              focusVariable={fillTarget}
              confirmUnfilled
              confirmLabel={t("ai.apply")}
              onFilled={apply}
              onCancel={() => setFillTarget(null)}
            />
          ) : (
            <div
              role="dialog"
              aria-label={dialogLabel}
              style={showRefined || showDraft || replacement ? TEMPLATE_PANEL : status === "checked" ? CHECK_PANEL : showMenu ? MENU_PANEL : PANEL}
            >
              <span style={status === "checked" ? { ...PANEL_HEADER, flexShrink: 0 } : PANEL_HEADER}>
                <strong>{status === "error" && draftSession ? t(failedHandoffKey) : t(showDraft ? "ai.draft.title" : showCheck ? "ai.check" : showRefined ? "ai.refine" : "ai.button")}</strong>
                <button type="button" style={PANEL_BUTTON} disabled={!waiting && busyKey !== null} onClick={waiting ? cancelRequest : close}>
                  {t(waiting ? "ai.cancelRequest" : "ai.close")}
                </button>
              </span>
              {showMenu && (
                <>
                  <div style={MENU_ACTIONS}>
                    <button type="button" style={empty ? DISABLED_MODE : PRIMARY_MODE} disabled={empty} onClick={() => run("polish")}>{t("ai.lightPolish")}</button>
                    <button type="button" style={empty ? DISABLED_MODE : MENU_BUTTON} disabled={empty} onClick={() => run("check")}>{t("ai.check")}</button>
                    <button type="button" style={empty ? DISABLED_MODE : MENU_BUTTON} disabled={empty} onClick={() => run("template")}>{t("ai.refine")}</button>
                    <button type="button" style={empty ? PRIMARY_MODE : MENU_BUTTON} onClick={startDraft}>{t("ai.draft.title")}</button>
                  </div>
                  {empty && <span style={MUTED}>{t("ai.empty")}</span>}
                </>
              )}
              {replacement ? (
                <>
                  <div style={RESULT_CONTENT}>
                    <span role="alert">{t(replacement.current === draft ? "ai.draft.replaceWarning" : "ai.draft.replaceChanged")}</span>
                    <span style={HEADER}>{t("ai.draft.currentComposer")}</span>
                    <pre style={PREVIEW}>{draft || "—"}</pre>
                    <span style={HEADER}>{t("ai.draft.result")}</span>
                    <pre style={PREVIEW}>{replacement.proposed}</pre>
                  </div>
                  <footer style={RESULT_ACTIONS}>
                    <button type="button" style={PANEL_BUTTON} onClick={() => setReplacement(null)}>{t("ai.draft.keepEditing")}</button>
                    <button type="button" style={PRIMARY} onClick={confirmReplacement}>
                      {t(replacement.current === draft ? "ai.draft.replace" : "ai.draft.confirmCurrent")}
                    </button>
                  </footer>
                </>
              ) : showDraft && draftSession && (
                <PromptDraftForm
                  t={t}
                  session={draftSession}
                  busy={busyKey !== null}
                  error={errorKey}
                  update={updateDraft}
                  generate={runDraftGeneration}
                  onSearch={(query) => void searchDraft(query)}
                  onBack={() => { setDraftSession(null); setErrorKey(null); setStatus("choose"); }}
                  onApply={() => apply(draftSession.body)}
                  onCheck={() => run("check")}
                  onViewCheck={() => setStatus("checked")}
                  onEnhance={() => run("template")}
                  onCopy={() => copy(draftSession.body)}
                  copyLabel={copyFailed ? "ai.copyFail" : copied ? "ai.copied" : "ai.copy"}
                />
              )}
              {!showRefined && draftChanged && <span role="alert" style={MUTED}>{t("ai.draftChanged")}</span>}
              {status === "done" && missing.length > 0 && (
                <span role="alert" style={MUTED}>{t("ai.missingVariables")} {missing.join(", ")}</span>
              )}
              {busyKey !== null && (
                <div style={WAIT_STATUS}>
                  <span role="status" style={MUTED}>{t(busyKey)}</span>
                  {waiting && <span style={WAIT_ELAPSED}>{t("ai.elapsed").replace("{seconds}", String(elapsedSeconds))}</span>}
                </div>
              )}
              {status === "error" && (
                <>
                  <span role="alert" style={MUTED}>{t(errorKey ?? "ai.fail")}</span>
                  {draftSession && (
                    <div style={ACTIONS}>
                      <button type="button" style={PANEL_BUTTON} onClick={backToDraft}>{t("ai.draft.backToResult")}</button>
                      <button type="button" style={PRIMARY} onClick={() => run(mode)}>{t("ai.retry")}</button>
                    </div>
                  )}
                </>
              )}
              {status === "checked" && checkReport && (
                <>
                  <div role="region" aria-label={t("ai.checkReport")} tabIndex={0} style={CHECK_CONTENT}>
                    {checkStale && <span role="status" style={MUTED}>{t(draftSession ? "ai.draft.checkStale" : "ai.checkStale")}</span>}
                    {checkReport.findings.length === 0 ? (
                      <span role="status">{t("ai.checkClear")}</span>
                    ) : (
                      <ul style={CHECK_FINDINGS}>
                        {checkReport.findings.map((finding, index) => {
                          const { quote, issue, suggestion } = finding;
                          const canUse = draftSession && draftSuggestionFeedback(draftSession, finding) !== undefined;
                          return (
                            <li key={index} style={index === 0 ? CHECK_FINDING : CHECK_NEXT_FINDING}>
                              <strong style={CHECK_ISSUE}>{issue}</strong>
                              <blockquote style={CHECK_QUOTE}>{quote}</blockquote>
                              <p style={CHECK_SUGGESTION}><strong>{t("ai.checkSuggestion")}</strong> {suggestion}</p>
                              {canUse && (
                                <button type="button" style={PANEL_BUTTON} onClick={() => {
                                  updateDraft({ type: "useSuggestion", finding });
                                  backToDraft();
                                }}>{t("ai.draft.useSuggestion")}</button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                  <footer style={RESULT_ACTIONS}>
                    <button type="button" style={PANEL_BUTTON} onClick={draftSession ? backToDraft : () => setStatus("choose")}>
                      {t(draftSession ? "ai.draft.backToResult" : "ai.backToActions")}
                    </button>
                    {checkStale && !!checkInput.trim() && (
                      <button type="button" style={PRIMARY} onClick={() => run("check")}>{t("ai.checkAgain")}</button>
                    )}
                  </footer>
                </>
              )}
              {status === "done" && (
                <>
                  <span style={HEADER}>{t("ai.result")}</span>
                  <span style={PILLS}>
                    <button
                      type="button"
                      style={pill(!showOriginal)}
                      aria-pressed={!showOriginal}
                      onClick={() => setResultView("final")}
                    >
                      {t("ai.polished")}
                    </button>
                    <button
                      type="button"
                      style={pill(showOriginal)}
                      aria-pressed={showOriginal}
                      onClick={() => setResultView("original")}
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
                  {/*
                   * ④（2026-09-30 裁定）：润色被授权**新增 {{变量}} 占位符**（system prompt 里那条
                   * 「长度约束的例外」）。这件事必须在产物旁边说清——否则用户看到正文里凭空多出
                   * 变量，无法判断是能力如此还是模型跑偏。
                   *
                   * 仅在本次请求真的带上该授权时出现：`keepVariablesFor(original)` 就是调用侧
                   * 传给 `api.polishPrompt` 的同一判定，故提示与授权同生共死（不含变量的草稿
                   * 收不到那条授权，也就不该看到这句话）。
                   */}
                  {keepVars && <span style={MUTED}>{t("ai.mayAddVars")}</span>}
                  <span style={ACTIONS}>
                    <button type="button" style={PANEL_BUTTON} onClick={() => copy(polished)}>
                      {copyFailed ? t("ai.copyFail") : copied ? t("ai.copied") : t("ai.copy")}
                    </button>
                    <button type="button" style={PRIMARY} disabled={!resultBody.trim()} onClick={() => tryResult()}>
                      {t(needsFill ? "ai.tryTemplate" : "ai.apply")}
                    </button>
                  </span>
                </>
              )}
              {!replacement && showRefined && refined !== null && (
                <>
                  <div style={PILLS}>
                    <button type="button" style={pill(resultView === "final")} aria-pressed={resultView === "final"} onClick={() => setResultView("final")}>{t("ai.finalTemplate")}</button>
                    <button type="button" style={pill(resultView === "edit")} aria-pressed={resultView === "edit"} onClick={() => setResultView("edit")}>{t("ai.editTemplate")}</button>
                    <button type="button" style={pill(showOriginal)} aria-pressed={showOriginal} onClick={() => setResultView("original")}>{t("ai.original")}</button>
                  </div>
                  <div style={RESULT_CONTENT}>
                    {draftChanged && <span role="alert" style={MUTED}>{t("ai.draftChanged")}</span>}
                    {missing.length > 0 && (
                      <div role="alert" style={PILLS}>
                        <span style={MUTED}>{t("ai.missingVariables")} {missing.join(", ")}</span>
                        {resultView !== "edit" && (
                          <button type="button" style={PANEL_BUTTON} onClick={() => setResultView("edit")}>{t("ai.editTemplate")}</button>
                        )}
                      </div>
                    )}
                    {status === "saveFailed" && (
                      <span role="alert" style={ERROR}>
                        <span>{t("ai.saveFail")}</span>
                        {saveError !== null && <span style={ERROR_DETAIL}>{saveError}</span>}
                      </span>
                    )}
                    {resultView === "final" ? (
                      <pre role="region" aria-label={t("ai.finalTemplate")} tabIndex={0} style={FINAL_PREVIEW}>
                        {refinedBodySections(refined.body, refined.suggestions ?? [], selectedSuggestions).map(({ text, addition }, index) => (
                          <span key={index} style={addition ? ADDED_SUGGESTION : undefined}>
                            {markAddedVariables(text, original).map(({ text: fragment, name, added }, position) => (
                              added && name !== undefined ? (
                                <button
                                  key={position}
                                  type="button"
                                  style={ADDED_VARIABLE}
                                  onClick={() => tryResult(name)}
                                >
                                  {fragment}
                                </button>
                              ) : fragment
                            ))}
                          </span>
                        ))}
                      </pre>
                    ) : (
                      <textarea
                        key={resultView}
                        autoFocus={resultView === "edit"}
                        value={showOriginal ? original : refined.body}
                        readOnly={showOriginal}
                        aria-label={t(showOriginal ? "ai.original" : "ai.editTemplate")}
                        onChange={(ev) => setRefined({ ...refined, body: ev.target.value })}
                        style={TEMPLATE_EDITOR}
                      />
                    )}
                    {!showOriginal && (
                      <div style={RESULT_OPTIONS}>
                        {refined.suggestions?.length ? (
                          <details style={RESULT_DETAILS}>
                            <summary style={RESULT_SUMMARY}>
                              {t("ai.suggestions")} <span style={MUTED}>{selectedSuggestions.length}/{refined.suggestions.length}</span>
                            </summary>
                            <fieldset style={SUGGESTIONS} aria-label={t("ai.suggestions")}>
                              {refined.suggestions.map((suggestion, index) => (
                                <label key={suggestion} style={SUGGESTION}>
                                  <input
                                    type="checkbox"
                                    checked={selectedSuggestions.includes(index)}
                                    onChange={(event) => {
                                      const checked = event.currentTarget.checked;
                                      setSelectedSuggestions((previous) => checked
                                        ? [...previous, index]
                                        : previous.filter((selected) => selected !== index));
                                    }}
                                  />
                                  <span>{suggestion}</span>
                                </label>
                              ))}
                            </fieldset>
                          </details>
                        ) : null}
                        <details style={RESULT_DETAILS}>
                          <summary style={RESULT_SUMMARY}>{t("ai.entryDetails")}</summary>
                          <dl style={META}>
                            <dt style={META_KEY}>{t("ai.fieldTitle")}</dt>
                            <dd style={META_VALUE}>{refined.title}</dd>
                            <dt style={META_KEY}>{t("ai.fieldTags")}</dt>
                            <dd style={META_VALUE}>{refined.tags.join(" / ")}</dd>
                            <dt style={META_KEY}>{t("ai.fieldSummary")}</dt>
                            <dd style={META_VALUE}>{refined.summary}</dd>
                          </dl>
                          {variableNames.length > 0 && (
                            <div style={RESULT_DETAILS}>
                              <strong style={HEADER}>{t("vars.settings")}</strong>
                              <TemplateVariableFields names={variableNames} variables={variables} t={t}
                                onChange={(name, field, value) => setVariables((previous) =>
                                  updateTemplateVariable(previous, name, field, value))} />
                            </div>
                          )}
                        </details>
                      </div>
                    )}
                  </div>
                  <footer style={RESULT_ACTIONS}>
                    {draftSession && (
                      <button type="button" style={PANEL_BUTTON} onClick={backToDraft}>{t("ai.draft.backToResult")}</button>
                    )}
                    {resultView === "final" ? (
                      <>
                        <button type="button" style={PANEL_BUTTON} disabled={!refinedBody.trim()} onClick={save}>
                          {t("ai.save")}
                        </button>
                        <button type="button" style={PANEL_BUTTON} disabled={!refinedBody.trim()} onClick={() => copy(refinedBody)}>
                          {copyFailed ? t("ai.copyFail") : copied ? t("ai.copied") : t("ai.copy")}
                        </button>
                        <button type="button" style={PRIMARY} disabled={!refinedBody.trim()} onClick={() => tryResult()}>
                          {t(needsFill ? "ai.tryTemplate" : "ai.apply")}
                        </button>
                      </>
                    ) : (
                      <button type="button" style={PRIMARY} onClick={() => setResultView("final")}>
                        {t("ai.viewFinalTemplate")}
                      </button>
                    )}
                  </footer>
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
                    {draftSession && (
                      <button type="button" style={PANEL_BUTTON} onClick={backToDraft}>{t("ai.draft.backToResult")}</button>
                    )}
                    <button type="button" style={PANEL_BUTTON} onClick={close}>
                      {t("ai.close")}
                    </button>
                  </span>
                </>
              )}
            </div>
          )}
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
  width: "min(390px, calc(100vw - 120px))",
  boxSizing: "border-box",
  maxHeight: "min(460px, calc(100dvh - 130px))",
  overflowY: "auto",
  padding: 12,
  fontSize: 12,
};

const HEADER: React.CSSProperties = { color: TOKEN.muted, fontSize: 11, fontWeight: 600 };

const MUTED: React.CSSProperties = { color: TOKEN.muted, fontSize: 11, overflowWrap: "anywhere" };
const WAIT_STATUS: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: "2px 8px", flexShrink: 0 };
const WAIT_ELAPSED: React.CSSProperties = { ...MUTED, fontVariantNumeric: "tabular-nums" };

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
  gridTemplateColumns: "auto minmax(0, 1fr)",
  margin: "4px 0 0",
  columnGap: 10,
  rowGap: 4,
  alignItems: "baseline",
};

const META_KEY: React.CSSProperties = { color: TOKEN.muted, fontSize: 11, whiteSpace: "nowrap" };

const META_VALUE: React.CSSProperties = { margin: 0, color: TOKEN.fg, overflowWrap: "anywhere" };

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

const PILLS: React.CSSProperties = { display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" };

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
};

const ACTIONS: React.CSSProperties = { display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" };

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


const PRIMARY: React.CSSProperties = { ...PANEL_BUTTON, color: TOKEN.accent, borderColor: TOKEN.accent };
const MENU_PANEL: React.CSSProperties = { ...PANEL, width: "min(260px, calc(100vw - 120px))", gap: 10 };
const MENU_ACTIONS: React.CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 4, flexShrink: 0 };
const MENU_BUTTON: React.CSSProperties = {
  ...PANEL_BUTTON, textAlign: "start", padding: "6px 9px", fontSize: 12, borderColor: "transparent", overflowWrap: "anywhere",
};
const PRIMARY_MODE: React.CSSProperties = { ...MENU_BUTTON, color: TOKEN.accent, background: TOKEN.hover, fontWeight: 600 };
const DISABLED_MODE: React.CSSProperties = { ...MENU_BUTTON, opacity: 0.5, cursor: "default" };
const PANEL_HEADER: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 };
const CHECK_FINDINGS: React.CSSProperties = { flexShrink: 0, listStyle: "none", padding: 0, margin: 0 };
const CHECK_FINDING: React.CSSProperties = { display: "grid", gap: 6, paddingBlock: 10 };
const CHECK_NEXT_FINDING: React.CSSProperties = { ...CHECK_FINDING, borderTop: `1px solid ${TOKEN.border}` };
const CHECK_ISSUE: React.CSSProperties = { fontWeight: 600 };
const CHECK_QUOTE: React.CSSProperties = {
  margin: 0,
  padding: "4px 8px",
  color: TOKEN.muted,
  background: TOKEN.hover,
  borderInlineStart: `2px solid ${TOKEN.border}`,
  whiteSpace: "pre-wrap",
};
const CHECK_SUGGESTION: React.CSSProperties = { margin: 0, whiteSpace: "pre-wrap" };
const SUGGESTIONS: React.CSSProperties = { display: "grid", gap: 8, margin: 0, minWidth: 0, border: 0, padding: "4px 0 2px" };
const SUGGESTION: React.CSSProperties = { display: "flex", alignItems: "flex-start", gap: 6, overflowWrap: "anywhere", lineHeight: 1.55 };


const TEMPLATE_PANEL: React.CSSProperties = {
  ...PANEL,
  width: "min(520px, calc(100vw - 120px))",
  height: "min(510px, calc(100dvh - 130px))",
  maxHeight: undefined,
  overflow: "hidden",
  gap: 8,
};

const RESULT_CONTENT: React.CSSProperties = {
  flex: "1 1 auto",
  minHeight: 0,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: 2,
};

const CHECK_PANEL: React.CSSProperties = {
  ...PANEL,
  width: TEMPLATE_PANEL.width,
  maxHeight: TEMPLATE_PANEL.height,
  overflow: "hidden",
  gap: 8,
};

const CHECK_CONTENT: React.CSSProperties = {
  ...RESULT_CONTENT,
  overscrollBehavior: "contain",
  paddingInlineEnd: 8,
  outlineOffset: -2,
  lineHeight: 1.65,
  overflowWrap: "anywhere",
};

const TEMPLATE_EDITOR: React.CSSProperties = {
  ...TEXTAREA,
  flex: "1 1 0",
  minHeight: "clamp(100px, 29dvh, 220px)",
  padding: "10px 11px",
  fontSize: 13,
  lineHeight: 1.6,
};

const RESULT_OPTIONS: React.CSSProperties = {
  flex: "0 0 auto",
  maxHeight: "min(128px, 20dvh)",
  overflowY: "auto",
};

const RESULT_DETAILS: React.CSSProperties = { flex: "0 0 auto", borderTop: `1px solid ${TOKEN.border}` };

const RESULT_SUMMARY: React.CSSProperties = { cursor: "pointer", padding: "6px 0", fontWeight: 600 };

const RESULT_ACTIONS: React.CSSProperties = {
  ...ACTIONS,
  flex: "0 0 auto",
  paddingTop: 8,
  borderTop: `1px solid ${TOKEN.border}`,
};


const FINAL_PREVIEW: React.CSSProperties = {
  ...TEMPLATE_EDITOR, margin: 0, resize: "none", whiteSpace: "pre-wrap", overflowWrap: "anywhere", overflowY: "auto",
};
const ADDED_VARIABLE: React.CSSProperties = {
  background: TOKEN.hover, color: TOKEN.accent, border: 0, padding: 0, font: "inherit", cursor: "pointer", textDecoration: "underline",
};
const ADDED_SUGGESTION: React.CSSProperties = { color: TONE.success, fontStyle: "italic" };
