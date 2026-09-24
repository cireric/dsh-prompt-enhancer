# dsh-prompt-enhancer P4：复用闭环（客户端）实施计划

> **面向 Agent 执行者：** 必需子技能：使用 superpower-subagent-driven-development（推荐）或 superpower-executing-plans 按任务逐项执行本计划。步骤使用复选框（`- [ ]`）语法跟踪。

**目标：** 交付 **M4**——浏览器端第一次真正落地：输入框旁「词库」按钮 + 快速列表 + 插入 / 覆盖 / 插入并发送 + `{{变量}}` 模板 + `#` 实时筛选浮层，全部走官方插槽，零 DOM 注入。

**架构：** 客户端半首次启用（`src/client/index.ts` 从「零插槽骨架」变成「注册插槽 + 注册 i18n 字典」）。UI 只做展示与交互，**所有持久化都走 P3 已完成的 26 条 HTTP 路由**（同源相对路径 `/api/prompt-enhancer/*`）。可测的纯逻辑（变量解析、`#` 令牌检测、候选过滤、插入语义）一律抽成不依赖 React 的模块，用 `node --test` 做真 TDD；React 组件只做「读状态 → 调纯函数 → 渲染」。

**技术栈：** React 18（经宿主模块加载器 `require`，**external 不打包**）、`@deepseek-ai/dsh-client-ui-slots`（插槽）、`@deepseek-ai/dsh-client-locale`（i18n）、`@deepseek-ai/dsh-client-ui-conversation/client`（`InputState` / `InputActions` 类型）、esbuild（沿用 P1 契约）、`node --test`。

**规格：** `docs/superpowers/specs/2026-09-24-dsh-prompt-enhancer-design.md`（权威）。执行前必读 §2.1-1/2/3（词库 / 复用 / 模板变量）、§4.4（使用统计语义）、§7 全节（插槽、输入框写入契约、入口拓扑、i18n、主题）、§9.3 验收 2/3/4。

---

## 全局约束

1. 路径一律项目根相对 + 正斜杠；命令默认 CWD = 项目根；宿主侧路径用 `$DSH_HOME` 表达。
2. **零 DOM 注入**：只用官方插槽；不得改宿主 DOM、不得 MutationObserver 改造宿主控件（规格 §7.3）。
3. `react` / `react/jsx-runtime` / `@deepseek-ai/*` 一律 external（P1 契约），运行时经 factory 的 `require` 解析。
4. `src/` 内相对导入写显式 `.ts`；`src/**` 必须可擦除 TS；测试直接 `import` `.ts` 源码。
5. 客户端 bundle 注册的模块 id 必须等于包名（由 `package.json.name` 派生）——不得硬编码。
6. **不引入任何新依赖**；不注册 systemPrompt section。
7. 每个任务结束：`typecheck` / `test` / `build` / `smoke` 四项全绿。
8. 只修改本计划列出的文件。Shell 为 macOS（bash）。
9. **客户端改动需连同 `lib/` 产物一起提交**（P1 起 `lib/` 受版本控制；否则会留下已跟踪但内容过期的产物）。
10. **不要重跑 `npm run link-dsh-deps`**：profile 共享目录里有 8 个包是 pnpm 迁移后遗留的**悬空链接**（`dsh-client-runtime` / `dsh-client-schema-form` / `dsh-client-web-react` / `dsh-host-apiproxy` / `dsh-tool-subagent-report` / `node-addon-landlock-run` / `dsh-agent-spine-demo` / `dsh-client-ui-sidebar-textpreview`），重跑会把**当前可用的** `dsh-client-ui-slots` 也换回死路径、静默打断 `tsc`。若遇到类型解析失败：先 `readlink node_modules/@deepseek-ai/<pkg>` 判断是否悬空，若悬空则改指到 `/Users/eric/Project/tests/deepseek-harness/packages/**` 下的真实源码目录，并在报告里说明（任务 2 会把这个自愈能力写进链接器）。

---

## 已核实的宿主契约（2026-09-24 实测，计划里的代码必须与之逐字一致）

> 这一节是本计划的地基：上一版规格对插槽与触发管线的描述有两处与宿主实际不符，已在下方标红。

### 1. 六个官方座位（`slot-catalog.ts` 抽取，全部 `replaceRisk: none`）

| 座位 | kind / scope | 组件能拿到的 owner props | registerOptions | 声明者 |
| --- | --- | --- | --- | --- |
| `conversation.input.left` | list / **session** | **无 owner props**（业务状态走标准 props，见下） | `id`(必填) / `order` / `label` | `ui-conversation/src/client/contract/slots.ts:172` |
| `conversation.input.dock` | list / session | `InputZone` | 同上 | 同上 `:166` |
| `sidebar.footer.action` | list / **root** | `{ wide: boolean }`（false = 56px 窄轨） | 同上 | `ui-sidebar/src/client/contract/slots.ts:50` |
| `settings.section` | list / root | `{ close: () => void }` | 同上 | `ui-settings/src/client/contract/slots.ts:54` |
| `shell.overlay` | list / root | **无 owner props** | 同上 | `ui-layout/src/client/index.ts:91` |
| `conversation.input.overlay` | list / session | **无 owner props** | 同上 | `ui-conversation/.../slots.ts:168`（**规格未列，P4 需要，见决策 D1**） |

**session 作用域的「标准 props」**（框架自动给，不由 owner 给）：`useConversation`、`useInput: SnapshotSelectorHook<InputState>`、`inputActions: InputActions`。
`InputState` 的可用字段：`draft: string`、`draftRev: number`、`phase`、`occurrences`、`queue`、`attachmentIds`。
`InputActions` 的方法：`setDraft(text)`、`submit()`、`addAttachments/removeAttachment/pruneAttachments`。

> ⚠️ **`InputState` 没有 caret / 选区字段**。所有基于「光标位置」的设计在客户端都拿不到宿主数据（详见决策 D2）。

### 2. 注册 API（照 `ui-commands/src/client/index.ts:59-73` 的官方模板）

```ts
ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'prompt-enhancer: dictionaries')
ctx.inject(['slots', 'locale'], (scope) => {
  scope.slots.inject('conversation.input.left', () => scope.slots.register({
    name: 'conversation.input.left',
    id: 'prompt-enhancer',
    order: 10,
    locale: NS,
    // session 作用域插槽可给 per-session 注入面；不需要时整项省略
  }, PromptLibraryButton))
})
```

- 组件 props 的组合范式（照 `ui-plan/PlanModeControl.tsx:12`）：`PropsRuntime<'<slot>' > & InjectFace<XxxInjected> & PropsLocale<NS>`
- i18n 命名空间的**类型**要自行挂到宿主的映射表上，否则 `PropsLocale<'prompt-enhancer'>` 不过编译：

```ts
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'prompt-enhancer': PromptEnhancerKey }
}
```

- 需要 type-only import 拉入 SlotMap 声明：`import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'`、`import type {} from '@deepseek-ai/dsh-client-locale/client'`
- **`ctx.slots` 的 Context 增强由 `@deepseek-ai/dsh-client-ui-renderer/client` 声明**（`ui-slots` 包**没有** `./client` 子路径导出）——任务 1 实测：只引上面两条时 `ctx.slots` 不过编译。补 `import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'` 即可（与官方 `ui-commands` 的写法一致）。
- 任务 1 起 `lib/client.js` 在**加载期**会合法 `require("react")`（P4 的组件要用 React），故 `scripts/smoke.mjs` 的 `fakeRequire` 必须为 `react` / `react/jsx-runtime` / `@deepseek-ai/*` 返回最小桩——这是 P1「加载期零外部依赖」契约在 P4 的自然终止，**不是**放宽断言。

### 3. ⚠️ `#` 触发：宿主触发管线**不支持第三方触发字符**（与规格假设不符）

```ts
// packages/client/ui-input-trigger/src/types.ts:34
export type TriggerChar = '/' | '@'
```

宿主管线（`ctx.inputTriggers.registerSource`）是**封闭联合**：只有 `/`（斜杠命令）与 `@`（文件引用）两个触发器，第三方**无法注册 `#`**。规格 §7 的风险栏写的是「# 触发浮层依赖宿主 composer 的 trigger 管线」——实测该管线从未支持自定义字符，所以这不是「宿主版本变化导致失效」，而是**一开始就不存在这条路**。

**因此 P4 的 `#` 触发必须自建**，见决策 D1/D2（**需用户拍板**）。

---

## 设计决策

| # | 决策 | 理由 |
| --- | --- | --- |
| **D1** | `#` 候选浮层走 `conversation.input.overlay` 座位（规格 §7.1 未列此座位，需追加规格 §13.7） | 该座位就是「composer 卡内浮动条目」的官方位置（宿主自己的斜杠/引用菜单、`ui-message-feedback` 的提示也注册在这里）。自建 `#` 浮层必须有官方落点，否则只能 DOM 注入——那违反 §7.3 |
| **D2** | **`#` 浮层采用「尾令牌 + 点击选择」**：从 `useInput(s => s.draft)` 读草稿，只识别**草稿末尾**的 `#查询词` 令牌；候选用鼠标点击选取（不接管键盘） | `InputState` 无 caret，无法知道光标位置，故只能按「尾令牌」约定工作；而 `↑↓/回车` 需要拿到编辑器按键——公面没有，只能 document 级 keydown 捕获（与 §7.3「零 DOM hack」冲突且要与编辑器争抢按键，见备选 D2-b） |
| **D2-b（备选，需用户选）** | 若要保留 `↑↓/回车`：在浮层打开期间用 `document.addEventListener('keydown', handler, true)` 捕获阶段消费方向键/回车/Esc | 能做到规格 §9.3 验收 2 的完整交互，代价是引入一处全局键盘监听（非 DOM 改写入侵，但已越出「只用官方插槽」的严格精神），且必须严谨处理「何时不消费」（浮层关闭时立刻放行） |
| **D3** | 快速列表与 `#` 候选**共用同一套纯逻辑**（候选过滤 + 插入语义），组件只负责渲染 | 可测性：过滤/替换/插入全部进 `node --test`；UI 层没有单测（无 DOM），靠活 GUI 验收 |
| **D4** | 插入语义严格按规格 §7.2：追加 = `draft ? draft + "\n" + body : body`；覆盖 = `body`；插入并发送 = `setDraft(...)` 后 `submit()` | 宿主没有「在光标处插入」的公开动作，追加/覆盖是确定语义 |
| **D5** | 变量记忆走 `PUT /meta/:key`，键名 `pl:template-var-memory`（与上游客户端一致） | 规格 §4.1 的 meta 表用途即「模板变量记忆」；键名沿用上游以便老数据可用 |
| **D6** | 组件不直接 fetch：统一走 `src/client/utils/api.ts` 的文封解析（`data === undefined` 判失败，规格 §5） | 规格 §5 的信封契约 + 单点错误处理；也让「AI 不可用」等 503 有统一 toast 文案 |
| **D7** | P4 只注册 2 个座位：`conversation.input.left`（按钮）+ `conversation.input.overlay`（`#` 浮层） | 其余 4 个座位按路线图属 P5/P7/P8；一次只落一个可验收的闭环 |

---

## 文件结构

| 文件 | 处置 | 职责 |
| --- | --- | --- |
| `src/client/index.ts` | 改写 | 客户端入口：注册 i18n 字典 + 2 个插槽；`inject = ["slots", "locale"]` |
| `src/client/utils/i18n.ts` | 新写 | `zh` / `en` 两份字典（`en: Record<keyof typeof zh, string>` 做编译期键集校验）+ `PromptEnhancerKey` 类型 |
| `src/client/utils/api.ts` | 新写 | **按需**封装主机路由 + 信封解析（P4 只消费 5 个：`listPrompts` / `recordUsage` / `getSettings` / `getMeta` / `setMeta`；其余 21 条由 P5–P8 各自按需追加，不提前实现） |
| `src/client/utils/template.ts` | 新写（纯逻辑） | `{{变量}}` 解析、填充、记忆键读取 |
| `src/client/utils/hash-token.ts` | 新写（纯逻辑） | 尾令牌 `#查询` 检测与替换、候选过滤打分 |
| `src/client/utils/insert.ts` | 新写（纯逻辑） | 追加 / 覆盖 / 发送三态语义（纯函数，输入 draft，输出新 draft + 是否发送） |
| `src/client/utils/theme.ts` | 新写 | 宿主 token 的内联样式工具（`--dsw-alias-*`） |
| `src/client/components/PromptLibraryButton.tsx` | 新写 | 输入框旁按钮 + 快速列表（含插入/覆盖/发送三动作） |
| `src/client/components/HashSuggestOverlay.tsx` | 新写 | `#` 候选浮层（D1/D2） |
| `src/client/components/TemplateVariablesDialog.tsx` | 新写 | 变量填充弹窗（含上次值记忆） |
| `tests/template.test.mjs` | 新写 | 变量解析/填充/记忆（TDD） |
| `tests/hash-token.test.mjs` | 新写 | 尾令牌检测/替换/过滤（TDD） |
| `tests/insert.test.mjs` | 新写 | 三态插入语义（TDD） |
| `scripts/smoke.mjs` | 改写 | 增加「client bundle 含本轮注册的 2 个 slot 名 + i18n 命名空间」断言 |
| `package.json` | 改写 | `dsh.client.inject` 增 `@deepseek-ai/dsh-client-ui-conversation/client`（仅类型，运行时不需要） |

**不在本计划内：** AI 优化按钮（P5）、管理面板/标签/回收站/导入导出（P6）、技能导出与左侧入口/根级浮层（P7）、上下文推荐与设置页（P8）、`ContextRecommendations`、`SelectionAddPrompt`（P6 沉淀入口之一）。

**交接给 P8（任务 6 评审确认，勿丢）：** 设置项 `hashTriggerEnabled` 目前**无任何客户端消费者**（只在 `types.ts`/`host/settings.ts` 存储与校验）——P8 的设置页必须同时把它接入 `HashSuggestOverlay` 的 token 门（`token && settings.hashTriggerEnabled`），否则该键永久闲置、规格 §9.3-12「关 `#` 触发即时生效」不成立。

**座位覆盖分期（§7.1 的 6 处 + D1 新增 1 处）：**

| 座位 | 里程碑 |
| --- | --- |
| `conversation.input.left` | **P4（本计划）** — 词库按钮 order 10（AI 优化按钮 order 11 在 P5 同座位追加） |
| `conversation.input.overlay` | **P4（本计划，D1）** — `#` 候选浮层 |
| `conversation.input.dock` | P8（上下文推荐） |
| `sidebar.footer.action` | P7（左侧下方入口） |
| `shell.overlay` | P7（弹窗宿主） |
| `settings.section` | P8（设置页） |

`inject` 也是分期的：P4 只需 `["slots", "locale"]`；规格 §7.1 里的 `workspaces`（导出选目录，P6 用）与 `uiConversation`（上下文推荐读 chat 快照，P8 用）在各自里程碑再追加，避免提前声明用不到的服务。

---

## 任务 1：客户端骨架 + i18n + 两个插槽（能看见按钮）

**文件：**
- 新建：`src/client/utils/i18n.ts`、`src/client/utils/theme.ts`
- 新建（**组件骨架，任务 5/6 再换实现**）：`src/client/components/PromptLibraryButton.tsx`、`src/client/components/HashSuggestOverlay.tsx`
- 改写：`src/client/index.ts`、`scripts/smoke.mjs`、`package.json`

**接口：**
- 依赖输入：无（P1 的 client 入口骨架、P1 的 `lib/client.js` 契约）
- 对外产出：`NS = "prompt-enhancer"`；`PromptEnhancerKey`（键联合）；`zh` / `en` 字典；两个插槽注册；**组件 props 范式**：`PropsRuntime<'<slot>'> & PropsLocale<'prompt-enhancer'>`（`PropsRuntime` 对 session 作用域插槽**已内含** `useInput` / `inputActions` / `useConversation`，见 `ui-slots/src/index.ts:229`，**不要**再手写 `SessionStandardProps`）

- [ ] **步骤 1：写 `src/client/utils/i18n.ts`**

```ts
/** 本插件在宿主的 i18n 命名空间（同时用于 PropsLocale<'prompt-enhancer'>）。 */
export const NS = "prompt-enhancer";

export const zh = {
  "button.title": "词库",
  "button.tip": "打开提示词库",
  "list.title": "常用提示词",
  "list.empty": "还没有提示词",
  "list.loading": "加载中…",
  "action.insert": "插入",
  "action.overwrite": "覆盖",
  "action.send": "插入并发送",
  "hash.title": "选择提示词",
  "hash.empty": "没有匹配的提示词",
  "vars.title": "填充模板变量",
  "vars.hint": "{{变量}} 会在插入时替换为下面的内容",
  "vars.fill": "填入",
  "vars.cancel": "取消",
  "vars.remembered": "已带出上次填写的值",
  "error.load": "加载提示词失败",
  "error.use": "记录使用失败",
  "error.noPrompt": "该提示词已不存在",
} as const;

/** en 必须与 zh 键集完全一致——类型注解让 tsc 直接报出漏译/漏删。 */
export const en: Record<keyof typeof zh, string> = {
  "button.title": "Library",
  "button.tip": "Open the prompt library",
  "list.title": "Saved prompts",
  "list.empty": "No prompts yet",
  "list.loading": "Loading…",
  "action.insert": "Insert",
  "action.overwrite": "Overwrite",
  "action.send": "Insert & send",
  "hash.title": "Pick a prompt",
  "hash.empty": "No matching prompt",
  "vars.title": "Fill template variables",
  "vars.hint": "Each {{name}} below is substituted when inserted",
  "vars.fill": "Fill in",
  "vars.cancel": "Cancel",
  "vars.remembered": "Filled with values from last time",
  "error.load": "Failed to load prompts",
  "error.use": "Failed to record usage",
  "error.noPrompt": "That prompt no longer exists",
};

/** 供宿主 LocaleNamespaceMap 挂载的键联合（P4 只用到上表里的键）。 */
export type PromptEnhancerKey = keyof typeof zh;
```

- [ ] **步骤 2：写 `src/client/utils/theme.ts`（最小版，仅 P4 用到的不变量）**

```ts
import type { CSSProperties } from "react";

/** 宿主主题 token 的读取口径：一律用 --dsw-alias-* 变量，不写死颜色（规格 §7.5）。 */
export const TOKEN = {
  bg: "var(--dsw-alias-bg-elevated, #ffffff)",
  fg: "var(--dsw-alias-text-primary, #1f2328)",
  muted: "var(--dsw-alias-text-secondary, #6b7280)",
  border: "var(--dsw-alias-border-secondary, #e5e7eb)",
  accent: "var(--dsw-alias-text-accent, #2563eb)",
  hover: "var(--dsw-alias-bg-hover, rgba(0,0,0,0.04))",
} as const;

/** 浮层容器样式：官方座位默认 click-through，必须自行开启 pointer-events。 */
export const overlayBase: CSSProperties = {
  pointerEvents: "auto",
  background: TOKEN.bg,
  color: TOKEN.fg,
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 10,
  boxShadow: "0 8px 24px rgba(0,0,0,0.16)",
};
```

- [ ] **步骤 3：写两个组件骨架**（本轮只保证「能渲染、能编译、能被编译进产物」；任务 5/6 替换内部实现）

`src/client/components/PromptLibraryButton.tsx`：

```tsx
import * as React from "react";
import type { PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";

/** 输入框旁「词库」按钮（任务 5 落地完整行为）。 */
export type PromptLibraryButtonProps =
  PropsRuntime<"conversation.input.left"> & PropsLocale<"prompt-enhancer">;

export function PromptLibraryButton({ t }: PromptLibraryButtonProps): React.ReactElement | null {
  return React.createElement("button", { type: "button", title: t("button.tip") }, t("button.title"));
}
```

`src/client/components/HashSuggestOverlay.tsx`：

```tsx
import * as React from "react";
import type { PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";

/** `#` 候选浮层（任务 6 落地完整行为）。 */
export type HashSuggestOverlayProps =
  PropsRuntime<"conversation.input.overlay"> & PropsLocale<"prompt-enhancer">;

export function HashSuggestOverlay(_props: HashSuggestOverlayProps): React.ReactElement | null {
  return null;
}
```

- [ ] **步骤 4：改写 `src/client/index.ts`**（照 `ui-commands/src/client/index.ts:59-73` 的官方模板；`ctx.slots` / `ctx.locale` 由两个 type-only import 拉入的模块增强提供，**不要**自定义 ctx 接口）

```ts
import type { Context as ClientContext } from "@deepseek-ai/cordis";
// type-only：拉入 slots / locale 的 Context 增强与 SlotMap 声明（无运行时依赖）
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
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
```

- [ ] **步骤 5：`package.json` 的 `dsh.client.inject` 增一项**（仅类型需要，运行时不需要——但显式声明便于宿主校验）

```json
"@deepseek-ai/dsh-client-ui-conversation/client"
```

- [ ] **步骤 6：改写 `scripts/smoke.mjs`，增加三条断言**

```js
// 客户端产物必须真的注册了本轮的两个座位（防止「构建成功但插槽没进去」）
for (const slot of ["conversation.input.left", "conversation.input.overlay"]) {
  if (!clientSrc.includes(slot)) fail("lib/client.js 未注册插槽 " + slot);
  else ok("lib/client.js 注册插槽 " + slot);
}
if (!clientSrc.includes('"prompt-enhancer"')) fail("lib/client.js 未注册 i18n 命名空间 prompt-enhancer");
else ok("lib/client.js 注册 i18n 命名空间 prompt-enhancer");
```

- [ ] **步骤 7：运行四项检查**

运行：`npm run typecheck && npm test && npm run build && npm run smoke`
预期：typecheck 退出码 0；`tests/` 现有 56 个用例仍全绿；`smoke: PASSED` 且新增 3 条 ok

- [ ] **步骤 8：提交**

```bash
git add src/client scripts/smoke.mjs package.json
git commit -m "feat(client): register composer button and hash overlay slots with i18n namespace"
```

---

## 任务 2：纯逻辑 TDD——模板变量

**文件：**
- 新建：`tests/template.test.mjs`（先写）、`src/client/utils/template.ts`
- 修改：无

**接口：**
- 依赖输入：无
- 对外产出：
  - `parseVariables(body: string): string[]`（去重、保序、去空）
  - `fillTemplate(body: string, values: Record<string, string>): string`（未提供值的变量**原样保留**）
  - `needsValues(body: string): boolean`
  - `memoryKey = "pl:template-var-memory"`
  - `pickRemembered(body: string, memory: Record<string, string>): Record<string, string>`

- [ ] **步骤 0：前置修复 `scripts/link-dsh-deps.mjs`（任务 1 暴露的环境缺陷，独立提交）**

任务 1 实测：profile 共享目录的 251 个 `@deepseek-ai/*` 链接里 **8 个悬空**（pnpm 迁移遗留），链接器把它们原样搬到本项目 `node_modules`，于是任何 import 到这些包的代码类型解析失败——任务 1 不得不手工把 `dsh-client-ui-slots` 的链接改指到 DSH checkout 的真实源码路径。手工改法落在 `.gitignore` 覆盖的 `node_modules` 内，**不可复现**，且重跑链接器即丢失。

修复要求：在原有「逐个 symlink」之后增加**自愈**——每个链接 `existsSync` 检查，悬空者按**包名**在 DSH checkout 的 `packages/**/package.json` 中查找同名包，找到则改指该目录并打印 `healed <name> → <path>`；找不到打印 `unresolved <name>`（可见，不静默）。checkout 根目录取 `process.env.DSH_CHECKOUT`，缺失时回退 `$DSH_HOME/dsh-harness` 的 realpath（该符号链接确实存在）。

验收：`node scripts/link-dsh-deps.mjs` 后 `npm run typecheck` 仍为 0；输出中**`src/` 实际 import 的包**不得出现 `unresolved`。注意口径（任务 2 评审确认）：`dsh.client.inject` 里的**运行时**模块不由类型链接器负责——例如 `@deepseek-ai/dsh-client-runtime` 在当前 checkout 中已不存在，其 `unresolved` 属**预期**，由任务 7 的「宿主加载无 unresolved require 报错」验收项覆盖。提交 message：`fix(scripts): heal dangling @deepseek-ai type links in the linker`。

- [ ] **步骤 1：写失败的测试**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
const t = await import("../src/client/utils/template.ts");

test("parseVariables：去重保序、忽略空白名", () => {
  assert.deepEqual(t.parseVariables("把 {{文本}} 翻成 {{ 目标语言 }}，再用 {{文本}} 复述"), ["文本", "目标语言"]);
  assert.deepEqual(t.parseVariables("{{   }} {{a}}"), ["a"]);
  assert.deepEqual(t.parseVariables("没有变量"), []);
});

test("fillTemplate：替换已提供的变量，未提供的原样保留", () => {
  assert.equal(t.fillTemplate("把 {{a}} 翻成 {{b}}", { a: "你好" }), "把 你好 翻成 {{b}}");
  assert.equal(t.fillTemplate("{{a}}", { a: "" }), "{{a}}", "空值不算已填写，必须保留占位");
  assert.equal(t.fillTemplate("无变量", {}), "无变量");
});

test("needsValues 与 pickRemembered", () => {
  assert.equal(t.needsValues("{{a}}"), true);
  assert.equal(t.needsValues("没有"), false);
  assert.deepEqual(t.pickRemembered("把 {{a}} 翻成 {{b}}", { a: "上次A", c: "无关" }), { a: "上次A" });
});
```

- [ ] **步骤 2：运行并确认失败**

运行：`node --test tests/template.test.mjs`
预期：FAIL（`Cannot find module '../src/client/utils/template.ts'`）

- [ ] **步骤 3：写最小实现**

```ts
/** 语义与 host 侧 `text.ts#extractVariables` 一致：trim 去空、保序；此处额外去重。 */
export function parseVariables(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
    const name = m[1]!.trim();
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

export function fillTemplate(body: string, values: Record<string, string>): string {
  return body.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (whole, raw: string) => {
    const name = raw.trim();
    const value = values[name];
    return value !== undefined && value !== "" ? value : whole;
  });
}

export function needsValues(body: string): boolean {
  return parseVariables(body).length > 0;
}

/** 模板变量记忆的 meta 键（与上游客户端一致）。 */
export const memoryKey = "pl:template-var-memory";

export function pickRemembered(body: string, memory: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of parseVariables(body)) {
    const value = memory[name];
    if (typeof value === "string" && value !== "") out[name] = value;
  }
  return out;
}
```

- [ ] **步骤 4：运行并确认通过**：`node --test tests/template.test.mjs` → PASS
- [ ] **步骤 5：提交**：`feat(client): add template variable parsing and filling`

---

## 任务 3：纯逻辑 TDD——`#` 尾令牌与候选过滤

**文件：** 新建 `tests/hash-token.test.mjs`（先写）、`src/client/utils/hash-token.ts`

**接口：**
- 依赖输入：`Prompt` 类型（`src/types.ts`）
- 对外产出：
  - `readHashToken(draft: string): { query: string; start: number } | null`
  - `replaceHashToken(draft: string, body: string): string`
  - `filterPrompts(prompts: Prompt[], query: string, limit?: number): Prompt[]`

- [ ] **步骤 1：写失败的测试**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
const h = await import("../src/client/utils/hash-token.ts");

test("readHashToken：只认草稿末尾的 #令牌（无 caret 可用，这是 D2 的约定）", () => {
  assert.deepEqual(h.readHashToken("帮我 #周报"), { query: "周报", start: 3 });
  assert.deepEqual(h.readHashToken("#"), { query: "", start: 0 });
  assert.deepEqual(h.readHashToken("前文 #a b"), null, "令牌后有空格即视为已结束");
  assert.equal(h.readHashToken("没有井号"), null);
  assert.equal(h.readHashToken("邮件 a#b"), null, "井号紧贴字母不算触发（避免撞 #tag 之类）");
  assert.deepEqual(h.readHashToken("换行\n#翻"), { query: "翻", start: 3 });
});

test("replaceHashToken：用正文替换尾令牌，保留令牌之前的文本", () => {
  assert.equal(h.replaceHashToken("帮我 #周报", "生成周报"), "帮我 生成周报");
  assert.equal(h.replaceHashToken("#周", "生成周报"), "生成周报");
});

test("filterPrompts：标题/标签/正文子串匹配，标题命中优先，limit 生效", () => {
  const p = (id, title, body, tags) => ({ id, title, body, tags });
  const list = [p("1", "周报生成", "写周报", []), p("2", "翻译", "写周报的英文版", ["周报"]), p("3", "无关", "无关", [])];
  assert.deepEqual(h.filterPrompts(list, "周报").map(x => x.id), ["1", "2"], "标题命中排前，正文命中在后");
  assert.deepEqual(h.filterPrompts(list, "周报", 1).map(x => x.id), ["1"]);
  assert.equal(h.filterPrompts(list, "").length, 3, "空查询返回全部（截到 limit）");
  assert.deepEqual(h.filterPrompts(list, "不存在的词"), []);
});
```

- [ ] **步骤 2：运行并确认失败**：`node --test tests/hash-token.test.mjs` → FAIL
- [ ] **步骤 3：写最小实现**

```ts
import type { Prompt } from "../../types.ts";

/**
 * 读草稿末尾的 `#查询词` 令牌。
 *
 * ⚠️ D2 约定：`InputState` 不暴露 caret，因此只识别**末尾**令牌；
 * `#` 必须位于行首或前面是空白，且令牌内不得含空白。
 */
export function readHashToken(draft: string): { query: string; start: number } | null {
  const m = draft.match(/(^|\s)#([^\s#]*)$/);
  if (!m) return null;
  const start = m.index! + m[1]!.length;
  return { query: m[2] ?? "", start };
}

/** 用正文替换尾令牌（保留令牌之前的文本，令牌与正文之间保留一个空格）。 */
export function replaceHashToken(draft: string, body: string): string {
  const token = readHashToken(draft);
  if (!token) return draft;
  const head = draft.slice(0, token.start).replace(/\s+$/, "");
  return head ? `${head} ${body}` : body;
}

/** 候选过滤：标题命中优先，其次标签，最后正文；同分保持原顺序。 */
export function filterPrompts(prompts: Prompt[], query: string, limit = 5): Prompt[] {
  const q = query.trim().toLowerCase();
  if (!q) return prompts.slice(0, limit);
  const scored: Array<{ p: Prompt; score: number }> = [];
  for (const p of prompts) {
    const title = p.title.toLowerCase();
    const tags = p.tags.join(" ").toLowerCase();
    const body = p.body.toLowerCase();
    const score = title.includes(q) ? 3 : tags.includes(q) ? 2 : body.includes(q) ? 1 : 0;
    if (score > 0) scored.push({ p, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.p);
}
```

- [ ] **步骤 4：运行并确认通过**：`node --test tests/hash-token.test.mjs` → PASS
- [ ] **步骤 5：提交**：`feat(client): add hash token detection and candidate filtering`

---

## 任务 4：纯逻辑 TDD——插入语义 + API 客户端

**文件：** 新建 `tests/insert.test.mjs`（先写）、`src/client/utils/insert.ts`、`src/client/utils/api.ts`

**接口：**
- 对外产出：
  - `type InsertMode = "insert" | "overwrite" | "insert-send"`
  - `composeDraft(draft: string, body: string, mode: InsertMode): { draft: string; send: boolean }`
  - `api.listPrompts(opts?): Promise<Prompt[]>`、`api.getSettings(): Promise<PluginSettings>`、`api.recordUsage(id): Promise<Prompt | undefined>`、`api.getMeta(key): Promise<string>`、`api.setMeta(key, value): Promise<void>`

- [ ] **步骤 1：写失败的测试**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
const ins = await import("../src/client/utils/insert.ts");

test("composeDraft：追加 / 覆盖 / 插入并发送（规格 §7.2）", () => {
  assert.deepEqual(ins.composeDraft("已有内容", "新提示词", "insert"), { draft: "已有内容\n新提示词", send: false });
  assert.deepEqual(ins.composeDraft("", "新提示词", "insert"), { draft: "新提示词", send: false });
  assert.deepEqual(ins.composeDraft("已有内容", "新提示词", "overwrite"), { draft: "新提示词", send: false });
  assert.deepEqual(ins.composeDraft("已有内容", "新提示词", "insert-send"), { draft: "已有内容\n新提示词", send: true });
  assert.deepEqual(ins.composeDraft("", "新提示词", "insert-send"), { draft: "新提示词", send: true });
});
```

- [ ] **步骤 2：运行并确认失败**：`node --test tests/insert.test.mjs` → FAIL
- [ ] **步骤 3：写实现 `src/client/utils/insert.ts`**

```ts
import type { Prompt } from "../../types.ts";

export type InsertMode = "insert" | "overwrite" | "insert-send";

/** 三种插入语义（纯函数）：追加用换行分隔；覆盖直接替换；插入并发送额外要求提交。 */
export function composeDraft(draft: string, body: string, mode: InsertMode): { draft: string; send: boolean } {
  const send = mode === "insert-send";
  if (mode === "overwrite") return { draft: body, send };
  return { draft: draft ? `${draft}\n${body}` : body, send };
}

/** 列表行显示用的摘要（优先 AI 摘要，否则截断正文首行）。 */
export function promptSummary(p: Prompt, max = 60): string {
  const source = p.summary?.trim() || p.body.replace(/\s+/g, " ").trim();
  return source.length > max ? `${source.slice(0, max)}…` : source;
}
```

- [ ] **步骤 4：运行并确认通过**：`node --test tests/insert.test.mjs` → PASS
- [ ] **步骤 5：写 `src/client/utils/api.ts`**

```ts
import type { PluginSettings, Prompt, PromptSort } from "../../types.ts";

const PREFIX = "/api/prompt-enhancer";

/** 响应信封（规格 §5）：客户端以 data === undefined 判失败。 */
interface Envelope<T> { ok: boolean; data?: T; error?: string }

/** 失败一律抛出带可读原因的 Error——调用方 catch 后出 toast（不得静默吞掉）。 */
async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(PREFIX + path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let parsed: Envelope<T>;
  try {
    parsed = (await res.json()) as Envelope<T>;
  } catch (e) {
    throw new Error(`响应不是合法 JSON（HTTP ${res.status}）：${String(e)}`);
  }
  if (parsed.data === undefined) {
    throw new Error(parsed.error ?? `请求失败（HTTP ${res.status}）`);
  }
  return parsed.data;
}

export const api = {
  listPrompts: (opts: { q?: string; tag?: string; sort?: PromptSort } = {}) => {
    const qs = new URLSearchParams();
    if (opts.q) qs.set("q", opts.q);
    if (opts.tag) qs.set("tag", opts.tag);
    if (opts.sort) qs.set("sort", opts.sort);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return call<Prompt[]>("GET", `/prompts${suffix}`);
  },
  recordUsage: (id: string) => call<Prompt>("POST", `/prompts/${encodeURIComponent(id)}/use`),
  getSettings: () => call<PluginSettings>("GET", "/settings"),
  getMeta: (key: string) => call<{ key: string; value: string }>("GET", `/meta/${encodeURIComponent(key)}`).then((r) => r.value),
  setMeta: (key: string, value: string) =>
    call<{ key: string; value: string }>("PUT", `/meta/${encodeURIComponent(key)}`, { value }),
};
```

- [ ] **步骤 6：类型检查 + 提交**

运行：`npm run typecheck`
预期：退出码 0

```bash
git add src/client/utils tests/insert.test.mjs
git commit -m "feat(client): add insert semantics and HTTP api client"
```

---

## 任务 5：快速列表组件（按钮 + 三动作 + 用量上报）

**文件：** 修改 `src/client/components/PromptLibraryButton.tsx`（骨架见任务 1 步骤 3）、**新建** `src/client/components/TemplateVariablesDialog.tsx`

**接口：**
- 依赖输入：任务 1 的 i18n / 主题、任务 4 的 `composeDraft` / `promptSummary` / `api`、任务 2 的 `parseVariables` / `fillTemplate` / `pickRemembered` / `memoryKey`
- 对外产出：
  - 组件 `PromptLibraryButton`，props 为 `PropsRuntime<"conversation.input.left"> & PropsLocale<"prompt-enhancer">`（session 标准 props 已内含，**不再手写** `SessionStandardProps`）
  - 组件 `TemplateVariablesDialog`，props 为 `{ body: string; onCancel: () => void; onFilled: (filledBody: string) => void; t?: (key: PromptEnhancerKey) => string }`——`t` 为**可选**：`ui-slots` 只在插槽边界注入 `t`，而本弹窗由组件内部渲染、不在插槽边界，故缺省时按宿主 `<html lang>` 在 zh/en 间兜底（任务 5 实测结论）（**本任务创建，任务 6 的 `#` 浮层复用**——它是第一个消费者，先建在这里才能保证任务 5 结束时构建是绿的）

- [ ] **步骤 1：写组件**。要求逐条落到代码：

| 要求 | 实现要点 |
| --- | --- |
| 按钮显隐由设置控制 | `settings.showComposerButton` 为 false 时返回 `null`（设置从 `api.getSettings()` 读一次，`useEffect` 里加载）；读取失败时**仍渲染按钮**（默认可见优于静默消失） |
| 打开列表时拉取 | `useEffect` 里 `api.listPrompts({ sort: "default" })`；失败 → `notify("error", t("error.load"))`（用 `inputActions` 不带 notify，改用组件内 `useState` 的错误行显示——**宿主标准 props 无 notify**） |
| 三动作 | 每行三个按钮；点击先 `composeDraft(draft, body, mode)` → `inputActions.setDraft(next.draft)`；`send` 为真时再 `inputActions.submit()` |
| 变量提示 | 若 `needsValues(body)`：先开变量弹窗（任务 6），拿到填充后的 body 再走上面流程 |
| 用量上报 | 每次成功插入/覆盖/发送后 `void api.recordUsage(p.id).catch(e => console.warn("[prompt-enhancer] " + t("error.use"), e))`（不阻塞 UI，但错误必须可见） |
| 提示词已删除 | `recordUsage` 抛错且消息含「不存在」→ 从列表移除该项并提示 `t("error.noPrompt")` |
| 列表行内容 | 标题 + `promptSummary(p)`（任务 4 的纯函数，优先 AI 摘要、否则截断正文；有摘要时同时显示标签） |
| 样式 | 一律用 `TOKEN`/内联样式；列表容器 `maxHeight: 320, overflowY: "auto"` |
| 无障碍 | 按钮 `title={t("button.tip")}`、列表项 `aria-label` |

- [ ] **步骤 2：写 `TemplateVariablesDialog.tsx`**（本任务创建，任务 6 复用）

| 要求 | 实现要点 |
| --- | --- |
| 每个变量一个输入框 | `parseVariables(body).map(name => <input value={values[name] ?? ""} onChange=... />)` |
| 记忆上次值 | 打开时 `api.getMeta(memoryKey)` → `JSON.parse`（容错：解析失败按空对象并 `console.warn`）→ `pickRemembered(body, memory)` 预填，并显示 `t("vars.remembered")` |
| 保存记忆 | 确认时把本次非空值合并进 memory → `api.setMeta(memoryKey, JSON.stringify(merged))`（失败不阻塞插入，但 `console.warn` 可见） |
| 取消 | 关窗且不改草稿 |
| 不修改变量占位语义 | 未填写的变量由 `fillTemplate` 原样保留（不得填空串） |
| 对外接口（任务 6 依赖） | `{ body: string; onCancel: () => void; onFilled: (filledBody: string) => void }`；由调用方挂载与卸载，组件自身不管开合 |

- [ ] **步骤 3：类型检查**：`npm run typecheck` → 退出码 0
- [ ] **步骤 4：构建 + 产物断言**：`npm run build && npm run smoke` → PASSED（插槽名在产物里）
- [ ] **步骤 5：提交**：`feat(client): composer library button, variable dialog and three insert modes`

---

## 任务 6：`#` 候选浮层（复用任务 5 的变量弹窗）

**文件：** 修改 `src/client/components/HashSuggestOverlay.tsx`（骨架见任务 1 步骤 3；变量弹窗复用任务 5 创建的 `TemplateVariablesDialog`）

**接口：**
- 依赖输入：上表的 D1/D2 决策、任务 3 的 `readHashToken` / `replaceHashToken` / `filterPrompts`、任务 4 的 `api`、任务 5 的 `TemplateVariablesDialog`
- 对外产出：`HashSuggestOverlay` 完整实现（props 同骨架：`PropsRuntime<"conversation.input.overlay"> & PropsLocale<"prompt-enhancer">`）

- [ ] **步骤 1：复用验证**：`TemplateVariablesDialog` 已于任务 5 完成（它是第一个消费者）。本任务只做「复用 + 验证」：`#` 选中含变量的提示词时必须弹出该弹窗，填完后替换草稿。若发现接口不敷使用（例如需要 `onCancel` 之外的返回值），**回改任务 5 的实现并在报告里说明**，不要在本任务另建一个弹窗。

- [ ] **步骤 2：写 `HashSuggestOverlay.tsx`（按 D1/D2 落点与交互）**

| 要求 | 实现要点 |
| --- | --- |
| 位置 | 注册在 `conversation.input.overlay`（composer 卡内浮动层），`overlayBase` 样式 + `position: "absolute", bottom: 8, left: 8, zIndex: 30` |
| 触发 | `const draft = useInput(s => s.draft)`；`const token = readHashToken(draft)`；`token === null` → 返回 `null` |
| 候选 | `api.listPrompts()` 缓存一次（打开期间复用）+ `filterPrompts(list, token.query)` |
| 选择（D2 默认） | 鼠标点击行 → `inputActions.setDraft(replaceHashToken(draft, body))`；若 `needsValues(body)` 先开变量弹窗 |
| 用量上报（规格 §4.4 明确「`#` 选中」也算一次使用） | 选中后同样 `void api.recordUsage(p.id).catch(e => console.warn("[prompt-enhancer] " + t("error.use"), e))` |
| 键盘 | **不实现**（用户 2026-09-24 裁定 D2：点击选择，零 DOM 介入）。**不得**加 `document.addEventListener`；D2-b 未获批准 |
| 无命中 | `t("hash.empty")` 一行 |
| 关闭路径 | 令牌消失即关闭（用户删掉 `#` 或以空格结束令牌）。D2 下没有 Esc——**不要**为了「能按 Esc 关」去加全局键盘监听 |

- [ ] **步骤 3：类型检查 + 构建 + 提交**

运行：`npm run typecheck && npm run build && npm run smoke`
预期：全部通过

```bash
git add src/client/components
git commit -m "feat(client): template variable dialog and hash suggest overlay"
```

---

## 任务 7：活 GUI 验收（M4 验收）

> 沿用 P1/P3 已验证的通道：**用运行时注入热重载本插件**，不碰 profile、不重启 `dsh web`。

- [ ] **步骤 1：开发构建 + 热重载**：`npm run build:dev` → `dev_reload_package dsh-prompt-enhancer`，确认 before/after 均 `active` 且 `client ✓`
- [ ] **步骤 2：用 Playwright 打开 GUI 并逐项验收**（对 `http://127.0.0.1:3080`，只读+交互，不写用户数据）

| 验收项 | 判定方式 |
| --- | --- |
| 输入框旁出现词库按钮（规格 §9.3-2） | 快照里出现 `title="词库"`（或 en）的按钮 |
| 点开快速列表能看到提示词 | 列表含种子提示词「欢迎使用提示词增强」 |
| 插入 | 点「插入」→ 读输入框值，断言等于草稿 + `\n` + 正文 |
| 覆盖 | 点「覆盖」→ 断言输入框值等于正文 |
| 插入并发送 | 点「插入并发送」→ 断言输入框被清空且会话里出现该消息（**会真的发一条消息**，用一条无副作用的提示词，并在验收记录里注明） |
| `{{变量}}` | 用一条含变量的提示词 → 断言弹窗出现该变量名；填入后插入 → 断言占位被替换；关闭后重开 → 断言带出上次值 |
| `#` 浮层 | 在输入框输入「帮我 #周」→ 断言浮层出现且只剩匹配项；点击后断言草稿被替换为正文 |
| `#` + 含变量提示词（任务 6 步骤 1 的核心契约） | 选中后断言弹窗出现该变量名 → 填入后断言草稿被**整段替换**（保留令牌前文本） |
| `#` 选中的用量上报（规格 §4.4） | 选中前后各 `GET /prompts` 一次，断言该条 `usageCount` 增加、`lastUsedAt` 变大 |
| 点击候选后能继续打字 | 点完候选行立即键入，断言文本进入 composer（D2「点击选择」的焦点代价，任务 6 评审点 4） |
| 零 console error | `browser_console_messages` 里 Errors: 0（本插件相关为 0） |
| 变量记忆往返不丢 | 用含变量的提示词填一次 → 再开一次断言带出上次值；同时断言**其它提示词**的已记忆值未被覆盖（任务 5 评审发现的覆盖缺陷回归点） |
| 变量输入框内按 Enter | 只应触发本弹窗确认，**不得**同时把消息发出去（潜在双发；任务 5 评审指出的未评估通道） |
| 面板不被裁剪 | 快速列表/浮层在 composer 区域可见、未被祖先 `overflow` 裁掉 |
| 焦点归还 | 弹窗确认/取消后焦点回到输入框（否则用户需再点一次） |
| 重复提示可见 | 连续两次触发同一提示（如列表里已删除的项）时提示仍可见（notice 定时器/相同文案不重跑的回归点） |
| 设置关闭按钮 | `PUT /settings` 把 `showComposerButton` 置 false → **重挂载后**按钮消失（本组件在 mount 时读一次设置）；置 true → 恢复。**即时生效不属本里程碑**：P8 的设置页负责「改完立即生效」，并与 `hashTriggerEnabled` 的接线同批做（最终评审发现此条与实现约束矛盾，已就地修正计划） |
| 宿主加载无 unresolved require | 浏览器控制台/宿主日志里不得出现该插件的 unresolved require 报错（任务 1 的 ⚠️2 归属本项；若报错则按报错内容调整 `dsh.client.inject`） |

- [ ] **步骤 3：把验收结论写入本文件末尾**（命令、断言结果、失败项、以及「插入并发送」实际发出的消息内容）
- [ ] **步骤 4：提交**：`test(client): record M4 live GUI acceptance`

---

## 完成标准

- 输入框旁出现词库按钮；四种能力（插入 / 覆盖 / 插入并发送 / `{{变量}}` 填充）在真实 GUI 上逐项可验
- `#` 浮层能按 **D2（尾令牌 + 点击选择）** 工作；**不得**出现 document 级键盘监听（D2-b 未获批准）
- `npm run typecheck` / `test` / `build` / `smoke` 四项全绿；`tests/` 新增三个纯逻辑测试文件
- 产物断言包含两个插槽名与 i18n 命名空间
- **零 DOM 注入**：`src/client/**` 里不得出现 `document.querySelector`、`MutationObserver`、`appendChild`；**只读式**的 document 事件监听是允许的（例如「点浮层外关闭」用 `pointerdown`，与官方 `PopupSelectView` 同款——它只观察、不消费输入），但**禁止**任何键盘监听/捕获（D2 裁定）与 DOM 改写/注入（§7.3）；若确需键盘交互，必须先回到用户重议 D2-b
- 客户端 bundle 仍以 `dsh-prompt-enhancer` 为模块 id

## 风险

| # | 风险 | 应对 |
| --- | --- | --- |
| R-P4-1 | `InputState` 无 caret ⇒ `#` 只能按「尾令牌」工作，用户在句中输入 `#` 不触发 | D2 明确约定；README/验收记录里写明；若不可接受，改用按钮内搜索（规格允许的降级） |
| R-P4-2 | `↑↓/回车` 需要 document 级键盘捕获（D2-b），与「零 DOM hack」的精神有张力 | 默认不做（D2）；若用户要求，则严格限定「仅在浮层打开时消费这 4 个键」，并在计划里记为已知偏离 |
| R-P4-3 | 「插入并发送」会真的发消息，验收可能污染会话 | 验收只用一条无副作用提示词；记录实际发出内容；不写入词库 |
| R-P4-4 | 宿主标准 props 没有 `notify`，错误提示只能自渲染 | 组件内用一行错误文本 + `console.warn`；不伪造宿主通知 |
| R-P4-5 | `PropsLocale` 需要 `LocaleNamespaceMap` 的类型增强，漏了会编译失败 | 任务 1 步骤 3 已给可复制的 `declare module` 片段 |
| R-P4-6 | 快速列表在会话切换时可能拿到旧 session 的草稿 | `conversation.input.left` 是 session 作用域，随会话重建；组件不缓存 draft，全部经 `useInput` 读取 |

## 用户裁定（已定，执行时不得再问）

1. **D2 已选**：`#` 浮层采用「尾令牌 + 点击选择」，**不**接管键盘（不接受 D2-b）。因此规格 §9.3 验收 2 里的「↑↓ 选择、回车插入」**改为**「点击选择」；这一偏离已在执行记录中声明。
2. **规格追加已批**：把 `conversation.input.overlay` 纳入 §7.1 的座位表（规格 §13.7），计划按此执行。
3. ③ 降级路径未采纳（`#` 触发保留）。

---

## P4 执行记录（2026-09-24，子代理驱动）

**状态：** M4 达成。7 个任务全部完成、逐一经任务评审（含 2 轮修复），并通过最终全分支评审（判「修复后可合并」→ 一轮修复波 → 范围化复审全项 ADDRESSED）。

| 证据 | 结果 |
| --- | --- |
| 单元测试 | **64/64 通过**（新增 3 个纯逻辑测试文件：template / hash-token / insert），多轮变异验证 |
| 四项检查 | `typecheck` 0 / `test` 64 / `build` 0 / `smoke` PASSED（smoke 新增 i18n + 2 座位断言，并修掉一条假绿） |
| 活 GUI 验收 | `docs/superpowers/plans/2026-09-24-p4-m4-acceptance.md`：与验收表**逐行对齐 18 行** → PASS 17 / FAIL 1 / NOT RUN 1 |
| 产物一致性 | 评审者用同参数 esbuild 重建 `lib/client.js`，与提交**逐字节一致**；dev 日志位于 `if (false)` 内 |
| 零 DOM 注入 | `src/client/**` 无 `querySelector`/`MutationObserver`/`appendChild`/任何键盘监听；唯一 document 监听为只读 `pointerdown`（与官方 `PopupSelectView` 同款） |

**已知限制与遗留（交接给后续里程碑）**

1. **弹窗 Cancel 后焦点不归还**（验收第 15 行 FAIL）：`activeElement` 落回 `<body>`，随后键入不进 composer。宿主 `SessionStandardProps`/`InputActions` **无公开 focus 能力**（已核实 `input.d.ts:219-230`、`slots.d.ts:241-247`），用 DOM focus 绕过会违反规格 §7.3 ⇒ **需用户拍板**（接受「再点一次输入框」或另议方案）。候选点击路径实测不受影响（PASS）。
2. **设置即时生效**：`showComposerButton` 与 `hashTriggerEnabled` 均为「mount 时读一次」语义；P8 的设置页须同时接入二者并决定是否改成即时（本轮验收已按「重挂载后生效」口径通过）。
3. **`#` 令牌的边界**：仅识别草稿**末尾**令牌（宿主无 caret）；`#` 后紧跟标点会并入查询词；`"#a#b"` 不触发——均为待产品决策项。
4. **延期轻微项**（最终评审已分拣为「可作后续任务，建议 P5 顺手做」）：smoke 两条插槽断言可进一步收紧（当前正则对 alias/嵌套对象写法会假 RED）、`api.ts` 与 `promptSummary` 无单测、`PREFIX` 字面量双份、`parseMemory` 应下移以便单测、`replaceHashToken` 无令牌分支未测、notice 同文案不重置计时器等。
5. **客户端入口缺可执行测试**：`apply(fakeCtx)` 后断言 `slots.register` 次数与参数——评审建议的下一步（可把插槽接线从「文本扫描」升级为行为断言）。
