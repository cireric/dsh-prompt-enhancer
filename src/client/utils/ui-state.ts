/**
 * 管理面板、「沉淀」载荷与 `#` 候选浮层**真实可见性**的模块级状态（D-P6-1：弹窗宿主唯一 +
 * 组件之间不互相耦合）。
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

/**
 * `#` 候选浮层的**真实可见性**（R53）：两侧共享的单一状态源。
 *
 * 为什么不各算各的：浮层的显示门是 `shouldShowSuggest({ open, tokenKey, dismissedKey })`
 * （令牌存在**且**未被「点浮层外部」收起），而 `dismissedKey` 只活在浮层组件内部——库侧自算
 * 只能得到「令牌是否存在」，两侧的门**不同源**。R49 的 `hashOpen` 边沿因此漏掉「面板已开着时
 * 在同一令牌内就地改写查询词」：令牌一直在，`hashOpen` 恒 true，没有 false→true 边沿可观察。
 * 把浮层**此刻是否真的可见**提升到本模块后，库侧订阅的就是浮层自己的判定结果（一个门而不是两个）。
 *
 * 发布点唯一：`HashSuggestOverlay`（可见性变化时发布，**卸载时清除为 false**）。
 */
let hashSuggestVisible = false;
const hashSuggestListeners = new Set<() => void>();

/** `#` 浮层可见性快照（useSyncExternalStore 兼容形态）。 */
export function getHashSuggestVisibleSnapshot(): boolean {
  return hashSuggestVisible;
}

/** 订阅 `#` 浮层可见性（与 `subscribe` 同形：返回退订函数，重复退订安全）。 */
export function subscribeHashSuggestVisible(listener: () => void): () => void {
  hashSuggestListeners.add(listener);
  return () => {
    hashSuggestListeners.delete(listener);
  };
}

/**
 * 发布 `#` 浮层的真实可见性。**幂等**：同值重复设置不派发（与 `openManager` 同约定）——
 * 否则浮层每次重渲染都会推一次订阅方重渲染。
 */
export function setHashSuggestVisible(visible: boolean): void {
  if (hashSuggestVisible === visible) return;
  hashSuggestVisible = visible;
  // 先复制再遍历：监听器里退订或再订阅都不会打乱本次派发（与 emit 同约定）。
  for (const listener of [...hashSuggestListeners]) listener();
}

/** 订阅 `#` 浮层可见性（与 useManagerState 同形态：useState + useEffect(subscribe)）。 */
export function useHashSuggestVisible(): boolean {
  const { useState, useEffect } = hooks();
  const [snapshot, setSnapshot] = useState<boolean>(getHashSuggestVisibleSnapshot);
  useEffect(() => subscribeHashSuggestVisible(() => setSnapshot(getHashSuggestVisibleSnapshot())), []);
  return snapshot;
}
