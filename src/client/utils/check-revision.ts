import type { InputActions, InputState } from "@deepseek-ai/dsh-client-ui-conversation/client";
import type { PromptCheckResult, PromptCheckRevisionRequest } from "../../types.ts";
import { insertPromptDraft, needsInsertionConfirmation, type DraftVersion } from "./insert.ts";

export function prepareCheckRevision(
  baseline: DraftVersion, report: PromptCheckResult, selected: readonly number[],
): PromptCheckRevisionRequest | undefined {
  const findings = report.findings.filter((_, index) => selected.includes(index));
  if (findings.length) return { body: baseline.draft, findings };
}

type Result = { kind: "applied" | "rejected" } | { kind: "confirm"; reviewed: DraftVersion };

export function applyCheckRevision(
  actions: Pick<InputActions, "setDraft"> & Partial<Pick<InputActions, "captureInsertion">>,
  reviewed: DraftVersion,
  current: DraftVersion & Pick<InputState, "phase">,
  body: string,
): Result {
  if (!body.trim()) return { kind: "rejected" };
  if (needsInsertionConfirmation("overwrite", reviewed, current)) {
    return { kind: "confirm", reviewed: { draft: current.draft, draftRev: current.draftRev } };
  }
  if (current.phase === "adjudicating" || current.phase === "submitting" || current.phase === "sending") {
    return { kind: "rejected" };
  }
  return { kind: insertPromptDraft(actions, current, body, "overwrite") ? "applied" : "rejected" };
}
