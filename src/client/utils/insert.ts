import type { InputActions, InputState } from "@deepseek-ai/dsh-client-ui-conversation/client";
import type { Prompt } from "../../types.ts";
import { hashTailEdit } from "./hash-token.ts";

export type InsertMode = "insert" | "overwrite" | "insert-send";

export interface DraftVersion {
  draft: string;
  draftRev: number | undefined;
}

export function needsInsertionConfirmation(mode: InsertMode, before: DraftVersion, current: DraftVersion): boolean {
  return mode !== "insert" && (before.draft !== current.draft || before.draftRev !== current.draftRev);
}

type PromptDraft = DraftVersion & Partial<Pick<InputState, "claim" | "occurrences">>;
type DraftActions = Pick<InputActions, "setDraft"> & Partial<Pick<InputActions, "captureInsertion" | "insertText">>;

function commandTextLength(input: PromptDraft): number {
  return input.claim?.token.trimEnd().length ?? 0;
}

/** Clipboard text before this offset can contain atomic chips, including their labels. */
export function editableTailStart(input: PromptDraft): number {
  const last = input.occurrences?.at(-1);
  return last ? last.offset + last.length : commandTextLength(input);
}

/** Insert at the end, replace the trailing hash token, or explicitly overwrite the document. */
export function insertPromptDraft(
  actions: DraftActions,
  input: PromptDraft,
  body: string,
  mode: InsertMode | "replace-hash",
): boolean {
  const { draft, draftRev } = input;
  const captured = actions.captureInsertion?.();
  if (captured && draftRev !== undefined && captured.draftRev !== draftRev) return false;
  if (mode === "overwrite") {
    actions.setDraft(body);
    return true;
  }

  const edit = mode === "replace-hash"
    ? hashTailEdit(draft, body, editableTailStart(input))
    : { start: draft.length, text: draft ? `\n${body}` : body };
  if (!edit) return false;

  if (!captured || typeof actions.insertText !== "function") {
    // Only plain drafts can safely use the older whole-draft action for a tail edit.
    if (input.claim || input.occurrences?.length) return false;
    actions.setDraft(draft.slice(0, edit.start) + edit.text);
    return true;
  }
  if (draftRev === undefined) return false;

  // InputState.draft expands chips to clipboard text. TokenSpan counts each chip as one
  // UTF-16 unit. Tail edits start after all chips, so both endpoints share this adjustment.
  const commandLength = commandTextLength(input);
  const expansion = (commandLength ? commandLength - 1 : 0)
    + (input.occurrences ?? []).reduce((total, ref) => total + ref.length - 1, 0);
  return actions.insertText(edit.text, {
    start: edit.start - expansion,
    end: draft.length - expansion,
    draftRev,
  });
}

/** 列表行显示用的摘要（优先 AI 摘要，否则截断正文首行）。 */
export function promptSummary(p: Prompt, max = 60): string {
  const source = p.summary?.trim() || p.body.replace(/\s+/g, " ").trim();
  return source.length > max ? `${source.slice(0, max)}…` : source;
}

/** Recently inserted entries, ordered by the last use rather than frequency. */
export function recentPrompts(prompts: readonly Prompt[], limit = 5): Prompt[] {
  return prompts.filter((prompt) => prompt.lastUsedAt > 0)
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
    .slice(0, limit);
}
