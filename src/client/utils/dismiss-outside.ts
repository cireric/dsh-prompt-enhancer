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
 * 依赖数组含 `onDismiss`：调用点传内联箭头时每次渲染会重挂一次监听。这里**刻意接受**——
 * 监听重挂是幂等的（cleanup 先摘旧的），而把它藏进 ref 需要把 `hooks()` 的接口面扩到 `useRef`；
 * 前者代价可忽略，后者是为省一次重挂而扩接口。（对比：拉取 effect 把不稳定的依赖放进数组会变成
 * 重拉循环，那才是必须用 ref 的场景——两者不是同一回事。）
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
export function useDismissOnOutside(rootRef: RootRef, active: boolean, onDismiss: () => void): void {
  const { useEffect } = hooks();
  useEffect(() => {
    if (!active) return;
    const onPointerDown = (ev: PointerEvent): void => {
      const root = rootRef.current;
      if (root !== null && ev.target instanceof Node && root.contains(ev.target)) return;
      onDismiss();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [active, onDismiss, rootRef]);
}
