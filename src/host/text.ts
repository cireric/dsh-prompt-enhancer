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

/**
 * **元话语收尾信号**：套话行几乎都以标点（冒号/句号）或「结果 / 提示词 / prompt」这类**元词**收尾；
 * 而正文行以内容词收尾。这是把两类行分开的关键判据（见 `isFillerLine`）。
 */
const META_TAIL =
  /([:：。！!?]|以下|如下|结果|版本|提示词|正文|内容|prompt|version|result|below|following|text)$/i;

/** 短行豁免上限：纯寒暄行本来就很短（「好的」「谢谢」「Sure」），超过这个长度就不再当寒暄。 */
const SHORT_LINE_MAX = 6;

/** 首尾各最多剥离的行数（防止把整段正文当套话吃掉）。 */
const STRIP_MAX_LINES = 6;

/**
 * 判断「这一行是不是 AI 套话」。
 *
 * 判据是**两个条件的合取**（刻意不同于上游的「行首命中即剥」）：
 *   1. 行首命中套话模式（{@link AI_OPEN_RE} / {@link AI_CLOSE_RE}）；
 *   2. **且**该行以元话语信号收尾（{@link META_TAIL}），或者它本身就是极短句。
 *
 * 为什么必须加第 2 条——两类失败的代价不对称：
 * - 漏剥一行寒暄 = 可见噪音，用户一眼看见就能删；
 * - 误剥一行正文 = **静默丢内容**，在 AI 自动流程里用户根本看不到，而且不可逆。
 * 上游只做第 1 条，于是「好的提示词应该包含明确的约束」这种正文首行会被整行吃掉。
 * （夹具实测见 `tests/text.test.mjs`：本判据 7/8 剥对真套话、7/7 保留正文；上游是 8/8 但 0/7。）
 */
function isFillerLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (!AI_OPEN_RE.test(t) && !AI_CLOSE_RE.test(t)) return false;
  return META_TAIL.test(t) || [...t].length <= SHORT_LINE_MAX;
}

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

/**
 * 剥离 AI 输出里混入的套话，并**回报被剥掉了什么**。
 *
 * - 整体 Markdown 代码块包裹（``` 或 ```lang ```）；
 * - 紧贴正文首尾、且满足 {@link isFillerLine} 的行，首尾各最多 {@link STRIP_MAX_LINES} 行。
 *
 * 返回 `stripped` 是为了让调用方（`ai.ts`）能把被剥的行写进诊断日志——
 * 「模型到底吐不吐套话」「我们有没有误剥」这两件事从此有据可查，而不是靠猜。
 */
export function stripAiFillerDetailed(text: string): StripResult {
  if (!text) return { text, stripped: [] };

  let out = text.trim();
  const stripped: string[] = [];

  // 去掉整体 Markdown 代码块包裹
  const unfenced = out.replace(/^\s*```[a-zA-Z0-9_+\-.]*\s*\n?([\s\S]*?)\s*\n?```\s*$/, "$1");
  if (unfenced !== out) {
    stripped.push("（整体代码围栏已剥离）");
    out = unfenced.trim();
  }

  const lines = out.split("\n");

  // 从最前剥离开场套话
  let start = 0;
  const maxFront = Math.min(lines.length, STRIP_MAX_LINES);
  while (start < maxFront && isFillerLine(lines[start]!)) {
    stripped.push(lines[start]!.trim());
    start++;
  }

  // 从最后剥离收尾套话
  let end = lines.length;
  while (end - 1 > start && end - start <= STRIP_MAX_LINES && isFillerLine(lines[end - 1]!)) {
    stripped.push(lines[end - 1]!.trim());
    end--;
  }

  return { text: lines.slice(start, end).join("\n").trim(), stripped };
}

/** 剥离套话（只要文本）。语义与 {@link stripAiFillerDetailed} 完全一致。 */
export function stripAiFiller(text: string): string {
  return stripAiFillerDetailed(text).text;
}

/** 抽出正文里的模板变量名（`{{变量名}}`），去重前先 trim 去空。 */
export function extractVariables(body: string): string[] {
  return [...body.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map((m) => m[1]!.trim()).filter(Boolean);
}
