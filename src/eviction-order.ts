/**
 * 淘汰排序键的**唯一实现**（R59 / F-3）：`aiRefined` 升序 → `lastUsedAt` 升序 → `createdAt` 升序
 * → `id` 升序（规格 §4.4）。
 *
 * 为什么抽出来：这条键序原先在 `src/host/store.ts#enforceMaxCount`（宿主真实淘汰）与
 * `src/client/utils/eviction.ts#previewEvictions`（客户端预检 / 二次确认框）各写一份，逐字同键同序，
 * 靠两侧注释 + 双跑测试维持。本项目**已因两端口径不一致炸过一次**（D-1：确认框列的受害者与
 * 实际被物理删除的对象逐 id 不等，T7 C10 = FAIL），而「两处真源靠注释对齐」正是那次的土壤。
 * 抽成零依赖纯模块后，改键序只需改这一处，两端不可能再漂移。
 *
 * 零依赖：只 `import type`（全局硬约束 8 的「存储层不 import 宿主能力」不受影响——本模块既不是宿主
 * 能力也不是服务，`store.ts` 与客户端 bundle 都能 import）；相对导入带显式 `.ts` 后缀（硬约束 7）；
 * 可擦除 TS（硬约束 6）。故它能被 node --test 直接 import，也能进 esbuild 的客户端 bundle。
 *
 * **必须是全序**（修复轮 1 的评审阻断项）：两端读到的**不是同一顺序的同一份数据**——客户端读
 * `GET /prompts`（宿主 default 排序 = 最新优先），宿主 `enforceMaxCount` 读 `selectAllPrompts()`
 * （无 `ORDER BY` = 插入序）。键并列时 `Array.prototype.sort` 的稳定性只会**各自保持自己的输入序**，
 * 于是两端给出**不同**的受害者；只有最后一键 `id` 唯一，才能让「弹窗列的受害者」与「实际被物理删除
 * 的对象」必然一致。`createdAt` 也可能并列（导入路径把备份里的 `createdAt` 原样写入，见
 * `store.ts#validateBackup`），故 `id` 兜底不是可选项。
 *
 * 行为锁：`tests/eviction.test.mjs` 的双跑对照（`previewEvictions` vs `enforceMaxCount` **逐 id 相等**）
 * 保留不变——它现在守的是「两端被这一个模块共用」，而不只是「两份手抄本恰好一致」。
 */
import type { Prompt } from "./types.ts";

/**
 * §4.4 的淘汰键序（升序）：`aiRefined` 升序 → `lastUsedAt` 升序 → `createdAt` 升序 → `id` 升序。
 *
 * 返回 `Array.prototype.sort` 约定的负数 / 0 / 正数。两端**都只经本函数**排序；任何一处再手抄键序
 * 都会让 D-1 复发的通道重新打开。
 */
export function compareEvictionOrder(a: Prompt, b: Prompt): number {
  return (
    Number(a.aiRefined) - Number(b.aiRefined) ||
    a.lastUsedAt - b.lastUsedAt ||
    a.createdAt - b.createdAt ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}
