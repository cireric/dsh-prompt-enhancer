/**
 * 淘汰预检（R9，纯函数）：客户端复现「再新增一条之后 store.enforceMaxCount 会删掉谁」，
 * 供 §4.4 的二次确认（D-P6-5 / TBD-P6-5 = 客户端预检）使用。
 *
 * ⚠️ 排序键**必须**与 `src/host/store.ts` 的 `enforceMaxCount` 同源：
 *   第一键 `aiRefined` 升序（未经人工确认的优先），第二键 `lastUsedAt` 升序（最旧优先）。
 * 两端各有一行互指注释，一致性由 `tests/eviction.test.mjs` 的「双跑对照」逐 id 锁死。
 *
 * 本模块是纯函数层：只 `import type`，不触达 react / fetch，Node 可直接 import 执行。
 */
import type { Prompt } from "../../types.ts";

/**
 * 模型化「再新增 `incoming` 条」之后 `enforceMaxCount` 会删掉谁（按淘汰先后返回）。
 *
 * 受害者数 = `max(0, prompts.length + incoming - maxCount)`——与宿主
 * 「先落库（`POST /prompts`）再 `enforceMaxCount(maxPromptCount)`」的执行顺序一致。
 *
 * 稳定性：同 `aiRefined` 且同 `lastUsedAt` 时的先后由 `Array.prototype.sort` 的稳定性
 * （ES2019 起规范强制）保证，即输入数组的先后即中选次序；两端读同一份数据即得同一结果。
 */
export function previewEvictions(prompts: Prompt[], maxCount: number, incoming: number = 1): Prompt[] {
  const over = Math.max(0, prompts.length + incoming - maxCount);
  if (over === 0) return [];
  return (
    [...prompts]
      // ⇄ 同源排序键：与 src/host/store.ts#enforceMaxCount 逐键对应（改一处必改另一处）
      .sort((a, b) => Number(a.aiRefined) - Number(b.aiRefined) || a.lastUsedAt - b.lastUsedAt)
      .slice(0, over)
  );
}
