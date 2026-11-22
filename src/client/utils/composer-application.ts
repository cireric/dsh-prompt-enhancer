import type { InputActions, InputState } from "@deepseek-ai/dsh-client-ui-conversation/client";
import { canRender, type OverlayKind } from "../../overlay-claim.ts";
import { insertPromptDraft, needsInsertionConfirmation, type DraftVersion } from "./insert.ts";
import { needsValues } from "./template.ts";

export type ComposerApplicationSource =
  | { kind: "polish"; original: string }
  | { kind: "template"; original: string; draftComposer?: string }
  | { kind: "draft"; composer: string };

export type DraftReplacement = { kind: "confirm"; current: string; proposed: string };
type DraftApplication = DraftReplacement | { kind: "apply"; text: string };
export type ComposerApplication = DraftApplication | { kind: "blocked" } | { kind: "fill" };

export function requestComposerApplication(
  source: ComposerApplicationSource, current: string, { kind, text }: { kind: "try" | "submit"; text: string },
): ComposerApplication {
  if (kind === "try" && source.kind !== "draft" && needsValues(text)) return { kind: "fill" };

  if (source.kind !== "draft" && (source.kind !== "template" || source.draftComposer === undefined)) {
    return current === source.original ? { kind: "apply", text } : { kind: "blocked" };
  }
  const baseline = source.kind === "draft" ? source.composer : source.draftComposer;
  return current === baseline ? { kind: "apply", text } : { kind: "confirm", current, proposed: text };
}

export function confirmDraftApplication(replacement: DraftReplacement, current: string): DraftApplication {
  return current === replacement.current ? { kind: "apply", text: replacement.proposed } : { ...replacement, current };
}

type CheckActions = Pick<InputActions, "setDraft"> & Partial<Pick<InputActions, "captureInsertion">>;
type CheckApplication = {
  owner: CheckActions;
  visible: boolean;
  liveClaim: OverlayKind;
  baseline: DraftVersion;
  reviewed?: DraftVersion;
  body: string;
};
type CheckResult = { kind: "applied" | "rejected" | "ignored" } | { kind: "confirm"; reviewed: DraftVersion };

export function canUseCheckRevision(body: string): boolean {
  return !!body.trim();
}

export function applyCheckRevision(
  actions: CheckActions,
  { owner, visible, liveClaim, baseline, reviewed, body }: CheckApplication,
  current: DraftVersion & Pick<InputState, "phase">,
): CheckResult {
  if (!visible || !canRender("ai", liveClaim) || actions !== owner) return { kind: "ignored" };
  if (!canUseCheckRevision(body)) return { kind: "rejected" };
  if (needsInsertionConfirmation("overwrite", reviewed ?? baseline, current)) {
    return { kind: "confirm", reviewed: { draft: current.draft, draftRev: current.draftRev } };
  }
  if (current.phase === "adjudicating" || current.phase === "submitting" || current.phase === "sending") {
    return { kind: "rejected" };
  }
  return { kind: insertPromptDraft(actions, current, body, "overwrite") ? "applied" : "rejected" };
}
