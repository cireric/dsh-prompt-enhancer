import type { PromptDraftSearchResult, PromptDraftSource } from "../types.ts";
import { safeFailureCode, type ReviewTrace } from "./review-trace.ts";

interface DraftSearchService {
  search(request: { query: string; maxResults: number }, signal: AbortSignal): Promise<{
    sources: readonly PromptDraftSource[];
  }>;
}

let web: DraftSearchService | undefined;

export function registerDraftSearch(service: DraftSearchService | undefined): void {
  web = service;
}

export function readDraftSources(value: unknown): PromptDraftSource[] {
  if (!Array.isArray(value)) return [];
  const sources = new Map<string, PromptDraftSource>();
  for (const source of value.slice(0, 4)) {
    if (!source || typeof source.url !== "string" || source.url.length > 2048) continue;
    const url = URL.parse(source.url);
    if (!url || !["https:", "http:"].includes(url.protocol) || url.username || url.password) continue;
    if (sources.has(url.href)) continue;
    const title = typeof source.title === "string" ? source.title.trim().slice(0, 180) : "";
    const snippet = typeof source.snippet === "string" ? source.snippet.trim().slice(0, 700) : "";
    sources.set(url.href, { url: url.href, ...(title ? { title } : {}), ...(snippet ? { snippet } : {}) });
  }
  return [...sources.values()];
}

const unavailableCodes = new Set([
  "WEB_PROVIDER_UNAVAILABLE", "WEB_PROVIDER_CONFIGURED_MISSING", "WEB_PROVIDER_CONFIGURED_UNAVAILABLE",
  "WEB_PROVIDER_AMBIGUOUS", "WEB_PROVIDER_CREDENTIAL_MISSING",
]);

export async function searchDraftSources(query: string, trace?: ReviewTrace, requestSignal?: AbortSignal): Promise<PromptDraftSearchResult> {
  requestSignal?.throwIfAborted();
  if (!web) {
    trace?.("search-end", { status: "unavailable", code: "no-web" });
    return { status: "unavailable" };
  }
  const timeoutMs = 12_000;
  const deadline = AbortSignal.timeout(timeoutMs);
  const signal = requestSignal ? AbortSignal.any([deadline, requestSignal]) : deadline;
  trace?.("search-start", { timeoutMs });
  try {
    const result = await web.search({ query, maxResults: 4 }, signal);
    requestSignal?.throwIfAborted();
    const sources = readDraftSources(result.sources);
    trace?.("search-end", { status: sources.length ? "found" : "empty", sourceCount: sources.length });
    return sources.length ? { status: "found", sources } : { status: "empty" };
  } catch (error) {
    requestSignal?.throwIfAborted();
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    const status = typeof code === "string" && unavailableCodes.has(code) ? "unavailable" : "failed";
    trace?.("search-end", { status, code: safeFailureCode(code), deadlineAborted: signal.aborted });
    return { status };
  }
}
