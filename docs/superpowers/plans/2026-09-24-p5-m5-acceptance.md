# P5 / M5 活 GUI 验收记录（2026-09-24）

> **本文件与计划 `docs/superpowers/plans/2026-09-24-p5-ai-polish-and-rollback.md`「任务 5」简报的验收表逐行对齐**
> （同顺序、同项数：**表 A = 简报验收表 12 行**，见 `.superpowers/sdd/2026-09-24-p5-ai-polish-and-rollback/task-5-brief.md:9-22`）。
> **表 B = 任务 5 覆盖清单第 4-15 项**（任务 1-4 评审累积的硬性项），逐项标注来源，并与表 A 交叉引用，不重复堆砌同一份原始证据。
> 每条给「我做了什么 / 观察到什么」的**原文或数值**；确实不能跑的项写在对应行内（`NOT RUN — <原因> — 归属 <里程碑>`）并在「未完整验证」小节汇总，不静默缺席。

## 环境与口径

- 被验收提交：**HEAD `474239725dfcd883aa33e1624b488beecf92fee2`**（= `4742397`），工作区开始与结束均 `git status --porcelain` 为空。
- **元信息（后续补记）**：本记录对应提交 `4742397`；其后 `d8ca9b0` / `ee4056a` / 本次修复仅改文案、文档与 smoke 断言，未改变任何已记录断言的结论。
- **元信息（P6 任务 6 / A6 补记，2026-09-24）**：「未完整验证」表 `:72` 行引用的一处 zh 源引文已过期——那里写的 `ai.polishing="正在调用 AI…（最长约 2 分钟）"` 是收尾波**之前**的值；P5 收尾波按裁决 16 把时长信息从 `ai.polishing` 移到 `ai.tip`，现值为 `ai.polishing="正在调用 AI…"`（`src/client/utils/i18n.ts:27`）、`ai.tip="用 AI 优化当前输入框内容（可能需要一两分钟）"`（`:24`）。**该行的结论与归属不变**（zh 文案未在活 GUI 渲染验证 = NOT RUN，归属「可选补充，不阻塞 P5」），本文件不改动任何结论行。
- 宿主：`http://127.0.0.1:3080`（DSH Local Build 0.1.5-rc.2-c291；viewport 1280×720；`document.documentElement.lang === "en"`）。
- 驱动方式：Playwright（`browser_navigate` / `browser_find` / `browser_click` / `browser_type` / `browser_press_key` / `browser_evaluate` / `browser_console_messages` / `browser_network_requests`）+ 只读或受控 `curl` HTTP。
- **证据分层（明确区分，不混用）**：
  - **实测（本轮）**：下表所有 PASS 条目的数值/原文都来自本轮活页面。
  - **页面内采样器**：忙态（busy/disabled/title/面板文案）与耗时由页面内 `setInterval(40ms)` 采样 + `performance.now()` 记录——因为 MCP `browser_click` 会等页面网络稳定后才返回（一次 polish 点击实测 4.1s 才返回），从工具边界读状态会整段错过调用中窗口。
  - **页面内 `fetch` 包装**：仅本页有效、刷新即复原，用于注入 503 / 空 provider / 挂起（`window.__rules`，可逐条 `on=false` 撤销）。
  - **单测覆盖**：只在表 A 第 9 行分列写明，不顶替活体证据。
- 本轮**未**发送任何聊天消息（会话仍为 `Turn 1`；全文只有读草稿与「应用到输入框」写草稿，从未触发 `inputActions.submit`、从未按 Enter）。
- 本轮**未**触碰 `$DSH_HOME/profiles/**`、未重启 `dsh web`、未跑 `link-dsh-deps`、未跑 `npm install`、未改任何产品代码。

## 步骤 1：构建 + 热重载（生产产物）

| 动作 | 命令 | 观察到什么 |
| --- | --- | --- |
| 生产构建 | `npm run build` | exit 0；`lib/index.js 62.9kb` / `lib/client.js 54.8kb`；`build: done`。**构建可复现**：构建前后 `shasum -a 256` 完全相同 —— `lib/client.js 7b0ad55d2e7536c3ea881e952f2f984a1ba38fb5b2bd7b6b15e98d63b93c91c8`、`lib/index.js 77a6dca68631c89fb56230882b3e07d4d9500dbac6193f1980562111f7b81ead`；`git status --porcelain` 仍为空（提交物 == 验收物）。未使用 `build:dev`。 |
| 热重载 | `dev_reload_package dsh-prompt-enhancer` | `OK: dsh-prompt-enhancer 热重载完成（清缓存 1 模块，重建 1 fiber）` / `- client ✓ (lib/client.js)` / **before: [active] → after: [active]**。 |
| 活体产物一致性 | 取页面 `performance.getEntriesByType('resource')` 里宿主实际下发的模块 URL（`…,dsh-prompt-enhancer/client.js&rev=4e2b9f2d9740`），`curl` 全量落盘后与 `lib/client.js` 比对 | 下发 bundle 共 597257 字节、含 8 个 `window.__ModuleLoader__.load`（多模块拼接）；**取最后一个模块段**（56480B）与 `lib/client.js`（56073B）比对：**前 56037 / 56073 字节逐字节相同**，首个差异位 = 56037，差异仅剩宿主把尾部 `//# sourceMappingURL=client.js.map` 重写为 `;\n//# sourceMappingURL=/plugins/??…map,…`（P4 同口径：允许仅差宿主重写的 sourceMappingURL 尾行）。 |

## 表 A：与简报验收表逐行对齐（12 行）

| # | 验收项 | 结果 | 证据（我做了什么 / 观察到什么） |
| - | ------ | ---- | -------------------------------- |
| 1 | 输入框旁同时出现词库按钮与 AI 优化按钮（验收 2 的按钮部分） | **PASS** | 页面内定位：`button[aria-label="Open the prompt library"]`（`text="Library"`、`title="Open the prompt library"`、`aria-expanded="false"`，rect `[632,631,58,24]`）与 `button[aria-label="AI polish"]`（`title="Polish the composer draft with AI"` = en `ai.tip`、`aria-busy="false"`、`disabled=false`、rect `[702,631,32,24]`）—— 两者 **y 与高度完全相同（631 / 24）**、同一 composer 工具行（共享祖先行 DIV；各自包在插件自己的 `<span>` 里，故 `parentElement` 不同），**DOM 顺序 词库 → AI**（`compareDocumentPosition` = FOLLOWING），即 order 10 → 11。可访问性快照同容器内两条按钮：`'button "Open the prompt library"' … 'button "AI polish"'`。en `ai.button` 即快照里的 `"AI polish"`。 |
| 2 | 空草稿禁用 | **PASS** | 清空 composer（真实点击 composer → `Meta+a` → `Backspace`，`browser_press_key`）→ `composer.innerText === "\n"`（仅一个换行、无文本）→ 读按钮：`disabled=true`、`title="Composer is empty — write something first"`（= en `ai.empty`，源码 `src/client/utils/i18n.ts:78`）、`aria-busy="false"`。 |
| 3 | 验收 5 润色全链 | **PASS** | **设草稿** `把这段话改得更正式：今天天气不错，我们下午三点开会。` → 点击 AI 按钮（真实 `browser_click`）。**调用中**（第 2 轮采样，冷启动第 1 轮同形）：49 个采样里 48 个 `disabled=true`/`aria-busy="true"`、`title="Calling AI… (up to ~2 minutes)"`（= en `ai.polishing`）、`role="status"` 文案同值、面板 `aria-label` 此时为 `"AI polish"`；首样本 dt=27ms、末忙样本 dt=1906ms，dt=1947ms 起转为 `disabled=false`/`aria-busy="false"`。**结果面板**：`aria-label="AI polish result"`（= en `ai.result`），含两粒 pill `Polished`（`aria-pressed="true"`）/`Original`（`aria-pressed="false"`）与一个 textarea：`aria-label="Polished"`、**readOnly=false**、值 = `请将以下内容改写为更正式的表述，保持原意与关键信息不变：今天天气不错，我们下午三点开会。`（44 字）；点 `Original` → textarea `aria-label="Original"`、**readOnly=true**、值 = `把这段话改得更正式：今天天气不错，我们下午三点开会。`（= 草稿快照）；再点 `Polished` → 回到 44 字优化稿。**两版非空且不同**。**点「应用到输入框」** → 读回 `composer.innerText` **逐字等于**优化稿、面板消失（`[role="dialog"]` 为 null）。**耗时（`performance.now()`，点击事件内挂 capture 监听取 t0）**：冷启动第 1 轮（含 `GET /ai/providers` 探测）面板就绪 ≤ 4672ms（工具返回时已是 4164ms）；热态第 2 轮**精确 1948ms**；后续轮次 2483 / 2886 / 2651 / 1237ms。前端 120s 上限另见第 9 行实测 120801ms。 |
| 4 | 面板可编辑 | **PASS** | 新草稿 `请把这句话写得更委婉一些：你的方案不可行。` → 润色（2483ms）得 46 字优化稿 → **真实点击** textarea（`browser_click` 到 `textbox "Polished"`）+ `browser_press_key` `End` + `Z`（单字符真实键盘输入）→ 读回 `value` = 优化稿 + `Z`（`len 47`、尾 4 字 `可行。Z`）→ 点「Apply to composer」→ `composer.innerText` **逐字等于改后文本**（含尾部 `Z`）。 |
| 5 | 复制 | **PASS（剪贴板未读到，见右）** | 点面板「Copy」→ 页面内 30ms 轮询记录按钮文案轨迹 `["Copy","Copied"]`、`copiedFlagSeen=true`、读取瞬间 `currentLabel="Copied"`（= en `ai.copied`，2s 后自动回 `Copy`）。**剪贴板读取按权限被拒**：`navigator.clipboard.readText()` → `NotAllowedError: Failed to execute 'readText' on 'Clipboard': Read permission denied.` —— 故本行以「提示出现」为准，**未**读回剪贴板内容（如实注明）。 |
| 6 | 验收 6 完善 → 存入 → 双向切换 | **PASS（两个方向都有 HTTP 数值）** | 草稿快照（= 润色那轮的 `original`）`把这句话改成英文：你好，世界。` → 点「One-click refine」（真实点击）→ **3837ms** 后出现 `aria-label="Refined draft"` 面板：`Title 中译英提示词` / `Tags 翻译` / `Summary 用于把指定中文内容翻译成英文。使用时将 {{待翻译内容}} 替换为需要翻译的文本即可。` / 可编辑正文 `请将以下中文内容翻译成英文：{{待翻译内容}}`。点「Save to library」→ **3076ms**（期间故意给 `PUT /prompts/:id` 注入 3s 延迟以便采样，见第 11 行）后出现 `aria-label="Saved to library"` 面板：文案 `Saved to library` + 按钮 `Toggle original / refined` + `Showing: refined` + 正文预览。**HTTP 断言**（`GET /prompts`）：新纪录 `f6d300d8-9c5f-49ce-a4fe-bbe726eaede6`，`sourceBody === "把这句话改成英文：你好，世界。"`（= 原草稿）、`body === "请将以下中文内容翻译成英文：{{待翻译内容}}"`（= 完善稿）、`aiRefined === true`、`aiRefinedAt === 1790268090335 > 0`。**双向切换**：点「Toggle original / refined」→ HTTP 前值 `{body: 请将…翻译成英文：{{待翻译内容}}, sourceBody: 把这句话改成英文：你好，世界。}` → 后值 `{body: 把这句话改成英文：你好，世界。, sourceBody: 请将…翻译成英文：{{待翻译内容}}}`（**互换**，面板变 `Showing: original`）；**再点一次** → 后值又换回 `{body: 请将…翻译成英文：{{待翻译内容}}, sourceBody: 把这句话改成英文：你好，世界。}`（面板回 `Showing: refined`）。 |
| 7 | 写回失败面 | **PASS（不需要 NOT RUN）** | 页面内包装 `window.fetch`：命中 `PUT /api/prompt-enhancer/prompts/*` 时返回 503 信封 `{ok:false,error:"mock 503 from page-side fetch interceptor"}`（仅本页、可撤销）。草稿 `帮我写一句鼓励朋友的话。` → 润色（6458ms，含重挂载后的冷探测）→ 一键完善 → 存库：**面板原文** = `The original was saved, but writing back the refined draft failed`（= en `ai.writeBackFail`）+ 原因行 `mock 503 from page-side fetch interceptor` + 按钮 `Retry write-back`（= en `ai.retryWriteBack`）/`Close`；**面板内不含 `Saved to library`**（不得显示成已存好，成立）。同时 `GET /prompts` 证明库里是**半成品而非损坏数据**：新建行 `84e8810b-f27a-4d7d-b74a-8fb8fe2480d3`，`title="写一句鼓励朋友的话"`、`body="帮我写一句鼓励朋友的话。"`、**无 `sourceBody` 字段**、`aiRefined=false`、`aiRefinedAt=0`。**撤掉拦截点**（`rule.on=false`）→ 点「Retry write-back」→ 面板转为 `Saved to library`（`Text: "Saved to library…Showing: refined"`），`GET /prompts` 该行变为 `body` = 完善稿、`sourceBody="帮我写一句鼓励朋友的话。"`、`aiRefined=true`、`aiRefinedAt=1790268150828`。 |
| 8 | 验收 13 无 LLM 提示 | **PASS** | ① 包装 `GET /ai/providers` → `{ok:true,data:[]}`（HTTP 200 信封）→ 点 AI 按钮 → 面板原文 `AI unavailable: no usable model configured`（= en `ai.unavailable`）+ `Close`；页面内请求日志仅 `["GET /api/prompt-enhancer/ai/providers"]`，`browser_network_requests` 中 `POST /ai/polish` 计数 **0**（未误发请求）。② 换新挂载、包装 `POST /ai/polish` → 503 信封 → 点 AI 按钮 → 面板原文 `AI unavailable: no usable model configured`（`aiErrorKey(503) = "ai.unavailable"`，`src/client/utils/ai-flow.ts:61`）；页面内请求日志 `["GET /api/prompt-enhancer/ai/providers","POST /api/prompt-enhancer/ai/polish"]` 证明确实走到了 polish 分支再被 503 挡下。**其余功能不受影响**：同挂载点词库按钮 → `aria-expanded="true"`、出现 `[role="dialog"][aria-label="Saved prompts"]`、`[role="listitem"]` 3 行、每行 `Insert / Overwrite / Insert & send` 齐全。 |
| 9 | 超时 | **PASS（实测 + 单测覆盖分列）** | **实测 A（探测 15s，`AI_PROBE_TIMEOUT_MS`）**：页面内把 `GET /ai/providers` 变成**挂起但忠实响应 AbortSignal**（`init.signal` 触发 abort 时以 `signal.reason` reject）→ 点击后 8.2s 读：`disabled=true`/`aria-busy="true"`/`title="Calling AI… (up to ~2 minutes)"`/面板 `Calling AI… (up to ~2 minutes)`；20.7s 再读：`disabled=false`/`aria-busy="false"`/`title` 回 `ai.tip`，页面内看门狗测得**恢复于 15702ms**，**全程未刷新页面**。**实测 B（前端 120s，`AI_TIMEOUT_MS`）**：同法挂起 `POST /ai/polish` → 6.7s 时仍 `disabled=true`/状态行可见 → 恢复于 **120801ms**，按钮回可点，面板原文 `AI call timed out (>120s), please retry later`（= en `ai.timeout`）+ `Close`。→ 「调用中按钮禁用且面板有状态行」为**实测**；`TimeoutError → ai.timeout` 的映射本轮也顺带**实测**到了（见「缺陷与观察 D-1」的文案错配）。**单测覆盖（不顶替实测）**：`TimeoutError → ai.timeout` 的分类另有任务 1 单测覆盖（`aiErrorKey`）；本记录不对该单测结果作独立断言。 |
| 10 | 零 console error | **PASS（含测试自身造成的例外，逐条列出）** | 干净整页重挂载后 `browser_console_messages(level=error)` → `Total messages: 1 (Errors: 0, Warnings: 0)`、level=error 返回 0 条；唯一一条是 `[INFO] [genui] client active; fence-channel=dom`。（生产构建 `__DEV__=false`，故本轮不再出现 `[prompt-enhancer] client loaded` 日志。）**刻意触发的例外（全部由本验收自己制造，非缺陷）**：`[ERROR] Failed to load resource: … 404 … /api/prompt-enhancer/prompts/8900d31c-fdbb-48c0-af9a-760acc8d2a43`（第 8 项淘汰测试里对被淘汰记录写回的必然 404）；`[WARNING] [prompt-enhancer] 优化稿写回失败（原文已入库） ApiError: mock 503 …`、`[WARNING] … 优化稿写回失败（原文已入库） ApiError: 提示词不存在`、`[WARNING] … AI 可用性探测失败 TimeoutError: signal timed out`、`[WARNING] … AI 优化失败 ApiError: mock 503 …`、`[WARNING] … AI 优化失败 TimeoutError: signal timed out` —— 这些都是「错误必须可见」的设计行为（`console.warn` + 面内文案同时可见），且分别来自本记录第 7/8/9/表 B-8 的注入点。 |
| 11 | 零 DOM 注入复检 | **PASS** | `grep -rnE "querySelector\|MutationObserver\|appendChild\|keydown" src/client/` → **1 处命中，且是注释**（`src/client/components/HashSuggestOverlay.tsx:9` 说明「没有任何 keydown/keyup 处理」）。扩查 `document\.\|querySelector\|MutationObserver\|appendChild\|keydown\|addEventListener` → 7 处，全部是：`PromptLibraryButton.tsx:112/114` 与 `AIPolishButton.tsx:178/180` 的 `document.addEventListener/removeEventListener("pointerdown", …, true)`（P4 起的纯监听、捕获阶段、不改宿主 DOM）与 `TemplateVariablesDialog.tsx:38/39` 的 `document.documentElement.lang` 只读，加上述 1 条注释。**无查询选择器式 DOM 注入、无 MutationObserver、无键盘监听**。 |
| 12 | 两个面板互不覆盖 | **PASS（几何 + 互斥双向证据）** | **几何**（viewport 1280×720）：词库面板 `Saved prompts` rect `[632,287,338,338]`、`inViewport=true`，4 个裁剪祖先（`sCv-yq_scrollBody` overflow auto / `sCv-yq_root` hidden / `XZJ-uW_centerCol` hidden / `XZJ-uW_frame` hidden）**全部 panelInside=true**；AI 面板 `AI polish result` rect `[702,404,398,221]`、`inViewport=true`，同一批 4 个裁剪祖先**全部 panelInside=true**。**互斥**：词库面板打开时 `allDialogs=["Saved prompts"]`、`dialogCount=1`；此时点击 AI 按钮（真实点击）→ AI 面板出现且 `allDialogs=["AI polish result"]`、`dialogCount=1`、`libraryStillOpen=false`、词库按钮 `aria-expanded="false"` —— 即**打开一个会通过 document 捕获阶段 pointerdown 关掉另一个**，两个面板在屏幕上**从不同时存在**，因此不存在互相遮挡。 |

## 表 B：任务 5 覆盖清单追加项 4-15（来源：任务 1-4 评审累积）

> 来源标注纪律：**只有简报/派单文本明确写了来源的**才写具体任务号（第 7 项 = 任务 3 步骤 3 分支；第 11 项 = 任务 4 步骤 11 的唯一证据；第 14 项 = 任务 2 评审移交的唯一证据）；其余按派单原话记为「任务 1-4 评审累积（未逐条标注任务号）」，不臆造出处。

| # | 追加验收项 | 来源 | 结果 | 证据（与表 A 交叉引用，避免重复堆同一份原始值） |
| - | ---------- | ---- | ---- | ---- |
| 4 | 面板可编辑 | 任务 1-4 评审累积 | **PASS** | = 表 A 第 4 行（真实点击 textarea + `End`+`Z` 单字修改 → 应用后 composer 收到 `…可行。Z`）。 |
| 5 | 复制 | 任务 1-4 评审累积 | **PASS（剪贴板不可读）** | = 表 A 第 5 行（`Copy`→`Copied` 文案轨迹 + `NotAllowedError` 如实注明）。 |
| 6 | 验收 6 完善 → 存入 → 双向切换 | 任务 1-4 评审累积 | **PASS** | = 表 A 第 6 行（含两个方向的 HTTP 前后值）。 |
| 7 | 写回失败面（`ai.writeBackFail` + `ai.retryWriteBack`，不得显示成已存好） | **任务 3 步骤 3 的分支** | **PASS** | = 表 A 第 7 行（503 注入 → 失败面原文；撤掉注入后重试 → 转 `Saved to library`）。 |
| 8 | 淘汰提示 `ai.evicted` + **安全闸门** | 任务 1-4 评审累积 | **PASS（安全闸门成立：被淘汰的就是刚建的临时项）** | **前置快照**（`GET /prompts`，3 条）：`84e8810b…`(aiRefined=true,lastUsedAt=0) / `f6d300d8…`(true,0) / `66a4114f…`(seed, **aiRefined=false,lastUsedAt=1790263999710**)。**安全性推演并实测确认**：`enforceMaxCount` 按 `(aiRefined asc, lastUsedAt asc)` 取前 `n-max` 个（`src/host/store.ts:782-795`），唯一 `aiRefined=false` 的既有项是种子且 `lastUsedAt>0` → 新建项（`aiRefined=false, lastUsedAt=0`）必然排第一；前置检查「不存在既有的 `aiRefined=false && lastUsedAt=0` 项」输出 **0 条**，方继续。**动作**：`PUT /settings {"maxPromptCount":3}`（= 当时条数）→ 面板走草稿 `把这段话改写成更礼貌的拒绝：我周末没空。` → 润色 → 一键完善 → 存库。**观察到**：`POST /prompts` 响应原文 `{"ok":true,"data":{"prompt":{"id":"8900d31c-fdbb-48c0-af9a-760acc8d2a43","title":"礼貌拒绝改写",…,"aiRefined":false,"lastUsedAt":0},"evicted":["8900d31c-fdbb-48c0-af9a-760acc8d2a43"]}}` —— **`evicted` 里恰好且仅有刚建的临时项 id**；面板原文 `The original was saved, but writing back the refined draft failed\n提示词不存在\nSaved to library; older prompts were evicted past the limit\nRetry write-back\nClose` → `ai.evicted`（en `Saved to library; older prompts were evicted past the limit`）出现（写回 404 是因为该记录已被物理删除；淘汰是物理删除、不进回收站，`store.ts:777-794`）。**善后**：`PUT /settings {"maxPromptCount":300}` → 复查 `maxPromptCount = 300`；`GET /prompts` 仍为 3 条且**三条前置 id 全部在**（无数据损失）。 |
| 9 | 快速双击（含探测期）只发 1 次 `GET /ai/providers` + 1 次 `POST /ai/polish` | 任务 1-4 评审累积 | **PASS** | 整页重挂载后，页面内**同一 tick 连发两次** `.click()`（第一次点击后立刻读 `disabled` 仍为 **false**，即第二次点击时按钮尚未被 React 置灰 —— 挡住它的是 `busyRef` 同步闸门，`AIPolishButton.tsx:201-207`）。结果面板在 3401ms 就绪。`browser_network_requests` 计数（整个页面生命周期）：`GET /api/prompt-enhancer/ai/providers` = **1**、`POST /api/prompt-enhancer/ai/polish` = **1**（`GET /settings` = 2，来自两个组件各读一次设置，非本项）。补充说明：探测期内（>0ms）再点的路径上，按钮已被置 `disabled`，浏览器对 `disabled` 按钮**不派发 click**，故本项的判别点就是上面这个「同 tick 第二次点击」，已覆盖。 |
| 10 | 探测超时恢复（>15s 后按钮恢复可点，不刷新页面） | 任务 1-4 评审累积 | **PASS** | = 表 A 第 9 行「实测 A」：8.2s 时 `disabled=true` → 恢复于 **15702ms**（页面内看门狗）→ `disabled=false`、`title` 回 `ai.tip`，同一页面、未刷新。（**口径说明**：mock 必须忠实响应 `AbortSignal`；第一版 mock 返回永不落定的裸 Promise、不监听 abort，导致 20.7s 仍不恢复 —— 那是 mock 失真，不是产品缺陷，已改用 `signal.addEventListener('abort', () => reject(signal.reason))` 重测。） |
| 11 | `refining` / `saving` 期间 `aria-busy === "true"` 且 `title` 取对应 key | **任务 4 步骤 11 的唯一证据** | **PASS** | 页面内 40ms 采样器在点击事件里取 t0。**refining**：`title === "Refining…"`（= en `ai.refining`）的样本 **82 个**（dt 15ms → 3253ms），其中 **每一个** 都满足 `aria-busy="true"` 且 `disabled=true`；该窗口内 `[role="status"]` 文案同为 `Refining…`。**saving**：`title === "Saving…"`（= en `ai.saving`）的样本 **76 个**（dt 20ms → 3021ms，含故意注入的 3s PUT 延迟），**每一个** 都 `aria-busy="true"` + `disabled=true`；该窗口内面板 `aria-label` 为 `Refined draft`、正文即 `Saving…`。 |
| 12 | 点面板外关闭（`pointerdown`）后再开：无 stale | 任务 1-4 评审累积 | **PASS** | ① 面板处于 `done` 时，**真实 Playwright 点击面板外元素**（会话正文 `generic` 节点）→ 立即读：`allDialogs=[]`、`[role="dialog"] textarea` 计数 0、插件按钮根 `textContent === ""`（不上一次结果残留）。② 随后换一份完全不同的草稿 `把这句话改成英文：你好，世界。` 重新点开：整轮忙态采样 31 个（30 个忙样本，dt 37→1197ms）里 `busyWithTextarea === 0`、**上一轮优化稿特征串 `扩写成两句话` 在整轮日志里出现 0 次**（`hadP3InLog=false`），忙态面板 `aria-label` 恒为 `"AI polish"`、只有状态行；1237ms 后面板给出**新局面**的优化稿（`【任务】将下列中文句子翻译成英文。…【待翻译内容】\n你好，世界。`），再点 `Original` 读到 `aria-label="Original"`、值 **== 本轮草稿** `把这句话改成英文：你好，世界。`（不是上一轮的 original）→ `original`/`polished`/`showOriginal` 三项均无残留。（另：`close()` 把所有状态与文本一并归零，`AIPolishButton.tsx:146-159`。） |
| 13 | 验收 13 无 LLM（两条注入 + 词库按钮不受影响） | 任务 1-4 评审累积 | **PASS** | = 表 A 第 8 行。 |
| 14 | 组件内部 5 条行为：门控 / 空草稿禁用 / 点击快照语义 / 探测缓存 / 面板各动作可用 | **任务 2 评审移交的唯一证据** | **PASS** | ①**门控**：`PUT /settings {"showAIPolishButton":false}` → 响应回显 `showAIPolishButton=false` → **整页重挂载**后 `AI polish` 按钮 **ABSENT**、词库按钮 **PRESENT**（`title` 不变）；`PUT … true` → 再重挂载 → AI 按钮 **PRESENT**（就绪 214ms），`title="Polish the composer draft with AI"`、`aria-busy="false"`、`disabled=false`。②**空草稿禁用** = 表 A 第 2 行（`disabled=true` + `ai.empty` 文案）。③**点击快照语义**：第一次点击（草稿 = S1 `把这句话变得简洁：我们应当在明日午后三时前完成相关工作的提交。`）之后、调用仍在进行时把草稿改成 S2 `第二版草稿：请把这段内容改写成三条要点。`（2651ms 后结果就绪）→ 面板 `Original` 读回 **S1**（= 点击那一刻的草稿），而 composer 当前值是 **S2** → 快照与当前草稿确实分离。④**探测缓存**：同一次挂载内第二次点击（= 上面这次）后，`GET /ai/providers` 计数仍为 **1**、`POST /ai/polish` 计数升到 **2**（第二次点击复用缓存，未重探）。⑤**面板各动作可用**：`Apply to composer`（表 A 3/4）、`Copy`（表 A 5）、`One-click refine`（表 A 6）、`Save to library`（表 A 6/7）、`Toggle original / refined`（表 A 6，两方向）、`Close`/`Retry write-back`（表 A 7）全部真实点击生效。 |
| 15 | 零 console error + 两面板互不覆盖 + 活体产物一致性 | 任务 1-4 评审累积 | **PASS** | = 表 A 第 10/12 行 + 「步骤 1」活体产物一致性（56037/56073 字节逐字节相同，仅差宿主重写的 sourceMappingURL 尾行）。 |

## 未完整验证 / 无法判定的项（NOT RUN 汇总）

> 派单要求：确实不能跑的项必须在对应行写 `NOT RUN — <原因> — 归属 <谁>` 并在此汇总。**本轮表 A 12 行、表 B 12 项全部有实测结论，0 项 NOT RUN**；以下是不在验收清单内、但为避免「静默缺席」而显式列出的未覆盖项。

| 项 | 状态 | 原因 | 归属 |
| - | ---- | ---- | ---- |
| zh 文案在活 GUI 的渲染验证 | **NOT RUN — 活 GUI 语言为 en（`document.documentElement.lang === "en"`），本轮所有断言取 en 文案 — 归属：可选补充，不阻塞 P5** | zh 字符串仅由源码确认：`src/client/utils/i18n.ts:23-53`：`ai.button="AI 优化"`、`ai.empty="输入框为空，先写点内容"`、`ai.polishing="正在调用 AI…（最长约 2 分钟）"`、`ai.evicted="已存入词库；有旧提示词因超出上限被淘汰"` 等）。 | 如需，把宿主语言切到 zh 后重测 |
| create 步骤失败面（`ai.saveFail` = `Failed to save to library`，`saveError` 原因行） | **NOT RUN — 不在任务 5 覆盖清单内（清单第 7 项只要求写回失败面），本轮未注入 `POST /prompts` 503 — 归属：P5 收尾/P6 如需可低成本补测** | 代码读取级证据：`AIPolishButton.tsx:296-303`（`createPrompt` 抛出 → `setSaveError(reasonOf(err))` → `status="saveFailed"`），渲染分支 `AIPolishButton.tsx:520-528`（`role="alert"` + `ai.saveFail` + 原因行）。 | P6 |
| polish 结果与原文相同的分支（`ai.sameAsOriginal`，R-P5-2） | **NOT RUN — 需要"AI 原样返回"这一不可控的模型行为才能触发的 UI 分支，本轮 6 次真实 polish 全部产生不同文本；且该分支不在覆盖清单内 — 归属：P5 单测/审查覆盖** | 代码读取级证据：`AIPolishButton.tsx:308-311,601-615`（`needsWriteBack` 为 false → 直接 `saved`；`canToggle(saved)` 为 false → 显示 `ai.sameAsOriginal` 而非切换按钮）。 | P5 单测（`ai-flow`）已有覆盖 |
| `Turn` 计数（未发消息的交叉证据） | 部分受限 | 本轮用「composer 草稿只被读、只被 `setDraft` 覆盖、从未触发 `submit`、从未按 Enter」保证不发送；`Turn` 行数读取依赖会话 UI 选择器，本轮**未**取该数值（不以未取到的数作断言）。 | 无（不可逆动作本就没做） |

## console / 网络异常

- **干净页**：`Total messages: 1 (Errors: 0, Warnings: 0)`；唯一一条为 `[INFO] [genui] client active; fence-channel=dom`。`level=error` 返回 0 条。
- **本验收刻意制造的异常（全部已在表 A 第 10 行逐条列出）**：1 条 404（淘汰测试对被删记录写回）+ 5 条 `[WARNING]`（注入 503 写回失败 / 注入 503 polish 失败 / 提示词不存在写回失败 / 探测 TimeoutError / 润色 TimeoutError）。均为「错误必须可见」的预期行为，非未捕获异常、非加载错误。
- **网络层**：正常路径无 4xx/5xx（除上述刻意注入：两处 503 被页面内拦截、未落到宿主；一处 404 来自被淘汰记录的真实写回）。`GET /prompts` / `GET /settings` / `GET /ai/providers` 全部 200 合法信封（3 provider / 10 模型，与派单环境事实一致）。
- **宿主侧**：本轮只做了一次 `dev_reload_package`（before/after 均 `[active]`、`client ✓`），无 `unresolved require` / `Cannot find module` 迹象（模块 id `dsh-prompt-enhancer` 生效、三个座位与 5 条 HTTP 路由全部工作）。

## 缺陷与观察（如实记录；本任务不修产品代码，由控制者裁定）

| ID | 类型 | 内容 | 期望 / 实际 | 定位线索 |
| -- | ---- | ---- | ----------- | -------- |
| **D-1** | 缺陷（低；文案错配） | **探测超时（15s）套用了"120s 超时"的文案** | 期望：15s 探测中止应给出与探测相关的提示（或至少不声称 >120s）。实际：面板原文 `AI call timed out (>120s), please retry later`，而该次中止由 `AI_PROBE_TIMEOUT_MS = 15_000` 触发（实测恢复于 15702ms）。 | `src/client/utils/ai-flow.ts:59-62`（`aiErrorKey` 对任意 `name === "TimeoutError"` 一律返回 `"ai.timeout"`）+ `src/client/utils/api.ts:12-14,83`（探测也有自己的 signal）+ `src/client/components/AIPolishButton.tsx:213-225`（探测失败走同一个 `setErrorKey(aiErrorKey(err))`）。最小复现：本记录表 A 第 9 行「实测 A」。 |
| O-1 | 观察（既定语义，非缺陷） | **AI 会新增 `{{变量}}`** | 一键完善两次都新增了变量：`{{待翻译内容}}`、以及 `{{朋友称呼/关系}}`/`{{具体情境}}`/`{{语气风格}}`/`{{字数/形式}}`。属 §6.3 既定语义（保留并可按需新增）与 R-P5-5，落库前面板可编辑且用户可见（`AIPolishButton.tsx:538-544`），不计缺陷。润色（polish）6 次均未新增变量。 | `src/host/ai.ts`（refine 提示词）/ `src/host/refine.ts` |
| O-2 | 观察（测试自身造成） | 淘汰测试必然产生 1 条 404 与「提示词不存在」写回失败 | 被淘汰记录是**物理删除**（不进回收站），面板随后的写回 PUT 必然 404；这正是这个分支要展示的真实场景。 | 表 A 第 10 行 |
| O-3 | 观察（遗留，与 P4 一致） | **AI 结果面板几何上覆盖 composer** | 真实 Playwright 点击 composer 中心时被面板内「One-click refine」拦截（actionability 失败 `… intercepts pointer events`）；面板 rect `[702,404,398,221]` 与 composer 区域相交。P4 验收第 14 行对词库面板记过同一形态的「预期布局（非裁剪）」。本项已通过「面板可 `Close`、且点面板外任意 pointerdown 即关闭」缓解（表 A 第 12 行实测）。用户真实点击的最终落点未在本轮验证。 | `AIPolishButton.tsx:653-660`（`ANCHOR` 贴按钮上沿、zIndex 31） |
| O-4 | 观察（数据卫生） | **被淘汰提示词留下的标签仍在标签字典里** | 建记录时标签已写入字典（`ensureTagsWith`），随后记录被物理淘汰，标签成为 `count=0` 的孤儿（本轮产生 `文本改写`）。不属本任务判定范围（标签清理是管理面板事项），已由本验收手动删除。 | `src/host/store.ts`（`createPrompt` → `ensureTagsWith`；`enforceMaxCount` 只删 prompts 行） |
> **D-1 已修（`d8ca9b0`）**：`ai.timeout` 文案去掉具体时长——探测 15s 与调用 120s 共用该键，写死数字对二者之一必然错。**P5 收尾（本次修复）把时长声明也从 `ai.polishing` 移出**：该键同样被 15s 的探测路径复用，等于 D-1 的同类错配换了个键；改后 `ai.polishing` 不含数字（en `Calling AI…` / zh `正在调用 AI…`），「可能较长」的预期移到闲置态悬停文案 `ai.tip`（en `Polish the composer draft with AI (may take a minute or two)`）——探测 15s 与调用 120s 两条路径都不再含写死时长。

## 临时数据与副作用

| 动作 | 对象 | 结果 |
| ---- | ---- | ---- |
| 创建（HTTP `POST /prompts`，均经面板「存入词库」两步序列） | ① `f6d300d8-9c5f-49ce-a4fe-bbe726eaede6`（`中译英提示词`，body=完善稿 `请将以下中文内容翻译成英文：{{待翻译内容}}`，sourceBody=`把这句话改成英文：你好，世界。`）② `84e8810b-f27a-4d7d-b74a-8fb8fe2480d3`（`写一句鼓励朋友的话`，先写回失败、后重试成功）③ `8900d31c-fdbb-48c0-af9a-760acc8d2a43`（`礼貌拒绝改写`，**淘汰测试用**） | ①② 为写回面/切换面的验收产物；③ 是淘汰测试的临时项 |
| 删除 → 回收站 | ①②（`DELETE /prompts/:id`） | `{"deleted":true}` × 2 |
| 淘汰（物理删除，不进回收站） | ③ `8900d31c…` | `POST /prompts` 响应 `evicted:["8900d31c…"]` —— **即验收项要求触发的那一条**，非既有数据 |
| 清空回收站 | `DELETE /trash` | `{"removed":2}`；复查 `GET /trash` → `[]` |
| 删除本轮新建的标签 | `翻译`(count 1→)、`鼓励文案`(1→)、`文本改写`(0→) —— 前两者由 ① ② 的 `tags.slice(0,1)` 带入、第三者由 ③ 带入 | `{"deleted":true,"inUse":0}` × 3（先删提示词使其 inUse=0 再删） |
| meta | `pl:template-var-memory` | **全程未写**：验收前后均为原值 `{"target":"日语","主题":"量子计算"}`（本轮所有草稿都不含 `{{变量}}`，未触发变量记忆写入） |
| settings | `maxPromptCount`（唯一被改过的键） | 改：`300 → 3`（= 当时条数）→ 恢复：`3 → 300`；复查 `GET /settings` 13 键**逐一等于**验收前快照（`panelWidth 420, panelHeight 560, showComposerButton true, composerButtonIconOnly true, showAIPolishButton true, aiPolishButtonIconOnly true, hashTriggerEnabled true, contextRecommendEnabled true, selectionAddEnabled true, showSidebarButton true, maxPromptCount 300, aiProvider "", aiModel ""`） |
| 是否发送过消息 | — | **没有**。全程只用 `inputActions.setDraft`（「应用到输入框」）与 composer 填字；未触发 `submit`、未按 Enter。 |
| 不可逆变化 | 种子提示词 `欢迎使用提示词增强` 的 `usageCount` / `lastUsedAt` | 验收前 `usageCount=9, lastUsedAt=1790263999710`；**收尾复查同值**（本轮没有任何 `Insert/Overwrite/Insert & send/`# 选中` 动作）。**不可逆变化 = 0**（唯一被物理删除的记录是淘汰测试自己的临时项）。 |
| 代码/产物 | — | 未改 `src/**`、`lib/**`、`tests/**`、`scripts/**`、`package.json`。`npm run build` 只重建出与提交物**逐字节相同**的产物（构建前后 sha256 相同、`git status` 干净）。本轮唯一新增的仓库内文件是本记录 + `.superpowers/sdd/**`（不进 git）。 |

**收尾复查输出（原文）**

```
--- final prompts ---     count= 1
66a4114f-6299-4309-a701-8af4379abdd5 usageCount= 9 lastUsedAt= 1790263999710 title= 欢迎使用提示词增强
--- final trash ---       {"ok":true,"data":[]}
--- final tags ---        {"ok":true,"data":[{"name":"m3临时","count":0},{"name":"欢迎","count":1},{"name":"验收临时","count":0}]}
--- final settings ---    {"ok":true,"data":{…,"maxPromptCount":300,…}}   ← 13 键与验收前快照完全一致
--- final meta ---        {"ok":true,"data":{"key":"pl:template-var-memory","value":"{\"target\":\"日语\",\"主题\":\"量子计算\"}"}}
```

## 假设清单（本任务无法向人提问，按最强证据自定，显式列出）

1. **「面板外 `pointerdown`」的点击落点**：因面板几何上覆盖 composer（O-3），真实 Playwright 点击 composer 中心被 actionability 拒绝；改点为**会话正文节点**（真实点击，非合成事件），`document` 捕获阶段的监听器照常收到 `pointerdown` 并关闭面板。不改变「点外面即关闭」这一行为判定。
2. **忙态采样点选择**：MCP 的 `browser_click` 在触发网络后会等到页面稳定才返回（实测一次 4.1s），从工具边界读状态会错过整段调用中窗口，故用**页面内 40ms 采样器 + 点击事件内 capture 取 t0**。取到的是真实 DOM 状态与 `performance.now()`，不是模拟值。
3. **「永不落定」mock 的忠实性**：探针挂起必须仍能被 `AbortSignal.timeout` 中止（真实网络挂起也是如此），否则测的不是产品行为。第一版 mock 不监听 abort（20.7s 仍未恢复）已判定为 mock 失真并重测；结论采信忠实版（15702ms 恢复）。
4. **淘汰安全性判定**：以 `store.enforceMaxCount` 的排序键 `(aiRefined asc, lastUsedAt asc)` 推演「新建项必被淘汰」，并在动作前用 `GET /prompts` 实测确认「不存在既有的 `aiRefined=false && lastUsedAt=0` 项（输出 0 条）」；被淘汰 id 与新建 id 逐字相等，未做任何既有数据的删除。**若实测发现被淘汰的不是临时项，本任务的既定处置是立即停手、恢复设置并在报告最前面如实汇报 —— 本轮未触发该处置。**
5. **「互不覆盖」的判据**：采用「几何（rect + 逐级裁剪祖先，P4 口径）+ 交互互斥（打开一个必然关闭另一个，`dialogCount` 恒为 1）」双重证据。两个面板不存在同时在屏的时刻，故不存在遮挡。
6. **`usageCount` 外部变化**：P4 记录曾出现「无法唯一归因的 +1（宿主同期存在其它工作区会话）」。本轮收尾复查种子 `usageCount=9` 与本轮开始时一致；不排除同期他会话点击，但不影响本轮任何断言。

## 遗留与移交

1. **D-1（探测超时文案错配）**：控制者判定是否修（最小修法是把探测失败单独映射一个 key，或在 `aiErrorKey` 之外判定 abort 来源）。**本任务未改任何代码**。
2. **O-3（面板覆盖 composer）**：P4 已记过词库面板同形态；P5 的 AI 面板沿用同一落点（zIndex 31 > 词库 30）。若 P6 详情页/管理面板需要「边看边改草稿」，需重新考虑浮层落点或改为可拖拽/停靠面板。**归属 P6/P8**。
3. **O-4（淘汰遗留孤儿标签）**：`enforceMaxCount` 不清理标签字典；P6「淘汰二次确认」与标签治理可一并考虑（`count=0` 标签目前不会自动回收）。
4. **P8 设置页**：`showAIPolishButton` / `aiPolishButtonIconOnly` 与 `showComposerButton` / `hashTriggerEnabled` 同属「mount 时读一次」，本轮只按**重挂载生效**口径验证（表 B-14①）；设置页需同批决定即时生效（与 P4 第 17 行口径一致）。
5. **zh 渲染验证**：本记录全部文案为 en；zh 字符串以源码为证（未完整验证小节第 1 条）。
6. **（可选，P6/P8）** 若要让探测超时与调用超时给出各自措辞，需给探测路径单立错误分类（api.ts 打标记 → ai-flow.ts 分类 → 新键），本里程碑按 KISS 未做。
