/**
 * 插件设置的宿主绑定（规格 §4.2 + §13.6）。
 *
 * 设置落在 `$DSH_HOME/settings.yaml` 的 `prompt-enhancer` 命名空间，但**由宿主负责读写**：
 * 我们只把 schema 注册给 `ctx.settings` 并把 scope 存下来，之后 `get / update` 都走宿主。
 * 这样既不需要 `js-yaml`，也不会像上游那样「读整份文件再写回」而丢掉注释或伤到别的命名空间。
 *
 * 依赖面刻意收窄为 `SettingsScopeLike`（`get` / `update`，可选 `watch`）而不是整个 `ctx`：
 * 跑 `node --test` 时没有宿主，注入一个假 scope 就能覆盖默认值兜底与非法值处理。
 */
import z from "@deepseek-ai/schemastery";
import { normalizeSettings } from "../settings-shape.ts";
import { DEFAULT_SETTINGS, type PluginSettings } from "../types.ts";

/**
 * 设置命名空间（写入 `settings.yaml` 的顶层 key）——**转发** `../settings-shape.ts` 的唯一真源
 * （P8 二审 I3），本文件不再持有第二份字面量：它与客户端 `client/index.ts` 那个绑定是**同一个**，
 * 谁改都一起改。之所以转发而不是让下游各自 import：既有消费点 `src/index.ts` 的 import 面不变。
 */
export { SETTINGS_NAMESPACE } from "../settings-shape.ts";

/** 宿主 `SettingsScope` 中我们真正用到的那一部分。 */
export interface SettingsScopeLike {
  get(): unknown;
  update(patch: object): Promise<void> | void;
  /**
   * 观察已提交的设置变更（宿主 `SettingsScope.watch`，可选面）。
   *
   * **刻意收成可选**：跑 `node --test` 时注入的假 scope 没有它，旧调用点（不传 hooks）也照旧工作。
   * 有它才挂观察——「改了就生效」的权威边沿是宿主的（覆盖任意写入者：HTTP 路由、settingsScope
   * 的 mutate、外部改 settings.yaml），而不是我们自己的某个调用点（D-P8-3）。
   */
  watch?(callback: (next: unknown, prev: unknown) => void): () => void;
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
/** 当前观察的退订器：换 scope 或注销时一并释放，不留悬挂观察者。 */
let unwatch: (() => void) | undefined;

/**
 * 注入 / 注销设置 scope（由 `src/index.ts` 的条件注入调用）。
 *
 * `hooks.onChange` 在**每一次已提交的设置变更**后触发（D-P8-3：清路由缓存这类承重动作放权威层，
 * 覆盖任意写入者）。scope 没有 `watch`（假 scope / 旧宿主）时挂不上——这是有意的降级，
 * 不是错误；调用点原有的兜底路径仍在。
 */
export function registerSettings(
  next: SettingsScopeLike | undefined,
  hooks?: { onChange?: () => void },
): void {
  unwatch?.();
  unwatch = undefined;
  scope = next;
  if (!next) return;
  const onChange = hooks?.onChange;
  if (next.watch && onChange) {
    unwatch = next.watch(() => {
      onChange();
    });
  }
}

/** 设置服务当前是否可用（`PUT /settings` 据此决定是否返回 503）。 */
export function isSettingsAvailable(): boolean {
  return scope !== undefined;
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
