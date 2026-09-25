/**
 * dsh-prompt-enhancer — 浏览器入口。
 *
 * 以 DSH 客户端模块格式构建到 lib/client.js：
 *   window.__ModuleLoader__.load({ id, factory: (require) => {...} })
 * 模块 id 由 scripts/build.mjs 从 package.json.name 派生，不得硬编码。
 *
 * P4 起在此注册插槽（规格 §7.1）；至今落下五个座位——
 *   conversation.input.left（词库按钮，order 10）
 *   conversation.input.overlay（`#` 候选浮层，order 20）
 *   conversation.input.left（AI 优化按钮，order 11）
 *   shell.overlay（管理面板弹窗宿主，order 100）—— P6
 *   sidebar.footer.action（左侧下方入口，order 100）—— P6
 * 其余两个座位（recommend / settings.section）按路线图属 P7/P8。i18n 字典随本 fiber 注册，卸载即撤。
 * 注册顺序即产物内注册顺序，也是 scripts/smoke.mjs 行为断言的账本顺序。
 * P6 追加：目录选择能力（ctx.uiWorkspace）经**条件注入**持有，inject 导出数组不扩张。
 * P8 T1 追加：设置唯一真源（ctx.settingsScope）同走条件注入——段序固定为
 *   ["slots"] → ["uiWorkspace"] → ["settingsScope"]（smoke 按此顺序断言；任务 3 会把
 *   ["uiConversation"] 插在 uiWorkspace 与 settingsScope 之间）。
 */

import type { Context as ClientContext } from "@deepseek-ai/cordis";
// type-only：拉入 slots / locale 的 Context 增强与 SlotMap 声明（无运行时依赖）
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
// ctx.slots 的 Context 增强由 ui-renderer 的 client 半声明（官方 ui-commands 同样引它）
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
// ctx.uiWorkspace 的 Context 增强（目录选择能力）由 ui-workspace 的 client 半声明
import type {} from "@deepseek-ai/dsh-client-ui-workspace/client";
// ctx.settingsScope 的 Context 增强与服务类型（设置命名空间绑定的入口）
import type { SettingsScopeBinder } from "@deepseek-ai/dsh-client-ui-settings/client";
import { AIPolishButton } from "./components/AIPolishButton.tsx";
import { HashSuggestOverlay } from "./components/HashSuggestOverlay.tsx";
import { PromptLibraryButton } from "./components/PromptLibraryButton.tsx";
import { PromptSurfaceHost } from "./components/PromptSurfaceHost.tsx";
import { SidebarPromptEntry } from "./components/SidebarPromptEntry.tsx";
import { en, NS, zh, type PromptEnhancerKey } from "./utils/i18n.ts";
import { setSettingsScope } from "./utils/settings-store.ts";
import { setDirectoryCapability } from "./utils/workspace-dir.ts";

/**
 * 设置命名空间（与宿主 `src/host/settings.ts#SETTINGS_NAMESPACE` 同值）。
 *
 * 此处**重述而非 import**：`host/settings.ts` 拉 `@deepseek-ai/schemastery` 且属 host 侧，
 * 引进 client bundle 会跨 host/client 边界（与 api.ts 里「响应形状在客户端重述」同一纪律）。
 */
const SETTINGS_NAMESPACE = "prompt-enhancer";

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
    // root 作用域的弹窗宿主（规格 §7.1）：**始终挂载**，由组件自己按 store 决定渲染与否；
    // 关闭态必须零盒子（见 PromptSurfaceHost 的注释——该层 inset:0 且继承 pointer-events:auto）。
    scope.slots.inject("shell.overlay", () =>
      scope.slots.register(
        { name: "shell.overlay", id: "prompt-enhancer", order: 100, locale: NS },
        PromptSurfaceHost,
      ),
    );
    // 左侧下方入口（规格 §7.3 / 验收 18）：无会话也能打开管理面板（root 作用域）。
    scope.slots.inject("sidebar.footer.action", () =>
      scope.slots.register(
        { name: "sidebar.footer.action", id: "prompt-enhancer", order: 100, locale: NS },
        SidebarPromptEntry,
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

  // 设置唯一真源（P8 T1 / TBD-P8-1 的 (a)）：服务缺席时 store 回落默认值 + HTTP 降级。
  //
  // 注入的是**绑定到本命名空间的 scope**（`binder.bind({ namespace })`），不是 binder 本身：
  // 宿主 `ctx.settingsScope` 是 `SettingsScopeBinder`，只有 `bind` / `describe`；读快照与写字段
  // 都在绑定后的 `SettingsScope`（`getSnapshot` / `subscribe` / `set`）上——store 要的正是它。
  // smoke 的假 ctx 没有该服务（真宿主里 ctx.inject 保证在场），故仍按可选面处理、缺席即 null。
  ctx.inject(["settingsScope"], (scope: ClientContext) => {
    const binder = scope.settingsScope as SettingsScopeBinder | undefined;
    setSettingsScope(binder ? binder.bind({ namespace: SETTINGS_NAMESPACE }) : null);
    return () => setSettingsScope(null);
  });
}
