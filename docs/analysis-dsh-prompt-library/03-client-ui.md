# 03 · 前端组件层与插槽交互分析

> 参考项目：D:\Project\source\__TEST__\dsh-plugins\_ref-dsh-prompt-library（@sunjuntao/dsh-prompt-library v0.16.0，MIT）
> 目标：裁剪为「只保留提示词相关功能」的 **dsh-prompt-enhancer**
> 本文所有行号均来自源码读取器的行号（与 Measure-Object -Line 有 ±3% 差异，以文件内实际行为准）；体积为文件精确字节数（Length）。

---

## 0. 结论速览（先看这 12 条）

1. **客户端入口不是 src/index.ts**。src/index.ts 是 **host 入口**（Node ESM，257 行）；客户端入口是 **src/client/utils/index.ts（274 行，10435 B）**，构建映射见 scripts/build.mjs:96（entryPoints: src/client/utils/index.ts → lib/client.js），由 package.json 的 exports["./client"] 与 dsh.client.platform="web" 声明。
2. 客户端共注册 **5 个插槽座位**（4 个组件级 + 1 个设置区块），全部集中在 src/client/utils/index.ts 的 apply()（L98-274）。**没有任何组件在自己文件里注册插槽**。
3. 另有 **2 处纯 DOM 注入**（非插槽）：设置按钮上方的词库菜单按钮（SettingsAboveMenuButton.registerSettingsAboveMenu）、设置导航图标替换（settings-nav-icon.registerSettingsNavIcon）。
4. 全插件只建立 **1 条 WebSocket**：/api/prompt-library/events（src/client/utils/ws.ts:13），由 data-sync.ts 翻译为 3 个 window 事件：pl:data-changed、pl:fill-draft、pl:export-downloaded。**没有任何组件直接 new WebSocket**；HTTP 只有 api.ts 里的 fetch（api.ts:41）。
5. 提示词核心闭环 = PromptLibraryButton（composer 按钮 + # 触发浮层 + 右侧面板）→ api.ts（/prompts CRUD、/tags、AI polish）。LexiconManagerModal（数据管理）与 ImportExportModal（导入导出）是第二条独立入口，同样只碰 /prompts + /tags + /trash + /export。
6. **非提示词功能全部集中在 3 个目录**：components/persona-skill/（PersonaManagerModal 52.7KB / PromptInjectPanel 63.4KB / HarnessSkillPanel 15.4KB）、components/import-export/SkillImportModal.tsx（83.5KB，技能↔提示词互转）、以及 SettingsAboveMenuButton.NAV_ITEMS 里的 persona / workspaceInstructions 两项。
7. 五个 persona-skill + skill 组件合计 **约 254 KB**，是精简版最大的删除收益。删除它们可一并删掉 api.ts 的 personas / session-prompts / skills-harness 三大段（约 200 行）。
8. **死代码（可直接删，无需改调用方）**：common/SubPanelModal.tsx（4395 B，全项目零引用）、utils/version.ts（PLUGIN_VERSION 在 client 无引用）、theme.ts 的 parseColor/contrastFg（仅自用）、dialog-style.ts 的 PL_DIALOG_EMBED_OVERLAY 与 .pl-card-sheen/.pl-lv-*（成就系统残留）、api.ts 的 getMetaValue/setMetaValue（无组件调用）。pl.achievements.loading 这个键被 persona/skill 面板当通用「加载中…」复用，删功能时注意别误删该键或改引用。
9. **i18n 是单命名空间 prompt-library，zh/en 各 445 个键**（zh 的键位于 L18-491，`} as const;` 在 L498；en 从 L501 起，键与 zh 一一对应）；键前缀按功能域分组，非提示词前缀共 **207 键 / 445（≈46.5%）**：pl.skillModal.*(86) + pl.personas.*(44) + pl.inject.*(41) + pl.harnessSkill.*(14) + pl.diag.*(10) + pl.sessionPrompts.*(5) + pl.ai.*(5) + pl.ctx.personas / pl.ctx.workspaceInstructions(2)。
10. **样式方案是「零 CSS 文件」**：无 .css、无 CSS Modules；全部为内联 CSSProperties + 四个注入式 CSS 字符串（PL_BUTTON_CSS / PL_DIALOG_CSS / SETTINGS_ABOVE_CSS / SETTINGS_NAV_CSS），色值一律走 --dsw-alias-* 宿主 token，主题切换由 theme.useThemeSync()（MutationObserver 观察 body[data-ds-dark-theme]）驱动重渲染。
11. common/ 下 **11 个组件全部可原样搬运**（只有 SearchBox.tsx 内嵌了硬编码中文 data-tip="搜索"/"清除" 与「全部」默认值，可按需 i18n 化）。
12. 需要大幅改写的只有 3 个大件：LexiconManagerModal（2075 行）、ImportExportModal（约 1600 行）、PromptLibraryButton（1633 行）；其中 PromptLibraryButton 与 LexiconManagerModal 的**左栏列表 + 右栏详情/编辑**结构几乎同构，精简版可考虑合并为一个「词库管理」组件，省掉约 800 行重复 UI。

---

## 1. src/client 文件清单与体积

全部 44 个文件（无 .css / 无 .json）：

| # | 路径（相对项目根） | 字节 | 行数 | 层 |
|---|---|---|---|---|
| 1 | src/client/utils/index.ts | 10435 | 274 | **入口** |
| 2 | src/client/utils/api.ts | 24939 | 615 | utils |
| 3 | src/client/utils/i18n.ts | 62907 | 1052 | utils |
| 4 | src/client/utils/data-formats.ts | 14750 | 387 | utils |
| 5 | src/client/utils/data-sync.ts | 5490 | 140 | utils |
| 6 | src/client/utils/ws.ts | 3751 | 107 | utils |
| 7 | src/client/utils/theme.ts | 6579 | 165 | utils |
| 8 | src/client/utils/dialog-style.ts | 6217 | 75 | utils |
| 9 | src/client/utils/button-style.ts | 1847 | 26 | utils |
| 10 | src/client/utils/workspace-picker.ts | 2924 | 75 | utils |
| 11 | src/client/utils/settings-nav-icon.ts | 3747 | 95 | utils |
| 12 | src/client/utils/conversation-targets.ts | 3344 | 81 | utils |
| 13 | src/client/utils/recent-created.ts | 764 | 24 | utils |
| 14 | src/client/utils/version.ts | 573 | 14 | utils（死代码） |
| 15 | src/client/utils/react-dom-shim.d.ts | 670 | 13 | 类型声明 |
| 16 | src/client/components/data/PromptLibraryButton.tsx | 70242 | 1633 | data |
| 17 | src/client/components/data/LexiconManagerModal.tsx | 70734 | 2075 | data |
| 18 | src/client/components/data/SelectionAddPrompt.tsx | 38842 | 913 | data |
| 19 | src/client/components/data/TemplateVariables.tsx | 20926 | 527 | data |
| 20 | src/client/components/data/RecycleManagePanel.tsx | 21238 | 567 | data |
| 21 | src/client/components/data/ContextRecommendations.tsx | 15667 | 356 | data |
| 22 | src/client/components/data/TagManagePanel.tsx | 15609 | 414 | data |
| 23 | src/client/components/data/AIPolishButton.tsx | 12259 | 318 | data |
| 24 | src/client/components/data/PromptAssistant.tsx | 4573 | 124 | data（弹窗宿主） |
| 25 | src/client/components/import-export/SkillImportModal.tsx | 85460 | 2333 | **非提示词** |
| 26 | src/client/components/import-export/ImportExportModal.tsx | 59300 | 约1600 | import-export |
| 27 | src/client/components/import-export/ImportEditModal.tsx | 40415 | 1036 | import-export |
| 28 | src/client/components/import-export/ImportConfirmModal.tsx | 7032 | 195 | import-export（仅 persona/skill 用） |
| 29 | src/client/components/persona-skill/PromptInjectPanel.tsx | 64907 | 约1504 | **非提示词** |
| 30 | src/client/components/persona-skill/PersonaManagerModal.tsx | 53966 | 约1312 | **非提示词** |
| 31 | src/client/components/persona-skill/HarnessSkillPanel.tsx | 15801 | 约418 | **非提示词** |
| 32 | src/client/components/settings/SettingsSection.tsx | 23878 | 约740 | settings |
| 33 | src/client/components/settings/SettingsAboveMenuButton.tsx | 23363 | 约487 | settings |
| 34 | src/client/components/common/DirectoryPickerModal.tsx | 15423 | 429 | common |
| 35 | src/client/components/common/SearchBox.tsx | 8858 | 292 | common |
| 36 | src/client/components/common/SubPanelModal.tsx | 4395 | 135 | common（**死代码**） |
| 37 | src/client/components/common/Tooltip.tsx | 4215 | 100 | common |
| 38 | src/client/components/common/ConfirmDialog.tsx | 3858 | 111 | common |
| 39 | src/client/components/common/WindowToggleButton.tsx | 2390 | 62 | common |
| 40 | src/client/components/common/TagInput.tsx | 2151 | 61 | common |
| 41 | src/client/components/common/Pagination.tsx | 2142 | 76 | common |
| 42 | src/client/components/common/DialogCloseButton.tsx | 1909 | 57 | common |
| 43 | src/client/components/common/PanelHeader.tsx | 1383 | 47 | common |
| 44 | src/client/components/common/BookIcon.tsx | 983 | 27 | common |

> 目录合计：common/ 14.3 KB、data/ 265 KB、import-export/ 192 KB、persona-skill/ 135 KB、settings/ 47 KB、utils/ 131 KB（其中 i18n 63 KB）。

---

## 2. 客户端入口：插槽注册总表

**入口文件：src/client/utils/index.ts（apply(ctx: ClientCtx)，L98）**

服务依赖（L37-42）：

    export const inject = ["slots", "locale", "workspaces", "uiConversation"];

### 2.1 插槽座位（ctx.slots.inject(slot) + ctx.slots.register(opts, Component)）

| # | slot 名 | id | order | 组件 | 文件:行 | 作用 | 提示词相关性 |
|---|---|---|---|---|---|---|---|
| 1 | conversation.input.left | prompt-library | 10 | PromptLibraryButton | index.ts:142-152 | composer 工具栏「词库」按钮；点击展开右侧面板（列表/搜索/标签筛选/分页/新建/编辑/详情/AI 优化）；同时驱动 # 触发浮层 | **核心** |
| 2 | conversation.input.left | prompt-library-ai-polish | 11 | AIPolishButton | index.ts:156-166 | composer 工具栏「AI 润色」星形按钮；把当前草稿送 /ai/polish 后回填 | **核心（可选）** |
| 3 | conversation.input.dock | prompt-library-recommend | 10 | ContextRecommendations | index.ts:170-180 | 输入框上方整行推荐条；按草稿+最近 3 条用户消息做关键词打分，最多 5 条 | **核心** |
| 4 | conversation.input.dock | prompt-library-modal-host | 11 | PromptAssistant | index.ts:185-195 | 常驻挂载壳（自身不渲染可见 UI），监听 pl:show-panel-content / pl:hide-panel-content，把左栏菜单选中的 Modal portal 到面板内容区 | **宿主** |
| 5 | settings.section | prompt-library | 30 | SettingsSection | index.ts:222-233 | harness 原生设置界面中的插件配置页；label: () => t("pl.setSectionTitle") | 提示词设置（需裁剪） |

> 未使用的 slot 头：sidebar.*、sidebar.panellist、sidebar.right.pane.tab、adminTab —— 入口的 ClientCtx 类型里保留了 key/only/label 字段（L63-81），但 v0.16.0 已不再注册任何侧边栏座位（旧版本残留能力）。

### 2.2 非插槽副作用（ctx.effect，均在 apply 内）

| 顺序 | 行号 | 内容 | 精简版处理 |
|---|---|---|---|
| 1 | L100 | registerWorkspaces(ctx.workspaces) → 缓存宿主目录选择能力 | 保留（导出到目录用） |
| 2 | L104 | setUiConversation(ctx.uiConversation) → conversation-targets.ts 的 chat 快照源 | 保留（ContextRecommendations 依赖） |
| 3 | L107-110 | ctx.locale.register(NS, { zh, en }) | 保留（字典需裁剪） |
| 4 | L114-120 | startDataChangedSubscription() 建立唯一 WS 订阅 | **必须保留**（否则 AI 润色回填/导出推送/数据变更广播全失效） |
| 5 | L122-125 | setBoundT(ctx.locale.bind(NS)) → 模块级翻译回退 | 保留 |
| 6 | L128-139 | ctx.locale.subscribe → 广播 pl:locale-changed | 保留 |
| 7 | L198-219 | 注入 SETTINGS_NAV_CSS + registerSettingsNavIcon(() => t("pl.setSectionTitle"), SETTINGS_NAV_MARKER_PROMPT) | 保留（改图标/标签） |
| 8 | L236-273 | 注入 SETTINGS_ABOVE_CSS + registerSettingsAboveMenu(t, getSettingsEnabled, getEnabled) | 保留（需裁 NAV_ITEMS） |

> settings-nav-icon.ts 导出两个 marker：SETTINGS_NAV_MARKER_PROMPT（本次用到）与 SETTINGS_NAV_MARKER_DATA（**v0.16.0 已无调用方**，CSS 里仍为它写了规则 → 可删）。

### 2.3 「非提示词」入口判定

| 位置 | 非提示词内容 | 处置 |
|---|---|---|
| PromptAssistant switch（L58-117） | case "persona" → PersonaManagerModal；case "workspaceInstructions" → PromptInjectPanel | **删这两个 case + import** |
| SettingsAboveMenuButton.NAV_ITEMS（L49-92） | {id:"persona", labelKey:"pl.ctx.personas"}、{id:"workspaceInstructions", labelKey:"pl.ctx.workspaceInstructions"} | **删这两项** |
| PromptAssistant switch | case "lexicon" / "importExport" / "tags" / "trash" | 保留 |
| SettingsSection 模块 | 「AI 模型」保留；「面板显示」「显示与交互」「关于」保留（需改文案/URL） | 保留但改文案 |
| api.ts | personas / session-prompts / skills-* / ai/draft(kind=soul 或 skill) | 删除 |
| i18n.ts | pl.personas.* / pl.inject.* / pl.harnessSkill.* / pl.diag.* / pl.sessionPrompts.* / pl.skillModal.* / pl.ctx.personas / pl.ctx.workspaceInstructions | 删除 |

---

## 3. 组件逐个分析

### 3.1 PromptLibraryButton.tsx（70242 B / 1633 行）— **提示词核心，最难裁**

**职责**：composer 按钮 + # 触发浮层 + 右侧浮出面板三合一。

**导出**：PromptLibraryButton(props: ButtonProps)（L607）。

**对外 props（插槽注入）**：

    interface ButtonProps {
      useInput: <T>(selector: (s: { draft: string }) => T) => T;   // 读草稿
      inputActions: { setDraft: (text: string) => void; submit?: () => void };
      t?: PLTranslate;
    }

**模块级纯函数（与 React 无关，可整段搬走）**：

| 行号 | 名称 | 作用 |
|---|---|---|
| L88 | getEditableText(el) | textarea/input/contenteditable 取文本 |
| L102 | getCaretPosition(el) | 光标位置 |
| L124 | getCaretRect(el) | 光标矩形（浮层定位；textarea 走镜像元素测量） |
| L148/235/295 | 镜像测量辅助 | 处理长文本 textarea 定位错位/跳顶 |
| L207-352 | # 触发 hook | 全局捕获阶段监听 keydown/keyup/input/compositionend/click，检测光标前一个字符是否为 #（受 settings.tildaTriggerEnabled 控制） |
| L356 | INPUT_SELECT_PAGE_SIZE = 20 | 无筛选词时浮层只显示 usageCount 前 20 条 |
| L360 | removeOverlay() / L366 showOverlay() | **原生 DOM 浮层**（非 React），z-index:2147483647，fixed top = 光标矩形底 + 4px |
| L493 | 选择项处理 | 有 onSelect 时交由调用方（含 {{}} 时弹变量填充窗） |
| L566 | applyPrompt(prompt, inputActions, draft) | 用正文替换「# + 筛选文本」 |
| L873 | 保存草稿 | editor.tags.split("#") → tags[] |

**内部状态机（L579-749）**：
- open（面板开关）、phase: "idle"|"loading"|"ready"|"error"（列表加载态）
- prompts、tagNames、query（搜索）、tagFilter（标签筛选）、page（PAGE_SIZE = 10，L748）
- editor: { mode: "none"|"create"|"edit"; id?; title; body; tags }（**新建/编辑共用一个编辑器**）
- viewing: Prompt | null（右栏详情）；viewPolish: {status:"idle"|"loading"|"done"; id} + viewPolishText/viewPolishSummary/viewShowOriginal/viewPolishError（AI 优化对比）
- template: { prompt; mode:"insert"|"overwrite"; fromOverlay? }（模板变量填充窗）
- deleteConfirm、toast（visible + text）、settings（getSettings() + 监听 pl:settings-changed）
- refreshController: AbortController（L661，防止竞态）

**对外依赖**：
- 组件：SelectionAddPrompt（L1591，作为兄弟节点渲染，受 settings.selectionAddEnabled 控制）、Pagination、TagInput、ConfirmDialog、SearchBox + TagFilterBar、TemplateFillModal/extractVariables/applyVariables/hasVariables/insertVariableAt
- utils：api.ts（createPrompt、deletePrompt、getSettings、listPrompts、listTags、updatePrompt、usePrompt、polishPrompt）、button-style、theme.rowBackground、data-sync（notifyDataChanged/useDataChanged/useExportDownloaded/useFillDraft）、recent-created（markRecent/isRecent）、i18n.usePLT
- 第三方：Button（@deepseek-ai/dsh-client-ui-primitives）
- types.js：Prompt、PluginSettings、DEFAULT_SETTINGS、clampTitle

**内部视图（单组件内 4 个互斥视图）**：
1. 按钮 + toast —— L1010-1071
2. 浮层面板 —— L1073 open 后渲染 section id={panelId} role="dialog"（L1075）
3. 列表视图：header（书本图标 + 标题 + 刷新）/ SearchBox / TagFilterBar / 列表项 / Pagination —— L1171-1349
4. editing（新建或编辑表单：标题 + TagInput + 正文 + 插入变量）与 viewing（详情：标题/标签/AI 摘要/正文/统计 usageCount/createdAt/updatedAt/lastUsed + AI 优化对比）—— L1351-1586

**裁剪要点**：这是 conversation.input.left 的承载者，**不能删**。若要最小化，可只保留「按钮 + # 浮层 + 列表/搜索/标签筛选 + 插入」，去掉面板内的新建/编辑/详情/AI 优化（交给 LexiconManagerModal），约减 500 行（L1150-1590 的 editor/viewing/polish 段）。

### 3.2 LexiconManagerModal.tsx（70734 B / 2075 行）— **提示词核心（数据管理）**

**职责**：左右分栏的提示词 CRUD + 详情 + AI 优化 + 批量删除；可内嵌到设置面板右栏（container 存在时），或作为独立居中弹窗（container 缺省）。

**导出**：LexiconManagerModal(props: { open; onClose; t?; container? })（L81）。
**props**：open: boolean、onClose: () => void、t?: PLTranslate、container?: HTMLElement（**内嵌模式判定的唯一开关**）。

**状态（L91-132）**：maximized、list、loaded、selectedId、tagList、viewMode:"list"|"group"、search、collapsed: ReadonlySet<string>、editing:{id:string|null}|null、draft:{title;body;tag}、busy、msg、deleteTarget、selectedIds: ReadonlySet<string>、batchDeleteOpen、dataSub:"tags"|"trash"|null、viewPolish/viewPolishText/viewPolishSummary/viewShowOriginal/viewPolishError、bodyRef、selectAllRef。

**左栏导航/子面板（本文件「左侧有哪些项」的准确答案）**：

| 位置 | 行号 | 元素 | 提示词核心 |
|---|---|---|---|
| 顶部 | L1462-1505 | 固定标题（pl.lexicon.listTitle）+「+ 新建」按钮（pl.lexicon.new） | 是 |
| 第二行左 | L1506-1566 | 视图切换：列表（pl.lexicon.listView）/ 分类（pl.lexicon.groupView） | 是 |
| 第二行右 | L1567-1600，仅当 !container | 「标签」（pl.lexicon.viewTags）/「回收站」（pl.lexicon.viewTrash）→ setDataSub("tags" 或 "trash") | 是 |
| 列表区 | L1794（list）/ L1885（group） | 平铺列表 / 按首个标签分组（无标签归「暂无标签」），组可折叠 | 是 |
| 底部 | L1666-1740 | 全选复选框（含 indeterminate 半选态）、批量删除、选中 n / 总数 m | 是 |
| 右栏覆盖 | L1972-2050 | dataSub === "tags" → TagManagePanel；"trash" → RecycleManagePanel，带标题与关闭 | 是 |
| 右栏常规 | L1193-1445 | editing → 编辑表单（标题 / 标签单选 TagInput / 正文 + 插入变量）；否则详情预览（标签/AI 摘要/正文/统计 usage、createdAt、updatedAt、lastUsed） | 是 |

**依赖**：api（createPrompt、deletePrompt、listPrompts、listTags、polishPrompt、updatePrompt）、common（TagInput、ConfirmDialog、DialogCloseButton、WindowToggleButton、BookIcon）、TemplateVariables.insertVariableAt、TagManagePanel、RecycleManagePanel、dialog-style、theme、i18n、data-sync。

**与 PromptLibraryButton 的重叠**：列表项渲染、viewPolish 四件套、Draft 表单、详情统计区块几乎同构。**精简版合并建议**：保留 LexiconManagerModal 作为唯一「词库管理」容器。

### 3.3 SelectionAddPrompt.tsx（38842 B / 913 行）— **提示词核心（选区入口）**

**职责**：聊天区选中文本 → 浮动按钮（复制 / 添加提示词 / 套模板）→ 独立居中弹窗预填正文保存。

**导出**：SelectionAddPrompt(props: Props)（L169）。
**props**：{ t?: PLTranslate; enabled: boolean; inputActions?: { setDraft }; draft?: string }（L150-158）。
**action 状态机**（L112-148）：SelectionActionId = "copy" | "add" | "tpl"；默认动作持久化在 localStorage["pl-selection-default-action"]（loadDefaultAction，L140），其余收进「更多」二级面板（moreOpen）。
**内部子视图**：① 选区浮动工具条（floatingBtnStyle：height 30、radius 14、轻投影）；② 「添加提示词」弹窗（title/body/TagInput）；③ 「套模板」选择器（tplQuery 搜索 + tplTag chip 过滤 + 列表）；④ TemplateFillModal 变量填充。
**API**：createPrompt、listPrompts、listTags、usePrompt；notifyDataChanged、markRecent。
**依赖**：Button、plBtn、PL_DIALOG*、TagInput、TemplateVariables。
**裁剪**：可原样保留（受 settings.selectionAddEnabled 控制）。若最小化，删「套模板」分支（tpl* 状态 + 选择器）可减约 150 行。

### 3.4 ContextRecommendations.tsx（15667 B / 356 行）— **提示词核心（推荐）**

**职责**：输入框上方整行推荐（最多 5 条），按关键词打分；点击即插入或弹模板填充。

**导出**：ContextRecommendations(props: DockProps)（L158）。
**props（dock 插槽注入）**：{ useSession?: <T>(sel) => T; useInput?: <T>(sel) => T; inputActions?: { setDraft }; t?: PLTranslate }（L148-155）。
**关键常量**：LIMIT = 5（L49）、CONTEXT_USER_COUNT = 3（L51）、FRESH_MS = 30 天（L53）、STOP_BIGRAMS 停用词集合（L57-63）。
**算法**：extractKeywords（L78，英文词 + 中文滑动二元组）→ termWeight（L96，英文长词加权）→ scorePrompt（相关度 + 30 天新鲜度 + 使用次数）。
**数据源**：useConversationTargetSnapshot<{legacy:{nodes}}>(sessionId, "chat")（L169，来自 conversation-targets.ts），旧快照 s.chat.legacy.nodes 作回退（L173）。
**API**：getSettings、listPrompts、usePrompt；useDataChanged。
**裁剪**：保留；conversation-targets.ts 与入口的 setUiConversation 随之必须保留。

### 3.5 TemplateVariables.tsx（20926 B / 527 行）— **提示词核心（纯逻辑 + 弹窗）**

**导出**：

| 行号 | 名称 | 说明 |
|---|---|---|
| L29 | extractVariables(body) | 提取唯一变量名（匹配成对双大括号、内部不含大括号、允许首尾空白），去重保序 |
| L45 | applyVariables(body, values) | 替换占位符；未提供的变量保留原样 |
| L53 | hasVariables(body) | 快速判断是否含占位符 |
| L217 | insertVariableAt(el, value, setValue, defaultName?) | 光标处插入占位符；有选区时以选区文本为变量名，光标停在标签末尾 |
| L263 | TemplateFillModal(props) | 变量填充弹窗 |

**TemplateFillModal props**（L237-260）：{ open; variables: string[]; body; onCancel; onConfirm(values); onInsertAndSend?; draftEmpty?; confirmLabel?; showInsertAndSend?; initialValues?: Record<string,string>; t: PLT }。
**内部**：18 色 VAR_PALETTE（L58）+ 黄金角（约 137.5 度）色相生成（L82）；实时预览高亮 hlStrong（L91）；每变量一个输入框 + focusName 联动高亮；变量值历史记忆（打开时预填同名变量，再叠加 initialValues）。
**零 API 依赖**（纯函数 + i18n pl.template.*）→ **可 100% 原样搬运**。

### 3.6 AIPolishButton.tsx（12259 B / 318 行）— **提示词核心（AI 润色）**

**导出**：AIPolishButton(props: ButtonProps)（L99），props 同 PromptLibraryButton.ButtonProps（L25-31，无 submit）。
**状态机**：status: "idle"|"polishing"|"done"|"error"、result、original、showOriginal、error、toast（TOAST_MS = 2200）。
**内部子视图**：① composer 星形按钮（SparkleIcon，旋转动画 pl-polish-spin）；② 润色结果面板（对比原稿 + 一键覆盖草稿）。
**API**：getSettings、polishPrompt(body)（聊天框按钮**不传** keepVariables，即保持默认 true）。
**监听**：pl:settings-changed（useSettings，L77-97）；useFillDraft（L18，host 主动推送润色正文时回填）。
**裁剪**：保留（AI 润色属提示词增强）。若砍掉 AI 能力，此组件与 /ai/polish 路由、pl.setModuleAiModel 模块一起删。

### 3.7 PromptAssistant.tsx（4573 B / 124 行）— **弹窗宿主**

**导出**：PromptAssistant({ t }: { t?: PLTranslate })（L21）。
**机制**：监听 pl:show-panel-content（detail: { container: HTMLElement; key: string }）→ createPortal(固定 6 分支 switch, container)；pl:hide-panel-content 清空。返回 panelContentPortal（L123）。

**switch 的 6 个 key 与组件映射（L58-117）**：

| key | 渲染 | 提示词核心 |
|---|---|---|
| lexicon | LexiconManagerModal open onClose t container | 是 |
| importExport | ImportExportModal open onClose t container | 是 |
| persona | PersonaManagerModal | **否，删** |
| workspaceInstructions | PromptInjectPanel | **否，删** |
| tags | PanelHeader + TagManagePanel t | 是 |
| trash | PanelHeader + RecycleManagePanel t | 是 |
| default | null | — |

**裁剪**：删 2 个 case + 2 个 import（约 20 行），保留 4 个 case。

### 3.8 ImportExportModal.tsx（59300 B / 约 1600 行）— **提示词核心（导入导出）**

**导出**：ImportExportModal(props: { open; onClose; t?; container? })（L167）。props 同 LexiconManagerModal。

**内部子视图/区块结构**：

| 区块 | 行号 | 内容 |
|---|---|---|
| 弹窗头 | L487 / L527 / L555 | 书本图标 + pl.moduleImportExport + 说明框 + 最大化/关闭 |
| 导入区 | L655-720 | pl.importSection：「导入数据」（隐藏 file input，parseImportFile）与「技能导入」（SkillImportModal，**非提示词**） |
| 导出区 | L724-960 | pl.exportSection：格式选择（json/csv/md/txt，exportFormat）、列表/分组视图（exportView + exportCollapsed）、搜索（exportQuery）、全选、导出所选、选择目录（DirectoryPickerModal）、「导出为技能」（**非提示词**） |
| 右侧预览 | 约 L1250-1450 | viewing 详情（usage/createdAt/updatedAt/lastUsed/AI 摘要/正文） |
| 子弹窗 | — | ImportEditModal、SkillImportModal、ConfirmDialog、DirectoryPickerModal |
| 反馈 | — | resultToast（4s，悬停暂停 / 手动关闭）、msg（2.6s 自动清） |

**状态（L177-339）**：maximized、promptList、promptLoading、exportSelected:Set<string>、skillImportOpen、importEditOpen、importEntries、exportFormat、skillExportOpen、skillExportInitial、exportView、exportCollapsed、exportQuery、viewing、activeId、deleteTarget、msg、exportDoneMsg、resultToast、exportDirPickerOpen、lastExportDir（localStorage["dsh-prompt-library:last-export-dir"]，键常量 EXPORT_DIR_KEY 在 L54）。
**API**：listPrompts、deletePrompt、saveExportFile(ids, format, dir?)；parseImportFile（data-formats）；notifyDataChanged。
**组件复用**：PromptCheckRow（L57，导出勾选行，与 LexiconManagerModal 列表项同构）。
**裁剪**：删「技能导入」「导出为技能」两个按钮 + SkillImportModal import + skillImportOpen / skillExportOpen / skillExportInitial 状态（约 120-200 行 + 85 KB 子组件）。

### 3.9 ImportEditModal.tsx（40415 B / 1036 行）— **提示词核心（导入编辑）**

**导出**：ImportEditModal(props: { open; onClose; t?; initialEntries?: TransferPrompt[]; onImported?: (r:{imported;updated;skipped}) => void; onSaved?: (summary:string) => void })（L172）。
**职责**：把所选文件解析出的条目逐条编辑（标题/标签/正文/摘要）、校验、按条自动修复后提交 importPrompts。
**内部**：EditableEntry 列表 + 右栏选中项编辑（selectedKey）、autoFixEntry（L153，补空标题 + 修模板变量括号）、fixTemplateVars、validateEntries、tagOptions 下拉（合并既有标签与文件标签，L198-210）、bodyRefs（按条目 key 保存 textarea 引用）。
**状态**：entries、validation、fixLog、saving、msg、selectedKey、toastOpen、tagOptions。
**API**：importPrompts、listTags。
**依赖**：TemplateVariables.insertVariableAt、TagInput、DialogCloseButton、BookIcon、data-formats（TransferPrompt）。
**裁剪**：保留。

### 3.10 ImportConfirmModal.tsx（7032 B / 195 行）— **仅非提示词在用**

**导出**：ImportConfirmModal(props)（L46）+ interface ImportConfirmRow { title: string; detail?: string }（L14）。
**props**：{ open; title; headline: ReactNode; rows?: ImportConfirmRow[]; contentTitle?; content?; confirmLabel?（默认「确认导入」）; cancelLabel?（默认「取消」）; onCancel; onConfirm }。两种形态：列表（rows）或单条预览（contentTitle + content）。
**调用方**：仅 PersonaManagerModal、PromptInjectPanel（人格/技能导入确认）。
**裁剪**：提示词侧无人使用 → **可直接删除**（若将来提示词批量导入需要确认框，可零成本复用，体积仅 7 KB，二选一）。

### 3.11 SkillImportModal.tsx（85460 B / 2333 行）— **非提示词（体积最大单文件）**

**导出**：SkillImportModal(props: { open; onClose; t?; mode?: "import"|"export"; initialEntries?; onImported?; onSaved? })（L286）。
**职责**：~/.dsh/skills/技能名/SKILL.md ↔ 提示词双向转换；支持选择本地 md、扫描目录、AI 补全技能名与摘要（describeSkill）、校验并写盘（exportSkillEntries，scope 为 global|project|private）。
**状态**：entries、validation、fixLog、fillLog、saving、aiState:"idle"|"running"|"done"、aiResult、aiDone/aiTotal、aiAbortRef: AbortController、selectedKey、toastOpen、exportScope、projectCwd、projectCwdLoading、projectPathInput、dirPickerOpen、scanDirPickerOpen、fileRef、jsonRef、bodyRefs。
**API（7 个）**：listAvailableSkills、scanSkillDir、parseSkillRaw、importSkillEntries、exportSkillEntries、getExportProjectCwd、describeSkill。
**裁剪**：**整文件删除**（唯一调用方是 ImportExportModal）。删除后 api.ts 可减约 130 行 + pl.skillModal.* 86 个键 + DirectoryPickerModal 的一半用途。

### 3.12 TagManagePanel.tsx（15609 B / 414 行）— **提示词核心（标签）**

**导出**：TagManagePanel(props: { t?: PLTranslate })（L49）。
**职责**：标签新建/重命名/删除；自包含（高度撑满父容器，顶部「新建标签」固定、下方列表独立滚动）。
**内部**：tagList: {name;count}[]、renamingTag: {from;value}|null、newTag、pendingConfirm、msg；clampTag（L36，显示宽度上限 16 单位 ≈ 8 个汉字）。
**API**：createTag、renameTag、deleteTag、listTags；notifyDataChanged。
**裁剪**：保留（可选把内联确认逻辑统一到 ConfirmDialog）。

### 3.13 RecycleManagePanel.tsx（21238 B / 567 行）— **提示词核心（回收站）**

**导出**：RecycleManagePanel(props: { t?: PLTranslate })（L48）。
**职责**：回收站搜索 / 批量恢复 / 批量与单条永久删除；含 30 天自动清除倒计时（daysLeft，L42；formatTime，L35）。
**内部**：trashList: TrashItem[]、trashSelected: Set<string>、trashLoading、trashQuery、pendingConfirm、msg。
**API**：listTrash、restoreTrash、deleteTrash（**emptyTrash 在 api.ts 存在但无组件调用**）。
**裁剪**：保留；emptyTrash 可留作未来「清空回收站」按钮，或一并删除。

### 3.14 SettingsSection.tsx（23878 B / 约 740 行）— **设置页**

**导出**：SettingsSection(props?: { t?: PLTranslate })（L354）。
**机制**：本地 draft + 300ms 防抖 apiUpdateSettings（saveSettings，L399-411）+ window.dispatchEvent(new CustomEvent("pl:settings-changed", { detail: next }))；loading 时渲染 pl.loading。

**内部模块（4 个手风琴 ModuleCard，均默认折叠）**：

| 模块 | 行号 | 标题键 | 字段 |
|---|---|---|---|
| AI 模型 | L473-532 | pl.setModuleAiModel | aiProvider、aiModel（下拉来自 getAiSelectables()；切换 provider 时清空 aiModel） |
| 面板显示 | L535-566 | pl.setModulePanel | panelWidth(300-700)、panelHeight(300-800)、maxPromptCount(10-10000) |
| 显示与交互 | L569-643 | pl.setModuleDisplay | settingsAboveMenuEnabled、showComposerButton（+缩进 composerButtonIconOnly）、showAIPolishButton（+缩进 aiPolishButtonIconOnly）、tildaTriggerEnabled、selectionAddEnabled、contextRecommendEnabled |
| 关于 | L646-739 | pl.setModuleAbout | currentVersion（getVersion().installed）、author「master1Sun」、license MIT、repo 链接（**硬编码 github.com/master1Sun/dsh-prompt-library，裁剪时必须改**）、版权注释 |

**API**：getSettings、updateSettings、getAiSelectables、getVersion。
**辅助子组件（同文件内，未导出）**：ModuleCard、ToggleRow、NumberRow、SelectRow —— 可整段复用。
**裁剪**：删/改「关于」模块的原作者信息与仓库地址；其余保留。

### 3.15 SettingsAboveMenuButton.tsx（23363 B / 约 487 行）— **纯 DOM，无 React**

**导出**：SETTINGS_ABOVE_CSS（L14）、registerSettingsAboveMenu(getTranslation, _getSettingsEnabled, getEnabled)（L127）。
**机制**：MutationObserver 找到原生「设置」按钮 → 在其上方插入同款按钮 → 点击展开「左侧导航(115px) + 右侧内容区」面板（有半透明 backdrop 与淡入动画；无标题栏/关闭按钮，再次点击词库按钮切换关闭）；导航点击通过 pl:show-panel-content 事件把内容交给 PromptAssistant 内嵌渲染。

**NAV_ITEMS（左栏导航全清单，L49-92）**：

| 顺序 | id | labelKey | 图标色 | 提示词核心 |
|---|---|---|---|---|
| 1 | lexicon | pl.ctx.dataManagement | 蓝（--dsw-alias-brand-primary） | 是 |
| 2 | importExport | pl.moduleImportExport | 蓝 | 是 |
| 3 | tags | pl.ctx.tags | 橙 #ea580c | 是 |
| 4 | trash | pl.ctx.trash | 红（--dsw-alias-state-error-primary） | 是 |
| 5 | persona | pl.ctx.personas | 紫 #8b5cf6 | **否，删** |
| 6 | workspaceInstructions | pl.ctx.workspaceInstructions | 紫 | **否，删** |

**其它**：PANEL_TYPE_MAP（L95-102，与 NAV_ITEMS 冗余映射，删项须同步）、schedulePanelContent(container, type)（L107，queueMicrotask 后再 dispatch，确保容器已挂载）、pendingPanelType、SVG_NS、折叠态 CSS 类 pl-sa-collapsed。
**getEnabled**：读 getSettings().settingsAboveMenuEnabled（默认 true，由入口 L258-265 传入）；找不到原生设置按钮时按钮不显示。
**裁剪**：删 2 个 NAV_ITEM + PANEL_TYPE_MAP 对应项 + 改按钮文案/图标。

### 3.16 common/*（14.3 KB，11 个组件）

| 组件 | 行数 | 导出/Props | 被谁使用 | 备注 |
|---|---|---|---|---|
| BookIcon.tsx | 27 | BookIcon({color,size=14}) | ImportEditModal:26、SkillImportModal:47、ImportExportModal:42、HarnessSkillPanel:23、LexiconManagerModal:46 | 纯 SVG |
| ConfirmDialog.tsx | 111 | ConfirmDialog({open,message,danger?,confirmLabel?,cancelLabel?,onCancel,onConfirm}) | PromptInjectPanel:40、ImportExportModal:38、PersonaManagerModal:34、HarnessSkillPanel:21、LexiconManagerModal:43、PromptLibraryButton:36 | 默认中文「确定/取消」，调用方须传 i18n 文案 |
| DialogCloseButton.tsx | 57 | DialogCloseButton({onClick,label?,noTip?}) | ImportEditModal:25、PromptInjectPanel:41、SkillImportModal:46、ImportExportModal:39、PersonaManagerModal:35、HarnessSkillPanel:22、LexiconManagerModal:44 | data-tip 依赖 Tooltip |
| WindowToggleButton.tsx | 62 | WindowToggleButton({maximized,onToggle,maximizeLabel,restoreLabel}) | PromptInjectPanel:42、ImportExportModal:41、PersonaManagerModal:36、LexiconManagerModal:45 | 文本字形（U+FE0E 强制文本呈现） |
| Pagination.tsx | 76 | Pagination({page,totalPages,onChange,prevLabel?,nextLabel?,textColor?}) | 仅 PromptLibraryButton:34 | totalPages <= 1 时返回 null |
| PanelHeader.tsx | 47 | PanelHeader({title,desc}) | 仅 PromptAssistant:19（tags/trash 两处） | 标题 + 说明框 |
| SubPanelModal.tsx | 135 | SubPanelModal({open,onClose,title?,ariaLabel?,t,width=960,height=720,children}) | **无人使用（死代码）** | 功能与 PL_DIALOG 完全重叠 |
| TagInput.tsx | 61 | TagInput({value,onChange,suggestions,inputStyle,t?}) | SelectionAddPrompt:13、LexiconManagerModal:42、PromptLibraryButton:35 | 原生 select，仅单选（旧 # 分隔数据取首个） |
| Tooltip.tsx | 100 | 副作用模块（init() 在 import 时执行，L100） | 由 index.ts:19 副作用引入 | data-tip 全局代理；z-index 2147483647；替代原生 title |
| SearchBox.tsx | 292 | SearchBox({value,onChange,onSearch,onClear,placeholder?,inputRef?})、TagFilterBar({tags,active,onChange,allLabel?})、Highlight({text,query})、interface SearchBoxProps | SearchBox 与 TagFilterBar 仅 PromptLibraryButton:41；Highlight **无调用方** | 内嵌硬编码「搜索」「清除」「全部」 |
| DirectoryPickerModal.tsx | 429 | DirectoryPickerModal({open,initialPath?,onPick,onClose,t}) | SkillImportModal:45、ImportExportModal:40 | 走 workspace-picker 三级回退；含面包屑/上级/新建文件夹 |

### 3.17 persona-skill/*（135 KB，**全部删除候选**）

| 组件 | 体积 | 导出 | 职责 | 依赖 API |
|---|---|---|---|---|
| PersonaManagerModal.tsx | 53966 B | PersonaManagerModal({open,onClose,t,container})（L92） | 人格 CRUD + 工作区/项目/会话绑定树 + 会话解析诊断 | listPersonas、createPersona、updatePersona、deletePersona、listSessionScopeTree、listScopeTree、getPersonaBinding、setPersonaBinding、setSessionPersonaBinding、clearAllPersonaBindings、diagSession、generateDraft(kind="soul") |
| PromptInjectPanel.tsx | 64907 B | PromptInjectPanel({open,onClose,t,container})（L114） | 会话级技能 CRUD + 路径/会话绑定 + 临时注入 + 诊断 + HarnessSkillPanel 嵌套 | session-prompts 全套、setSessionPersonaBinding、clearAllBindings、diagSession、getMetaValue/setMetaValue 未用 |
| HarnessSkillPanel.tsx | 15801 B | HarnessSkillPanel({open,onClose,t,container})（L37） | ~/.dsh/skills 与项目技能的启用开关/删除（禁用清单注入系统提示） | listHarnessSkillToggles、setHarnessSkillToggle、deleteHarnessSkill |

> 三个组件均内联「AI 生成」（generateDraft）、ImportConfirmModal、ConfirmDialog，且用 pl.achievements.loading 当「加载中」占位。

---

## 4. api.ts 全量 API 客户端清单

**文件**：src/client/utils/api.ts（24939 B / 615 行）。
**基础路径常量**：BASE = "/api/prompt-library/prompts"（L19）、PERSONAS_BASE = "/api/prompt-library/personas"（L20）、SESSION_PROMPTS_BASE = "/api/prompt-library/session-prompts"（L21）、SETTINGS_BASE = "/api/prompt-library/settings"（L391）。
**统一传输器**：send<T>(method, path, body?, signal?)（L29-52）→ fetch（L41）；响应信封 { ok, data?, error? }（L23-27）；当 !ok 或 data 为 undefined 时抛 Error(payload.error)（L48-50）。**所有函数成功返回 data，失败抛异常。**

### 4.1 提示词 CRUD（保留）

| 函数 | 行号 | 方法 + 路径 | 用途 |
|---|---|---|---|
| listPrompts() | L54 | GET /prompts | 列表 |
| createPrompt(input) | L58 | POST /prompts | 新建（输入 PromptInput { title; body; tags? }） |
| updatePrompt(id, patch) | L62 | PUT /prompts/ID | 更新（PromptPatch） |
| deletePrompt(id) | L66 | DELETE /prompts/ID | 软删除（进回收站） |
| usePrompt(id) | L71 | POST /prompts/ID | 记录一次使用（点击插入时） |

> 路径中 id 一律 encodeURIComponent；下同，表格中写作 ID。

### 4.2 导入导出（保留；/export/save 为核心）

| 函数 | 行号 | 方法 + 路径 | 用途 |
|---|---|---|---|
| exportPrompts(ids?) | L86 | GET /export（无 ids）/ POST /export（{ ids }） | 返回 PromptBackup { version:1; exportedAt; prompts } |
| saveExportFile(ids, format, dir?) | L104 | POST /export/save（{ ids, format, dir? }） | 后端写盘，返回 { count, filePath } |
| importPrompts(data) | L126 | POST /import | 合并式导入，返回 { imported, updated, skipped, items[] } |

### 4.3 标签（保留）

| 函数 | 行号 | 方法 + 路径 |
|---|---|---|
| listTags() | L131 | GET /tags → { name, count }[] |
| renameTag(from, to) | L136 | PUT /tags/FROM（{ to }）→ { changed } |
| deleteTag(name) | L145 | DELETE /tags/NAME → { changed } |
| createTag(name) | L153 | POST /tags（{ name }）→ { name } |

### 4.4 回收站（保留）

| 函数 | 行号 | 方法 + 路径 |
|---|---|---|
| listTrash() | L312 | GET /trash → TrashItem[] |
| restoreTrash(ids) | L317 | POST /trash/restore（{ ids }） |
| deleteTrash(ids) | L322 | POST /trash/delete（{ ids }） |
| emptyTrash() | L327 | POST /trash/empty（**无组件调用**） |

### 4.5 AI（保留 polish 与 providers；draft 属人格/技能）

| 函数 | 行号 | 方法 + 路径 | 用途 | 去留 |
|---|---|---|---|---|
| polishPrompt(body, opts?) | L337 | POST /ai/polish（{ body, keepVariables, withSummary }） | AI 润色正文 | **保留** |
| generateDraft(kind, title, input, lang?) | L352 | POST /ai/draft（{ kind, title, input, lang }），kind 为 "soul" 或 "skill" | 人格/技能草稿 | **删** |
| getAiSelectables() | L374 | GET /ai/providers → { provider, name, models[{id,name}] }[] | 设置页模型下拉 | **保留** |

### 4.6 版本 / 设置（保留）

| 函数 | 行号 | 方法 + 路径 |
|---|---|---|
| getVersion() | L387 | GET /version → { server, installed } |
| getSettings() | L394 | GET /settings → PluginSettings |
| updateSettings(patch) | L399 | PUT /settings |

### 4.7 文件系统（保留，导出目录用）

| 函数 | 行号 | 方法 + 路径 |
|---|---|---|
| listFsDirectory(path?) | L211 | GET /fs/list?path= → DirListing { path, home, crumbs[], entries[], truncated } |
| createFsDirectory(path, name) | L217 | POST /fs/mkdir（{ path, name }）→ { path } |

### 4.8 技能（~/.dsh/skills）— **全部删除**

| 函数 | 行号 | 方法 + 路径 |
|---|---|---|
| importSkills() | L168 | POST /skills/import |
| listAvailableSkills() | L222 | GET /skills/available |
| scanSkillDir(dir) | L227 | POST /skills/scan-dir（{ dir }） |
| parseSkillRaw(raw) | L232 | POST /skills/parse（{ raw }） |
| importSkillEntries(entries) | L241 | POST /skills/import/entries（{ entries }） |
| exportSkillEntries(entries, scope, rootPath?) | L263 | POST /skills/export/entries（{ entries, scope, rootPath }），scope 取 global / project / private |
| getExportProjectCwd() | L276 | GET /skills/export/project-cwd |
| describeSkill(payload, signal?) | L297 | POST /skills/ai-describe |
| listHarnessSkillToggles() | L585 | GET /skills/harness/list |
| setHarnessSkillToggle(id, enabled) | L590 | POST /skills/harness/toggle（{ id, enabled }） |
| deleteHarnessSkill(id) | L595 | POST /skills/harness/delete（{ id }） |

### 4.9 人格 — **全部删除**

| 函数 | 行号 | 方法 + 路径 |
|---|---|---|
| listPersonas() | L406 | GET /personas |
| createPersona(name) | L411 | POST /personas（{ name }） |
| updatePersona(id, patch) | L416 | PUT /personas/ID |
| deletePersona(id) | L424 | DELETE /personas/ID |
| listScopeTree() | L429 | GET /personas/scopes |
| listSessionScopeTree() | L434 | GET /personas/scopes/sessions |
| getPersonaBinding(path) | L439 | GET /personas/scopes/binding?path= |
| setPersonaBinding(path, personaId) | L444 | PUT /personas/scopes/binding |
| clearAllPersonaBindings() | L505 | DELETE /personas/scopes/bindings/all |

> 注意：listScopeTree / getPersonaBinding / setPersonaBinding 被 PromptInjectPanel（技能绑定树）复用 —— 删人格时须确认技能侧也已删除，否则会连带删掉仍被引用的函数。

### 4.10 会话级技能 / 技能注入 — **全部删除**

| 函数 | 行号 | 方法 + 路径 |
|---|---|---|
| listSessionPrompts() | L451 | GET /session-prompts |
| createSessionPrompt(input) | L456 | POST /session-prompts |
| updateSessionPrompt(id, patch) | L461 | PUT /session-prompts/ID |
| deleteSessionPrompt(id) | L469 | DELETE /session-prompts/ID |
| listSessionPromptBindings() | L474 | GET /session-prompts/bindings |
| getSessionPromptBinding(path) | L479 | GET /session-prompts/bindings/path?path= |
| setSessionPromptBinding(path, ids) | L487 | PUT /session-prompts/bindings |
| clearSessionPromptBinding(path) | L492 | DELETE /session-prompts/bindings?path= |
| clearAllBindings() | L500 | DELETE /session-prompts/bindings/all |
| getSessionActivePrompts(scope) | L510 | GET /session-prompts/active?scope= |
| setSessionActivePrompts(scope, ids) | L518 | PUT /session-prompts/active |
| diagSession(sessid?) | L538 | GET /session-prompts/diag?sessid= |
| setSessionPersonaBinding(sessionId, personaId) | L544 | PUT /session-prompts/session/persona |
| setSessionPromptBindingForSession(sessionId, ids) | L549 | PUT /session-prompts/session/prompts |
| clearSessionBinding(sessionId) | L557 | DELETE /session-prompts/session?sessionId= |

### 4.11 插件 meta（**无组件调用，可删**）

| 函数 | 行号 | 方法 + 路径 |
|---|---|---|
| getMetaValue(key) | L602 | GET /meta/KEY（返回 { key, value } 后取 value） |
| setMetaValue(key, value) | L609 | PUT /meta/KEY（{ value }） |

### 4.12 导出的类型（裁剪时同步删）

PromptBackup(L76)、ExportSaveResult(L94)、ImportPromptsResult(L117)、SkillImportResult(L158)、SkillEntry(L173)、SkillSource(L182)、DirEntry(L192)、DirListing(L199)、SkillExportResult(L246)、SkillExportScope(L255)、SkillDescriptor(L281)、SkillDescribeFail(L288)、SkillDescribeResult(L291)、DraftGenerateFail(L349)、ClientAiSelectable(L367)、VersionInfo(L379)、ScopeDiag(L525)、HarnessSkillItem(L567)。

---

## 5. i18n.ts 组织方式

**文件**：src/client/utils/i18n.ts（62907 B / 1052 行）。

| 项 | 值 / 位置 |
|---|---|
| 命名空间 | export const NS = "prompt-library"（L14） |
| 中文字典 | export const zh = { ... } as const（L17-498；键在 L18-491），**445 键** |
| 英文字典 | export const en: Record<keyof typeof zh, string> = { ... }（L501-约990），**445 键**（键必须与 zh 完全一致，否则 tsc 报错） |
| 键类型 | PLKey = keyof typeof zh（L995）；PLT = (key: PLKey, params?) => string（L1001）；PLTranslate = TranslateNS<typeof NS>（L992） |
| 命名空间类型合并 | declare module "@deepseek-ai/dsh-client-ui-slots" { interface LocaleNamespaceMap { "prompt-library": keyof typeof zh } }（L985-989） |
| 注册 | src/client/utils/index.ts:107-110 → ctx.locale.register(NS, { zh, en }) |
| 绑定 | index.ts:122 → setBoundT(ctx.locale.bind(NS))（模块级回退 boundT，L1020-1025） |
| 取词 | usePLT(t?)（L1045）：优先注入的 t → 模块级 boundT → fallbackT（L1004，直接查中文并替换占位符） |
| 语言切换刷新 | LOCALE_CHANGED_EVENT = "pl:locale-changed"（L1028）+ useLocaleVersion()（L1034）；入口 L128-139 订阅宿主 locale 后 window.dispatchEvent 广播 |
| 插值语法 | 占位符写作花括号包名（如 {name}、{count}），由 fallbackT 或宿主 t 替换（示例：T("pl.lexicon.selectedTotal", {...})） |

### 5.1 键前缀分组（共 445 键，实测值）

| 前缀 | 键数 | 覆盖功能 | 提示词核心 |
|---|---|---|---|
| 无二级前缀的扁平键（pl.title、pl.overwrite、pl.exportSelected …） | 149 | 通用按钮/字段/面板/导入导出主流程/回收站/标签/选区/AI 润色/模板 | 是（其中 pl.achievements.loading 1 键为成就残留，可删） |
| pl.skillModal.* | 86 | 技能导入/导出弹窗（SkillImportModal） | **删** |
| pl.personas.* | 44 | 人格管理 | **删** |
| pl.inject.* | 41 | 会话级技能注入面板 | **删** |
| pl.lexicon.* | 32 | 数据管理弹窗（列表/编辑/详情/批量/视图/预览） | **保留** |
| pl.set.* | 24 | 设置页字段标签与描述 | 保留 |
| pl.harnessSkill.* | 14 | Harness 技能开关面板 | **删** |
| pl.importEdit.* | 12 | ImportEditModal（导入条目编辑/校验） | 保留 |
| pl.diag.* | 10 | 会话解析诊断卡片 | **删** |
| pl.dirPicker.* | 9 | DirectoryPickerModal | 保留 |
| pl.ctx.* | 5 | 左栏菜单标签：dataManagement / tags / trash / personas / workspaceInstructions | 3 留 2 删 |
| pl.ai.* | 5 | AI 生成（人格/技能「AI 生成」按钮）：generate / generating / genNeedTitle / genFailed / genDone | **删** |
| pl.sessionPrompts.* | 5 | 会话级技能表单占位符 | **删** |
| pl.template.* | 4 | 模板变量填充窗 | 保留 |
| pl.about.* | 4 | 关于（author / license / repo / copyright） | 改写 |
| pl.achievements.* | 1 | 仅剩 pl.achievements.loading，被 persona/skill 面板当通用「加载中」用 | 见下 |

> **非提示词键合计 207 / 445（46.5%）**（含 pl.ai.* 5 键与 pl.ctx.* 2 键）。若删 pl.achievements.loading，需先把 7 处引用（HarnessSkillPanel:411；PersonaManagerModal:1043/1186/1233；PromptInjectPanel:1271/1326/1428）改为已存在的 pl.loading（L25）——不过这 7 处引用都在待删组件里，实际可一并删除。

### 5.2 如何新增一种语言

1. 在 i18n.ts 新增 export const ja: Record<keyof typeof zh, string> = { ... }（**键必须与 zh 完全一致** —— Record<keyof typeof zh, string> 会在 tsc --noEmit 时报缺失键）。
2. 在 src/client/utils/index.ts:107-110 改为 ctx.locale.register(NS, { zh, en, ja })。
3. 不需要改任何组件：usePLT 会自动跟随。

### 5.3 i18n 裁剪注意事项

- 文件尾部残留已删除功能的注释（L493-497：统计可视化 / 全文搜索 / 大文件分片加载 / 定位当前文件 / 移动、复制到目录），无对应键，可直接删。
- 删除功能组件后对应键可整段删除；**删键必须 zh/en 同时删**，否则 en 的 Record<keyof typeof zh, string> 会报「多余属性」错误。
- 运行时动态拼键（如键拼接）在类型上不友好，本版本未使用；所有键都是字面量。
- 入口的 label: () => t("pl.setSectionTitle")（index.ts:229）与 settings-nav-icon 的文本匹配（按 label 文本给导航按钮打标记）耦合：**改 pl.setSectionTitle 的值不影响匹配**（匹配用运行时 label()），但改文案后设置导航里的显示文字会变。

---

## 6. 主题 / 样式方案 与 公共组件复用点

### 6.1 无 CSS 文件的样式体系

| 载体 | 位置 | 内容 | 使用方式 |
|---|---|---|---|
| PL_BUTTON_CSS | button-style.ts:12-22 | 复刻宿主 Button.module.css（.pl-btn / --primary / --ghost / --sm / --md / --no-border） | 每个用按钮的弹窗内注入 <style> |
| plBtn(variant, size) | button-style.ts:25 | 生成组合类名（如 pl-btn pl-btn--ghost pl-btn--sm） | 作为 className 传给宿主 Button |
| PL_DIALOG / PL_DIALOG_OVERLAY / PL_DIALOG_MAX / PL_DIALOG_OVERLAY_MAX | dialog-style.ts:16-22 | 类名常量 | 弹窗根元素 |
| PL_DIALOG_CSS | dialog-style.ts:42-75 | .pl-dialog（圆角 24px、底色 --dsw-specific-sidebar-fill、padding 18px 7px 18px 10px）、遮罩（rgba(0,0,0,.35) + --dsw-mask-blur）、最大化铺满、桌面端 36px 标题条适配、scrollbar-gutter:stable + 细滚动条 | 每个弹窗注入 <style> |
| PL_DIALOG_EMBED_OVERLAY | dialog-style.ts:31-39 | 容器内嵌浮层（position:absolute; inset:0） | **零引用（死代码）** |
| 成就残留 CSS | dialog-style.ts:53-67 | .pl-card-sheen / .pl-card-gold / .pl-lv-row / .pl-lv-cur / .pl-lv-fill 及其 keyframes | **零引用（死代码）** |
| SETTINGS_ABOVE_CSS | SettingsAboveMenuButton.tsx:14-33 | 词库菜单面板：backdrop、115px 侧栏、nav-item hover/active、折叠态（pl-sa-collapsed）、content-area 对嵌入 dialog 的 flex 适配；末尾拼接 PL_DIALOG_CSS | 入口 L239-245 注入 document.head（id pl-settings-above-style） |
| SETTINGS_NAV_CSS | settings-nav-icon.ts:29-52 | 隐藏原生齿轮 svg，用 mask-image（内联 data-URI SVG）替换为提示词/数据库图标 | 入口 L201-207 注入 head（id pl-settings-nav-style） |
| 组件内联样式 | 所有 .tsx | CSSProperties + 文件级 TONE 常量 + MONO 字体栈 + inputStyle | 无 CSS Modules 依赖 |

**裁剪提示**：PL_DIALOG_CSS 从 L53 起的成就动画可整段删；SETTINGS_NAV_MARKER_DATA 相关 CSS（选择器 L30-31、L34-35、L48-51）在无调用方后应删。

### 6.2 主题（theme.ts，165 行）

| 导出 | 行号 | 说明 |
|---|---|---|
| isDarkMode() | L12 | body[data-ds-dark-theme] 优先，缺失时跟随 prefers-color-scheme |
| interface ThemeTone | L19-31 | 11 个字段：text、muted、quiet、panel、row、border、borderStrong、accent、accentSoft、mint、red |
| getTone() | L38 | 返回当前深浅两套 --dsw-alias-* token（宿主未注入变量时用 fallback 值，随主题切换） |
| useThemeSync() | L99 | 订阅主题变化并触发重渲染（模块级 themeListeners + MutationObserver(body, attributes, data-ds-dark-theme) + matchMedia change，L78-111） |
| parseColor(input) | L114 | hex / rgb() / var(--x, fallback) 解析 | **无外部引用** |
| contrastFg(bg) | L149 | 按亮度选前景色 | **无外部引用** |
| rowBackground() | L161 | 黑夜返回 #353638，白天返回 --dsw-alias-bg-layer-3（润色稿输入区背景） | 被 PromptLibraryButton、AIPolishButton 使用 |

**新组件必须遵守的约定**：
1. 颜色一律走 var(--dsw-alias-*, fallback)，不在组件里写死色值；
2. 需要随主题重算颜色的组件首行调用 useThemeSync()，随后取 const TONE = getTone()；**必须在任何条件 return null 之前调用 hook**（ConfirmDialog L43-44 即为此写法，先 hook 再 if (!open) return null）；
3. 浮层 z-index 统一 2147483647（弹窗/浮层/提示同值，靠 DOM 顺序决定层叠，见 Tooltip.ts:33-34 与 showOverlay 的 overlay.style）。

### 6.3 公共组件复用点（谁用谁）

| 公共组件 | 调用方（文件:导入行） | 精简版 |
|---|---|---|
| BookIcon | ImportEditModal:26、SkillImportModal:47、ImportExportModal:42、HarnessSkillPanel:23、LexiconManagerModal:46 | 保留（删技能/人格后剩 3 处） |
| ConfirmDialog | PromptInjectPanel:40、ImportExportModal:38、PersonaManagerModal:34、HarnessSkillPanel:21、LexiconManagerModal:43、PromptLibraryButton:36 | 保留（剩 3 处） |
| DialogCloseButton | ImportEditModal:25、PromptInjectPanel:41、SkillImportModal:46、ImportExportModal:39、PersonaManagerModal:35、HarnessSkillPanel:22、LexiconManagerModal:44 | 保留（剩 3 处） |
| WindowToggleButton | PromptInjectPanel:42、ImportExportModal:41、PersonaManagerModal:36、LexiconManagerModal:45 | 保留（剩 2 处） |
| DirectoryPickerModal | SkillImportModal:45、ImportExportModal:40 | 保留（剩 1 处：导出目录） |
| TagInput | SelectionAddPrompt:13、LexiconManagerModal:42、PromptLibraryButton:35 | 保留 |
| SearchBox + TagFilterBar | PromptLibraryButton:41 | 保留（**Highlight 无调用方**） |
| Pagination | PromptLibraryButton:34 | 保留 |
| PanelHeader | PromptAssistant:19 | 保留 |
| Tooltip（副作用） | index.ts:19 | 保留（所有 data-tip 依赖它） |
| SubPanelModal | 无 | **删除** |
| TemplateVariables | ImportEditModal:24、SkillImportModal:44（insertVariableAt）；PromptLibraryButton、LexiconManagerModal、SelectionAddPrompt、ContextRecommendations（TemplateFillModal 等） | 保留（核心） |

---

## 7. 组件复用价值排序

### A 类 — 原样搬运（0 ~ 小改，直接复制）

| 组件/模块 | 体积 | 备注 |
|---|---|---|
| utils/theme.ts | 6.6 KB | 可删 parseColor / contrastFg |
| utils/dialog-style.ts | 6.2 KB | 删成就 CSS + PL_DIALOG_EMBED_OVERLAY |
| utils/button-style.ts | 1.8 KB | 原样 |
| utils/ws.ts | 3.8 KB | 原样（仅 socket 路径常量 SOCKET_PATH L13 可能改名） |
| utils/data-sync.ts | 5.5 KB | 原样（3 个事件名建议保留，减少联动改动） |
| utils/recent-created.ts | 0.8 KB | 原样 |
| utils/settings-nav-icon.ts | 3.7 KB | 删 DATA marker + 换 SVG mask |
| utils/workspace-picker.ts | 2.9 KB | 原样 |
| utils/conversation-targets.ts | 3.3 KB | 原样（依赖注入的 uiConversation 服务） |
| components/common/*（除 SubPanelModal） | 10 KB | 原样；SearchBox 建议把「搜索」「清除」「全部」改走 t |
| components/data/TemplateVariables.tsx | 20.9 KB | 原样（纯逻辑 + 弹窗，零 API 依赖） |
| src/types.ts 的 Prompt / PromptInput / PromptPatch / TrashItem / PluginSettings / DEFAULT_SETTINGS / TITLE_MAX_LEN / clampTitle；md-text.ts（data-formats 依赖） | — | 原样（但不要删 host 仍用的类型） |

### B 类 — 需要改写（保留主干，删分支/换文案）

| 组件 | 体积 | 改写内容 | 工作量 |
|---|---|---|---|
| data/PromptLibraryButton.tsx | 70.2 KB | 可选：删面板编辑/详情/AI 优化三块（保留按钮 + # 浮层 + 列表插入） | 中（约 -500 行） |
| data/LexiconManagerModal.tsx | 70.7 KB | 建议保留为唯一「词库管理」容器；!container 时的标签/回收站按钮保留 | 中 |
| data/SelectionAddPrompt.tsx | 38.8 KB | 可删「套模板」分支；inputActions / draft props 保留 | 小-中 |
| data/ContextRecommendations.tsx | 15.7 KB | 原样；可选精简 STOP_BIGRAMS | 小 |
| data/AIPolishButton.tsx | 12.3 KB | 原样（若砍 AI 能力则整删） | 小 |
| data/TagManagePanel.tsx | 15.6 KB | 原样；可统一用 ConfirmDialog | 小 |
| data/RecycleManagePanel.tsx | 21.2 KB | 原样 | 小 |
| data/PromptAssistant.tsx | 4.6 KB | 删 2 个 case + 2 个 import | 小 |
| import-export/ImportExportModal.tsx | 59.3 KB | 删「技能导入」「导出为技能」按钮/状态/import | 中（约 -200 行） |
| import-export/ImportEditModal.tsx | 40.4 KB | 原样（摘要字段可选删） | 小 |
| settings/SettingsSection.tsx | 23.9 KB | 改「关于」模块（去原作者/仓库/pl.about.*）；其余保留 | 小 |
| settings/SettingsAboveMenuButton.tsx | 23.4 KB | 删 NAV_ITEMS 的 persona/workspaceInstructions + PANEL_TYPE_MAP 对应项；换按钮文案/图标 | 小 |
| utils/api.ts | 24.9 KB | 删 4.5(draft) / 4.8 / 4.9 / 4.10 / 4.11（约 -230 行 + 类型） | 中 |
| utils/i18n.ts | 62.9 KB | 删 207 键 × 2 语言（共约 414 行） | 中（机械） |
| utils/index.ts | 10.4 KB | 改 id / 标签 / 图标；slot 注册结构不动 | 小 |
| utils/data-formats.ts | 14.8 KB | 原样（json / csv / md / txt 解析与序列化） | 小 |
| import-export/ImportConfirmModal.tsx | 7.0 KB | 提示词侧无调用方：删，或留作未来批量导入确认 | 0 |

### C 类 — 必须删除

| 删除对象 | 体积/行数 | 理由 |
|---|---|---|
| components/persona-skill/PersonaManagerModal.tsx | 54.0 KB / 约1312 行 | 人格 |
| components/persona-skill/PromptInjectPanel.tsx | 64.9 KB / 约1504 行 | 会话技能注入 |
| components/persona-skill/HarnessSkillPanel.tsx | 15.8 KB / 约418 行 | Harness 技能开关 |
| components/import-export/SkillImportModal.tsx | 85.5 KB / 2333 行 | 技能↔提示词互转（非提示词） |
| components/import-export/ImportConfirmModal.tsx | 7.0 KB | 仅供人格/技能使用 |
| components/common/SubPanelModal.tsx | 4.4 KB | 死代码，零引用 |
| utils/version.ts | 0.6 KB | PLUGIN_VERSION 在 client 零引用（host/update.ts 自带一份） |
| api.ts 的 4.8 / 4.9 / 4.10 / 4.11 + generateDraft | 约 230 行 | 对应路由与类型 |
| api.ts 的 getMetaValue / setMetaValue（L599-615） | 17 行 | 零组件调用 |
| i18n.ts 非提示词键 207 × 2 | 约 414 行 | 见 5.1 |
| PromptAssistant 的 persona / workspaceInstructions case | 2 个 case + 2 个 import | 见 3.7 |
| SettingsAboveMenuButton.NAV_ITEMS 的 persona / workspaceInstructions | 2 项 + PANEL_TYPE_MAP 2 项 | 见 3.15 |
| 其他残留：SETTINGS_NAV_MARKER_DATA 分支、dialog-style 成就 CSS 与 PL_DIALOG_EMBED_OVERLAY、SearchBox 的 Highlight、api.emptyTrash、api.listScopeTree（若技能侧也删）、pl.achievements.loading 及 7 处引用 | 约 120 行 | 死代码/残留 |

### 删除清单（按「人格 / 技能 / 插件推荐 / 其他」分类）

1. **人格**：PersonaManagerModal.tsx、api.ts 4.9 全部、i18n 的 pl.personas.*(44) + pl.ctx.personas、PromptAssistant 的 case "persona"、NAV_ITEMS[persona]、generateDraft(kind 为 "soul")、host 侧 personas 路由与 SOUL 文件逻辑（host/character.js、host/persona-service.js —— 属 host 层，见报告 02）。
2. **技能**：PromptInjectPanel.tsx、HarnessSkillPanel.tsx、SkillImportModal.tsx、api.ts 4.8 + 4.10 + generateDraft(kind 为 "skill")、i18n 的 pl.inject.*(41) + pl.harnessSkill.*(14) + pl.sessionPrompts.*(5) + pl.skillModal.*(86) + pl.ai.*(5) + pl.ctx.workspaceInstructions、PromptAssistant 的 case "workspaceInstructions"、NAV_ITEMS[workspaceInstructions]、ImportExportModal 的两个技能按钮、host 侧 session-prompts / skills / harness 路由。
3. **插件推荐**：本版本 src/client 内**未发现**插件推荐组件（common/SubPanelModal.tsx 头部注释提到「插件推荐」但无实现；PL_DIALOG_EMBED_OVERLAY 注释提到「技能开关在左侧词库面板内嵌」也是旧结构）。→ 无需专门删除，注意别按注释去复原该功能。
4. **其他**：成就系统残留（.pl-card-sheen / .pl-card-gold / .pl-lv-* 与 pl.achievements.loading）、version.ts、SubPanelModal、ImportConfirmModal、/meta API、emptyTrash、Highlight、SETTINGS_NAV_MARKER_DATA。

---

## 8. 大组件内部子面板 / Tab 清单（含提示词核心标记）

| 组件 | 层级 | 子面板 / Tab | 行号锚点 | 提示词核心 |
|---|---|---|---|---|
| PromptLibraryButton | L1 | composer 按钮 + toast | L1010-1071 | 是 |
| | L2 | # 触发浮层（原生 DOM，非 React） | L360-560 | 是 |
| | L2 | 右侧面板（section role="dialog"，L1075） | L1073-1590 | 是 |
| | L3 | header（书本图标 + 标题 + 刷新按钮） | L1076-1170 | 是 |
| | L3 | 搜索框 + 标签过滤条 | L1171-1227 | 是 |
| | L3 | 列表（含「最近创建」高亮）+ 分页 | L1228-1349 | 是 |
| | L3 | 编辑器（新建/编辑：标题 + TagInput + 正文 + 插入变量） | L1351-1430 | 是 |
| | L3 | 详情预览 + AI 优化对比 + 保存/覆盖 | L1355-1589 | 是 |
| | L2 | SelectionAddPrompt（选区浮层入口，兄弟节点） | L1591 | 是 |
| LexiconManagerModal | L2 | header（标题 + 说明框 + 最大化/关闭） | L1323-1445 | 是 |
| | L2 | 左栏（列表/分类切换、搜索、全选、批量删除） | L1446-1970 | 是 |
| | L3 | 左栏 Tab：列表 / 分类 | L1506-1566 | 是 |
| | L3 | 左栏按钮：标签 / 回收站（仅 !container） | L1567-1600 | 是 |
| | L2 | 右栏：详情预览 / 编辑表单 | L1193-1445 | 是 |
| | L2 | 右栏覆盖：dataSub 为 "tags" → TagManagePanel | L1972-2050 | 是 |
| | L2 | 右栏覆盖：dataSub 为 "trash" → RecycleManagePanel | L1972-2050 | 是 |
| | L3 | AI 优化预览 / 原稿对比（右栏详情内） | L125-132 状态 + 详情段 | 是 |
| ImportExportModal | L2 | 导入区（导入数据 / 技能导入） | L655-720 | 是 / 否 |
| | L2 | 导出区（格式、列表/分组、搜索、全选、导出所选、选择目录、导出为技能） | L724-960 | 是 / 否 |
| | L2 | 右侧预览详情 | 约 L1250-1450 | 是 |
| | L2 | 子弹窗：ImportEditModal / SkillImportModal / ConfirmDialog / DirectoryPickerModal | — | 是 / 否 |
| ImportEditModal | L2 | 左栏条目列表（含来源徽标、校验状态） | 约 L400-700 | 是 |
| | L2 | 右栏选中条目编辑（标题/标签/摘要/正文 + 插入变量） | 约 L600-1000 | 是 |
| | L2 | 校验 / 一键修复日志（validation、fixLog） | L153-169 | 是 |
| SettingsSection | L2 | 模块 1：AI 模型（provider / model） | L473-532 | 是 |
| | L2 | 模块 2：面板显示（宽 / 高 / 最大条数） | L535-566 | 是 |
| | L2 | 模块 3：显示与交互（6 个开关 + 2 个缩进子开关） | L569-643 | 是 |
| | L2 | 模块 4：关于（版本 / 作者 / 许可 / 仓库 / 版权） | L646-739 | 改写 |
| SettingsAboveMenuButton | L2 | 左栏导航 6 项（见 3.15） | L49-92 | 4 是 / 2 否 |
| | L2 | 右侧内容区（由 PromptAssistant portal 渲染） | L29-31（CSS） | 是 |
| PromptAssistant | L2 | 6 个 portal 分支（lexicon / importExport / persona / workspaceInstructions / tags / trash） | L58-117 | 4 是 / 2 否 |
| ContextRecommendations | L2 | 推荐条（最多 5 条 chip） | L234-356 | 是 |
| | L2 | 模板变量填充弹窗（点中带占位符的推荐时） | L231 | 是 |
| SelectionAddPrompt | L2 | 选区浮动工具条（默认动作 + 「更多」二级面板） | 约 L300-520 | 是 |
| | L2 | 「添加提示词」弹窗 | 约 L520-720 | 是 |
| | L2 | 「套模板」选择器（搜索 + 标签 chip + 列表） | 约 L720-880 | 是 |
| TemplateFillModal | L2 | 变量输入列表 + 实时预览高亮 + 历史记忆 + 插入并发送 | L263-527 | 是 |
| persona-skill（待删） | — | PersonaManagerModal（人格列表/编辑/绑定树/诊断）；PromptInjectPanel（技能列表/编辑/路径绑定/会话树/临时注入/诊断）；HarnessSkillPanel（system + project 技能开关/删除） | — | 否 |

---

## 9. 裁剪施工顺序建议（含风险点）

**推荐顺序**（每步都能独立 typecheck）：

1. **删叶子**：common/SubPanelModal.tsx、utils/version.ts、import-export/ImportConfirmModal.tsx（先确认无 import 残留）、dialog-style.ts 的成就 CSS 与 PL_DIALOG_EMBED_OVERLAY。
2. **删非提示词组件**：persona-skill/ 三个文件 + SkillImportModal.tsx；同步改 PromptAssistant（删 2 case）、SettingsAboveMenuButton（删 2 个 NAV_ITEM + PANEL_TYPE_MAP 2 项）、ImportExportModal（删 2 个按钮 + 状态 + import）。
3. **裁 api.ts**：按 4.8 → 4.9 → 4.10 → 4.11 → generateDraft → getMetaValue/setMetaValue 的顺序删；每步跑 typecheck。注意 api.ts 只从 ../../types.js 引入类型（L7-17），删类型时要同步改 src/types.ts，而 types.ts 是 host/client 共享。
4. **裁 i18n.ts**：先按前缀整段删（pl.skillModal. / pl.personas. / pl.inject. / pl.harnessSkill. / pl.diag. / pl.sessionPrompts. / pl.ai. / pl.ctx.personas / pl.ctx.workspaceInstructions），再处理 pl.achievements.loading；**zh/en 必须同步删**（en 的类型是 Record<keyof typeof zh, string>，多一个键即编译失败）。
5. **改身份文案**：NS（i18n.ts:14）、pl.title / pl.setSectionTitle、package.json 的 name/description、cordis.patch.yml 的插件 id、SettingsSection 关于模块的仓库链接（L701 与 L726 两处硬编码）。
6. **可选合并**：把 PromptLibraryButton 的面板编辑/详情段删掉，只保留按钮 + # 浮层 + 列表插入，把「词库管理」职责全部交给 LexiconManagerModal。

### 9.1 风险点（务必逐条核对）

1. **WS 订阅不能漏**：utils/index.ts:114-120 的 startDataChangedSubscription() 是数据实时同步、AI 润色回填（fill-draft）、导出推送（export-download）的唯一入口；漏掉不会报错，只会静默失效。
2. **Tooltip 必须保留副作用 import**：utils/index.ts:19 的 import "../components/common/Tooltip.js"；否则全项目 data-tip 全部失效（无报错）。
3. **data-sync 的 4 个 API 都要留**：notifyDataChanged、useDataChanged、useFillDraft、useExportDownloaded 各自内部都会调用幂等的 startDataChangedSubscription（subscribed 单例标志在 data-sync.ts:21）；删组件时别顺手把整个 data-sync 精简掉。
4. **设置项键名与行为不一致**：# 触发的开关叫 tildaTriggerEnabled（波浪号），但代码实际检测的是 #：PromptLibraryButton L239 处判断光标前一字符是否为 #、L283 处判断 e.key 属于 # / 3 / Dead / Process（中文输入法情形）。若改触发字符，这三处要一起改。
5. **container 是内嵌模式唯一开关**：LexiconManagerModal 在 !container 时才显示「标签 / 回收站」按钮（L1568）；PromptAssistant 在设置面板内嵌时必须传 container={panelContainerRef.current}（L61-113），否则同一弹窗会在设置面板里再叠一层 fixed 遮罩。
6. **portal 时序**：SettingsAboveMenuButton.schedulePanelContent 用 queueMicrotask 等 React 完成渲染后再派发 pl:show-panel-content（L107-118）；调整 PromptAssistant 的注册顺序/组件树结构容易踩「容器未挂载 → 空白面板」。
7. **types.ts 是 host/client 共享**：PluginSettings / Prompt / SessionPrompt / ScopeNode / PersonaView 等类型被 src/host/* 引用；删客户端功能时不要顺手删类型，反之删 host 路由时也要检查 api.ts 是否仍引用。
8. **构建不受组件增删影响**：scripts/build.mjs 用 esbuild 打两个 bundle（host：src/index.ts → lib/index.js；client：src/client/utils/index.ts → lib/client.js，带 __ModuleLoader__ 包装，L74-111），@deepseek-ai/* 全部 external（L36-48）。新增 npm 依赖会被打进 bundle；@deepseek-ai/dsh-client-ui-primitives（Button）与 dsh-client-ui-slots（TranslateNS 类型）已在 external 列表，可放心复用。
9. **插槽名不可自造**：conversation.input.left / conversation.input.dock / settings.section 由宿主包声明；精简版沿用即可，改 slot 名会导致 inject 永不触发（静默无 UI）。
10. **空目录与死引用**：删 persona-skill/ 目录后，确认没有任何 import 指向 ../persona-skill/*.js；同理 SkillImportModal 被 ImportExportModal:43 引用，删文件前先删该 import。
