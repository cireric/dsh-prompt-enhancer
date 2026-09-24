# 02 · AI 能力子系统分析（AI 优化提示词）

> 分析对象：`@sunjuntao/dsh-prompt-library` v0.16.0（MIT），源码根目录 `_ref-dsh-prompt-library`
> 用途：把该项目裁剪为「只保留提示词相关功能」的 `dsh-prompt-enhancer` 时的施工图。
> 文中所有行号均指参考项目当前工作副本的行号，函数名/字段名逐字照抄。

---

## 0. 结论速览（先看这段再动手）

1. **AI 能力全部集中在 `src/host/ai.ts`（1129 行 / 11 个导出）**，前端只负责编排。裁剪时"搬一整个文件 + 改 1 个函数 + 删 6 行 import"即可。
2. **运行时真正被引用的导出只有 7 个**：`registerLlm`、`logAiInjected`（index.ts:20/227-231）、`listAiSelectables`、`polishPromptBody`、`polishPromptBodyWithSummary`、`generateSkillDescriptor`、`generateDraft`（routes.ts:20 导入）。其余导出见 §1 的"死代码"标记。
3. **LLM 网络出口只有一个**：`collectText()`（ai.ts:441-486）。所有能力都经 `collectTextWithFallback()`（ai.ts:493-515）→ 全局串行锁 `withLlmLock()`（ai.ts:242-247）。
4. **人格耦合只有一个函数**：`withSoulSystem()`（ai.ts:427-435），被 6 处调用（408 / 660 / 715 / 775 / 829 / 1019）。删掉它 + 第 19 行 import，AI 子系统对 persona / character.ts / personas 表 **零依赖**。
5. **前端「AI 优化」是纯 HTTP 路径**：`POST /api/prompt-library/ai/polish`。WS（`/api/prompt-library/events`）在本版本**不承载任何 AI 结果**：host 的 `emitFillDraft()`（events.ts:63-65）没有任何调用方，`fill-draft` 消息永远不会发出；客户端 `useFillDraft()` 是历史遗留兜底监听。
6. **「撤销 / 回到原始正文」在本版本不存在**。`sourceBody` 字段只写不读：客户端 2 处写（PromptLibraryButton.tsx:956、LexiconManagerModal.tsx:431），0 处读。前端"原稿/润色稿"对比用的是**点击润色时抓的前端 state 快照**，不是 `sourceBody`。裁剪版若要真正的撤销，需要新写。
7. **自学习（自动识别并保存复杂 prompt）已无实现**：`enrichLearnedPrompt()`（ai.ts:529）是唯一入口且**无调用方**；`aiRefined` 标记现在全部由前端在"保存润色结果"时手动置 `true`。

---

## 1. 文件与依赖地图

| 文件 | 行数 | 角色 | 裁剪处置 |
| --- | --- | --- | --- |
| `src/host/ai.ts` | 1129 | AI 能力本体（路由解析 / 调用 / 模板 / 解析 / 日志） | **保留**，按 §7 瘦身到 ~450 行 |
| `src/host/refine.ts` | 53 | 纯函数 JSON 解析（`parseRefineResult` + `AiRefineResult`），零依赖 | **保留**（若删 `enrichLearnedPrompt` 则仅被死代码使用，可一并删） |
| `src/host/character.ts` | 128 | 人格 SOUL 读写 + `buildSoulBoundary` | **删除**（AI 只用其中 2 个函数，见 §7） |
| `src/host/paths.ts` | 75 | 路径中心；AI 只用 `logDir()`（L61-63） | 保留 `logDir()`（或内联） |
| `src/host/routes.ts` | 1176 | HTTP 路由（AI 只占 5 条） | 只搬 5 条 + `settings` 2 条 |
| `src/host/events.ts` / `ws.ts` | 73 / 约 300 | WS 单向推送（data-changed 等） | AI 不依赖；若保留数据变更广播则保留 |
| `src/client/components/data/AIPolishButton.tsx` | 318 | composer 星星按钮 + 结果面板 | **保留**（裁剪版的核心 UI） |
| `src/client/components/data/PromptLibraryButton.tsx` | ~1600 | 词库面板 + "查看详情 → AI 优化"（L929-969、L1409-1583） | 视裁剪范围：AI 部分单独抽 `startViewPolish/saveViewPolish` 两函数 |
| `src/client/components/data/LexiconManagerModal.tsx` | ~1400 | 数据管理弹窗 + AI 优化（L388-447、L972-1080） | 同上 |
| `src/client/utils/api.ts` | 615 | fetch 封装；AI 用 `polishPrompt`(L337-346)、`generateDraft`(L352-364)、`getAiSelectables`(L374-376) | 保留 3 个 + `getSettings/updateSettings`(L394-401) |
| `src/client/utils/data-sync.ts` | 140 | window 事件 + WS 消息翻译 | 保留 `notifyDataChanged/useDataChanged`；`useFillDraft` 可删（死链路） |
| `src/client/utils/ws.ts` | 107 | 单例 WS 连接 + 重连 | AI 不直接依赖（仅经 data-sync） |
| `src/types.ts` | 213 | `Prompt` / `PluginSettings` | 保留 `Prompt.summary/sourceBody/aiRefined/aiRefinedAt` 与 4 个 AI 设置字段 |

### 1.1 ai.ts 的外部依赖（裁剪版必须满足）

| import | 来源 | 用途 | 可去掉？ |
| --- | --- | --- | --- |
| `BlockAssembler`, `createUserMessage` | `@deepseek-ai/dsh-llm` (ai.ts:12) | 流式聚合 / 构造 user 消息 | 必须保留 |
| `GenerateOptions, LlmRuntime, LlmModelInfo` (type) | `@deepseek-ai/dsh-llm` (ai.ts:13) | 类型 | 必须保留 |
| `PluginSettings, Prompt` | `../types.js` (ai.ts:14) | 设置 + 词库条目 | 必须保留 |
| `listTags, readGlobalLocale, updatePrompt` | `./store.js` (ai.ts:15) | 标签库提示 / 日志语言 / 写回 | `readGlobalLocale` 可去（日志语言固定 zh）；`listTags+updatePrompt` 仅死代码用 |
| `parseRefineResult, AiRefineResult` | `./refine.js` (ai.ts:16) | 仅 `enrichLearnedPromptInner` 使用 | 随死代码删 |
| `appendFileSync, mkdirSync` | `node:fs` (ai.ts:17) | 诊断日志 | 保留（或改为空实现） |
| `dirname, join` | `node:path` (ai.ts:18) | 日志路径 | 保留 |
| `buildSoulBoundary, readSoulDoc` | `./character.js` (ai.ts:19) | 人格注入 | **删除**（§7.2） |
| `logDir` | `./paths.js` (ai.ts:20) | 日志目录 | 保留 |

> 依赖声明：`@deepseek-ai/dsh-llm` 是 `package.json` 的 **optional peerDependency**（L70-89，`"@deepseek-ai/dsh-llm": { "optional": true }`），版本 `^0.1.0-rc.6`。裁剪版的 package.json 必须照抄这一条，否则 `ctx.inject(["llm"])` 在无模型宿主上会报错。

---

## 2. `src/host/ai.ts` 完整能力清单

### 2.1 导出符号总表

| # | 导出 | 行号 | 签名（入参 → 出参） | 用途 | 调用方 | 处置 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `registerLlm` | 250-254 | `(runtime: LlmRuntime | undefined) => void` | 注入/注销 harness LLM 服务，并清路由缓存 | index.ts:227/230 | **保留** |
| 2 | `logAiInjected` | 257-259 | `(injected: boolean) => void` | 写一行"llm 服务已注入/已注销"日志 | index.ts:228/231 | 保留（或删，仅日志） |
| 3 | `isAiAvailable` | 262-264 | `() => boolean` | 是否有 LLM | **无调用方** | 删 |
| 4 | `listAiSelectables` | 282-299 | `() => Promise<AiSelectable[]>` | 列出 provider+模型供设置下拉 | routes.ts:776 | **保留** |
| 5 | `enrichLearnedPrompt` | 529-546 | `(prompt: Prompt, settings: PluginSettings) => Promise<void>` | 后台完善一条"自动学习"的提示词：生成标题/标签/摘要并改写正文，写回词库 | **无调用方（死代码）** | **删**（或按 §6 复活为"一键 AI 完善"） |
| 6 | `enrichPromptProfessional` | 635-666 | `(body: string, settings: PluginSettings) => Promise<string | undefined>` | 「AI 完善」（扩写）：补方法/步骤/约束/自查 | **无调用方（死代码，无路由）** | **删** 或补一条路由复用（推荐保留为能力） |
| 7 | `polishPromptBody` | 673-721 | `(body: string, settings: PluginSettings, opts?: { keepVariables?: boolean }) => Promise<string | undefined>` | 润色正文（等长/更精炼），可选保护 `{{}}` | routes.ts:800 | **保留（核心）** |
| 8 | `polishPromptBodyWithSummary` | 754-782 | `(body, settings, opts?) => Promise<PolishWithSummary | undefined>`，`PolishWithSummary = { polished: string; summary?: string }` | 润色 + 额外一次调用生成用途摘要 | routes.ts:794 | **保留（词库内优化主入口）** |
| 9 | `generateIntro` | 788-840 | `(lang: "zh"|"en", settings) => Promise<string[] | undefined>`（最多 5 句） | 词库功能简介（悬停气泡） | 仅 routes.ts:812；**前端无调用方** | **删** |
| 10 | `generateDailyReport` | 887-939 | `(statsText: string, settings, lang: "zh"|"en" = "zh") => Promise<DailyReportItem[] | undefined>` | 「今日词库日报」3~5 条 | **无调用方、无路由** | **删** |
| 11 | `todayLocalDate` | 875-881 | `() => string` (YYYY-MM-DD) | 日报缓存键 | **无调用方** | **删** |
| 12 | `generateSkillDescriptor` | 985-1038 | `(prompt: { title; body; summary?; tags? }, settings) => Promise<SkillDescribeResult>`，`SkillDescribeResult = { desc?: SkillDescriptor; fail?: "no-llm"|"route"|"empty"|"parse" }` | 导出 Skill 时生成英文 kebab-case 技能名 + 描述 + whenToUse | routes.ts:698 | 若裁剪掉「导出为 DSH 技能」则删 |
| 13 | `generateDraft` | 1055-1129 | `(kind: "soul"|"skill", title: string, input: string, settings, lang: "zh"|"en" = "zh") => Promise<DraftGenerateResult>`，`= { content?: string; fail?: "no-llm"|"route"|"empty" }` | AI 生成 SOUL.md / SKILL.md 草稿 | routes.ts:836；前端 PersonaManagerModal.tsx:347、PromptInjectPanel.tsx:416 | **删**（与 persona/skill 强耦合） |

### 2.2 导出接口 / 类型

| 类型 | 行号 | 字段 |
| --- | --- | --- |
| `AiSelectableModel` | 267-270 | `id: string; name: string` |
| `AiSelectable` | 272-276 | `provider: string; name: string; models: AiSelectableModel[]` |
| `PolishWithSummary` | 727-730 | `polished: string; summary?: string`（`summary` 缺失 = 摘要生成失败，不影响正文） |
| `DailyReportItem` | 843-848 | `headline: string; body: string` |
| `TechNewsItem` | 851-858 | `title: string; summary: string; url: string` |
| `SkillDescriptor` | 942-946 | `name: string; description: string; whenToUse?: string` |
| `SkillDescribeFail` | 949 | `"no-llm" | "route" | "empty" | "parse"` |
| `SkillDescribeResult` | 952-955 | `desc?: SkillDescriptor; fail?: SkillDescribeFail` |
| `DraftGenerateFail` | 1041 | `"no-llm" | "route" | "empty"` |
| `DraftGenerateResult` | 1044-1047 | `content?: string; fail?: DraftGenerateFail` |
| `AiRefineResult`（refine.ts:10-15） | — | `title: string; tags: string[]; summary: string; body: string` |

### 2.3 内部（非导出）函数

| 函数 | 行号 | 说明 |
| --- | --- | --- |
| `pad2 / localDate / localTime` | 28-42 | 本地时区时间戳格式化 |
| `getDailyLogPath` | 48-50 | `<logDir>/ai-YYYY-MM-DD.log` |
| `logAI` | 53-63 | 追加一行日志；生产构建被 `__DEV__` 消除 |
| `buildAiLogCopy / aiLogCopy` | 115-220 | zh/en 双语日志文案表（41 个格式化器） |
| `clearRouteCache` | 233-235 | 清路由缓存 |
| `withLlmLock` | 242-247 | 全局串行锁 |
| `isModelAvailable` | 305-316 | `listModels` + 忽略大小写比对 id |
| `resolveCandidates` | 328-381 | 手动配置校验 + 自动发现 + 30s 缓存 |
| `systemPrompt` | 384-409 | 完善用 system（含标签库 + 变量约束），末尾 `withSoulSystem` |
| `userMessage` | 412-419 | 完善用 user（原始正文 + 候选标签 + 已有变量） |
| `withSoulSystem` | 427-435 | **唯一人格耦合点** |
| `collectText` | 441-486 | 单次流式调用与文本收集 |
| `collectTextWithFallback` | 493-515 | 按候选路由轮询 |
| `parseJson` | 518-520 | 转调 `parseRefineResult` |
| `enrichLearnedPromptInner` | 552-592 | 死代码主体 |
| `enrichInFlight` | 549 | `Set<string>`，同一 prompt 去重 |
| `AI_OPEN_RE` | 595-596 | 开场套话整行正则（中英） |
| `AI_CLOSE_RE` | 599-600 | 收尾套话整行正则（中英） |
| `stripAiFiller` | 609-623 | 剥代码围栏 + 首尾各最多 6 行套话 |
| `parseSummaryJson` | 733-746 | 容错解析 `{ summary }` |
| `parseJsonArray` | 861-872 | 容错解析 JSON 数组（仅日报用） |
| `parseSkillJson` | 958-976 | 容错解析技能描述符 |

## 3. LLM 调用细节

### 3.1 如何拿到 llm 服务

模块级单例，由 host 入口在 Cordis 服务注入时写入（**不是每次调用去 ctx 取**）：

```ts
// src/host/ai.ts:223
let llm: LlmRuntime | undefined;
// src/host/ai.ts:250-254
export function registerLlm(runtime: LlmRuntime | undefined): void {
  llm = runtime;
  clearRouteCache();          // llm 变化 → 旧 provider/模型列表不可信
}
```

```ts
// src/index.ts:224-233
ctx.inject(["llm"], (llmCtx: Context) => {
  registerLlm(llmCtx.llm);
  logAiInjected(true);
  return () => {                 // 插件卸载 / llm 服务消失
    registerLlm(undefined);
    logAiInjected(false);
  };
});
```

要点：
- 判断可用性只看 `llm !== undefined`（各能力函数开头 `if (!llm) return undefined`）。**LLM 不可用不是异常，是"静默降级为 undefined"**，由路由层翻译成 HTTP 503。
- 宿主 `@deepseek-ai/dsh-llm` 在参考项目里没有 .d.ts，靠 `src/host-vendor.d.ts`（L28-70）声明最小形状：`LlmModelInfo { id; name? }`、`LlmProviderInfo { id; name? }`、`LlmRuntime { listProviders(): LlmProviderInfo[]; listModels(provider): Promise<readonly LlmModelInfo[]> }`、`GenerateOptions { provider?; model?; messages }`、`class BlockAssembler { push(chunk); finish: {kind}; blocks(): Array<{type; text?}> }`、`createUserMessage({content, source})`。裁剪版必须一并搬运这个 declaration file（或等价 shim），否则 tsc 报 TS7016。

### 3.2 provider / model 解析与自动发现（`resolveCandidates`，ai.ts:328-381）

算法（按代码顺序，逐字对应）：

1. **缓存命中**（ai.ts:332-336）：key = `${settings.aiProvider}|${settings.aiModel}`，命中且 `Date.now() - ts < 30000`（`ROUTE_CACHE_TTL_MS`，ai.ts:229）→ 直接返回。
2. **手动配置优先**（341-350）：当 `settings.aiProvider && settings.aiModel` 都非空时，调 `isModelAvailable()`（305-316：`listModels(provider)` 内 `m.id.toLowerCase() === model.toLowerCase()`）。可用 → 作为第 1 个候选并记 `routeManualOk`；不可用 → 记 `routeManualBad` 并继续自动发现（**不会失败退出**）。
3. **自动发现**（352-375）：`runtime.listProviders()` 为空 → 记 `routeNoProviders`。对**每个** provider：
   - `listModels(provider.id)` 抛错 → 记 `routeListFail`，`continue`；
   - 列表为空 → 记 `routeNoModel`，`continue`；
   - 选中 `models.find((m) => /chat|deepseek/i.test(m.id)) ?? models[0]`（**优先 id 含 chat 或 deepseek**，否则取第一个）；
   - 用 `${provider.id}/${pick.id}` 去重（`seen` Set）后 push 进候选。
   - 注意：与注释"选第一个有可用模型的 provider"不同，**代码会把每个 provider 的最佳模型都塞进候选列表**，构成失败轮询链。
4. 候选为 0 → 记 `routeNone`，返回 `[]`。
5. 写入缓存 `routeCache = { key, ts: Date.now(), value: candidates }`。

缓存失效时机：`registerLlm()`（ai.ts:253）。**设置变更不会自动清缓存**——宿主 `PUT /settings`（routes.ts:866）与 ai.ts 之间没有联动（除 key 变化导致 miss），改设置后最多 30s 内仍用旧路由。

候选消费方式：`collectTextWithFallback()`（493-515）按序尝试，第一个返回文本的即采用；全失败记 `fbAllFail` 并返回 undefined。

### 3.3 单次调用的确切参数（`collectText`，ai.ts:441-486）

| 参数 | 值 | 位置 |
| --- | --- | --- |
| `provider` / `model` | 来自候选路由 | 448-449 |
| `messages` | `[createUserMessage({ content: [{ type: "text", text: content }], source: { kind: "plugin", plugin: "prompt-library" } })]` | 450-455 |
| `system` | 模板（+ 人格注入），走 `GenerateOptions.system`（**不是 system message**） | 456 |
| `maxTokens` | `AI_MAX_TOKENS = 2048`（ai.ts:25） | 457 |
| `temperature` | `0.4`（写死） | 458 |
| `signal` | `AbortSignal.timeout(AI_TIMEOUT_MS)`，`AI_TIMEOUT_MS = 30_000`（ai.ts:23） | 459 |

收集与判定（461-485）：
- `new BlockAssembler()`；`for await (const chunk of runtime.stream(options)) assembler.push(chunk)`。
- 抛异常（含超时 AbortError）→ `logAI(collectErr)` 并 `return undefined`。
- `assembler.finish.kind` **必须是 "stop" 或 "max-tokens"**，否则记 `collectAbort` 并返回 undefined。
- 文本 = 所有 `type === "text"` 块拼 `.text ?? ""` 后 trim；空 → 记 `collectEmpty` 并返回 undefined。

### 3.4 超时 / 重试 / 错误处理矩阵

| 能力 | LLM 调用次数 | 单次超时 | 重试 | 失败返回 | 路由层 HTTP |
| --- | --- | --- | --- | --- | --- |
| `polishPromptBody` | 1（可多候选路由） | 30s/次 | 无 | `undefined` | 503（routes.ts:802） |
| `polishPromptBodyWithSummary` | **2**（先润色、再摘要） | 各 30s | 无 | 润色失败 → `undefined`；摘要失败 → `{ polished }` | 润色失败 503（796）；摘要失败仍 200 |
| `enrichLearnedPrompt` | 1 | 30s | 无 | `void`（静默） | 无路由 |
| `enrichPromptProfessional` | 1 | 30s | 无 | `undefined` | 无路由 |
| `generateIntro` | 1 | 30s | 无 | `undefined` | 503（814） |
| `generateSkillDescriptor` | 最多 **3**（1020-1037） | 30s/次 | 空文本或解析失败即重试，前 2 次记 `skillRetry` | `{ fail: "empty" } / { fail: "parse" }` | 200 + fail 码（**不是 503**） |
| `generateDraft` | 最多 **3**（1112-1128） | 30s/次 | 同上 | `{ fail: "empty" }` | 503（844） |

其它错误约定：
- **并发控制**：`withLlmLock`（242-247）是一条模块级 Promise 链（`let llmQueue = Promise.resolve()`），保证同一时刻只有 1 个网络调用。锁在 `collectTextWithFallback` 内包裹 `collectText`（506）。**队列无上限、无排队超时**：多人连续点润色会串行等待，最坏 `N × 30s`。
- **去重**：`enrichInFlight: Set<string>`（549）保证同一 prompt 只跑一个完善任务（536-545）。
- **不抛出**：ai.ts 的所有导出都不向调用方抛异常（内部 try/catch 全兜），因此 routes 层只需判 `undefined`，不必 try/catch AI 调用。
- **客户端**：`send()`（api.ts:29-52）在 `!payload.ok || payload.data === undefined` 时 `throw new Error(payload.error || ...)`，所以 503 的中文文案会经 `err.message` 透传到 UI。

### 3.5 日志文件位置与格式

| 项 | 值 | 位置 |
| --- | --- | --- |
| 目录 | ~/.dsh/prompt-library/log/（`logDir()`，paths.ts:61-63；`DSH_HOME` 可覆盖根目录） | ai.ts:48-50 |
| 文件 | `ai-YYYY-MM-DD.log`（**系统本地时区**，每天一个文件） | `getDailyLogPath()` |
| 行格式 | `[YYYY-MM-DD HH:mm:ss] <msg>` + 换行，`appendFileSync` 追加 | ai.ts:59 |
| 开关 | `if (!__DEV__) return;` —— **生产构建完全不写日志**（esbuild define 消除分支）；`__DEV__` 声明见 ambient.d.ts:26 | ai.ts:55 |
| 容错 | 建目录/写文件失败全部吞掉，绝不影响主流程 | ai.ts:60-62 |
| 语言 | 模块加载时 `readGlobalLocale()` 异步预取，默认 `"zh"` | ai.ts:209-220 |

日志文案表 `AiLogCopy`（70-112）共 **41** 个格式化器，前缀标签固定不译，便于 grep：`route`、`collect`、`fallback`、`enrich`、`parse`、`polish`、`intro`、`skill`、`draft`。关键几条（zh 文案，ai.ts:162-205，原文摘录）：

```text
route: 手动配置可用 provider={p} model={m}
route: 手动配置模型 {p}/{m} 不可用，自动轮询可用模型
route: 自动发现 provider={p} model={m}
route: 未找到任何可用模型
collect: LLM 流式调用异常：{e}
collect: 完成 kind={kind} 文本长度={n}
fallback: 采用 provider={p} model={m}
parse: 成功 title="{title}" tags=[{tags}] 摘要长度={n} 改写正文长度={n}
polish: 开始 正文长度={n} / polish: 完成 结果长度={n}
```

---

## 4. 所有 AI 提示词模板原文（核心资产，完整摘录）

> 约定：模板中的 {`...`} 是我加的变量说明，实际字符串里没有对应字符；模板内换行均来自 `[ ... ].join("\n")`。所有 system 模板在传给 LLM 之前都会经过 §4.10 的人格拼装（**唯一例外是 `generateDraft`**）。

### 4.1 完善（enrich）system —— `systemPrompt()`，ai.ts:384-409

入参：`existingTags: string[]`（当前标签库全部标签名）、`existingVars: string[]`（正文里的 `{{}}` 变量名）。

```text
你是一名词库整理助手，帮助用户把原始输入整理成高质量、可复用的提示词。

【标签库】以下是当前已有的标签，请优先复用最贴合的一个，避免重复创建：
{existingTags.join("、")}          // 传空数组时该行渲染为「（暂无）」

请严格输出一个 JSON 对象，不要 Markdown 代码块，不要任何多余文字：
{ "title": "简洁标题", "tags": ["标签"], "summary": "用途摘要与使用说明", "body": "优化改写后的提示词正文" }

要求：
- title：简洁明了，不超过 30 字；
- tags：只输出 1 个标签；优先从【标签库】中选择最贴合的一个，若没有合适的再新造一个简洁、贴合内容的新标签；
- summary：一两句话说明这个提示词的用途与使用方法；
- body：在保留原意的基础上润色，使表达更清晰、通用、可直接使用，不要丢失关键细节；
- 正文中的 {{变量名}} 是模板变量占位符（运行时由使用者替换）：所有已有的 {{}} 必须原样保留，不得删除、改写或替换其中的变量名、不得修改其括号格式；
- 若正文某处内容会因使用场景而变化（如角色、对象、主题、风格、细节等），可在那处新增命名清晰、贴合语境的 {{变量名}} 占位符，提升提示词可复用性；没有这种需求时不要画蛇添足；
```

第 6 行（"正文中的 …"）**仅当 `existingVars.length > 0` 时插入**（ai.ts:401-405）；最后一行始终存在。函数末尾 `return withSoulSystem(system)`（408）。

### 4.2 完善（enrich）user —— `userMessage()`，ai.ts:412-419

入参：`rawBody: string`、`tag?: string`（`prompt.tags?.[0]`）、`existingVars?: string[]`。

```text
以下是用户要学习的原始提示词：

{rawBody}
                      // tag 存在时追加下面两行
用户给出的候选标签：{tag}
                      // existingVars 非空时追加下面两行
正文已有模板变量（{{}} 内为变量名，运行时替换，必须原样保留）：{existingVars.join("、")}
```

### 4.3 润色 —— `polishPromptBody()`，system 在 ai.ts:693-707，user 在 708-711

`keepVariables = opts?.keepVariables !== false`（686，**默认 true**；AIPolishButton 传 false）。

```text
你是一名专业的提示词润色助手，擅长贴合用户的写作风格对提示词进行润色。

要求：
- 只润色提示词内容本身，不要涉及标题、标签、分类等；
- 保持原意与所有关键细节，不得遗漏、曲解或删减；
- 正文中的 {{变量名}} 是模板变量占位符（运行前由使用者替换）：所有已有的 {{}} 必须原样保留，不得删除、改写或替换其中的变量名；
- 若正文某处内容会因使用场景而变化（如角色、对象、主题、风格、细节等），可在该处新增命名清晰、贴合语境的 {{变量名}} 占位符，提升提示词可复用性；没有这种需求时不要画蛇添足；
- 让提示词更清晰、通用、结构清晰、可直接复用；
- 直接输出润色后的提示词正文，不要任何解释或 Markdown 代码块。
```

第 3、4 条（`{{}}` 相关）仅当 `keepVariables === true` 时插入（699-704）。user 消息二选一（708-711）：

```text
# keepVariables 且 existingVars 非空：
请润色以下提示词内容。其中已有模板变量（{{}} 内为变量名，运行前会被替换，必须原样保留）：{existingVars.join("、")}

{body}

# 其它情况：
请润色以下提示词内容：

{body}
```

返回前经 `stripAiFiller()`（720）。现有变量提取正则（688-692）：`/\{\{\s*([^{}]+?)\s*\}\}/g`。

### 4.4 专业完善（扩写）—— `enrichPromptProfessional()`，system 在 ai.ts:646-656，user 在 661

```text
你是一名专业的提示词完善助手，擅长把用户的提示词完善成更全面、更专业、结构完整、可直接执行的高质量作品。

要求（与「润色」相反：润色是把内容换得更简洁精炼；此处是扩写完善，使其更完整专业）：
- 只完善提示词正文本身，不要涉及标题、标签、分类；
- 保留原意与核心要求，在此基础上扩写完善：补充必要的方法、步骤、约束、边界与自查要点，使提示词更全面、更专业、更可执行；
- 用清晰的结构组织内容（分步骤 / 分要点 / 分阶段），方便使用者逐项落实；
- 使用专业、精准、规范的表达，避免含糊与口语化；
- 不要刻意缩短或压缩内容，适当扩充细节以提升完成度；
- 直接输出完善后的提示词正文，不要任何解释或 Markdown 代码块。
```

```text
请把以下提示词完善成更专业、更全面、结构完整的版本：

{body}
```

### 4.5 用途摘要 —— `polishPromptBodyWithSummary()`，system 在 ai.ts:764-771，user 在 776

```text
你是一名专业的提示词分析师，擅长用一句话概括提示词的用途与用法。

要求：
- 用一两句话说明这条提示词的核心用途与大致使用方法（适用场景/使用方式）；
- 简洁自然，不要复述正文的具体细节与步骤，50 字以内；
- 直接输出 JSON：{ "summary": "用途摘要" }，不要任何解释或 Markdown 代码块。
```

```text
请为以下提示词生成用途摘要：

{polished}          // 注意：输入是「润色后」的正文，不是原始 body
```

### 4.6 功能简介 —— `generateIntro()`，zh 在 ai.ts:800-814，en 在 815-822

```text
# zh（lang !== "en"）
你是一名擅长拟广告文案的中文文案，为「词库」（一款保存、组织、AI 润色并复用提示词的小工具）撰写简洁走心的功能简介。

要求：
- 输出恰好 5 句简介，每句一行，分别从记录、润色、整理、一键使用、随时可得等角度介绍价值；
- 风格有文气、有画面感、自然灵动，避免文言堆砌与空洞套话（如“受益无穷”“多多益善”）；
- 每句 10~20 字，朗朗上口，长短错落，不要全都一个句式；
- 不要编号、项目符号、引号、语气词或任何解释。

风格示范（仅参考，勿照抄）：
- 慧心记之，随取随用。
- AI 润饰，炼字成句。
- 分门别类，检索如流。

# en
You are a copywriter crafting elegant short taglines for a prompt library where users save, organize, AI-polish, and reuse prompts.

Requirements:
- Output exactly 5 taglines, one per line, covering saving, polishing, organizing, one-tap use and always-on access;
- Keep the tone refined, vivid and memorable, 6-12 words each; avoid clichés and empty praise;
- Vary the sentence shapes a little; no numbering, bullets, quotes, filler words, or explanation.
```

user：zh = `为「词库」工具写 5 句简介。`（824）；en = `Write 5 taglines for the prompt library tool.`（825）。返回后 `split(/\r?\n/)` 且剥掉 `/^\d+[.、)）]\s*/` 与 `/^-+\s*/`，`slice(0, 5)`（833-839）。

### 4.7 今日日报 —— `generateDailyReport()`，zh 在 ai.ts:896-905，en 在 906-915（**死代码**，仅作资产存档）

```text
# zh
你是一名「词库日报」编辑，根据当日的词库使用数据，为使用者撰写一份简明、有温度的今日词库日报。

要求：
- 基于给出的统计数据，提炼 3~5 条核心要点（不宜过多）；
- 每条要点为一个 JSON 对象 { headline, body }：headline 是 10 字以内的醒目短标题，body 是一句话展开说明（40 字内）；
- 语气自然亲切、接地气，避免套话与空洞鼓励；
- 只输出一个 JSON 数组，例如 [{"headline":"使用渐入佳境","body":"今日共使用 12 次提示词，较此前更频繁。"}]；不要任何解释或 Markdown 代码块。

# en
You are the editor of a "daily library report" (词库日报). Based on today's library usage data, write a brief and warm report for the user.

Requirements:
- Distill 3-5 core points from the given stats (not too many);
- Each point is a JSON object { headline, body }: headline is a punchy short title (within 10 words), body is a one-sentence explanation (within 40 words);
- Keep the tone natural, friendly and down-to-earth; avoid clichés and empty praise;
- Output only a JSON array, e.g. [{"headline":"Usage on the rise","body":"Used 12 prompts today, more than before."}]; no explanation or Markdown fences.
- IMPORTANT: reply entirely in English, even though the stats may be described in Chinese.
```

user：zh = `以下是今日词库的统计数据：` + 空行 + `statsText`（921）；en = `Here are today's library usage stats:` + 空行 + `statsText` + 空行 + `Write the daily report in English.`（922）。注意 zh/en 分支**都未调用 withSoulSystem**（916-919 直接传 `system`）。

### 4.8 技能描述符 —— `generateSkillDescriptor()`，system 在 ai.ts:1000-1010，user 在 1011-1018

```text
你是一名 DSH 技能（SKILL）设计助手。用户会给你一条提示词，请把它转化为一个规范、可直接复用的技能。

要求：
- name：英文小写 kebab-case（仅字母/数字/连字符，4-40 个字符），简洁达意，作为技能目录名与聊天框 /触发名；
- description：用一句英文描述该技能的用途与适用场景（不要 Markdown），供技能 AI 在合适时机自动触发；
- whenToUse：英文，一两句话说明什么场景下应该使用该技能；
- 正文中的 {{变量名}} 是模板变量占位符（运行时由使用者替换），必须原样保留，不得删除、改写或替换其中的变量名；{vars.length ? "该技能需要用户提供的输入变量有：{vars.join("、")}，请在描述中体现。" : "该技能没有模板变量。"}
请严格输出一个 JSON 对象，不要 Markdown 代码块，不要任何多余文字：
{ "name": "skill-name", "description": "...", "whenToUse": "..." }
```

```text
提示词标题：{title}
提示词摘要：{summary}            // 仅当 summary 非空
提示词标签：{tags.join("、")}      // 仅当 tags 非空

以下是提示词正文（{{变量名}} 为模板变量，必须原样保留）：
{body}
```

### 4.9 草稿生成（soul / skill）—— `generateDraft()`，4 个 system 变体在 ai.ts:1070-1104

```text
# en + soul
You are an expert at writing a SOUL.md persona for an AI assistant. Based on the given persona name and any draft notes, write a complete, well-structured persona definition.

Requirements:
- Write the full SOUL.md content in English, with clear sections (identity, tone, working rules) using Markdown headings;
- Keep it practical and warm, matching the persona's purpose; avoid clichés;
- Output only the SOUL.md content — no extra explanation, no code fence.

# en + skill
You are an expert at writing a DSH skill (SKILL.md) instruction for an AI assistant. Based on the given skill title and any draft notes, write a complete, actionable skill definition.

Requirements:
- Write the full skill content in English, starting with a short summary, then concrete instructions the assistant should follow, using Markdown;
- Keep it specific, actionable and easy to reuse; avoid vagueness;
- Output only the skill content — no extra explanation, no code fence.

# zh + soul
你是一名擅长编写 AI 人格（SOUL.md）的专家。根据用户给的人格名称与草稿，生成一段完整、结构清晰的人格设定。

要求：
- 用中文写完整的 SOUL.md 内容，用 Markdown 标题分节（身份设定 / 语气风格 / 工作规范等）；
- 内容务实、有温度，贴合人格用途，避免套话空话；
- 只输出 SOUL.md 正文，不要任何解释，不要 Markdown 代码块。

# zh + skill
你是一名擅长编写 DSH 技能（SKILL.md）指令的专家。根据用户给的技能标题与草稿，生成一段完整、可直接复用的技能定义。

要求：
- 用中文写完整技能正文，先写一段简短用途说明，再写具体、可执行的指令（用 Markdown 组织）；
- 内容具体、可落地、便于复用，避免空泛；
- 只输出技能正文，不要任何解释，不要 Markdown 代码块。
```

user（1105-1108）：

```text
标题：{title}

{input 非空时："以下是已有的草稿 / 补充要求（可在此基础完善）：" + 换行 + input.trim()
 input 为空时："（暂无草稿，请根据标题展开完整内容）"}
```

关键差异（ai.ts:1109-1111）：**`generateDraft` 刻意不做 withSoulSystem 注入**，代码里就是 `const sysText = system;`。返回值只做代码围栏清理（1121-1123）：剥掉开头 ```(?:md|markdown|soul|skill)?` 与结尾的 ```，再 `.trim()`。

### 4.10 人格注入格式 —— `withSoulSystem()`，ai.ts:427-435

```ts
import { buildSoulBoundary, readSoulDoc } from "./character.js";   // ai.ts:19
async function withSoulSystem(system: string, soul?: string): Promise<string> {
  try {
    const boundary = buildSoulBoundary(soul ?? (await readSoulDoc()));  // character.ts:100-102 → 仅 return soul.trim()
    if (!boundary) return system;                                       // 人格为空 → 原样返回
    return [system, "", "# SOUL · 人格", boundary].join("\n");
  } catch { return system; }
}
```

即追加片段为（system 末尾之后）：空行 + `# SOUL · 人格` + 空行 + 人格正文。

- 默认人格正文内置模板见 `src/host/character.ts:25-42`（`DEFAULT_PERSONA_SOUL`，"你是「词库助手」… 身份定位 / 工作原则 / 表达风格"）；空占位模板 `DEFAULT_SOUL` 在 21-22 行（只有标题行 `# SOUL · 人格`）。
- 调用点（6 处）：408（完善）、660（专业完善）、715（润色）、775（摘要）、829（简介）、1019（技能描述符）。**无注入**：`generateDraft`（1111）、`generateDailyReport`（916-919）。

### 4.11 输出后处理（与模板同等重要）

| 处理 | 函数 | 位置 | 行为 |
| --- | --- | --- | --- |
| 剥套话 + 代码围栏 | `stripAiFiller` | 609-623 | 整行命中 `AI_OPEN_RE` 的**开头最多 6 行** + 整行命中 `AI_CLOSE_RE` 的**结尾最多 6 行**删掉；先剥整体 Markdown 围栏（正则 `/^\s*```[a-zA-Z0-9_+\-.]*\s*\n?([\s\S]*?)\s*\n?```\s*$/` 替换为 `$1`） |
| 套话正则 | `AI_OPEN_RE` / `AI_CLOSE_RE` | 595-596 / 599-600 | 中英双语，**整行锚定**（`^…` + `/i`），含"好的/没问题/收到/以下是/希望/祝你/hello/sure/here is/hope/thanks…"等；两者都**不匹配空行/内容行**，以免误删正文 |
| 完善 JSON 解析 | `parseRefineResult` | refine.ts:27-53 | 剥 Markdown 代码围栏（正则 ```(?:json)? … ```）→ 取首个 `{` 到末个 `}` → JSON.parse；**body 必填**否则 undefined；tags 只留第 1 个 |
| 摘要 JSON 解析 | `parseSummaryJson` | 733-746 | 同构，只取 `summary` |
| 技能 JSON 解析 | `parseSkillJson` | 958-976 | 同构；`name` 必填 |
| 数组解析 | `parseJsonArray` | 861-872 | 取首个 `[` 到末个 `]`；仅日报使用 |

## 5. 「AI 优化」前端完整流程

### 5.0 三个入口 + 调用链总览

| 入口 | 文件 | 触发 | API | 结果去向 |
| --- | --- | --- | --- | --- |
| composer 星星按钮 | AIPolishButton.tsx（slot `conversation.input.left`, id `prompt-library-ai-polish`, order 11） | 点击 | `POST /ai/polish { keepVariables:false }` | 结果面板 → 只改草稿（不写词库） |
| 词库面板 查看详情 | PromptLibraryButton.tsx:930-969 | 点击「AI 优化」 | `POST /ai/polish { withSummary:true }` | 结果面板 → 插入草稿 / 保存回词库 |
| 数据管理弹窗 | LexiconManagerModal.tsx:389-447 | 点击「AI 优化」 | 同上 | 同上 |

共同的后端链路（**没有第二条**）：

```text
按钮 → api.ts polishPrompt()  (api.ts:337-346)
     → POST /api/prompt-library/ai/polish   (routes.ts:783-805)
     → polishPromptBody() / polishPromptBodyWithSummary()   (ai.ts:673 / 754)
     → resolveCandidates()  (ai.ts:328)  → collectTextWithFallback() (ai.ts:493) → collectText() (ai.ts:441) → llm.stream()
     → 失败返回 undefined → 503 { ok:false, error:"AI 不可用或优化失败，请确认已连接 LLM 服务" }
     → send() 抛 Error → 前端 catch → setError / viewPolishError
```

### 5.1 AIPolishButton.tsx（318 行）逐段说明

| 段 | 行号 | 内容 |
| --- | --- | --- |
| 文件头注释 | 1-10 | 明确"AI 能力完全复用 host 侧 ai.ts（polishPromptBody），本组件只做浏览器端编排" |
| Props 合约 | 25-31 | `{ useInput: <T>(selector: (s: { draft: string }) => T) => T; inputActions: { setDraft: (text: string) => void }; t?: PLTranslate }` |
| 主题常量 | 33-48 | `MONO`、`TONE`（全部走 `--dsw-alias-*` CSS 变量，带 fallback 色） |
| `TOAST_MS` | 51 | `2200` |
| `SparkleIcon` | 54-74 | 双四角星 SVG；`spinning` 时挂 `animation: pl-polish-spin 0.9s linear infinite` |
| `useSettings` | 77-97 | 初始 `DEFAULT_SETTINGS` → `apiGetSettings()` 拉取 → 监听 window `pl:settings-changed`（detail 有值直接用，否则重新拉） |
| 主组件 | 99-318 | 见下 |

组件内部状态（112-118）：

| state | 类型 | 含义 |
| --- | --- | --- |
| `status` | `"idle" \| "polishing" \| "done" \| "error"` | 主状态机 |
| `result` | string | 润色结果（面板 textarea 双向绑定） |
| `original` | string | **点击瞬间抓的草稿快照**，供"原稿"对比 |
| `showOriginal` | boolean | 面板里切"润色稿 ↔ 原稿" |
| `error` | string | 错误文案（面板头部展示） |
| `toast` | string | 2.2s 自动消失的浮层提示（121-125） |

关键函数：

| 函数 | 行号 | 行为 |
| --- | --- | --- |
| `closeResult` | 129-135 | 全部状态复位（idle / 清 result / 清 original / showOriginal=false / 清 error） |
| `handlePolish` | 138-159 | 见下方伪码 |
| `applyResult` | 162-166 | `inputActions.setDraft(result)` + `closeResult()`（**回填草稿的唯一动作**） |
| `copyResult` | 169-172 | `navigator.clipboard.writeText(result)` + toast `pl.copied` |

```ts
// AIPolishButton.tsx:138-159
const text = draft.trim();
if (!text) { showToast(T("pl.polishEmpty")); return; }        // 空草稿：只提示，不请求
setStatus("polishing"); setError(""); setOriginal(draft); setShowOriginal(false);
polishPrompt(draft, { keepVariables: false })                 // 注意：关闭 {{}} 保护
  .then(({ polished }) => { setResult(polished); setStatus("done"); })
  .catch((err) => { setError(String(err.message)); setStatus("error"); showToast(T("pl.polishFail")); });
```

UI 分支（全部条件渲染）：

| 条件 | 渲染 | 行号 |
| --- | --- | --- |
| `!settings.showAIPolishButton` | `return null`（**必须放在所有 hooks 之后**，199） | 199 |
| always | `<style>{PL_BUTTON_CSS}` + 无边框补丁 + `@keyframes pl-polish-spin` | 203-206 |
| button | `disabled={status === "polishing" \|\| !draft.trim()}`；`data-tip` 三态（优化中 / 有内容 / 空）；`icon={<SparkleIcon spinning={status === "polishing"} />}`；文字仅当 `!settings.aiPolishButtonIconOnly` 显示，文案 `"优化中…" / "AI 优化"` | 208-220 |
| `toast` 非空 | 浮层 `role="status" aria-live="polite"`；`status === "error" ? TONE.red : TONE.mint`；前缀 `⚠` / `✓` | 223-245 |
| `status === "done"` | 结果面板：`role="dialog"`、宽 380、`bottom: calc(100% + 4px)`、`zIndex 1000`；标题 `pl.polishResult`；**无遮罩、点外部不关闭**；原稿/润色稿切换 chip；`textarea rows={7}`（`readOnly={showOriginal}`，onChange 只改 `result`）；按钮组：复制 / 关闭 / 替换内容(`variant="primary"`) | 249-315 |
| `status === "error"` | **不渲染面板**，只有 toast + 按钮回到可点状态（error 文本只在 done 面板头部渲染，254——所以 error 态下 `error` 实际看不见） | — |

状态机（文字图）：

```text
idle --点击(草稿非空)--> polishing --then--> done --「替换内容」--> idle
                                \--catch--> error --再点「AI 优化」--> polishing
idle --点击(草稿空)--> idle (toast "请先输入内容")
done --「关闭」--> idle ; done --「复制」--> done (toast "已复制")
```

必要的 i18n key（zh / en，i18n.ts:69-79 / 552-562）：`pl.polish`、`pl.polishing`、`pl.polishBtnTitle`、`pl.polishLoadingTitle`、`pl.polishEmpty`、`pl.polishFail`、`pl.polishHoverContent`、`pl.polishResult`、`pl.polishResultAria`、`pl.summaryLabel`、`pl.replaceContent`、`pl.original`（60/543）、`pl.polished`（61/544）、`pl.copy`、`pl.copied`、`pl.close`（含 `pl.saveToLibrary`、`pl.insert`、`pl.refinedDone`、`pl.refinePending`、`pl.learnedToast` 供其它入口）。

### 5.2 词库面板「查看详情 → AI 优化」（PromptLibraryButton.tsx）

| 步骤 | 行号 | 代码要点 |
| --- | --- | --- |
| 触发 | 1570-1581 | 仅当 `!viewing.aiRefined` 才渲染「AI 优化」按钮（**已完善的条目无法再优化**） |
| 请求 | 930-945 | `setViewPolish({status:"loading", id: viewing.id})` → `await apiPolish(viewing.body, { withSummary: true })` → 存 `viewPolishText` / `viewPolishSummary` → `{status:"done", id}`；catch → 回 idle + `setViewPolishError(msg)`（按钮可重试） |
| loading UI | 1541-1551 | 不确定进度条：`<div style={{height:3, ...}}>` 内 `width:40%; animation:"pl-progress 1.2s ease-in-out infinite"` |
| 状态文案 | 1532-1540 | loading → `pl.polishing`；done → `pl.polishResult`；否则 `viewing.aiRefined ? "✓ 已完成 AI 完善" : "… 尚未完成 AI 完善"`（色 `TONE.mint / TONE.quiet`） |
| 原稿对比 | 1420-1442 + 1473 | chip 切换 `viewShowOriginal`；textarea `value={viewShowOriginal ? viewing.body : viewPolishText}` |
| 插入草稿 | 1557-1563 | `inputActions.setDraft(draft && draft.trim() ? draft + "\n\n" + viewPolishText : viewPolishText)`，然后 `closeView()` |
| 保存回词库 | 948-969 | `apiUpdate(viewing.id, { body, summary: viewPolishSummary.trim() \|\| undefined, sourceBody: viewing.body !== body ? viewing.body : undefined, aiRefined: true })` → `setViewing(updated)` → 更新列表 → 复位 → `notifyDataChanged()` |
| 失败提示 | 1510-1521 | `viewPolishError` 非空时在底部操作栏上方渲染 `T("pl.polishFail")`（红色，不显示原始 message） |

LexiconManagerModal.tsx 同构（388-447 / 972-1080），差异：
- 用 `polishTargetRef.current = id` 做**过期结果丢弃**（392/399/404），因为用户可能在优化期间切换条目；
- 保存成功 toast `pl.lexicon.saved`（438）；
- textarea 值 `viewShowOriginal ? p.body : viewPolishText`（1054）。

### 5.3 API / WS 层

```ts
// src/client/utils/api.ts:337-346
export function polishPrompt(body, opts?: { keepVariables?: boolean; withSummary?: boolean })
  : Promise<{ polished: string; summary?: string }> {
  return send("POST", "/api/prompt-library/ai/polish", {
    body, keepVariables: opts?.keepVariables ?? true, withSummary: opts?.withSummary ?? false });
}
```

- WS 端点仅一个：`ws(s)://<host>/api/prompt-library/events`（ws.ts:13 `SOCKET_PATH`），单例连接 + 监听器集合 + 指数退避重连（1s 起，上限 10s，ws.ts:14-16 / 38-46）。`subscribePush(listener)` 返回取消函数（100-107）。
- `data-sync.ts` 把 WS 消息翻译成 window 事件：`data-changed` → `pl:data-changed`（27-30）；`fill-draft` → `pl:fill-draft`（31-37）；`export-download` → 本地下载（38-69）。Hooks：`useDataChanged`(101-110)、`useFillDraft`(113-125)、`useExportDownloaded`(128-140)。
- **AI 结果不走 WS**：host 的 `emitFillDraft()`（events.ts:63-65）**零调用方**，所以 `fill-draft` 永远不发出；`useFillDraft` 是死兜底（AIPolishButton.tsx:108-110 与 PromptLibraryButton 各挂一次，谁在都能填草稿）。
- 跨组件刷新：`notifyDataChanged()`（data-sync.ts:15-17）派发 window `pl:data-changed` → `useDataChanged(reload)` 触发重新拉列表。

---

## 6. AI 相关持久化

### 6.1 字段定义与数据库 schema

```ts
// src/types.ts:6-31  (Prompt)
summary?: string;          // 15-16  AI 生成的用途摘要/使用说明
sourceBody?: string;       // 17-18  AI 改写前的原始正文（仅当正文被改写时存在）
aiRefined?: boolean;       // 19-20  是否经过 AI 完善
aiRefinedAt?: number;      // 21-22  AI 首次完善的毫秒时间戳（0 = 从未完善）
```

```sql
-- src/host/store.ts:49-61
CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, tags TEXT,
  summary TEXT, sourceBody TEXT, aiRefined INTEGER NOT NULL DEFAULT 0,
  updatedAt INTEGER NOT NULL, usageCount INTEGER NOT NULL DEFAULT 0, lastUsedAt INTEGER NOT NULL DEFAULT 0);
-- 兼容旧库的补列（69-74）
ALTER TABLE prompts ADD COLUMN createdAt   INTEGER NOT NULL DEFAULT 0;   -- 63-68
ALTER TABLE prompts ADD COLUMN aiRefinedAt INTEGER NOT NULL DEFAULT 0;   -- 69-74
-- trash 表同构（93-108，含 sourceBody / aiRefined / deletedAt）
-- pl_prompt_versions 快照表（写入见 store.ts:1899-1928）
```

行 ↔ 对象映射：`rowToPrompt`（store.ts:382-400 与回收站 471-488）：`sourceBody: r.sourceBody ?? undefined`、`aiRefined: r.aiRefined === 1`、`aiRefinedAt: r.aiRefinedAt ?? 0`。

### 6.2 写入点（唯一的 4 处）

| 文件:行 | 写入内容 | 备注 |
| --- | --- | --- |
| ai.ts:582-590（`enrichLearnedPromptInner`） | `{ title, tags: result.tags.slice(0,1), summary, body, sourceBody: changed ? prompt.body : undefined, aiRefined: true }` | **死代码**（无调用方） |
| PromptLibraryButton.tsx:953-958 | `{ body, summary, sourceBody: viewing.body !== body ? viewing.body : undefined, aiRefined: true }` | 查看详情「保存到词库」 |
| LexiconManagerModal.tsx:428-433 | 同上 | 数据管理「保存」 |
| ImportEditModal.tsx:367-369 | `{ summary: e.summary.trim(), aiRefined: true }` | 导入规则：**有摘要即视为已 AI 完善** |

`aiRefinedAt` 由 store 自动补（store.ts:777-784）：`patch.aiRefinedAt !== undefined ? patch.aiRefinedAt : (aiRefined && !current.aiRefined ? Date.now() : current.aiRefinedAt ?? 0)` —— **前端永远不需要传**。
`updatePrompt` 的快照副作用（store.ts:818-826）：当 title/body/summary/sourceBody 任一变化时 `snapshotPromptVersion(next, aiRefined && !current.aiRefined ? "refine" : "update")`。**但 pl_prompt_versions 表没有任何 HTTP 路由可读**（routes.ts 中 versions 相关只有 `GET /version` 应用版本号，routes.ts:855-858），所以版本历史是"只写不读"的死数据。

### 6.3 读取点

| 字段 | 读取位置 | 用途 |
| --- | --- | --- |
| `aiRefined` | PromptLibraryButton.tsx:1532（状态色）、1537（文案）、1569（**门控：已完善则隐藏优化按钮**）；LexiconManagerModal.tsx:888（列表徽标） | 状态展示 + 按钮门控 |
| `summary` | PromptLibraryButton 结果面板 `viewPolishSummary`（1444-1452 区段）+ 保存时回写；ImportEditModal 判定 | 展示 + 入库 |
| `sourceBody` | **无任何读取点**（grep 全客户端仅 2 处写） | 预留/死字段 |
| `aiRefinedAt` | **无任何读取点** | 死字段 |

### 6.4 撤销（回到原始正文）如何实现 —— 现状与裁剪版建议

**现状（v0.16.0）：不存在真正的撤销。**
- 「原稿 / 润色稿」chip 只是**面板内的临时对比**，数据源是点击润色时的前端快照（AIPolishButton `original` state）或未保存前的 `viewing.body`；关闭面板即丢失。
- 保存后正文被覆盖，`sourceBody` 落库但无人读；用户只能靠版本快照表（也没有 UI）或自己从回收站/备份恢复。

**裁剪版若要"一键回到原始正文"，最小实现（3 处改动）：**
1. 保存润色结果时**始终**写 `sourceBody`（把 `viewing.body !== body ? viewing.body : undefined` 改成无条件 `viewing.body`，或仅在 `!sourceBody` 时写，避免二次覆盖原稿）。
2. 查看面板里当 `p.sourceBody` 存在时增加一个「还原原始正文」按钮，调用现有 `PUT /api/prompt-library/prompts/:id`（routes.ts:388-403，`apiUpdate`）传 `{ body: p.sourceBody, sourceBody: undefined, aiRefined: false }` 即可（`aiRefined: false` 会把 `aiRefinedAt` 保留、`aiRefined` 置 0，见 store.ts:777-784）。
3. 类型层无需改动（`PromptPatch` 已含 `sourceBody`/`aiRefined`，types.ts:91-100）。

---

## 7. 自学习（自动识别并保存复杂 prompt）

**结论：v0.16.0 中自学习链路已废弃，只剩"骨架"与标记。**

| 存在物 | 位置 | 现状 |
| --- | --- | --- |
| `enrichLearnedPrompt(prompt, settings)` | ai.ts:529-546 | 导出但**全仓库零调用方**（已用 Select-String 全仓扫描确认，仅自身与注释命中） |
| `enrichLearnedPromptInner` | ai.ts:552-592 | 上述函数的执行体：读标签库 → 提变量 → 组装 system/user → 调用 → `parseRefineResult` → `updatePrompt` 写回 |
| `enrichInFlight: Set<string>` | ai.ts:549 | 同 prompt 并发去重（536-545） |
| `parseRefineResult` | refine.ts:27-53 | 纯函数解析（**零依赖，可直接单测**），注释仍称"自学习（autoLearn）的核心处理路径" |
| "复杂 prompt"判定阈值 | —— | **不存在**。没有任何长度/关键词/结构判定逻辑残留 |
| `pl.learnedToast`（"已自动学习"） | i18n.ts:57 / 540 | 仍被 PromptLibraryButton.tsx:1069 当通用 toast 兜底文案使用 |
| 自动保存到词库 | —— | 前端在保存润色结果时手动置 `aiRefined: true`（§6.2），**不是自动识别** |

裁剪建议：**整段删除**（§8.2 列出确切行区间）。若要在此插件里复活"自动识别复杂 prompt"，可复用的现成资产只有两件：`parseRefineResult` 与 §4.1/4.2 的模板 + §4.11 的解析链；判定逻辑需要新写（建议 `body.length >= 200 || /(^|\n)\s*(\d+[.、)]|#{1,3}\s)/.test(body) || (body.match(/\n/g)?.length ?? 0) >= 5`，并在 `store.createPrompt` 之后异步调用 `enrichLearnedPrompt`）。

---

## 8. 裁剪施工图（dsh-prompt-library → dsh-prompt-enhancer）

### 8.1 必留清单（AI 能力最小闭包）

| 类别 | 具体 |
| --- | --- |
| Host | `src/host/ai.ts`（瘦身后）、`src/host/paths.ts`（只需 `logDir` + `dshHome`）、`src/host/store.ts` 的 `getSettings/updateSettings/listTags`（`listTags` 仅当保留 `systemPrompt` 的标签库）、`src/host/routes.ts` 的 7 条路由、`src/host-vendor.d.ts`、`src/ambient.d.ts` |
| 路由 | `GET /ai/providers`、`POST /ai/polish`、`GET /settings`、`PUT /settings`（+ 词库 CRUD 的 `PUT /prompts/:id`，AI 结果落库必需） |
| Client | `AIPolishButton.tsx`（原样）、`utils/api.ts` 的 `send/polishPrompt/getSettings/updateSettings/getAiSelectables`、`utils/data-sync.ts` 的 `notifyDataChanged/useDataChanged`、`utils/ws.ts`（若保留实时刷新）、`utils/i18n.ts` 的 AI key、`utils/button-style.ts`、`utils/theme.ts`（`rowBackground`） |
| 类型 | `Prompt@{id,title,body,tags,summary,sourceBody,aiRefined,aiRefinedAt,updatedAt,createdAt,usageCount,lastUsedAt}`、`PluginSettings@{aiProvider,aiModel,showAIPolishButton,aiPolishButtonIconOnly}`、`DEFAULT_SETTINGS`、`ApiResponse`、`PromptPatch` |
| 构建 | `package.json` 的 `peerDependencies``@deepseek-ai/dsh-llm`（optional）+ `dsh.client` 段落、`scripts/build.mjs`、`cordis.patch.yml` |

### 8.2 必删清单（死代码 / 越界能力）

| # | 符号 / 区段 | 位置 | 删除理由 |
| --- | --- | --- | --- |
| 1 | `isAiAvailable` | ai.ts:262-264 | 零调用方 |
| 2 | `parseJson` | ai.ts:517-520 | 仅被 #3 使用 |
| 3 | `enrichLearnedPrompt` + `enrichInFlight` + `enrichLearnedPromptInner` | ai.ts:522-549 与 551-592 | 自学习已废弃（§7） |
| 4 | `enrichPromptProfessional` | ai.ts:625-666 | 无路由、无调用方（若要保留"AI 完善"按钮则**改为保留并新增路由**，见 §8.3 步骤 7b） |
| 5 | `generateIntro` + 其路由 | ai.ts:784-840、routes.ts:807-817 | 前端无调用方（浮动助手已删） |
| 6 | `DailyReportItem` / `TechNewsItem` / `parseJsonArray` / `todayLocalDate` / `generateDailyReport` | ai.ts:842-939 | 日报/新闻功能整体废弃 |
| 7 | `SkillDescriptor` / `SkillDescribeFail` / `SkillDescribeResult` / `parseSkillJson` / `generateSkillDescriptor` + 路由 `/skills/ai-describe` + `api.ts describeSkill`(295-307) | ai.ts:941-1038、routes.ts:682-708 | 属于"导出为 DSH 技能"，与提示词增强无关 |
| 8 | `DraftGenerateFail` / `DraftGenerateResult` / `generateDraft` + 路由 `/ai/draft` + `api.ts generateDraft`(348-364) | ai.ts:1040-1129、routes.ts:819-847 | 人格/技能草稿生成，与 persona 强耦合 |
| 9 | `import { buildSoulBoundary, readSoulDoc } from "./character.js"` | ai.ts:19 | 唯一人格依赖（解耦见 §8.3） |
| 10 | `import { parseRefineResult, type AiRefineResult } from "./refine.js"` | ai.ts:16 | 随 #2/#3 一起删（`refine.ts` 本身可选保留） |
| 11 | `import { listTags, readGlobalLocale, updatePrompt }` 中的 `updatePrompt` / `readGlobalLocale` | ai.ts:15 | `updatePrompt` 仅 #3 用；`readGlobalLocale` 仅日志语言 |
| 12 | `AiLogCopy` 中 intro / skill / draft 三组格式化器 | ai.ts:101-111、149-159、194-204 | 随能力删除 |
| 13 | `emitFillDraft()` + 客户端 `useFillDraft` + `handleMessage` 的 `fill-draft` 分支 | events.ts:59-65、data-sync.ts:31-37 / 113-125 | WS 死链路 |
| 14 | `src/host/character.ts` / `persona-service.ts` / persona 相关 store 与路由 | 整文件 | 人格子系统整体剥离（另见 01/03 报告） |

### 8.3 人格解耦：最小改动（7 步）

**Step 1 — 删 import**
```diff
- import { buildSoulBoundary, readSoulDoc } from "./character.js";     // ai.ts:19
```

**Step 2 — 让 6 个调用点不再经过 withSoulSystem**（每处都是一行替换）

| 行号 | 原 | 改为 |
| --- | --- | --- |
| 408（`systemPrompt` 内） | `return withSoulSystem(system);` | `return system;` |
| 660（`enrichPromptProfessional`） | `await withSoulSystem(system),` | `system,` |
| 715（`polishPromptBody`） | `await withSoulSystem(system),` | `system,` |
| 775（`polishPromptBodyWithSummary`） | `await withSoulSystem(summarySystem),` | `summarySystem,` |
| 829（`generateIntro`，已删） | — | — |
| 1019（`generateSkillDescriptor`，已删） | — | — |

**Step 3 — 删函数本体**
```ts
// 删除 ai.ts:425-435（注释 + withSoulSystem 实现）
async function withSoulSystem(system: string, soul?: string): Promise<string> { ... }
```

**Step 4 — 固定日志语言（可选，去掉 `store.readGlobalLocale` 依赖）**
```ts
// 原 ai.ts:208-220 → 替换为
const aiLogLang = "zh";
```

**Step 5 — 删 store 依赖中的 persona 通路**
ai.ts 此时只需 `listTags`（若保留 `systemPrompt` 的标签库提示）与 `getSettings`（由 routes 传入，ai.ts 不直接 import）。`character.ts` 整文件删除后，`store.ts` 里 `getDefaultPersonaSoul/setDefaultPersonaSoul/getPersona/updatePersonaMeta` 等仅被 character/persona-service 使用的函数可一并删除。

**Step 6 — 校验解耦完成**
```text
git grep -n "withSoulSystem|character.js|persona|Persona|SOUL" -- src/host/ai.ts   # 期望：0 命中
```

**Step 7 — 保留「AI 完善」能力的可选增强（推荐）**
把 #4 的 `enrichPromptProfessional` 保留，并在 routes.ts 的 `/ai/polish` 之后新增一条同构路由（复用同一 `send/polishPrompt` 风格）：

```ts
// routes.ts 里新增（照抄 /ai/polish 的模板，仅换函数与字段）
if (method === "POST" && tail === "/ai/enrich") {
  const raw = await readJsonBody(req);
  if (typeof raw?.body !== "string" || !raw.body.trim()) return json(res, 400, { ok:false, error:"invalid body: {body}" });
  const settings = await getSettings();
  const enhanced = await enrichPromptProfessional(raw.body, settings);
  if (enhanced === undefined) return json(res, 503, { ok:false, error:"AI 不可用或完善失败，请确认已连接 LLM 服务" });
  return json(res, 200, { ok:true, data:{ enhanced } });
}
```
对应客户端在 `api.ts` 加 `enrichPrompt()`，在 `AIPolishButton` 加第二个按钮（或改成下拉：优化 / 完善），完全复用同一面板与状态机。

### 8.4 瘦身后的规模

ai.ts 保留区间（行号按原文件）：
- **1-515**（常量 / 日志 / 路由解析 / collectText / fallback），减去 `isAiAvailable` 3 行 → 512 行
- **594-623**（`AI_OPEN_RE` / `AI_CLOSE_RE` / `stripAiFiller`）→ 30 行
- **668-782**（`polishPromptBody` + `PolishWithSummary` + `parseSummaryJson` + `polishPromptBodyWithSummary`）→ 115 行
- 若保留"AI 完善"：再加 **625-666**（`enrichPromptProfessional`）→ +42 行

预期 `ai.ts` **约 615-660 行**（含注释），比原 1129 行减少约 45%；`AiLogCopy` 从 41 个格式化器降到 ~20 个。删除后 routes.ts 的 AI 段落只剩 4 条（+1 条可选 /ai/enrich），client 侧 `api.ts` 的 AI 函数从 4 个降到 2-3 个。

### 8.5 裁剪时最容易踩的 5 个坑

1. `AIPolishButton` 里 `if (!settings.showAIPolishButton) return null;` **必须在所有 hooks 之后**（199 行位置），上移会触发 React hooks 顺序错误。
2. `send()` 用 `payload.data === undefined` 判失败——新增路由如果把数据放在 `data` 以外（例如 `{ ok, polished }`）会被客户端判为失败。所有路由必须遵守 `ApiResponse{ok,data,error}` 信封。
3. `/ai/polish` 的 `withSummary` 分支返回的 `data` 是 `{ polished, summary? }`；非 withSummary 分支是 `{ polished }`。客户端 `polishPrompt` 返回类型统一为 `{ polished: string; summary?: string }`，删 `withSummary` 分支时注意别删掉 `summary` 字段。
4. `resolveCandidates` 的 30s 缓存键只看 `aiProvider|aiModel`（ai.ts:332）。裁剪版若新增/修改 AI 设置项，**必须在 `PUT /settings` 里调用 `clearRouteCache`**（当前没做，是个既存缺陷），否则新配置最多 30s 不生效。
5. `__DEV__` 是 esbuild define 的全局（ambient.d.ts:26）。裁剪时若删掉 `ambient.d.ts`，`logAI` 的 `if (!__DEV__)` 会 tsc 报错；直接删除该判断（永远不写日志）或保留声明。

---

## 9. 验收清单（裁剪后逐项可执行）

| # | 检查 | 期望 |
| --- | --- | --- |
| 1 | `npm run typecheck`（`tsc --noEmit`） | 0 错误（尤其 ai.ts 不再引用 character.js / refine.js） |
| 2 | `git grep -n "character|persona|SOUL|soul" -- src/host/ai.ts` | 0 命中 |
| 3 | `git grep -n "emitFillDraft|fill-draft"` | 0 命中（或仅注释） |
| 4 | 宿主无任何 LLM provider 时点 composer 按钮 | 草稿非空 → 请求 503 → toast "AI 优化失败，请确认已连接 LLM 服务"，状态回可点，不崩 |
| 5 | 草稿为空时点按钮 | 按钮 disabled（`!draft.trim()`）且点击任何情况下只 toast "请先输入内容" |
| 6 | 有可用 LLM 时点按钮 | 图标旋转（`pl-polish-spin`）→ 弹出结果面板 → 「替换内容」把结果写入草稿 |
| 7 | 词库内「AI 优化」 | 200 返回 `{polished, summary?}`；保存后 `aiRefined=true`、`sourceBody` 有值、`summary` 落库 |
| 8 | 已 `aiRefined` 的条目 | 详情面板**不显示**「AI 优化」按钮（1569 行门控） |
| 9 | dev 构建触发一次 AI 调用 | `~/.dsh/prompt-library/log/ai-<今日>.log` 出现 `[时间戳] route: …` / `polish: 开始` / `collect: 完成` / `polish: 完成` 行；生产构建**不产生**该文件 |
| 10 | 连续点两次润色 | 日志显示 `fallback: 尝试` 依次出现，无并发交叉（`withLlmLock` 生效） |
| 11 | 设置页切换「AI 调用方 / 默认模型」 | `PUT /settings` 成功；`GET /ai/providers` 下拉正确回填；`pl:settings-changed` 让 composer 按钮显隐即时生效 |
| 12 | `git grep -n "aiRefinedAt|sourceBody" -- src/client` | 只有写、没有读（确认这是既存现状，不是裁剪引入的 bug） |

---

## 附录 A · AI 相关 HTTP 路由表（完整）

| 方法 | 路径 | 请求体 | 成功响应 | 失败 | 实现 |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/prompt-library/ai/providers` | — | `{ok:true,data:AiSelectable[]}`（`{provider,name,models:[{id,name}]}`） | llm 未注入 → `[]`（仍 200） | routes.ts:774-778 → ai.ts:282-299 |
| POST | `/api/prompt-library/ai/polish` | `{body:string, keepVariables?:boolean=true, withSummary?:boolean=false}` | `{ok:true,data:{polished:string, summary?:string}}` | 400 `"invalid body: {body: string}"` / `"body empty"`；503 `"AI 不可用或优化失败，请确认已连接 LLM 服务"` | routes.ts:780-805 → ai.ts:673 / 754 |
| POST | `/api/prompt-library/ai/intro` | `{lang?:"zh"|"en"}` | `{ok:true,data:{lines:string[]}}`（≤5） | 503 `"AI 不可用或生成简介失败"` | routes.ts:807-817 → ai.ts:788【死】 |
| POST | `/api/prompt-library/ai/draft` | `{kind:"soul"|"skill", title:string, input?:string, lang?}` | `{ok:true,data:{content:string}}` | 400 / 503 `"AI 不可用或生成失败，请确认已连接 LLM 服务"` | routes.ts:819-847 → ai.ts:1055【裁剪删】 |
| POST | `/api/prompt-library/skills/ai-describe` | `{title, body, summary?, tags?}` | `{ok:true,data:{desc?:{name,description,whenToUse?}, fail?:"no-llm"|"route"|"empty"|"parse"}}` | 400 `"invalid body: {title, body}"` | routes.ts:682-708 → ai.ts:985【裁剪删】 |
| GET | `/api/prompt-library/settings` | — | `{ok:true,data:PluginSettings}` | — | routes.ts:849-853 |
| PUT | `/api/prompt-library/settings` | `Partial<PluginSettings>` | `{ok:true,data:PluginSettings}` | — | routes.ts:860-868 |
| PUT | `/api/prompt-library/prompts/:id` | `PromptPatch`（`body/summary/sourceBody/aiRefined`…） | `{ok:true,data:Prompt}` | 404 | routes.ts:388-403 → store.ts:756-831（AI 结果落库必需） |

路由分发机制：`makePromptRoutes()`（routes.ts:363）返回 `WebRoute[]`，单条 `prefix` 路由挂 `/api/prompt-library`（`PREFIX`，routes.ts:90）；`parseTail()`（186-193）切出 `tail` 与 `segments`，因此断言写作 `method === "POST" && tail === "/ai/polish"` 或 `segments[0] === "prompts"`。注册在 index.ts:235-251（`ctx.inject(["webServer"])` → `httpCtx.webServer.register(route)`）。

## 附录 B · AI 设置项与 UI

| 设置字段 | 类型 | 默认 | 消费位置 |
| --- | --- | --- | --- |
| `aiProvider` | string | `""`（自动发现） | ai.ts:332/341/344/348；SettingsSection.tsx:482-523（下拉，切换时清空 `aiModel`，515-516） |
| `aiModel` | string | `""`（自动发现） | ai.ts:332/341/344/348；SettingsSection.tsx:502-527（`disabled={!draft.aiProvider}`） |
| `showAIPolishButton` | boolean | `true` | AIPolishButton.tsx:199；SettingsSection.tsx:606-607 |
| `aiPolishButtonIconOnly` | boolean | `true` | AIPolishButton.tsx:219；SettingsSection.tsx:620-622 |

选项源：SettingsSection.tsx:380-387 挂载时 `getAiSelectables()`（失败则下拉只剩 `pl.set.aiModelAuto`「自动选择（推荐）」）；i18n key `pl.set.aiModelProvider`（479/962）、`pl.set.aiDefaultModel`（480/963）、`pl.set.aiModelAuto`（481/964）。
设置保存：SettingsSection.tsx:399-423，先本地 state 再 300ms 防抖 `apiUpdateSettings`，成功后派发 window `pl:settings-changed`（detail = 完整 settings）。

## 附录 C · 关键短代码片段（供直接搬运）

```ts
// 1) 变量提取（polishPromptBody:688-692 / enrichLearnedPromptInner:564-566 / generateSkillDescriptor:997-999 三处重复）
const existingVars = [...body.matchAll(/\{\{\s*([^{}]+?)\s\}\}/g)].map((m) => m[1]!.trim()).filter(Boolean);

// 2) 摘要解析（ai.ts:733-746）
const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);   // ``` 表示三反引号围栏
const candidate = fenced ? fenced[1]! : text;
const s = candidate.indexOf("{"); const e = candidate.lastIndexOf("}");
if (s === -1 || e <= s) return undefined;
const obj = JSON.parse(candidate.slice(s, e + 1));
const summary = typeof obj.summary === "string" ? obj.summary.trim() : "";
return summary || undefined;

// 3) 串行锁（ai.ts:241-247）
let llmQueue: Promise<unknown> = Promise.resolve();
function withLlmLock<T>(task: () => Promise<T>): Promise<T> {
  const run = llmQueue.then(() => task());
  llmQueue = run.catch(() => {});
  return run;
}
```

（全文完）

