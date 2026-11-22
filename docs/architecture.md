# dsh-prompt-enhancer · 架构与决策（活文档）

本文记录运行时结构、数据与接口不变量、设计决策和已知取舍。约束见 [AGENTS.md](../AGENTS.md)；实际行为以代码为准，发现不一致时更新本文。早期规格编号与历史材料见 [§9](#9-术语与来源)。

---

## 1. 这是什么

插件围绕提示词的管理、AI 优化、沉淀与复用。功能和来源见[中文 README](../README.zh.md)。

**产品边界**：`systemPrompt` section 数恒为 0。提示词只在用户显式操作时写入 Composer，不做系统提示词注入或会话、工作区绑定。不做技能反向导入或活同步、自学习或自动捕获、版本历史表、WebSocket、斜杠命令或自动更新。

---

## 2. 运行时结构

```
DSH web host
├── dsh-prompt-enhancer (host)   src/index.ts（宿主装配点）
│   ├── export Config = PromptEnhancerSettingsSchema   ← dsh 0.2.0：设置即插件 Config
│   ├── ctx.inject(["llm"])        → registerLlm()     缺失 ⇒ AI 路由 503，其余功能不受影响
│   ├── ctx.inject(["web"])        → 可选的起草搜索
│   ├── ctx.inject(["webServer"]) → 单条 prefix 路由 /api/prompt-enhancer
│   ├── ctx.on("loader/volatile-update") → clearRouteCache()（改 provider/model 必须换路由）
│   └── ctx.effect(lifecycle 日志；卸载时解绑设置面)
│   ✗ 无 systemPrompt section   ✗ 无 agent/session 监听   ✗ 无 registerUpgrade（无 WS）
│
└── dsh-prompt-enhancer (client)  src/client/index.ts（官方插槽注册）
    ├── conversation.input.left      id=prompt-enhancer              order 10  词库按钮
    ├── conversation.input.overlay   id=prompt-enhancer-hash         order 20  `#` 候选浮层
    ├── conversation.input.left      id=prompt-enhancer-ai-polish    order 11  AI 优化按钮
    ├── shell.overlay                id=prompt-enhancer              order 100 弹窗宿主（root，常驻挂载）
    ├── sidebar.footer.action        id=prompt-enhancer              order 100 左侧下方入口
    ├── conversation.input.dock      id=prompt-enhancer-recommend    order 10  上下文推荐条
    └── settings.section             id=prompt-enhancer              order 30  设置页
    条件注入（inject 导出数组不扩张）：uiWorkspace（目录选择）→ uiConversation（聊天快照）→ configForms（设置真源）
    注册顺序即 scripts/smoke.mjs 的 EXPECTED_SLOTS 账本顺序：挪位即红
```

**构建契约**（`scripts/build.mjs`，esbuild）：产物 `lib/index.js`（Node ESM）与 `lib/client.js`（CJS + banner/footer 包装，注册 `window.__ModuleLoader__.load({ id, factory })`）。三条硬约束：client 模块 id **必须等于包名**（从 `package.json.name` 派生，禁硬编码）· `react` / `react/jsx-runtime` / `@deepseek-ai/*` 一律 external · footer 必须把 `module.exports` 重写为纯净的 `{ apply, inject }`。

---

## 3. 数据与存储

SQLite 主库位于 `$DSH_HOME/prompt-enhancer/db/prompts.db`（`paths.ts#dbPath`）。表结构和迁移见 `store.ts#MIGRATIONS`。

| 不变量 | 内容 | 出处 |
|---|---|---|
| schema 演进 | 数据库版本由 `SCHEMA_VERSION` 定义。`MIGRATIONS` 幂等；v4 修复旧库中的异常计数和时间戳，保留条目内容 | `types.ts#SCHEMA_VERSION`、`store.ts#MIGRATIONS` |
| 存储层解耦 | `store.ts` **不 import 任何宿主能力**（cordis/服务），故可脱离 `dsh` 单测 | 硬约束 12 |
| 测试隔离 | 靠环境变量把 `DSH_HOME` 指向临时目录，**不加 test-only API**；`paths.ts` 全部调用期求值 | 硬约束 13 |
| 回滚语义 | AI 首次写回保留旧正文为 `sourceBody`；`POST /prompts/:id/rollback` 交换 `body` 与 `sourceBody`，可反复切换 | `store.ts#rollbackPrompt` |
| 写回缝唯一 | 普通更新补丁不能直接写 `sourceBody`、`aiRefined` 或 `aiRefinedAt`。AI 写回由 `updatePrompt` 根据 `aiWriteBack` 派生这些字段 | `types.ts#PROMPT_WRITABLE_KEYS`、`store.ts#updatePrompt` |
| 淘汰键序 | 宿主淘汰与客户端预演共用 `(aiRefined asc, lastUsedAt asc, createdAt asc, id asc)` | `src/eviction-order.ts` |
| 淘汰豁免 | 创建前只从既有条目选淘汰对象。核对确认名单、创建、标签同步和淘汰在同一事务内完成。 | `store.ts#createPromptWithEvictions` |
| 方向不猜 | 当前正文在哪一侧，只认方向记录；无记录时用中性标签，不补写记录 | `refined-direction.ts#readRefinedDirection` |
| 条目 meta | `pl:<用途>:<id>` 用于方向、技能描述符及模板填值记忆。软删除不清键；永久删除、淘汰和确认导入覆盖有各自的清理路径，导入例外见 D32 | `prompt-meta.ts#perPromptMetaKeys`、`capture.ts`、`transfer.ts#confirmBackupImport` |

---

## 4. 接口面

### 4.1 HTTP（单条 prefix 路由）

信封统一 `{ ok, data }` / `{ ok:false, error }`；AI 路由的失败信封扩为 `{ ok:false, error:{ code, message } }`（code 跨层传枚举，message 仅开发诊断）。状态码：400 参数 / 403 跨源写入被拒 / 404 未找到 / 409 写入冲突 / 500 未预期 / 503 AI 或设置不可用（`routes.ts` 文件头）。

**路由真源**：`routes.ts#ROUTE_SPECS` 驱动分发；`tests/api.test.mjs` 的覆盖账本按 `pattern` 与其对齐。

**跨源写入闸**（D9）：对 POST/PUT/DELETE，`Sec-Fetch-Site: cross-site`、`Origin: null`、无效 `Origin`，或 `Origin` 的 host（含端口）不匹配 `Host` 时，在读请求体前返回 403。无 `Origin` 且无跨站标记的请求不被此闸拒绝。它不校验调用者身份，不是认证；GET 不走此闸。

| 组 | 路由 |
|---|---|
| 提示词 | `GET /prompts`（`q`/`tag`/`sort=default\|updated\|used\|created`）· `POST /prompts`（需要淘汰时携带 `approvedEvictions`）· `GET/PUT/DELETE /prompts/:id` · `POST /prompts/:id/use` · `POST /prompts/:id/rollback` |
| 标签 | `GET /tags` · `POST /tags` · `PUT /tags/:from`（改名）· `DELETE /tags/:name`（在用保护） |
| 回收站 | `GET /trash` · `POST /trash/:id/restore` · `DELETE /trash/:id` · `DELETE /trash`（回 `{removed, ids}`） |
| AI | `GET /ai/providers` · `POST /ai/polish` · `POST /ai/check`（`findings` 含原文引用、问题和建议） · `POST /ai/check/revise`（选中建议 → 完整改稿与待确认问题） · `POST /ai/draft`（想法、可选回答及资料，返回澄清问题或正文、假设与待核实项） · `POST /ai/draft/search`（用可选宿主搜索查询资料来源） · `POST /ai/refine`（四个原有字段和可选 `suggestions`） · `POST /ai/skill-descriptor` |
| 设置 | `GET /settings` · `PUT /settings`（写入后清 AI 路由缓存） |
| 导入导出 | `POST /export/save`（宿主生成文件名 + 目录来自 `uiWorkspace.pickDirectory()`）· `POST /import`（`{backup, confirm}`，未确认只回预览） |
| meta | `GET/PUT/DELETE /meta/:key`（模板变量记忆等客户端键名的通用通道，宿主不认识键名约定） |
| 技能 | `POST /skills/export`（可确认的 409 返回 `error.conflict: { name, token }`；重试携带 `conflictToken`） |

### 4.2 设置

`src/index.ts#Config` 导出插件配置。宿主按 profile 条目 ID 保存，变更经 `loader/volatile-update` 刷新 AI 路由缓存。客户端从 `configForms` 订阅对应表单，优先识别固定 ID，也按设置键签名识别随机 ID；缺少表单时降级使用 HTTP 设置接口。

键集和归一化见 `settings-shape.ts#SETTINGS_KEYS` / `normalizeSettings`，默认值见 `types.ts#DEFAULT_SETTINGS`。

### 4.3 客户端组件与纯逻辑的分工

组件连接宿主插槽、状态与视图。业务判定可直接在 Node 中测试；接线验收见 §7。

| 查找 | 模块 |
|---|---|
| 检查、起草与模板结果 | `check-revision.ts`、`draft-session.ts`、`template-refine-session.ts`（D34–D37） |
| 请求与存库 | `ai-request-lifecycle.ts` 管取消和并发；`template-save.ts` 编排存库，复用 `ai-flow.ts#writeBackRefined`（D38–D39） |
| 应用到 Composer | `composer-application.ts` 管 AI 应用；`library-insertion.ts` 管词库复用。后者和普通检查复用 `insert.ts` 的宿主写入保护（D24、D31、D40） |
| 浮层与方向 | `overlay-claim.ts` 管互斥判定，`ui-state.ts` 持有 claim；`refined-direction.ts` 处理库中原文与优化稿方向 |

---

## 5. AI 子系统

| 面 | 现状 | 出处 |
|---|---|---|
| 模型路由 | 先尝试显式设置的 provider/model。自动选择或需要回退时按序查询目录，每个 provider 优先选 `/chat\|deepseek/i` 命中的模型，目录缓存 30s。 | `ai.ts#discoverCandidates` |
| 调用 | 全局**串行锁**（同时只允许一个 LLM 调用，防并发打爆额度）· 每次尝试超时取单次上限与拿到锁后剩余预算的较小值 · 默认输出 2048 token · `temperature 0.4` | `ai.ts#collectText`、`ai-budget.ts` |
| 总预算 | 从能力入口计时，目录和模型元数据查询、串行锁排队、候选调用与诊断重试共享 `AiBudget`。到期或取消时请求立即结束。各操作的上限见 D10。 | `ai-budget.ts`、`ai.ts#polishPromptBodyCore` |
| 失败码 | 7 值枚举 `no-llm` / `route` / `timeout` / `empty-output` / `parse` / `schema-mismatch` / `unknown`，跨层传 code、client 走 i18n 字典（`ai.code.*`） | `ai-errors.ts:14-21` |
| 重试 | `callPrompt` 轮询候选，允许一轮诊断重试。候选阶段验证结构及内容，格式或截断错误可继续回退或重试。JSON 请求通过同一对象内的 `retryDiagnosis` 字段携带诊断，正文保持原样。技能描述符使用单独的三轮尝试，内容验收在候选级执行：解析通过才记候选接受，不合格记候选拒绝并同轮换下一个候选，不叠加诊断重试。 | `ai.ts#callPrompt`、`ai.ts#attemptAllCandidates`、`ai-errors.ts#failureDiagnosis` |
| 结果缓存 | 读穿式 LRU + TTL：键 = hash(system + user + route)，TTL 30 分钟、上限 50 条、重启即清。只有首选模型的成功结果填充首选缓存。 | `ai-cache.ts:13-14,48-56` |
| 输出后处理 | 润色剥离包裹和明确套话，拒绝空稿和截断。润色与模板增强保护原占位符及可识别的命令、路径和权限约束。模板增强另校验必填字段。 | `text.ts:71-123` |
| 客户端超时 | 模型生成请求的上限见 D10。AI 探测、起草来源搜索和清键使用短超时。 | `api.ts` |
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
| D5 | 导入由浏览器读文件；导出由宿主选择目录并写文件。文件和封装后的导入请求分别限长；写盘前核对导出能通过同一导入大小上限，使用唯一文件名独占创建。 | §4.1、`backup-transfer.ts#MAX_REQUEST_BODY_BYTES` |
| D6 | 数据变更同步用**同进程 window 事件**，无 WebSocket（上游的 WS 通道 emit 零调用点，已死） | 本文 §2 |
| D7 | 命名空间：包 `dsh-prompt-enhancer` / HTTP `/api/prompt-enhancer` / i18n `prompt-enhancer` / 数据 `$DSH_HOME/prompt-enhancer/` | 本文 §2、§3 |
| D8 | 技能导出**单向**：写 `$DSH_HOME/skills/<name>/SKILL.md` + 过期徽标 + 一键重导；**不做反向导入、不做活同步、不做项目级技能根** | 本文 §4.1（`/skills/export`） |
| §13.8-四 | 写回缝唯一：`PUT /prompts/:id` 带 `aiWriteBack` 且仅当 `sourceBody` 为空时回填原文；「完善稿 ≡ 原文」时 UI 必须明说且不渲染切换入口 | 本文 §3（写回缝唯一） |
| §13.10-一 | 淘汰语义：**本次创建的提示词永不成为受害者**（R45） | 本文 §3（淘汰豁免） |
| §13.10-二 | 客户端预演必须与宿主同键同序（`id` 兜底成全序），否则确认框会撒谎（D-1） | 本文 §3、`src/eviction-order.ts` |
| §13.10-四 → §13.11-一 | 浮层互斥从「共享信号 + 渲染不变式」升级为 **claim 寄存器** | 本文 §2、`src/overlay-claim.ts` |
| §13.11-二 | 方向「不猜」：来源未知时切换 ⇒ 作废记录；迟到的读结果若出生在切换之前 ⇒ 丢弃 | 本文 §3（meta 键约定）、`src/client/utils/refined-direction.ts` |
| §13.11-三 | 技能名身份：有归属的条目以 `skillName` 决定目录，`name` 只参与无归属条目的导出。 | `store.ts#recordSkillExport` |
| §13.13 | 写回缝在 store 层收口：补丁类型收窄，AI 三字段「传不进来」（而非「靠没人传」） | 本文 §3、`src/types.ts:79-89` |
| dsh 0.2.0 迁移 | 设置从 `settingsScope` → `configForms` + `Config`；`ctx.settings.update(entryId, patch)` 取代 `register`（旧写法启动即抛，是设置页保存 503 的根因） | `src/index.ts:4-14` |
| 首包（已交付） | 统一 AI 错误码 + 诊断注入重试 · AI 结果缓存 · 推荐相关性重排（usage ×0.15 封顶 + 草稿词硬门槛） | issues #1–#6（全 CLOSED） |
| D9 | **跨源写入闸**：在插件路由层拦截带跨源证据的写请求，不依赖宿主的其他路由做认证。 | §4.1、`routes.ts#isCrossSiteWrite` |
| D10 | 默认单次尝试上限为 30s，宿主总预算为 110s，客户端超时为 120s。检查、检查改稿、模板增强和起草的单次上限为 180s，宿主总预算为 215s，客户端超时为 225s。候选目录单次查询上限为 30s，各阶段均受剩余总预算约束。 | 本文 §5、`ai-budget.ts`、`ai.ts#attemptAllCandidates` |
| D11 | **超限响应先于关连接**：5 MB 闸不得先 `req.destroy()`（会连 socket 一起拆，客户端只见 EPIPE）；改为停止读取 + `Connection: close`，让 400 正常写出 | 本文 §4.1、`routes.ts#readBody` |
| D12 | **产物源码指纹**：`build` 把 `src/**` 的 hash 写进 `.build-meta.json`，`smoke` 比对当前 src 并红——测试验证源码，smoke 另外确认构建产物与源码同步 | 本文 §7、`scripts/source-hash.mjs` |
| D13 | **路由清单单一真源**：`ROUTE_SPECS` 驱动 `dispatch`，测试的覆盖账本按 `pattern` 与它双向对齐（此前 dispatch 是手写 if 链、测试另有一份手抄副本） | 本文 §4.1、`routes.ts#ROUTE_SPECS` |
| D14 | Composer 左侧并排显示选择器与 AI 优化。选择器点条目后进入独立预览，可返回搜索结果。AI 优化可直接选轻度润色或增强为模板。最终模板实时合并正文与勾选建议，复制、入库与试填共用同一份结果。AI 试填未填完时须显式选择保留占位符，应用时保护已变化的草稿。 | `PromptLibraryButton.tsx`、`AIPolishButton.tsx`、`ai-flow.ts` |
| D15 | 变量说明与默认值可在 AI 结果的「条目信息」或管理器编辑页配置。AI 试填使用当前配置，最终正文与变量配置一同写入词库。配置与正文同存，随回收站和 JSON 备份往返。默认值跟随模板。显式记住的填值以模板 ID 单独保存，恢复默认值后确认插入会清除该模板的填值记忆。旧的共享填值不会自动带入。 | `TemplateVariablesDialog.tsx`、`store.ts` |
| D16 | 选择器空查询时优先列出最近插入的条目。方向键聚焦结果，Enter 打开预览，Esc 返回列表。最终模板在同一份文本里标记新增变量与勾选建议，缺少原变量时可直接返回编辑。 | `PromptLibraryButton.tsx`、`AIPolishButton.tsx` |
| D17 | AI 菜单默认高亮轻度润色。检查基于草稿快照，要求模型只报告影响执行或验收的实质问题，附逐字引用及可直接使用的改法或具体待确认问题。空报告说明未运行提示词。检查结果只读，可单独复制一条建议正文，草稿变化后允许检查新版。 | `AIPolishButton.tsx`、`ai.ts`、`check.ts` |
| D18 | Composer 为空时仍可开启 AI 菜单，仅启用并高亮「从想法起草」。起草最多一轮澄清，可跳过。编辑后的结果可直接交给检查与模板增强，返回时保留起草状态。应用时以进入起草前的 Composer 为对照，变化时要求显式确认替换。 | `AIPolishButton.tsx`、`PromptDraftForm.tsx`、`draft.ts` |
| D19 | 起草将影响结论的外部事实写成正文中的核实步骤，追问聚焦用户偏好。用户可主动通过宿主 `ctx.web.search()` 查询来源，发送范围限于独立填写的关键词。搜索不可用时可自行补充链接或摘录并继续起草。 | `draft-search.ts`、`draft.ts`、`PromptDraftForm.tsx` |
| D20 | AI 请求的最终错误码只描述用户收到的结果。请求日志保留每轮候选的结束状态、插件计时器是否触发和校验结果，供定位更早的故障。 | 本文 §5、`review-trace.ts` |
| D21 | 检查、检查改稿、模板增强和起草优先使用候选模型声明的 `off` 推理档位。关闭推理时，检查报告分配 2048 个输出 token，检查改稿、增强或起草分配 4096 个。模型未声明该档位时使用 8192 输出 token，为共用预算的推理和 JSON 正文留出空间。起草在接受候选前校验完整结果，截断或结构错误可继续尝试下一候选或诊断重试。 | `ai.ts#collectText`、`ai.ts#draftPromptCore` |
| D22 | AI 面板等待时显示已用时长。取消请求返回操作菜单或起草面板，保留用户输入。HTTP 连接提前关闭或插件卸载时，宿主取消请求及排队等待，并停止后续候选和诊断重试。 | `AIPolishButton.tsx`、`routes.ts#dispatch`、`ai.ts#attemptAllCandidates` |
| D23 | 写入冲突保护。管理器仅提交改动字段，保存和换稿携带宿主签发的 `contentVersion`。旧调用仍可省略该字段。创建需要淘汰时必须提交已确认的 ID，名单过期返回 409。确认导入按同 ID 覆盖在用条目或回收站条目，恢复遇到历史同 ID 冲突时保留两份并返回 409。 | `store.ts#createPromptWithEvictions`、`store.ts#importPrompts`、`prompt-edit.ts` |
| D24 | 覆盖使用宿主整体替换正文和内联引用，不改独立附件。追加和替换尾部令牌用区间插入保留内联引用。公开输入状态未暴露引用选区卡片的完整坐标，含此类卡片的尾部编辑可能被宿主拒绝，界面保留草稿并提示失败。 | `insert.ts` |
| D25 | 按实际落盘名识别同名归属，历史重复项不自动选主。宿主将确认凭据绑定到目标名、待导出内容、竞争归属和目标文件版本；状态变化时旧凭据不可写盘，旧布尔标记不授权覆盖。确认后转移唯一归属并撤销回收站旧归属。写盘失败回滚数据库归属；SQLite 与文件系统不共享原子提交。 | `routes.ts`、`store.ts#recordSkillExport`、`skills.ts#exportSkill` |
| D26 | 起草接收可选的下游执行环境，按模型能看到的上下文及可用工具生成自包含正文，交付前检查约束、能力和验收条件。按反馈改写时，同一接口携带生成本稿的输入、当前编辑稿及反馈，直接返回新版。失败或取消保留正文和反馈。 | `PromptDraftForm.tsx`、`draft.ts`、`ai.ts#draftPromptCore` |
| D27 | 起草从已有信息补齐交付要求和验收条件，在正文写明影响执行的默认值和待补材料。一轮澄清只处理会改变任务的用户选择。结论依赖外部事实时，正文按需增加一手来源溯源、适用性检查和证据强度约束。 | `ai.ts#draftPromptCore` |
| D28 | 起草按单次任务、可复用工作流或长期角色组织正文，并展示生成时理解的目标和执行前待补材料。起草面板触发的检查对照该稿的原始输入、澄清和按顺序采用的反馈。可把当前检查报告中的单条建议带回反馈框，由用户编辑并提交。 | `draft.ts`、`ai.ts#checkPromptCore`、`AIPolishButton.tsx` |
| D29 | 起草的关键假设须引用正文原句，保证只交付正文时仍携带执行默认值。解析器拒绝未落实到正文的假设，沿用候选回退与诊断重试，不自动追加可能冲突的假设。此校验只保证字面交接完整性，不判断假设是否忠实于需求。 | `draft.ts#parseDraftResult`、`ai.ts#draftPromptCore` |
| D30 | 每次 LLM 注入持有独立绑定，卸载只释放自身；多实例共享同一服务对象时也不相互清空。当前绑定释放后恢复最近仍存活的绑定，最后一个释放后停用 AI。绑定切换时清除模型目录缓存。 | `ai.ts#registerLlm`、`index.ts#apply`、`host-lifecycle.test.mjs` |
| D31 | Composer 词库选择器在填值记忆与未缓存的条目 ID 查询后复核同一确认。追加用最新草稿；覆盖和插入并发送遇草稿正文或修订号变化时，展示最新草稿并要求再次确认。发送还复核有序附件 ID，展示数量并提示核对附件栏。查询只核实条目仍在库，不比较版本、不替换已确认正文，也不与草稿写入构成原子操作；缺失保留查询与草稿，核验失败保留操作供重试。关闭、切换会话或失去浮层显示权使已提交的确认失效，但不撤销独立的填值记忆操作。锁定期不覆盖；拒写不发送、不记用量。 | `library-insertion.ts`、`PromptLibraryButton.tsx` |
| D32 | 确认导入的 `overwrittenIds` 由写入事务确定，覆盖词库和回收站；预览只有统计。客户端只按有效回执在后台清理已有元数据，落库后的清理与通知不依赖面板是否仍挂载。回执中的 `preservedSkillIds` 标出应保留重导描述符的覆盖项；缺少此字段时不删描述符。清理与导入不原子；旧宿主缺覆盖回执时不猜清理名单。 | `store.ts#importPrompts`、`transfer.ts#confirmBackupImport` |
| D33 | 普通提示词 PUT 带归属名或导出时间返回 400，整次不写。备份仍可携带旧字段，但导入不使用它们认领技能，也不写技能文件。同 ID 覆盖保留本机归属并标为待重导；词库和回收站有同 ID 且分别绑定不同技能时，整批导入返回 409，保留两份。导入的创建和编辑时间最多取本机确认导入时间，避免来源时钟偏快导致后续导出仍显示过期。 | `routes.ts`、`store.ts#importPrompts` |
| D35 | 普通 Composer 检查默认不选建议；只把选中内容与检查原文交给改稿接口。结果保留原占位符，待用户决定的问题不写进正文。左侧编辑稿可复制或显式覆盖输入框，右侧检查快照只读。覆盖基于正文和修订号复核，变化后先展示待替换内容并确认，不发送或写库。 | `check.ts`、`check-revision.ts`、`AIPolishButton.tsx` |
| D34 | 起草会话不依赖 React。澄清上限按生成流程计，回答或跳过后重试不再追问；从想法页再生成开启新流程。生成依据只在成功换稿时更新，重新生成不继承旧反馈，改写成功才追加本次反馈。建议只对同一份生成结果和逐字相同的正文有效，带入只预填反馈。起草和增强共用进入起草时的 Composer 基线；确认前再变化需展示最新内容并再次确认，应用不发送。 | `draft-session.ts`、`draft-session.test.mjs` |
| D36 | **AI 优化检查解耦**：保留单一宿主入口、浮层互斥及共享请求生命周期。普通检查会话独立管理阶段、原文快照、勾选、编辑稿和待确认版本。普通检查与起草检查共享报告视图，各自提供动作；对照面板只发出操作意图，宿主接线沿用覆盖保护。行为基线见 D22、D28、D34、D35。 | `AIPolishButton.tsx`、`check-revision.ts`、`PromptCheckReport.tsx`、`PromptCheckRevisionPanel.tsx` |
| D37 | **模板增强解耦**：模板增强会话管理增强原文、正文编辑、建议勾选和变量配置；结果视图只发出操作意图。预览、复制、试填和存库共用最终模板，试填稿只用于应用。单一宿主入口保留浮层、共享 AI 请求和 Composer 写入保护，分别沿用直接增强与起草交接的覆盖基线。 | D14、D15、D18、D34、`AIPolishButton.tsx`、`template-refine-session.ts`、`PromptTemplateResult.tsx` |
| D38 | **模板存库不是原子事务**：先创建增强原文；取消淘汰确认不创建，最终模板正文与原文逐字相同时随创建保存变量配置，不写回。写回失败保留已创建的条目及淘汰提示；重试只重发原载荷并使用原创建回执的 ID 和版本，冲突不自动覆盖。创建成功立即通知；若收到创建回执时组件已卸载，不启动写回。已发出的写回可完成，成功后播种方向并通知，不更新已卸载界面；播种失败不改判写回。 | `template-save.ts`、`capture.ts`、`ai-flow.ts` |
| D39 | **AI 请求生命周期**：每个入口只有一个同步占用，AI 与存库（含写回重试）互斥。只有当前 AI 请求可更新界面或释放占用；取消先失效再中止，由各流程返回原位置。卸载中止 AI 但不导航，不中止存库（D38）。计时按每次请求起点计算；浮层让位不使请求失效，Composer 所属变化只使普通检查失效。 | `ai-request-lifecycle.ts`、`AIPolishButton.tsx` |
| D40 | **应用判定共享，覆盖策略不共享**：应用模块按来源处理试填和覆盖，组件负责呈现结果。直接润色、增强按各自的原文快照阻止覆盖；起草及其增强沿用 D34；只有普通检查走 D35 的修订号复核与宿主写入保护。试填取消不应用，提交时才核对 Composer。 | `composer-application.ts`、`AIPolishButton.tsx` |

---

## 7. 质量门禁与验收纪律

验证门禁见 [AGENTS.md](../AGENTS.md#命令与完成标准)，复跑步骤见 [README](../README.zh.md#开发)。构建检查打包输入；smoke 执行 bundle，检查模块与插槽注册、注入顺序和源码指纹（D12）。它不是浏览器或真实 DSH 端到端测试。

组件接线用 DSH 现场验收。记录代码基线、实际点测结果、未验证项及副作用；不要把纯模块测试或历史点测当成当前现场验证。历史记录与离线评估的入口见 §9。

---

## 8. 已知取舍

- **词库入口与 `#` 浮层**：候选在屏时，词库入口拦截非指针激活（`event.detail === 0`）；指针点击不走此分支。关闭词库面板不主动恢复 `#` 候选（`PromptLibraryButton.tsx`；早期取舍见规格 §13.10-五和 P8 记录）。
- **填窗局部态**：逐键填值随弹窗卸载丢失。显式关闭词库会清除待执行动作；临时让位只可保留未提交的填窗选择。已记住的值不受卸载影响（`TemplateVariablesDialog.tsx`、`PromptLibraryButton.tsx`、D15、D31）。
- **浮层落点**：AI 结果面板锚在输入框旁，可能遮挡部分输入区（`AIPolishButton.tsx#ANCHOR`；P8 记录）。
- **设置首屏**：设置 store 先提供默认值，再用宿主配置或 HTTP 读取结果更新。因此隐藏入口在设置就绪前可能短暂出现。早期采样只代表当时的宿主和代码（`settings-store.ts`）。

[社区功能提案](proposals/2026-10-03-pending-features-from-community-plugins.md) 是历史材料，不是现行待办。

---

## 9. 术语与来源

| 术语 | 含义 |
|---|---|
| 写回缝 | 把 AI 结果写回提示词正文的**唯一**路径（`aiWriteBack: true`） |
| 悬浮层三面 | 词库面板 / AI 结果面板 / `#` 候选浮层，由 `overlay-claim.ts` 的 claim 寄存器保证同屏互斥 |
| 检查报告 | 对一份提示词输入的诊断结果，不是可应用的改稿。 |
| 普通检查会话 | 针对一次 Composer 草稿检查，从取得检查原文到勾选建议、生成改稿和确认覆盖的过程。重新检查开启新一轮。 |
| 起草检查 | 针对起草结果的检查。报告中的建议可带回起草反馈，不直接改写稿件。 |
| 增强原文 | 发起「增强为模板」时的正文快照，可来自 Composer 草稿或当前起草稿。 |
| 最终模板 | 当前编辑正文与已勾选建议合成的模板，保留变量占位符。 |
| 试填稿 | 用最终模板生成的一次性填值结果，只用于应用到 Composer，不替换最终模板。 |
| 方向记录 | meta `pl:refined-dir:<id>`，值为裸的 `original` / `refined`；空串 = 无记录 |
| 技能归属 | 本机提示词与技能目录之间的绑定。词库条目移入回收站后仍持有绑定；备份中的同名记录不构成本机归属。 |
| 技能过期 | 有技能归属，且尚待重导或提示词在技能导出后又有改动。判定见 `src/skill-badge.ts#isSkillStale`。 |
| 沉淀三入口 | 管理面板新建/编辑 · 选中文字存为提示词 · 当前草稿存为提示词 |
| 淘汰预演 | 客户端按共享键序预演受害者并确认。宿主在创建事务内核对已批准的 ID |

### 历史资料与排障

- 早期规格、P1–P8 计划与现场记录、上游分析已从当前树移除。需要追溯时，从 `8a759cc` 查阅原 `docs/` 树；`71f1fd9` 记录了退役原因。§6 中以 `§13` 开头的条目编号指向早期规格。
- [起草关键假设评估](../evaluations/draft-assumptions/README.md) 保留冻结基线、离线回放及证据边界，不代表真实模型或当前 DSH 现场验收。
- 模型配置与日志用法见 [AI 模型排障](troubleshooting-ai.md)。
