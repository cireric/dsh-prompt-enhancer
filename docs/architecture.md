# dsh-prompt-enhancer · 架构与决策（活文档）

本文是运行时结构、接口边界和设计决策的导航。硬约束见 [AGENTS.md](../AGENTS.md)，实现以链接的源码和测试为准。§6 保留决策编号；术语与历史材料见 [§9](#9-术语与来源)。

---

## 1. 这是什么

插件围绕提示词的管理、AI 优化、沉淀与复用。功能和来源见[中文 README](../README.zh.md)。

**产品边界**：词库在同一个 `DSH_HOME` 下共享，不按会话或工作区分库。提示词只在用户显式操作时写入 Composer；读取当前会话以排序推荐，不等于绑定条目或自动捕获。插件不注册 `systemPrompt` section，不维护版本历史，也不提供技能反向导入、自动同步、斜杠命令或自动更新。

---

## 2. 运行时结构

- **宿主入口**：[src/index.ts](../src/index.ts) 导出 `Config`，无静态必需服务。`webServer` 就位时注册 `/api/prompt-enhancer`，卸载时取消在途 AI 请求并撤销路由。`llm` 缺席时，模型生成返回 503、模型清单为空；`web` 缺席时，起草来源搜索返回 `unavailable`，不影响手动补资料。设置绑定见 §4.2，LLM 绑定见 D30。
- **浏览器入口**：[src/client/index.ts](../src/client/index.ts) 静态注入 `slots`、`locale`，在官方插槽注册词库、AI、`#` 候选、推荐条、侧栏入口和设置页。管理弹窗由常驻的 `shell.overlay` 托管，无需打开会话。插槽元数据与注入顺序由 [smoke 账本](../scripts/smoke.mjs) 核对。
- **可选客户端服务**：无 `uiWorkspace` 时不能选目录导出备份；无 `uiConversation` 时只按当前草稿推荐；无配置表单绑定时，通过 HTTP 读取和写入设置。词库变更通过同页 `window` 事件通知组件重拉，不跨标签页同步（D6）。

**构建契约**：[scripts/build.mjs](../scripts/build.mjs) 生成 Node ESM 宿主入口 `lib/index.js`，并将 CJS 客户端入口 `lib/client.js` 包装为 `window.__ModuleLoader__.load({ id, factory })`。`id` 取包名，工厂直接返回 `{ apply, inject }`，不暴露 CJS interop getter。宿主依赖的 external 规则见 [AGENTS.md](../AGENTS.md#硬约束)。

---

## 3. 数据与存储

SQLite 主库位于 `$DSH_HOME/prompt-enhancer/db/prompts.db`（[paths.ts](../src/host/paths.ts)）。[store.ts](../src/host/store.ts) 首次访问时打开数据库，初始化 `prompts`、`trash`、`tags`、`meta`，在事务内执行幂等 `MIGRATIONS` 并记录 `schemaVersion`。数据库和备份版本分别见 `types.ts` 的 `SCHEMA_VERSION`、`BACKUP_VERSION`。

- **AI 写回与回滚**：普通补丁不能直接写 `sourceBody`、`aiRefined` 或 `aiRefinedAt`。正文发生变化且无已记录原文时，`updatePrompt` 才根据 `aiWriteBack` 保留旧正文。回滚只交换 `body` 与 `sourceBody`，不是恢复整条记录。方向取客户端记录；缺失时用中性标签，不猜哪侧是原文。
- **淘汰**：客户端预演和宿主共用 [eviction-order.ts](../src/eviction-order.ts) 的键序。宿主在同一事务核对确认名单、创建条目、同步标签和执行淘汰；本次新条目不参与淘汰（D23）。
- **条目元数据**：[prompt-meta.ts](../src/client/utils/prompt-meta.ts) 枚举每条目的方向、技能描述符和模板填值记忆键。软删除不清键；永久删除、淘汰、导入覆盖由客户端分别收尾。导入的清理边界见 D32。
- **JSON 备份**：`exportPrompts` 只导出在库条目和标签，不是整个 SQLite 库。确认导入按 ID 覆盖，客户端使用事务回执清理元数据；备份不能认领技能目录，详见 D32–D33。

---

## 4. 接口面

### 4.1 HTTP（单条 prefix 路由）

[routes.ts](../src/host/routes.ts) 的 `ROUTE_SPECS` 是 HTTP 方法和路径的真源，由 [api.test.mjs](../tests/api.test.mjs) 按 `pattern` 核对覆盖。客户端统一通过 [api.ts](../src/client/utils/api.ts) 读取 `{ ok: true, data }` 或 `{ ok: false, error }`。普通失败用字符串；模型能力失败用 `{ code, message? }`（`message` 仅开发构建下发）；技能冲突用 `{ message, conflict? }`。请求无效、跨源证据拦截、资源缺失、写入冲突、未预期异常和能力不可用分别对应 400、403、404、409、500 和 503。

**跨源写入闸**（D9）：除 GET、HEAD、OPTIONS 外，先检查 `Sec-Fetch-Site` 和 `Origin`，再读请求体。跨站标记、`Origin: null`、无法解析的 `Origin`，或 `Origin` 的 host（含端口）与 `Host` 不符会被拒绝。没有跨站标记且未带 `Origin` 的请求不被此闸拒绝；它防护带跨源证据的写入，不做认证。

| 组 | 路由 |
|---|---|
| 提示词 | `GET /prompts`（`q`/`tag`/`sort=default\|updated\|used\|created`）· `POST /prompts`（需要淘汰时携带 `approvedEvictions`）· `GET/PUT/DELETE /prompts/:id` · `POST /prompts/:id/use` · `POST /prompts/:id/rollback` |
| 标签 | `GET /tags` · `POST /tags` · `PUT /tags/:from`（改名）· `DELETE /tags/:name`（在用保护） |
| 回收站 | `GET /trash` · `POST /trash/:id/restore` · `DELETE /trash/:id` · `DELETE /trash`（回 `{removed, ids}`） |
| AI | `GET /ai/providers` · `POST /ai/polish` · `POST /ai/check`（原文引用、问题、建议）· `POST /ai/check/revise`（已选建议 → 改稿与待确认问题）· `POST /ai/draft`（首次生成、澄清后出稿与反馈改写）· `POST /ai/draft/search`（只查关键词）· `POST /ai/refine`（`title`、`tags`、`summary`、`body`、可选 `suggestions`）· `POST /ai/skill-descriptor` |
| 设置 | `GET /settings` · `PUT /settings`（写入后清 AI 路由缓存） |
| 导入导出 | `POST /export/save`（宿主生成文件名 + 目录来自 `uiWorkspace.pickDirectory()`）· `POST /import`（`{backup, confirm}`，未确认只回预览） |
| meta | `GET/PUT/DELETE /meta/:key`（模板变量记忆等客户端键名的通用通道，宿主不认识键名约定） |
| 技能 | `POST /skills/export`（可确认的 409 返回 `error.conflict: { name, token }`；重试携带 `conflictToken`） |

### 4.2 设置

[settings.ts](../src/host/settings.ts) 定义 volatile `Config`；宿主按 profile 条目 ID 保存，`loader/volatile-update` 刷新模型目录缓存。HTTP 写设置走 `ctx.settings.update`。[settings-store.ts](../src/client/utils/settings-store.ts) 订阅 `configForms`：优先识别固定条目，动态 ID 按设置键签名匹配；没有绑定时通过 HTTP 降级，读取每个缺失周期只试一次。初始默认值可用于渲染，但未就绪的快照不能当作淘汰预演的权威上限。

设置键的归一化见 [settings-shape.ts](../src/settings-shape.ts)，默认值见 [types.ts](../src/types.ts)。

### 4.3 客户端组件与纯逻辑的分工

组件连接宿主插槽、状态与视图。业务判定可直接在 Node 中测试；接线验收见 §7。

| 查找 | 模块 |
|---|---|
| 检查、起草与模板结果 | [check-revision.ts](../src/client/utils/check-revision.ts)、[draft-session.ts](../src/client/utils/draft-session.ts)、[template-refine-session.ts](../src/client/utils/template-refine-session.ts) 管各自会话。当前报告决定「检查新版」的来源，发起请求的来源决定失败或取消后的去向（[ai-round-trip.ts](../src/client/utils/ai-round-trip.ts)，D41）。 |
| 请求与存库 | [ai-request-lifecycle.ts](../src/client/utils/ai-request-lifecycle.ts) 管并发和取消；[template-save.ts](../src/client/utils/template-save.ts) 编排创建与写回（D38–D39）。 |
| 应用到 Composer | [composer-application.ts](../src/client/utils/composer-application.ts) 管 AI 应用；[library-insertion.ts](../src/client/utils/library-insertion.ts) 管词库选择器。词库选择器和普通检查复用 [insert.ts](../src/client/utils/insert.ts) 的宿主写入保护，不代表其他 AI 入口也使用相同覆盖策略（D24、D31、D40）。 |
| 浮层互斥 | [overlay-claim.ts](../src/overlay-claim.ts) 管词库选择器、AI 面板和 `#` 候选；[ui-state.ts](../src/client/utils/ui-state.ts) 持有 claim。推荐条和管理弹窗不加入该寄存器。 |

---

## 5. AI 子系统

| 面 | 行为与源码入口 |
|---|---|
| 候选发现 | [ai.ts](../src/host/ai.ts) 的 `discoverCandidates` 先尝试显式设置的 provider/model，不要求它出现在目录里。自动选择或回退时按宿主顺序惰性查询，每个 provider 取一个模型（优先 ID 含 `chat` 或 `deepseek`，否则取第一个），目录缓存 30s。 |
| 调用与取消 | `attemptAllCandidates` 通过进程内串行锁运行单次尝试；每次上限取单次配额与排队后剩余预算的较小值。[AiBudget](../src/host/ai-budget.ts) 覆盖目录、模型元数据、排队、流式调用和重试。到期或取消会停止请求等待与后续尝试；底层流何时释放锁取决于宿主对取消信号的响应。上限见 D10，结构化输出设置见 D21。 |
| 候选验收与重试 | 传输成功且能力解析器验收后才记录 `candidate-accepted`；否则记录 `candidate-rejected` 并继续候选。`callPrompt` 可再跑一轮诊断重试：纯文本追加诊断，JSON 请求增加 `retryDiagnosis` 字段。技能描述符最多三轮，不注入诊断。错误码由 [ai-errors.ts](../src/host/ai-errors.ts) 定义，界面按 code 映射 i18n。 |
| 结果缓存 | [ai-cache.ts](../src/host/ai-cache.ts) 对 `callPrompt` 结果做进程内 LRU + TTL，以 system、user、首选路由为键。只缓存首选候选通过验收的结果；回退候选不能填充首选项，技能描述符不走结果缓存。清模型目录不等于清结果缓存。 |
| 字面校验 | 润色和模板增强保护占位符及可识别的命令、路径、权限约束；检查报告的引用须出现在原文，普通检查改稿校验原占位符；起草的假设须出现在正文（D29）。解析入口见 [ai.ts](../src/host/ai.ts) 及 `host/` 下的 [text.ts](../src/host/text.ts)、[refine.ts](../src/host/refine.ts)、[check.ts](../src/host/check.ts)、[draft.ts](../src/host/draft.ts)。 |
| 请求诊断 | [review-trace.ts](../src/host/review-trace.ts) 在正式构建也写 `$DSH_HOME/prompt-enhancer/log/review-YYYY-MM-DD.jsonl`（UTC 日期）。匹配到的 `/ai/` 请求按 `id` 串联阶段、耗时和结果；不写提示词、模型输出或错误原文。日志用法见 [AI 模型排障](troubleshooting-ai.md)。 |

**质量边界**：通过解析和字面校验并不证明原意没有改变，也不验证模型生成的事实。用户在复制、存库或应用前仍需核对结果。

---

## 6. 关键决策台账（编号 → 内容 → 出处）

| 编号 | 决策 | 出处 |
|---|---|---|
| D1 | 复用只做**主动插入**：不做 systemPrompt 注入、不做会话/工作区作用域绑定 | 本文 §1、§4.1 |
| D2 | 持续优化 = AI 优化 + 使用统计 + 可回滚；**不引入版本历史表** | 本文 §1、§3 |
| D3 | 词库只收录用户明确保存的内容，不从用量或聊天内容自学习，不自动捕获。 | 本文 §1、§9 |
| D4 | 实现路线：移植 host 存储层 + 通用组件 + 模板变量 + AI 模块，重写巨型弹窗，**只用官方插槽** | 本文 §2、`AGENTS.md` 硬约束 3 |
| D5 | 浏览器读导入文件；导出使用宿主目录选择能力，宿主负责写盘。文件和封装后的导入请求分别限长；写盘前核对导出能通过同一导入大小上限，使用唯一文件名独占创建。 | §4.1、`backup-transfer.ts#MAX_REQUEST_BODY_BYTES` |
| D6 | 同页组件用 `window` 事件通知数据变更后各自重拉；没有 WebSocket 或跨标签页词库同步。 | §2、`data-sync.ts` |
| D7 | 命名空间：包 `dsh-prompt-enhancer` / HTTP `/api/prompt-enhancer` / i18n `prompt-enhancer` / 数据 `$DSH_HOME/prompt-enhancer/` | 本文 §2、§3 |
| D8 | 技能导出**单向**：写 `$DSH_HOME/skills/<name>/SKILL.md` + 过期徽标 + 一键重导；**不做反向导入、不做活同步、不做项目级技能根** | 本文 §4.1（`/skills/export`） |
| §13.8-四 | AI 写回走 `PUT /prompts/:id` 的 `aiWriteBack`，仅在正文变化且无原文记录时回填；最终模板与原文相同则只创建，不生成切换入口。 | 本文 §3、D38 |
| §13.10-一 | 淘汰只考虑已有条目，本次创建的提示词不参与。 | 本文 §3 |
| §13.10-二 | 客户端预演与宿主共用淘汰键序，最后用 `id` 打破并列。 | [eviction-order.ts](../src/eviction-order.ts) |
| §13.10-四 → §13.11-一 | 浮层互斥由 claim 寄存器管理。 | 本文 §4.3 |
| §13.11-二 | 来源未知时切换，方向记录作废；丢弃切换前发起、切换后才返回的读取结果。 | [refined-direction.ts](../src/client/utils/refined-direction.ts) |
| §13.11-三 | 已有技能归属时按 `skillName` 决定目录，导出请求的 `name` 只参与首次命名。 | `store.ts#recordSkillExport` |
| §13.13 | 写回缝在存储层收口，普通补丁类型不允许直接写 AI 来源字段。 | 本文 §3、`types.ts#PROMPT_WRITABLE_KEYS` |
| dsh 0.2.0 迁移 | `Config` + `configForms` 取代旧 `settingsScope`；宿主写入改用 `ctx.settings.update`。 | 本文 §4.2 |
| 首包（已交付） | 统一 AI 错误码、诊断重试与结果缓存；推荐必须命中草稿词，使用量仅辅助排序。 | 本文 §5、[context-recommend.ts](../src/client/utils/context-recommend.ts) |
| D9 | **跨源写入闸**：在插件路由层拦截带跨源证据的写请求，不依赖宿主的其他路由做认证。 | §4.1、`routes.ts#isCrossSiteWrite` |
| D10 | 润色和技能描述符的单次尝试／宿主总预算／客户端超时分别为 30s／110s／120s；检查、检查改稿、模板增强和起草为 180s／215s／225s。候选目录单次查询上限为 30s，各阶段均受剩余总预算约束。模型探测与来源搜索有独立超时，不套用生成预算。 | 本文 §5、`ai-budget.ts`、`api.ts`、`draft-search.ts` |
| D11 | **超限响应先于关连接**：5 MiB 闸不得先 `req.destroy()`，否则客户端可能只见断连；停止读取并在 400 响应中带 `Connection: close`。 | `routes.ts#readBody`、`backup-transfer.ts#MAX_REQUEST_BODY_BYTES` |
| D12 | **产物源码指纹**：`build` 把 `src/**` 的 hash 写进 `.build-meta.json`，`smoke` 比对当前 src 并红——测试验证源码，smoke 另外确认构建产物与源码同步 | 本文 §7、`scripts/source-hash.mjs` |
| D13 | **路由清单单一真源**：`ROUTE_SPECS` 驱动 `dispatch`，测试的覆盖账本按 `pattern` 与它双向对齐（此前 dispatch 是手写 if 链、测试另有一份手抄副本） | 本文 §4.1、`routes.ts#ROUTE_SPECS` |
| D14 | Composer 左侧并排显示选择器与 AI 优化。选择器点条目后进入独立预览，可返回搜索结果。AI 优化可直接选轻度润色或增强为模板。最终模板实时合并正文与勾选建议，复制、入库与试填共用同一份结果。AI 试填未填完时须显式选择保留占位符，应用时保护已变化的草稿。 | `PromptLibraryButton.tsx`、`AIPolishButton.tsx`、`ai-flow.ts` |
| D15 | 变量说明与默认值可在 AI 结果的「条目信息」或管理器编辑页配置。AI 试填使用当前配置，最终正文与变量配置一同写入词库。配置与正文同存，随回收站和 JSON 备份往返。默认值跟随模板。显式记住的填值以模板 ID 单独保存，恢复默认值后确认插入会清除该模板的填值记忆。旧的共享填值不会自动带入。 | `TemplateVariablesDialog.tsx`、`store.ts` |
| D16 | 选择器空查询时优先列出最近插入的条目。方向键聚焦结果，Enter 打开预览，Esc 返回列表。最终模板在同一份文本里标记新增变量与勾选建议，缺少原变量时可直接返回编辑。 | `PromptLibraryButton.tsx`、`AIPolishButton.tsx` |
| D17 | AI 菜单默认高亮轻度润色。检查基于草稿快照，要求模型只报告影响执行或验收的实质问题，附逐字引用及可直接使用的改法或具体待确认问题。空报告说明未运行提示词。检查结果只读，可单独复制一条建议正文，草稿变化后允许检查新版。 | `AIPolishButton.tsx`、`ai.ts`、`check.ts` |
| D18 | Composer 为空时仍可开启 AI 菜单，仅启用并高亮「从想法起草」。场景示例默认收起，只能填入空白想法，不改补充输入或触发请求。起草最多一轮澄清，可跳过。编辑后的结果可直接交给检查与模板增强，返回时保留起草状态。应用时以进入起草前的 Composer 为对照，变化时要求显式确认替换。 | `AIPolishButton.tsx`、`PromptDraftForm.tsx`、`draft.ts` |
| D19 | 起草将影响结论的外部事实写成正文中的核实步骤，追问聚焦用户偏好。用户可主动通过宿主 `ctx.web.search()` 查询来源，发送范围限于独立填写的关键词。搜索不可用时可自行补充链接或摘录并继续起草。 | `draft-search.ts`、`draft.ts`、`PromptDraftForm.tsx` |
| D20 | AI 请求的最终错误码只描述用户收到的结果。请求日志保留每轮候选的结束状态、插件计时器是否触发和校验结果，供定位更早的故障。 | 本文 §5、`review-trace.ts` |
| D21 | 检查、检查改稿、模板增强和起草优先使用候选模型声明的 `off` 推理档位。关闭推理时，检查报告分配 2048 个输出 token，检查改稿、增强或起草分配 4096 个。模型未声明该档位时使用 8192 输出 token，为共用预算的推理和 JSON 正文留出空间。起草在接受候选前校验完整结果，截断或结构错误可继续尝试下一候选或诊断重试。 | `ai.ts#collectText`、`ai.ts#draftPromptCore` |
| D22 | AI 面板等待时显示已用时长。取消返回发起处：操作菜单、起草面板或生成改稿前的检查报告。HTTP 响应提前关闭或插件卸载时，宿主取消在途等待，不启动后续候选或重试。 | `AIPolishButton.tsx`、`routes.ts#dispatch`、本文 §5 |
| D23 | 写入冲突保护。管理器仅提交改动字段，保存和换稿携带宿主签发的 `contentVersion`。旧调用仍可省略该字段。创建需要淘汰时必须提交已确认的 ID，名单过期返回 409。确认导入按同 ID 覆盖在用条目或回收站条目，恢复遇到历史同 ID 冲突时保留两份并返回 409。 | `store.ts#createPromptWithEvictions`、`store.ts#importPrompts`、`prompt-edit.ts` |
| D24 | 覆盖使用宿主整体替换正文和内联引用，不改独立附件。追加和替换尾部令牌用区间插入保留内联引用。公开输入状态未暴露引用选区卡片的完整坐标，含此类卡片的尾部编辑可能被宿主拒绝，界面保留草稿并提示失败。 | `insert.ts` |
| D25 | 按实际落盘名识别同名归属，历史重复项不自动选主。宿主将确认凭据绑定到目标名、待导出内容、竞争归属和目标文件版本；状态变化时旧凭据不可写盘，旧布尔标记不授权覆盖。确认后转移唯一归属并撤销回收站旧归属。写盘失败回滚数据库归属；SQLite 与文件系统不共享原子提交。 | `routes.ts`、`store.ts#recordSkillExport`、`skills.ts#exportSkill` |
| D26 | 起草接收可选的下游执行环境，按模型能看到的上下文及可用工具生成自包含正文，交付前检查约束、能力和验收条件。按反馈改写时，同一接口携带生成本稿的输入、当前编辑稿及反馈，直接返回新版。失败或取消保留正文和反馈。 | `PromptDraftForm.tsx`、`draft.ts`、`ai.ts#draftPromptCore` |
| D27 | 起草从已有信息补齐交付要求和验收条件，在正文写明影响执行的默认值和待补材料。一轮澄清只处理会改变任务的用户选择。结论依赖外部事实时，正文按需增加一手来源溯源、适用性检查和证据强度约束。 | `ai.ts#draftPromptCore` |
| D28 | 起草按单次任务、可复用工作流或长期角色组织正文，并展示生成时理解的目标和执行前待补材料。起草面板触发的检查对照该稿的原始输入、澄清和按顺序采用的反馈。可把当前检查报告中的单条建议带回反馈框，由用户编辑并提交。 | `draft.ts`、`ai.ts#checkPromptCore`、`AIPolishButton.tsx` |
| D29 | 起草的关键假设须逐字出现在正文；缺失则拒绝候选，避免自动加入可能冲突的默认值。待补材料和待核实步骤不同：解析器会将正文中缺失的这些步骤去重后追加到正文。校验不判断语义忠实性。 | `draft.ts#parseDraftResult`、`ai.ts#draftPromptCore` |
| D30 | 每次 LLM 注入持有独立绑定，卸载只释放自身；多实例共享同一服务对象时也不相互清空。当前绑定释放后恢复最近仍存活的绑定，最后一个释放后停用 AI。绑定切换时清除模型目录缓存。 | `ai.ts#registerLlm`、`index.ts#apply`、`host-lifecycle.test.mjs` |
| D31 | Composer 词库选择器在填值记忆与未缓存的条目 ID 查询后复核同一确认。追加用最新草稿；覆盖和插入并发送遇草稿正文或修订号变化时，展示最新草稿并要求再次确认。发送还复核有序附件 ID，展示数量并提示核对附件栏。查询只核实条目仍在库，不比较版本、不替换已确认正文，也不与草稿写入构成原子操作；缺失保留查询与草稿，核验失败保留操作供重试。关闭、切换会话或失去浮层显示权使已提交的确认失效，但不撤销独立的填值记忆操作。锁定期不覆盖；拒写不发送、不记用量。 | `library-insertion.ts`、`PromptLibraryButton.tsx` |
| D32 | 确认导入的 `overwrittenIds` 由写入事务确定，覆盖词库和回收站；预览只有统计。客户端只按有效回执在后台清理已有元数据，落库后的清理与通知不依赖面板是否仍挂载。回执中的 `preservedSkillIds` 标出应保留重导描述符的覆盖项；缺少此字段时不删描述符。清理与导入不原子；旧宿主缺覆盖回执时不猜清理名单。 | `store.ts#importPrompts`、`transfer.ts#confirmBackupImport` |
| D33 | 普通提示词 PUT 带归属名或导出时间返回 400，整次不写。备份仍可携带旧字段，但导入不使用它们认领技能，也不写技能文件。同 ID 覆盖保留本机归属并标为待重导；词库和回收站有同 ID 且分别绑定不同技能时，整批导入返回 409，保留两份。导入的创建和编辑时间最多取本机确认导入时间，避免来源时钟偏快导致后续导出仍显示过期。 | `routes.ts`、`store.ts#importPrompts` |
| D34 | 起草会话不依赖 React。澄清上限按生成流程计，回答或跳过后重试不再追问；从想法页再生成开启新流程。生成依据只在成功换稿时更新，重新生成不继承旧反馈，改写成功才追加本次反馈。建议只对同一份生成结果和逐字相同的正文有效，带入只预填反馈。起草和增强共用进入起草时的 Composer 基线；确认前再变化需展示最新内容并再次确认，应用不发送。 | `draft-session.ts`、`draft-session.test.mjs` |
| D35 | 普通 Composer 检查默认不选建议；只把选中内容与检查原文交给改稿接口。结果保留原占位符，待用户决定的问题不写进正文。编辑稿可复制或显式覆盖输入框，检查快照只读。覆盖基于正文和修订号复核，变化后先展示待替换内容并确认，不发送或写库。 | `check.ts`、`check-revision.ts`、`AIPolishButton.tsx` |
| D36 | **AI 优化检查解耦**：保留单一宿主入口、浮层互斥及共享请求生命周期。普通检查会话独立管理阶段、原文快照、勾选、编辑稿和待确认版本。普通检查与起草检查共享报告视图，各自提供动作；对照面板只发出操作意图，宿主接线沿用覆盖保护。行为基线见 D22、D28、D34、D35。 | `AIPolishButton.tsx`、`check-revision.ts`、`PromptCheckReport.tsx`、`PromptCheckRevisionPanel.tsx` |
| D37 | **模板增强解耦**：模板增强会话管理增强原文、正文编辑、建议勾选和变量配置；结果视图只发出操作意图。预览、复制、试填和存库共用最终模板，试填稿只用于应用。单一宿主入口保留浮层、共享 AI 请求和 Composer 写入保护，分别沿用直接增强与起草交接的覆盖基线。 | D14、D15、D18、D34、`AIPolishButton.tsx`、`template-refine-session.ts`、`PromptTemplateResult.tsx` |
| D38 | **模板存库不是原子事务**：先创建增强原文；取消淘汰确认不创建，最终模板正文与原文逐字相同时随创建保存变量配置，不写回。写回失败保留已创建的条目及淘汰提示；重试只重发原载荷并使用原创建回执的 ID 和版本，冲突不自动覆盖。创建成功立即通知；若收到创建回执时组件已卸载，不启动写回。已发出的写回可完成，成功后播种方向并通知，不更新已卸载界面；播种失败不改判写回。 | `template-save.ts`、`capture.ts`、`ai-flow.ts` |
| D39 | **AI 请求生命周期**：每个入口只有一个同步占用，AI 与存库（含写回重试）互斥。只有当前 AI 请求可更新界面或释放占用；取消先失效再中止，由各流程返回原位置。卸载中止 AI 但不导航，不中止存库（D38）。计时按每次请求起点计算；浮层让位不使请求失效，Composer 所属变化只使普通检查失效。 | `ai-request-lifecycle.ts`、`AIPolishButton.tsx` |
| D40 | **应用判定共享，覆盖策略不共享**：应用模块按来源处理试填和覆盖，组件负责呈现结果。直接润色、增强按各自的原文快照阻止覆盖；起草及其增强沿用 D34；只有普通检查走 D35 的修订号复核与宿主写入保护。试填取消不应用，提交时才核对 Composer。 | `composer-application.ts`、`AIPolishButton.tsx` |
| D41 | **请求来源与报告归属分开**：检查与模板增强在发起时认定来源（Composer 或起草稿），据此交付结果并决定取消、失败后的去向。当前报告的归属决定报告动作及「检查新版」的请求来源。重开起草报告不改写最近一次请求的来源；失败重试保留原操作与来源。失效请求不能更新视图。 | `ai-round-trip.ts`、`AIPolishButton.tsx`、`ai-round-trip.test.mjs` |

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

下表用于阅读现行实现与历史决策；领域建模时另查根目录的 [GLOSSARY.md](../GLOSSARY.md)。

| 术语 | 含义 |
|---|---|
| 写回缝 | 把 AI 结果写回提示词正文的**唯一**路径（`aiWriteBack: true`） |
| 悬浮层三面 | 词库选择器 / AI 面板 / `#` 候选，见 §4.3；不含管理弹窗。 |
| 检查报告 | 对一份提示词输入的诊断结果，不是可应用的改稿。 |
| 普通检查会话 | 针对一次 Composer 草稿检查，从取得检查原文到勾选建议、生成改稿和确认覆盖的过程。重新检查开启新一轮。 |
| 起草检查 | 针对起草结果的检查。报告中的建议可带回起草反馈，不直接改写稿件。 |
| 增强原文 | 发起「增强为模板」时的正文快照，可来自 Composer 草稿或当前起草稿。 |
| 最终模板 | 当前编辑正文与已勾选建议合成的模板，保留变量占位符。 |
| 试填稿 | 用最终模板生成的一次性填值结果，只用于应用到 Composer，不替换最终模板。 |
| 方向记录 | meta `pl:refined-dir:<id>`，值为裸的 `original` / `refined`；空串 = 无记录 |
| 技能归属 | 本机提示词与技能目录之间的绑定。词库条目移入回收站后仍持有绑定；备份中的同名记录不构成本机归属。 |
| 技能过期 | 有技能归属，且尚待重导或提示词在技能导出后又有改动。判定见 `src/skill-badge.ts#isSkillStale`。 |
| 沉淀 | 用户将提示词存入词库：手动新建、保存选中文字或当前草稿，也可把增强后的模板存为条目。 |
| 淘汰预演 | 客户端按共享键序预演受害者并确认。宿主在创建事务内核对已批准的 ID |

### 历史资料与排障

- 早期规格、P1–P8 计划与现场记录、上游分析已从当前树移除。需要追溯时，从 `8a759cc` 查阅原 `docs/` 树；`71f1fd9` 记录了退役原因。§6 中以 `§13` 开头的条目编号指向早期规格。
- [起草关键假设评估](../evaluations/draft-assumptions/README.md) 保留冻结基线、离线回放及证据边界，不代表真实模型或当前 DSH 现场验收。
- 模型配置与日志用法见 [AI 模型排障](troubleshooting-ai.md)。
