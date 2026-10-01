/**
 * dsh-prompt-enhancer — host 入口（唯一装配点）。
 *
 * dsh 0.2.0 契约（packages/settings/settings/src/index.ts，dsh-v0.2.0-rc.2）：
 *   - 设置即**插件 Config**：本入口导出 `Config`（13 个 volatile 字段），宿主的
 *     `SettingsForms` 服务按条目 id（`cordis.patch.yml` 的 `id: prompt-enhancer`）投影
 *     设置页表单并写回 profile patch；
 *   - 写路径经 `ctx.settings.update(entryId, patch)`（0.1.5 的 `ctx.settings.register`
 *     已删除，旧写法启动即抛 `settings.register is not a function`——设置页保存 503 的根因）；
 *   - volatile 变更由 loader 以 `loader/volatile-update` 推给运行中的 fiber（不重挂载），
 *     这取代了 0.1.5 时代 `scope.watch` 的权威边沿（覆盖任意写入者：设置页、客户端
 *     `configForms`、外部改 profile patch——loader 重读 profile 是它们共同的下游）；
 *   - `apply(ctx, config)` 拿到的 config 里 volatile 字段是 `Volatile<T>` 引用，读值
 *     经 `resolvePluginSettings()` 解包（每次重解，变更后 `get()` 即新值）。
 *
 * 条件装配：
 *   llm        → 注入 LLM；缺失则 AI 能力整体停用（路由返回 503）
 *   webServer  → 注册单条 prefix 路由 `/api/prompt-enhancer`
 *   lifecycle  → 生命周期日志（仅开发构建）
 *
 * 本插件**刻意不注册任何 systemPrompt section**（规格 §2.2 的硬约束）。
 */
// dsh-settings 的 Context 增强以窄接口出现在 host/settings.ts（本机 profile 的符号链接
// 对该包悬空，整包 type import 会断 typecheck；运行时 ctx.settings 由 0.2.0 宿主真实提供）。
import type {} from "@deepseek-ai/dsh-host-webserver";
import type {} from "@deepseek-ai/dsh-llm";
import type {} from "@deepseek-ai/cordis-plugin-loader";
import type { Context } from "@deepseek-ai/cordis";
import { clearRouteCache, registerLlm } from "./host/ai.ts";
import { makeRoutes } from "./host/routes.ts";
import {
  bindSettingsHost,
  CONFIG_NAMESPACE,
  PromptEnhancerSettingsSchema,
  type PluginRuntimeConfig,
} from "./host/settings.ts";

export const name = "prompt-enhancer";

/** 三个服务都按条件注入并各自降级，故无静态必需服务。 */
export const inject: string[] = [];

/** 插件 Config（0.2.0）：宿主 SettingsForms 据此生成设置页并写回 profile patch。 */
export const Config = PromptEnhancerSettingsSchema;

/** 配置变更后的联动（0.2.0：清 AI 路由缓存——provider/model 改了必须换路由）。 */
function onSettingsChanged(): void {
  clearRouteCache();
}

export function apply(ctx: Context, config: PluginRuntimeConfig): void {
  // 装配期绑定：读写面（host/settings.ts）持有宿主 ctx（定位 ctx.settings）与 Config 引用
  // （读当前值）。传 undefined 的注销分支对应 fiber 卸载——宿主重挂载时 apply 重跑再绑定。
  bindSettingsHost(ctx as never, config);
  onSettingsChanged();

  ctx.inject(["llm"], (llmCtx) => {
    registerLlm(llmCtx.llm);
    return () => registerLlm(undefined);
  });

  ctx.inject(["webServer"], (httpCtx) => {
    httpCtx.effect(() => {
      const disposers = makeRoutes().map((route) => httpCtx.webServer.register(route));
      return () => {
        for (const dispose of disposers) dispose();
      };
    }, "prompt-enhancer: routes");
  });

  // 0.2.0 的权威边沿：任何写入者（设置页 / 客户端 configForms / 外部改 profile patch）最终
  // 都经 loader 提交，volatile-only 变更由此事件到达运行中的 fiber。loader 只在值真的变了
  // 时发出（_commitVolatile 先 deepEqual），故这里直接清缓存即可。
  ctx.on("loader/volatile-update", onSettingsChanged);

  ctx.effect(() => {
    if (__DEV__) console.log("[prompt-enhancer] host loaded v" + __PLUGIN_VERSION__);
    return () => {
      if (__DEV__) console.log("[prompt-enhancer] host unloaded");
      bindSettingsHost(undefined, undefined);
    };
  }, "prompt-enhancer: lifecycle");
}

/** 设置命名空间（0.2.0 起即 profile 条目 id）——转发唯一真源，供 smoke / 文档引用。 */
export { CONFIG_NAMESPACE };
