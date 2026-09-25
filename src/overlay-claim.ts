/**
 * 「任一时刻最多一张浮层/面板在场」的**唯一判定**（TBD-P7-1 的 (a)；修 I2-1 / I2-2 / I2-3）。
 *
 * 为什么要有这个模块：P6 只把「词库面板 × `#` 浮层」一对做成了结构互斥（R55 渲染不变式），另两对的
 * 互斥仍是**指针边沿**——「被激活前已在屏的一方自己」的 `pointerdown` 监听把自己收起。实测（P7 计划
 * §1.4）：AI×`#` 在真实 `Shift+Tab` 回输入框 + 真实键入下 87 帧里 84 帧同屏；AI×词库在真实 `Tab` ×3 +
 * 真实 `Enter`（通道 `detail=0`、**全程无 pointerdown**）下 90/90 帧**全程**同屏、AI 锚点 `z=31` 压住
 * 词库面板 `z=30` 的 **79%** 面积。⇒ 三处局部规则各自为政，任何不产生 pointerdown 的激活都能绕过。
 * 故把「谁占屏」收成一个**共享 claim**：三处渲染门与 `aria-expanded` 读**同一个**派生值，同屏在
 * **结构上**不可能，而不是依赖「先渲染出来再收回」。
 *
 * 零依赖（本文件没有任何 import）：可被 `node --test` 直接 import，也能进 esbuild 的客户端 bundle；
 * 既不是宿主能力也不是服务（全局硬约束 8 不受影响）；相对导入/可擦除 TS 两条（硬约束 6/7）也无需
 * 在此考虑——本模块没有 import、没有需要代码生成的语法。
 *
 * **不变量**：`claimed` 是一个**单值寄存器**，任一时刻至多一个面可渲染。判定是**纯等式**
 * （`canRender(kind, claimed) === (kind === claimed)`）。注意 `claimed === "none"` 表示**无人占屏**，
 * 此时**没有任何面**拿到屏——不是「谁都可以渲染」：每个面的门还要与它自己的前置条件（词库面板的
 * `open` / `#` 浮层的 `visible` / AI 面板的 `status !== 'idle'`）相与；若把 `"none"` 读成「放行」，
 * 两个面就可能在同一帧同时渲染，T5 的 0 帧同屏验收当场失守（`tests/overlay-claim.test.mjs` 逐格
 * 锁住这张真值表）。
 *
 * **仲裁（谁写这个寄存器）不在本模块**：本模块只回答「给定持有者，某面此刻可否渲染」。取/放的纪律
 * （激活即抢屏、长驻状态只取空屏、位移即收回意图、只释放自己持有的、隐藏/卸载即释放）写在
 * `client/utils/ui-state.ts#claimOverlay/releaseOverlay` 的注释与三处消费组件的接线里，并落成
 * task-1-report.md 的判定表（R-P7-H：T5 活体验收的判据来源）。
 */

/** 占屏的四种取值：`none` = 无人占屏；其余三值各自对应一张会话输入区的浮层/面板。 */
export type OverlayKind = "none" | "hash" | "library" | "ai";

/** 真正会占屏的三种面（`none` 不是面，是「寄存器空着」）。 */
export type OverlaySurface = Exclude<OverlayKind, "none">;

/**
 * 判定某个面此刻可否渲染：**同一时刻最多一个 claim**——只有寄存器正持有该 kind 时才放行。
 *
 * 对任意 `kind × claimed` 组合都有确定答案（含 `claimed === "none"`：此时无人占屏，**任何面都不得
 * 渲染**——面自己还得同时满足前置条件）。
 */
export function canRender(kind: OverlaySurface, claimed: OverlayKind): boolean {
  return claimed === kind;
}
