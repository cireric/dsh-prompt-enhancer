/**
 * 跨组件数据同步（规格 §3.3 / D6）：同进程事件，**无 WebSocket**。
 *
 * 任一组件增删改提示词后调 notifyDataChanged()，其它组件用 useDataChanged(fn, deps) 重新拉数据。
 *
 * 事件总线取 globalThis 的 EventTarget：
 *   · 浏览器：globalThis 就是 window，事件面齐全 → 直接用它（D6 的「同页 window 事件」）；
 *   · Node：实测 globalThis **没有** addEventListener / dispatchEvent（只有 EventTarget 类），
 *     故退化成模块内的 EventTarget 实例——订阅口是本模块导出的 subscribeDataChanged，
 *     测试与运行时看到的是同一个对象，无需伪造 window（D-P6-2 的「Node 测试可直接跑」）。
 *
 * react 由 react-hooks.ts 惰性解析（本模块不静态 import react——本仓库不装 react）。
 */
import { hooks } from "./react-hooks.ts";

/** 数据变更事件名（规格 §3.3；改名即破坏同页同步契约）。 */
export const DATA_CHANGED = "prompt-enhancer:data-changed";

/** 事件总线的最小面。 */
interface EventBus {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
  dispatchEvent(event: Event): boolean;
}

/** globalThis 是否自带可用的事件面（浏览器 window 有，Node 没有）。 */
function hasEventFace(): boolean {
  const candidate = globalThis as Partial<EventBus>;
  return (
    typeof candidate.addEventListener === "function" && typeof candidate.dispatchEvent === "function"
  );
}

const bus: EventBus = hasEventFace() ? (globalThis as unknown as EventBus) : new EventTarget();

/**
 * 订阅数据变更，返回退订函数。
 * 这是本模块对外的订阅口（useDataChanged 也走它）：React 之外（含 Node 测试）也能直接挂监听。
 */
export function subscribeDataChanged(fn: () => void): () => void {
  bus.addEventListener(DATA_CHANGED, fn);
  return () => bus.removeEventListener(DATA_CHANGED, fn);
}

/** 通知所有提示词组件：数据已增删改，应重新加载。 */
export function notifyDataChanged(): void {
  bus.dispatchEvent(new Event(DATA_CHANGED));
}

/**
 * 订阅数据变更：挂载时登记监听，卸载时撤销（useEffect + deps；R1 口径，不用 useSyncExternalStore）。
 * deps 由调用方给（同一份 deps 的长度必须稳定，React 的规则）。
 */
export function useDataChanged(fn: () => void, deps: unknown[] = []): void {
  const { useEffect } = hooks();
  useEffect(() => subscribeDataChanged(fn), deps);
}
