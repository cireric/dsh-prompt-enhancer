# dsh-prompt-enhancer 设计规格

- 日期：2026-09-24
- 状态：**已定稿**（2026-09-24 复核通过）
- 基线：[`master1Sun/dsh-prompt-library`](https://github.com/master1Sun/dsh-prompt-library) v0.16.0（MIT）
- 项目根目录：`.（本仓库根，即 dsh-prompt-enhancer/）` —— **本文档所有路径均为项目根相对路径**，不写死盘符或用户目录
- 宿主侧路径统一写作 `$DSH_HOME`（DSH 主目录，默认 `~/.dsh`；由环境变量 `DSH_HOME` 提供）

---

## 0. 背景与目标

`dsh-prompt-library` 是一个功能很丰富的 DSH Web 插件（host 15600 行 / 65 文件），同时包含提示词管理、AI 优化、人格定制、会话级技能注入、Skill 导入导出、插件推荐等模块。

本项目产出 **`dsh-prompt-enhancer`**：只保留**提示词本身**相关的能力，覆盖「管理 → AI 优化 → 沉淀 → 复用 → 持续优化」这条闭环，其余模块整体剔除。

### 0.1 探索阶段的关键实测结论

| 结论 | 影响 |
| --- | --- |
| 「桌面宠物 / 插件市场 / QQ 机器人 / 公告 / 成就 / 看板」**六项全部不在本仓库** | 用户列出的这部分排除项无需施工，属跨插件混淆（那些功能在作者的 `dsh-file-workbench` 等其它插件里） |
| WS 通道 `/api/prompt-library/events` 在 v0.16.0 **已死**：`emitDataChanged` / `emitFillDraft` / `emitExportDownload` 三个 emit 函数**零调用点**，客户端连上后永远收不到消息 | 整个 WS 层（host `ws.ts` 328 行 + `events.ts` 73 行 + client `utils/ws.ts` 107 行 + 订阅半区）可整层删除，改用同进程 window 事件 |
| README 宣传的「自学习：自动识别复杂 prompt 并保存」是**死代码**，且不存在任何判定阈值 | 「沉淀」必须新做真实入口（本设计用手动三入口） |
| `sourceBody` / `aiRefinedAt` / `pl_prompt_versions` **全部只写不读**，没有任何回滚路由 | 「可回滚」是真实新增能力，不是接线 |
| **上下文推荐的实际触发条件与文档相反**：README/手册都写「输入框为空时推荐」，但 v0.16.0 代码是 `if (!draft.trim()) return []`——**仅在草稿非空时推荐** | 本设计按**代码实际行为**定稿（草稿非空时按输入内容叠加最近聊天上下文匹配） |
| **「沉淀 → 复用 Skill」在参考项目里是单向拷贝，不是活绑定**：`exportPromptsAsSkills` / `importSkillEntries` 只在 `routes.ts` 被调用，`updatePrompt()` 不触发任何技能写盘 → 提示词优化后已导出的 SKILL.md 静默过期且无提示 | 本设计新做「显式导出 + 过期提示」，并修掉 3 个实测缺陷（见 §6.5） |
| AI 与人格的唯一耦合点是 `withSoulSystem()` + 6 个调用点 | 人格解耦成本极低 |
| 删掉 ref 的 `deployment:persona` section 后，宿主内置的全局 `deployment:persona` 槽位会**重新生效** | 属行为变化，需在发布说明中声明 |

---

## 1. 决策记录

经逐条澄清确认：

| # | 问题 | 结论 |
| --- | --- | --- |
| D1 | 复用边界 | **仅主动插入**。不做 system prompt 注入，不做会话/工作区作用域绑定（技能导出为**单向导出**，见 D8；不做反向导入） |
| D2 | 持续优化深度 | **AI 优化 + 使用统计 + 可回滚**。不引入版本历史表 |
| D3 | 沉淀机制 | **手动三入口**：管理面板新建/编辑、选中文字存为提示词、当前草稿存为提示词 |
| D4 | 实现路线 | **混合**：移植 host 存储层 + 通用组件 + 模板变量 + AI 模块；重写巨型弹窗；只用官方插槽 |
| D5 | 导入导出 | 导入走浏览器 `<input type="file">` 客户端读文件；导出走宿主 `workspaces.pickDirectory()` + `POST /export/save`。**不使用自建 `/fs/*` 路由** |
| D6 | 数据变更同步 | 同进程 window 事件（`notifyDataChanged` / `useDataChanged`），**无 WebSocket** |
| D7 | 命名空间 | 包名 `dsh-prompt-enhancer`；HTTP 前缀 `/api/prompt-enhancer`；i18n 命名空间 `prompt-enhancer`；数据目录 `$DSH_HOME/prompt-enhancer/`；设置命名空间 `prompt-enhancer` |
| D8 | 技能导出 | **纳入**，但只做「显式单向导出 + 过期提示 + 一键重新导出」：写 `$DSH_HOME/skills/<name>/SKILL.md`；**不做反向导入、不做活同步引擎、不做 harness 技能软控制**（详见 §6.5） |

---

## 2. 范围

### 2.1 做（KEEP）

1. **词库管理**：CRUD（标题 + 正文 + 标签）、搜索、排序、标签分组、使用次数统计；**双入口**——输入框旁按钮 + 左侧下方（设置按钮旁）入口，均可打开管理面板
2. **复用**：插入（追加）/ 覆盖 / 插入并发送；`#` 触发浮层实时筛选
3. **模板变量**：`{{变量名}}` 占位，插入时填充弹窗，记忆上次填值
4. **AI 优化**：正文润色（可选保留变量）、一键完善（标题/标签/摘要/正文）、用途摘要
5. **可回滚**：保存 AI 优化前原文，支持「原文 ↔ 优化稿」双向切换
6. **沉淀三入口**：管理面板新建/编辑、选中文字浮出「存为提示词」、当前草稿存为提示词
7. **标签管理**、**回收站**（软删除 + 恢复 + 永久删除 + 清空）
8. **导入导出**：JSON 备份，导入含预览与确认
9. **上下文推荐**：草稿非空时，按「当前输入 + 最近 3 条用户消息」关键词匹配推荐提示词（最多 5 条）
10. **设置页**：AI 模型、面板尺寸、按钮显隐、`#` 触发开关、推荐开关、选中捕获开关、存储上限
11. **技能导出**：选中提示词一键导出为官方 DSH Skill；提示词改动后显示「技能已过期」并支持一键重新导出

### 2.2 不做（明确排除）

- 人格（SOUL）系统与「按工作区/项目/会话」的作用域绑定
- 会话级技能注入（把提示词注入 system prompt）、DSH Skill **反向导入**、harness 技能开关与软控制注入
- 技能与提示词的活同步引擎（改为显式导出 + 过期提示）
- 项目级技能根（`<project>/.dsh/skills`）导出（避免参考项目"猜项目根"的缺陷，见 §6.5）
- systemPrompt 注入（**section 数 = 0**）
- 自学习 / 自动捕获（无阈值判定，改为手动三入口）
- 版本历史表与任意版本回退
- WebSocket 推送、插件推荐/市场、公告、成就、看板、桌面宠物、QQ 机器人
- 自动更新 / 版本检查、定时备份
- 斜杠命令

---

## 3. 架构

### 3.1 双入口与构建

沿用参考项目已验证的构建契约（`scripts/build.mjs`，用 esbuild）：

| 产物 | 入口 | 格式 | 说明 |
| --- | --- | --- | --- |
| `lib/index.js` | `src/index.ts` | Node ESM，`platform: node` | host 入口；`@deepseek-ai/*` 全 external |
| `lib/client.js` | `src/client/index.ts` | CJS + banner/footer 包装 | 注册 `window.__ModuleLoader__.load({ id, factory })` |

关键约束（实测自 DSH 加载器）：

- **bundle 注册的 id 必须是完整包名**（`dsh-prompt-enhancer`），由 `package.json.name` 派生，不硬编码
- client bundle 的 footer 必须把 `module.exports` 重写为纯净的 `{ apply, inject }`
- `react` / `react/jsx-runtime` / `@deepseek-ai/*` 一律 external，运行时经 factory 的 `require` 解析
- `package.json` 的 `dsh.client.inject` 声明需要的客户端包；`dsh.bundle.patch` 指向 `cordis.patch.yml`

### 3.2 运行时拓扑

```
DSH web host
├── dsh-prompt-enhancer (host)          src/index.ts  ≈ 60 行
│   ├── ctx.inject(["llm"])      → registerLlm(ctx.llm)          // 缺失则 AI 能力自动停用
│   └── ctx.inject(["webServer"]) → webServer.register(routes)   // 单一 prefix 路由
│   ✗ 无 systemPrompt section
│   ✗ 无 agent/created 监听、无 session/event 监听
│   ✗ 无 registerUpgrade（无 WS）
│
└── dsh-prompt-enhancer (client)        src/client/index.ts
    ├── slots.inject("conversation.input.left")    → PromptLibraryButton   order 10
    ├── slots.inject("conversation.input.left")    → AIPolishButton        order 11
    ├── slots.inject("sidebar.footer.action")      → SidebarPromptEntry    order 100  ← 左侧下方入口
    ├── slots.inject("conversation.input.dock")    → ContextRecommendations order 10
    ├── slots.inject("settings.section")           → SettingsSection       order 30
    └── slots.inject("shell.overlay")              → PromptSurfaceHost     根级浮层：弹窗宿主
    ✗ 无 PromptAssistant dock 宿主（改用 shell.overlay，root 作用域、始终挂载）
    ✗ 无 MutationObserver DOM 注入（设置上方菜单按钮、设置导航图标）
```

`index.ts` 是唯一的 host 装配点，import 从参考项目的 8 个模块降到 3 个：

```ts
export const name = "prompt-enhancer";
export const inject: string[] = [];

export function apply(ctx: Context) {
  const routes = makeRoutes();
  ctx.inject(["llm"], (llmCtx) => {
    registerLlm(llmCtx.llm);
    return () => registerLlm(undefined);
  });
  ctx.inject(["webServer"], (httpCtx) => {
    httpCtx.effect(
      () => {
        const disposers = routes.map((r) => httpCtx.webServer.register(r));
        return () => { for (const d of disposers) d(); };
      },
      "prompt-enhancer: routes",
    );
  });
}
```

### 3.3 目录树

图例：**原样搬运** / **改写** / **改写移植** / **重写** / **新写** / **删除**

```
dsh-prompt-enhancer/
├── package.json                      [新建]  name=dsh-prompt-enhancer, dsh.bundle + dsh.client
├── cordis.patch.yml                  [新建]  insert → id: prompt-enhancer, name: dsh-prompt-enhancer
├── tsconfig.json                     [改写移植]
├── LICENSE                           [新建]  保留上游 MIT 版权声明（见 §10）
├── README.md / README.zh.md          [新建]
├── scripts/
│   ├── build.mjs                     [改写移植]
│   ├── link-dsh-deps.mjs             [原样搬运]
│   ├── sync-to-profile.mjs           [改写移植]
│   └── smoke.mjs                     [新建]
├── docs/
│   ├── superpowers/specs/2026-09-24-dsh-prompt-enhancer-design.md   [本文件]
│   └── spec/dsh-prompt-enhancer.md   [新建]  面向用户的功能说明
├── src/
│   ├── index.ts                      [改写]  ≈ 60 行
│   ├── types.ts                      [改写]  ≈ 150 行（删 SessionPrompt/Persona*/ScopeNode）
│   ├── ambient.d.ts                  [改写]  __DEV__ / __PLUGIN_VERSION__ 声明
│   ├── host-vendor.d.ts              [改写]
│   ├── host/
│   │   ├── store.ts                  [改写]  ≈ 1000 行（4 表）
│   │   ├── routes.ts                 [改写]  ≈ 400 行（≈22 条路由）
│   │   ├── ai.ts                     [改写]  ≈ 650 行
│   │   ├── skills.ts                 [新写]  ≈ 250 行（仅导出：写 SKILL.md，不做导入）
│   │   ├── refine.ts                 [原样搬运]
│   │   ├── node-sqlite.ts            [原样搬运]
│   │   ├── paths.ts                  [改写]
│   │   ├── text.ts                   [原样搬运]
│   │   └── (删除) ws.ts / events.ts / character.ts / persona-service.ts /
│   │              session-prompts.ts / session-scope.ts / skills.ts /
│   │              harness.ts / bundle-doc.ts / update.ts
│   └── client/
│       ├── index.ts                  [改写]  6 个插槽注册
│       ├── utils/
│       │   ├── api.ts                [改写]  ≈ 300 行
│       │   ├── i18n.ts               [改写]  ≈ 700 行（zh/en 键集必须全等）
│       │   ├── data-sync.ts          [改写]  仅保留 window 事件半区
│       │   ├── theme.ts              [改写]  删成就/看板残留 CSS
│       │   ├── dialog-style.ts       [改写]  删公告残留、成就 CSS
│       │   ├── button-style.ts       [原样搬运]
│       │   ├── data-formats.ts       [原样搬运]
│       │   ├── recent-created.ts     [原样搬运]
│       │   ├── conversation-targets.ts [原样搬运] 上下文推荐读 chat 快照的唯一活数据源（必需）
│       │   └── (删除) ws.ts / workspace-picker.ts（改为直接调用注入的 ctx.workspaces）
│       └── components/
│           ├── common/               [原样搬运] SearchBox / TagInput / Pagination /
│           │                                   ConfirmDialog / Tooltip / PanelHeader /
│           │                                   WindowToggleButton / DialogCloseButton / BookIcon
│           │                          [删除]   DirectoryPickerModal（D5）
│           │                          [删除]   SubPanelModal（零引用）
│           ├── data/
│           │   ├── PromptLibraryButton.tsx     [重写]  按钮 + 快速列表 + 弹窗宿主
│           │   ├── PromptManagerModal.tsx      [重写]  管理面板（取代 70KB LexiconManagerModal）
│           │   ├── AIPolishButton.tsx          [改写]
│           │   ├── ContextRecommendations.tsx  [原样搬运+微调]
│           │   ├── SelectionAddPrompt.tsx      [改写]
│           │   ├── TemplateVariables.tsx       [原样搬运]
│           │   ├── TagManagePanel.tsx          [改写]
│           │   ├── RecycleManagePanel.tsx      [改写]
│           │   ├── SkillExportModal.tsx        [新写]  ≈ 250 行（勾选 + AI 补名/描述/whenToUse + 导出结果）
│           │   ├── SidebarPromptEntry.tsx      [新写]  ≈ 80 行（左侧下方入口，sidebar.footer.action）
│           │   └── PromptSurfaceHost.tsx       [新写]  ≈ 120 行（根级浮层，承载全部弹窗）
│           ├── import-export/
│           │   ├── ImportExportModal.tsx       [重写]  导入(file input) + 导出(dir picker)
│           │   └── ImportEditModal.tsx         [改写]
│           │                          [删除]   SkillImportModal.tsx / ImportConfirmModal.tsx
│           └── settings/
│               └── SettingsSection.tsx         [改写]  删「关于」中的人格/技能条目
└── tests/
    ├── store.test.mjs                [新建]
    ├── text.test.mjs                 [新建]
    ├── formats.test.mjs              [新建]
    └── skills.test.mjs               [新建]
```

---

## 4. 数据模型与存储

### 4.1 SQLite（`node:sqlite` 的 `DatabaseSync`）

- 文件：`$DSH_HOME/prompt-enhancer/db/prompts.db`
- 运行时已确认可用（本机 Node v24.19.0，`node:sqlite` 暴露 `DatabaseSync` / `StatementSync` / `backup`）
- 懒初始化：首次真实数据访问时建目录 → `PRAGMA journal_mode=WAL` → `PRAGMA busy_timeout=5000` → 建表 → 建索引 → 播种
- 数组（tags）以 JSON 文本存储
- 修正参考项目的初始化缺陷：**播种必须在建表与迁移之后同步完成**；迁移函数必须 `await`，不能 fire-and-forget

```sql
CREATE TABLE IF NOT EXISTS prompts (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  tags        TEXT NOT NULL DEFAULT '[]',   -- JSON string[]
  summary     TEXT,
  sourceBody  TEXT,                         -- AI 优化前原文（可回滚，见 §4.4）
  aiRefined   INTEGER NOT NULL DEFAULT 0,
  aiRefinedAt INTEGER NOT NULL DEFAULT 0,
  createdAt   INTEGER NOT NULL,
  updatedAt   INTEGER NOT NULL,
  usageCount  INTEGER NOT NULL DEFAULT 0,
  lastUsedAt  INTEGER NOT NULL DEFAULT 0,
  skillName       TEXT,                        -- 已导出的 DSH 技能名（kebab-case）；NULL = 从未导出
  skillExportedAt INTEGER NOT NULL DEFAULT 0   -- 上次导出时间；< updatedAt 即「技能已过期」
);

CREATE TABLE IF NOT EXISTS trash (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]', summary TEXT, sourceBody TEXT,
  aiRefined INTEGER NOT NULL DEFAULT 0, aiRefinedAt INTEGER NOT NULL DEFAULT 0,
  createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL,
  usageCount INTEGER NOT NULL DEFAULT 0, lastUsedAt INTEGER NOT NULL DEFAULT 0,
  skillName TEXT, skillExportedAt INTEGER NOT NULL DEFAULT 0,   -- §13.5 补列：恢复不丢导出记录
  deletedAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  name      TEXT PRIMARY KEY,
  createdAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_prompts_updated  ON prompts(updatedAt DESC);
CREATE INDEX IF NOT EXISTS idx_prompts_used     ON prompts(lastUsedAt DESC);
CREATE INDEX IF NOT EXISTS idx_trash_deleted    ON trash(deletedAt DESC);
```

`meta` 表用途：模板变量记忆（`insertVariableLastValues`）、schema 版本、播种标记。

### 4.2 设置

写入 `$DSH_HOME/settings.yaml` 的顶层 `prompt-enhancer` 命名空间。

```ts
interface PluginSettings {
  panelWidth: number;              // 默认 420
  panelHeight: number;             // 默认 560
  showComposerButton: boolean;     // 默认 true
  composerButtonIconOnly: boolean; // 默认 true
  showAIPolishButton: boolean;     // 默认 true
  aiPolishButtonIconOnly: boolean; // 默认 true
  hashTriggerEnabled: boolean;     // 默认 true（# 触发浮层）
  contextRecommendEnabled: boolean;// 默认 true
  selectionAddEnabled: boolean;    // 默认 true（选中文字存为提示词）
  showSidebarButton: boolean;      // 默认 true（左侧下方「提示词」入口）
  maxPromptCount: number;          // 默认 300
  aiProvider: string;              // 默认 ""（自动发现）
  aiModel: string;                 // 默认 ""（自动发现）
}
```

> 参考项目把 `#` 触发开关命名为 `tildaTriggerEnabled`（`~`），与实际触发字符 `#` 不符；本设计改名为 `hashTriggerEnabled`。

### 4.3 导入导出格式

与参考项目**保持同构**，从而让老用户「旧插件导出 → 新插件导入」即可迁移，无需直接读写旧库。

```json
{
  "version": 1,
  "exportedAt": 1758700000000,
  "prompts": [ { "id": "...", "title": "...", "body": "...", "tags": [], "summary": "...",
                 "sourceBody": "...", "aiRefined": false, "aiRefinedAt": 0,
                 "createdAt": 0, "updatedAt": 0, "usageCount": 0, "lastUsedAt": 0 } ],
  "tags": [ { "name": "...", "createdAt": 0 } ]
}
```

- **导出**：`workspaces.pickDirectory()` 选目录 → `POST /export/save`（body 含 `dir`）由 host 写盘
- **导入**：`<input type="file" accept=".json">` 客户端读文本 → `POST /import` 校验 + 返回预览统计 → 用户确认 → `POST /import`（`confirm: true`）落库
- 导入冲突策略：同 id 覆盖；新 id 追加

### 4.4 可回滚与统计语义

**回滚（D2）**——`sourceBody` 承担「AI 优化前原文」：

- 写入：任何把 AI 结果写回 `body` 的操作，若 `sourceBody` 为空，则先 `sourceBody ← 旧 body`，并置 `aiRefined = 1`、`aiRefinedAt = now`
- 回退：`POST /prompts/:id/rollback` 执行 **swap(body, sourceBody)**，因此可反复点击在「原文 ↔ 优化稿」之间双向切换
- UI：编辑详情页显示「原文 / 优化稿」并排对比与「切换/回退」按钮；仅当 `sourceBody` 非空时可见

**统计**——`usageCount` / `lastUsedAt`：

- 每次「插入 / 覆盖 / 插入并发送 / # 选中」都调 `POST /prompts/:id/use`
- 用途：列表排序（最近使用、最常使用）、删除确认中的用量提示、超限淘汰依据
- 超限淘汰：`maxPromptCount` 超限时，优先淘汰 `aiRefined = 0`（未经人工确认价值）且 `lastUsedAt` 最旧者；淘汰前二次确认

---

## 5. Host API 面

单一 prefix 路由 `/api/prompt-enhancer`，约 22 条逻辑路由（参考项目 64 条）。响应统一 `ApiResponse<T> = { ok, data?, error? }`——客户端以 `data === undefined` 判失败，信封不可改。

| 分组 | 方法 + 路径 | 用途 |
| --- | --- | --- |
| 提示词 | `GET /prompts` | 列表（`q` 搜索、`tag` 过滤、`sort` 排序） |
| | `POST /prompts` | 新建 |
| | `GET /prompts/:id` | 详情 |
| | `PUT /prompts/:id` | 更新 |
| | `DELETE /prompts/:id` | 软删除 → 回收站 |
| | `POST /prompts/:id/use` | 记一次使用 |
| | `POST /prompts/:id/rollback` | 原文 ↔ 优化稿 切换 |
| 标签 | `GET /tags` | 列表（含每标签用量） |
| | `POST /tags` | 新建 |
| | `PUT /tags/:name` | 重命名（连带更新提示词） |
| | `DELETE /tags/:name` | 删除（在用则拒绝并返回用量） |
| 回收站 | `GET /trash` | 列表 |
| | `POST /trash/:id/restore` | 恢复 |
| | `DELETE /trash/:id` | 永久删除 |
| | `DELETE /trash` | 清空 |
| AI | `GET /ai/providers` | provider/模型清单（设置页下拉） |
| | `POST /ai/polish` | 润色（`withSummary` 可选） |
| | `POST /ai/refine` | 一键完善（标题/标签/摘要/正文） |
| 设置 | `GET /settings` / `PUT /settings` | 读写设置 |
| 导入导出 | `POST /export/save` | 写盘备份 |
| | `POST /import` | 校验/预览/落库 |
| meta | `GET /meta/:key` / `PUT /meta/:key` | 模板变量记忆 |
| 技能导出 | `POST /ai/skill-descriptor` | AI 生成技能名 + description + **whenToUse**（修复参考项目的丢弃缺陷） |
| | `POST /skills/export` | 写 `$DSH_HOME/skills/<name>/SKILL.md`，回写 `skillName` / `skillExportedAt` |

**删除的路由（参考项目）**：`/personas/*`(9)、`/session-prompts/*`(16)、`/skills/*`(11 条中仅保留「导出」形态，删 10 条)、`/ai/intro`、`/ai/draft`、`/fs/list`、`/fs/mkdir`、`/version`。

---

## 6. AI 能力

### 6.1 保留能力（`src/host/ai.ts`）

| 导出 | 说明 |
| --- | --- |
| `registerLlm(runtime)` | 注入/注销 harness LLM，并清路由缓存 |
| `listAiSelectables()` | 列 provider + 模型 |
| `polishPromptBody(body, settings, { keepVariables })` | 润色正文（等长/更精炼） |
| `polishPromptBodyWithSummary(body, settings, opts)` | 润色 + 用途摘要 → `{ polished, summary? }` |
| `refinePrompt(body, settings)` | 一键完善：返回 `{ title, tags, summary, body }`（复用 `refine.ts` 的 `parseRefineResult`） |
| `generateSkillDescriptor(prompt, settings)` | 生成 `{ name, description, whenToUse }`（移植参考项目，但**三字段全部落盘**） |

**删除**：`withSoulSystem`（人格耦合）、`enrichLearnedPrompt` / `enrichPromptProfessional`（死代码）、`generateIntro`、`generateDailyReport` / `todayLocalDate` / `parseJsonArray` / `DailyReportItem` / `TechNewsItem`、`generateDraft`、`isAiAvailable`、`logAiInjected`。**（注：`generateSkillDescriptor` 由 D8 保留，仅三字段全部落盘）**

### 6.2 LLM 调用与路由解析（搬运）

- 单点出口 `collectText()`：`system` 走 `GenerateOptions.system`、`maxTokens 2048`、`temperature 0.4`、`AbortSignal.timeout(30_000)`
- `collectTextWithFallback()` 按候选路由轮询；`withLlmLock()` 全局串行
- `resolveCandidates()`：手动 `aiProvider`/`aiModel` 先校验可用性，否则遍历全部 provider（优先 id 匹配 `/chat|deepseek/i` 的模型）构成有序候选；30s TTL 缓存
- **修复缺陷**：参考项目的 `PUT /settings` 不清路由缓存 → 本设计在设置写入后调 `clearRouteCache()`
- 日志：`$DSH_HOME/prompt-enhancer/log/ai-YYYY-MM-DD.log`，仅在 `__DEV__` 构建下写入
- 失败一律返回 `undefined`，由路由转 503，前端出 toast

### 6.3 提示词模板（搬运，仅保留 4 组）

1. 润色 system（含标签库提示 + 变量保留约束）
2. 润色 user（原始正文 + 候选标签 + 已有变量）
3. 用途摘要 system/user
4. 一键完善 system/user（标题 / 标签 / 摘要 / 正文，JSON 输出）

模板原文取自参考项目 `ai.ts`（其分析报告 §4 已 100% 摘录），**仅删除其中的人格注入段**。

### 6.4 输出后处理（搬运）

`stripAiFiller()`（剥代码围栏 + 首尾各最多 6 行中英套话，正则 `AI_OPEN_RE` / `AI_CLOSE_RE`）、`parseSummaryJson()`、`parseRefineResult()`。

### 6.5 技能导出（D8）：显式单向 + 过期提示

**为什么不做活同步引擎。** 实测参考项目的 `prompt_skill_links` 表本可承担同步职责，但实际只用于「二次导出复用同一目录名」；`exportPromptsAsSkills` / `importSkillEntries` 仅在 `routes.ts` 被调用，`updatePrompt()` 不触发任何写盘——因此提示词优化后技能静默过期。本设计不假装自动同步，而是把「过期」做成**可见状态 + 一键动作**。

**导出契约**（`src/host/skills.ts`，仅导出）：

```
目标：$DSH_HOME/skills/<name>/SKILL.md   ← 官方 skill-filesystem 的 user-dsh root（rank 400），自动发现 + watch
name：kebab-case，须过官方校验（仅 [a-z0-9-]）
frontmatter：name（必填）/ description（必填）/ whenToUse（可选）
正文：提示词 body 原样写入
```

**相对参考项目修掉的 3 个实测缺陷**：

| # | 参考项目缺陷（已实测） | 本设计修正 |
| --- | --- | --- |
| 1 | AI 被要求生成 `whenToUse`（`ai.ts:1006/1009`）并被解析（`ai.ts:971`），但客户端 AI 补全只保存 `{name, summary}`（`SkillImportModal.tsx:938-943`），`SkillEntry` 无该字段，`exportPromptsAsSkills` 只写 name+description（`skills.ts:349-355`）→ **白花 token 生成又丢弃** | frontmatter **写入 whenToUse**；单测断言其存在 |
| 2 | `description` 取 `entry.summary`；无摘要时写 `description: ""`。而官方 loader **要求 description 必填**，模型目录的自动匹配完全依赖它 → 空描述 = 模型无法自动发现该技能 | 导出前**强制非空**，按 summary → AI description → body 首行 → 标题逐级兜底；仍为空则拒绝导出并报错 |
| 3 | 项目作用域导出用 `resolveCurrentProjectCwd()`（按最近活跃会话 cwd 猜项目根），与官方「含 `.git` 的最近祖先」定义不一致 → 可能写错位置 | **v1 只支持 user root（`$DSH_HOME/skills`）**，项目级导出不做。日后若需要，按官方定义实现 |

**过期提示（闭环的可见性）**：导出时写 `skillName` + `skillExportedAt = now`；列表行据此渲染「已导出技能」或**「技能已过期」**徽标；过期徽标带「一键重新导出」（复用同 `skillName` 覆盖同一目录，不新增目录）。

**不做的**：反向导入（`importSkillEntries` / `importSkillsFromDisk`）、harness 技能软控制（`disabledHarnessSkillsInstruction` 需要 systemPrompt 注入，与本设计 section 数 = 0 冲突）、项目级技能根、自动同步。

**依赖影响**：只写 YAML 不解析 → **不需要 `js-yaml`**（参考项目的 `js-yaml` 仅用于反向导入时解析 frontmatter）。

**已考虑并否决的替代方案**：用 `ctx.skills.register()` 在内存中注册技能（官方注册表支持 `runtime` 提供方）。否决理由：① 生命周期绑定插件加载期，卸载即消失，不符合「沉淀」的持久预期；② 用户无法直接查看/编辑/版本化；③ 文件形态可被 `skill-filesystem` 的 watch 自动拾取，无需插件常驻。

---

## 7. 前端与插槽

### 7.1 插槽注册（6 处，全部官方插槽）

| 插槽 | kind / scope | id | order | 组件 | 作用 |
| --- | --- | --- | --- | --- | --- |
| `conversation.input.left` | list / session | `prompt-enhancer` | 10 | `PromptLibraryButton` | 输入框旁：快速列表 + 打开管理面板 |
| `conversation.input.left` | list / session | `prompt-enhancer-ai-polish` | 11 | `AIPolishButton` | 输入框旁：AI 优化 |
| `sidebar.footer.action` | list / **root** | `prompt-enhancer` | 100 | `SidebarPromptEntry` | **左侧下方（设置按钮旁）**：打开管理面板 |
| `conversation.input.dock` | list / session | `prompt-enhancer-recommend` | 10 | `ContextRecommendations` | 输入框上方推荐条 |
| `settings.section` | list / **root** | `prompt-enhancer` | 30 | `SettingsSection` | 设置页 |
| `shell.overlay` | list / **root** | `prompt-enhancer` | 100 | `PromptSurfaceHost` | 根级浮层：承载管理 / 导出 / 导入弹窗 |

**三个新座位的官方契约（实测自 harness slot-catalog）**：

- `sidebar.footer.action` — *"Optional actions beside Settings at the sidebar foot"*；`kind: list` / `scope: root` / `replaceRisk: none`（附加式）；owner props 为 `{ wide: boolean }`（侧栏是否宽展开，用于图标/文字切换）；由 `sidebar` 条目声明。**这是左侧下方入口的官方座位，无需 DOM 注入。**
- `shell.overlay` — *"Frame-wide floating layer, above every column and outside their scroll containers"*；`kind: list` / `scope: root` / `replaceRisk: none` / `occupants: []`；由 root 布局条目声明，**始终挂载**；该层默认 click-through，挂载方需自行开启 pointer-events。**这是弹窗的官方根级宿主座位。**
- 弹窗开合状态由模块级 store（`ui-state.ts`）+ 开/关动作共享，**不通过组件耦合**：输入框按钮与左侧入口都只调 `openManager()`（同进程，符合 D6）。

`inject = ["slots", "locale", "workspaces", "uiConversation"]`

- `workspaces`：导出目录选择（D5）
- `uiConversation`：`ContextRecommendations` 经 `conversation-targets.ts` 的 `useConversationTargetSnapshot` 读取当前会话 chat 快照，抽取最近用户消息作为上下文关键词——**这是必需的**（实测 `ContextRecommendations.tsx` 的 import）

### 7.1.1 上下文推荐的确定参数（搬运参考项目实测值）

| 参数 | 值 | 含义 |
| --- | --- | --- |
| `LIMIT` | 5 | 最多推荐条数 |
| `CONTEXT_USER_COUNT` | 3 | 取最近几条用户消息作上下文 |
| `FRESH_MS` | 30 天 | 新鲜度窗口，近期用过的提示词加分 |
| `STOP_BIGRAMS` | 中文停用词表 + 口语虚词 | 抑制「我们/可以/帮我」这类噪声匹配 |
| 触发条件 | **`draft` 非空** | 草稿为空或新建会话时不渲染（与 README 描述相反，以代码为准） |
| 抽取算法 | 中文二元组 + 英文单词 | 对标题/标签/正文做词频加权打分 |

### 7.2 输入框写入契约

复用宿主 composer 的官方动作面（`InputActions`）：

- 读取当前草稿：`useInput()` → `InputState.draft`
- **插入（追加）**：`inputActions.setDraft(draft ? draft + "\n" + body : body)`
- **覆盖**：`inputActions.setDraft(body)`
- **插入并发送**：`setDraft(...)` 后调 `inputActions.submit()`

> 宿主没有「在光标处插入」的公开动作；追加/覆盖是本设计的确定语义。

### 7.3 入口拓扑（功能对齐参考项目，实现换轨）

**路径 A 澄清：本设计并非「只有 Settings 一个入口」。**

| 入口 | 参考项目实现 | 本设计 |
| --- | --- | --- |
| 输入框旁词库按钮 | `conversation.input.left` 插槽 | **保留**（同插槽） |
| 输入框旁 AI 优化按钮 | `conversation.input.left` 插槽 | **保留**（同插槽） |
| **左侧下方（设置按钮旁）词库入口** | `SettingsAboveMenuButton`：MutationObserver 定位原生设置按钮，DOM 注入一个按钮在其上方 | **改为官方座位 `sidebar.footer.action`** —— 功能保留，去掉 hack |
| 管理面板弹窗宿主 | `PromptAssistant` 挂在 `conversation.input.dock`，由 `pl:show-panel-content` window 事件协议驱动 | **改为 `shell.overlay`**（root 作用域、始终挂载）—— 去掉「必须先有会话才能开面板」的隐性约束与自定义事件协议 |
| 设置页 | `settings.section` 插槽 | **保留**（同插槽） |
| 设置导航图标 | `settings-nav-icon`：DOM 注入改造设置导航文字为图标 | **删除**（纯装饰性 hack） |
| 选中文字捕获 | `SelectionAddPrompt` 渲染在 `PromptLibraryButton` 内 | **保留**（同方式） |

> **结论：左侧下方入口不删，只是换成官方座位实现。**被删除的仅两个纯 DOM 注入 hack（`SettingsAboveMenuButton` 与 `settings-nav-icon`）；入口数量与参考项目一致（输入框旁 + 左侧下方 + 设置页）。

### 7.4 i18n

单命名空间 `prompt-enhancer`，`zh` / `en` 两份字典。`en` 的类型为 `Record<keyof typeof zh, string>`——**这是天然的漏删/漏译校验网**，`tsc` 会把键集不等的两边都报成类型错误。目标键数约 260（参考项目 445；删掉约 46% 非提示词键，新增 D8 与左侧入口相关文案）。

### 7.5 主题

沿用参考项目的 CSS 变量方案（`theme.ts` 的 token 集合），删除成就/看板/公告残留样式。

### 7.6 技能导出的 UI 入口（D8）

- **入口**：管理面板工具栏的「导出为技能」按钮 → `SkillExportModal`
- **弹窗内容**：勾选提示词（支持全选/按标签筛选）→「AI 补全名称与描述」（逐条调 `POST /ai/skill-descriptor`，失败条目行内红色标注）→ 校验（name 是否 kebab-case、description 是否非空）→ 导出 → 结果汇总（成功/失败清单 + 目标目录）
- **列表徽标**（管理面板列表行 + 详情页）：
  - `skillName` 空 → 不显示
  - `skillName` 非空且 `updatedAt <= skillExportedAt` → 「已导出技能 `<name>`」（绿色）
  - `skillName` 非空且 `updatedAt > skillExportedAt` → **「技能已过期」**（警示色）+「重新导出」按钮
- **同名冲突确认**：目标目录已存在且不属于本插件任何提示词时，导出前弹确认
- 所有文案进 i18n（`prompt-enhancer` 命名空间）

---

## 8. 删除清单（相对参考项目）

| 类别 | 内容 | 规模 |
| --- | --- | --- |
| 人格系统 | `character.ts`、`persona-service.ts`、`PersonaManagerModal.tsx`、types 中 Persona* 3 型、ai.ts 的 `withSoulSystem` + 6 调用点、routes `/personas/*`、store 人格区、index.ts order-0 section、i18n `pl.personas.*` | ≈ 2,900 行 |
| 会话级技能注入 + 技能反向导入 | `session-prompts.ts`、`session-scope.ts`、`PromptInjectPanel.tsx`、`HarnessSkillPanel.tsx`、`SkillImportModal.tsx`、参考项目 `skills.ts` 的导入半区（`importSkillEntries` / `importSkillsFromDisk` / `listAvailableSkills` / `parseSkillFile`）、routes 三块、types 4 型、i18n 3 族。**注：`skills.ts` 的导出半区改写保留（D8）** | ≈ 5,400 行 |
| WS 层 | host `ws.ts` + `events.ts` + 注册点、client `utils/ws.ts` + `data-sync.ts` 订阅半区 | ≈ 500 行 |
| 死 AI 代码 | 日报 / 新闻 / 简介 / 草稿生成 / 自学习（**技能描述符除外**，D8 保留） | ≈ 400 行 |
| 巨型弹窗重写 | `LexiconManagerModal`(70KB) → `PromptManagerModal`；`ImportExportModal`(59KB) 重写 | 净减 ≈ 60% |
| DOM 注入入口 | `SettingsAboveMenuButton`、`settings-nav-icon` | ≈ 600 行 |
| 其它 | `SubPanelModal`、`DirectoryPickerModal`、`update.ts`、`harness.ts`、`bundle-doc.ts`、定时备份、自动更新 | ≈ 600 行 |

预期 `src` 规模：**15,600 行 → 约 5,500 行（-65%）**，文件 **65 → 约 41**（含 D8 新增的 `skills.ts` 导出半区与 `SkillExportModal`）。

### 8.1 施工顺序（先断引用，再删文件）

1. 建项目骨架（package.json / tsconfig / build.mjs / cordis.patch.yml），**先跑通空插件加载**
2. 移植 `types.ts` / `paths.ts` / `node-sqlite.ts` / `text.ts` / `store.ts`（4 表）
3. 移植 `ai.ts`（删人格与死代码）+ `refine.ts`
4. 移植 `routes.ts`（约 22 条）
5. 移植 client 通用件 + `TemplateVariables` + `data-formats`
6. 新写 `PromptManagerModal` + `PromptLibraryButton`
7. 移植/改写 `AIPolishButton` / `ContextRecommendations` / `SelectionAddPrompt` / 标签 / 回收站 / 导入导出
8. 新写 `SettingsSection` + `i18n`
9. 测试与验收

---

## 9. 测试与验收

### 9.1 自动化测试（`node --test`）

| 文件 | 覆盖 |
| --- | --- |
| `tests/store.test.mjs` | 提示词 CRUD、软删除与恢复、标签在用保护、超限淘汰、`sourceBody` swap 回滚语义、统计累加 |
| `tests/text.test.mjs` | `stripAiFiller`（代码围栏 / 中英套话）、`parseRefineResult` 容错、`parseSummaryJson` |
| `tests/formats.test.mjs` | 导入导出往返（export → import → 等值）、版本字段校验、模板变量解析与替换 |
| `tests/skills.test.mjs` | 技能名 kebab 校验、frontmatter 三字段（name / description / whenToUse）齐全、description 兜底链与空值拒导、同名冲突判定、过期判定（`updatedAt > skillExportedAt`） |

### 9.2 构建产物校验（`scripts/smoke.mjs`）

- `lib/index.js` 存在且为 ESM，导出 `name` = `prompt-enhancer` 与 `apply`
- `lib/client.js` 含 `window.__ModuleLoader__.load(`，且其 `id` 等于 `package.json.name`
- `lib/client.js` 的 `module.exports` 形状为 `{ apply, inject }`
- `cordis.patch.yml` 的 `name` 与包名一致
- `tsc --noEmit` 通过（含 i18n 键集校验）

### 9.3 手动验收清单

1. `dsh plugin --profile web add ./dsh-prompt-enhancer` → 重启 `dsh web` → 无报错
2. 输入框左侧出现词库按钮与 AI 优化按钮；`#` 触发浮层可筛选、↑↓ 选择、回车插入
3. 新建 → 插入 / 覆盖 / 插入并发送 三条路径均正确
4. 含 `{{变量}}` 的提示词触发填充弹窗，第二次同名变量自动带出上次值
5. AI 优化：`/ai/polish` 返回结果 → 「查看结果」面板显示原文/优化稿 → 「应用到输入框」
6. AI 优化写回词库后，「原文 ↔ 优化稿」可双向切换
7. 选中聊天文字 → 浮出「存为提示词」→ 保存后出现在词库
8. 当前草稿存为提示词
9. 标签重命名/删除（在用标签拒绝并提示用量）；回收站恢复/永久删除/清空
10. 导出 JSON 到自选目录；改库后导入该 JSON 恢复
11. 输入一些内容（草稿非空）→ 上下文推荐条出现，点击插入；清空草稿后推荐条消失
12. 设置页改模型 / 关 `#` 触发 / 关推荐 → 即时生效（不需刷新）
13. 无 LLM 配置时：AI 按钮提示不可用，其余功能不受影响
14. **确认插件未注入任何 systemPrompt section**（宿主默认 `deployment:persona` 重新生效）
15. 选中提示词导出为技能 → `$DSH_HOME/skills/<name>/SKILL.md` 存在，frontmatter 含 `name` + `description`（+ `whenToUse`，若 AI 生成成功）
16. 修改该提示词并保存 → 列表出现「技能已过期」徽标 → 点「重新导出」→ 徽标消失，且**未新增技能目录**（同名覆盖）
17. 无摘要的提示词也能导出（description 走兜底链且非空）；兜底全空时导出被拒绝并给出明确错误
18. **左侧下方（设置按钮旁）出现「提示词」入口**，点击可打开管理面板；即使**当前没有任何会话**也能打开（`shell.overlay` 为 root 作用域）
19. 关闭设置中的 `showSidebarButton` → 左侧入口消失；关闭 `showComposerButton` → 输入框旁按钮消失

---

## 10. 许可与署名

参考项目为 **MIT**。本项目是其衍生物（移植了存储层、AI 模块、通用组件）。

- 保留上游 `LICENSE` 全文与 `Copyright (c) master1Sun` 声明
- `README` 显著位置注明：基于 `master1Sun/dsh-prompt-library` v0.16.0 裁剪而来，并列出移植范围
- `package.json` 增加 `contributors` 或 `repository` 指向说明
- 若后续发布到 npm，包名 `dsh-prompt-enhancer` 已被占用则改用 scope

---

## 11. 里程碑

| 里程碑 | 内容 | 验收 |
| --- | --- | --- |
| **M1 骨架可加载** | 项目骨架 + 空 `apply` + 构建 + 安装到 profile | `dsh web` 启动无报错，client bundle 注册成功 |
| **M2 数据层** | store 4 表 + 全部存储函数 + 单测 | `tests/store.test.mjs` 全绿 |
| **M3 API 面** | 约 22 条路由 + AI 移植 | 手动 curl 全部路由返回合法信封 |
| **M4 复用闭环** | 词库按钮 + `#` 触发 + 插入/覆盖/发送 + 模板变量 | 验收 2/3/4 |
| **M5 AI + 回滚** | AI 优化按钮 + 完善 + 原文/优化稿切换 | 验收 5/6/13 |
| **M6 沉淀 + 管理** | 管理面板 + 三入口捕获 + 标签 + 回收站 + 导入导出 | 验收 7/8/9/10 |
| **M7 技能导出（D8）** | `skills.ts` 导出 + `generateSkillDescriptor` + `SkillExportModal` + 过期徽标 | 验收 15/16/17 |
| **M8 收尾** | 推荐 + 设置页 + i18n 收口 + 文档 + 许可 | 验收 11/12/14 + `smoke.mjs` 全绿 |

---

## 12. 风险

| 风险 | 应对 |
| --- | --- |
| 宿主 `workspaces.pickDirectory()` 在导出场景不可用（D5） | M3 期实测；不可用则回退为移植参考项目的 `/fs/list` + `/fs/mkdir` 与 `DirectoryPickerModal`（已知可用，成本约 550 行） |
| 重写 `PromptManagerModal` 丢失参考项目的成熟 UX | 先按验收清单逐项对照实现；保留 `common/*` 与 `TemplateVariables` 原样搬运 |
| `#` 触发浮层依赖宿主 composer 的 trigger 管线 | 参考项目已验证该路径；若宿主版本变化导致失效，降级为「按钮内搜索选择」 |
| 删掉 `deployment:persona` section 后宿主默认人格生效 | 属预期行为；在 README 与发布说明声明 |
| 参考项目 `ensureTag()` 无限递归缺陷 | 移植时改用传入 `cur` 的私有辅助，并在单测中覆盖 |
| i18n 键集漂移 | 依赖 `Record<keyof typeof zh, string>` 的编译期校验 + 单测比对键集 |
| 技能导出覆盖用户手工技能 | 同名目录已存在且不属于本插件任何提示词时，导出前强制弹确认（§7.6） |
| 官方 loader 对 frontmatter 的严格校验（name 需 kebab-case、description 必填）导致技能被静默跳过 | 导出前本地校验 + `tests/skills.test.mjs` 断言；官方行为为「随警告丢弃」，故必须在写入前拦截 |

---

## 13. 自检收敛记录

规格自检阶段发现并已就地修正的三处问题，记录以备复核：

| 项 | 原状 | 收敛结果 |
| --- | --- | --- |
| 上下文推荐的触发条件 | 初稿照抄 README「输入框为空时推荐」，与代码相反 | 改为按代码实际行为：**草稿非空时**推荐（§2.1-9、§7.1.1） |
| `conversation-targets.ts` / `uiConversation` | 初稿标为「评估」 | 实测 `ContextRecommendations.tsx` 依赖其读 chat 快照 → **必需保留**，`uiConversation` 进 inject 列表（§3.3、§7.1） |
| `workspace-picker.ts` | 初稿标为「评估」 | 直接调用注入的 `ctx.workspaces`，**删除该缓存模块**（§3.3） |

另有一处按代码实测固化的取值：超限淘汰优先级为 `aiRefined = 0` 且 `lastUsedAt` 最旧者（§4.4），不再作为待定项。

### 13.1 范围追加（D8，复核后新增）

复核阶段用户追加需求「提示词沉淀 → 形成复用 skill 是否闭环」。经验证确认参考项目**未闭环**（详见 §0.1 与 §6.5），故新增 D8 决策：纳入「显式单向导出 + 过期提示」，并修掉 3 个实测缺陷；同时明确排除反向导入、活同步引擎与 harness 技能软控制。本次追加使：

- §2.1 由 10 项增至 11 项；§2.2 排除项由「DSH Skill 导入导出」收窄为「反向导入」
- `prompts` 表新增 `skillName` / `skillExportedAt` 两列
- Host API 新增 2 条路由（共约 22 条）
- 目录树新增 `src/host/skills.ts`、`SkillExportModal.tsx`、`tests/skills.test.mjs`
- 里程碑新增 M7，原 M7 顺延为 M8
- 依赖影响：不需要 `js-yaml`

### 13.2 复述前重读发现并修正的矛盾（2026-09-24）

按要求复述规格前重读全文，发现 D8 追加时引入的 6 处内部矛盾，已就地修正：

| # | 矛盾 | 修正 |
| --- | --- | --- |
| 1 | D1 写「不做 Skill 导出」，与 D8「纳入技能导出」直接冲突 | D1 改为「技能导出为**单向导出**，见 D8；不做反向导入」 |
| 2 | §6.1「删除」列表含 `generateSkillDescriptor`，与同节保留表新增该导出冲突 | 从删除列表移除并加注 |
| 3 | 路由计数四处仍为「约 20 条」（§3.3 / §5 / §8.1 / §11） | 全部改为「约 22 条」 |
| 4 | §5 把 `/skills/*` 11 条全列为删除，但 D8 保留导出形态 | 改为「11 条中仅保留导出形态，删 10 条」 |
| 5 | §8「死 AI 代码」行含「技能描述符」，与 D8 保留冲突 | 标注「技能描述符除外，D8 保留」 |
| 6 | 验收项 11「清空输入框 → 推荐条出现」与 §7.1.1「仅草稿非空时推荐」冲突 | 改为「输入内容（草稿非空）→ 出现；清空后消失」 |

另修正目录树图例（补齐 `重写` / `新写` / `删除` 三种实际使用的标注），并将 D8 行调整到 D7 之后以恢复编号顺序。

### 13.3 入口拓扑修正（2026-09-24，用户提问触发）

用户提问「当前是否只有 Settings 一个入口？原版在左侧下方有入口和 Setting 内」。核对后确认这是**初稿的实质缺陷**：

- 初稿把左侧下方入口当作「`SettingsAboveMenuButton` 这个 DOM 注入 hack」一并删除，**混淆了「实现方式」与「功能入口」**——删 hack 是对的，删入口是错的。
- 复查 harness slot-catalog 后发现两个此前遗漏的官方座位：
  - `sidebar.footer.action`（*"Optional actions beside Settings at the sidebar foot"*，`list`/`root`/`replaceRisk: none`）→ 左侧下方入口的官方座位
  - `shell.overlay`（*"Frame-wide floating layer, above every column"*，`list`/`root`/`replaceRisk: none`/`occupants: []`，由 root 布局声明、**始终挂载**）→ 弹窗的官方根级宿主

### 13.4 定稿确认（2026-09-24）

- **左侧入口位置**：用户确认接受官方座位 `sidebar.footer.action`（渲染在设置按钮**旁边**，而非参考项目的正上方）。**不保留任何 DOM 注入**。
- **规格状态**：定稿（复核通过）。后续如需变更，追加 `§13.x` 记录并重新复核。
- **git 仓库**：用户批准在 M1 初始化 `dsh-prompt-enhancer/` 的 git 仓库，并将本规格作为第一个 commit。

修正结果：插槽注册由 4 处增至 **6 处**（新增 `sidebar.footer.action` 与 `shell.overlay`），入口与参考项目**数量一致**（输入框旁 + 左侧下方 + 设置页），且**零 DOM 注入**；同时新增设置项 `showSidebarButton`。弹窗宿主从「挂在 session 作用域的 dock」改为「root 作用域的 overlay」，顺带消除了参考项目「无会话时无法开面板」的隐性约束。

### 13.5 回收站补 `skillName` / `skillExportedAt` 两列（2026-09-24，用户决定）

**问题**：§4.1 原 DDL 的 `trash` 表没有 skill 两列，于是「软删除 → 恢复」会丢掉「已导出的技能」记录——恢复后徽标变成「从未导出」，用户再次导出会**再建一个技能目录**，而旧技能仍留在 `~/.dsh/skills/` 被聊天触发，同一件事变成两个重复技能且无从判断该删哪个。这直接破坏 D8「过期提示」在「删除后恢复」这条正常路径上的可用性。

**决定（用户）**：补列。P2 当初按 §4.1 原文实现（并在计划里标为风险 R3），用户确认后改为补列。

**落地**：

- `trash` 表加 `skillName TEXT` 与 `skillExportedAt INTEGER NOT NULL DEFAULT 0`（§4.1 的 DDL 已就地更新）
- `SCHEMA_VERSION` 由 1 升到 **2**；`store.ts` 的迁移接缝（P2 预留）承担首个真实迁移：先探测 `PRAGMA table_info(trash)` 再 `ALTER TABLE`，保证幂等
- `deletePrompt` 把两列一并搬进回收站，`restorePrompts` 原样搬回
- 测试：`tests/store-migration.test.mjs`（v1 库自动补列 + 老数据无损 + 二次启动幂等）与 `tests/store.test.mjs` 的「回收站保留技能导出记录」用例

**未改动**：`prompts` 表的两列（§4.1 原本就有）、导出格式（§4.3，与参考项目同构不变）。

### 13.6 设置持久化改走宿主 `settings` 服务（2026-09-24，调研后确定）

**问题**：§4.2 要求设置落在 `$DSH_HOME/settings.yaml` 的 `prompt-enhancer` 命名空间，§6.5 又禁用 `js-yaml`——两条约束无法用手写 YAML 同时满足。

**调研（用户要求：先看上游怎么做的）**：

| 对象 | 机制 | 证据 |
| --- | --- | --- |
| 上游 `dsh-prompt-library` v0.16.0 | **手写 YAML**：自己读整份 `settings.yaml`、替换自己那段、再整份写回 | `src/host/store.ts:20` `import { load, dump } from "js-yaml"`；`package.json.dependencies = { "js-yaml": "^5.3.0" }`；全仓 `ctx.settings` **零命中** |
| DSH 官方设置服务 | `ctx.settings.register(ns, schema)` → `get / watch / update / replace`，宿主负责文件读写、校验与并发 | 自 2026-07-28 存在（`packages/settings/settings/src/index.ts`）；官方插件 `ui-theme` / `locale` / `ui-chat` 等均走此路 |
| 本机已装第三方插件 | 3 个在用官方服务 | `@liustack/modsearch`、`dsh-better-sidebar`、`dshmarket/lib/settings.js` 的发布产物中均有 `settings.register(` |

**决定**：改用宿主 `settings` 服务。它是生态惯例，上游是没跟上的例外（代价是多一个 YAML 运行时依赖，且「读全文件再写回」会丢注释、可能损坏其它插件的命名空间）。

**落地**：

- 新增 `src/host/settings.ts`：`PromptEnhancerSettingsSchema`（`@deepseek-ai/schemastery`，字段与默认值取 §4.2 与 `types.ts` 的 `DEFAULT_SETTINGS`）+ `registerSettings(scope)` / `getSettings()` / `updateSettings(patch)`
- `src/index.ts` 增加一段条件注入 `ctx.inject(["settings"], …)`（**§3.2 的装配草图由三段变四段**）
- `package.json` 增加 peerDependencies：`@deepseek-ai/cordis` / `@deepseek-ai/dsh-llm` / `@deepseek-ai/schemastery`（宿主提供，不打包）
- **不需要** `js-yaml`；§4.2 的存储位置（`settings.yaml` 的 `prompt-enhancer` 命名空间）与键名**完全不变**，故用户可见行为不变
- 设置服务缺失时（headless 等）回落 `DEFAULT_SETTINGS`；`PUT /settings` 返回 503 并给出可读原因

**影响范围**：§3.2 的 `apply()` 草图、§4.2 的实现路径、P3 的文件清单（新增 `src/host/settings.ts` 与 `tests/settings.test.mjs`）。

### 13.7 座位表增补 `conversation.input.overlay`，并更正 §7 关于 `#` 触发的前提（2026-09-24，用户批准）

**问题一：§7 的 `#` 触发前提被实证推翻。** §7 的风险栏写「`#` 触发浮层依赖宿主 composer 的 trigger 管线」。实测宿主 `ui-input-trigger` 的 `TriggerChar` 是**封闭联合** `'/' | '@'`（`packages/client/ui-input-trigger/src/types.ts:34`），第三方**无法注册 `#`**——该管线从未支持自定义触发字符，不存在「宿主版本变化导致失效」的情况。同时 `InputState` 只有 `draft`、**没有 caret/选区**，故基于光标位置的设计在客户端拿不到数据。

**问题二：自建浮层需要官方落点。** §7.1 原表 6 处座位不含 `conversation.input.overlay`。该座位的真实契约（实测）：`kind: list` / `scope: session` / **无 owner props** / `replaceRisk: none`，语义为「composer 卡内的浮动条目」（宿主自己的斜杠菜单、引用菜单、消息反馈提示都注册在此）。它是承载体侧的 `#` 候选浮层的正确位置；若不用它，只能 DOM 注入，直接违反 §7.3。

**决定（用户）**：① 把 `conversation.input.overlay` 增补进 §7.1 的座位表（P4 使用，`id: prompt-enhancer-hash`、`order: 20`）；② `#` 触发降级为 **D2**——识别**草稿末尾**的 `#查询词` 令牌，候选用**鼠标点击**选取，**不接管键盘**（不接受需要 document 级 keydown 捕获的 D2-b）。

**代价声明**：§9.3 验收 2 中的「`#` 触发浮层可筛选、**↑↓ 选择、回车插入**」调整为「可筛选、**点击选择**」；`#` 仅在草稿**末尾**成令牌时触发（句中输入 `#` 不触发）。这两条均属宿主能力边界所致，不是实现取舍。

**影响范围**：§7.1 座位表（6 处 → 7 处）、§9.3 验收 2、P4 计划的任务 1/6/7。
