# dsh-prompt-enhancer · 架构与决策（活文档）

- 更新：2026-10-03 · 对应代码基线 `eb03968` · 版本 `0.1.0`（`package.json`，未发布 npm）
- **定位**：本文件是仓库的**架构事实入口**——把「运行时结构 · 设计决策 · 已知取舍 · 当前能力面」收在一处。任何设计意图与本文冲突时，以**代码**为准（本文标注了出处），代码与 `docs/superpowers/specs/` 冲突时以代码为准并回头订正本文件。
- **权威链**：硬规则看 `AGENTS.md`（它指向本文件）· 设计意图看本文件 · 历史裁决看 `docs/superpowers/specs/`（下文 §编号即它的章节号，该目录已冻结、只作追溯）· 现场证据看 `docs/superpowers/plans/*-acceptance.md`
- 约束（必须遵守）：仓库根 `AGENTS.md`（14 条硬约束）与全局 `~/.dsh/AGENTS.md`

---

## 1. 这是什么

一个 DSH Web 插件：把提示词本身管起来——**管理 → AI 优化 → 沉淀 → 复用**的闭环。基于上游 `master1Sun/dsh-prompt-library` v0.16.0（MIT）移植并重写，剔除人格（SOUL）、插件市场、公告、成就、看板等模块，只保留提示词相关能力。

**能力面**（12 项，均有代码与验收）：词库 CRUD/搜索/排序/标签/使用统计（双入口）· 复用（插入 / 覆盖 / 插入并发送 + `#` 浮层实时筛选）· 模板变量（`{{变量}}` 填充弹窗 + 记住上次填值）· AI 轻度润色 · 增强为模板（标题/标签/摘要/正文、可选补充建议） · 原文↔优化稿回滚 · 沉淀三入口（面板新建/编辑、选中文字、当前草稿）· 标签管理 · 回收站（软删/恢复/永久删/清空）· 导入导出（预览+确认）· 上下文推荐 · 设置页 · 技能导出（单向 + 过期徽标 + 一键重导）

**产品承诺**：`systemPrompt` section 数 **恒为 0**（`src/index.ts:21`）。任何提示词文本都只经用户显式触发的插入进入 composer，绝不注入系统提示词。

**明确不做**（本文 §1 与 `AGENTS.md` 硬约束 2/5）：会话级注入、技能反向导入、活同步引擎、自学习/自动捕获、版本历史表、WebSocket、斜杠命令、插件市场/公告/成就/宠物、自动更新。

---

## 2. 运行时结构

```
DSH web host
├── dsh-prompt-enhancer (host)   src/index.ts（唯一装配点，86 行）
│   ├── export Config = PromptEnhancerSettingsSchema   ← dsh 0.2.0：设置即插件 Config
│   ├── ctx.inject(["llm"])        → registerLlm()     缺失 ⇒ AI 路由 503，其余功能不受影响
│   ├── ctx.inject(["web"])        → 可选的起草搜索
│   ├── ctx.inject(["webServer"]) → 单条 prefix 路由 /api/prompt-enhancer（30 条逻辑路由）
│   ├── ctx.on("loader/volatile-update") → clearRouteCache()（改 provider/model 必须换路由）
│   └── ctx.effect(lifecycle 日志；卸载时解绑设置面)
│   ✗ 无 systemPrompt section   ✗ 无 agent/session 监听   ✗ 无 registerUpgrade（无 WS）
│
└── dsh-prompt-enhancer (client)  src/client/index.ts（218 行，7 个官方插槽）
    ├── conversation.input.left      id=prompt-enhancer              order 10  词库按钮
    ├── conversation.input.overlay   id=prompt-enhancer-hash         order 20  `#` 候选浮层
    ├── conversation.input.left      id=prompt-enhancer-ai-polish    order 11  AI 优化按钮
    ├── conversation.input.dock      id=prompt-enhancer-recommend    order 10  上下文推荐条
    ├── sidebar.footer.action        id=prompt-enhancer              order 100 左侧下方入口
    ├── shell.overlay                id=prompt-enhancer              order 100 弹窗宿主（root，常驻挂载）
    └── settings.section             id=prompt-enhancer              order 30  设置页
    条件注入（inject 导出数组不扩张）：uiWorkspace（目录选择）→ uiConversation（聊天快照）→ configForms（设置真源）
    注册顺序即 scripts/smoke.mjs 的 EXPECTED_SLOTS 账本顺序：挪位即红
```

**构建契约**（`scripts/build.mjs`，esbuild）：产物 `lib/index.js`（Node ESM）与 `lib/client.js`（CJS + banner/footer 包装，注册 `window.__ModuleLoader__.load({ id, factory })`）。三条硬约束：client 模块 id **必须等于包名**（从 `package.json.name` 派生，禁硬编码）· `react` / `react/jsx-runtime` / `@deepseek-ai/*` 一律 external · footer 必须把 `module.exports` 重写为纯净的 `{ apply, inject }`。

---

## 3. 数据与存储

SQLite（`node:sqlite`，Node ≥ 22.19）单文件落 `$DSH_HOME/prompt-enhancer/db/prompts.db`；四张表 `prompts` / `trash` / `tags` / `meta`（`src/host/store.ts:121-160`）。

| 不变量 | 内容 | 出处 |
|---|---|---|
| schema 演进 | `SCHEMA_VERSION = 4` + `MIGRATIONS` 数组，迁移**幂等**。v4 将旧库中的异常计数和时间戳修复到非负安全整数范围，保留条目内容 | `src/types.ts:15`、`src/host/store.ts:76` |
| 存储层解耦 | `store.ts` **不 import 任何宿主能力**（cordis/服务），故可脱离 `dsh` 单测 | 硬约束 12 |
| 测试隔离 | 靠环境变量把 `DSH_HOME` 指向临时目录，**不加 test-only API**；`paths.ts` 全部调用期求值 | 硬约束 13 |
| 回滚语义 | `sourceBody` 存 AI 优化前原文，`POST /prompts/:id/rollback` 执行 **swap(body, sourceBody)**，可反复点 | `store.ts:560-568` |
| 写回缝唯一 | 三 AI 字段（`sourceBody`/`aiRefined`/`aiRefinedAt`）**唯一写入者**是 `updatePrompt(…, { aiWriteBack: true })` 的内部派生；补丁类型按路由白名单收窄，客户端传不进来 | `types.ts:79-89`、`store.ts:497-502`、spec §13.13 |
| 淘汰键序 | `(aiRefined asc, lastUsedAt asc, createdAt asc, id asc)` 的**唯一实现**在 `src/eviction-order.ts`，宿主真实淘汰与客户端预检共用，防两端漂移（D-1 的土壤） | `eviction-order.ts:33` |
| 淘汰豁免 | 创建前只从既有条目选淘汰对象。核对确认名单、创建、标签同步和淘汰在同一事务内完成。 | `store.ts#createPromptWithEvictions` |
| 方向不猜 | 「当前 body 是哪一侧」只从 meta `pl:refined-dir:<id>` 读；**无记录 ⇒ 中性且不落库**（`aiRefined` 不参与推断——它只说明「发生过一次写回」） | `refined-direction.ts:44-96`、spec §13.11-二 |
| meta 键约定 | `pl:<用途>:<id>`（如 `pl:refined-dir:<id>` / `pl:skill-descriptor:<id>`）；不可逆删除才清键，软删除不清 | `prompt-meta.ts:24`、`refined-direction.ts:39-42` |

---

## 4. 接口面

### 4.1 HTTP（单条 prefix 路由，30 条）

信封统一 `{ ok, data }` / `{ ok:false, error }`；AI 路由的失败信封扩为 `{ ok:false, error:{ code, message } }`（code 跨层传枚举，message 仅开发诊断）。状态码：400 参数 / 403 跨源写入被拒 / 404 未找到 / 409 写入冲突 / 500 未预期 / 503 AI 或设置不可用（`routes.ts` 文件头）。

**路由清单单一真源**（2026-10-03，D13）：`routes.ts#ROUTE_SPECS` 是路由的唯一一份清单——`dispatch`
按它匹配分发，`tests/api.test.mjs` 的覆盖账本按 `pattern` 与它双向对齐（加路由不加覆盖行即红）。

**跨源写入闸**（2026-10-03，D9）：写方法（POST/PUT/DELETE）只接受同源请求——命中 `Sec-Fetch-Site: cross-site`、或 `Origin` 存在且与 `Host` 不同源（含 `Origin: null`）即 403，且**在读请求体之前**就返回。判据只认正向的跨源证据：`curl` / 脚本 / 宿主 agent 不带这些头，同源页面的写请求带 `Origin` 且与 `Host` 同值。GET 不挡（无副作用，响应本来也读不到）。

| 组 | 路由 |
|---|---|
| 提示词 | `GET /prompts`（`q`/`tag`/`sort=default\|updated\|used\|created`）· `POST /prompts`（需要淘汰时携带 `approvedEvictions`）· `GET/PUT/DELETE /prompts/:id` · `POST /prompts/:id/use` · `POST /prompts/:id/rollback` |
| 标签 | `GET /tags` · `POST /tags` · `PUT /tags/:from`（改名）· `DELETE /tags/:name`（在用保护） |
| 回收站 | `GET /trash` · `POST /trash/:id/restore` · `DELETE /trash/:id` · `DELETE /trash`（回 `{removed, ids}`） |
| AI | `GET /ai/providers` · `POST /ai/polish` · `POST /ai/check`（`findings` 含原文引用、问题和建议） · `POST /ai/draft`（想法、可选回答及资料，返回澄清问题或正文、假设与待核实项） · `POST /ai/draft/search`（用可选宿主搜索查询资料来源） · `POST /ai/refine`（四个原有字段和可选 `suggestions`） · `POST /ai/skill-descriptor` |
| 设置 | `GET /settings` · `PUT /settings`（写入后清 AI 路由缓存） |
| 导入导出 | `POST /export/save`（宿主生成文件名 + 目录来自 `workspaces.pickDirectory`）· `POST /import`（`{backup, confirm}`，未确认只回预览） |
| meta | `GET/PUT/DELETE /meta/:key`（模板变量记忆等客户端键名的通用通道，宿主不认识键名约定） |
| 技能 | `POST /skills/export`（覆盖其他条目或手写的同名技能需 `conflictConfirmed`） |

### 4.2 设置（13 键，dsh 0.2.0 契约）

设置即**插件 Config**：`export const Config = PromptEnhancerSettingsSchema`（`src/index.ts:44`），宿主按 patch 条目 id 投影设置页并写回 profile；volatile 变更经 `loader/volatile-update` 到达运行中的 fiber（不重挂载）。客户端订阅 `ctx.configForms.describe()`，镜像就绪时按 13 键签名解析条目 id。固定条目 ID 优先，支持 super-injector 的随机 ID。

`src/settings-shape.ts:25-33` 是**唯一真源**：`aiProvider` `aiModel` `panelWidth` `panelHeight` `showComposerButton` `composerButtonIconOnly` `showAIPolishButton` `aiPolishButtonIconOnly` `hashTriggerEnabled` `contextRecommendEnabled` `selectionAddEnabled` `showSidebarButton` `maxPromptCount`。归一化逐字段回落默认值（深拷贝式 `normalizeSettings`），键集 zh/en 在 i18n 类型面同值。

### 4.3 客户端组件与纯逻辑的分工

`node --test`（Node 24 类型擦除）直接 import `.ts` 源码，但 `.tsx` 进不去 ⇒ **判定一律下沉到纯模块**，组件只做接线：`ai-flow`（写回缝编排 + 错误分类）· `refined-direction`（方向判定/翻转/标注映射）· `overlay-claim`（三个浮层的互斥 claim 寄存器）· `context-recommend`（推荐打分）· `eviction`（淘汰预演）· `template` / `insert` / `capture` / `transfer` / `skill-export` / `search-match` / `ui-state` / `settings-store` / `icon-only` / `err-text` / `skill-badge` / `skill-name` / `skill-description`。

---

## 5. AI 子系统

| 面 | 现状 | 出处 |
|---|---|---|
| 模型路由 | 先尝试显式设置的 provider/model。自动选择或需要回退时按序查询目录，每个 provider 优先选 `/chat\|deepseek/i` 命中的模型，目录缓存 30s。 | `ai.ts#discoverCandidates` |
| 调用 | 全局**串行锁**（同时只允许一个 LLM 调用，防并发打爆额度）· 每次尝试超时取单次上限与拿到锁后剩余预算的较小值 · 默认输出 2048 token · `temperature 0.4` | `ai.ts#collectText`、`ai-budget.ts` |
| 总预算 | 从能力入口计时，目录和模型元数据查询、串行锁排队、候选调用与诊断重试共享 `AiBudget`。到期或取消时请求立即结束。各操作的上限见 D10。 | `ai-budget.ts`、`ai.ts#polishPromptBodyCore` |
| 失败码 | 7 值枚举 `no-llm` / `route` / `timeout` / `empty-output` / `parse` / `schema-mismatch` / `unknown`，跨层传 code、client 走 i18n 字典（`ai.code.*`） | `ai-errors.ts:14-21` |
| 重试 | `callPrompt` 轮询候选，允许一轮诊断重试。候选阶段验证结构及内容，格式或截断错误可继续回退或重试。JSON 请求通过同一对象内的 `retryDiagnosis` 字段携带诊断，正文保持原样。技能描述符使用单独的三轮尝试。 | `ai.ts#callPrompt`、`ai-errors.ts#failureDiagnosis` |
| 结果缓存 | 读穿式 LRU + TTL：键 = hash(system + user + route)，TTL 30 分钟、上限 50 条、重启即清。只有首选模型的成功结果填充首选缓存。 | `ai-cache.ts:13-14,48-56` |
| 输出后处理 | 润色剥离包裹和明确套话，拒绝空稿和截断。润色与模板增强保护原占位符及可识别的命令、路径和权限约束。模板增强另校验必填字段。 | `text.ts:71-123` |
| 客户端超时 | 模型生成请求的上限见 D10。探测和清键为 15s。`TimeoutError` 按名字判定，探测超时带 `probe` 标记。 | `api.ts` |
| AI 请求诊断 | 正式构建也写 `$DSH_HOME/prompt-enhancer/log/review-YYYY-MM-DD.jsonl`（UTC 日期）。所有 `/ai/` 路由按 `id` 关联模型枚举、来源搜索、路由选择、缓存、排队、流式调用、校验及最终 HTTP 状态。模型请求只记录参数和长度，失败记录结束类型、错误码和可用的 HTTP 状态。 | `review-trace.ts`、`ai.ts#collectText` |

**质量边界**：改写规则覆盖可检测的字面量。自由文本的语义一致性需要用户核对。

---

## 6. 关键决策台账（编号 → 内容 → 出处）

| 编号 | 决策 | 出处 |
|---|---|---|
| D1 | 复用只做**主动插入**：不做 systemPrompt 注入、不做会话/工作区作用域绑定 | 本文 §1、§4.1 |
| D2 | 持续优化 = AI 优化 + 使用统计 + 可回滚；**不引入版本历史表** | 本文 §1、§3 |
| D3 | 沉淀 = 手动三入口；**无自学习/自动捕获**（上游的自动捕获是死代码） | 本文 §1 |
| D4 | 实现路线：移植 host 存储层 + 通用组件 + 模板变量 + AI 模块，重写巨型弹窗，**只用官方插槽** | 本文 §2、`AGENTS.md` 硬约束 3 |
| D5 | 导入走浏览器 `<input type=file>` 客户端读文件；导出走 `workspaces.pickDirectory()` 和 `POST /export/save`。文件及带封装的导入请求各限 5 MiB。导出成功时保证可通过正常入口导入。超限在写盘前报错，成功文件使用唯一文件名并独占创建。 | 本文 §4.1 |
| D6 | 数据变更同步用**同进程 window 事件**，无 WebSocket（上游的 WS 通道 emit 零调用点，已死） | 本文 §2 |
| D7 | 命名空间：包 `dsh-prompt-enhancer` / HTTP `/api/prompt-enhancer` / i18n `prompt-enhancer` / 数据 `$DSH_HOME/prompt-enhancer/` | 本文 §2、§3 |
| D8 | 技能导出**单向**：写 `$DSH_HOME/skills/<name>/SKILL.md` + 过期徽标 + 一键重导；**不做反向导入、不做活同步、不做项目级技能根** | 本文 §4.1（`/skills/export`） |
| §13.8-四 | 写回缝唯一：`PUT /prompts/:id` 带 `aiWriteBack` 且仅当 `sourceBody` 为空时回填原文；「完善稿 ≡ 原文」时 UI 必须明说且不渲染切换入口 | 本文 §3（写回缝唯一） |
| §13.10-一 | 淘汰语义：**本次创建的提示词永不成为受害者**（R45） | 本文 §3（淘汰豁免） |
| §13.10-二 | 客户端预演必须与宿主同键同序（`id` 兜底成全序），否则确认框会撒谎（D-1） | 本文 §3、`src/eviction-order.ts` |
| §13.10-四 → §13.11-一 | 浮层互斥从「共享信号 + 渲染不变式」升级为 **claim 寄存器** | 本文 §2、`src/overlay-claim.ts` |
| §13.11-二 | 方向「不猜」：来源未知时切换 ⇒ 作废记录；迟到的读结果若出生在切换之前 ⇒ 丢弃 | 本文 §3（meta 键约定）、`src/client/utils/refined-direction.ts` |
| §13.11-三 | 技能名身份：已导出条目的目录名只能由 `skillName` 决定，`name` 只在首次导出参与（权威层收口，防孤儿目录） | `src/host/routes.ts:406-429` |
| §13.13 | 写回缝在 store 层收口：补丁类型收窄，AI 三字段「传不进来」（而非「靠没人传」） | 本文 §3、`src/types.ts:79-89` |
| dsh 0.2.0 迁移 | 设置从 `settingsScope` → `configForms` + `Config`；`ctx.settings.update(entryId, patch)` 取代 `register`（旧写法启动即抛，是设置页保存 503 的根因） | `src/index.ts:4-14` |
| 首包（已交付） | 统一 AI 错误码 + 诊断注入重试 · AI 结果缓存 · 推荐相关性重排（usage ×0.15 封顶 + 草稿词硬门槛） | issues #1–#6（全 CLOSED） |
| D9 | **跨源写入闸**：写方法只接受同源请求（403 且不读体）；宿主 webServer 无 origin/token/CSRF 守卫，故闸门落在插件路由层 | 本文 §4.1、`routes.ts#isCrossSiteWrite` |
| D10 | 默认单次尝试上限为 30s，宿主总预算为 110s，客户端超时为 120s。检查、模板增强和起草的单次上限为 180s，宿主总预算为 215s，客户端超时为 225s。候选目录单次查询上限为 30s，各阶段均受剩余总预算约束。 | 本文 §5、`ai-budget.ts`、`ai.ts#attemptAllCandidates` |
| D11 | **超限响应先于关连接**：5 MB 闸不得先 `req.destroy()`（会连 socket 一起拆，客户端只见 EPIPE）；改为停止读取 + `Connection: close`，让 400 正常写出 | 本文 §4.1、`routes.ts#readBody` |
| D12 | **产物源码指纹**：`build` 把 `src/**` 的 hash 写进 `.build-meta.json`，`smoke` 比对当前 src 并红——「改完 src 不重建就提交」是本仓唯一能骗过其它所有门的失效模式（`npm test` 测 src、`smoke` 测 lib） | 本文 §7、`scripts/source-hash.mjs` |
| D13 | **路由清单单一真源**：`ROUTE_SPECS` 驱动 `dispatch`，测试的覆盖账本按 `pattern` 与它双向对齐（此前 dispatch 是手写 if 链、测试另有一份手抄副本） | 本文 §4.1、`routes.ts#ROUTE_SPECS` |
| D14 | Composer 左侧并排显示选择器与 AI 优化。选择器点条目后进入独立预览，可返回搜索结果。AI 优化可直接选轻度润色或增强为模板。最终模板实时合并正文与勾选建议，复制、入库与试填共用同一份结果。AI 试填未填完时须显式选择保留占位符，应用时保护已变化的草稿。 | `PromptLibraryButton.tsx`、`AIPolishButton.tsx`、`ai-flow.ts` |
| D15 | 变量说明与默认值可在 AI 结果的「条目信息」或管理器编辑页配置。AI 试填使用当前配置，最终正文与变量配置一同写入词库。配置与正文同存，随回收站和 JSON 备份往返。默认值跟随模板。显式记住的填值以模板 ID 单独保存，恢复默认值后确认插入会清除该模板的填值记忆。旧的共享填值不会自动带入。 | `TemplateVariablesDialog.tsx`、`store.ts` |
| D16 | 选择器空查询时优先列出最近插入的条目。方向键聚焦结果，Enter 打开预览，Esc 返回列表。最终模板在同一份文本里标记新增变量与勾选建议，缺少原变量时可直接返回编辑。 | `PromptLibraryButton.tsx`、`AIPolishButton.tsx` |
| D17 | AI 菜单默认高亮轻度润色。检查提示词基于发起时的草稿快照，展示实质问题、逐字引用和建议。检查结果只读，草稿变化后允许检查新版。 | `AIPolishButton.tsx`、`ai.ts`、`check.ts` |
| D18 | Composer 为空时仍可开启 AI 菜单，仅启用并高亮「从想法起草」。起草最多一轮澄清，可跳过。编辑后的结果可直接交给检查与模板增强，返回时保留起草状态。应用时以进入起草前的 Composer 为对照，变化时要求显式确认替换。 | `AIPolishButton.tsx`、`PromptDraftForm.tsx`、`draft.ts` |
| D19 | 起草将影响结论的外部事实写成正文中的核实步骤，追问聚焦用户偏好。用户可主动通过宿主 `ctx.web.search()` 查询来源，发送范围限于独立填写的关键词。搜索不可用时可自行补充链接或摘录并继续起草。 | `draft-search.ts`、`draft.ts`、`PromptDraftForm.tsx` |
| D20 | AI 请求的最终错误码只描述用户收到的结果。请求日志保留每轮候选的结束状态、插件计时器是否触发和校验结果，供定位更早的故障。 | 本文 §5、`review-trace.ts` |
| D21 | 检查、模板增强和起草优先使用候选模型声明的 `off` 推理档位。关闭推理的模型获分配 2048 个检查输出 token 或 4096 个增强／起草输出 token。模型未声明该档位时使用 8192 输出 token，为共用预算的推理和 JSON 正文留出空间。起草在接受候选前校验完整结果，截断或结构错误可继续尝试下一候选或诊断重试。 | `ai.ts#collectText`、`ai.ts#draftPromptCore` |
| D22 | AI 面板等待时显示已用时长。取消请求返回操作菜单或起草面板，保留用户输入。HTTP 连接提前关闭或插件卸载时，宿主取消请求及排队等待，并停止后续候选和诊断重试。 | `AIPolishButton.tsx`、`routes.ts#dispatch`、`ai.ts#attemptAllCandidates` |
| D23 | 写入冲突保护。管理器仅提交改动字段，保存和换稿携带宿主签发的 `contentVersion`。旧调用仍可省略该字段。创建需要淘汰时必须提交已确认的 ID，名单过期返回 409。确认导入按同 ID 覆盖在用条目或回收站条目，恢复遇到历史同 ID 冲突时保留两份并返回 409。 | `store.ts#createPromptWithEvictions`、`store.ts#importPrompts`、`prompt-edit.ts` |
| D24 | 填值记忆完成后复核草稿版本。草稿变化时，追加使用当前内容，覆盖和发送需要重新确认。覆盖使用宿主整体替换；追加和替换尾部令牌使用区间插入以保留内联引用。公开输入状态未暴露引用选区卡片的完整坐标，含此类卡片的尾部编辑可能被宿主拒绝，界面保留草稿并提示失败。 | `TemplateVariablesDialog.tsx`、`insert.ts` |
| D25 | 确认覆盖同名技能会转移唯一归属，包括撤销回收站中的旧归属。历史同名归属需要重新确认。技能内容写入失败时回滚归属变更。 | `store.ts#recordSkillExport`、`skills.ts#exportSkill` |
| D26 | 起草接收可选的下游执行环境，按模型能看到的上下文及可用工具生成自包含正文，交付前检查约束、能力和验收条件。按反馈改写时，同一接口携带生成本稿的输入、当前编辑稿及反馈，直接返回新版。失败或取消保留正文和反馈。 | `PromptDraftForm.tsx`、`draft.ts`、`ai.ts#draftPromptCore` |
| D27 | 起草从已有信息补齐交付要求和验收条件，在正文写明影响执行的默认值和待补材料。一轮澄清只处理会改变任务的用户选择。结论依赖外部事实时，正文按需增加一手来源溯源、适用性检查和证据强度约束。 | `ai.ts#draftPromptCore` |
| D28 | 起草按单次任务、可复用工作流或长期角色组织正文，并展示生成时理解的目标和执行前待补材料。起草面板触发的检查对照该稿的原始输入、澄清和按顺序采用的反馈。可把当前检查报告中的单条建议带回反馈框，由用户编辑并提交。 | `draft.ts`、`ai.ts#checkPromptCore`、`AIPolishButton.tsx` |
| D29 | 起草的关键假设须引用正文原句，保证只交付正文时仍携带执行默认值。解析器拒绝未落实到正文的假设，沿用候选回退与诊断重试，不自动追加可能冲突的假设。此校验只保证字面交接完整性，不判断假设是否忠实于需求。 | `draft.ts#parseDraftResult`、`ai.ts#draftPromptCore` |
| D30 | 每次 LLM 注入持有独立绑定，卸载只释放自身；多实例共享同一服务对象时也不相互清空。当前绑定释放后恢复最近仍存活的绑定，最后一个释放后停用 AI。绑定切换时清除模型目录缓存。 | `ai.ts#registerLlm`、`index.ts#apply`、`host-lifecycle.test.mjs` |
| D31 | Composer 词库选择器在最终确认时按 ID 读未缓存的条目，确认仍在库后才应用已预览或填好的正文。已不存在则保留查询和草稿；无法确认则保留当前操作供重试。关闭或切换会话使本次确认失效。该校验不比较条目版本，也不把库读取与草稿写入当成原子操作；填值记忆仍是独立操作。 | `library-insertion.ts`、`PromptLibraryButton.tsx` |

---

## 7. 质量门禁与验收纪律

```sh
npm run verify      # 四道门一次跑满（= typecheck && test && build && smoke）；提交前必须跑它
npm run typecheck   # tsc --noEmit
npm test            # node --test
npm run build       # lib/index.js + lib/client.js（同时把源码指纹写进 .build-meta.json）
npm run smoke       # 真实执行 client bundle：注册 id、7 个插槽的账本顺序、inject 段序、导出形状、
                    # 产物只由 src/ 组成（metafile 闸门）、lib 与 src 同代（源码指纹）
```

- GitHub Actions 的无宿主验证与本地复跑方法见 [README · Development](../README.md#development)。
- 每个任务结束时**四项全绿**；新增负样本必须先用**变异验证**（临时改坏实现 → 用例必须红 → 复原）。
- 提交粒度：一个任务一次提交，`<type>: <scope> <what>`。
- 活体验收（P4–P8）留下的记录在 `docs/superpowers/plans/*-acceptance.md`，是**唯一现场证据**（含被验收提交 SHA、逐条判据、NOT RUN 归属、临时数据与副作用清单）。
- 组件接线没有自动化断言（无 react-dom/jsdom，硬约束 5），只靠活体验收——所以 `.tsx` 里的判定应尽量下沉到纯模块。

---

## 8. 当前状态与已知取舍

**已交付**：M1–M8 全部里程碑（骨架与构建契约 / 数据层 / API + AI / 复用闭环 / AI 与回滚 / 沉淀与管理 / 技能导出 / 推荐与设置与文档）。当前 HEAD 之后有过若干纯重构与文档收敛提交。

**已知取舍**（**是取舍，不是缺陷；不要当 bug 修**——README 明写，出处见括号）：
1. `#` 浮层在屏时，非指针激活（键盘 Enter/Space、`element.click()`、部分辅助技术）无法打开词库面板；真实指针点击不受影响（spec §13.10-五-1；下文 §编号均指 `docs/superpowers/specs/` 的章节，该目录已冻结）。
2. 变量填窗逐键输入在弹窗卸载后丢失（组件本地态，spec §13.10-五-2）。
3. 组件接线无自动化断言（spec §13.10-五-3；变异证据：把 `panelOpen` 退化成 `open` 全套测试仍绿）。
4. 打 `#`、关词库面板后 `#` 浮层不会自己回来（程序化 focus + Range 无效，只有真实键入才复现，P8 裁决 TBD-P8-6）。
5. AI 结果面板几何上覆盖 composer（浮层落点与面板尺寸的设计空间，P8 显式留档不改）。
6. 三个显隐开关全关时，左侧入口在设置就绪前仍会渲染约 2 帧（~33ms），有意不修（消除它会重新引入「未就绪 null 态」，代价更高）。

**待办与提案**：`docs/proposals/2026-10-03-pending-features-from-community-plugins.md`（14 条，已挂起；含 2 条待验证假设与 5 个交付批次的串行/并行约束）。

---

## 9. 术语与来源

| 术语 | 含义 |
|---|---|
| 写回缝 | 把 AI 结果写回提示词正文的**唯一**路径（`aiWriteBack: true`） |
| 悬浮层三面 | 词库面板 / AI 结果面板 / `#` 候选浮层，由 `overlay-claim.ts` 的 claim 寄存器保证同屏互斥 |
| 方向记录 | meta `pl:refined-dir:<id>`，值为裸的 `original` / `refined`；空串 = 无记录 |
| 技能过期 | `skillName` 非空且 `skillExportedAt < updatedAt` |
| 沉淀三入口 | 管理面板新建/编辑 · 选中文字存为提示词 · 当前草稿存为提示词 |
| 淘汰预演 | 客户端按共享键序预演受害者并确认。宿主在创建事务内核对已批准的 ID |

上游参考分析（功能对照、删除清单、实测异常）保留在 `docs/analysis-dsh-prompt-library/`；规格全文与 §13 自检收敛记录保留在 `docs/superpowers/specs/`。
