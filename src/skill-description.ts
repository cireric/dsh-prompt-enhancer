/**
 * description 兜底链的**零依赖单一真源**。
 *
 * 为什么要有这个模块：这条链要 host / client **双方共用**，而两个消费者各自的 bundle 面不同——
 *   · 宿主 `src/host/skills.ts`：最终判定在那儿落盘，但它顶部 `import ... from "node:fs"`；
 *   · 客户端 `src/client/utils/skill-export.ts`：导出前要**提前报错**（`precheckExport`）。
 * 客户端 bundle 引用不了 `node:fs`（浏览器 / `__ModuleLoader__` 沙箱里没有它），故规则不能留在
 * `skills.ts` 里——否则要么客户端跑不起来，要么被迫写第二份判定。此前那第二份正是
 * `resolveDescriptionForClient`，靠 `tests/skill-export.test.mjs` 的一张逐格对照表维持与宿主同值；
 * 合并后该表换成 `tests/skill-badge.test.mjs` 的**函数恒等锁**（`skill-name` / `skill-badge` 同款）。
 *
 * **本模块零 import**（与 `src/skill-name.ts` / `src/skill-badge.ts` / `src/overlay-claim.ts` 同款）：
 * 既能被 `node --test` 直接 import（测试直跑 `.ts` 源码），也能进 esbuild 的客户端 bundle；
 * 硬约束 10/11（可擦除 TS / 显式 `.ts` 后缀）在此无需特殊处理。
 * 宿主 `src/host/skills.ts` 改为 import + **re-export**——既有导出面逐字不变。
 *
 * ⚠️ `body.split("\n")` 是**刻意保留**的既有行为：`\r`-only 正文不切分（整串当作一个「首行」再 trim）。
 * 另外三处（`capture.ts` / `ai-flow.ts` / `PromptManagerModal.tsx`）已在审查 #7 收敛到
 * `src/first-line.ts#firstNonEmptyLine`（方言 `/\r\n|\n|\r/`）；本处**不跟着换**——统一它是**产品行为
 * 变化**（`\r`-only 正文的 description 取值会变），不是重构，故单独决策。
 */

/** 兜底链只读这三个字段：宿主 `SkillPromptLike` 与客户端 `SkillCandidate` 都结构兼容。 */
export interface DescriptionCarrier {
  title: string;
  body: string;
  summary?: string;
}

/** AI 描述的窄面：宿主 `SkillDescriptor` 与客户端 `SkillDescriptorPayload` 都结构兼容。 */
export interface DescriptorLike {
  description?: string;
}

/**
 * description 兜底链：summary → AI description → 正文首个非空行 → 标题。
 * 全空则返回 `undefined`——调用方**必须拒绝导出**（官方 loader 要求 description 必填，
 * 空描述会让模型无法自动发现该技能；上游直接写空串是缺陷）。
 */
export function resolveDescription(prompt: DescriptionCarrier, descriptor?: DescriptorLike): string | undefined {
  const candidates = [
    prompt.summary,
    descriptor?.description,
    prompt.body.split("\n").map((l) => l.trim()).find((l) => l.length > 0),
    prompt.title,
  ];
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value) return value;
  }
  return undefined;
}
