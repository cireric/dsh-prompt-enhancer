/**
 * 搜索口径的**零依赖单一真源**：一条提示词对查询词的命中档位。
 *
 * 为什么要有这个模块：这条口径此前有两份实现——客户端 `src/client/utils/hash-token.ts#filterPrompts`
 * （打分排序，服务 `#` 候选浮层与词库快速列表）与宿主 `src/host/store.ts#listPrompts` 的 `q` 过滤
 * （成员判定，服务管理面板），靠一句注释维系。实测它们**已经分叉**：客户端先把标签拼成
 * `p.tags.join(" ").toLowerCase()` 再 `.includes(q)`，于是跨标签边界的查询词会命中
 * （tags = ["ab", "cd"] 配 "b c"）；宿主是逐标签 `.some(...)`，不会。同一个词因此在
 * 「快速列表」与「管理面板」搜出不同结果，而这种漂移是静默的。
 *
 * 口径（唯一定义）：
 *   · 参与匹配的字段只有 **title / tags / body**——`summary` 是「用途摘要」，一律不参与；
 *   · 档位 = 标题 3 > 标签 2 > 正文 1 > 不命中 0（同档内不排序，排序由调用方决定）；
 *   · **标签是原子标签**：查询词必须落在**某一个**标签内，跨标签边界的子串不算命中；
 *   · 大小写不敏感（经 `normalizeQuery` 归一后比较）。
 *
 * **本模块零 import**（与 `src/skill-name.ts` / `src/skill-description.ts` / `src/eviction-order.ts` 同款）：
 * 既能被 `node --test` 直跑，也能同时进宿主与客户端两个 bundle。
 * 「两处入口给出一致成员集」由 `tests/store.test.mjs` 末尾的交叉用例钉住（需要 DB 装配）；
 * 本模块自己的行为表在 `tests/search-match.test.mjs`。
 */

/** 匹配只读这三个字段：客户端 `Prompt` 与宿主 `Prompt` 都结构兼容。 */
export interface SearchCarrier {
  title: string;
  body: string;
  tags: string[];
}

/**
 * 归一化查询词：trim + 小写。
 *
 * 归一结果为空串 = 「不过滤」——**是否过滤由调用方决定**（快速列表与管理面板都以空查询表示
 * 「列出全部」），本模块不替它决定，故 `matchRank(_, "")` 一律返回 0（不命中）而非「全命中」。
 */
export function normalizeQuery(raw: string | undefined): string {
  return raw?.trim().toLowerCase() ?? "";
}

/**
 * 命中档位：标题 3 / 标签 2 / 正文 1 / 不命中 0。
 *
 * ⚠️ 入参 `query` 必须是 `normalizeQuery` 的产物（本函数不再归一化——归一化只有一处）。
 * 档位是「先命中先算」：标题命中即返回 3，不再看标签与正文。
 */
export function matchRank(prompt: SearchCarrier, query: string): 0 | 1 | 2 | 3 {
  if (query === "") return 0;
  if (prompt.title.toLowerCase().includes(query)) return 3;
  if (prompt.tags.some((t) => t.toLowerCase().includes(query))) return 2;
  if (prompt.body.toLowerCase().includes(query)) return 1;
  return 0;
}
