# P8 / M8 活 GUI 验收记录（2026-09-25）

> **本文件与 `.superpowers/sdd/2026-09-24-p8-recommend-settings-docs/task-8-brief.md` 的验收表逐行对齐**（同顺序、同项数，不新增判定项、不合并）。
> 每条给「我做了什么 / 观察到什么」的**原文或数值**；确实不能跑的项在对应行内写 `NOT RUN — <原因> — 归属 <谁>`，并在「NOT RUN 汇总」小节汇总，不静默缺席。
> 本任务**只做验证与记录，未改任何产品代码**（`src/**` / `scripts/**` / `lib/**` / `tests/**` / `package.json` 一字未动；缺陷不修，写进报告由控制者裁定）。
> 本任务**未发送任何聊天消息**；**未触碰装配**（未重启 `dsh web`、未改 profile、未调用 `dev_*` 注入/重载工具）；**未发送聊天消息**（无 `submit`、未在 composer 内按 Enter）。

## 环境与口径

- 被验收提交：**HEAD `577bddec778bea893218db69993db6055e40f50d`**（= `577bdde`）；验收开始 `git status --porcelain` = `?? docs/superpowers/plans/2026-09-24-p8-recommend-settings-docs.md`（SDD 计划文件，非本轮产物）。
- 宿主：`http://127.0.0.1:3080`（页面标题 `DSH Local Build`，版本串 `0.1.5-rc.2-c291e79`）；`document.documentElement.lang === "en"` ⇒ 全部断言取 **en** 文案。
- 插件装配：控制者已 `dev_reload_package dsh-prompt-enhancer`（client ✓）；本任务只做**产物身份独立复核**（§2），不重做装配。
- 驱动方式：Playwright（`browser_navigate` / `browser_evaluate` / `browser_click` / `browser_console_messages` / `browser_network_requests`）+ 只读 HTTP（`curl`）+ 只读 sqlite（`sqlite3 "file:…?mode=ro" -readonly`）。
- **证据分层（明确区分，不混用）**：
  - **实测（本轮）**：下表所有 PASS/FAIL 条目的数值/原文都来自本轮活页面与真实 HTTP。
  - **页面内 `fetch` 包装**：仅本页有效、刷新即复原；仅在 T7-1 / T7-7 / 网络计数三项使用，且**每项收尾都整页刷新**清除（§7）。
  - **页面内只读观察器**：`window.__reqLog` / `window.__frames`（只读 DOM 属性与文本，不写 DOM）。
  - **控制者已提供的强证据**：`lib/client.js` 的 sha256、热重载结果 —— §2 只做**独立复核**。
- **活页面初始态（非默认，必须记录）**：验收开始时 composer 草稿**非空** = `"T5c Evict probe draft #C"`（P5 验收遗留），且该草稿尾部是 `#` 令牌 ⇒ `#` 浮层当时**在屏**（见 §3.0 基线）。收尾已逐字还原该草稿（§7）。
- 侧栏初始态：左侧栏**宽态**（`wide = true`，行宽 256px），底部区域含宿主行 `Context Insights`（x=10）与 `Settings`（x=10），以及本插件入口 `aria-label="Prompts"`（x=12）。**注**：任务书提到「Content Insights 在本机不存在」，本轮实测本机存在的是 **Context Insights**（宿主行，x=10/w=260/h=42），故 (k) 同时与 `Settings` 和 `Context Insights` 两行比对。

## 1. 产物身份自证（活页面模块段 ≡ 本地 `lib/client.js`）

| 动作 | 来源 | 观察到什么 |
| --- | --- | --- |
| 本地产物（全文件） | `shasum -a 256 lib/client.js` | **`96b752a5392ede640df64b8a5480e87a3d106ddea4c5b98e510a5c0374d34c3b`**（230248 字节 / 225733 个 UTF-16 码元） |
| 本地候选 L4（去尾部 `\n//# sourceMappingURL=client.js.map\n`） | `node -e`（见下） | **`723b1ad67854ba11170b6f53bfd4b51be37fb3501cbbb45216fee348574172f1`**（225697 码元） |
| 本地候选 L3（L4 再去尾部换行） | 同上 | `545bc1ddd9443e2b2ba840f1e0f4c8b56eabf9ac79c28b9a356ea79bf1fd68b8`（225696 码元） |
| 活页面模块 URL | `performance.getEntriesByType('resource')` 过滤 `dsh-prompt-enhancer/client.js` | `http://127.0.0.1:3080/plugins/??…,``@dsh-external/dsh-ui-progress/client.js,dsh-prompt-enhancer/client.js&rev=c9f1172a9de9`（整段 **910750** 码元，我方模块**最后一个**，起点 `startIdx = 684579`） |
| 模块段切片 | 以 `window.__ModuleLoader__.load({\n  id: "dsh-prompt-enhancer",` 为起点（**全段命中 1 次**）；终点 = 该段内**最后一个** `//# sourceMappingURL=`（段内偏移 225699）；再去掉宿主拼接的尾部 `;\n` | 段长 **225697** 码元；头 `window.__ModuleLoader__.load({\n  id: "dsh-prompt-e…`、尾 `…eturn module.exports;\n  }\n});\n` |
| **一致性命中（主证据）** | 上述切片的 sha256 | **`723b1ad67854ba11170b6f53bfd4b51be37fb3501cbbb45216fee348574172f1`** = 本地候选 **L4** ⇒ **逐字相同** |
| **一致性命中（旁证，反向）** | 上述切片再去尾部换行的 sha256 | **`545bc1ddd9443e2b2ba840f1e0f4c8b56eabf9ac79c28b9a356ea79bf1fd68b8`** = 本地候选 **L3** ⇒ **逐字相同** |

⇒ **本轮验收的确实是 HEAD `577bdde` 的已提交产物**（两个方向都逐字命中）。**度量口径**：必须按 **UTF-16 码元**切（bundle 含大量中文，码元数 ≠ 字节数），且必须去掉尾部 `//# sourceMappingURL=` 行——本轮两坑各用一条独立命中交叉证明。

```sh
# 本地候选（仓库根执行）
node -e 'const fs=require("fs"),c=require("crypto");const s=fs.readFileSync("lib/client.js","utf8");
const h=x=>c.createHash("sha256").update(x).digest("hex");
console.log(h(s.replace(/\\n\\/\\/# sourceMappingURL=[^\\n]*\\n$/,"")))'
```
## 2. 逐条验收表（A 正面项 + B 控制者具名判据 + C 其他）

判据原文逐行取自 `task-8-brief.md` 的验收表与任务书 B 段；「读数」列给本轮实测数值/原文。

| 项 | 判据（原文口径） | 判定 | 读数（做了什么 / 观察到什么） |
| - | ---------------- | ---- | ------------------------------ |
| **T9 面板页签** | 默认 420×560 下四个页签**无一被裁切**；并量一次头部行数（内容宽 396 vs 需求约 371） | **PASS** | 面板 `[data-prompt-enhancer-manager]` rect = `x429 y79 w422 h562`（内联 `width:420px;height:560px`，+1px 边框）。四页签 rect（`role="tab"`）：`List` x442 **w40.94** / `Tags` x486.94 **w46.64** / `Trash` x537.58 **w50.98** / `Import & export` x592.56 **w104.36**，全部 `width > 0`；相邻无重叠（`442+40.94=482.94 = 486.94−4`、`486.94+46.64=533.58 = 537.58−4`、`537.58+50.98=588.56 = 592.56−4`，即「前一右缘 + 4px gap = 后一左缘」逐对成立）。**头部行数 = 2**：`top`（标题 + Close）y90 h22、`bottom`（四页签 + 导出为技能）y118 h24，header 合计 h73；第 2 行内导出按钮 y119（与页签同排）⇒ **第 3 行元素数 = 0，无换行**。余量读数：`bottom.clientWidth = 396`（= 需求 371 + 25）、末页签右缘 696.92、导出按钮左缘 747.17（行内自由空间 **50.25px**）、导出按钮右缘 838 距内容右缘 850 留 12px。⇒ 与「约 25px 余量」的担忧一致（本机字体下不换行，但余量确实不厚）。 |
| **P6/P7 面板内判据（复取）** | 列表行 / 详情页 / 标签 / 回收站 / 导入导出 / 技能页**各至少一条** | **PASS（6/6）** | 逐页真实点击后读数（tabpanel `aria-label` 与内容原文）：**列表** `List`：`[role="listitem"]` = `["欢迎使用提示词增强"]`，行内原文 `…|Uses 11|Edit|Delete`；**详情页** 点 `Edit` ⇒ 输入框 `Title="欢迎使用提示词增强"`、`Body` = 该条正文原文、`Tags="欢迎"`、`Summary=""`，按钮集 `[`Close`, `List`, `Tags`, `Trash`, `Import & export`, `Export as skill`, `Back to list`, `Save`]`（点 `Back to list` 未保存）；**标签** `Tags`：`listitem=["欢迎"]`、行内 `Uses 1`、按钮 `Clean unused tags`/`Rename`/`Delete`；**回收站** `Trash`：原文 `The trash is empty` + `Empty trash` 按钮（1 个）；**导入导出** `Import & export`：按钮 `Export backup`、输入 `Choose a backup file…`；**技能页** 点 `[data-prompt-enhancer-skill-open]` ⇒ tabpanel `aria-label="Export as skills"`、`listitem=["欢迎使用提示词增强"]`、勾选框 1 个、按钮 `Back to the manager`/`Select all`/`Fill names & descriptions with AI`/`Start export` + 说明段原文。全部 4 页签 `aria-selected` 只有当前页为 `true`。 |
| **T4 设置页（行数/键数）** | 设置页可见 **11 个视觉行**（13 键） | **PASS（11 行 / 13 控件）** | 侧栏 `Settings` → 导航行 `Prompt Enhancer`（见下行）→ 页内 `border-top:1px + display:flex + flex-wrap:wrap` 的 11 行，逐行原文标签与控件：①`AI model`（Provider + Model 两个 select）②`Panel width / height`（Width + Height 两个 number，值 420 / 560）③`Library button next to the composer`（checkbox）④`Library button shows its icon only`（checkbox）⑤`AI polish button`（checkbox）⑥`AI button shows its icon only`（checkbox）⑦`# trigger suggestion overlay`（checkbox）⑧`Context suggestions`（checkbox）⑨`Save selected text as a prompt`（checkbox）⑩`Sidebar entry`（checkbox）⑪`Storage limit`（number，值 300）。控件计 **13**（2 select + 2 number + 1 number + 8 checkbox = 13）⇒ 与「13 键 = 11 行」逐字相符；`role="alert"` 行内错误 = 0。 |
| **T4 导航行（F-9 回看点）** | 设置页导航里本插件的行**是否出现** | **PASS（出现）** | 设置对话框导航按钮原文序列：`General / Models / Command Code / Plugins / Archived sessions / Memory System / Agent presets / Cost / `**`Prompt Enhancer`**` / Plugin Market / Super Mods / Side card`；本插件行 rect `x252 y440 w164 h40`（class `M9YIEq_navCell`，非激活态），点击后进入本页（`Prompt Enhancer settings` 标题 + 上述 11 行）⇒ **F-9 的回看点在人机两侧都成立**。 |
| **T4 panelWidth/Height 即时生效** | 改 `panelWidth/Height` 后**不重开面板**尺寸即变（给前后读数） | **PASS（含通道替换，见下）** | ①**设置页改**：真实点击 `input[aria-label="Width"]` → `Meta+a` → 键入 `520` → `Tab`；`Height` 同法 `560 → 600`；**不刷新页面**，读回输入框值 `520` / `600`、无 `role="alert"`；HTTP `GET /api/prompt-enhancer/settings` 前 `panelWidth:420,panelHeight:560` → **后 `panelWidth:520,panelHeight:600`**（真的落盘）。关闭设置后打开管理面板 ⇒ rect `522×602`（内联 520×600）⇒ 新值被采纳。②**不重开面板即变**：面板**开着**时（`window.__panelRef` 持有该 DOM 节点）经**同一份设置文档**写入 `panelWidth:480,panelHeight:640`（`PUT /api/prompt-enhancer/settings`）⇒ 2s 后面板 rect 由 `522×602` **原地变为 `482×642`**（`getComputedStyle` `480px/640px`），且 `m === window.__panelRef` ⇒ **同一 DOM 节点、未重挂载**。**通道替换的披露与理由**：设置页与已打开的面板**互斥**——设置页打开时对 composer 里 `aria-label="Open the prompt library"` 的真实点击被 `[data-shell-overlay]` 遮罩拦截（Playwright `TimeoutError`，30s 重试日志原文 `<div data-prompt-enhancer-claim="none"> … intercepts pointer events`），反之面板打开时对侧栏 `Settings` 的真实点击同样被本插件遮罩拦截 ⇒ 无法「面板开着用设置页改」。故用**同一份设置文档的写入通道**证明「面板订阅共享 store、改了就原地变」，并另用设置页本身证明「改了就落盘、不刷新」。归属：判据措辞（控制者）。 |
| **T8 侧栏几何（宽态）** | 我方入口与 Settings 行 **left edge 差 ≤ 2px**、**行高相等**、**内容起始 x 相同** | **FAIL（3 项中 1 项过、2 项不过）** | 同屏实测（左侧栏宽态，`wide=true`）：**left edge** 我方 `x=12` vs `Settings` `x=10` / `Context Insights` `x=10` ⇒ **差 2px ⇒ 判据 PASS**。**行高** 我方 `h=15` vs `Settings` `h=42`（`Context Insights` 同 42）⇒ **FAIL**。**内容起始 x** 我方图标 `x=20`（`padding-left:8` 生效）vs `Settings` 图标 `x=18` ⇒ **差 2px ⇒ FAIL**；文字起点 我方 `x=38` vs `Settings` `x=42`（图标宽 14 vs 16 + gap 4）。两次独立抓取读数完全一致（`12/649/256/15`），非瞬态。**根因线索**：`src/client/components/SidebarPromptEntry.tsx:45` 的 `flex: wide ? "1" : "0 0 auto"` 在 React 里落成 `flex: 1 1 0%`；而宿主把本入口渲染进 **`._9LHUqW_footerActions`（`flex-direction: column`）**，`flex-basis:0%` 在**纵轴**生效并覆盖内联 `height:42px`（`:42`）⇒ 高度被压成「容器剩余空间」，实测 15px（容器 252.39，三个兄弟占用 91.39+100+42）。同容器内宿主自己的行用的是 `flex: 0 1 auto` + 固定 `height:42px`。 |
| **T8 侧栏几何（窄态）+ 验收 18 复取** | 窄侧栏（`wide === false`）下仍是 **28×28 纯图标**；点击仍能打开管理面板 | **PASS** | 真实点击 `button[aria-label="Collapse sidebar"]` 进 56px 轨道态：我方入口 rect `x7.5 y535 w28 h28`、`padding:0`、`border:1px solid rgb(229,231,235)`、`justify-content:center`、`flex:0 0 auto`、`innerText === ""`、**唯一子节点 = `svg` 14×14**（`x14.5`）⇒ 28×28 纯图标成立；同态宿主 `Settings` 为 36×36。对该按钮**真实点击** ⇒ `[data-prompt-enhancer-manager]` 计数 `0 → 1`、`aria-label="Prompt manager"`、`[role="dialog"]` = 1 ⇒ **验收 18 复取 PASS**。随后真实点击 `button[aria-label="Open sidebar"]` 复原宽态，读数回到 `12/649/256/15`（与第一次独立抓取逐值相同）。 |
| **T8 遗留：侧栏按钮未带宿主 `overflow: hidden`** | 在窄行下标签是否换行/溢出固定 42 高（眼验 + 几何） | **FAIL（几何不等，另有 15px 行高问题见上行）** | 我方按钮 `overflow: visible`（宿主 `Settings`：`overflow: hidden`，`line-height:22px`）；我方 `line-height: normal`、`white-space: normal`。宽态 256px 行内标签 `span` rect `x38 w47.41 h15` **单行未换行**，`scrollWidth === clientWidth`（256），无内容溢出；但按钮盒本身只有 **15px**（宿主 42px）⇒「溢出固定 42 高」这个提法在当前实现下**不成立的前提是行高已非 42**（同一根因，见上行）；轨道态无文字，无法换行。⇒ 判 FAIL 的依据是几何（`overflow` 与行高都与宿主不同），而非观察到文字溢出/换行（**未观察到**，如实记录）。 |
## 3. 逐条验收表（续）：A 段正面项 + B 段控制者具名判据

> 上表已给 T9 / T4 / T8 / 面板内判据；本表给余下全部项。每条读数都是本轮活页面实测值（原文/数值），无一项来自推断。

| 项 | 判据（原文口径） | 判定 | 读数（做了什么 / 观察到什么） |
| - | ---------------- | ---- | ------------------------------ |
| **验收 11 ①②** | ① 草稿**为空**时不渲染推荐条（负向，先取基线）；② 真实键入与某条提示词标题/标签相关的文字 ⇒ 推荐条**出现**（条数 ≤ 5 + 每条标题原文） | **PASS** | ① 真实清空草稿（`Meta+A`+`Delete`，draft = `"\n"`）⇒ `[data-prompt-enhancer-recommend]` **不存在**（`present:false, hits:null`）。② 真实键入 `m8acc recommend carrier` ⇒ 条在屏、`data-prompt-enhancer-recommend="4"`（**4 ≤ 5**），四条 `aria-label` 原文：`欢迎使用提示词增强` / `M8acc Recommend Carrier` / `M8acc 变量填窗载体` / `手引 zq7x`；条 rect `x419 y490 w712 h30`，composer 卡片 `x419 y576 w708 h36` ⇒ 条在卡片**正上方**、左缘与卡片同为 419。 |
| **验收 11 ③** | 点击一条 ⇒ 草稿被写入（给草稿原文）且 `POST /prompts/:id/use` 计数 **+1** | **PASS** | 用**临时载体** P1 `M8acc Recommend Carrier`（id `30203a95-99c1-4a3d-aa74-d04638b9da15`，验收后已物理删除）真实点击其胶囊 ⇒ 草稿原文 = `"m8acc recommend carrier\n\nM8acc carrier body used by the live acceptance click path for the recommendation bar."`（**追加语义**，`composeDraft(..., "insert")`）；`browser_network_requests` 中 `/use` 计数 **0 → 1**，逐字为 `184. [POST] http://127.0.0.1:3080/api/prompt-enhancer/prompts/30203a95-99c1-4a3d-aa74-d04638b9da15/use => [200] OK`；HTTP 复核 P1 `usageCount 0 → 1`、`lastUsedAt 0 → 1790339256806`。**种子提示词未被触碰**：`欢迎使用提示词增强` 全程 `usageCount = 11`、`lastUsedAt = 1790300582270` 未变（负向控制）。 |
| **验收 11 ④** | 清空草稿 ⇒ 推荐条**消失** | **PASS** | 真实清空草稿 ⇒ `present:false, hits:null, draft:"\n"`（与 ① 逐值相同）⇒ **「先空后非空」成对读数齐备**。 |
| **验收 11（上下文分支）** | 会话里先有真实用户消息（**不新发消息**）⇒ 草稿只输入中性词（如「继续」）而上下文命中某条 ⇒ 该条被推荐 | **PASS** | 会话 A（`这是你保存的第一条提示词，`）的 `[data-chat-flow-kind="user"]` = **1** 条，最近 3 条用户消息拼接文本长度 **185**，`includes("手引")` = **true**、`includes("复盘")` = **false**。草稿只键入中性词 `继续` ⇒ 推荐条 `hits=2`，条目 = `["欢迎使用提示词增强","手引 zq7x"]` —— 其中 `手引 zq7x`（标题仅含「手引 zq7x」、正文仅含 `zq7x`）**只可能**由上下文命中（中性草稿「继续」与它无任何共同词）⇒ **「最近 3 条用户消息」真的参与**。 |
| **T3 会话切换上下文（A→B→A）** | 两次切换后，推荐条的上下文必须跟随**当前**会话（不得拿上一会话的聊天文本） | **PASS（双向判别）** | 判别载体：`手引 zq7x`（命 A 的上下文）与 `复盘 zq7y`（命 B 的上下文），两者标题/正文除各自那个词外**无其他可命中词**。切换路径与读数：**A**（ctx 含「手引」、不含「复盘」，草稿 `继续`）⇒ 条目 `["欢迎使用提示词增强","手引 zq7x"]`（**无 zq7y**）；**A→B**（`dev-p8`，ctx 长度 301、3 条用户消息，含「复盘」、不含「手引」）⇒ 条目 `["欢迎使用提示词增强","复盘 zq7y"]`（**无 zq7x**）；**B→A** ⇒ `["欢迎使用提示词增强","手引 zq7x"]`（**无 zq7y**）。⇒ 每个会话只见自己上下文的推荐，**上一会话的聊天文本未被带过**。**旁证（判据外的观察，见 O-1）**：切换回 A 的**第一帧**（A1）里还出现**已删除**的旧条目，说明候选清单是**挂载期快照**，由 `useDataChanged` 在同页增删改后重拉——不是「上下文串味」。 |
| **T3 变量填窗是浮层** | 从推荐条点开含变量的提示词 ⇒ 填窗必须**覆盖在 composer 上方**，不得内联挤在 dock 行里 | **PASS** | 草稿 `m8acc variables` ⇒ 点条目 `M8acc 变量填窗载体`（body = `请把 {{M8主题}} 与 {{代号}} 整理成三条要点。`）⇒ `[role="dialog"][aria-label="Fill template variables"]` rect `x280 y313.5 w322 h200.5`（**底部 514**），composer 卡片 `uI_N2W_card` rect `x419 y568 w712 h98`（**顶部 568**）⇒ 填窗整体浮在卡片上方 **54px**，不占 dock 行流内高度；填窗出现前后 composer 输入区 rect **逐值不变**（`x419 y576 w708 h36`）⇒ **没有把 composer 挤下去**、**没有内联挤在行里**。填窗输入框 = `M8主题`/`代号` 两个（本轮点 **Cancel** 关闭，未写 `pl:template-var-memory`——收尾 meta 逐字未变，见 §6）。 |
| **T3 填窗左缘对齐** | 该填窗左缘与 **composer 卡片**左缘的几何读数（差 ≤ 2px 为佳） | **FAIL** | 填窗左缘 `x=280`；**composer 卡片**（`uI_N2W_card`，与推荐条 BAR 同宽同左缘的那个盒子）左缘 `x=419` ⇒ **差 139px**（> 2px）。根因线索：`src/client/components/ContextRecommendations.tsx:193` 的 `ROW_ANCHOR` 只有 `position: relative`，**不带** `BAR` 的 `maxWidth: var(--dsh-composer-card-max-width)` + `margin: 0 auto`（同文件 `:211-223`），故 `DIALOG_ANCHOR`（`:199-205` 的 `left: 0`）锚在 **dock 行**左缘而不是卡片左缘。**对照读数**：填窗 `x=280` 与 `composerStack` 左缘 `x=280` **完全相等（差 0px）**，与 `uI_N2W_root` 亦相等 ⇒ 若判据里的「composer 卡片」指**输入区整体/栈**而非内层卡片，则差 0px、本条即 PASS。**本表按判据字面（「卡片」= `uI_N2W_card`）判 FAIL**，两种口径的读数都给全，请控制者按设计意图裁定。 |
| **验收 12** | 设置页改 `aiModel` / 关 `#` 触发 / 关推荐 ⇒ **不刷新页面**，对应 UI 立即变化（给前后读数：推荐条在屏帧数；`#` 浮层在屏 = false）；并给**写真的落盘**的证据（`GET /settings` 前后原文） | **PASS** | **关推荐**（设置页复选框真实点击）：改前 rAF 采样 **72/72 帧**条在屏；点击后 **120ms** 内即读到 `[data-prompt-enhancer-recommend]` **不存在**，采样窗口内仅 **3/82 帧**在屏（第 3 帧起转 false）⇒ 同一次渲染批内清空、**未刷新页面**；再勾回 ⇒ 78/82 帧在屏（第 4 帧起转 true）。HTTP：`contextRecommendEnabled true → false → true`（逐次落盘）。**关 `#` 触发**：见下一行（设置页关掉后**真实键入 `#m8acc` ⇒ 浮层 0 帧**）。**改 aiModel**（设置页下拉真实选择）：Provider `""（自动发现）→ deepseek-official` 后模型下拉由 `disabled=true` 转 **false** 且选项 = `["","deepseek-flash"]`；选 `deepseek-flash` ⇒ 页面受控读回 `{provider:"deepseek-official", model:"deepseek-flash"}`（未刷新）；随后改回 `""` ⇒ 读回 `{"",""}`、模型下拉复 `disabled=true`；HTTP 全程可查（收尾 = 验收前原文）。**口径披露**：①`#` 行的「即时收起」另给一条不点、不刷新的读数（见下一行）；②「设置页」与「已打开的管理面板」在本宿主**互斥**（详见 T4 行），故面板尺寸项的「不重开即变」用同一份设置文档的写入通道取证。 |
| **`hashTriggerEnabled` 三档** | 开启时键入 `#` 令牌 ⇒ 浮层在屏（帧数 > 0）；**关闭时**浮层即时收起（在屏 = 0 且未刷新页面）；重新开启 + 再真实键入 ⇒ 回来（三档全给帧数） | **PASS** | **档 1（开）**：草稿 `#m8acc` ⇒ 浮层在屏，采样 **108/108 帧**。**档 2（关，设置页真实点击复选框）**：设置页关闭该开关后**真实键入** `#m8acc`（draft 实测 = `"#m8acc"`）⇒ 浮层 **0 帧**（`hash=false`）——即「关掉就真的不弹」。**档 3（重开）**：改回开启（页面内**不点、不刷新**、只写同一份设置文档）⇒ 草稿未变（仍是 `#m8acc`）而浮层**从第 2 帧起在屏**（180/182 帧）；再**真实键入**一个字符（`" r"`）⇒ 令牌被空格打断、浮层按既有令牌规则收起（属预期，非设置项）。**「即时收起」同向读数**：浮层在屏且令牌完好时，仅写设置文档（无指针、无键盘、无刷新）⇒ 采样 **192 帧在屏后转 0**（该 192 帧含本轮 curl 往返 + 宿主→客户端推送的等待；对照「关推荐」走设置页同 store 路径时为 **3 帧**）。 |
| **验收 19** | 关 `showSidebarButton` ⇒ 左侧入口消失（DOM 计数 1 → 0）；关 `showComposerButton` ⇒ 输入框旁按钮消失（0）；两个都开回来 ⇒ 各回 1（正负成对） | **PASS（正负成对）** | 逐键真实点击设置页复选框，每步读 DOM 计数：**改前** `sidebarEntry=1, composerLib=1, aiBtn=1` → 关「Library button next to the composer」⇒ `composerLib=0`（sidebar 仍 1、AI 仍 1）→ 关「AI polish button」⇒ `aiBtn=0` → 关「Sidebar entry」⇒ `sidebarEntry=0` → **三个都开回来** ⇒ `1/1/1` 且两个 composer 按钮的 `innerText` 复为 `""`（图标态）。 |
| **T2（两个只图标按钮可分辨）** | 默认（两项 `*IconOnly` 均 true）下两个按钮都只有图标 ⇒ 可见文本节点计数 = 0、`aria-label` 分别为「打开提示词库」/「AI 优化」原文；再置 false ⇒ 各自出现文字 | **PASS** | **默认（`composerButtonIconOnly=true` / `aiPolishButtonIconOnly=true`）**：库按钮 `innerText === ""`、`textContent === ""`、**直接文本子节点 = 0**、唯一子节点 = `svg`，`aria-label="Open the prompt library"`（= 键 `button.tip` 的 en 原文，zh 即「打开提示词库」）、`title="Open the prompt library"`、`aria-haspopup="dialog"`；AI 按钮 `innerText === ""`、直接文本子节点 = 0、唯一子节点 = `svg`，`aria-label="AI polish"`（= 键 `ai.button`，zh「AI 优化」）、`title="Composer is empty — write something first"`（空草稿态的提示）。**置 false 后**：库按钮 `innerText === "Library"`、AI 按钮 `innerText === "AI polish"` ⇒ **各自出现文字**；HTTP `composerButtonIconOnly:false, aiPolishButtonIconOnly:false` 落盘；置回 true 后两者 `innerText` 复为 `""`。 |
| **T1 首屏闪烁** | 把三个显隐开关设为 false 后刷新，观察按钮是否先按默认渲染一次再消失（给帧数或「未见」） | **FAIL（部分：侧栏入口 2 帧闪烁；两个 composer 按钮未见）** | 前置：`showComposerButton/showAIPolishButton/showSidebarButton = false`（HTTP 落盘复核）。在**新开的页**上用 `page.addInitScript` 于**文档开始**装 rAF 采样器（每帧读三个按钮是否存在），`goto` 后采 **409 帧 / 7.0s**：`button[aria-label="Open the prompt library"]` **0 帧**（未见）、`button[aria-label="AI polish"]` **0 帧**（未见）、`button[aria-label="Prompts"]` **2 帧**（第 5–6 帧，t≈335ms 起）⇒ **侧栏入口先按默认渲染了 2 帧（≈33ms）再消失**，正是「默认值先出、真值后到」的首屏闪烁。采样页随后关闭，主页面无残留。 |
| **验收 14** | 注册的 systemPrompt section 数 = 0：给宿主侧可执行证据（宿主 API 层的 section 账本读数或 `--dump-config` 的相关段原文）+「未注入」的反面证据（宿主默认 `deployment:persona` 仍生效） | **NOT RUN** | **原因**：本部署没有可执行的 section 账本读数通道 —— ① 宿主未在本会话暴露任何列出 `ctx.systemPrompt.section()` 注册项的 HTTP 路由（在 DSH checkout 内检索 `packages/*/src` 无 systemPrompt↔route/http 关联）；② 本会话 `which dsh` 为空、无可调用的 `--dump-config` CLI；③ 第三方 Context Insights 面板（`/api/dsh-context/detail`，直连回 `unauthorized`）的「System Prompt」分类只给 token 计数（**1 items ≈30.2k**），不展开 section 清单，亦无 `deployment:persona` 文本；④ 会话的 `[data-chat-flow-kind="context"]` 节点只有 `intent-gate-watchdog` 与 `dsh-mnemon` 两条注入摘要，不含系统提示词正文。**归属**：控制者（判据措辞/环境）。**本轮能给的旁证（不替代判据）**：活页面模块段（sha 已自证 = 本地产物）内 `systemPrompt` 出现次数 = **0**（见 §7 的可复核命令），且源码无任何 `ctx.systemPrompt.section(...)` 调用 ⇒ 结构上不可能注册 section。 |
| **回归：P4 验收 2**（`#` 浮层可筛选 + 点击插入） | T3 改了它的渲染门 | **PASS** | 草稿 `#m8acc` ⇒ 浮层在屏、条目 = `["M8acc 变量填窗载体","M8acc Recommend Carrier"]`（2 条）；改为 `#recommend` ⇒ **筛选为 1 条** `["M8acc Recommend Carrier"]`；**真实点击**该条 ⇒ 草稿由 `"#recommend"` 变为 `"M8acc carrier body used by the live acceptance click path for the recommendation bar."`（令牌被正文替换、浮层收起），`/use` 计数再 +1（同一 P1 id，200 OK）。**种子用量未动**（仍 11）。 |
| **回归：P7 三对浮层 coexist + 跃迁** | 三对浮层 coexist **0 帧** + 跃迁单帧 | **PASS** | 页面内 rAF 采样器逐帧记录 `{hash 面板在屏, 词库面板在屏, AI 面板在屏}`。**轮次 A（250 帧）**：编排 = 键入 `#m8acc` → 真实点词库按钮 → 再键入 `#m8acc` → 真实点 AI 按钮 → 键盘回 composer 键入「空格 #」→ 真实点词库按钮。分段序列 `hash(0-32) → library(33-71) → hash(72-103) → none(104) → ai(105-160) → hash(161-213) → library(214-249)`：**coexist = 0 帧**，六次跃迁的 `gap` **全为 1**（前一面的最后一帧与后一面的第一帧**相邻**）⇒ 单帧跃迁。**轮次 B（841 帧）**：覆盖 R57 键盘路径与另一次 AI↔hash 往返，同样 `coexist = 0`，六次跃迁 `adjacency = 1`。 |
| **回归：R60 指针 0/5/10ms** | 三档全开 | **PASS（三档全开）** | 每档前置都先确认 `#` 浮层在屏（`hash=true, lib=false, ai=false, claim="hash", aria-expanded="false"`），再用**真实指针**（`page.mouse.move` → `down` → 等待 N ms → `up`）点词库按钮中心 `(228.75, 642.92)`（该刻真实 `getBoundingClientRect` 中心）：**0ms / 5ms / 10ms** 三档读数**逐值相同** ⇒ `hash=false, lib=true, ai=false, claim="library", aria-expanded="true"`（三档都开面板）。 |
| **回归：R57 键盘不延后兑现** | `#` 浮层在屏时键盘激活词库按钮 | **PASS** | `#` 浮层在屏（`claim=hash, hashOn=true, aria="false"`、草稿 `#m8acc`）时，真实 `Tab`×3 逐步断言 `activeElement`：`Add files or run commands` → `Access mode, current: Workspace Write` → **`Open the prompt library`**；再**真实 `Enter`** ⇒ 草稿不变（仍 `#m8acc`）、`claim` **仍是 `hash`**、`aria-expanded` **仍是 `"false"`**、词库面板**不在屏**、无确认框 ⇒ **不置位**；随后清空令牌 ⇒ 词库面板**仍未出现**（`libOn=false`、`claim="none"`）⇒ **不延后兑现**。 |
| **回归：C1 关闭态零遮挡** | 全部面关闭时对会话正文做真实点击 | **PASS** | 全部面关闭时：`[data-prompt-enhancer-manager]=0`、`[data-prompt-enhancer-confirm]=0`、`[role="dialog"]=0`、`[data-prompt-enhancer-claim]=["none"]`；对会话正文 `[data-conversation-scroll] p:has-text("上手引导收到了")` 做**真实 Playwright 点击** ⇒ **成功返回**（无指针拦截）。**注**：宿主常驻 `[data-shell-overlay="true"]` 层 = 1（P6/P7 亦如此，非本插件遮挡）。 |
| **回归：C3 沉淀一步到位** | 草稿一键存为提示词直达新建详情 | **PASS** | 真实键入草稿 `M8acc C3 一步到位草稿：把这段整理成三条要点。` → 真实点词库按钮（面板 `aria-label="Saved prompts"`，含 `Save current draft as prompt`/`Manage`）→ 真实点 `[aria-label="Save current draft as prompt"]` ⇒ **无需再点「New」**：管理面板直接处于新建详情态（`[role="listitem"]` 计数 **0**、按钮集 `[… Close, Back to list, Save]`），`textarea[aria-label="Body"].value` **逐字 === 该草稿**、`input[aria-label="Title"].value === ""`；点 `Back to list` **未保存**（随后关闭面板，条目数回到 1 条种子）。 |
| **回归：C9 删除失败列表仍在** | 页面内让 `DELETE /prompts/:id` 失败 ⇒ 列表仍在 | **PASS** | 新建临时载体（`M8acc C9 delete failure carrier`，收尾已物理删除），页面内 `fetch` 包装让 `DELETE /prompts/<uuid>` 返回 **HTTP 503** + **不带 `data`** 的失败信封 `{"ok":false,"error":"mock 503 delete from page-side fetch interceptor"}`（**拦截计数 = 1**，证明请求确实被拦下）；对方**真实点击** `Delete` ⇒ `[role="list"]` **仍在**（计数 1）、**两行都仍在**（含该行）、行内 `role="alert"` 原文 `Failed to delete\nmock 503 delete from page-side fetch interceptor`（= en `error.delete` + 宿主原文，两部分都在）⇒ **列表未被失败删除清掉**。 |
| **回归：P6 C4②（重选同文本浮层再现）** | 同一区间重选 ⇒ 浮出按钮再现 | **PASS** | 对真实助手段落（`上手引导收到了`）做合成拖选（隐藏的 `pointerdown` → 真实 `Selection` 设 offset 0..7 → `pointerup`，按 P6 的披露口径）⇒ 浮出按钮 `aria-label="Save as prompt"` 出现、rect `[435,345,103.3,24]`；**真实点击**它 ⇒ 浮出按钮立即消失（计数 0）、管理面板直接进新建详情态且 `Body === "上手引导收到了"`（选区原文）；回列表 → 关面板 → 清空选区（此时计数 **0**）→ **再次拖选同一区间** ⇒ 按钮**再次出现**，rect 与首次**完全相同** `[435,345,103.3,24]`（无「静默不出现」）。 |
| **T7-1 清键超时可见** | 页面内把 `DELETE /meta` 响应挂住 ⇒ 15s 内必须观察到一次 `console.warn` | **PASS** | 前置：一条临时载体先软删入回收站（`{"ok":true,"data":{"deleted":true}}`，`/trash` 出现该行）。页面内包装 `DELETE /meta/*` 为「挂住 + 客户端 abort 时以 `signal.reason` 拒绝」（**拦截计数 = 2**，= `pl:refined-dir:<id>` 与 `pl:skill-descriptor:<id>` 两把键）：在回收站面板真实点 `Delete forever` → 确认层原文 `Delete forever / This cannot be undone. Continue? / 手引 zq7x / Cancel / Confirm` → 真实点 `Confirm` ⇒ **两条 `console.warn`**（原文）：`[prompt-enhancer] 清理提示词的 meta 键失败（提示词已删除，残留键：pl:refined-dir:116d524e-04e0-4d70-9c41-a5b33f3f0c46） TimeoutError: signal timed out` 与同款 `pl:skill-descriptor:…`；两者在 **17s 采样窗内**出现（`CLEAR_TIMEOUT_MS = 15000` 到点即抛）。回收站随后为空（主删除真的发生）。**注**：宿主侧从未收到这两次请求（包装未转发）⇒ meta 无副作用。 |
| **T7-7 探测超时分类** | 页面内把 `GET /ai/providers` 挂住 ⇒ 15s 后按钮显示**探测专属**文案，而不是 `ai.timeout` 的文案 | **PASS** | 非空草稿下真实点 AI 按钮（该路径先 `api.listAiProviders()` 探测，**拦截计数 = 1**）；AI 面板文案按秒采样：t=1…14s 均为 `Calling AI…` → **t=15s** 变为 `Timed out probing for available models, please check the model settings or network and retry`（= `ai.probeTimeout` 的 en 原文）⇒ **是探测专属文案**，且**不是** `ai.timeout`（`The AI request timed out, please retry later`）；控制台同步出现 `[prompt-enhancer] AI 可用性探测失败 ApiError: 探测可用的 AI 模型超时`（按设计「错误必须可见」）。 |
| **T7-4 重拉粒度** | 一次导出 **≥3 条**技能成功后，`GET /prompts` 只应出现**一次** | **FAIL** | 页面内包装：`POST /skills/export` 返回**合成成功**信封（`{ok:true,data:{name,path}}`，**不落盘**——本会话沙箱对 `$DSH_HOME/skills/` 不可写亦不可删，见 §6 O-3；真实导出会留下**无法清理**的技能目录，与「不可逆变化 = 0」冲突），同时逐次记录 `GET /prompts` 并抓调用栈。为满足「≥3 条**成功**」的前置（每条必须先有 skillName），给 3 条**临时载体**写入 `skillName`（收尾随载体一并物理删除）。真实点 `Select all`、只留 3 条临时载体选中、真实点 `Start export` ⇒ 面板原文 **`Succeeded 3 · Failed 0`**，`POST /skills/export` **3 次**（id = 三条临时载体），但紧随其后的 `GET /prompts` 为 **2 次**（判据要求 1 次）。**调用栈定位（两次都取到）**：① `call → Object.listPrompts → load` @ bundle `…:2353`（推荐条 `ContextRecommendations.load`，`useDataChanged` 订阅）；② `call → Object.listPrompts` @ bundle `…:3987`（另一处 `useDataChanged` 订阅者，词库按钮一侧的同款内联 load）。**N 无关性对照**：只选中 **1 条**导出（`Succeeded 1 · Failed 0`）⇒ `GET /prompts` 仍是 **2 次**、且是**同样两个**调用点 ⇒ 现状**不是**「每条导出各拉一次」（按条数的重拉缺陷不存在），而是**每个 `data-changed` 订阅者各拉一次**。判据字面（「只应出现一次」）**不成立**，故判 FAIL；请控制者裁定是「判据口径 = 通知次数」还是「产品应收敛为 1 次/批」。 |
## 4. NOT RUN 汇总

| 项 | 状态 | 原因 | 归属 |
| - | ---- | ---- | ---- |
| **验收 14**（systemPrompt section 数 = 0 的**宿主侧**读数） | **NOT RUN** | 本部署无该判据要求的通道：宿主未暴露列出 `ctx.systemPrompt.section()` 注册项的 HTTP 路由；本会话 `which dsh` 为空、无可执行的 `--dump-config`；第三方 Context Insights（`POST /api/dsh-context/detail` 直连回 `unauthorized`）的「System Prompt」分类只给 token 计数（1 items ≈30.2k）不展开 section；会话 `[data-chat-flow-kind="context"]` 节点仅含 `intent-gate-watchdog` / `dsh-mnemon` 两条注入摘要。**旁证（不替代判据）**：活模块段内 `systemPrompt` 出现 **0** 次（sha 已自证 = 本地产物）。 | 控制者（判据措辞/环境） |

**没有其他 NOT RUN**：A 段正面项、B 段具名判据、C 段全部在本轮**实跑**（其中 T7-1/T7-7 的 15s 超时、R60 三档、T3 双向切换、T2 正负两态、验收 19 正负两态、T3 变量填窗几何都是**构造成功**的）。

## 5. console / 网络异常

**干净页读数（第一次整页重挂载后静置 6s）**：`browser_console_messages` ⇒ `Total messages: 1 (Errors: 0, Warnings: 0)`；`level=error` → **0 条**、`level=warning` → **0 条**；唯一一条是 `[INFO] [genui] client active; fence-channel=dom`（**非本插件**）。⇒ **本插件零 error** 成立。

**本轮刻意制造、逐条可归因的异常（全部为本插件的「错误必须可见」设计行为或第三方插件）**：

| # | 条目 | 条数 | 来源与归因 |
| - | ---- | ---- | ---------- |
| 1 | `[WARNING] [prompt-enhancer] AI 优化失败 ApiError: mock 503 polish from acceptance interceptor` | 2 | 浮层共存/切换测试对 `POST /ai/polish` 的**合成 503**（避免真实 AI 调用与宿主日志落盘）；属设计行为（warn + 面板内错误） |
| 2 | `[WARNING] [prompt-enhancer] AI 可用性探测失败 ApiError: 探测可用的 AI 模型超时` | 1 | T7-7 的 `GET /ai/providers` 挂起注入（15s 客户端超时） |
| 3 | `[WARNING] [prompt-enhancer] 清理提示词的 meta 键失败（提示词已删除，残留键：``pl:refined-dir:<id>``） TimeoutError: signal timed out` | 1 | T7-1 的 `DELETE /meta/*` 挂起注入（15s 客户端超时） |
| 4 | `[WARNING] [prompt-enhancer] 清理提示词的 meta 键失败（…``pl:skill-descriptor:<id>``）…` | 1 | 同上（两条键并发清，各一条 warn） |
| 5 | `[WARNING]`（C9 的 503 删除失败后新增 1 条） | 1 | C9 注入；`browser_console_messages` 的 warning 计数由 0 → 1，**本轮未逐字留存该条文本**（如实记录），面内 `role="alert"` 原文已留存于 C9 行 |
| 6 | `[WARNING] LaTeX-incompatible input and strict mode is set to 'warn': Unicode text character … used in math mode [unicodeTextInMathMode]` @ `assets/vendor-CCJJTK99.js:153` | 4 | **第三方**（KaTeX 渲染），由打开 Context Insights 面板渲染含公式字样的文本触发 |
| 7 | `[WARNING] [dsh-genui] no [data-chat-anchor-key] ancestor for a dsh-ui fence …` | 1 | **第三方**（dsh-genui） |
| 8 | `[ERROR] TypeError: Cannot read properties of null (reading 'provider')` + `[ERROR] slot entry crashed in 'conversation.input.right': …` 栈顶 = `WorkBuddyProbeControl` | 2 | **第三方**（`dsh-workbuddy-connect` 在 `conversation.input.right` 座位的探针读 null provider）。**可复现**：末次整页 reload 后出现 2 条；第一次 reload 后为 0 条 ⇒ 与页面加载时的 provider 快照有关，**与本插件无关**（栈帧函数名与座位名都指向该插件） |

**网络侧（本插件路由）**：`GET /prompts`（多处挂载/重拉）、`POST /prompts` ×5（5 条临时载体创建）、`PUT /prompts/<id>` ×4（3 条 skillName + 1 条 C9 载体无需）、`POST /prompts/<id>/use` ×2（全部落在临时载体 P1 上）、`DELETE /prompts/<id>` + `DELETE /trash/<id>`（临时载体清理与 T7-1 的不可逆删除）。**全部落在 5 条临时载体上；种子提示词零触碰**。**AI 侧：本轮 0 次真实 AI 调用** —— `$DSH_HOME/prompt-enhancer/log/` 前后**完全一致**（仍只有 `ai-2026-09-24.log`，628 字节，mtime `Sep 24 23:18`），无 `ai-2026-09-25.log` 生成。

## 6. 临时数据与副作用（前后原文对照）

**纪律**：先快照 → 造 → 用完删 → 逐项复查。**结论：不可逆变化 = 0。**

| 端点/对象 | 验收前（原文） | 验收后（原文） | 判定 |
| --------- | ------------- | ------------- | ---- |
| `GET /prompts` | 1 条：`66a4114f-6299-4309-a701-8af4379abdd5` `欢迎使用提示词增强`，`usageCount=11`、`lastUsedAt=1790300582270`、`createdAt=updatedAt=1790256837615`、`tags=["欢迎"]`、`aiRefined=false`、`skillExportedAt=0` | **逐字段相同**（含 `usageCount=11`、`lastUsedAt=1790300582270`） | **相等** |
| `GET /trash` | `{"ok":true,"data":[]}` | `{"ok":true,"data":[]}` | **相等** |
| `GET /tags` | `[{"name":"欢迎","count":1}]` | `[{"name":"欢迎","count":1}]` | **相等** |
| `GET /settings`（13 键） | `panelWidth:420, panelHeight:560, showComposerButton:true, composerButtonIconOnly:true, showAIPolishButton:true, aiPolishButtonIconOnly:true, hashTriggerEnabled:true, contextRecommendEnabled:true, selectionAddEnabled:true, showSidebarButton:true, maxPromptCount:300, aiProvider:"", aiModel:""` | **13 键逐一相等**（原文如上） | **相等** |
| `meta` 表（sqlite 只读） | 8 行：`pl:m7acc-probe-tmp=''`、`pl:refined-dir:6b95ba77…=''`、`pl:refined-dir:ff6475e5…=''`、`pl:skill-descriptor:001b3733…=''`、`pl:skill-descriptor:810398a4…=''`、`pl:skill-descriptor:b3792ed9…=''`、`pl:template-var-memory='{"target":"日语","主题":"量子计算"}'`、`schemaVersion=2` | **同 8 行、逐字相等**（`COUNT(*)=8`） | **相等** |
| `$DSH_HOME/skills/` | 4 个目录：`dsh-plugin-dev / j-space / memory-governance / osv-scan` | **同 4 个**（`ls -1 \| wc -l = 4`） | **相等** |
| `$DSH_HOME/prompt-enhancer/log/` | `ai-2026-09-24.log`（628 字节，mtime `Sep 24 23:18`） | **完全相同**（未新增文件、mtime 未变） | **相等** |
| composer 草稿 | `"T5c Evict probe draft #C"`（尾部 `#` 令牌 ⇒ `#` 浮层在屏、`claim="hash"`） | **逐字还原为 `"T5c Evict probe draft #C"`**（且整页 reload 后仍保持，`claim=["hash"]`、浮层在屏） | **相等** |
| 页面内注入 | — | 整页 reload 后 `__origFetch / __frames / __intercepts / __listStacks / __panelRef / __tn / __sampling / __c9` **全部 `undefined`**（两次独立验证） | **已消除** |
| 已打开的会话侧栏展开态 | 侧栏曾用「Show more sessions」展开 | 展开态保留（纯 UI 视图状态，非数据） | **视图状态，如实记录** |
| 仓库 | `git status --porcelain` = `?? docs/superpowers/plans/2026-09-24-p8-recommend-settings-docs.md` | 追加本文件：`?? docs/superpowers/plans/2026-09-25-p8-m8-acceptance.md` | **未改任何产品文件**（`src/**`/`scripts/**`/`lib/**`/`tests/**`/`package.json` 一字未动；`lib/client.js` sha 仍 `96b752a5…`） |

**本轮造过并已**全部**清除的临时数据**

| 用途 | 载体 | 处置 |
| ---- | ---- | ---- |
| 验收 11 ③（推荐点击 + 用量 +1） | P1 `30203a95-99c1-4a3d-aa74-d04638b9da15` `M8acc Recommend Carrier`（`usageCount` 0→1→2） | 软删 + 永久删 ⇒ `{"removed":1}` |
| 验收 11 上下文分支 / T3 切换判别 | KA `116d524e-04e0-4d70-9c41-a5b33f3f0c46` `手引 zq7x`、KB `8bcabe72-62f6-44f5-89cd-986abcdf733b` `复盘 zq7y` | KA 经 T7-1 的**不可逆删除**路径清除（回收站为空）；KB 软删 + 永久删 |
| T3 变量填窗几何 | PV `15c51634-5a7f-42a5-a90c-1306e7146c18` `M8acc 变量填窗载体` | 软删 + 永久删 |
| T7-4 导出计数 | 三条载体被写入 `skillName`（`m8acc-synth-a/b/c`）后作 3 条导出对象 | 同批软删 + 永久删 ⇒ `GET /prompts` 复为 1 条 |
| C9 删除失败 | C9 载体 `1b54bbd2-3f7f-4c10-a595-8bf8e0913bbd` | 软删 + 永久删 |
| 被淘汰的噪声载体 | `98f3f5b1…`（`M8acc 上手引导判别`）、`0e11c5cd…`（`M8acc 复盘判别`）、`2f378b6f…`（`M8acc 词库回声`） | 早期判别力不足（正文含「会话/上下文」等通用二元组致假阳性）⇒ 已删除并换用「标题=判别词 + 正文仅 ASCII」的干净载体 |
| 页面内注入 | `fetch` 包装（`/ai/polish` 合成 503、`/ai/providers` 挂起、`DELETE /meta/*` 挂起、`DELETE /prompts/:id` 合成 503、`POST /skills/export` 合成成功、`GET /prompts` 计数）+ rAF 采样器 + `__tn/__panelRef` | **两次整页 reload 后全部消失**（实测 8 个全局均为 undefined） |
| 设置键（逐键改动与还原） | `panelWidth 420→520→480→420`、`panelHeight 560→600→640→560`、`composerButtonIconOnly true→false→true`、`aiPolishButtonIconOnly true→false→true`、`showComposerButton true→false→true`、`showAIPolishButton true→false→true`、`showSidebarButton true→false→true`、`contextRecommendEnabled true→false→true`、`hashTriggerEnabled true→false→true`、`aiProvider ""→deepseek-official→""`、`aiModel ""→deepseek-flash→""` | **终值 = 验收前**（13 键原文见上表）；`maxPromptCount` 与 `selectionAddEnabled` 全程**未被改动** |

## 7. 缺陷与观察（如实记录；本任务不修产品代码，由控制者裁定）

| ID | 类型 | 内容 | 期望 / 实际 | 定位线索 |
| -- | ---- | ---- | ----------- | -------- |
| **D-1** | **缺陷（中）——侧栏入口行高塌陷 15px（不是 42px）** | 宽态下本插件入口 `button[aria-label="Prompts"]` 的 rect 高 **15px**，内容起点（图标）`x=20`；同屏宿主 `Settings` 行高 **42px**、图标 `x=18` ⇒ 「行高相等」「内容起始 x 相同」两条判据都不成立（left edge 12 vs 10 差 2px 恰好压线通过）。**根因**：`src/client/components/SidebarPromptEntry.tsx:45` 的 `flex: wide ? "1" : "0 0 auto"` 落成 `flex: 1 1 0%`，而宿主把本入口渲染进 **`._9LHUqW_footerActions`（`flex-direction: column`）** ⇒ `flex-basis:0%` 在**纵轴**生效并覆盖同文件 `:42` 的内联 `height:42px`，高度被压成「容器剩余空间」（实测 15px；容器 252.39，三个兄弟占 91.39+100+42）。同容器内宿主自己的整行 occupant 用 `flex: 0 1 auto` + 固定 `height:42px`。 | 期望：与宿主行同形（42 高、图标 x=18、溢出 `hidden`）。实际：15 高、图标 x=20、`overflow: visible`。**未观察到文字换行/溢出**（256px 行宽下标签单行 h=15，`scrollWidth === clientWidth`），故这是**可点区域与对齐**缺陷，不是文字错位。 | `src/client/components/SidebarPromptEntry.tsx:36-54`（`entryStyle`），特别 `:42`（height）与 `:45`（flex）；宿主容器类 `_9LHUqW_footerActions` |
| **D-2** | **缺陷（小-中）——变量填窗锚在 dock 行左缘而非 composer 卡片左缘** | 从推荐条打开变量填窗：填窗 `x=280`，而 composer 卡片（推荐条 BAR 与之对齐的那个盒子）`x=419` ⇒ **差 139px**，看起来明显偏左。若以 `composerStack`/`uI_N2W_root`（`x=280`）为参照则差 0px。 | 期望：判据说「与 composer 卡片左缘差 ≤ 2px」。实际：`ROW_ANCHOR` 无卡片宽度约束（`BAR` 有的 `maxWidth: var(--dsh-composer-card-max-width)` + `margin: 0 auto` 在 `pending` 分支里不生效）⇒ 锚在整行左缘。 | `src/client/components/ContextRecommendations.tsx:140-159`（`pending` 分支只渲染 `ROW_ANCHOR`）、`:193-205`（`ROW_ANCHOR`/`DIALOG_ANCHOR`）、`:207-223`（`BAR` 的卡片对齐约束） |
| **D-3** | **判据失败（T7-4）——一次批量导出后 `GET /prompts` 为 2 次** | 3 条技能合成成功导出（`Succeeded 3 · Failed 0`、`POST /skills/export` ×3）后，`GET /prompts` **2 次**（判据要求 1 次）；1 条导出对照也是 **2 次**、**同两个调用点** ⇒ 与导出条数无关。 | 判据字面：**应只出现一次**。实际：**每个 `data-changed` 订阅者各拉一次**（推荐条 `load` @bundle:2353；词库按钮一侧内联 `load` @bundle:3987）。**「每条导出各拉一次」的缺陷不存在**（N=1 与 N=3 都是 2）。 | `src/client/utils/data-sync.ts`（`notifyDataChanged` 单次广播 / `useDataChanged` 每订阅者各注册）+ `src/client/components/ContextRecommendations.tsx:108-112` 与 `src/client/components/PromptLibraryButton.tsx` 的 `useDataChanged` 调用点 |
| **D-4** | **缺陷（小）——关闭侧栏入口后首屏仍有 2 帧闪烁** | 三个显隐开关全 false 后新开页加载：两个 composer 按钮 **0 帧**（未见），但**侧栏入口出现 2 帧（≈33ms）后消失** ⇒ 「按默认渲染一次再消失」确有其事（只在侧栏入口这一处）。 | 期望：关闭的入口**一帧都不出现**。实际：2 帧。 | `src/client/components/SidebarPromptEntry.tsx:61-63`（`useSettings()` 默认快照先渲染）+ `src/client/utils/settings-store.ts`（默认值 → 宿主 scope 首推之间的窗口） |
| **O-1** | 观察（非缺陷）——推荐候选清单是**挂载期快照** | 我经 HTTP（绕过同页 data-sync）新建/删除提示词后，推荐条在**同一挂载期内**仍用旧清单（A1 里出现已删除条目、新条目缺席）；切换会话（重挂载）后即一致。 | 设计如此：`ContextRecommendations` 挂载拉一次 + `useDataChanged` 重拉（同页增删改通道）；页面外的写入不在该通道内 | `src/client/components/ContextRecommendations.tsx:107-112` |
| **O-2** | 观察（宿主/工具面）——shell 可横向滚动，Playwright `scrollIntoView` 会推动全局几何 | `div.XZJ-uW_frame` `scrollWidth=1857 > clientWidth=1280`；一次被阻断的 `locator.click` 把它的 `scrollLeft` 推到 **419**，使侧栏/输入区/面板全部左移 419px（读数随之失真）。已把 `scrollLeft` 归零并复核（卡片复回 `x=419`）。**随后所有几何读数均在 `scrollLeft=0` 下取得**。 | 宿主布局属性 + 工具面行为，非本插件 | 读数见 T8「宽态」两次独立抓取均为 `12/649/256/15`（一致） |
| **O-3** | 观察（沙箱）——`$DSH_HOME/skills/` 对本会话既不可写也不可删 | `mkdir -p $DSH_HOME/skills/zz-m8acc-probe` ⇒ `Operation not permitted`（`exit=1`）。故 T7-4 若走**真实**导出会留下**无法清理**的技能目录 ⇒ 与「不可逆变化 = 0」直接冲突。 | 本轮据此改用**合成成功信封**（客户端重拉路径完全不变，见 T7-4 行）。**真实导出**的磁盘副作用本轮**未发生**（`skills/` 计数 4 → 4）。 | 见 T7-4 行与 §6 |
| **O-4** | 观察（宿主 UI 互斥） | 管理面板打开时，本插件的 `[data-shell-overlay]` 遮罩拦住侧栏 `Settings` 的真实点击；设置页打开时，composer 上的词库按钮真实点击同样被遮罩拦住（Playwright `TimeoutError`，日志原文 `<div data-prompt-enhancer-claim="none"> … intercepts pointer events`）⇒ 两者**无法同屏操作**。 | 影响 T4 的「面板开着改设置」取证方式（已披露并给替代通道） | 见 T4 行 |
| **O-5** | 观察（产物一致性） | 首尾两次模块段 sha 均 = 本地产物，且当前**两个**含本模块的分组包 sha 相同；但**运行中期**的 console 栈里出现过一个 `rev=52e6b6172600` 的分组 URL（与首尾的 `rev=c9f1172a9de9` 不同，其内容现已不可再取）。 | 无证据表明被执行的是不同产物（sha 两次命中 + 现存两分组同 sha），但「全程逐帧同一产物」无法由 rev 强证 —— 如实记录 | 见 §9 |

## 8. 假设清单（本任务无法向人提问，按最强证据自定，逐条显式列出）

1. **设置页与已打开的管理面板互斥**（O-4 实测指针拦截）⇒ T4 的「改 `panelWidth/Height` 后**不重开面板**尺寸即变」改用**同一份设置文档**的写入通道（`PUT /api/prompt-enhancer/settings`）取证，另用设置页本身证明「改了就落盘、不刷新」。判据措辞的最终解释权归控制者。
2. **T7-4 用合成成功信封**：真实导出会不可逆地写 `$DSH_HOME/skills/`（O-3）。合成只改**响应**，客户端重拉路径（被计数的对象）完全不变；导出条数与选择流程都是真实的（`Select all` → 只留 3 条临时载体 → `Start export`）。
3. **T1 的前置用 HTTP 写开关**（判据只要求「设为 false 后刷新」），采样用**新开页 + `addInitScript`**（文档开始即装 rAF 采样器，采样页随后关闭，主页面零残留）。
4. **「真实键入」的口径**：字符一律经 `page.keyboard.type`（trusted）；**部分前置**的 composer 聚焦用**程序化 `focus()`**——因推荐条/浮层会遮住 composer 上半部，真实点击被拦截（Playwright 日志原文 `<span>M8acc Recommend Carrier</span> … intercepts pointer events`）。被判定的行为（R60 指针序列、R57 键盘序列、点击条目/按钮）**全部是真实信任事件**；程序化 focus 只用于「把草稿摆到前置状态」，且逐行披露。
5. **「composer 卡片」两口径都给了读数**（T3 左缘对齐行）：内层卡片 `uI_N2W_card` 与输入区栈 `uI_N2W_root/composerStack`。本表按判据字面取内层卡片判 FAIL。
6. **C4② 的拖选按 P6 的披露口径**（隐藏的 `pointerdown` + 真实 `Selection` 区间 + `pointerup`）。
7. **`#` 行「即时收起」用页面内写设置文档**（不点、不刷新）：该读数含 curl 往返 + 宿主→客户端推送延迟，故给的是「192 帧后转 0」而不是「1 帧」。
8. **会话切换只做导航**（A↔B 两次真实点击侧栏会话行，**未发任何聊天消息**）；切换后草稿由真实键入覆盖；收尾把 A 会话草稿还原为验收前原文（已复核）。
9. **几何读数统一在 `scrollLeft=0` 下取得**（O-2）；T8 宽态两次独立抓取逐值一致，可排除瞬态。

## 9. 证据时效声明

> **T10a-2 更新（HEAD `bf57001`）**：本轮产物身份与时效见 §13.1 / §13.7。
> **T10a-3 / 交付后变更更新（HEAD `d397dc6`）**：本波产物身份与时效见 §14.3 / §14.5。本节下列旧 HEAD / 旧 sha 读数原样保留为历史。

- **被验收提交**：`HEAD = 577bddec778bea893218db69993db6055e40f50d`（= `577bdde`）。验收期间**未做任何提交/构建/安装**：`lib/client.js` 的 sha256 在**开始与结束两次**测量中均为 `96b752a5392ede640df64b8a5480e87a3d106ddea4c5b98e510a5c0374d34c3b`（230248 字节）。
- **产物身份**（方式与结果见 §1）：活页面模块段（UTF-16 码元切片，去尾部 `//# sourceMappingURL=` 行连同其尾换行，再去宿主拼接的 `;\n`）的 sha256 = **`723b1ad67854ba11170b6f53bfd4b51be37fb3501cbbb45216fee348574172f1`**，**逐字等于**本地 `lib/client.js` 的对应切片（**验收开始时**与**全部验收结束后**各验一次，两次同值；旁证方向亦命中）。当前页面里**两个**含本模块的分组包取到同一 sha。**唯一保留意见**（O-5）：运行中期的 console 栈里出现过一个 `rev=52e6b6172600` 的分组 URL（首尾为 `rev=c9f1172a9de9`），其内容现已不可复取——「被测执行体全程同一」这一点由**两次 sha 命中**与**现存两分组同 sha** 支持，但不构成 rev 级的强证。
- **执行时间**：2026-09-25（本地）。页面：`http://127.0.0.1:3080`（`DSH Local Build` / `0.1.5-rc.2-c291e79`），`lang="en"`，窗口 `1280×720`（宿主 `XZJ-uW_frame` 可横向滚动，全部几何读数在 `scrollLeft=0` 下取得）。
- **不可逆变化 = 0**：`prompts / trash / tags / settings(13 键) / meta(8 行) / $DSH_HOME/skills/ / $DSH_HOME/prompt-enhancer/log/` 逐项等于验收前（前后原文见 §6）；页面内注入全消；**未发送任何聊天消息**；未重启 `dsh web`、未改 profile、未调用任何 `dev_*` 工具。
- **未改产品代码**：`src/**`、`scripts/**`、`lib/**`、`tests/**`、`package.json` 一字未动；本轮新增/修改的仓库内文件**只有本记录**（`docs/superpowers/plans/2026-09-25-p8-m8-acceptance.md`）。

## 10. 总判与逐档计数

> **T10a 追加轮后本节的计数已更新：见 §12（HEAD `9a36fb8`）、§13（HEAD `bf57001`）与 §14（HEAD `d397dc6`，交付后变更；不改变结论）。最新口径 = PASS 33 / FAIL 0 / 延期观感项 4 / 已知限制 1 / NOT RUN 1。** 本节下列 **29 / 5 / 1** 是 T10a **之前**的读数，按「不抹掉历史」原样保留。

**总判：M8 活体验收 = DONE_WITH_CONCERNS**（产品面 5 条 FAIL 全部是**可复核的几何/粒度/首帧**问题，无数据损坏、无崩溃、无不可逆变化）。

| 档 | 计数 | 明细 |
| -- | ---- | ---- |
| **PASS** | **29** | §1 产物身份（2 方向命中）；§2：T9 面板页签、P6/P7 面板内 6/6 判据、T4 设置页 11 行/13 键、T4 导航行出现、T4 面板尺寸即时生效、T8 窄态 28×28 + 验收 18；§3：验收 11 ①②、11③、11④、11 上下文分支、T3 会话切换、T3 变量填窗浮层、验收 12、`hashTriggerEnabled` 三档、验收 19、T2、回归 P4-2、回归 P7 coexist+跃迁、R60、R57、C1、C3、C9、P6 C4②、T7-1、T7-7；§5 零 console error（本插件 0 条）；§6 快照-复原 |
| **FAIL** | **5** | ① T8 侧栏几何（宽态：行高 15 vs 42、内容起点 x 差 2px）② T8 遗留（`overflow: visible` 且行高非 42）③ T3 填窗左缘对齐（139px，另一口径 0px）④ T1 首屏闪烁（侧栏入口 2 帧）⑤ T7-4 重拉粒度（2 次而非 1 次） |
| **NOT RUN** | **1** | 验收 14（宿主侧 systemPrompt section 账本读数；原因与归属见 §4） |

- **不可逆变化数 = 0**（`prompts / trash / tags / settings×13 / meta×8 / skills / ai-log` 逐项前后原文相等，页面内注入全消，未发消息）。
- **产物 sha256**：本地 `lib/client.js` 全文件 = `96b752a5392ede640df64b8a5480e87a3d106ddea4c5b98e510a5c0374d34c3b`；活页面模块段（去 `sourceMappingURL` 行）= `723b1ad67854ba11170b6f53bfd4b51be37fb3501cbbb45216fee348574172f1`（= 本地同一切片）。
- **缺陷清单**：D-1（侧栏入口行高 15px / 内容起点差 2px，`SidebarPromptEntry.tsx:42,45`）、D-2（变量填窗锚错盒子，`ContextRecommendations.tsx:140-159,193-205`）、D-3（批量导出后 `GET /prompts` 2 次，`data-sync.ts` + 两个 `useDataChanged` 调用点）、D-4（关侧栏入口后首屏 2 帧闪烁，`SidebarPromptEntry.tsx:61-63` + `settings-store.ts` 默认快照窗口）。**观察**：O-1 推荐候选为挂载期快照（设计）、O-2 shell 横向滚动 + Playwright scrollIntoView 影响几何（宿主/工具）、O-3 `$DSH_HOME/skills/` 沙箱不可写不可删（影响 T7-4 取证方式）、O-4 管理面板与设置页互斥、O-5 一个中期出现的不同 `rev` 分组 URL。

## 11. 给控制者的三处待裁

1. **T7-4 的判据口径**：现状是「**每个 `data-changed` 订阅者各重拉一次**」（本轮 2 个订阅者 ⇒ 2 次），而**不是**「每条导出各拉一次」（N=1 与 N=3 实测同为 2 次）。请裁定：判据「只应出现一次」是按**通知次数**（现状即 PASS）还是要求产品**收敛为每批 1 次**（则现状 FAIL，需要把重拉合并去重）。
2. **T3 「composer 卡片」的定义**：内层卡片 `uI_N2W_card` ⇒ 差 **139px**（FAIL）；输入区栈 `composerStack`/`uI_N2W_root` ⇒ 差 **0px**（PASS）。请按设计意图确认参照物。
3. **T8 宽态的修法**：D-1 的根因是 `flex: 1 1 0%` 落在**纵轴**容器里。修法有两类——(a) 回到宿主同形（`flex: 0 1 auto` + 固定 `height:42`，必要时与宿主 join 到同一 `triggerRow`），(b) 让宿主给本座位一层行容器。本任务不修代码。

## 12. T10a 追加轮：两处修复的复测（取自已热重载的新产物 HEAD `9a36fb8`）

> 控制者本轮落地并热重载了两个修复：`4d97502`（侧栏入口行高）+ `9a36fb8`（变量填窗横向锚点）。本节只做**复测与前后对照**，不改产品代码；§1–§11 的读数原样保留为历史。

### 12.1 产物身份再自证（新产物）

| 动作 | 读数 |
| --- | --- |
| 新 HEAD | `9a36fb84cc262f59fe765d72ea8b82137d3e28a1`（`git log` 顶部 = `9a36fb8`，与控制者值一致） |
| 新本地产物（全文件） | `shasum -a 256 lib/client.js` = **`8a5e9ff1fdb7300766dec78bbed98d97651c6969ef246ddf7623e49060d57142`**（230400 字节 / 225885 码元）—— 与控制者补发的对账值**逐字相同** |
| 本地切片候选 | L4（去尾部 `\n//# sourceMappingURL=client.js.map\n`）= `f7349890a471cf99c53252d8bd25cb81cd2a58136ec576575a2fa27beb11c563`（225849 码元）；L3（再去尾换行）= `dd4ddf64bbd45db32f2e396fa3fc571a2f805b309a3f7fc2ecc503c552740a5f` |
| 活页面模块段 | 起点标记命中 **1 次**；切片 225849 码元，sha256 = **`f7349890a471cf99c53252d8bd25cb81cd2a58136ec576575a2fa27beb11c563` = 本地 L4**；再去尾换行 = **`dd4ddf64bbd45db32f2e396fa3fc571a2f805b309a3f7fc2ecc503c552740a5f` = 本地 L3**（两方向命中） |
| 分组 URL | `/plugins/??…,dsh-prompt-enhancer/client.js&rev=47b20d4ff26b`（本轮 rev 与 §9 的 `c9f1172a9de9` 不同——因产物已被重建/热重载；**判据以切片 sha 为准**，两方向逐字命中） |

⇒ **本轮复测取自新产物**（不是旧 bundle 的缓存）：复测前做过一次整页 reload，之后所有读数都在新模块段上取得。

### 12.2 原 FAIL ①（侧栏行高）复测

| 读数 | 修复前（§2 原读数） | 修复后（本轮） | 判定 |
| --- | --- | --- | --- |
| 我方入口 rect | `x12 y649 w256 h15` | **`x12 y622 w256 h42`** | **行高 PASS（42 = 宿主 42）** |
| 宿主对照 | `Settings x10 y668 w260 h42`、`Context Insights x10 y580 w260 h42` | 同（42） | — |
| left edge 差 | 2（12 vs 10） | **2（未变、未劣化）** | PASS（判据容忍 ≤2px） |
| 图标 x（内容起始） | 20 vs 18 = 2 | **20 vs 18 = 2（未变、未劣化）** | 仍差 2px：按字面「相同」未达标；若同采左缘的 ≤2px 容忍则达标——**请控制者定** |
| 文字起点 x | 38 vs 42 | 38 vs 42（未变） | 同上量级 |
| computed `flex` / `align-self` | `1 1 0%` / `auto` | **`0 0 auto` / `stretch`** | 与修复描述一致（弃 `flex:1`，改交叉轴 stretch） |
| 窄态（`wide=false`）回归 | 28×28 纯图标；点击开面板 | **28×28 纯图标**（`x7.5 y535`、`padding:0`、1px 描边、唯一子节点 svg、`innerText === ""`）；真实点击 ⇒ `manager=1`、`aria-label="Prompt manager"`；切回宽态复为 `x12 y622 w256 h42` | **无回归** |

### 12.3 原 FAIL ②（`overflow` / `line-height` 对齐）复测

| 读数 | 修复前 | 修复后（本轮） | 判定 |
| --- | --- | --- | --- |
| `overflow` | `visible`（宿主 `hidden`） | **`hidden`** | **对齐 PASS** |
| `white-space` | `normal` | `normal`（宿主亦 `normal`） | 对齐 |
| `line-height` | `normal`（宿主 `22px`） | **`264px`**（宿主 `22px`） | **仍不一致 ⇒ FAIL**（新根因见 D-5） |
| 文字换行 | 未观察到 | **仍未观察到**（标签单行；文字 Range rect `w47.4 h15`） | 无换行 |
| 内容溢出 | 未测 | **观察到内容盒溢出**：按钮 `scrollHeight 153 > clientHeight 42`、内层 `span` 盒高 **264px**（起点 y=511，远高于所在 42px 行），被 `overflow: hidden` 裁掉；**字形本身仍落在可见带内**（Range rect y=635..650 ⊂ 按钮 622..664） | **溢出存在但被裁**（不是文字不可见故障） |

**D-5（本轮新发现 / 上一条的根因）**：`src/client/components/SidebarPromptEntry.tsx` 的 `lineHeight: wide ? 22 : undefined` 在 **React** 里落成**无单位** `line-height: 22`（React 不对 `lineHeight` 补 `px`），CSS 按「字号倍数」解释 ⇒ `22 × 12px = 264px`。**实测**：元素内联属性原文含 `… overflow: hidden; line-height: 22; font-size: 12px; …`，而 `getComputedStyle().lineHeight === "264px"`。**修法**：写成 `lineHeight: "22px"`。**当前无可见故障**（`align-items: center` + `overflow: hidden` 让 15px 字形落在 42px 行内），但依赖巧合，且「与宿主 line-height 一致」不成立。

### 12.4 原 FAIL ③（变量填窗左缘）复测 + 推荐条零回归

| 读数 | 修复前（§3 原读数） | 修复后（本轮） |
| --- | --- | --- |
| 填窗 rect | `x280 y313.5 w322 h200.5`（bottom 514） | **`x419 y313.5 w322 h200.5`**（bottom 514） |
| composer 卡片 rect | `x419 y568 w712 h98` | **`x419 y568 w712 h98`**（同值） |
| **左缘差** | **139px** | **0.00px** ⇒ **PASS（≤2px 达标）** |
| 填窗底 vs 卡片顶 | 54px（浮在上方） | **54px（同）** |
| composer 输入区 rect（填窗开/关） | `x419 y576 w708 h36` | **同值**（开/关逐值相同 ⇒ 不挤动 composer） |
| 推荐条（开填窗前）几何 | `x419 y490 w712 h30`（草稿 `m8acc recommend carrier`，hits=4） | **`x419 y490 w712 h30`**（本轮草稿 `m8acc variables`，hits=2）⇒ **矩形逐值相同 = 零回归** |
| 填窗打开时推荐条 | 被 `pending` 分支替换（既有行为） | 同（`[data-prompt-enhancer-recommend]` 不在 DOM）；填窗输入框 = `["M8主题","代号"]` |
| 副作用 | 上轮点 Cancel 后 meta 未变 | **Cancel 后填窗消失、`window.__useCalls = 0`**（未发任何 `POST /prompts/:id/use`）⇒ 零副作用 |

**口径披露（本轮为满足「只读」纪律，零数据写入）**：`GET /prompts` 由**页面内 fetch 包装**注入一条**合成**含变量提示词（id `m8acc-var-synth`、title `M8acc 变量填窗载体`、body `请把 {{M8主题}} 与 {{代号}} 整理成三条要点。`），并用插件自己的同页广播 `window.dispatchEvent(new Event("prompt-enhancer:data-changed"))`（`data-sync.ts#DATA_CHANGED` 的公开事件名）触发重拉 ⇒ **未创建任何 DB 记录**（与上一轮用临时载体不同）。填窗是**真实组件**读数（合成只影响候选清单）。整页 reload 后包装与合成清单全消（实测 `__origFetch`/`__useCalls` 均 `undefined`）。

### 12.5 控制者两项裁决的落账

- **原 FAIL ④（T1 首屏闪烁）⇒ 改档「已知限制 / 不修」**（按控制者裁决，不再计入 FAIL）。**读数保留**：三开关全 false、新开页 rAF 采样 **409 帧 / 7.0s** ⇒ `Open the prompt library` **0 帧**、`AI polish` **0 帧**、`Prompts`（侧栏入口）**2 帧**（第 5–6 帧，t≈335ms）。**成因**：设置 store 在宿主 settingsScope 首推快照之前按**默认值**渲染（`SidebarPromptEntry.tsx:61-63` 的 `useSettings()` + `settings-store.ts` 的默认快照）。**代价**：消除它需重新引入已被移除的「未就绪 null 态」——把「默认值可见」换成「加载态空窗」，并把 store 读口变成可空类型（波及全部 `useSettings()` 调用点）。**结论**：以 2 帧 / ≈33ms 的入口闪现换取类型与加载态的简洁，接受为已知限制。
- **原 FAIL ⑤（T7-4 重拉粒度）⇒ 改判 PASS，判据更正为「重拉次数与导出条数 N 无关」**（按控制者裁决）。**成对读数保留**：N=3 ⇒ `POST /skills/export` 3 次、`GET /prompts` **2 次**；N=1 ⇒ `GET /prompts` **仍是 2 次**，两次的调用栈**同为** `bundle:2353`（推荐条 `ContextRecommendations.load`）与 `bundle:3987`（词库按钮一侧）。⇒ 批末只广播**一次** `prompt-enhancer:data-changed`，**两个独立订阅者各重拉一次**属订阅语义；原判据「只应出现一次」**是判据写错**（已由控制者更正）。**T10a 后本项计 PASS。**

### 12.6 原 NOT RUN（验收 14）本轮补强

- **插件侧正面证据（新拿到，可复核）**：
  - `grep -rn "systemPrompt" src/` ⇒ **1 处命中且是注释**：`src/index.ts:10`「本插件**刻意不注册任何 systemPrompt section**（规格 §2.2 的硬约束）」⇒ **0 处注册调用**。
  - `npm run smoke` ⇒ **PASSED**；`register 7 条账本逐条相符` 的原文 = **`[["conversation.input.left","prompt-enhancer",10],["conversation.input.overlay","prompt-enhancer-hash",20],["conversation.input.left","prompt-enhancer-ai-polish",11],["shell.overlay","prompt-enhancer",100],["sidebar.footer.action","prompt-enhancer",100],["conversation.input.dock","prompt-enhancer-recommend",10],["settings.section","prompt-enhancer",30]]`** ⇒ **7 条全是官方 UI 插槽，无一条 systemPrompt section**；同批读数 `exported.inject deep-equal ["slots","locale"]`、`ctx.inject 记录 deep-equal [["slots"],["uiWorkspace"],["uiConversation"],["settingsScope"]]`。
- **宿主侧 section 账本：仍未拿到（NOT RUN 核不变）**。三条备选通道逐一验死：① 会话日志**不含 LLM 请求负载/系统提示词正文**（该日志事件类型只有 `user/message, assistant/message, tool/call, tool/result, step/start, step/end, sandbox/mode, approval/policy …`）；我在日志里取到的 `"sections":[…]` 其兄弟键为 `kind/plugin/form`，是**插件上下文注入**记录（4 条：`dsh-super-injector`/`sandbox:policy`/`approval:policy`/`subagent:delegation`），**不是** systemPrompt 的 section 账本（本 workspace 全部 135 个会话该数组都是这 4 条、**无 prompt-enhancer**）；② `POST /api/dsh-context/detail` 直连回 `unauthorized`；③ 无 `dsh` CLI / `--dump-config`。
- **反面证据（宿主 persona 仍生效）：拿到「宿主源码原文 + 本部署配置为空」这一对，仍无运行时装配读数**：
  - 宿主 `packages/core/system-prompt/src/index.ts`（checkout 只读）原文：`export const PERSONA_PREFIX_SECTION = 'deployment:persona-prefix'`（:174）、`export const PERSONA_SUFFIX_SECTION = 'deployment:persona-suffix'`（:177）；配置面 `personaPrefix: z.string().default('')` / `personaSuffix: z.string().default('')`（:403-404）；注册处 `text: config.personaPrefix ?? ''` / `personaSuffix ?? ''`（:430/:435）；另有 identity 开关（:243「Include the fixed DeepSeek Harness identity before the deployment persona (default true)」）。
  - 本部署配置：`grep -rn "persona" ~/.dsh/profiles/*/ ~/.dsh/*.yml` 只命中 `node_modules` 里的第三方文档，**无任何部署配置设置 personaPrefix/personaSuffix** ⇒ 本部署 persona 文本取默认 **`''`**。
  ⇒ **结论**：`deployment:persona-*` 是**宿主内置**注册的 section（插件无法增删），在本部署其文本为空 ⇒「宿主默认 persona 仍生效」在本部署**可证但不显著**。核判据（section 数 = 0 的**宿主侧账本**）**保持 NOT RUN**。

### 12.7 T10a 后的逐档计数（本文档最新口径）

| 档 | 计数 | 明细变化 |
| -- | ---- | -------- |
| **PASS** | **31** | = §10 的 29 项 **+ 原 FAIL ③（填窗左缘 139px → 0px）+ 原 FAIL ⑤（T7-4，判据更正为「与 N 无关」）**；T8 宽态一行**部分达标**（行高与左缘达标，内容起始 x 仍差 2px） |
| **FAIL** | **2** | ① **T8 宽态侧栏几何**：行高 42 ✓ / left edge 2px ✓ / **内容起始 x 仍差 2px（未完全达标）**；② **T8 遗留（overflow 与 line-height 对齐）**：`overflow` 已对齐 ✓，但 **`line-height` 264px vs 宿主 22px（D-5）**、按钮内内容盒溢出被裁 |
| **已知限制（不修）** | **1** | 原 FAIL ④（首屏侧栏入口 2 帧闪烁）—— 按控制者裁决改档，读数与代价见 §12.5 |
| **NOT RUN** | **1** | 验收 14 的**宿主侧 section 账本**（插件侧正面证据 + 宿主 persona 源码证据已补，见 §12.6） |

- **本轮不可逆变化 = 0**：本轮**未写任何数据**（无临时载体、无设置写）；`prompts`（1 条、`usageCount` 仍 **11**、`lastUsedAt` 未变）/`trash`(`[]`)/`tags`(`[{"name":"欢迎","count":1}]`)/`settings`(13 键)/`meta`(8 行)/`$DSH_HOME/skills/`(4)/`ai-log`(628 B、mtime `Sep 24 23:18` 未变) 逐项与 §6 的验收前原文相等；页面内注入（`fetch` 包装 + 合成候选）整页 reload 后全消；composer 草稿逐字还原为 `T5c Evict probe draft #C`（`claim=["hash"]`，与验收前同态）；**未发送任何聊天消息**；未动装配（未调用 `dev_*`、未重启 `dsh web`、未改 profile）。
- **本次复测取自 HEAD `9a36fb8`**（新 `lib/client.js` sha `8a5e9ff1…`；活模块段切片 `f7349890…` 双向命中），页面 `http://127.0.0.1:3080`、窗口 1280×720、`scrollLeft=0`。整页 reload 后 console：`Total messages: 3 (Errors: 2, Warnings: 0)` —— 两条 error 仍是第三方 `WorkBuddyProbeControl`（`conversation.input.right` 座位崩溃），**本插件 0 error / 0 warning**。
- **本轮未改产品代码**：唯一写过的文件仍是本记录。

## 13. T10a 追加轮第 2 次复测：修复 C（HEAD `bf57001`）——侧栏入口与宿主行逐值对齐

> 控制者本轮落地修复 C（`bf57001`）并重新热重载：(a) `lineHeight: 22` → `"22px"`（修 D-5），(b) 宽态 `marginInline: -2`。本节只做**复测与前后对照**；§1–§12 的读数原样保留为历史。

### 13.1 产物身份再自证（第 3 个产物）

| 动作 | 读数 |
| --- | --- |
| 新 HEAD | `bf570012bd8098a5b5fad71c96444306a5b4d051`（= `bf57001`；`git log` 顶部 = 「fix(client): give the sidebar entry the host row line box and inset」） |
| 新本地全文件 | `shasum -a 256 lib/client.js` = **`50c51d307dbafe8acf6d2fe5f71ce981d70b7770c49c5a4504c2f7faf42a0aa9`**（230442 字节 / 225927 码元）—— 与控制者给的对账值**逐字相同** |
| 本地切片候选 | L4（去尾部 `\n//# sourceMappingURL=client.js.map\n`）= `4a542587a938fa486f31c664eef9c2c92504f1b417671ef23e91709953b3063b`（225891 码元）；L3（再去尾换行）= `0ae51585301768a186429aa965aa0b0c1ee7819aed1e5ff9066118ab0904765e` |
| 活页面模块段 | 起点标记命中 **1 次**；切片 **225891** 码元，sha256 = **`4a542587a938fa486f31c664eef9c2c92504f1b417671ef23e91709953b3063b` = 本地 L4**；再去尾换行 = **`0ae51585301768a186429aa965aa0b0c1ee7819aed1e5ff9066118ab0904765e` = 本地 L3**（**双向命中**） |
| 分组 rev | `e44cba18b2b8`（与 §12.1 的 `47b20d4ff26b`、§9 的 `c9f1172a9de9` 都不同——每次重建都会变；**判据一律以切片 sha 为准**） |

**工具面插曲（如实记录）**：本轮第一次 `page.reload()` 之后 Playwright 的页面变成 `about:blank`（`performance.getEntriesByType('resource')` 为空、`fetch(undefined)` 抛 `Failed to parse URL`）。随后 `browser_navigate` 回到 `http://127.0.0.1:3080` 即恢复（会话与草稿由宿主还原）；本节的**身份与全部几何读数都是在恢复后的新产物上取得的**。

### 13.2 侧栏四项 vs 宿主 `button.lc-ov-entry`（逐值对照）

宿主参照物按控制者的活体结论取 **`button.lc-ov-entry`**（第三方 `dsh-context` 插件的行，`innerText = "Context Insights"`；它**在活体 DOM 里确实存在**，§3 已把它当作宿主行之一测过）。

| 项 | 我方 `button[aria-label="Prompts"]` | 宿主 `button.lc-ov-entry` | 是否相等 |
| --- | --- | --- | --- |
| **left edge x** | **10** | **10** | **✓ 相等** |
| **宽度** | **260** | **260** | **✓ 相等** |
| **行高** | **42** | **42** | **✓ 相等** |
| **内容起始 x（首个子项 svg）** | **18** | **18** | **✓ 相等** |
| margin | `0px -2px` | `0px -2px` | ✓ 相等 |
| padding | `0px 10px 0px 8px` | `0px 10px 0px 8px` | ✓ 相等 |
| line-height | `22px` | `22px` | ✓ 相等 |
| overflow | `hidden` | `hidden` | ✓ 相等 |
| `scrollWidth / clientWidth` | 260 / 260 | 260 / 260 | ✓ 相等 |
| `scrollHeight / clientHeight` | **42 / 42** | 42 / 42 | ✓ 相等（无溢出） |
| 文字 `span` 盒高 | **22** | 22 | ✓ 相等 |
| flex / align-self | `0 0 auto` / `stretch` | `0 1 auto` / `auto` | ✗ 不同（但**不产生任何几何差异**，归入 §13.5 延期项） |
| fontSize / borderRadius / gap / 图标尺寸 | 12px / 6px / 4px / 14×14 | 14px / 12px / 8px / 16×16 | ✗ 不同 ⇒ **延期观感项**（§13.5，**不计 FAIL**） |

**明确回答**：**原 FAIL ① 现在完全关闭**——判据里的四项（left edge / 内容起始 x / 宽度 / 行高）与宿主参照行**逐值相等（差 0px）**，**不再需要任何 ≤2px 容差**。

### 13.3 D-5 是否关闭

| 读数 | §12.3（修复前） | 本轮（修复 C 后） |
| --- | --- | --- |
| computed `line-height` | `264px` | **`22px`** |
| 内层 `span` 盒高 | 264px | **22px** |
| 按钮 `scrollHeight / clientHeight` | 153 / 42（溢出被裁） | **42 / 42（相等，不再溢出）** |
| 文字换行 | 未观察到 | **仍未观察到**（单行，`span` rect h=22） |

⇒ **D-5 已修**（原读数保留在 §12.3 作为前后对照）。

### 13.4 负边距（`marginInline: -2`）副作用核查

| 检查项 | 读数 | 判定 |
| --- | --- | --- |
| `document.documentElement` 横向滚动 | `scrollWidth` **1280** === `clientWidth` **1280** | **无** |
| 宿主 shell `.XZJ-uW_frame` | `scrollWidth 1857 > clientWidth 1280`（`scrollLeft 0`） | **与 §3 / O-2 旧读数同值** —— 宿主自身既有属性，**非本次边距引入** |
| 同列 occupant `button.lc-ov-entry` | `x10 y580 w260 h42` | 与 §12.2 的 T10a-1 读数**逐值相同** |
| 同列 occupant `Settings` | `x10 y668 w260 h42` | 与 §12.2 / §2 读数**逐值相同** |
| 同列 occupant `cm-footer-stack`（Simplify the sidebar） | `x12 w256 h91.39` | `x/w` 与 §3 的修复前读数相同；`y` 相对修复前 −27px，由**修复 A 的行高 15→42**（列底锚定）引起，**非边距引起** |
| 同列 occupant `ccp-foot`（Command Code…） | `x12 w256 h100` | 同上（`y` 的 −27px 同因） |
| 轨道态（`wide === false`） | **28×28 纯图标**（`x7.5 y535`、`padding:0`、**`margin:0`（负边距只在宽态生效）**、1px 描边、唯一子节点 `svg`、`innerText === ""`）；真实点击 ⇒ `[data-prompt-enhancer-manager]` 计数 1、`aria-label="Prompt manager"` | **无回归** |
| 切回宽态 | `x10 y622 w260 h42`、`margin 0px -2px` | 与本节读数一致 |

⇒ **负边距零副作用**（文档级无横向滚动、同列宿主 occupant 几何未因边距改变、窄态未受影响）。

### 13.5 延期观感项（待用户裁定；**不计 FAIL**）

| 项 | 我方 | 宿主 `lc-ov-entry` | 归属 |
| --- | --- | --- | --- |
| `fontSize` | 12px | 14px | 控制者已明确延期 |
| `borderRadius` | 6px | 12px | 同上 |
| `gap` | 4px | 8px | 同上 |
| 图标尺寸 | 14×14 | 16×16 | 同上 |
| 结构项：`flex` / `align-self` | `0 0 auto` / `stretch` | `0 1 auto` / `auto` | 不产生几何差异；随观感项一并延期 |

### 13.6 推荐条 / 变量填窗无回归（复取）

| 读数 | §12.4（T10a-1） | 本轮（T10a-2） |
| --- | --- | --- |
| 推荐条 rect | `x419 y490 w712 h30` | **`x419 y490 w712 h30`**（逐值相同） |
| 推荐条 hit 数 / 条目 | 2 / `[欢迎使用提示词增强, M8acc 变量填窗载体]` | **2 / 同两条**（同一合成候选口径，见 §12.4 的口径披露） |
| 填窗 rect | `x419 y313.5 w322 h200.5` | **`x419 y313.5 w322 h200.5`**（逐值相同） |
| 填窗左缘 vs 卡片左缘 | 0.00px | **0.00px**（卡片 `x419`） |
| 填窗输入框 | `[M8主题, 代号]` | 同 |
| Cancel 后 | 填窗消失、`__useCalls=0`、卡片不变 | **同** |

### 13.7 第 2 轮后的逐档计数（最新口径）

| 档 | 计数 | 说明 |
| -- | ---- | ---- |
| **PASS** | **33** | = §12.7 的 31 **+ 原 FAIL ①（侧栏四项与宿主逐值相等，容差已不需要）+ 原 FAIL ②（overflow 对齐、`line-height` 22px、`scrollHeight == clientHeight`，D-5 已修）** |
| **FAIL** | **0** | 无 |
| **延期观感项（待用户裁定）** | **4**（+1 结构项） | `fontSize` / `borderRadius` / `gap` / 图标尺寸（§13.5），**不计 FAIL** |
| **已知限制（不修）** | **1** | 首屏侧栏入口 2 帧闪烁（§12.5，控制者裁决） |
| **NOT RUN** | **1** | 验收 14 的宿主侧 section 账本（§12.6） |

- **本轮不可逆变化 = 0**：**未写任何数据**（无临时载体、无设置写）、未发消息；`prompts`（1 条、`usageCount` 仍 **11**、`lastUsedAt 1790300582270`、`updatedAt 1790256837615`）/`trash`(`[]`)/`tags`(`[{"name":"欢迎","count":1}]`)/`settings`(13 键)/`meta`(8 行)/`$DSH_HOME/skills/`(4)/`ai-log`(628 B、mtime `Sep 24 23:18`) 逐项与验收前原文相等；页面内注入两次整页 reload 后全消（`__origFetch`/`__useCalls` 均 `undefined`）；消息：**未发送任何聊天消息**；装配：未调用 `dev_*`、未重启 `dsh web`、未改 profile。
- **本次复测取自 HEAD `bf57001`**（新 `lib/client.js` sha `50c51d307dbafe8acf6d2fe5f71ce981d70b7770c49c5a4504c2f7faf42a0aa9`；活模块段切片 `4a542587…` **双向命中**；分组 rev `e44cba18b2b8`），页面 `http://127.0.0.1:3080`、窗口 1280×720、`scrollLeft=0`。
- **composer 草稿的一处不确定性（如实披露）**：本轮开始时实测草稿为 `m8acc variables`（不是上一轮收尾时还原的 `T5c Evict probe draft #C`）——`about:blank` 插曲期间的宿主持久化状态无法回溯确认。已按**验收前原文**还原为 `T5c Evict probe draft #C`，并在整页 reload 后复核仍为该值（`claim=["hash"]`，与验收前同态）。
- **仓库**：`git status --porcelain` 仍只有两个 untracked 文档（SDD 计划文件 + 本记录）；**本轮未改产品代码**，唯一写过的文件是本记录。

## 14. 交付后变更（修复波 `d397dc6`）：轻量活体复验 + 变更说明

> 本波对应最终评审的 4 项代码发现（+2 项收尾），由控制者落地并重新热重载；本节只做**与本波改动直接相关**的轻量活体复验与说明。**§1–§13 一字未改，全部历史读数保留。**

### 14.1 本波改了什么（提交 `d397dc6`：14 文件 / +360 −20）

| # | 改动 | 作用（一句话） |
| - | ---- | -------------- |
| 1 | `src/client/utils/settings-store.ts`（+38） | 新增 `isSettingsReady()` + `fallbackLanded`：有 scope ⇒ 就绪看宿主快照 `status === "ready"`；无 scope ⇒ **只有**那次降级读**成功落地**才就绪（失败/在途永远不就绪）；`setSettingsScope(null)` 重新武装时归零；该查询**不触发 I/O** |
| 2 | `src/client/utils/capture.ts`（+23） | 淘汰预检前加**就绪闸门**：不就绪即抛可读错误（恢复「失败关闭 + 可见」性质），错误复用调用方既有失败分支（渲染 `err.message` + `console.warn`） |
| 3 | `src/client/components/ImportExportModal.tsx`（+8） | 同款闸门 ⇒ 落进该弹窗既有的 `countsFailed` 可见提示 |
| 4 | 新增 `src/settings-shape.ts`（+12）；宿主 `src/host/settings.ts`（+8）与客户端 `src/client/index.ts`（+11） | `SETTINGS_NAMESPACE` 从两处字面量搬进**零依赖共用模块**（唯一真源）：宿主改为转发、客户端改为 import ⇒ 漂移在测试里即红 |
| 5 | `src/client/components/settings/SettingsSection.tsx`（+5） | 探测失败分支的 `console.warn` 移到 `if (!alive) return;` **之前**（错误恒可见），状态回写仍在守卫之后 |
| 6 | 测试：`api.test.mjs` +49、`capture.test.mjs` +75、`delete-prompts.test.mjs` +33、新增 `settings-shape.test.mjs` +44、`settings-store.test.mjs` +53 | 新增守门用例（见 §14.4），未删改既有断言 |

### 14.2 哪些验收判据受影响、为什么行为不变（本轮读数）

**判据分析**：闸门只在「**不就绪**」时改变行为（由 fail-open 变回 fail-closed）。本部署**有 `settingsScope`** ⇒ 就绪条件退化为「宿主快照 `status === ready`」，而验收期与本轮都实测「镜像早已就绪」（`GET /settings` 始终回真值、设置页 13 键即真值、改键即时生效）⇒ **正常路径的读数字面上应与验收时一致**。以下是本轮实测（含一次**真实落库**，随后删除）。

| 复验面 | 读数（本轮，HEAD `d397dc6`） | 与验收时对比 |
| ------ | -------------------------- | ------------ |
| **1. 沉淀（capture）流程** | 真实点击 composer 词库按钮 ⇒ 面板 `aria-label="Saved prompts"` 打开（按钮含 `Save current draft as prompt`/`Manage`）→ 真实点击 `[aria-label="Save current draft as prompt"]` ⇒ 面板直接进**新建详情态**：`[role="listitem"]` 计数 **0**、`textarea[aria-label="Body"].value === "T5c Evict probe draft #C"`（= 草稿原文）、`input[aria-label="Title"].value === ""`、按钮集 `[… Back to list, Save]`；再**真实点 `Save`** ⇒ `[role="status"]` 原文 **`Saved`**、`role="alert"` **0 条**、**成功落库**（新建条目原文：`{"id":"433388bb-0301-430b-904c-dce652329feb","title":"T5c Evict probe draft #C","body":"T5c Evict probe draft #C","tags":[],"summary":"","aiRefined":false,"aiRefinedAt":0,"createdAt":1790342654826,"updatedAt":1790342654826,"usageCount":0,"lastUsedAt":0,"skillExportedAt":0}`） | 与 §3 的 C3 读数**逐项一致**（同一预填语义、同一按钮集、无新错误提示、无新 console warn） |
| **1b. 该临时条目的复原** | `DELETE /prompts/433388bb…` ⇒ `{"deleted":true}`（进回收站）→ `DELETE /trash/433388bb…` ⇒ `{"removed":1}`；此后 `GET /prompts` **逐字节等于**验收前原文（1 条种子、`usageCount 11`、`lastUsedAt 1790300582270`、`updatedAt 1790256837615`），`/trash` `[]`、`/tags` `[{"name":"欢迎","count":1}]`、`meta` 8 行 | **0 残留**（本条是本轮唯一的真实写；已完全复原） |
| **2. 导入导出的超限提示路径** | 管理面板 → `Import & export` 页正常打开（tabpanel `aria-label="Import & export"`），原文 `Export backup` / `Choose a backup file…`，`role="alert"` **0 条** | 与 §3 的面板判据一致；**无新错误**（本轮不真的导入） |
| **3. 设置页渲染** | **11 视觉行 / 13 控件**；行标签逐条相同（`AI model` / `Panel width / height` / `Library button next to the composer` / `Library button shows its icon only` / `AI polish button` / `AI button shows its icon only` / `# trigger suggestion overlay` / `Context suggestions` / `Save selected text as a prompt` / `Sidebar entry` / `Storage limit`）；控件值全在基线（`Width 420` / `Height 560` / 8 个 checkbox = true / `Storage limit 300` / `Provider ""` / `Model ""`），`role="alert"` **0 条** | 与 §2 的 T4 读数**逐值相同** |
| **4. 零 console error** | 整页重挂载后 `Total messages: 3 (Errors: 2, Warnings: 0)`；两条 error 仍是第三方 `WorkBuddyProbeControl`（`slot entry crashed in 'conversation.input.right'`）；**归本插件的 error / warning = 0 / 0**（本轮 capture / 导入导出 / 设置页三处操作**没有产生任何 `[prompt-enhancer]` 痕迹**） | 与 §5 / §12.7 / §13.7 的验收读数一致 |

⇒ **行为不变**：本波改动在「就绪」路径上是纯守门（不加 I/O、不改渲染），验收期的全部读数在本轮复验中逐项复现。

### 14.3 产物身份再自证（第 4 个产物）

| 动作 | 读数 |
| --- | --- |
| 新 HEAD | `d397dc6eb890d07ac93363f57a8649f636d8f986`（= `d397dc6`；`git log` 顶部 = 「fix(client): close the settings fail-open path and pin three load-bearing paths」） |
| 新本地全文件 | `shasum -a 256 lib/client.js` = **`7c7b2f23e4b64adc3721b2ec0da55aab18e4b7f838404640ecafc90f60bff6e9`**（231096 字节 / 226581 码元）—— 与控制者给的对账值**逐字相同** |
| 本地切片候选 | L4（去尾部 `\n//# sourceMappingURL=client.js.map\n`）= `62f855dfa4a72a6057136d51e215a47b5121c3ae1016ff0f5e6af8cc2f3e1e55`（226545 码元）；L3（再去尾换行）= `70e3025c37d4621deb7eb1bf6e1c37fbbb86c4996146d4684bc73d9365ea28f4` |
| 活页面模块段 | 起点标记命中 **1 次**；切片 **226545** 码元，sha256 = **`62f855dfa4a72a6057136d51e215a47b5121c3ae1016ff0f5e6af8cc2f3e1e55` = 本地 L4**；再去尾换行 = **`70e3025c37d4621deb7eb1bf6e1c37fbbb86c4996146d4684bc73d9365ea28f4` = 本地 L3**（**双向命中**） |
| 分组 rev | `bc2cf36303cd`（与 §9 `c9f1172a9de9`、§12.1 `47b20d4ff26b`、§13.1 `e44cba18b2b8` 都不同——每次重建都变；**判据一律以切片 sha 为准**） |

### 14.4 新增的自动化判据

- **控制者前置核验（其报告，本轮未重跑门槛）**：四项门槛全绿 —— `npm run typecheck` / `npm test` **375/375** / `npm run build` / `npm run smoke`；`git status` 只剩两个未跟踪文档。
- **我的独立复核（`git show --stat HEAD` / `git show HEAD -- tests/`，只读、不重跑）**：本提交 14 文件 / **+360 −20**；测试改动量与新增的 `test(` 标题已逐一取出（见下）。**计数口径（已定位；控制者实测 + 我独立复算一致）**：早先的 **11** = **9 条用例声明 + 2 条正则 `.test(` 调用** —— 那 2 行属于 `SETTINGS_NAMESPACE` 唯一真源的**静态引用判据**内部（匹配调用，不是用例声明）。对账命令与读数（本轮实跑）：

```sh
git show HEAD -- tests/ | grep -cE '^\+[[:space:]]*test\('     # 9   ← 权威：与运行器 366 → 375 一致
git show HEAD -- tests/ | grep -c  '^+.*\(test(\|it(\)'        # 11  ← 宽松口径：把上面两条正则调用也算了进去
git show HEAD -- tests/ | grep -nE '^\+.*\.test\(text\)'      # 恰好 2 行：/.../.test(text)（SETTINGS_NAMESPACE 判据内部）
```

- **逐文件新增声明**：`api.test.mjs +2`（22→24）、`capture.test.mjs +2`（7→9）、`delete-prompts.test.mjs +1`（12→13）、`settings-shape.test.mjs +1`（新增文件 4→5）、`settings-store.test.mjs +3`（8→11）⇒ **合计 +9** ✓（与运行器 366→375 一致）
- **删除面**：`test(` 删除行 **0**、`assert` 删除行 **0** ⇒ 与「零删除、零削弱」一致 ✓
- **权威读数 = 9 条用例声明**（= 375 中的新增部分）；11 是「宽松正则口径」，仅为诚实复现而并列保留。
- **最终评审点名的三条零等待守门用例（标题原文，取自 `git show HEAD -- tests/`）**：
  1. `listAiProviders：探测超时 ⇒ 带 probe 标记的 ApiError，分类器给 ai.probeTimeout（不落回 ai.timeout）`
  2. `deleteMeta：挂未触发的 AbortSignal，超时取独立的 CLEAR_TIMEOUT_MS（不是 AI 调用超时）`
  3. `O-1：deleteMeta 在同步阶段抛出 ⇒ 逐键记 failed，其余键照清，主操作不被反噬`
- **同批新增的其余用例（标题原文）**：`C1 正面：无 scope + 降级读成功 ⇒ isSettingsReady() 为真，预检按**真实上限**弹确认`；`C1 反面（回归钉）：无 scope + 降级读失败 ⇒ 不就绪，createFromCapture 抛出可读错误且**不创建**`；`SETTINGS_NAMESPACE：唯一真源在 settings-shape.ts，宿主与客户端消费点都引用它（漂移即红）`；`settings-store：有 scope ⇒ 就绪看宿主快照的 status（ready 为真；非 ready 为假）`；`settings-store：无 scope + 降级读成功 ⇒ 就绪为真（快照按真实值落地，不是默认值）`；`settings-store：无 scope + 降级读失败 ⇒ **永远**不就绪（失败关闭，绝不拿默认值当权威）`。

### 14.5 计数、时效与副作用（本波后仍为最新口径）

- **本波不改变任何判据结论**：**PASS 33 · FAIL 0 · 延期观感项 4（+1 结构项）· 已知限制 1 · NOT RUN 1**（§13.7 的口径不变）。
- **本次复验取自 HEAD `d397dc6`**（新 `lib/client.js` sha `7c7b2f23…`；活模块段切片 `62f855df…` **双向命中**；分组 rev `bc2cf36303cd`），页面 `http://127.0.0.1:3080`、窗口 1280×720、`scrollLeft=0`。
- **本轮不可逆变化 = 0**：唯一一次真实写是 capture 复验的临时条目（`433388bb…`），已软删 + 永久删，`GET /prompts` 前后**逐字节相等**；`trash`/`tags`/`settings`(13 键)/`meta`(8 行)/`$DSH_HOME/skills/`(4)/`ai-log`(628 B、mtime 未变) 逐项等于验收前原文；页面内注入整页 reload 后全消；**未发送任何聊天消息**；**未改产品代码**、未动装配（未调用 `dev_*`、未重启 `dsh web`、未改 profile）。
- **草稿与视图状态复位**：收尾把 composer 草稿还原为 `T5c Evict probe draft #C`；因点外部会按 R48 设计保持「收起态」（`dismissedKey`），本轮用「清空 → 重输」复位，并在整页 reload 后复核仍为该值、`claim=["hash"]`、`#` 浮层在屏 ⇒ 与验收前同态。
