/**
 * 统一 AI 错误码 + 诊断注入重试（Issue #4 / T3）。
 *
 * 分层（规格 §6.2 失败面的升级）：
 * - host（本模块 + `ai.ts`）：失败不再只回 `undefined`，一律带**结构化 code**；
 * - 路由：AI 失败信封扩为 `{ ok:false, error:{ code, message? } }`——code 是跨层枚举（本模块定义），
 *   message 仅作开发诊断（宿主**零用户文案**承诺：面向用户的句子只存在于客户端字典）；
 * - client：`api.ts` 解析 code，`ai-flow.ts` 把 code 映射成 i18n 键（zh/en 键集全等）。
 *
 * 本模块零依赖（不 import 宿主包 / node:*），可在 node --test 下直接单测。
 */

/** 跨层 AI 错误码（code 是契约，拼写恒定；文案在客户端字典 `i18n.ts` 的 `ai.code.*` 键）。 */
export type AiErrorCode =
  | "no-llm" // 宿主未注入 LLM runtime（未配置模型能力）
  | "route" // 没有任何可用候选路由
  | "timeout" // 每候选 30s 超时（AbortSignal.timeout 到点 / finish=aborted）
  | "empty-output" // 模型调用「成功」但没返回任何文本
  | "parse" // 文本拿到了但不是合法 JSON
  | "schema-mismatch" // JSON 合法但缺必要字段（如 refine 的 body / descriptor 的 name）
  | "unknown"; // 未归类失败（流抛错 / finish=error 等），客户端给通用文案

/** 一次 AI 调用的失败形态：code 跨层传递，detail 只进开发日志 / 开发诊断信封。 */
export interface AiFailure {
  code: AiErrorCode;
  /** 开发诊断细节（单行）；仅进日志与 dev 信封，**不得**变成面向用户的文案。 */
  detail?: string;
}

/** 单次候选调用的结果：拿到文本，或带回失败形态。 */
export type AiAttempt = { ok: true; text: string } | { ok: false; failure: AiFailure };

/** 一项 AI 能力的结果：成功带文本；失败带跨层 code。 */
export type AiCallResult = { ok: true; text: string } | { ok: false; code: AiErrorCode; detail?: string };

/** 构造失败形态（detail 统一压成单行，便于日志与信封）。 */
export function attemptFailure(code: AiErrorCode, detail: string): AiFailure {
  return { code, detail: detail.replace(/\s+/g, " ").slice(0, 200) };
}

/**
 * 失败诊断块（拼进**重试请求**的 user 消息；诚实披露，方便模型自纠）。
 * 只依赖 code 与 detail，不引用任何宿主文案。
 */
export function failureDiagnosis(failure: AiFailure): string {
  return [
    "上一次尝试失败了，本次请修正：",
    "- 失败类型：" + failure.code,
    ...(failure.detail ? ["- 失败细节：" + failure.detail] : []),
    "- 上一次的原始输出很可能是空回复、非 JSON 文本或 JSON 缺字段；本次请严格输出一个 JSON 对象，不要 Markdown 代码块，不要任何解释或多余文字。",
  ].join("\n");
}

/**
 * 诊断注入重试（T3）：包在**整层候选轮询外**，只重试一次。
 *
 * - 首试成功 → 原样返回，绝不发第二次请求；
 * - 首试失败 → 重试一次，重试请求的 user 消息**携带上次失败诊断**（`failureDiagnosis`）；
 * - 仍失败 → 返回**最终那次**的 code / detail（若重试换了一种失败形态，以重试的为准）。
 *
 * 重试与否由调用方（`ai.ts`）按能力决定：技能描述符有自己的 3 轮循环，不再叠加本重试。
 */
export async function withDiagnosticRetry(
  attempt: (diagnosis?: string) => Promise<AiAttempt>,
): Promise<AiCallResult> {
  const first = await attempt();
  if (first.ok) return { ok: true, text: first.text };
  const second = await attempt(failureDiagnosis(first.failure));
  if (second.ok) return { ok: true, text: second.text };
  return second.failure.detail === undefined
    ? { ok: false, code: second.failure.code }
    : { ok: false, code: second.failure.code, detail: second.failure.detail };
}
