/**
 * 「拉列表 → 起手处理 → 失败归一」的共享实现（候选 2 切片 3）。
 *
 * 为什么单独成模块：仓内 5 处组件各写一份近乎相同的 effect——`let alive = true` 守卫、成功写列表、
 * 失败 `console.warn` + 写空数组 + `reasonOf(err)` 进错误行。差异只有三处，且都在选项里可见：
 *   · `active`：为假时不拉（`PromptLibraryButton` 的 `if (!open) return`）；
 *   · `clearOnStart`：起手把列表清成 `null`（3 处中 2 处清；`SkillExportModal` 用注释明说不清）；
 *   · `clearErrorOnStart`：起手清错误行（3 处清；`TagManagePanel` / `RecycleManagePanel` 刻意不清，
 *     旧提示留到重拉成功——本仓唯一一处 2:3 的分歧，写在这里与调用点，不藏在默认值里）。
 *
 * **不收的两类**（不同构，留手写 + 注释）：
 *   · 失败时写 `null` 而非空数组、且错误行是独立状态（`PromptManagerModal` 的标签那条）；
 *   · 起手要额外复位别的 state、或**日志必须先于存活守卫**（`HashSuggestOverlay` / `SettingsSection`）。
 *
 * react 经 `react-hooks.ts` 惰性解析，不静态 import（与 ui-state.ts / settings-store.ts 同款）。
 */
import { reasonOf } from "../../err-text.ts";
import { hooks } from "./react-hooks.ts";

/** 选项（`label` 与站点原文逐字相同，不带 `[prompt-enhancer] ` 前缀）。 */
export interface AsyncListOptions {
  /** 失败时的警告文案：`console.warn("[prompt-enhancer] " + label, err)`。 */
  label: string;
  /** 为假时不拉。缺省为真。 */
  active?: boolean;
  /** 起手把列表清成 `null`。缺省 false（多数站点刻意不清，避免重拉闪一下「加载中」）。 */
  clearOnStart?: boolean;
  /** 起手把错误行清掉。缺省 false（两处刻意让旧提示留到重拉成功）。 */
  clearErrorOnStart?: boolean;
}

/** 返回值（`setItems` 供**拉取之外**的本地改动：导出后改一行、404 后摘一条）。 */
export interface AsyncListResult<T> {
  /** `null` = 尚未落地（或起手清空后的加载中）；**失败时是空数组**，不是 null。 */
  items: T[] | null;
  error: string | null;
  setItems: (next: T[] | null | ((prev: T[] | null) => T[] | null)) => void;
}

/**
 * 拉取一个列表并维护 `{ items, error }`：`deps` 变化时重拉（`active` 为假则完全不拉）。
 *
 * ⚠️ `deps` 是**显式传入**的依赖数组（与 `React.useEffect` 同语义）：调用点的 `load` 通常是内联箭头，
 * 每次渲染都是新函数——把它放进依赖就会变成重拉循环，这正是各站点只传变量依赖的原因。
 */
export function useAsyncList<T>(
  load: () => Promise<T[]>,
  deps: unknown[],
  options: AsyncListOptions,
): AsyncListResult<T> {
  const { useState, useEffect } = hooks();
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = options.active !== false;
  const clearOnStart = options.clearOnStart === true;
  const clearErrorOnStart = options.clearErrorOnStart === true;
  const label = options.label;
  useEffect(() => {
    if (!active) return;
    let alive = true;
    if (clearOnStart) setItems(null);
    if (clearErrorOnStart) setError(null);
    load().then(
      (list) => {
        if (!alive) return;
        setItems(list);
        setError(null);
      },
      (err: unknown) => {
        if (!alive) return;
        console.warn("[prompt-enhancer] " + label, err);
        setItems([]);
        setError(reasonOf(err));
      },
    );
    return () => {
      alive = false;
    };
  }, deps);
  return { items, error, setItems };
}
