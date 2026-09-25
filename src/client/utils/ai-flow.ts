/**
 * AI 优化 / 完善的纯逻辑层：不触达 fetch、不依赖 React，可直接脱离宿主单测。
 *
 * 只以 `import type` 引用 api.ts 的类型——运行期值一律不 import，避免把 HTTP 依赖带进本模块；
 * 错误分类按「HTTP status / err.name」判定，不匹配 message 文本（宿主文案可改）。
 */
import type { Prompt, PromptWritablePatch } from "../../types.ts";
import type { AiRefineResult } from "./api.ts";
import { clampTitle } from "../../types.ts";
import { needsValues } from "./template.ts";

/** keepVariables 开关口径：草稿含 `{{变量}}` 才勾选；`{{}}` / `{{   }}` 不算（复用 parseVariables 口径）。 */
export function keepVariablesFor(draft: string): boolean {
  return needsValues(draft);
}

/** 落到提示词库的入参：body 用**原文**（AI 完善稿只进输入框），title 走 clampTitle，tags 最多 1 个。 */
export function libraryCreateInput(refined: AiRefineResult, originalDraft: string): {
  title: string;
  body: string;
  tags: string[];
  summary: string;
} {
  // 兜底取**首个非空行**：草稿以空行开头（先回车再打字）时 [0] 是空串，落库 title 就会是空的；
  // 整份草稿全空白时没有任何可用标题（返回空串，不抛）。
  // trim 不可省：`"\n  标题"` 的首个非空行带前导空白，不 trim 就会把空格写进 title（P5 延期 #2 / A4）。
  const firstLine = (originalDraft.split(/\r\n|\n|\r/).find((line) => line.trim() !== "") ?? "").trim();
  return {
    // AI 标题只有空白字符时等于没给标题：判据用 trim，兜底后才交给 clampTitle。
    title: clampTitle(refined.title.trim() || firstLine),
    body: originalDraft,
    tags: refined.tags.slice(0, 1),
    summary: refined.summary,
  };
}

/** 完善稿与原文不同才需要写回（对应 store.ts 的 sourceBody 写回边界：相同则不动 body）。 */
export function needsWriteBack(refinedBody: string, originalDraft: string): boolean {
  return refinedBody !== originalDraft;
}

// ── §4.4 写回缝（P7 T4 修复轮 1：方向**真正可知**之处，顺手播种）────────────────────

/** `updatePrompt` 的窄接口（真实现 = `api.updatePrompt`；本模块不 import 它的运行期值）。 */
export type PromptUpdater = (id: string, patch: PromptWritablePatch & { aiWriteBack?: boolean }) => Promise<Prompt>;

export interface WriteBackInput {
  promptId: string;
  /** 写回的正文（= AI 优化稿）。 */
  body: string;
  /** 第一步：宿主的 `store.updatePrompt` 在此回填 `sourceBody = 旧 body` 并置 `aiRefined`。 */
  update: PromptUpdater;
  /**
   * 第二步：把方向 `refined` 种进 meta（真实现 = `refined-direction.ts#seedRefinedDirection`）。
   * 内部只 warn、不抛——一次 meta 写失败不得把**已经成功**的写回变成失败。
   */
  seed: (promptId: string) => Promise<void>;
}

/**
 * §4.4 写回缝的**唯一编排**（组件不再自己拼 `aiWriteBack: true`）：写入优化稿，成功后**播种方向**。
 *
 * 为什么写回缝是「方向真正可知」之处：宿主的回填意味着「此刻的 `body` 就是那一次写回的优化稿」，
 * 于是 `refined` 是一条**事实**而不是推断（对比 R-P7-AC 弃用的 `aiRefined` 兜底：那条推断在
 * 「切换过奇数次」的旧记录上恰好反相，且会被下一次切换固化成反相，用户任何操作都修不好）。
 *
 * 顺序不可交换：**只有写回成功才播种**。写回失败 ⇒ 宿主没回填 `sourceBody`、第二侧可能根本
 * 不存在，此时种一条方向记录就是凭空造事实。第一步抛错照旧抛给调用方（面内 `ai.writeBackFail`）。
 */
export async function writeBackRefined(input: WriteBackInput): Promise<Prompt> {
  const updated = await input.update(input.promptId, { body: input.body, aiWriteBack: true });
  try {
    await input.seed(input.promptId);
  } catch (err) {
    // 播种失败**不得**把一次已经成功的写回变成失败（否则面内会误报 `ai.writeBackFail`，用户会以为
    // 优化稿没写回）。真实现（`seedRefinedDirection`）内部本就不抛；这里是防注入实现把它捅穿。
    console.warn("[prompt-enhancer] 写回成功但方向记录播种失败（重开详情页会退回中性标注）", err);
  }
  return updated;
}

/** 是否可切换「原文 ↔ 优化稿」：sourceBody 非空（与 store.ts 回滚守卫一致）。 */
export function canToggle(current: Pick<Prompt, "sourceBody">): boolean {
  return Boolean(current.sourceBody);
}

function errorName(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const name = (err as { name?: unknown }).name;
  return typeof name === "string" ? name : undefined;
}

function statusOf(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null || !("status" in err)) return undefined;
  const status = (err as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

/** 客户端 toast 文案的 i18n key：超时 / AI 不可用 / 其它失败。 */
export function aiErrorKey(err: unknown): "ai.timeout" | "ai.unavailable" | "ai.fail" {
  if (errorName(err) === "TimeoutError") return "ai.timeout";
  if (statusOf(err) === 503) return "ai.unavailable";
  return "ai.fail";
}
