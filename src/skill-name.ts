/**
 * 技能名规则的**零依赖单一真源**（P7 T2 的 R-P7-I 修正）。
 *
 * 为什么要有这个模块：这条规则要**双方共用**，而两个消费者各自的 **bundle 面不同**——
 *   · 宿主 `src/host/skills.ts`：条目在那儿写盘，但它顶部 `import ... from "node:fs"`；
 *   · 客户端 `SkillExportModal`：导出前要**提前报错**（先用同一份规则预校验，最终判定仍以宿主为准）。
 * 客户端 bundle 引用不了 `node:fs`（浏览器 / `__ModuleLoader__` 沙箱里没有它，且硬约束 12 只允许
 * `react` / `react/jsx-runtime` 两个 external），故规则不能留在 `skills.ts` 里——
 * 否则要么客户端跑不起来，要么被迫写第二份判定（两处真源必然漂移）。
 *
 * **本模块零 import**（与 `overlay-claim.ts` 同款）：既能被 `node --test` 直接 import（测试直跑
 * `.ts` 源码），也能进 esbuild 的客户端 bundle；硬约束 6/7（可擦除 TS / 显式 `.ts` 后缀）无需在此考虑。
 *
 * `src/host/skills.ts` 改为从这里 import 并 **re-export** 四个名字——既有导出面逐字不变
 * （`tests/skills.test.mjs` 与 `routes.ts` 因此无需改动），客户端另经
 * `src/client/utils/skill-export.ts` 消费同一份规则。
 */

/** 技能名的严格形态：纯小写 kebab（官方 loader 只接受 [a-z0-9-]，且目录名即触发名）。 */
export const SKILL_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** 技能名长度上限（目录名不宜过长）。 */
export const SKILL_NAME_MAX_LEN = 64;

/**
 * 把候选名 kebab 化，供 AI 生成的 `"Weekly Report"` 这类输入使用。
 *
 * ⚠️ 含路径分隔符或 `..` 的输入一律返回空串（=拒绝），**不做猜测性修正**：
 * 「`../evil` 被悄悄改成 `evil` 再写盘」虽然路径安全，但会掩盖调用方的结构错误。
 */
export function toKebab(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/[/\\]/.test(trimmed) || trimmed.includes("..")) return "";
  return trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** 写入前的最后一道闸：只接受严格 kebab（路径穿越在这一步被彻底挡死）。 */
export function isValidSkillName(name: string): boolean {
  return name.length > 0 && name.length <= SKILL_NAME_MAX_LEN && SKILL_NAME_RE.test(name);
}
