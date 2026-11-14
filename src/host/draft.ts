import type { PromptDraftQuestion, PromptDraftRequest, PromptDraftResult } from "../types.ts";
import { readDraftSources } from "./draft-search.ts";

export function readDraftRequest(input: Record<string, unknown>): PromptDraftRequest | undefined {
  const { idea, answers, references, sources } = input;
  if (typeof idea !== "string" || !idea.trim()) return undefined;
  if (references !== undefined && (typeof references !== "string" || references.length > 4000)) return undefined;
  if (sources !== undefined && !Array.isArray(sources)) return undefined;
  const sourceList = readDraftSources(sources);
  const request: PromptDraftRequest = { idea };
  if (typeof references === "string" && references.trim()) request.references = references.trim();
  if (sourceList.length) request.sources = sourceList;
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
    const toVerify = result.toVerify === undefined ? [] : readStrings(result.toVerify);
    if (!toVerify) return undefined;
    const body = result.body.trim();
    const missingSteps = toVerify.filter((step) => !body.includes(step));
    return {
      kind: "draft",
      body: missingSteps.length ? body + "\n\n" + missingSteps.map((step) => "- " + step).join("\n") : body,
      assumptions,
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
