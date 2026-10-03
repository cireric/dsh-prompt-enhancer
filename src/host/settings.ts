/**
 * 插件配置（dsh 0.2.0 契约）。
 *
 * 0.2.0 起 `ctx.settings.register()` 已被移除（旧 0.1.5 的 settings.yaml 命名空间机制随
 * `settings-file` 包一起删除，启动即报 `settings.register is not a function`，设置写入因此
 * 503）。新契约（packages/settings/settings/src/index.ts，dsh-v0.2.0-rc.2）：设置即**插件
 * Config**，宿主的 `SettingsForms` 服务按条目 id 投影 schema 的 `volatile` 字段为表单并写回
 * profile patch；插件经 `ctx.settings.update(entryId, patch)` 合并写入，volatile 变更由
 * loader 以 `loader/volatile-update` 事件推给运行中的 fiber（不重挂载）。
 *
 * 因此本模块从「settings 命名空间注册器」改为「**插件 Config 模块**」：
 *  - `PromptEnhancerSettingsSchema` 的 13 个字段全部 `.volatile()`（设置页热编辑的前提：
 *    非 volatile 字段不在表单投影里，写回会被宿主 `isVolatilePath` 校验拒绝）；
 *  - 数值边界（step/min/max）留在 schema 上，非法值仍在宿主边界被拦下；
 *  - 归一化（缺失/类型不符回落默认值）留在 `settings-shape.ts` 的 `normalizeSettings`——
 *    Config 解析后 volatile 字段是 `Volatile<T>` 引用（`ref.get()` 取值），须解包后再归一。
 *
 * 依赖面刻意收窄：本文件不 import cordis / 宿主服务，跑 `node --test` 时直接调用即可。
 */
import z from "@deepseek-ai/schemastery";
import {
  MAX_PROMPT_COUNT_BOUNDS,
  normalizeSettings,
  PANEL_SIZE_BOUNDS,
  SETTINGS_NAMESPACE as CONFIG_NAMESPACE,
} from "../settings-shape.ts";
import { DEFAULT_SETTINGS, type PluginSettings } from "../types.ts";

/**
 * 设置命名空间（0.2.0 起即 profile 条目 id）——**转发** `../settings-shape.ts` 的唯一真源。
 * 名字从 `SETTINGS_NAMESPACE` 改为 `CONFIG_NAMESPACE` 反映新语义（settings.yaml 顶层 key →
 * loader 条目 id），但值不变，客户端侧继续共用。
 */
export { CONFIG_NAMESPACE };

/** 插件 Config（0.2.0 契约）：13 个字段全部 volatile，设置页热编辑、变更经事件推送。 */
export const PromptEnhancerSettingsSchema = z.object({
  panelWidth: z.number().step(1).min(PANEL_SIZE_BOUNDS.min).max(PANEL_SIZE_BOUNDS.max).default(DEFAULT_SETTINGS.panelWidth).volatile(),
  panelHeight: z.number().step(1).min(PANEL_SIZE_BOUNDS.min).max(PANEL_SIZE_BOUNDS.max).default(DEFAULT_SETTINGS.panelHeight).volatile(),
  showComposerButton: z.boolean().default(DEFAULT_SETTINGS.showComposerButton).volatile(),
  composerButtonIconOnly: z.boolean().default(DEFAULT_SETTINGS.composerButtonIconOnly).volatile(),
  showAIPolishButton: z.boolean().default(DEFAULT_SETTINGS.showAIPolishButton).volatile(),
  aiPolishButtonIconOnly: z.boolean().default(DEFAULT_SETTINGS.aiPolishButtonIconOnly).volatile(),
  hashTriggerEnabled: z.boolean().default(DEFAULT_SETTINGS.hashTriggerEnabled).volatile(),
  contextRecommendEnabled: z.boolean().default(DEFAULT_SETTINGS.contextRecommendEnabled).volatile(),
  selectionAddEnabled: z.boolean().default(DEFAULT_SETTINGS.selectionAddEnabled).volatile(),
  showSidebarButton: z.boolean().default(DEFAULT_SETTINGS.showSidebarButton).volatile(),
  maxPromptCount: z.number().step(1).min(MAX_PROMPT_COUNT_BOUNDS.min).max(MAX_PROMPT_COUNT_BOUNDS.max).default(DEFAULT_SETTINGS.maxPromptCount).volatile(),
  aiProvider: z.string().default(DEFAULT_SETTINGS.aiProvider).volatile(),
  aiModel: z.string().default(DEFAULT_SETTINGS.aiModel).volatile(),
});

/**
 * Config 解析产物：volatile 字段经 schemastery 解析成 `Volatile<T>` 引用（`ref.get()` 取值）。
 * 这就是 `apply(ctx, config)` 收到的形状——直接 `config.panelWidth` 拿到的是引用不是数值。
 */
export type PluginRuntimeConfig = {
  [K in keyof PluginSettings]: { get(): PluginSettings[K] };
};

/**
 * 从解析后的 Config 取当前设置值并归一化。
 *
 * 每次调用都重新解包：0.2.0 的 volatile 变更**原地更新引用**（loader 的 `updateVolatile`），
 * 同一个 `config` 对象在 `loader/volatile-update` 后 `get()` 就返回新值——缓存解包结果会
 * 让路由层永远读到旧值。
 */
export function resolvePluginSettings(config: PluginRuntimeConfig): PluginSettings {
  const raw: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof PluginSettings)[]) {
    const ref: unknown = config[key];
    raw[key] = ref && typeof ref === "object" && typeof (ref as { get?: unknown }).get === "function"
      ? (ref as { get(): unknown }).get()
      : ref;
  }
  return normalizeSettings(raw);
}

// ── 宿主绑定（0.2.0 读写面）──────────────────────────────────────────────

/**
 * 宿主面上本插件真正用到的部分（刻意收窄，跑 `node --test` 时注入假对象即可）。
 *
 * `settings` 是 0.2.0 的 `SettingsForms`（`@deepseek-ai/dsh-settings`）：
 *  - `update(ns, patch)` 按条目 id 合并写回 profile patch（宿主 schema 校验 + loader 提交）；
 *  - `writable` 为 false 时宿主拒收一切写（极简宿主 / 只读部署）。
 * 类型面在此收窄而非 import 整包：dsh-settings 在本机的 profile 符号链接是悬空的
 * （旧安装残留），import 会破坏 typecheck；窄接口与运行时契约逐格同形（见
 * harness packages/settings/settings/src/index.ts 的 SettingsForms.update / writable）。
 */
export interface SettingsHostLike {
  settings?: {
    update(ns: string, patch: object): Promise<void>;
    writable?: boolean;
  };
}

let host: SettingsHostLike | undefined;
let runtimeConfig: PluginRuntimeConfig | undefined;

/**
 * `apply` 装配时绑定宿主 ctx 与运行中的 Config 引用（`src/index.ts` 调用）。
 * 传 `undefined` 即注销（fiber 卸载）。
 */
export function bindSettingsHost(ctx: SettingsHostLike | undefined, config: PluginRuntimeConfig | undefined): void {
  host = ctx;
  runtimeConfig = config;
}

/** 设置服务当前是否可写（`PUT /settings` 据此决定是否返回 503）。 */
export function isSettingsAvailable(): boolean {
  return host?.settings !== undefined && host.settings.writable !== false;
}

/** 读当前设置；未装配或读取失败时回落默认值（normalizeSettings 逐字段兜底）。 */
export function getSettings(): PluginSettings {
  if (!runtimeConfig) return { ...DEFAULT_SETTINGS };
  try {
    return resolvePluginSettings(runtimeConfig);
  } catch (e) {
    console.warn("[prompt-enhancer] 读取设置失败，已回落默认值：" + String(e));
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * 合并写入一份设置补丁并返回合并后的完整设置。
 *
 * 走 0.2.0 官方正路 `ctx.settings.update(entryId, patch)`（`SettingsForms` 按条目 id 定位
 * 本插件的 profile 条目，schema 校验后写回 profile patch，经 loader 提交 volatile 变更并
 * 发 `loader/volatile-update`）。服务不可用时**抛错**而不是静默丢弃——用户改了设置却什么
 * 都没发生，是比报错更糟的失败模式（路由层把它转成 503 + 可读原因）。
 *
 * 为什么不用 `mutate`（逐字段 path op）：设置页的语义就是「整段 13 键的合法子集」，
 * `update` 一次合并、schema 整体校验，与宿主设置页自己的批量写同一形状。
 */
export async function updateSettings(patch: Partial<PluginSettings>): Promise<PluginSettings> {
  if (!isSettingsAvailable() || !host?.settings) {
    throw new Error("设置服务不可用（宿主未提供 settings 服务）");
  }
  await host.settings.update(CONFIG_NAMESPACE, patch);
  return getSettings();
}
