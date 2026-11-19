/**
 * AI 完善结果的纯解析模块 —— 零依赖（不 import LLM / DB / 文件系统 / 宿主包）。
 *
 * 把「模型输出文本 → AI 完善结果」这条路径单独抽出，使其能在「未接入真实 AI」时
 * 用模拟输出直接单测（`tests/text.test.mjs`）。`ai.ts` 复用本模块完成同一段解析。
 */

import { executionLiterals, placeholderLiterals, preservesLiterals } from "./text.ts";

/** AI 完善结果：AI 生成的标题/标签/摘要/正文。 */
export interface AiRefineResult {
  title: string;
  tags: string[];
  summary: string;
  body: string;
  suggestions?: string[];
}

/** 校验模板的必填字段和原文中的受保护内容，并归一标签和可选建议。 */
export function parseRefineResult(text: string, source = ""): AiRefineResult | undefined {
  // The input may be wrapped in a JSON fence or a model's introduction.
  const json = text.trim();
  const start = json.indexOf("{");
  const end = json.lastIndexOf("}");
  if (json.startsWith("[") || start === -1 || end <= start) return undefined;
  try {
    const parsed = JSON.parse(json.slice(start, end + 1)) as Partial<AiRefineResult>;
    const { title, tags, summary, body } = parsed;
    if (typeof title !== "string" || !title.trim() ||
        !Array.isArray(tags) || !tags.every((tag) => typeof tag === "string") ||
        typeof summary !== "string" || typeof body !== "string" || !body.trim() ||
        !preservesLiterals(placeholderLiterals(source), placeholderLiterals(body)) ||
        !preservesLiterals(executionLiterals(source), executionLiterals(body))) {
      return undefined;
    }
    const suggestions = Array.isArray(parsed.suggestions)
      ? [...new Set(parsed.suggestions.flatMap((item) =>
        typeof item === "string" && item.trim() ? [item.trim()] : [],
      ))].slice(0, 3)
      : [];
    return {
      ...(suggestions.length ? { suggestions } : {}),
      title: title.trim(),
      tags: tags.map((tag) => tag.trim()).filter(Boolean).slice(0, 1),
      summary: summary.trim(),
      body: body.trim(),
    };
  } catch {
    return undefined;
  }
}
