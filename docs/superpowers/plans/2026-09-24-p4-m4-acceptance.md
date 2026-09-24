# P4 / M4 活 GUI 验收记录（2026-09-24）

- 宿主：`http://127.0.0.1:3080`（开发构建已热重载，`lib/client.js` 为待验收产物）
- 驱动方式：Playwright（`browser_navigate` / `browser_snapshot` / `browser_click` / `browser_type` / `browser_press_key` / `browser_evaluate` / `browser_console_messages` / `browser_network_requests`）
- 会话：`Into the Unknown`（workspace `cireric-dsh-prompt-enhancer`，验收开始时 `Turn 0`）
- **活 GUI 语言环境 = en**（`New session` / `Settings` / `Choose workspace`），故本轮所有 i18n 文案按 en 呈现；zh 文案以源码为证据核对（见第 1 行）

| # | 验收项 | 结果 | 证据（我做了什么 / 观察到什么） |
| - | ------ | ---- | -------------------------------- |
| 1 | 输入框旁出现「词库」按钮（i18n + title 提示） | **PASS** | 用快照定位到 `button "Open the prompt library" [ref=e305]: Library`，位于 composer 工具行内（`SPAN → DIV → DIV.uI_N2W_tools → DIV.uI_N2W_row`），与输入框 `div.uI_N2W_input[contenteditable]` 同属 composer 组件。`browser_evaluate` 读其属性：`text="Library"`、`title="Open the prompt library"`、`aria-label` 同值、`aria-haspopup="dialog"`、`aria-expanded="false"`。zh 文案在源码中存在：`src/client/utils/i18n.ts:5-6` → `"button.title": "词库"`、`"button.tip": "打开提示词库"`（en 为 `Library` / `Open the prompt library`，`:27-28`）。 |
| 2 | 点开后快速列表能列出提示词 | **PASS** | 点击该按钮（`browser_click` on `button[title="Open the prompt library"]`）后 `aria-expanded` 变 `true`，出现 `dialog "Saved prompts"`（= `list.title`），内含 `listitem "欢迎使用提示词增强"` + 摘要「这是你保存的第一条提示词，也是本插件的上手引导。你可以这样使用它：…」+ 三个动作按钮 `Insert` / `Overwrite` / `Insert & send`。库内提示词数 = 1（种子）。 |
| 3a | 插入 = 换行追加 | **PASS** | 先在 composer 输入 `草稿A`（读回 `innerText="草稿A"`），再点 `Insert`；读回 composer DOM：`<p>草稿A</p><p>这是你保存的第一条提示词，也是本插件的上手引导。</p>…` —— 草稿独占一段、正文另起一段，即「草稿 + 1 个换行 + 正文」，且原有草稿未被丢弃。 |
| 3b | 覆盖 = 整段替换 | **PASS** | 清空后输入 `草稿B`，再点 `Overwrite`；读回 composer 首段已是 `这是你保存的第一条提示词，也是本插件的上手引导。`，`innerText.includes('草稿B') === false` —— 原草稿被整段替换。 |
| 3c | 插入并发送 = 插入后立即发送 | **PASS**（1 次，已授权） | 草稿为空时点 `Insert & send`。观察：① composer 立即变为空串 `""`；② `document.title` 由 `DSH Local Build` 变为 `这是你保存的第一条提示词， — DSH Local Build`（标题由消息派生）；③ 会话推进 `Turn 0 → Turn 1`；④ 转写区出现用户消息行 `div.tUBCZG_userRow`，文本 = 种子提示词正文全文（179 字符，含 `也可以直接编辑这条提示词，换成你自己的内容。` 结尾）。**实际发出的内容 = 种子提示词正文（无前缀）**，即「这是你保存的第一条提示词，也是本插件的上手引导。／你可以这样使用它：／· 在输入框旁打开词库…／· 输入 # 触发实时筛选…／· 选中聊天里的文字…／· 用 AI 优化润色正文…／也可以直接编辑这条提示词，换成你自己的内容。」 |
| 4 | `{{变量}}` 模板（弹窗 / 替换 / 未填保留 / 记忆） | **PASS** | 库面板无新建入口，故用只读外的 HTTP `POST /api/prompt-enhancer/prompts` 建**临时**提示词：`title=验收临时模板变量提示词`、`body=请用 {{风格}} 写一段关于 {{主题}} 的介绍。`（id `4881941f-59d3-47ca-a0c3-454528998c54`）。点其 `Insert` → 弹出 `dialog "Fill template variables"`（= `vars.title`），提示「Each {{name}} below is substituted when inserted」，含两个输入框 `风格`、`主题`，按钮 `Fill in` / `Cancel`。① 只填 `主题=量子计算`、`风格` 留空 → 点 `Fill in` → 弹窗关闭，插入正文为 **`请用 {{风格}} 写一段关于 量子计算 的介绍。`**（已填变量被替换、**未填变量保持 `{{风格}}` 原样**）。② 重新打开同一提示词的变量弹窗 → `主题` 输入框预填 `量子计算`，`风格` 仍为空，且弹窗多出提示 **`Filled with values from last time`**（= `vars.remembered`），即带出上次填的值；随后点 `Cancel` 不二次插入。网络侧佐证：`GET /meta/pl%3Atemplate-var-memory`（#74 首次打开）→ `PUT` 同 key（#75 我点 `Fill in`）→ `GET` 同 key（#80 第二次打开）全部 200。 |
| 5 | `#` 候选浮层 + 实时筛选 + 点击替换令牌 | **PASS** | 在 composer 逐字键入 `帮我 #欢迎` → 出现浮层 `group "Pick a prompt"`（= `hash.title`），内含候选按钮 `欢迎使用提示词增强`（含标签 `欢迎`）与摘要。**实时筛选**双向验证：继续键入 `zzz`（草稿变 `帮我 #欢迎zzz`）→ 浮层文本变为 `Pick a prompt\nNo matching prompt`（= `hash.empty`，候选消失）；连按 3 次 `Backspace` 回到 `帮我 #欢迎` → 候选恢复。**鼠标点击**该候选（按 D2 裁定只用点击）→ 草稿变为 `帮我 这是你保存的第一条提示词…`，`innerText.includes('#欢迎') === false`（令牌被替换为提示词正文）、浮层消失。键盘 ↑↓/回车按 D2 裁定不测。 |
| 6 | 用量上报（次数 / 最近使用时间） | **PASS** | `curl -s /api/prompt-enhancer/prompts` 前后对比：种子提示词验收前 `usageCount=0, lastUsedAt=0`；完成 3a/3b/#点击/3c 后 `usageCount=4, lastUsedAt=1790262985766`；临时提示词插入一次后 `usageCount=1, lastUsedAt=1790262913353`。网络请求列表佐证恰好 5 次 `POST /prompts/{id}/use → 200`，其中种子 4 次（#65/#69/#71/#83）、临时 1 次（#76）。 |
| 7 | 无 console error | **PASS** | `browser_console_messages(all=true, level=error)` → `Total messages: 2 (Errors: 0, Warnings: 0)`；按 `level=info` 取出两条均为 INFO/LOG（`[genui] client active…`、`[prompt-enhancer] client loaded v0.1.0 …`）。全部交互后复查仍为 `Errors: 0, Warnings: 0`。 |
| 附 | 网络异常 | **PASS** | `browser_network_requests(filter="prompt-enhancer")` 共 15 条业务请求，**全部 `[200] OK`**，无 4xx/5xx/失败请求（含 `settings`、`prompts`、`prompts/{id}/use`、`meta/…`）。 |

## 未完整验证或无法判定的项

1. **3c「替换 vs 追加」分支未在运行时区分**：执行 `Insert & send` 时草稿为空，故运行时只能证明「内容被放进输入框并立即发出」，无法从运行时观察它相对已有草稿是替换还是换行追加。追加语义由源码读出（`src/client/utils/insert.ts:7-9`：`mode==="overwrite"` 才整段替换，`insert-send` 与 `insert` 同走 `draft ? \`${draft}\n${body}\` : body`），属**代码读取级证据**，非运行时验证。未再次发送以免违反「只允许发 1 次」。
2. **zh 文案未在活 GUI 渲染验证**：活 GUI 语言为 en，`:5-6` 的 `词库` / `打开提示词库` 只由源码确认，未在浏览器中实际渲染出中文。若验收要求必须在活 GUI 见到 `词库` 三字，需把宿主语言切到 zh 后重测。
3. **变量记忆的归因存在一点不可排除的余地**：记忆存于**全局** key `pl:template-var-memory`（按变量名，不按提示词），我读取到的值是 `{"target":"日语","主题":"量子计算"}` —— 其中 `target:日语` **不是**我填写的，说明该 key 在我验收之前就已有他人/他轮残留。因此「`主题` 预填」的归因依据是：我点击 `Fill in` 触发的 `PUT`（#75）与随后第二次打开的 `GET`（#80）返回同值，且第二次打开渲染出 `Filled with values from last time` 提示；但无法从数据上排除「验收前该 key 恰好已含 `主题=量子计算`」这一巧合。运行时未做唯一性更强的取值（若需绝对排除，应换用一串一次性随机变量名重测）。
4. **`#` 浮层键盘选择未验证**：依 D2 裁定（只支持鼠标点击、不支持 ↑↓/回车）不测、不计缺陷；本次确认「鼠标点击可以选中」。
5. **面板遮挡输入框未列入验收项**：词库面板/变量弹窗展开时会覆盖 composer 区域，Playwright 点击 composer 被面板内元素拦截（`<span>` from `div.uI_N2W_row` intercepts pointer events），需先收起面板。判定为浮层遮挡的预期布局行为（可正常开关），非缺陷，仅作观察记录。

## console / 网络异常

- Console：**Errors: 0**，Warnings: 0；仅 2 条 INFO/LOG：
  - `[INFO] [genui] client active; fence-channel=dom @ …`
  - `[LOG] [prompt-enhancer] client loaded v0.1.0 @ …`
- 网络：`prompt-enhancer` 业务请求 15/15 全部 `[200] OK`，无失败与异常状态码。

## 临时数据清理

| 动作 | 对象 | 结果 |
| ---- | ---- | ---- |
| 创建 | 临时提示词 `验收临时模板变量提示词`（id `4881941f-59d3-47ca-a0c3-454528998c54`，tag `验收临时`），经 `POST /api/prompt-enhancer/prompts`（库面板无新建/编辑入口） | `{"ok":true}` |
| 删除 | `DELETE /api/prompt-enhancer/prompts/4881941f-…` → 进回收站 | `{"deleted":true}`，`GET /trash` 可见该条 |
| 清空回收站 | `DELETE /api/prompt-enhancer/trash` | `{"removed":1}`；复查 `GET /trash` → `[]` |
| 终态复查 | `GET /prompts` | `count=1`，仅剩种子 `欢迎使用提示词增强` |

**未清理的残留（均已如实记录，未做越界删除）**

- 标签 `验收临时` 以 `count=0` 留在标签表（由临时提示词的 tags 隐式创建）。按任务约束「不要创建/删除提示词之外的数据」，**未**调用 `DELETE /tags/验收临时`；同表已存在同类历史残留 `m3临时(count=0)`。
- Meta key `pl:template-var-memory` 现值 `{"target":"日语","主题":"量子计算"}`。该接口只有 `GET`/`PUT` 无 `DELETE`，且值中含非本次写入的 `target:日语`，为免破坏他轮数据**未**改动。

**已产生的副作用（不可逆，验收项本身要求）**

- 种子提示词用量被本次验收改变：`usageCount 0 → 4`、`lastUsedAt 0 → 1790262985766`（验收项 6 必须产生该变化，未回滚）。
- 向会话真实发送 1 条聊天消息（`Turn 0 → Turn 1`），内容为种子提示词正文全文，已在上表 3c 逐字说明；该消息无法撤回。
- 未修改仓库任何文件，除本记录文件 `docs/superpowers/plans/2026-09-24-p4-m4-acceptance.md`；未执行 `npm run build` / `build:dev` / `link-dsh-deps`，未重启任何服务。
