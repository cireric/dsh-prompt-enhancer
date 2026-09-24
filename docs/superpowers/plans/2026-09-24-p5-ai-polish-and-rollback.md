# dsh-prompt-enhancer P5：AI 优化 + 一键完善 + 「原文 ↔ 优化稿」双向切换 实施计划

> **面向 Agent 执行者：** 必需子技能：使用 superpower-subagent-driven-development（推荐）或 superpower-executing-plans 按任务逐项执行本计划。步骤使用复选框（`- [ ]`）语法跟踪。
>
> **执行前提：** 本文「待用户拍板」TBD-P5-1..10 必须已获用户裁定并回填（执行记录里写「用户裁定」原文）。未回填前不得分发任务 1。
>
> **SDD 脚本注意（本项目实测，勿凭记忆）：** 本技能脚本位于 `$DSH_HOME/profiles/web/node_modules/@wenaixi/dsh-superpower/skills/superpower-subagent-driven-development/scripts/`，三个脚本**都没有可执行位**（mode 644）→ 一律 `bash <script>` 调用。`task-brief` 只匹配**英文** `Task N` 标题，本计划用中文标题（`## 任务 N：`）→ 必须用下方等价 awk 自取简报；`review-package` 内部会直接执行 `sdd-workspace`（非可执行 → 失败）→ **必须显式传第 4 个参数 OUTFILE**。

**目标：** 交付 **M5**——输入框旁「AI 优化」按钮（`conversation.input.left`, order 11）：草稿润色 + 一键完善 + 存入词库 + 「原文 ↔ 优化稿」双向切换；全程只用官方插槽与官方动作面，零 DOM 注入、零新增依赖。

**架构：** 客户端在 P4 的 2 个座位上追加第 3 个座位（同 `conversation.input.left`，order 11）。组件只做编排：读草稿走 `useInput`、写草稿走 `inputActions.setDraft`、其余全部走 P3 已交付的 host 路由（`POST /ai/polish`、`POST /ai/refine`、`POST /prompts`、`PUT /prompts/:id`（`aiWriteBack`）、`POST /prompts/:id/rollback`、`GET /ai/providers`）。可测的纯逻辑（`keepVariables` 判定、完善结果 → 建库入参、写回判定、切换可用性、错误 → 文案键、信封/超时错误分类）一律抽进不依赖 React 的模块，用 `node --test` 做真 TDD。

**技术栈：** React 18（经宿主模块加载器 `require`，**external 不打包**）、`@deepseek-ai/dsh-client-ui-slots`（插槽）、`@deepseek-ai/dsh-client-locale`（i18n）、`@deepseek-ai/dsh-client-ui-conversation/client`（`InputState` / `InputActions`）、esbuild（沿用 P1 契约）、`node --test`。

**规格：** `docs/superpowers/specs/2026-09-24-dsh-prompt-enhancer-design.md`（权威）。执行前必读 §2.1-4/5、§4.4（写回与回滚语义）、§5（路由与信封）、§6.1–6.4（AI 能力与失败面）、§7.1/§7.2/§7.3/§7.4、§9.3 验收 5/6/13、§13.6（设置服务）。

---

## 全局约束

1. 路径一律项目根相对 + 正斜杠；命令默认 CWD = 项目根；宿主侧路径用 `$DSH_HOME` 表达。
2. **零 DOM 注入**：只用官方插槽；不得改宿主 DOM、不得 `MutationObserver`；**不得**加任何键盘监听（用户 2026-09-24 裁定 D2）。只读式 `document` 监听（`pointerdown` 点外面关）是 P4 已批准的既有例外，可沿用、不得扩大。
3. `react` / `react/jsx-runtime` / `@deepseek-ai/*` 一律 external（P1 契约），运行时经 factory 的 `require` 解析。
4. `src/` 内相对导入写显式 `.ts`；`src/**` 必须可擦除 TS（**不得用参数属性/枚举/命名空间**）；测试直接 `import` `.ts` 源码。
5. 客户端 bundle 注册的模块 id 必须等于包名（由 `package.json.name` 派生）——不得硬编码。
6. **不引入任何新依赖**（尤其不引 `@deepseek-ai/dsh-client-ui-primitives`：P4 用内联样式 + 原生 `button` 已跑通，P5 沿用）；不新增 `dsh.client.inject` 项；不注册 systemPrompt section。
7. 每个任务结束：`typecheck` / `test` / `build` / `smoke` 四项全绿。
8. 只修改本计划列出的文件。Shell 为 macOS（bash）。
9. **客户端改动需连同 `lib/` 产物一起提交**（P1 起 `lib/` 受版本控制）；提交用 `npm run build`（production）。
10. **不要重跑 `npm run link-dsh-deps`**（悬空链接会打断 `tsc`，见 P4 全局约束 10）。
11. 错误面：任何 `catch` 都要有可见后果（面板内文案 + `console.warn`），**不得空 catch**。
12. AI 调用不得让 UI 卡死：按钮在调用期禁用并显示状态；`fetch` 带 `AbortSignal.timeout`。

---

## 已核实的宿主契约（2026-09-24 实测：源码逐字核对 + 活体探针）

> 本节是地基。P4 的教训：插槽与触发管线的描述曾与宿主实际不符（`#` 触发、`overlay` 座位）。P5 涉及的三项契约**已逐条核对**，下面每条都给出可复核的证据位置。

### 1. 座位：`conversation.input.left`（list / session），追加 order 11

- 宿主声明：`packages/client/ui-conversation/src/client/contract/slots.ts:172` → `'conversation.input.left': { kind: 'list'; scope: 'session' }`；同层 `:168` 为 P4 已用的 `conversation.input.overlay`。
- `kind: 'list'` ⇒ 允许同一座位多个占用者；排序由 `ui-slots/src/index.ts:903-906` 决定：先比 `priority`（默认 0）、再比显式 `order`（升序）。故 order **10（词库）→ 11（AI 优化）** 与规格 §7.1 一致。
- 注册形态照 P4 既有写法（`src/client/index.ts:35-48`）：`scope.slots.inject("<slot>", () => scope.slots.register({ name, id, order, locale: NS }, Component))`。
- 本计划注册的 id / order **逐字**：`{ name: "conversation.input.left", id: "prompt-enhancer-ai-polish", order: 11, locale: NS }`（规格 §7.1）。
- `PropsRuntime<"conversation.input.left">` 已内含 session 标准 props（`useInput` / `inputActions` / `useConversation`），**不要**再手写。

### 2. `/ai/polish` 与 `/ai/refine`：请求与响应形状（活体探针实测）

实现位置 `src/host/routes.ts:230-252`；**以下为 2026-09-24 对 127.0.0.1:3080 的真实调用原始返回**：

| 调用 | 请求体 | 实测响应（原文） | HTTP / 耗时 |
| --- | --- | --- | --- |
| `POST /api/prompt-enhancer/ai/polish` | `{"body":"帮我写一段周报，总结本周进展与风险","withSummary":false,"keepVariables":false}` | `{"ok":true,"data":{"polished":"请帮我写一段周报，总结本周进展与风险。内容包括：本周主要工作进展、当前存在的风险或问题。要求语言简洁、条理清晰，便于直接使用。"}}` | 200 / **4.83s** |
| `POST /api/prompt-enhancer/ai/refine` | `{"body":"帮我写一段周报，总结本周进展与风险"}` | `{"ok":true,"data":{"title":"周报进展与风险总结提示词","tags":["周报写作"],"summary":"用于让 AI …","body":"请帮我写一段{{周报类型}}…（含 6 个 {{变量}}）"}}` | 200 / **4.43s** |
| `POST /api/prompt-enhancer/prompts/<种子id>/rollback` | 无 | `{"ok":false,"error":"该提示词没有可回退的原文（sourceBody 为空）"}` | **400** |

**形状（写代码时逐字遵守）：**

| 路由 | 请求 | 成功 `data` | 失败 |
| --- | --- | --- | --- |
| `POST /ai/polish` | `{ body: string, keepVariables?: boolean, withSummary?: boolean }`；`body` 空/非字符串 → 400「缺少 body」 | `withSummary !== true` → `{ polished: string }`；`withSummary === true` → `{ polished: string, summary?: string }`（`summary` 可缺失） | 503「AI 不可用或调用失败（请检查模型设置）」 |
| `POST /ai/refine` | `{ body: string }` | `{ title: string, tags: string[], summary: string, body: string }`；`tags` 由 host 截断为**最多 1 个**（`refine.ts:40`）；`body` **可能含新生成的 `{{变量}}`**（探针实测就有） | 503 同上（含 JSON 解析失败） |
| `GET /ai/providers` | 无 | `Array<{ provider, name, models: Array<{ id, name }> }>`（本机 3 provider / 10 模型） | —— |

**⚠️ 耗时不是常数（必须按最坏值设计）：** P3 记录的一次实测为 **32s**——首候选 `commandcode/deepseek/deepseek-v4.1-flash` 在 ~11s 处 `collect abort error`，自动回退 `modelscope/deepseek-ai/DeepSeek-V4-Pro-0813` 后成功（证据：`$DSH_HOME/prompt-enhancer/log/ai-2026-09-24.log` 的 `fallback try → collect abort → fallback use` 序列；P3 计划 `:298`）。本次探针 **4.8s / 4.4s**（首候选即成功）。宿主侧是**每候选 30s 超时的串行重试**（`ai.ts:51` `AI_TIMEOUT_MS=30_000` + `collectTextWithFallback` 轮询 `ai.ts:322-342`），候选数 = provider 数（`resolveCandidates` `ai.ts:149-187`）。
⇒ **前端放弃时间 ≥120s**（`AI_TIMEOUT_MS = 120_000`），且**必须**有「正在调用」状态提示；不得用本次探针的 4.8s 当设计依据。

### 3. 写回与回滚语义（「原文 ↔ 优化稿」的整条契约）

- `POST /prompts` → `data = { prompt: Prompt, evicted: string[] }`（`routes.ts:118-131`）。**注意是双层信封**：`prompt` 在 `data` 里；`evicted` 是超出 `maxPromptCount` 被淘汰的 id 列表（`store.ts:782-795`，淘汰优先级 `aiRefined=0` 且 `lastUsedAt` 最旧者）。新建的 `Prompt` `sourceBody` 为 **undefined**（`store.ts:445-458` 的 `createPrompt` 根本不设该字段）。
- `PUT /prompts/:id` 的 `body.aiWriteBack === true` 才回填原文（`routes.ts:154` → `store.ts:487-491`）：
  - 仅当 `patch.body !== existing.body` **且** `existing.sourceBody` 为空时：`next.sourceBody = existing.body`（AI 优化前原文）、`next.aiRefined = true`、`next.aiRefinedAt = Date.now()`。
  - ⇒ **① 只有「正文真的变了」才回填；完善稿与原文相同时 `sourceBody` 仍为空。② 已有 `sourceBody` 时再写回不改写原文（原文一旦确定就稳定）。**
- `POST /prompts/:id/rollback` → `swap(body, sourceBody)` 并刷新 `updatedAt`（`store.ts:551-561`）；`sourceBody` 为空 → **400**「该提示词没有可回退的原文（sourceBody 为空）」（探针已实测）；id 不存在 → 404。可反复调用即在两版之间来回切。`aiRefined` / `aiRefinedAt` 在切换时**不变**。
- 路由层接收的 PUT 字段**只有** `title / body / tags / summary / skillName / skillExportedAt` + `aiWriteBack`（`routes.ts:141-153`）——`sourceBody` / `aiRefined` **不能**由客户端直接写（这是 §4.4 的单一写回缝，别绕过）。
- `PluginSettings` 里与本计划相关的两个键：`showAIPolishButton`（默认 true）、`aiPolishButtonIconOnly`（默认 true）（`src/types.ts:78-79`）。P4 的设置语义 = **mount 时读一次**；「即时生效」归 P8。

### 4. 宿主能力边界（决定 UI 只能怎么做）

- `InputState` 只有 `draft` / `draftRev` / `phase` / `occurrences` / `queue` / `attachmentIds`——**无 caret**；`InputActions` 只有 `setDraft` / `submit` / `addAttachments` / `removeAttachment` / `pruneAttachments`——**无 focus、无 toast**（P4 已核实 `input.d.ts:219-236`、`slots.d.ts:243-251`）。
  ⇒ 「应用到输入框」只能用 `setDraft`（实测它会令宿主编辑器重新取焦，M4 验收第 10 行）；错误提示只能**自渲染面板内文案** + `console.warn`。
- 弹窗 Cancel 后焦点不归还（P4 验收第 15 行 FAIL，用户 2026-09-24 裁定接受）。**P5 不得用 DOM `focus()` 绕过**（违反 §7.3）——见 TBD-P5-8。

---

## 设计决策

| # | 决策 | 理由 |
| --- | --- | --- |
| **D-P5-1** | `AIPolishButton` 注册在同一座位 `conversation.input.left`，order 11，id `prompt-enhancer-ai-polish` | 规格 §7.1 逐字指定；`kind: list` 允许并列 |
| **D-P5-2** | 润色结果面板 = **原文/优化稿对比切换 + 可编辑优化稿 + 复制 + 关闭 + 应用到输入框**（移植上游 `AIPolishButton.tsx` 的成熟 UX，去掉其 `@deepseek-ai/dsh-client-ui-primitives` 依赖） | 上游该组件 318 行、交互已验证；只需换掉 Button 与主题 token 写法 |
| **D-P5-3** | 润色**不**请求摘要（`withSummary: false`，实测返回 `{polished}`） | 摘要只有落到词库才有意义，而落库路径由「一键完善」产出 summary；省一次 LLM 调用（上游同款） |
| **D-P5-4** | `keepVariables` = **草稿含 `{{变量}}` 时为 true，否则 false** | 含变量时必须让 AI 原样保留（否则静默毁掉模板）；不含变量时传 true 会诱导模型**凭空添加**变量（上游因此常量 false）。按草稿判定两头都躲开 |
| **D-P5-5** | 「原文」= **点击 AI 按钮那一刻的草稿快照**；「应用到输入框」覆盖**当前**草稿 | 与上游一致；调用期间用户可能继续打字，用快照才能对比（代价：用户可能没意识到草稿已变，可撤销） |
| **D-P5-6** | 超时 = `AbortSignal.timeout(120_000)`，**只做前端放弃，不做真正中断** | 宿主侧 `collectText` 按候选 30s 串行，120s 是 P3 记录给出的下限；宿主调用无法取消，前端只能停止等待 |
| **D-P5-7** | 「AI 不可用」探测 = **首次点击时 `GET /ai/providers`**，结果缓存在组件 ref；为空则不调 AI，直接出面内提示；另外把 503 也映射成同一文案 | mount 时探测会给每个 composer 加一次无谓请求；验收 13 的语义是「点了才知道不可用」而不是「按钮消失」 |
| **D-P5-8** | 顺手项与焦点限制**只落文档/测试，不动宿主能力** | 用户 2026-09-24 已裁定接受焦点限制；P5 不得为它引入 DOM `focus()` |
| **D-P5-9** | 组件内状态机 = `idle / polishing / polished / refining / refined / saving / saved`，一个文件内自带面板 | 与 P4 `PromptLibraryButton` 同款（自渲染面板、不引依赖、不放模块级 store——P6 的管理面板才需要共享 store） |

---

## 待用户拍板（TBD，执行前必须回填）

| # | 事项 | 我的建议 | 备选 | 选错的代价 |
| --- | --- | --- | --- | --- |
| **TBD-P5-1** | 「一键完善」的落点：composer AI 按钮的第二动作 / 词库列表行 per-row 动作 / 推到 P6 | **composer 第二动作**（P5 自带闭环，不动 P4 已完成组件） | 词库列表行（更贴上游，但要改 P4 的 `PromptLibraryButton`，扩大已完成面的改动半径） | 选错＝验收 6 的入口体验别扭，返工集中在 1 个组件内 |
| **TBD-P5-2** | 「存入词库」的写回契约：两步（`POST /prompts` 存**原文** → `PUT {body: 完善稿, aiWriteBack:true}`）/ 给 `POST /prompts` 加 `sourceBody` 字段（改 host 路由 + store 输入类型 + 测试） | **两步、零宿主改动**——它正是 §4.4 定义的唯一写回缝（`store.ts:487-491`），不新增契约 | 加字段：单次调用无中间态，但把「原文回填」规则复制到路由层，且 P5 从 client 里程碑扩成 host 改动 | 两步的唯一代价是「创建成功、写回失败」的中间态——计划要求把它显式显示出来（任务 3 步骤 3），不是静默 |
| **TBD-P5-3** | 「原文 ↔ 优化稿」切换 UI 落点：只在 AI 结果面板内 / 同时给词库列表行加徽标 | **只在结果面板内**（P6 有管理面板与详情页后再搬过去并按 §4.4 加徽标，那时不会重复造） | 现在也改 P4 列表行：提前给列表加 AI 语义，但 P6 很可能推倒重来 | 选错＝切换入口位置被挪动一次，纯 UI 返工 |
| **TBD-P5-4** | 「存入词库」是否只对**一键完善**结果开放（润色结果只给 应用/复制） | **只对完善开放**：完善结果自带 title/tags/summary（探针实测），落库记录完整；润色结果没有这三样，强行落库只能自动截标题（质量差） | 两条路都开放（需在面板加标题输入框或自动截首行） | 选错＝落库记录质量不同，可在 P6 补输入框 |
| **TBD-P5-5** | `keepVariables` 语义（D-P5-4 的确认） | **按草稿判定**（含 `{{}}` → true；否则 false） | 常量 false（上游）/ 常量 true（更保守但可能凭空加变量） | 选错＝润色会毁掉模板变量或凭空加变量，用户能立刻看到并撤销 |
| **TBD-P5-6** | 前端超时值 | **120_000ms**（P3 实测 32s 的下限推导：候选数 × 30s） | 180s / 300s（更接近「宿主最终会成功」但用户盯着转圈更久）；或 <120s（会误报失败） | 选错＝超时误报或等待过久，1 个常量 |
| **TBD-P5-7** | 图标形态：内联 SVG 星星 + `aiPolishButtonIconOnly` 控制是否附文字 / 纯文字按钮（与 P4 的「Library」文字按钮一致） | **内联 SVG + 按设置**（该设置键已存在，P5 是它唯一的消费者；纯文字会让 `aiPolishButtonIconOnly` 永久闲置） | 纯文字（更简单，但设置键闲置 → 与 P4 的 `hashTriggerEnabled` 闲置同类问题） | 选错＝按钮外观返工，且要决定设置键归属 |
| **TBD-P5-8** | P4 遗留的「弹窗 Cancel 后焦点不归还」是否在 P5 处理 | **不处理**（用户 2026-09-24 已裁定接受；宿主 `InputActions` / session 标准 props 无 focus 面，唯一绕过手段违反 §7.3）→ P5 只把它写进 §13.8 记录并留 P6 | 在 P5 推动宿主暴露 composer focus 面（改宿主，超出本仓库范围，需单独授权） | 选错＝要么违反零 DOM 注入，要么白做一轮 |
| **TBD-P5-9** | 顺手项范围（P4 交接 4 项）：smoke 插槽断言行为化、`api.ts` + `promptSummary` 单测、`parseMemory` 下移、notice 同文案重计时 | **全部纳入**（任务 2/4），并额外加 `tests/i18n.test.mjs`（zh/en 键集相等）；`API_PREFIX` 去重列为**可选**子步 | 只做 P4 明确点名的 4 项、其余留 P6 | 选错＝P6 还要再动一遍同一批文件（返工小但重复） |
| **TBD-P5-10** | 分支策略：沿用 P4 的做法**直接在当前 `main` 上实施**（无 worktree） | 沿用 main（P2/P3/P4 均如此；插件单仓、单人） | 建 `p5-ai-polish` 分支或 worktree | 选错＝SDD 要求「在 main 上动工需对方显式同意」，此处即取得该同意 |

---

## 文件结构

| 文件 | 处置 | 职责 |
| --- | --- | --- |
| `src/client/utils/api.ts` | 改写 | 追加 `ApiError`（带 `status`）、`AI_TIMEOUT_MS`、`polishPrompt` / `refinePrompt` / `listAiProviders` / `createPrompt` / `updatePrompt` / `rollbackPrompt`；`call()` 支持超时 signal |
| `src/client/utils/ai-flow.ts` | 新写（纯逻辑） | `keepVariablesFor` / `libraryCreateInput` / `needsWriteBack` / `canToggle` / `aiErrorKey` |
| `src/client/components/AIPolishButton.tsx` | 新写 | 按钮 + 结果面板（润色 / 完善 / 存入词库 / 双向切换） |
| `src/client/index.ts` | 改写 | 追加第 3 个座位注册（order 11） |
| `src/client/utils/i18n.ts` | 改写 | 追加 P5 键（zh/en 键集必须相等） |
| `src/client/utils/template.ts` | 改写 | 接收从组件下移的 `parseMemory`（可单测） |
| `src/client/components/TemplateVariablesDialog.tsx` | 改写 | 删本地 `parseMemory`，改从 `template.ts` 导入 |
| `src/client/components/PromptLibraryButton.tsx` | 改写 | notice 状态改 `{ text, seq }` 令同文案重新计时 |
| `tests/api.test.mjs` | 新写 | `api.ts` 信封 / 错误 / 超时 signal / 各路由解包（打桩 `globalThis.fetch`） |
| `tests/ai-flow.test.mjs` | 新写 | 上述纯逻辑全分支（TDD） |
| `tests/i18n.test.mjs` | 新写 | zh/en 键集相等 + 无空值 |
| `tests/insert.test.mjs` | 改写 | 补 `promptSummary` 用例 |
| `tests/template.test.mjs` | 改写 | 补 `parseMemory` 用例 |
| `tests/hash-token.test.mjs` | 改写 | 补 `replaceHashToken` 无令牌分支 |
| `scripts/smoke.mjs` | 改写 | **行为化**插槽断言（执行 factory → 假 ctx → 断言 3 次 register 的 name/id/order + i18n 注册 + inject 数组），替换掉正则文本扫描 |
| `docs/superpowers/plans/2026-09-24-p5-m5-acceptance.md` | 新写（任务 5） | M5 活 GUI 验收记录（与任务 5 验收表逐行对齐） |

**不在本计划内：** 管理面板/标签/回收站/导入导出与**编辑详情页的**原文-优化稿并排视图（P6）、技能导出（P7）、上下文推荐/设置页/即时生效（P8）、`selectionAddEnabled` 的选中文字捕获（P6）、草稿存为提示词的**管理面板入口**（P6 复用本计划的 `api.createPrompt` 与写回序列）。

---

## 任务 1：客户端无 React 可测层——`api.ts` 扩展 + `ai-flow.ts` 纯逻辑（TDD）

**文件：**
- 新建：`src/client/utils/ai-flow.ts`、`tests/ai-flow.test.mjs`、`tests/api.test.mjs`
- 改写：`src/client/utils/api.ts`、`tests/insert.test.mjs`

**接口：**
- 依赖输入：`src/types.ts`（`Prompt` / `PluginSettings` / `clampTitle` / `TITLE_MAX_LEN`）、既有 `api` 的 `listPrompts` / `recordUsage` / `getSettings` / `getMeta` / `setMeta`
- 对外产出（**逐字**）：

```ts
// src/client/utils/api.ts
export const AI_TIMEOUT_MS = 120_000;
export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
export interface AiSelectable { provider: string; name: string; models: Array<{ id: string; name: string }> }
export interface AiRefineResult { title: string; tags: string[]; summary: string; body: string }

// api 对象追加（P4 已有的 5 个不动）：
createPrompt: (input: { title: string; body: string; tags?: string[]; summary?: string }) =>
  call<{ prompt: Prompt; evicted: string[] }>("POST", "/prompts", input),
updatePrompt: (id: string, patch: Record<string, unknown>) =>
  call<Prompt>("PUT", "/prompts/" + encodeURIComponent(id), patch),
rollbackPrompt: (id: string) => call<Prompt>("POST", "/prompts/" + encodeURIComponent(id) + "/rollback"),
listAiProviders: () => call<AiSelectable[]>("GET", "/ai/providers"),
polishPrompt: (body: string, opts: { keepVariables?: boolean } = {}) =>
  call<{ polished: string; summary?: string }>(
    "POST", "/ai/polish",
    { body, keepVariables: opts.keepVariables !== false, withSummary: false },
    AI_TIMEOUT_MS,
  ),
refinePrompt: (body: string) => call<AiRefineResult>("POST", "/ai/refine", { body }, AI_TIMEOUT_MS),

// src/client/utils/ai-flow.ts
export function keepVariablesFor(draft: string): boolean;                              // 草稿含 {{变量}} → true
export function libraryCreateInput(refined: AiRefineResult, originalDraft: string): {
  title: string; body: string; tags: string[]; summary: string;
};                                                                                    // body 用**原文**；title 走 clampTitle，空则原文首行
export function needsWriteBack(refinedBody: string, originalDraft: string): boolean;   // 完善稿 !== 原文
export function canToggle(current: Pick<Prompt, "sourceBody">): boolean;               // sourceBody 非空
export function aiErrorKey(err: unknown): "ai.timeout" | "ai.unavailable" | "ai.fail";
```

- [ ] **步骤 1：先写失败的测试** `tests/ai-flow.test.mjs`

必须覆盖（每条都对应一个真实分支，不得写断言为空的用例）：

| 用例 | 断言要点 |
| --- | --- |
| `keepVariablesFor` | `"请用 {{主题}} 写"` → true；`"普通文本"` → false；`"{{}}"` → **false**（空变量名不是变量）；`"{{   }}"` → false（与 `parseVariables` 既有口径一致） |
| `libraryCreateInput` | `body === 原文草稿`（**不是**完善稿）；`title` 超过 `TITLE_MAX_LEN`(25) 被截断；AI title 为空串 → 取原文首行（第一个换行之前）再截断；`tags` 最多 1 个；`summary` 透传 |
| `needsWriteBack` | 不同 → true；**完全相同 → false**（这是 `store.ts:487-491` 的边界，必须有用例） |
| `canToggle` | `{sourceBody:"x"}` → true；`{}` → false；`{sourceBody:""}` → false |
| `aiErrorKey` | `new ApiError("AI 不可用或调用失败（请检查模型设置）", 503)` → `"ai.unavailable"`；`new DOMException("x","TimeoutError")` → `"ai.timeout"`；`new ApiError("该提示词没有可回退的原文（sourceBody 为空）", 400)` → `"ai.fail"` |

- [ ] **步骤 2：写失败的测试** `tests/api.test.mjs`（打桩 `globalThis.fetch`，测后复原）

| 用例 | 断言要点 |
| --- | --- |
| 信封失败 | `fetch` 返回 `{ok:false,error:"提示词不存在"}`（无 `data`）→ 抛 `ApiError`，`message` = 服务端文案、`status` = 404 |
| 非 JSON 响应 | `fetch` 返回 HTML 文本 → 抛可读错误且 message 含 HTTP 状态 |
| `polishPrompt` | 断言实际请求 `body` 为 `{body, keepVariables, withSummary:false}`，且 `init.signal` 是 `AbortSignal`（`signal.aborted === false`）；返回 `{polished}` 解包正确 |
| `refinePrompt` | 返回 `{title,tags,summary,body}` 原样透传 |
| `createPrompt` | 返回 `{prompt, evicted}` 且 `evicted` 未丢失 |
| `rollbackPrompt` 400 | 抛 `ApiError` 且 message 含「没有可回退的原文」 |
| `listAiProviders` | 数组透传 |

**禁止**伪造真实超时（120s 不可等）：超时路径由 `aiErrorKey` 的 `DOMException("TimeoutError")` 用例覆盖，并在用例注释里写明这一点。

- [ ] **步骤 3：运行并确认失败**：`node --test tests/ai-flow.test.mjs tests/api.test.mjs` → FAIL（模块不存在）
- [ ] **步骤 4：写最小实现**（`api.ts` / `ai-flow.ts`）
  - `call()` 第 4 参 `timeoutMs`：`signal: timeoutMs === undefined ? undefined : AbortSignal.timeout(timeoutMs)`；解析失败与信封失败都抛 `ApiError`（带 `res.status`）。
  - `ai-flow.ts` **不得 import `api.ts` 的运行期值**（只 `import type`），以免把 fetch 依赖带进纯逻辑。
  - 硬约束 10：`ApiError` 的 `status` 必须写成**字段声明 + 构造器内赋值**，不得用参数属性（`erasableSyntaxOnly` 会拦）。
- [ ] **步骤 5：补 `promptSummary` 用例**（`tests/insert.test.mjs`）：有 `summary` 时优先并去换行；无 `summary` 时取正文并把连续空白压成单空格；超过 `max` 时截断并补 `…`；空正文 → 空串。
- [ ] **步骤 6：全绿 + 提交**

```bash
npm run typecheck && npm test && npm run build && npm run smoke
git add src/client/utils/api.ts src/client/utils/ai-flow.ts tests/api.test.mjs tests/ai-flow.test.mjs tests/insert.test.mjs lib
git commit -m "feat(client): add AI http routes, typed api errors and ai-flow pure logic"
```

**验收映射：** 无（本任务只交付可测层）。

---

## 任务 2：`AIPolishButton` 润色主线 + 第 3 座位 + smoke 行为化断言

**文件：**
- 新建：`src/client/components/AIPolishButton.tsx`
- 改写：`src/client/index.ts`、`src/client/utils/i18n.ts`、`scripts/smoke.mjs`

**接口：**
- 依赖输入：任务 1 的 `api` / `AI_TIMEOUT_MS` / `ApiError` / `keepVariablesFor` / `aiErrorKey`；P4 的 `TOKEN` / `overlayBase`（`utils/theme.ts`）
- 对外产出：`export function AIPolishButton(props: PropsRuntime<"conversation.input.left"> & PropsLocale<"prompt-enhancer">): React.ReactElement | null`

**i18n 键（zh 写全，en 同键集——`Record<keyof typeof zh, string>` 会拦住漏译）：**

| 键 | zh | 用途 |
| --- | --- | --- |
| `ai.button` | AI 优化 | 按钮文字 / aria-label |
| `ai.tip` | 用 AI 优化当前输入框内容 | title |
| `ai.empty` | 输入框为空，先写点内容 | 空草稿提示 |
| `ai.unavailable` | AI 不可用：未配置可用模型 | 验收 13 |
| `ai.polishing` | 正在调用 AI…（最长约 2 分钟） | 「正在调用」状态 |
| `ai.result` | AI 优化结果 | 面板标题 |
| `ai.original` / `ai.polished` | 原文 / 优化稿 | 对比切换 |
| `ai.apply` / `ai.copy` / `ai.copied` / `ai.close` | 应用到输入框 / 复制 / 已复制 / 关闭 | 面板动作 |
| `ai.fail` / `ai.timeout` | AI 调用失败 / AI 调用超时（>120s），请稍后重试 | 失败面 |

- [ ] **步骤 1：写组件**（要求逐条落到代码）

| 要求 | 实现要点 |
| --- | --- |
| 设置门 | mount 时 `api.getSettings()` 读一次（P4 同款）；`showAIPolishButton === false` → 返回 `null`；读取失败按 `DEFAULT_SETTINGS` 显示但 `console.warn` |
| 图标 | 内联 `svg` 四角星（`aria-hidden`，不引依赖）；`aiPolishButtonIconOnly === false` 时在图标旁显示 `t("ai.button")`；`title` = `t("ai.tip")`、`aria-label` = `t("ai.button")` |
| 可用性探测（D-P5-7） | 首次点击：若尚未探测则 `api.listAiProviders()`，为空数组 → 显示 `t("ai.unavailable")` 且**不**调 AI；探测结果缓存进 `useRef`（组件重挂载才重探） |
| 空草稿 | `draft.trim() === ""` 时按钮 `disabled` + `title` = `t("ai.empty")` |
| 调用 | `setOriginal(draft)`（快照，D-P5-5）→ 进入 `polishing` → `api.polishPrompt(draft, { keepVariables: keepVariablesFor(draft) })` → 成功转 `polished`；失败按 `aiErrorKey` 出面内文案并 `console.warn` |
| 「正在调用」态 | 调用期按钮 `disabled`、`aria-busy="true"`、提示为 `t("ai.polishing")`；面板内也显示同一行（用户可能已把鼠标移开） |
| 结果面板 | `polished` 态渲染：标题 `t("ai.result")`；原文/优化稿两个 pill 切换（`showOriginal`）；`textarea` 展示当前版本（原文只读、优化稿可编辑）；动作：复制（`navigator.clipboard.writeText`，失败只 `console.warn` 不崩）、关闭、`t("ai.apply")` → `inputActions.setDraft(polished)` 后关闭 |
| 面板落点 | 与 P4 词库面板同款：`position:absolute; bottom:calc(100% + 6px); left:0; zIndex:31`，容器自带 `overlayBase` |
| 点外面关 | 与 P4 一致用 `document` 捕获阶段 `pointerdown`（**只读监听**，已批准的既有例外）——不得再加任何键盘监听 |
| 无障碍 | `role="dialog"` + `aria-label`；状态行 `role="status" aria-live="polite"` |

- [ ] **步骤 2：`src/client/index.ts` 追加注册**（放在词库按钮注册**之后**，保持产物内注册顺序 = name/id/order 账本顺序）

```ts
scope.slots.inject("conversation.input.left", () =>
  scope.slots.register(
    { name: "conversation.input.left", id: "prompt-enhancer-ai-polish", order: 11, locale: NS },
    AIPolishButton,
  ),
);
```

- [ ] **步骤 3：`scripts/smoke.mjs` 改为行为化断言**（P4 交接项；替换第 46-62 行的两段正则）

做法：`captured.factory(fakeRequire)` 得到 `exported` 后，用**假 ctx** 真跑 `apply()` 并记录调用：

```js
const records = [];
const makeScope = () => ({
  slots: {
    inject: (name, cb) => { records.push(["inject", name]); cb(); },
    register: (opts, comp) => { records.push(["register", opts, comp]); },
  },
  locale: { register: (ns, dicts) => { records.push(["locale", ns, dicts]); } },
});
const fakeCtx = {
  effect: (fn) => { const dispose = fn(); return typeof dispose === "function" ? dispose : () => {}; },
  inject: (deps, cb) => { records.push(["injectDeps", deps]); cb(makeScope()); },
};
try { exported.apply(fakeCtx); } catch (e) { fail("apply(fakeCtx) 抛错：" + String(e)); }
```

断言（全部是**行为**断言，不再依赖源码文本形状）：
1. `register` 恰好 **3** 条，且 `[opts.name, opts.id, opts.order]` 按注册顺序 deep-equal：`[["conversation.input.left","prompt-enhancer",10],["conversation.input.overlay","prompt-enhancer-hash",20],["conversation.input.left","prompt-enhancer-ai-polish",11]]`
2. 每条 `register` 的组件是 `function`；每条都带 `locale === "prompt-enhancer"`。
3. 每条 `register` 的 `opts.name` 都出现在某条 `inject` 记录里（接线成对）。
4. `locale` 注册恰好 1 条：ns = `"prompt-enhancer"`，两份字典键集**相等且非空**。
5. deep-equal `exported.inject` = `["slots","locale"]`（硬约束 6「不新增 inject 项」的可执行证据）。
6. 保留既有：`__ModuleLoader__.load` / id === 包名 / `module.exports = { apply, inject }` / `.build-meta.json` / `cordis.patch.yml`。

**变异验证（必须做，AGENTS.md 要求）：** 临时把 `index.ts` 第 3 个座位的 `order: 11` 改成 `12` → smoke 必须 FAIL；再临时删掉该座位的 `locale: NS` → smoke 必须 FAIL；两项复原后再跑一次确认 PASS。

- [ ] **步骤 4：全绿 + 提交**

```bash
npm run typecheck && npm test && npm run build && npm run smoke
git add src/client/components/AIPolishButton.tsx src/client/index.ts src/client/utils/i18n.ts scripts/smoke.mjs lib
git commit -m "feat(client): AI polish button with result panel and behavior-based slot smoke checks"
```

**验收映射：** 验收 5 的前半（`/ai/polish` 返回 → 结果面板显示原文/优化稿 → 「应用到输入框」）、验收 13（AI 不可用提示）。

---

## 任务 3：一键完善 + 存入词库 + 「原文 ↔ 优化稿」双向切换

> **依赖 TBD-P5-1/2/3/4 的裁定。** 本节按**建议值**编写（composer 第二动作 / 两步写回 / 面板内切换 / 只对完善开放）；裁定不同则本任务的文件与步骤必须同步改写后再分发。

**文件：** 改写 `src/client/components/AIPolishButton.tsx`（同文件、顺序执行）、`src/client/utils/i18n.ts`

**接口：** 依赖任务 1 的 `libraryCreateInput` / `needsWriteBack` / `canToggle`；新增 i18n 键：

| 键 | zh |
| --- | --- |
| `ai.refine` | 一键完善 |
| `ai.refining` | 正在完善… |
| `ai.refined` | 完善稿 |
| `ai.fieldTitle` / `ai.fieldTags` / `ai.fieldSummary` | 标题 / 标签 / 摘要 |
| `ai.save` / `ai.saving` / `ai.saved` | 存入词库 / 正在存入… / 已存入词库 |
| `ai.saveFail` | 存入词库失败 |
| `ai.writeBackFail` | 已存入原文，但优化稿写回失败 |
| `ai.retryWriteBack` | 重试写回 |
| `ai.sameAsOriginal` | 完善稿与原文相同，无需切换 |
| `ai.toggle` | 切换原文 / 优化稿 |
| `ai.showingOriginal` / `ai.showingPolished` | 当前显示：原文 / 当前显示：优化稿 |
| `ai.evicted` | 已存入词库；有旧提示词因超出上限被淘汰 |

- [ ] **步骤 1：完善动作**（同一面板内的第二个按钮，仅在 `polished` / `refined` 态可见）
  `refining` → `api.refinePrompt(original)`（**用快照**，不是当前草稿）→ 成功存 `refined` 并转 `refined`；503/超时按 `aiErrorKey` 出面内文案。`refined` 态额外显示 AI 产出的 标题 / 标签 / 摘要（只读展示，P6 才给编辑面）与可编辑的完善稿 `textarea`。
- [ ] **步骤 2：「应用到输入框」两种语义**：`refined` 态 → `setDraft(refined.body)`（可能含 `{{变量}}` 的模板，交给 P4 既有行为即可，本任务不做变量弹窗）；`polished` 态 → `setDraft(polished)`。
- [ ] **步骤 3：「存入词库」按钮**（仅 `refined` 态）——**严格按此顺序**，每步失败都有可见后果：

```
1. const input = libraryCreateInput(refined, original);   // body = 原文！
2. saving
3. const { prompt, evicted } = await api.createPrompt(input);
   ── 失败：面内显示 t("ai.saveFail") + 原因，回到 refined（库里没有半成品）
4. let record = prompt;
   if (needsWriteBack(refined.body, original)) {
     record = await api.updatePrompt(prompt.id, { body: refined.body, aiWriteBack: true });
     ── 失败：面内显示 t("ai.writeBackFail") + 原因 +「重试写回」按钮；
              此时库里那条的 body 就是原文（不是损坏数据），但**必须明说**，不得假装已存好
   } else {
     ── 完善稿与原文相同：不做写回（store 不会回填 sourceBody），界面提示 t("ai.sameAsOriginal")
   }
5. saved；evicted.length > 0 → 面内显示 t("ai.evicted")（淘汰二次确认归 P6，本任务只做可见性）
```

- [ ] **步骤 4：「原文 ↔ 优化稿」双向切换**（`saved` 态）
  - 仅当 `canToggle(saved)` 为真时渲染 `t("ai.toggle")` 按钮；否则渲染 `t("ai.sameAsOriginal")` 一行。
  - 点击 → `api.rollbackPrompt(saved.id)` → 用返回的 `Prompt` 整条替换 `saved`（`data` 就是 swap 后的记录，含新的 `body` / `sourceBody`）；可**反复**点击来回切（宿主语义 `swap(body, sourceBody)`）。
  - 面板同时显示「当前显示：原文 / 优化稿」与当前 `body` 预览（截断 + `overflowWrap:anywhere`），让用户看见切换真的换了版本。
  - 400（`sourceBody` 为空）或 404（记录已被删）→ 面内显示 `aiErrorKey` 对应文案 + `console.warn`；404 额外提示该提示词已不存在（复用 P4 的 `error.noPrompt` 文案键）。
- [ ] **步骤 5：全绿 + 提交**

```bash
npm run typecheck && npm test && npm run build && npm run smoke
git add src/client/components/AIPolishButton.tsx src/client/utils/i18n.ts lib
git commit -m "feat(client): one-click refine, save-to-library write-back and original/polished toggle"
```

**验收映射：** 验收 6（AI 优化**写回词库后**，「原文 ↔ 优化稿」可双向切换）。

---

## 任务 4：P4 交接的顺手项（批量小修）

> 本任务是一次性批量分发（同构小改、跨几个文件），**不是** 4 个独立任务（SDD「批量处理小型同构工作」）。

**文件：** `src/client/utils/template.ts`、`src/client/components/TemplateVariablesDialog.tsx`、`src/client/components/PromptLibraryButton.tsx`、`tests/template.test.mjs`、`tests/hash-token.test.mjs`、`src/client/utils/api.ts` + `src/host/routes.ts` + `src/types.ts`（可选子步）、新建 `tests/i18n.test.mjs`

- [ ] **步骤 1：`parseMemory` 下移**（`TemplateVariablesDialog.tsx:52-66` → `utils/template.ts` 的 `export function parseMemory(raw: string): Record<string, string>`）
  - 组件改为从 `../utils/template.ts` 导入；行为**逐字不变**（空串 → 空对象；非法 JSON → 空对象 + `console.warn`；非对象/数组 → 空对象；只保留 string 值）。
  - `tests/template.test.mjs` 补用例：`""` → `{}`；`'{"a":"1","b":2,"c":{}}'` → `{a:"1"}`；`"[1,2]"` → `{}`；`"{bad"` → `{}`（并断言 `console.warn` 被调用一次——临时替换 `console.warn` 记录调用，测后复原）。
- [ ] **步骤 2：notice 同文案重新计时**（`PromptLibraryButton.tsx:53/114-121/169-173`）
  - 状态改 `React.useState<{ text: string; seq: number } | null>(null)`；每次触发用 `setNotice((prev) => ({ text, seq: (prev?.seq ?? 0) + 1 }))`；渲染 `notice.text`。effect 依赖 `[notice]` 即可稳定重置 4s 计时器（对象标识每次变化）。
  - 不得改变既有外观与 a11y 属性（`role="status" aria-live="polite"`）。
- [ ] **步骤 3：`replaceHashToken` 无令牌分支补测**（`tests/hash-token.test.mjs`）：`replaceHashToken("没有令牌", "正文")` → 原样返回 `"没有令牌"`。
- [ ] **步骤 4：`tests/i18n.test.mjs`（新）**：断言 `zh` / `en` 键集**相等**、两字典**无空值**、键名形如 `a.b`（dotted）、`NS === "prompt-enhancer"`。这是 P4 编译期类型校验的**运行期**双保险（类型校验拦不住空值）。
- [ ] **步骤 5（可选）：`PREFIX` 去重** —— 把 `"/api/prompt-enhancer"` 提到 `src/types.ts`（`export const API_PREFIX = "/api/prompt-enhancer"`），`src/host/routes.ts` 与 `src/client/utils/api.ts` 改引它，删两处字面量。`types.ts` 已在客户端 bundle 内（`PromptLibraryButton` 引了 `DEFAULT_SETTINGS`），不增体积。若评审认为无必要，本步可整体跳过并在台账记 `minor (deferred)`。
- [ ] **步骤 6：全绿 + 提交**

```bash
npm run typecheck && npm test && npm run build && npm run smoke
git add src/client src/host/routes.ts src/types.ts tests lib
git commit -m "refactor(client): hoist parseMemory, restart notice timer, add i18n and memory tests"
```

**验收映射：** 无（全部是 P4 交接项的收敛）。

---

## 任务 5：活 GUI 验收（M5 验收）+ 记录文件

> 沿用 P1/P3/P4 已验证的通道：**运行时注入热重载本插件**（`dev_reload_package dsh-prompt-enhancer`），不碰 profile、不重启 `dsh web`。
> 既有环境事实（本计划撰写期间实测）：GUI `http://127.0.0.1:3080`；活体插件在跑（`GET /settings` / `GET /ai/providers` / `GET /prompts` 均返回合法信封）；AI 可用（3 provider / 10 模型，polish 4.8s、refine 4.4s）。

- [ ] **步骤 1：构建 + 热重载**：`npm run build` → `dev_reload_package dsh-prompt-enhancer`，确认 before/after 均 `active` 且 `client ✓`；记录宿主下发的 `client.js?rev=…` 并与 `lib/client.js` 比对（P4 口径：允许仅差宿主重写的 `//# sourceMappingURL` 尾行）。
- [ ] **步骤 2：用 Playwright 逐项验收**（对 `http://127.0.0.1:3080`；收尾读 `browser_console_messages`）

| 验收项 | 判定方式（**必须给出数值或原文**，不得只写一句「通过」） |
| --- | --- |
| 输入框旁同时出现词库按钮与 AI 优化按钮（验收 2 的按钮部分） | 快照里两个按钮并存；AI 按钮 `aria-label` = en/zh 的 `ai.button`；读 `title` / `aria-busy` 初始值 |
| 空草稿禁用 | 清空 composer → AI 按钮 `disabled=true`，`title` = `ai.empty` |
| 验收 5 润色全链 | 设草稿（短中文）→ 点按钮 → 断言出现 `role="status"` 的「正在调用」文案且按钮 `disabled` → 等结果面板 → 断言面板含「原文」与「优化稿」两版文本且**二者不同** → 分别点两个 pill 各读一次 textarea 值 → 点「应用到输入框」→ 读回 composer 值等于优化稿。**用 `performance.now()` 记录本次真实耗时** |
| 面板可编辑 | 在优化稿 textarea 改一个字 → 点「应用到输入框」→ 断言 composer 收到**改后**文本 |
| 复制 | 点「复制」→ 断言出现「已复制」提示（剪贴板读取受权限限制时以提示出现为准，并如实注明未读剪贴板） |
| 验收 6 完善 → 存入 → 双向切换 | 用一条**临时**提示词草稿（见「临时数据」）→ 点「一键完善」→ 断言面板出现 AI 标题 / 标签 / 摘要与完善稿 → 点「存入词库」→ 断言「已存入词库」与「切换原文 / 优化稿」出现 → `GET /prompts` 找该条：断言 `sourceBody === 原草稿`、`body === 完善稿`、`aiRefined === true`、`aiRefinedAt > 0` → 点「切换」→ 断言 `body` / `sourceBody` **互换**（读 HTTP 前后值）→ 再点一次 → 断言换回。**两个方向都要有数值证据。** |
| 写回失败面 | 若无法在不污染环境的前提下造出，写 `NOT RUN — 无可注入点 — 归属 P6`，并用**代码读取级**证据（任务 3 步骤 3 的分支）代替 |
| 验收 13 无 LLM 提示 | 用页面内 `fetch` 拦截（`browser_evaluate` 临时替换 `window.fetch`，仅本页有效、刷新即复原）：① `GET /ai/providers` → `{ok:true,data:[]}` → 点 AI 按钮 → 断言出现 `ai.unavailable` 且**未**发出 `/ai/polish` 请求；② `POST /ai/polish` → 503 信封 → 断言面内文案为 `ai.unavailable` 或 `ai.fail`。**同时断言词库按钮仍正常工作**（验收 13 的「其余功能不受影响」） |
| 超时 | 活体只断言「调用中按钮禁用且面板有状态行」；`TimeoutError → ai.timeout` 的映射由任务 1 单测覆盖——记录里必须分列「实测」与「单测覆盖」 |
| 零 console error | `browser_console_messages(level=error)` → Errors 0；刻意触发的 warning 逐条说明 |
| 零 DOM 注入复检 | `grep -rnE "querySelector\|MutationObserver\|appendChild\|keydown" src/client/` → 预期无输出（唯一允许的 `document` 监听是 P4 的 `pointerdown`） |
| 两个面板互不覆盖 | 分别打开词库面板与 AI 面板，读 `getBoundingClientRect()` 与逐级裁剪祖先（P4 验收第 14 行的做法） |

- [ ] **步骤 3：把验收结论写入** `docs/superpowers/plans/2026-09-24-p5-m5-acceptance.md`
  格式照 `2026-09-24-p4-m4-acceptance.md`：与上表**逐行对齐**（同顺序、同项数）；每条给「我做了什么 / 观察到什么」的原文或数值；不能跑的写 `NOT RUN — <原因> — 归属 <里程碑>` 并在「未完整验证」小节汇总；末尾写「临时数据与副作用」（创建/删除的临时提示词、被改动的 `usageCount`、是否发过消息——**本计划不需要发送任何消息**）。
- [ ] **步骤 4：提交**：`git add docs/superpowers/plans/2026-09-24-p5-m5-acceptance.md` → `test(client): record M5 live GUI acceptance`

---

## 完成标准

- 输入框旁出现 AI 优化按钮（`conversation.input.left`，order 11，id `prompt-enhancer-ai-polish`），**词库按钮仍在 order 10**
- 润色：`/ai/polish` 真实调用 → 面板显示原文 / 优化稿 → 可编辑 → 「应用到输入框」；调用期有「正在调用」状态且按钮禁用；前端超时 120s
- 一键完善：`/ai/refine` → 面板显示 AI 标题 / 标签 / 摘要 + 完善稿 → 「存入词库」按 §4.4 走 `create(原文)` + `PUT(body, aiWriteBack)`
- 「原文 ↔ 优化稿」双向切换可用（`POST /prompts/:id/rollback`），可反复切换；`sourceBody` 为空时按钮不出现并给文案
- 无 LLM 时 AI 按钮给出可读提示且不误发请求；其余功能不受影响
- `typecheck` / `test` / `build` / `smoke` 四项全绿；smoke 为**行为化**断言（3 座位 + i18n + inject 数组），并通过至少 2 次变异验证
- 零 DOM 注入、零键盘监听、零新增依赖、零新增 inject 项、systemPrompt section 数仍为 0
- 新增测试文件 `tests/api.test.mjs` / `tests/ai-flow.test.mjs` / `tests/i18n.test.mjs`；扩充 `tests/insert.test.mjs` / `tests/template.test.mjs` / `tests/hash-token.test.mjs`
- 客户端 bundle 仍以 `dsh-prompt-enhancer` 为模块 id；`lib/` 与源码一同提交

## 风险

| # | 风险 | 应对 |
| --- | --- | --- |
| R-P5-1 | AI 调用可能远超 120s（候选数 × 30s 串行）→ 前端先放弃而宿主仍在跑 | 超时文案明说「请稍后重试」；调用期按钮禁用防重复点击；不做真正中断（宿主无取消面）；验收记录里写明最坏值 |
| R-P5-2 | 完善稿与原文相同时 `sourceBody` 不回填 → 切换按钮消失 | `needsWriteBack` + `canToggle` 双判定 + 显式文案 `ai.sameAsOriginal`；单测覆盖 `store.ts:487-491` 的边界 |
| R-P5-3 | 「存入词库」两步之间失败 → 库里留下 body=原文 的记录，界面若宣称「已存入」即欺骗 | 任务 3 步骤 3 的失败分支必须显式区分「已存入原文 / 写回失败」+「重试写回」，不得静默 |
| R-P5-4 | 润色丢变量：AI 把 `{{变量}}` 删掉或改写 | `keepVariablesFor` 按草稿判定 + 单测；面板可编辑 → 用户可自行救回 |
| R-P5-5 | AI 凭空添加 `{{变量}}`（探针实测 refine 会加变量） | 属 §6.3 既定语义（保留并可按需新增）；面板可编辑且落库前用户可见，不视为缺陷；写进验收记录 |
| R-P5-6 | 结果面板与词库面板同时打开互相遮挡 | 两座位同属一个工具行、位置都贴按钮上沿；任务 5 有「互不覆盖」验收项；必要时给 AI 面板更高 `zIndex` |
| R-P5-7 | 无 LLM 环境难以活体验收（本机有模型） | 用页面内 `fetch` 拦截模拟（刷新即复原）；「实测」与「单测覆盖」分列写明 |
| R-P5-8 | smoke 行为化断言会依赖假 ctx 的形状（真实 `slots.inject` 可能需要返回值） | 断言只针对**我们自己发出的调用参数**，不针对宿主行为；P4 已证明该调用形态在真实宿主生效 |
| R-P5-9 | 中间态 / 异常路径在活体上无法注入 | 允许 `NOT RUN` + 代码读取级证据，但必须在验收记录里分列，不得静默缺席 |

## 用户裁定（2026-09-24，用户逐条确认）

用户对 TBD-P5-1..10 **全部采纳建议值**（原话：「1–10 全按建议」）。据此固化，执行期不得再问：

| TBD | 裁定 |
| --- | --- |
| P5-1 | 「一键完善」= composer AI 按钮（`conversation.input.left`，order 11）内的第二动作 |
| P5-2 | 「存入词库」用两步序列：`POST /prompts`（body = 原文）→ `PUT {body: 完善稿, aiWriteBack:true}`；**不改 host 路由** |
| P5-3 | 「原文 ↔ 优化稿」切换只落在 AI 结果面板内；P6 再迁详情页 + 列表徽标 |
| P5-4 | 「存入词库」只对「一键完善」结果开放；润色结果只给 应用 / 复制 |
| P5-5 | `keepVariables` 按草稿判定：含 `{{变量}}` → true，否则 false |
| P5-6 | 前端 AI 超时 `AI_TIMEOUT_MS = 120_000`（只放弃等待，不中断宿主调用） |
| P5-7 | 图标 = 内联 SVG 星星；`aiPolishButtonIconOnly` 控制是否附文字 |
| P5-8 | 弹窗 Cancel 焦点限制 P5 **不改代码**；P5 收尾写入规格 §13.8 并移交 P6 |
| P5-9 | 顺手项全纳（smoke 行为化 / api + promptSummary 单测 / parseMemory 下移 / notice 重计时 / i18n 键集单测）；`API_PREFIX` 去重为可选子步 |
| P5-10 | 直接在当前 `main` 实施（无 worktree），沿用 P2–P4 做法 |

## 交接给后续里程碑

1. **P6 管理面板**：编辑详情页按 §4.4 提供「原文 / 优化稿」并排对比与切换按钮——**直接复用**本计划的 `api.rollbackPrompt` 与 `canToggle`，并把 AI 结果面板里的切换入口迁过去（本计划的入口是 P5 的临时落点，见 TBD-P5-3）。
2. **P6 沉淀入口**：草稿存为提示词、管理面板新建 / 编辑**复用** `api.createPrompt`（注意 `data` 是 `{ prompt, evicted }`）与「`create(原文)` + `PUT(body, aiWriteBack)`」序列；淘汰的**二次确认**（§4.4）归 P6，本计划只做事后可见提示。
3. **P8 设置页**：`showAIPolishButton` / `aiPolishButtonIconOnly` 目前是「mount 时读一次」；设置页需与 `showComposerButton` / `hashTriggerEnabled` **同批**决定即时生效（口径见 P4 验收第 17 行）。
4. **P8**：P4 的「词库」按钮未消费 `composerButtonIconOnly`，本计划的 AI 按钮消费了 `aiPolishButtonIconOnly`——设置页收口时须统一两者语义。
5. **规格追加建议（P5 收尾时落 §13.8）**：① 前端 AI 超时口径 120s 及其由来；② 「原文 ↔ 优化稿」在 P5 由 AI 结果面板承载、P6 迁往详情页；③ 弹窗 Cancel 焦点限制的最终处置（P5 不动代码，沿用用户 2026-09-24 裁定）。

---

## 附录：SDD 执行准备（控制者，不分发给实现者）

```bash
PLAN=docs/superpowers/plans/2026-09-24-p5-ai-polish-and-rollback.md
SKILL="$DSH_HOME/profiles/web/node_modules/@wenaixi/dsh-superpower/skills/superpower-subagent-driven-development/scripts"

# 1) 工作区（自忽略，不进 git status）
WS=$(bash "$SKILL/sdd-workspace" "$PLAN")     # → <repo>/.superpowers/sdd/2026-09-24-p5-ai-polish-and-rollback

# 2) 台账（对话压缩后的恢复地图）
#    首行固定：# SDD ledger — plan: docs/superpowers/plans/2026-09-24-p5-ai-polish-and-rollback.md

# 3) 任务简报：task-brief 只认英文 'Task N'，中文标题必须自取（围栏感知照搬其逻辑）
N=2
awk -v n="$N" '/^```/{f=!f} !f && /^## 任务 [0-9]+/ {intask = ($0 ~ ("^## 任务 " n "([：:]|$)"))} intask{print}' \
  "$PLAN" > "$WS/task-$N-brief.md"
wc -l "$WS/task-$N-brief.md"    # 必须非空，否则抽取逻辑没命中

# 4) 评审包：脚本无执行位 → bash 调用；内部调用 sdd-workspace 会失败 → 必须显式给 OUTFILE
BASE=$(git rev-parse HEAD)      # 分发实现者前记录
# …实现者提交后…
HEAD=$(git rev-parse HEAD)
bash "$SKILL/review-package" "$PLAN" "$BASE" "$HEAD" "$WS/review-$BASE..$HEAD.diff"
```

**分发纪律（SDD）：** 一个实现者一个任务，绝不并行分发多个实现者；每个任务分发前记 `BASE`，评审用 `BASE..HEAD`（**不要**用 `HEAD~1`）；子代理**不分发子代理**；子代理无法向人提问（harness 限制）——简报里必须写明「遇歧义按最强证据自定 + 在报告里显式列假设；若假设会改变验收结果，直接以 NEEDS_CONTEXT 汇报」。**收尾前**把有保留价值的内容（执行记录、裁决、遗留项）落进仓库内的持久文档，再删工作区（工作区不进 git）。



