import type { PromptCheckFinding, PromptCheckResult, PromptCheckRevision, PromptCheckRevisionRequest } from "../types.ts";
import { placeholderLiterals, preservesLiterals } from "./text.ts";

const MAX_FINDINGS = 5;

function parseJsonObject(text: string): Record<string, unknown> | undefined {
  const fenced = text.trim().match(/^```(?:json)?\s*\n([\s\S]*?)\n\s*```$/i);
  try {
    const data: unknown = JSON.parse(fenced?.[1] ?? text);
    if (data && typeof data === "object" && !Array.isArray(data)) return data as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function readFindings(value: unknown, draft: string): PromptCheckFinding[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const findings: PromptCheckFinding[] = [];
  for (const finding of value) {
    if (finding === null || typeof finding !== "object") return undefined;
    const { quote, issue, suggestion } = finding;
    if (typeof quote !== "string" || !quote.trim() || !draft.includes(quote) ||
        typeof issue !== "string" || !issue.trim() || typeof suggestion !== "string" || !suggestion.trim()) {
      return undefined;
    }
    findings.push({ quote, issue: issue.trim(), suggestion: suggestion.trim() });
  }
  return findings;
}

export function parsePromptCheck(text: string, draft: string): PromptCheckResult | undefined {
  const findings = readFindings(parseJsonObject(text)?.findings, draft);
  if (findings) return { findings: findings.slice(0, MAX_FINDINGS) };
}

export function readCheckRevisionRequest(input: Record<string, unknown>): PromptCheckRevisionRequest | undefined {
  const { body, findings: raw } = input;
  if (typeof body !== "string" || !body.trim() || !Array.isArray(raw) || !raw.length || raw.length > MAX_FINDINGS) return;
  const findings = readFindings(raw, body);
  if (findings) return { body, findings };
}

export function parseCheckRevision(text: string, source: string): PromptCheckRevision | undefined {
  const result = parseJsonObject(text);
  if (!result) return;
  const { body, pending } = result;
  if (typeof body !== "string" || !body.trim() || !Array.isArray(pending) || pending.length > MAX_FINDINGS ||
      !pending.every((item): item is string => typeof item === "string" && !!item.trim()) ||
      !preservesLiterals(placeholderLiterals(source), placeholderLiterals(body))) return;
  return { body, pending: pending.map((item) => item.trim()) };
}
