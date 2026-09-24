/**
 * 管理面板与「沉淀」载荷的模块级状态（D-P6-1：弹窗宿主唯一 + 组件之间不互相耦合）。
 *
 * 规格 §7.1 / §13.4：输入框按钮与左栏入口都只调 openManager()，开合与页签选择经本模块共享，
 * 不通过组件耦合。本模块**不 import 任何宿主服务**，故 tests/ui-state.test.mjs 可直接 import 它
 * 跑 store 面（react 由 react-hooks.ts 惰性解析，不在模块顶层静态 import——本仓库不装 react）。
 */
import { hooks } from "./react-hooks.ts";

/** 管理面板的四个页签（T2 建外壳、T4 填内容）。 */
export type ManagerPanel = "list" | "tags" | "trash" | "transfer";

/** 面板开合快照。 */
export interface ManagerState {
  open: boolean;
  panel: ManagerPanel;
}

/** 沉淀载荷（正文必填，标题缺省为空串）。 */
export interface CapturePayload {
  body: string;
  title: string;
}

/** 不带页签参数时的落点。 */
const DEFAULT_PANEL: ManagerPanel = "list";

let state: ManagerState = { open: false, panel: DEFAULT_PANEL };
let capture: CapturePayload | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  // 先复制再遍历：监听器里退订或再订阅都不会打乱本次派发。
  for (const listener of [...listeners]) listener();
}

/** 订阅状态变化（useSyncExternalStore 兼容形态）：返回退订函数。 */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 面板快照（useSyncExternalStore 兼容形态）：只在真实变更时换引用。 */
export function getSnapshot(): ManagerState {
  return state;
}

/** 沉淀载荷快照（useSyncExternalStore 兼容形态）。 */
export function getCaptureSnapshot(): CapturePayload | null {
  return capture;
}

/** 打开管理面板。同页签重复调用是幂等的：状态不变，不重复通知订阅者。 */
export function openManager(panel: ManagerPanel = DEFAULT_PANEL): void {
  if (state.open && state.panel === panel) return;
  state = { open: true, panel };
  emit();
}

/** 关闭管理面板（幂等）。页签保持关闭前的选择：下一次 openManager() 不带参数才回到默认页签。 */
export function closeManager(): void {
  if (!state.open) return;
  state = { open: false, panel: state.panel };
  emit();
}

/** 沉淀入口（选中捕获 / 当前草稿存为提示词）把载荷推进面板：覆盖式写入（R4）。 */
export function pushCapture(payload: { body: string; title?: string }): void {
  capture = { body: payload.body, title: payload.title ?? "" };
  emit();
}

/**
 * 取出沉淀载荷并**立即清空**（R4：只能被消费一次，避免面板重开时二次预填）。
 * 只有确实取到载荷时才通知订阅者，拿空不派发。
 */
export function takeCapture(): CapturePayload | null {
  const pending = capture;
  capture = null;
  if (pending) emit();
  return pending;
}

/** 订阅面板状态。用 useState + useEffect(subscribe)（R1）：宿主 react 版本未证实，不用 useSyncExternalStore。 */
export function useManagerState(): ManagerState {
  const { useState, useEffect } = hooks();
  const [snapshot, setSnapshot] = useState<ManagerState>(getSnapshot);
  useEffect(() => subscribe(() => setSnapshot(getSnapshot())), []);
  return snapshot;
}

/** 订阅沉淀载荷（与 useManagerState 同形态）。 */
export function useCapture(): CapturePayload | null {
  const { useState, useEffect } = hooks();
  const [snapshot, setSnapshot] = useState<CapturePayload | null>(getCaptureSnapshot);
  useEffect(() => subscribe(() => setSnapshot(getCaptureSnapshot())), []);
  return snapshot;
}
