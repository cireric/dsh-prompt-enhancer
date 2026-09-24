/**
 * 通用文本工具（host 侧共享，**纯模块**：无宿主依赖、无网络、无副作用）。
 *
 * 本模块承载 AI 输出的后处理（规格 §6.4），因此可以脱离 LLM 单测——
 * 这是规格把 `tests/text.test.mjs` 单列出来的原因。`ai.ts` 只负责调用 LLM，
 * 解析与清洗一律落在这里。
 */

/** 命中即视为「AI 套话」整行的开场行（中文 + 英文；整行匹配，避免误删正文内部）。 */
const AI_OPEN_RE =
  /^(好的?|好的呢|没问题|收到|可以|想到了|毕竟是|这是我的|这是我(为[你您])?(优化|润色|完善|整理|改写)?(后|好的?|的|成的|版)?|以下为?(你|您)?(的)?(优化|润色|完善|整理|改写)?(后|好的?|的|成的|版|结果|建议)?|下面是?(的)?|以下是?[你您]?(的)?|这会?是|为你?|为您?|已(经)?为[你您]|已为你|结果如下|如下|示例如下|请[你您]查收|我给[你您]|回答完毕|帮你|现在为[你您]|给你(的)?)|^(hello|hi\b|hey\b|sure|of\s+course|no\s+problem|here(?:\s|'s| is)|below\b|this\s+is|the\s+(polished|optimized|improved|revised|updated|cleaned|final|better)\s+version|i(?:'ve| have| am)?(?: prepared| optimized| provided| polished| revised| improved| updated)?|please\s+find|glad\s+to\s+help|conforme?d)/i;

/** 命中即视为「AI 套话」整行的收尾行（中文 + 英文；整行匹配）。 */
const AI_CLOSE_RE =
  /^(希望(?:能|对)?[你您]?|如有(?:任何)?|如果(?:有|需要|你)|倘若|有问题|有任何|祝你?|祝您|以上(?:是)?|仅供|谢谢|感谢|需要|如需|有需要|敬请|请继续|随时|以下是根据|我[可能已经]?可以|加油|总体来说|总而言之|只需|您可以在|您可以按|有任何需要)|^(hope|i\s+hope|let\s+me\s+know|if\s+you\s+need|feel\s+free|thanks|thank\s+you|regards|best\s+regards|good\s+luck|please\s+(?:feel\s+free|let\s+me|don't|do\s+not\s+hesitate)|any\s+questions|do\s+not\s+hesitate)/i;

/** 去掉 UTF-8 BOM（Windows 记事本/PowerShell 等工具可能写入），避免首字符解析失败。 */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * 去除 AI 输出正文里混入的「套话」：
 * - 整体 Markdown 代码块包裹（``` 或 ```lang ```）；
 * - 最前 / 最后的整行寒暄、说明、署名（开场白 / 结束语）。
 *
 * 仅剥离紧贴正文首尾、且命中套话特征的行；**正文内部的围栏与空行不动**。
 *
 * ⚠️ 已知局限（上游既有行为，本版按规格「搬运」保留，见 P3 计划风险 R-P3-7）：
 * 两个正则只有行首锚定、没有行尾锚定，因此正文首行/末行若恰好以「好的」「可以」
 * 「需要」这类词**开头**（即使后面是正常内容）也会被剥掉一行。
 */
export function stripAiFiller(text: string): string {
  if (!text) return text;
  let out = text.trim();
  // 去掉整体 Markdown 代码块包裹
  out = out.replace(/^\s*```[a-zA-Z0-9_+\-.]*\s*\n?([\s\S]*?)\s*\n?```\s*$/, "$1").trim();
  const lines = out.split("\n");

  // 从最前剥离开场套话（最多 6 行）
  let start = 0;
  const maxFront = Math.min(lines.length, 6);
  while (start < maxFront && AI_OPEN_RE.test(lines[start]!.trim())) start++;

  // 从最后剥离收尾套话（最多 6 行）
  let end = lines.length;
  while (end - 1 > start && end - start <= 6 && AI_CLOSE_RE.test(lines[end - 1]!.trim())) end--;

  return lines.slice(start, end).join("\n").trim();
}

/** 从模型输出中容错解析用途摘要 JSON（容忍 ```json 包裹 / 前后杂质）；失败返回 undefined。 */
export function parseSummaryJson(text: string): string | undefined {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1]! : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) return undefined;
  try {
    const obj = JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
    const summary = typeof obj.summary === "string" ? obj.summary.trim() : "";
    return summary || undefined;
  } catch {
    return undefined;
  }
}

/** 抽出正文里的模板变量名（`{{变量名}}`），去重前先 trim 去空。 */
export function extractVariables(body: string): string[] {
  return [...body.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map((m) => m[1]!.trim()).filter(Boolean);
}
