import type { Prompt } from "../../types.ts";

/**
 * 读草稿末尾的 `#查询词` 令牌。
 *
 * ⚠️ D2 约定：`InputState` 不暴露 caret，因此只识别**末尾**令牌；
 * `#` 必须位于行首或前面是空白，且令牌内不得含空白。
 */
export function readHashToken(draft: string): { query: string; start: number } | null {
  const m = draft.match(/(^|\s)#([^\s#]*)$/);
  if (!m) return null;
  const start = m.index! + m[1]!.length;
  return { query: m[2] ?? "", start };
}

/** 用正文替换尾令牌（保留令牌之前的文本，令牌与正文之间保留一个空格）。 */
export function replaceHashToken(draft: string, body: string): string {
  const token = readHashToken(draft);
  if (!token) return draft;
  const head = draft.slice(0, token.start).replace(/\s+$/, "");
  return head ? `${head} ${body}` : body;
}

/** 候选过滤：标题命中优先，其次标签，最后正文；同分保持原顺序。 */
export function filterPrompts(prompts: Prompt[], query: string, limit = 5): Prompt[] {
  const q = query.trim().toLowerCase();
  if (!q) return prompts.slice(0, limit);
  const scored: Array<{ p: Prompt; score: number }> = [];
  for (const p of prompts) {
    const title = p.title.toLowerCase();
    const tags = p.tags.join(" ").toLowerCase();
    const body = p.body.toLowerCase();
    const score = title.includes(q) ? 3 : tags.includes(q) ? 2 : body.includes(q) ? 1 : 0;
    if (score > 0) scored.push({ p, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.p);
}
