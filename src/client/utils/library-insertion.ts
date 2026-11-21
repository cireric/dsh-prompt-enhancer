import type { InputActions, InputState } from "@deepseek-ai/dsh-client-ui-conversation/client";
import type { Prompt } from "../../types.ts";
import { ApiError, api } from "./api.ts";
import { insertPromptDraft, needsInsertionConfirmation, type DraftVersion, type InsertMode } from "./insert.ts";
import { needsValues } from "./template.ts";

export type InsertionTarget = { input: InputState; actions: InputActions };
type ComposerSnapshot = DraftVersion & { attachmentIds: readonly string[] };
export type InsertionReview = ComposerSnapshot & { body: string };
export type InsertionConfirmation = { body: string; remember?: () => Promise<boolean> } | { review: InsertionReview };

export type LibraryInsertion = ReturnType<typeof prepareLibraryInsertion>;
export type LibraryUse =
  | { kind: "fill"; prompt: Prompt; insertion: LibraryInsertion; submitted?: true }
  | { kind: "confirm"; insertion: LibraryInsertion; confirmation: { body: string } | { review: InsertionReview } };

export function prepareLibraryUse(prompt: Prompt, mode: InsertMode, target: InsertionTarget): LibraryUse {
  const insertion = prepareLibraryInsertion(prompt.id, mode, target);
  return needsValues(prompt.body) ? { kind: "fill", prompt, insertion }
    : { kind: "confirm", insertion, confirmation: { body: prompt.body } };
}

export function markInsertionSubmitted(use: LibraryUse | null): LibraryUse | null {
  return use?.kind === "fill" && !use.submitted ? { ...use, submitted: true } : use;
}

export function discardSubmittedInsertion(use: LibraryUse | null): LibraryUse | null {
  return use?.kind === "fill" && !use.submitted ? use : null;
}

export function prepareLibraryInsertion(id: string, mode: InsertMode, { input, actions }: InsertionTarget) {
  return { id, mode, actions, before: composerSnapshot(input) };
}

function composerSnapshot({ draft, draftRev, attachmentIds }: InputState): ComposerSnapshot {
  return { draft, draftRev, attachmentIds: [...(attachmentIds ?? [])] };
}

function changed(mode: InsertMode, before: ComposerSnapshot, next: ComposerSnapshot): boolean {
  return needsInsertionConfirmation(mode, before, next)
    || (mode === "insert-send" && (before.attachmentIds.length !== next.attachmentIds.length
      || before.attachmentIds.some((id, i) => id !== next.attachmentIds[i])));
}

type ApplicationResult =
  | { kind: "cancelled" | "memory-failed" | "missing" | "rejected" }
  | { kind: "unverified"; error: unknown }
  | { kind: "reconfirm"; review: InsertionReview }
  | { kind: "applied"; usage: Promise<unknown> };

/** Verify the target and draft after each wait; the entry lookup never changes the confirmed body. */
export async function applyVerifiedPrompt({ insertion, confirmation, signal, current }: {
  insertion: LibraryInsertion;
  confirmation: InsertionConfirmation;
  signal: AbortSignal;
  current: () => InsertionTarget | undefined;
}): Promise<ApplicationResult> {
  const { id, mode, actions } = insertion;
  const { before, body, remember } = "review" in confirmation
    ? { before: confirmation.review, body: confirmation.review.body, remember: undefined }
    : { before: insertion.before, ...confirmation };
  const target = () => {
    if (signal.aborted) return undefined;
    const latest = current();
    return latest?.actions === actions ? latest : undefined;
  };
  const review = (input: InputState) => {
    const next = composerSnapshot(input);
    return changed(mode, before, next) ? { kind: "reconfirm" as const, review: { ...next, body } } : undefined;
  };

  let latest = target();
  if (!latest) return { kind: "cancelled" };
  if (remember) {
    const saved = await remember();
    latest = target();
    if (!latest) return { kind: "cancelled" };
    if (!saved) return { kind: "memory-failed" };
  }
  const first = review(latest.input);
  if (first) return first;

  try {
    await api.getPrompt(id, signal);
  } catch (error) {
    if (!target()) return { kind: "cancelled" };
    if (error instanceof ApiError && error.status === 404) return { kind: "missing" };
    return { kind: "unverified", error };
  }
  latest = target();
  if (!latest) return { kind: "cancelled" };
  return review(latest.input) ?? writeInsertion(insertion, latest.input, body);
}

function writeInsertion({ id, mode, actions }: LibraryInsertion, input: InputState, body: string): ApplicationResult {
  if (input.phase === "adjudicating" || input.phase === "submitting" || input.phase === "sending") {
    return { kind: "rejected" };
  }
  if (!insertPromptDraft(actions, input, body, mode)) return { kind: "rejected" };
  if (mode === "insert-send") actions.submit();
  return { kind: "applied", usage: api.recordUsage(id) };
}
