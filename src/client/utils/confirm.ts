/**
 * promise 化的共享确认（R36）：任何模块（含非 React 的 `capture.ts`）都能
 * `await requestConfirm(...)`，由 `PromptSurfaceHost` 渲染当前请求——那是**唯一渲染点**
 * （嵌套在管理面板之上，并遵守 shell.overlay 的「关闭态零盒子」硬约束）。
 *
 * **并发语义（裁决 + 理由）**：同一时刻**只允许一个在途请求**，第二个请求以 `false`
 * （= 取消）**立即落地**且不替换在途请求。理由：
 *   · 「排队」会让第二个调用方一直等前一个弹窗被处理——UI 上表现为「点了保存但没反应」，
 *     且队列无上界（每次保存压一条）、无确定性终止点；
 *   · 单模态弹窗的语义就是「同一时刻只问一个问题」；后来者按取消落地是**确定**行为，
 *     绝不会偷偷替用户确认；调用方的取消分支本就是安全无操作（不创建 / 不删除）。
 * 该行为由 `tests/confirm.test.mjs` 锁住（含「无在途请求时 resolve 是安全 no-op」）。
 *
 * `title`/`message`/`confirmLabel`/`cancelLabel` 是 **i18n 键**（prompt-enhancer 命名空间），
 * 由渲染点翻译——与 `ai-flow.ts#aiErrorKey` 返回键、组件里 `t(key)` 的既有口径一致；
 * 本模块因此既不需要也无法知道当前 locale（它要能被非 React 的 capture 层调用）。
 */
import { hooks } from "./react-hooks.ts";

/** 一次确认请求。`detail` 是逐条明细（例如将被淘汰的提示词标题）。 */
export interface ConfirmRequest {
  id: number;
  title: string;
  message: string;
  detail: string[];
  confirmLabel: string;
  cancelLabel: string;
}

/** 在途请求（null = 没有），以及它的落地函数（promise 的 resolve）。 */
let current: ConfirmRequest | null = null;
let settle: ((approved: boolean) => void) | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function emit(): void {
  // 先复制再遍历：监听器里退订或再订阅都不会打乱本次派发。
  for (const listener of [...listeners]) listener();
}

/** 订阅在途请求变化（useConfirmRequest 与测试共用，与 ui-state.ts 同形态）。 */
export function subscribeConfirm(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 当前在途请求快照（null = 无）。 */
export function getConfirmSnapshot(): ConfirmRequest | null {
  return current;
}

/**
 * 发起一次确认，返回 promise：用户确认 → true，取消 → false。
 * 已有在途请求时不排队（见文件头的并发语义），本次以 false 立即落地并留下可见痕迹。
 */
export function requestConfirm(input: Omit<ConfirmRequest, "id">): Promise<boolean> {
  if (current !== null) {
    console.warn("[prompt-enhancer] 已有一个确认弹窗在途，本次确认请求以「取消」立即落地（不排队）");
    return Promise.resolve(false);
  }
  // 先建 promise（executor 同步执行 → settle 已就位），再发布请求，最后通知订阅者。
  const promise = new Promise<boolean>((resolve) => {
    settle = resolve;
  });
  current = { ...input, id: nextId++ };
  emit();
  return promise;
}

/**
 * 落地当前请求。没有在途请求时是**安全 no-op**（不抛、不派发、不改状态）。
 * 先清状态再通知订阅者：弹窗消失后 promise 才落地，回调里再发起新请求不会读到旧快照。
 */
export function resolveConfirm(approved: boolean): void {
  const done = settle;
  if (done === null) return;
  current = null;
  settle = null;
  emit();
  done(approved);
}

/** 订阅在途请求（与 ui-state.ts#useManagerState 同形态：useState + useEffect(subscribe)）。 */
export function useConfirmRequest(): ConfirmRequest | null {
  const { useState, useEffect } = hooks();
  const [snapshot, setSnapshot] = useState<ConfirmRequest | null>(getConfirmSnapshot);
  useEffect(() => subscribeConfirm(() => setSnapshot(getConfirmSnapshot())), []);
  return snapshot;
}
