import * as React from "react";
import type { TranslateNS } from "@deepseek-ai/dsh-client-ui-slots";
import type { PromptDraftSearchResult, PromptDraftSource } from "../../types.ts";
import { DRAFT_FEEDBACK_MAX_LENGTH } from "../../types.ts";
import { actions, button, muted, primaryButton, textArea, textInput } from "../utils/dialog-style.ts";
import { canFillDraftExample, draftCheckIsStale, prepareDraftGeneration, prepareDraftHandoff, type DraftEdit, type DraftGeneration, type DraftSession } from "../utils/draft-session.ts";
import type { PromptEnhancerKey } from "../utils/i18n.ts";
import { TOKEN } from "../utils/theme.ts";

interface Props {
  t: TranslateNS<"prompt-enhancer">;
  session: DraftSession;
  busy: boolean;
  error: PromptEnhancerKey | null;
  update: (edit: DraftEdit) => void;
  generate: (action: DraftGeneration) => void;
  onSearch: (query: string) => void;
  onBack: () => void;
  onApply: () => void;
  onCheck: () => void;
  onViewCheck: () => void;
  onEnhance: () => void;
  onCopy: () => void;
  copyLabel: PromptEnhancerKey;
}

export function PromptDraftForm({
  t, session, busy, error, update, generate, onSearch, onBack, onApply, onCheck, onViewCheck, onEnhance, onCopy, copyLabel,
}: Props): React.ReactElement {
  const { questions, answers, body, understanding, assumptions, missingInputs = [], step } = session;
  const { query = "", search, executor = "", references = "", toVerify = [], generatedFrom, feedback } = session;
  const [initialFeedbackOpen] = React.useState(() => !!feedback.trim());
  const id = React.useId();
  const draftSources = generatedFrom?.sources ?? [];
  const sources = search?.status === "found" ? search.sources : [];
  const searchNotice = search && SEARCH_NOTICES[search.status];
  const canGenerate = prepareDraftGeneration(session, "generate") !== undefined;
  const canHandoff = !busy && prepareDraftHandoff(session) !== undefined;

  return (
    <>
      <div style={CONTENT}>
        {error && <span role="alert">{t(error)}</span>}
        {step === "idea" && (
          <>
            <DraftIdeaInput t={t} session={session} busy={busy} update={update} />
            <details style={ASSUMPTIONS}>
              <summary>{t("ai.draft.executor")}</summary>
              <div style={RESEARCH_FIELDS}>
                <DraftFieldHeading id={`${id}-executor`} label={t("ai.draft.executorField")}
                  helpTitle={t("ai.draft.executorHelpTitle")} help={t("ai.draft.executorHelp")} />
                <textarea id={`${id}-executor`} placeholder={t("ai.draft.executorExample")}
                  value={executor} maxLength={1000} rows={2} style={textArea} readOnly={busy}
                  onChange={(event) => update({ type: "field", field: "executor", value: event.currentTarget.value })} />
              </div>
            </details>
          </>
        )}
        {step === "questions" && questions.map(({ question, options }, index) => (
          <fieldset key={question} style={QUESTION} disabled={busy}>
            <legend style={LEGEND}>{question}</legend>
            {options.length > 0 && (
              <div style={OPTIONS}>
                {options.map((option) => (
                  <button key={option} type="button" style={answers[index] === option ? primaryButton : button}
                    aria-pressed={answers[index] === option} onClick={() => update({ type: "answer", index, value: option })}>
                    {option}
                  </button>
                ))}
              </div>
            )}
            <textarea aria-label={question} placeholder={t("ai.draft.answer")}
              value={answers[index] ?? ""} rows={2} style={textArea}
              onChange={(event) => update({ type: "answer", index, value: event.target.value })} />
          </fieldset>
        ))}
        {step !== "result" && (
          <details style={ASSUMPTIONS}>
            <summary>{t("ai.draft.research")}</summary>
            <div style={RESEARCH_FIELDS}>
              <DraftFieldHeading id={`${id}-references`} label={t("ai.draft.references")}
                helpTitle={t("ai.draft.referencesHelpTitle")} help={t("ai.draft.referencesHelp")} />
              <textarea id={`${id}-references`} value={references} maxLength={4000} rows={2} style={textArea} disabled={busy}
                onChange={(event) => update({ type: "field", field: "references", value: event.currentTarget.value })} />
              <DraftFieldHeading id={`${id}-query`} label={t("ai.draft.query")}
                helpTitle={t("ai.draft.queryHelpTitle")} help={t("ai.draft.queryHelp")} />
              <div style={OPTIONS}>
                <input id={`${id}-query`} type="text" aria-describedby={`${id}-query-hint`}
                  maxLength={240} value={query} disabled={busy} style={{ ...textInput, flex: "1 1 150px" }}
                  onChange={(event) => update({ type: "field", field: "query", value: event.currentTarget.value })} />
                <button type="button" style={button} disabled={busy || !query.trim()} onClick={() => onSearch(query)}>
                  {t("ai.draft.search")}
                </button>
              </div>
              <span id={`${id}-query-hint`} style={muted}>{t("ai.draft.queryHint")}</span>
              {searchNotice && <span role="status">{t(searchNotice)}</span>}
              {sources.length > 0 && <DraftSources t={t} sources={sources} />}
            </div>
          </details>
        )}
        {step === "result" && (
          <>
            {understanding && <div style={ASSUMPTIONS}>
              <strong>{t("ai.draft.understanding")}</strong>
              <div>{understanding}</div>
            </div>}
            <textarea aria-label={t("ai.draft.result")} value={body} style={EDITOR} readOnly={busy}
              onChange={(event) => update({ type: "field", field: "body", value: event.target.value })} />
            {generatedFrom && (
              <details open={initialFeedbackOpen} style={ASSUMPTIONS}>
                <summary>{t("ai.draft.revise")}</summary>
                <div style={RESEARCH_FIELDS}>
                  <textarea aria-label={t("ai.draft.feedback")} placeholder={t("ai.draft.feedbackExample")}
                    value={feedback} maxLength={DRAFT_FEEDBACK_MAX_LENGTH} rows={2} style={textArea} readOnly={busy}
                    onChange={(event) => update({ type: "field", field: "feedback", value: event.currentTarget.value })} />
                  <div style={OPTIONS}>
                    <button type="button" style={button} disabled={busy || !prepareDraftGeneration(session, "revise")}
                      onClick={() => generate("revise")}>
                      {t("ai.draft.revise")}
                    </button>
                  </div>
                </div>
              </details>
            )}
            {assumptions.length > 0 && (
              <details open style={ASSUMPTIONS}>
                <summary>{t("ai.draft.assumptions")}</summary>
                <ul style={ASSUMPTION_LIST}>{assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul>
              </details>
            )}
            {missingInputs.length > 0 && (
              <details open style={ASSUMPTIONS}>
                <summary>{t("ai.draft.missingInputs")}</summary>
                <ul style={ASSUMPTION_LIST}>{missingInputs.map((input) => <li key={input}>{input}</li>)}</ul>
              </details>
            )}
            {toVerify.length > 0 && (
              <details open style={ASSUMPTIONS}>
                <summary>{t("ai.draft.toVerify")}</summary>
                <ul style={ASSUMPTION_LIST}>{toVerify.map((step) => <li key={step}>{step}</li>)}</ul>
              </details>
            )}
            {draftSources.length > 0 && <DraftSources t={t} sources={draftSources} />}
            {draftCheckIsStale(session) && (
              <span role="status" style={muted}>{t("ai.draft.checkStale")}</span>
            )}
          </>
        )}
      </div>
      <footer style={FOOTER}>
        {step !== "result" && (
          <>
            {step === "idea"
              ? <button type="button" style={button} disabled={busy} onClick={onBack}>{t("ai.backToActions")}</button>
              : <button type="button" style={button} disabled={busy}
                  onClick={() => update({ type: "editIdea" })}>{t("ai.draft.editIdea")}</button>}
            {generatedFrom && <button type="button" style={button} disabled={busy}
              onClick={() => update({ type: "returnResult" })}>{t("ai.draft.backToResult")}</button>}
            {step === "questions" && <button type="button" style={canGenerate ? button : primaryButton} disabled={busy}
              onClick={() => generate("skip")}>{t("ai.draft.skip")}</button>}
            <button type="button" style={primaryButton} disabled={busy || !canGenerate}
              onClick={() => generate("generate")}>{t("ai.draft.generate")}</button>
          </>
        )}
        {step === "result" && (
          <>
            <button type="button" style={button} disabled={busy} onClick={() => update({ type: "editInputs" })}>
              {t(questions.length ? "ai.draft.editAnswers" : "ai.draft.editIdea")}
            </button>
            <button type="button" style={button} disabled={busy || !body.trim()} onClick={onCopy}>{t(copyLabel)}</button>
            {session.checked && <button type="button" style={button} disabled={busy}
              onClick={onViewCheck}>{t("ai.draft.viewCheck")}</button>}
            <button type="button" style={button} disabled={!canHandoff} onClick={onCheck}>{t("ai.check")}</button>
            <button type="button" style={button} disabled={!canHandoff} onClick={onEnhance}>{t("ai.refine")}</button>
            <button type="button" style={primaryButton} disabled={!canHandoff} onClick={onApply}>{t("ai.apply")}</button>
          </>
        )}
      </footer>
    </>
  );
}

function DraftIdeaInput({ t, session, busy, update }: Pick<Props, "t" | "session" | "busy" | "update">): React.ReactElement {
  const id = React.useId();
  const input = React.useRef<HTMLTextAreaElement>(null);
  const [examplesOpen, setExamplesOpen] = React.useState(false);
  const canFill = canFillDraftExample(session);
  React.useEffect(() => { input.current?.focus({ preventScroll: true }); }, []);

  return (
    <div style={FIELDS}>
      <div style={IDEA_HEADING}>
        <label htmlFor={id} style={LABEL}>{t("ai.draft.idea")}</label>
        <button type="button" style={button} aria-expanded={examplesOpen} aria-controls={`${id}-examples`}
          onClick={() => setExamplesOpen(!examplesOpen)}>
          {t(examplesOpen ? "ai.draft.hideExamples" : "ai.draft.examples")}
        </button>
      </div>
      <span id={`${id}-hint`} style={muted}>{t("ai.draft.ideaHint")}</span>
      <div id={`${id}-examples`} hidden={!examplesOpen}>
        {examplesOpen && <div style={FIELDS}>
          {EXAMPLES.map(({ titleKey, ideaKey, tipKey }) => {
            const title = t(titleKey);
            const value = t(ideaKey);
            return (
              <div key={titleKey} style={EXAMPLE}>
                <div style={IDEA_HEADING}>
                  <strong>{title}</strong>
                  {canFill && (
                    <button type="button" style={button} disabled={busy} aria-label={`${t("ai.draft.useExample")}: ${title}`}
                      onClick={() => {
                        update({ type: "fillExample", value });
                        setExamplesOpen(false);
                        input.current?.focus({ preventScroll: true });
                      }}>{t("ai.draft.useExample")}</button>
                  )}
                </div>
                <div>{value}</div>
                <span style={muted}>{t(tipKey)}</span>
              </div>
            );
          })}
          <span style={muted}>{t("ai.draft.reuseTip").replace("{action}", t("ai.refine"))}</span>
        </div>}
      </div>
      <textarea id={id} ref={input} aria-describedby={`${id}-hint`} value={session.idea} readOnly={busy} style={IDEA_EDITOR}
        onChange={(event) => update({ type: "field", field: "idea", value: event.currentTarget.value })} />
    </div>
  );
}

function DraftFieldHeading({ id, label, helpTitle, help }: {
  id: string;
  label: string;
  helpTitle: string;
  help: string;
}): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const helpId = `${id}-help`;
  return (
    <div style={FIELDS}>
      <div style={FIELD_HEADING}>
        <label htmlFor={id} style={LABEL}>{label}</label>
        <button type="button" style={HELP_BUTTON} aria-label={helpTitle} aria-expanded={open}
          aria-controls={helpId} onClick={() => setOpen(!open)}>
          <span aria-hidden="true">ⓘ</span>
        </button>
      </div>
      <div id={helpId} hidden={!open} style={HELP_BUBBLE}>{help}</div>
    </div>
  );
}

function DraftSources({ t, sources }: Pick<Props, "t"> & { sources: PromptDraftSource[] }): React.ReactElement {
  return (
    <details open style={ASSUMPTIONS}>
      <summary>{t("ai.draft.sources")}</summary>
      <ul style={ASSUMPTION_LIST}>
        {sources.map(({ url, title }) => (
          <li key={url}><a href={url} target="_blank" rel="noopener noreferrer" style={{ color: TOKEN.accent }}>{title || url}</a></li>
        ))}
      </ul>
    </details>
  );
}

const EXAMPLES = [
  { titleKey: "ai.draft.example.writing", ideaKey: "ai.draft.example.writing.idea", tipKey: "ai.draft.example.writing.tip" },
  { titleKey: "ai.draft.example.debugging", ideaKey: "ai.draft.example.debugging.idea", tipKey: "ai.draft.example.debugging.tip" },
  { titleKey: "ai.draft.example.research", ideaKey: "ai.draft.example.research.idea", tipKey: "ai.draft.example.research.tip" },
] as const;
const SEARCH_NOTICES: Partial<Record<PromptDraftSearchResult["status"], PromptEnhancerKey>> = {
  unavailable: "ai.draft.searchUnavailable",
  empty: "ai.draft.searchEmpty",
  failed: "ai.draft.searchFailed",
};
const CONTENT: React.CSSProperties = { display: "grid", alignContent: "start", gap: 10, flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: 2 };
const EDITOR: React.CSSProperties = { ...textArea, minHeight: "clamp(130px, 35dvh, 280px)", padding: 10, fontSize: 13 };
const IDEA_EDITOR: React.CSSProperties = { ...EDITOR, minHeight: "clamp(100px, 22dvh, 170px)" };
const FIELDS: React.CSSProperties = { display: "grid", gap: 6, minWidth: 0 };
const LABEL: React.CSSProperties = { fontWeight: 600, color: TOKEN.fg };
const FIELD_HEADING: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" };
const IDEA_HEADING: React.CSSProperties = { ...FIELD_HEADING, justifyContent: "space-between" };
const EXAMPLE: React.CSSProperties = { ...FIELDS, padding: "6px 8px", borderInlineStart: `2px solid ${TOKEN.border}` };
const HELP_BUTTON: React.CSSProperties = { ...button, padding: 0, width: 24, height: 24, fontSize: 14, border: 0, color: TOKEN.accent };
const HELP_BUBBLE: React.CSSProperties = {
  padding: "6px 8px", border: `1px solid ${TOKEN.border}`, borderRadius: 8, color: TOKEN.fg, background: TOKEN.hover, lineHeight: 1.5,
};
const QUESTION: React.CSSProperties = { minWidth: 0, margin: 0, border: 0, padding: "4px 0 8px" };
const LEGEND: React.CSSProperties = { padding: 0, fontWeight: 600, overflowWrap: "anywhere" };
const OPTIONS: React.CSSProperties = { display: "flex", gap: 6, flexWrap: "wrap", margin: "2px 0 6px" };
const ASSUMPTIONS: React.CSSProperties = { color: TOKEN.muted, overflowWrap: "anywhere" };
const ASSUMPTION_LIST: React.CSSProperties = { margin: "4px 0", paddingInlineStart: 20 };
const RESEARCH_FIELDS: React.CSSProperties = { ...FIELDS, marginTop: 6 };
const FOOTER: React.CSSProperties = { ...actions, borderTop: `1px solid ${TOKEN.border}`, paddingTop: 8 };
