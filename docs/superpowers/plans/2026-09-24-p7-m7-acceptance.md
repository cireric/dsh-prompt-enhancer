# P7 / M7 活 GUI 验收记录（2026-09-24）

> **本文件与 `.superpowers/sdd/2026-09-24-p7-skill-export/task-5-constraints.md` 的 1–29 逐行对齐**（同顺序、同项数，不新增判定项、不合并）。
> 每条给「我做了什么 / 观察到什么」的**原文或数值**；确实不能跑的项在对应行内写 `NOT RUN — <原因> — 归属 <谁>`，并在「未完整验证」小节汇总，不静默缺席。
> 本任务**只做验证与记录，未改任何产品代码**（`src/**` / `scripts/**` / `lib/**` / `package.json` 一字未动；缺陷不修，写进报告由控制者裁定）。

## 环境与口径

- 被验收提交：**HEAD `5f4707e61b00303fb8bf08bfe33332839d9c0bce`**（= `5f4707e`，与复审对象一致）；验收开始与结束 `git status --porcelain` 均为空（本轮唯一新增的仓库内文件是本记录）。
- 宿主：`http://127.0.0.1:3080`（页面标题 `DSH Local Build`）；`document.documentElement.lang === "en"` ⇒ 全部断言取 en 文案。
- 驱动方式：Playwright（`browser_navigate` / `find` / `click` / `type` / `press_key` / `evaluate` / `console_messages` / `run_code_unsafe`）+ 只读或受控 HTTP（`curl` / `sqlite3 ...?mode=ro`）。
- **证据分层（明确区分，不混用）**：
  - **实测（本轮）**：下表所有 PASS 条目的数值/原文都来自本轮活页面与真实 HTTP。
  - **页面内 `fetch` 包装**：仅本页有效、刷新即复原。本轮装过五类——`POST /ai/skill-descriptor` 的定向 503、`POST /skills/export` 的延迟/合成 409、`GET /meta/pl:refined-dir:*` 的 12s 延迟、`DELETE /prompts/*` 的 503 失败信封；**每类都在收尾整页刷新后消失**（见 28）。
  - **页面内只读观察器**：`window.__reqLog`（记录 URL/method，不改行为）与 10ms 采样器 `window.__frames`（只读 DOM 文本/属性）。
  - **控制者已提供的强证据**：`npm run build` 后 porcelain 空、`dev_reload_package` 的 client ✓ 与 before/after [active]、以及 `lib/client.js` 的 sha256 —— 步骤 0 只做**独立复核**，不重做。
- 本轮**未发送任何聊天消息**：全文没有触发 composer 的发送路径（无 `submit`、未在 composer 内按 Enter；Enter 只落在按钮上）。
- 本轮**未触碰 `$DSH_HOME/profiles/**`**、未重启 `dsh web`、未跑 `npm install`、未改产品代码。

## 步骤 0：产物身份自证（活页面模块段 ≡ 本地 `lib/client.js`）

| 动作 | 来源 | 观察到什么 |
| --- | --- | --- |
| 本地产物 | `shasum -a 256 lib/client.js` | **`4ae5de0e9354e3fc82cadfc5b4b5e2337831e2938a9c314700e2dcc6328e770e`**（187141 个 UTF-16 码元 / 190223 字节；尾部 = `});\n\n//# sourceMappingURL=client.js.map\n`）——与控制者给的值逐字相同 |
| 活页面模块 URL | `performance.getEntriesByType('resource')` 过滤 `dsh-prompt-enhancer/client.js` | `/plugins/??dsh-mnemon-source-memory-spaces/client.js,…,dsh-super-injector/client.js,dsh-prompt-enhancer/client.js&rev=b9b8437ebfc5`（整段 **717943** 码元，我方模块**最后一个**） |
| 模块段切片 | 以 `window.__ModuleLoader__.load({\n  id: "dsh-prompt-enhancer",` 为起点（全段**命中 1 次**，startIdx=530395），终点 = 段内最后一个 `//# sourceMappingURL=`（717502） | 段长 **187107** 码元，尾 **`});\n;\n`**（宿主拼接分隔符 `;\n`） |
| 一致性命中 | 去掉宿主尾 `;\n` 后 187105 码元 | sha256 **`98278c039d7193b6d009a3de341f2c2b68ae3e1341ae52bbd9b08ac30bf87f54`** = `lib/client.js` 去掉尾部 `\n//# sourceMappingURL=…\n` 后的 sha **逐字相同** |
| 旁证 | 不去尾的整段 | sha256 `88716ace9b82d680fde761f03f929cc3a685ddbee2e2ab56afdb3d52640f093a` = 本地「去 sourceMappingURL + `;\n`」后的 sha **逐字相同** |

⇒ **本轮验收的确实是 HEAD `5f4707e` 的已提交产物**（两个方向都逐字命中）。**度量口径提醒**：必须按 UTF-16 码元切（bundle 含大量中文，码元数 ≠ 字节数），且必须去掉尾部 `//# sourceMappingURL=` 行——这两坑本轮各用一条独立命中交叉证明。

## 验收表 1–29

| # | 验收项 | 结果 | 证据（我做了什么 / 观察到什么） |
| - | ------ | ---- | -------------------------------- |
| **1** | 验收 15：导出（写盘 + frontmatter） | **PASS** | 侧栏入口 `[aria-label="Prompts"]` → 工具栏 `[data-prompt-enhancer-skill-open]` → 勾选 `M7acc Alpha skill export` → 真实点击「Fill names & descriptions with AI」（`POST /ai/skill-descriptor` 200；行内回显 `技能名：m7acc-alpha` + `m7acc-alpha — Exports and summarizes the M7acc Alpha skill content into a reusable, shareable reference for downstream use.`）→ 真实点击「Start export」⇒ 汇总 `Succeeded 1 · Failed 0`。落盘核对（bash）：`$DSH_HOME/skills/m7acc-alpha/SKILL.md` **存在**（372 字节），frontmatter 原文 = `---\nname: m7acc-alpha\ndescription: "M7acc Alpha summary for skill export"\nwhenToUse: "Use this skill when you need to export the M7acc Alpha material or produce an M7acc Alpha summary for skill export. It is intended for tasks that involve packaging or restating M7acc Alpha content in a transferable form."\n---` + 正文原样 ⇒ **三字段齐全**（`name` + `description` + `whenToUse`）。**口径说明**：description 取的是宿主兜底链的第一格（`summary`），故落盘值 = 该提示词的 summary，而非 AI 那段 description（AI 描述只在 summary 为空时进入——见 6 的后半，那里正是这个次序的正面证据）。 |
| **2** | 终局证据：官方真的发现它 | **PASS（两条独立通道）** | ① 官方技能工具直接加载：`skill(name:"m7acc-alpha")` → `provider=filesystem`、`resourceBase={"kind":"directory","path":"/Users/eric/.dsh/skills/m7acc-alpha"}`、`content` 返回该技能正文 —— 即**官方 skill-filesystem 已发现并可按名加载**。② 本会话的**活技能目录**在导出后新增条目：`- m7acc-alpha: M7acc Alpha summary for skill export`（此后每次重导/重写都随之更新：summary 清空后目录里变成 `M7acc Alpha body first line`，输出 Alpha 描述那次又变回 AI 描述）⇒ 目录 **watch** 也在工作。**技能名原文**（三例）：`m7acc-alpha` / `m7acc-bravo-fallback-line` / `m7acc-delta-conflict-case`。 |
| **3** | 结果汇总显示宿主回执的 `path` | **PASS** | UI 汇总原文：`✓ M7acc Alpha skill export → m7acc-alpha · Target file /Users/eric/.dsh/skills/m7acc-alpha/SKILL.md`；同一条宿主路由的裸回执（criterion 10 里 curl 过）：`{"name":"…","path":"/Users/eric/.dsh/skills/<name>/SKILL.md","prompt":{…}}` ⇒ **UI 显示值与宿主 `path` 逐字相同**。客户端不拼路径的旁证：`grep -c 'DSH_HOME\|dshHome' lib/client.js` = **0**，且 `skill-export.ts#pathMissing` 在回执缺 `path` 时显式判失败（源码 + 单测面）。 |
| **4** | 过期徽标 + 点重导后消失 | **PASS** | 对已导出的 Alpha 走真实编辑：详情页 `Summary` 输入框真实 `Meta+a` + `Delete` 清空 → 真实点击 `Save` ⇒ `role=status` 原文 `Saved`；随后列表/详情徽标原文 **`Skill is out of date`**（警示态）+ `Re-export` 按钮 1 个；HTTP：`updatedAt 1790312739472 > skillExportedAt 1790312686506`。真实点击 `Re-export` ⇒ `role=status` 原文 **`Re-exported (overwrote the same folder, no new folder created)`**，徽标回到 `Exported as skill m7acc-alpha`、`Skill is out of date` 消失、`Re-export` 按钮 **0** 个；HTTP `skillExportedAt 1790312751117 ≥ updatedAt 1790312739472`（`stale:false`）。 |
| **5** | 「未新增目录」的可执行证据 | **PASS（覆盖真的发生）** | `ls -1d $DSH_HOME/skills/*/ \| wc -l`：重导**前 5** → **后 5**（`ls -1` 逐名比对：dsh-plugin-dev / j-space / m7acc-alpha / memory-governance / osv-scan，无新增）。**且覆盖确实发生**：`SKILL.md` mtime **1790312686 → 1790312751**（变新）、sha256 **`8198f4d831d2be5f4852743aa6e6ec738ff67c4cf9d2aaff0c396900153b4c20` → `8bee5fe0f80aa24f4fd9e5a5badba093dd132adfedce67cc7df7f532dec95841`**、字节 372 → 445、`description` 内容由 summary 变为 AI 描述 ⇒ 三条独立变化都指向「同名同目录被重写」。同名覆盖的另两处复现：Bravo（6→6，mtime 变新）、Delta 的冲突确认重导（7→7）。 |
| **6** | 重导不得降级 frontmatter（R-P7-AA 活体） | **PASS（前后原文对照）** | **重导前** `cat`：`description: "M7acc Alpha summary for skill export"` + `whenToUse: "Use this skill when you need to export the M7acc Alpha material…"`；**重导后** `cat`：`description: "Exports and summarizes the M7acc Alpha skill content into a reusable, shareable reference for downstream use."`（= **AI 生成的 description**，因为 summary 已被清空） + `whenToUse: "Use this skill when you need to export the M7acc Alpha material…"` **逐字保留**。⇒ 两条都没丢。**没修会长什么样**（约束给的形态）在本轮恰好可判：summary 为空 + 不带 descriptor 时的落盘结果在 criterion 8 里实测到了——`description` 退化成正文首行且 `whenToUse` **整行消失**；R-P7-AA 的重导路径没有出现该形态。机制旁证：`meta` 里落了 `pl:skill-descriptor:810398a4-…` = 首次导出那份 `{name,description,whenToUse}`，徽标重导把它**原样回传**。 |
| **7** | 边界：刚导出完立刻看不得显示过期 | **PASS** | 首次导出成功后**立即**回到列表页读该行：`M7acc Alpha skill export…Exported as skill m7acc-alpha`（**无** `Skill is out of date`、`Re-export` 按钮 **0** 个）；HTTP `updatedAt 1790312607181 < skillExportedAt 1790312686506`（差 79325ms）。毫秒粒度属定义域，本轮**未当 bug 追**。 |
| **8** | 验收 17：无摘要也能导出（兜底链） | **PASS（按订正后的前置条件跑）** | ① 先导出 Bravo 一次（AI 命名）拿到 `skillName = m7acc-bravo-fallback-line`（落盘 description = 该条 summary）；② 详情页把 `Summary` 清空并 `Save`（正文首行原样保留）；③ 重进技能页勾选该条——行内 **`技能名：m7acc-bravo-fallback-line`**（名字来自 `prompt.skillName`，**本批没有点 AI**：`/ai/` 请求计数停在 2 不变）→ 真实点击「Start export」⇒ `Succeeded 1 · Failed 0`，同目录重写，`cat` 得 `description: "M7acc Bravo first non-empty line"`（= **正文首个非空行**）、`whenToUse` 行随之消失（本路径不带 descriptor，属预期）。**假缺陷警告已照办**：「从未导出、也没跑过 AI」的条目本轮**实测**报的是 `manager.skill.nameMissing`（原文 `This prompt has no skill name yet: run "fill names & descriptions with AI" first (or export it once)` + `kebab=""`）**而**不是 `descMissing` ⇒ **未据此报缺陷**。 |
| **9** | 验收 17：兜底全空被拒绝 | **PASS（走判据允许的「预置 skillName」分支 + 宿主侧 400 双证）** | `PUT /prompts/5381…` 置 `{"title":" ","body":"   ","summary":"","skillName":"m7acc-charlie-reject-empty"}`（= 判据括号里点名的另一条分支）→ 技能页勾选该条 → 真实点击「Start export」⇒ 行内红字原文 **`Summary, AI description, first body line and title are all empty — the host will refuse the export`** + detail `summary\|descriptor.description\|body[0]\|title all empty`；汇总 `Succeeded 0 · Failed 1`；`POST /skills/export` 计数**未增长**（= 请求根本没发出）。宿主侧独立复证：`POST /skills/export {"promptId":"5381…"}` → **HTTP 400** `{"ok":false,"error":"无法生成非空 description（summary / AI 描述 / 正文首行 / 标题 全为空），已拒绝导出"}`，且 `$DSH_HOME/skills/m7acc-charlie-reject-empty` **不存在**（目录数仍 6）。**判定注记**：判据里「先跑 AI 补全」那条前置在字面上**不可达**——AI 描述本身是客户端与宿主兜底链的一格（`resolveDescriptionForClient` 的 `descriptor.description`），跑过 AI 就永远清不到「全空」；故本轮走判据明确允许的另一分支（见「没能构造出的判据」）。 |
| **10** | 同名冲突：确认框出现 | **PASS（含取占位的替代通道，已披露）** | 顺序严格照判据：① **先**在技能页勾选 Delta + 真实点击 AI 补全，**从行内读到** `技能名：m7acc-delta-conflict-case`；② **再**让该路径上出现一个同名的、**不属于任何提示词**的目录；③ **最后**真实点击「Start export」⇒ 出现 `[data-prompt-enhancer-confirm]`，原文 `A skill folder with this name already exists` + `That folder belongs to no prompt of this plugin (it may be a skill you wrote by hand). Exporting will overwrite its SKILL.md.` + 明细 `M7acc Delta conflict case → m7acc-delta-conflict-case` + 宿主 409 原文 `技能目录 m7acc-delta-conflict-case 已存在，且不属于本插件的任何提示词（可能是你手写的技能）`，按钮 `Cancel / Confirm`。**取占位的替代通道（必须披露）**：本会话沙箱对 `$DSH_HOME` **不可写**（`mkdir` → `Operation not permitted`），故「手工建占位」改由**宿主进程**经产品自身路由完成：`POST /skills/export {"promptId":"<Echo>","name":"m7acc-delta-conflict-case"}` 写盘（内容为 Echo 的 frontmatter+正文，**可辨识**）→ 再 `PUT /prompts/<Echo> {"skillName":"","skillExportedAt":0}` 让它**交出归属** ⇒ `GET /prompts` 中 `owners-of-K = 0`（实测输出 `[]`），即判据要求的「同名目录已存在且不属于本插件任何提示词」这一**可观察条件**逐字满足。 |
| **11** | 确认 ⇒ 重试成功；取消 ⇒ 占位未被改写 | **PASS（两半都实测）** | **取消**：真实点击 `Cancel` ⇒ 汇总 `Succeeded 0 · Failed 0 · Skipped 1` + 明细 `– M7acc Delta conflict case · Skipped (the overwrite was not confirmed)`；占位文件**逐字节未变**（sha `a567423868a1e5953c3422180455c1622fbeab3cff34513f0912952696944fb3`、mtime `1790312864` 前后相同），Delta 的 `skillName` **仍未置位**，目录数 7 不变。**确认**：再次「Start export」→ 确认框再现 → 真实点击 `Confirm` ⇒ 汇总 `Succeeded 1 · Failed 0`、目标文件 = 同一路径；文件**被覆盖**（sha → `1e2beb53b8587269a1f1ceb2c950e81391125cfe5048864347ad9d4f827815b5`、mtime → `1790312878`、`description: "M7acc Delta summary"` + `whenToUse:` + Delta 的正文）、目录数 7 → 7；`POST /skills/export` 计数 5 → 7（= 一次 409 + 一次带 `conflictConfirmed` 的重试）。 |
| **12** | 顺序若反则不报 409（判据顺序说明） | **（说明项，非断言；机制已核实）** | 机制原文（`src/host/routes.ts:347`）：`const owner = store.listPrompts().find((p) => p.skillName === name)`，仅当 `owner` 存在且 **≠ 本条**时才 409。本轮**正向复现**了该说明的另一半：Delta 成为 `m7acc-delta-conflict-case` 的归属者之后，同一名字的再次导出（批量里的第 2/3 次、以及徽标重导）**都不再 409**，直接覆盖成功 ⇒ 与「先建占位再建库归属 ⇒ 宿主认成自己的」逐字同源。**未判缺陷**。 |
| **13** | AI 不可用时不阻断（503） | **PASS（两段观测，含一处披露）** | **① 行内红字 + 其余条目照常**：页面内 `fetch` 包装只对 body 含 `Echo` 的 `POST /ai/skill-descriptor` 返回 **503** `{"ok":false,"error":"mock 503 from page-side fetch interceptor"}` ⇒ Echo 行内出现红字 `AI completion failed` + 宿主原文 `mock 503 from page-side fetch interceptor`（附预检行 `This prompt has no skill name yet…`），**同批** Alpha 行照常拿到描述符 `m7acc-alpha-export — Exports the M7acc Alpha skill content for reuse and distribution.`。**② 其余条目仍能导出**：同一页再勾选 Alpha + Delta + Echo 点导出 ⇒ 计数 `POST /skills/export` 7 → **9**（失败项根本没发请求）、Alpha 与 Delta 均成功且 `skillName` 未变（同目录覆盖）、Echo 判 `manager.skill.nameMissing` ⇒ **Succeeded 2 / Failed 1**，目录数 **7 → 7**。**披露**：② 之前我**重进了一次技能页**——因为 ① 批里 AI 给 Alpha 起的名字是 `m7acc-alpha-export`（≠ 已有 `m7acc-alpha`），而技能页的预校验以 `descriptor.name` 优先，直接导出会**新建第 4 个临时目录**；重进清掉页内描述符后，该批的「不阻断」结论在同一批条目上仍然成立（Alpha/Delta 的成功即证），且零额外目录。 |
| **14** | 数据广播（**直接测事件，不用徽标**） | **PASS（决策性探针）** | 安装 `window.__n = 0; window.addEventListener('prompt-enhancer:data-changed', () => window.__n++)`（事件名见 `src/client/utils/data-sync.ts:17`；实测 `globalThis` 上确有 `addEventListener/dispatchEvent`）→ 勾选 Alpha+Delta+Echo 点导出（**2 条成功**）→ **立刻**真实点击「Back to the manager」离开技能页 → 等 3s 后读：`__n = 2`、`skillPageGone = 0`（已回到列表页）、`confirmPresent = false`。⇒ 「每条成功即广播」是**事件级**正面证据（修复前恒为 0），与「重挂重拉」可区分。 |
| **15** | 导出中离开（R-P7-X 要求 1/2/3） | **PASS（两轮，均含帧/事件计数）** | **Run A（每条请求延迟 6s，3 条）**：点「Start export」→ 页内睡 2.5s → 真实点击「Back to the manager」⇒ `POST /skills/export` 计数 **+1**（后两条**从未启动**）、`__n = 1`（**那唯一成功的一条是在离开之后 ~6s 才完成的，广播照样发生**）、`confirmPresent = false`、`skillPageGone = 0`。**Run B（第 2 条请求由包装延迟 6s 后返回合成 409）**：第 1 条成功（`__n = 1`）→ 我在第 2 条在途时离开 → 409 在离开之后到达 ⇒ **没有弹出任何无上下文的确认框**（`confirmPresent = false`，代码路径 `skill-export.ts:321` 的 `run.cancelled ⇒ declined`），第 3 条未启动（请求计数 +2）。**披露**：早期一轮因 MCP 每次点击的往返开销 ~2-5s（我原用 1.5s 窗口）导致「离开」发生在批次结束之后，读数失真（`__n=3`、请求 +3）；改用 6s 窗口并对齐时序后才得到上面的结论，失真那轮不作为证据。 |
| **16** | 作废路径（R-P7-AE；本轮新增判据 (d)） | **PASS（窄窗口成功构造，非 NOT RUN）** | 前置：Foxtrot 走**真实**写回播种（见 17），meta = `"refined"`。**基线复读**（不加延迟）：`Two bodies \| Original \| M7acc Foxtrot 原文草稿一号：这个东西不太好用，帮我改一下。 \| Refined draft`（与实际一致）。**注入 12s 延迟**到 `GET /meta/pl:refined-dir:<id>`，再进详情页：读数 `Two bodies \| Current body \| <body0> \| The other body`、`neutral: true`、`persisted: false`、切换按钮 **enabled**、`metaReads = 1` ⇒ 窗口确实存在且**读取中就是中性**。**在窗口内**真实点击「Swap the two bodies」⇒ 宿主完成 swap（`body` ↔ `sourceBody`），**meta 被写成空串**（`sqlite3` 读：`pl:refined-dir:ff6475e5…\|''`；`curl GET /meta/…` → `{"key":"…","value":""}`）。**重开详情页**（恢复原生 fetch、无延迟）：`Two bodies \| Current body \| 请帮我优化以下{{对象类型}}… \| The other body`、`neutral: true`、`persisted: false`、`colOfBody0 = "The other body"`（与真值一致）⇒ **要么中性、要么正确，未出现「标注自信而内容相反」**；迟到的读结果被丢弃（切换后再没有贴出错方向）。 |
| **17** | I-1 主链的**前置硬条件** | **PASS（前置按订正版满足）** | 主链用的提示词是**本轮新播种**的 `ff6475e5-b567-41a7-bc2a-b3da3291f400`：真实在 composer 键入草稿 `M7acc Foxtrot 原文草稿一号：这个东西不太好用，帮我改一下。`（`pressSequentially`，逐步断言 `AI polish` 由 disabled 变可用）→ 真实点击 AI 按钮 → 面板 `aria-label="AI polish result"` → 真实点击「One-click refine」（返回新标题/标签/摘要）→ 真实点击「Save to library」⇒ 面板 `Saved to library`；HTTP：新记录 `body` = 完善稿、`sourceBody` = 我的草稿（`aiRefined=true`、`createdAt 1790313279900`），**meta `pl:refined-dir:ff6475e5…` = `"refined"`** ⇒ 记录来自**方向真正可知的写回缝**（`ai-flow.ts#writeBackRefined` → `seedRefinedDirection`），**不是** P6 期切过奇数次的旧记录。 |
| **18** | 切一次 → 关面板 → 重开 → 整页刷新后方向仍在 | **PASS（含 HTTP 前后原文）** | **切换前** HTTP：`body = "请帮我优化以下{{对象类型}}…"`、`sourceBody = "M7acc Foxtrot 原文草稿一号：这个东西不太好用，帮我改一下。"`；两栏原文 `Refined draft \| <完善稿>` / `Original \| <body0>`；说明行 = `The direction is recorded with this prompt: close the panel and reopen it and the labels stay the same.`。真实点击「Swap the two bodies」→ **切换后** HTTP：`body = <body0>`、`sourceBody = <完善稿>`（对调），两栏原文 `Original \| <body0>` / `Refined draft \| <完善稿>`，meta → `"original"`。**关面板 → 重开编辑**：两栏与说明行**逐字相同**。**再整页刷新**（`page.goto`）→ 重开管理面板 → 编辑该条：`Two bodies \| Original \| <body0>` + 说明行仍在，meta 仍 `"original"` ⇒ **持久化成立，不是组件局部状态**。 |
| **19** | 按**文本身份**核对（不得只按左右位置） | **PASS** | 固定观测对象 = `body0`（切换前那个「原文」文本 = `M7acc Foxtrot 原文草稿一号：这个东西不太好用，帮我改一下。`）。**切换前**：`body0` 落在**右栏**，该栏表头 = `Original`（HTTP 同时证明 `body0` 在 `sourceBody`）。**切换后**：`body0` 落在**左栏**，该栏表头 = `Original`（HTTP 同时证明 `body0` 在 `body`，`isBody0InBody=true`）。**整页刷新后**：仍在左栏、表头仍 `Original`。⇒ 三次都用「哪一栏装着 body0」+「该栏表头」交叉核对，未用左右位置代替。 |
| **20** | 无记录的反面控制 | **PASS（两半）** | 造反面载体 Golf：`PUT /prompts/6b95ba77… {"body":"M7acc Golf body v2 ai-writeback","aiWriteBack":true}` ⇒ `sourceBody="M7acc Golf body v1"`、`aiRefined=true`，而 meta `pl:refined-dir:6b95ba77…` **无记录**（`value:""`，且 `select … like '%refined-dir%'` 无该行）。**前半**：重进管理面板后开详情页，两栏读数 = `Two bodies \| Current body \| M7acc Golf body v2 ai-writeback \| The other body \| M7acc Golf body v1` + 中性说明 `The host does not record which body is the original, so both are shown side by side; swapping exchanges them.`，`persisted:false` ⇒ **中性**（**没有**用 `aiRefined` 自信地标某一栏为原文——R-P7-AC 要消灭的形态未复现）。**后半**：真实点击一次「Swap the two bodies」⇒ 宿主照常对调（`body → "M7acc Golf body v1"`、`sourceBody → "M7acc Golf body v2 ai-writeback"`，`body0WentTo = sourceBody(right)`），而 **meta 仍无方向值**：`curl GET /meta/pl:refined-dir:6b95ba77…` → `{"value":""}`（该行是切换时「作废」写下的空串，不是方向值）；重开详情页仍是**中性**（`hasNeutral:true, hasPersisted:false`）。 |
| **21** | 三对浮层：AI 面板 × `#` / AI 面板 × 词库（0 帧同屏 + **正向**判据） | **PASS（两条路径，10ms 采样，含正向断言）** | **通用仪器**：页面内 10ms 采样器逐帧记录 `{claim, aria-expanded, hash 在屏, 词库面板在屏, AI 面板在屏}`（在屏判据 = 该面的标题文本确实出现在 composerStack 的已渲染子树里；React 门为假即卸载，故「在 DOM」= 「在屏」）。**路径 1（AI 面板 × `#` 浮层）**：AI 面板先在屏（`claim = "ai"`、`aiOn = true`、`aria-expanded = "false"`）→ **真实 `Shift+Tab` ×5**（逐步断言 `activeElement`：AI polish → Open the prompt library → Access mode… → Add files or run commands → **composer contenteditable**；全程无 pointerdown）→ **真实键入「空格 `#`」**（`page.keyboard.press(' ')` / `press('#')`）。**采样 510 帧**：`coexistHashAi = 0`；跃迁**单帧完成**（第 357 帧 `claim=ai, ai=true, hash=false`；第 358 帧 `claim=hash, hash=true, ai=false`）；**正向判据**：激活后 `#` 浮层在屏 **152 帧**（尾部仍是 `claim=hash, hashOn=true`），AI 面板在屏 **0 帧**，`aria-expanded` 全程 `"false"`（与词库面板的门一致）。**路径 2（AI 面板 × 词库面板）**：AI 面板在屏（`claim=ai`）→ **真实 `Tab` ×3**（Add files or run commands → Access mode… → **Open the prompt library**）→ **真实 `Enter`**。**采样 516 帧**：`coexistLibAi = 0`；第 260 帧 `claim=library, libOn=true, ai=false, **aria-expanded="true"**`；词库面板在屏 256 帧。⇒ 两对都**既不同屏、且该激活自己的面确实在屏**，`aria-expanded` 与渲染门同值。 |
| **22** | 压力路径：浮层在屏时键盘激活 AI 按钮 | **PASS（前后两半）** | **前半**：`#` 浮层在屏（`claim=hash`、`hashOn=true`、`aria=false`）时，用**键盘**激活 AI 按钮（真实 `Tab` ×4：Add files → Access mode → Open the prompt library → **AI polish**，再真实 `Enter`；全程无 pointerdown）⇒ **914 帧采样**：`hashFrames = 914`（`#` 浮层**一帧都没被压掉**）、`aiFrames = 0`、`coexist = 0`、`claims = ["hash"]`。**后半**：删掉令牌（对 composer 施加一次**程序化 `focus()`**（非指针，已披露）+ 真实 `Meta+a`/`Delete`）⇒ claim 由 `hash` 转 `ai`，**AI 面板出现**：composerStack 内出现 `[role="dialog"][aria-label="AI polish"]`、内容 `Calling AI…`（该次键盘激活发起的真实 `/ai/polish` 正在跑）⇒ 「屏一空出来就自己取回」成立。 |
| **23** | R60 回归（唯一正向证据）：真实指针点击，down→up 0/5/10ms | **PASS（三档全开）** | 每档前置都先确认 `#` 浮层在屏（`hashOn=true, libOn=false, aria=false, claim=hash`），再用**真实指针**（`page.mouse.move` → `down` → 等待 N ms → `up`，trusted 事件）点词库按钮中心 `(661, 643)`：**0ms** ⇒ `hashOn=false, libOn=true, **aria="true"**, claim="library"`；**5ms** ⇒ 同上；**10ms** ⇒ 同上。⇒ 三档都**开面板**（收起与取屏落在同一次渲染批的正面证据）。**工具面注记（非产品缺陷）**：MCP 的 `browser_click` **静默吞掉 `delay` 参数**（传 `{delay:5}` 生成的代码是 `locator.click()`，无 `{delay}`），故 down→up 间隔只能经 `browser_run_code_unsafe` 的 `page.mouse` API 取得（见 O-2）。 |
| **24** | R57：键盘路径不置位、不延后兑现 | **PASS** | `#` 浮层在屏时（`claim=hash, aria=false, hashOn=true`），真实 `Tab` ×3 到 `Open the prompt library`（逐步断言 `activeElement`），再**真实 `Enter`**（`detail=0` 的键盘通道）⇒ 之后读数：草稿不变、`claim` **仍是 `hash`**、`aria-expanded` **仍是 `"false"`**、词库面板**不在屏**、无确认框 ⇒ **不置位**（连 `open` 都没写）。再清空令牌 ⇒ 词库面板**仍未出现**（`libOn=false, aria="false"`；此时 claim 转 `ai`、出现的是 AI 面板）⇒ **不延后兑现**。 |
| **25** | a11y：技能页在场时四页签无 `[selected]`，tabpanel 名 = 技能页标题 | **PASS（快照 + 内联 style 双通道）** | 技能页在场时的可访问性快照（`browser_find`）：`tablist "Prompt manager"` 下为 `tab "List"`、`tab "Tags"`、`tab "Trash"`、`tab "Import & export"` —— **四个都没有 `[selected]`**；其下 `tabpanel "Export as skills"` ⇒ tabpanel 的**可访问名 = 技能页标题**。DOM 同值（四个 `aria-selected="false"`）；**内联 style** 四个都是非激活态 `color: var(--dsw-alias-text-secondary, #6b7280); background: transparent; border: 1px solid var(--dsw-alias-border-secondary, #e5e7eb)` ⇒ 视觉与读屏说同一件事（快照判不了激活样式，故另取内联 style）。**返回后**：快照为 `tab "List" [selected]`（另三个无 `selected`）+ `tabpanel "List"`，且 List 的内联 style 是激活态 `color: var(--dsw-alias-text-accent, #2563eb); background: var(--dsw-alias-bg-hover, rgba(0,0,0,0.04))`。 |
| **26** | 回归 P6 四项 | **PASS（4/4）** | **C1 关闭态零遮挡**：全部面关闭时 `[data-prompt-enhancer-manager]` = **0**、`[data-prompt-enhancer-confirm]` = **0**、`[role="dialog"]` = **0**、`[data-prompt-enhancer-claim]` = `"none"`；对会话正文节点 `[data-conversation-scroll] p:has-text("上手引导收到了")` 做**真实 Playwright 点击** ⇒ **成功返回**（actionability 全过）。**C3 沉淀一步到位**：真实键入草稿 `M7acc C3 一步到位草稿：把这段整理成三条要点。` → 真实点击词库按钮开面板 → 真实点击 `[aria-label="Save current draft as prompt"]` ⇒ **无需再点「新建」**：管理面板直接处于新建详情态（`role="listitem"` 计数 **0**、按钮集 `[… Close, Back to list, Save]`），`textarea[aria-label="Body"].value` **逐字 === 该草稿**、`Title` 为空（预填只带正文）——随后点「返回列表」**未保存**（不留临时数据）。**C4② 重选同文本浮层再现**：对真实助手文本节点做合成拖选（`pointerdown` → 真实 `Selection` 设 offset 0..7 → `pointerup`，按 P6 的披露口径）⇒ 浮出按钮出现、rect `[435,206,103,24]`；**真实点击**该按钮 ⇒ 浮出按钮立即消失、管理面板直接进新建详情态且 `Body === "上手引导收到了"`（选区原文）；返回列表 → 关面板 → 清空选区（此时按钮**计数 0**）→ **再次拖选同一节点的同一区间** ⇒ 按钮**再次出现**、rect 与首次**完全相同** `[435,206,103,24]`（无「静默不出现」）。**C9 删除失败列表仍在**：页面内 `fetch` 包装让 `DELETE /prompts/:id` 返回 **HTTP 503** + **不带 `data`** 的失败信封 `{"ok":false,"error":"mock 503 delete from page-side fetch interceptor"}`（拦截计数 = **1**，证明请求确实被拦下）；对 `M7acc Bravo fallback line` 行真实点击 `Delete` ⇒ `role="list"` **仍在**、该行**仍在**、总行数 **9 → 9**；行内 `role="alert"` 原文 `Failed to deletemock 503 delete from page-side fetch interceptor`（= en `error.delete` + 宿主原文，两部分都在）；该 alert **不含** `Failed to load`/`加载失败`。 |
| **27** | 零 console error（warning 一并报告） | **PASS** | **干净整页重挂载后**：`browser_console_messages` ⇒ `Total messages: 1 (Errors: 0, Warnings: 0)`；`level=error` → **0 条**；`level=warning` → **0 条**。唯一一条是 `[INFO] [genui] client active; fence-channel=dom`（**非本插件**）。**本轮刻意制造、逐条可归因的异常**：① 两次真实 **409**（criterion 10 与 11 的同名冲突探针；Playwright 事件日志在该页加载内累计到 `2 errors`，均为 `Failed to load resource: 409`，属被验收行为本身）；② 一条 `[WARNING] [prompt-enhancer] 删除提示词失败 ApiError: mock 503 …`（criterion 26 C9 的注入，是「错误必须可见」的设计行为：`console.warn` + 面内 `role="alert"` 同时可见）。除上述外**无未捕获异常、无加载错误**。 |
| **28** | 快照-复原与不可逆变化复查 | **PASS（数据零损失）／ `$DSH_HOME/skills/` 未复原（沙箱不可写，见下）** | 逐项前后对照见「临时数据与副作用」。摘要：`GET /prompts` **逐字段等于验收前**（仅 1 条种子）、`/trash` = `[]`、`/tags` = `[{"name":"欢迎","count":1}]`（AI 顺带建的 `内容优化` 已删）、`/settings` 13 键逐一相等、`meta` 两条原有行相等。**页面内注入全部随整页刷新消失**（`__origFetchPE/__reqLog/__o5/__frames/__si/__mode` 六个全局实测均 `undefined`）。**两处未复原（如实披露）**：① `$DSH_HOME/skills/` **4 → 7**：3 个临时技能目录**删不掉**（`rm -rf …` → `Operation not permitted`；本会话沙箱在 `$DSH_HOME` 下 `mkdir` 同样被拒，且**不得提权**）⇒ 精确清理命令见「遗留与移交」；② `meta` 多出 **6 行空值**（无 API 可删行）。**不可逆变化 = 3 个技能目录 + 6 个空值 meta 行（均为文本/目录，不含任何既有数据）**；**用户既有数据零损失**。 |
| **29** | 记录写进本文件（格式照 P6） | **PASS** | 本文件 = `docs/superpowers/plans/2026-09-24-p7-m7-acceptance.md`，逐项结论 + 原始数值 + NOT RUN 汇总 + 已知限制 + 不可逆变化复查齐备；`docs/**` 其余部分未改，`src/**`/`scripts/**`/`lib/**`/`package.json` 未改，`$DSH_HOME/profiles/**` 未碰，`dsh web` 未重启。 |

## 未完整验证 / 无法判定的项（NOT RUN 汇总）

| 项 | 状态 | 原因 | 归属 |
| - | ---- | ---- | ---- |
| 判据 9 的「**先跑 AI 补全**」分支 | **无法构造 — 该分支按字面不可达 — 归属 T5（控制者裁定是否改判据文字）** | AI 描述本身是兜底链的一格（客户端 `resolveDescriptionForClient` 与宿主 `resolveDescription` 的候选都含 `descriptor.description`）：跑过 AI 之后，清空 summary/正文/标题**仍然**有候选 ⇒ 永远到不了 `descMissing`。本轮走判据括号里明确允许的另一分支（**预置 skillName**）实测通过，并另用宿主 400 复证「兜底全空必被拒」。 | T5 判据措辞 / P8 如需 |
| 判据 12 | **说明项，非断言**（按判据原文「不是缺陷」处理） | 判据自身写明这是「判据顺序问题」；本轮核实了机制并正向复现了「有归属则不再 409」的一半。 | — |

**没有其他 NOT RUN**：判据 1–11、13–28 全部在本轮实测（其中 16 的窄窗口、23 的三档间隔、14/15 的事件计数都是**构造成功**的）。

## console / 网络异常

- **干净页（收尾整页刷新后）**：`Total messages: 1 (Errors: 0, Warnings: 0)`；`level=error` 0 条、`level=warning` 0 条；唯一一条为 genui 的 INFO。
- **本轮刻意制造的异常（逐条可归因）**：2 次真实 **409**（同名冲突确认框的探针：criterion 10 / 11 各一次；Playwright 事件日志显示该页加载内 `Console: 1 errors` → `2 errors`，均为 `Failed to load resource: 409`）+ 1 次合成 **503**（criterion 26 C9 的 `DELETE /prompts/*` 注入，触发插件自身的 `console.warn`，属「错误必须可见」的设计行为）+ 2 次合成 503/409 的 `POST /skills/export`（criterion 13 / 15 的注入，未产生 console 噪声）。
- **AI 相关**：本轮共发起 **6** 次真实 `/ai/skill-descriptor`（1 次预热探针经 curl + 5 次经 UI）、**2** 次 `/ai/polish`、**1** 次 `/ai/refine`，全部 200；`$DSH_HOME/prompt-enhancer/log/` **前后一致**（仍只有 `ai-2026-09-24.log`，628 字节、mtime 未变）⇒ AI 调用**未在宿主目录留下新文件**。
- **宿主侧**：本轮**未**执行 `dev_reload_package`（用控制者已提供的证据），不碰 profile、不重启 `dsh web`；页面加载后无 `unresolved require` / `Cannot find module` 迹象，五个座位与全部 HTTP 路由工作正常。

## 缺陷与观察（如实记录；本任务不修产品代码，由控制者裁定）

| ID | 类型 | 内容 | 期望 / 实际 | 定位线索 |
| -- | ---- | ---- | ----------- | -------- |
| **D-1** | **观察（中）——两条导出路径的「同名覆盖」语义不一致** | 技能页的导出以 `descriptor.name` **优先**于 `prompt.skillName`（`skill-export.ts#precheckExport` 的 `descriptor?.name ?? prompt.skillName`，且 `SkillExportModal` 会把该名字**显式**发给宿主）。于是对**已导出**的条目在技能页点一次「AI 补全名称与描述」再导出：AI 一旦给出不同的名字，就会**新建目录**并把 `skillName` 指过去，**旧目录从此无主**（后续对旧名的导出会按「不属于本插件」409）。 | 期望：同一产品里「重新导出」应只覆盖同名目录（徽标路径确实如此：`reExportSkill` 只带 `promptId`，命中 `prompt.skillName`）。实际（本轮实测）：Alpha 已有 `m7acc-alpha`，AI 在技能页给它 `m7acc-alpha-export`；若直接导出就会新建第 4 个目录（本轮为把临时目录压到最少而**回避**了这一步，改走重进技能页清空页内描述符再做批量）。**未判为判据失败**（判据 1/15 未要求这条语义），如实上报由控制者裁定。 | `src/client/utils/skill-export.ts#precheckExport`（`descriptor?.name ?? prompt.skillName`）+ `SkillExportModal.tsx`（`name: request.name` 显式下发）+ `src/host/routes.ts:343`（`body.name ?? descriptor?.name ?? prompt.skillName`） |
| **O-1** | **观察（数据卫生，计划已接受的取舍）** | **meta 行没有删除通道**：`store.deletePrompt` 只做软删（`DELETE FROM prompts WHERE id = ?`，见 `store.ts:546`），不清 meta；路由只提供 `GET`/`PUT /meta/:key`（`routes.ts:320-328`），**无 DELETE**。于是「删除提示词」会永久留下 `pl:refined-dir:<id>` / `pl:skill-descriptor:<id>` 残键。计划 TBD-P7-2 已明写「接受少量残键」，但**验收 28 的「meta 逐项等于验收前」在字面上与它冲突**（本轮用 `PUT {value:""}` 把值清空，行仍在）。 | 期望：要么删提示词时顺手清键，要么给一个清键通道。实际：本轮残 6 行空值（见 28）。 | `src/host/store.ts:546`（未清 meta）+ `src/host/routes.ts:320-328`（无 DELETE） |
| **O-2** | 观察（工具面，非产品缺陷） | **两处 MCP / 沙箱限制**：① `browser_click` **静默吞掉 `delay` 参数**（传 `{target, delay:5}` 生成的代码是 `locator.click()`，无 delay），故 R60 的 down→up 间隔只能经 `browser_run_code_unsafe` 的 `page.mouse.down()/waitForTimeout/up()` 取得；② 本会话沙箱对 `$DSH_HOME` **既不可写也不可删**（`mkdir`/`rm -rf` 均 `Operation not permitted`，审批已禁用、不得提权），因此（a）判据 10 的「手工建占位」改由宿主经产品路由落地，（b）3 个临时技能目录**无法删净**。 | 本轮工具/沙箱行为实测 | 判据 10 / 23 / 28 |
| **O-3** | 观察（副作用，已披露） | **AI「存入词库」会顺带建一个标签**：`libraryCreateInput` 取 `refined.tags.slice(0,1)`，本轮 AI 返回 `内容优化` ⇒ `GET /tags` 一度多出 `内容优化(1)`；收尾已 `DELETE /tags/内容优化`（回执 `{"deleted":true,"inUse":0}`），最终与验收前**逐字相等**。 | 属设计行为（标签随正文一起沉淀），只是验收需要清理 | `src/client/utils/ai-flow.ts#libraryCreateInput` |

## 临时数据与副作用

> 纪律：先快照 → 造 → 用完删 → 清回收站 → 恢复 tags/meta → 收尾逐项复查并给前后对照。

**验收前 / 验收后快照（逐项对照）**

| 端点 | 验收前（原文） | 验收后（原文） | 判定 |
| ---- | ------------- | ------------- | ---- |
| `GET /prompts` | 1 条：`66a4114f-6299-4309-a701-8af4379abdd5` `欢迎使用提示词增强`，`usageCount=11`、`lastUsedAt=1790300582270`、`createdAt=updatedAt=1790256837615`、`tags=["欢迎"]`、`aiRefined=false`、`skillExportedAt=0` | **同 1 条、逐字段相等** | **相等** |
| `GET /trash` | `{"ok":true,"data":[]}` | `{"ok":true,"data":[]}` | **相等** |
| `GET /tags` | `[{"name":"欢迎","count":1}]` | `[{"name":"欢迎","count":1}]` | **相等**（中途由 AI 顺带产生的 `内容优化(1)` 已删除） |
| `GET /settings` | 13 键（`panelWidth:420` … `maxPromptCount:300`、`aiProvider:""`、`aiModel:""`） | **13 键逐一相等**（全程未改设置） | **相等** |
| `GET /meta/pl:template-var-memory` | `{"target":"日语","主题":"量子计算"}` | **逐字相等**（本轮未用模板变量） | **相等** |
| `meta` 表其余行 | 只有 `pl:template-var-memory` + `schemaVersion='2'` | 上述两行相等；**多出 6 行空值**：`pl:refined-dir:<6b95ba77…>`、`pl:refined-dir:<ff6475e5…>`、`pl:skill-descriptor:<001b3733…>`、`pl:skill-descriptor:<810398a4…>`、`pl:skill-descriptor:<b3792ed9…>`、`pl:m7acc-probe-tmp`（**全部 `''`**，经产品自身 `PUT /meta/:key {"value":""}` 清空） | **不相等（行数 +6，值全空）** — 见 O-1 |
| `$DSH_HOME/skills/` | 4 个目录：`dsh-plugin-dev` / `j-space` / `memory-governance` / `osv-scan`（`ls -1d */ \| wc -l` = **4**） | **7 个**：上述 4 个 + `m7acc-alpha` / `m7acc-bravo-fallback-line` / `m7acc-delta-conflict-case`（`wc -l` = **7**；`rm -rf` 实测被沙箱拒绝，输出 6 条 `Operation not permitted`） | **未复原** — 见 28 / 遗留 1 |
| `$DSH_HOME/prompt-enhancer/log/` | `ai-2026-09-24.log`（628 字节，mtime Sep 24 23:18） | **完全相同**（未新增 AI 日志文件） | **相等** |
| composer 草稿 | 空（`innerText === ""`） | 空（`innerText === "\n"`，收尾已清） | **等义**（会话内临时 UI 状态，如实记录） |
| 页面内注入 | — | 整页刷新后 `__origFetchPE`/`__reqLog`/`__o5`/`__frames`/`__si`/`__mode` 均为 `undefined` | **已消除** |
| 是否发送过消息 | — | **没有**（无 `submit`、未在 composer 内按 Enter；Enter 只落在按钮上） | — |
| 代码 / 产物 | — | 未改 `src/**`、`scripts/**`、`lib/**`、`tests/**`、`package.json`；未跑 `npm run build`（用控制者已确认的产物）；`git status --porcelain` 收尾为空（本记录除外） | — |

**本轮造过并已全部清除的临时数据**

| 动作 | 对象 | 结果 |
| ---- | ---- | ---- |
| 载体 A（验收 15/16/13/14/15） | `810398a4-da78-48dd-8fe3-a630e0c85f4e` `M7acc Alpha skill export` | 软删 + 清空回收站 → 已物理删除；其技能目录 `m7acc-alpha` **残留**（沙箱不可删） |
| 载体 B（验收 17 兜底链） | `001b3733-f022-437c-9a06-8aaf6af4d543` `M7acc Bravo fallback line` | 同上；目录 `m7acc-bravo-fallback-line` **残留** |
| 载体 C（兜底全空） | `5381901a-4f87-4bb3-b40a-89f0e776e750`（title 置为空格） | 已物理删除；**未生成**技能目录（导出被拒） |
| 载体 D（同名冲突） | `b3792ed9-42f9-4695-a913-f22dbb33f323` `M7acc Delta conflict case` | 已物理删除；目录 `m7acc-delta-conflict-case` **残留** |
| 载体 E（AI 503 对照 / 占位写入者） | `73d03f13-8045-4291-9871-4d527b49a542` `M7acc Echo never exported` | 已物理删除（其 `skillName` 在判据 10 里被清空过，属本轮构造） |
| 载体 F（I-1 主链） | `ba5292cf-798d-4205-8466-e9814483a1c4` `M7acc Foxtrot direction c` | 已物理删除 |
| 载体 G（无记录反面控制） | `6b95ba77-70b3-45fe-b2dc-b711ef049329` `M7acc Golf direction cont` | 已物理删除 |
| AI 沉淀（I-1 播种，真实写回路径产生） | `ff6475e5-b567-41a7-bc2a-b3da3291f400` `优化不好用的内容` | 已物理删除 |
| 标签 | `内容优化`（AI 沉淀顺带产生） | `DELETE /tags/内容优化` → `{"deleted":true,"inUse":0}` |
| 探测键 | `pl:m7acc-probe-tmp`（验证 `PUT /meta` 是否接受空串） | 已清空为 `''`（行保留，见 O-1） |
| 技能目录 | `m7acc-alpha` / `m7acc-bravo-fallback-line` / `m7acc-delta-conflict-case` | **未能删除**（本会话沙箱 `Operation not permitted`）——清理命令见「遗留与移交」 |
| 页面内注入 | 5 类 `fetch` 包装 + 采样器 + 计数器 | **整页刷新后全部消失**（实测六个全局均为 undefined） |

## 假设清单（本任务无法向人提问，按最强证据自定，显式列出）

1. **「手工建占位」的替代通道（判据 10）**：本会话沙箱对 `$DSH_HOME` 不可写（`mkdir` 实测 `Operation not permitted`，审批禁用、不得提权），故改用**宿主进程**经产品自身路由 `POST /skills/export` 写入同名目录，再让该提示词 `PUT {skillName:""}` 交出归属 ⇒ 判据要求的**可观察条件**（同名目录在盘、且不属于本插件任何提示词）实测成立（`owners-of-K = 0`）。占位内容可辨识（Echo 的 frontmatter + 正文），故「取消后未被改写」可由 sha 逐字证明。
2. **浮层「在屏」的判据**：三个面的渲染门为假时 React **卸载**该面（源码：`if (token === null \|\| !onScreen) return null` / `{aiVisible && …}` / `{panelOpen && …}`），故「该面的标题文本出现在 composerStack 的已渲染子树」= 「在屏」。采样器每 10ms 读一次该子树，不触发任何布局写入。
3. **「真实按键」的口径**：`Shift+Tab`/`Tab`/Space/`#`/Enter/`Meta+a`/`Delete` 全部经 `page.keyboard.press`（trusted 键盘事件）；进入 composer 的焦点只经**键盘 Tab/Shift+Tab**（逐步断言 `activeElement`）或一次**程序化 `focus()`**（无 pointerdown，用于判据 22/23/24 中「不能引入 pointerdown」的场合，已在对应行披露）。判据 21/24 的两条路径**全程无程序化 focus**。
4. **R60 的 down→up 间隔**：MCP `browser_click` 吞 `delay`，故用 `browser_run_code_unsafe` 里的 `page.mouse.move/down/waitForTimeout(N)/up` 取得真实指针序列（坐标 = 词库按钮中心 `(661,643)` 的真实 `getBoundingClientRect` 值）。
5. **判据 13 的两段观测**：① 与 ② 之间重进过一次技能页（理由见该行披露：AI 非确定性改名会让第 4 个临时目录出现）。② 的「其余条目仍能导出」是在同一批条目（Alpha/Delta/Echo）上实测的。
6. **判据 15 的时序**：MCP 每次点击的往返开销 2–5s，故把注入延迟设为 6s 以覆盖「离开」动作；早期用 1.5s 窗口的那轮**读数失真已作废**（该行已披露）。
7. **技能目录的清理**：`rm -rf` 被沙箱拒绝后**未尝试任何绕道**（不提权、不改用其它进程写宿主目录）——这是策略性拒绝，按纪律上报控制者处置。

## 遗留与移交

1. **必须由控制者/用户执行的一条清理命令**（本会话沙箱无权限，已实测）：
   ```sh
   rm -rf "$DSH_HOME/skills/m7acc-alpha" "$DSH_HOME/skills/m7acc-bravo-fallback-line" "$DSH_HOME/skills/m7acc-delta-conflict-case"
   ls -1d "$DSH_HOME"/skills/*/ | wc -l   # 应为 4（dsh-plugin-dev / j-space / memory-governance / osv-scan）
   ```
   执行后 `$DSH_HOME/skills/` 即完全复原。**除此之外本轮无其他不可逆变化**（用户既有数据零损失）。
2. **meta 残键（O-1）**：如需逐字节复原 meta 表，请在**停止 `dsh web` 后**执行（本轮**未**代为执行，因为写入宿主目录超出本任务被授权的范围）：
   ```sql
   DELETE FROM meta WHERE key IN (
     'pl:refined-dir:6b95ba77-70b3-45fe-b2dc-b711ef049329','pl:refined-dir:ff6475e5-b567-41a7-bc2a-b3da3291f400',
     'pl:skill-descriptor:001b3733-f022-437c-9a06-8aaf6af4d543','pl:skill-descriptor:810398a4-da78-48dd-8fe3-a630e0c85f4e',
     'pl:skill-descriptor:b3792ed9-42f9-4695-a913-f22dbb33f323','pl:m7acc-probe-tmp');
   ```
   但**更值得做的是产品侧的决定**：给「删提示词」补一条清键路径，或给 meta 一个删除通道（否则任何用户删掉一条 AI 写回过的提示词都会留下两条残键，永不自清）。
3. **D-1（两条导出路径的覆盖语义不一致）**：请控制者裁定——是「技能页也应以既有 `skillName` 为准（AI 名字只作提示）」，还是「技能页按 AI 名字另建目录是预期语义」。本任务未改代码。
4. **判据 9 的措辞**：请把「先跑 AI 补全（或预置 skillName）」收窄为**只有「预置 skillName」可行**（或明确写出「跑过 AI 后需同时清掉描述符」），否则下一位执行者会照字面撞上不可达分支（本轮已实测）。
5. **R-P7-AA / R-P7-AE 的活体证据已收齐**：重导不降级 frontmatter（判据 6）、方向作废路径（判据 16）都在本轮**构造成功**，可作为后续回归用例的可复现路径（步骤已逐字写在表内）。

---

## 控制者裁定与收尾（2026-09-25，验收执行者之后）

**总判：M7 活体验收通过**（PASS 27 · PARTIAL 1 · FAIL 0 · NOT RUN 0）。唯一 PARTIAL 是**环境残留**而非产品判定（见下「未处置项」），产品面 0 FAIL。执行者的产物身份自证被接受（活页面模块段按 UTF-16 码元切片、去掉尾部 `;\n` 后与本地 `lib/client.js` 的 sha 逐字相同 ⇒ 验的是已提交产物）。

### 对执行者上报 5 项的处理

1. **O-1（meta 残键无删除通道）——裁定：产品侧应补清键路径，并入 T6。** 现状（删提示词不清 meta + meta 路由只有 GET/PUT）会让**任何用户**删掉一条 AI 写回过的提示词都留下两条永久残键。T6 的做法：给 meta 一个删除通道（如 `DELETE /meta/:key`）**或**在**不可逆**删除点（purge / 清空回收站）清 `pl:refined-dir:<id>` 与 `pl:skill-descriptor:<id>`。**约束**：**不得**在**软删除**（进回收站）时清——回收站可恢复且**复用同一 id**，清键会让「删除 → 恢复」重演 I-1（T4 修复轮 1 已论证，见本记录判据相关段）。
2. **D-1（两条导出路径的覆盖语义不一致）——裁定：技能页也应以既有 `skillName` 为准，AI 名只作首次导出的候选。并入 T6 且为其中第一项。** 理由：现状下对**已导出**条目走「技能页 → AI 补全 → 导出」，若 AI 换名就**新建目录**并把 `skillName` 指过去，**旧目录从此无主**（后续对旧名 409）——这是**用户可见且不可见兼有**的损害（目录泄漏 + 旧名冲突），且它是**常规流**（徽标的意义就是提示「改了就重导」）。判为需修的**产品缺陷**，不是取向问题。
3. **判据 9 的措辞——裁定：按执行者建议收窄。** 正确表述：「**兜底全空被拒绝**：**预置 `skillName`**（或先导出一次拿到 `skillName` 后**同时清掉描述符 meta**）→ 再清空 summary / 正文 / 标题 ⇒ 导出被拒绝并给明确错误。」原因：**AI 描述本身就是兜底链的一格**（客户端与宿主的候选都含 `descriptor.description`）⇒ 跑过 AI 后无法清到「全空」，字面分支**不可达**。该错误措辞出自控制者的 T5 约束，记入控制者失误。
4. **判据 12（顺序反了不会 409）**——接受为**判据顺序问题**，非缺陷；执行者正向复现了「有归属则不再 409」的一半，机制解释成立。
5. **判据 28 的字母需要更正**：数据面**已完全复原**（`prompts/trash/tags/settings/meta` 原有行逐项相等、页面注入全消、草稿回空）。两处**字面**未达而**实质**成立：**(a)** meta 里被本轮的清空操作写下了 **6 行空值**（用**产品自身**的 `PUT {value:""}` 清空 ⇒ 与「从未写过」在读取面上同源，见 T4 复审的跨层核实）——它们**不是**新增语义数据，但**行数**不是逐字节复原；**(b)** `$DSH_HOME/skills/` **4 → 7**（见下）。

### 未处置项（需要用户执行或授权）

**`$DSH_HOME/skills/` 下 3 个临时技能目录未能删除**（`m7acc-alpha`、`m7acc-bravo-fallback-line`、`m7acc-delta-conflict-case`）：
- 执行者的会话沙箱对 `$DSH_HOME` **既不可写也不可删**（`mkdir`/`rm` 均 `Operation not permitted`，**未绕道**）。
- 控制者两次以 `sandbox_permissions: danger-full-access` 就地升级（同一命令、最小充分范围）**均挂住等授权并超时**（各 600 秒，当时无可用的授权应答者）⇒ 按纪律**停止重试、不绕道**，转为如实登记。
- **待用户执行**（一条命令，预期结果 **7 → 4**）：

```bash
rm -rf "$DSH_HOME/skills/m7acc-alpha" "$DSH_HOME/skills/m7acc-bravo-fallback-line" "$DSH_HOME/skills/m7acc-delta-conflict-case"
ls -1d "$DSH_HOME"/skills/*/ | wc -l   # 应为 4
```

- **副作用可见性**：这 3 个目录会被官方 skill-filesystem 当成**真实技能**发现（本会话的技能清单里已出现 `m7acc-alpha` / `m7acc-bravo-fallback-line` / `m7acc-delta-conflict-case`）⇒ 在删除前，任何会话的技能列表都会多出这 3 项。它们同时也是**导出功能真的被官方发现**的活证据。

### 通过的判据里，三个「正向/终局」证据（防止「射程夸大」）

- **判据 2/3（官方真的发现）**：走宿主 `skill` 工具**按名加载**成功（`provider=filesystem`、`path=/Users/eric/.dsh/skills/m7acc-alpha`），且活技能目录随三次导出同步更新 ⇒ 不只验「文件存在」。**另**：`grep -c 'DSH_HOME\|dshHome' lib/client.js` = **0** ⇒ 客户端确实没有自拼宿主路径。
- **判据 5（覆盖真的发生）**：目录数 5 → 5 **且** `SKILL.md` 的 **mtime + sha + 字节数三者都变** ⇒ 排除「什么都没发生也给不变计数」。
- **判据 14（数据广播）**：**离开技能页之后**读事件计数器 `__n = 2`（2 条成功导出）⇒ 不依赖徽标（技能页在场时三个订阅者全卸载、挂载即重拉，徽标分不清「广播了」与「重挂重拉」）。
- **判据 21（两对浮层）**：路径 1（AI 面板 × `#` 浮层）510 帧 **coexist = 0**，跃迁是**单帧**（357 帧 claim=ai → 358 帧 claim=hash）；路径 2（AI 面板 × 词库面板）516 帧 **coexist = 0**，第 260 帧 claim=library + `aria-expanded="true"` + 词库面板在屏 ⇒ I2-1/I2-2 **实测收口**（且给的是「该激活的面在屏」而非只给「不同屏」）。
- **判据 16（R-P7-AE 的活体证据）**：12s 延迟 `getMeta` 的窄窗口**构造成功** ⇒ 窗口内中性且按钮可用 → 窗口内切换 → meta 被写**空串**（sqlite3 佐证）→ 重开**中性/正确**，无「自信而相反」。

---

## ⚠️ 证据时效声明（2026-09-25 追加；最终全分支评审改进建议 4）

**本表 29 条判据取自 HEAD `5f4707e`**（T5b 的 13 条取自 `715e7f1`）。**此后若有提交触及下列文件，对应判据自动视为「待复取」**——本次的教训不是「没验证」，而是「**验证过了，但后续提交悄悄让证据过期**」。

**受影响面 → 对应判据**：

| 后续被改的文件 | 需要复取的判据 |
| --- | --- |
| `src/client/components/PromptManagerModal.tsx`（T7 改了 toggle 接线） | 判据 **16–20**（方向：作废路径 / 主链 / 文本身份 / 无记录反面控制） |
| `src/overlay-claim.ts` + `src/client/components/HashSuggestOverlay.tsx`（T7 守卫同源化） | 判据 **21–24**（三对浮层 / 压力路径 / R60 指针 0-5-10ms / R57 键盘不延后兑现） |
| `src/client/utils/capture.ts` / `ai-flow.ts`（T7 淘汰清键 + 最终波并发化） | **新增**判据：接近上限时保存一条，观察反馈延迟与清键行为 |
| `src/host/routes.ts`（最终波 A-1 宿主候选序） | 判据 **2/3**（导出落盘与官方发现）+ **技能页同会话连续两次导出** |
| `src/client/components/SkillExportModal.tsx`（最终波 A-2 导出后刷新列表） | 判据 **1**（锁定标注可见）+ 同会话第二次导出仍不新建目录 |
| `src/host/store.ts` / 导入链路（最终波 B 导入清键） | **新增**判据：恢复一份「导出后切过方向」的备份，断言标注**中性而非反相** |

**收尾时的处置**：P7 收尾补了一次**窄范围活体复检（T5c）**取上表里风险最高的几项（方向 16–20、浮层 21–24、宿主候选序、导入清键、超限保存的反馈延迟）；**未复取**的项（如 zh 文案渲染、清空回收站批量路径）在本表对应行内保持原样并注明「取自 5f4707e / 715e7f1，未复取」。
EOFPAD; wc -l docs/superpowers/plans/2026-09-24-p7-m7-acceptance.md
