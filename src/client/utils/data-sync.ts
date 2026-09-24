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
 */

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
 * React 运行时（与 ui-state.ts 的同名私有块保持一致；两处都必须在 Node 下可 import，故不共享）。
 *
 * react 是宿主 external：scripts/build.mjs 的 external 清单与 smoke 的 fakeRequire 桩都只为
 * react / react/jsx-runtime 留位，由 bundle 工厂作用域的 require 在运行时解析。此处刻意**不**
 * 静态 import from "react"：本仓库按上游形态不安装 react（飞行前 R1），静态 import 会让
 * node --test 直接 import 本模块时解析失败，而 tests/data-sync.test.mjs 必须能直接跑事件面。
 */
interface ReactHooks {
  useEffect(effect: () => void | (() => void), deps?: unknown[]): void;
}

let reactHooks: ReactHooks | null | undefined;

/** 首次调用 hook 时解析一次 react；拿不到就抛可读错误，不静默降级成「不刷新」。 */
function hooks(): ReactHooks {
  if (reactHooks === undefined) {
    reactHooks = null;
    if (typeof require === "function") {
      try {
        reactHooks = require("react") as ReactHooks;
      } catch (e) {
        console.warn("[prompt-enhancer] 无法解析 react，数据变更 hook 不可用：", e);
      }
    } else {
      console.warn("[prompt-enhancer] 当前环境没有 require，无法解析 react（hook 只能在宿主里调用）");
    }
  }
  if (!reactHooks) {
    throw new Error("prompt-enhancer: react 运行时不可用（数据变更 hook 只能在宿主里调用）");
  }
  return reactHooks;
}

/**
 * 订阅数据变更：挂载时登记监听，卸载时撤销（useEffect + deps；R1 口径，不用 useSyncExternalStore）。
 * deps 由调用方给（同一份 deps 的长度必须稳定，React 的规则）。
 */
export function useDataChanged(fn: () => void, deps: unknown[] = []): void {
  const { useEffect } = hooks();
  useEffect(() => subscribeDataChanged(fn), deps);
}
