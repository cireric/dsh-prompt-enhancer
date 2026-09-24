/**
 * 插件设置的宿主绑定（规格 §4.2 + §13.6）。
 *
 * 设置落在 `$DSH_HOME/settings.yaml` 的 `prompt-enhancer` 命名空间，但**由宿主负责读写**：
 * 我们只把 schema 注册给 `ctx.settings` 并把 scope 存下来，之后 `get / update` 都走宿主。
 * 这样既不需要 `js-yaml`，也不会像上游那样「读整份文件再写回」而丢掉注释或伤到别的命名空间。
 *
 * 依赖面刻意收窄为 `SettingsScopeLike`（只有 `get` / `update`）而不是整个 `ctx`：
 * 跑 `node --test` 时没有宿主，注入一个假 scope 就能覆盖默认值兜底与非法值处理。
 */
import z from "@deepseek-ai/schemastery";
import { DEFAULT_SETTINGS, type PluginSettings } from "../types.ts";

/** 设置命名空间（写入 `settings.yaml` 的顶层 key）。 */
export const SETTINGS_NAMESPACE = "prompt-enhancer";

/** 宿主 `SettingsScope` 中我们真正用到的那一部分。 */
export interface SettingsScopeLike {
  get(): unknown;
  update(patch: object): Promise<void> | void;
}

/**
 * 设置 schema：字段与默认值取自规格 §4.2 / `types.ts` 的 `DEFAULT_SETTINGS`。
 * 数值字段带边界，让「面板宽 -100」「上限 0」这类非法值在宿主边界就被拦下并抛错。
 */
export const PromptEnhancerSettingsSchema = z.object({
  panelWidth: z.number().step(1).min(200).max(2000).default(DEFAULT_SETTINGS.panelWidth),
  panelHeight: z.number().step(1).min(200).max(2000).default(DEFAULT_SETTINGS.panelHeight),
  showComposerButton: z.boolean().default(DEFAULT_SETTINGS.showComposerButton),
  composerButtonIconOnly: z.boolean().default(DEFAULT_SETTINGS.composerButtonIconOnly),
  showAIPolishButton: z.boolean().default(DEFAULT_SETTINGS.showAIPolishButton),
  aiPolishButtonIconOnly: z.boolean().default(DEFAULT_SETTINGS.aiPolishButtonIconOnly),
  hashTriggerEnabled: z.boolean().default(DEFAULT_SETTINGS.hashTriggerEnabled),
  contextRecommendEnabled: z.boolean().default(DEFAULT_SETTINGS.contextRecommendEnabled),
  selectionAddEnabled: z.boolean().default(DEFAULT_SETTINGS.selectionAddEnabled),
  showSidebarButton: z.boolean().default(DEFAULT_SETTINGS.showSidebarButton),
  maxPromptCount: z.number().step(1).min(1).max(10000).default(DEFAULT_SETTINGS.maxPromptCount),
  aiProvider: z.string().default(DEFAULT_SETTINGS.aiProvider),
  aiModel: z.string().default(DEFAULT_SETTINGS.aiModel),
});

let scope: SettingsScopeLike | undefined;

/** 注入 / 注销设置 scope（由 `src/index.ts` 的条件注入调用）。 */
export function registerSettings(next: SettingsScopeLike | undefined): void {
  scope = next;
}

/** 设置服务当前是否可用（`PUT /settings` 据此决定是否返回 503）。 */
export function isSettingsAvailable(): boolean {
  return scope !== undefined;
}

function pickNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function pickString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

/** 逐字段归一：任何缺失/类型不符的字段都回落默认值，绝不把 `undefined` 漏给调用方。 */
function normalizeSettings(raw: unknown): PluginSettings {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  return {
    panelWidth: pickNumber(r.panelWidth, d.panelWidth),
    panelHeight: pickNumber(r.panelHeight, d.panelHeight),
    showComposerButton: pickBoolean(r.showComposerButton, d.showComposerButton),
    composerButtonIconOnly: pickBoolean(r.composerButtonIconOnly, d.composerButtonIconOnly),
    showAIPolishButton: pickBoolean(r.showAIPolishButton, d.showAIPolishButton),
    aiPolishButtonIconOnly: pickBoolean(r.aiPolishButtonIconOnly, d.aiPolishButtonIconOnly),
    hashTriggerEnabled: pickBoolean(r.hashTriggerEnabled, d.hashTriggerEnabled),
    contextRecommendEnabled: pickBoolean(r.contextRecommendEnabled, d.contextRecommendEnabled),
    selectionAddEnabled: pickBoolean(r.selectionAddEnabled, d.selectionAddEnabled),
    showSidebarButton: pickBoolean(r.showSidebarButton, d.showSidebarButton),
    maxPromptCount: pickNumber(r.maxPromptCount, d.maxPromptCount),
    aiProvider: pickString(r.aiProvider, d.aiProvider),
    aiModel: pickString(r.aiModel, d.aiModel),
  };
}

/** 读当前设置；设置服务不可用或读取失败时回落默认值（返回**副本**，改它不影响默认值）。 */
export function getSettings(): PluginSettings {
  if (!scope) return { ...DEFAULT_SETTINGS };
  try {
    return normalizeSettings(scope.get());
  } catch (e) {
    console.warn("[prompt-enhancer] 读取设置失败，已回落默认值：" + String(e));
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * 合并写入一份设置补丁并返回合并后的完整设置。
 *
 * 设置服务不可用时**抛错**而不是静默丢弃——用户改了设置却什么都没发生，
 * 是比报错更糟的失败模式（路由层会把它转成 503 + 可读原因）。
 */
export async function updateSettings(patch: Partial<PluginSettings>): Promise<PluginSettings> {
  if (!scope) throw new Error("设置服务不可用（宿主未提供 settings 服务）");
  await scope.update(patch);
  return getSettings();
}
