/**
 * AI 调用的**总预算**（2026-10-03 审查 R3）。
 *
 * 缺陷背景：单次尝试有 30s 超时，但一次能力会把「候选轮询 × 诊断重试」全跑一遍——
 * 最坏 = 候选数 × 30s × 2；两个 provider 就是 120s，三个 180s。而客户端的
 * `AI_TIMEOUT_MS` 是 120s（src/client/utils/api.ts:12），于是**宿主还在烧模型额度时用户已经
 * 看到超时**；`withLlmLock` 的全局串行锁让排队中的第二个请求继续叠加这个差值。
 *
 * 收口方式：一次能力（润色 / 完善 / 摘要 / 技能描述符）只拿一个 `AiBudget`，每次尝试的超时取
 * `min(单次上限, 剩余预算)`——候选与重试再多也超不过总预算。预算从能力入口（而不是从拿到锁的
 * 那一刻）开始计时，故排队等待也算在里面。
 *
 * 本模块零依赖（不 import 宿主包 / node:*），可被 node --test 直接 import。
 */

/** 单次候选尝试的超时（沿用既有 30s，不随总预算变化）。 */
export const AI_ATTEMPT_TIMEOUT_MS = 30_000;

/**
 * 一次能力的总墙钟预算。必须是**严格小于**客户端 AI 超时的值——留出的差值是传输与解析的余量，
 * 该不变量由 `tests/ai-budget.test.mjs` 跨层钉住（它直接 import 客户端的 AI_TIMEOUT_MS）。
 */
export const AI_TOTAL_BUDGET_MS = 110_000;

/** 一次能力的预算：只记截止时刻，不记剩余（避免调用方各自算出不同答案）。 */
export interface AiBudget {
  readonly deadline: number;
}

/** 开一份预算；`now` 可注入（测试），语义与 `ai-cache.ts#AiResultCache` 的时钟注入一致。 */
export function startAiBudget(totalMs: number = AI_TOTAL_BUDGET_MS, now: number = Date.now()): AiBudget {
  return { deadline: now + Math.max(0, totalMs) };
}

/** 剩余预算（ms）；负数表示已超支。 */
export function remainingMs(budget: AiBudget, now: number = Date.now()): number {
  return budget.deadline - now;
}

/**
 * 下一次尝试可用的超时：`min(单次上限, 剩余预算)`。
 *
 * 返回 **0 = 预算耗尽**，调用方**必须停止**（不得再发请求、不得再等下一个候选）——
 * 0 不是「立刻超时的一次尝试」，把它传给 `AbortSignal.timeout` 只会白打一次调用。
 */
export function attemptTimeoutMs(budget: AiBudget, now: number = Date.now()): number {
  const left = remainingMs(budget, now);
  return left <= 0 ? 0 : Math.min(AI_ATTEMPT_TIMEOUT_MS, left);
}
