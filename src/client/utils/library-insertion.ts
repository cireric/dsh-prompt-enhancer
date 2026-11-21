import type { InputActions, InputState } from "@deepseek-ai/dsh-client-ui-conversation/client";
import { ApiError, api } from "./api.ts";
import { insertPromptDraft, needsInsertionConfirmation, type DraftVersion, type InsertMode } from "./insert.ts";

type ApplicationResult =
  | { kind: "cancelled" | "missing" | "rejected" }
  | { kind: "unverified"; error: unknown }
  | { kind: "reconfirm"; before: DraftVersion }
  | { kind: "applied"; usage: Promise<unknown> };

/** Validate the selected ID without replacing the body the user already reviewed. */
export async function applyVerifiedPrompt({ id, body, mode, before, signal, current }: {
  id: string;
  body: string;
  mode: InsertMode;
  before: DraftVersion;
  signal: AbortSignal;
  current: () => { input: InputState; actions: InputActions } | undefined;
}): Promise<ApplicationResult> {
  try {
    await api.getPrompt(id, signal);
  } catch (error) {
    if (signal.aborted) return { kind: "cancelled" };
    if (error instanceof ApiError && error.status === 404) return { kind: "missing" };
    return { kind: "unverified", error };
  }
  // A completed fetch may win the transport race even after the confirmation was invalidated.
  if (signal.aborted) return { kind: "cancelled" };
  const target = current();
  if (!target) return { kind: "cancelled" };
  const { input, actions } = target;
  if (needsInsertionConfirmation(mode, before, input)) {
    return { kind: "reconfirm", before: { draft: input.draft, draftRev: input.draftRev } };
  }
  if (!insertPromptDraft(actions, input, body, mode)) return { kind: "rejected" };
  if (mode === "insert-send") actions.submit();
  return { kind: "applied", usage: api.recordUsage(id) };
}
