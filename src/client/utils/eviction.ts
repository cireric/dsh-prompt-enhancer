/**
 * 淘汰预检（R9，纯函数）：客户端复现「再新增一条之后 store.enforceMaxCount 会删掉谁」，
 * 供 §4.4 的二次确认（D-P6-5 / TBD-P6-5 = 客户端预检）使用。
 *
 * ⚠️ 排序键**必须**与 `src/host/store.ts` 的 `enforceMaxCount` 同源，且**必须是全序**：
 *   `aiRefined` 升序 → `lastUsedAt` 升序 → `createdAt` 升序 → `id` 升序。
 * 前两键是 §4.4 的语义（未经人工确认的优先、最久未用的优先）；后两键是**去并列兜底**——
 * 它们不承载语义，只保证「同一集合 → 唯一顺序 → 两端同一批受害者」。
 *
 * 为什么必须补到全序（**修复轮 1，评审阻断项**）：两端读到的**不是同一顺序的同一份数据**——
 * 客户端读 `GET /prompts`（宿主的 default 排序 = 最新优先，见 `store.ts#sortPrompts`），
 * 而 `enforceMaxCount` 读 `selectAllPrompts()`（无 `ORDER BY` = 插入序）。键并列时
 * `Array.prototype.sort` 的稳定性只会**各自保持自己的输入序**，于是两端给出**不同**的受害者。
 * 实测（全为 `aiRefined=false` / `lastUsedAt=0`、createdAt 各异，取 1 名受害者）：
 * 弹窗报「最新的一条」，实际被物理删除的是「最旧的一条」。全序之后受害者只由键决定，
 * 与输入顺序无关。**注意**：`createdAt` 也可能并列（导入路径会把备份里的 `createdAt` 原样写入，
 * `store.ts#validateBackup`），故 `id` 兜底不是可选项。
 *
 * 本模块是纯函数层：只 `import type`，不触达 react / fetch，Node 可直接 import 执行。
 */
import type { Prompt } from "../../types.ts";

/**
 * 模型化「再新增 `incoming` 条」之后 `enforceMaxCount` 会删掉谁（按淘汰先后返回）。
 *
 * 受害者数 = `max(0, prompts.length + incoming - maxCount)`——与宿主
 * 「先落库（`POST /prompts`）再 `enforceMaxCount(maxPromptCount)`」的执行顺序一致。
 */
export function previewEvictions(prompts: Prompt[], maxCount: number, incoming: number = 1): Prompt[] {
  const over = Math.max(0, prompts.length + incoming - maxCount);
  if (over === 0) return [];
  return (
    [...prompts]
      // ⇄ 本键序是 §4.4 的**单一事实源**：与 src/host/store.ts#enforceMaxCount 逐字同键同序，
      //   改任一侧必须同改另一侧（一致性由 tests/eviction.test.mjs 的双跑对照逐 id 锁死）。
      .sort(
        (a, b) =>
          Number(a.aiRefined) - Number(b.aiRefined) ||
          a.lastUsedAt - b.lastUsedAt ||
          a.createdAt - b.createdAt ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      )
      .slice(0, over)
  );
}
