import type * as React from "react";
import type { TranslateNS } from "@deepseek-ai/dsh-client-ui-slots";
import type { PromptCheckRevision } from "../../types.ts";
import type { PromptEnhancerKey } from "../utils/i18n.ts";
import { TOKEN } from "../utils/theme.ts";
import { HEADER, PANEL_BUTTON, PREVIEW, PRIMARY, RESULT_ACTIONS, RESULT_CONTENT, TEXTAREA } from "./ai-panel-styles.ts";

interface Props {
  t: TranslateNS<"prompt-enhancer">;
  original: string;
  revision: PromptCheckRevision;
  confirmation: { draft: string; stale: boolean; onKeepEditing: () => void } | undefined;
  error: PromptEnhancerKey | null;
  copyLabel: PromptEnhancerKey;
  canUseRevision: boolean;
  onEdit: (body: string) => void;
  onCopy: () => void;
  onApply: () => void;
}

export function PromptCheckRevisionPanel({
  t, original, revision, confirmation, error, copyLabel, canUseRevision, onEdit, onCopy, onApply,
}: Props): React.ReactElement {
  return (
    <>
      <div style={RESULT_CONTENT}>
        {confirmation ? (
          <>
            <span role="alert">{t(confirmation.stale ? "ai.checkReviewAgain" : "ai.checkReplaceWarning")}</span>
            <span style={HEADER}>{t("ai.draft.currentComposer")}</span>
            <pre style={PREVIEW}>{confirmation.draft || "—"}</pre>
          </>
        ) : (
          <>
            {revision.pending.length > 0 && (
              <div>
                <strong>{t("ai.checkPending")}</strong>
                <ul>{revision.pending.map((question, index) => <li key={index}>{question}</li>)}</ul>
              </div>
            )}
            <div style={COMPARE_GRID}>
              <label style={COMPARE_FIELD}>
                {t("ai.checkRevised")}
                <textarea style={COMPARE_TEXT} value={revision.body} spellCheck={false}
                  onChange={(event) => onEdit(event.currentTarget.value)} />
              </label>
              <label style={COMPARE_FIELD}>
                {t("ai.checkSource")}
                <textarea style={SOURCE_TEXT} value={original} readOnly />
              </label>
            </div>
          </>
        )}
        {error && <span role="alert">{t(error)}</span>}
      </div>
      <footer style={RESULT_ACTIONS}>
        {confirmation ? (
          <button type="button" style={PANEL_BUTTON} onClick={confirmation.onKeepEditing}>{t("ai.draft.keepEditing")}</button>
        ) : (
          <button type="button" style={PANEL_BUTTON} onClick={onCopy} disabled={!canUseRevision}>
            <span aria-live="polite">{t(copyLabel)}</span>
          </button>
        )}
        <button type="button" style={PRIMARY} onClick={onApply} disabled={!canUseRevision}>
          {t(!confirmation ? "ai.apply" : confirmation.stale ? "ai.draft.confirmCurrent" : "ai.draft.replace")}
        </button>
      </footer>
    </>
  );
}

const COMPARE_GRID: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 10, flex: "1 0 auto",
};
const COMPARE_FIELD: React.CSSProperties = { ...HEADER, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 };
const COMPARE_TEXT: React.CSSProperties = {
  ...TEXTAREA, flex: "1 0 auto", minHeight: "clamp(145px, 31dvh, 280px)", fontWeight: "normal", lineHeight: 1.55, resize: "none",
};
const SOURCE_TEXT: React.CSSProperties = { ...COMPARE_TEXT, color: TOKEN.muted };
