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

/**
 * `#` 候选浮层此刻该不该显示（R48）。
 *
 * 抽成纯函数的理由：这是本仓库**第三次**同类缺陷——「静默抑制」（T3 的选中浮出、R34 的 store
 * 载荷、R47 的收起态），而组件面没有自动化渲染测试通道（无 react / jsdom，全局硬约束 5）。
 * 判定留在纯模块里才有变异可证：`tests/hash-token.test.mjs` 锁住「令牌消失 → 收起态必须复位」。
 *
 * 显示 = 令牌在（`open`，与 `tokenKey !== null` 同义）**且** 这个令牌不是被「点浮层外部」收起的那个。
 */
export function shouldShowSuggest(input: {
  open: boolean;
  tokenKey: string | null;
  dismissedKey: string | null;
}): boolean {
  return input.open && input.tokenKey !== null && input.dismissedKey !== input.tokenKey;
}

/**
 * 令牌消失（`open === false`）时，收起态必须**复位**（R48 的缺陷本体）。
 *
 * 不复位就会永久静默：收起 → 删光令牌 → 在**同一起点**重打**同一**查询词 → `tokenKey` 完全相同
 * → 浮层被上一轮的收起态压住，`#` 候选不再出现（再多敲一个字符才恢复，即「静默」）。
 *
 * 令牌仍在时保持收起态：同一令牌被点外部收起后不自弹回，草稿继续编辑（位置/查询词变化）才算
 * 一次新的打开。组件侧调用点见 `src/client/components/HashSuggestOverlay.tsx`。
 */
export function nextDismissedKey(open: boolean, dismissedKey: string | null): string | null {
  return open ? dismissedKey : null;
}

/** 用正文替换尾令牌（保留令牌之前的文本，令牌与正文之间保留一个空格）。 */
export function replaceHashToken(draft: string, body: string): string {
  const token = readHashToken(draft);
  if (!token) return draft;
  const head = draft.slice(0, token.start).replace(/\s+$/, "");
  return head ? `${head} ${body}` : body;
}

/**
 * 候选过滤：标题命中优先，其次标签，最后正文；同分保持原顺序。
 *
 * **三处同一口径**（本函数服务 `#` 候选浮层，2026-09-30 起也服务词库按钮的快速列表；
 * 第三处是宿主 `store.listPrompts` 的 `q` 过滤）：只匹配 **title / tags / body**，
 * **summary 一律不参与**——它是「用途摘要」，不是提示词本体。
 *
 * 任一处要加 summary，必须**三处一起改**：否则同一个词在「快速列表」与「管理面板」里搜出不同结果，
 * 而这种口径漂移是静默的（两处都"有搜索结果"，没人会去对比）。行为锁见
 * `tests/hash-token.test.mjs` 的「summary 不参与匹配」用例。
 */
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
