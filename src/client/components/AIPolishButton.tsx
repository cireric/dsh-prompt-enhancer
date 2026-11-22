/** Composer 的 AI 优化入口。每种模式都基于发起时的草稿快照。 */
import * as React from "react";
import type { PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import { canRender } from "../../overlay-claim.ts";
import type { PromptCheckFinding } from "../../types.ts";
import { PromptCheckReport } from "./PromptCheckReport.tsx";
import { PromptCheckRevisionPanel } from "./PromptCheckRevisionPanel.tsx";
import { PromptDraftForm } from "./PromptDraftForm.tsx";
import { PromptTemplateResult } from "./PromptTemplateResult.tsx";
import {
  ACTIONS, DISABLED_MODE, HEADER, MENU_BUTTON, MUTED, PANEL_BUTTON, pill, PILLS, PREVIEW, PRIMARY, RESULT_ACTIONS, RESULT_CONTENT, TEXTAREA,
} from "./ai-panel-styles.ts";
import {
  confirmDraftApplication, createDraftSession, draftCheckIsStale, draftSuggestionFeedback, editDraftSession,
  generateDraft, prepareDraftGeneration, prepareDraftHandoff, requestDraftApplication,
  type DraftEdit, type DraftGeneration, type DraftReplacement, type DraftSession,
} from "../utils/draft-session.ts";
import { aiErrorKey, keepVariablesFor, missingVariables } from "../utils/ai-flow.ts";
import { showsLabel } from "../utils/icon-only.ts";
import { TemplateVariablesDialog } from "./TemplateVariablesDialog.tsx";
import { needsValues } from "../utils/template.ts";
import { api } from "../utils/api.ts";
import { notifyDataChanged } from "../utils/data-sync.ts";
import { useSettings } from "../utils/settings-store.ts";
import { createFromCapture } from "../utils/capture.ts";
import { retryTemplateWriteBack, saveTemplate, type TemplateSaveResult } from "../utils/template-save.ts";
import {
  canApplyTemplateRefinement, createTemplateRefinement, deriveTemplateRefinement, editTemplateRefinement, type TemplateRefineSession,
} from "../utils/template-refine-session.ts";
import type { PromptEnhancerKey } from "../utils/i18n.ts";
import { seedRefinedDirection } from "../utils/refined-direction.ts";
import { TOKEN, overlayBase } from "../utils/theme.ts";
import { claimOverlayIfFree, releaseOverlay, useOverlayClaim } from "../utils/ui-state.ts";
import { useDismissOnOutside } from "../utils/dismiss-outside.ts";
import {
  applyCheckRevision, beginCheckRevision, canCheckAgain, canUseCheckRevision, checkRevisionBaseline, CHECK_STATUS,
  editCheckSession, startCheck, type CheckSession,
} from "../utils/check-revision.ts";
import { needsInsertionConfirmation } from "../utils/insert.ts";

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
  | "saving";

type OptimizeMode = "polish" | "check" | "template";
type CopyTarget = "result" | PromptCheckFinding;
type CopyFeedback = { target: CopyTarget; label?: "ai.copied" | "ai.copyFail" };

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
  const input = useInput((s) => s);
  const { draft, draftRev } = input;
  /**
   * 设置改读**共享响应式 store**（P8 T1）：宿主 scope 每次已提交变更都推一次快照，按钮的显隐与
   * 形状随之即时生效——不再是「mount 时读一次」。无 scope 时 store 给默认值，且无未就绪的 null 态。
   */
  const settings = useSettings();
  const [panelStatus, setStatus] = React.useState<Status>("idle");
  const [mode, setMode] = React.useState<OptimizeMode>("polish");
  /** 轻度润色的发起快照，模板原文单独由模板会话持有。 */
  const [original, setOriginal] = React.useState("");
  const [polished, setPolished] = React.useState("");
  const [ownedCheck, setOwnedCheck] = React.useState<{ session: CheckSession | null; owner: typeof inputActions } | null>(null);
  const checkOwner = ownedCheck?.owner;
  const composerCheck = checkOwner === inputActions ? ownedCheck?.session : undefined;
  const [saveResult, setSaveResult] = React.useState<TemplateSaveResult>();
  const status = composerCheck ? CHECK_STATUS[composerCheck.phase]
    : panelStatus === "refined" && saveResult ? saveResult.kind : panelStatus;
  const editCheck = (edit: Parameters<typeof editCheckSession>[1]): void => {
    setOwnedCheck((check) => check?.owner === inputActions && check.session
      ? { ...check, session: editCheckSession(check.session, edit) }
      : check);
  };
  const [draftSession, setDraftSession] = React.useState<DraftSession | null>(null);
  const [replacement, setReplacement] = React.useState<DraftReplacement | null>(null);
  const [showOriginal, setShowOriginal] = React.useState(false);
  /**
   * 本次调用**实际发出的**变量授权。`run()` 里算一次存这里，渲染期的提示文案读同一个值——
   * 不是渲染期重算的推断。理由：提示说「可能新增变量」而请求根本没授权（或反过来），是组件面
   * 唯一无人能自动发现的那类静默不一致（本仓库没有渲染测试通道）。
   */
  const [keepVars, setKeepVars] = React.useState(false);
  const [templateSession, setTemplateSession] = React.useState<TemplateRefineSession | null>(null);
  const [errorKey, setErrorKey] = React.useState<PromptEnhancerKey | null>(null);
  const [fillTarget, setFillTarget] = React.useState<string | null>(null);
  const [draftChanged, setDraftChanged] = React.useState(false);
  const finalTemplate = templateSession ? deriveTemplateRefinement(templateSession) : null;
  const resultBody = finalTemplate?.body ?? polished;
  const missing = missingVariables(original, polished);
  const [copyFeedback, setCopyFeedback] = React.useState<CopyFeedback | null>(null);
  const copyLabel = (target: CopyTarget): PromptEnhancerKey =>
    (copyFeedback?.target === target ? copyFeedback.label : undefined) ??
    (target === "result" ? "ai.copy" : "ai.checkCopySuggestion");
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  /** 调用闸门：ref 同步生效（state 的 disabled 要等渲染），覆盖「探测 → 润色/完善/存库/切换」整段。 */
  const busyRef = React.useRef(false);
  const requestRef = React.useRef<{ controller: AbortController; startedAt: number; onCancel: () => void } | null>(null);
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

  const waiting = status === "polishing" || status === "checking" || status === "refining" || status === "revisingCheck" ||
    status === "draftingPrompt" || status === "searchingDraft";
  React.useEffect(() => {
    if (!waiting) return;
    const id = window.setInterval(() => {
      const request = requestRef.current;
      if (request) setElapsedSeconds(Math.floor((performance.now() - request.startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [waiting]);

  const beginRequest = (onCancel: () => void): AbortController => {
    const controller = new AbortController();
    requestRef.current = { controller, startedAt: performance.now(), onCancel };
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
    request.onCancel();
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
    setOwnedCheck(null);
    setDraftSession(null);
    setReplacement(null);
    setShowOriginal(false);
    setTemplateSession(null);
    setSaveResult(undefined);
    setErrorKey(null);
    setFillTarget(null);
    setDraftChanged(false);
    setCopyFeedback(null);
  };

  React.useLayoutEffect(() => {
    if (checkOwner && checkOwner !== inputActions) {
      cancelRequest();
      close();
    }
  }, [checkOwner, inputActions]);

  const settled = status === "choose" || status === "done" || status === "checked" || status === "error" ||
    status === "refined" || status === "saved" || status === "saveFailed" || status === "writeBackFailed";
  useDismissOnOutside(rootRef, aiVisible && settled && draftSession === null, close);

  // 已复制提示自动消失。
  React.useEffect(() => {
    if (copyFeedback?.label !== "ai.copied") return;
    const id = window.setTimeout(() => {
      setCopyFeedback((current) => current === copyFeedback ? null : current);
    }, COPIED_MS);
    return () => window.clearTimeout(id);
  }, [copyFeedback]);

  const updateDraft = (edit: DraftEdit): void => {
    setDraftSession((session) => session && editDraftSession(session, edit));
  };

  const run = (mode: OptimizeMode): void => {
    const handoff = draftSession ? prepareDraftHandoff(draftSession) : undefined;
    const snapshot = draftSession ? handoff?.body : draft;
    if (busyRef.current || !snapshot?.trim()) return;
    const check = mode === "check" && !handoff ? startCheck({ draft: snapshot, draftRev }) : null;
    const controller = beginRequest(() => {
      if (check) setOwnedCheck(null);
      setStatus(draftSession ? "draftPrompt" : "choose");
    });
    setMode(mode);
    // 授权**算一次、两处共用**：这一份发给宿主，下面 done 分支的提示读同一个 state。
    const keepVariables = keepVariablesFor(snapshot);
    setKeepVars(keepVariables);
    setErrorKey(null);
    setFillTarget(null);
    setDraftChanged(false);
    setOriginal(mode === "polish" ? snapshot : "");
    setShowOriginal(false);
    setCopyFeedback(null);
    setPolished("");
    setOwnedCheck(check ? { session: check, owner: inputActions } : null);
    setTemplateSession(null);
    setSaveResult(undefined);
    if (!check) setStatus(mode === "polish" ? "polishing" : mode === "check" ? "checking" : "refining");
    void (async () => {
      try {
        if (mode === "template") {
          const result = await api.refinePrompt(snapshot, controller.signal);
          if (!isCurrentRequest(controller)) return;
          setTemplateSession(createTemplateRefinement(snapshot, result));
          setStatus("refined");
        } else if (mode === "check") {
          const report = await api.checkPrompt(snapshot, controller.signal, handoff?.generatedFrom);
          if (!isCurrentRequest(controller)) return;
          if (handoff) {
            updateDraft({ type: "checked", snapshot: handoff, report });
            setStatus("checked");
          } else editCheck({ type: "reported", report });
        } else {
          const result = await api.polishPrompt(snapshot, { keepVariables }, controller.signal);
          if (!isCurrentRequest(controller)) return;
          setPolished(result.polished);
          setStatus("done");
        }
      } catch (err) {
        if (!isCurrentRequest(controller)) return;
        console.warn("[prompt-enhancer] AI 优化失败", err);
        if (check) setOwnedCheck(null);
        setErrorKey(aiErrorKey(err));
        setStatus("error");
      } finally {
        finishRequest(controller);
      }
    })();
  };

  const generateCheckRevision = (): void => {
    if (!composerCheck || busyRef.current) return;
    const generation = beginCheckRevision(composerCheck);
    if (!generation) return;
    const returnToReport = () => editCheck({ type: "returnToReport" });
    const controller = beginRequest(returnToReport);
    setErrorKey(null);
    setCopyFeedback(null);
    setOwnedCheck({ owner: inputActions, session: generation.session });
    void api.reviseCheckedPrompt(generation.request, controller.signal).then((revision) => {
      if (isCurrentRequest(controller)) editCheck({ type: "revised", revision });
    }).catch((err: unknown) => {
      if (!isCurrentRequest(controller)) return;
      console.warn("[prompt-enhancer] 检查改稿失败", err);
      setErrorKey(aiErrorKey(err));
      returnToReport();
    }).finally(() => finishRequest(controller));
  };

  const startDraft = (): void => {
    setErrorKey(null);
    setDraftSession(createDraftSession(draft));
    setStatus("draftPrompt");
  };

  const backToDraft = (): void => {
    setTemplateSession(null);
    setSaveResult(undefined);
    setErrorKey(null);
    setDraftChanged(false);
    setReplacement(null);
    setCopyFeedback(null);
    setStatus("draftPrompt");
  };

  const runDraftGeneration = (action: DraftGeneration): void => {
    if (busyRef.current || !draftSession) return;
    const request = prepareDraftGeneration(draftSession, action);
    if (!request) return;
    const controller = beginRequest(backToDraftStatus);
    setErrorKey(null);
    setCopyFeedback(null);
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

  const backToDraftStatus = (): void => setStatus("draftPrompt");

  const searchDraft = async (query: string): Promise<void> => {
    if (busyRef.current || !query.trim()) return;
    const controller = beginRequest(backToDraftStatus);
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

  const saveDependencies = {
    create: createFromCapture,
    update: api.updatePrompt,
    seed: seedRefinedDirection,
    notify: notifyDataChanged,
    isAlive: () => aliveRef.current,
  };

  const runSave = async (operation: () => ReturnType<typeof saveTemplate>): Promise<void> => {
    if (busyRef.current) return;
    busyRef.current = true;
    setSaveResult(undefined);
    setStatus("saving");
    try {
      const result = await operation();
      if (!result || !aliveRef.current) return;
      if (result.kind !== "cancelled") setSaveResult(result);
      setStatus("refined");
    } finally {
      busyRef.current = false;
    }
  };

  const save = (): void => {
    if (!templateSession || !finalTemplate?.canUse) return;
    const { original, metadata } = templateSession;
    const { body, variables } = finalTemplate;
    void runSave(() => saveTemplate({ original, metadata, body, variables }, saveDependencies));
  };

  const retryWriteBack = (): void => {
    if (saveResult?.kind !== "writeBackFailed") return;
    void runSave(() => retryTemplateWriteBack(saveResult.pending, saveDependencies));
  };

  const copy = (text: string, target: CopyTarget = "result"): void => {
    const pending: CopyFeedback = { target };
    setCopyFeedback(pending);
    void (async () => {
      let label: CopyFeedback["label"] = "ai.copied";
      try {
        await navigator.clipboard.writeText(text);
      } catch (err) {
        console.warn("[prompt-enhancer] 复制失败", err);
        label = "ai.copyFail";
      }
      if (!aliveRef.current) return;
      // A late clipboard result must not change feedback for a newer click or a cleared panel.
      setCopyFeedback((current) => current === pending ? { target, label } : current);
    })();
  };

  const copySuggestion = (finding: PromptCheckFinding): void => copy(finding.suggestion, finding);

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
    } else if (templateSession ? !canApplyTemplateRefinement(templateSession, draft) : draft !== original) {
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

  const comparedCheck = composerCheck?.phase === "revision" || composerCheck?.phase === "confirming" ? composerCheck : undefined;
  const checkApproval = comparedCheck?.phase === "confirming" ? comparedCheck.reviewed : undefined;
  const applyReviewedCheck = (): void => {
    if (!aiVisible || !comparedCheck) return;
    setErrorKey(null);
    const result = applyCheckRevision(inputActions, checkRevisionBaseline(comparedCheck), input, comparedCheck.revision.body);
    if (result.kind === "confirm") editCheck({ type: "confirm", reviewed: result.reviewed });
    else if (result.kind === "applied") close();
    else setErrorKey("error.insert");
  };

  const needsFill = finalTemplate?.needsFill ?? needsValues(polished);
  const tryResult = (variable = ""): void => {
    if (needsFill) setFillTarget(variable);
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
      : status === "revisingCheck" ? "ai.checkGenerating"
      : status === "draftingPrompt" ? "ai.draft.generating"
      : status === "searchingDraft" ? "ai.draft.searching"
      : status === "refining" ? "ai.refining"
      : status === "saving" ? "ai.saving"
      : null;
  const empty = draft.trim() === "";
  const triggerDisabled = busyKey !== null;
  const hint = busyKey !== null ? t(busyKey) : t("ai.tip");
  const showRefined = status === "refined" || status === "saveFailed";
  const showTemplateResult = showRefined || status === "saved" || status === "writeBackFailed";
  const showCheck = status === "checking" || status === "checked";
  const showDraft = status === "draftPrompt" || status === "draftingPrompt" || status === "searchingDraft";
  const showMenu = status === "choose" || (status === "error" && !draftSession);
  const failedHandoffKey = mode === "check" ? "ai.check" : "ai.refine";
  const reportedCheck = composerCheck?.phase === "report" ? composerCheck : undefined;
  const draftCheck = draftSession?.checked;
  const checkStale = draftSession ? draftCheckIsStale(draftSession) : !!reportedCheck &&
    needsInsertionConfirmation("overwrite", reportedCheck.baseline, input);
  const checkAgain = canCheckAgain(checkStale, draftSession?.body ?? draft) ? () => run("check") : undefined;
  const showCheckRevision = status === "revisedCheck";
  const dialogLabel =
    showCheckRevision ? t("ai.checkRevised")
    : status === "error" && draftSession ? t(failedHandoffKey)
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
              variables={finalTemplate?.variables}
              t={t}
              panelSize={finalTemplate ? TEMPLATE_PANEL : { width: PANEL.width }}
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
              style={showCheckRevision ? CHECK_COMPARE_PANEL : showRefined || showDraft || replacement ? TEMPLATE_PANEL : status === "checked" ? CHECK_PANEL : showMenu ? MENU_PANEL : PANEL}
            >
              <span style={status === "checked" ? { ...PANEL_HEADER, flexShrink: 0 } : PANEL_HEADER}>
                <strong>{showCheckRevision ? t("ai.checkRevised") : status === "error" && draftSession ? t(failedHandoffKey) : t(showDraft ? "ai.draft.title" : showCheck ? "ai.check" : showRefined ? "ai.refine" : "ai.button")}</strong>
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
                  copyLabel={copyLabel("result")}
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
              {reportedCheck && (
                <PromptCheckReport t={t} report={reportedCheck.report} stale={checkStale} onCheckAgain={checkAgain}
                  onBack={() => {
                    // Discard report data but keep the menu scoped to this Composer until the next action.
                    setOwnedCheck({ owner: inputActions, session: null });
                    setStatus("choose");
                  }}
                  onCopy={copySuggestion} copyLabel={copyLabel}
                  actions={{ kind: "composer", selected: reportedCheck.selected, error: errorKey,
                    onSelect: (index, selected) => editCheck({ type: "select", index, selected }), onGenerate: generateCheckRevision }} />
              )}
              {status === "checked" && draftSession && draftCheck && (
                <PromptCheckReport t={t} report={draftCheck.report} stale={checkStale} onCheckAgain={checkAgain}
                  onBack={backToDraft} onCopy={copySuggestion} copyLabel={copyLabel}
                  actions={{ kind: "draft", canUseSuggestion: (finding) => draftSuggestionFeedback(draftSession, finding) !== undefined,
                    onUseSuggestion: (finding) => { updateDraft({ type: "useSuggestion", finding }); backToDraft(); } }} />
              )}
              {comparedCheck && (
                <PromptCheckRevisionPanel t={t} original={comparedCheck.baseline.draft} revision={comparedCheck.revision}
                  confirmation={checkApproval ? {
                    draft: checkApproval.draft, stale: needsInsertionConfirmation("overwrite", checkApproval, input),
                    onKeepEditing: () => { editCheck({ type: "keepEditing" }); setErrorKey(null); },
                  } : undefined}
                  error={errorKey} copyLabel={copyLabel("result")} canUseRevision={canUseCheckRevision(comparedCheck.revision.body)}
                  onEdit={(body) => { editCheck({ type: "editRevision", body }); setCopyFeedback(null); }}
                  onCopy={() => copy(comparedCheck.revision.body)} onApply={applyReviewedCheck} />
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
                      {t(copyLabel("result"))}
                    </button>
                    <button type="button" style={PRIMARY} disabled={!resultBody.trim()} onClick={() => tryResult()}>
                      {t(needsFill ? "ai.tryTemplate" : "ai.apply")}
                    </button>
                  </span>
                </>
              )}
              {!replacement && showTemplateResult && templateSession && finalTemplate && (
                <PromptTemplateResult
                  t={t}
                  session={templateSession}
                  final={finalTemplate}
                  saveResult={saveResult}
                  draftChanged={draftChanged}
                  copyLabel={copyLabel("result")}
                  onEdit={(edit) => setTemplateSession((session) => session && editTemplateRefinement(session, edit))}
                  onTry={tryResult}
                  onCopy={() => copy(finalTemplate.body)}
                  onSave={save}
                  onRetryWriteBack={retryWriteBack}
                  onBackToDraft={draftSession ? backToDraft : undefined}
                  onClose={close}
                />
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

const WAIT_STATUS: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: "2px 8px", flexShrink: 0 };
const WAIT_ELAPSED: React.CSSProperties = { ...MUTED, fontVariantNumeric: "tabular-nums" };

const MENU_PANEL: React.CSSProperties = { ...PANEL, width: "min(260px, calc(100vw - 120px))", gap: 10 };
const MENU_ACTIONS: React.CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 4, flexShrink: 0 };
const PRIMARY_MODE: React.CSSProperties = { ...MENU_BUTTON, color: TOKEN.accent, background: TOKEN.hover, fontWeight: 600 };
const PANEL_HEADER: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 };

const TEMPLATE_PANEL: React.CSSProperties = {
  ...PANEL,
  width: "min(520px, calc(100vw - 120px))",
  height: "min(510px, calc(100dvh - 130px))",
  maxHeight: undefined,
  overflow: "hidden",
  gap: 8,
};

const CHECK_PANEL: React.CSSProperties = {
  ...PANEL,
  width: TEMPLATE_PANEL.width,
  maxHeight: TEMPLATE_PANEL.height,
  overflow: "hidden",
  gap: 8,
};

const CHECK_COMPARE_PANEL: React.CSSProperties = {
  ...TEMPLATE_PANEL, width: "min(760px, calc(100vw - 120px))",
};
