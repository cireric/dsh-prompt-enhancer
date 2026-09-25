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
 * 触发点只有两个——**模块初始化**与 `setSettingsScope(null)`：有 scope 时读一律走宿主镜像
 * （D-P8-2），换 scope 不再发请求。失败静默回落默认值（只留一条可读 warn），**不重试、不轮询**；
 * 且必被 `then` 的拒绝分支接住——绝不产生未捕获的 rejection。
 *
 * 为什么必须有它：无 ui-settings 的部署里没有任何 scope 注入时机，不在这里读就永远读不到，
 * 界面会一直显示默认值——那是相对「消费点 mount 时各读一次」的**回归**。
 */
function readSettingsFallback(): void {
  api.getSettings().then(
    (value) => {
      // 在途期间拿到了真 scope（权威镜像已接管）⇒ 丢弃这次 HTTP 结果，绝不用它盖住权威值。
      if (scope !== null) return;
      snapshot = normalizeSettings(value);
      emit();
    },
    (err: unknown) => {
      console.warn("[prompt-enhancer] 无 settingsScope，降级读取设置失败，已按默认值显示：", err);
    },
  );
}

/**
 * 注入 / 注销宿主设置 scope（由 `src/client/index.ts` 的条件注入调用）。
 *
 * **订阅 scope 是本模块成为「唯一真源」的承重线**（D-P8-2）：宿主镜像每次已提交变更后推一次快照
 * （设置页写、别的标签页写、外部改 settings.yaml 都一样），store 据此换快照并广播给全部消费点。
 * 不订阅就只剩「注入那一刻的一次读」——那正是本任务要消灭的「mount 时读一次」。
 *
 * 注销（`next === null`）时补一次降级读：这条路径正是「本部署没有 settingsScope」与
 * 「scope 被卸载」的入口，快照落回默认值后再尽力取一次真实值。
 */
export function setSettingsScope(next: ClientSettingsScope | null): void {
  unsubscribeScope?.();
  unsubscribeScope = undefined;
  scope = next;
  if (next !== null) unsubscribeScope = next.subscribe(derive);
  derive();
  if (next === null) readSettingsFallback();
}

/** 当前快照（副本语义：调用方改它不影响 store）。 */
export function getSettingsSnapshot(): PluginSettings {
  return { ...snapshot };
}

/** 订阅快照替换（返回退订函数；重复退订安全）。 */
export function subscribeSettings(listener: () => void): () => void {
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
// 模块初始化即降级读一次：无 ui-settings 的部署里没有任何 scope 注入时机（R-P8-1）。
readSettingsFallback();
