/**
 * dsh-prompt-enhancer — 浏览器入口。
 *
 * 以 DSH 客户端模块格式构建到 lib/client.js：
 *   window.__ModuleLoader__.load({ id, factory: (require) => {...} })
 * 模块 id 由 scripts/build.mjs 从 package.json.name 派生，不得硬编码。
 *
 * P4 起在此注册插槽（规格 §7.1）；本任务落下两个座位——
 *   conversation.input.left（词库按钮，order 10）
 *   conversation.input.overlay（`#` 候选浮层，order 20）
 * 其余座位按路线图属 P5/P7/P8。i18n 字典随本 fiber 注册，卸载即撤。
 */

import type { Context as ClientContext } from "@deepseek-ai/cordis";
// type-only：拉入 slots / locale 的 Context 增强与 SlotMap 声明（无运行时依赖）
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
// ctx.slots 的 Context 增强由 ui-renderer 的 client 半声明（官方 ui-commands 同样引它）
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import { HashSuggestOverlay } from "./components/HashSuggestOverlay.tsx";
import { PromptLibraryButton } from "./components/PromptLibraryButton.tsx";
import { en, NS, zh, type PromptEnhancerKey } from "./utils/i18n.ts";

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface LocaleNamespaceMap {
    "prompt-enhancer": PromptEnhancerKey;
  }
}

export const inject = ["slots", "locale"];

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "prompt-enhancer: dictionaries");

  ctx.inject(["slots"], (scope: ClientContext) => {
    scope.slots.inject("conversation.input.left", () =>
      scope.slots.register(
        { name: "conversation.input.left", id: "prompt-enhancer", order: 10, locale: NS },
        PromptLibraryButton,
      ),
    );
    scope.slots.inject("conversation.input.overlay", () =>
      scope.slots.register(
        { name: "conversation.input.overlay", id: "prompt-enhancer-hash", order: 20, locale: NS },
        HashSuggestOverlay,
      ),
    );
  });

  ctx.effect(() => {
    if (__DEV__) console.log("[prompt-enhancer] client loaded v" + __PLUGIN_VERSION__);
    return () => {
      if (__DEV__) console.log("[prompt-enhancer] client unloaded");
    };
  }, "prompt-enhancer: lifecycle");
}
