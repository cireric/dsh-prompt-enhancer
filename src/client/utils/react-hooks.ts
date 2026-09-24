/**
 * React 运行时的统一取得口（ui-state.ts 与 data-sync.ts 共用；R24 评审修复轮 1）。
 *
 * react 是宿主 external：scripts/build.mjs 的 external 清单与 smoke 的 fakeRequire 桩都只为
 * react / react/jsx-runtime 留位，由 bundle 工厂作用域的 require 在运行时解析。此处刻意**不**
 * 静态 import from "react"：本仓库按上游形态不安装 react（飞行前 R1 已记录「checkout 里
 * node_modules/react 不存在」），静态 import 会让 node --test 直接 import 本模块（以及它的两个
 * 消费者）时解析失败，而 tests/ui-state.test.mjs / tests/data-sync.test.mjs 必须直接跑。
 */

/** react 里本插件用到的两个 hook（只声明调用点实际用到的最小面）。 */
interface ReactHooks {
  useState<T>(initial: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void];
  useEffect(effect: () => void | (() => void), deps?: unknown[]): void;
}

let reactHooks: ReactHooks | null | undefined;

/**
 * 首次调用时解析一次 react，此后复用（hook 只在渲染期调用，解析结果稳定）。
 * 拿不到就抛可读错误，不静默降级成「不响应变化」——调用点据此暴露缺失，而不是给一个死快照。
 */
export function hooks(): ReactHooks {
  if (reactHooks === undefined) {
    reactHooks = null;
    if (typeof require === "function") {
      try {
        reactHooks = require("react") as ReactHooks;
      } catch (e) {
        console.warn("[prompt-enhancer] 无法解析 react，hook 不可用：", e);
      }
    } else {
      console.warn("[prompt-enhancer] 当前环境没有 require，无法解析 react（hook 只能在宿主里调用）");
    }
  }
  if (!reactHooks) {
    throw new Error("prompt-enhancer: react 运行时不可用（hook 只能在宿主里调用）");
  }
  return reactHooks;
}
