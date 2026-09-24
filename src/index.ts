/**
 * dsh-prompt-enhancer — host 入口。
 *
 * P1 只建立生命周期骨架：验证插件能被宿主加载。
 * P3 会在这里注册 HTTP 路由（/api/prompt-enhancer/*）与 LLM 服务注入。
 * 本插件刻意不注册任何 systemPrompt section（规格 §2.2）。
 */
import type { Context } from "@deepseek-ai/cordis";

export const name = "prompt-enhancer";

/** webServer / llm 均按条件 ctx.inject 获取，故无静态必需服务。 */
export const inject: string[] = [];

export function apply(ctx: Context): void {
  ctx.effect(() => {
    if (__DEV__) {
      console.log("[prompt-enhancer] host loaded v" + __PLUGIN_VERSION__);
    }
    return () => {
      if (__DEV__) console.log("[prompt-enhancer] host unloaded");
    };
  }, "prompt-enhancer: lifecycle");
}
