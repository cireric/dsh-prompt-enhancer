# dsh-prompt-enhancer P6 实施计划（M6 沉淀 + 管理）

> **面向 Agent 执行者：** 必需子技能：使用 `superpower-subagent-driven-development`（本计划 §10 已给出该技能在本仓库的实测调用方式）。
> **本文件尚未执行的标志：** §5 的任务清单只可被「用户已对 §3 全部 TBD 拍板」之后的执行者使用。拍板前不得开工。

**目标：** 把「管理面板 + 沉淀三入口 + 标签 + 回收站 + 导入导出」落地为可运行可验证的插件能力，对应规格 §9.3 验收 **7 / 8 / 9 / 10**（里程碑 **M6**）。

**唯一权威：** `docs/superpowers/specs/2026-09-24-dsh-prompt-enhancer-design.md`（已定稿）。本计划与规格冲突时以规格为准，并回头修正本计划与路线图。

**上游参考（只读）：** `.tmp/dsh-prompt-library/`（v0.16.0，MIT）。一切修复落在本项目侧。

**前置状态：** P1–P5 已交付；HEAD = `434c503`；M5 达成（验收记录 `docs/superpowers/plans/2026-09-24-p5-m5-acceptance.md`）。

**路径与命令约定：** 一律项目根相对路径 + 正斜杠；命令的默认 CWD 是项目根。本机为 macOS，命令用 bash 等价写法。宿主侧路径写 `$DSH_HOME`。

---

## 0. 输入：P5 交接的事实（不得重新踩）

| # | 事实 | 出处 |
| - | ---- | ---- |
| 0.1 | **写回/回滚契约（§4.4）**：客户端**不得**直接写 `sourceBody` / `aiRefined`；`api.updatePrompt` 的补丁类型是 `PromptWritablePatch & { aiWriteBack?: boolean }`（`src/types.ts` 的 `PROMPT_WRITABLE_KEYS`，6 键）；回滚走 `POST /prompts/:id/rollback`（宿主 swap(body, sourceBody)） | `src/types.ts:79-82`、`src/client/utils/api.ts:74-84` |
| 0.2 | `POST /prompts` 的响应是**双层信封** `{ prompt, evicted }`；`evicted` 是**物理删除**的 id 数组（不进回收站） | `src/host/routes.ts:115-128`、`src/host/store.ts:782-795` |
| 0.3 | 可直接复用的客户端面：`api.createPrompt / updatePrompt / rollbackPrompt / listPrompts / recordUsage / getMeta / setMeta / getSettings`；纯函数 `libraryCreateInput / needsWriteBack / canToggle`（ai-flow.ts）、`composeDraft / promptSummary`（insert.ts）、`parseVariables / fillTemplate / parseMemory`（template.ts） | `src/client/utils/api.ts`、`ai-flow.ts:1-63`、`insert.ts`、`template.ts` |
| 0.4 | **UI 既有模式（照抄，不另立风格）**：自渲染面板 + `overlayBase` + 只读捕获阶段 `pointerdown` 点外面关 + mount 时读一次设置 + 错误行自渲染并 `console.warn` | `src/client/components/PromptLibraryButton.tsx:96-130,155-244`、`theme.ts:14-22` |
| 0.5 | **零 DOM 注入 / 零键盘监听（用户裁定 D2）**：不得 `querySelector` / `MutationObserver` / `appendChild`；不得 `keydown|keyup|keypress`。要键盘交互须先回到用户重议 | P5 验收记录「零 DOM 注入复检」行 |
| 0.6 | 弹窗开合状态用**模块级 store + 开/关动作**共享（§7.1），组件之间不互相耦合 | 规格 §7.1 末段 |
| 0.7 | 座位现状：`conversation.input.left`(10/11) 与 `conversation.input.overlay`(20) 已用；`inject` 现为 `["slots","locale"]`（smoke 对其**深等值断言**，扩张时该断言必红，属预期） | `src/client/index.ts:33-57`、`scripts/smoke.mjs` |
| 0.8 | 导入导出（D5）：导出 = 目录选择 + `POST /export/save`（body 含**绝对路径** `dir`，文件名由服务端生成）；导入 = 浏览器 `<input type="file">` 读文本 → `POST /import`。**不得**自建 `/fs/*` 路由 | 规格 D5、`src/host/routes.ts:292-314` |
| 0.9 | 数据变更同步（D6）= 同进程 window 事件，**无 WebSocket**。本项目**尚未实现** `data-sync.ts` | 规格 §3.3 / D6；`src/client/utils/` 现无该文件 |
| 0.10 | **P6 要修的数据卫生缺口**：`enforceMaxCount` 物理删行但不同步 `tags` → 留下 `count=0` 孤儿标签（P5 验收 O-4 实测产生 `文本改写`） | `src/host/store.ts:782-795`（无 `syncTagsFromPrompts` 调用；且 `syncTagsFromPrompts` 只增不删，`store.ts:254-259`） |
| 0.11 | 编辑详情页要**承接 P5 的临时落点**：按 §4.4 提供「原文 / 优化稿」并排对比与切换按钮，复用 `rollbackPrompt` + `canToggle`；P5 的入口在 AI 结果面板内，P6 迁移后**面板内入口撤除** | 规格 §13.8 决定二 |
| 0.12 | 设置项：`showSidebarButton`（左侧入口显隐）、`selectionAddEnabled`（选中捕获开关）；读取仍是「mount 时读一次」，**即时生效归 P8** | 规格 §4.2；P5 交接第 4 条 |
| 0.13 | **产物与提交纪律**：客户端改动必须 `npm run build` 后与 `lib/` **同批提交**；判断产物新鲜度的唯一正确口径是「重跑 build 后 `git status` 是否为空」——**不要**用「某标识符是否在产物里」（esbuild tree-shaking 会让未被引用的导出缺席，P5 因此误判过一次） | P5 控制者裁决 #8/#12 |
| 0.14 | 只修改任务明确列出的文件；`.tmp/dsh-prompt-library/` 只读；`$DSH_HOME/profiles/**` 对本会话沙箱不可写 | 项目 AGENTS.md |

---

## 1. 已核实的宿主契约（2026-09-24 现核实：读宿主源码 + 活体只读探针）

> 本项目已两次因「凭记忆写宿主契约」返工，故本节每条都带**证据位置**与**实测输出**。宿主 checkout = `/Users/eric/Project/tests/deepseek-harness`（DSH Local Build `0.1.5-rc.2-c291`）。

### 1.1 `shell.overlay`（弹窗宿主）

| 项 | 值 | 证据 |
| -- | -- | ---- |
| 契约 | `kind: list` / `scope: root` / **无 owner props** / `replaceRisk: none` / `occupants` 为加性 | `packages/client/ui-layout/src/client/index.ts:91`；slot-catalog `shell.overlay` 条目（`registerOptions: id(required) / order / label`，`ownerProps: []`） |
| 声明方 | 由 `root` 条目（client-ui-layout）声明并渲染 → **始终挂载** | slot-catalog `declaredBy` 字段 |
| 渲染点 | `renderSlot('shell.overlay', {})` → `<div className={css.overlayLayer} data-shell-overlay>` | `packages/client/ui-layout/src/client/AppFrame.tsx:200,230-232` |
| 层样式 | `.overlayLayer { position:absolute; inset:0; z-index:20; pointer-events:none }`，且 `.overlayLayer > * { pointer-events:auto }` | `packages/client/ui-layout/src/client/AppFrame.module.css:90-99` |
| **list 包装器** | 每张 list 席位渲染为一个 `style="display: contents"` 的包装 div（`data-slot="…"`） | 实测见下 |
| 活体实测 | `[data-shell-overlay]` 存在；层 `pointer-events = none`；其**唯一**直接子元素 `display: contents` / `pointer-events: auto` / `rect = [0,0,0,0]`；该包装器内已有**第三方 occupant**（`div.dso-rail[aria-label="Outline"]`，即「大纲」插件）；viewport 1280×720 | Playwright 只读探针（`browser_evaluate`，未改任何状态） |

**关键推论（决定实现形态）：** 包装器是 `display: contents` → 我方组件**自己的根元素**直接继承 `pointer-events: auto`。若关闭态仍渲染一个铺满 frame 的根元素，它会**把整个应用挡死**（该层 `inset:0`）。故：

- `PromptSurfaceHost` 关闭态必须 `return null`（零盒子）；
- 打开态由弹窗自己铺一层 backdrop（backdrop 才允许捕获点击）。

### 1.2 `sidebar.footer.action`（左侧下方入口）

| 项 | 值 | 证据 |
| -- | -- | ---- |
| 契约 | `kind: list` / `scope: root` / owner props = `{ wide: boolean }`（`wide=false` 表示 56px 收起轨道）/ `replaceRisk: none` | `packages/client/ui-sidebar/src/client/contract/slots.ts:47-50`（席位声明）、`:105`（`SidebarFooterActionOwnerProps`）；slot-catalog 条目 |
| 渲染点 | `{renderSlot('sidebar.footer.action', { wide })}`，位于设置按钮所在的 footer | `packages/client/ui-sidebar/src/client/SidebarRoot.tsx:270` |
| occupants | 目录里记着 `client-ui-cordis CordisPanel id 'cordis-panel'`；**活体上有 3 个** | 实测 |
| 活体实测 | `[data-slot="sidebar.footer.action"]` 存在，包装器 `display: contents`，直接子元素 3 个：`div.cm-footer-stack.simple`（成本/余额）、`button.ccp-foot`、`button.lc-ov-entry`（Context Insights） | Playwright 只读探针 |

**含义：** P6 的入口将是**加性第 4 个**条目（规格指定 `id: prompt-enhancer`、`order: 100`）。同一行已有按钮，故入口的图标/文案必须与宽窄两态（`wide`）自适应，且不得假设自己是唯一元素。

### 1.3 座位 scope 与可用 props（**本里程碑的硬约束**）

| 席位 | scope | standardProps 是否含 `useInput` / `inputActions` | 证据 |
| ---- | ----- | --------------------------------------------------- | ---- |
| `conversation.input.left` | session | **含** `useInput: SnapshotSelectorHook<InputState>`、`inputActions: InputActions`（另有 `useChat/useConversation/useSession/sessionId/useProjection/useTrajectory`） | slot-catalog `conversation.input.left`（`slot-catalog.ts:709-751`） |
| `shell.overlay` | root | **不含**（只有 `useResource/useWorkspaces/usePanelInfo/useSessions/useSessionPendingInteraction`） | `slot-catalog.ts:2023-2030` |
| `sidebar.footer.action` | root | **不含** | `slot-catalog.ts:2160-2167` |

⇒ **「当前草稿存为提示词」不可能放在 `shell.overlay` 的管理面板里**（root 座位拿不到草稿与写入动作）。它必须落在 session 座位，或经 session 座位把草稿快照推进 `ui-state.ts` 的 store 供面板使用。→ **TBD-P6-6**。

### 1.4 目录选择能力：`workspaces` ≠ `uiWorkspace`（规格 §7.1 的服务名有误）

- 客户端服务 **`workspaces`**（`packages/api/workspace-controller/src/client/service.ts:88` `super(ctx, 'workspaces')`）的面是 `IWorkspaces`：`list / create / rename / delete / insertBefore / archiveSession / insertSessionBefore` —— **完全没有目录能力**（`packages/api/workspace-controller/src/client/service.ts:33-77`）。
- `pickDirectory(): Promise<string | null>` 在 **`ctx.uiWorkspace`** 上：`packages/client/ui-workspace/src/client/navigation.ts:16-70`（声明）、`:106`（`super(ctx, 'uiWorkspace')`）、`:179-183`（实现：`directoryPicker.pick()`）。
- 活体实测：宿主下发的客户端模块清单里含 `@deepseek-ai/dsh-client-ui-workspace/client.js`（`performance.getEntriesByType('resource')`）；`packages/bundle/web-app/package.json` 也声明了它。

⇒ 规格 §7.1 写的 `inject = [..., "workspaces", ...]`（用途「导出目录选择（D5）」）**在宿主上不成立**。正确做法：插件 `inject` 加 **`uiWorkspace`**（服务名），`package.json` 的 `dsh.client.inject` 加 **`@deepseek-ai/dsh-client-ui-workspace`**（包名）。→ **TBD-P6-7**（含规格 §13.9 追加授权）。

### 1.5 目录选择器的真实行为（D5 / §12 风险 1）

- 后端在 boot 时一次性决定，纯函数在 `packages/host/directory-picker-auto/src/resolve.ts:49-55`：`bindHost !== '127.0.0.1' → browse`；`ssh → browse`；`darwin|win32 → native`；linux 需 `DISPLAY`/`WAYLAND_DISPLAY` + chooser 二进制。
- 本机 = macOS + loopback + 非 SSH → **native**：每次 pick 由 `osascript` 在**宿主屏幕**打开真实系统对话框（`packages/host/directory-picker-native/src/index.ts:1-12`）。

⇒ **§12 风险 1 的降级预案（移植 `/fs/list` + `DirectoryPickerModal`，约 550 行）不需要**：能力存在。但**自动化验收无法代替人点系统对话框** → 验收 10 的导出路径需要一次人工点击（或改为直接验证 `POST /export/save`）。→ **TBD-P6-7**。

### 1.6 导入 / 导出路由的真实行为（本项目 P3 已落地）

| 路由 | 真实行为 | 证据 |
| ---- | -------- | ---- |
| `POST /export/save` | body `{ dir }`；`dir` 必须**绝对路径**且**已存在且是目录**，否则 400；文件名**服务端生成** `prompt-enhancer-backup-<YYYYMMDD-HHmmss>.json`；返回 `{ path, prompts, tags }` | `src/host/routes.ts:292-308` |
| `POST /import` | body `{ backup, confirm }`；`confirm !== true` → `{ ok:true, applied:false, stats:{added,overwritten,total} }`，**不落库**；`confirm:true` → 事务内 `insertPrompt + ensureTagsWith + ensureTagWith + syncTagsFromPrompts` | `src/host/routes.ts:310-314`、`src/host/store.ts:745-773` |
| 校验口径 | `version !== 1` / `prompts` 非数组 / 元素缺 `id` 或 `body` → **整份拒绝**（不静默跳过）；标签按信封恢复（含暂无引用的孤儿标签） | `src/host/store.ts:688-735` |
| 冲突策略 | **同 id 覆盖（insertPrompt 的 upsert 语义）、新 id 追加** | 规格 §4.3 |
| ⚠ 缺口 | **`POST /import` 不调用 `enforceMaxCount`**：导入 500 条而上限 300 会直接留下 500 条（`POST /prompts` 会淘汰） | 对照 `routes.ts:126` vs `:310-314` |

### 1.7 选区捕获在宿主公开面上的可行边界

- **宿主没有任何公开面**（服务 / 插槽 props / 动作）暴露「聊天区当前选区」。
- 宿主自己的客户端代码用的就是 DOM 只读：`window.getSelection()` + `range.getBoundingClientRect()`（`packages/client/ui-conversation/src/client/skeleton/InputBar.tsx:159-177`）、`el.closest('[data-conversation-scroll]')`（同文件 `:213`）。
- `data-conversation-scroll` / `data-composer-seat` 由宿主自己渲染并长期使用（`packages/client/ui-conversation/src/client/skeleton/ConversationRoot.tsx:367,376`），宿主 e2e 亦依赖它们。
- 上游 `SelectionAddPrompt.tsx`（912 行）的捕获方式：`window.getSelection()` + `getRangeAt(0)` + `rootEl.closest('[data-conversation-scroll]')` 判定，且注册 `selectionchange` + `mousedown/mouseup` + **`keydown/keyup`** + `scroll`（`:329,339,350-352,410-434`）。

⇒ 判定「选区在聊天区」只能靠 `Node.closest()` 读上述宿主属性（**只读 DOM 读，不是注入**）；**`keydown/keyup` 必须去掉**（违反 D2）。→ **TBD-P6-3**。

### 1.8 其它已核实的现状

- `src/client/utils/` 现有：`ai-flow / api / hash-token / i18n / insert / template / theme`。**没有** `data-sync.ts`、`ui-state.ts`、`workspace-dir.ts`、`dialog-style.ts`、`common/*`、`data-formats.ts`。
- `api.ts` **缺** P6 需要的全部面：tags CRUD、trash 三个动作、import/export、`deletePrompt`、`getPrompt`。
- i18n 现为 **49 键 ×2**（`src/client/utils/i18n.ts`；**A12 订正**：原文写的「98 键」有误，当时实测 49 键。口径与后值：P6 各任务填充后、T6 收口前为 **165 键 ×2**，T6 删除三个死键后为 **162 键 ×2**），`tests/i18n.test.mjs` 的键名正则**只接受恰好两级** `a.b`（P5 延期项 #8）→ P6 若新增三级键必须同步改该正则。
- 类型包齐备：`node_modules/@deepseek-ai/` 下 `dsh-client-ui-slots / ui-layout / ui-sidebar / ui-workspace / ui-renderer / ui-conversation / ui-primitives / dsh-client-locale` 均 present（`scripts/link-dsh-deps.mjs` 全量链接 profile 的 251 个包）。
- SDD 脚本存在但**无可执行位**：`$DSH_HOME/profiles/web/node_modules/@wenaixi/dsh-superpower/skills/superpower-subagent-driven-development/scripts/{sdd-workspace,task-brief,review-package}`（`-rw-r--r--`）→ 一律 `bash <script>`。

---

## 2. 设计决策（控制者自裁，无需拍板；与规格一致）

| # | 决策 | 依据 / 若错的代价 |
| - | ---- | ----------------- |
| D-P6-1 | **弹窗宿主唯一**：管理面板、标签面板、回收站面板、导入导出弹窗、选中捕获的**弹窗部分**，统一由 `shell.overlay` 的 `PromptSurfaceHost` 承载（`id: prompt-enhancer`、`order: 100`）；开合与面板选择状态在 `src/client/utils/ui-state.ts` 的模块级 store，入口只调 `openManager()`。关闭态组件 `return null`（§1.1 的硬约束） | 规格 §7.1/§13.4；若错的代价：多一个宿主实现，约 120 行返工 |
| D-P6-2 | **同步不改协议**：`data-sync.ts` 用 `globalThis` 上的 `EventTarget`（浏览器即 window，同进程，D6；Node 测试可直接跑），事件名 `prompt-enhancer:data-changed`，订阅经 `useDataChanged(fn, deps)` 包装 | D6；若错的代价：Node 测试需注入伪造 window |
| D-P6-3 | **选中捕获只读**：只读 `window.getSelection()`；交互线 = `document` 的 `selectionchange` + 捕获阶段 `pointerdown`/`pointerup` + `window` 的 `scroll`；**不注册任何 `keydown|keyup|keypress`**；浮出按钮渲染在**我方自己拥有**的 DOM 内（`position: fixed`，坐标取自 `range.getBoundingClientRect()`） | D2 + §1.7；若错的代价：违反用户裁定，必须回炉 |
| D-P6-4 | **能力条件注入**：`uiWorkspace` 走 `ctx.inject(["uiWorkspace"], scope => …)` 版本化持有（与宿主 `ctx.inject(["llm"])` 同形）；服务缺失时导出按钮渲染为禁用 + 可读原因（**不静默**） | 结构化降级；若错的代价：无会话/无该包的部署里导出整块失效 |
| D-P6-5 | **淘汰二次确认不改 host 路由**：客户端预检（`GET /prompts` 条数与 `GET /settings.maxPromptCount`，按 `store.enforceMaxCount` 的同源排序键预演受害者），确认后再 `POST /prompts`。排序键的单一事实源写在注释里，并加一条「双跑对照」单测 | 规格 §5 路由表不含 dry-run 路由，加路由=改规格；若错的代价：客户端预演与 store 排序漂移 → 单测会红 |
| D-P6-6 | **孤儿标签修复在 store 内**：新增私有辅助 `pruneOrphanTags(cur)`（删掉 `tags` 中无任何 prompts 行引用的行），在 `enforceMaxCount` 的**同一事务**内调用；管理面板标签页另给一个手动的「清理无用标签」动作（复用同一函数） | §0.10 + 规格 §4.4；若错的代价：孤儿标签继续堆积（观感） |
| D-P6-7 | **P5 延期项的 P6 收编**：`run()` 改整表重置（#5）、`keepVariables` 改必填（#9）、回滚失败文案改走 `error.*`（#6）、`libraryCreateInput` 首行 trim（#2）、切换按钮补 busy 态（#3）、`tests/i18n.test.mjs` 键名正则支持多级（#8）。逐条在 §9 标注 | P5 延期项清单；若错的代价：新增跨态控件时旧值可见（#5 是真实缺陷） |
| D-P6-8 | **技能相关不越界**：P6 只保证 `skillName`/`skillExportedAt` 两列在软删除/恢复/淘汰过程中的数据卫生；技能导出 UI、过期徽标、一键重导**仍归 P7** | 路线图 P7 行、规格 §7.6；若错的代价：与 P7 抢地盘 |

---

## 3. 待用户拍板表（**拍板前不得开工**）

> 每条给：问题 / 可选值 / 我的建议 / 若错的代价。裁定后写进本表下方「裁定」区，执行期不再回头问。

| # | 问题 | 可选值 | 我的建议 | 若错的代价 |
| - | ---- | ------ | -------- | ---------- |
| **TBD-P6-1** | **`shell.overlay` 的 P6/P7 分期冲突**：路线图「衔接点」第 42 行写「`shell.overlay` 弹窗宿主在 **P7** 引入；P6 的管理面板在此之前先用组件内联渲染，P7 迁移到 root 浮层」；而规格 §7.1 把 `shell.overlay`(root/list/id `prompt-enhancer`/order 100) 定为承载**管理、导出、导入弹窗**的宿主，§7.3 更写明这是为了去掉「必须先有会话才能开面板」的隐性约束（验收 18 依赖它） | (a) 按规格裁决：**P6 引入 `shell.overlay`**，路线图第 42 行回头改写；(b) 按路线图：P6 用组件内联渲染，P7 迁移 | **(a)**。规格是唯一权威且这是它的显式设计意图；内联渲染还要在 P7 做一次迁移，等于同一块 UI 写两遍 | 选 (b)：多一次宿主迁移返工 + P6 的管理面板在无会话时打不开（与 §7.3 的意图相反）。选 (a) 而用户其实想 P7 做：P6 的宿主层（约 120 行）提前一次，无破坏 |
| **TBD-P6-2** | **`sidebar.footer.action` 左侧入口与验收 18 的归属**：路线图把「左侧入口」放 P7、验收 18 归 P7；但 §1.3 已证 root 面板拿不到草稿，若左侧入口不在 P6，则 P6 唯一入口是 session 座位的输入框按钮 → `shell.overlay` 的服务于「无会话也能开面板」的意义在 P6 落空 | (a) P6 一并落地 `SidebarPromptEntry`（约 80 行）+ 验收 18 提前到 P6（P7 复审）；(b) 严格按路线图，P6 只做 `shell.overlay` 宿主，入口与验收 18 留 P7 | **(a)** | 选 (b)：P6 的 root 宿主在 P6 期内无法被人验证（没有入口能打开它），且 P7 要再改一次注册表。选 (a) 而用户想留 P7：约 80 行 + 一个已存在的验收项 |
| **TBD-P6-3** | **选中捕获的交互线与「零 DOM 注入」边界**：上游读宿主 DOM 属性（`closest('[data-conversation-scroll]')` / `[data-composer-seat]`）判定选区位置，并注册 `keydown/keyup` | (a) 允许**只读** `Node.closest()` 读宿主标记，**去掉键盘监听**，只保留 `selectionchange` + `pointerdown/pointerup`(capture) + `scroll`；(b) 更严：不读任何宿主 DOM 属性，任一文本选区都浮出按钮（会出现在侧栏/设置里）；(c) 允许 `keydown`（**与 D2 冲突，须用户显式推翻 D2**） | **(a)**。宿主自己的客户端代码就这么读（`InputBar.tsx:213`），且 `data-*` 是宿主长期契约；它是读不是写 | 选 (a) 而用户认定「读宿主属性也算注入」：改成 (b) 只需删一个判定分支，但会出现误浮出。选 (c)：违反 D2，需重议 |
| **TBD-P6-4** | **导入冲突策略与预览口径**：现库存能力 = 同 id 覆盖 / 新 id 追加；预览**只有计数**（`{added,overwritten,total}`），没有逐条 diff；且 `POST /import` **不触发淘汰** | (a) 保持现状：预览 = 计数 + 「同 id 将被覆盖，不可撤销」的显式文案；导入后**不**淘汰（若超上限，在结果里显式提示条数）；(b) 预览升级为逐条 diff（列表：新增 N 条 / 覆盖 M 条，含标题），需要 store 返回 id 级明细（新增字段）；(c) 导入后调用 `enforceMaxCount`（与 `POST /prompts` 一致，但会**静默物理删除**导入来的数据） | **(a) + 一条显式提示**。计数预览已满足验收 10（导出→改库→导入恢复），逐条 diff 属额外范围；(c) 最危险——淘汰是物理删除且无回收站，用户刚导入就被删不可接受 | 选 (b)：多约 150 行 + store 契约变更（`ImportStats` 加字段，向后兼容但要改测试）。选 (c)：可能删掉用户刚导入的数据，不可逆 |
| **TBD-P6-5** | **淘汰二次确认的交互位置与判定口径**：`POST /prompts` 是「立即创建 + 立即淘汰并返回 `evicted`」；规格 §4.4 要求「淘汰前二次确认」（当前宿主路由表**没有** dry-run 路由） | (a) 客户端预检 + 确认弹窗（新建/存为提示词前先查条数与上限，需淘汰时列出将删的候选标题，确认后才 POST）；(b) 新增宿主 dry-run 路由/参数（改规格 §5 的 API 表）；(c) 事后撤销（创建后用 `evicted` 提示，无法恢复——失效） | **(a)**：不动宿主 API、满足「淘汰前确认」字面要求。必须把「预演排序键与 `store.enforceMaxCount` 同源」写成注释 + 双跑单测 | 选 (a) 而预演与 store 排序漂移：确认框列的候选与实际被删的不同（有单测兜底，且**最终仍以 `evicted` 返回值为准**做结果提示）。选 (b)：改规格 + 宿主测试面 |
| **TBD-P6-6** | **「当前草稿存为提示词」的落点**（§1.3 证明 root 面板拿不到 `useInput`）：规格 §7.1 的 6 座位表**没有**给这个入口安排座位 | (a) 挂在已有 `PromptLibraryButton`（`conversation.input.left`，order 10）的快速列表面板里，加一个「把当前草稿存为提示词」按钮；(b) 新增一个 session 座位条目（同 `conversation.input.left`，`id: prompt-enhancer-capture`、`order: 12`，约 60 行）；(c) 由 `selectionAddEnabled` 同一个 session 组件顺带承载 | **(a)**：不改座位表（与 §7.1 的「6 处」一致），复用已有面板与 `useInput`，零新增宿主面 | 选 (a) 而用户想要独立按钮：需要 (b) 的改法，约 60 行 + smoke 座位账本增一条。选 (c)：把「选中」与「草稿」两个入口耦合，观感/职责更差 |
| **TBD-P6-7** | **导出方向选择能力的注入名与验收方式**：规格 §7.1 写 `workspaces`，实测该服务**没有** `pickDirectory`（§1.4）；本机解析为 **native** 选择器（真实系统对话框，§1.5） | (a) 订正为 `uiWorkspace` 条件注入，导出验收改为「① `POST /export/save` 用显式绝对路径做**全自动**验证 + ② 目录选择器由**人工点一次**系统对话框并记录路径」；(b) 完全绕过选择器，导出固定写 `$DSH_HOME/prompt-enhancer/`（**偏离 D5**）；(c) 移植 `/fs/*` + `DirectoryPickerModal`（550 行，规格 §12 的降级预案） | **(a)** | 选 (a) 而实际服务缺失：导出按钮显示可读的不可用原因，其余功能不受影响（已按 D-P6-4 设计）。选 (b)：偏离 D5 且用户失去选目录能力。选 (c)：先花 550 行做一个宿主已有能力的复制品 |
| **TBD-P6-8** | **规格追加与路线图修正的授权**：本次现核实暴露 3 处规格/路线图与宿主事实不符（服务名 `workspaces` → `uiWorkspace`；`shell.overlay` 分期；验收 18 归属），项目 AGENTS.md 要求「规格变更须追加 §13.x 并重新复核」 | (a) 授权 P6 追加规格 §13.9（4 条：inject 名订正、P6/P7 分期订正、导入与淘汰的关系、淘汰二次确认口径）+ 改写路线图第 42 行与相关行；(b) 只在 P6 计划内记录，规格/路线图不动 | **(a)**：规格是唯一权威，事实性错误留在权威文档里会继续误导 P7/P8 | 选 (b)：P7/P8 的编写者会照着错误的服务名再走一遍弯路（本项目已两次因此返工）。选 (a)：一次文档编辑，可逆 |

| **TBD-P6-9** | **管理面板 UX 的移植范围与重写边界**：上游 `LexiconManagerModal.tsx` = **2075 行**、`ImportExportModal.tsx` = **1644 行**、`ImportEditModal.tsx` = **1036 行**、`SelectionAddPrompt.tsx` = **912 行**、`RecycleManagePanel.tsx` = **566 行**、`TagManagePanel.tsx` = **413 行**、`common/*` 合计 ≈ **800 行**（实测 `wc -l`）；规格 §8 只说了「重写 `PromptManagerModal` / `ImportExportModal`，改写 Tag/Recycle，原样搬运 `common/*` 与 `TemplateVariables`」，**没说**重写到什么程度算达标、`common/*` 里哪些真正需要 | (a) 严格按规格：管理面板与导入导出**重写**（只保验收 7/8/9/10 覆盖的行为），标签/回收站**改写**（保上游交互），`common/*` **按需**移植（预计只用到 `SearchBox / TagInput / ConfirmDialog / Pagination / PanelHeader / DialogCloseButton`，`Tooltip` 视用不用而定）；(b) 更大范围移植：把上游 `ImportEditModal`(1036) 等子面板一并移植改写（保 UX 一致性，多 ≈1300 行）；(c) 更小：管理面板做成单页无子面板（省 `ConfirmDialog`/`Pagination`，但标签/回收站/导入导出仍要各自的容器） | **(a)**：与规格 §8「净减 ≈60%」的目标一致；验收 7/8/9/10 是判定标准，不是「与上游逐像素一致」。`ImportEditModal` 不移植（上游用它做导入前的逐条编辑，属 TBD-P6-4 选 (b) 才需要） | 选 (b)：多约 1300 行与一轮评审，功能超出 M6 范围。选 (c)：标签/回收站/导入导出仍要三个容器，省不下多少，且`ConfirmDialog` 的二次确认反而要手写两遍 |

**待填：用户裁定区**（用户回复后由控制者填入并锁定）

| TBD | 裁定 |
| --- | ---- |
| P6-1 | 待定 |
| P6-2 | 待定 |
| P6-3 | 待定 |
| P6-4 | 待定 |
| P6-5 | 待定 |
| P6-6 | 待定 |
| P6-7 | 待定 |
| P6-8 | 待定 |
| P6-9 | 待定 |

---

## 4. 文件结构（P6 触及的清单）

**新增（src）**

| 文件 | 估行 | 职责 |
| ---- | ---- | ---- |
| `src/client/utils/ui-state.ts` | ~120 | 模块级 store：`openManager(panel?)` / `closeManager()` / `useManagerState()` / 选中的草稿快照 & 选区载荷的推送口（§7.1 的共享状态） |
| `src/client/utils/data-sync.ts` | ~50 | `notifyDataChanged()` / `useDataChanged(fn, deps)`（`globalThis` 上的 `EventTarget`，D6） |
| `src/client/utils/workspace-dir.ts` | ~60 | 目录能力持有与访问（`setDirectoryCapability` / `isDirectoryPickerAvailable` / `pickExportDirectory`），服务缺失时抛出**可读**错误 |
| `src/client/utils/dialog-style.ts` | ~60 | 弹窗/backdrop 的共享样式常量（从上游 `OVERLAY/DIALOG` 裁剪，仅保留提示词相关） |
| `src/client/components/common/` | ~350 | 按需移植：`SearchBox`(291)`/`TagInput`(61)`/`ConfirmDialog`(110)`/`Tooltip`(100)`/`Pagination`(75)`/`PanelHeader`(46)`/`DialogCloseButton`(56)`/`BookIcon`(27)`：**按 §3 的 TBD-P6-9 裁定裁剪** |
| `src/client/components/PromptSurfaceHost.tsx` | ~140 | `shell.overlay` 宿主：按 `ui-state` 渲染管理/标签/回收站/导入导出弹窗；关闭态 `return null` |
| `src/client/components/PromptManagerModal.tsx` | ~600 | 管理面板（重写）：列表 + 搜索 + 排序 + 标签过滤 + 新建/编辑 + 详情页（含「原文 / 优化稿」并排对比与切换） |
| `src/client/components/SidebarPromptEntry.tsx` | ~80 | `sidebar.footer.action` 入口（按 TBD-P6-2 裁定是否本期做） |
| `src/client/components/SelectionAddPrompt.tsx` | ~220 | 选中文字 → 浮出「存为提示词」→ 弹窗预填正文（只读选区 + 无键盘监听） |
| `src/client/components/TagManagePanel.tsx` | ~300 | 标签：重命名 / 删除（在用拒绝并给用量）/ 清理无用标签 |
| `src/client/components/RecycleManagePanel.tsx` | ~350 | 回收站：列表 / 恢复 / 永久删除 / 清空 |
| `src/client/components/ImportExportModal.tsx` | ~450 | 导出（选目录 → `/export/save`）与导入（`<input type="file">` → 预览 → 确认落库） |

**改动（src / tests / 文档）**

| 文件 | 改动 |
| ---- | ---- |
| `src/client/utils/api.ts` | 补 P6 全部面：`getPrompt / deletePrompt / listTags / createTag / renameTag / deleteTag / listTrash / restoreTrash / deleteTrash / emptyTrash / importBackup(preview\|confirm) / exportBackup(dir)` |
| `src/client/utils/i18n.ts` | 追加 P6 文案（管理面板 / 标签 / 回收站 / 导入导出 / 选中捕获 / 淘汰确认），zh 与 en 键集必须全等 |
| `src/client/utils/ai-flow.ts` | `libraryCreateInput` 首行 trim（P5 延期 #2）；`keepVariables` 调用侧改必填（#9 的调用方在 `AIPolishButton`） |
| `src/client/components/AIPolishButton.tsx` | `run()` 整表重置（延期 #5）；回滚失败文案走 `error.*`（#6）；切换按钮补 busy 态（#3）；**撤除面板内的切换入口**（§13.8 决定二：P6 迁往详情页） |
| `src/client/components/PromptLibraryButton.tsx` | 接入 `openManager()`；按 TBD-P6-6 承载「当前草稿存为提示词」；按 TBD-P6-3 承载选中捕获宿主 |
| `src/client/index.ts` | 新增 2–3 个座位注册（`shell.overlay` / `sidebar.footer.action`（按 TBD-P6-2）/ 选中捕获宿主）；`inject` 加 `uiWorkspace`（条件注入） |
| `src/host/store.ts` | `pruneOrphanTags` + `enforceMaxCount` 事务内调用；导入路径与淘汰的一致性（按 TBD-P6-4 裁定） |
| `package.json` | `dsh.client.inject` 加 `@deepseek-ai/dsh-client-ui-workspace`（及 `ui-sidebar`/`ui-layout` 若需要类型） |
| `scripts/smoke.mjs` | 座位账本从 3 条扩到 5–6 条；`inject` 深等值断言更新 |
| `tests/` | 扩展 `api.test.mjs` / `store.test.mjs` / `ai-flow.test.mjs` / `i18n.test.mjs`；新增 `ui-state.test.mjs` / `data-sync.test.mjs` |
| `docs/superpowers/plans/2026-09-24-dsh-prompt-enhancer-roadmap.md` | 按 TBD-P6-1/2/8 改写第 42 行与相关行 |
| `docs/superpowers/specs/…design.md` | 按 TBD-P6-8 追加 §13.9 |
| `docs/superpowers/plans/2026-09-24-p6-m6-acceptance.md` | 新建（验收记录，格式照 P5） |

---

## 5. 任务分解

> **分发纪律（SDD）**：一个实现者一个任务，**绝不并行**；每任务分发前记 `BASE`，评审用 `BASE..HEAD`；子代理**不**分发子代理；子代理无法向人提问 → 简报必须写「遇歧义按最强证据自定 + 在报告里显式列假设；若假设会改变验收结果，直接以 NEEDS_CONTEXT 汇报」。
> **每个任务结束四项全绿**：`npm run typecheck && npm test && npm run build && npm run smoke`；**客户端改动必须与 `lib/` 同批提交**，新鲜度口径 = 「重跑 build 后 `git status` 为空」。
> **新增负样本必须先用变异验证**：临时改坏实现 → 用例必须红 → 复原 → 再跑一次确认绿。

### 任务 1：客户端 HTTP 面 + 三块基础设施（ui-state / data-sync / workspace-dir）

**文件：** 改写 `src/client/utils/api.ts`；新建 `src/client/utils/ui-state.ts`、`src/client/utils/data-sync.ts`、`src/client/utils/workspace-dir.ts`；新建 `tests/ui-state.test.mjs`、`tests/data-sync.test.mjs`；扩展 `tests/api.test.mjs`、`scripts/smoke.mjs`、`src/client/index.ts`（仅加 `uiWorkspace` 条件注入与能力接线）、`package.json`

**接口（对外契约，后续任务直接消费）：**

```ts
// api.ts 追加（一律 call<T>，信封失败抛 ApiError）
getPrompt(id): Promise<Prompt>
deletePrompt(id): Promise<{ deleted: true }>                    // 软删除 → 回收站
listTags(): Promise<Array<{ name: string; count: number }>>
createTag(name): Promise<{ name: string }>
renameTag(from, to): Promise<{ affected: number }>
deleteTag(name): Promise<{ deleted: boolean; inUse: number }>    // 在用 → 400，带用量
listTrash(): Promise<TrashItem[]>
restoreTrash(id): Promise<{ restored: number }>
deleteTrash(id): Promise<{ removed: number }>
emptyTrash(): Promise<{ removed: number }>
importBackup(backup: unknown, confirm?: boolean): Promise<ImportResult>
exportBackup(dir: string): Promise<{ path: string; prompts: number; tags: number }>

// ui-state.ts
export type ManagerPanel = "list" | "tags" | "trash" | "transfer";
export function openManager(panel?: ManagerPanel): void
export function closeManager(): void
export function useManagerState(): { open: boolean; panel: ManagerPanel }
export function pushCapture(payload: { body: string; title?: string }): void   // 沉淀入口 → 面板预填
export function useCapture(): { body: string; title: string } | null
export function takeCapture(): { body: string; title: string } | null          // 取出即清（避免二次预填）

// data-sync.ts
export const DATA_CHANGED = "prompt-enhancer:data-changed"
export function notifyDataChanged(): void
export function useDataChanged(fn: () => void, deps?: unknown[]): void

// workspace-dir.ts
export function setDirectoryCapability(cap: { pickDirectory(): Promise<string | null> } | null): void
export function isDirectoryPickerAvailable(): boolean
export function pickExportDirectory(): Promise<string | null>   // 不可用时抛可读错误
```

**步骤：**
- [ ] 步骤 1：`api.ts` 按上表补齐；每个方法与 `src/host/routes.ts` 的真实路径/枚举逐条对照（这是唯一的接口事实源）
- [ ] 步骤 2：`ui-state.ts` 用模块级 `useSyncExternalStore` 兼容的 store（`subscribe/getSnapshot`），**不 import 任何宿主服务**，可被 Node 直接测
- [ ] 步骤 3：`data-sync.ts` 用 `globalThis` 的 `EventTarget`（Node ≥15 已有），事件名常量导出
- [ ] 步骤 4：`workspace-dir.ts` + `index.ts` 的 `ctx.inject(["uiWorkspace"], scope => { setDirectoryCapability(scope.uiWorkspace); return () => setDirectoryCapability(null); })`；`inject` 导出数组保持 `["slots","locale"]` 不扩张（用条件注入拿到服务），并在 smoke 里**显式记录**该事实
- [ ] 步骤 5：`package.json` 的 `dsh.client.inject` 追加 `@deepseek-ai/dsh-client-ui-workspace`
- [ ] 步骤 6：测试
  - `tests/api.test.mjs`：为每个新方法断言「HTTP 方法与路径」「信封失败抛 ApiError 且带 status」「body 形状」（用注入式 `globalThis.fetch` 桩，仿 P5 既有做法）
  - `tests/ui-state.test.mjs`：`openManager/closeManager` 幂等、`takeCapture` 取出即清、订阅在变更时被通知且退订后不再被通知
  - `tests/data-sync.test.mjs`：`notifyDataChanged()` 触发订阅、退订后不触发
- [ ] 步骤 7：**变异验证（必须）**：临时把 `deleteTag` 的方法从 DELETE 改成 POST → `api.test.mjs` 必须红；临时把 `takeCapture` 去掉清空 → `ui-state.test.mjs` 必须红；两项复原
- [ ] 步骤 8：全绿 + 提交 `feat(client): P6 client API surface with ui-state, data-sync and directory capability`

**验收映射：** 无直接验收项（基础设施）；为验收 8/9/10 提供面。

---

### 任务 2：管理面板 + `shell.overlay` 宿主（§7.1 / §4.4 的迁入）

**依赖：** 任务 1。**规格落点：** §2.1-1/6、§4.4、§7.1、§7.3、验收 8 的前半。

**文件：** 新建 `src/client/components/PromptSurfaceHost.tsx`、`PromptManagerModal.tsx`、`src/client/utils/dialog-style.ts`；改写 `src/client/index.ts`（注册 `shell.overlay`）、`PromptLibraryButton.tsx`（按钮加「管理」动作 → `openManager()`）、`i18n.ts`、`scripts/smoke.mjs`

**步骤：**
- [ ] 步骤 1：注册 `shell.overlay`：`{ name:"shell.overlay", id:"prompt-enhancer", order:100, locale: NS }` → `PromptSurfaceHost`；**关闭态返回 `null`**（§1.1），打开态渲染 backdrop + 弹窗卡片
- [ ] 步骤 2：面板骨架：`role="dialog"` + `aria-label`（i18n）+ 头部四页签（列表 / 标签 / 回收站 / 导入导出）+ 关闭；`Escape` **不注册**（零键盘）；点 backdrop 关（`pointerdown` 捕获阶段，照抄 `PromptLibraryButton` 的既有模式，但作用域是本弹窗根节点）
- [ ] 步骤 3：列表页：`api.listPrompts({ q, tag, sort })`；搜索框（防抖 ≥250ms）、排序选择（`default/updated/used/created`）、标签过滤、分页或虚拟截断（按 TBD-P6-9 裁定）；每行：标题 / 摘要 / 标签 / 用量 / 动作（编辑 → 详情页；删除 → 软删除 `api.deletePrompt`）
- [ ] 步骤 4：详情页（编辑）：标题 / 正文 / 标签 / 摘要可编辑 → `api.updatePrompt(id, PromptWritablePatch)`；保存成功后 `notifyDataChanged()`
- [ ] 步骤 5：**§4.4 的「原文 / 优化稿」并排对比 + 切换**（承接 §13.8 决定二）：仅 `canToggle(prompt)` 为真时渲染；并排两个只读块 + 「切换」按钮 → `api.rollbackPrompt(id)` → 用返回的 `Prompt` 整条替换本地态；按钮必须有 busy 态与失败可见（400/404 走 `error.*` 文案，D-P6-7）
- [ ] 步骤 6：把 `AIPolishButton` 结果面板里的切换入口**撤除**（§13.8 决定二：临时落点迁走），并保证 `AIPolishButton` 的既有验收 6 仍成立（改为指向详情页的入口提示）
- [ ] 步骤 7：smoke：座位账本改为按注册顺序深等值的 4–6 条（`shell.overlay` 必含）；i18n 键集断言照旧
- [ ] 步骤 8：**变异验证**：临时把 `PromptSurfaceHost` 关闭态改成渲染空 div → 无自动化断言可红（**故本步改为在验收记录里用活体探针证明「关闭态根元素不存在/零盒子」**，并临时把 `order` 改错 → smoke 必须红）
- [ ] 步骤 9：全绿 + 提交 `feat(client): manager panel hosted in shell.overlay with original/refined compare`

**验收映射：** 验收 8 前半（草稿存为提示词的面板形态）、验收 9 的编辑面、§4.4 的并排对比与切换；为验收 10 提供弹窗宿主。

---

### 任务 3：沉淀三入口（§2.1-6、D3、验收 7 / 8）

**依赖：** 任务 2。**规格落点：** §2.1-6、§7.3「选中文字捕获保留」、§4.2 的 `selectionAddEnabled`。

**文件：** 新建 `src/client/components/SelectionAddPrompt.tsx`；改写 `PromptLibraryButton.tsx`（承载选中捕获宿主 + 按 TBD-P6-6 承载「草稿存为提示词」）、`i18n.ts`、`scripts/smoke.mjs`（若新增座位）

**步骤：**
- [ ] 步骤 1：**入口 A（管理面板新建/编辑）**——已由任务 2 提供；补一条空的「新建」路径（面板内「新建」按钮 → 详情页 blank 态 → `api.createPrompt`）
- [ ] 步骤 2：**入口 B（选中文字浮出「存为提示词」）**：按 D-P6-3 实现
  - 只读 `window.getSelection()`；空/折叠不浮出（**A12 订正**：原文的「超长不浮出」已按 **R33 作废**——R13 明示**不设长度上限**，正文多长都浮出；标题长度仍走既有的 `clampTitle`）
  - 位置判定按 TBD-P6-3 裁定的分支（允许只读 `closest('[data-conversation-scroll]')` 时，排除 `[data-composer-seat]` 与我方根节点）
  - 监听：`selectionchange` + `pointerdown/pointerup`（capture）+ `scroll`；**不注册 keydown/keyup/keypress**
  - 浮出按钮渲染在**我方根节点内**（`position: fixed` + `getBoundingClientRect()` 换算）；点击 → `pushCapture({ body })` → `openManager("list")` → 面板新建态预填
  - 受 `settings.selectionAddEnabled` 门控（mount 时读一次，即时生效归 P8）
- [ ] 步骤 3：**入口 C（当前草稿存为提示词）**：按 TBD-P6-6 裁定；
  - 选 (a)/(c) 时：在 `PromptLibraryButton` 里读 `draft`，按钮 → `pushCapture({ body: draft })` → `openManager("list")`
  - 选 (b) 时：新增 session 座位条目并同步 smoke 账本
- [ ] 步骤 4：三条入口的**落库后同步**：成功后 `notifyDataChanged()`；`createPrompt` 返回 `{ prompt, evicted }`，`evicted.length > 0` 时按 D-P6-5 的确认流程（任务 4 落地前先给可见提示）
- [ ] 步骤 5：测试：`tests/selection.test.mjs`（新建，纯函数部分：选区文本归一化 / 折叠判定 / 是否在我方根节点内的判定），组件行为由任务 7 的活体验收承担（本仓库无 jsdom，禁加依赖）
- [ ] 步骤 6：**变异验证**：临时把折叠判定（`isCollapsed`）写成恒 false → `selection.test.mjs` 必须红；复原
- [ ] 步骤 7：全绿 + 提交 `feat(client): three capture entries including chat selection and draft`

**验收映射：** 验收 7（选中聊天文字 → 浮出 → 保存后出现在词库）、验收 8（当前草稿存为提示词）。

---

### 任务 4：标签 + 回收站 + 淘汰二次确认 + 孤儿标签（验收 9，§4.4）

**依赖：** 任务 2/3。**规格落点：** §2.1-7、§4.4、§4.1（trash 的 skill 两列）、§13.5。

**文件：** 新建 `TagManagePanel.tsx`、`RecycleManagePanel.tsx`（作为 `PromptSurfaceHost` 的页签内容）；改写 `src/host/store.ts`（`pruneOrphanTags` + 淘汰事务内调用）、`src/client/components/PromptManagerModal.tsx`（接入两个页签 + 淘汰确认弹窗）、`PromptLibraryButton.tsx`/`SelectionAddPrompt.tsx`（接入确认流程）、`i18n.ts`；扩展 `tests/store.test.mjs`

**步骤：**
- [ ] 步骤 1：标签页：列表（`name` + `count`）、重命名、删除（`inUse > 0` 时**拒绝并显示用量**，文案必须与宿主 400 的语义一致）、「清理无用标签」（`count === 0` 批量删）
- [ ] 步骤 2：回收站页：列表（标题 / 删除时间 / 用量）、恢复、永久删除（二次确认）、清空（二次确认）；确认弹窗用 `ConfirmDialog`（或自渲染等价物），**不新引入依赖**
- [ ] 步骤 3：**store 修复**：`pruneOrphanTags(cur)` 与 `enforceMaxCount` 同事务；`tests/store.test.mjs` 加用例「淘汰后 `count=0` 的标签被清理」 + 「仍被引用的标签不被误删」
- [ ] 步骤 4：**淘汰二次确认（D-P6-5 / TBD-P6-5）**：统一封装 `confirmEviction()`——读 `api.listPrompts()` 与 `getSettings().maxPromptCount`，若 `count >= max` 则按 `(aiRefined asc, lastUsedAt asc)`（注释标注与 `store.enforceMaxCount` 同源）列出将淘汰的候选项，确认后才执行创建；结果以 `evicted` 为准做人话提示
- [ ] 步骤 5：**数据卫生**：软删除 → 恢复后 `skillName` / `skillExportedAt` 不丢（§13.5 已落 store；本步在 UI 上不可见，只做断言）
- [ ] 步骤 6：测试：`store.test.mjs` 扩展（标签在用保护 / 淘汰清理孤儿 / 恢复保留技能列）；`tests/eviction.test.mjs`（新建）：预演排序函数的输出与 `store.enforceMaxCount` 的受害者在同一输入下**逐 id 相等**（双跑对照）
- [ ] 步骤 7：**变异验证**：① 把 `enforceMaxCount` 里的 `pruneOrphanTags` 注释掉 → 用例必须红；② 把预演排序的第二个键从 `lastUsedAt` 改成 `updatedAt` → `eviction.test.mjs` 必须红；复原
- [ ] 步骤 8：全绿 + 提交 `feat: tag and trash management with pre-eviction confirmation and orphan tag cleanup`

**验收映射：** 验收 9（标签重命名/删除 + 回收站三个动作）、§4.4 的淘汰二次确认、P5 验收 O-4 的数据卫生缺口。

---

### 任务 5：导入导出（D5、§4.3、验收 10）

**依赖：** 任务 1/2。**规格落点：** §2.1-8、§4.3、D5、§12 风险 1。

**文件：** 新建 `ImportExportModal.tsx`（作为 `PromptSurfaceHost` 的页签内容）；改写 `src/client/index.ts`（无新增座位，只接线能力）、`i18n.ts`；扩展 `tests/formats.test.mjs`（若改了 store 的导入路径）

**步骤：**
- [ ] 步骤 1：**导出**：按钮 → `pickExportDirectory()`（`uiWorkspace.pickDirectory`，D-P6-4 的持有方式）→ null（用户取消）时静默回到面板（**不是**错误）→ 拿到绝对路径 → `api.exportBackup(dir)` → 显示服务端返回的 `path` 与条数；失败时行内红色原文 + `console.warn`
- [ ] 步骤 2：**导入**：渲染 `<input type="file" accept=".json,application/json" hidden>`（**React 自有 DOM，不是注入**）→ `FileReader/text()` 读文本 → `JSON.parse` 失败给出可读错误 → `api.importBackup(backup, false)` 取预览 → 展示 `{added, overwritten, total}` + 「同 id 将被覆盖，不可撤销」的显式文案（TBD-P6-4 裁定口径）→ 用户确认 → `api.importBackup(backup, true)` → 成功 `notifyDataChanged()` + 刷新列表
- [ ] 步骤 3：**不新增 `/fs/*` 路由、不自建目录浏览**（D5 明确禁止）；`DirectoryPickerModal` **不移植**（除非 TBD-P6-7 选 (c)）
- [ ] 步骤 4：边界：`version !== 1` 的备份 → 展示宿主返回的原文错误；`prompts` 非数组 → 同上；超大文件（> 5MB）给「文件过大」的可读拒绝
- [ ] 步骤 5：测试：`tests/formats.test.mjs` 扩展——`JSON.parse` 失败的分类、预览文案的键存在性、`buildExportPayload` 类的纯函数（若有）；往返等值沿用 P2 既有断言
- [ ] 步骤 6：**变异验证**：临时把 `confirm` 参数漏传 → `api.test.mjs` 的「confirm 未传 = 预览」用例必须红；复原
- [ ] 步骤 7：全绿 + 提交 `feat(client): JSON import and export through official directory picker`

**验收映射：** 验收 10（导出 JSON 到自选目录；改库后导入该 JSON 恢复）。

---

### 任务 6：P5 延期项批量小修（同构小改，一次分发）

**依赖：** 任务 1–5（部分修改落在同一批文件上，故必须最后做）。**来源：** §9 的分拣表。

**文件：** `src/client/components/AIPolishButton.tsx`、`src/client/utils/ai-flow.ts`、`src/client/utils/insert.ts`（如需）、`tests/i18n.test.mjs`、`tests/ai-flow.test.mjs`、`docs/superpowers/plans/2026-09-24-p5-m5-acceptance.md`（仅加元信息行）

- [ ] 步骤 1：`run()` 改**整表重置**（清 `saved/refined/evicted/status/error`）——延期 #5；这是新增跨态控件前的硬前置
- [ ] 步骤 2：回滚失败（400/404）文案改走 `error.*` 系（新增 `error.rollbackNoSource` / 复用 `error.noPrompt`）——延期 #6
- [ ] 步骤 3：`polishPrompt` 的 `keepVariables` 改**必填**（编译期拦住漏传的调用方）——延期 #9
- [ ] 步骤 4：`libraryCreateInput` 取首个非空行时 `trim()`——延期 #2；补单测（`"\n  标题"` → `"标题"`）
- [ ] 步骤 5：`tests/i18n.test.mjs` 键名正则改为支持多级（`a.b.c`）但拒绝空段——延期 #8
- [ ] 步骤 6：衔接入口的 busy 态与失败可见补齐——延期 #3（措辞按任务 2 的实现对齐）
- [ ] 步骤 7：刷新 P5 验收记录的过期引文（`ai.polishing` 含时长那句）——延期 #12；**只加元信息行**，不改既有结论
- [ ] 步骤 8：测试 + 变异验证：临时把 `trim()` 去掉 → 新用例必须红；临时把整表重置改回部分重置 → 若有断言覆盖（无则记为「由任务 7 活体验收承担」）；复原
- [ ] 步骤 9：全绿 + 提交 `refactor(client): close P5 carry-overs (full reset, error copy, required keepVariables)`

**验收映射：** 回归保护（验收 6 的文案与语义不得劣化）。

---

### 任务 7：活 GUI 验收（M6）+ 记录文件

> 通道沿用 P1–P5 已验证的做法：`npm run build` → `dev_reload_package dsh-prompt-enhancer`（**不碰 profile、不重启 `dsh web`**）→ Playwright 对 `http://127.0.0.1:3080` 逐项验收。
> **不得发送任何聊天消息**（发送需用户授权）；造数据一律用**临时**提示词并在收尾复原（快照 → 造 → 删 → 清回收站 → 恢复 meta/settings → 复查）。

- [ ] 步骤 1：构建 + 热重载；记录 before/after fiber 状态与下发的 `client.js?rev=…`，并与 `lib/client.js` 逐字节比对（P4/P5 口径：允许仅差宿主重写的 sourceMappingURL 尾行）
- [ ] 步骤 2：逐项验收（**每条必须给数值或原文**）

| 验收项 | 判定方式 |
| ------ | -------- |
| 关闭态零遮挡（§1.1 的硬约束） | 弹窗关闭时：`[data-shell-overlay]` 下属于本插件的根元素不存在或 `getBoundingClientRect()` 全 0；且真实点击中心列任意位置**不**被拦截 |
| 管理面板可开/可关 | 点输入框旁「管理」→ `role="dialog"` 出现且 `aria-label` = i18n 值；点 backdrop → 消失（`dialogCount` 0） |
| 验收 8：草稿存为提示词 | 设草稿 S → 触发入口 C → 面板预填正文 == S → 保存 → `GET /prompts` 新记录 title/body 与预期逐字相等 |
| 验收 7：选中聊天文字 → 存为 | 用页面内 `window.getSelection()` 选中一段**真实存在**的聊天文本（或验收允许时用 sidebar 文本并如实注明选区来源）→ 断言浮出按钮出现且文案正确 → 点击 → 面板预填 == 选中文本 → 保存 → `GET /prompts` 可见 |
| 零键盘监听复检 | `grep -rnE "keydown\|keyup\|keypress" src/client/` → 0 命中；`grep -rnE "querySelector\|MutationObserver\|appendChild" src/client/` → 0 命中（新的 `getSelection`/`closest` 只读用法逐条列出并说明） |
| 验收 9：标签 | 新建标签 → 重命名（断言提示词的 tags 同步）→ 删除**在用**标签 → 必须拒绝并显示用量；删除未用标签 → 成功 |
| 验收 9：回收站 | 软删除一条 → 出现在 `GET /trash` → 恢复 → 回到 `GET /prompts`；再删 → 永久删除；再删两条 → 清空 → `GET /trash` 为 `[]` |
| §4.4 编辑详情页并排对比与切换 | 造一条带 `sourceBody` 的临时提示词 → 详情页同时显示「原文」「优化稿」且**二者不同** → 点切换 → `GET /prompts` 的 `body`/`sourceBody` **互换**（数值证据）；再点 → 换回；`sourceBody` 为空时**无**切换入口且有文案 |
| 淘汰二次确认 | 临时把 `maxPromptCount` 调到当前条数 → 新建 → 断言**先出现确认框**且候选列表非空 → 确认后 `POST /prompts` 的 `evicted` 与确认框所列**逐 id 相等**；收尾恢复 settings。**安全前置**：动作前核对「不存在既有的 `aiRefined=false && lastUsedAt=0` 项」，否则立刻停手并恢复（P5 验收第 8 行的做法） |
| 孤儿标签 | 淘汰发生后再查 `GET /tags`：被淘汰条目带的标签**不**残留 `count=0`（P5 O-4 的复现路径） |
| 验收 10：导出 | ① **全自动部分**：页面内用显式绝对路径直接 `POST /export/save`（`dir` 用会话工作区下的临时目录），断言返回 `path` 存在且内容含 `version/prompts/tags`；② **选择器部分**：点「导出」→ **由人点一次系统对话框**（macOS native，§1.5）→ 记录实际返回目录；若人不便，写 `NOT RUN — 需人工点系统对话框 — 归属 P6` 并保留 ① 的证据 |
| 验收 10：导入 | 造一条临时提示词 → 导出 → 删除它 → `browser_file_upload` 提供该 JSON 给 `input[type=file]` → 断言预览计数 → 确认 → `GET /prompts` 恢复该条（字段逐项比对） |
| 回归：验收 2/3/4/6 | P5 的既有路径（插入/覆盖/插入并发送 / `#` 覆盖层 / 变量填窗 / 原文↔优化稿）**不得劣化**；`#` 覆盖层与新增浮出按钮不得互相遮挡（几何 + 互斥双向证据，P5 做法） |
| 零 console error | `browser_console_messages(level=error)` → 0；刻意触发的 warning 逐条说明 |
| 环境复原 | 收尾：`GET /prompts` / `GET /trash` / `GET /tags` / `GET /settings` / `GET /meta/:key` 与验收前快照**逐项**比对；不可逆变化 = 0 |

- [ ] 步骤 3：写入 `docs/superpowers/plans/2026-09-24-p6-m6-acceptance.md`（格式照 `2026-09-24-p5-m5-acceptance.md`：逐行对齐、每条给原文/数值、不能跑的写 `NOT RUN — <原因> — 归属 <里程碑>`、末尾「临时数据与副作用」+「假设清单」）
- [ ] 步骤 4：提交 `test(client): record M6 live GUI acceptance`

---

## 6. 完成标准

1. `shell.overlay` 注册生效（`id: prompt-enhancer`、`order: 100`），管理 / 标签 / 回收站 / 导入导出四块 UI 均由它承载；**关闭态零遮挡**（活体证明）
2. 沉淀三入口全部可用：管理面板新建/编辑、选中聊天文字存为提示词、当前草稿存为提示词（验收 7 / 8）
3. 标签重命名/删除（在用拒绝并给用量）、回收站恢复/永久删除/清空（验收 9）
4. 导出可写盘为 JSON、导入有预览与确认且能恢复（验收 10）
5. 编辑详情页按 §4.4 提供「原文 / 优化稿」并排对比 + 双向切换，复用 `rollbackPrompt` + `canToggle`；P5 的临时入口已撤除
6. 淘汰前有二次确认，且确认列表与实际 `evicted` 逐 id 相等；淘汰后无 `count=0` 孤儿标签
7. `typecheck` / `test` / `build` / `smoke` 四项全绿；smoke 的座位账本与 `inject` 断言与现状一致，且至少 2 次变异验证通过
8. 零 DOM 注入、零键盘监听、零新增依赖、systemPrompt section 数仍为 **0**；`inject` 的扩张只发生在条件注入（`uiWorkspace`）
9. `lib/` 与源码同批提交；重跑 `npm run build` 后 `git status` 为空
10. P5 的 12 条延期项逐条有归宿（§9），其中 6 条在 P6 关闭
11. 路线图与规格按 TBD-P6-8 的裁定修正完毕

---

## 7. 风险

| # | 风险 | 应对 |
| -- | ---- | ---- |
| R-P6-1 | **`shell.overlay` 的 click-through 反噬**：包装器 `display: contents` 让我方根元素继承 `pointer-events:auto`，关闭态铺满会挡死整个应用（§1.1） | 关闭态强制 `return null`；任务 7 有「关闭态零遮挡」专项验收（真实点击中心列） |
| R-P6-2 | 管理面板信息量远大于上游单弹窗（上游 2075 行）→ 重写丢成熟 UX | 先按验收 7/8/9/10 逐项对照实现；`common/*` 按裁定移植；**不追求功能对齐上游的全部子面板**（规格 §8 已声明净减） |
| R-P6-3 | 选中捕获的浮出按钮与 `#` 候选浮层 / AI 结果面板几何打架 | 浮出按钮用 `position: fixed` 且只在选区存在时渲染；任务 7 加「互不遮挡」验收（几何 + 互斥双证据） |
| R-P6-4 | 客户端预演的淘汰候选与 `store.enforceMaxCount` 漂移 | 预演函数与 store 的排序键**同源注释** + `tests/eviction.test.mjs` 双跑对照；最终提示仍以 `evicted` 返回值为准 |
| R-P6-5 | 导入的备份可能超出上限（`POST /import` 不淘汰） | 按 TBD-P6-4 的裁定：默认**不**自动淘汰，但在结果里显式提示条数；若要淘汰，必须在 UI 上二次确认（不得静默物理删除） |
| R-P6-6 | 原生目录选择器需要人点系统对话框 → 验收 10 不能全自动 | 拆成「全自动的 `/export/save` 显式路径验证」+「人工点选一次并记录路径」；后者不便时写 NOT RUN 并保留前者证据（§1.5） |
| R-P6-7 | 座位扩张导致 smoke 的深等值断言红 | 每个改座位的任务**同批**更新 `scripts/smoke.mjs`，并把「期望账本」写在任务简报里 |
| R-P6-8 | `uiWorkspace` 在无该客户端的部署里缺失 | D-P6-4：条件注入 + 能力为 null 时导出按钮禁用并给可读原因；其余功能不受影响 |
| R-P6-9 | `<input type="file">` 取文件在 Playwright 上的可达性 | 用 `browser_file_upload`（宿主浏览器驱动支持）；若不可达，退化为页面内直接构造 `File` + `DataTransfer` 并如实注明 |
| R-P6-10 | 任务 1 的 api 面与 host 路由漂移（P3 已有 26 条路由，逐个对照易漏） | `tests/api.test.mjs` 逐方法断言「方法 + 路径」；并新增一条「路由表覆盖」用例：断言 `src/host/routes.ts` 里出现的每个 `seg`/`method` 组合都有对应客户端调用或显式豁免清单 |

---

## 8. 交接与修正清单

### 8.1 授权后要改的文档（按 TBD-P6-8 裁定）

**路线图 `2026-09-24-dsh-prompt-enhancer-roadmap.md`：**

- 第 42 行（现文：「`shell.overlay` 弹窗宿主 | 在 **P7** 引入；P6 的管理面板在此之前先用组件内联渲染，P7 迁移到 root 浮层」）改为：

  ```
  | **`shell.overlay` 弹窗宿主** | **P6** 引入（规格 §7.1/§13.4 将 `shell.overlay`（root/list/id `prompt-enhancer`/order 100）定为承载管理、导出、导入弹窗的宿主，且这是去掉「必须先有会话才能开面板」隐性约束的前提）；P7 复用同一宿主添加技能导出弹窗 |
  ```

- 第 32 行（P7 交付物）若能按 TBD-P6-2 选 (a)：把「左侧入口 + 根级浮层」从 P7 行移除。
- 第 44 行（acceptance 序号）相应改为 `P6(7,8,9,10[,18]) / P7(15,16,17[,18])`。

**规格 `…design.md` 追加 §13.9（4 条）：**

1. **`inject` 服务名订正**：§7.1 的 `workspaces` → **`uiWorkspace`**（依据：`workspace-controller/src/client/service.ts:88` 的 `IWorkspaces` 无目录能力；`ui-workspace/src/client/navigation.ts:55/106/179` 才有 `pickDirectory`）；`package.json.dsh.client.inject` 相应加 `@deepseek-ai/dsh-client-ui-workspace`。
2. **P6/P7 分期订正**：`shell.overlay` 在 **P6** 引入（TBD-P6-1）；`sidebar.footer.action` 与验收 18 的归属按 TBD-P6-2 固化。
3. **导入与上限的关系**：`POST /import` 的效果按 TBD-P6-4 固化（默认不自动淘汰 + 显式提示）。
4. **淘汰二次确认与选区捕获口径**：按 TBD-P6-5 / TBD-P6-3 固化；并给「零 DOM 注入」补一条正例边界（允许**只读** `window.getSelection()` 与 `Node.closest('[data-conversation-scroll]')`/`[data-composer-seat]`；禁止任何 DOM 写入与键盘监听）。

### 8.2 交给 P7

1. **技能导出 UI**：`SkillExportModal` + `POST /ai/skill-descriptor` + `POST /skills/export` + 过期徽标 + 「一键重新导出」（规格 §7.6、验收 15/16/17）。
2. **宿主复用**：直接复用 P6 的 `PromptSurfaceHost` 与 `ui-state.ts`（加一个 `"skill"` 面板值即可），**不要**新建第二个 `shell.overlay` 条目。
3. **列表徽标的位置**：管理面板列表行与详情页由 P6 建成，P7 在这两处插入徽标（P6 预留渲染缝隙：行尾 action 区 + 详情页头部）。
4. 若 TBD-P6-2 选 (b)：P7 还要补 `SidebarPromptEntry` 与验收 18。

### 8.3 交给 P8

1. **设置页即时生效**：`showComposerButton` / `showAIPolishButton` / `hashTriggerEnabled` / `selectionAddEnabled` / `showSidebarButton` 同批决定「即时生效」口径（P4/P5/P6 都是「mount 时读一次」）。
2. **两个 `*IconOnly` 键**语义统一（P5 交接第 4 条）。
3. **上下文推荐**（验收 11）与 i18n 键集收口、README（验收 12/14/19）。
4. P6 新增的 i18n 键（约 60–90 个）纳入 P8 的键集收口与校验。

---

## 9. P5 延期项分拣表（12 条逐条）

| # | P5 延期项 | 归宿 | 处理 |
| - | --------- | ---- | ---- |
| 1 | UI 组件无单测 → 证据靠活 GUI；`ai.saveFail` / `ai.sameAsOriginal` 两分支未跑 | **P6** | 任务 7 用页面内 `fetch` 包装给 `POST /prompts` 注入 503，补跑 `ai.saveFail`（最小成本补法） |
| 2 | `libraryCreateInput` 首行不 trim | **P6** | 任务 6 步骤 4 |
| 3 | 切换按钮无进行中状态 | **P6** | 任务 6 步骤 6（详情页与 AI 面板一致） |
| 4 | `copy()` 失败只有 `console.warn` | **保留** | P4 对非阻塞副作用的先例；不新增面内文案（记入本表即闭环） |
| 5 | `run()` 部分重置 | **P6** | 任务 6 步骤 1（新增跨态控件前的硬前置） |
| 6 | 回滚失败（400/404）走 `ai.fail` | **P6** | 任务 6 步骤 2 |
| 7 | 探测超时与调用超时共用 `ai.timeout` | **P8** | 要给探测路径单立错误分类（api 打标记 → ai-flow 分类 → 新键）；与设置页同批 |
| 8 | `tests/i18n.test.mjs` 键名正则只接受两级键 | **P6** | 任务 6 步骤 5（P6 会新增三级键） |
| 9 | `polishPrompt` 的 `keepVariables` 默认 `true` | **P6** | 任务 6 步骤 3（改必填） |
| 10 | `enforceMaxCount` 不同步 tags → 孤儿标签 | **P6** | 任务 4 步骤 3（与淘汰二次确认同批，符合 P5 移交口径） |
| 11 | AI 结果面板几何上覆盖 composer | **P8** | 属浮层落点与设置项（面板尺寸）范畴；P6 只在新增浮出按钮时避免加剧（R-P6-3） |
| 12 | P5 验收记录 `:72` 的 zh 引文过期 | **P6** | 任务 6 步骤 7（只加元信息行） |

---

## 10. 附录：SDD 执行准备（控制者，不分发给实现者）

```bash
PLAN=docs/superpowers/plans/2026-09-24-p6-capture-and-manage.md
SKILL="$DSH_HOME/profiles/web/node_modules/@wenaixi/dsh-superpower/skills/superpower-subagent-driven-development/scripts"

# 1) 工作区（自带自忽略 .gitignore，不进 git status，故收尾前必须把有效内容落回仓库）
WS=$(bash "$SKILL/sdd-workspace" "$PLAN")     # → <repo>/.superpowers/sdd/2026-09-24-p6-capture-and-manage

# 2) 台账：首行固定 "# SDD ledger — plan: docs/superpowers/plans/2026-09-24-p6-capture-and-manage.md"

# 3) 任务简报：task-brief 只认英文 'Task N' → 中文标题必须自取（围栏感知逻辑照搬）
N=2
awk -v n="$N" '/^```/{f=!f} !f && /^### 任务 [0-9]+/ {intask = ($0 ~ ("^### 任务 " n "([：:]|$)"))} intask{print}' \
  "$PLAN" > "$WS/task-$N-brief.md"
wc -l "$WS/task-$N-brief.md"    # 必须非空

# 4) 评审包：脚本无执行位 → bash 调用；review-package 内部会调用 sdd-workspace（失败）
#    → 必须显式给第 4 参 OUTFILE
BASE=$(git rev-parse HEAD)      # 分发实现者前记录
# …实现者提交后…
HEAD=$(git rev-parse HEAD)
bash "$SKILL/review-package" "$PLAN" "$BASE" "$HEAD" "$WS/review-$BASE..$HEAD.diff"
```

> **注意**：本计划的任务标题为 `### 任务 N：…`（三级），上表的 awk 已按此改写；若执行时标题层级变化，必须同步改 awk（P5 的坑：`task-brief` 只匹配英文 `Task N`）。
> **收尾**：保存价值的台账内容（本计划的执行记录、裁决、遗留项）落进本文件末尾的「P6 执行记录」或验收记录，再删工作区。

---

## P6 执行记录

**状态：** 未开工（等待 §3 的用户裁定）。
