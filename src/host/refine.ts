/**
 * AI 完善结果的纯解析模块 —— 零依赖（不 import LLM / DB / 文件系统 / 宿主包）。
 *
 * 把「模型输出文本 → AI 完善结果」这条路径单独抽出，使其能在「未接入真实 AI」时
 * 用模拟输出直接单测（`tests/text.test.mjs`）。`ai.ts` 复用本模块完成同一段解析。
 */

/** AI 完善结果：AI 生成的标题/标签/摘要/正文。 */
export interface AiRefineResult {
  title: string;
  tags: string[];
  summary: string;
  body: string;
}

/**
 * 从模型输出文本中容错解析出完善结果：
 * - 剥离 Markdown 代码围栏（```json ... ```），截取首个 JSON 对象；
 * - 正文必填，缺失/为空返回 `undefined`（调用方按「AI 完善失败」处理）；
 * - 标签只保留单个（与词库「单个标签」约定一致），去空去空格；
 * - 标题/摘要/正文按原样 trim，**不修改正文中的任何 `{{变量}}`**。
 */
export function parseRefineResult(text: string): AiRefineResult | undefined {
  let json = text.trim();
  const fence = json.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) json = fence[1]!.trim();
  const start = json.indexOf("{");
  const end = json.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return undefined;
  try {
    const parsed = JSON.parse(json.slice(start, end + 1)) as Partial<AiRefineResult>;
    const body = typeof parsed.body === "string" ? parsed.body.trim() : "";
    if (!body) return undefined;
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags.filter((t): t is string => typeof t === "string" && !!t.trim()).map((t) => t.trim())
      : [];
    return {
      title: typeof parsed.title === "string" ? parsed.title.trim() : "",
      // 词库只支持单个标签，这里直接归一为单个，避免调用方各自处理
      tags: tags.slice(0, 1),
      summary: typeof parsed.summary === "string" ? parsed.summary.trim() : "",
      body,
    };
  } catch {
    return undefined;
  }
}
