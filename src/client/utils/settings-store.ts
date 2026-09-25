import { DEFAULT_SETTINGS, type PluginSettings } from "../../types.ts";
import { normalizeSettings } from "../../settings-shape.ts";
import { api } from "./api.ts";
import { hooks } from "./react-hooks.ts";

/** 宿主 `SettingsScope` 中本插件用到的部分（与 host/settings.ts 的窄面同形）。 */
export interface ClientSettingsScope {
  getSnapshot(): { status: string; value: unknown };
  subscribe(listener: () => void): () => void;
  set(field: string, value: unknown): Promise<void>;
}

let scope: ClientSettingsScope | null = null;
/** 当前 scope 的退订器：换 scope / 注销时释放上一个，不留悬挂观察者。 */
let unsubscribeScope: (() => void) | undefined;
/**
 * 本次「无 scope」缺失期是否已试过降级读。
 *
 * 保证**每期至多一次**：反复消费（`getSettingsSnapshot` / `subscribeSettings` / `updateSettings`）
 * 不会重发，失败也不重试、不轮询。显式的 `setSettingsScope(null)` 是一次状态跃迁（进入新的缺失期），
 * 故它重新武装——否则该触发点在首次尝试之后就永远是死代码。
 */
let fallbackAttempted = false;
/**
 * 无 scope 时那次降级读是否**已成功落地**（P8 二审 I2：失败开放回归的修复）。
 *
 * 语义是「当前快照可信」的无 scope 一半：成功采纳过 ⇒ true；**失败或仍在途 ⇒ 永远 false**
 * （本缺失期内不再重试，故真假一旦定下就不再变）。有 scope 时本标记不参与判定（权威镜像在场，
 * 就绪与否由 `getSnapshot().status` 说了算）。
 */
let fallbackLanded = false;
let snapshot: PluginSettings = { ...DEFAULT_SETTINGS };
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of [...listeners]) listener();
}

function derive(): void {
  snapshot = scope === null ? { ...DEFAULT_SETTINGS } : normalizeSettings(scope.getSnapshot().value);
  emit();
}

/**
 * 无宿主 scope 时的**降级读**（R-P8-1）：发一次尽力而为的 `GET /settings`，成功则经归一化落地并广播。
 *
 * 触发点是**首次消费**与 `setSettingsScope(null)`——**不是模块初始化**：导入期做 I/O 会让任何
 * 只是 import 本模块的进程（单测、smoke 的假 ctx）继承一次网络副作用；而在有 `settingsScope`
 * 的部署里这次请求还会被 `if (scope !== null)` 直接丢弃（白跑一趟）。故改成惰性 + 至多一次。
 *
 * 失败静默回落默认值（只留一条可读 warn），**不重试、不轮询**；且必被 `then` 的拒绝分支接住
 * ——绝不产生未捕获的 rejection。
 */
function readSettingsFallback(): void {
  api.getSettings().then(
    (value) => {
      // 在途期间拿到了真 scope（权威镜像已接管）⇒ 丢弃这次 HTTP 结果，绝不用它盖住权威值。
      if (scope !== null) return;
      snapshot = normalizeSettings(value);
      fallbackLanded = true; // 成功后快照才可信（isSettingsReady 的那一半）
      emit();
    },
    (err: unknown) => {
      // 只打一行可读原因：这条降级是**预期内**的（smoke 的假 ctx 与本部署都没有 settingsScope，
      // 计划 §7 要求每次 CI 都走到它），可见后果是界面按默认值显示。倾倒整个 error 对象会让
      // 每次 CI 多出一段堆栈、淹没真正的异常——**不要顺手把 err 整个对象加回来**。
      console.warn(
        "[prompt-enhancer] 无 settingsScope，降级读取设置失败，已按默认值显示：" +
          (err instanceof Error ? err.message : String(err)),
      );
    },
  );
}

/** 惰性降级读入口：无 scope 且本期尚未试过才发那一次（各消费点与 scope 注销共用）。 */
function tryFallbackRead(): void {
  if (scope !== null || fallbackAttempted) return;
  fallbackAttempted = true;
  readSettingsFallback();
}

/**
 * 注入 / 注销宿主设置 scope（由 `src/client/index.ts` 的条件注入调用）。
 *
 * **订阅 scope 是本模块成为「唯一真源」的承重线**（D-P8-2）：宿主镜像每次已提交变更后推一次快照
 * （设置页写、别的标签页写、外部改 settings.yaml 都一样），store 据此换快照并广播给全部消费点。
 * 不订阅就只剩「注入那一刻的一次读」——那正是本任务要消灭的「mount 时读一次」。
 *
 * 注销（`next === null`）时重新武装并补一次降级读。注意**服务缺席**时本回调根本不会被执行
 * （cordis 只在服务就位时调用 `ctx.inject` 的回调），故降级读的真实入口是**首次消费**；这条
 * `null` 跃迁只出现在 inject disposer（服务被运行时撤下 / 插件卸载），保留它是因为服务被撤下后
 * 快照需要重新取一次真值。
 */
export function setSettingsScope(next: ClientSettingsScope | null): void {
  unsubscribeScope?.();
  unsubscribeScope = undefined;
  scope = next;
  if (next !== null) unsubscribeScope = next.subscribe(derive);
  derive();
  if (next === null) {
    // 服务被运行时撤下 ⇒ 重新武装一次降级读（快照重新取真值）；就绪标记同时归零——上一期的
    // 「已落地」不能替这一期担保。
    fallbackAttempted = false;
    fallbackLanded = false;
    tryFallbackRead();
  }
}

/** 当前快照（副本语义：调用方改它不影响 store）。**首次消费**即触发那一次降级读。 */
export function getSettingsSnapshot(): PluginSettings {
  tryFallbackRead();
  return { ...snapshot };
}

/**
 * **当前快照是否可信**（P8 二审 I2 的就绪面）：命令式消费者（落库前的淘汰预检、导入后的超限提示）
 * 必须先用它，再决定要不要把快照当成「此刻生效的设置」。
 *
 *   · 有宿主 scope ⇒ 宿主快照 `status === "ready"`。`ClientSettingsScope.getSnapshot()` 一向回
 *     `{ status, value }`，此前 value 被读、status 被丢——丢了 status 就等于把「还没就绪」的
 *     镜像当成权威值；
 *   · 无 scope ⇒ 那次**降级读是否已成功落地**。失败（或仍在途）⇒ **永远**不就绪，绝不因为
 *     快照里恰好是默认值而假装可信。
 *
 * 为什么必须有这一面：淘汰预检此前读到的若是默认值（`maxPromptCount: 300`）而宿主真实上限更低
 * （如 20），`previewEvictions` 会得到空受害者 ⇒ **跳过二次确认** ⇒ 宿主静默淘汰，且不可逆。
 * 改造前那条**宿主设置路由**（`GET /settings`）读失败即抛出（**失败关闭**、可见报错），改造后必须恢复同一
 * 性质——故消费者在不就绪时**抛出**，而不是按默认上限继续。
 *
 * **只服务命令式消费者**：渲染路径**不得**引入「未就绪 null 态」（本里程碑明确移除的设计）。
 *
 * 本函数**不**触发降级读：那一次读由「首次消费」（`getSettingsSnapshot` / `subscribeSettings` /
 * `updateSettings`）触发，否则一个纯粹的就绪查询会变成 I/O 副作用。
 */
export function isSettingsReady(): boolean {
  if (scope !== null) return scope.getSnapshot().status === "ready";
  return fallbackLanded;
}

/** 订阅快照替换（返回退订函数；重复退订安全）。**首次消费**即触发那一次降级读。 */
export function subscribeSettings(listener: () => void): () => void {
  tryFallbackRead();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** 订阅设置（useState + useEffect(subscribe)，与 ui-state.ts 同形态；本仓库不用 uSES）。 */
export function useSettings(): PluginSettings {
  const { useState, useEffect } = hooks();
  const [value, setValue] = useState<PluginSettings>(getSettingsSnapshot);
  useEffect(() => subscribeSettings(() => setValue(getSettingsSnapshot())), []);
  return value;
}

/**
 * 写设置。有宿主 scope ⇒ 逐字段 `set`（宿主校验 + 广播，写回答折回镜像 ⇒ 本 store 自动换快照）；
 * 无 scope（无 ui-settings 的部署 / smoke 的假 ctx）⇒ 降级为 `PUT /settings` 并本地刷新。
 * 失败一律**抛出**（调用方出可读错误）：设置改了却什么都没发生，比报错更糟。
 */
export async function updateSettings(patch: Partial<PluginSettings>): Promise<void> {
  tryFallbackRead(); // **首次消费**即触发那一次降级读（与读路径同一入口）
  const entries = Object.entries(patch) as [keyof PluginSettings, unknown][];
  if (entries.length === 0) return;
  if (scope !== null) {
    for (const [key, value] of entries) await scope.set(String(key), value);
    return;
  }
  const next = await api.updateSettings(patch);
  snapshot = normalizeSettings(next);
  emit();
}
