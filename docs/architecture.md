# dsh-prompt-enhancer · 架构与决策（活文档）

- 更新：2026-10-03 · 对应代码基线 `eb03968` · 版本 `0.1.0`（`package.json`，未发布 npm）
- **定位**：本文件是仓库的**架构事实入口**——把「运行时结构 · 设计决策 · 已知取舍 · 当前能力面」收在一处。任何设计意图与本文冲突时，以**代码**为准（本文标注了出处），代码与 `docs/superpowers/specs/` 冲突时以代码为准并回头订正本文件。
- **权威链**：硬规则看 `AGENTS.md`（它指向本文件）· 设计意图看本文件 · 历史裁决看 `docs/superpowers/specs/`（下文 §编号即它的章节号，该目录已冻结、只作追溯）· 现场证据看 `docs/superpowers/plans/*-acceptance.md`
- 约束（必须遵守）：仓库根 `AGENTS.md`（14 条硬约束）与全局 `~/.dsh/AGENTS.md`

---

## 1. 这是什么

一个 DSH Web 插件：把提示词本身管起来——**管理 → AI 优化 → 沉淀 → 复用**的闭环。基于上游 `master1Sun/dsh-prompt-library` v0.16.0（MIT）移植并重写，剔除人格（SOUL）、插件市场、公告、成就、看板等模块，只保留提示词相关能力。

**能力面**（12 项，均有代码与验收）：词库 CRUD/搜索/排序/标签/使用统计（双入口）· 复用（插入 / 覆盖 / 插入并发送 + `#` 浮层实时筛选）· 模板变量（`{{变量}}` 填充弹窗 + 记住上次填值）· AI 润色（可选保留变量）· 一键完善（标题/标签/摘要/正文）· 用途摘要 · 原文↔优化稿回滚 · 沉淀三入口（面板新建/编辑、选中文字、当前草稿）· 标签管理 · 回收站（软删/恢复/永久删/清空）· 导入导出（预览+确认）· 上下文推荐 · 设置页 · 技能导出（单向 + 过期徽标 + 一键重导）

**产品承诺**：`systemPrompt` section 数 **恒为 0**（`src/index.ts:21`）。任何提示词文本都只经用户显式触发的插入进入 composer，绝不注入系统提示词。

**明确不做**（本文 §1 与 `AGENTS.md` 硬约束 2/5）：会话级注入、技能反向导入、活同步引擎、自学习/自动捕获、版本历史表、WebSocket、斜杠命令、插件市场/公告/成就/宠物、自动更新。

---

## 2. 运行时结构

```
DSH web host
├── dsh-prompt-enhancer (host)   src/index.ts（唯一装配点，86 行）
│   ├── export Config = PromptEnhancerSettingsSchema   ← dsh 0.2.0：设置即插件 Config
│   ├── ctx.inject(["llm"])        → registerLlm()     缺失 ⇒ AI 路由 503，其余功能不受影响
│   ├── ctx.inject(["webServer"]) → 单条 prefix 路由 /api/prompt-enhancer（27 条逻辑路由）
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
| schema 演进 | `SCHEMA_VERSION = 2` + `MIGRATIONS` 数组，迁移**幂等**（先探测再 ALTER，不允许「失败就吞」） | `src/types.ts:15`、`src/host/store.ts:76` |
| 存储层解耦 | `store.ts` **不 import 任何宿主能力**（cordis/服务），故可脱离 `dsh` 单测 | 硬约束 12 |
| 测试隔离 | 靠环境变量把 `DSH_HOME` 指向临时目录，**不加 test-only API**；`paths.ts` 全部调用期求值 | 硬约束 13 |
| 回滚语义 | `sourceBody` 存 AI 优化前原文，`POST /prompts/:id/rollback` 执行 **swap(body, sourceBody)**，可反复点 | `store.ts:560-568` |
| 写回缝唯一 | 三 AI 字段（`sourceBody`/`aiRefined`/`aiRefinedAt`）**唯一写入者**是 `updatePrompt(…, { aiWriteBack: true })` 的内部派生；补丁类型收窄到 6 键，客户端传不进来 | `types.ts:79-89`、`store.ts:497-502`、spec §13.13 |
| 淘汰键序 | `(aiRefined asc, lastUsedAt asc, createdAt asc, id asc)` 的**唯一实现**在 `src/eviction-order.ts`，宿主真实淘汰与客户端预检共用，防两端漂移（D-1 的土壤） | `eviction-order.ts:33` |
| 淘汰豁免 | 刚创建的条目 `exceptId` 豁免——否则新项（`aiRefined=false, lastUsedAt=0`）是候选最小元，会被自己的创建请求删掉 | `routes.ts:168`、`store.ts:863` |
| 方向不猜 | 「当前 body 是哪一侧」只从 meta `pl:refined-dir:<id>` 读；**无记录 ⇒ 中性且不落库**（`aiRefined` 不参与推断——它只说明「发生过一次写回」） | `refined-direction.ts:44-96`、spec §13.11-二 |
| meta 键约定 | `pl:<用途>:<id>`（如 `pl:refined-dir:<id>` / `pl:skill-descriptor:<id>`）；不可逆删除才清键，软删除不清 | `prompt-meta.ts:24`、`refined-direction.ts:39-42` |

---

## 4. 接口面

### 4.1 HTTP（单条 prefix 路由，27 条）

信封统一 `{ ok, data }` / `{ ok:false, error }`；AI 路由的失败信封扩为 `{ ok:false, error:{ code, message } }`（code 跨层传枚举，message 仅开发诊断）。状态码：400 参数 / 403 跨源写入被拒 / 404 未找到 / 409 同名冲突 / 500 未预期 / 503 AI 或设置不可用（`routes.ts` 文件头）。

**路由清单单一真源**（2026-10-03，D13）：`routes.ts#ROUTE_SPECS` 是路由的唯一一份清单——`dispatch`
按它匹配分发，`tests/api.test.mjs` 的覆盖账本按 `pattern` 与它双向对齐（加路由不加覆盖行即红）。

**跨源写入闸**（2026-10-03，D9）：写方法（POST/PUT/DELETE）只接受同源请求——命中 `Sec-Fetch-Site: cross-site`、或 `Origin` 存在且与 `Host` 不同源（含 `Origin: null`）即 403，且**在读请求体之前**就返回。判据只认正向的跨源证据：`curl` / 脚本 / 宿主 agent 不带这些头，同源页面的写请求带 `Origin` 且与 `Host` 同值。GET 不挡（无副作用，响应本来也读不到）。

| 组 | 路由 |
|---|---|
| 提示词 | `GET /prompts`（`q`/`tag`/`sort=default\|updated\|used\|created`）· `POST /prompts`（创建后按 `maxPromptCount` 淘汰）· `GET/PUT/DELETE /prompts/:id` · `POST /prompts/:id/use` · `POST /prompts/:id/rollback` |
| 标签 | `GET /tags` · `POST /tags` · `PUT /tags/:from`（改名）· `DELETE /tags/:name`（在用保护） |
| 回收站 | `GET /trash` · `POST /trash/:id/restore` · `DELETE /trash/:id` · `DELETE /trash`（回 `{removed, ids}`） |
| AI | `GET /ai/providers` · `POST /ai/polish` · `POST /ai/refine` · `POST /ai/skill-descriptor` |
| 设置 | `GET /settings` · `PUT /settings`（写入后清 AI 路由缓存） |
| 导入导出 | `POST /export/save`（宿主生成文件名 + 目录来自 `workspaces.pickDirectory`）· `POST /import`（`{backup, confirm}`，未确认只回预览） |
| meta | `GET/PUT/DELETE /meta/:key`（模板变量记忆等客户端键名的通用通道，宿主不认识键名约定） |
| 技能 | `POST /skills/export`（同名目录非本插件 → 409 + `conflictConfirmed` 重试） |

### 4.2 设置（13 键，dsh 0.2.0 契约）

设置即**插件 Config**：`export const Config = PromptEnhancerSettingsSchema`（`src/index.ts:44`），宿主按 patch 条目 id 投影设置页并写回 profile；volatile 变更经 `loader/volatile-update` 到达运行中的 fiber（不重挂载）。客户端读的是 `ctx.configForms`，条目 id 由 13 键签名自解析（super-injector 注入路径给随机 id，写死会写不中）。

`src/settings-shape.ts:25-33` 是**唯一真源**：`aiProvider` `aiModel` `panelWidth` `panelHeight` `showComposerButton` `composerButtonIconOnly` `showAIPolishButton` `aiPolishButtonIconOnly` `hashTriggerEnabled` `contextRecommendEnabled` `selectionAddEnabled` `showSidebarButton` `maxPromptCount`。归一化逐字段回落默认值（深拷贝式 `normalizeSettings`），键集 zh/en 在 i18n 类型面同值。

### 4.3 客户端组件与纯逻辑的分工

`node --test`（Node 24 类型擦除）直接 import `.ts` 源码，但 `.tsx` 进不去 ⇒ **判定一律下沉到纯模块**，组件只做接线：`ai-flow`（写回缝编排 + 错误分类）· `refined-direction`（方向判定/翻转/标注映射）· `overlay-claim`（三个浮层的互斥 claim 寄存器）· `context-recommend`（推荐打分）· `eviction`（淘汰预演）· `template` / `insert` / `capture` / `transfer` / `skill-export` / `search-match` / `ui-state` / `settings-store` / `icon-only` / `err-text` / `skill-badge` / `skill-name` / `skill-description`。

---

## 5. AI 子系统

| 面 | 现状 | 出处 |
|---|---|---|
| 模型路由 | 设置里的 provider+model 优先（需核验可用）→ 否则遍历 provider、每 provider 取 `/chat\|deepseek/i` 命中的模型，去重成有序候选；30s TTL 缓存 | `ai.ts:186-224` |
| 调用 | 全局**串行锁**（同时只允许一个 LLM 调用，防并发打爆额度）· 每次尝试超时 = **min(30s, 剩余预算)** · `AI_MAX_TOKENS = 2048` · `temperature 0.4` | `ai.ts#collectText`、`ai-budget.ts` |
| 总预算 | 一次能力共享一个 `AiBudget`（`AI_TOTAL_BUDGET_MS = 110s`，**严格小于**客户端 120s）；候选轮询与诊断重试都在预算内，耗尽即停手（不再发请求）。预算从能力入口起算 ⇒ 串行锁排队也算在里面 | `ai-budget.ts`、`ai.ts#polishPromptBodyCore` |
| 失败码 | 7 值枚举 `no-llm` / `route` / `timeout` / `empty-output` / `parse` / `schema-mismatch` / `unknown`，跨层传 code、client 走 i18n 字典（`ai.code.*`） | `ai-errors.ts:14-21` |
| 重试 | `callLlmWithRetry`：候选轮询；诊断重试**只重试一次**（把失败原因 + 上次输出问题摘要拼进重试 prompt），**文案按能力分形**——润色是纯文本口径（"直接输出正文"，不得出现 JSON 字样），完善/摘要/技能描述符仍要求 JSON 对象。**重试不许叠加**（Issue #6 收口：技能描述符 3 轮 = 恰 3 次调用） | `ai.ts#callLlmWithRetry`、`ai-errors.ts#failureDiagnosis` |
| 结果缓存 | 读穿式 LRU + TTL：键 = hash(system + user + route)，TTL 30 分钟、上限 50 条、重启即清；失败不入缓存 | `ai-cache.ts:13-14,48-56` |
| 输出后处理 | 剥套话（整体代码围栏 + 首尾套话行）**并把被剥的行写进诊断日志** | `text.ts:71-123` |
| 客户端超时 | AI 路由 120s（用户裁定）· 探测 15s · 清键 15s；`TimeoutError` 按名字判定，探测超时带 `probe` 标记以区分文案 | `api.ts:11-35,141` |

**已识别的质量缺口**（见 `docs/proposals/2026-10-03-…md` B1/B2）：润色的产出**没有任何事实/长度校验**——system prompt 里只有祈使句（`ai.ts:279-280`）。

---

## 6. 关键决策台账（编号 → 内容 → 出处）

| 编号 | 决策 | 出处 |
|---|---|---|
| D1 | 复用只做**主动插入**：不做 systemPrompt 注入、不做会话/工作区作用域绑定 | 本文 §1、§4.1 |
| D2 | 持续优化 = AI 优化 + 使用统计 + 可回滚；**不引入版本历史表** | 本文 §1、§3 |
| D3 | 沉淀 = 手动三入口；**无自学习/自动捕获**（上游的自动捕获是死代码） | 本文 §1 |
| D4 | 实现路线：移植 host 存储层 + 通用组件 + 模板变量 + AI 模块，重写巨型弹窗，**只用官方插槽** | 本文 §2、`AGENTS.md` 硬约束 3 |
| D5 | 导入走浏览器 `<input type=file>` 客户端读文件；导出走 `workspaces.pickDirectory()` + `POST /export/save`；**不自建 `/fs/*` 路由** | 本文 §4.1 |
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
| D10 | **AI 总预算**：一次能力共享 110s 墙钟预算（< 客户端 120s），每次尝试 = min(30s, 剩余)，耗尽即停手；诊断文案按能力分形（润色=纯文本） | 本文 §5、`ai-budget.ts`、`ai-errors.ts` |
| D11 | **超限响应先于关连接**：5 MB 闸不得先 `req.destroy()`（会连 socket 一起拆，客户端只见 EPIPE）；改为停止读取 + `Connection: close`，让 400 正常写出 | 本文 §4.1、`routes.ts#readBody` |
| D12 | **产物源码指纹**：`build` 把 `src/**` 的 hash 写进 `.build-meta.json`，`smoke` 比对当前 src 并红——「改完 src 不重建就提交」是本仓唯一能骗过其它所有门的失效模式（`npm test` 测 src、`smoke` 测 lib） | 本文 §7、`scripts/source-hash.mjs` |
| D13 | **路由清单单一真源**：`ROUTE_SPECS` 驱动 `dispatch`，测试的覆盖账本按 `pattern` 与它双向对齐（此前 dispatch 是手写 if 链、测试另有一份手抄副本） | 本文 §4.1、`routes.ts#ROUTE_SPECS` |

---

## 7. 质量门禁与验收纪律

```sh
npm run verify      # 四道门一次跑满（= typecheck && test && build && smoke）；提交前必须跑它
npm run typecheck   # tsc --noEmit
npm test            # node --test（45 个用例文件、460 条用例）
npm run build       # lib/index.js + lib/client.js（同时把源码指纹写进 .build-meta.json）
npm run smoke       # 真实执行 client bundle：注册 id、7 个插槽的账本顺序、inject 段序、导出形状、
                    # 产物只由 src/ 组成（metafile 闸门）、lib 与 src 同代（源码指纹）
```

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
| 淘汰预演 | 客户端按宿主同键序预演受害者并二次确认（真实删除仍由宿主执行，结果以响应里的 `evicted` 为准） |

上游参考分析（功能对照、删除清单、实测异常）保留在 `docs/analysis-dsh-prompt-library/`；规格全文与 §13 自检收敛记录保留在 `docs/superpowers/specs/`。
