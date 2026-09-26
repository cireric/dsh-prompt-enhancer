/**
 * 上下文推荐的**纯算法**（规格 §7.1.1 / D-P8-5）：零依赖、零 React、零宿主读取。
 *
 * 从上游 `ContextRecommendations.tsx:48-125` 搬运，去掉 React 与 API 调用：本仓库无 react-dom /
 * jsdom（硬约束 5），组件级行为无法自动化断言，故把判定收成可 `node --test` 直测的纯函数——
 * 这是验收 11 唯一的自动化判据面。
 *
 * **触发条件照代码不照 README**（D-P8-8 / 规格 §7.1.1）：`recommend()` 在 `draft.trim() === ""`
 * 时**一律**返回空数组。上游 README 描述成「清空输入框 → 推荐出现」，与它自己的代码相反；
 * 规格以代码为准。这条同时是验收 11「清空草稿后推荐条消失」的根判据。
 *
 * 本文件不 import 任何宿主包、不 import react：`tests/context-recommend.test.mjs` 直接 import 本模块。
 */
import type { Prompt } from "../../types.ts";

/** 最多推荐条数。 */
export const RECOMMEND_LIMIT = 5;
/** 取最近几条用户消息作上下文。 */
export const CONTEXT_USER_COUNT = 3;
/** 30 天新鲜度窗口（毫秒）。 */
export const FRESH_MS = 30 * 24 * 60 * 60 * 1000;

/** 中文停用词（二元组）与高频口语虚词，抑制「我们/可以/帮我」这类噪声匹配。 */
export const STOP_BIGRAMS: ReadonlySet<string> = new Set([
  "我们", "你们", "他们", "她们", "它们", "可以", "什么", "怎么", "为什么", "这个", "那个",
  "一个", "不是", "没有", "就是", "但是", "因为", "所以", "如果", "然后", "这样", "那样",
  "已经", "还是", "自己", "现在", "时候", "问题", "知道", "感觉", "觉得", "东西", "事情",
  "一下", "真的", "可能", "应该", "需要", "希望", "请问", "谢谢", "关于", "对于",
  "帮我", "我想", "我要", "麻烦", "你好", "您好", "如何", "怎样", "给我",
]);

/** 中文二元组 + 英文单词的关键词抽取（无分词器，滑动二元组近似中文关键词）。 */
export function extractKeywords(text: string): Map<string, number> {
  const freq = new Map<string, number>();
  const add = (raw: string): void => {
    const k = raw.toLowerCase();
    if (!k || k.length < 2 || STOP_BIGRAMS.has(k)) return;
    freq.set(k, (freq.get(k) ?? 0) + 1);
  };
  for (const m of text.matchAll(/[a-zA-Z][a-zA-Z0-9_-]{1,}/g)) add(m[0]);
  const cjk = text.match(/[\u4e00-\u9fa5]{2,}/g) ?? [];
  for (const seg of cjk) for (let i = 0; i < seg.length - 1; i++) add(seg.slice(i, i + 2));
  return freq;
}

/** 词长加权：英文/长词更具体，贡献更大（中文二元组恒为 1，避免过度放大）。 */
export function termWeight(k: string): number {
  if (/[\u4e00-\u9fa5]/.test(k)) return 1;
  return 1 + Math.min(2, Math.log2(k.length) / 2);
}

/** usage 对得分的最大贡献比例（×1.15 封顶；issue #2 / 采纳文档 Q16 的裁决定值 15%）。 */
export const USAGE_BOOST_CAP = 0.15;

/**
 * 综合匹配得分：标题/标签命中权重 2、正文 1，乘词频与词长加权；
 * 相关度为 0 直接不推荐；命中后叠加使用智能——常用度封顶 **15%** 微调
 * （issue #2：相关性最重要，弱相关的高频项不得压过强相关的低频项）。
 */
export function scorePrompt(p: Prompt, kw: Map<string, number>, now: number): number {
  const head = (p.title + " " + (p.tags?.join(" ") ?? "")).toLowerCase();
  const body = p.body.toLowerCase();
  let relevance = 0;
  for (const [k, f] of kw) {
    const w = termWeight(k);
    if (head.includes(k)) relevance += f * 2 * w;
    else if (body.includes(k)) relevance += f * w;
  }
  if (relevance <= 0) return 0;
  const freq = p.usageCount > 0 ? Math.log(1 + p.usageCount) / Math.log(11) : 0;
  const fresh = p.lastUsedAt > 0 && now - p.lastUsedAt < FRESH_MS ? 1 : 0;
  const usage = Math.min(1, freq * 0.6 + fresh * 0.4);
  return relevance * (1 + usage * USAGE_BOOST_CAP);
}

/**
 * 取最近 `count` 条消息的上下文文本：**保序**取尾部 `count` 条，换行拼接后整体 trim。
 *
 * 为什么这半步必须在纯模块里：规格 §7.1.1 把「最近 **3** 条用户消息」写成**确定参数**。参数若只活在
 * 组件的 `.slice(-CONTEXT_USER_COUNT)` 里，它就**没有任何自动化判据**（本仓库无 react-dom / jsdom，
 * 硬约束 5）——改成 1 或删掉 slice，全部用例仍然全绿。这与 D-P8-5 把打分提到纯模块是同一个理由。
 * 「节点 → 文本」那一半是宿主形状（`legacy.nodes` / `UserMessageNode`），仍留在组件里。
 *
 * `count <= 0` 必须是空串：`Array.prototype.slice(-0)` 等价于 `slice(0)`，会返回**全部**——这正是这条
 * 守卫要挡的陷阱。`count` 大于总数时返回全部（`slice` 的自然语义：不抛、不退化为空）。
 */
export function recentUserText(messages: readonly string[], count: number = CONTEXT_USER_COUNT): string {
  if (count <= 0) return "";
  return messages.slice(-count).join("\n").trim();
}

/**
 * 推荐入口。**草稿为空（或只有空白）时一律返回空数组**——这是触发条件，不是优化。
 *
 * 关键词分两层（issue #2 的**草稿词硬门槛**）：一条提示词必须命中至少一个**草稿**关键词才有
 * 资格推荐；会话上下文关键词只并入资格内的**排序**打分池，不得把仅命中上下文词的提示词顶进
 * 推荐条。草稿抽不出任何关键词（全是停用词/单字符等）时整体返回空——无草稿词即无资格。
 */
export function recommend(input: {
  draft: string;
  contextText: string;
  prompts: readonly Prompt[];
  now: number;
}): Prompt[] {
  if (!input.draft.trim()) return [];
  const draftKw = extractKeywords(input.draft);
  if (draftKw.size === 0) return [];
  const kw = new Map(draftKw);
  if (input.contextText) {
    for (const [k, f] of extractKeywords(input.contextText)) {
      kw.set(k, (kw.get(k) ?? 0) + f);
    }
  }
  return input.prompts
    .map((x) => ({ x, score: scorePrompt(x, kw, input.now) }))
    .filter((hit) => draftRelevant(hit.x, draftKw) > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, RECOMMEND_LIMIT)
    .map((hit) => hit.x);
}

/** 只按**草稿**关键词算相关度：> 0 才有推荐资格（硬门槛的判定面）。 */
export function draftRelevant(p: Prompt, draftKw: Map<string, number>): number {
  const head = (p.title + " " + (p.tags?.join(" ") ?? "")).toLowerCase();
  const body = p.body.toLowerCase();
  let relevance = 0;
  for (const [k, f] of draftKw) {
    const w = termWeight(k);
    if (head.includes(k)) relevance += f * 2 * w;
    else if (body.includes(k)) relevance += f * w;
  }
  return relevance;
}
