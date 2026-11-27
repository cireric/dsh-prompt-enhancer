import type { PromptCheckFinding, PromptCheckResult, PromptDraftContext, PromptDraftQuestion, PromptDraftRequest, PromptDraftResult, PromptDraftSearchResult } from "../../types.ts";
import { DRAFT_FEEDBACK_MAX_LENGTH } from "../../types.ts";

export interface DraftSession {
  readonly composer: string;
  readonly idea: string;
  readonly executor?: string;
  readonly references?: string;
  readonly query?: string;
  readonly search?: PromptDraftSearchResult;
  readonly questions: readonly PromptDraftQuestion[];
  readonly answers: readonly string[];
  readonly step: "idea" | "questions" | "result";
  readonly body: string;
  readonly understanding?: string;
  readonly assumptions: readonly string[];
  readonly missingInputs?: readonly string[];
  readonly toVerify?: readonly string[];
  /** One identity per successfully generated result, retained through manual edits. */
  readonly generatedFrom?: PromptDraftContext;
  readonly feedback: string;
  readonly checked?: { readonly snapshot: DraftHandoff; readonly report: PromptCheckResult };
}

interface DraftHandoff {
  readonly body: string;
  readonly generatedFrom: PromptDraftContext;
}

export type DraftEdit =
  | { type: "field"; field: "idea" | "executor" | "references" | "query" | "body" | "feedback"; value: string }
  | { type: "fillExample"; value: string }
  | { type: "answer"; index: number; value: string }
  | { type: "searched"; search: PromptDraftSearchResult }
  | { type: "checked"; snapshot: DraftHandoff; report: PromptCheckResult }
  | { type: "useSuggestion"; finding: PromptCheckFinding }
  | { type: "editInputs" | "editIdea" | "returnResult" };

export function createDraftSession(composer: string): DraftSession {
  return { composer, idea: composer.trim() ? composer : "", questions: [], answers: [], body: "", assumptions: [], feedback: "", step: "idea" };
}

export function canFillDraftExample({ step, idea }: DraftSession): boolean {
  return step === "idea" && !idea.trim();
}

export function editDraftSession(session: DraftSession, edit: DraftEdit): DraftSession {
  switch (edit.type) {
    case "field": {
      const { field, value } = edit;
      if (field === "idea" || field === "executor") return { ...session, [field]: value, questions: [], answers: [] };
      if (field === "query") return { ...session, query: value, search: undefined };
      return { ...session, [field]: value };
    }
    case "fillExample": return canFillDraftExample(session)
      ? editDraftSession(session, { type: "field", field: "idea", value: edit.value })
      : session;
    case "answer": return { ...session, answers: session.answers.map((answer, index) => index === edit.index ? edit.value : answer) };
    case "searched": return { ...session, search: edit.search };
    case "checked": return { ...session, checked: { snapshot: edit.snapshot, report: edit.report } };
    case "useSuggestion": {
      const feedback = draftSuggestionFeedback(session, edit.finding);
      return feedback === undefined ? session : { ...session, feedback, step: "result" };
    }
    case "editInputs": return { ...session, step: session.questions.length ? "questions" : "idea" };
    case "editIdea": return { ...session, step: "idea" };
    case "returnResult": return session.generatedFrom ? { ...session, step: "result" } : session;
  }
}

export type DraftGeneration = "generate" | "skip" | "revise";

export function prepareDraftGeneration(session: DraftSession, action: DraftGeneration): PromptDraftRequest | undefined {
  const { step, generatedFrom, body, feedback, idea, executor, references, search, questions, answers } = session;
  if (action === "revise") {
    if (step !== "result" || !generatedFrom || !body.trim() || !feedback.trim() || feedback.length > DRAFT_FEEDBACK_MAX_LENGTH) return;
    return { ...generatedFrom, revision: { body, feedback: feedback.trim() } };
  }
  if (!idea.trim() || step === "result" || (action === "skip" && step !== "questions")) return;
  if (step === "questions" && action === "generate" && !answers.some((answer) => answer.trim())) return;
  return {
    idea,
    ...(executor?.trim() ? { executor: executor.trim() } : {}),
    ...(references?.trim() ? { references: references.trim() } : {}),
    ...(search?.status === "found" && search.sources.length ? { sources: search.sources } : {}),
    // The host distinguishes absent answers (may clarify) from present empty answers (skipped).
    ...(step === "questions" ? {
      answers: questions.map(({ question }, index) => ({ question, answer: action === "skip" ? "" : answers[index]?.trim() ?? "" })),
    } : {}),
  };
}

/** Returns a replacement session only on success; an aborted request cannot deliver a replacement. */
export async function generateDraft(
  session: DraftSession,
  request: PromptDraftRequest,
  signal: AbortSignal,
  send: (request: PromptDraftRequest, signal: AbortSignal) => Promise<PromptDraftResult>,
): Promise<DraftSession | undefined> {
  if (signal.aborted) return;
  const result = await send(request, signal);
  if (signal.aborted) return;
  const { revision, ...generatedFrom } = request;
  if (result.kind === "clarify") {
    if (revision || generatedFrom.answers !== undefined) throw new Error("Unexpected second draft clarification");
    return { ...session, step: "questions", questions: result.questions, answers: result.questions.map(() => "") };
  }
  if (revision) generatedFrom.feedbackHistory = [...(generatedFrom.feedbackHistory ?? []), revision.feedback];
  const { body, understanding, assumptions, missingInputs, toVerify } = result;
  return {
    ...session, step: "result", body, understanding, assumptions, missingInputs, toVerify, generatedFrom, feedback: "",
    ...(!revision && generatedFrom.answers === undefined ? { questions: [], answers: [] } : {}),
  };
}

/** Check and enhancement both take the currently edited body, not the original model output. */
export function prepareDraftHandoff(session: DraftSession): DraftHandoff | undefined {
  const { body, generatedFrom } = session;
  return session.step === "result" && generatedFrom && body.trim() ? { body, generatedFrom } : undefined;
}

export function draftCheckIsStale(session: DraftSession): boolean {
  const snapshot = session.checked?.snapshot;
  return snapshot !== undefined && (session.body !== snapshot.body || session.generatedFrom !== snapshot.generatedFrom);
}

export function draftSuggestionFeedback(session: DraftSession, finding: PromptCheckFinding): string | undefined {
  if (!session.checked?.report.findings.includes(finding) || draftCheckIsStale(session)) return;
  const { suggestion } = finding;
  const previous = session.feedback.trim();
  const feedback = previous ? `${previous}\n\n${suggestion}` : suggestion;
  return feedback.length <= DRAFT_FEEDBACK_MAX_LENGTH ? feedback : undefined;
}
