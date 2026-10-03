/**
 * 「拉列表 → 起手处理 → 失败归一」的共享实现（候选 2 切片 3）。
 *
 * 为什么单独成模块：仓内 5 处组件各写一份近乎相同的 effect——`let alive = true` 守卫、成功写列表、
 * 失败 `console.warn` + 写空数组 + `reasonOf(err)` 进错误行。差异只有三处，且都在选项里可见：
 *   · `active`：为假时不拉（`PromptLibraryButton` 的 `if (!open) return`）；
 *   · `clearOnStart`：起手把列表清成 `null`（5 处中 2 处清；`SkillExportModal` 用注释明说不清）；
 *   · `clearErrorOnStart`：起手清错误行（3 处清；`TagManagePanel` / `RecycleManagePanel` 刻意不清，
 *     旧提示留到重拉成功——本仓唯一一处 2:3 的分歧，写在这里与调用点，不藏在默认值里）。
 *
 * **不收的三类**（不同构，留手写 + 注释）：
 *   · 失败时写 `null` 而非空数组、且错误行是独立状态（`PromptManagerModal` 的标签那条）；
 *   · 起手要额外复位别的 state、或**日志必须先于存活守卫**（`HashSuggestOverlay` / `SettingsSection`）；
 *   · 没有存活守卫、也没有错误行，重拉由外部调用触发（`ContextRecommendations` 的 `load()`）。
 *
 * react 经 `react-hooks.ts` 惰性解析，不静态 import（与 ui-state.ts / settings-store.ts 同款）。
 */
import { reasonOf } from "../../err-text.ts";
import { hooks } from "./react-hooks.ts";

/** 选项（`label` 与站点原文逐字相同，不带 `[prompt-enhancer] ` 前缀）。 */
export interface AsyncListOptions {
  /** 失败时的警告文案：`console.warn("[prompt-enhancer] " + label, err)`。 */
  label: string;
  /**
   * 为假时不拉。缺省为真。
   *
   * 它就是 hook 内部的一个依赖：调用点传什么值，`active` 就跟着它变——`active: open` 时开关面板即触发/停止
   * 拉取，不需要在别处再声明一次（这正是「依赖数组收进 hook」后的收益）。
   */
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
  setItems: (next: T[] | ((prev: T[] | null) => T[] | null)) => void;
}

/**
 * 拉取一个列表并维护 `{ items, error }`：`deps` 变化时重拉（`active` 为假则完全不拉）。
 *
 * ⚠️ `load` **必须是稳定引用**：调用点用 `React.useCallback` 包住它，并把「什么时候该重拉」写进它的依赖数组
 * （例：`React.useCallback(() => api.listTags(), [reloadSeq])`）。hook 内部把 `load` 与各选项当依赖，
 * 于是「看不见的依赖数组」这个概念从调用点消失——读者用 React 自己的 `useCallback` 契约就能读懂。
 */
/** 选项解析后的形态（把「缺省值」与「只有 `=== true` 才算」的判定收在一处，便于单测钉住）。 */
export interface ResolvedAsyncListOptions {
  label: string;
  active: boolean;
  clearOnStart: boolean;
  clearErrorOnStart: boolean;
}

/**
 * 解析选项：只有 `active` 缺省为真（判定是 `!== false`），两个 `clear*` 缺省为假（必须显式传 `true`）。
 * 这三条判定此前散在 hook 体内、没有任何判据——抽出来就是为了能被 `tests/async-list.test.mjs` 钉住。
 */
export function resolveOptions(options: AsyncListOptions): ResolvedAsyncListOptions {
  return {
    label: options.label,
    active: options.active !== false,
    clearOnStart: options.clearOnStart === true,
    clearErrorOnStart: options.clearErrorOnStart === true,
  };
}

/**
 * 失败态的归一：**列表一定是空数组**（不是 `null`——`null` 在调用点表示「还没落地」，写成 `null` 会让界面
 * 永远显示加载中）。错误行交给 `reasonOf`。
 */
export function failureState<T>(err: unknown): { items: T[]; error: string } {
  return { items: [], error: reasonOf(err) };
}

export function useAsyncList<T>(
  load: () => Promise<T[]>,
  options: AsyncListOptions,
): AsyncListResult<T> {
  const { useState, useEffect } = hooks();
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { label, active, clearOnStart, clearErrorOnStart } = resolveOptions(options);
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
        const failed = failureState<T>(err);
        setItems(failed.items);
        setError(failed.error);
      },
    );
    return () => {
      alive = false;
    };
  }, [load, active, clearOnStart, clearErrorOnStart, label]);
  return { items, error, setItems };
}
