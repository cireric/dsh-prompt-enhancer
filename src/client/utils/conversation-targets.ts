/**
 * 会话视图目标（chat / trajectory）读取器（上游 81 行原样搬运 + 适配）。
 *
 * 背景：**本宿主版本 0.1.5-rc.2** 把 Chat 与 Trajectory 视图目标放在 UI 层私有的
 * `uiConversation.views` 注册表里，宿主自身的聊天 UI 通过
 * `uiConversation.binding(sessionId).target("chat" | "trajectory")` 读取。本轮实测证据：
 *   · `packages/client/ui-chat/src/client/apply.ts:62` —— 宿主自己就这么读 chat：
 *     `ctx.uiConversation.binding(binding).target('chat')`；
 *   · `packages/client/ui-chat/src/client/contract/snapshot.ts:92-105` —— `ChatSnapshot` 的
 *     `legacy` 切片（`legacy.nodes`）与把 `chat` 挂进 `ConversationViewSnapshotMap` 的增强；
 *   · `packages/client/ui-conversation/src/client/conversation/assembly.ts:220-239` —— `binding()`
 *     对未知会话**抛错**（`uiConversation.binding: unknown session "..."`），故调用方必须容错。
 * 插件在 apply 阶段缓存宿主 `uiConversation` 服务，组件内用 `useConversationTargetSnapshot`
 * 订阅同一数据源。
 *
 * **适配清单（相对上游）**：
 *  ① 相对导入路径按本仓库布局（本文件**不** import 任何宿主包，也不需要 types）；
 *  ② 注释里的「最新 DSH」措辞改为「本宿主版本 0.1.5-rc.2」并补上面的证据引文；
 *  ③ `UiConversationService` 仍是**结构最小面**（不 import 宿主包）；
 *  ④ 上游静态 `import { useCallback, useSyncExternalStore } from "react"`，本仓库纪律相反：
 *     `utils/react-hooks.ts` 的文件头写明本仓库不安装 react、测试直跑 .ts 源码，`utils/data-sync.ts:51`
 *     亦明写「R1 口径，**不用 useSyncExternalStore**」。故改用 `hooks()` 惰性解析 + `useState`/
 *     `useEffect`（与 `useSettings` / `utils/ui-state.ts` 同形态）。**try/catch 降级语义逐字保留**：
 *     服务缺席 / 会话未知 / 目标未装配 ⇒ 返回 undefined，**不抛**。
 */
import { hooks } from "./react-hooks.ts";

/** 宿主 uiConversation 服务的最小结构（仅取本插件需要的部分）。 */
export interface UiConversationService {
  /**
   * 取某会话的绑定装配。
   * @param source - 会话 id 字符串（或宿主 binding 对象）。
   * @throws 会话未知时宿主会抛错，调用方需容错。
   */
  binding(source: string | unknown): {
    /** 某视图目标的稳定快照读取面（getSnapshot / subscribe）。 */
    target(name: string): {
      getSnapshot(): unknown;
      subscribe(listener: () => void): () => void;
    };
  };
}

let uiConversationRef: UiConversationService | null = null;

/** apply 阶段注入宿主 uiConversation 服务（不存在时传 null，功能静默降级）。 */
export function setUiConversation(svc: UiConversationService | null): void {
  uiConversationRef = svc;
}

/** 取缓存的 uiConversation 服务（未注入或宿主缺失时为 null）。 */
export function getUiConversation(): UiConversationService | null {
  return uiConversationRef;
}

/**
 * 读一次目标快照：**未知会话 / 未装配目标一律吞掉宿主的抛错**并返回 undefined。
 * 这是本模块唯一的降级点（getSnapshot 与 subscribe 共用），故降级语义只有一份。
 */
function readTargetSnapshot<T>(
  svc: UiConversationService | null,
  sessionId: string | undefined,
  target: string,
): T | undefined {
  if (svc === null || !sessionId) return undefined;
  try {
    const face = svc.binding(sessionId).target(target);
    return (face.getSnapshot() ?? undefined) as T | undefined;
  } catch {
    // 会话尚未绑定 / 目标未注册：静默降级（推荐条退化为「只用当前草稿」）
    return undefined;
  }
}

/**
 * 订阅当前会话某个 Conversation 视图目标的最新快照。
 *
 * @param sessionId - 当前会话 id（座位注入的 `session.sessionId`）。
 * @param target - 视图目标名（"chat" / "trajectory"）。
 * @returns 最新快照；服务缺失 / 会话未知 / 目标未装配时为 undefined。
 */
export function useConversationTargetSnapshot<T>(sessionId: string | undefined, target: string): T | undefined {
  const { useState, useEffect } = hooks();
  const svc = uiConversationRef;
  const [value, setValue] = useState<T | undefined>(() => readTargetSnapshot<T>(svc, sessionId, target));
  useEffect(() => {
    if (svc === null || !sessionId) return;
    let unsubscribe: () => void = () => {};
    try {
      const face = svc.binding(sessionId).target(target);
      unsubscribe = face.subscribe(() => setValue(readTargetSnapshot<T>(svc, sessionId, target)));
      // **必须显式对齐一次当前值**（这一行不可省）：宿主 `subscribe` 只在**该目标首次被激活**时同步推送。
      // 实测语义：`assembly.ts:74-78` 的订阅体是「先 `this.snapshot.subscribe(listener)`，再
      // `this.activate(target)`」；`activate`（`:85-87`）只在 `assembler.activateTarget()` 返回 true 时
      // `snapshot.set(currentSnapshot())`；而 `activateTarget`（`assembler.ts:385-393`）对**已在活跃集里的
      // 目标**直接 `return false`。⇒ 回访一个本会话此前已激活过 `chat` 的会话时，订阅**不产生任何通知**，
      // 而 `useState` 的惰性初值只在首次挂载求值、会话切换又不会重挂载本组件
      // （`ConversationRoot.tsx:350` 未按 sessionId 换 key）——缺这一行就会拿**上一个会话**的聊天文本当上下文。
      // 同值 `setValue` 被 React 跳过（`Object.is` 相等），故挂载路径上不产生额外渲染。
      setValue(readTargetSnapshot<T>(svc, sessionId, target));
    } catch {
      // 会话尚未绑定 / 目标未注册：订阅退化成空，不抛（与上游语义一致）
      unsubscribe = () => {};
    }
    return unsubscribe;
  }, [svc, sessionId, target]);
  return value;
}
