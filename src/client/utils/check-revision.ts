import type { InputActions, InputState } from "@deepseek-ai/dsh-client-ui-conversation/client";
import type { PromptCheckResult, PromptCheckRevision, PromptCheckRevisionRequest } from "../../types.ts";
import { insertPromptDraft, needsInsertionConfirmation, type DraftVersion } from "./insert.ts";

export function prepareCheckRevision(
  baseline: DraftVersion, report: PromptCheckResult, selected: readonly number[],
): PromptCheckRevisionRequest | undefined {
  const findings = report.findings.filter((_, index) => selected.includes(index));
  if (findings.length) return { body: baseline.draft, findings };
}

type CheckReport = { baseline: DraftVersion; report: PromptCheckResult; selected: readonly number[] };
type CheckComparison =
  | { phase: "revision"; baseline: DraftVersion; revision: PromptCheckRevision }
  | { phase: "confirming"; baseline: DraftVersion; revision: PromptCheckRevision; reviewed: DraftVersion };

export type CheckSession =
  | { phase: "checking"; baseline: DraftVersion }
  | ({ phase: "report" | "generating" } & CheckReport)
  | CheckComparison;

export const CHECK_STATUS = {
  checking: "checking", report: "checked", generating: "revisingCheck", revision: "revisedCheck", confirming: "revisedCheck",
} as const satisfies Record<CheckSession["phase"], string>;

export function canCheckAgain(stale: boolean, current: string): boolean {
  return stale && !!current.trim();
}

export function canGenerateCheckRevision(selected: readonly number[]): boolean {
  return selected.length > 0;
}

export function canUseCheckRevision(body: string): boolean {
  return !!body.trim();
}

export function checkRevisionBaseline(session: CheckComparison): DraftVersion {
  return session.phase === "confirming" ? session.reviewed : session.baseline;
}

type CheckEdit =
  | { type: "reported"; report: PromptCheckResult }
  | { type: "select"; index: number; selected: boolean }
  | { type: "returnToReport" }
  | { type: "revised"; revision: PromptCheckRevision }
  | { type: "editRevision"; body: string }
  | { type: "confirm"; reviewed: DraftVersion }
  | { type: "keepEditing" };

export function startCheck(baseline: DraftVersion): CheckSession {
  return { phase: "checking", baseline };
}

export function editCheckSession(session: CheckSession, edit: CheckEdit): CheckSession {
  if (edit.type === "reported" && session.phase === "checking") {
    return { phase: "report", baseline: session.baseline, report: edit.report, selected: [] };
  }
  if (edit.type === "select" && session.phase === "report" && session.report.findings[edit.index]) {
    const { index, selected } = edit;
    if (session.selected.includes(index) === selected) return session;
    return { ...session, selected: selected ? [...session.selected, index] : session.selected.filter((item) => item !== index) };
  }
  if (edit.type === "returnToReport" && session.phase === "generating") {
    return { ...session, phase: "report" };
  }
  if (edit.type === "revised" && session.phase === "generating") {
    return { phase: "revision", baseline: session.baseline, revision: edit.revision };
  }
  if (edit.type === "editRevision" && session.phase === "revision") {
    return { ...session, revision: { ...session.revision, body: edit.body } };
  }
  if (edit.type === "confirm" && (session.phase === "revision" || session.phase === "confirming")) {
    return { ...session, phase: "confirming", reviewed: edit.reviewed };
  }
  if (edit.type === "keepEditing" && session.phase === "confirming") {
    return { phase: "revision", baseline: session.baseline, revision: session.revision };
  }
  return session;
}

export function beginCheckRevision(session: CheckSession):
  { session: CheckSession; request: PromptCheckRevisionRequest } | undefined {
  if (session.phase !== "report") return;
  const request = prepareCheckRevision(session.baseline, session.report, session.selected);
  if (request) return { session: { ...session, phase: "generating" }, request };
}

type Result = { kind: "applied" | "rejected" } | { kind: "confirm"; reviewed: DraftVersion };

export function applyCheckRevision(
  actions: Pick<InputActions, "setDraft"> & Partial<Pick<InputActions, "captureInsertion">>,
  reviewed: DraftVersion,
  current: DraftVersion & Pick<InputState, "phase">,
  body: string,
): Result {
  if (!canUseCheckRevision(body)) return { kind: "rejected" };
  if (needsInsertionConfirmation("overwrite", reviewed, current)) {
    return { kind: "confirm", reviewed: { draft: current.draft, draftRev: current.draftRev } };
  }
  if (current.phase === "adjudicating" || current.phase === "submitting" || current.phase === "sending") {
    return { kind: "rejected" };
  }
  return { kind: insertPromptDraft(actions, current, body, "overwrite") ? "applied" : "rejected" };
}
