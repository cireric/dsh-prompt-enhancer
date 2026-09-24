/**
 * dsh-prompt-enhancer — 浏览器入口。
 *
 * 以 DSH 客户端模块格式构建到 lib/client.js：
 *   window.__ModuleLoader__.load({ id, factory: (require) => {...} })
 * 模块 id 由 scripts/build.mjs 从 package.json.name 派生，不得硬编码。
 *
 * P4 起在此注册插槽（规格 §7.1）；至今落下三个座位——
 *   conversation.input.left（词库按钮，order 10）
 *   conversation.input.overlay（`#` 候选浮层，order 20）
 *   conversation.input.left（AI 优化按钮，order 11）
 * 其余座位按路线图属 P6/P7/P8。i18n 字典随本 fiber 注册，卸载即撤。
 * 注册顺序即产物内注册顺序，也是 scripts/smoke.mjs 行为断言的账本顺序。
 * P6 追加：目录选择能力（ctx.uiWorkspace）经**条件注入**持有，inject 导出数组不扩张。
 */

import type { Context as ClientContext } from "@deepseek-ai/cordis";
// type-only：拉入 slots / locale 的 Context 增强与 SlotMap 声明（无运行时依赖）
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
// ctx.slots 的 Context 增强由 ui-renderer 的 client 半声明（官方 ui-commands 同样引它）
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
// ctx.uiWorkspace 的 Context 增强（目录选择能力）由 ui-workspace 的 client 半声明
import type {} from "@deepseek-ai/dsh-client-ui-workspace/client";
import { AIPolishButton } from "./components/AIPolishButton.tsx";
import { HashSuggestOverlay } from "./components/HashSuggestOverlay.tsx";
import { PromptLibraryButton } from "./components/PromptLibraryButton.tsx";
import { en, NS, zh, type PromptEnhancerKey } from "./utils/i18n.ts";
import { setDirectoryCapability } from "./utils/workspace-dir.ts";

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
    scope.slots.inject("conversation.input.left", () =>
      scope.slots.register(
        { name: "conversation.input.left", id: "prompt-enhancer-ai-polish", order: 11, locale: NS },
        AIPolishButton,
      ),
    );
  });

  // 目录选择能力走**条件注入**（P6-7 / R2）：inject 导出数组保持 ["slots","locale"] 不扩张。
  // 服务缺席时（无该客户端的部署、smoke 的假 ctx）能力为 null —— 导出按钮据此渲染禁用 +
  // 可读原因，其余功能不受影响（D-P6-4）。卸载即复位，不留悬挂能力。
  ctx.inject(["uiWorkspace"], (scope: ClientContext) => {
    setDirectoryCapability(scope.uiWorkspace ?? null);
    return () => setDirectoryCapability(null);
  });

  ctx.effect(() => {
    if (__DEV__) console.log("[prompt-enhancer] client loaded v" + __PLUGIN_VERSION__);
    return () => {
      if (__DEV__) console.log("[prompt-enhancer] client unloaded");
    };
  }, "prompt-enhancer: lifecycle");
}
