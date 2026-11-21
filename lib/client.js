window.__ModuleLoader__.load({
  id: "dsh-prompt-enhancer",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/components/AIPolishButton.tsx
var React3 = __toESM(require("react"), 1);

// src/overlay-claim.ts
function canRender(kind, claimed) {
  return claimed === kind;
}
function canTakeHash(visible) {
  return visible;
}
function canRetakeHash(visible, claimed) {
  return visible && claimed !== "hash";
}

// src/client/components/PromptDraftForm.tsx
var React = __toESM(require("react"), 1);

// src/types.ts
var TITLE_MAX_LEN = 25;
var DEFAULT_MAX_PROMPT_COUNT = 300;
var API_PREFIX = "/api/prompt-enhancer";
function clampTitle(title) {
  return title.slice(0, TITLE_MAX_LEN);
}
var DRAFT_FEEDBACK_MAX_LENGTH = 2e3;
var DEFAULT_SETTINGS = {
  panelWidth: 420,
  panelHeight: 560,
  showComposerButton: true,
  composerButtonIconOnly: true,
  showAIPolishButton: true,
  aiPolishButtonIconOnly: true,
  hashTriggerEnabled: true,
  contextRecommendEnabled: true,
  selectionAddEnabled: true,
  showSidebarButton: true,
  maxPromptCount: DEFAULT_MAX_PROMPT_COUNT,
  aiProvider: "",
  aiModel: ""
};

// src/client/utils/theme.ts
var TOKEN = {
  bg: "var(--dsw-alias-bg-elevated, #ffffff)",
  fg: "var(--dsw-alias-text-primary, #1f2328)",
  muted: "var(--dsw-alias-text-secondary, #6b7280)",
  border: "var(--dsw-alias-border-secondary, #e5e7eb)",
  accent: "var(--dsw-alias-text-accent, #2563eb)",
  hover: "var(--dsw-alias-bg-hover, rgba(0,0,0,0.04))"
};
var TONE = {
  success: "var(--dsw-alias-state-success-primary, #15803d)",
  warn: "var(--dsw-alias-state-warn-label, #b45309)"
};
var overlayBase = {
  pointerEvents: "auto",
  background: TOKEN.bg,
  color: TOKEN.fg,
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 10,
  boxShadow: "0 8px 24px rgba(0,0,0,0.16)"
};

// src/client/utils/dialog-style.ts
var backdrop = {
  position: "fixed",
  inset: 0,
  zIndex: 100,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  background: "rgba(0, 0, 0, 0.35)"
};
function surface(width, height) {
  return {
    ...overlayBase,
    display: "flex",
    flexDirection: "column",
    width,
    height,
    maxWidth: "calc(100vw - 40px)",
    maxHeight: "calc(100vh - 40px)",
    overflow: "hidden",
    fontSize: 12
  };
}
var dialogHeader = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: "10px 12px",
  borderBottom: `1px solid ${TOKEN.border}`,
  flex: "0 0 auto"
};
var dialogHeaderTop = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap"
};
var dialogHeaderBottom = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap"
};
var dialogTitle = { color: TOKEN.fg, fontSize: 14, fontWeight: 600, overflowWrap: "anywhere" };
var dialogTabs = {
  display: "flex",
  gap: 4,
  flex: "1 1 auto",
  minWidth: 0,
  flexWrap: "wrap"
};
function dialogTab(active) {
  return {
    padding: "2px 10px",
    fontSize: 11,
    lineHeight: "18px",
    color: active ? TOKEN.fg : TOKEN.muted,
    background: active ? TOKEN.hover : "transparent",
    border: 0,
    borderRadius: 6,
    fontWeight: active ? 600 : 400,
    cursor: "pointer",
    whiteSpace: "nowrap",
    flex: "0 0 auto"
  };
}
var dialogBody = {
  flex: "1 1 auto",
  minHeight: 0,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 12
};
var toolbar = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 6,
  flex: "0 0 auto"
};
var textInput = {
  boxSizing: "border-box",
  minWidth: 0,
  padding: "4px 8px",
  color: TOKEN.fg,
  background: "transparent",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  fontSize: 12,
  fontFamily: "inherit"
};
var textArea = {
  ...textInput,
  width: "100%",
  resize: "vertical",
  padding: "6px 8px",
  lineHeight: 1.5
};
var select = { ...textInput, cursor: "pointer" };
var fieldLabel = { color: TOKEN.muted, fontSize: 11, flex: "0 0 auto", width: 42 };
var button = {
  padding: "2px 8px",
  fontSize: 11,
  lineHeight: "16px",
  color: TOKEN.fg,
  background: "transparent",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  cursor: "pointer",
  flex: "0 0 auto"
};
var primaryButton = { ...button, borderColor: TOKEN.accent, color: TOKEN.accent };
var actions = { display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", flex: "0 0 auto" };
var muted = { color: TOKEN.muted, fontSize: 11, overflowWrap: "anywhere" };
var errorText = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  color: TOKEN.fg,
  fontSize: 11
};
var errorDetail = { color: TOKEN.muted, overflowWrap: "anywhere" };
var listRow = {
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  padding: "6px 0",
  borderTop: `1px solid ${TOKEN.border}`
};
var rowText = { display: "flex", flexDirection: "column", gap: 2, flex: "1 1 auto", minWidth: 0 };
var rowTitle = {
  color: TOKEN.fg,
  fontSize: 12,
  fontWeight: 600,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap"
};
var rowMeta = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4 };
var tagChip = {
  color: TOKEN.accent,
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 999,
  padding: "0 6px",
  fontSize: 10
};
var compareGrid = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 };
var compareBlock = { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 };
var compareHead = { color: TOKEN.muted, fontSize: 11, fontWeight: 600 };
var compareBody = {
  flex: "1 1 auto",
  minHeight: 0,
  maxHeight: 180,
  overflowY: "auto",
  color: TOKEN.fg,
  fontSize: 11,
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  padding: "4px 6px"
};

// src/client/utils/draft-session.ts
function createDraftSession(composer) {
  return { composer, idea: composer.trim() ? composer : "", questions: [], answers: [], body: "", assumptions: [], feedback: "", step: "idea" };
}
function editDraftSession(session, edit) {
  switch (edit.type) {
    case "field": {
      const { field, value } = edit;
      if (field === "idea" || field === "executor") return { ...session, [field]: value, questions: [], answers: [] };
      if (field === "query") return { ...session, query: value, search: void 0 };
      return { ...session, [field]: value };
    }
    case "answer":
      return { ...session, answers: session.answers.map((answer, index) => index === edit.index ? edit.value : answer) };
    case "searched":
      return { ...session, search: edit.search };
    case "checked":
      return { ...session, checked: { snapshot: edit.snapshot, report: edit.report } };
    case "useSuggestion": {
      const feedback = draftSuggestionFeedback(session, edit.finding);
      return feedback === void 0 ? session : { ...session, feedback, step: "result" };
    }
    case "editInputs":
      return { ...session, step: session.questions.length ? "questions" : "idea" };
    case "editIdea":
      return { ...session, step: "idea" };
    case "returnResult":
      return session.generatedFrom ? { ...session, step: "result" } : session;
  }
}
function prepareDraftGeneration(session, action) {
  const { step, generatedFrom, body, feedback, idea, executor, references, search, questions, answers } = session;
  if (action === "revise") {
    if (step !== "result" || !generatedFrom || !body.trim() || !feedback.trim() || feedback.length > DRAFT_FEEDBACK_MAX_LENGTH) return;
    return { ...generatedFrom, revision: { body, feedback: feedback.trim() } };
  }
  if (!idea.trim() || step === "result" || action === "skip" && step !== "questions") return;
  if (step === "questions" && action === "generate" && !answers.some((answer) => answer.trim())) return;
  return {
    idea,
    ...executor?.trim() ? { executor: executor.trim() } : {},
    ...references?.trim() ? { references: references.trim() } : {},
    ...search?.status === "found" && search.sources.length ? { sources: search.sources } : {},
    // The host distinguishes absent answers (may clarify) from present empty answers (skipped).
    ...step === "questions" ? {
      answers: questions.map(({ question }, index) => ({ question, answer: action === "skip" ? "" : answers[index]?.trim() ?? "" }))
    } : {}
  };
}
async function generateDraft(session, request, signal, send) {
  if (signal.aborted) return;
  const result = await send(request, signal);
  if (signal.aborted) return;
  const { revision, ...generatedFrom } = request;
  if (result.kind === "clarify") {
    if (revision || generatedFrom.answers !== void 0) throw new Error("Unexpected second draft clarification");
    return { ...session, step: "questions", questions: result.questions, answers: result.questions.map(() => "") };
  }
  if (revision) generatedFrom.feedbackHistory = [...generatedFrom.feedbackHistory ?? [], revision.feedback];
  const { body, understanding, assumptions, missingInputs, toVerify } = result;
  return {
    ...session,
    step: "result",
    body,
    understanding,
    assumptions,
    missingInputs,
    toVerify,
    generatedFrom,
    feedback: "",
    ...!revision && generatedFrom.answers === void 0 ? { questions: [], answers: [] } : {}
  };
}
function prepareDraftHandoff(session) {
  const { body, generatedFrom } = session;
  return session.step === "result" && generatedFrom && body.trim() ? { body, generatedFrom } : void 0;
}
function draftCheckIsStale(session) {
  const snapshot2 = session.checked?.snapshot;
  return snapshot2 !== void 0 && (session.body !== snapshot2.body || session.generatedFrom !== snapshot2.generatedFrom);
}
function draftSuggestionFeedback(session, finding) {
  if (!session.checked?.report.findings.includes(finding) || draftCheckIsStale(session)) return;
  const { suggestion } = finding;
  const previous = session.feedback.trim();
  const feedback = previous ? previous + "\n\n" + suggestion : suggestion;
  return feedback.length <= DRAFT_FEEDBACK_MAX_LENGTH ? feedback : void 0;
}
function requestDraftApplication(session, current2, proposed) {
  return current2 === session.composer ? { kind: "apply", text: proposed } : { kind: "confirm", current: current2, proposed };
}
function confirmDraftApplication(replacement, current2) {
  return current2 === replacement.current ? { kind: "apply", text: replacement.proposed } : { ...replacement, current: current2 };
}

// src/client/components/PromptDraftForm.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function PromptDraftForm({
  t,
  session,
  busy,
  error,
  update,
  generate,
  onSearch,
  onBack,
  onApply,
  onCheck,
  onViewCheck,
  onEnhance,
  onCopy,
  copyLabel
}) {
  const { idea, questions, answers, body, understanding, assumptions, missingInputs = [], step } = session;
  const { query = "", search, executor = "", references = "", toVerify = [], generatedFrom, feedback } = session;
  const [initialFeedbackOpen] = React.useState(() => !!feedback.trim());
  const draftSources = generatedFrom?.sources ?? [];
  const sources = search?.status === "found" ? search.sources : [];
  const searchNotice = search?.status === "unavailable" ? "ai.draft.searchUnavailable" : search?.status === "empty" ? "ai.draft.searchEmpty" : search?.status === "failed" ? "ai.draft.searchFailed" : void 0;
  const canGenerate = prepareDraftGeneration(session, "generate") !== void 0;
  const canHandoff = !busy && prepareDraftHandoff(session) !== void 0;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: CONTENT, children: [
      error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { role: "alert", children: t(error) }),
      step === "idea" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "textarea",
          {
            "aria-label": t("ai.draft.idea"),
            placeholder: t("ai.draft.example"),
            value: idea,
            autoFocus: true,
            readOnly: busy,
            style: EDITOR,
            onChange: (event) => update({ type: "field", field: "idea", value: event.target.value })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { style: ASSUMPTIONS, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { children: t("ai.draft.executor") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "textarea",
            {
              "aria-label": t("ai.draft.executor"),
              placeholder: t("ai.draft.executorExample"),
              value: executor,
              maxLength: 1e3,
              rows: 2,
              style: textArea,
              readOnly: busy,
              onChange: (event) => update({ type: "field", field: "executor", value: event.currentTarget.value })
            }
          )
        ] })
      ] }),
      step === "questions" && questions.map(({ question, options }, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("fieldset", { style: QUESTION, disabled: busy, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("legend", { style: LEGEND, children: question }),
        options.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: OPTIONS, children: options.map((option) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            style: answers[index] === option ? primaryButton : button,
            "aria-pressed": answers[index] === option,
            onClick: () => update({ type: "answer", index, value: option }),
            children: option
          },
          option
        )) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "textarea",
          {
            "aria-label": question,
            placeholder: t("ai.draft.answer"),
            value: answers[index] ?? "",
            rows: 2,
            style: textArea,
            onChange: (event) => update({ type: "answer", index, value: event.target.value })
          }
        )
      ] }, question)),
      step !== "result" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { style: ASSUMPTIONS, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { children: t("ai.draft.research") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: RESEARCH_FIELDS, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: OPTIONS, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                type: "text",
                "aria-label": t("ai.draft.query"),
                placeholder: t("ai.draft.query"),
                maxLength: 240,
                value: query,
                disabled: busy,
                style: { ...textInput, flex: "1 1 150px" },
                onChange: (event) => update({ type: "field", field: "query", value: event.currentTarget.value })
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: button, disabled: busy || !query.trim(), onClick: () => onSearch(query), children: t("ai.draft.search") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: muted, children: t("ai.draft.queryHint") }),
          searchNotice && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { role: "status", children: t(searchNotice) }),
          sources.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DraftSources, { t, sources }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "textarea",
            {
              "aria-label": t("ai.draft.references"),
              placeholder: t("ai.draft.references"),
              value: references,
              maxLength: 4e3,
              rows: 2,
              style: textArea,
              disabled: busy,
              onChange: (event) => update({ type: "field", field: "references", value: event.currentTarget.value })
            }
          )
        ] })
      ] }),
      step === "result" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        understanding && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: ASSUMPTIONS, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: t("ai.draft.understanding") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: understanding })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "textarea",
          {
            "aria-label": t("ai.draft.result"),
            value: body,
            style: EDITOR,
            readOnly: busy,
            onChange: (event) => update({ type: "field", field: "body", value: event.target.value })
          }
        ),
        generatedFrom && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { open: initialFeedbackOpen, style: ASSUMPTIONS, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { children: t("ai.draft.revise") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: RESEARCH_FIELDS, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "textarea",
              {
                "aria-label": t("ai.draft.feedback"),
                placeholder: t("ai.draft.feedbackExample"),
                value: feedback,
                maxLength: DRAFT_FEEDBACK_MAX_LENGTH,
                rows: 2,
                style: textArea,
                readOnly: busy,
                onChange: (event) => update({ type: "field", field: "feedback", value: event.currentTarget.value })
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: OPTIONS, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                type: "button",
                style: button,
                disabled: busy || !prepareDraftGeneration(session, "revise"),
                onClick: () => generate("revise"),
                children: t("ai.draft.revise")
              }
            ) })
          ] })
        ] }),
        assumptions.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { open: true, style: ASSUMPTIONS, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { children: t("ai.draft.assumptions") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { style: ASSUMPTION_LIST, children: assumptions.map((assumption) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: assumption }, assumption)) })
        ] }),
        missingInputs.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { open: true, style: ASSUMPTIONS, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { children: t("ai.draft.missingInputs") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { style: ASSUMPTION_LIST, children: missingInputs.map((input) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: input }, input)) })
        ] }),
        toVerify.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { open: true, style: ASSUMPTIONS, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { children: t("ai.draft.toVerify") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { style: ASSUMPTION_LIST, children: toVerify.map((step2) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: step2 }, step2)) })
        ] }),
        draftSources.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DraftSources, { t, sources: draftSources }),
        draftCheckIsStale(session) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { role: "status", style: muted, children: t("ai.draft.checkStale") })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("footer", { style: FOOTER, children: [
      step !== "result" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        step === "idea" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: button, disabled: busy, onClick: onBack, children: t("ai.backToActions") }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            style: button,
            disabled: busy,
            onClick: () => update({ type: "editIdea" }),
            children: t("ai.draft.editIdea")
          }
        ),
        generatedFrom && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            style: button,
            disabled: busy,
            onClick: () => update({ type: "returnResult" }),
            children: t("ai.draft.backToResult")
          }
        ),
        step === "questions" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            style: canGenerate ? button : primaryButton,
            disabled: busy,
            onClick: () => generate("skip"),
            children: t("ai.draft.skip")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            style: primaryButton,
            disabled: busy || !canGenerate,
            onClick: () => generate("generate"),
            children: t("ai.draft.generate")
          }
        )
      ] }),
      step === "result" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: button, disabled: busy, onClick: () => update({ type: "editInputs" }), children: t(questions.length ? "ai.draft.editAnswers" : "ai.draft.editIdea") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: button, disabled: busy || !body.trim(), onClick: onCopy, children: t(copyLabel) }),
        session.checked && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            style: button,
            disabled: busy,
            onClick: onViewCheck,
            children: t("ai.draft.viewCheck")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: button, disabled: !canHandoff, onClick: onCheck, children: t("ai.check") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: button, disabled: !canHandoff, onClick: onEnhance, children: t("ai.refine") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: primaryButton, disabled: !canHandoff, onClick: onApply, children: t("ai.apply") })
      ] })
    ] })
  ] });
}
function DraftSources({ t, sources }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { open: true, style: ASSUMPTIONS, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { children: t("ai.draft.sources") }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { style: ASSUMPTION_LIST, children: sources.map(({ url, title }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", { href: url, target: "_blank", rel: "noopener noreferrer", style: { color: TOKEN.accent }, children: title || url }) }, url)) })
  ] });
}
var CONTENT = { display: "grid", alignContent: "start", gap: 10, flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: 2 };
var EDITOR = { ...textArea, minHeight: "clamp(130px, 35dvh, 280px)", padding: 10, fontSize: 13 };
var QUESTION = { minWidth: 0, margin: 0, border: 0, padding: "4px 0 8px" };
var LEGEND = { padding: 0, fontWeight: 600, overflowWrap: "anywhere" };
var OPTIONS = { display: "flex", gap: 6, flexWrap: "wrap", margin: "2px 0 6px" };
var ASSUMPTIONS = { color: TOKEN.muted, overflowWrap: "anywhere" };
var ASSUMPTION_LIST = { margin: "4px 0", paddingInlineStart: 20 };
var RESEARCH_FIELDS = { display: "grid", gap: 6, marginTop: 6 };
var FOOTER = { ...actions, borderTop: `1px solid ${TOKEN.border}`, paddingTop: 8 };

// src/backup-transfer.ts
var MAX_REQUEST_BODY_BYTES = 5 * 1024 * 1024;
function makeImportRequest(backup, confirm) {
  return { backup, confirm };
}
var IMPORT_REQUEST_OVERHEAD = JSON.stringify(makeImportRequest(null, false)).length - "null".length;

// src/client/utils/api.ts
var AI_TIMEOUT_MS = 12e4;
var STRUCTURED_AI_TIMEOUT_MS = 225e3;
var AI_PROBE_TIMEOUT_MS = 15e3;
var CLEAR_TIMEOUT_MS = 15e3;
var PROMPT_VERIFICATION_TIMEOUT_MS = 5e3;
function isTimeoutAbort(err) {
  if (typeof err !== "object" || err === null) return false;
  const name = err.name;
  return name === "TimeoutError" || name === "AbortError";
}
var ApiError = class extends Error {
  status;
  /**
   * T7-7：true = 这次失败发生在**探测**路径（`GET /ai/providers`，见 `listAiProviders`）。
   *
   * 只有「探测 + 本客户端主动超时」这一条路径会置位（`call()` 里唯一的 `probe` 传出点），
   * 故它等价于「探测超时」：探测拿到 4xx/5xx 走的是信封路径，构造时 `probe` 仍是缺省 false。
   * 探测超时与 AI 调用超时都是「超时」，但用户要做的事不同（探测 = 没有可用模型 / 网络不通；
   * 调用 = 模型太慢），故必须**分类可辨**（`ai-flow.ts#aiErrorKey` 据此给不同的文案键）。
   */
  probe;
  /**
   * T3：宿主 AI 失败信封 `error: { code }` 里的**跨层错误码**（`src/host/ai-errors.ts` 枚举）。
   * 只有 AI 分支会带 code；其余路由的旧形字符串信封在此缺省 `undefined`——客户端分类
   * （`ai-flow.ts`）先看 code、再退回 status / name 判定，对信封形状变更透明。
   */
  code;
  skillConflict;
  constructor(message, status, probe = false, code, skillConflict) {
    super(message);
    this.status = status;
    this.probe = probe;
    this.code = code;
    this.skillConflict = skillConflict;
  }
};
function readSkillConflict(value) {
  if (typeof value !== "object" || value === null) return void 0;
  const { name, token } = value;
  return typeof name === "string" && name !== "" && typeof token === "string" && token !== "" ? { name, token } : void 0;
}
function envelopeCode(error) {
  if (typeof error !== "object" || error === null) return void 0;
  const code = error.code;
  return typeof code === "string" && code !== "" ? code : void 0;
}
function envelopeMessage(error, fallback) {
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    const message = error.message;
    if (typeof message === "string" && message !== "") return message;
    const code = envelopeCode(error);
    if (code) return code;
  }
  return fallback;
}
async function call(method, path, body, timeoutMs, probe = false, callerSignal, cache) {
  const deadline = timeoutMs === void 0 ? void 0 : AbortSignal.timeout(timeoutMs);
  const signal = callerSignal && deadline ? AbortSignal.any([callerSignal, deadline]) : callerSignal ?? deadline;
  let res;
  try {
    res = await fetch(API_PREFIX + path, {
      method,
      headers: body === void 0 ? void 0 : { "Content-Type": "application/json" },
      body: body === void 0 ? void 0 : JSON.stringify(body),
      signal,
      ...cache ? { cache } : {}
    });
  } catch (e) {
    if (probe && isTimeoutAbort(e)) throw new ApiError("\u63A2\u6D4B\u53EF\u7528\u7684 AI \u6A21\u578B\u8D85\u65F6", 0, true);
    throw e;
  }
  let parsed;
  try {
    parsed = await res.json();
  } catch (e) {
    if (signal?.aborted) signal.throwIfAborted();
    throw new ApiError(`\u54CD\u5E94\u4E0D\u662F\u5408\u6CD5 JSON\uFF08HTTP ${res.status}\uFF09\uFF1A${String(e)}`, res.status);
  }
  if (parsed.data === void 0) {
    const fallback = `\u8BF7\u6C42\u5931\u8D25\uFF08HTTP ${res.status}\uFF09`;
    const conflict = res.status === 409 && typeof parsed.error === "object" ? readSkillConflict(parsed.error?.conflict) : void 0;
    throw new ApiError(envelopeMessage(parsed.error, fallback), res.status, false, envelopeCode(parsed.error), conflict);
  }
  return parsed.data;
}
var api = {
  listPrompts: (opts = {}) => {
    const qs = new URLSearchParams();
    if (opts.q) qs.set("q", opts.q);
    if (opts.tag) qs.set("tag", opts.tag);
    if (opts.sort) qs.set("sort", opts.sort);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return call("GET", `/prompts${suffix}`);
  },
  recordUsage: (id) => call("POST", `/prompts/${encodeURIComponent(id)}/use`),
  getSettings: () => call("GET", "/settings"),
  /** 写设置（降级路径：无 `configForms` 时用；有 form 时写走宿主 ConfigForm.set）。 */
  updateSettings: (patch) => call("PUT", "/settings", patch),
  getMeta: (key) => call("GET", `/meta/${encodeURIComponent(key)}`).then((r) => r.value),
  setMeta: (key, value, timeoutMs) => call("PUT", `/meta/${encodeURIComponent(key)}`, { value }, timeoutMs),
  /**
   * 删一条 meta KV（`DELETE /meta/:key`，T6 / O-1）。**幂等**：键不存在时宿主同样回 ok
   * （`deleted: false` 只说明「这次没删到行」，不是失败）。**通用通道**：键名约定（`pl:...`）
   * 归调用方，宿主不认识它——故这里也不做任何键名特判，调用方拼好键名传进来即可。
   *
   * **超时（T7-1 / P7 §10.4-1）**：挂 `CLEAR_TIMEOUT_MS`（有界、独立命名）。到点 ⇒ `AbortSignal.timeout`
   * 中断请求 ⇒ `fetch` 拒绝（`DOMException: TimeoutError`）⇒ `deletePrompts` 的 `Promise.allSettled`
   * 记一笔 failed 并 `console.warn`。修前不设超时：挂住的 DELETE 让收尾永不落定，连 warn 都没有。
   */
  deleteMeta: (key) => call("DELETE", `/meta/${encodeURIComponent(key)}`, void 0, CLEAR_TIMEOUT_MS),
  createPrompt: (input) => call("POST", "/prompts", input),
  /** 普通编辑只发可写字段；`aiWriteBack` 请求宿主派生 AI 来源，不直接提交来源或技能归属。 */
  updatePrompt: (id, patch) => call("PUT", "/prompts/" + encodeURIComponent(id), patch),
  rollbackPrompt: (id, contentVersion) => call("POST", "/prompts/" + encodeURIComponent(id) + "/rollback", contentVersion ? { contentVersion } : void 0),
  /** 探测（T7-7）：`probe = true` ⇒ 到点抛**带标记**的 ApiError，分类器据此给「探测超时」专属文案。 */
  listAiProviders: () => call("GET", "/ai/providers", void 0, AI_PROBE_TIMEOUT_MS, true),
  /**
   * `keepVariables` **必填**（P5 延期 #9 / T6-A3）：缺省 `true` 会让漏传的调用方静默落回被否决的
   * 常量，改成必填即由编译期拦住漏传。运行期仍按 `!== false` 判定，JS 调用方缺省时的旧行为不变。
   */
  polishPrompt: (body, opts, signal) => call(
    "POST",
    "/ai/polish",
    { body, keepVariables: opts.keepVariables !== false, withSummary: false },
    AI_TIMEOUT_MS,
    false,
    signal
  ),
  checkPrompt: (body, signal, draftContext) => call("POST", "/ai/check", { body, draftContext }, STRUCTURED_AI_TIMEOUT_MS, false, signal),
  draftPrompt: (request, signal) => call("POST", "/ai/draft", request, STRUCTURED_AI_TIMEOUT_MS, false, signal),
  searchDraft: (query, signal) => call("POST", "/ai/draft/search", { query }, AI_PROBE_TIMEOUT_MS, false, signal),
  refinePrompt: (body, signal) => call("POST", "/ai/refine", { body }, STRUCTURED_AI_TIMEOUT_MS, false, signal),
  /**
   * 逐条 AI 补全技能名与描述（`POST /ai/skill-descriptor`；规格 §7.6 的「AI 补全名称与描述」）。
   *
   * `body` 必填（宿主空 body 直接 400「缺少 body」）；`title` / `summary` / `tags` 是上下文，
   * 宿主原样喂给提示词。走 `AI_TIMEOUT_MS`（同 /ai/polish）；
   * AI 不可用 → 宿主 **503**，经 `call()` 变成带 status 的 ApiError（失败必须可见）。
   */
  aiSkillDescriptor: (input) => call("POST", "/ai/skill-descriptor", input, AI_TIMEOUT_MS),
  // ── 技能导出（P7 T2）──────────────────────────────────────────────────
  /**
   * 导出为官方 DSH 技能（`POST /skills/export`）。**不设超时**（写盘，同其余非 AI 路由，
   * 保持 P4 行为）。错误映射全部走 `call()` 的信封路径，调用方**按 status 分类**、不匹配文案：
   *   · 400 技能名非法 / description 兜底链全空（宿主原文）；
   *   · 404 提示词不存在；
   *   · 409 带宿主锁定的技能名及 `conflictToken`；确认后仅用该凭据重试。
   * 缺省不发的键由 `JSON.stringify` 丢弃：只传 `promptId` 时宿主自己推名字，候选序为
   * `prompt.skillName（非空）→ body.name → descriptor?.name`（**唯一事实源**：`routes.ts` 的技能导出分支）。
   */
  exportPromptAsSkill: (input) => call("POST", "/skills/export", input),
  // ── 提示词：单条读写（P6）──────────────────────────────────────────────
  /** 单条读取，不复用缓存；确认取用时传 signal，使等待有界且可取消。 */
  getPrompt: (id, signal) => call(
    "GET",
    "/prompts/" + encodeURIComponent(id),
    void 0,
    signal ? PROMPT_VERIFICATION_TIMEOUT_MS : void 0,
    false,
    signal,
    "no-store"
  ),
  /** 软删除：进回收站（规格 §4.4），故返回的是「已删除」而不是被删实体。 */
  deletePrompt: (id) => call("DELETE", "/prompts/" + encodeURIComponent(id)),
  // ── 标签（P6）──────────────────────────────────────────────────────────
  listTags: () => call("GET", "/tags"),
  createTag: (name) => call("POST", "/tags", { name }),
  /** 改名：旧名是路径段，新名在新体（宿主 PUT 只读 body.to）。 */
  renameTag: (from, to) => call("PUT", "/tags/" + encodeURIComponent(from), { to }),
  /** 在用标签宿主回 400 并带用量（信封失败 → ApiError.status === 400），调用方按状态分类。 */
  deleteTag: (name) => call("DELETE", "/tags/" + encodeURIComponent(name)),
  // ── 回收站（P6）────────────────────────────────────────────────────────
  listTrash: () => call("GET", "/trash"),
  restoreTrash: (id) => call("POST", "/trash/" + encodeURIComponent(id) + "/restore"),
  deleteTrash: (id) => call("DELETE", "/trash/" + encodeURIComponent(id)),
  /**
   * 清空回收站（T7 ⑦ / 修复轮 1）。回执**同时**给两样：
   *   · `removed` = 被删**条数**（既有形状，未变——不破坏任何既有读法）；
   *   · `ids` = 被**物理删除的 id 列表**——客户端按**它**清 per-prompt meta（`prompt-meta.ts#deletePrompts`）；
   *     面板列出的 items 是**打开那一刻**的快照，清空与列表之间的竞态窗口内新增的行同样被删，
   *     却不在快照里（按快照清键就会留下残键）。`ids.length === removed`。
   */
  emptyTrash: () => call("DELETE", "/trash"),
  // ── 导入导出（P6）──────────────────────────────────────────────────────
  /**
   * 导入备份。**只是信封封装，语义照宿主**（P6-4 裁定）：confirm 不为 true 时宿主只回预览
   * （applied: false + stats），且**不**自动淘汰超限条目（「导入不淘汰」是用户裁定）。
   * confirm 缺省时不发该键（宿主同判为未确认），调用方显式传 true 才落库。
   */
  importBackup: (backup, confirm) => call("POST", "/import", makeImportRequest(backup, confirm)),
  /** 把备份写到宿主可写的绝对路径目录；文件名由服务端生成（客户端不能指定任意文件名）。 */
  exportBackup: (dir) => call("POST", "/export/save", { dir })
};

// src/first-line.ts
function firstNonEmptyLine(text) {
  const line = text.split(/\r\n|\n|\r/).find((candidate) => candidate.trim() !== "") ?? "";
  return line.trim();
}

// src/client/utils/template.ts
function parseVariables(body) {
  const out = [];
  for (const m of body.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
    const name = m[1].trim();
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}
function templateValue(values, name) {
  const value = Object.hasOwn(values, name) ? values[name] : void 0;
  return value?.trim() ? value : void 0;
}
function unfilledVariables(names, values) {
  return names.filter((name) => templateValue(values, name) === void 0);
}
function fillTemplate(body, values) {
  return body.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (whole, raw) => {
    return templateValue(values, raw.trim()) ?? whole;
  });
}
function needsValues(body) {
  return parseVariables(body).length > 0;
}
function templateMemoryKey(promptId) {
  return `pl:template-var-memory:${promptId}`;
}
function parseMemory(raw) {
  if (raw.trim() === "") return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === "string"));
  } catch (err) {
    console.warn("[prompt-enhancer] \u6A21\u677F\u53D8\u91CF\u8BB0\u5FC6\u4E0D\u662F\u5408\u6CD5 JSON", err);
    return {};
  }
}
function pickRemembered(body, memory) {
  return Object.fromEntries(parseVariables(body).flatMap((name) => {
    const value = templateValue(memory, name);
    return value === void 0 ? [] : [[name, value]];
  }));
}
function initialTemplateValues(body, variables) {
  const configured = new Map(variables.map((variable) => [variable.name, variable]));
  const entries = [];
  for (const name of parseVariables(body)) {
    const value = configured.get(name)?.defaultValue;
    if (value !== void 0) entries.push([name, value]);
  }
  return Object.fromEntries(entries);
}
function updateTemplateVariable(variables, name, field, value) {
  return [
    ...variables.filter((item) => item.name !== name),
    { ...variables.find((item) => item.name === name), name, [field]: value }
  ];
}

// src/client/utils/ai-flow.ts
function keepVariablesFor(draft) {
  return needsValues(draft);
}
function libraryCreateInput(refined, originalDraft) {
  const firstLine = firstNonEmptyLine(originalDraft);
  return {
    // AI 标题只有空白字符时等于没给标题：判据用 trim，兜底后才交给 clampTitle。
    title: clampTitle(refined.title.trim() || firstLine),
    body: originalDraft,
    tags: refined.tags.slice(0, 1),
    summary: refined.summary
  };
}
function needsWriteBack(refinedBody, originalDraft) {
  return refinedBody !== originalDraft;
}
async function writeBackRefined(input) {
  const updated = await input.update(input.promptId, {
    body: input.body,
    aiWriteBack: true,
    ...input.contentVersion ? { contentVersion: input.contentVersion } : {},
    ...input.variables?.length ? { variables: input.variables } : {}
  });
  try {
    await input.seed(input.promptId);
  } catch (err) {
    console.warn("[prompt-enhancer] \u5199\u56DE\u6210\u529F\u4F46\u65B9\u5411\u8BB0\u5F55\u64AD\u79CD\u5931\u8D25\uFF08\u91CD\u5F00\u8BE6\u60C5\u9875\u4F1A\u9000\u56DE\u4E2D\u6027\u6807\u6CE8\uFF09", err);
  }
  return updated;
}
function canToggle(current2) {
  return Boolean(current2.sourceBody);
}
function errorName(err) {
  if (typeof err !== "object" || err === null) return void 0;
  const name = err.name;
  return typeof name === "string" ? name : void 0;
}
function statusOf(err) {
  if (typeof err !== "object" || err === null || !("status" in err)) return void 0;
  const status = err.status;
  return typeof status === "number" ? status : void 0;
}
function isProbeTimeout(err) {
  return err instanceof ApiError && err.probe;
}
function errorCodeOf(err) {
  return err instanceof ApiError ? err.code : void 0;
}
function keyForCode(code) {
  switch (code) {
    case "no-llm":
      return "ai.code.noLlm";
    case "route":
      return "ai.code.route";
    case "timeout":
      return "ai.code.timeout";
    case "empty-output":
      return "ai.code.emptyOutput";
    case "parse":
      return "ai.code.parse";
    case "schema-mismatch":
      return "ai.code.schemaMismatch";
    default:
      return "ai.fail";
  }
}
function isLocalTimeout(err) {
  return errorName(err) === "TimeoutError";
}
function aiErrorKey(err) {
  if (isProbeTimeout(err)) return "ai.probeTimeout";
  const code = errorCodeOf(err);
  if (code !== void 0) return keyForCode(code);
  if (isLocalTimeout(err)) return "ai.timeout";
  if (statusOf(err) === 503) return "ai.unavailable";
  return "ai.fail";
}
function refinedBodySections(body, suggestions, selected) {
  const additions = suggestions.filter((_, index) => selected.includes(index));
  return [
    { text: additions.length ? body.trimEnd() : body, addition: false },
    ...additions.map((text) => ({ text: "\n\n" + text, addition: true }))
  ];
}
function composeRefinedBody(body, suggestions, selected) {
  return refinedBodySections(body, suggestions, selected).map(({ text }) => text).join("");
}
function missingVariables(original, result) {
  const present = new Set(parseVariables(result));
  return parseVariables(original).filter((name) => !present.has(name));
}
function markAddedVariables(body, original) {
  const existing = new Set(parseVariables(original));
  return body.split(/(\{\{[^{}]+\}\})/g).map((text, index) => {
    const name = index % 2 === 1 ? parseVariables(text)[0] : void 0;
    return { text, name, added: name !== void 0 && !existing.has(name) };
  });
}

// src/client/utils/icon-only.ts
function showsLabel(iconOnly) {
  return iconOnly === false;
}

// src/client/components/TemplateVariableFields.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function TemplateVariableFields({ names, variables, t, onChange }) {
  return names.map((name) => {
    const variable = variables.find((item) => item.name === name);
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("fieldset", { style: FIELDS, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("legend", { style: { overflowWrap: "anywhere", maxWidth: "100%" }, children: name }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { style: FIELD, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: LABEL, children: t("vars.description") }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "input",
          {
            style: INPUT,
            value: variable?.description ?? "",
            onChange: (event) => onChange(name, "description", event.currentTarget.value)
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { style: FIELD, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: LABEL, children: t("vars.defaultValue") }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "input",
          {
            style: INPUT,
            value: variable?.defaultValue ?? "",
            onChange: (event) => onChange(name, "defaultValue", event.currentTarget.value)
          }
        )
      ] })
    ] }, name);
  });
}
var FIELDS = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
  gap: 8,
  minWidth: 0,
  border: 0,
  margin: "8px 0",
  padding: 0
};
var FIELD = { display: "grid", gap: 4, minWidth: 0 };
var LABEL = { color: TOKEN.muted, fontSize: 12 };
var INPUT = { ...textInput, fontSize: 13, padding: "7px 9px" };

// src/client/components/TemplateVariablesDialog.tsx
var React2 = __toESM(require("react"), 1);

// src/client/utils/i18n.ts
var NS = "prompt-enhancer";
var zh = {
  "button.title": "\u8BCD\u5E93",
  "button.tip": "\u6253\u5F00\u63D0\u793A\u8BCD\u5E93",
  "list.title": "\u5E38\u7528\u63D0\u793A\u8BCD",
  "list.empty": "\u8FD8\u6CA1\u6709\u63D0\u793A\u8BCD",
  "list.loading": "\u52A0\u8F7D\u4E2D\u2026",
  "list.filter": "\u7B5B\u9009\u63D0\u793A\u8BCD",
  "list.filterPlaceholder": "\u7B5B\u9009\u6807\u9898 / \u6807\u7B7E / \u6B63\u6587",
  "list.overflow": " \u6761\u672A\u663E\u793A \xB7 \u53BB\u7BA1\u7406\u9762\u677F\u641C\u7D22",
  "action.insert": "\u63D2\u5165",
  "action.overwrite": "\u8986\u76D6",
  "action.send": "\u63D2\u5165\u5E76\u53D1\u9001",
  "hash.title": "\u9009\u62E9\u63D0\u793A\u8BCD",
  "hash.empty": "\u6CA1\u6709\u5339\u914D\u7684\u63D0\u793A\u8BCD",
  // 上下文推荐条（P8 T3 / 验收 11）：行首标签，同时用作 role="group" 的无障碍名。
  "recommend.title": "\u63A8\u8350",
  "vars.title": "\u586B\u5145\u6A21\u677F\u53D8\u91CF",
  "vars.settings": "\u6A21\u677F\u53D8\u91CF\u914D\u7F6E",
  "vars.description": "\u586B\u5199\u8BF4\u660E",
  "vars.defaultValue": "\u9ED8\u8BA4\u503C",
  "ai.lightPolish": "\u8F7B\u5EA6\u6DA6\u8272",
  "ai.check": "\u68C0\u67E5\u63D0\u793A\u8BCD",
  "ai.checking": "\u6B63\u5728\u68C0\u67E5\u63D0\u793A\u8BCD\u2026",
  "ai.checkClear": "AI \u672A\u53D1\u73B0\u9700\u8981\u5904\u7406\u7684\u95EE\u9898\u3002",
  "ai.checkReport": "\u68C0\u67E5\u62A5\u544A",
  "ai.checkSuggestion": "\u5EFA\u8BAE",
  "ai.checkStale": "\u8F93\u5165\u6846\u5185\u5BB9\u5DF2\u53D8\u5316\u3002\u4E0B\u65B9\u7ED3\u679C\u9488\u5BF9\u68C0\u67E5\u65F6\u7684\u8349\u7A3F\u3002",
  "ai.checkAgain": "\u68C0\u67E5\u5F53\u524D\u8349\u7A3F",
  "ai.backToActions": "\u8FD4\u56DE AI \u64CD\u4F5C",
  "ai.draft.title": "\u4ECE\u60F3\u6CD5\u8D77\u8349",
  "ai.draft.idea": "\u4F60\u7684\u60F3\u6CD5",
  "ai.draft.example": "\u4F8B\u5982\uFF0C\u5E2E\u6211\u770B\u770B\u9879\u76EE\u6784\u5EFA\u4E3A\u4EC0\u4E48\u8FD9\u4E48\u6162\u3002",
  "ai.draft.executor": "\u6267\u884C\u6A21\u578B\u4E0E\u73AF\u5883\uFF08\u53EF\u9009\uFF09",
  "ai.draft.executorExample": "\u4F8B\u5982\uFF0C\u7ED9\u80FD\u53EA\u8BFB\u8BBF\u95EE\u4ED3\u5E93\u7684\u7F16\u7A0B\u4EE3\u7406\u3002\u5B83\u770B\u4E0D\u5230\u5F53\u524D\u804A\u5929\u3002",
  "ai.draft.answer": "\u9009\u62E9\u4E00\u4E2A\u9009\u9879\uFF0C\u6216\u5199\u4E0B\u81EA\u5DF1\u7684\u56DE\u7B54",
  "ai.draft.skip": "\u8DF3\u8FC7\u95EE\u9898\uFF0C\u5148\u751F\u6210\u4E00\u7248",
  "ai.draft.generate": "\u751F\u6210\u63D0\u793A\u8BCD",
  "ai.draft.generating": "\u6B63\u5728\u8D77\u8349\u63D0\u793A\u8BCD\u2026",
  "ai.draft.editIdea": "\u4FEE\u6539\u60F3\u6CD5",
  "ai.draft.editAnswers": "\u4FEE\u6539\u56DE\u7B54",
  "ai.draft.result": "\u63D0\u793A\u8BCD\u8349\u7A3F",
  "ai.draft.understanding": "\u8D77\u8349\u65F6\u7406\u89E3\u7684\u9700\u6C42",
  "ai.draft.revise": "\u6309\u53CD\u9988\u6539\u5199",
  "ai.draft.useSuggestion": "\u5E26\u5165\u6539\u5199\u53CD\u9988",
  "ai.draft.feedback": "\u4FEE\u6539\u8981\u6C42",
  "ai.draft.feedbackExample": "\u4F8B\u5982\uFF0C\u628A\u8F93\u51FA\u7F29\u6210\u4E09\u6761\uFF0C\u4FDD\u7559\u6BCF\u4E2A\u7ED3\u8BBA\u5BF9\u5E94\u7684\u8BC1\u636E\u3002",
  "ai.draft.assumptions": "\u8D77\u8349\u65F6\u91C7\u7528\u7684\u5047\u8BBE",
  "ai.draft.missingInputs": "\u6267\u884C\u524D\u5F85\u8865",
  "ai.draft.toVerify": "\u5F85\u6838\u5B9E",
  "ai.draft.research": "\u5148\u6838\u5B9E\u6216\u8865\u5145\u8D44\u6599",
  "ai.draft.query": "\u641C\u7D22\u5173\u952E\u8BCD",
  "ai.draft.queryHint": "\u53EA\u5C06\u6B64\u5904\u7684\u5173\u952E\u8BCD\u53D1\u9001\u7ED9\u5BBF\u4E3B\u641C\u7D22\u670D\u52A1\u3002",
  "ai.draft.search": "\u641C\u7D22\u6765\u6E90",
  "ai.draft.searching": "\u6B63\u5728\u67E5\u627E\u6765\u6E90\u2026",
  "ai.draft.sources": "\u641C\u7D22\u6765\u6E90",
  "ai.draft.references": "\u7C98\u8D34\u53C2\u8003\u94FE\u63A5\u6216\u6458\u5F55",
  "ai.draft.searchUnavailable": "\u5BBF\u4E3B\u641C\u7D22\u6682\u4E0D\u53EF\u7528\u3002\u53EF\u4EE5\u8865\u5145\u8D44\u6599\u6216\u7EE7\u7EED\u8D77\u8349\u3002",
  "ai.draft.searchEmpty": "\u672A\u627E\u5230\u53EF\u7528\u6765\u6E90\u3002\u53EF\u4EE5\u8C03\u6574\u5173\u952E\u8BCD\u6216\u7EE7\u7EED\u8D77\u8349\u3002",
  "ai.draft.searchFailed": "\u641C\u7D22\u5931\u8D25\u3002\u53EF\u4EE5\u91CD\u8BD5\u6216\u7EE7\u7EED\u8D77\u8349\u3002",
  "ai.draft.backToResult": "\u8FD4\u56DE\u8D77\u8349\u7ED3\u679C",
  "ai.draft.viewCheck": "\u67E5\u770B\u4E0A\u6B21\u68C0\u67E5",
  "ai.draft.checkStale": "\u4E0A\u6B21\u68C0\u67E5\u9488\u5BF9\u65E7\u7A3F\u3002",
  "ai.draft.replaceWarning": "\u8D77\u8349\u671F\u95F4\u8F93\u5165\u6846\u5185\u5BB9\u5DF2\u53D8\u5316\u3002\u8BF7\u786E\u8BA4\u662F\u5426\u66FF\u6362\u3002",
  "ai.draft.replaceChanged": "\u8F93\u5165\u6846\u5185\u5BB9\u518D\u6B21\u53D8\u5316\u3002\u8BF7\u6838\u5BF9\u4E0B\u65B9\u5185\u5BB9\u3002",
  "ai.draft.currentComposer": "\u5F53\u524D\u8F93\u5165\u6846\u5185\u5BB9",
  "ai.draft.keepEditing": "\u8FD4\u56DE\u7F16\u8F91",
  "ai.draft.replace": "\u786E\u8BA4\u66FF\u6362\u8F93\u5165\u6846",
  "ai.draft.confirmCurrent": "\u786E\u8BA4\u5F53\u524D\u5185\u5BB9",
  "ai.tryTemplate": "\u8BD5\u586B\u6A21\u677F",
  "ai.suggestions": "\u53EF\u9009\u8865\u5145",
  "ai.draftChanged": "\u8349\u7A3F\u5DF2\u53D8\u5316\u3002\u8BF7\u91CD\u65B0\u53D1\u8D77\u4F18\u5316\u540E\u518D\u5E94\u7528\u3002",
  "ai.missingVariables": "\u4F18\u5316\u7A3F\u7F3A\u5C11\u539F\u7A3F\u53D8\u91CF",
  "list.preview": "\u63D0\u793A\u8BCD\u9884\u89C8",
  "list.recent": "\u6700\u8FD1\u4F7F\u7528",
  "list.moreActions": "\u66F4\u591A\u64CD\u4F5C",
  "list.fillInsert": "\u586B\u5199\u5E76\u63D2\u5165",
  "list.checking": "\u6B63\u5728\u6838\u5BF9\u63D0\u793A\u8BCD\u2026",
  "list.missingBeforeInsert": "\u8BE5\u63D0\u793A\u8BCD\u5DF2\u4E0D\u5B58\u5728\uFF0C\u8349\u7A3F\u672A\u88AB\u4FEE\u6539\u3002",
  "list.verifyFailed": "\u6682\u65F6\u65E0\u6CD5\u6838\u5BF9\u63D0\u793A\u8BCD\uFF0C\u8349\u7A3F\u672A\u88AB\u4FEE\u6539\u3002\u8BF7\u91CD\u8BD5\u3002",
  "list.usageFailed": "\u63D0\u793A\u8BCD\u5DF2\u5E94\u7528\uFF0C\u4F46\u8BB0\u5F55\u4F7F\u7528\u5931\u8D25\u3002",
  "vars.preview": "\u586B\u53C2\u9884\u89C8",
  "settings.shortcuts": "\u8F93\u5165\u533A\u4E0E\u5FEB\u6377\u5165\u53E3",
  "settings.storage": "\u8BCD\u5E93\u4E0E\u5B58\u50A8",
  "settings.advanced": "\u9AD8\u7EA7\u9009\u9879",
  "settings.appearanceLabel": "\u56FE\u6807\u4E0E\u6587\u5B57",
  "settings.appearanceIcon": "\u4EC5\u56FE\u6807",
  "settings.appearanceHidden": "\u9690\u85CF",
  "manager.skill.preview": "\u9884\u89C8 SKILL.md",
  "manager.skill.backToSelection": "\u8FD4\u56DE\u9009\u62E9",
  "vars.hint": "{{\u53D8\u91CF}} \u4F1A\u5728\u63D2\u5165\u65F6\u66FF\u6362\u4E3A\u4E0B\u9762\u7684\u5185\u5BB9",
  "vars.fill": "\u586B\u5165",
  "vars.cancel": "\u53D6\u6D88",
  "vars.remembered": "\u5DF2\u5E26\u51FA\u4E0A\u6B21\u586B\u5199\u7684\u503C",
  "vars.rememberTemplate": "\u8BB0\u4F4F\u672C\u6A21\u677F\u7684\u672C\u6B21\u586B\u5199",
  "vars.restoreDefaults": "\u6062\u590D\u9ED8\u8BA4\u503C",
  "vars.memoryFailed": "\u672A\u80FD\u66F4\u65B0\u586B\u503C\u8BB0\u5FC6\uFF0C\u8BF7\u91CD\u8BD5\u3002",
  "vars.continueWithoutMemory": "\u7EE7\u7EED\u4F7F\u7528\u5F53\u524D\u586B\u503C",
  "vars.draftChanged": "\u8349\u7A3F\u5DF2\u53D8\u5316\u3002\u8BF7\u68C0\u67E5\u6700\u65B0\u8349\u7A3F\uFF0C\u518D\u6B21\u786E\u8BA4\u6B64\u64CD\u4F5C\u3002",
  "error.insert": "\u65E0\u6CD5\u5E94\u7528\u63D0\u793A\u8BCD\uFF0C\u8BF7\u68C0\u67E5\u8349\u7A3F\u540E\u91CD\u8BD5\u3002",
  "error.load": "\u52A0\u8F7D\u63D0\u793A\u8BCD\u5931\u8D25",
  "error.use": "\u8BB0\u5F55\u4F7F\u7528\u5931\u8D25",
  "error.noPrompt": "\u8BE5\u63D0\u793A\u8BCD\u5DF2\u4E0D\u5B58\u5728",
  "ai.button": "AI \u4F18\u5316",
  "ai.tip": "\u6253\u5F00 AI \u64CD\u4F5C",
  "ai.empty": "\u8F93\u5165\u63D0\u793A\u8BCD\u540E\u53EF\u4F7F\u7528\u6DA6\u8272\u3001\u68C0\u67E5\u548C\u6A21\u677F\u589E\u5F3A\u3002",
  "ai.unavailable": "AI \u4E0D\u53EF\u7528\uFF1A\u672A\u914D\u7F6E\u53EF\u7528\u6A21\u578B",
  "ai.polishing": "\u6B63\u5728\u8C03\u7528 AI\u2026",
  "ai.result": "AI \u4F18\u5316\u7ED3\u679C",
  "ai.original": "\u539F\u6587",
  "ai.polished": "\u4F18\u5316\u7A3F",
  "ai.apply": "\u5E94\u7528\u5230\u8F93\u5165\u6846",
  "ai.copy": "\u590D\u5236",
  "ai.copied": "\u5DF2\u590D\u5236",
  "ai.copyFail": "\u590D\u5236\u5931\u8D25",
  "ai.close": "\u5173\u95ED",
  "ai.cancelRequest": "\u53D6\u6D88\u8BF7\u6C42",
  "ai.elapsed": "\u5DF2\u7B49\u5F85 {seconds} \u79D2",
  "ai.retry": "\u91CD\u8BD5",
  "ai.fail": "AI \u8C03\u7528\u5931\u8D25",
  "ai.timeout": "AI \u8BF7\u6C42\u8D85\u65F6\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5",
  // ── T3：宿主 AI 错误码的本地化文案（键集与 src/host/ai-errors.ts 的枚举一一对应；
  //    宿主零文案——这些句子只存在于客户端字典）。unknown/未来新码落回 ai.fail。
  "ai.code.noLlm": "AI \u4E0D\u53EF\u7528\uFF1A\u672A\u914D\u7F6E\u6A21\u578B\u80FD\u529B",
  "ai.code.route": "\u6CA1\u6709\u53EF\u7528\u7684\u6A21\u578B\u8DEF\u7531\uFF0C\u8BF7\u68C0\u67E5\u6A21\u578B\u8BBE\u7F6E",
  "ai.code.timeout": "\u6A21\u578B\u54CD\u5E94\u8D85\u65F6\u3002\u8BF7\u7A0D\u540E\u91CD\u8BD5\uFF0C\u6216\u5728\u8BBE\u7F6E\u4E2D\u5207\u6362\u6A21\u578B\u3002",
  "ai.code.emptyOutput": "\u6A21\u578B\u8FD4\u56DE\u4E86\u7A7A\u7ED3\u679C\uFF0C\u8BF7\u91CD\u8BD5",
  "ai.code.parse": "\u6A21\u578B\u8F93\u51FA\u4E0D\u662F\u6709\u6548\u5185\u5BB9\uFF0C\u8BF7\u91CD\u8BD5",
  "ai.code.schemaMismatch": "\u6A21\u578B\u8FD4\u56DE\u7684\u683C\u5F0F\u6216\u5173\u952E\u5185\u5BB9\u672A\u901A\u8FC7\u6821\u9A8C\uFF0C\u8BF7\u91CD\u8BD5\u3002",
  // T7-7：**探测**超时的专属文案——必须与 ai.timeout 可辨（用户要做的事不同：查模型配置 / 网络）。
  "ai.probeTimeout": "AI \u670D\u52A1\u63A2\u6D4B\u8D85\u65F6\uFF0C\u8BF7\u68C0\u67E5\u6A21\u578B\u914D\u7F6E\u6216\u7F51\u7EDC\u540E\u91CD\u8BD5",
  "ai.refine": "\u589E\u5F3A\u4E3A\u6A21\u677F",
  "ai.refining": "\u6B63\u5728\u5B8C\u5584\u2026",
  "ai.refined": "\u6A21\u677F\u7A3F",
  "ai.finalTemplate": "\u6700\u7EC8\u6A21\u677F",
  "ai.editTemplate": "\u7F16\u8F91\u6B63\u6587",
  "ai.viewFinalTemplate": "\u67E5\u770B\u6700\u7EC8\u6A21\u677F",
  "vars.unfilled": "\u672A\u586B\u53D8\u91CF",
  "vars.applyWithPlaceholders": "\u4FDD\u7559\u5360\u4F4D\u7B26\u5E76\u5E94\u7528",
  "ai.entryDetails": "\u6761\u76EE\u4FE1\u606F",
  "ai.fieldTitle": "\u6807\u9898",
  "ai.fieldTags": "\u6807\u7B7E",
  "ai.fieldSummary": "\u6458\u8981",
  "ai.save": "\u5B58\u5165\u8BCD\u5E93",
  "ai.saving": "\u6B63\u5728\u5B58\u5165\u2026",
  "ai.saved": "\u5DF2\u5B58\u5165\u8BCD\u5E93",
  "ai.saveFail": "\u5B58\u5165\u8BCD\u5E93\u5931\u8D25",
  "ai.writeBackFail": "\u5DF2\u5B58\u5165\u539F\u6587\uFF0C\u4F46\u4F18\u5316\u7A3F\u5199\u56DE\u5931\u8D25",
  "ai.retryWriteBack": "\u91CD\u8BD5\u5199\u56DE",
  "ai.sameAsOriginal": "\u5B8C\u5584\u7A3F\u4E0E\u539F\u6587\u76F8\u540C\uFF0C\u65E0\u9700\u5207\u6362",
  "ai.evicted": "\u5DF2\u5B58\u5165\u8BCD\u5E93\uFF1B\u6709\u65E7\u63D0\u793A\u8BCD\u56E0\u8D85\u51FA\u4E0A\u9650\u88AB\u6DD8\u6C70",
  "ai.toggleMoved": "\u300C\u539F\u6587 / \u4F18\u5316\u7A3F\u300D\u7684\u5BF9\u6BD4\u4E0E\u5207\u6362\u5DF2\u79FB\u81F3\u7BA1\u7406\u9762\u677F\u7684\u8BE6\u60C5\u9875",
  // ④（2026-09-30 裁定）：润色被授权新增 {{变量}} 占位符（system prompt 的「例外」条），
  // 这件事必须在实际产物旁边说清——否则用户看到多出来的变量会以为是模型跑偏。
  "ai.mayAddVars": "\u6DA6\u8272\u53EF\u80FD\u4E3A\u6B63\u6587\u65B0\u589E {{\u53D8\u91CF}} \u5360\u4F4D\u7B26\uFF08\u5E94\u7528\u65F6\u53EF\u4EE5\u8BD5\u586B\u5E76\u9884\u89C8\uFF09",
  // ── P6：管理面板（列表 / 详情 / §4.4 并排对比）────────────────────────
  "list.manage": "\u7BA1\u7406",
  "list.saveDraft": "\u5F53\u524D\u8349\u7A3F\u5B58\u4E3A\u63D0\u793A\u8BCD",
  // 沉淀入口 B：选中聊天文字浮出的按钮。
  "selection.save": "\u5B58\u4E3A\u63D0\u793A\u8BCD",
  "manager.title": "\u63D0\u793A\u8BCD\u7BA1\u7406",
  "manager.close": "\u5173\u95ED",
  "manager.tab.list": "\u5217\u8868",
  "manager.tab.tags": "\u6807\u7B7E",
  "manager.tab.trash": "\u56DE\u6536\u7AD9",
  "manager.tab.transfer": "\u5907\u4EFD\u4E0E\u6062\u590D",
  "manager.list.new": "\u65B0\u5EFA",
  "manager.list.search": "\u641C\u7D22\u63D0\u793A\u8BCD",
  "manager.list.searchPlaceholder": "\u641C\u7D22\u6807\u9898 / \u6B63\u6587 / \u6807\u7B7E",
  "manager.list.sort": "\u6392\u5E8F",
  "manager.list.sortDefault": "\u9ED8\u8BA4",
  "manager.list.sortUpdated": "\u6700\u8FD1\u66F4\u65B0",
  "manager.list.sortUsed": "\u6700\u5E38\u4F7F\u7528",
  "manager.list.sortCreated": "\u6700\u8FD1\u521B\u5EFA",
  "manager.list.tagFilter": "\u6807\u7B7E\u7B5B\u9009",
  "manager.list.allTags": "\u5168\u90E8\u6807\u7B7E",
  "manager.list.tagsFailed": "\u6807\u7B7E\u52A0\u8F7D\u5931\u8D25",
  "manager.list.usage": "\u7528\u91CF",
  "manager.list.edit": "\u7F16\u8F91",
  "manager.list.delete": "\u5220\u9664",
  "manager.list.deleted": "\u5DF2\u79FB\u5165\u56DE\u6536\u7AD9",
  "manager.list.evicted": "\u5DF2\u4FDD\u5B58\uFF1B\u6709\u65E7\u63D0\u793A\u8BCD\u56E0\u8D85\u51FA\u4E0A\u9650\u88AB\u6DD8\u6C70",
  "manager.edit.newTitle": "\u65B0\u5EFA\u63D0\u793A\u8BCD",
  "manager.edit.editTitle": "\u7F16\u8F91\u63D0\u793A\u8BCD",
  "manager.edit.title": "\u6807\u9898",
  "manager.edit.body": "\u6B63\u6587",
  "manager.edit.tags": "\u6807\u7B7E",
  "manager.edit.summary": "\u6458\u8981",
  "manager.edit.tagsPlaceholder": "\u7528\u9017\u53F7\u5206\u9694\uFF0C\u5982\uFF1A\u5199\u4F5C, \u7FFB\u8BD1",
  "manager.edit.bodyRequired": "\u6B63\u6587\u4E0D\u80FD\u4E3A\u7A7A",
  "manager.edit.save": "\u4FDD\u5B58",
  "manager.edit.saving": "\u6B63\u5728\u4FDD\u5B58\u2026",
  "manager.edit.saved": "\u5DF2\u4FDD\u5B58",
  "manager.edit.back": "\u8FD4\u56DE\u5217\u8868",
  // R59（F-5）：中性表述——宿主不记录方向，客户端不得声称某一栏是原文或优化稿。
  "manager.compare.title": "\u4E24\u4EFD\u6B63\u6587",
  "manager.compare.current": "\u5F53\u524D\u6B63\u6587",
  "manager.compare.counterpart": "\u53E6\u4E00\u4EFD",
  "manager.compare.toggle": "\u4E92\u6362\u4E24\u4EFD\u6B63\u6587",
  "manager.compare.saveBeforeToggle": "\u8BF7\u5148\u4FDD\u5B58\u4FEE\u6539\uFF0C\u518D\u4E92\u6362\u6B63\u6587\u3002",
  "manager.compare.toggling": "\u6B63\u5728\u4E92\u6362\u2026",
  "manager.compare.unknownDirection": "\u5BBF\u4E3B\u4E0D\u8BB0\u5F55\u54EA\u4E00\u4EFD\u662F\u539F\u6587\uFF0C\u8FD9\u91CC\u53EA\u5E76\u5217\u4E24\u4EFD\u6B63\u6587\uFF1B\u4E92\u6362\u540E\u4E24\u4EFD\u5BF9\u8C03\u3002",
  // P7 T4（I-1 根治）：方向已按提示词持久化（pl:refined-dir:<id>），已知方向时如实标注。
  "manager.compare.original": "\u539F\u6587",
  "manager.compare.refined": "\u4F18\u5316\u7A3F",
  "manager.compare.directionPersisted": "\u65B9\u5411\u5DF2\u968F\u8FD9\u6761\u63D0\u793A\u8BCD\u8BB0\u5F55\uFF1A\u5173\u95ED\u9762\u677F\u518D\u6253\u5F00\uFF0C\u4E24\u680F\u6807\u6CE8\u4E0D\u53D8\u3002",
  // ── P6 T4：标签页 / 回收站页 / 共享确认弹窗 / 淘汰二次确认 ────────────────
  "manager.tags.empty": "\u8FD8\u6CA1\u6709\u6807\u7B7E",
  "manager.tags.usage": "\u7528\u91CF",
  "manager.tags.rename": "\u91CD\u547D\u540D",
  "manager.tags.renameSave": "\u4FDD\u5B58",
  "manager.tags.renameCancel": "\u53D6\u6D88",
  "manager.tags.delete": "\u5220\u9664",
  "manager.tags.inUseBefore": "\u8BE5\u6807\u7B7E\u6B63\u5728\u88AB",
  "manager.tags.inUseAfter": "\u6761\u63D0\u793A\u8BCD\u4F7F\u7528\uFF0C\u65E0\u6CD5\u5220\u9664\uFF08\u4E0E\u5BBF\u4E3B 400 \u8BED\u4E49\u4E00\u81F4\uFF09",
  "manager.tags.renamed": "\u5DF2\u91CD\u547D\u540D\u6807\u7B7E",
  "manager.tags.deleted": "\u5DF2\u5220\u9664\u6807\u7B7E",
  "manager.tags.renameFailed": "\u91CD\u547D\u540D\u6807\u7B7E\u5931\u8D25",
  "manager.tags.deleteFailed": "\u5220\u9664\u6807\u7B7E\u5931\u8D25",
  "manager.tags.clean": "\u6E05\u7406\u65E0\u7528\u6807\u7B7E",
  "manager.tags.cleaned": "\u5DF2\u6E05\u7406\u65E0\u7528\u6807\u7B7E\uFF1A",
  "manager.tags.cleanNone": "\u6CA1\u6709\u53EF\u6E05\u7406\u7684\u65E0\u7528\u6807\u7B7E",
  "manager.tags.cleanFailed": "\u4EE5\u4E0B\u6807\u7B7E\u6E05\u7406\u5931\u8D25\uFF1A",
  "manager.tags.loadFailed": "\u6807\u7B7E\u52A0\u8F7D\u5931\u8D25",
  "manager.trash.empty": "\u56DE\u6536\u7AD9\u662F\u7A7A\u7684",
  "manager.trash.deletedAt": "\u5220\u9664\u65F6\u95F4",
  "manager.trash.usage": "\u7528\u91CF",
  "manager.trash.restore": "\u6062\u590D",
  "manager.trash.restored": "\u5DF2\u6062\u590D",
  "manager.trash.restoreFailed": "\u6062\u590D\u5931\u8D25",
  "manager.trash.purge": "\u6C38\u4E45\u5220\u9664",
  "manager.trash.purged": "\u5DF2\u6C38\u4E45\u5220\u9664",
  "manager.trash.purgeFailed": "\u6C38\u4E45\u5220\u9664\u5931\u8D25",
  "manager.trash.emptyAll": "\u6E05\u7A7A\u56DE\u6536\u7AD9",
  "manager.trash.emptied": "\u56DE\u6536\u7AD9\u5DF2\u6E05\u7A7A",
  "manager.trash.emptyFailed": "\u6E05\u7A7A\u56DE\u6536\u7AD9\u5931\u8D25",
  "manager.trash.loadFailed": "\u56DE\u6536\u7AD9\u52A0\u8F7D\u5931\u8D25",
  // 共享确认弹窗（confirm.ts 的 requestConfirm；文案键由响应式渲染点翻译）
  "manager.confirm.confirm": "\u786E\u8BA4",
  "manager.confirm.cancel": "\u53D6\u6D88",
  "manager.confirm.purgeTitle": "\u6C38\u4E45\u5220\u9664",
  "manager.confirm.purgeMessage": "\u5220\u9664\u540E\u65E0\u6CD5\u6062\u590D\uFF0C\u786E\u8BA4\u7EE7\u7EED\uFF1F",
  "manager.confirm.emptyTitle": "\u6E05\u7A7A\u56DE\u6536\u7AD9",
  "manager.confirm.emptyMessage": "\u56DE\u6536\u7AD9\u5185\u7684\u5168\u90E8\u63D0\u793A\u8BCD\u5C06\u88AB\u6C38\u4E45\u5220\u9664\uFF0C\u4E14\u65E0\u6CD5\u6062\u590D\u3002",
  // §4.4 淘汰二次确认（客户端预检，capture.ts 发起）
  "manager.evict.title": "\u8BCD\u5E93\u5DF2\u8FBE\u4E0A\u9650",
  "manager.evict.message": "\u7EE7\u7EED\u4FDD\u5B58\u4F1A\u76F4\u63A5\u5220\u9664\u4EE5\u4E0B\u65E7\u63D0\u793A\u8BCD\uFF08\u7269\u7406\u5220\u9664\uFF0C\u4E0D\u8FDB\u56DE\u6536\u7AD9\uFF09\uFF1A",
  "manager.evict.confirm": "\u7EE7\u7EED\u4FDD\u5B58",
  "manager.evict.cancel": "\u53D6\u6D88",
  "error.save": "\u4FDD\u5B58\u5931\u8D25",
  "error.create": "\u521B\u5EFA\u5931\u8D25",
  "error.delete": "\u5220\u9664\u5931\u8D25",
  "error.rollbackNoSource": "\u8BE5\u63D0\u793A\u8BCD\u6CA1\u6709\u53EF\u5207\u6362\u7684\u539F\u6587",
  // ── P6 T5：导入导出（D5 / §4.3）────────────────────────────────────────
  "transfer.tooLarge": "\u5907\u4EFD\u6587\u4EF6\u6216\u5BFC\u5165\u8BF7\u6C42\u8D85\u8FC7 5 MiB\uFF0C\u672A\u5BFC\u5165",
  "transfer.badJson": "\u5907\u4EFD\u6587\u4EF6\u4E0D\u662F\u5408\u6CD5\u7684 JSON",
  "manager.transfer.export": "\u5BFC\u51FA\u5907\u4EFD",
  "manager.transfer.exporting": "\u6B63\u5728\u5BFC\u51FA\u2026",
  "manager.transfer.exportUnavailable": "\u5F53\u524D\u5BBF\u4E3B\u672A\u63D0\u4F9B\u76EE\u5F55\u9009\u62E9\u80FD\u529B\uFF0C\u6682\u65F6\u65E0\u6CD5\u5BFC\u51FA\u5907\u4EFD",
  "manager.transfer.exported": "\u5907\u4EFD\u5DF2\u5199\u5165",
  "manager.transfer.prompts": "\u63D0\u793A\u8BCD",
  "manager.transfer.tags": "\u6807\u7B7E",
  "manager.transfer.exportFailed": "\u5BFC\u51FA\u5931\u8D25",
  "manager.transfer.import": "\u9009\u62E9\u5907\u4EFD\u6587\u4EF6\u2026",
  "manager.transfer.readFailed": "\u8BFB\u53D6\u6240\u9009\u6587\u4EF6\u5931\u8D25",
  "manager.transfer.importFailed": "\u5BFC\u5165\u5931\u8D25",
  "manager.transfer.noStats": "\u5BBF\u4E3B\u9884\u89C8\u54CD\u5E94\u7F3A\u5C11\u6761\u6570",
  "manager.transfer.previewAdded": "\u65B0\u589E",
  "manager.transfer.previewOverwritten": "\u8986\u76D6",
  "manager.transfer.previewTotal": "\u5408\u8BA1",
  "manager.transfer.overwriteWarning": "\u540C id \u7684\u63D0\u793A\u8BCD\u5C06\u88AB\u8986\u76D6\uFF0C\u4E14\u4E0D\u53EF\u64A4\u9500\u3002",
  "manager.transfer.cancel": "\u53D6\u6D88",
  "manager.transfer.confirm": "\u786E\u8BA4\u5BFC\u5165",
  "manager.transfer.importing": "\u6B63\u5728\u5BFC\u5165\u2026",
  "manager.transfer.imported": "\u5BFC\u5165\u5B8C\u6210",
  "manager.transfer.countsFailed": "\u5BFC\u5165\u5DF2\u5B8C\u6210\uFF0C\u4F46\u8BFB\u53D6\u5F53\u524D\u6761\u6570\u5931\u8D25",
  "manager.transfer.overLimitBefore": "\u672C\u6B21\u5BFC\u5165\u6D89\u53CA",
  "manager.transfer.overLimitMid": "\u6761\uFF0C\u5BFC\u5165\u540E\u5E93\u4E2D\u5171",
  "manager.transfer.overLimitAfter": "\u6761\uFF0C\u5DF2\u8D85\u8FC7\u4E0A\u9650",
  "manager.transfer.overLimitNote": "\u6761\u3002\u5BFC\u5165\u4E0D\u4F1A\u89E6\u53D1\u6DD8\u6C70\uFF0C\u6DD8\u6C70\u53EA\u4F1A\u5728\u540E\u7EED\u65B0\u5EFA\u63D0\u793A\u8BCD\u65F6\u53D1\u751F\u3002",
  // ── P7 T2：技能导出（规格 §7.6 / 验收 15、17）─────────────────────────────
  "manager.skill.open": "\u5BFC\u51FA\u4E3A\u6280\u80FD",
  "manager.skill.title": "\u5BFC\u51FA\u4E3A\u6280\u80FD",
  "manager.skill.back": "\u8FD4\u56DE\u7BA1\u7406\u9762\u677F",
  "manager.skill.hint": "\u52FE\u9009\u63D0\u793A\u8BCD \u2192 \u9010\u6761\u300CAI \u8865\u5168\u540D\u79F0\u4E0E\u63CF\u8FF0\u300D\u2192 \u5BFC\u51FA\u4E3A\u5B98\u65B9 DSH \u6280\u80FD\uFF08\u5199\u5165 skills/<name>/SKILL.md\uFF0C\u5BBF\u4E3B\u5373\u65F6\u53D1\u73B0\uFF09\u3002",
  "manager.skill.selectAll": "\u5168\u9009",
  "manager.skill.selectNone": "\u6E05\u9664\u9009\u62E9",
  "manager.skill.tagFilter": "\u6309\u6807\u7B7E\u7B5B\u9009",
  "manager.skill.allTags": "\u5168\u90E8\u6807\u7B7E",
  "manager.skill.selected": "\u5DF2\u9009",
  "manager.skill.nameLabel": "\u6280\u80FD\u540D",
  "manager.skill.nameLocked": "\u5DF2\u9501\u5B9A\uFF1A\u6CBF\u7528\u5DF2\u5BFC\u51FA\u6280\u80FD\u7684\u76EE\u5F55\u540D",
  "manager.skill.aiNameIgnored": "AI \u540D\u4EC5\u4F9B\u53C2\u8003\uFF0C\u4E0D\u4F1A\u6539\u76EE\u5F55",
  "manager.skill.describe": "AI \u8865\u5168\u540D\u79F0\u4E0E\u63CF\u8FF0",
  "manager.skill.describing": "\u6B63\u5728\u8865\u5168\u2026",
  "manager.skill.export": "\u5F00\u59CB\u5BFC\u51FA",
  "manager.skill.exporting": "\u6B63\u5728\u5BFC\u51FA\u2026",
  "manager.skill.loadFailed": "\u63D0\u793A\u8BCD\u52A0\u8F7D\u5931\u8D25",
  "manager.skill.empty": "\u6CA1\u6709\u53EF\u5BFC\u51FA\u7684\u63D0\u793A\u8BCD",
  "manager.skill.nameMissing": "\u8BE5\u6761\u8FD8\u6CA1\u6709\u6280\u80FD\u540D\uFF1A\u5148\u70B9\u300CAI \u8865\u5168\u540D\u79F0\u4E0E\u63CF\u8FF0\u300D\uFF08\u6216\u5B83\u5DF2\u5BFC\u51FA\u8FC7\u4E00\u6B21\uFF09",
  "manager.skill.nameInvalid": "\u6280\u80FD\u540D\u975E\u6CD5\uFF1Akebab \u5316\u540E\u5FC5\u987B\u662F\u5C0F\u5199 kebab-case\uFF08\u4EC5\u5B57\u6BCD\u3001\u6570\u5B57\u3001\u8FDE\u5B57\u7B26\uFF09",
  "manager.skill.descMissing": "\u6458\u8981\u3001AI \u63CF\u8FF0\u3001\u6B63\u6587\u9996\u884C\u4E0E\u6807\u9898\u5168\u4E3A\u7A7A\uFF0C\u5BBF\u4E3B\u4F1A\u62D2\u7EDD\u5BFC\u51FA",
  "manager.skill.describeFailed": "AI \u8865\u5168\u5931\u8D25",
  "manager.skill.exportFailed": "\u5BFC\u51FA\u5931\u8D25",
  "manager.skill.pathMissing": "\u5BBF\u4E3B\u672A\u8FD4\u56DE\u76EE\u6807\u6587\u4EF6\u8DEF\u5F84\uFF08\u5951\u7EA6\u6F02\u79FB\uFF09\uFF0C\u672C\u6761\u6309\u5931\u8D25\u5904\u7406",
  "manager.skill.conflictTitle": "\u540C\u540D\u6280\u80FD\u76EE\u5F55\u5DF2\u5B58\u5728",
  "manager.skill.conflictMessage": "\u8BE5\u6280\u80FD\u53EF\u80FD\u5C5E\u4E8E\u53E6\u4E00\u6761\u63D0\u793A\u8BCD\uFF0C\u6216\u7531\u4F60\u624B\u5199\u3002\u7EE7\u7EED\u5BFC\u51FA\u4F1A\u8986\u76D6 SKILL.md\uFF0C\u5E76\u5C06\u5F52\u5C5E\u8F6C\u79FB\u5230\u5F53\u524D\u63D0\u793A\u8BCD\u3002",
  "manager.skill.summary": "\u5BFC\u51FA\u7ED3\u679C",
  "manager.skill.summaryOk": "\u6210\u529F",
  "manager.skill.summaryFailed": "\u5931\u8D25",
  "manager.skill.summaryDeclined": "\u8DF3\u8FC7",
  "manager.skill.target": "\u76EE\u6807\u6587\u4EF6",
  "manager.skill.declined": "\u5DF2\u8DF3\u8FC7\uFF08\u672A\u786E\u8BA4\u8986\u76D6\u540C\u540D\u76EE\u5F55\uFF09",
  "manager.skill.badgeExported": "\u5DF2\u5BFC\u51FA\u6280\u80FD",
  "manager.skill.badgeStale": "\u6280\u80FD\u5DF2\u8FC7\u671F",
  "manager.skill.reExport": "\u91CD\u65B0\u5BFC\u51FA",
  "manager.skill.reExporting": "\u6B63\u5728\u91CD\u65B0\u5BFC\u51FA\u2026",
  "manager.skill.reExported": "\u5DF2\u91CD\u65B0\u5BFC\u51FA\uFF08\u540C\u540D\u8986\u76D6\uFF0C\u672A\u65B0\u589E\u6280\u80FD\u76EE\u5F55\uFF09",
  "sidebar.entry.title": "\u63D0\u793A\u8BCD",
  "sidebar.entry.tip": "\u6253\u5F00\u63D0\u793A\u8BCD\u7BA1\u7406\u9762\u677F",
  // ── P8 T4：设置页（验收 12 / 19 的一半）──────────────────────────────────
  // 座位名（宿主设置页左栏的导航行）与页内标题；label 是 thunk ⇒ 语言切换后导航行自动跟随。
  "settings.nav": "\u63D0\u793A\u8BCD\u589E\u5F3A",
  "settings.title": "\u63D0\u793A\u8BCD\u589E\u5F3A\u8BBE\u7F6E",
  "settings.saveFailed": "\u4FDD\u5B58\u8BBE\u7F6E\u5931\u8D25",
  "settings.numberInvalid": "\u8BF7\u8F93\u5165\u8303\u56F4\u5185\u7684\u6574\u6570\uFF1A",
  "settings.ai.title": "AI \u6A21\u578B",
  "settings.ai.optimizationModel": "\u4F18\u5316\u4F7F\u7528\u7684\u6A21\u578B",
  "settings.ai.provider": "\u63D0\u4F9B\u65B9",
  "settings.ai.model": "\u6A21\u578B",
  "settings.ai.auto": "\u81EA\u52A8\u53D1\u73B0",
  "settings.ai.loading": "\u6B63\u5728\u63A2\u6D4B\u53EF\u7528\u6A21\u578B\u2026",
  "settings.ai.probeFailed": "\u63A2\u6D4B\u53EF\u7528\u6A21\u578B\u5931\u8D25\uFF0C\u672C\u884C\u53EA\u4FDD\u7559\u300C\u81EA\u52A8\u53D1\u73B0\u300D\uFF1A",
  "settings.ai.noModels": "\u5BBF\u4E3B\u672A\u8FD4\u56DE\u4EFB\u4F55\u53EF\u7528\u6A21\u578B\uFF0C\u672C\u884C\u53EA\u4FDD\u7559\u300C\u81EA\u52A8\u53D1\u73B0\u300D",
  "settings.ai.stored": "\u5F53\u524D\u4FDD\u5B58\u7684\u662F\uFF1A",
  "settings.panelSize": "\u9762\u677F\u5BBD\u5EA6 / \u9AD8\u5EA6",
  "settings.panelWidth": "\u5BBD\u5EA6",
  "settings.panelHeight": "\u9AD8\u5EA6",
  "settings.maxPromptCount": "\u5B58\u50A8\u4E0A\u9650",
  "settings.showComposerButton": "\u8F93\u5165\u6846\u65C1\u8BCD\u5E93\u6309\u94AE",
  "settings.showAIPolishButton": "AI \u4F18\u5316\u6309\u94AE",
  "settings.hashTriggerEnabled": "# \u89E6\u53D1\u5019\u9009\u6D6E\u5C42",
  "settings.contextRecommendEnabled": "\u4E0A\u4E0B\u6587\u63A8\u8350",
  "settings.selectionAddEnabled": "\u9009\u4E2D\u6587\u5B57\u5B58\u4E3A\u63D0\u793A\u8BCD",
  "settings.showSidebarButton": "\u5DE6\u4FA7\u4E0B\u65B9\u5165\u53E3"
};
var en = {
  "button.title": "Library",
  "button.tip": "Open the prompt library",
  "list.title": "Saved prompts",
  "list.empty": "No prompts yet",
  "list.loading": "Loading\u2026",
  "list.filter": "Filter prompts",
  "list.filterPlaceholder": "Filter title / tags / body",
  "list.overflow": " more not shown \xB7 open the manager to search",
  "action.insert": "Insert",
  "action.overwrite": "Overwrite",
  "action.send": "Insert & send",
  "hash.title": "Pick a prompt",
  "hash.empty": "No matching prompt",
  // Context recommendation strip (P8 T3 / acceptance 11): row label, also the group's accessible name.
  "recommend.title": "Suggested",
  "vars.title": "Fill template variables",
  "vars.settings": "Template variable settings",
  "vars.description": "Instructions",
  "vars.defaultValue": "Default value",
  "ai.lightPolish": "Light polish",
  "ai.check": "Check prompt",
  "ai.checking": "Checking prompt\u2026",
  "ai.checkClear": "AI found no issues that need attention.",
  "ai.checkReport": "Prompt check report",
  "ai.checkSuggestion": "Suggestion",
  "ai.checkStale": "The composer changed. These findings refer to the draft that was checked.",
  "ai.checkAgain": "Check current draft",
  "ai.backToActions": "Back to AI actions",
  "ai.draft.title": "Draft from an idea",
  "ai.draft.idea": "Your idea",
  "ai.draft.example": "For example, help me find out why this project builds slowly.",
  "ai.draft.executor": "Model and execution environment (optional)",
  "ai.draft.executorExample": "For example, a coding agent with read-only repo access and no access to this chat.",
  "ai.draft.answer": "Choose an option or enter your own answer",
  "ai.draft.skip": "Skip questions and draft",
  "ai.draft.generate": "Generate prompt",
  "ai.draft.generating": "Drafting your prompt\u2026",
  "ai.draft.editIdea": "Edit idea",
  "ai.draft.editAnswers": "Edit answers",
  "ai.draft.result": "Prompt draft",
  "ai.draft.understanding": "Goal and deliverable used for this draft",
  "ai.draft.revise": "Revise with feedback",
  "ai.draft.useSuggestion": "Use as revision feedback",
  "ai.draft.feedback": "Revision feedback",
  "ai.draft.feedbackExample": "For example, use three bullets and keep the evidence for each finding.",
  "ai.draft.assumptions": "Assumptions used in this draft",
  "ai.draft.missingInputs": "Needed before execution",
  "ai.draft.toVerify": "To verify",
  "ai.draft.research": "Check facts or add references",
  "ai.draft.query": "Search keywords",
  "ai.draft.queryHint": "Only these keywords are sent to the host search service.",
  "ai.draft.search": "Search for sources",
  "ai.draft.searching": "Looking up sources\u2026",
  "ai.draft.sources": "Search sources",
  "ai.draft.references": "Paste reference links or excerpts",
  "ai.draft.searchUnavailable": "Host search is unavailable. Add references or continue drafting.",
  "ai.draft.searchEmpty": "No usable sources found. Try different keywords or continue drafting.",
  "ai.draft.searchFailed": "Search failed. Try again or continue drafting.",
  "ai.draft.backToResult": "Back to draft",
  "ai.draft.viewCheck": "View last check",
  "ai.draft.checkStale": "The last check was for an earlier draft.",
  "ai.draft.replaceWarning": "The composer changed while you were drafting. Confirm whether to replace it.",
  "ai.draft.replaceChanged": "The composer changed again. Review the latest text below.",
  "ai.draft.currentComposer": "Current composer text",
  "ai.draft.keepEditing": "Back to editing",
  "ai.draft.replace": "Replace composer text",
  "ai.draft.confirmCurrent": "Review latest text",
  "ai.tryTemplate": "Try template",
  "ai.suggestions": "Optional additions",
  "ai.draftChanged": "The draft changed. Run optimization again before applying.",
  "ai.missingVariables": "Variables missing from the result",
  "list.preview": "Prompt preview",
  "list.recent": "Recently used",
  "list.moreActions": "More actions",
  "list.fillInsert": "Fill and insert",
  "list.checking": "Checking prompt\u2026",
  "list.missingBeforeInsert": "That prompt no longer exists. Your draft was not changed.",
  "list.verifyFailed": "Could not verify the prompt. Your draft was not changed. Try again.",
  "list.usageFailed": "Prompt applied, but usage could not be recorded.",
  "vars.preview": "Filled preview",
  "settings.shortcuts": "Composer and shortcuts",
  "settings.storage": "Library and storage",
  "settings.advanced": "Advanced",
  "settings.appearanceLabel": "Icon and text",
  "settings.appearanceIcon": "Icon only",
  "settings.appearanceHidden": "Hidden",
  "manager.skill.preview": "Preview SKILL.md",
  "manager.skill.backToSelection": "Back to selection",
  "vars.hint": "Each {{name}} below is substituted when inserted",
  "vars.fill": "Fill in",
  "vars.cancel": "Cancel",
  "vars.remembered": "Filled with values from last time",
  "vars.rememberTemplate": "Remember these values for this template",
  "vars.restoreDefaults": "Restore defaults",
  "vars.memoryFailed": "Could not update remembered values. Try again.",
  "vars.continueWithoutMemory": "Continue with current values",
  "vars.draftChanged": "The draft changed. Review the latest draft and confirm this action again.",
  "error.insert": "Could not apply the prompt. Check the draft and try again.",
  "error.load": "Failed to load prompts",
  "error.use": "Failed to record usage",
  "error.noPrompt": "That prompt no longer exists",
  "ai.button": "AI polish",
  "ai.tip": "Open AI actions",
  "ai.empty": "Enter a prompt to polish, check or turn it into a template.",
  "ai.unavailable": "AI unavailable: no usable model configured",
  "ai.polishing": "Calling AI\u2026",
  "ai.result": "AI polish result",
  "ai.original": "Original",
  "ai.polished": "Polished",
  "ai.apply": "Apply to composer",
  "ai.copy": "Copy",
  "ai.copied": "Copied",
  "ai.copyFail": "Copy failed",
  "ai.close": "Close",
  "ai.cancelRequest": "Cancel request",
  "ai.elapsed": "{seconds}s elapsed",
  "ai.retry": "Retry",
  "ai.fail": "AI call failed",
  "ai.timeout": "The AI request timed out, please retry later",
  // ── T3: localized copy for the host AI error codes (keys map 1:1 to the enum in
  //    src/host/ai-errors.ts; the host ships no user-facing copy). Unknown/new codes fall back to ai.fail.
  "ai.code.noLlm": "AI unavailable: no model capability is configured",
  "ai.code.route": "No usable model route \u2014 please check the model settings",
  "ai.code.timeout": "The model timed out. Try again later or switch models in Settings.",
  "ai.code.emptyOutput": "The model returned an empty result, please retry",
  "ai.code.parse": "The model output was not valid content, please retry",
  "ai.code.schemaMismatch": "The result failed format or content checks. Try again.",
  // T7-7: probe-specific timeout copy — must stay distinguishable from "ai.timeout".
  "ai.probeTimeout": "Timed out probing for available models, please check the model settings or network and retry",
  "ai.refine": "Enhance as template",
  "ai.refining": "Refining\u2026",
  "ai.refined": "Template draft",
  "ai.finalTemplate": "Final template",
  "ai.editTemplate": "Edit body",
  "ai.viewFinalTemplate": "View final template",
  "vars.unfilled": "Unfilled variables",
  "vars.applyWithPlaceholders": "Apply with placeholders",
  "ai.entryDetails": "Library entry details",
  "ai.fieldTitle": "Title",
  "ai.fieldTags": "Tags",
  "ai.fieldSummary": "Summary",
  "ai.save": "Save to library",
  "ai.saving": "Saving\u2026",
  "ai.saved": "Saved to library",
  "ai.saveFail": "Failed to save to library",
  "ai.writeBackFail": "The original was saved, but writing back the refined draft failed",
  "ai.retryWriteBack": "Retry write-back",
  "ai.sameAsOriginal": "The refined draft matches the original \u2014 nothing to toggle",
  "ai.evicted": "Saved to library; older prompts were evicted past the limit",
  "ai.toggleMoved": "The original/refined compare and toggle now live on the manager's detail page",
  "ai.mayAddVars": "Polishing may add {{variable}} placeholders to the body (you can fill and preview them before applying)",
  // ── P6: manager panel (list / detail / §4.4 side-by-side)──────────────
  "list.manage": "Manage",
  "list.saveDraft": "Save current draft as prompt",
  // Capture entry B: the button floating above a chat selection.
  "selection.save": "Save as prompt",
  "manager.title": "Prompt manager",
  "manager.close": "Close",
  "manager.tab.list": "List",
  "manager.tab.tags": "Tags",
  "manager.tab.trash": "Trash",
  "manager.tab.transfer": "Backup & restore",
  "manager.list.new": "New",
  "manager.list.search": "Search prompts",
  "manager.list.searchPlaceholder": "Search title, body or tags",
  "manager.list.sort": "Sort",
  "manager.list.sortDefault": "Default",
  "manager.list.sortUpdated": "Recently updated",
  "manager.list.sortUsed": "Most used",
  "manager.list.sortCreated": "Recently created",
  "manager.list.tagFilter": "Tag filter",
  "manager.list.allTags": "All tags",
  "manager.list.tagsFailed": "Failed to load tags",
  "manager.list.usage": "Uses",
  "manager.list.edit": "Edit",
  "manager.list.delete": "Delete",
  "manager.list.deleted": "Moved to trash",
  "manager.list.evicted": "Saved; older prompts were evicted past the limit",
  "manager.edit.newTitle": "New prompt",
  "manager.edit.editTitle": "Edit prompt",
  "manager.edit.title": "Title",
  "manager.edit.body": "Body",
  "manager.edit.tags": "Tags",
  "manager.edit.summary": "Summary",
  "manager.edit.tagsPlaceholder": "Comma separated, e.g. writing, translation",
  "manager.edit.bodyRequired": "Body must not be empty",
  "manager.edit.save": "Save",
  "manager.edit.saving": "Saving\u2026",
  "manager.edit.saved": "Saved",
  "manager.edit.back": "Back to list",
  // R59 (F-5): neutral wording — the host does not record which body is the original.
  "manager.compare.title": "Two bodies",
  "manager.compare.current": "Current body",
  "manager.compare.counterpart": "The other body",
  "manager.compare.toggle": "Swap the two bodies",
  "manager.compare.saveBeforeToggle": "Save your changes before swapping the bodies.",
  "manager.compare.toggling": "Swapping\u2026",
  "manager.compare.unknownDirection": "The host does not record which body is the original, so both are shown side by side; swapping exchanges them.",
  // P7 T4 (root fix for I-1): the direction is persisted per prompt (pl:refined-dir:<id>), so a known direction is labelled as such.
  "manager.compare.original": "Original",
  "manager.compare.refined": "Refined draft",
  "manager.compare.directionPersisted": "The direction is recorded with this prompt: close the panel and reopen it and the labels stay the same.",
  // ── P6 T4: tags / trash / shared confirm / pre-eviction confirmation ─────
  "manager.tags.empty": "No tags yet",
  "manager.tags.usage": "Uses",
  "manager.tags.rename": "Rename",
  "manager.tags.renameSave": "Save",
  "manager.tags.renameCancel": "Cancel",
  "manager.tags.delete": "Delete",
  "manager.tags.inUseBefore": "This tag is used by",
  "manager.tags.inUseAfter": "prompts and cannot be deleted (same semantics as the host 400)",
  "manager.tags.renamed": "Tag renamed",
  "manager.tags.deleted": "Tag deleted",
  "manager.tags.renameFailed": "Failed to rename the tag",
  "manager.tags.deleteFailed": "Failed to delete the tag",
  "manager.tags.clean": "Clean unused tags",
  "manager.tags.cleaned": "Unused tags cleaned:",
  "manager.tags.cleanNone": "No unused tags to clean",
  "manager.tags.cleanFailed": "These tags could not be cleaned:",
  "manager.tags.loadFailed": "Failed to load tags",
  "manager.trash.empty": "The trash is empty",
  "manager.trash.deletedAt": "Deleted",
  "manager.trash.usage": "Uses",
  "manager.trash.restore": "Restore",
  "manager.trash.restored": "Restored",
  "manager.trash.restoreFailed": "Failed to restore",
  "manager.trash.purge": "Delete forever",
  "manager.trash.purged": "Deleted forever",
  "manager.trash.purgeFailed": "Failed to delete forever",
  "manager.trash.emptyAll": "Empty trash",
  "manager.trash.emptied": "Trash emptied",
  "manager.trash.emptyFailed": "Failed to empty the trash",
  "manager.trash.loadFailed": "Failed to load the trash",
  // Shared confirm dialog (confirm.ts#requestConfirm; labels are keys translated at the render point)
  "manager.confirm.confirm": "Confirm",
  "manager.confirm.cancel": "Cancel",
  "manager.confirm.purgeTitle": "Delete forever",
  "manager.confirm.purgeMessage": "This cannot be undone. Continue?",
  "manager.confirm.emptyTitle": "Empty trash",
  "manager.confirm.emptyMessage": "Every prompt in the trash will be permanently deleted and cannot be recovered.",
  // 4.4 pre-eviction confirmation (client-side pre-check, raised by capture.ts)
  "manager.evict.title": "Library limit reached",
  "manager.evict.message": "Saving now deletes these older prompts outright (no trash, unrecoverable):",
  "manager.evict.confirm": "Save anyway",
  "manager.evict.cancel": "Cancel",
  "error.save": "Failed to save",
  "error.create": "Failed to create",
  "error.delete": "Failed to delete",
  "error.rollbackNoSource": "This prompt has no original to toggle",
  // ── P6 T5: import / export (D5 / 4.3)────────────────────────────────────
  "transfer.tooLarge": "The backup file or import request exceeds 5 MiB. Import was cancelled.",
  "transfer.badJson": "The backup file is not valid JSON",
  "manager.transfer.export": "Export backup",
  "manager.transfer.exporting": "Exporting\u2026",
  "manager.transfer.exportUnavailable": "This host exposes no directory picker, so exporting is unavailable",
  "manager.transfer.exported": "Backup written to",
  "manager.transfer.prompts": "Prompts",
  "manager.transfer.tags": "Tags",
  "manager.transfer.exportFailed": "Export failed",
  "manager.transfer.import": "Choose a backup file\u2026",
  "manager.transfer.readFailed": "Failed to read the selected file",
  "manager.transfer.importFailed": "Import failed",
  "manager.transfer.noStats": "The host preview response carries no counts",
  "manager.transfer.previewAdded": "Added",
  "manager.transfer.previewOverwritten": "Overwritten",
  "manager.transfer.previewTotal": "Total",
  "manager.transfer.overwriteWarning": "Prompts sharing an id will be overwritten, and this cannot be undone.",
  "manager.transfer.cancel": "Cancel",
  "manager.transfer.confirm": "Confirm import",
  "manager.transfer.importing": "Importing\u2026",
  "manager.transfer.imported": "Import finished",
  "manager.transfer.countsFailed": "The import finished, but reading the current prompt count failed",
  "manager.transfer.overLimitBefore": "This import covered",
  "manager.transfer.overLimitMid": "prompts; the library now holds",
  "manager.transfer.overLimitAfter": "prompts, above the limit of",
  "manager.transfer.overLimitNote": "prompts. The import evicted nothing \u2014 eviction only happens on later creates.",
  // ── P7 T2: skill export (spec 7.6 / acceptance 15, 17)────────────────────
  "manager.skill.open": "Export as skill",
  "manager.skill.title": "Export as skills",
  "manager.skill.back": "Back to the manager",
  "manager.skill.hint": "Tick prompts, fill names & descriptions with AI per item, then export them as official DSH skills (written to skills/<name>/SKILL.md and picked up by the host right away).",
  "manager.skill.selectAll": "Select all",
  "manager.skill.selectNone": "Clear selection",
  "manager.skill.tagFilter": "Filter by tag",
  "manager.skill.allTags": "All tags",
  "manager.skill.selected": "Selected",
  "manager.skill.nameLabel": "Skill name",
  "manager.skill.nameLocked": "locked: keeps the exported skill folder name",
  "manager.skill.aiNameIgnored": "the AI name is only a suggestion and will not rename the folder",
  "manager.skill.describe": "Fill names & descriptions with AI",
  "manager.skill.describing": "Filling\u2026",
  "manager.skill.export": "Start export",
  "manager.skill.exporting": "Exporting\u2026",
  "manager.skill.loadFailed": "Failed to load prompts",
  "manager.skill.empty": "No prompts to export",
  "manager.skill.nameMissing": 'This prompt has no skill name yet: run "fill names & descriptions with AI" first (or export it once)',
  "manager.skill.nameInvalid": "Invalid skill name: it must kebab-case into lowercase kebab (letters, digits, hyphens only)",
  "manager.skill.descMissing": "Summary, AI description, first body line and title are all empty \u2014 the host will refuse the export",
  "manager.skill.describeFailed": "AI completion failed",
  "manager.skill.exportFailed": "Export failed",
  "manager.skill.pathMissing": "The host returned no target path (contract drift); this item is reported as failed",
  "manager.skill.conflictTitle": "A skill folder with this name already exists",
  "manager.skill.conflictMessage": "This skill may belong to a different prompt or have been written by hand. Exporting will overwrite SKILL.md and assign the skill to this prompt.",
  "manager.skill.summary": "Export result",
  "manager.skill.summaryOk": "Succeeded",
  "manager.skill.summaryFailed": "Failed",
  "manager.skill.summaryDeclined": "Skipped",
  "manager.skill.target": "Target file",
  "manager.skill.declined": "Skipped (the overwrite was not confirmed)",
  "manager.skill.badgeExported": "Exported as skill",
  "manager.skill.badgeStale": "Skill is out of date",
  "manager.skill.reExport": "Re-export",
  "manager.skill.reExporting": "Re-exporting\u2026",
  "manager.skill.reExported": "Re-exported (overwrote the same folder, no new folder created)",
  "sidebar.entry.title": "Prompts",
  "sidebar.entry.tip": "Open the prompt manager",
  // ── P8 T4: settings page (acceptance 12 / half of 19)─────────────────────
  // Seat name (the settings nav row) and the in-page title; the label is a thunk, so the nav row
  // follows a locale switch with no re-registration.
  "settings.nav": "Prompt Enhancer",
  "settings.title": "Prompt Enhancer settings",
  "settings.saveFailed": "Failed to save the setting",
  "settings.numberInvalid": "Enter a whole number within the allowed range: ",
  "settings.ai.title": "AI model",
  "settings.ai.optimizationModel": "Model used for optimization",
  "settings.ai.provider": "Provider",
  "settings.ai.model": "Model",
  "settings.ai.auto": "Auto-discover",
  "settings.ai.loading": "Probing available models\u2026",
  "settings.ai.probeFailed": "Probing available models failed; this row keeps only the Auto-discover option:",
  "settings.ai.noModels": "The host returned no usable model; this row keeps only the Auto-discover option",
  "settings.ai.stored": "Currently saved: ",
  "settings.panelSize": "Panel width / height",
  "settings.panelWidth": "Width",
  "settings.panelHeight": "Height",
  "settings.maxPromptCount": "Storage limit",
  "settings.showComposerButton": "Library button next to the composer",
  "settings.showAIPolishButton": "AI polish button",
  "settings.hashTriggerEnabled": "# trigger suggestion overlay",
  "settings.contextRecommendEnabled": "Context suggestions",
  "settings.selectionAddEnabled": "Save selected text as a prompt",
  "settings.showSidebarButton": "Sidebar entry"
};

// src/client/components/TemplateVariablesDialog.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
var NO_VARIABLES = [];
function hostLanguage() {
  if (typeof document !== "undefined" && document.documentElement.lang !== "") {
    return document.documentElement.lang;
  }
  if (typeof navigator !== "undefined" && navigator.language !== "") return navigator.language;
  return "en";
}
function fallbackTranslate() {
  const dict = hostLanguage().toLowerCase().startsWith("zh") ? zh : en;
  return (key) => dict[key] ?? key;
}
function TemplateVariablesDialog({
  body,
  variables = NO_VARIABLES,
  onCancel,
  onFilled,
  confirmLabel,
  applyNotice,
  applying = false,
  panelSize,
  confirmUnfilled = false,
  promptId,
  focusVariable,
  t
}) {
  const tr = t ?? fallbackTranslate();
  const expanded = panelSize?.height !== void 0;
  const names = React2.useMemo(() => parseVariables(body), [body]);
  const focusedName = focusVariable && names.includes(focusVariable) ? focusVariable : names[0];
  const configured = new Map(variables.map((variable) => [variable.name, variable]));
  const [values, setValues] = React2.useState({});
  const filledValues = { ...initialTemplateValues(body, variables), ...values };
  const [remembered, setRemembered] = React2.useState(false);
  const [rememberValues, setRememberValues] = React2.useState(false);
  const [saving, setSaving] = React2.useState(false);
  const [saveFailed, setSaveFailed] = React2.useState(false);
  const locked = saving || applying;
  const restoreDefaults = React2.useRef(false);
  const savingRef = React2.useRef(false);
  const active = React2.useRef(false);
  const latestOnFilled = React2.useRef(onFilled);
  const savedMemory = React2.useRef(null);
  const memoryKey = promptId === void 0 ? void 0 : templateMemoryKey(promptId);
  React2.useLayoutEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  React2.useLayoutEffect(() => {
    latestOnFilled.current = onFilled;
  }, [onFilled]);
  React2.useEffect(() => {
    if (!memoryKey) return;
    let alive = true;
    api.getMeta(memoryKey).then(
      (raw) => {
        if (!alive || restoreDefaults.current || savingRef.current) return;
        const prefill = pickRemembered(body, parseMemory(raw));
        if (!Object.keys(prefill).length) return;
        setValues((previous) => ({ ...prefill, ...previous }));
        setRemembered(true);
      },
      (error) => console.warn("[prompt-enhancer] \u8BFB\u53D6\u6A21\u677F\u53D8\u91CF\u8BB0\u5FC6\u5931\u8D25", error)
    );
    return () => {
      alive = false;
    };
  }, [body, memoryKey]);
  const filled = fillTemplate(body, filledValues);
  const unfilled = unfilledVariables(names, filledValues);
  const needsDecision = confirmUnfilled && unfilled.length > 0;
  const commit = async () => {
    if (!onFilled || applying || savingRef.current) return;
    if (!memoryKey || !rememberValues && !restoreDefaults.current) {
      onFilled(filled);
      return;
    }
    const value = rememberValues ? JSON.stringify(pickRemembered(body, filledValues)) : null;
    if (savedMemory.current?.key === memoryKey && savedMemory.current.value === value) {
      onFilled(filled);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setSaveFailed(false);
    try {
      if (value === null) {
        await api.deleteMeta(memoryKey);
      } else {
        await api.setMeta(memoryKey, value, CLEAR_TIMEOUT_MS);
      }
      savedMemory.current = { key: memoryKey, value };
    } catch (error) {
      console.warn("[prompt-enhancer] \u4FDD\u5B58\u6A21\u677F\u53D8\u91CF\u8BB0\u5FC6\u5931\u8D25", error);
      if (active.current) setSaveFailed(true);
      return;
    } finally {
      savingRef.current = false;
      if (active.current) setSaving(false);
    }
    if (active.current) latestOnFilled.current?.(filled);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
    "div",
    {
      style: {
        ...CARD,
        width: panelSize?.width ?? CARD.width,
        ...expanded ? { height: panelSize.height, maxHeight: void 0, padding: 12, overflow: "hidden" } : {}
      },
      role: "dialog",
      "aria-label": tr("vars.title"),
      children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("form", { "aria-busy": locked, style: expanded ? EXPANDED_FORM : FORM, onSubmit: (event) => {
        event.preventDefault();
        if (!needsDecision) void commit();
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: TITLE, children: tr("vars.title") }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: HINT, children: tr("vars.hint") }),
        remembered && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: REMEMBERED, children: tr("vars.remembered") }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: expanded ? EXPANDED_FIELDS : FORM, children: [
          names.map((name) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { style: FIELD2, children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: LABEL2, children: name }),
            configured.get(name)?.description && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: HINT, children: configured.get(name)?.description }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "input",
              {
                type: "text",
                style: INPUT2,
                value: Object.hasOwn(filledValues, name) ? filledValues[name] : "",
                disabled: locked,
                autoFocus: name === focusedName,
                "aria-label": name,
                onChange: (ev) => {
                  const next = ev.currentTarget.value;
                  setValues((prev) => ({ ...prev, [name]: next }));
                }
              }
            )
          ] }, name)),
          unfilled.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { role: "status", style: HINT, children: [
            tr("vars.unfilled"),
            " ",
            unfilled.join(", ")
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: expanded ? EXPANDED_PREVIEW_FIELD : FIELD2, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: TITLE, children: tr("vars.preview") }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("pre", { style: expanded ? EXPANDED_PREVIEW : PREVIEW, tabIndex: 0, children: filled })
        ] }),
        memoryKey && onFilled && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: MEMORY_ACTIONS, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("input", { type: "checkbox", checked: rememberValues, disabled: locked, onChange: (event) => {
              setRememberValues(event.currentTarget.checked);
              setSaveFailed(false);
            } }),
            tr("vars.rememberTemplate")
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", style: GHOST, disabled: locked, onClick: () => {
            restoreDefaults.current = true;
            setValues({});
            setRememberValues(false);
            setRemembered(false);
            setSaveFailed(false);
          }, children: tr("vars.restoreDefaults") })
        ] }),
        applyNotice && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { role: "alert", style: HINT, children: applyNotice }),
        saveFailed && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { role: "alert", style: MEMORY_ACTIONS, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: HINT, children: tr("vars.memoryFailed") }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", style: GHOST, disabled: locked, onClick: () => onFilled?.(filled), children: tr("vars.continueWithoutMemory") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: ACTIONS, children: [
          onFilled && (needsDecision ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", style: PRIMARY, disabled: locked, onClick: () => void commit(), children: tr("vars.applyWithPlaceholders") }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "submit", style: PRIMARY, disabled: locked, children: confirmLabel ?? tr("vars.fill") })),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", style: GHOST, disabled: saving, onClick: onCancel, children: tr("vars.cancel") })
        ] })
      ] })
    }
  );
}
var CARD = {
  ...overlayBase,
  width: "min(360px, calc(100vw - 32px))",
  boxSizing: "border-box",
  maxWidth: "100%",
  maxHeight: "min(460px, calc(100dvh - 130px))",
  overflowY: "auto",
  padding: 10,
  fontSize: 12,
  lineHeight: 1.5
};
var FORM = { display: "flex", flexDirection: "column", gap: 8 };
var TITLE = { color: TOKEN.fg, fontSize: 12, fontWeight: 600 };
var HINT = { color: TOKEN.muted, fontSize: 11 };
var REMEMBERED = { color: TOKEN.accent, fontSize: 11 };
var FIELD2 = { display: "flex", flexDirection: "column", gap: 3 };
var LABEL2 = { color: TOKEN.muted, fontSize: 11 };
var INPUT2 = {
  padding: "4px 6px",
  fontSize: 12,
  color: TOKEN.fg,
  background: "transparent",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6
};
var ACTIONS = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  flexWrap: "wrap",
  flexShrink: 0,
  marginTop: 2
};
var BUTTON = {
  padding: "3px 10px",
  fontSize: 11,
  color: TOKEN.fg,
  background: "transparent",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  cursor: "pointer"
};
var PRIMARY = { ...BUTTON, color: TOKEN.accent, borderColor: TOKEN.accent };
var GHOST = { ...BUTTON, color: TOKEN.muted };
var PREVIEW = {
  margin: 0,
  padding: 8,
  maxHeight: 150,
  overflowY: "auto",
  background: TOKEN.hover,
  borderRadius: 6,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  font: "inherit",
  lineHeight: 1.55
};
var EXPANDED_FORM = { ...FORM, height: "100%", overflowY: "auto", padding: 2, boxSizing: "border-box" };
var EXPANDED_FIELDS = {
  ...FORM,
  flex: "0 1 auto",
  minHeight: 48,
  maxHeight: "38%",
  overflowY: "auto",
  padding: 2
};
var EXPANDED_PREVIEW_FIELD = { ...FIELD2, flex: "1 0 84px", minHeight: 0 };
var EXPANDED_PREVIEW = {
  ...PREVIEW,
  flex: "1 1 0",
  minHeight: 0,
  maxHeight: void 0,
  fontSize: 13
};
var MEMORY_ACTIONS = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 4
};

// src/client/utils/react-hooks.ts
var reactHooks;
function hooks() {
  if (reactHooks === void 0) {
    reactHooks = null;
    if (typeof require === "function") {
      try {
        reactHooks = require("react");
      } catch (e) {
        console.warn("[prompt-enhancer] \u65E0\u6CD5\u89E3\u6790 react\uFF0Chook \u4E0D\u53EF\u7528\uFF1A", e);
      }
    } else {
      console.warn("[prompt-enhancer] \u5F53\u524D\u73AF\u5883\u6CA1\u6709 require\uFF0C\u65E0\u6CD5\u89E3\u6790 react\uFF08hook \u53EA\u80FD\u5728\u5BBF\u4E3B\u91CC\u8C03\u7528\uFF09");
    }
  }
  if (!reactHooks) {
    throw new Error("prompt-enhancer: react \u8FD0\u884C\u65F6\u4E0D\u53EF\u7528\uFF08hook \u53EA\u80FD\u5728\u5BBF\u4E3B\u91CC\u8C03\u7528\uFF09");
  }
  return reactHooks;
}

// src/client/utils/data-sync.ts
var DATA_CHANGED = "prompt-enhancer:data-changed";
function hasEventFace() {
  const candidate = globalThis;
  return typeof candidate.addEventListener === "function" && typeof candidate.dispatchEvent === "function";
}
var bus = hasEventFace() ? globalThis : new EventTarget();
function subscribeDataChanged(fn) {
  bus.addEventListener(DATA_CHANGED, fn);
  return () => bus.removeEventListener(DATA_CHANGED, fn);
}
function notifyDataChanged() {
  bus.dispatchEvent(new Event(DATA_CHANGED));
}
function useDataChanged(fn, deps = []) {
  const { useEffect: useEffect15 } = hooks();
  useEffect15(() => subscribeDataChanged(fn), deps);
}

// src/settings-shape.ts
var SETTINGS_NAMESPACE = "prompt-enhancer";
var SETTINGS_KEYS = [
  "aiProvider",
  "aiModel",
  "panelWidth",
  "panelHeight",
  "showComposerButton",
  "composerButtonIconOnly",
  "showAIPolishButton",
  "aiPolishButtonIconOnly",
  "hashTriggerEnabled",
  "contextRecommendEnabled",
  "selectionAddEnabled",
  "showSidebarButton",
  "maxPromptCount"
];
var PANEL_SIZE_BOUNDS = { min: 200, max: 2e3 };
var MAX_PROMPT_COUNT_BOUNDS = { min: 1, max: 1e4 };
function pickNumber(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function pickBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}
function pickString(value, fallback) {
  return typeof value === "string" ? value : fallback;
}
function normalizeSettings(raw) {
  const r = typeof raw === "object" && raw !== null ? raw : {};
  const d = DEFAULT_SETTINGS;
  return {
    panelWidth: pickNumber(r.panelWidth, d.panelWidth),
    panelHeight: pickNumber(r.panelHeight, d.panelHeight),
    showComposerButton: pickBoolean(r.showComposerButton, d.showComposerButton),
    composerButtonIconOnly: pickBoolean(r.composerButtonIconOnly, d.composerButtonIconOnly),
    showAIPolishButton: pickBoolean(r.showAIPolishButton, d.showAIPolishButton),
    aiPolishButtonIconOnly: pickBoolean(r.aiPolishButtonIconOnly, d.aiPolishButtonIconOnly),
    hashTriggerEnabled: pickBoolean(r.hashTriggerEnabled, d.hashTriggerEnabled),
    contextRecommendEnabled: pickBoolean(r.contextRecommendEnabled, d.contextRecommendEnabled),
    selectionAddEnabled: pickBoolean(r.selectionAddEnabled, d.selectionAddEnabled),
    showSidebarButton: pickBoolean(r.showSidebarButton, d.showSidebarButton),
    maxPromptCount: pickNumber(r.maxPromptCount, d.maxPromptCount),
    aiProvider: pickString(r.aiProvider, d.aiProvider),
    aiModel: pickString(r.aiModel, d.aiModel)
  };
}

// src/err-text.ts
function reasonOf(err) {
  return err instanceof Error ? err.message : String(err);
}

// src/client/utils/settings-store.ts
function resolveNsFromDescribe(view) {
  const namespaces = view?.namespaces;
  if (!Array.isArray(namespaces)) return void 0;
  let match;
  for (const row of namespaces) {
    if (typeof row?.ns !== "string") continue;
    const dict = row.schema?.dict ?? row.value;
    if (!dict || typeof dict !== "object") continue;
    const keys = Object.keys(dict);
    if (SETTINGS_KEYS.every((key) => keys.includes(key))) {
      if (row.ns === SETTINGS_NAMESPACE) return row.ns;
      match ??= row.ns;
    }
  }
  return match;
}
var scope = null;
var unsubscribeScope;
var fallbackAttempted = false;
var fallbackLanded = false;
var snapshot = { ...DEFAULT_SETTINGS };
var listeners = /* @__PURE__ */ new Set();
function emit() {
  for (const listener of [...listeners]) listener();
}
function derive() {
  snapshot = scope === null ? { ...DEFAULT_SETTINGS } : normalizeSettings(scope.getSnapshot().value);
  emit();
}
function readSettingsFallback() {
  api.getSettings().then(
    (value) => {
      if (scope !== null) return;
      snapshot = normalizeSettings(value);
      fallbackLanded = true;
      emit();
    },
    (err) => {
      console.warn(
        "[prompt-enhancer] \u65E0 configForms\uFF0C\u964D\u7EA7\u8BFB\u53D6\u8BBE\u7F6E\u5931\u8D25\uFF0C\u5DF2\u6309\u9ED8\u8BA4\u503C\u663E\u793A\uFF1A" + reasonOf(err)
      );
    }
  );
}
function tryFallbackRead() {
  if (scope !== null || fallbackAttempted) return;
  fallbackAttempted = true;
  readSettingsFallback();
}
var nsResolver;
function setSettingsNsResolver(resolve) {
  nsResolver = resolve;
}
function setSettingsScope(next) {
  unsubscribeScope?.();
  unsubscribeScope = void 0;
  scope = next;
  if (next !== null) unsubscribeScope = next.subscribe(derive);
  derive();
  if (next === null) {
    fallbackAttempted = false;
    fallbackLanded = false;
    tryFallbackRead();
  }
}
function bindSettingsForms(forms) {
  const describe = forms.describe();
  let bound;
  const resolve = () => {
    const found = resolveNsFromDescribe(describe.getSnapshot().view);
    const next = found ?? SETTINGS_NAMESPACE;
    if (next !== bound) {
      bound = next;
      setSettingsScope(forms.get(next));
    }
    return found;
  };
  setSettingsNsResolver(resolve);
  const unsubscribe = describe.subscribe(resolve);
  resolve();
  return () => {
    unsubscribe();
    setSettingsNsResolver(void 0);
    setSettingsScope(null);
  };
}
function getSettingsSnapshot() {
  tryFallbackRead();
  return { ...snapshot };
}
function isSettingsReady() {
  if (scope !== null) return scope.getSnapshot().status === "ready";
  return fallbackLanded;
}
function subscribeSettings(listener) {
  tryFallbackRead();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function useSettings() {
  const { useState: useState17, useEffect: useEffect15 } = hooks();
  const [value, setValue] = useState17(getSettingsSnapshot);
  useEffect15(() => subscribeSettings(() => setValue(getSettingsSnapshot())), []);
  return value;
}
async function updateSettings(patch) {
  tryFallbackRead();
  const entries = Object.entries(patch);
  if (entries.length === 0) return;
  if (scope !== null) {
    for (const [key, value] of entries) {
      let accepted = await scope.set(String(key), value);
      if (!accepted && nsResolver) {
        nsResolver();
        accepted = await scope.set(String(key), value);
      }
      if (!accepted) throw new Error("\u8BBE\u7F6E\u5199\u5165\u88AB\u5BBF\u4E3B\u62D2\u7EDD\uFF08\u5B57\u6BB5 " + String(key) + "\uFF09");
    }
    return;
  }
  const next = await api.updateSettings(patch);
  snapshot = normalizeSettings(next);
  emit();
}

// src/client/utils/refined-direction.ts
var UNKNOWN_READING = { direction: "none", source: "fallback" };
function refinedDirectionMetaKey(promptId) {
  return "pl:refined-dir:" + promptId;
}
function hasTwoBodies(prompt) {
  return Boolean(prompt.sourceBody);
}
function parseStoredDirection(raw) {
  if (raw === void 0) return void 0;
  const text = raw.trim();
  if (text === "") return void 0;
  if (text === "original" || text === "refined") return text;
  console.warn("[prompt-enhancer] \u300C\u539F\u6587 / \u4F18\u5316\u7A3F\u300D\u65B9\u5411\u7684 meta \u503C\u4E0D\u53EF\u8BC6\u522B\uFF08\u6309\u65E0\u8BB0\u5F55\u5904\u7406\uFF09\uFF1A" + JSON.stringify(raw));
  return void 0;
}
function readRefinedDirection(prompt, stored) {
  if (!hasTwoBodies(prompt)) return UNKNOWN_READING;
  const recorded = parseStoredDirection(stored);
  if (recorded === void 0) return UNKNOWN_READING;
  return { direction: recorded, source: "record" };
}
function canPersistDirection(reading) {
  return reading.source === "record";
}
function oppositeDirection(direction) {
  if (direction === "original") return "refined";
  if (direction === "refined") return "original";
  return "none";
}
function compareLabelKeys(direction) {
  if (direction === "original") {
    return { current: "manager.compare.original", counterpart: "manager.compare.refined", neutral: false };
  }
  if (direction === "refined") {
    return { current: "manager.compare.refined", counterpart: "manager.compare.original", neutral: false };
  }
  return { current: "manager.compare.current", counterpart: "manager.compare.counterpart", neutral: true };
}
async function loadStoredDirection(promptId, getMeta) {
  try {
    return await getMeta(refinedDirectionMetaKey(promptId));
  } catch (err) {
    console.warn("[prompt-enhancer] \u8BFB\u53D6\u300C\u539F\u6587 / \u4F18\u5316\u7A3F\u300D\u65B9\u5411\u5931\u8D25\uFF08\u672C\u6B21\u6253\u5F00\u9000\u56DE\u4E2D\u6027\u6807\u6CE8\uFF09", err);
    return void 0;
  }
}
async function saveRefinedDirection(promptId, direction, setMeta = (key, value) => api.setMeta(key, value)) {
  if (direction === "none") return;
  try {
    await setMeta(refinedDirectionMetaKey(promptId), direction);
  } catch (err) {
    console.warn("[prompt-enhancer] \u300C\u539F\u6587 / \u4F18\u5316\u7A3F\u300D\u65B9\u5411\u843D meta \u5931\u8D25\uFF08\u4E0B\u6B21\u6253\u5F00\u4F1A\u9000\u56DE\u4E2D\u6027\u6807\u6CE8\uFF09", err);
  }
}
function toggleDirectionWrite(prompt, reading) {
  if (!hasTwoBodies(prompt)) return "none";
  return canPersistDirection(reading) ? "persist" : "clear";
}
function shouldAcceptLateRead(toggledSinceRead) {
  return !toggledSinceRead;
}
async function clearRefinedDirection(promptId, setMeta = (key, value) => api.setMeta(key, value)) {
  try {
    await setMeta(refinedDirectionMetaKey(promptId), "");
  } catch (err) {
    console.warn("[prompt-enhancer] \u300C\u539F\u6587 / \u4F18\u5316\u7A3F\u300D\u65B9\u5411\u7684\u65E7\u8BB0\u5F55\u4F5C\u5E9F\u5931\u8D25\uFF08\u4E0B\u6B21\u6253\u5F00\u53EF\u80FD\u91C7\u4FE1\u4E00\u6761\u5DF2\u9648\u65E7\u7684\u8BB0\u5F55\uFF09", err);
  }
}
function applyToggleDirection(promptId, prompt, reading, setMeta = (key, value) => api.setMeta(key, value)) {
  const write = toggleDirectionWrite(prompt, reading);
  if (write === "none") return { write, next: void 0, done: Promise.resolve() };
  if (write === "clear") return { write, next: void 0, done: clearRefinedDirection(promptId, setMeta) };
  const next = oppositeDirection(reading.direction);
  return { write, next, done: saveRefinedDirection(promptId, next, setMeta) };
}
async function seedRefinedDirection(promptId, setMeta = (key, value) => api.setMeta(key, value)) {
  await saveRefinedDirection(promptId, "refined", setMeta);
}

// src/skill-name.ts
var SKILL_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
var SKILL_NAME_MAX_LEN = 64;
function toKebab(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/[/\\]/.test(trimmed) || trimmed.includes("..")) return "";
  return trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function isValidSkillName(name) {
  return name.length > 0 && name.length <= SKILL_NAME_MAX_LEN && SKILL_NAME_RE.test(name);
}

// src/skill-description.ts
function resolveDescription(prompt, descriptor) {
  const candidates = [
    prompt.summary,
    descriptor?.description,
    prompt.body.split("\n").map((l) => l.trim()).find((l) => l.length > 0),
    prompt.title
  ];
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value) return value;
  }
  return void 0;
}
function yamlQuote(value) {
  return JSON.stringify(value);
}
function renderSkillFile(input) {
  const front = ["---", `name: ${input.name}`, `description: ${yamlQuote(input.description)}`];
  if (input.whenToUse?.trim()) front.push(`whenToUse: ${yamlQuote(input.whenToUse.trim())}`);
  front.push("---", "");
  return front.join("\n") + "\n" + input.body.trim() + "\n";
}

// src/client/utils/skill-export.ts
function createSkillRun() {
  const run = {
    cancelled: false,
    cancel() {
      run.cancelled = true;
    }
  };
  return run;
}
function toggleSelected(selected, id) {
  return selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
}
function isAllSelected(visible, selected) {
  return visible.length > 0 && visible.every((p) => selected.includes(p.id));
}
function toggleAllVisible(visible, selected) {
  if (isAllSelected(visible, selected)) {
    return selected.filter((id) => !visible.some((p) => p.id === id));
  }
  const out = [...selected];
  for (const prompt of visible) if (!out.includes(prompt.id)) out.push(prompt.id);
  return out;
}
function filterByTag(prompts, tag) {
  if (tag === "") return [...prompts];
  return prompts.filter((p) => (p.tags ?? []).includes(tag));
}
function collectTags(prompts) {
  const out = [];
  for (const prompt of prompts) {
    for (const tag of prompt.tags ?? []) if (!out.includes(tag)) out.push(tag);
  }
  return out.sort((a, b) => a.localeCompare(b));
}
function pickSelected(prompts, selected) {
  return prompts.filter((p) => selected.includes(p.id));
}
function exportNameLocked(prompt) {
  return Boolean(prompt.skillName?.trim());
}
function precheckExport(prompt, descriptor) {
  const raw = exportNameLocked(prompt) ? prompt.skillName ?? "" : descriptor?.name ?? "";
  const name = toKebab(raw);
  if (!isValidSkillName(name)) {
    return {
      ok: false,
      errorKey: raw.trim() === "" ? "manager.skill.nameMissing" : "manager.skill.nameInvalid",
      detail: "kebab=" + JSON.stringify(name)
    };
  }
  const description = resolveDescription(prompt, descriptor);
  if (description === void 0) {
    return {
      ok: false,
      errorKey: "manager.skill.descMissing",
      detail: "summary|descriptor.description|body[0]|title all empty"
    };
  }
  return { ok: true, name, description };
}
async function describeEach(prompts, describeOne, options = {}) {
  const out = {};
  for (const prompt of prompts) {
    if (options.run?.cancelled) break;
    let outcome;
    try {
      outcome = { ok: true, descriptor: await describeOne(prompt) };
    } catch (err) {
      outcome = { ok: false, errorKey: "manager.skill.describeFailed", detail: reasonOf(err) };
    }
    out[prompt.id] = outcome;
    options.onEach?.(prompt.id, outcome);
  }
  return out;
}
async function exportEach(input) {
  const outcomes = [];
  for (const prompt of input.prompts) {
    if (input.run?.cancelled) break;
    outcomes.push(await exportOne(prompt, input));
  }
  return outcomes;
}
async function exportOne(prompt, input) {
  const recorded = input.descriptors[prompt.id];
  const descriptor = recorded?.ok ? recorded.descriptor : void 0;
  const pre = precheckExport(prompt, descriptor);
  if (!pre.ok) {
    return { status: "failed", id: prompt.id, title: prompt.title, errorKey: pre.errorKey, detail: pre.detail };
  }
  const request = { name: pre.name, descriptor };
  let receipt;
  try {
    receipt = await input.send(prompt, request);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 409 || !err.skillConflict) return failedOutcome(prompt, err);
    const { name, token } = err.skillConflict;
    if (input.run?.cancelled) {
      return { status: "declined", id: prompt.id, title: prompt.title, name, detail: reasonOf(err) };
    }
    const approved = await input.confirmConflict({
      id: prompt.id,
      title: prompt.title,
      name,
      detail: reasonOf(err)
    });
    if (!approved || input.run?.cancelled) {
      return { status: "declined", id: prompt.id, title: prompt.title, name, detail: reasonOf(err) };
    }
    try {
      receipt = await input.send(prompt, { ...request, conflictToken: token });
    } catch (retryErr) {
      return failedOutcome(prompt, retryErr);
    }
  }
  if (!receipt.path) {
    return {
      status: "failed",
      id: prompt.id,
      title: prompt.title,
      errorKey: "manager.skill.pathMissing",
      detail: "keys=" + Object.keys(receipt).sort().join(",")
    };
  }
  const exported = { status: "exported", id: prompt.id, title: prompt.title, name: receipt.name, path: receipt.path };
  input.onExported?.(exported);
  if (descriptor) {
    const used = exportNameLocked(prompt) ? { ...descriptor, name: exported.name } : descriptor;
    await (input.saveDescriptor ?? persistDescriptor)(prompt.id, used);
  }
  return exported;
}
function failedOutcome(prompt, err) {
  return {
    status: "failed",
    id: prompt.id,
    title: prompt.title,
    errorKey: "manager.skill.exportFailed",
    detail: reasonOf(err)
  };
}
function skillDescriptorMetaKey(promptId) {
  return "pl:skill-descriptor:" + promptId;
}
function isDescriptorPayload(value) {
  if (typeof value !== "object" || value === null) return false;
  const v = value;
  if (typeof v.name !== "string" || typeof v.description !== "string") return false;
  return v.whenToUse === void 0 || typeof v.whenToUse === "string";
}
function parseStoredDescriptor(raw) {
  if (!raw) return void 0;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn("[prompt-enhancer] \u6280\u80FD descriptor \u7684 meta \u4E0D\u662F\u5408\u6CD5 JSON\uFF08\u91CD\u5BFC\u9000\u56DE\u515C\u5E95\u94FE\uFF09", err);
    return void 0;
  }
  if (!isDescriptorPayload(parsed)) {
    console.warn("[prompt-enhancer] \u6280\u80FD descriptor \u7684 meta \u5F62\u72B6\u4E0D\u7B26\uFF08\u91CD\u5BFC\u9000\u56DE\u515C\u5E95\u94FE\uFF09");
    return void 0;
  }
  const out = { name: parsed.name, description: parsed.description };
  if (parsed.whenToUse !== void 0) out.whenToUse = parsed.whenToUse;
  return out;
}
async function persistDescriptor(promptId, descriptor) {
  try {
    await api.setMeta(skillDescriptorMetaKey(promptId), JSON.stringify(descriptor));
  } catch (err) {
    console.warn("[prompt-enhancer] \u6280\u80FD descriptor \u843D meta \u5931\u8D25\uFF08\u91CD\u5BFC\u4F1A\u9000\u56DE\u515C\u5E95\u94FE\uFF09", err);
  }
}
async function loadStoredDescriptor(promptId, getMeta) {
  try {
    return parseStoredDescriptor(await getMeta(skillDescriptorMetaKey(promptId)));
  } catch (err) {
    console.warn("[prompt-enhancer] \u8BFB\u53D6\u6280\u80FD descriptor \u5931\u8D25\uFF08\u91CD\u5BFC\u9000\u56DE\u515C\u5E95\u94FE\uFF09", err);
    return void 0;
  }
}
function summarizeExport(outcomes) {
  const exported = outcomes.filter((o) => o.status === "exported");
  const failed = outcomes.filter((o) => o.status === "failed");
  const declined = outcomes.filter((o) => o.status === "declined");
  return {
    exported,
    failed,
    declined,
    okCount: exported.length,
    failCount: failed.length,
    declinedCount: declined.length,
    total: outcomes.length
  };
}

// src/client/utils/prompt-meta.ts
function perPromptMetaKeys(promptId, keepSkillDescriptor = false) {
  return [refinedDirectionMetaKey(promptId), ...keepSkillDescriptor ? [] : [skillDescriptorMetaKey(promptId)], templateMemoryKey(promptId)];
}
async function deletePrompts(input) {
  const receipt = await input.remove();
  if (!input.irreversible) return { succeeded: 0, failed: 0 };
  const ids = receiptIds(receipt) ?? input.ids;
  return clearPromptMeta(ids.flatMap((id) => perPromptMetaKeys(id)), input.deleteMeta);
}
async function clearPromptMeta(keys, deleteMeta = api.deleteMeta) {
  const settled = await Promise.allSettled(keys.map((key) => Promise.resolve().then(() => deleteMeta(key))));
  let succeeded = 0;
  let failed = 0;
  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i];
    if (outcome.status === "fulfilled") {
      succeeded++;
    } else {
      failed++;
      console.warn(`[prompt-enhancer] \u6E05\u7406\u63D0\u793A\u8BCD\u7684 meta \u952E\u5931\u8D25\uFF08\u6B8B\u7559\u952E\uFF1A${keys[i]}\uFF09`, outcome.reason);
    }
  }
  return { succeeded, failed };
}
function receiptIds(receipt) {
  if (typeof receipt !== "object" || receipt === null) return void 0;
  const raw = receipt.ids;
  if (!Array.isArray(raw)) return void 0;
  if (!raw.every((id) => typeof id === "string" && id !== "")) return void 0;
  return raw;
}

// src/client/utils/confirm.ts
var current = null;
var settle = null;
var nextId = 1;
var listeners2 = /* @__PURE__ */ new Set();
function emit2() {
  for (const listener of [...listeners2]) listener();
}
function subscribeConfirm(listener) {
  listeners2.add(listener);
  return () => {
    listeners2.delete(listener);
  };
}
function getConfirmSnapshot() {
  return current;
}
function requestConfirm(input) {
  if (current !== null) {
    console.warn("[prompt-enhancer] \u5DF2\u6709\u4E00\u4E2A\u786E\u8BA4\u5F39\u7A97\u5728\u9014\uFF0C\u672C\u6B21\u786E\u8BA4\u8BF7\u6C42\u4EE5\u300C\u53D6\u6D88\u300D\u7ACB\u5373\u843D\u5730\uFF08\u4E0D\u6392\u961F\uFF09");
    return Promise.resolve(false);
  }
  const promise = new Promise((resolve) => {
    settle = resolve;
  });
  current = { ...input, id: nextId++ };
  emit2();
  return promise;
}
function resolveConfirm(approved) {
  const done = settle;
  if (done === null) return;
  current = null;
  settle = null;
  emit2();
  done(approved);
}
function useConfirmRequest() {
  const { useState: useState17, useEffect: useEffect15 } = hooks();
  const [snapshot2, setSnapshot] = useState17(getConfirmSnapshot);
  useEffect15(() => subscribeConfirm(() => setSnapshot(getConfirmSnapshot())), []);
  return snapshot2;
}

// src/eviction-order.ts
function compareEvictionOrder(a, b) {
  return Number(a.aiRefined) - Number(b.aiRefined) || a.lastUsedAt - b.lastUsedAt || a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
function selectEvictions(prompts, count) {
  return count <= 0 ? [] : [...prompts].sort(compareEvictionOrder).slice(0, count);
}

// src/client/utils/eviction.ts
function previewEvictions(prompts, maxCount, incoming = 1) {
  return selectEvictions(prompts, prompts.length + incoming - maxCount);
}

// src/client/utils/capture.ts
async function createFromCapture(input) {
  const settings = getSettingsSnapshot();
  if (!isSettingsReady()) {
    throw new Error("\u8BBE\u7F6E\u5C1A\u672A\u5C31\u7EEA\uFF0C\u65E0\u6CD5\u786E\u8BA4\u5B58\u50A8\u4E0A\u9650\uFF1B\u5DF2\u4E2D\u6B62\u672C\u6B21\u6C89\u6DC0\uFF0C\u4EE5\u514D\u63D0\u793A\u8BCD\u88AB\u5BBF\u4E3B\u9759\u9ED8\u6DD8\u6C70");
  }
  const prompts = await api.listPrompts();
  const victims = previewEvictions(prompts, settings.maxPromptCount, 1);
  if (victims.length > 0) {
    const approved = await requestConfirm({
      title: "manager.evict.title",
      message: "manager.evict.message",
      detail: victims.map((p) => p.title),
      confirmLabel: "manager.evict.confirm",
      cancelLabel: "manager.evict.cancel"
    });
    if (!approved) return { ok: false, reason: "cancelled" };
  }
  const created = await api.createPrompt({
    title: clampTitle((input.title ?? "").trim() || firstNonEmptyLine(input.body)),
    body: input.body,
    tags: input.tags,
    summary: input.summary,
    variables: input.variables,
    ...victims.length ? { approvedEvictions: victims.map(({ id }) => id) } : {}
  });
  notifyDataChanged();
  const evicted = created.evicted ?? [];
  if (evicted.length > 0) {
    void deletePrompts({ ids: evicted, irreversible: true, remove: async () => {
    } }).catch((err) => {
      console.warn(
        "[prompt-enhancer] \u6DD8\u6C70\u8005\u7684 meta \u952E\u6E05\u7406\u672A\u8DD1\u5B8C\uFF08\u63D0\u793A\u8BCD\u5DF2\u521B\u5EFA\uFF0C\u6B8B\u7559\u952E\uFF1A" + evicted.join(",") + "\uFF09",
        err
      );
    });
  }
  return { ok: true, prompt: created.prompt, evicted };
}

// src/client/utils/ui-state.ts
var DEFAULT_PANEL = "list";
var state = { open: false, panel: DEFAULT_PANEL };
var capture = null;
var listeners3 = /* @__PURE__ */ new Set();
function emit3() {
  for (const listener of [...listeners3]) listener();
}
function subscribe(listener) {
  listeners3.add(listener);
  return () => {
    listeners3.delete(listener);
  };
}
function getSnapshot() {
  return state;
}
function getCaptureSnapshot() {
  return capture;
}
function openManager(panel = DEFAULT_PANEL) {
  if (state.open && state.panel === panel) return;
  state = { open: true, panel };
  emit3();
}
function closeManager() {
  if (!state.open) return;
  state = { open: false, panel: state.panel };
  emit3();
}
function pushCapture(payload) {
  capture = { body: payload.body, title: payload.title ?? "" };
  emit3();
}
function takeCapture() {
  const pending = capture;
  capture = null;
  if (pending) emit3();
  return pending;
}
function useManagerState() {
  const { useState: useState17, useEffect: useEffect15 } = hooks();
  const [snapshot2, setSnapshot] = useState17(getSnapshot);
  useEffect15(() => subscribe(() => setSnapshot(getSnapshot())), []);
  return snapshot2;
}
function useCapture() {
  const { useState: useState17, useEffect: useEffect15 } = hooks();
  const [snapshot2, setSnapshot] = useState17(getCaptureSnapshot);
  useEffect15(() => subscribe(() => setSnapshot(getCaptureSnapshot())), []);
  return snapshot2;
}
var hashSuggestVisible = false;
var hashSuggestListeners = /* @__PURE__ */ new Set();
function getHashSuggestVisibleSnapshot() {
  return hashSuggestVisible;
}
function subscribeHashSuggestVisible(listener) {
  hashSuggestListeners.add(listener);
  return () => {
    hashSuggestListeners.delete(listener);
  };
}
function setHashSuggestVisible(visible) {
  if (hashSuggestVisible === visible) return;
  hashSuggestVisible = visible;
  for (const listener of [...hashSuggestListeners]) listener();
}
function useHashSuggestVisible() {
  const { useState: useState17, useEffect: useEffect15 } = hooks();
  const [snapshot2, setSnapshot] = useState17(getHashSuggestVisibleSnapshot);
  useEffect15(() => subscribeHashSuggestVisible(() => setSnapshot(getHashSuggestVisibleSnapshot())), []);
  return snapshot2;
}
var claimedOverlay = "none";
var overlayClaimListeners = /* @__PURE__ */ new Set();
function getOverlayClaimSnapshot() {
  return claimedOverlay;
}
function subscribeOverlayClaim(listener) {
  overlayClaimListeners.add(listener);
  return () => {
    overlayClaimListeners.delete(listener);
  };
}
function claimOverlay(kind) {
  if (claimedOverlay === kind) return;
  claimedOverlay = kind;
  for (const listener of [...overlayClaimListeners]) listener();
}
function claimOverlayIfFree(kind) {
  if (claimedOverlay === kind) return;
  if (claimedOverlay !== "none") return;
  claimedOverlay = kind;
  for (const listener of [...overlayClaimListeners]) listener();
}
function releaseOverlay(kind) {
  if (claimedOverlay !== kind) return;
  claimedOverlay = "none";
  for (const listener of [...overlayClaimListeners]) listener();
}
function useOverlayClaim() {
  const { useState: useState17, useEffect: useEffect15 } = hooks();
  const [snapshot2, setSnapshot] = useState17(getOverlayClaimSnapshot);
  useEffect15(() => subscribeOverlayClaim(() => setSnapshot(getOverlayClaimSnapshot())), []);
  return snapshot2;
}

// src/client/utils/dismiss-outside.ts
function isOutside(root, target, isNode) {
  return !(root !== null && isNode(target) && root.contains(target));
}
function useDismissOnOutside(rootRef, active, onDismiss) {
  const { useEffect: useEffect15 } = hooks();
  useEffect15(() => {
    if (!active) return;
    const onPointerDown = (ev) => {
      if (!isOutside(rootRef.current, ev.target, (v) => v instanceof Node)) return;
      onDismiss();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [active, onDismiss, rootRef]);
}

// src/client/components/AIPolishButton.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
var COPIED_MS = 2e3;
var PREVIEW_MAX = 120;
function previewText(body) {
  return body.length > PREVIEW_MAX ? body.slice(0, PREVIEW_MAX) + "\u2026" : body;
}
function SparkleIcon() {
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true", style: ICON, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
    "path",
    {
      d: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z",
      stroke: "currentColor",
      strokeWidth: "1.6",
      strokeLinejoin: "round"
    }
  ) });
}
function AIPolishButton({ t, useInput, inputActions }) {
  const draft = useInput((s) => s.draft);
  const settings = useSettings();
  const [status, setStatus] = React3.useState("idle");
  const [mode, setMode] = React3.useState("polish");
  const [original, setOriginal] = React3.useState("");
  const [polished, setPolished] = React3.useState("");
  const [composerCheck, setComposerCheck] = React3.useState(null);
  const [draftSession, setDraftSession] = React3.useState(null);
  const [replacement, setReplacement] = React3.useState(null);
  const [resultView, setResultView] = React3.useState("final");
  const showOriginal = resultView === "original";
  const [keepVars, setKeepVars] = React3.useState(false);
  const [refined, setRefined] = React3.useState(null);
  const [saved, setSaved] = React3.useState(null);
  const [evicted, setEvicted] = React3.useState(false);
  const [saveError, setSaveError] = React3.useState(null);
  const [errorKey, setErrorKey] = React3.useState(null);
  const [variables, setVariables] = React3.useState([]);
  const [selectedSuggestions, setSelectedSuggestions] = React3.useState([]);
  const [fillTarget, setFillTarget] = React3.useState(null);
  const [draftChanged, setDraftChanged] = React3.useState(false);
  const refinedBody = refined ? composeRefinedBody(refined.body, refined.suggestions ?? [], selectedSuggestions) : "";
  const variableNames = parseVariables(refinedBody);
  const templateVariables = variables.filter(({ name }) => variableNames.includes(name));
  const resultBody = refined ? refinedBody : polished;
  const missing = missingVariables(original, resultBody);
  const [copied, setCopied] = React3.useState(false);
  const [copyFailed, setCopyFailed] = React3.useState(false);
  const rootRef = React3.useRef(null);
  const busyRef = React3.useRef(false);
  const requestRef = React3.useRef(null);
  const [elapsedSeconds, setElapsedSeconds] = React3.useState(0);
  const aliveRef = React3.useRef(true);
  React3.useEffect(() => {
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
  const waiting = status === "polishing" || status === "checking" || status === "refining" || status === "draftingPrompt" || status === "searchingDraft";
  React3.useEffect(() => {
    if (!waiting) return;
    const id = window.setInterval(() => {
      const request = requestRef.current;
      if (request) setElapsedSeconds(Math.floor((performance.now() - request.startedAt) / 1e3));
    }, 1e3);
    return () => window.clearInterval(id);
  }, [waiting]);
  const beginRequest = (returnTo) => {
    const controller = new AbortController();
    requestRef.current = { controller, startedAt: performance.now(), returnTo };
    busyRef.current = true;
    setElapsedSeconds(0);
    return controller;
  };
  const isCurrentRequest = (controller) => aliveRef.current && requestRef.current?.controller === controller;
  const finishRequest = (controller) => {
    if (!isCurrentRequest(controller)) return false;
    requestRef.current = null;
    busyRef.current = false;
    return true;
  };
  const cancelRequest = () => {
    const request = requestRef.current;
    if (!request || !finishRequest(request.controller)) return;
    request.controller.abort();
    setStatus(request.returnTo);
  };
  const claimed = useOverlayClaim();
  const aiWanted = settings.showAIPolishButton && status !== "idle";
  const aiVisible = aiWanted && canRender("ai", claimed);
  React3.useEffect(() => {
    if (aiWanted) claimOverlayIfFree("ai");
    else releaseOverlay("ai");
  }, [aiWanted, claimed]);
  React3.useEffect(() => () => releaseOverlay("ai"), []);
  const close = () => {
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
  const settled = status === "choose" || status === "done" || status === "checked" || status === "error" || status === "refined" || status === "saved" || status === "saveFailed" || status === "writeBackFailed";
  useDismissOnOutside(rootRef, aiVisible && settled && draftSession === null, close);
  React3.useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), COPIED_MS);
    return () => {
      window.clearTimeout(id);
    };
  }, [copied]);
  const updateDraft = (edit) => {
    setDraftSession((session) => session && editDraftSession(session, edit));
  };
  const run = (mode2) => {
    const handoff = draftSession ? prepareDraftHandoff(draftSession) : void 0;
    const snapshot2 = draftSession ? handoff?.body : draft;
    if (busyRef.current || !snapshot2?.trim()) return;
    const controller = beginRequest(draftSession ? "draftPrompt" : "choose");
    setMode(mode2);
    const keepVariables = keepVariablesFor(snapshot2);
    setKeepVars(keepVariables);
    setErrorKey(null);
    setVariables([]);
    setSelectedSuggestions([]);
    setFillTarget(null);
    setDraftChanged(false);
    setOriginal(snapshot2);
    setResultView("final");
    setCopied(false);
    setCopyFailed(false);
    setPolished("");
    setComposerCheck(null);
    setRefined(null);
    setStatus(mode2 === "polish" ? "polishing" : mode2 === "check" ? "checking" : "refining");
    void (async () => {
      try {
        if (mode2 === "template") {
          const result = await api.refinePrompt(snapshot2, controller.signal);
          if (!isCurrentRequest(controller)) return;
          setRefined(result);
          setStatus("refined");
        } else if (mode2 === "check") {
          const report = await api.checkPrompt(snapshot2, controller.signal, handoff?.generatedFrom);
          if (!isCurrentRequest(controller)) return;
          if (handoff) updateDraft({ type: "checked", snapshot: handoff, report });
          else setComposerCheck(report);
          setStatus("checked");
        } else {
          const result = await api.polishPrompt(snapshot2, { keepVariables }, controller.signal);
          if (!isCurrentRequest(controller)) return;
          setPolished(result.polished);
          setStatus("done");
        }
      } catch (err) {
        if (!isCurrentRequest(controller)) return;
        console.warn("[prompt-enhancer] AI \u4F18\u5316\u5931\u8D25", err);
        setErrorKey(aiErrorKey(err));
        setStatus("error");
      } finally {
        finishRequest(controller);
      }
    })();
  };
  const startDraft = () => {
    setErrorKey(null);
    setDraftSession(createDraftSession(draft));
    setStatus("draftPrompt");
  };
  const backToDraft = () => {
    setErrorKey(null);
    setDraftChanged(false);
    setReplacement(null);
    setCopied(false);
    setCopyFailed(false);
    setStatus("draftPrompt");
  };
  const runDraftGeneration = (action) => {
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
        console.warn("[prompt-enhancer] \u63D0\u793A\u8BCD\u8D77\u8349\u5931\u8D25", err);
        setErrorKey(aiErrorKey(err));
      } finally {
        if (finishRequest(controller)) setStatus("draftPrompt");
      }
    })();
  };
  const searchDraft = async (query) => {
    if (busyRef.current || !query.trim()) return;
    const controller = beginRequest("draftPrompt");
    setStatus("searchingDraft");
    try {
      const search = await api.searchDraft(query.trim(), controller.signal);
      if (isCurrentRequest(controller)) updateDraft({ type: "searched", search });
    } catch (err) {
      if (!isCurrentRequest(controller)) return;
      console.warn("[prompt-enhancer] \u8D77\u8349\u641C\u7D22\u5931\u8D25", err);
      updateDraft({ type: "searched", search: { status: "failed" } });
    } finally {
      if (finishRequest(controller)) setStatus("draftPrompt");
    }
  };
  const save = () => {
    if (busyRef.current || refined === null || !refinedBody.trim()) return;
    busyRef.current = true;
    setSaveError(null);
    setStatus("saving");
    const writeBack = needsWriteBack(refinedBody, original);
    void (async () => {
      try {
        let outcome;
        try {
          outcome = await createFromCapture({
            ...libraryCreateInput(refined, original),
            ...!writeBack && templateVariables.length ? { variables: templateVariables } : {}
          });
        } catch (err) {
          console.warn("[prompt-enhancer] \u5B58\u5165\u8BCD\u5E93\u5931\u8D25", err);
          if (!aliveRef.current) return;
          setSaveError(reasonOf(err));
          setStatus("saveFailed");
          return;
        }
        if (!aliveRef.current) return;
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
            seed: seedRefinedDirection
          });
          notifyDataChanged();
          if (!aliveRef.current) return;
          setSaved(updated);
          setStatus("saved");
        } catch (err) {
          console.warn("[prompt-enhancer] \u4F18\u5316\u7A3F\u5199\u56DE\u5931\u8D25\uFF08\u539F\u6587\u5DF2\u5165\u5E93\uFF09", err);
          if (!aliveRef.current) return;
          setSaveError(reasonOf(err));
          setStatus("writeBackFailed");
        }
      } finally {
        busyRef.current = false;
      }
    })();
  };
  const retryWriteBack = () => {
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
          seed: seedRefinedDirection
        });
        notifyDataChanged();
        if (!aliveRef.current) return;
        setSaved(updated);
        setStatus("saved");
      } catch (err) {
        console.warn("[prompt-enhancer] \u4F18\u5316\u7A3F\u5199\u56DE\u91CD\u8BD5\u5931\u8D25", err);
        if (!aliveRef.current) return;
        setSaveError(reasonOf(err));
        setStatus("writeBackFailed");
      } finally {
        busyRef.current = false;
      }
    })();
  };
  const copy = (text) => {
    void (async () => {
      try {
        await navigator.clipboard.writeText(text);
        if (aliveRef.current) {
          setCopied(true);
          setCopyFailed(false);
        }
      } catch (err) {
        console.warn("[prompt-enhancer] \u590D\u5236\u5931\u8D25", err);
        if (aliveRef.current) {
          setCopied(false);
          setCopyFailed(true);
        }
      }
    })();
  };
  const writeComposer = (text) => {
    inputActions.setDraft(text);
    close();
  };
  const apply2 = (text) => {
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
  const confirmReplacement = () => {
    if (replacement === null) return;
    const application = confirmDraftApplication(replacement, draft);
    if (application.kind === "apply") writeComposer(application.text);
    else setReplacement(application);
  };
  const tryResult = (variable = "") => {
    if (needsValues(resultBody)) setFillTarget(variable);
    else apply2(resultBody);
  };
  if (settings.showAIPolishButton === false) return null;
  const busyKey = status === "polishing" ? "ai.polishing" : status === "checking" ? "ai.checking" : status === "draftingPrompt" ? "ai.draft.generating" : status === "searchingDraft" ? "ai.draft.searching" : status === "refining" ? "ai.refining" : status === "saving" ? "ai.saving" : null;
  const empty = draft.trim() === "";
  const triggerDisabled = busyKey !== null;
  const hint = busyKey !== null ? t(busyKey) : t("ai.tip");
  const evictedNotice = evicted ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: MUTED, children: t("ai.evicted") }) : null;
  const showRefined = status === "refined" || status === "saveFailed";
  const needsFill = needsValues(resultBody);
  const showCheck = status === "checking" || status === "checked";
  const showDraft = status === "draftPrompt" || status === "draftingPrompt" || status === "searchingDraft";
  const showMenu = status === "choose" || status === "error" && !draftSession;
  const failedHandoffKey = mode === "check" ? "ai.check" : "ai.refine";
  const checkReport = draftSession ? draftSession.checked?.report : composerCheck;
  const checkInput = draftSession?.body ?? draft;
  const checkStale = draftSession ? draftCheckIsStale(draftSession) : checkInput !== original;
  const dialogLabel = status === "error" && draftSession ? t(failedHandoffKey) : showDraft ? t("ai.draft.title") : showCheck ? t("ai.check") : status === "done" ? t("ai.result") : showRefined || status === "saving" || status === "writeBackFailed" ? t("ai.refined") : status === "saved" ? t("ai.saved") : t("ai.button");
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { ref: rootRef, style: WRAP, children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
      "button",
      {
        type: "button",
        style: { ...BUTTON2, cursor: triggerDisabled ? "default" : "pointer", opacity: triggerDisabled ? 0.6 : 1 },
        title: hint,
        "aria-label": t("ai.button"),
        "aria-busy": busyKey !== null,
        "aria-haspopup": "dialog",
        "aria-expanded": aiVisible,
        disabled: triggerDisabled,
        onClick: () => {
          if (aiVisible) close();
          else if (status === "idle") setStatus("choose");
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(SparkleIcon, {}),
          showsLabel(settings.aiPolishButtonIconOnly) && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: t("ai.button") })
        ]
      }
    ),
    aiVisible && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: ANCHOR, children: fillTarget !== null ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      TemplateVariablesDialog,
      {
        body: resultBody,
        variables: templateVariables,
        t,
        panelSize: refined ? TEMPLATE_PANEL : { width: PANEL.width },
        focusVariable: fillTarget,
        confirmUnfilled: true,
        confirmLabel: t("ai.apply"),
        onFilled: apply2,
        onCancel: () => setFillTarget(null)
      }
    ) : /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
      "div",
      {
        role: "dialog",
        "aria-label": dialogLabel,
        style: showRefined || showDraft || replacement ? TEMPLATE_PANEL : status === "checked" ? CHECK_PANEL : showMenu ? MENU_PANEL : PANEL,
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { style: status === "checked" ? { ...PANEL_HEADER, flexShrink: 0 } : PANEL_HEADER, children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("strong", { children: status === "error" && draftSession ? t(failedHandoffKey) : t(showDraft ? "ai.draft.title" : showCheck ? "ai.check" : showRefined ? "ai.refine" : "ai.button") }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", style: PANEL_BUTTON, disabled: !waiting && busyKey !== null, onClick: waiting ? cancelRequest : close, children: t(waiting ? "ai.cancelRequest" : "ai.close") })
          ] }),
          showMenu && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: MENU_ACTIONS, children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", style: empty ? DISABLED_MODE : PRIMARY_MODE, disabled: empty, onClick: () => run("polish"), children: t("ai.lightPolish") }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", style: empty ? DISABLED_MODE : MENU_BUTTON, disabled: empty, onClick: () => run("check"), children: t("ai.check") }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", style: empty ? DISABLED_MODE : MENU_BUTTON, disabled: empty, onClick: () => run("template"), children: t("ai.refine") }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", style: empty ? PRIMARY_MODE : MENU_BUTTON, onClick: startDraft, children: t("ai.draft.title") })
            ] }),
            empty && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: MUTED, children: t("ai.empty") })
          ] }),
          replacement ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: RESULT_CONTENT, children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { role: "alert", children: t(replacement.current === draft ? "ai.draft.replaceWarning" : "ai.draft.replaceChanged") }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: HEADER, children: t("ai.draft.currentComposer") }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("pre", { style: PREVIEW2, children: draft || "\u2014" }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: HEADER, children: t("ai.draft.result") }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("pre", { style: PREVIEW2, children: replacement.proposed })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("footer", { style: RESULT_ACTIONS, children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", style: PANEL_BUTTON, onClick: () => setReplacement(null), children: t("ai.draft.keepEditing") }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", style: PRIMARY2, onClick: confirmReplacement, children: t(replacement.current === draft ? "ai.draft.replace" : "ai.draft.confirmCurrent") })
            ] })
          ] }) : showDraft && draftSession && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
            PromptDraftForm,
            {
              t,
              session: draftSession,
              busy: busyKey !== null,
              error: errorKey,
              update: updateDraft,
              generate: runDraftGeneration,
              onSearch: (query) => void searchDraft(query),
              onBack: () => {
                setDraftSession(null);
                setErrorKey(null);
                setStatus("choose");
              },
              onApply: () => apply2(draftSession.body),
              onCheck: () => run("check"),
              onViewCheck: () => setStatus("checked"),
              onEnhance: () => run("template"),
              onCopy: () => copy(draftSession.body),
              copyLabel: copyFailed ? "ai.copyFail" : copied ? "ai.copied" : "ai.copy"
            }
          ),
          !showRefined && draftChanged && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { role: "alert", style: MUTED, children: t("ai.draftChanged") }),
          status === "done" && missing.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { role: "alert", style: MUTED, children: [
            t("ai.missingVariables"),
            " ",
            missing.join(", ")
          ] }),
          busyKey !== null && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: WAIT_STATUS, children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { role: "status", style: MUTED, children: t(busyKey) }),
            waiting && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: WAIT_ELAPSED, children: t("ai.elapsed").replace("{seconds}", String(elapsedSeconds)) })
          ] }),
          status === "error" && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { role: "alert", style: MUTED, children: t(errorKey ?? "ai.fail") }),
            draftSession && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: ACTIONS2, children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", style: PANEL_BUTTON, onClick: backToDraft, children: t("ai.draft.backToResult") }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", style: PRIMARY2, onClick: () => run(mode), children: t("ai.retry") })
            ] })
          ] }),
          status === "checked" && checkReport && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { role: "region", "aria-label": t("ai.checkReport"), tabIndex: 0, style: CHECK_CONTENT, children: [
              checkStale && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { role: "status", style: MUTED, children: t(draftSession ? "ai.draft.checkStale" : "ai.checkStale") }),
              checkReport.findings.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { role: "status", children: t("ai.checkClear") }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("ul", { style: CHECK_FINDINGS, children: checkReport.findings.map((finding, index) => {
                const { quote, issue, suggestion } = finding;
                const canUse = draftSession && draftSuggestionFeedback(draftSession, finding) !== void 0;
                return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("li", { style: index === 0 ? CHECK_FINDING : CHECK_NEXT_FINDING, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("strong", { style: CHECK_ISSUE, children: issue }),
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("blockquote", { style: CHECK_QUOTE, children: quote }),
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("p", { style: CHECK_SUGGESTION, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("strong", { children: t("ai.checkSuggestion") }),
                    " ",
                    suggestion
                  ] }),
                  canUse && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", style: PANEL_BUTTON, onClick: () => {
                    updateDraft({ type: "useSuggestion", finding });
                    backToDraft();
                  }, children: t("ai.draft.useSuggestion") })
                ] }, index);
              }) })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("footer", { style: RESULT_ACTIONS, children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", style: PANEL_BUTTON, onClick: draftSession ? backToDraft : () => setStatus("choose"), children: t(draftSession ? "ai.draft.backToResult" : "ai.backToActions") }),
              checkStale && !!checkInput.trim() && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", style: PRIMARY2, onClick: () => run("check"), children: t("ai.checkAgain") })
            ] })
          ] }),
          status === "done" && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: HEADER, children: t("ai.result") }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { style: PILLS, children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                "button",
                {
                  type: "button",
                  style: pill(!showOriginal),
                  "aria-pressed": !showOriginal,
                  onClick: () => setResultView("final"),
                  children: t("ai.polished")
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                "button",
                {
                  type: "button",
                  style: pill(showOriginal),
                  "aria-pressed": showOriginal,
                  onClick: () => setResultView("original"),
                  children: t("ai.original")
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "textarea",
              {
                value: showOriginal ? original : polished,
                readOnly: showOriginal,
                rows: 7,
                "aria-label": t(showOriginal ? "ai.original" : "ai.polished"),
                onChange: (ev) => setPolished(ev.target.value),
                style: { ...TEXTAREA, opacity: showOriginal ? 0.75 : 1 }
              }
            ),
            keepVars && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: MUTED, children: t("ai.mayAddVars") }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { style: ACTIONS2, children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", style: PANEL_BUTTON, onClick: () => copy(polished), children: copyFailed ? t("ai.copyFail") : copied ? t("ai.copied") : t("ai.copy") }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", style: PRIMARY2, disabled: !resultBody.trim(), onClick: () => tryResult(), children: t(needsFill ? "ai.tryTemplate" : "ai.apply") })
            ] })
          ] }),
          !replacement && showRefined && refined !== null && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: PILLS, children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", style: pill(resultView === "final"), "aria-pressed": resultView === "final", onClick: () => setResultView("final"), children: t("ai.finalTemplate") }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", style: pill(resultView === "edit"), "aria-pressed": resultView === "edit", onClick: () => setResultView("edit"), children: t("ai.editTemplate") }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", style: pill(showOriginal), "aria-pressed": showOriginal, onClick: () => setResultView("original"), children: t("ai.original") })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: RESULT_CONTENT, children: [
              draftChanged && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { role: "alert", style: MUTED, children: t("ai.draftChanged") }),
              missing.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { role: "alert", style: PILLS, children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { style: MUTED, children: [
                  t("ai.missingVariables"),
                  " ",
                  missing.join(", ")
                ] }),
                resultView !== "edit" && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", style: PANEL_BUTTON, onClick: () => setResultView("edit"), children: t("ai.editTemplate") })
              ] }),
              status === "saveFailed" && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { role: "alert", style: ERROR, children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: t("ai.saveFail") }),
                saveError !== null && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: ERROR_DETAIL, children: saveError })
              ] }),
              resultView === "final" ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("pre", { role: "region", "aria-label": t("ai.finalTemplate"), tabIndex: 0, style: FINAL_PREVIEW, children: refinedBodySections(refined.body, refined.suggestions ?? [], selectedSuggestions).map(({ text, addition }, index) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: addition ? ADDED_SUGGESTION : void 0, children: markAddedVariables(text, original).map(({ text: fragment, name, added }, position) => added && name !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                "button",
                {
                  type: "button",
                  style: ADDED_VARIABLE,
                  onClick: () => tryResult(name),
                  children: fragment
                },
                position
              ) : fragment) }, index)) }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                "textarea",
                {
                  autoFocus: resultView === "edit",
                  value: showOriginal ? original : refined.body,
                  readOnly: showOriginal,
                  "aria-label": t(showOriginal ? "ai.original" : "ai.editTemplate"),
                  onChange: (ev) => setRefined({ ...refined, body: ev.target.value }),
                  style: TEMPLATE_EDITOR
                },
                resultView
              ),
              !showOriginal && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: RESULT_OPTIONS, children: [
                refined.suggestions?.length ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("details", { style: RESULT_DETAILS, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("summary", { style: RESULT_SUMMARY, children: [
                    t("ai.suggestions"),
                    " ",
                    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { style: MUTED, children: [
                      selectedSuggestions.length,
                      "/",
                      refined.suggestions.length
                    ] })
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("fieldset", { style: SUGGESTIONS, "aria-label": t("ai.suggestions"), children: refined.suggestions.map((suggestion, index) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { style: SUGGESTION, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                      "input",
                      {
                        type: "checkbox",
                        checked: selectedSuggestions.includes(index),
                        onChange: (event) => {
                          const checked = event.currentTarget.checked;
                          setSelectedSuggestions((previous) => checked ? [...previous, index] : previous.filter((selected) => selected !== index));
                        }
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: suggestion })
                  ] }, suggestion)) })
                ] }) : null,
                /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("details", { style: RESULT_DETAILS, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("summary", { style: RESULT_SUMMARY, children: t("ai.entryDetails") }),
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("dl", { style: META, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("dt", { style: META_KEY, children: t("ai.fieldTitle") }),
                    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("dd", { style: META_VALUE, children: refined.title }),
                    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("dt", { style: META_KEY, children: t("ai.fieldTags") }),
                    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("dd", { style: META_VALUE, children: refined.tags.join(" / ") }),
                    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("dt", { style: META_KEY, children: t("ai.fieldSummary") }),
                    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("dd", { style: META_VALUE, children: refined.summary })
                  ] }),
                  variableNames.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: RESULT_DETAILS, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("strong", { style: HEADER, children: t("vars.settings") }),
                    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                      TemplateVariableFields,
                      {
                        names: variableNames,
                        variables,
                        t,
                        onChange: (name, field, value) => setVariables((previous) => updateTemplateVariable(previous, name, field, value))
                      }
                    )
                  ] })
                ] })
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("footer", { style: RESULT_ACTIONS, children: [
              draftSession && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", style: PANEL_BUTTON, onClick: backToDraft, children: t("ai.draft.backToResult") }),
              resultView === "final" ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", style: PANEL_BUTTON, disabled: !refinedBody.trim(), onClick: save, children: t("ai.save") }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", style: PANEL_BUTTON, disabled: !refinedBody.trim(), onClick: () => copy(refinedBody), children: copyFailed ? t("ai.copyFail") : copied ? t("ai.copied") : t("ai.copy") }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", style: PRIMARY2, disabled: !refinedBody.trim(), onClick: () => tryResult(), children: t(needsFill ? "ai.tryTemplate" : "ai.apply") })
              ] }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", style: PRIMARY2, onClick: () => setResultView("final"), children: t("ai.viewFinalTemplate") })
            ] })
          ] }),
          status === "writeBackFailed" && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { role: "alert", style: ERROR, children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: t("ai.writeBackFail") }),
              saveError !== null && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: ERROR_DETAIL, title: saveError, children: saveError })
            ] }),
            evictedNotice,
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { style: ACTIONS2, children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", style: PANEL_BUTTON, onClick: retryWriteBack, children: t("ai.retryWriteBack") }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", style: PANEL_BUTTON, onClick: close, children: t("ai.close") })
            ] })
          ] }),
          status === "saved" && saved !== null && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { role: "status", "aria-live": "polite", style: MUTED, children: t("ai.saved") }),
            evictedNotice,
            canToggle(saved) ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: MUTED, children: t("ai.toggleMoved") }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: MUTED, children: t("ai.sameAsOriginal") }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: PREVIEW2, children: previewText(saved.body) }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { style: ACTIONS2, children: [
              draftSession && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", style: PANEL_BUTTON, onClick: backToDraft, children: t("ai.draft.backToResult") }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", style: PANEL_BUTTON, onClick: close, children: t("ai.close") })
            ] })
          ] })
        ]
      }
    ) })
  ] });
}
var WRAP = {
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  gap: 6
};
var ICON = { display: "block", flex: "0 0 auto" };
var BUTTON2 = {
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
  cursor: "pointer"
};
var ANCHOR = {
  position: "absolute",
  bottom: "calc(100% + 6px)",
  left: 0,
  zIndex: 31,
  maxWidth: "calc(100vw - 24px)"
};
var PANEL = {
  ...overlayBase,
  display: "flex",
  flexDirection: "column",
  gap: 6,
  width: "min(390px, calc(100vw - 120px))",
  boxSizing: "border-box",
  maxHeight: "min(460px, calc(100dvh - 130px))",
  overflowY: "auto",
  padding: 12,
  fontSize: 12
};
var HEADER = { color: TOKEN.muted, fontSize: 11, fontWeight: 600 };
var MUTED = { color: TOKEN.muted, fontSize: 11, overflowWrap: "anywhere" };
var WAIT_STATUS = { display: "flex", flexWrap: "wrap", gap: "2px 8px", flexShrink: 0 };
var WAIT_ELAPSED = { ...MUTED, fontVariantNumeric: "tabular-nums" };
var ERROR = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  color: TOKEN.fg,
  fontSize: 11
};
var ERROR_DETAIL = { color: TOKEN.muted, overflowWrap: "anywhere" };
var META = {
  display: "grid",
  gridTemplateColumns: "auto minmax(0, 1fr)",
  margin: "4px 0 0",
  columnGap: 10,
  rowGap: 4,
  alignItems: "baseline"
};
var META_KEY = { color: TOKEN.muted, fontSize: 11, whiteSpace: "nowrap" };
var META_VALUE = { margin: 0, color: TOKEN.fg, overflowWrap: "anywhere" };
var PREVIEW2 = {
  color: TOKEN.muted,
  fontSize: 11,
  overflowWrap: "anywhere",
  whiteSpace: "pre-wrap",
  maxHeight: 72,
  overflowY: "auto",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  padding: "4px 6px"
};
var PILLS = { display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" };
var pill = (active) => ({
  padding: "1px 10px",
  fontSize: 11,
  lineHeight: "16px",
  color: active ? TOKEN.accent : TOKEN.muted,
  background: "transparent",
  border: `1px solid ${active ? TOKEN.accent : TOKEN.border}`,
  borderRadius: 999,
  cursor: "pointer"
});
var TEXTAREA = {
  width: "100%",
  boxSizing: "border-box",
  resize: "vertical",
  padding: "6px 8px",
  color: TOKEN.fg,
  background: "transparent",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  fontSize: 12,
  fontFamily: "inherit"
};
var ACTIONS2 = { display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" };
var PANEL_BUTTON = {
  padding: "2px 8px",
  fontSize: 11,
  lineHeight: "16px",
  color: TOKEN.fg,
  background: "transparent",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  cursor: "pointer"
};
var PRIMARY2 = { ...PANEL_BUTTON, color: TOKEN.accent, borderColor: TOKEN.accent };
var MENU_PANEL = { ...PANEL, width: "min(260px, calc(100vw - 120px))", gap: 10 };
var MENU_ACTIONS = { display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 4, flexShrink: 0 };
var MENU_BUTTON = {
  ...PANEL_BUTTON,
  textAlign: "start",
  padding: "6px 9px",
  fontSize: 12,
  borderColor: "transparent",
  overflowWrap: "anywhere"
};
var PRIMARY_MODE = { ...MENU_BUTTON, color: TOKEN.accent, background: TOKEN.hover, fontWeight: 600 };
var DISABLED_MODE = { ...MENU_BUTTON, opacity: 0.5, cursor: "default" };
var PANEL_HEADER = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 };
var CHECK_FINDINGS = { flexShrink: 0, listStyle: "none", padding: 0, margin: 0 };
var CHECK_FINDING = { display: "grid", gap: 6, paddingBlock: 10 };
var CHECK_NEXT_FINDING = { ...CHECK_FINDING, borderTop: `1px solid ${TOKEN.border}` };
var CHECK_ISSUE = { fontWeight: 600 };
var CHECK_QUOTE = {
  margin: 0,
  padding: "4px 8px",
  color: TOKEN.muted,
  background: TOKEN.hover,
  borderInlineStart: `2px solid ${TOKEN.border}`,
  whiteSpace: "pre-wrap"
};
var CHECK_SUGGESTION = { margin: 0, whiteSpace: "pre-wrap" };
var SUGGESTIONS = { display: "grid", gap: 8, margin: 0, minWidth: 0, border: 0, padding: "4px 0 2px" };
var SUGGESTION = { display: "flex", alignItems: "flex-start", gap: 6, overflowWrap: "anywhere", lineHeight: 1.55 };
var TEMPLATE_PANEL = {
  ...PANEL,
  width: "min(520px, calc(100vw - 120px))",
  height: "min(510px, calc(100dvh - 130px))",
  maxHeight: void 0,
  overflow: "hidden",
  gap: 8
};
var RESULT_CONTENT = {
  flex: "1 1 auto",
  minHeight: 0,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: 2
};
var CHECK_PANEL = {
  ...PANEL,
  width: TEMPLATE_PANEL.width,
  maxHeight: TEMPLATE_PANEL.height,
  overflow: "hidden",
  gap: 8
};
var CHECK_CONTENT = {
  ...RESULT_CONTENT,
  overscrollBehavior: "contain",
  paddingInlineEnd: 8,
  outlineOffset: -2,
  lineHeight: 1.65,
  overflowWrap: "anywhere"
};
var TEMPLATE_EDITOR = {
  ...TEXTAREA,
  flex: "1 1 0",
  minHeight: "clamp(100px, 29dvh, 220px)",
  padding: "10px 11px",
  fontSize: 13,
  lineHeight: 1.6
};
var RESULT_OPTIONS = {
  flex: "0 0 auto",
  maxHeight: "min(128px, 20dvh)",
  overflowY: "auto"
};
var RESULT_DETAILS = { flex: "0 0 auto", borderTop: `1px solid ${TOKEN.border}` };
var RESULT_SUMMARY = { cursor: "pointer", padding: "6px 0", fontWeight: 600 };
var RESULT_ACTIONS = {
  ...ACTIONS2,
  flex: "0 0 auto",
  paddingTop: 8,
  borderTop: `1px solid ${TOKEN.border}`
};
var FINAL_PREVIEW = {
  ...TEMPLATE_EDITOR,
  margin: 0,
  resize: "none",
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  overflowY: "auto"
};
var ADDED_VARIABLE = {
  background: TOKEN.hover,
  color: TOKEN.accent,
  border: 0,
  padding: 0,
  font: "inherit",
  cursor: "pointer",
  textDecoration: "underline"
};
var ADDED_SUGGESTION = { color: TONE.success, fontStyle: "italic" };

// src/client/components/ContextRecommendations.tsx
var React4 = __toESM(require("react"), 1);

// src/client/utils/context-recommend.ts
var RECOMMEND_LIMIT = 5;
var CONTEXT_USER_COUNT = 3;
var FRESH_MS = 30 * 24 * 60 * 60 * 1e3;
var STOP_BIGRAMS = /* @__PURE__ */ new Set([
  "\u6211\u4EEC",
  "\u4F60\u4EEC",
  "\u4ED6\u4EEC",
  "\u5979\u4EEC",
  "\u5B83\u4EEC",
  "\u53EF\u4EE5",
  "\u4EC0\u4E48",
  "\u600E\u4E48",
  "\u4E3A\u4EC0\u4E48",
  "\u8FD9\u4E2A",
  "\u90A3\u4E2A",
  "\u4E00\u4E2A",
  "\u4E0D\u662F",
  "\u6CA1\u6709",
  "\u5C31\u662F",
  "\u4F46\u662F",
  "\u56E0\u4E3A",
  "\u6240\u4EE5",
  "\u5982\u679C",
  "\u7136\u540E",
  "\u8FD9\u6837",
  "\u90A3\u6837",
  "\u5DF2\u7ECF",
  "\u8FD8\u662F",
  "\u81EA\u5DF1",
  "\u73B0\u5728",
  "\u65F6\u5019",
  "\u95EE\u9898",
  "\u77E5\u9053",
  "\u611F\u89C9",
  "\u89C9\u5F97",
  "\u4E1C\u897F",
  "\u4E8B\u60C5",
  "\u4E00\u4E0B",
  "\u771F\u7684",
  "\u53EF\u80FD",
  "\u5E94\u8BE5",
  "\u9700\u8981",
  "\u5E0C\u671B",
  "\u8BF7\u95EE",
  "\u8C22\u8C22",
  "\u5173\u4E8E",
  "\u5BF9\u4E8E",
  "\u5E2E\u6211",
  "\u6211\u60F3",
  "\u6211\u8981",
  "\u9EBB\u70E6",
  "\u4F60\u597D",
  "\u60A8\u597D",
  "\u5982\u4F55",
  "\u600E\u6837",
  "\u7ED9\u6211"
]);
function extractKeywords(text) {
  const freq = /* @__PURE__ */ new Map();
  const add = (raw) => {
    const k = raw.toLowerCase();
    if (!k || k.length < 2 || STOP_BIGRAMS.has(k)) return;
    freq.set(k, (freq.get(k) ?? 0) + 1);
  };
  for (const m of text.matchAll(/[a-zA-Z][a-zA-Z0-9_-]{1,}/g)) add(m[0]);
  const cjk = text.match(/[\u4e00-\u9fa5]{2,}/g) ?? [];
  for (const seg of cjk) for (let i = 0; i < seg.length - 1; i++) add(seg.slice(i, i + 2));
  return freq;
}
function termWeight(k) {
  if (/[\u4e00-\u9fa5]/.test(k)) return 1;
  return 1 + Math.min(2, Math.log2(k.length) / 2);
}
var USAGE_BOOST_CAP = 0.15;
function relevanceOf(p, kw) {
  const head = (p.title + " " + (p.tags?.join(" ") ?? "")).toLowerCase();
  const body = p.body.toLowerCase();
  let relevance = 0;
  for (const [k, f] of kw) {
    const w = termWeight(k);
    if (head.includes(k)) relevance += f * 2 * w;
    else if (body.includes(k)) relevance += f * w;
  }
  return relevance;
}
function scorePrompt(p, kw, now) {
  const relevance = relevanceOf(p, kw);
  if (relevance <= 0) return 0;
  const freq = p.usageCount > 0 ? Math.log(1 + p.usageCount) / Math.log(11) : 0;
  const fresh = p.lastUsedAt > 0 && now - p.lastUsedAt < FRESH_MS ? 1 : 0;
  const usage = Math.min(1, freq * 0.6 + fresh * 0.4);
  return relevance * (1 + usage * USAGE_BOOST_CAP);
}
function recentUserText(messages, count = CONTEXT_USER_COUNT) {
  if (count <= 0) return "";
  return messages.slice(-count).join("\n").trim();
}
function recommend(input) {
  if (!input.draft.trim()) return [];
  const draftKw = extractKeywords(input.draft);
  if (draftKw.size === 0) return [];
  const kw = new Map(draftKw);
  if (input.contextText) {
    for (const [k, f] of extractKeywords(input.contextText)) {
      kw.set(k, (kw.get(k) ?? 0) + f);
    }
  }
  return input.prompts.filter((x) => relevanceOf(x, draftKw) > 0).map((x) => ({ x, score: scorePrompt(x, kw, input.now) })).sort((a, b) => b.score - a.score).slice(0, RECOMMEND_LIMIT).map((hit) => hit.x);
}

// src/client/utils/conversation-targets.ts
var uiConversationRef = null;
function setUiConversation(svc) {
  uiConversationRef = svc;
}
function readTargetSnapshot(svc, sessionId, target) {
  if (svc === null || !sessionId) return void 0;
  try {
    const face = svc.binding(sessionId).target(target);
    return face.getSnapshot() ?? void 0;
  } catch {
    return void 0;
  }
}
function useConversationTargetSnapshot(sessionId, target) {
  const { useState: useState17, useEffect: useEffect15 } = hooks();
  const svc = uiConversationRef;
  const [value, setValue] = useState17(() => readTargetSnapshot(svc, sessionId, target));
  useEffect15(() => {
    if (svc === null || !sessionId) return;
    let unsubscribe = () => {
    };
    try {
      const face = svc.binding(sessionId).target(target);
      unsubscribe = face.subscribe(() => setValue(readTargetSnapshot(svc, sessionId, target)));
      setValue(readTargetSnapshot(svc, sessionId, target));
    } catch {
      unsubscribe = () => {
      };
    }
    return unsubscribe;
  }, [svc, sessionId, target]);
  return value;
}

// src/search-match.ts
function normalizeQuery(raw) {
  return raw?.trim().toLowerCase() ?? "";
}
function matchRank(prompt, query) {
  if (query === "") return 0;
  if (prompt.title.toLowerCase().includes(query)) return 3;
  if (prompt.tags.some((t) => t.toLowerCase().includes(query))) return 2;
  if (prompt.body.toLowerCase().includes(query)) return 1;
  return 0;
}

// src/client/utils/hash-token.ts
function readHashToken(draft, editableFrom = 0) {
  const m = draft.match(/(^|\s)#([^\s#]*)$/);
  if (!m) return null;
  const start = m.index + m[1].length;
  return start < editableFrom ? null : { query: m[2] ?? "", start };
}
function shouldShowSuggest(input) {
  return input.open && input.tokenKey !== null && input.dismissedKey !== input.tokenKey;
}
function nextDismissedKey(open, dismissedKey) {
  return open ? dismissedKey : null;
}
function hashTailEdit(draft, body, editableFrom) {
  const token = readHashToken(draft, editableFrom);
  if (!token) return null;
  const start = Math.max(editableFrom, draft.slice(0, token.start).trimEnd().length);
  const head = draft.slice(0, start);
  return { start, text: head && !/\s$/.test(head) ? ` ${body}` : body };
}
function filterPrompts(prompts, query, limit = 5) {
  const q = normalizeQuery(query);
  if (!q) return prompts.slice(0, limit);
  const scored = [];
  for (const p of prompts) {
    const score = matchRank(p, q);
    if (score > 0) scored.push({ p, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.p);
}

// src/client/utils/insert.ts
function needsInsertionConfirmation(mode, before, current2) {
  return mode !== "insert" && (before.draft !== current2.draft || before.draftRev !== current2.draftRev);
}
function commandTextLength(input) {
  return input.claim?.token.trimEnd().length ?? 0;
}
function editableTailStart(input) {
  const last = input.occurrences?.at(-1);
  return last ? last.offset + last.length : commandTextLength(input);
}
function insertPromptDraft(actions2, input, body, mode) {
  const { draft, draftRev } = input;
  const captured = actions2.captureInsertion?.();
  if (captured && draftRev !== void 0 && captured.draftRev !== draftRev) return false;
  if (mode === "overwrite") {
    actions2.setDraft(body);
    return true;
  }
  const edit = mode === "replace-hash" ? hashTailEdit(draft, body, editableTailStart(input)) : { start: draft.length, text: draft ? `
${body}` : body };
  if (!edit) return false;
  if (!captured || typeof actions2.insertText !== "function") {
    if (input.claim || input.occurrences?.length) return false;
    actions2.setDraft(draft.slice(0, edit.start) + edit.text);
    return true;
  }
  if (draftRev === void 0) return false;
  const commandLength = commandTextLength(input);
  const expansion = (commandLength ? commandLength - 1 : 0) + (input.occurrences ?? []).reduce((total, ref) => total + ref.length - 1, 0);
  return actions2.insertText(edit.text, {
    start: edit.start - expansion,
    end: draft.length - expansion,
    draftRev
  });
}
function promptSummary(p, max = 60) {
  const source = p.summary?.trim() || p.body.replace(/\s+/g, " ").trim();
  return source.length > max ? `${source.slice(0, max)}\u2026` : source;
}
function recentPrompts(prompts, limit = 5) {
  return prompts.filter((prompt) => prompt.lastUsedAt > 0).sort((a, b) => b.lastUsedAt - a.lastUsedAt).slice(0, limit);
}

// src/client/components/ContextRecommendations.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
function textOf(content) {
  let out = "";
  for (const block of content) {
    if (block.type === "text" && typeof block.text === "string") out += block.text + "\n";
  }
  return out.trim();
}
function userMessageTexts(snapshot2) {
  const nodes = snapshot2?.legacy?.nodes;
  if (nodes === void 0) return [];
  return nodes.filter((node) => node.kind === "user").map((node) => textOf(node.content ?? []));
}
function ContextRecommendations({
  session,
  useInput,
  inputActions,
  t
}) {
  const settings = useSettings();
  const input = useInput((s) => s);
  const { draft } = input;
  const chat = useConversationTargetSnapshot(session.sessionId, "chat");
  const [prompts, setPrompts] = React4.useState(null);
  const [pending, setPending] = React4.useState(null);
  const [applyFailed, setApplyFailed] = React4.useState(false);
  const load = () => {
    api.listPrompts().then(
      (list) => setPrompts(list),
      (err) => {
        console.warn("[prompt-enhancer] \u63A8\u8350\u6761\u52A0\u8F7D\u63D0\u793A\u8BCD\u5931\u8D25", err);
        setPrompts([]);
      }
    );
  };
  React4.useEffect(() => {
    load();
  }, []);
  useDataChanged(load, []);
  const hits = settings.contextRecommendEnabled ? recommend({ draft, contextText: recentUserText(userMessageTexts(chat)), prompts: prompts ?? [], now: Date.now() }) : [];
  const apply2 = (prompt, body) => {
    if (!insertPromptDraft(inputActions, input, body, "insert")) {
      setApplyFailed(true);
      return;
    }
    setApplyFailed(false);
    setPending(null);
    void api.recordUsage(prompt.id).catch((err) => {
      console.warn("[prompt-enhancer] " + t("error.use"), err);
    });
  };
  const choose = (prompt) => {
    setApplyFailed(false);
    if (needsValues(prompt.body)) setPending(prompt);
    else apply2(prompt, prompt.body);
  };
  if (pending !== null) {
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: ROW_ANCHOR, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: DIALOG_ANCHOR, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      TemplateVariablesDialog,
      {
        body: pending.body,
        variables: pending.variables,
        promptId: pending.id,
        t,
        applyNotice: applyFailed ? t("error.insert") : void 0,
        onCancel: () => {
          setApplyFailed(false);
          setPending(null);
        },
        onFilled: (filled) => apply2(pending, filled)
      }
    ) }) });
  }
  if (hits.length === 0) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
    "div",
    {
      role: "group",
      "aria-label": t("recommend.title"),
      style: BAR,
      "data-prompt-enhancer-recommend": hits.length,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: LABEL3, children: t("recommend.title") }),
        applyFailed && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { role: "alert", style: LABEL3, children: t("error.insert") }),
        hits.map((hit) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "button",
          {
            type: "button",
            style: CHIP,
            title: hit.body,
            "aria-label": hit.title,
            onClick: () => choose(hit),
            children: clampTitle(hit.title)
          },
          hit.id
        ))
      ]
    }
  );
}
var CARD_ROW = {
  boxSizing: "border-box",
  width: "100%",
  maxWidth: "var(--dsh-composer-card-max-width, 780px)",
  margin: "0 auto"
};
var BAR = {
  ...CARD_ROW,
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 6,
  padding: "0 2px 6px",
  fontSize: 12,
  color: TOKEN.muted
};
var ROW_ANCHOR = { ...CARD_ROW, position: "relative" };
var DIALOG_ANCHOR = {
  position: "absolute",
  bottom: "calc(100% + 6px)",
  left: 0,
  zIndex: 30,
  maxWidth: "calc(100vw - 24px)"
};
var LABEL3 = { flexShrink: 0, color: TOKEN.muted, fontSize: 11, fontWeight: 600 };
var CHIP = {
  maxWidth: 220,
  height: 24,
  padding: "0 10px",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 12,
  background: "transparent",
  color: TOKEN.fg,
  font: "inherit",
  fontSize: 12,
  cursor: "pointer",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis"
};

// src/client/components/HashSuggestOverlay.tsx
var React5 = __toESM(require("react"), 1);
var import_jsx_runtime6 = require("react/jsx-runtime");
var HASH_LIST_LIMIT = 5;
function HashSuggestOverlay({
  t,
  useInput,
  inputActions
}) {
  const input = useInput((s) => s);
  const { draft } = input;
  const settings = useSettings();
  const token = readHashToken(draft, editableTailStart(input));
  const open = token !== null;
  const tokenKey = token === null ? null : `${token.start}:${token.query}`;
  const [dismissedKey, setDismissedKey] = React5.useState(null);
  const visible = settings.hashTriggerEnabled && shouldShowSuggest({ open, tokenKey, dismissedKey });
  const claimed = useOverlayClaim();
  const onScreen = visible && canRender("hash", claimed);
  const rootRef = React5.useRef(null);
  const [prompts, setPrompts] = React5.useState(null);
  const [loadError, setLoadError] = React5.useState(null);
  const [pending, setPending] = React5.useState(null);
  const [applyFailed, setApplyFailed] = React5.useState(false);
  React5.useEffect(() => {
    if (!open) {
      setPending(null);
      setApplyFailed(false);
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
      (err) => {
        if (!alive) return;
        console.warn("[prompt-enhancer] \u63D0\u793A\u8BCD\u5217\u8868\u52A0\u8F7D\u5931\u8D25", err);
        setPrompts([]);
        setLoadError(reasonOf(err));
      }
    );
    return () => {
      alive = false;
    };
  }, [open]);
  useDismissOnOutside(rootRef, visible, () => {
    if (tokenKey !== null) setDismissedKey(tokenKey);
    setPending(null);
  });
  const apply2 = (prompt, body) => {
    if (!insertPromptDraft(inputActions, input, body, "replace-hash")) {
      setApplyFailed(true);
      return;
    }
    setApplyFailed(false);
    setPending(null);
    void api.recordUsage(prompt.id).catch((err) => {
      console.warn("[prompt-enhancer] " + t("error.use"), err);
    });
  };
  React5.useEffect(() => {
    setHashSuggestVisible(visible);
    return () => {
      setHashSuggestVisible(false);
    };
  }, [visible]);
  React5.useEffect(() => {
    if (canTakeHash(visible)) claimOverlay("hash");
    return () => {
      releaseOverlay("hash");
    };
  }, [visible]);
  React5.useEffect(() => {
    if (canRetakeHash(visible, getOverlayClaimSnapshot())) claimOverlay("hash");
  }, [visible, claimed]);
  if (token === null || tokenKey === null || !onScreen) return null;
  if (pending !== null) {
    return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { ref: rootRef, style: ANCHOR2, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
      TemplateVariablesDialog,
      {
        body: pending.prompt.body,
        variables: pending.prompt.variables,
        promptId: pending.prompt.id,
        applyNotice: applyFailed ? t("error.insert") : void 0,
        t,
        onCancel: () => {
          setApplyFailed(false);
          setPending(null);
        },
        onFilled: (filled) => {
          if (pending.tokenKey !== tokenKey) {
            setPending(null);
            setApplyFailed(true);
            return;
          }
          apply2(pending.prompt, filled);
        }
      }
    ) });
  }
  const matched = filterPrompts(prompts ?? [], token.query, Number.MAX_SAFE_INTEGER);
  const shown = matched.slice(0, HASH_LIST_LIMIT);
  const hiddenCount = matched.length - shown.length;
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { ref: rootRef, style: ANCHOR2, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { role: "group", "aria-label": t("hash.title"), style: PANEL2, children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: HEADER2, children: t("hash.title") }),
    applyFailed && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { role: "alert", style: ERROR2, children: t("error.insert") }),
    loadError !== null && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { role: "alert", style: ERROR2, title: loadError, children: t("error.load") }),
    loadError === null && prompts === null && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: MUTED2, children: t("list.loading") }),
    loadError === null && prompts !== null && matched.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: MUTED2, children: t("hash.empty") }),
    loadError === null && shown.map((prompt) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
      "button",
      {
        type: "button",
        style: ROW,
        title: prompt.title,
        "aria-label": prompt.title,
        onClick: () => {
          setApplyFailed(false);
          if (needsValues(prompt.body)) setPending({ prompt, tokenKey });
          else apply2(prompt, prompt.body);
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: ROW_TITLE, children: prompt.title }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: ROW_SUMMARY, children: promptSummary(prompt) }),
          prompt.tags.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: TAGS, children: prompt.tags.map((tag) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: TAG, children: tag }, tag)) })
        ]
      },
      prompt.id
    )),
    loadError === null && hiddenCount > 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: MUTED2, children: [
      hiddenCount,
      t("list.overflow")
    ] })
  ] }) });
}
var ANCHOR2 = {
  position: "absolute",
  bottom: 8,
  left: 8,
  zIndex: 30,
  maxWidth: "calc(100vw - 24px)"
};
var PANEL2 = {
  ...overlayBase,
  display: "flex",
  flexDirection: "column",
  gap: 4,
  width: 300,
  maxHeight: 320,
  overflowY: "auto",
  padding: 6,
  fontSize: 12
};
var HEADER2 = { color: TOKEN.muted, fontSize: 11, fontWeight: 600 };
var MUTED2 = { color: TOKEN.muted, fontSize: 11 };
var ERROR2 = { color: TOKEN.fg, fontSize: 11 };
var ROW = {
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
  cursor: "pointer"
};
var ROW_TITLE = {
  color: TOKEN.fg,
  fontSize: 12,
  fontWeight: 600,
  maxWidth: "100%",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap"
};
var ROW_SUMMARY = { color: TOKEN.muted, fontSize: 11, overflowWrap: "anywhere" };
var TAGS = { display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 };
var TAG = {
  color: TOKEN.accent,
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 999,
  padding: "0 6px",
  fontSize: 10
};

// src/client/components/PromptLibraryButton.tsx
var React7 = __toESM(require("react"), 1);

// src/client/utils/library-insertion.ts
async function applyVerifiedPrompt({ id, body, mode, before, signal, current: current2 }) {
  try {
    await api.getPrompt(id, signal);
  } catch (error) {
    if (signal.aborted) return { kind: "cancelled" };
    if (error instanceof ApiError && error.status === 404) return { kind: "missing" };
    return { kind: "unverified", error };
  }
  if (signal.aborted) return { kind: "cancelled" };
  const target = current2();
  if (!target) return { kind: "cancelled" };
  const { input, actions: actions2 } = target;
  if (needsInsertionConfirmation(mode, before, input)) {
    return { kind: "reconfirm", before: { draft: input.draft, draftRev: input.draftRev } };
  }
  if (!insertPromptDraft(actions2, input, body, mode)) return { kind: "rejected" };
  if (mode === "insert-send") actions2.submit();
  return { kind: "applied", usage: api.recordUsage(id) };
}

// src/client/components/SelectionAddPrompt.tsx
var React6 = __toESM(require("react"), 1);

// src/client/utils/selection.ts
function normalizeSelection(text) {
  return text.replace(/\r\n?/g, "\n").trim();
}
function selectionKey(text, anchorOffset, focusOffset) {
  return text + "\0" + anchorOffset + ":" + focusOffset;
}
function decideSelection(facts) {
  if (!facts.enabled) return { show: false, text: "", reason: "disabled" };
  if (facts.collapsed) return { show: false, text: "", reason: "collapsed" };
  const text = normalizeSelection(facts.text);
  if (text === "") return { show: false, text: "", reason: "empty" };
  if (facts.inComposerSeat) return { show: false, text: "", reason: "composer" };
  if (facts.inOurRoot) return { show: false, text: "", reason: "own-root" };
  if (!facts.inConversation) return { show: false, text: "", reason: "outside-conversation" };
  return { show: true, text, reason: "ok" };
}

// src/client/components/SelectionAddPrompt.tsx
var import_jsx_runtime7 = require("react/jsx-runtime");
var ABOVE_MIN_TOP = 44;
function elementOf(node) {
  if (node === null) return null;
  return node.nodeType === 1 ? node : node.parentElement;
}
function SelectionAddPrompt({
  enabled,
  rootRef,
  label: label2,
  onSave
}) {
  const [anchor, setAnchor] = React6.useState(null);
  const liveRef = React6.useRef(null);
  const dismissedRef = React6.useRef(null);
  const pressingRef = React6.useRef(false);
  const draggingRef = React6.useRef(false);
  const buttonRef = React6.useRef(null);
  React6.useEffect(() => {
    liveRef.current = null;
    dismissedRef.current = null;
    pressingRef.current = false;
    draggingRef.current = false;
    setAnchor(null);
    if (!enabled) return;
    const evaluate = () => {
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
        enabled: true
      });
      if (!decision.show || sel === null) {
        liveRef.current = null;
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
      if (rect === null || rect.width === 0 && rect.height === 0) {
        liveRef.current = null;
        setAnchor(null);
        return;
      }
      const above = rect.top >= ABOVE_MIN_TOP;
      liveRef.current = { text: decision.text, key };
      setAnchor({
        top: above ? rect.top - 8 : rect.bottom + 8,
        left: Math.max(8, rect.left),
        above
      });
    };
    const isOnButton = (target) => buttonRef.current !== null && target instanceof Node && buttonRef.current.contains(target);
    const onSelectionChange = () => {
      if (pressingRef.current || draggingRef.current) {
        liveRef.current = null;
        setAnchor(null);
        return;
      }
      evaluate();
    };
    const onPointerDown = (ev) => {
      pressingRef.current = isOnButton(ev.target);
      if (pressingRef.current) return;
      draggingRef.current = true;
      liveRef.current = null;
      setAnchor(null);
      dismissedRef.current = null;
    };
    const onPointerUp = () => {
      const pressedOnButton = pressingRef.current;
      pressingRef.current = false;
      draggingRef.current = false;
      if (pressedOnButton) return;
      evaluate();
    };
    const onScroll = () => {
      if (pressingRef.current || draggingRef.current) return;
      evaluate();
    };
    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [enabled, rootRef]);
  const pick = () => {
    const live = liveRef.current;
    if (live === null) return;
    dismissedRef.current = live.key;
    liveRef.current = null;
    setAnchor(null);
    onSave(live.text);
  };
  if (!enabled || anchor === null) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
    "button",
    {
      ref: buttonRef,
      type: "button",
      style: {
        ...FLOATING,
        top: anchor.top,
        left: anchor.left,
        transform: anchor.above ? "translateY(-100%)" : void 0
      },
      title: label2,
      "aria-label": label2,
      onClick: pick,
      children: label2
    }
  );
}
var FLOATING = {
  ...overlayBase,
  position: "fixed",
  zIndex: 60,
  padding: "2px 10px",
  fontSize: 11,
  lineHeight: "18px",
  color: TOKEN.fg,
  whiteSpace: "nowrap",
  cursor: "pointer"
};

// src/client/utils/async-list.ts
function resolveOptions(options) {
  return {
    label: options.label,
    active: options.active !== false,
    clearOnStart: options.clearOnStart === true,
    clearErrorOnStart: options.clearErrorOnStart === true
  };
}
function failureState(err) {
  return { items: [], error: reasonOf(err) };
}
function useAsyncList(load, options) {
  const { useState: useState17, useEffect: useEffect15 } = hooks();
  const [items, setItems] = useState17(null);
  const [error, setError] = useState17(null);
  const { label: label2, active, clearOnStart, clearErrorOnStart } = resolveOptions(options);
  useEffect15(() => {
    if (!active) return;
    let alive = true;
    if (clearOnStart) setItems(null);
    if (clearErrorOnStart) setError(null);
    load().then(
      (list) => {
        if (!alive) return;
        setItems(list);
        setError(null);
      },
      (err) => {
        if (!alive) return;
        console.warn("[prompt-enhancer] " + label2, err);
        const failed = failureState(err);
        setItems(failed.items);
        setError(failed.error);
      }
    );
    return () => {
      alive = false;
    };
  }, [load, active, clearOnStart, clearErrorOnStart, label2]);
  return { items, error, setItems };
}

// src/client/components/PromptLibraryButton.tsx
var import_jsx_runtime8 = require("react/jsx-runtime");
var ACTION_LABELS = {
  insert: "action.insert",
  overwrite: "action.overwrite",
  "insert-send": "action.send"
};
var SECONDARY_MODES = ["overwrite", "insert-send"];
var NOTICE_MS = 4e3;
var QUICK_LIST_LIMIT = 50;
function PromptLibraryIcon() {
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true", style: ICON2, children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
      "path",
      {
        d: "M4 5h11a3 3 0 0 1 3 3v11l-3-2-3 2V8a3 3 0 0 0-3-3H4Z",
        stroke: "currentColor",
        strokeWidth: "1.6",
        strokeLinejoin: "round"
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("path", { d: "M8 9h3M8 12h3", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round" })
  ] });
}
function PromptLibraryButton({
  t,
  useInput,
  inputActions
}) {
  const input = useInput((s) => s);
  const { draft, draftRev } = input;
  const hashVisible = useHashSuggestVisible();
  const settings = useSettings();
  const [open, setOpen] = React7.useState(false);
  const [notice, setNotice] = React7.useState(null);
  const [pending, setPending] = React7.useState(null);
  const [checking, setChecking] = React7.useState(false);
  const application = React7.useRef(null);
  const latestTarget = React7.useRef({ input, actions: inputActions });
  React7.useLayoutEffect(() => {
    latestTarget.current = { input, actions: inputActions };
  }, [input, inputActions]);
  const [query, setQuery] = React7.useState("");
  const [usageRevision, setUsageRevision] = React7.useState(0);
  const [selectedId, setSelectedId] = React7.useState(null);
  const triggerRef = React7.useRef(null);
  const rows = React7.useRef([]);
  const rootRef = React7.useRef(null);
  const claimed = useOverlayClaim();
  const panelOpen = open && canRender("library", claimed);
  const cancelApplication = React7.useCallback(() => {
    application.current?.abort();
    application.current = null;
  }, []);
  React7.useLayoutEffect(() => {
    setChecking(false);
    return cancelApplication;
  }, [panelOpen, settings.showComposerButton, inputActions, cancelApplication]);
  React7.useLayoutEffect(() => {
    setOpen(false);
    setPending(null);
    setSelectedId(null);
    setNotice(null);
  }, [inputActions]);
  React7.useEffect(() => {
    if (open && settings.showComposerButton) return;
    setQuery("");
    setSelectedId(null);
  }, [open, settings.showComposerButton]);
  const loadPrompts = React7.useCallback(() => api.listPrompts({ sort: "default" }), [usageRevision]);
  const { items: prompts, error: loadError, setItems: setPrompts } = useAsyncList(loadPrompts, {
    label: "\u63D0\u793A\u8BCD\u5217\u8868\u52A0\u8F7D\u5931\u8D25",
    active: open,
    clearOnStart: true,
    clearErrorOnStart: true
  });
  useDismissOnOutside(rootRef, open, () => close());
  React7.useEffect(() => {
    if (notice === null) return;
    const id = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => {
      window.clearTimeout(id);
    };
  }, [notice]);
  const close = () => {
    cancelApplication();
    setOpen(false);
    setPending(null);
  };
  const backFromUse = () => {
    cancelApplication();
    setChecking(false);
    if (pending) setPending(null);
    else setSelectedId(null);
  };
  React7.useEffect(() => {
    if (!open) return;
    if (claimed === "library") return;
    setOpen(false);
  }, [open, claimed]);
  React7.useEffect(() => {
    if (open) return;
    releaseOverlay("library");
  }, [open]);
  React7.useEffect(() => () => releaseOverlay("library"), []);
  const saveSelection = (text) => {
    pushCapture({ body: text });
    openManager("list");
  };
  const saveDraft = () => {
    if (draft.trim() === "") return;
    close();
    pushCapture({ body: draft });
    openManager("list");
  };
  const showNotice = (key) => {
    setNotice((prev) => ({ text: t(key), seq: (prev?.seq ?? 0) + 1 }));
  };
  const apply2 = async (prompt, body, mode, before) => {
    if (application.current || getOverlayClaimSnapshot() !== "library") return;
    const controller = new AbortController();
    application.current = controller;
    setChecking(true);
    setNotice(null);
    try {
      const result = await applyVerifiedPrompt({
        id: prompt.id,
        body,
        mode,
        before,
        signal: controller.signal,
        current: () => latestTarget.current.actions === inputActions && getOverlayClaimSnapshot() === "library" ? latestTarget.current : void 0
      });
      if (result.kind === "applied") {
        void result.usage.then(() => setUsageRevision((revision) => revision + 1)).catch((error) => {
          console.warn("[prompt-enhancer] " + t("error.use"), error);
          if (latestTarget.current.actions === inputActions && !controller.signal.aborted) showNotice("list.usageFailed");
        });
      }
      if (application.current !== controller) return;
      switch (result.kind) {
        case "applied":
          application.current = null;
          setChecking(false);
          close();
          break;
        case "cancelled":
          break;
        case "missing":
          setPrompts((prev) => prev?.filter((item) => item.id !== prompt.id) ?? null);
          setPending(null);
          setSelectedId(null);
          showNotice("list.missingBeforeInsert");
          break;
        case "reconfirm":
          if (pending) setPending({ ...pending, ...result.before, reconfirm: true });
          else showNotice("vars.draftChanged");
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
  const choose = (prompt, mode) => {
    if (application.current) return;
    if (needsValues(prompt.body)) setPending({ prompt, mode, draft, draftRev });
    else void apply2(prompt, prompt.body, mode, input);
  };
  if (!settings.showComposerButton) return null;
  const matched = panelOpen ? filterPrompts(prompts ?? [], query, Number.MAX_SAFE_INTEGER) : [];
  const recent = query.trim() ? [] : recentPrompts(matched);
  const recentIds = new Set(recent.map((prompt) => prompt.id));
  const shown = matched.filter((prompt) => !recentIds.has(prompt.id)).slice(0, QUICK_LIST_LIMIT - recent.length);
  const visible = [...recent, ...shown];
  const selected = visible.find((prompt) => prompt.id === selectedId);
  const variables = selected ? parseVariables(selected.body) : [];
  const hiddenCount = matched.length - visible.length;
  const navigateRows = (event, index) => {
    if (event.nativeEvent.isComposing || !visible.length) return;
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    event.stopPropagation();
    const offset = event.key === "ArrowDown" ? 1 : -1;
    const next = index === -1 && offset < 0 ? visible.length - 1 : index + offset;
    rows.current[Math.max(0, Math.min(next, visible.length - 1))]?.focus();
  };
  const renderRows = (items, offset) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { role: "list", style: LIST, children: items.map((prompt, index) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { role: "listitem", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
    "button",
    {
      ref: (node) => {
        rows.current[offset + index] = node;
      },
      type: "button",
      style: ROW2,
      onKeyDown: (event) => navigateRows(event, offset + index),
      onClick: () => setSelectedId(prompt.id),
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { style: ROW_TITLE2, children: prompt.title }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { style: ROW_SUMMARY2, children: promptSummary(prompt, 72) })
      ]
    }
  ) }, prompt.id)) });
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
    "div",
    {
      ref: rootRef,
      onKeyDown: (event) => {
        if (!panelOpen || event.key !== "Escape" || event.nativeEvent.isComposing) return;
        if (event.target instanceof HTMLInputElement && event.target.type === "search" && query) return;
        event.preventDefault();
        event.stopPropagation();
        if (pending || selected) backFromUse();
        else {
          close();
          triggerRef.current?.focus();
        }
      },
      style: WRAP2,
      "data-prompt-enhancer-claim": claimed,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
          "button",
          {
            ref: triggerRef,
            type: "button",
            style: BUTTON3,
            title: t("button.tip"),
            "aria-label": t("button.tip"),
            "aria-haspopup": "dialog",
            "aria-expanded": panelOpen,
            onClick: (event) => {
              if (event.detail === 0 && hashVisible) return;
              if (panelOpen) close();
              else {
                claimOverlay("library");
                setOpen(true);
              }
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(PromptLibraryIcon, {}),
              showsLabel(settings.composerButtonIconOnly) && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: t("button.title") })
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
          SelectionAddPrompt,
          {
            enabled: settings.selectionAddEnabled,
            rootRef,
            label: t("selection.save"),
            onSave: saveSelection
          }
        ),
        (checking || notice !== null) && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { role: "status", "aria-live": "polite", style: NOTICE, children: checking ? t("list.checking") : notice?.text }),
        panelOpen && pending !== null && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: ANCHOR3, children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
          TemplateVariablesDialog,
          {
            body: pending.prompt.body,
            variables: pending.prompt.variables,
            promptId: pending.prompt.id,
            t,
            confirmLabel: t(ACTION_LABELS[pending.mode]),
            onCancel: backFromUse,
            applying: checking,
            applyNotice: pending.reconfirm ? t("vars.draftChanged") : void 0,
            onFilled: (filled) => {
              if (needsInsertionConfirmation(pending.mode, pending, { draft, draftRev })) {
                setPending({ ...pending, draft, draftRev, reconfirm: true });
                return;
              }
              void apply2(pending.prompt, filled, pending.mode, pending);
            }
          }
        ) }),
        panelOpen && pending === null && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: ANCHOR3, children: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { role: "dialog", "aria-label": t("list.title"), style: PANEL3, children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { style: PANEL_HEADER2, children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { style: HEADER3, children: t("list.title") }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { style: PANEL_ACTIONS, children: [
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
                "button",
                {
                  type: "button",
                  style: {
                    ...ACTION_BUTTON,
                    opacity: draft.trim() === "" ? 0.6 : 1,
                    cursor: draft.trim() === "" ? "default" : "pointer"
                  },
                  title: t("list.saveDraft"),
                  "aria-label": t("list.saveDraft"),
                  disabled: draft.trim() === "",
                  onClick: saveDraft,
                  children: t("list.saveDraft")
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
                "button",
                {
                  type: "button",
                  style: ACTION_BUTTON,
                  title: t("list.manage"),
                  "aria-label": t("list.manage"),
                  "aria-haspopup": "dialog",
                  onClick: () => {
                    close();
                    openManager();
                  },
                  children: t("list.manage")
                }
              )
            ] })
          ] }),
          !selected && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_jsx_runtime8.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
              "input",
              {
                type: "search",
                autoFocus: true,
                "aria-label": t("list.filter"),
                placeholder: t("list.filterPlaceholder"),
                value: query,
                onChange: (ev) => setQuery(ev.target.value),
                onKeyDown: (event) => {
                  navigateRows(event, -1);
                  if (event.key === "Enter" && !event.nativeEvent.isComposing && visible[0] && !loadError) {
                    event.preventDefault();
                    event.stopPropagation();
                    setSelectedId(visible[0].id);
                  }
                },
                style: FILTER
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { style: PANEL_BODY, children: [
              loadError !== null && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { role: "alert", style: ERROR3, children: [
                /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: t("error.load") }),
                /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { style: ERROR_DETAIL2, title: loadError, children: loadError })
              ] }),
              loadError === null && prompts === null && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { style: MUTED3, children: t("list.loading") }),
              loadError === null && prompts !== null && prompts.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { style: MUTED3, children: t("list.empty") }),
              loadError === null && prompts !== null && prompts.length > 0 && matched.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { style: MUTED3, children: t("hash.empty") }),
              loadError === null && recent.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { role: "group", "aria-label": t("list.recent"), children: [
                /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: MUTED3, children: t("list.recent") }),
                renderRows(recent, 0)
              ] }),
              loadError === null && shown.length > 0 && renderRows(shown, recent.length),
              loadError === null && hiddenCount > 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
                "button",
                {
                  type: "button",
                  style: MORE,
                  onClick: () => {
                    close();
                    openManager();
                  },
                  children: [
                    hiddenCount,
                    t("list.overflow")
                  ]
                }
              )
            ] })
          ] }),
          loadError === null && selected && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("section", { style: PREVIEW3, "aria-label": t("list.preview"), children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("header", { style: PANEL_HEADER2, children: [
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("h3", { style: PREVIEW_TITLE, children: selected.title }),
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { type: "button", autoFocus: true, style: ACTION_BUTTON, onClick: backFromUse, children: t("manager.edit.back") })
            ] }),
            selected.summary && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { style: ROW_SUMMARY2, children: selected.summary }),
            (selected.tags?.length || variables.length) > 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: TAGS2, children: [
              (selected.tags ?? []).map((tag) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { style: TAG2, children: tag }, `tag:${tag}`)),
              variables.map((name) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { style: TAG2, children: `{{${name}}}` }, name))
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("pre", { style: PREVIEW_BODY, tabIndex: 0, "aria-label": t("manager.edit.body"), children: selected.body }, selected.id),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { style: PANEL_ACTIONS, children: [
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { type: "button", style: PRIMARY3, disabled: checking, onClick: () => choose(selected, "insert"), children: t(variables.length ? "list.fillInsert" : "action.insert") }),
              /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("details", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("summary", { style: ACTION_BUTTON, children: t("list.moreActions") }),
                /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { style: PANEL_ACTIONS, children: SECONDARY_MODES.map((mode) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { type: "button", style: ACTION_BUTTON, disabled: checking, onClick: () => choose(selected, mode), children: t(ACTION_LABELS[mode]) }, mode)) })
              ] }, selected.id)
            ] })
          ] })
        ] }) })
      ]
    }
  );
}
var WRAP2 = {
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  gap: 6
};
var ICON2 = { display: "block", flex: "0 0 auto" };
var FILTER = {
  width: "100%",
  boxSizing: "border-box",
  padding: "4px 6px",
  color: TOKEN.fg,
  background: "transparent",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  font: "inherit",
  fontSize: 12
};
var MORE = {
  alignSelf: "flex-start",
  padding: "2px 0",
  color: TOKEN.accent,
  background: "transparent",
  border: 0,
  font: "inherit",
  fontSize: 11,
  textAlign: "left",
  cursor: "pointer"
};
var BUTTON3 = {
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
  cursor: "pointer"
};
var NOTICE = { color: TOKEN.muted, fontSize: 11, whiteSpace: "nowrap" };
var ANCHOR3 = {
  position: "absolute",
  bottom: "calc(100% + 6px)",
  left: 0,
  zIndex: 30,
  maxWidth: "calc(100vw - 24px)"
};
var PANEL3 = {
  ...overlayBase,
  display: "flex",
  flexDirection: "column",
  gap: 6,
  width: "min(540px, calc(100vw - 96px))",
  height: "min(490px, calc(100dvh - 132px))",
  boxSizing: "border-box",
  overflow: "hidden",
  padding: 12,
  fontSize: 12
};
var PANEL_BODY = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  flex: "1 1 auto",
  minHeight: 0,
  overflowY: "auto"
};
var PANEL_HEADER2 = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: 6
};
var PANEL_ACTIONS = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  flexWrap: "wrap"
};
var HEADER3 = { color: TOKEN.fg, fontSize: 13, fontWeight: 600 };
var MUTED3 = { color: TOKEN.muted, fontSize: 11 };
var ERROR3 = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  color: TOKEN.fg,
  fontSize: 11
};
var ERROR_DETAIL2 = { color: TOKEN.muted, overflowWrap: "anywhere" };
var LIST = { display: "flex", flexDirection: "column" };
var ROW2 = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  textAlign: "left",
  width: "100%",
  padding: "6px 8px",
  border: 0,
  borderRadius: 6,
  cursor: "pointer",
  font: "inherit",
  background: "transparent"
};
var ROW_TITLE2 = {
  color: TOKEN.fg,
  fontSize: 12,
  fontWeight: 600,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap"
};
var ROW_SUMMARY2 = { color: TOKEN.muted, fontSize: 11, overflowWrap: "anywhere" };
var TAGS2 = { display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 };
var TAG2 = {
  color: TOKEN.accent,
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 999,
  padding: "0 6px",
  fontSize: 10
};
var ACTION_BUTTON = {
  padding: "1px 6px",
  fontSize: 11,
  lineHeight: "16px",
  color: TOKEN.fg,
  background: "transparent",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  cursor: "pointer"
};
var PRIMARY3 = { ...ACTION_BUTTON, color: TOKEN.accent, borderColor: TOKEN.accent };
var PREVIEW3 = {
  display: "flex",
  flexDirection: "column",
  flex: "1 1 auto",
  minHeight: 0,
  gap: 8
};
var PREVIEW_TITLE = {
  fontSize: 15,
  fontWeight: 600,
  margin: 0,
  overflowWrap: "anywhere"
};
var PREVIEW_BODY = {
  flex: "1 1 0",
  minHeight: 0,
  margin: 0,
  padding: 12,
  borderRadius: 6,
  color: TOKEN.fg,
  background: TOKEN.hover,
  font: "inherit",
  fontSize: 13,
  lineHeight: 1.65,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  overflowY: "auto"
};

// src/client/components/PromptSurfaceHost.tsx
var React14 = __toESM(require("react"), 1);

// src/client/components/PromptManagerModal.tsx
var React13 = __toESM(require("react"), 1);

// src/tags.ts
function normalizeTagName(name) {
  return name.trim();
}
function normalizeTags(tags) {
  if (!tags) return [];
  const out = [];
  for (const raw of tags) {
    const name = normalizeTagName(raw);
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}
var TAG_SEPARATORS = /[,，]/;
function parseTagList(text) {
  return normalizeTags(text.split(TAG_SEPARATORS));
}

// src/template-variables.ts
function readTemplateVariables(input) {
  if (!Array.isArray(input)) return void 0;
  const variables = [];
  const names = /* @__PURE__ */ new Set();
  for (const entry of input) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return void 0;
    const { name, description, defaultValue } = entry;
    if (typeof name !== "string" || !name.trim() || names.has(name.trim())) return void 0;
    if (description !== void 0 && typeof description !== "string") return void 0;
    if (defaultValue !== void 0 && typeof defaultValue !== "string") return void 0;
    names.add(name.trim());
    if (description?.trim() || defaultValue?.trim()) {
      variables.push({
        name: name.trim(),
        ...description?.trim() ? { description: description.trim() } : {},
        ...defaultValue?.trim() ? { defaultValue } : {}
      });
    }
  }
  return variables;
}

// src/client/utils/prompt-edit.ts
function promptFormInput(fields, sourceBody = "") {
  const names = /* @__PURE__ */ new Set([...parseVariables(fields.body), ...parseVariables(sourceBody)]);
  return {
    title: clampTitle(fields.title.trim() || firstNonEmptyLine(fields.body)),
    body: fields.body,
    tags: parseTagList(fields.tagsText),
    summary: fields.summary.trim(),
    variables: readTemplateVariables(fields.variables.filter(({ name }) => names.has(name))) ?? []
  };
}
function changedPromptFields(prompt, fields) {
  const input = promptFormInput(fields, prompt.sourceBody);
  const patch = {};
  if (fields.title !== prompt.title && input.title !== prompt.title) patch.title = input.title;
  if (fields.body !== prompt.body) patch.body = input.body;
  if (fields.tagsText !== prompt.tags.join(", ") && JSON.stringify(input.tags) !== JSON.stringify(prompt.tags)) patch.tags = input.tags;
  if (fields.summary !== (prompt.summary ?? "") && input.summary !== (prompt.summary ?? "")) patch.summary = input.summary;
  const storedVariables = JSON.stringify(prompt.variables ?? []);
  if ((patch.body !== void 0 || JSON.stringify(fields.variables) !== storedVariables) && JSON.stringify(input.variables) !== storedVariables) patch.variables = input.variables;
  return patch;
}

// src/client/components/ImportExportModal.tsx
var React8 = __toESM(require("react"), 1);

// src/client/utils/transfer.ts
var MAX_BACKUP_BYTES = MAX_REQUEST_BODY_BYTES;
function checkSize(byteLength) {
  if (byteLength <= MAX_BACKUP_BYTES) return void 0;
  return {
    ok: false,
    errorKey: "transfer.tooLarge",
    detail: `${byteLength}/${MAX_BACKUP_BYTES}`
  };
}
async function readBackupFile(file) {
  return checkSize(file.size) ?? parseBackupFile(await file.text(), file.size);
}
function parseBackupFile(text, byteLength) {
  const oversized = checkSize(byteLength);
  if (oversized) return oversized;
  let backup;
  try {
    backup = JSON.parse(text);
  } catch (err) {
    return { ok: false, errorKey: "transfer.badJson", detail: reasonOf(err) };
  }
  const bytes = new TextEncoder().encode(JSON.stringify(backup)).byteLength + IMPORT_REQUEST_OVERHEAD;
  return checkSize(bytes) ?? { ok: true, backup };
}
async function confirmBackupImport(backup) {
  const result = await api.importBackup(backup, true);
  if (result.applied !== true) return { applied: false, detail: `applied=${String(result.applied)}` };
  const ids = result.overwrittenIds;
  if (!Array.isArray(ids) || ids.length !== result.stats?.overwritten || new Set(ids).size !== ids.length || !ids.every((id) => typeof id === "string" && id !== "")) {
    console.warn("[prompt-enhancer] \u5BFC\u5165\u6210\u529F\uFF0C\u4F46\u7F3A\u5C11\u6709\u6548\u7684\u8986\u76D6\u56DE\u6267\uFF0C\u672A\u6E05\u7406\u65E7\u5143\u6570\u636E");
  } else if (ids.length > 0) {
    const overwritten = new Set(ids);
    const preserved = result.preservedSkillIds;
    const valid = Array.isArray(preserved) && preserved.every((id) => overwritten.has(id));
    const keep = valid ? new Set(preserved) : overwritten;
    const keys = ids.flatMap((id) => perPromptMetaKeys(id, keep.has(id)));
    void clearPromptMeta(keys).catch((error) => {
      console.warn("[prompt-enhancer] \u5BFC\u5165\u6210\u529F\uFF0C\u4F46\u65E7\u5143\u6570\u636E\u6E05\u7406\u672A\u5B8C\u6210", error);
    });
  }
  notifyDataChanged();
  return { applied: true, stats: result.stats };
}

// src/client/utils/workspace-dir.ts
var capability = null;
function setDirectoryCapability(cap) {
  capability = cap ?? null;
}
function isDirectoryPickerAvailable() {
  return !!capability && typeof capability.pickDirectory === "function";
}
async function pickExportDirectory() {
  if (!capability || typeof capability.pickDirectory !== "function") {
    throw new Error("\u5BBF\u4E3B\u672A\u63D0\u4F9B\u76EE\u5F55\u9009\u62E9\u80FD\u529B\uFF08ui-workspace \u5BA2\u6237\u7AEF\u7F3A\u5931\uFF09\uFF0C\u65E0\u6CD5\u9009\u62E9\u5BFC\u51FA\u76EE\u5F55");
  }
  return capability.pickDirectory();
}

// src/client/components/ImportExportModal.tsx
var import_jsx_runtime9 = require("react/jsx-runtime");
function ImportExportModal({ t }) {
  const [busy, setBusy] = React8.useState("idle");
  const [exported, setExported] = React8.useState(null);
  const [exportFailed, setExportFailed] = React8.useState(null);
  const [preview, setPreview] = React8.useState(null);
  const [applied, setApplied] = React8.useState(null);
  const [overflow, setOverflow] = React8.useState(null);
  const [failure, setFailure] = React8.useState(null);
  const fileRef = React8.useRef(null);
  const aliveRef = React8.useRef(true);
  React8.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  const pickerAvailable = isDirectoryPickerAvailable();
  const idle = busy === "idle";
  const runExport = () => {
    if (!idle || !pickerAvailable) return;
    setExported(null);
    setExportFailed(null);
    setFailure(null);
    setBusy("exporting");
    void (async () => {
      try {
        const dir = await pickExportDirectory();
        if (dir === null) return;
        const result = await api.exportBackup(dir);
        if (!aliveRef.current) return;
        setExported(result);
      } catch (err) {
        console.warn("[prompt-enhancer] \u5BFC\u51FA\u5907\u4EFD\u5931\u8D25", err);
        if (aliveRef.current) setExportFailed(reasonOf(err));
      } finally {
        if (aliveRef.current) setBusy("idle");
      }
    })();
  };
  const onPickFile = (ev) => {
    const file = ev.target.files?.[0] ?? null;
    ev.target.value = "";
    if (file === null || !idle) return;
    setPreview(null);
    setApplied(null);
    setOverflow(null);
    setFailure(null);
    setExportFailed(null);
    setBusy("reading");
    void (async () => {
      try {
        let parsed;
        try {
          parsed = await readBackupFile(file);
        } catch (err) {
          console.warn("[prompt-enhancer] \u8BFB\u53D6\u6240\u9009\u5907\u4EFD\u6587\u4EF6\u5931\u8D25", err);
          if (aliveRef.current) setFailure({ key: "manager.transfer.readFailed", detail: reasonOf(err) });
          return;
        }
        if (!parsed.ok) {
          if (aliveRef.current) setFailure({ key: parsed.errorKey, detail: parsed.detail });
          return;
        }
        try {
          const result = await api.importBackup(parsed.backup, false);
          if (!aliveRef.current) return;
          if (result.stats === void 0) {
            setFailure({ key: "manager.transfer.noStats", detail: "keys=" + Object.keys(result).sort().join(",") });
            return;
          }
          setPreview({ backup: parsed.backup, stats: result.stats });
        } catch (err) {
          console.warn("[prompt-enhancer] \u5BFC\u5165\u9884\u89C8\u88AB\u5BBF\u4E3B\u62D2\u7EDD", err);
          if (aliveRef.current) setFailure({ key: "manager.transfer.importFailed", detail: reasonOf(err) });
        }
      } finally {
        if (aliveRef.current) setBusy("idle");
      }
    })();
  };
  const cancelImport = () => {
    setPreview(null);
    setFailure(null);
  };
  const confirmImport = () => {
    if (preview === null || !idle) return;
    const { backup, stats } = preview;
    setFailure(null);
    setBusy("applying");
    void (async () => {
      try {
        const result = await confirmBackupImport(backup);
        if (!aliveRef.current) return;
        if (!result.applied) {
          setFailure({ key: "manager.transfer.importFailed", detail: result.detail });
          return;
        }
        const done = result.stats ?? stats;
        setPreview(null);
        setApplied(done);
        try {
          const list = await api.listPrompts();
          if (!aliveRef.current) return;
          const settings = getSettingsSnapshot();
          if (!isSettingsReady()) {
            throw new Error("\u8BBE\u7F6E\u5C1A\u672A\u5C31\u7EEA\uFF0C\u65E0\u6CD5\u786E\u8BA4\u5B58\u50A8\u4E0A\u9650");
          }
          if (list.length > settings.maxPromptCount) {
            setOverflow({ imported: done.total, total: list.length, max: settings.maxPromptCount });
          }
        } catch (err) {
          console.warn("[prompt-enhancer] \u5BFC\u5165\u6210\u529F\uFF0C\u4F46\u8BFB\u53D6\u5F53\u524D\u6761\u6570 / \u4E0A\u9650\u5931\u8D25", err);
          if (aliveRef.current) setFailure({ key: "manager.transfer.countsFailed", detail: reasonOf(err) });
        }
      } catch (err) {
        console.warn("[prompt-enhancer] \u5BFC\u5165\u843D\u5E93\u5931\u8D25", err);
        if (aliveRef.current) setFailure({ key: "manager.transfer.importFailed", detail: reasonOf(err) });
      } finally {
        if (aliveRef.current) setBusy("idle");
      }
    })();
  };
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { style: toolbar, children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
      "button",
      {
        type: "button",
        style: { ...primaryButton, opacity: pickerAvailable && idle ? 1 : 0.6 },
        "aria-busy": busy === "exporting",
        disabled: !pickerAvailable || !idle,
        onClick: runExport,
        children: busy === "exporting" ? t("manager.transfer.exporting") : t("manager.transfer.export")
      }
    ) }),
    !pickerAvailable && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { style: muted, children: t("manager.transfer.exportUnavailable") }),
    exported !== null && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { role: "status", "aria-live": "polite", style: muted, children: [
      t("manager.transfer.exported"),
      " ",
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { style: errorDetail, title: exported.path, children: exported.path }),
      " \xB7 ",
      t("manager.transfer.prompts"),
      " ",
      exported.prompts,
      " \xB7 ",
      t("manager.transfer.tags"),
      " ",
      exported.tags
    ] }),
    exportFailed !== null && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { role: "alert", style: errorText, children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: t("manager.transfer.exportFailed") }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { style: errorDetail, title: exportFailed, children: exportFailed })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { style: toolbar, children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("button", { type: "button", style: button, disabled: !idle, onClick: () => fileRef.current?.click(), children: t("manager.transfer.import") }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
        "input",
        {
          ref: fileRef,
          type: "file",
          accept: ".json,application/json",
          hidden: true,
          "aria-label": t("manager.transfer.import"),
          onChange: onPickFile
        }
      )
    ] }),
    preview !== null && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { style: muted, children: [
        t("manager.transfer.previewAdded"),
        " ",
        preview.stats.added,
        " \xB7 ",
        t("manager.transfer.previewOverwritten"),
        " ",
        preview.stats.overwritten,
        " \xB7 ",
        t("manager.transfer.previewTotal"),
        " ",
        preview.stats.total
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { role: "alert", style: errorText, children: t("manager.transfer.overwriteWarning") }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { style: actions, children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("button", { type: "button", style: button, onClick: cancelImport, children: t("manager.transfer.cancel") }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
          "button",
          {
            type: "button",
            style: { ...primaryButton, opacity: idle ? 1 : 0.6 },
            "aria-busy": busy === "applying",
            disabled: !idle,
            onClick: confirmImport,
            children: busy === "applying" ? t("manager.transfer.importing") : t("manager.transfer.confirm")
          }
        )
      ] })
    ] }),
    applied !== null && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { role: "status", "aria-live": "polite", style: muted, children: [
      t("manager.transfer.imported"),
      " \xB7 ",
      t("manager.transfer.previewAdded"),
      " ",
      applied.added,
      " \xB7 ",
      t("manager.transfer.previewOverwritten"),
      " ",
      applied.overwritten,
      " \xB7 ",
      t("manager.transfer.previewTotal"),
      " ",
      applied.total
    ] }),
    overflow !== null && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { role: "status", "aria-live": "polite", style: muted, children: [
      t("manager.transfer.overLimitBefore"),
      " ",
      overflow.imported,
      " ",
      t("manager.transfer.overLimitMid"),
      " ",
      overflow.total,
      " ",
      t("manager.transfer.overLimitAfter"),
      " ",
      overflow.max,
      " ",
      t("manager.transfer.overLimitNote")
    ] }),
    failure !== null && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { role: "alert", style: errorText, children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: t(failure.key) }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { style: errorDetail, title: failure.detail, children: failure.detail })
    ] })
  ] });
}

// src/client/components/RecycleManagePanel.tsx
var React9 = __toESM(require("react"), 1);
var import_jsx_runtime10 = require("react/jsx-runtime");
function deletedAtText(ms) {
  return new Date(ms).toLocaleString();
}
function RecycleManagePanel({ t }) {
  const [notice, setNotice] = React9.useState(null);
  const [failure, setFailure] = React9.useState(null);
  const [busy, setBusy] = React9.useState(null);
  const [reloadSeq, setReloadSeq] = React9.useState(0);
  const aliveRef = React9.useRef(true);
  React9.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  useDataChanged(() => setReloadSeq((n) => n + 1));
  const loadTrash = React9.useCallback(() => api.listTrash(), [reloadSeq]);
  const { items, error: loadError } = useAsyncList(loadTrash, { label: "\u56DE\u6536\u7AD9\u52A0\u8F7D\u5931\u8D25" });
  const begin = () => {
    setNotice(null);
    setFailure(null);
  };
  const restore = (item) => {
    if (busy !== null) return;
    begin();
    setBusy(item.id);
    api.restoreTrash(item.id).then(
      () => {
        if (!aliveRef.current) return;
        setBusy(null);
        setNotice(t("manager.trash.restored"));
        notifyDataChanged();
      },
      (err) => {
        console.warn("[prompt-enhancer] \u6062\u590D\u63D0\u793A\u8BCD\u5931\u8D25", err);
        if (!aliveRef.current) return;
        setBusy(null);
        setFailure({ key: "manager.trash.restoreFailed", detail: reasonOf(err) });
      }
    );
  };
  const purge = (item) => {
    if (busy !== null) return;
    begin();
    setBusy(item.id);
    void (async () => {
      try {
        const approved = await requestConfirm({
          title: "manager.confirm.purgeTitle",
          message: "manager.confirm.purgeMessage",
          detail: [item.title],
          confirmLabel: "manager.confirm.confirm",
          cancelLabel: "manager.confirm.cancel"
        });
        if (!approved) {
          if (aliveRef.current) setBusy(null);
          return;
        }
        await deletePrompts({ ids: [item.id], irreversible: true, remove: () => api.deleteTrash(item.id) });
        if (!aliveRef.current) return;
        setBusy(null);
        setNotice(t("manager.trash.purged"));
        notifyDataChanged();
      } catch (err) {
        console.warn("[prompt-enhancer] \u6C38\u4E45\u5220\u9664\u56DE\u6536\u7AD9\u6761\u76EE\u5931\u8D25", err);
        if (!aliveRef.current) return;
        setBusy(null);
        setFailure({ key: "manager.trash.purgeFailed", detail: reasonOf(err) });
      }
    })();
  };
  const emptyAll = () => {
    if (busy !== null) return;
    begin();
    setBusy("empty");
    void (async () => {
      try {
        const approved = await requestConfirm({
          title: "manager.confirm.emptyTitle",
          message: "manager.confirm.emptyMessage",
          detail: (items ?? []).map((item) => item.title),
          confirmLabel: "manager.confirm.confirm",
          cancelLabel: "manager.confirm.cancel"
        });
        if (!approved) {
          if (aliveRef.current) setBusy(null);
          return;
        }
        await deletePrompts({
          ids: (items ?? []).map((it) => it.id),
          irreversible: true,
          remove: () => api.emptyTrash()
        });
        if (!aliveRef.current) return;
        setBusy(null);
        setNotice(t("manager.trash.emptied"));
        notifyDataChanged();
      } catch (err) {
        console.warn("[prompt-enhancer] \u6E05\u7A7A\u56DE\u6536\u7AD9\u5931\u8D25", err);
        if (!aliveRef.current) return;
        setBusy(null);
        setFailure({ key: "manager.trash.emptyFailed", detail: reasonOf(err) });
      }
    })();
  };
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(import_jsx_runtime10.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { style: { ...toolbar, justifyContent: "flex-end" }, children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
      "button",
      {
        type: "button",
        style: primaryButton,
        disabled: busy !== null || items === null || items.length === 0,
        onClick: emptyAll,
        children: t("manager.trash.emptyAll")
      }
    ) }),
    notice !== null && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { role: "status", "aria-live": "polite", style: muted, children: notice }),
    failure !== null && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { role: "alert", style: errorText, children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: t(failure.key) }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { style: errorDetail, title: failure.detail, children: failure.detail })
    ] }),
    loadError !== null && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { role: "alert", style: errorText, children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: t("manager.trash.loadFailed") }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { style: errorDetail, title: loadError, children: loadError })
    ] }),
    loadError === null && items === null && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { style: muted, children: t("list.loading") }),
    loadError === null && items !== null && items.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { style: muted, children: t("manager.trash.empty") }),
    loadError === null && items !== null && items.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { role: "list", children: items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { role: "listitem", "aria-label": item.title, style: listRow, children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { style: rowText, children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { style: rowTitle, children: item.title }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { style: rowMeta, children: /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { style: tagChip, children: [
          t("manager.trash.usage"),
          " ",
          item.usageCount
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { style: muted, children: [
          t("manager.trash.deletedAt"),
          " ",
          deletedAtText(item.deletedAt)
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { style: actions, children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("button", { type: "button", style: button, disabled: busy !== null, onClick: () => restore(item), children: t("manager.trash.restore") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("button", { type: "button", style: button, disabled: busy !== null, onClick: () => purge(item), children: t("manager.trash.purge") })
      ] })
    ] }, item.id)) })
  ] });
}

// src/client/components/SkillBadge.tsx
var React10 = __toESM(require("react"), 1);

// src/skill-badge.ts
function isSkillStale(prompt) {
  return Boolean(prompt.skillName) && (prompt.skillExportedAt === 0 || prompt.updatedAt > prompt.skillExportedAt);
}
function skillBadgeState(prompt) {
  if (!prompt.skillName) return "none";
  return isSkillStale(prompt) ? "stale" : "exported";
}
function skillBadgeVisual(state2) {
  return state2 === "stale" ? { tone: "warn", labelKey: "manager.skill.badgeStale", action: true, showName: false } : { tone: "success", labelKey: "manager.skill.badgeExported", action: false, showName: true };
}
async function reExportSkill(promptId, send, descriptor) {
  const request = descriptor ? { promptId, descriptor } : { promptId };
  let receipt;
  try {
    receipt = await send(request);
  } catch (err) {
    return {
      ok: false,
      errorKey: "manager.skill.exportFailed",
      detail: reasonOf(err)
    };
  }
  if (!receipt.path) {
    return { ok: false, errorKey: "manager.skill.pathMissing", detail: `keys=${Object.keys(receipt).sort().join(",")}` };
  }
  return { ok: true, receipt };
}

// src/client/components/SkillBadge.tsx
var import_jsx_runtime11 = require("react/jsx-runtime");
function chipStyle(tone, emphasize) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "0 6px",
    fontSize: 10,
    fontWeight: emphasize ? 600 : 400,
    color: tone,
    border: "1px solid " + (emphasize ? tone : TOKEN.border),
    borderRadius: 999
  };
}
var WRAP3 = { display: "inline-flex", flexDirection: "column", gap: 2, minWidth: 0 };
function SkillBadge({ t, prompt, onReExported }) {
  const [busy, setBusy] = React10.useState(false);
  const [failure, setFailure] = React10.useState(null);
  const [notice, setNotice] = React10.useState(null);
  const aliveRef = React10.useRef(true);
  React10.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  const state2 = skillBadgeState(prompt);
  if (state2 === "none") return null;
  const visual = skillBadgeVisual(state2);
  const reExport = () => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    setNotice(null);
    void (async () => {
      const descriptor = await loadStoredDescriptor(prompt.id, api.getMeta);
      const outcome = await reExportSkill(prompt.id, api.exportPromptAsSkill, descriptor);
      if (!outcome.ok) console.warn("[prompt-enhancer] \u91CD\u65B0\u5BFC\u51FA\u6280\u80FD\u5931\u8D25", outcome.detail);
      if (outcome.ok) notifyDataChanged();
      if (!aliveRef.current) return;
      setBusy(false);
      if (outcome.ok) {
        setNotice(t("manager.skill.reExported"));
        onReExported?.(outcome.receipt);
      } else {
        setFailure({ key: outcome.errorKey, detail: outcome.detail });
      }
    })();
  };
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { style: WRAP3, children: [
    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { style: chipStyle(TONE[visual.tone], visual.action), children: [
      t(visual.labelKey),
      visual.showName && " " + (prompt.skillName ?? ""),
      visual.action && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("button", { type: "button", style: primaryButton, "aria-busy": busy, disabled: busy, onClick: reExport, children: busy ? t("manager.skill.reExporting") : t("manager.skill.reExport") })
    ] }),
    notice !== null && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { role: "status", "aria-live": "polite", style: muted, children: notice }),
    failure !== null && /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { role: "alert", style: errorText, children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { children: t(failure.key) }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { style: errorDetail, title: failure.detail, children: failure.detail })
    ] })
  ] });
}

// src/client/components/SkillExportModal.tsx
var React11 = __toESM(require("react"), 1);
var import_jsx_runtime12 = require("react/jsx-runtime");
function SkillExportModal({ t, onBack, initialPromptId }) {
  const [selected, setSelected] = React11.useState(initialPromptId ? [initialPromptId] : []);
  const [reviewing, setReviewing] = React11.useState(false);
  const [tag, setTag] = React11.useState("");
  const [descriptors, setDescriptors] = React11.useState({});
  const [busy, setBusy] = React11.useState("idle");
  const [outcomes, setOutcomes] = React11.useState(null);
  const [fatal, setFatal] = React11.useState(null);
  const aliveRef = React11.useRef(true);
  const runRef = React11.useRef(null);
  React11.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      runRef.current?.cancel();
    };
  }, []);
  const [reloadSeq, setReloadSeq] = React11.useState(0);
  useDataChanged(() => setReloadSeq((n) => n + 1));
  const loadPrompts = React11.useCallback(() => api.listPrompts(), [reloadSeq]);
  const { items: prompts, error: loadError, setItems: setPrompts } = useAsyncList(loadPrompts, { label: "\u6280\u80FD\u5BFC\u51FA\uFF1A\u63D0\u793A\u8BCD\u52A0\u8F7D\u5931\u8D25", clearErrorOnStart: true });
  const list = prompts ?? [];
  const visible = React11.useMemo(() => filterByTag(list, tag), [list, tag]);
  const tags = React11.useMemo(() => collectTags(list), [list]);
  const chosen = React11.useMemo(() => pickSelected(list, selected), [list, selected]);
  const summary = outcomes === null ? null : summarizeExport(outcomes);
  const idle = busy === "idle";
  const allVisibleSelected = isAllSelected(visible, selected);
  const shown = reviewing ? chosen : visible;
  const describeChosen = () => {
    if (!idle || chosen.length === 0) return;
    const run = createSkillRun();
    runRef.current = run;
    setBusy("describing");
    setOutcomes(null);
    setFatal(null);
    void (async () => {
      try {
        await describeEach(
          chosen,
          (prompt) => api.aiSkillDescriptor({
            body: prompt.body,
            title: prompt.title,
            summary: prompt.summary,
            tags: prompt.tags
          }),
          {
            run,
            onEach: (id, outcome) => {
              if (aliveRef.current) setDescriptors((prev) => ({ ...prev, [id]: outcome }));
            }
          }
        );
      } catch (err) {
        console.warn("[prompt-enhancer] \u6280\u80FD\u8865\u5168\u7F16\u6392\u5F02\u5E38", err);
        if (aliveRef.current) setFatal(reasonOf(err));
      } finally {
        runRef.current = null;
        if (aliveRef.current) setBusy("idle");
      }
    })();
  };
  const runExport = () => {
    if (!idle || chosen.length === 0) return;
    const run = createSkillRun();
    runRef.current = run;
    setBusy("exporting");
    setOutcomes(null);
    setFatal(null);
    void (async () => {
      try {
        const results = await exportEach({
          prompts: chosen,
          descriptors,
          run,
          send: (prompt, request) => api.exportPromptAsSkill({
            promptId: prompt.id,
            name: request.name,
            descriptor: request.descriptor,
            conflictToken: request.conflictToken
          }),
          // 同名冲突确认：共享确认弹窗（promise 驱动；渲染点在 PromptSurfaceHost，压住管理面板）。
          confirmConflict: (info) => requestConfirm({
            title: "manager.skill.conflictTitle",
            message: "manager.skill.conflictMessage",
            detail: [`${info.title} \u2192 ${info.name}`, info.detail],
            confirmLabel: "manager.confirm.confirm",
            cancelLabel: "manager.confirm.cancel"
          }),
          /**
           * T7-4：**就地更新该条**——把刚落盘的名字写进本地那一条（锁定判定 `exportNameLocked` /
           * `precheckExport` 读的就是它），不重拉整库。这里**不编** `skillExportedAt`：它的权威值由
           * **批末那次重拉**带回（本页只渲染名字与「已锁定」标注，不渲染徽标）。
           *
           * ⚠️ 要求 2 的广播没有取消，只是**移到批末一次**（见下面 `finally` 里的 `notifyDataChanged()`）：
           * 那次广播写在异步函数里、与组件在世与否无关——用户跑到一半离开（组件卸载）时批次仍会收尾，
           * 宿主已回写的 `skillName` / `skillExportedAt` 照样广播出去，验收 16 的徽标不会缺席。
           */
          onExported: (outcome) => {
            if (!aliveRef.current) return;
            setPrompts(
              (prev) => prev === null ? prev : prev.map((p) => p.id === outcome.id ? { ...p, skillName: outcome.name } : p)
            );
          }
        });
        if (!aliveRef.current) return;
        setOutcomes(results);
      } catch (err) {
        console.warn("[prompt-enhancer] \u6280\u80FD\u5BFC\u51FA\u7F16\u6392\u5F02\u5E38", err);
        if (aliveRef.current) setFatal(reasonOf(err));
      } finally {
        runRef.current = null;
        notifyDataChanged();
        if (aliveRef.current) setBusy("idle");
      }
    })();
  };
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { style: toolbar, children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { "data-prompt-enhancer-skill": "", style: dialogTitle, children: t("manager.skill.title") }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("button", { type: "button", style: button, onClick: onBack, children: t("manager.skill.back") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { style: muted, children: t("manager.skill.hint") }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { style: toolbar, children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
        "button",
        {
          type: "button",
          style: button,
          disabled: !idle || reviewing || visible.length === 0,
          onClick: () => setSelected(toggleAllVisible(visible, selected)),
          children: allVisibleSelected ? t("manager.skill.selectNone") : t("manager.skill.selectAll")
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("label", { style: muted, children: [
        t("manager.skill.tagFilter"),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(
          "select",
          {
            "aria-label": t("manager.skill.tagFilter"),
            value: tag,
            disabled: reviewing,
            onChange: (ev) => setTag(ev.target.value),
            style: { ...select, marginLeft: 4 },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("option", { value: "", children: t("manager.skill.allTags") }),
              tags.map((name) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("option", { value: name, children: name }, name))
            ]
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { style: muted, children: [
        t("manager.skill.selected"),
        " ",
        chosen.length
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
        "button",
        {
          type: "button",
          style: { ...button, opacity: idle && chosen.length > 0 ? 1 : 0.6 },
          "aria-busy": busy === "describing",
          disabled: !idle || reviewing || chosen.length === 0,
          onClick: describeChosen,
          children: busy === "describing" ? t("manager.skill.describing") : t("manager.skill.describe")
        }
      ),
      reviewing ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("button", { type: "button", style: button, disabled: !idle, onClick: () => setReviewing(false), children: t("manager.skill.backToSelection") }) : /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
        "button",
        {
          type: "button",
          style: primaryButton,
          disabled: !idle || chosen.length === 0,
          onClick: () => {
            setReviewing(true);
            setOutcomes(null);
          },
          children: t("manager.skill.preview")
        }
      )
    ] }),
    loadError !== null && /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { role: "alert", style: errorText, children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { children: t("manager.skill.loadFailed") }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { style: errorDetail, title: loadError, children: loadError })
    ] }),
    loadError === null && prompts === null && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { style: muted, children: t("list.loading") }),
    loadError === null && prompts !== null && visible.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { style: muted, children: t("manager.skill.empty") }),
    loadError === null && shown.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("ul", { style: { listStyle: "none", padding: 0, margin: 0 }, children: shown.map((prompt) => {
      const recorded = descriptors[prompt.id];
      const descriptor = recorded?.ok ? recorded.descriptor : void 0;
      const pre = precheckExport(prompt, descriptor);
      const locked = exportNameLocked(prompt);
      return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("li", { "aria-label": prompt.title, style: listRow, children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
          "input",
          {
            type: "checkbox",
            "aria-label": prompt.title,
            checked: selected.includes(prompt.id),
            disabled: !idle || reviewing,
            onChange: () => setSelected(toggleSelected(selected, prompt.id))
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { style: rowText, children: [
          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { style: rowTitle, children: prompt.title }),
          /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { style: rowMeta, children: [
            (prompt.tags ?? []).map((name) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { style: tagChip, children: name }, name)),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { style: muted, children: [
              t("manager.skill.nameLabel"),
              "\uFF1A",
              pre.ok ? pre.name : prompt.skillName ?? descriptor?.name ?? "\u2014",
              locked ? ` \xB7 ${t("manager.skill.nameLocked")}` : ""
            ] })
          ] }),
          recorded !== void 0 && recorded.ok && /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { style: muted, children: [
            recorded.descriptor.name,
            " \u2014 ",
            recorded.descriptor.description,
            locked ? ` \xB7 ${t("manager.skill.aiNameIgnored")}` : ""
          ] }),
          recorded !== void 0 && !recorded.ok && /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { role: "alert", style: errorText, children: [
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { children: t(recorded.errorKey) }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { style: errorDetail, title: recorded.detail, children: recorded.detail })
          ] }),
          reviewing && pre.ok && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("pre", { style: { ...compareBody, margin: "6px 0 0" }, children: renderSkillFile({ name: pre.name, description: pre.description, whenToUse: descriptor?.whenToUse, body: prompt.body }) }),
          !pre.ok && selected.includes(prompt.id) && /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { role: "alert", style: errorText, children: [
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { children: t(pre.errorKey) }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { style: errorDetail, title: pre.detail, children: pre.detail })
          ] })
        ] })
      ] }, prompt.id);
    }) }),
    reviewing && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { style: actions, children: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
      "button",
      {
        type: "button",
        style: primaryButton,
        "aria-busy": busy === "exporting",
        disabled: !idle || chosen.length === 0 || loadError !== null,
        onClick: runExport,
        children: busy === "exporting" ? t("manager.skill.exporting") : t("manager.skill.export")
      }
    ) }),
    fatal !== null && /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { role: "alert", style: errorText, children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { children: t("manager.skill.exportFailed") }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { style: errorDetail, title: fatal, children: fatal })
    ] }),
    summary !== null && /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { style: dialogTitle, children: t("manager.skill.summary") }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { role: "status", "aria-live": "polite", style: muted, children: [
        t("manager.skill.summaryOk"),
        " ",
        summary.okCount,
        " \xB7 ",
        t("manager.skill.summaryFailed"),
        " ",
        summary.failCount,
        summary.declinedCount > 0 ? ` \xB7 ${t("manager.skill.summaryDeclined")} ${summary.declinedCount}` : ""
      ] }),
      summary.exported.map((outcome) => /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { style: muted, children: [
        "\u2713 ",
        outcome.title,
        " \u2192 ",
        outcome.name,
        " \xB7 ",
        t("manager.skill.target"),
        " ",
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { style: errorDetail, title: outcome.path, children: outcome.path })
      ] }, outcome.id)),
      summary.failed.map((outcome) => /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { role: "alert", style: errorText, children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { children: [
          "\u2717 ",
          outcome.title,
          " \xB7 ",
          t(outcome.errorKey)
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { style: errorDetail, title: outcome.detail, children: outcome.detail })
      ] }, outcome.id)),
      summary.declined.map((outcome) => /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { style: muted, children: [
        "\u2013 ",
        outcome.title,
        " \xB7 ",
        t("manager.skill.declined")
      ] }, outcome.id)),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { style: actions, children: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("button", { type: "button", style: button, onClick: onBack, children: t("manager.skill.back") }) })
    ] })
  ] });
}

// src/client/components/TagManagePanel.tsx
var React12 = __toESM(require("react"), 1);
var import_jsx_runtime13 = require("react/jsx-runtime");
function TagManagePanel({ t }) {
  const [notice, setNotice] = React12.useState(null);
  const [failure, setFailure] = React12.useState(null);
  const [editing, setEditing] = React12.useState(null);
  const [inUse, setInUse] = React12.useState(null);
  const [busy, setBusy] = React12.useState(false);
  const [reloadSeq, setReloadSeq] = React12.useState(0);
  const aliveRef = React12.useRef(true);
  React12.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  useDataChanged(() => setReloadSeq((n) => n + 1));
  const loadTags = React12.useCallback(() => api.listTags(), [reloadSeq]);
  const { items: tags, error: loadError } = useAsyncList(loadTags, { label: "\u6807\u7B7E\u52A0\u8F7D\u5931\u8D25" });
  const begin = () => {
    setNotice(null);
    setFailure(null);
    setInUse(null);
    setBusy(true);
  };
  const rename = (from, value) => {
    const target = value.trim();
    if (target === "" || target === from) {
      setEditing(null);
      return;
    }
    if (busy) return;
    begin();
    api.renameTag(from, target).then(
      () => {
        if (!aliveRef.current) return;
        setBusy(false);
        setEditing(null);
        setNotice(t("manager.tags.renamed"));
        notifyDataChanged();
      },
      (err) => {
        console.warn("[prompt-enhancer] \u6807\u7B7E\u91CD\u547D\u540D\u5931\u8D25", err);
        if (!aliveRef.current) return;
        setBusy(false);
        setFailure({ key: "manager.tags.renameFailed", detail: reasonOf(err) });
      }
    );
  };
  const remove = (item) => {
    if (busy) return;
    begin();
    api.deleteTag(item.name).then(
      () => {
        if (!aliveRef.current) return;
        setBusy(false);
        setNotice(t("manager.tags.deleted"));
        notifyDataChanged();
      },
      (err) => {
        console.warn("[prompt-enhancer] \u6807\u7B7E\u5220\u9664\u5931\u8D25", err);
        if (!aliveRef.current) return;
        setBusy(false);
        if (err instanceof ApiError && err.status === 400) {
          setInUse({ name: item.name, count: item.count });
          setReloadSeq((n) => n + 1);
          return;
        }
        setFailure({ key: "manager.tags.deleteFailed", detail: reasonOf(err) });
      }
    );
  };
  const cleanUnused = () => {
    if (busy) return;
    const orphans = (tags ?? []).filter((item) => item.count === 0);
    if (orphans.length === 0) {
      setNotice(t("manager.tags.cleanNone"));
      setFailure(null);
      setInUse(null);
      return;
    }
    begin();
    void (async () => {
      const removed = [];
      const failed = [];
      for (const item of orphans) {
        try {
          await api.deleteTag(item.name);
          removed.push(item.name);
        } catch (err) {
          console.warn("[prompt-enhancer] \u6E05\u7406\u65E0\u7528\u6807\u7B7E\u5931\u8D25\uFF1A" + item.name, err);
          failed.push(item.name);
        }
      }
      if (!aliveRef.current) return;
      setBusy(false);
      if (failed.length > 0) setFailure({ key: "manager.tags.cleanFailed", detail: failed.join(", ") });
      if (removed.length > 0) {
        setNotice(t("manager.tags.cleaned") + " " + removed.join(", "));
        notifyDataChanged();
      } else {
        setReloadSeq((n) => n + 1);
      }
    })();
  };
  const inUseCount = inUse === null ? null : (tags ?? []).find((item) => item.name === inUse.name)?.count ?? inUse.count;
  return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)(import_jsx_runtime13.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { style: { ...toolbar, justifyContent: "flex-end" }, children: /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("button", { type: "button", style: primaryButton, disabled: busy || tags === null, onClick: cleanUnused, children: t("manager.tags.clean") }) }),
    inUse !== null && /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("span", { role: "alert", style: errorText, children: [
      /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("span", { children: [
        t("manager.tags.inUseBefore"),
        " ",
        inUseCount,
        " ",
        t("manager.tags.inUseAfter")
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { style: errorDetail, title: inUse.name, children: inUse.name })
    ] }),
    notice !== null && /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { role: "status", "aria-live": "polite", style: muted, children: notice }),
    failure !== null && /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("span", { role: "alert", style: errorText, children: [
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { children: t(failure.key) }),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { style: errorDetail, title: failure.detail, children: failure.detail })
    ] }),
    loadError !== null && /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("span", { role: "alert", style: errorText, children: [
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { children: t("manager.tags.loadFailed") }),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { style: errorDetail, title: loadError, children: loadError })
    ] }),
    loadError === null && tags === null && /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { style: muted, children: t("list.loading") }),
    loadError === null && tags !== null && tags.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { style: muted, children: t("manager.tags.empty") }),
    loadError === null && tags !== null && tags.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { role: "list", children: tags.map((item) => /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { role: "listitem", "aria-label": item.name, style: listRow, children: [
      /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("span", { style: rowText, children: [
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { style: rowTitle, children: item.name }),
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { style: rowMeta, children: /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("span", { style: tagChip, children: [
          t("manager.tags.usage"),
          " ",
          item.count
        ] }) }),
        editing !== null && editing.from === item.name && /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
          "input",
          {
            type: "text",
            "aria-label": t("manager.tags.rename"),
            value: editing.value,
            onChange: (ev) => setEditing({ from: item.name, value: ev.target.value }),
            style: textInput
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { style: actions, children: editing !== null && editing.from === item.name ? /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)(import_jsx_runtime13.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("button", { type: "button", style: primaryButton, disabled: busy, onClick: () => rename(item.name, editing.value), children: t("manager.tags.renameSave") }),
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("button", { type: "button", style: button, disabled: busy, onClick: () => setEditing(null), children: t("manager.tags.renameCancel") })
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)(import_jsx_runtime13.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
          "button",
          {
            type: "button",
            style: button,
            disabled: busy,
            onClick: () => {
              setNotice(null);
              setFailure(null);
              setInUse(null);
              setEditing({ from: item.name, value: item.name });
            },
            children: t("manager.tags.rename")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("button", { type: "button", style: button, disabled: busy, onClick: () => remove(item), children: t("manager.tags.delete") })
      ] }) })
    ] }, item.name)) })
  ] });
}

// src/client/components/PromptManagerModal.tsx
var import_jsx_runtime14 = require("react/jsx-runtime");
var PANEL_ORDER = ["list", "tags", "trash", "transfer"];
var PANEL_LABEL = {
  list: "manager.tab.list",
  tags: "manager.tab.tags",
  trash: "manager.tab.trash",
  transfer: "manager.tab.transfer"
};
var SORTS = [
  { value: "default", label: "manager.list.sortDefault" },
  { value: "updated", label: "manager.list.sortUpdated" },
  { value: "used", label: "manager.list.sortUsed" },
  { value: "created", label: "manager.list.sortCreated" }
];
var SEARCH_DEBOUNCE_MS = 300;
function PromptManagerModal({ t, panel, panelValue, onPanelValue }) {
  const settings = useSettings();
  const [skillPromptId, setSkillPromptId] = React13.useState();
  const [target, setTarget] = React13.useState(null);
  const capture2 = useCapture();
  const editingRef = React13.useRef(false);
  React13.useEffect(() => {
    editingRef.current = target !== null;
  }, [target]);
  React13.useEffect(() => {
    if (capture2 === null) return;
    const pending = takeCapture();
    if (pending === null) return;
    if (editingRef.current || panel !== "list") {
      console.warn("[prompt-enhancer] \u6C89\u6DC0\u8F7D\u8377\u5230\u8FBE\u65F6\u8BE6\u60C5\u9875\u6B63\u5728\u7F16\u8F91\u6216\u9762\u677F\u4E0D\u5728\u5217\u8868\u9875\uFF0C\u672C\u6B21\u9884\u586B\u5DF2\u653E\u5F03\uFF08\u4E0D\u8986\u76D6\u5F53\u524D\u8F93\u5165\uFF09");
      return;
    }
    setTarget({ kind: "create", prefill: pending });
  }, [capture2, panel]);
  const showingSkill = panelValue === "skill";
  const openPanel = (next) => {
    setTarget(null);
    onPanelValue(null);
    openManager(next);
  };
  const startCreate = () => setTarget({ kind: "create", prefill: takeCapture() });
  const openSkill = (promptId) => {
    setTarget(null);
    setSkillPromptId(promptId);
    onPanelValue("skill");
  };
  return /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(
    "div",
    {
      "data-prompt-enhancer-manager": "",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": t("manager.title"),
      style: surface(settings.panelWidth, settings.panelHeight),
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { style: dialogHeader, children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { style: dialogHeaderTop, children: [
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { style: dialogTitle, children: t("manager.title") }),
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("button", { type: "button", style: { ...button, marginLeft: "auto" }, onClick: closeManager, children: t("manager.close") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { style: dialogHeaderBottom, children: [
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { role: "tablist", "aria-label": t("manager.title"), style: dialogTabs, children: PANEL_ORDER.map((id) => /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
              "button",
              {
                type: "button",
                role: "tab",
                "aria-selected": !showingSkill && panel === id,
                style: dialogTab(!showingSkill && panel === id),
                onClick: () => openPanel(id),
                children: t(PANEL_LABEL[id])
              },
              id
            )) }),
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
              "button",
              {
                type: "button",
                "data-prompt-enhancer-skill-open": "",
                style: { ...button, marginLeft: "auto" },
                onClick: () => openSkill(),
                children: t("manager.skill.open")
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
          "div",
          {
            role: "tabpanel",
            "aria-label": showingSkill ? t("manager.skill.title") : t(PANEL_LABEL[panel]),
            style: dialogBody,
            children: showingSkill ? (
              /* 技能导出页（规格 §7.6）：管理面板栈里的一页，与详情页同级（都在本卡片的内容区）。 */
              /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(SkillExportModal, { t, initialPromptId: skillPromptId, onBack: () => onPanelValue(null) })
            ) : /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(import_jsx_runtime14.Fragment, { children: [
              panel === "list" && target === null && /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
                PromptList,
                {
                  t,
                  onCreate: startCreate,
                  onSkill: (prompt) => openSkill(prompt.id),
                  panelWidth: settings.panelWidth,
                  onEdit: (prompt) => setTarget({ kind: "edit", prompt })
                }
              ),
              panel === "list" && target !== null && /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
                PromptDetail,
                {
                  t,
                  target,
                  onBack: () => setTarget(null)
                },
                target.kind === "edit" ? target.prompt.id : "create"
              ),
              panel === "tags" && /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(TagManagePanel, { t }),
              panel === "trash" && /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(RecycleManagePanel, { t }),
              panel === "transfer" && /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(ImportExportModal, { t })
            ] })
          },
          target?.kind ?? "browse"
        )
      ]
    }
  );
}
var LIST_TOOLBAR = {
  ...toolbar,
  position: "sticky",
  top: -12,
  // 粘性盒必须自带不透明底色并压在行之上，否则列表行会从它背后透出来。
  zIndex: 1,
  background: TOKEN.bg,
  paddingTop: 12,
  marginTop: -12,
  paddingBottom: 8,
  marginBottom: -8
};
var LIST_LAYOUT = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 230px), 1fr))",
  alignItems: "start",
  gap: 12
};
var LIST_ENTRY = {
  ...rowText,
  width: "100%",
  padding: "8px",
  border: 0,
  borderRadius: 6,
  textAlign: "left",
  font: "inherit",
  cursor: "pointer"
};
var LIST_DETAIL = { display: "flex", flexDirection: "column", minWidth: 0, gap: 8 };
var DETAIL_BODY = {
  ...compareBody,
  margin: 0,
  minHeight: "min(180px, 30dvh)",
  maxHeight: "min(420px, 48dvh)",
  padding: 12,
  fontFamily: "inherit",
  fontSize: 13,
  lineHeight: 1.65
};
function PromptList({ t, onCreate, onEdit, onSkill, panelWidth }) {
  const [hasRoom, setHasRoom] = React13.useState(false);
  React13.useEffect(() => {
    const media = window.matchMedia("(min-width: 660px)");
    const update = () => setHasRoom(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const wide = hasRoom && panelWidth >= 620;
  const [selectedId, setSelectedId] = React13.useState();
  const [trial, setTrial] = React13.useState(false);
  const [query, setQuery] = React13.useState("");
  const [applied, setApplied] = React13.useState("");
  const [sort, setSort] = React13.useState("default");
  const [tag, setTag] = React13.useState("");
  const [tags, setTags] = React13.useState(null);
  const [tagsError, setTagsError] = React13.useState(null);
  const [notice, setNotice] = React13.useState(null);
  const [busyId, setBusyId] = React13.useState(null);
  const [deleteError, setDeleteError] = React13.useState(null);
  const [reloadSeq, setReloadSeq] = React13.useState(0);
  const aliveRef = React13.useRef(true);
  React13.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  React13.useEffect(() => {
    const id = window.setTimeout(() => setApplied(query), SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(id);
    };
  }, [query]);
  useDataChanged(() => setReloadSeq((n) => n + 1));
  const loadPrompts = React13.useCallback(
    () => api.listPrompts({ q: applied.trim() || void 0, tag: tag || void 0, sort }),
    [applied, tag, sort, reloadSeq]
  );
  const { items: prompts, error: loadError } = useAsyncList(
    loadPrompts,
    { label: "\u63D0\u793A\u8BCD\u5217\u8868\u52A0\u8F7D\u5931\u8D25", clearOnStart: true, clearErrorOnStart: true }
  );
  React13.useEffect(() => {
    let alive = true;
    api.listTags().then(
      (list) => {
        if (!alive) return;
        setTags(list);
        setTagsError(null);
      },
      (err) => {
        if (!alive) return;
        console.warn("[prompt-enhancer] \u6807\u7B7E\u52A0\u8F7D\u5931\u8D25", err);
        setTags(null);
        setTagsError(reasonOf(err));
      }
    );
    return () => {
      alive = false;
    };
  }, [reloadSeq]);
  const remove = (prompt) => {
    if (busyId !== null) return;
    setBusyId(prompt.id);
    setNotice(null);
    setDeleteError(null);
    deletePrompts({ ids: [prompt.id], irreversible: false, remove: () => api.deletePrompt(prompt.id) }).then(
      () => {
        if (!aliveRef.current) return;
        setBusyId(null);
        setNotice(t("manager.list.deleted"));
        notifyDataChanged();
      },
      (err) => {
        console.warn("[prompt-enhancer] \u5220\u9664\u63D0\u793A\u8BCD\u5931\u8D25", err);
        if (!aliveRef.current) return;
        setBusyId(null);
        setDeleteError({ id: prompt.id, detail: reasonOf(err) });
      }
    );
  };
  const selected = prompts?.find((prompt) => prompt.id === selectedId);
  return /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(import_jsx_runtime14.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { style: LIST_TOOLBAR, children: [
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
        "input",
        {
          type: "search",
          "aria-label": t("manager.list.search"),
          placeholder: t("manager.list.searchPlaceholder"),
          value: query,
          onChange: (ev) => setQuery(ev.target.value),
          style: { ...textInput, flex: "1 1 160px" }
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
        "select",
        {
          "aria-label": t("manager.list.sort"),
          value: sort,
          onChange: (ev) => setSort(ev.target.value),
          style: select,
          children: SORTS.map(({ value, label: label2 }) => /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("option", { value, children: t(label2) }, value))
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(
        "select",
        {
          "aria-label": t("manager.list.tagFilter"),
          value: tag,
          onChange: (ev) => setTag(ev.target.value),
          style: select,
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("option", { value: "", children: t("manager.list.allTags") }),
            (tags ?? []).map((item) => /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("option", { value: item.name, children: [
              item.name,
              " (",
              item.count,
              ")"
            ] }, item.name))
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("button", { type: "button", style: primaryButton, onClick: onCreate, children: t("manager.list.new") })
    ] }),
    tagsError !== null && /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("span", { style: errorText, children: [
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { children: t("manager.list.tagsFailed") }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { style: errorDetail, title: tagsError, children: tagsError })
    ] }),
    notice !== null && /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { role: "status", "aria-live": "polite", style: muted, children: notice }),
    loadError !== null && /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("span", { role: "alert", style: errorText, children: [
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { children: t("error.load") }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { style: errorDetail, title: loadError, children: loadError })
    ] }),
    loadError === null && prompts === null && /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { style: muted, children: t("list.loading") }),
    loadError === null && prompts !== null && prompts.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { style: muted, children: t("list.empty") }),
    loadError === null && prompts !== null && prompts.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { style: wide ? LIST_LAYOUT : void 0, children: [
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { role: "list", hidden: !wide && selected !== void 0, children: prompts.map((prompt) => /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { role: "listitem", children: /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(
        "button",
        {
          type: "button",
          style: { ...LIST_ENTRY, background: prompt.id === selectedId ? TOKEN.hover : "transparent" },
          "aria-pressed": prompt.id === selectedId,
          onClick: () => {
            setTrial(false);
            setSelectedId(prompt.id);
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { style: rowTitle, children: prompt.title }),
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { style: muted, children: promptSummary(prompt) }),
            /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("span", { style: rowMeta, children: [
              (prompt.tags ?? []).map((item) => /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { style: tagChip, children: item }, item)),
              /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("span", { style: muted, children: [
                t("manager.list.usage"),
                " ",
                prompt.usageCount
              ] })
            ] })
          ]
        }
      ) }, prompt.id)) }),
      selected && /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("section", { style: LIST_DETAIL, "aria-label": selected.title, children: [
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { style: toolbar, children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("button", { type: "button", style: button, onClick: () => {
            setSelectedId(void 0);
            setTrial(false);
          }, children: t("manager.edit.back") }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("strong", { style: { ...dialogTitle, minWidth: 0 }, children: selected.title })
        ] }),
        trial ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(TemplateVariablesDialog, { t, body: selected.body, variables: selected.variables, onCancel: () => setTrial(false) }, selected.id) : /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(import_jsx_runtime14.Fragment, { children: [
          selected.summary && /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { style: muted, children: selected.summary }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("pre", { style: DETAIL_BODY, tabIndex: 0, children: selected.body }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(SkillBadge, { t, prompt: selected }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { style: toolbar, children: [
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("button", { type: "button", style: primaryButton, onClick: () => onEdit(selected), children: t("manager.list.edit") }),
            needsValues(selected.body) && /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("button", { type: "button", style: button, onClick: () => setTrial(true), children: t("ai.tryTemplate") }),
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("button", { type: "button", style: button, onClick: () => onSkill(selected), children: t("manager.skill.open") }),
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
              "button",
              {
                type: "button",
                style: button,
                "aria-busy": busyId === selected.id,
                disabled: busyId !== null,
                onClick: () => remove(selected),
                children: t("manager.list.delete")
              }
            )
          ] })
        ] }),
        deleteError?.id === selected.id && /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("span", { role: "alert", style: errorText, children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { children: t("error.delete") }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { style: errorDetail, children: deleteError.detail })
        ] })
      ] })
    ] })
  ] });
}
function PromptDetail({ t, target, onBack }) {
  const initial = target.kind === "edit" ? target.prompt : null;
  const prefill = target.kind === "create" ? target.prefill : null;
  const [title, setTitle] = React13.useState(initial ? initial.title : prefill?.title ?? "");
  const [body, setBody] = React13.useState(initial ? initial.body : prefill?.body ?? "");
  const [tagsText, setTagsText] = React13.useState(initial ? (initial.tags ?? []).join(", ") : "");
  const [summary, setSummary] = React13.useState(initial ? initial.summary ?? "" : "");
  const [variables, setVariables] = React13.useState(() => initial?.variables ?? []);
  const variableNames = parseVariables(body);
  const [current2, setCurrent] = React13.useState(initial);
  const [busy, setBusy] = React13.useState("idle");
  const [failure, setFailure] = React13.useState(null);
  const [notice, setNotice] = React13.useState(null);
  const aliveRef = React13.useRef(true);
  React13.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  const [storedDirection, setStoredDirection] = React13.useState(
    initial === null ? void 0 : null
  );
  const toggleSeqRef = React13.useRef(0);
  React13.useEffect(() => {
    const id = initial === null ? null : initial.id;
    if (id === null) return;
    let alive = true;
    const seqAtStart = toggleSeqRef.current;
    void loadStoredDirection(id, api.getMeta).then((raw) => {
      if (!alive) return;
      if (!shouldAcceptLateRead(toggleSeqRef.current !== seqAtStart)) return;
      setStoredDirection(raw);
    });
    return () => {
      alive = false;
    };
  }, [initial === null ? null : initial.id]);
  const blankBody = body.trim() === "";
  const fields = { title, body, tagsText, summary, variables };
  const patch = current2 ? changedPromptFields(current2, fields) : {};
  const hasChanges = Object.keys(patch).length > 0;
  const pending = busy !== "idle";
  const save = () => {
    if (pending || blankBody || current2 !== null && !hasChanges) return;
    const editing = current2;
    setBusy("saving");
    setFailure(null);
    setNotice(null);
    const acceptSaved = (saved) => {
      setCurrent(saved);
      setTitle((value) => value === title ? saved.title : value);
      setBody((value) => value === body ? saved.body : value);
      setTagsText((value) => value === tagsText ? saved.tags.join(", ") : value);
      setSummary((value) => value === summary ? saved.summary ?? "" : value);
      setVariables((value) => value === variables ? saved.variables ?? [] : value);
    };
    void (async () => {
      try {
        if (editing === null) {
          const outcome = await createFromCapture(promptFormInput(fields));
          if (!aliveRef.current) return;
          if (!outcome.ok) return;
          acceptSaved(outcome.prompt);
          setNotice(outcome.evicted.length > 0 ? t("manager.list.evicted") : t("manager.edit.saved"));
        } else {
          const updated = await api.updatePrompt(editing.id, { ...patch, contentVersion: editing.contentVersion });
          if (!aliveRef.current) return;
          acceptSaved(updated);
          setNotice(t("manager.edit.saved"));
          notifyDataChanged();
        }
      } catch (err) {
        console.warn("[prompt-enhancer] \u63D0\u793A\u8BCD\u4FDD\u5B58\u5931\u8D25", err);
        if (!aliveRef.current) return;
        setFailure({ key: editing === null ? "error.create" : "error.save", detail: reasonOf(err) });
      } finally {
        if (aliveRef.current) setBusy("idle");
      }
    })();
  };
  const toggle = () => {
    if (pending || hasChanges || current2 === null) return;
    const id = current2.id;
    setBusy("toggling");
    setFailure(null);
    setNotice(null);
    void (async () => {
      try {
        const swapped = await api.rollbackPrompt(id, current2.contentVersion);
        const applied = applyToggleDirection(id, current2, reading);
        toggleSeqRef.current += 1;
        void applied.done;
        if (!aliveRef.current) return;
        setCurrent(swapped);
        setBody((value) => value === body ? swapped.body : value);
        if (applied.write === "persist") setStoredDirection(applied.next);
        else if (applied.write === "clear") setStoredDirection(void 0);
        notifyDataChanged();
      } catch (err) {
        console.warn("[prompt-enhancer] \u4E24\u4EFD\u6B63\u6587\u4E92\u6362\u5931\u8D25", err);
        if (!aliveRef.current) return;
        const notFound = err instanceof ApiError && err.status === 404;
        setFailure({
          key: notFound ? "error.noPrompt" : "error.rollbackNoSource",
          detail: reasonOf(err)
        });
      } finally {
        if (aliveRef.current) setBusy("idle");
      }
    })();
  };
  const reading = React13.useMemo(
    () => current2 === null || storedDirection === null ? UNKNOWN_READING : readRefinedDirection(current2, storedDirection),
    [current2, storedDirection]
  );
  const direction = reading.direction;
  const labels = compareLabelKeys(direction);
  const currentBodyShown = current2 === null ? "" : current2.body;
  const counterpartBody = current2 === null ? "" : current2.sourceBody ?? "";
  const saveDisabled = blankBody || pending || current2 !== null && !hasChanges;
  return /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(import_jsx_runtime14.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { style: dialogTitle, children: t(target.kind === "create" ? "manager.edit.newTitle" : "manager.edit.editTitle") }),
    /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("label", { style: EDITOR_FIELD, children: [
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { style: EDITOR_LABEL, children: t("manager.edit.title") }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("input", { type: "text", value: title, onChange: (ev) => setTitle(ev.target.value), style: EDITOR_INPUT })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("label", { style: EDITOR_BODY_FIELD, children: [
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { style: EDITOR_LABEL, children: t("manager.edit.body") }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("textarea", { value: body, onChange: (ev) => setBody(ev.target.value), style: EDITOR_BODY })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { style: EDITOR_METADATA, children: [
      /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("label", { style: EDITOR_FIELD, children: [
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { style: EDITOR_LABEL, children: t("manager.edit.tags") }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
          "input",
          {
            type: "text",
            placeholder: t("manager.edit.tagsPlaceholder"),
            value: tagsText,
            onChange: (ev) => setTagsText(ev.target.value),
            style: EDITOR_INPUT
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("label", { style: EDITOR_FIELD, children: [
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { style: EDITOR_LABEL, children: t("manager.edit.summary") }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("input", { type: "text", value: summary, onChange: (ev) => setSummary(ev.target.value), style: EDITOR_INPUT })
      ] })
    ] }),
    variableNames.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("details", { style: VARIABLES_DETAILS, children: [
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("summary", { children: t("vars.settings") }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
        TemplateVariableFields,
        {
          names: variableNames,
          variables,
          t,
          onChange: (name, field, value) => setVariables((previous) => updateTemplateVariable(previous, name, field, value))
        }
      )
    ] }),
    blankBody && /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { style: muted, children: t("manager.edit.bodyRequired") }),
    notice !== null && /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { role: "status", "aria-live": "polite", style: muted, children: notice }),
    failure !== null && /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("span", { role: "alert", style: errorText, children: [
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { children: t(failure.key) }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { style: errorDetail, title: failure.detail, children: failure.detail })
    ] }),
    current2 !== null && /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
      SkillBadge,
      {
        t,
        prompt: current2,
        onReExported: (receipt) => {
          if (!receipt.prompt) {
            console.warn("[prompt-enhancer] \u91CD\u5BFC\u56DE\u6267\u7F3A\u5C11 prompt\uFF08\u5951\u7EA6\u6F02\u79FB\uFF09\uFF0C\u8BE6\u60C5\u9875\u65E0\u6CD5\u5C31\u5730\u5237\u65B0\u6280\u80FD\u72B6\u6001", receipt);
            return;
          }
          const savedSkill = receipt.prompt;
          setCurrent((previous) => previous && {
            ...previous,
            skillName: savedSkill.skillName,
            skillExportedAt: savedSkill.skillExportedAt
          });
        }
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { style: actions, children: [
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("button", { type: "button", style: button, onClick: onBack, children: t("manager.edit.back") }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
        "button",
        {
          type: "button",
          style: { ...primaryButton, opacity: saveDisabled ? 0.6 : 1, cursor: saveDisabled ? "default" : "pointer" },
          "aria-busy": busy === "saving",
          disabled: saveDisabled,
          onClick: save,
          children: busy === "saving" ? t("manager.edit.saving") : t("manager.edit.save")
        }
      )
    ] }),
    current2 !== null && canToggle(current2) && /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(import_jsx_runtime14.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { style: dialogTitle, children: t("manager.compare.title") }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { style: compareGrid, children: [
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("span", { style: compareBlock, children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { style: compareHead, children: t(labels.current) }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { style: compareBody, children: currentBodyShown })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("span", { style: compareBlock, children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { style: compareHead, children: t(labels.counterpart) }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { style: compareBody, children: counterpartBody })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { style: muted, children: t(labels.neutral ? "manager.compare.unknownDirection" : "manager.compare.directionPersisted") }),
      hasChanges && /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { role: "status", style: muted, children: t("manager.compare.saveBeforeToggle") }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { style: actions, children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
        "button",
        {
          type: "button",
          style: { ...primaryButton, opacity: pending || hasChanges ? 0.6 : 1 },
          "aria-busy": busy === "toggling",
          disabled: pending || hasChanges,
          onClick: toggle,
          children: busy === "toggling" ? t("manager.compare.toggling") : t("manager.compare.toggle")
        }
      ) })
    ] })
  ] });
}
var EDITOR_FIELD = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  minWidth: 0
};
var EDITOR_LABEL = { color: TOKEN.muted, fontSize: 12 };
var EDITOR_INPUT = { ...textInput, fontSize: 13, padding: "7px 9px" };
var EDITOR_BODY_FIELD = { ...EDITOR_FIELD, flex: "1 0 auto" };
var EDITOR_BODY = {
  ...textArea,
  flex: "1 0 auto",
  minHeight: "clamp(160px, 38dvh, 320px)",
  fontSize: 14,
  lineHeight: 1.65,
  padding: 12
};
var EDITOR_METADATA = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
  gap: 8
};
var VARIABLES_DETAILS = { padding: "6px 0", flex: "0 0 auto" };

// src/client/components/PromptSurfaceHost.tsx
var import_jsx_runtime15 = require("react/jsx-runtime");
var DICT_KEYS = new Set(Object.keys(zh));
function label(t, text) {
  return DICT_KEYS.has(text) ? t(text) : text;
}
function ConfirmDialog({
  request,
  t
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
    "div",
    {
      "data-prompt-enhancer-confirm": "",
      style: CONFIRM_LAYER,
      onPointerDownCapture: (ev) => {
        if (ev.target === ev.currentTarget) resolveConfirm(false);
      },
      children: /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { role: "dialog", "aria-modal": "true", "aria-label": label(t, request.title), style: CONFIRM_SURFACE, children: [
        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { style: dialogTitle, children: label(t, request.title) }),
        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { style: muted, children: label(t, request.message) }),
        request.detail.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("ul", { style: CONFIRM_LIST, children: request.detail.map((line, index) => /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("li", { children: line }, index)) }),
        /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { style: actions, children: [
          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("button", { type: "button", style: button, onClick: () => resolveConfirm(false), children: label(t, request.cancelLabel) }),
          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("button", { type: "button", style: primaryButton, onClick: () => resolveConfirm(true), children: label(t, request.confirmLabel) })
        ] })
      ] })
    }
  );
}
function PromptSurfaceHost({ t }) {
  const { open, panel } = useManagerState();
  const confirmRequest = useConfirmRequest();
  const claimed = useOverlayClaim();
  const [panelValue, setPanelValue] = React14.useState(null);
  React14.useEffect(() => {
    if (!open) setPanelValue(null);
  }, [open]);
  if (!open && confirmRequest === null) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(
    "div",
    {
      "data-prompt-enhancer-claim": claimed,
      style: backdrop,
      onPointerDownCapture: (ev) => {
        if (ev.target === ev.currentTarget) closeManager();
      },
      children: [
        open && /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(PromptManagerModal, { t, panel, panelValue, onPanelValue: setPanelValue }),
        confirmRequest !== null && /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(ConfirmDialog, { request: confirmRequest, t })
      ]
    }
  );
}
var CONFIRM_LAYER = {
  position: "fixed",
  inset: 0,
  zIndex: 120,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  background: "rgba(0, 0, 0, 0.35)"
};
var CONFIRM_SURFACE = {
  ...overlayBase,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  width: 360,
  maxWidth: "calc(100vw - 40px)",
  maxHeight: "calc(100vh - 40px)",
  overflow: "hidden",
  padding: 12,
  fontSize: 12
};
var CONFIRM_LIST = {
  margin: 0,
  paddingLeft: 18,
  maxHeight: 180,
  overflowY: "auto",
  color: TOKEN.muted,
  fontSize: 11,
  overflowWrap: "anywhere"
};

// src/client/components/settings/SettingsSection.tsx
var React15 = __toESM(require("react"), 1);

// src/client/utils/settings-options.ts
function providerOptions(list, current2, auto) {
  const options = [{ value: "", label: auto }];
  for (const item of list) options.push({ value: item.provider, label: item.name });
  if (list.length > 0 && current2 !== "" && !list.some((item) => item.provider === current2)) {
    options.push({ value: current2, label: current2 });
  }
  return options;
}
function modelOptions(list, provider, current2, auto) {
  const models = list.find((item) => item.provider === provider)?.models ?? [];
  const options = [{ value: "", label: auto }];
  for (const item of models) options.push({ value: item.id, label: item.name });
  if (models.length > 0 && current2 !== "" && !models.some((item) => item.id === current2)) {
    options.push({ value: current2, label: current2 });
  }
  return options;
}
function commitNumberDraft(draft, bounds) {
  if (draft.trim() === "") return void 0;
  const parsed = Number(draft);
  if (!Number.isInteger(parsed) || parsed < bounds.min || parsed > bounds.max) return void 0;
  return parsed;
}

// src/client/components/settings/SettingsSection.tsx
var import_jsx_runtime16 = require("react/jsx-runtime");
function useWrite(t) {
  const [pending, setPending] = React15.useState(false);
  const [failure, setFailure] = React15.useState(null);
  const run = (patches, field) => {
    if (patches.length === 0) return;
    setPending(true);
    setFailure(null);
    (async () => {
      for (const patch of patches) await updateSettings(patch);
    })().then(
      () => {
        setPending(false);
      },
      (err) => {
        setPending(false);
        setFailure({
          message: t("settings.saveFailed"),
          detail: reasonOf(err)
        });
        console.warn("[prompt-enhancer] \u4FDD\u5B58\u8BBE\u7F6E\u5931\u8D25\uFF08" + field + "\uFF09", err);
      }
    );
  };
  return {
    pending,
    failure,
    write: (patch, field) => {
      run([patch], field);
    },
    writeSequence: (patches, field) => {
      run(patches, field);
    }
  };
}
var SECTION = { display: "flex", flexDirection: "column", padding: "0 0 8px", fontSize: 12 };
var SECTION_TITLE = { color: TOKEN.fg, fontSize: 12, fontWeight: 600, margin: "0 0 4px" };
var ROW3 = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
  padding: "6px 0"
};
var ROW_LABEL = { color: TOKEN.fg, fontSize: 12, flex: "1 1 135px" };
var ROW_CONTROL = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 6,
  justifyContent: "flex-end",
  flex: "0 1 auto",
  minWidth: 0
};
var ERROR_SLOT = { flex: "1 1 100%" };
var NUMBER = { ...textInput, width: 72 };
var SEPARATOR = { color: TOKEN.muted };
function Row({ label: label2, children }) {
  return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { style: ROW3, children: [
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { style: ROW_LABEL, children: label2 }),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { style: ROW_CONTROL, children })
  ] });
}
function WriteError({ failure }) {
  if (failure === null) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { style: ERROR_SLOT, children: /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("span", { role: "alert", style: errorText, children: [
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: failure.message }),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { style: errorDetail, title: failure.detail, children: failure.detail })
  ] }) });
}
function BoolRow({ t, field, label: label2, checked, patch }) {
  const { pending, failure, write } = useWrite(t);
  return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)(Row, { label: label2, children: [
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
      "input",
      {
        type: "checkbox",
        "aria-label": label2,
        "aria-busy": pending,
        checked,
        disabled: pending,
        onChange: (ev) => {
          write(patch(ev.target.checked), field);
        }
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(WriteError, { failure })
  ] });
}
function NumberInput({ t, field, label: label2, value, bounds, patch }) {
  const { pending, failure, write } = useWrite(t);
  const [draft, setDraft] = React15.useState(null);
  const [invalid, setInvalid] = React15.useState(false);
  const commit = () => {
    if (draft === null) return;
    const parsed = commitNumberDraft(draft, bounds);
    if (parsed === void 0) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setDraft(null);
    if (parsed === value) return;
    write(patch(parsed), field);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)(import_jsx_runtime16.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
      "input",
      {
        type: "number",
        style: NUMBER,
        "aria-label": label2,
        "aria-busy": pending,
        min: bounds.min,
        max: bounds.max,
        step: 1,
        value: draft ?? String(value),
        disabled: pending,
        onChange: (ev) => {
          setDraft(ev.target.value);
        },
        onBlur: commit
      }
    ),
    invalid && /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { style: ERROR_SLOT, children: /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { role: "alert", style: errorText, children: /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: t("settings.numberInvalid") + bounds.min + "\u2013" + bounds.max }) }) }),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(WriteError, { failure })
  ] });
}
function AiModelRow({ t, provider, model }) {
  const { pending, failure, write, writeSequence } = useWrite(t);
  const [list, setList] = React15.useState(null);
  const [probeError, setProbeError] = React15.useState(null);
  React15.useEffect(() => {
    let alive = true;
    api.listAiProviders().then(
      (value) => {
        if (alive) setList(value);
      },
      (err) => {
        console.warn("[prompt-enhancer] AI \u53EF\u9009\u6A21\u578B\u63A2\u6D4B\u5931\u8D25\uFF0C\u8BBE\u7F6E\u9875\u7684 AI \u6A21\u578B\u884C\u53EA\u4FDD\u7559\u300C\u81EA\u52A8\u53D1\u73B0\u300D", err);
        if (!alive) return;
        setList([]);
        setProbeError(reasonOf(err));
      }
    );
    return () => {
      alive = false;
    };
  }, []);
  const known = list ?? [];
  const options = providerOptions(known, provider, t("settings.ai.auto"));
  const models = modelOptions(known, provider, model, t("settings.ai.auto"));
  const storedVisible = list !== null && known.length === 0 && (provider !== "" || model !== "");
  const changeProvider = (next) => {
    const owned = known.find((item) => item.provider === next)?.models.some((m) => m.id === model) === true;
    const nextModel = owned ? model : "";
    const patches = nextModel === model ? [{ aiProvider: next }] : [{ aiModel: nextModel }, { aiProvider: next }];
    writeSequence(patches, "aiProvider");
  };
  return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)(Row, { label: t("settings.ai.optimizationModel"), children: [
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
      "select",
      {
        "aria-label": t("settings.ai.provider"),
        "aria-busy": pending,
        style: select,
        value: provider,
        disabled: pending,
        onChange: (ev) => {
          changeProvider(ev.target.value);
        },
        children: options.map((option) => /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("option", { value: option.value, children: option.label }, option.value))
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
      "select",
      {
        "aria-label": t("settings.ai.model"),
        "aria-busy": pending,
        style: select,
        value: model,
        disabled: pending || provider === "",
        onChange: (ev) => {
          write({ aiModel: ev.target.value }, "aiModel");
        },
        children: models.map((option) => /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("option", { value: option.value, children: option.label }, option.value))
      }
    ),
    list === null && /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { style: muted, children: t("settings.ai.loading") }),
    probeError !== null && /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("span", { role: "alert", style: errorText, children: [
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: t("settings.ai.probeFailed") }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { style: errorDetail, title: probeError, children: probeError })
    ] }),
    probeError === null && list !== null && list.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { style: muted, children: t("settings.ai.noModels") }),
    storedVisible && /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { style: muted, children: t("settings.ai.stored") + provider + " / " + (model === "" ? t("settings.ai.auto") : model) }),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(WriteError, { failure })
  ] });
}
function AppearanceRow({ t, settings, visibleKey, iconKey, label: label2 }) {
  const { pending, failure, writeSequence } = useWrite(t);
  const value = settings[visibleKey] ? settings[iconKey] ? "icon" : "label" : "off";
  return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)(Row, { label: label2, children: [
    /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)(
      "select",
      {
        "aria-label": label2,
        style: select,
        value,
        disabled: pending,
        "aria-busy": pending,
        onChange: (event) => {
          const next = event.currentTarget.value;
          const patches = [];
          if (next !== "off" && settings[iconKey] !== (next === "icon")) {
            patches.push({ [iconKey]: next === "icon" });
          }
          if (settings[visibleKey] !== (next !== "off")) patches.push({ [visibleKey]: next !== "off" });
          writeSequence(patches, visibleKey);
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("option", { value: "label", children: t("settings.appearanceLabel") }),
          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("option", { value: "icon", children: t("settings.appearanceIcon") }),
          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("option", { value: "off", children: t("settings.appearanceHidden") })
        ]
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(WriteError, { failure })
  ] });
}
var GROUP = { marginTop: 12 };
var GROUP_TITLE = {
  fontSize: 12,
  fontWeight: 600,
  paddingBottom: 5,
  margin: 0,
  borderBottom: `1px solid ${TOKEN.border}`
};
var SHORTCUT_LABELS = {
  hashTriggerEnabled: "settings.hashTriggerEnabled",
  contextRecommendEnabled: "settings.contextRecommendEnabled",
  selectionAddEnabled: "settings.selectionAddEnabled",
  showSidebarButton: "settings.showSidebarButton"
};
function SettingsSection({ t }) {
  const settings = useSettings();
  const shortcuts = Object.keys(SHORTCUT_LABELS);
  return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { style: SECTION, children: [
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("h2", { style: SECTION_TITLE, children: t("settings.title") }),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("section", { style: GROUP, children: [
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("h3", { style: GROUP_TITLE, children: t("settings.ai.title") }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(AiModelRow, { t, provider: settings.aiProvider, model: settings.aiModel })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("section", { style: GROUP, children: [
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("h3", { style: GROUP_TITLE, children: t("settings.shortcuts") }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(AppearanceRow, { t, settings, visibleKey: "showComposerButton", iconKey: "composerButtonIconOnly", label: t("settings.showComposerButton") }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(AppearanceRow, { t, settings, visibleKey: "showAIPolishButton", iconKey: "aiPolishButtonIconOnly", label: t("settings.showAIPolishButton") }),
      shortcuts.map((key) => /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
        BoolRow,
        {
          t,
          field: key,
          label: t(SHORTCUT_LABELS[key]),
          checked: settings[key],
          patch: (next) => ({ [key]: next })
        },
        key
      ))
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("section", { style: GROUP, children: [
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("h3", { style: GROUP_TITLE, children: t("settings.storage") }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(Row, { label: t("settings.maxPromptCount"), children: /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
        NumberInput,
        {
          t,
          field: "maxPromptCount",
          label: t("settings.maxPromptCount"),
          value: settings.maxPromptCount,
          bounds: MAX_PROMPT_COUNT_BOUNDS,
          patch: (next) => ({ maxPromptCount: next })
        }
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("details", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("summary", { style: { cursor: "pointer" }, children: t("settings.advanced") }),
        /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)(Row, { label: t("settings.panelSize"), children: [
          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
            NumberInput,
            {
              t,
              field: "panelWidth",
              label: t("settings.panelWidth"),
              value: settings.panelWidth,
              bounds: PANEL_SIZE_BOUNDS,
              patch: (next) => ({ panelWidth: next })
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { "aria-hidden": "true", style: SEPARATOR, children: "\xD7" }),
          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
            NumberInput,
            {
              t,
              field: "panelHeight",
              label: t("settings.panelHeight"),
              value: settings.panelHeight,
              bounds: PANEL_SIZE_BOUNDS,
              patch: (next) => ({ panelHeight: next })
            }
          )
        ] })
      ] })
    ] })
  ] });
}

// src/client/components/SidebarPromptEntry.tsx
var React16 = __toESM(require("react"), 1);
var import_jsx_runtime17 = require("react/jsx-runtime");
function entryStyle(wide) {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: wide ? "flex-start" : "center",
    gap: 4,
    height: wide ? 42 : 28,
    width: wide ? void 0 : 28,
    alignSelf: wide ? "stretch" : void 0,
    marginInline: wide ? -2 : void 0,
    padding: wide ? "0 10px 0 8px" : 0,
    flex: "0 0 auto",
    minWidth: wide ? 0 : void 0,
    overflow: wide ? "hidden" : void 0,
    // 字号不写死：宿主侧栏 .root 是 14px、宿主两行（panelRow）用 `font: inherit` 继承它——
    // 这里写死 12px 曾比 Context Insights / Settings 明显小一号（反馈 2026-09-25）。同款继承。
    // `font` 简写会连带重置 line-height，故必须在它**之后**再显式给 `lineHeight`（React 按对象序应用）。
    font: "inherit",
    lineHeight: wide ? "22px" : void 0,
    color: TOKEN.fg,
    background: "transparent",
    border: wide ? "none" : `1px solid ${TOKEN.border}`,
    borderRadius: 6,
    cursor: "pointer"
  };
}
function SidebarPromptEntry({ t, wide }) {
  const settings = useSettings();
  const [hovered, setHovered] = React16.useState(false);
  if (!settings.showSidebarButton) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)(
    "button",
    {
      type: "button",
      style: { ...entryStyle(wide), ...hovered ? { background: TOKEN.hover } : null },
      title: t("sidebar.entry.tip"),
      "aria-label": t("sidebar.entry.title"),
      "aria-haspopup": "dialog",
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
      onClick: () => openManager(),
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(BookIcon, {}),
        wide && /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { children: t("sidebar.entry.title") })
      ]
    }
  );
}
function BookIcon() {
  return /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true", style: ICON3, children: [
    /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(
      "path",
      {
        d: "M4 5.5C4 4.7 4.7 4 5.5 4H11v15H5.5C4.7 19 4 18.3 4 17.5v-12Z",
        stroke: "currentColor",
        strokeWidth: "1.7",
        strokeLinejoin: "round"
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(
      "path",
      {
        d: "M20 5.5C20 4.7 19.3 4 18.5 4H13v15h5.5c.8 0 1.5-.7 1.5-1.5v-12Z",
        stroke: "currentColor",
        strokeWidth: "1.7",
        strokeLinejoin: "round"
      }
    )
  ] });
}
var ICON3 = { display: "block", flex: "0 0 auto" };

// src/client/index.ts
var inject = ["slots", "locale"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "prompt-enhancer: dictionaries");
  const t = ctx.locale.bind(NS);
  ctx.inject(["slots"], (scope2) => {
    scope2.slots.inject(
      "conversation.input.left",
      () => scope2.slots.register(
        { name: "conversation.input.left", id: "prompt-enhancer", order: 10, locale: NS },
        PromptLibraryButton
      )
    );
    scope2.slots.inject(
      "conversation.input.overlay",
      () => scope2.slots.register(
        { name: "conversation.input.overlay", id: "prompt-enhancer-hash", order: 20, locale: NS },
        HashSuggestOverlay
      )
    );
    scope2.slots.inject(
      "conversation.input.left",
      () => scope2.slots.register(
        { name: "conversation.input.left", id: "prompt-enhancer-ai-polish", order: 11, locale: NS },
        AIPolishButton
      )
    );
    scope2.slots.inject(
      "shell.overlay",
      () => scope2.slots.register(
        { name: "shell.overlay", id: "prompt-enhancer", order: 100, locale: NS },
        PromptSurfaceHost
      )
    );
    scope2.slots.inject(
      "sidebar.footer.action",
      () => scope2.slots.register(
        { name: "sidebar.footer.action", id: "prompt-enhancer", order: 100, locale: NS },
        SidebarPromptEntry
      )
    );
    scope2.slots.inject(
      "conversation.input.dock",
      () => scope2.slots.register(
        { name: "conversation.input.dock", id: "prompt-enhancer-recommend", order: 10, locale: NS },
        ContextRecommendations
      )
    );
    scope2.slots.inject(
      "settings.section",
      () => scope2.slots.register(
        { name: "settings.section", id: "prompt-enhancer", order: 30, label: () => t("settings.nav"), locale: NS },
        SettingsSection
      )
    );
  });
  ctx.inject(["uiWorkspace"], (scope2) => {
    setDirectoryCapability(scope2.uiWorkspace ?? null);
    return () => setDirectoryCapability(null);
  });
  ctx.inject(["uiConversation"], (scope2) => {
    setUiConversation(scope2.uiConversation ?? null);
    return () => setUiConversation(null);
  });
  ctx.effect(() => {
    if (false) console.log("[prompt-enhancer] client loaded v0.1.0");
    return () => {
      if (false) console.log("[prompt-enhancer] client unloaded");
    };
  }, "prompt-enhancer: lifecycle");
  ctx.inject(["configForms"], (scope2) => {
    const forms = scope2.configForms;
    if (forms) return bindSettingsForms(forms);
    setSettingsScope(null);
    return () => setSettingsScope(null);
  });
}
    module.exports = { apply, inject };
    return module.exports;
  }
});

//# sourceMappingURL=client.js.map
