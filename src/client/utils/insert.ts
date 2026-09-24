import type { Prompt } from "../../types.ts";

export type InsertMode = "insert" | "overwrite" | "insert-send";

/** 三种插入语义（纯函数）：追加用换行分隔；覆盖直接替换；插入并发送额外要求提交。 */
export function composeDraft(draft: string, body: string, mode: InsertMode): { draft: string; send: boolean } {
  const send = mode === "insert-send";
  if (mode === "overwrite") return { draft: body, send };
  return { draft: draft ? `${draft}\n${body}` : body, send };
}

/** 列表行显示用的摘要（优先 AI 摘要，否则截断正文首行）。 */
export function promptSummary(p: Prompt, max = 60): string {
  const source = p.summary?.trim() || p.body.replace(/\s+/g, " ").trim();
  return source.length > max ? `${source.slice(0, max)}…` : source;
}
