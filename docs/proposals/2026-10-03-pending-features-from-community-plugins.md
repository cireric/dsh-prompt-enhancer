# dsh-prompt-enhancer · 待办功能清单（社区吸收 · 提案稿）

- 日期：2026-10-03 · 基线提交 `eb03968`（工作树干净）
- 状态：**提案稿 · 已挂起** —— 条件：**先把插件投入日常使用**，用真实使用暴露"哪里不够用"，再决定这 14 条里做哪几条。本文件不作实施承诺
- 权威性：**不改变** `docs/superpowers/specs/2026-09-24-dsh-prompt-enhancer-design.md` 的权威（范围与契约的唯一权威）；与规格冲突时以规格为准。采纳走既有裁决流程（grilling → spec → tickets → implement）
- 来源：社区第三方 DSH 提示词插件两轮检索（7 家，2026-09-25；新检索 13 家，2026-10-03）＋ 本仓源码重验；第一轮材料与逐条证据的去向见 §8.2
- 证据分级：🟢 本仓源码实测（文件:行号）｜🟢\* 外部仓库浅克隆读码（9/26–10/03 版，非最新）｜🟡 外部 README 自述
- 排序口径：**先质量面（正确性 > 数据安全 > 能力），再功能面**。本项目功能面已无缺口（两轮交叉验证），故 14 条中只有 5 条是"新增能力"，其余 9 条是加固 / 修订 / 文档

> ⚠️ **动工前必读（冻结纪律）**：本文件的源码引用锚定在基线 `eb03968`。恢复施工时**先把每条与当日代码重验一遍**——本项目侧任何重构都会让 `src/host/ai.ts:279` 这类行号失效；外部仓库引用用的是浅克隆 HEAD 的行号（hoyyang 的 `anchors.ts` / `fidelity.ts` / `length-gate.ts`），上游有新提交也会位移，需要时按 §9 重新克隆核对。

---

## 0. 范围

### 0.1 本文件覆盖（14 条，按建议优先级分档）

| 档 | 条目 |
|---|---|
| **P0 · 状态与边界保护** | A1 保存路径乐观锁守卫 · A2 插件路由信任栅栏 |
| **P1 · 产出质量闸** | B1 硬事实保真闸 · B2 长度闸 |
| **P1 · 撤回面** | C1 composer 侧撤回 + 编辑即失效 + 会话内增强历史 · C2 设置撤销栈（并入 C1 机制） |
| **P2 · 词库与降级** | D1 存储总量护栏 · D2 F2 记忆链（方向序列 + 三条卫生规则 + 禁入集合）· D3 F6 内置场景种子词库 · D4 F7 规则模板兜底 · D5 token 预算自适应 |
| **P3 · 文档与观察** | E1 README 槽位契约节 · E2 隔离子会话改写（**观察项，不在本轮范围**） |

### 0.2 明确不做（本轮）

- **F5 会话历史喂润色**：按 2026-10-03 裁决**忽略** —— 润色请求保持自洽（content 只有草稿正文，见 `src/host/ai.ts:485-489`），不向模型提供会话上下文。连带作废"截断透明""送外发前掩码"两条卫星项。F5 转为 §1 的**未验证假设 H1** 记档。
- 会话级 systemPrompt 注入（规格 §2.2，0 section 是产品承诺）、5 模式 stage 引擎、自定义指令热生效、斜杠命令、上下键历史召回、Markdown 批量导入、ecircle6 的具体 guard 代码与限流、自动合并冲突 —— 逐条理由见 §8.2 归档的《社区功能差分析》§6。

---

## 1. 待验证假设（不施工，仅记档）

| # | 假设 | 判据（翻案前必须先过） |
|---|---|---|
| H1 | 给润色喂会话历史，对产出质量是"增强"还是"贬损"未定 | 先做一次 A/B（同草稿 + 有/无上下文各 N 次人工评级），有结论再谈实现 |
| H2 | 隔离子会话改写（Vinzelles 🟢\*：`composeFrom` 继承父预设 + 只读工具限制 + 不兼容时降级裸子会话）比"直调 ctx.llm"更好 | 当 D2 之后仍出现"润色缺少意图信息"的实例 ≥ 3 次时启动评估 |

---

## 2. P0 · 状态与边界保护

### A1 · 保存路径乐观锁守卫

**目标**：并发编辑不再静默覆盖；冲突时人的草稿不丢，决定权在人手里。

**现状（🟢）**：`PUT /prompts/:id` 的校验在 `src/host/routes.ts:178-197`（只用 `PROMPT_WRITABLE_KEYS` 过滤，无版本比较）；`store.updatePrompt`（`src/host/store.ts:478-523`）读最新库值后盲写，`updatedAt` 由"本次改了什么"决定，与客户端看到的是否同一版无关。两个标签页打开同一条、各改一段、先后保存 ⇒ 后保存者覆盖前者，无提示、无痕迹。既有 43 个测试文件全部单会话，检测不到。

**设计**
1. **乐观锁 token = `updatedAt`**，不新增字段、不动 schema（单条记录只有单人编辑，引入 revision 版本号属多余实体）。
2. 客户端 `PUT /prompts/:id` **可选**携带 `ifUpdatedAt`（打开编辑时的 `updatedAt`，来自列表/详情返回值）。
3. 宿主：传了且与库内当前值不等 ⇒ **409**，信封走既有 `failWithCode`（`src/host/routes.ts:52`）家族；错误码枚举的归属在施工时定（`src/host/ai-errors.ts` 只服务 AI 路由，**不混用**）。
4. 客户端：收到该 409 ⇒ **保留当前草稿与编辑态**，显示冲突提示与两个选择：**重新载入最新** / **覆盖保存**（覆盖 = 重发且不带 `ifUpdatedAt`）。
5. **向后兼容为硬要求**：不带 `ifUpdatedAt` 的调用行为与今天逐格相同（`lib/` 里的旧产物、旧页面必须照常工作）。

**改动面**：`src/host/routes.ts`（PUT 分支）· `src/host/store.ts`（`updatePrompt` 增加可选条件参数并透传）· `src/client/utils/api.ts`（`updatePrompt` 可选参）· `src/client/components/PromptManagerModal.tsx`（捕获 `updatedAt` + 冲突分支）· `src/client/utils/i18n.ts`（3 键 zh/en：被改过 / 重新载入 / 覆盖保存）

**验收骨架**
- 并发用例：两个读者取同一 `updatedAt` → 先写 200、后写 409，且库内容仍是先写者的逐字节内容；
- 不带 `ifUpdatedAt` 的 PUT → 行为与基线一致（既有 `tests/api.test.mjs` 不改断言即可通过）；
- 冲突后草稿仍在（组件级：不因 409 清空编辑框）；
- 负样本：把版本比较改坏 → 并发用例必须红。

### A2 · 插件路由信任栅栏

**目标**：第三方插件路由不再对任意来源的浏览器请求开放写操作。

**现状（🟢）**：宿主只栅栏了 `/api`（`packages/client/connection/src/rpc-host.ts:104-107` 调 `isTrustedApiRequest`，实现在 `.../api-request-trust.ts:91`；路由注册 `rpc-host.ts:179-182`，`admit` 在 `index.ts:149`）。**插件经 `ctx.webServer.register({ kind:'prefix' })` 注册的路由不经过任何校验**——`packages/host/webserver/src/index.ts:222-238` 直接 `route.handler(req,res)`。本插件 `/api/prompt-enhancer`（`src/host/routes.ts:457-459`）正在这条路上，且它承载写操作（POST/PUT/DELETE）。

**设计**
1. 新增**零依赖纯函数模块 `src/host/trust.ts`**：`isTrustedRequest(headers, trustedHosts): boolean`，逐条镜像官方口径：
   - Host 头必须可解析，且 hostname 是 loopback 或命中 `trustedHosts`（带端口条目精确匹配、无端口条目匹配任意端口，两侧 WHATWG 归一化）；
   - `sec-fetch-site: cross-site` ⇒ 拒；
   - 有 `Origin` ⇒ 必须与 Host 精确相等；`"null"` ⇒ 拒；无 `Origin` ⇒ 放行（Host 栅栏已生效）。
2. `dispatch` 入口（`src/host/routes.ts:133-139`）前置该校验，失败返回 **403**。
3. **不加限流**：单用户本地场景，限流只会在批量导入 / 清键时误伤自己（这是与 ecircle6 的有意差异）。

**改动面**：新 `src/host/trust.ts` · `src/host/routes.ts` · 新 `tests/trust.test.mjs`

**验收骨架（用例形状取自官方 `packages/client/connection/tests/api-request-trust.host.spec.ts`）**
- 放行：`host: 127.0.0.1:3080`（无 Origin）· `localhost:3080` + `sec-fetch-site: same-origin` · `harness.internal:3080` ∈ trustedHosts；
- 拒绝：`Origin: http://evil.example` · `Origin: null` · `sec-fetch-site: cross-site` · 无 `Host` · `Host: 0x7f.0.0.1`（非规范写法）· `Host: 128.0.0.1` · 端口不匹配的 trustedHosts；
- 真跑一次：对本机 3080 发一个带恶意 `Origin` 的 `POST /api/prompt-enhancer/prompts` ⇒ 403 且库无变化。

---

## 3. P1 · 产出质量闸（B1 / B2，共用一次重试）

### B1 · 硬事实保真闸

**目标**：润色不得静默改变原文的硬事实；若发生，可见、可重试、可感知。

**现状（🟢）**：`polishSystemPrompt`（`src/host/ai.ts:273-290`）只写"保持原意与所有关键细节，不得遗漏、曲解或删减"（第 279 行）——**只有祈使句、零校验**；返回后只做套话剥离（`src/host/text.ts:71-102`）。模板变量有专门条款，**非变量的事实一个字的保障都没有**。

**来源**：hoyyang/dsh-improve-prompt 🟢\*——`src/anchors.ts` `extractAnchors`(L90) / `normalizeForMatch`(L124) / `stripWhitespace`(L129) / `anchorSurvives`(L148)；`src/fidelity.ts` `checkFidelity`(L30) / `repairClause`(L49) / `reinjectionBlock`(L71) / `fidelityNote`(L86)。LiWenzhuo001 独立实现同类锚点引擎（`src/engine/anchors.js`）⇒ 需求被两次独立验证。

**设计**
1. **落点**：新纯模块 `src/host/fidelity.ts`（零依赖、可 `node --test` 直测，与 `text.ts` 同属"AI 输出后处理"）。
2. **只接入 `polishPromptBodyCore`**（`src/host/ai.ts:474-502`）；一键完善（`refinePromptCore`，`ai.ts:536-556`）改的是结构，不在同一风险面。
3. **锚点分类（先做减法，这是误报控制的关键）**：

| 类别 | 形态 | 手法 |
|---|---|---|
| template-var | `{{变量}}` | **复用 `extractVariables`**（`src/host/text.ts:126-128`）——同一份定义，杜绝两处漂移 |
| inline-code | 反引号包裹、内容 ≤ 40 字符 | 反引号配对提取 |
| url | `https?://…` | 到空白为止 |
| path | `/a/b`、`./x`、`~/y`、`a/b.ts` | 需含 `/` 或已知扩展名 |
| version | `v?\d+(\.\d+)+` | 带 `v` 或 ≥3 段 |
| number+unit | 数字 + 单位（ms / s / m / h / KB / MB / GB / px / % / 行 / 字 / 条） | **中文量词（个 / 种 / 次）不收** |

   **明确不抓**：普通中文句、单独裸数字、常见词——漏报一次是"用户可能没注意"，误报一次是"模型被数字绑住、不敢改任何措辞"，代价不对称。
4. **参数（常量 + 测试钉死）**：`ANCHOR_MAX = 8`（按类别轮询取，防单一类别占满）；匹配三级——**精确 includes → 归一化（小写 + 空白折叠）→ 去空白**，三级全不中判缺失。
5. **修复**：缺失 ⇒ 注入回灌条款 + **重写一次**（与 B2 共用这一次）；重写后仍缺 ⇒ **不掩盖**：面板一行次级提示 + 列出仍缺失的锚点原串。
6. **与 hoyyang 的有意差异**：采纳三分法，**不采纳** `verdict='converge'` 的多轮收敛——重试预算只有 1 次，与本仓 Issue #6"重试不叠加"的既有纪律同形。

**改动面**：新 `src/host/fidelity.ts` · `src/host/ai.ts` · `src/client/utils/i18n.ts`（提示文案 zh/en）· `AIPolishButton.tsx`（展示缺失项）

**验收骨架**：6 类各 1 正向夹具；**误报样本必须为负**（普通中文句 / 单独裸数字 / "3 个月"）；变异验证（改坏"保留锚点" → 用例必须红）；不变量断言——保真闸的变量类与 `extractVariables` **同源**。

### B2 · 长度闸

**现状（🟢）**：能力层契约是"等长或更精炼"（`src/host/ai.ts:266-271`），实现只是一句 prompt（第 280 行）、**无字数比对**。

**来源**：hoyyang 🟢\*——`src/length-gate.ts` `MIN_BUDGET_CHARS`(L22) / `ratioOf`(L45) / `budgetFor`(L58) / `isOverBudget`(L69)。

**设计**：`budget = max(floor(inputChars × LENGTH_RATIO), MIN_BUDGET_CHARS)`，`LENGTH_RATIO = 1.05`、`MIN_BUDGET_CHARS = 200`；超预算 ⇒ 与 B1 的缺失条款**合并成一段 revision 指令**，注入**同一次**重写；仍超 ⇒ 面板标注（不伪装合规）。

**改动面**：`src/host/ai.ts`（与 B1 同一处）· 纯函数可并入 `fidelity.ts` 或单列 `length-gate.ts`（施工时按行数定）

**验收骨架**：预算边界（恰好 = 预算不算超）· 超预算触发一次重写 · 仍超时走标注分支 · 按钮文案与事实一致（不能出现"已符合长度"而实际超）。

---

## 4. P1 · 撤回面（C1 / C2，同一机制）

### C1 · composer 侧撤回 + 编辑即失效 + 会话内增强历史

**现状（🟢）**：AI 面板已有对比（原文｜优化稿）与「应用到输入框」（`src/client/components/AIPolishButton.tsx` 状态机 idle→polishing→done→error / refining→refined→saving→saved…，见该文件 55-65 行），但**应用后无法撤回**，i18n 无任何 undo 键。`ai.toggleMoved` 那句把"原文↔优化稿"的切换明确指向管理面板详情页。

**设计（沿用 2026-09-25 已裁决细节，落点被现状收窄）**
- 应用后同钮原地变 ↺ 撤回（同钮状态机，BBbangage 🟢\*）；**不限时**，放弃 sunzhentao 的 9s 时限。
- **编辑即失效**（Y1X1n 🟢\*）：用户手动改草稿 ⇒ 撤回入口消失（防覆盖用户后来敲的内容）；发送或清空草稿同样失效。
- 撤回 = 把应用前的草稿原文写回输入框（前端缓存，复用 `inputActions.setDraft`），**不触碰词库**；库侧回滚仍走管理面板既有 swap 路由。
- 增强历史：会话级内存，上限 20 条，刷新即清，**不入库**。

**改动面**：`src/client/components/AIPolishButton.tsx` + 新纯决策模块（撤回可用性 / 失效判定，可 node --test）· `src/client/utils/i18n.ts`（2–4 键）

**开工前必须拍板的 4 个分支**（2026-09-27 已问未答，本轮给推荐）：Q1 撤回态落点 = 扩现有面板流（推荐；新第四 overlay 面会撞 `overlay-claim.ts` 单值寄存器）｜Q2 原稿存放 = 组件内存单槽、刷新即清（推荐）｜Q3 撤回边界 = 只恢复草稿（推荐）｜Q4 历史粒度 = 记原稿+采用稿对、不做"重新采用"（推荐）。

### C2 · 设置撤销栈（并入 C1，不另立功能）

**现状（🟢）**：13 键逐字段写、写入即落盘（`src/settings-shape.ts:25-33`、`SettingsSection.tsx:10-19`），**无撤销**。

**设计**：与 C1 的"同钮状态机 + 编辑即失效 + 内存单槽"是同一机制 ⇒ **作为 C1 的追加验收项**实现，不另起设置页专用栈（两处实现必然漂移）。**⚠ 这条至今无 issue 记录，开工前先开票**（见 §7）。

---

## 5. P2 · 词库与降级

| # | 条目 | 现状（🟢） | 设计要点 | 验收骨架 |
|---|---|---|---|---|
| **D1** | 存储总量护栏 | 只有条数上限（≤10000）与单条 5MiB（`src/host/routes.ts:66`）；**无总量维度** | **不新增设置键**；在导入路径（`routes.ts:366-370`）加总量护栏（建议 32 MiB），超限拒绝并给可执行信息（先导出备份再删旧条目） | 导入恰好等于 / 超过护栏的边界；拒绝时给出可执行文案；正常导入不受影响 |
| **D2** | F2 记忆链 | 只有**单值**方向记录 `pl:refined-dir:<id>`（`src/client/utils/refined-direction.ts:39-96`），无序列、无禁入集合 | 方向序列 `{at, direction}[]`，下轮注入最近 3 条；**三条卫生规则**（同文重试不带 / 跨会话清零 / 上轮解析失败不带）；「放弃」进禁入集合，下轮显式写"用户已否决：…，不再重提"；开关默认 on；持久化遵守现有 `pl:<用途>:<id>` meta 约定 | 三条卫生规则各 1 用例；禁入集合措辞出现在下轮 prompt；切会话清零 |
| **D3** | F6 内置场景种子词库 | 无 assets 层 | 随插件分发静态 JSON（12–15 条**精选通用场景**）；管理面板「导入内置模板包」走既有导入预览 / 确认流；允许重复导入。取材：seven282 的 22 子类清单（裁掉垂类） | 导入预览统计正确；重复导入走既有冲突处理；**不新增路由**（不算第四入口） |
| **D4** | F7 规则模板兜底 | 无规则模板；`aiErrorKey` 只映射文案 | AI 失败（503 / 超时）时失败面板给「用规则模板起草」按钮，**用户点了才走**；单一通用模板（保留原句 + 2–4 条具体要求自然分行），**不做意图分类**；经唯一写回缝 | 未点按钮不产生任何写；点了才落库；输出带来源标记 |
| **D5** | token 预算自适应 | `AI_MAX_TOKENS = 2048` 恒定（`src/host/ai.ts:89,341`） | 纯函数"输入长度 → 预算"（有上限封顶）；被截断时**可见提示**（不静默丢内容） | 边界（短输入不缩预算、长输入封顶）；截断时提示出现 |

---

## 6. P3 · 文档与观察

- **E1 · README 槽位契约节**（纯文档）：声明占用的 7 个官方插槽（`src/client/index.ts:76-127`）、各依赖的宿主服务（`slots` / `locale` 必需，`uiWorkspace` / `uiConversation` / `configForms` 条件注入），以及"0 systemPrompt section"的产品承诺与版本要求。
- **E2 · 隔离子会话改写**：**观察项，不在本轮范围**（见 H2）。

---

## 7. 交付顺序、依赖与并行性

| 批次 | 内容 | 依赖 | 与谁串行 |
|---|---|---|---|
| **PR1** | A1 乐观锁守卫 | 无 | 与 PR2 都改 `routes.ts` ⇒ 串行；与 PR4 无交集（可并行） |
| **PR2** | A2 路由信任栅栏 | 无 | 见上 |
| **PR3** | C1 撤回 + C2 设置撤销 | C1 四问先裁决 | 与 PR1 共享 `i18n.ts` ⇒ **i18n 键一次加完** |
| **PR4** | B1 保真闸 + B2 长度闸 | 无 | 与 PR1 / PR3 无文件交集（`ai.ts` 独立），真并行 |
| **PR5** | D1–D5 | D4 依赖首包已交付的错误码面（已就绪 🟢） | 各自独立；D2 依赖 C1 的采用 / 放弃信号 ⇒ 排在 PR3 之后 |

**硬性串行点**
1. `src/host/routes.ts`：A1 与 A2 依次改、**分两次提交**（AGENTS.md"一个任务一次提交"；该文件注释承载不变量最多、两轴评审最重，不应让评审同时看两件事）。
2. `src/client/utils/i18n.ts`：凡动它的批次**串行**；键集 zh/en 必须逐格同值（`tests/i18n.test.mjs` 会锁），本文件涉及的键**建议一次加完**。
3. D2 依赖 C1 的信号（采用 / 放弃）。

**开工前必做**（这三条至今只活在临时材料里，会被下一次材料轮换吞掉）
- 开 `fix(host): 保存路径乐观锁守卫 — 并发编辑不得静默覆盖`（A1）
- 开 `fix(host): 插件路由信任栅栏 — Host / Origin / sec-fetch-site`（A2）
- 开 `feat(client): composer 撤回 + 设置撤销栈`（C1 + C2）

---

## 8. 与既有定稿的差异 · 材料去向

### 8.1 差异（需在裁决台账落字）

| # | 冲突点 | 本文件口径 |
|---|---|---|
| 1 | F5 取样口径：设计规格写"最近 **3** 条用户消息"，第一轮材料转录 Y1X1n 是"**8** 条 / 1600 字" | **两者均作废**：F5 整体忽略（2026-10-03 裁决），以 §1 H1 记档 |
| 2 | 已定稿的采纳文档把 F1 撤回落点写作"扩面板流 vs 新第四 overlay 面" | 现状已把对比面收窄——面板内**已有**原文｜优化稿对比与应用，缺的只是"应用之后能撤回" |
| 3 | 2026-09-25 材料把"设置撤销"归为 backlog（F8 的副产品，非独立项） | 并入 C1 同一机制（§4 C2），不另立 |

### 8.2 材料去向（本仓内，归档在 `.tmp/.archive/`）

| 素材 | 处置 |
|---|---|
| 社区调研（7 家，2026-09-25，逐家功能清单 + 源码证据） | 被本文件取代 → `community-prompt-plugins-survey.md` |
| 采纳裁决文档（2026-09-25 定稿 / 2026-09-27 挂起，含 §R 裁决台账与重启指南） | **仍是有效历史档案**（F1 四问、F2 / F5 / F6 / F7 前置结论由本文件继承）→ `design-adopted-features.md` |
| 社区功能差与"明确不做"逐条理由（新检索 13 家，2026-10-03） | 正文已并入本文件；否决策略的逐条理由仍以该件为归处 → `community-feature-adoption-analysis.md` |
| DSH 存储与配置平台知识备查（基线 0.1.5-rc.2） | **已部分过时**（本项目已迁 dsh 0.2.0 的 `configForms` 契约）→ `dsh-storage-and-settings-platform-notes.md`，引用前按本机 checkout 重验 |
| 参考项目克隆清单与 SHA（8 个干净浅克隆） | `ref-clones-sha-manifest.md`（含复原命令） |

---

## 9. 参考项目（复原须知）

两轮共 20 家社区插件。本文件逐条引用其设计的那 8 家（footprint 见 §8.2 的清单）：**克隆已于 2026-10-03 从本仓删除**（当时全部干净、无本地提交），SHA 与复原命令记在 `.tmp/.archive/ref-clones-sha-manifest.md` —— 恢复施工或复审这些引用时，先按清单复原对应仓库再核对行号。第二轮新检索的 13 家（含 B1 / B2 的来源 `hoyyang/dsh-improve-prompt`）从未克隆进本仓，其浅克隆在会话外目录 `/tmp/dsh-prompt-research/`（临时目录，随时可能被系统清理）。

复原任一参考项目：`git clone --depth 1 <URL> <目录>`（`--depth 1` 通常已含清单里的 SHA；取不到时 `git fetch --unshallow` 后再 checkout）。

**覆盖缺口（诚实清单）**：第二轮 31 个克隆中 17 个未深读 · 未做 npm registry 检索、未展开聚合目录（命名不规则的插件可能漏网）· 10 个仓库的星标 / 更新时间因 GitHub API 限流未取到 · 外仓证据均为浅克隆 HEAD 行号，上游更新即位移 · A1 只做到源码级判定，未做多标签页并发编辑的实机复现。

