import type { CSSProperties, ReactElement } from "react";
import type { TranslateNS } from "@deepseek-ai/dsh-client-ui-slots";
import type { PromptEnhancerKey } from "../utils/i18n.ts";
import type { FinalTemplate, TemplateRefineEdit, TemplateRefineSession } from "../utils/template-refine-session.ts";
import { savedTemplatePreview, type TemplateSaveResult } from "../utils/template-save.ts";
import { TOKEN, TONE } from "../utils/theme.ts";
import { ACTIONS, HEADER, MUTED, PANEL_BUTTON, pill, PILLS, PREVIEW, PRIMARY, RESULT_ACTIONS, RESULT_CONTENT, TEXTAREA } from "./ai-panel-styles.ts";
import { TemplateVariableFields } from "./TemplateVariableFields.tsx";

type Props = {
  t: TranslateNS<"prompt-enhancer">;
  session: TemplateRefineSession;
  final: FinalTemplate;
  saveResult?: TemplateSaveResult;
  draftChanged: boolean;
  copyLabel: PromptEnhancerKey;
  onEdit: (edit: TemplateRefineEdit) => void;
  onTry: (variable?: string) => void;
  onCopy: () => void;
  onSave: () => void;
  onRetryWriteBack: () => void;
  onBackToDraft?: () => void;
  onClose: () => void;
};

export function PromptTemplateResult({
  t, session, final, saveResult, draftChanged, copyLabel,
  onEdit, onTry, onCopy, onSave, onRetryWriteBack, onBackToDraft, onClose,
}: Props): ReactElement {
  if (saveResult?.kind === "writeBackFailed") {
    return (
      <>
        <span role="alert" style={ERROR}>
          <span>{t("ai.writeBackFail")}</span>
          <span style={ERROR_DETAIL} title={saveResult.reason}>{saveResult.reason}</span>
        </span>
        {saveResult.pending.evicted && <span style={MUTED}>{t("ai.evicted")}</span>}
        <span style={ACTIONS}>
          <button type="button" style={PANEL_BUTTON} onClick={onRetryWriteBack}>{t("ai.retryWriteBack")}</button>
          <button type="button" style={PANEL_BUTTON} onClick={onClose}>{t("ai.close")}</button>
        </span>
      </>
    );
  }
  if (saveResult?.kind === "saved") {
    const preview = savedTemplatePreview(saveResult.prompt);
    return (
      <>
        <span role="status" aria-live="polite" style={MUTED}>{t("ai.saved")}</span>
        {saveResult.evicted && <span style={MUTED}>{t("ai.evicted")}</span>}
        <span style={MUTED}>{t(preview.hint)}</span>
        <span style={PREVIEW}>{preview.text}</span>
        <span style={ACTIONS}>
          {onBackToDraft && <button type="button" style={PANEL_BUTTON} onClick={onBackToDraft}>{t("ai.draft.backToResult")}</button>}
          <button type="button" style={PANEL_BUTTON} onClick={onClose}>{t("ai.close")}</button>
        </span>
      </>
    );
  }

  const { baseBody, metadata, original, selected, suggestions, view } = session;
  const { canUse, missing, names, needsFill, sections, variables } = final;
  const showOriginal = view === "original";
  const setView = (view: TemplateRefineSession["view"]) => onEdit({ type: "view", view });
  return (
    <>
      <div style={PILLS}>
        <button type="button" style={pill(view === "final")} aria-pressed={view === "final"} onClick={() => setView("final")}>{t("ai.finalTemplate")}</button>
        <button type="button" style={pill(view === "edit")} aria-pressed={view === "edit"} onClick={() => setView("edit")}>{t("ai.editTemplate")}</button>
        <button type="button" style={pill(showOriginal)} aria-pressed={showOriginal} onClick={() => setView("original")}>{t("ai.original")}</button>
      </div>
      <div style={RESULT_CONTENT}>
        {draftChanged && <span role="alert" style={MUTED}>{t("ai.draftChanged")}</span>}
        {missing.length > 0 && (
          <div role="alert" style={PILLS}>
            <span style={MUTED}>{t("ai.missingVariables")} {missing.join(", ")}</span>
            {view !== "edit" && (
              <button type="button" style={PANEL_BUTTON} onClick={() => setView("edit")}>{t("ai.editTemplate")}</button>
            )}
          </div>
        )}
        {saveResult?.kind === "saveFailed" && (
          <span role="alert" style={ERROR}>
            <span>{t("ai.saveFail")}</span>
            <span style={ERROR_DETAIL}>{saveResult.reason}</span>
          </span>
        )}
        {view === "final" ? (
          <pre role="region" aria-label={t("ai.finalTemplate")} tabIndex={0} style={FINAL_PREVIEW}>
            {sections.map(({ fragments, addition }, index) => (
              <span key={index} style={addition ? ADDED_SUGGESTION : undefined}>
                {fragments.map(({ text, name, added }, position) => added && name !== undefined ? (
                  <button key={position} type="button" style={ADDED_VARIABLE} onClick={() => onTry(name)}>{text}</button>
                ) : text)}
              </span>
            ))}
          </pre>
        ) : (
          <textarea
            key={view}
            autoFocus={view === "edit"}
            value={showOriginal ? original : baseBody}
            readOnly={showOriginal}
            aria-label={t(showOriginal ? "ai.original" : "ai.editTemplate")}
            onChange={(ev) => onEdit({ type: "body", body: ev.target.value })}
            style={TEMPLATE_EDITOR}
          />
        )}
        {!showOriginal && (
          <div style={RESULT_OPTIONS}>
            {suggestions.length > 0 && (
              <details style={RESULT_DETAILS}>
                <summary style={RESULT_SUMMARY}>
                  {t("ai.suggestions")} <span style={MUTED}>{selected.length}/{suggestions.length}</span>
                </summary>
                <fieldset style={SUGGESTIONS} aria-label={t("ai.suggestions")}>
                  {suggestions.map((suggestion, index) => (
                    <label key={suggestion} style={SUGGESTION}>
                      <input type="checkbox" checked={selected.includes(index)} onChange={(event) =>
                        onEdit({ type: "suggestion", index, checked: event.currentTarget.checked })} />
                      <span>{suggestion}</span>
                    </label>
                  ))}
                </fieldset>
              </details>
            )}
            <details style={RESULT_DETAILS}>
              <summary style={RESULT_SUMMARY}>{t("ai.entryDetails")}</summary>
              <dl style={META}>
                <dt style={META_KEY}>{t("ai.fieldTitle")}</dt>
                <dd style={META_VALUE}>{metadata.title}</dd>
                <dt style={META_KEY}>{t("ai.fieldTags")}</dt>
                <dd style={META_VALUE}>{metadata.tags.join(" / ")}</dd>
                <dt style={META_KEY}>{t("ai.fieldSummary")}</dt>
                <dd style={META_VALUE}>{metadata.summary}</dd>
              </dl>
              {names.length > 0 && (
                <div style={RESULT_DETAILS}>
                  <strong style={HEADER}>{t("vars.settings")}</strong>
                  <TemplateVariableFields names={names} variables={variables} t={t}
                    onChange={(name, field, value) => onEdit({ type: "variable", name, field, value })} />
                </div>
              )}
            </details>
          </div>
        )}
      </div>
      <footer style={RESULT_ACTIONS}>
        {onBackToDraft && <button type="button" style={PANEL_BUTTON} onClick={onBackToDraft}>{t("ai.draft.backToResult")}</button>}
        {view === "final" ? (
          <>
            <button type="button" style={PANEL_BUTTON} disabled={!canUse} onClick={onSave}>{t("ai.save")}</button>
            <button type="button" style={PANEL_BUTTON} disabled={!canUse} onClick={onCopy}>{t(copyLabel)}</button>
            <button type="button" style={PRIMARY} disabled={!canUse} onClick={() => onTry()}>{t(needsFill ? "ai.tryTemplate" : "ai.apply")}</button>
          </>
        ) : (
          <button type="button" style={PRIMARY} onClick={() => setView("final")}>{t("ai.viewFinalTemplate")}</button>
        )}
      </footer>
    </>
  );
}

const ERROR: CSSProperties = { display: "flex", flexDirection: "column", gap: 2, color: TOKEN.fg, fontSize: 11 };
const ERROR_DETAIL: CSSProperties = { color: TOKEN.muted, overflowWrap: "anywhere" };
const META: CSSProperties = { display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", margin: "4px 0 0", columnGap: 10, rowGap: 4, alignItems: "baseline" };
const META_KEY: CSSProperties = { color: TOKEN.muted, fontSize: 11, whiteSpace: "nowrap" };
const META_VALUE: CSSProperties = { margin: 0, color: TOKEN.fg, overflowWrap: "anywhere" };
const SUGGESTIONS: CSSProperties = { display: "grid", gap: 8, margin: 0, minWidth: 0, border: 0, padding: "4px 0 2px" };
const SUGGESTION: CSSProperties = { display: "flex", alignItems: "flex-start", gap: 6, overflowWrap: "anywhere", lineHeight: 1.55 };
const TEMPLATE_EDITOR: CSSProperties = { ...TEXTAREA, flex: "1 1 0", minHeight: "clamp(100px, 29dvh, 220px)", padding: "10px 11px", fontSize: 13, lineHeight: 1.6 };
const RESULT_OPTIONS: CSSProperties = { flex: "0 0 auto", maxHeight: "min(128px, 20dvh)", overflowY: "auto" };
const RESULT_DETAILS: CSSProperties = { flex: "0 0 auto", borderTop: `1px solid ${TOKEN.border}` };
const RESULT_SUMMARY: CSSProperties = { cursor: "pointer", padding: "6px 0", fontWeight: 600 };
const FINAL_PREVIEW: CSSProperties = { ...TEMPLATE_EDITOR, margin: 0, resize: "none", whiteSpace: "pre-wrap", overflowWrap: "anywhere", overflowY: "auto" };
const ADDED_VARIABLE: CSSProperties = { background: TOKEN.hover, color: TOKEN.accent, border: 0, padding: 0, font: "inherit", cursor: "pointer", textDecoration: "underline" };
const ADDED_SUGGESTION: CSSProperties = { color: TONE.success, fontStyle: "italic" };
