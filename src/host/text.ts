/**
 * 通用文本工具（host 侧共享，**纯模块**：无宿主依赖、无网络、无副作用）。
 *
 * 本模块承载 AI 输出的后处理（规格 §6.4），因此可以脱离 LLM 单测——
 * 这是规格把 `tests/text.test.mjs` 单列出来的原因。`ai.ts` 只负责调用 LLM，
 * 解析与清洗一律落在这里。
 */

// Only remove complete greetings or introductions. Their prefixes can also start real instructions.
const GREETING = /^(?:好的?|好的呢|没问题|收到|可以|谢谢|感谢|sure|of course|no problem|thanks|thank you|hi|hello)[。.!！]?$/i;
const INTRO =
  /^(?:(?:(?:好的?|没问题|收到|可以)[，,、!！]\s*)?(?:以下是我的|(?:以下|下面)(?:是|为)(?:(?:为)?[你您](?:的)?)?(?:优化|润色|完善|整理|改写)(?:后|好)?的?(?:版本|版|结果|建议|提示词(?:正文)?|正文)|结果如下)|(?:(?:sure|of course|no problem)[,!.]\s*)?(?:here|below) (?:is|are) the (?:polished|optimized|improved|revised|updated|cleaned) (?:prompt|version|text|result))[:：。.!！]?$/i;
const FAREWELL = /^(?:希望这对[你您]有帮助[。！]|(?:如有|如果有)(?:任何)?(?:问题|疑问)[，,]\s*请(?:告诉我|随时联系我)[。！]?|let me know if you need anything else[.!])$/i;
const STRIP_MAX_LINES = 6;

/** 去掉 UTF-8 BOM（Windows 记事本/PowerShell 等工具可能写入），避免首字符解析失败。 */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** {@link stripAiFillerDetailed} 的结果：清洗后的文本 + 被剥掉的行（供诊断日志留痕）。 */
export interface StripResult {
  text: string;
  /** 被剥离的原始行（已 trim）；首项可能是「（整体代码围栏已剥离）」这样的说明。 */
  stripped: string[];
}

/** Remove wrapper text and keep matching lines or a fenced example from the user's source. */
export function stripAiFillerDetailed(text: string, source = ""): StripResult {
  let out = text.trim();
  const stripped: string[] = [];
  const fenced = out.match(/^```[a-zA-Z0-9_+.\-]*[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?```[ \t]*$/);
  const enclosed = fenced?.[1] ?? "";
  if (fenced && !source.trim().startsWith("```") && !/^ {0,3}```/m.test(enclosed)) {
    stripped.push("（整体代码围栏已剥离）");
    out = enclosed.trim();
  }

  const lines = out.split("\n");
  const original = new Set(source.split("\n").map((line) => line.trim()));
  let start = 0;
  let end = lines.length;
  while (start < Math.min(end, STRIP_MAX_LINES)) {
    const line = lines[start]!.trim();
    if (original.has(line) || (!GREETING.test(line) && !INTRO.test(line))) break;
    stripped.push(line);
    start++;
    while (start < end && !lines[start]!.trim()) start++;
  }
  let trailing = 0;
  while (end > start && trailing < STRIP_MAX_LINES) {
    const line = lines[end - 1]!.trim();
    if (original.has(line) || (!GREETING.test(line) && !FAREWELL.test(line))) break;
    stripped.push(line);
    end--;
    trailing++;
    while (end > start && !lines[end - 1]!.trim()) end--;
  }

  return { text: lines.slice(start, end).join("\n").trim(), stripped };
}

/** 剥离套话（只要文本）。语义与 {@link stripAiFillerDetailed} 完全一致。 */
export function stripAiFiller(text: string): string {
  return stripAiFillerDetailed(text).text;
}

const PLACEHOLDER = /\{\{\s*([^{}]+?)\s*\}\}/g;

/** 抽出正文里的模板变量名（`{{变量名}}`），去重前先 trim 去空。 */
export function extractVariables(body: string): string[] {
  return [...body.matchAll(PLACEHOLDER)].map((match) => match[1]!.trim()).filter(Boolean);
}

export function placeholderLiterals(body: string): string[] {
  return [...body.matchAll(PLACEHOLDER)].filter((match) => match[1]!.trim()).map((match) => match[0]);
}

export function preservesLiterals(original: readonly string[], candidate: readonly string[]): boolean {
  const counts = new Map<string, number>();
  for (const literal of candidate) counts.set(literal, (counts.get(literal) ?? 0) + 1);
  for (const literal of original) {
    const count = counts.get(literal) ?? 0;
    if (count === 0) return false;
    counts.set(literal, count - 1);
  }
  return true;
}

// Prose has no lossless equivalence check. Protect verbatim literals and explicit permission clauses.
const CODE = /`+[^`\r\n]+`+/g;
const FENCED_CODE = /^ {0,3}(`{3,}|~{3,})[^\r\n]*\r?\n[\s\S]*?^ {0,3}\1[ \t]*$/gm;
const COMMAND = /\b(?:(?:npm|pnpm|yarn|bun)\s+run[ \t]+[\w:.\-]+|(?:git|npm|pnpm|yarn|bun|docker|kubectl|cargo|pip)\b[ \t]+[\w\-]+)(?:[ \t]+--?[\w\-]+)*/g;
const PATH = /(?:[A-Za-z]:[\\/]|(?:https?:\/|\.{1,2}|~)?\/|\b[\w.\-]+[\\/])(?:[\w.\-]+[\\/])*[\w.\-]+/g;
const PERMISSION = /(?:未经|不许|不得|禁止|严禁|不允许|不要|只允许|仅限|必须|等待[^。；！？\r\n]{0,24}?确认|等[^。；！？\r\n]{0,24}?确认后|\b(?:do not|must not|never|only|must|without (?:prior )?(?:approval|confirmation)|wait for (?:my |user )?(?:approval|confirmation))\b)(?:[^.。；！？\r\n;!?]|\.(?!\s|$))*/giu;

export function executionLiterals(body: string): string[] {
  return [
    ...[...body.matchAll(CODE)].map((match) => match[0].replace(/^`+|`+$/g, "")),
    ...[...body.matchAll(FENCED_CODE)].map((match) => match[0]),
    ...[...body.matchAll(COMMAND)].map((match) => match[0]),
    ...[...body.matchAll(PATH)].map((match) => match[0].replace(/\.+$/, "")),
    ...[...body.matchAll(PERMISSION)].map((match) => match[0].trim()),
  ];
}
