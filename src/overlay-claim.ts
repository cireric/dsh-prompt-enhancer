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

/** 会占屏的三个面的**取值全集**（运行时形态；T7-3 的结构锁读它）。顺序即枚举顺序。 */
export const OVERLAY_SURFACES = ["hash", "library", "ai"] as const;

/** 真正会占屏的三种面（由 {@link OVERLAY_SURFACES} 派生 ⇒ 运行时清单与类型不可能各自漂移）。 */
export type OverlaySurface = (typeof OVERLAY_SURFACES)[number];

/** 占屏的四种取值：`none` = 无人占屏；其余三值各自对应一张会话输入区的浮层/面板。 */
export type OverlayKind = OverlaySurface | "none";

/**
 * 判定某个面此刻可否渲染：**同一时刻最多一个 claim**——只有寄存器正持有该 kind 时才放行。
 *
 * 对任意 `kind × claimed` 组合都有确定答案（含 `claimed === "none"`：此时无人占屏，**任何面都不得
 * 渲染**——面自己还得同时满足前置条件）。
 */
export function canRender(kind: OverlaySurface, claimed: OverlayKind): boolean {
  return claimed === kind;
}

// ── `#` 浮层两条 claim effect 的守卫（T7 ③：组件与测试模型**同源**）────────────────
//
// 为什么把这两行提出来（T7 ③）：T1 时代组件（`HashSuggestOverlay.tsx` 的 A/B 两条 effect）与
// `tests/overlay-claim.test.mjs` 的步进模型**各抄一份**同一对算式，于是「删掉守卫」这个变异要在两处
// 分别做，两处也可能各自漂移（本项目反复栽在同一类事上：同一个判定的第二份实现迟早与第一份分叉）。
// 现在两边都 import 这里的函数：一处改动同时被组件接线与模型用例看到；同源锁见
// `tests/overlay-claim.test.mjs`（断言这对算式在 `src/**` 里**只有一份**，且组件只有 import + 调用）。

/**
 * effect **A**（取 + 释放）的守卫：可见就取屏。
 *
 * **刻意不收 `claimed` 参数**：A 的 deps 只有 `[visible]`——这是 R-P7-R 的承重形态（「终止性来自代码
 * 自身的自限性，不来自宿主的批处理语义」）。让调用方为了算这个守卫去读寄存器，等于把寄存器重新塞回
 * A 的依赖里：那正是修复轮 2 拆掉的东西。参数表只有一个布尔量，是本条不变量在**类型上**的那一半。
 */
export function canTakeHash(visible: boolean): boolean {
  return visible;
}

/**
 * effect **B**（只重取）的守卫：可见**且**寄存器此刻不在本面手里。
 *
 * `claimed` **必须是活寄存器的读值**（`getOverlayClaimSnapshot()`），不是本次渲染的快照：B 在提交之后
 * 才跑，快照两个方向都会陈旧，而**致命的是「向上错」**——快照说「已经是 hash」而寄存器其实已归别面 ⇒
 * 守卫判成「不用写」⇒ 漏掉必要的重取 ⇒ 浮层被夺后**永久静默**（见 `HashSuggestOverlay.tsx` 的 B 段）。
 * 反方向「向下漏」无害：那次写会被 store 的同值守卫挡下。
 */
export function canRetakeHash(visible: boolean, claimed: OverlayKind): boolean {
  return visible && claimed !== "hash";
}

// ── 结构清单（T7-3 / P7 §10.4-3：改成结构锁，不再锁源码文本形状）──────────────────────
//
// 测试原先的「同源锁」是**文本锁**：扫全仓找 `!== "hash"` 这个字面形状，再逐行匹配组件里的调用形态。
// 它对注释、换行、改名、抽取常量都过敏——一句提到该表达式的注释就能让它假红（在别的文件里甚至假绿）。
// 现在把「有哪些守卫、分别是谁」做成**导出对象**：锁键集与取值（函数身份 + 形参数），与文本无关。
// **纯新增**：这两个常量只是给同一批函数 / 取值一个命名面，不改变任何行为。

/**
 * `#` 浮层两条 claim effect 的**守卫面**：键集 = 本模块对外承诺的守卫，值 = 守卫函数**本身**。
 * 消费组件（`HashSuggestOverlay.tsx`）与测试模型读的是同一对函数；锁「有几个、分别是谁」。
 */
export const HASH_CLAIM_GUARDS = { canTakeHash, canRetakeHash } as const;
