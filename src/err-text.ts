/**
 * 错误 →「给人看的那一行」的**零依赖单一真源**。
 *
 * 此前这条表达式以两种形态重复：7 个组件 / 工具各有同名本地函数 `reasonOf`（逐字相同），
 * 另有 7 处**内联**（`SettingsSection` 一个文件里就写了两遍）。语义一致——`Error` 自带可读
 * message（含承载宿主原文的 `ApiError`），其余类型 `String()` 兜底。
 *
 * **不包含** `src/host/node-sqlite.ts` 那处：它是
 * `typeof warning === "string" ? warning : warning instanceof Error ? warning.message : ""`
 * 的三态强转（还允许空串），不是同一语义，故留在原地。
 *
 * 导出名沿用既有的本地名 `reasonOf`（7 个文件里 28 处调用点因此一字不动），
 * 文件名按仓内惯例取概念名（同 `eviction-order.ts` 导出 `compareEvictionOrder`）。
 *
 * **本模块零 import**：既能被 `node --test` 直接 import，也能同时进两个 bundle。
 */
export function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
