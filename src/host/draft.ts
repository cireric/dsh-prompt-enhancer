import type { PromptDraftQuestion, PromptDraftRequest, PromptDraftResult } from "../types.ts";
import { DRAFT_FEEDBACK_MAX_LENGTH } from "../types.ts";
import { readDraftSources } from "./draft-search.ts";

export function readDraftRequest(input: unknown): PromptDraftRequest | undefined {
  if (!isRecord(input)) return undefined;
  const { idea, executor, answers, references, sources, feedbackHistory, revision } = input;
  if (typeof idea !== "string" || !idea.trim()) return undefined;
  if (executor !== undefined && (typeof executor !== "string" || executor.length > 1000)) return undefined;
  if (references !== undefined && (typeof references !== "string" || references.length > 4000)) return undefined;
  if (sources !== undefined && !Array.isArray(sources)) return undefined;
  const sourceList = readDraftSources(sources);
  const request: PromptDraftRequest = { idea };
  if (typeof executor === "string" && executor.trim()) request.executor = executor.trim();
  if (typeof references === "string" && references.trim()) request.references = references.trim();
  if (sourceList.length) request.sources = sourceList;
  if (feedbackHistory !== undefined) {
    if (!Array.isArray(feedbackHistory) || !feedbackHistory.every(isRevisionFeedback)) return undefined;
    if (feedbackHistory.length) request.feedbackHistory = feedbackHistory.map((entry) => entry.trim());
  }
  if (revision !== undefined) {
    if (!isRecord(revision) || typeof revision.body !== "string" || !revision.body.trim() ||
        !isRevisionFeedback(revision.feedback)) return undefined;
    request.revision = { body: revision.body, feedback: revision.feedback.trim() };
  }
  if (answers === undefined) return request;
  if (!Array.isArray(answers) || answers.length > 2) return undefined;
  const entries: NonNullable<PromptDraftRequest["answers"]> = [];
  for (const entry of answers) {
    if (!entry || typeof entry !== "object" || typeof entry.question !== "string" ||
        !entry.question.trim() || typeof entry.answer !== "string") return undefined;
    entries.push({ question: entry.question.trim(), answer: entry.answer.trim() });
  }
  return { ...request, answers: entries };
}

function isRevisionFeedback(value: unknown): value is string {
  return typeof value === "string" && !!value.trim() && value.length <= DRAFT_FEEDBACK_MAX_LENGTH;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readStrings(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.trim())) return undefined;
  return [...new Set(value.map((item: string) => item.trim()))];
}

export function parseDraftResult(text: string, canClarify: boolean): PromptDraftResult | undefined {
  const fenced = text.trim().match(/^```(?:json)?\s*\n([\s\S]*?)\n\s*```$/i);
  let result: unknown;
  try {
    result = JSON.parse(fenced?.[1] ?? text);
  } catch {
    return undefined;
  }
  if (!isRecord(result)) return undefined;
  if (result.kind === "draft") {
    const assumptions = readStrings(result.assumptions);
    if (typeof result.body !== "string" || !result.body.trim() || !assumptions) return undefined;
    const { understanding } = result;
    if (understanding !== undefined && (typeof understanding !== "string" || !understanding.trim())) return undefined;
    const missingInputs = result.missingInputs === undefined ? [] : readStrings(result.missingInputs);
    const toVerify = result.toVerify === undefined ? [] : readStrings(result.toVerify);
    if (!missingInputs || !toVerify) return undefined;
    const body = result.body.trim();
    // 假设引用正文原句；缺失时让模型整合，避免自动追加与正文冲突的默认值。
    if (assumptions.some((assumption) => !body.includes(assumption))) return undefined;
    const missingSteps = [...new Set([...missingInputs, ...toVerify])].filter((step) => !body.includes(step));
    return {
      kind: "draft",
      body: missingSteps.length ? body + "\n\n" + missingSteps.map((step) => "- " + step).join("\n") : body,
      assumptions,
      ...(understanding === undefined ? {} : { understanding: understanding.trim() }),
      ...(missingInputs.length ? { missingInputs } : {}),
      ...(toVerify.length ? { toVerify } : {}),
    };
  }
  if (!canClarify || result.kind !== "clarify" || !Array.isArray(result.questions) ||
      result.questions.length < 1 || result.questions.length > 2) return undefined;
  const questions: PromptDraftQuestion[] = [];
  for (const entry of result.questions) {
    if (!isRecord(entry) || typeof entry.question !== "string" || !entry.question.trim()) return undefined;
    const options = readStrings(entry.options);
    if (!options || options.length > 4) return undefined;
    questions.push({ question: entry.question.trim(), options });
  }
  if (new Set(questions.map(({ question }) => question)).size !== questions.length) return undefined;
  return { kind: "clarify", questions };
}
