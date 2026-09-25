/**
 * 管理面板、「沉淀」载荷与 `#` 候选浮层**真实可见性**的模块级状态（D-P6-1：弹窗宿主唯一 +
 * 组件之间不互相耦合）。
 *
 * 规格 §7.1 / §13.4：输入框按钮与左栏入口都只调 openManager()，开合与页签选择经本模块共享，
 * 不通过组件耦合。本模块**不 import 任何宿主服务**，故 tests/ui-state.test.mjs 可直接 import 它
 * 跑 store 面（react 由 react-hooks.ts 惰性解析，不在模块顶层静态 import——本仓库不装 react）。
 */
import { canRender, type OverlayKind, type OverlaySurface } from "../../overlay-claim.ts";
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

/**
 * 共享浮层 claim（TBD-P7-1 的 (a) / D-P7-1）：「任一时刻最多一张浮层/面板在场」的**单一真源**。
 *
 * 三个面（词库面板 / `#` 浮层 / AI 面板）各自订阅它，渲染门与 `aria-expanded` 共用同一个派生值
 * （`canRender(kind, claimed)` 与自己的前置条件相与）。为什么不各自判断：P7 §1.4 的实测证明
 * 「指针边沿 + 各自为政的局部规则」挡不住不产生 pointerdown 的激活（真实 `Shift+Tab` 回输入框后真实
 * 键入、真实 `Tab`+真实 `Enter`），同屏因此在结构上可达。收进一个寄存器后，同屏在结构上不可能：
 * 两个面的门读的是**同一帧的同一个值**。
 *
 * 取/放纪律（`canRender` 只管判定，纪律在接线处）：
 *  - **激活即抢屏**：面被用户真正激活的那一刻（词库按钮的点击、`#` 令牌出现）直接抢——最新意图胜出。
 *    这也让 R60 的陈旧闭包拦不住它：判定读的是**渲染期的当前值**，而不是回调闭包里那一拍的旧值。
 *  - **长驻状态只取空屏**：AI 面板的前置条件是「有结果」这种**长驻状态**而非一次激活，故它只在寄存器
 *    空着时取、被占着就让位，屏一空出来再取（面板自身不因此关闭）——若它也抢，被它压住的 `#` 浮层
 *    会在令牌仍在草稿里时**永久静默**（浮层的可见性是令牌派生的，被抢后没有重新取屏的时机）。
 *  - **位移即收回意图**：被位移的面若持有「打开」这种**意图位**，必须收回（词库面板收回 `open`），
 *    否则会留下「`open` 为真而面板不可见」的背离——再点一次按钮时 `setOpen(true)` 与旧值相同，
 *    React 不重渲染、effect 不重跑，面板**再也打不开**（R60 当初正是为了从源头掐掉这个状态）。
 *  - **只释放自己持有的**：`releaseOverlay(kind)` 只清 `claimed === kind`。否则被位移的一方在收尾时会
 *    把新持有者的 claim 连带清掉——真实时序：pointerdown 收起 `#` 浮层与 click 打开词库面板可以落在
 *    同一拍上（F1-1 的 0/5/10ms），浮层的收尾晚于词库的取屏。
 *  - **隐藏/卸载即释放**（P6 的教训）：留成占位会把别的面压住（claim 停在某一面 ⇒ 另外两面都渲染不出来），
 *    且幂等守卫会连带吞掉下一次真实边沿。
 *
 * 与 `setHashSuggestVisible` 的关系：`#` 浮层仍发布 P6 的**可见性信号**（R53），该信号现在同时是浮层
 * claim 的**输入**；库侧仍订阅它（R60 的通道分叉要按「浮层在场」分叉）。R53/R55 不推翻。
 */
let claimedOverlay: OverlayKind = "none";
const overlayClaimListeners = new Set<() => void>();

/** claim 快照（useSyncExternalStore 兼容形态）。 */
export function getOverlayClaimSnapshot(): OverlayKind {
  return claimedOverlay;
}

/** 订阅 claim 变化（与 `subscribe` 同形：返回退订函数，重复退订安全；**独立 listener set**）。 */
export function subscribeOverlayClaim(listener: () => void): () => void {
  overlayClaimListeners.add(listener);
  return () => {
    overlayClaimListeners.delete(listener);
  };
}

/**
 * 取屏：把寄存器设为 `kind`（**后到的激活胜出**，同一时刻仍只有一个持有者）。
 * **幂等**：同值重复设置不派发（与 `openManager` / `setHashSuggestVisible` 同约定）。
 */
export function claimOverlay(kind: OverlaySurface): void {
  if (claimedOverlay === kind) return;
  claimedOverlay = kind;
  // 先复制再遍历：监听器里退订或再订阅都不会打乱本次派发（与 emit 同约定）。
  for (const listener of [...overlayClaimListeners]) listener();
}

/**
 * 释放自己持有的 claim。**只释放自己持有的**：`claimed !== kind` 时是安全的空操作（不派发）——
 * 被位移的一方收尾时不得把新持有者的 claim 连带清掉。
 */
export function releaseOverlay(kind: OverlaySurface): void {
  if (claimedOverlay !== kind) return;
  claimedOverlay = "none";
  for (const listener of [...overlayClaimListeners]) listener();
}

/** 订阅 claim（与 useManagerState 同形态：useState + useEffect(subscribe)）。 */
export function useOverlayClaim(): OverlayKind {
  const { useState, useEffect } = hooks();
  const [snapshot, setSnapshot] = useState<OverlayKind>(getOverlayClaimSnapshot);
  useEffect(() => subscribeOverlayClaim(() => setSnapshot(getOverlayClaimSnapshot())), []);
  return snapshot;
}

/**
 * 词库面板此刻是否该渲染（R55 的**渲染不变式**的**历史形态**；T1 起组件改读共享 claim）。
 *
 * 为什么是「渲染门」而不是「边沿动作」：边沿动作只覆盖订阅得到的那几次跳变，盖不住「面板已开时
 * 条件如何变化」的全部入口——键盘把焦点移到词库按钮后按 Enter/Space 激活，**没有任何 pointerdown**，
 * R47 不触发、信号不产生下降沿，面板就会直接开在仍然可见的浮层上面（与 O-1(c) 同类）。条件放进
 * 渲染门后，同屏在**结构上**不可能，而不是依赖「先渲染出来再收回」。
 *
 * 抽成纯函数的理由与 `hash-token.ts#shouldShowSuggest` 同：组件面没有渲染测试通道（无 react-dom，
 * 全局硬约束 5），判定留在组件里就只能靠活体验收，变异无从证起。
 *
 * **T1 起组件不再消费本函数**（渲染门统一改读 `canRender("library", claimed) && open`，见
 * `PromptLibraryButton`）；保留它是因为 `tests/ui-state.test.mjs` 用它锁 R55 的行为（不得削弱既有
 * 断言），而**实现仍然只有一处**：本函数按「`#` 浮层可见 ⇔ `#` 浮层持有 claim」这条映射**折算**
 * 到 `overlay-claim.ts#canRender` 上（浮层可见时它必然抢到屏，见 `HashSuggestOverlay` 的 claim 接线），
 * 故两个形态逐格同值、不存在第二份局部规则。`tests/overlay-claim.test.mjs` 另有这条等价性的锁。
 */
export function shouldShowLibraryPanel(input: { open: boolean; hashSuggestVisible: boolean }): boolean {
  return input.open && canRender("library", input.hashSuggestVisible ? "hash" : "library");
}
