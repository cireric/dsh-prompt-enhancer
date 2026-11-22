import { reasonOf } from "../../err-text.ts";
import type { Prompt, TemplateVariable } from "../../types.ts";
import { canToggle, libraryCreateInput, needsWriteBack, writeBackRefined, type WriteBackInput } from "./ai-flow.ts";
import type { CaptureInput, CaptureOutcome } from "./capture.ts";

type TemplateSaveInput = {
  original: string;
  metadata: Parameters<typeof libraryCreateInput>[0];
  body: string;
  variables: TemplateVariable[];
};

type WriteBackDependencies = Pick<WriteBackInput, "update" | "seed"> & {
  notify: () => void;
  isAlive: () => boolean;
};

type SaveDependencies = WriteBackDependencies & {
  /** The capture entry point owns eviction confirmation and the creation notification. */
  create: (input: CaptureInput) => Promise<CaptureOutcome>;
};

type PendingWriteBack = Pick<WriteBackInput, "promptId" | "contentVersion" | "body" | "variables"> & {
  evicted: boolean;
};

type WriteBackResult =
  | { kind: "saved"; prompt: Prompt; evicted: boolean }
  | { kind: "writeBackFailed"; reason: string; pending: PendingWriteBack };

export type TemplateSaveResult = WriteBackResult | { kind: "saveFailed"; reason: string };

export function savedTemplatePreview({ body, sourceBody }: Prompt): { hint: "ai.toggleMoved" | "ai.sameAsOriginal"; text: string } {
  const max = 120;
  return {
    hint: canToggle({ sourceBody }) ? "ai.toggleMoved" : "ai.sameAsOriginal",
    text: body.length > max ? body.slice(0, max) + "…" : body,
  };
}

/** Undefined means the view is gone, not that an in-flight library write was undone. */
export async function saveTemplate(
  { original, metadata, body, variables }: TemplateSaveInput,
  deps: SaveDependencies,
): Promise<TemplateSaveResult | { kind: "cancelled" } | undefined> {
  const writeBack = needsWriteBack(body, original);
  let outcome: CaptureOutcome;
  try {
    outcome = await deps.create({
      ...libraryCreateInput(metadata, original),
      ...(!writeBack && variables.length ? { variables } : {}),
    });
  } catch (err) {
    console.warn("[prompt-enhancer] 存入词库失败", err);
    return deps.isAlive() ? { kind: "saveFailed", reason: reasonOf(err) } : undefined;
  }
  if (!deps.isAlive()) return;
  if (!outcome.ok) return { kind: "cancelled" };
  const { prompt } = outcome;
  const evicted = outcome.evicted.length > 0;
  if (!writeBack) return { kind: "saved", prompt, evicted };
  return finishWriteBack({ promptId: prompt.id, contentVersion: prompt.contentVersion, body, variables, evicted }, deps,
    "[prompt-enhancer] 优化稿写回失败（原文已入库）");
}

/** Retries the original payload and version, without re-entering capture. */
export function retryTemplateWriteBack(pending: PendingWriteBack, deps: WriteBackDependencies): Promise<WriteBackResult | undefined> {
  return finishWriteBack(pending, deps, "[prompt-enhancer] 优化稿写回重试失败");
}

async function finishWriteBack(
  pending: PendingWriteBack,
  { update, seed, notify, isAlive }: WriteBackDependencies,
  failureMessage: string,
): Promise<WriteBackResult | undefined> {
  try {
    const prompt = await writeBackRefined({ ...pending, update, seed });
    notify();
    return isAlive() ? { kind: "saved", prompt, evicted: pending.evicted } : undefined;
  } catch (err) {
    console.warn(failureMessage, err);
    return isAlive() ? { kind: "writeBackFailed", reason: reasonOf(err), pending } : undefined;
  }
}
