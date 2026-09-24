/**
 * dsh-prompt-enhancer — 浏览器入口。
 *
 * 以 DSH 客户端模块格式构建到 lib/client.js：
 *   window.__ModuleLoader__.load({ id, factory: (require) => {...} })
 *
 * P1 只建立生命周期骨架。P4 起在此注册插槽（规格 §7.1）：
 *   conversation.input.left ×2 / sidebar.footer.action /
 *   conversation.input.dock / settings.section / shell.overlay
 */

/** 本插件使用的客户端服务（P1 仅需 effect 建立生命周期）。 */
interface ClientCtx {
  effect(fn: () => unknown, label: string): unknown;
}

/** P1 不注册任何插槽，故不声明 slots / locale。 */
export const inject: string[] = [];

export function apply(ctx: ClientCtx): void {
  ctx.effect(() => {
    if (__DEV__) {
      console.log("[prompt-enhancer] client loaded v" + __PLUGIN_VERSION__);
    }
    return () => {
      if (__DEV__) console.log("[prompt-enhancer] client unloaded");
    };
  }, "prompt-enhancer: lifecycle");
}
