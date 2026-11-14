import type { PromptCheckFinding, PromptCheckResult } from "../types.ts";

export function parsePromptCheck(text: string, draft: string): PromptCheckResult | undefined {
  const fenced = text.trim().match(/^```(?:json)?\s*\n([\s\S]*?)\n\s*```$/i);
  let data: unknown;
  try {
    data = JSON.parse(fenced?.[1] ?? text);
  } catch {
    return undefined;
  }
  if (data === null || typeof data !== "object" || !("findings" in data) || !Array.isArray(data.findings)) {
    return undefined;
  }

  const findings: PromptCheckFinding[] = [];
  for (const finding of data.findings) {
    if (finding === null || typeof finding !== "object") return undefined;
    const { quote, issue, suggestion } = finding;
    if (typeof quote !== "string" || !quote.trim() || !draft.includes(quote) ||
        typeof issue !== "string" || !issue.trim() || typeof suggestion !== "string" || !suggestion.trim()) {
      return undefined;
    }
    findings.push({ quote, issue: issue.trim(), suggestion: suggestion.trim() });
  }
  return { findings: findings.slice(0, 5) };
}
