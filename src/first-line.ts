/**
 * 「取正文的首个非空行」的**零依赖单一真源**（审查 #7）。
 *
 * 为什么单独成文件：这条判定此前有**四份**实现——`client/utils/capture.ts`、
 * `client/utils/ai-flow.ts`、`components/PromptManagerModal.tsx` 三份**逐字相同**（都用
 * `/\r\n|\n|\r/` 切分），`skill-description.ts` 是第四份且方言不同（`split("\n")`，CR-only 正文
 * 不切分）。同一口径的第二份实现迟早分叉（本仓已因两端口径不一致炸过一次），故把前三条收敛到这里。
 *
 * ⚠️ `skill-description.ts` **刻意不收敛**：换方言是**产品行为变化**（CR-only 正文的 description
 * 取值会变），按 #7 的裁决单独决策，不在这条收敛里顺手做。
 *
 * 本模块零 import：既能被 `node --test` 直接 import，也能进 esbuild 的客户端 bundle；
 * 硬约束 10/11（可擦除 TS / 显式 .ts 后缀）在此无需特殊处理。
 */

/**
 * 首个非空行（已 trim）；整份文本全为空白时返回空串。
 *
 * 换行口径与调用方的既有实现逐字一致：`\r\n` / `\n` / `\r` 三种都算换行——
 * 只认 `\n` 会让 CR-only 的正文（某些编辑器/粘贴路径会产生）整段被当成一行。
 */
export function firstNonEmptyLine(text: string): string {
  const line = text.split(/\r\n|\n|\r/).find((candidate) => candidate.trim() !== "") ?? "";
  return line.trim();
}
