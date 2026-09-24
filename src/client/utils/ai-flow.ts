/**
 * AI 优化 / 完善的纯逻辑层：不触达 fetch、不依赖 React，可直接脱离宿主单测。
 *
 * 只以 `import type` 引用 api.ts 的类型——运行期值一律不 import，避免把 HTTP 依赖带进本模块；
 * 错误分类按「HTTP status / err.name」判定，不匹配 message 文本（宿主文案可改）。
 */
import type { Prompt } from "../../types.ts";
import type { AiRefineResult } from "./api.ts";
import { clampTitle } from "../../types.ts";
import { needsValues } from "./template.ts";

/** keepVariables 开关口径：草稿含 `{{变量}}` 才勾选；`{{}}` / `{{   }}` 不算（复用 parseVariables 口径）。 */
export function keepVariablesFor(draft: string): boolean {
  return needsValues(draft);
}

/** 落到提示词库的入参：body 用**原文**（AI 完善稿只进输入框），title 走 clampTitle，tags 最多 1 个。 */
export function libraryCreateInput(refined: AiRefineResult, originalDraft: string): {
  title: string;
  body: string;
  tags: string[];
  summary: string;
} {
  const firstLine = originalDraft.split(/\r\n|\n|\r/)[0] ?? "";
  return {
    title: clampTitle(refined.title || firstLine),
    body: originalDraft,
    tags: refined.tags.slice(0, 1),
    summary: refined.summary,
  };
}

/** 完善稿与原文不同才需要写回（对应 store.ts 的 sourceBody 写回边界：相同则不动 body）。 */
export function needsWriteBack(refinedBody: string, originalDraft: string): boolean {
  return refinedBody !== originalDraft;
}

/** 是否可切换「原文 ↔ 优化稿」：sourceBody 非空（与 store.ts 回滚守卫一致）。 */
export function canToggle(current: Pick<Prompt, "sourceBody">): boolean {
  return Boolean(current.sourceBody);
}

function errorName(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const name = (err as { name?: unknown }).name;
  return typeof name === "string" ? name : undefined;
}

function statusOf(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null || !("status" in err)) return undefined;
  const status = (err as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

/** 客户端 toast 文案的 i18n key：超时 / AI 不可用 / 其它失败。 */
export function aiErrorKey(err: unknown): "ai.timeout" | "ai.unavailable" | "ai.fail" {
  if (errorName(err) === "TimeoutError") return "ai.timeout";
  if (statusOf(err) === 503) return "ai.unavailable";
  return "ai.fail";
}
