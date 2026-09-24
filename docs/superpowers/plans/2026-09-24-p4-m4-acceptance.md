# P4 / M4 活 GUI 验收记录（2026-09-24；最终评审后重写）

> **本文件与计划 `docs/superpowers/plans/2026-09-24-p4-composer-and-reuse.md`「任务 7」的验收表逐行对齐**：
> 同顺序、同项数。计划该表实际为 **18 行**（计划 `:725-742`；控制者交接文本写作「17 行」，以计划实际行数为准，本记录不静默丢行）。
> 上一版记录只覆盖 7 条却自称 7/7 PASS —— 本版对每一条给出「我做了什么 / 观察到什么」的原文或数值证据；
> 确实不能跑的项写在对应行内（`NOT RUN — <原因> — 归属 <里程碑>`）并在末尾「未完整验证」小节汇总。

## 环境与口径

- 宿主：`http://127.0.0.1:3080`；驱动方式：Playwright（`browser_navigate` / `browser_snapshot` / `browser_find` / `browser_click` / `browser_type` / `browser_press_key` / `browser_evaluate` / `browser_console_messages`）+ 只读/受控 `curl` HTTP。
- 会话：`Into the Unknown`（workspace `cireric-dsh-prompt-enhancer`），验收期间恒为 **Turn 1**（上一轮已用掉唯一一次发送授权；本轮**未再发送任何消息**）。
- 活 GUI 语言 = **en**（`document.documentElement.lang === "en"`），故 i18n 文案按 en 呈现；zh 文案以源码为证据（第 1 行）。
- 本轮**未**运行 `npm run build` / `build:dev` / `link-dsh-deps`（会改产物或破坏类型链接）。
- **被验收的活体 == `lib/client.js`**：宿主实际下发模块（`/plugins/??…,dsh-prompt-enhancer/client.js&rev=25e4a7b5fdc7`）与 `lib/client.js` 逐字节一致，唯一差异是宿主重写的尾部 `//# sourceMappingURL` 行（首个差异位 28306）。该产物为 production 构建（`if (false)` 分支已折叠），故本轮页面不再出现 `[prompt-enhancer] client loaded` 日志。
- 证据分层：**本轮重跑 = 实测**；仅第 5 行沿用上一轮实测（原因见该行）。

| # | 验收项 | 结果 | 证据（我做了什么 / 观察到什么） |
| - | ------ | ---- | -------------------------------- |
| 1 | 输入框旁出现词库按钮（规格 §9.3-2） | **PASS**（本轮重跑） | 快照中定位到 `button "Open the prompt library" [ref=f1e458]: Library`，与输入框同属 composer 工具行（`DIV.uI_N2W_row`）。`browser_evaluate` 读属性：`text="Library"`、`title="Open the prompt library"`、`aria-label` 同值、`aria-haspopup="dialog"`、`aria-expanded="false"`。zh 文案源码：`src/client/utils/i18n.ts:5-6` → `"button.title": "词库"`、`"button.tip": "打开提示词库"`（en 见 `:27-28`）。 |
| 2 | 点开快速列表能看到提示词 | **PASS**（本轮重跑） | 点击该按钮 → `aria-expanded` 变 `true`，出现 `[role="dialog"][aria-label="Saved prompts"]`，header 文本 `Saved prompts`（= `list.title`）；`[role="listitem"]` 共 5 项，含种子提示词 **`欢迎使用提示词增强`**（+ 本轮 4 条临时提示词），每项三个动作按钮 `Insert` / `Overwrite` / `Insert & send`。 |
| 3 | 插入 | **PASS**（本轮重跑） | 先在 composer 设草稿 `草稿E`，再点 `Insert 验收临时C 008879`；读回 composer DOM：`<p>草稿E</p><p>这是C的正文，无变量。</p>` → `innerText === "草稿E\n\n这是C的正文，无变量。"`。草稿独占一段、正文另起一段（Lexical 的 `<p>` 边界即 1 个换行）：**草稿未被丢弃，正文以换行追加**。 |
| 4 | 覆盖 | **PASS**（本轮重跑） | 设草稿 `草稿F` → 点 `Overwrite 验收临时C 008879` → 读回 `innerText === "这是C的正文，无变量。"`、`innerText.includes("草稿F") === false`：原草稿被整段替换。 |
| 5 | 插入并发送 | **PASS**（NOT RUN 本轮 —— 上轮已验证，本轮不重发） | NOT RUN — 本轮不得再发消息（唯一一次授权已于上一轮用掉：`Turn 0 → 1`，composer 被清空、`document.title` 变为消息派生标题、转写区出现消息行，发出内容 = 种子提示词正文全文 179 字符）— 归属：**已在 P4 上一轮闭环，无需后续里程碑**。本轮交叉证据：整轮结束时会话仍为 `Turn 1` / `userRowCount === 1`（未新增消息）。追加语义分支（替换 vs 换行追加）本轮同样未在运行时观察，见「未完整验证」第 4 条。 |
| 6 | `{{变量}}` | **PASS**（本轮重跑） | 临时提示词 A body = `请用 {{风格008879}} 写一段关于 {{主题008879}} 的介绍。`。点其 `Insert` → 弹出 `[role="dialog"][aria-label="Fill template variables"]`，文本含 `Fill template variables` / `Each {{name}} below is substituted when inserted` / 两个输入框 `风格008879`、`主题008879`（第一个 `autoFocus`，实测 `document.activeElement` 为 `INPUT`）/ 按钮 `Fill in` `Cancel`。① 只填 `主题008879=量子计算`、`风格008879` 留空 → 点 `Fill in` → composer `innerText === "请用 {{风格008879}} 写一段关于 量子计算 的介绍。"`：**已填变量被替换、未填变量原样保留 `{{…}}`**（未填空串）。② 重新打开同一条 → `风格008879=""`、`主题008879="量子计算"`，且弹窗多出 `Filled with values from last time`（= `vars.remembered`）；点 `Cancel` 不二次插入。 |
| 7 | `#` 浮层 | **PASS**（本轮重跑） | 在 composer 键入 `帮我 #欢迎` → 出现 `[role="group"][aria-label="Pick a prompt"]`，唯一候选按钮 `欢迎使用提示词增强`（含标签 `欢迎`）+ 摘要。**实时筛选双向验证**：追加键入 `zzz`（草稿变 `帮我 #欢迎zzz`）→ 浮层文本变为 `Pick a prompt\nNo matching prompt`（= `hash.empty`，候选消失）；连按 3 次 `Backspace` 回到 `帮我 #欢迎` → 候选恢复。**鼠标点击**该候选 → 草稿 `帮我 这是你保存的第一条提示词…`（`innerText.length=187`）、`#` 令牌消失、浮层关闭。键盘 ↑↓/回车按用户裁定 D2 不实现、不测。 |
| 8 | `#` + 含变量提示词（任务 6 步骤 1 的核心契约） | **PASS**（本轮**新增**，上轮缺席） | 键入 `帮我 #验收临时A` → 浮层只剩 title 命中的唯一候选 `验收临时A 008879`；点击 → **先弹出变量填窗**（`风格008879` / `主题008879`，后者带出记忆值 `量子计算`）→ 把 `风格008879` 填为 `正式` → 点 `Fill in` → composer `innerText === "帮我 请用 正式 写一段关于 量子计算 的介绍。"`：令牌前文本 `帮我 ` **保留**、`#验收临时A` 被**整段替换**为填充后的正文、无残留 `#`、无残留 `{{}}`、弹窗与浮层均关闭、`activeElement` 回到 composer。 |
| 9 | `#` 选中的用量上报（规格 §4.4） | **PASS**（本轮重跑，数值可唯一归因） | 只读 `GET /prompts` 前后对比种子提示词：点击 `#` 候选**前** `usageCount=7, lastUsedAt=1790263279771`；点击**后** `usageCount=8, lastUsedAt=1790263671193` —— 次数 +1 且最近使用时间变大。**对照实验排除重复计数**：新建临时提示词 E（`usageCount=0, lastUsedAt=0`）→ 仅点 1 次 `Insert 验收临时E` → 读回 `usageCount=1, lastUsedAt=1790264110816`（单次动作恒 +1）。 |
| 10 | 点击候选后能继续打字 | **PASS**（本轮**新增**；实测与「焦点不归还」的预判相反） | 点击 `#` 候选（种子提示词）后**立即** `browser_evaluate`：`document.activeElement === div.uI_N2W_input`（composer 本体，`aria-label="Message or run a task, / commands, @ files or sessions"`），`activeIsComposer === true`；随后 `browser_press_key('X')` → composer `innerText` 由 187 → **188** 且以 `X` 结尾（`…换成你自己的内容。X`）：**文本进入了 composer**。机制：`inputActions.setDraft()` 会让宿主编辑器重新取焦（库面板 Insert / 弹窗 `Fill in` / `#` 候选点击三条路径都是如此）。→ 控制者「重要 1」描述的「点候选后落到 `<body>`」在**候选点击路径上不复现**；真正失焦的是**弹窗 Cancel**路径（第 15 行，已独立复现两次）。 |
| 11 | 零 console error | **PASS**（本轮重跑；含一处**测试自身造成**的例外，见右） | `PUT /settings` 恢复 `showComposerButton=true` 后整页重挂载，`browser_console_messages(all=true, level=error)` → `Total messages: 1 (Errors: 0, Warnings: 0)`，`level=error` 返回 0 条；唯一一条是 INFO `[genui] client active; fence-channel=dom`。**例外（非缺陷）**：第 16 行故意对「已被删除的提示词」点 Insert，浏览器网络层各记 1 条 `Failed to load resource: 404 … /prompts/<id>/use`（共 2 条），插件侧对应 2 条 `[WARNING] [prompt-enhancer] Failed to record usage Error: 提示词不存在` —— 这是「错误必须可见」的设计行为（`console.warn` + 界面 notice），不是未捕获异常、不是插件加载错误。 |
| 12 | 变量记忆往返不丢（并断言**其它提示词**的已记忆值未被覆盖） | **PASS**（本轮重跑，含上轮只做一半的后半句） | **往返**：A 填一次（`风格008879=正式`、`主题008879=量子计算`）→ 再开 A → 两框分别带出 `正式` / `量子计算` + `Filled with values from last time`；B 填一次（`字段008879=中文排版`）→ 再开 B → 带出 `中文排版` + remembered 提示。**未被覆盖**：写入 B **之后**重开 A，A 的两个值仍是 `正式` / `量子计算`（未被 B 的写入抹掉）。**存储层**：B 写入后 `GET /meta/pl%3Atemplate-var-memory` = `{"target":"日语","主题":"量子计算","主题008879":"量子计算","字段008879":"中文排版","风格008879":"正式"}` —— 本轮键与验收前就存在的 `target`/`主题` 并存；`字段008879` 由 `已填` 更新为 `中文排版` 而**未损伤**其它键（读-改-写合并语义）。 |
| 13 | 变量输入框内按 Enter | **PASS**（本轮**新增**，上轮缺席） | 设草稿 `草稿G` → 开 B 的变量弹窗 → `input[aria-label="字段008879"]` 填入 `已填` → `browser_press_key('Enter')`（焦点在该 input 内）。结果：弹窗关闭、composer `innerText === "草稿G\n\n请按 已填 处理这段文本。"` —— Enter 只触发**本弹窗**的表单隐式提交（`TemplateVariablesDialog` 是 `<form onSubmit={confirm}>` + `<button type="submit">`）。**双发未复现**：`Turn 1` 与 `userRowCount === 1` 均未变化、`document.title` 也未变成消息派生标题 —— 聊天消息**没有**被发出去。 |
| 14 | 面板不被裁剪 | **PASS**（本轮以**数值**判定，替代上轮一句话带过） | 对两个浮层做 `getBoundingClientRect()` + 逐级 overflow 祖先比较（viewport 1280×720）。① 词库面板 `Saved prompts`：rect `[632,287,338,338]`，`inViewport=true`；4 个裁剪祖先（`sCv-yq_scrollBody` overflow `auto`、`sCv-yq_root` `hidden`、`XZJ-uW_centerCol` `hidden`、`XZJ-uW_frame` `hidden`）**全部 `panelInside=true`**；`scrollHeight 487 > clientHeight 336` → 溢出在卡内滚动而非被祖先裁掉。② `#` 浮层：rect `[427,433,314,127]`，`inViewport=true`，同样 4 个裁剪祖先全部 `inside=true`。上一轮观察到的「面板覆盖 composer、点击被拦截」是浮层遮挡的**预期布局**（非裁剪）；本轮每次交互按 `aria-label` 精确定位，未受影响。 |
| 15 | 焦点归还 | **FAIL（弹窗 Cancel 路径）— 已知 UX 限制** | **宿主能力核查（先查再判）**：`node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/types/client/contract/input.d.ts:219-236` 的 `InputActions` 仅有 `setDraft` / `addAttachments` / `removeAttachment` / `pruneAttachments` / `submit` —— **无任何 focus 面**；`…/contract/slots.d.ts:243-251` 的 `SessionStandardProps` 仅 `useConversation` / `useInput` / `inputActions` —— **无 focus**。唯一带 focus 字样的公开面是 `ComposerKeyboard`（`input.d.ts:240+`），其文档明确 `package-internal, never across a plugin boundary`，插件拿不到；`views.d.ts:10-15` 的 `ViewFocusRequest` 是 View 内部的 opaque focus，与 composer 无关。**故按控制者指示不改代码**（用 DOM `focus()` 会违反规格 §7.3 零 DOM 注入）。**实测（两条路径独立复现）**：① 库面板 `Insert A` → 弹窗 → `Cancel` → `document.activeElement === BODY`；随即 `browser_press_key('q')` → composer 文本不变（无 `q`）。② `#` 候选 A → 弹窗 → `Cancel` → `document.activeElement === BODY`（composer 文本仍 `#验收临时A`）；随即 `browser_press_key('w')` → `gotW === false`。**对照（PASS 子路径）**：弹窗确认（`Fill in`）后与 `#` 候选点击后 `activeElement` 均 = composer（后者见第 10 行）。→ 精确结论：**确认路径焦点归还正常**；**取消路径焦点落到 `<body>`，用户需再点一次输入框**。归因：宿主 `InputActions` / session 标准 props 均无 focus 能力，插件无法在不违反 §7.3 的前提下自己修。**归属：P5/P6 与用户重议**（接受该限制，或推动宿主暴露 composer focus 面）。 |
| 16 | 重复提示可见 | **PASS**（本轮**新增**，上轮缺席） | 单次 `browser_evaluate` 内串行触发两次**同一文案** notice（`error.noPrompt` = `That prompt no longer exists`）：t=0 时面板内 C、D 行均在（`cRow=true, dRow=true`）→ `fetch DELETE C` → 点 C 的 `Insert` → **t=606ms notice = "That prompt no longer exists"（可见）**、面板关闭；重开面板（`dRowAfterReopen=true`，D 仍在）→ `fetch DELETE D` → 点 D 的 `Insert` → **t=1919ms notice 仍 = 同一文案（仍可见）**。250ms 轮询：`2170…3933ms` 一直 `visible`，**`4184ms` 起 `gone`**。→ 「连续两次触发同一提示仍可见」**成立（PASS）**。**附带观察（不改变本行判定，属潜在待办）**：第二次同文案触发是 React 同值 `setState`，不会重跑 `[notice]` effect 的 4s 定时器，故显示窗口是「第一次触发 + 4s」（实测恰在第一次触发后约 4.0s 消失）而非「第二次 + 4s」。若产品要求「每次触发都重新计时」，需把 notice 状态改成带自增序号的 `{text, seq}`（归属：P5/P6）。 |
| 17 | 设置关闭按钮 | **PASS**（本轮**新增**，按**已修正**口径＝重挂载生效） | 按计划修正后的判定方式（**不断言即时消失**）：① `PUT /settings {"showComposerButton":false}` → 响应 `data.showComposerButton=false` → `browser_navigate` 整页**重挂载** → 等 composer 就绪 + 1.5s → `libraryButtonPresent === false`（按钮消失）。② `PUT /settings {"showComposerButton":true}` → 再次整页重挂载 → 按钮恢复：`text="Library"`、`title="Open the prompt library"`、`aria-expanded="false"`。口径依据：本组件 mount 时读一次设置（`src/client/components/PromptLibraryButton.tsx:58-72`），不订阅变更；「即时生效」不在本里程碑（计划 `:741` 已就地修正）。**归属备注：P8 设置页需同批处理 `showComposerButton` 与 `hashTriggerEnabled` 的「改完立即生效」**（后者目前无任何客户端消费者，见计划「交接给 P8」；同批做才不会让该键永久闲置）。 |
| 18 | 宿主加载无 unresolved require | **PASS**（本轮**新增**，上轮缺席） | ① 整页重挂载后 `browser_console_messages(level=error)`：**Errors 0 / Warnings 0**（第 11 行），无任何 `Cannot find module` / `require` 失败。② 插件确实完成加载并全功能可用：模块 id `dsh-prompt-enhancer` 生效、按钮渲染、`#` 浮层与 5 条 HTTP 路由全部工作（第 1-17 行）。③ 宿主侧日志扫描：`grep -rin "unresolved" ~/.dsh/super-injector/ ~/.dsh/profiles/web/.dsh-market/` → **无输出**；`~/.dsh/super-injector/reload-debug.log` 最后一次重载为 `[2026-09-24T15:24:23.165Z] reload match=dsh-prompt-enhancer … fiberState=active entry.disabled=false`。④ 活体产物一致性：diff 宿主下发的最后一个模块（`…,dsh-prompt-enhancer/client.js&rev=25e4a7b5fdc7`，28308 字节）与 `lib/client.js`（28342 字节）→ 首个差异位 28306，仅差宿主重写的尾部 `//# sourceMappingURL` 行，其余逐字节一致。⑤ `dsh.client.inject` 里的 `@deepseek-ai/dsh-client-runtime` 在类型链接器里属**预期** unresolved（当前 checkout 无该包，计划任务 2 已注明），运行时**不产生** require 报错（本行实测覆盖）。 |

## 未完整验证 / 无法判定的项（NOT RUN 汇总）

> 计划：确实不能跑的项必须在对应行写 `NOT RUN — <原因> — 归属 <谁>`，并在此汇总，**不得静默缺席**。

| # | 验收项 | 状态 | 原因 | 归属 |
| - | ------ | ---- | ---- | ---- |
| 5 | 插入并发送 | **NOT RUN（本轮）** | 该验收项会真实发送一条会话消息，上一轮已用掉唯一一次授权（`Turn 0→1`）；本轮禁止再发消息，故只做交叉证据（`Turn` 仍为 1、无新增消息行）。 | 已在 P4 上一轮闭环，无需后续里程碑 |
| 5 | 「插入并发送」相对已有草稿是**替换还是换行追加** | **NOT RUN（运行时）** | 执行该动作时草稿为空，运行时只能证明「内容被放进输入框并立即发出」，无法从运行时区分替换/追加；未再次发送以免违反发送授权。 | 归**代码读取级**证据：`src/client/utils/insert.ts:7-9`（仅 `mode==="overwrite"` 走整段替换，`insert-send` 与 `insert` 同走 `draft ? \`${draft}\n${body}\` : body`） |
| 1 / 2 | zh 文案在活 GUI 渲染验证 | **NOT RUN** | 活 GUI 语言为 en（`document.documentElement.lang === "en"`），`:5-6` 的 `词库` / `打开提示词库` 仅由源码确认，未在浏览器中实际渲染出中文。 | 可选补充（不阻塞 P4）；如需，把宿主语言切到 zh 后重测 |
| 7 / 8 | `#` 浮层键盘（↑↓ 选择、回车插入） | **NOT RUN（按裁定不测）** | 用户 2026-09-24 裁定 D2：`#` 浮层只做「尾令牌 + 点击选择」，不接管键盘（D2-b 未获批准），故不计缺陷、不测。 | 用户已裁定（规格 §9.3 验收 2 的键盘交互改为点击选择） |
| 12 | 变量记忆的**唯一归因**（记忆是全局 key，按变量名而非按提示词） | 部分受限 | 本轮已用随机后缀变量名（`风格008879` 等）避免撞车，故第 12 行的往返/覆盖归因是干净的；但该 key 历史上存在他人/他轮的值（`target:"日语"`），说明「同名变量跨提示词共享」这一**设计语义**依旧只能由源码与 meta 原值推断，无法在运行时排除外部同名写入。 | 设计语义（`memoryKey` 全局键），P4 不做改动；如未来要求「按提示词隔离」，属新需求 |

## console / 网络异常

- **正常路径**：整页重挂载后 `Total messages: 1 (Errors: 0, Warnings: 0)`；唯一一条为 `[INFO] [genui] client active; fence-channel=dom @ …`。全程**无** 4xx/5xx 失败请求（除第 16 行刻意制造的 404，见下）。
- **测试自身造成的例外（已在第 11/16 行说明）**：第 16 行对「已删除提示词」点击 Insert 时，浏览器网络层记录 2 条 `Failed to load resource: 404`（`POST /prompts/<id>/use`），插件侧对应 2 条 `[WARNING] [prompt-enhancer] Failed to record usage Error: 提示词不存在`。这是**刻意触发已删除项**的预期错误面（`console.warn` + 界面 notice 同时可见），非未捕获异常，也非插件加载错误。
- 宿主侧日志：`~/.dsh/super-injector/*.log` 无 `unresolved` / `Cannot find module` / `require` 报错；最后一次重载 `fiberState=active`。

## 临时数据与副作用

| 动作 | 对象 | 结果 |
| ---- | ---- | ---- |
| 创建（HTTP `POST /prompts`，库面板无新建入口） | `验收临时A 008879`（含 `{{风格008879}}`/`{{主题008879}}`）、`验收临时B 008879`（含 `{{字段008879}}`）、`验收临时C 008879`、`验收临时D 008879`、`验收临时E 008879` | 全部 `{"ok":true}`（均 `tags: []`，未创建任何标签） |
| 删除 → 回收站 | 上述 5 条（含第 16 行由页面内 `fetch DELETE` 删除的 C、D） | `{"deleted":true}` × 5 |
| 清空回收站 | `DELETE /trash` | `{"removed":4}` + `{"removed":1}`；复查 `GET /trash` → `[]` |
| 恢复 meta | `PUT /meta/pl%3Atemplate-var-memory`，写回验收前的原值 `{"target":"日语","主题":"量子计算"}` | `{"ok":true}`；复查同值。本轮写入的 `主题008879`/`风格008879`/`字段008879` 三个键**已一并移除**，未触碰他人/他轮的值 |
| 恢复设置 | `PUT /settings {"showComposerButton":true}` | 复查 12 个键全部为原值（其余键本轮未改） |
| 终态复查 | `GET /prompts` → `count=1`（仅剩种子 `欢迎使用提示词增强`）；`GET /trash` → `[]`；`GET /tags` → `m3临时(count=0)`、`欢迎(count=1)`、`验收临时(count=0)`（均为验收前既有，`验收临时` 是上一轮残留，本轮未新增） | 与验收前一致 |

**已产生的副作用（不可逆，验收项本身要求）**

- 种子提示词用量被本轮改变：本轮可唯一归因的一次为第 9 行 `usageCount 7 → 8`、`lastUsedAt 1790263279771 → 1790263671193`（该变化是第 9 行验收项的要求，未回滚）。整轮结束时读到的终值为 `usageCount=9, lastUsedAt=1790263999710` —— 其中**有 1 次无法从本会话动作序列唯一归因**（本会话无对应点击；宿主同期存在其它工作区会话，可能为并发驱动/外部点击），已如实记录。`验收临时A`（终值 3）、`验收临时B`（终值 3）同样各有 1 次无法唯一归因的 +1。**对照实验已排除「重复计数」缺陷**：单次动作恒 +1（第 9 行 E 的 0→1），故本行不作为缺陷判定。
- 本轮**未**向会话发送任何消息（`Turn` 恒为 1，`userRowCount` 恒为 1）。
- 未修改仓库任何**源码/产物**文件：`git status --porcelain` 本轮仅 `M scripts/smoke.mjs`（重要 3 的修复）与本记录文件；未执行 `npm run build` / `build:dev` / `link-dsh-deps`，未重启任何服务。

## 遗留与移交（供后续里程碑）

1. **焦点归还（第 15 行，FAIL/Cancel 路径）**：宿主 `InputActions` 与 session 标准 props 均无公开 focus 面；插件侧在不违反 §7.3 的前提下无法修复 → **P5/P6 与用户重议**（接受「取消后需再点一次输入框」，或推动宿主为 session 插槽暴露 composer focus 动作）。
2. **反复提示的定时器语义（第 16 行附带观察）**：同文案 notice 不重跑定时器 → 若需「每次触发重新计时」，改 `{text, seq}` 状态（P5/P6）。
3. **P8 设置页**：必须**同批**处理 `showComposerButton` 与 `hashTriggerEnabled` 的即时生效（本行 17 的「重挂载生效」口径只覆盖 P4）。
