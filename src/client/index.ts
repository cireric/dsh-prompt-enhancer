/**
 * dsh-prompt-enhancer — 浏览器入口。
 *
 * 以 DSH 客户端模块格式构建到 lib/client.js：
 *   window.__ModuleLoader__.load({ id, factory: (require) => {...} })
 * 模块 id 由 scripts/build.mjs 从 package.json.name 派生，不得硬编码。
 *
 * P4 起在此注册插槽（规格 §7.1）；至今落下七个座位（席位至此齐了，P8 T4 补上最后一个）——
 *   conversation.input.left（词库按钮，order 10）
 *   conversation.input.overlay（`#` 候选浮层，order 20）
 *   conversation.input.left（AI 优化按钮，order 11）
 *   shell.overlay（管理面板弹窗宿主，order 100）—— P6
 *   sidebar.footer.action（左侧下方入口，order 100）—— P6
 *   conversation.input.dock（上下文推荐条，order 10）—— P8 T3
 *   settings.section（设置页，order 30）—— P8 T4
 * i18n 字典随本 fiber 注册，卸载即撤。
 * 注册顺序即产物内注册顺序，也是 scripts/smoke.mjs 行为断言的账本顺序。
 * P6 追加：目录选择能力（ctx.uiWorkspace）经**条件注入**持有，inject 导出数组不扩张。
 * P8 T1/T3 追加：设置唯一真源（dsh 0.2.0 起 ctx.configForms，旧为 ctx.settingsScope）与聊天快照（ctx.uiConversation）同走条件注入
 * ——段序固定为
 *   ["slots"] → ["uiWorkspace"] → ["uiConversation"] → ["configForms"]
 *   （smoke 按此顺序断言；T3 的 ["uiConversation"] 插在 uiWorkspace 与设置段之间）。
 */

import type { Context as ClientContext } from "@deepseek-ai/cordis";
// type-only：拉入 slots / locale 的 Context 增强与 SlotMap 声明（无运行时依赖）
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
// ctx.slots 的 Context 增强由 ui-renderer 的 client 半声明（官方 ui-commands 同样引它）
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
// ctx.uiWorkspace 的 Context 增强（目录选择能力）由 ui-workspace 的 client 半声明
import type {} from "@deepseek-ai/dsh-client-ui-workspace/client";
// ctx.configForms 的 Context 增强与 ConfigForm 类型（0.2.0 设置真源的入口）
import type { ConfigForm } from "@deepseek-ai/dsh-client-ui-settings/client";
import { AIPolishButton } from "./components/AIPolishButton.tsx";
import { ContextRecommendations } from "./components/ContextRecommendations.tsx";
import { HashSuggestOverlay } from "./components/HashSuggestOverlay.tsx";
import { PromptLibraryButton } from "./components/PromptLibraryButton.tsx";
import { PromptSurfaceHost } from "./components/PromptSurfaceHost.tsx";
import { SettingsSection } from "./components/settings/SettingsSection.tsx";
import { SidebarPromptEntry } from "./components/SidebarPromptEntry.tsx";
import { setUiConversation, type UiConversationService } from "./utils/conversation-targets.ts";
import { en, NS, zh, type PromptEnhancerKey } from "./utils/i18n.ts";
import { resolveNsFromDescribe, setSettingsNsResolver, setSettingsScope } from "./utils/settings-store.ts";
import { setDirectoryCapability } from "./utils/workspace-dir.ts";
/**
 * 设置命名空间：**取零依赖共用模块的导出**（P8 二审 I3），不再在此重述字面量。
 *
 * 「不 import `host/settings.ts`（它会拉 `@deepseek-ai/schemastery`、把 host 侧代码带进 client
 * bundle）」这条理由对 `../settings-shape.ts` **不成立**——那正是 D-P8-1 建出的零依赖共用模块，
 * 本侧（`utils/settings-store.ts`）与宿主均已在 import。两份字面量的漂移是**静默**的：写落进宿主
 * 不认识的命名空间，UI 反而显示写成功、设置完全不生效。
 */
import { SETTINGS_NAMESPACE } from "../settings-shape.ts";

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface LocaleNamespaceMap {
    "prompt-enhancer": PromptEnhancerKey;
  }
}

export const inject = ["slots", "locale"];

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "prompt-enhancer: dictionaries");

  /**
   * 绑定本命名空间的翻译函数（F-8：本文件此前没有 `t`）。
   *
   * `ctx.locale.bind(ns): TranslateNS<N>`——证据 `packages/client/locale/src/client/index.ts:429-444`
   * （带类型的重载 + 缓存实现）；`inject` 已含 `locale`。只给下面设置页座位的 **label thunk** 用：
   * 宿主每次读 label 都重求值 ⇒ 语言切换后左栏导航行自动跟随，**无需重注册**（§1.4）。
   */
  const t = ctx.locale.bind(NS);

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
    // 上下文推荐条（P8 T3 / 验收 11）：composer 卡片上方的整行 dock（list / session / InputZone）。
    scope.slots.inject("conversation.input.dock", () =>
      scope.slots.register(
        { name: "conversation.input.dock", id: "prompt-enhancer-recommend", order: 10, locale: NS },
        ContextRecommendations,
      ),
    );
    // 设置页（P8 T4 / 验收 12）：宿主设置面板里本插件的一页（13 个字段，见 SettingsSection）。
    // 属主 props 只有 `{ close }`（ui-settings 的 SettingsSectionOwnerProps）——本页不接它，
    // 数据全走自己的 import 面（useSettings / updateSettings / listAiProviders）。
    // **必须排在最后**：注册顺序即 scripts/smoke.mjs 的 EXPECTED_SLOTS 账本顺序，挪位即红。
    scope.slots.inject("settings.section", () =>
      scope.slots.register(
        { name: "settings.section", id: "prompt-enhancer", order: 30, label: () => t("settings.nav"), locale: NS },
        SettingsSection,
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

  // 聊天快照（P8 T3 / 规格 §7.1：conversation-targets.ts 是读「最近聊天」的唯一活数据源，**必需**）。
  // 服务缺席 ⇒ 推荐条退化为「只用当前草稿」，不崩（TBD-P8-4 的降级）。
  // **段序固定**：本段在 uiWorkspace 与设置段（configForms）**之间**（smoke 的 injectDeps 账本按调用顺序断言）。
  ctx.inject(["uiConversation"], (scope: ClientContext) => {
    setUiConversation((scope as unknown as { uiConversation?: UiConversationService }).uiConversation ?? null);
    return () => setUiConversation(null);
  });

  ctx.effect(() => {
    if (__DEV__) console.log("[prompt-enhancer] client loaded v" + __PLUGIN_VERSION__);
    return () => {
      if (__DEV__) console.log("[prompt-enhancer] client unloaded");
    };
  }, "prompt-enhancer: lifecycle");

  // 设置唯一真源（P8 T1 建立，dsh 0.2.0 重接线）：服务缺席时 store 回落默认值 + HTTP 降级。
  //
  // 0.2.0 起客户端设置面是 `ctx.configForms`（ui-settings 的 ConfigForms 服务）：
  // `get(entryId)` 返回该条目的 `ConfigForm`（getSnapshot / subscribe / set）——语义与 0.1.5
  // 的 `settingsScope.bind({ namespace })` 同形，只是入口改名、命名空间即 loader 条目 id。
  //
  // **条目 id 不能写死**：官方 bundles 装配下 id = patch insert 行的 id（本插件 = prompt-enhancer），
  // 但 super-injector 的 `loader.create({ name })` 注入路径给**随机 id**——固定 ns 会写不中
  // （No configurable plugin entry）。故这里包一层**自解析 form 代理**：先按 SETTINGS_NAMESPACE
  // 试；写被拒时经 `configForms.describe()` 按 13 键签名认出真实条目，换绑 form 后由 store 重试。
  // smoke 的假 ctx 没有该服务（真宿主里 ctx.inject 保证在场），故仍按可选面处理、缺席即 null。
  ctx.inject(["configForms"], (scope: ClientContext) => {
    const forms = (scope as unknown as {
      configForms?: {
        get<T>(entryId: string): ConfigForm<T>;
        describe(): { getSnapshot(): { status: string; view?: { namespaces?: readonly { ns: string; value?: unknown; schema?: unknown }[] } } };
      };
    }).configForms;
    if (!forms) {
      setSettingsScope(null);
      return () => setSettingsScope(null);
    }

    let ns: string = SETTINGS_NAMESPACE;
    let form: ConfigForm<Record<string, unknown>> = forms.get(ns);
    let subscribers: Set<() => void> | undefined;
    let unsubscribe: (() => void) | undefined;

    const rebind = (next: string): void => {
      if (next === ns) return;
      ns = next;
      unsubscribe?.();
      form = forms.get(ns);
      const subs = subscribers;
      if (subs && subs.size > 0) unsubscribe = form.subscribe(() => { for (const fn of [...subs]) fn(); });
    };

    /** describe → 13 键签名 → 真实条目 id（settings-store 的 resolveNsFromDescribe）。 */
    const resolveNs = (): string | undefined => {
      const snap = forms.describe().getSnapshot();
      const found = resolveNsFromDescribe(snap.view);
      if (found) rebind(found);
      return found;
    };
    setSettingsNsResolver(resolveNs);

    // 代理面：对 settings-store 完全透明（ClientSettingsScope 同形）。
    setSettingsScope({
      getSnapshot: () => form.getSnapshot(),
      subscribe: (fn: () => void) => {
        subscribers ??= new Set<() => void>();
        const subs = subscribers;
        if (subs.size === 0) unsubscribe = form.subscribe(() => { for (const f of [...subs]) f(); });
        subs.add(fn);
        return () => {
          subs.delete(fn);
          if (subs.size === 0) { unsubscribe?.(); unsubscribe = undefined; }
        };
      },
      set: (field: string, value: unknown) => form.set(field, value),
    });
    return () => {
      setSettingsNsResolver(undefined);
      setSettingsScope(null);
    };
  });
}
