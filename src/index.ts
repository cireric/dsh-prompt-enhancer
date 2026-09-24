/**
 * dsh-prompt-enhancer — host 入口（唯一装配点）。
 *
 * 四段条件装配（规格 §3.2 + §13.6）：
 *   settings   → 注册设置命名空间（宿主负责 settings.yaml 的读写）
 *   llm        → 注入 LLM；缺失则 AI 能力整体停用（路由返回 503）
 *   webServer  → 注册单条 prefix 路由 `/api/prompt-enhancer`
 *   lifecycle  → 生命周期日志（仅开发构建）
 *
 * 本插件**刻意不注册任何 systemPrompt section**（规格 §2.2 的硬约束）。
 */
import type {} from "@deepseek-ai/dsh-host-webserver";
import type {} from "@deepseek-ai/dsh-llm";
import type {} from "@deepseek-ai/dsh-settings";
import type { Context } from "@deepseek-ai/cordis";
import { registerLlm } from "./host/ai.ts";
import { makeRoutes } from "./host/routes.ts";
import { PromptEnhancerSettingsSchema, registerSettings, SETTINGS_NAMESPACE } from "./host/settings.ts";

export const name = "prompt-enhancer";

/** 三个服务都按条件注入并各自降级，故无静态必需服务。 */
export const inject: string[] = [];

export function apply(ctx: Context): void {
  ctx.inject(["settings"], (settingsCtx) => {
    registerSettings(settingsCtx.settings.register(SETTINGS_NAMESPACE, PromptEnhancerSettingsSchema));
    return () => registerSettings(undefined);
  });

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

  ctx.effect(() => {
    if (__DEV__) console.log("[prompt-enhancer] host loaded v" + __PLUGIN_VERSION__);
    return () => {
      if (__DEV__) console.log("[prompt-enhancer] host unloaded");
    };
  }, "prompt-enhancer: lifecycle");
}
