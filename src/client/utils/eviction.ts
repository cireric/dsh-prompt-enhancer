/**
 * 淘汰预检（R9，纯函数）：客户端复现「再新增一条之后 store.enforceMaxCount 会删掉谁」，
 * 供 §4.4 的二次确认（D-P6-5 / TBD-P6-5 = 客户端预检）使用。
 *
 * ⚠️ **R45（T8）之后本函数与宿主逐 id 精确一致**：宿主的真实序列是「先 createPrompt（插入）→
 * 再 `enforceMaxCount(max, { exceptId: created.id })`」，即**新项永不成为本次创建的受害者**，
 * 于是宿主实际参与排序的候选集**恰好就是本函数拿到的这个插入前集合**，受害者的**数量**
 * 也按含新项的全集算（= `prompts.length + incoming - maxCount`）。
 * 旧实现没有 `exceptId`：新项（`aiRefined=false`, `lastUsedAt=0`）是候选最小元 → 被删的
 * 正是刚保存的那条，而本函数只能列出既有条目 → 确认框撒谎（T7 C10 = D-1）。
 * 因此本函数**不需要**为新语义改动：它本来就是「插入前集合 + 含新项的计数」这个精确模型。
 * 详见 `src/host/store.ts#enforceMaxCount` 的 R45 段。
 * ⚠️ 排序键的**唯一实现**在 `src/eviction-order.ts#compareEvictionOrder`（R59 / F-3：原先本文件与
 * `src/host/store.ts#enforceMaxCount` 各写一份「逐字同键同序」，靠注释对齐——本项目已因两端口径不一致
 * 炸过一次（D-1），故抽成共享模块，两端 import 同一个比较器），且**必须是全序**：
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
import { compareEvictionOrder } from "../../eviction-order.ts";
import type { Prompt } from "../../types.ts";

/**
 * 模型化「再新增 `incoming` 条」之后 `enforceMaxCount` 会删掉谁（按淘汰先后返回）。
 *
 * 受害者数 = `max(0, prompts.length + incoming - maxCount)`——**含**新项（宿主 R45 的计数口径
 * 就是全集：`all.length - maxCount`）；候选只从传入的这个插入前集合里取（新项被 `exceptId` 豁免，
 * 本就不在集合里）。两者相加即宿主的真实语义，见文件头 R45 段。
 */
export function previewEvictions(prompts: Prompt[], maxCount: number, incoming: number = 1): Prompt[] {
  const over = Math.max(0, prompts.length + incoming - maxCount);
  if (over === 0) return [];
  return (
    [...prompts]
      // ⇄ 比较器来自 `src/eviction-order.ts`（**唯一实现**，与 store.ts#enforceMaxCount 同一个）：
      //   本处不再手抄键序，改键序请改那个模块。
      //   一致性由 tests/eviction.test.mjs 的双跑对照逐 id 锁死（保留）。
      .sort(compareEvictionOrder)
      .slice(0, over)
  );
}
