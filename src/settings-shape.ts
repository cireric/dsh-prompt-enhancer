/**
 * 设置形状的**唯一真源**（P8 T1 / D-P8-1）：13 键规范序 + 逐字段归一。
 *
 * 为什么单独成文件：宿主 `host/settings.ts` 与客户端 `client/utils/settings-store.ts` 必须
 * 对「一个合法设置长什么样」给出**逐格同值**的答案（否则界面显示的值与宿主实际生效的值会漂移），
 * 而客户端不能 import 宿主模块（`host/settings.ts` 拉 `@deepseek-ai/schemastery`，还会把 host 侧
 * 代码带进 client bundle）。故把归一化提到这个**零依赖**模块，两侧共用同一份——与
 * `src/skill-badge.ts` 同一手法。测试直接 import 本文件即可覆盖两侧共同的形状契约。
 */
import { DEFAULT_SETTINGS, type PluginSettings } from "./types.ts";

/**
 * 设置命名空间（写入 `settings.yaml` 的顶层 key）——**唯一真源**（P8 二审 I3）。
 *
 * 宿主 `host/settings.ts` 用它注册 schema，客户端 `client/index.ts` 用它做
 * `SettingsScopeBinder.bind({ namespace })`。此前两侧各持一份**字面量**：漂移是**静默**的——
 * 写会落进宿主不认识的命名空间，UI 反而显示写成功、设置完全不生效，且无任何自动化判据。
 *
 * 为什么放得住：本模块**零依赖**（只 import `types.ts` 的默认值与类型），客户端 import 它不会
 * 拉进 `@deepseek-ai/schemastery` 或任何 host 侧代码——这正是 D-P8-1 分出本模块的理由。
 */
export const SETTINGS_NAMESPACE = "prompt-enhancer";

/** 13 个字段的规范序（设置页的渲染顺序也读它）。 */
export const SETTINGS_KEYS = [
  "aiProvider", "aiModel",
  "panelWidth", "panelHeight",
  "showComposerButton", "composerButtonIconOnly",
  "showAIPolishButton", "aiPolishButtonIconOnly",
  "hashTriggerEnabled", "contextRecommendEnabled",
  "selectionAddEnabled", "showSidebarButton",
  "maxPromptCount",
] as const satisfies readonly (keyof PluginSettings)[];

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
export function normalizeSettings(raw: unknown): PluginSettings {
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
