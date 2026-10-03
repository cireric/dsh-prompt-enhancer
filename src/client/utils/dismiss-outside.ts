/**
 * 「点浮层外部收起」的共享实现（三处浮层共用：词库按钮快速列表 / AI 优化面板 / `#` 候选浮层）。
 *
 * 为什么单独成模块：这三处此前各写一份 `document` **捕获阶段** pointerdown 纯监听（与官方
 * ui-commands 的 PopupSelectView 同款，不改宿主 DOM），逻辑逐字相同——差异只在「何时挂」
 * （`open` / `settled` / `visible`）与「关掉时还要做什么」。三处都没有自动化判据（无 react-dom，
 * 硬约束 5），收成一份至少让守卫写法只有一处可错。
 *
 * react 经 `react-hooks.ts` **惰性解析**，不静态 import——与 ui-state.ts / data-sync.ts /
 * settings-store.ts 同款（静态 import 会让所有 import 本模块的 `.ts` 从 `node --test` 掉出去）。
 *
 * 依赖数组含 `onDismiss`：调用点传内联箭头时每次渲染会重挂一次监听。这里**刻意接受**——重挂是幂等的，
 * 且 cleanup 与 setup 在同一次同步提交里背靠背完成、中间不会有事件插进来，代价可忽略。
 * 想省掉这次重挂时，最直接的修法在**调用点**（用 `React.useCallback` 固定回调），不必扩 `hooks()` 的接口面。
 * （对比：拉取 effect 把不稳定的依赖放进数组会变成重拉循环，那才是必须用 ref 的场景——两者不是同一回事。）
 *
 * ⚠️ 已知边界（**搬迁前就存在**，本次只是把这条臂从三份并成了共享契约）：根节点为 `null` 时一律算「外部」。
 * `HashSuggestOverlay` 在「抢屏」窗口里可能出现「浮层已挂、根节点未就绪」，此时任意一次 pointerdown 都会写上
 * `dismissedKey`（R48 的永久抑制）。修它属于行为变更，且落在反复修过的敏感区，故单独评估，不在这里顺手改。
 */
import { hooks } from "./react-hooks.ts";

/** 承载浮层根节点的 ref（只要 `{ current }` 形状，避开对 react 类型包的静态依赖）。 */
export interface RootRef {
  current: Element | null;
}

/**
 * 挂「点浮层外部收起」监听：`active` 为假时不挂（对应各面自己的门）。
 * 命中判定 = `ev.target` 不在 `rootRef.current` 之内；根节点尚未挂载（`null`）时一律视为「外部」。
 */
/** 命中判定所需的窄接口：只要一个 `contains`（测试可传假对象，不必有 DOM）。 */
export interface ContainsRoot {
  contains(node: unknown): boolean;
}

/**
 * 「这一下算不算点在浮层外面」——抽成纯函数以便用 `node --test` 钉住：hook 本体要 react + DOM（本仓都
 * 没有），但这条判定不需要。`isNode` 由调用方给（宿主里就是 `(v) => v instanceof Node`），
 * 免得本模块静态依赖 DOM 全局。
 *
 * 语义与搬迁前逐字一致：根节点为 `null`、或 `target` 不是节点、或不在根节点内 ⇒ 都算「外面」。
 */
export function isOutside(root: ContainsRoot | null, target: unknown, isNode: (value: unknown) => boolean): boolean {
  return !(root !== null && isNode(target) && root.contains(target));
}

export function useDismissOnOutside(rootRef: RootRef, active: boolean, onDismiss: () => void): void {
  const { useEffect } = hooks();
  useEffect(() => {
    if (!active) return;
    const onPointerDown = (ev: PointerEvent): void => {
      if (!isOutside(rootRef.current, ev.target, (v) => v instanceof Node)) return;
      onDismiss();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [active, onDismiss, rootRef]);
}
