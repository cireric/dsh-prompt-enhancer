import type * as React from "react";
import type { TranslateNS } from "@deepseek-ai/dsh-client-ui-slots";
import type { PromptCheckFinding, PromptCheckResult } from "../../types.ts";
import { canGenerateCheckRevision } from "../utils/check-revision.ts";
import type { PromptEnhancerKey } from "../utils/i18n.ts";
import { TOKEN } from "../utils/theme.ts";
import { ACTIONS, DISABLED_MODE, MUTED, PANEL_BUTTON, PRIMARY, RESULT_ACTIONS, RESULT_CONTENT } from "./ai-panel-styles.ts";

type ReportActions = {
  kind: "composer";
  selected: readonly number[];
  error: PromptEnhancerKey | null;
  onSelect: (index: number, selected: boolean) => void;
  onGenerate: () => void;
} | {
  kind: "draft";
  canUseSuggestion: (finding: PromptCheckFinding) => boolean;
  onUseSuggestion: (finding: PromptCheckFinding) => void;
};

interface Props {
  t: TranslateNS<"prompt-enhancer">;
  report: PromptCheckResult;
  actions: ReportActions;
  stale: boolean;
  onCheckAgain: (() => void) | undefined;
  onBack: () => void;
  onCopy: (finding: PromptCheckFinding) => void;
  copyLabel: (finding: PromptCheckFinding) => PromptEnhancerKey;
}

export function PromptCheckReport({ t, report, actions, stale, onCheckAgain, onBack, onCopy, copyLabel }: Props): React.ReactElement {
  const composer = actions.kind === "composer";
  const canGenerate = composer && canGenerateCheckRevision(actions.selected);
  return (
    <>
      <div role="region" aria-label={t("ai.checkReport")} tabIndex={0} style={CONTENT}>
        {stale && <span role="status" style={MUTED}>{t(composer ? "ai.checkStale" : "ai.draft.checkStale")}</span>}
        {report.findings.length === 0 ? (
          <span role="status">{t("ai.checkClear")}</span>
        ) : (
          <ul style={FINDINGS}>
            {report.findings.map((finding, index) => {
              const { quote, issue, suggestion } = finding;
              return (
                <li key={index} style={index === 0 ? FINDING : NEXT_FINDING}>
                  <strong style={ISSUE}>{issue}</strong>
                  <blockquote style={QUOTE}>{quote}</blockquote>
                  <p style={SUGGESTION}><strong>{t("ai.checkSuggestion")}</strong> {suggestion}</p>
                  <div style={ACTIONS}>
                    {composer && (
                      <label style={CHOICE}>
                        <input type="checkbox" checked={actions.selected.includes(index)}
                          aria-label={`${t("ai.checkInclude")} ${index + 1}: ${issue}`}
                          onChange={(event) => actions.onSelect(index, event.currentTarget.checked)} />
                        {t("ai.checkInclude")}
                      </label>
                    )}
                    <button type="button" style={PANEL_BUTTON} onClick={() => onCopy(finding)}>
                      <span aria-live="polite">{t(copyLabel(finding))}</span>
                    </button>
                    {!composer && actions.canUseSuggestion(finding) && (
                      <button type="button" style={PANEL_BUTTON} onClick={() => actions.onUseSuggestion(finding)}>
                        {t("ai.draft.useSuggestion")}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {composer && actions.error && <span role="alert">{t(actions.error)}</span>}
      <footer style={RESULT_ACTIONS}>
        <button type="button" style={PANEL_BUTTON} onClick={onBack}>
          {t(composer ? "ai.backToActions" : "ai.draft.backToResult")}
        </button>
        {onCheckAgain && <button type="button" style={PANEL_BUTTON} onClick={onCheckAgain}>{t("ai.checkAgain")}</button>}
        {composer && report.findings.length > 0 && (
          <button type="button" style={canGenerate ? PRIMARY : DISABLED_MODE}
            disabled={!canGenerate} onClick={actions.onGenerate}>{t("ai.checkGenerate")}</button>
        )}
      </footer>
    </>
  );
}

const CONTENT: React.CSSProperties = {
  ...RESULT_CONTENT,
  overscrollBehavior: "contain",
  paddingInlineEnd: 8,
  outlineOffset: -2,
  lineHeight: 1.65,
  overflowWrap: "anywhere",
};
const FINDINGS: React.CSSProperties = { flexShrink: 0, listStyle: "none", padding: 0, margin: 0 };
const FINDING: React.CSSProperties = { display: "grid", gap: 6, paddingBlock: 10 };
const NEXT_FINDING: React.CSSProperties = { ...FINDING, borderTop: `1px solid ${TOKEN.border}` };
const ISSUE: React.CSSProperties = { fontWeight: 600 };
const QUOTE: React.CSSProperties = {
  margin: 0,
  padding: "4px 8px",
  color: TOKEN.muted,
  background: TOKEN.hover,
  borderInlineStart: `2px solid ${TOKEN.border}`,
  whiteSpace: "pre-wrap",
};
const SUGGESTION: React.CSSProperties = { margin: 0, whiteSpace: "pre-wrap" };
const CHOICE: React.CSSProperties = { display: "inline-flex", gap: 4, alignItems: "center", marginInlineEnd: "auto", cursor: "pointer" };
