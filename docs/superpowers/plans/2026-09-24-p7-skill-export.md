# dsh-prompt-enhancer P7 实施计划（技能导出 + 浮层互斥收口 + 详情页方向）

> **面向 Agent 执行者：** 必需子技能：`superpower-subagent-driven-development`（执行方式见 §9 附录）。
> **本文件尚未执行的标志：** §5 的任务清单只可在「用户已对 §3 全部 TBD 拍板」之后使用。

**目标：** ① 把提示词**显式导出为官方 DSH Skill**、并让「技能已过期」成为**可见状态 + 一键动作**（规格 §2.1-11 / §6.5 / §7.6 / 验收 15/16/17）；② 收口 **P6 交接的 I-2**——把「任一时刻只有一张浮层/面板在场」从**三处局部规则**收成一个**共享 claim**（P6 只做成了其中一对）；③ 收口 **I-1**——详情页「原文／优化稿」的方向可持久化，使标签不再只能靠猜。

**唯一权威：** `docs/superpowers/specs/2026-09-24-dsh-prompt-enhancer-design.md`（已定稿；**含 §13.9 与 §13.10**——后者记录了 P6 验收暴露的语义订正与五条留档取舍）。本计划与规格冲突时以规格为准，并回头修正本计划。

**上游参考（只读）：** `.tmp/dsh-prompt-library/`（v0.16.0）。一切修复落在本项目侧。

**前置状态：** P1–P6 已交付；P6 交付 **27 个提交**、`npm test` **177/177**、四项检查全绿、活体验收 C1–C16 见 `docs/superpowers/plans/2026-09-24-p6-m6-acceptance.md`。

---

## 0. 输入：P6 交接的三件事

| # | 交接项 | 出处 |
| - | ------ | ---- |
| 0.1 | **复用而非重建**：`shell.overlay` 的 `PromptSurfaceHost` 与 `ui-state.ts` 已在 P6 落地；P7 加一个面板值即可，**不要**新建第二个 `shell.overlay` 条目 | P6 计划「交接给 P7」 |
| 0.2 | **I-2（P7 首项）**：P6 只把「词库面板 × `#` 浮层」做成结构互斥；另两对仍是指针边沿。**已由活体复现证明可达**（见 §1.4） | 最终评审 I-2 + P6 复现 |
| 0.3 | **I-1**：详情页并排标签的**方向**只能靠猜（`POST /prompts/:id/rollback` 是 `swap`，宿主不记录方向）；P6 只做到「不再用错误标签断言」，根治归 P7 | 规格 §13.10-五-4 |
| 0.4 | **产物与提交纪律**：客户端改动必须 `npm run build` 后与 `lib/` **同批提交**；新鲜度口径 = **重跑 build 后 `git status --porcelain` 为空**（不得用「某标识符是否在产物里」判断） | P5 裁决 #8/#12 |
| 0.5 | **已知限制（不要当 bug 修）**：规格 §13.10-五 的五条（键盘取舍 / 变量填窗逐字输入 / 组件接线无自动化 / 详情页方向 / 浮层互斥只覆盖一对） | 规格 §13.10 |

---

## 1. 已核实的宿主契约（本轮现核实：读宿主源码 + 活体只读探针）

> 宿主 checkout = `/Users/eric/Project/tests/deepseek-harness`（DSH Local Build `0.1.5-rc.2-c291`）。

### 1.1 官方技能文件系统（P7 的写盘目标）

| 项 | 值 | 证据 |
| -- | -- | ---- |
| 用户技能根 | `$DSH_HOME/skills`（`source: 'user-dsh'`、`rank: 400`、`skipSystem: true`） | `packages/skill/skill-filesystem/src/index.ts:39,257` |
| 根顺序与 rank | project `.dsh/skills`(100) → project `.agents/skills`(200) → custom(300) → **user-dsh(400)** → user-agents(500) → bundled | 同文件 `:36-40,250-262` |
| 发现形状 | 根下每个**目录**取 `<dir>/SKILL.md`；根下**顶层 `*.md`** 也算一个技能 | `:723-739`（`discoverRoot`） |
| 解析字段 | `name`（必填）/ `description`（必填）/ `whenToUse`（可选）；解析失败者被**跳过** | `:734-741`；`packages/skill/skill/src/index.ts:751-775`（字段类型校验，非 string 即抛） |
| 变更感知 | `watch` 默认 **true**（stability threshold + poll interval + followSymlinks 可配） | `:79-87,142-143` |
| 结论 | 规格 §6.5 的假设**成立**：写 `$DSH_HOME/skills/<name>/SKILL.md` + 三字段 frontmatter 即被官方自动发现并 watch | — |

### 1.2 P3 已建好的导出半区（P7 **不需要**从零写宿主）

`src/host/skills.ts`（170 行）已实现：`SKILL_NAME_RE` / `toKebab`（含拒绝 `/`、`\\`、`..` 而不做猜测性修正）/ `isValidSkillName`（长度上限 64）/ `skillDir` / `skillFilePath` / `resolveDescription`（**兜底链** `summary → AI description → 正文首个非空行 → 标题`，全空返回 `undefined` = 拒绝）/ `renderSkillFile`（frontmatter **三字段全落盘**）/ `skillExists` / `isSkillStale`（`skillName` 非空且 `updatedAt > skillExportedAt`）/ `exportSkill`（含 `ownerPromptId` 区分「我们的」与「用户手写的」、`conflictConfirmed`）。

两条路由也都在册（P3）：`POST /skills/export`（`409` 专用于「同名目录不属于本插件」→ 前端确认后带 `conflictConfirmed` 重试）与 `POST /ai/skill-descriptor`（返回 `{name, description, whenToUse}`）。

⇒ **P7 的宿主面接近完工**：主要工作在**客户端**（弹窗、徽标、重导）与**两处收口**（I-2 / I-1）。

### 1.3 `Prompt` 载荷已带齐徽标所需字段

`skillName?: string` 与 `skillExportedAt: number` 在 `src/types.ts` 的 `Prompt` 上，`GET /prompts` 直接返回（P6 已验证其数据卫生：软删除→恢复不丢、`trash` 表也有这两列）。

### 1.4 I-2 的实测事实（P7 首项的依据；活体探针 2026-09-25）

| 组 | 能否同屏 | 交叠 | 可达路径（真实输入） |
| -- | -------- | ---- | -------------------- |
| **AI 面板 × `#` 浮层** | **能**（10ms 采样 87 帧中 84 帧同屏） | `39×156 = 6123 px²`（浮层的 11%） | 真实 `Shift+Tab` ×5 回到 composer（**无 pointerdown**，逐次断言 `activeElement`）+ 真实键入「空格 `#`」 |
| **AI 面板 × 词库面板** | **能**（90/90 帧**全程**同屏） | `269×159 = 42692 px²` = **词库面板面积的 79%**，且 AI 锚点 `z=31` 压词库 `z=30` | 真实 `Tab` ×3 到词库按钮 + 真实 `Enter`（通道 `detail=0`） |

**机制（实测）**：指针路径之所以不同屏，是**被激活前已在屏的一方自己**的「点外面关」`pointerdown` 监听把自己收起（C-1 浮层 `t=32ms`、C-2 词库面板 `t=40ms`），**不是新激活方去关它**；两组都**没有对彼此的渲染门**（AI 面板 `AIPolishButton.tsx:166-177` 只在 settled 时挂监听、`:413` 只要 `status !== 'idle'` 就渲染；`#` 浮层只与词库面板共享 `hashVisible`）。⇒ **任何不产生 pointerdown 的激活都能绕过**，这正是 I2-3。

> 口径限制（探针自陈）：AI 面板只覆盖 `status='done'`；键盘只用 `Enter`；未测非鼠标 `pointerType`。⇒ 上面的「能」是**下界**（覆盖的路径都能，未覆盖的不保证）。

---

## 2. 设计决策（控制者自裁，无需拍板）

| # | 决策 | 依据 / 若错的代价 |
| - | ---- | ----------------- |
| D-P7-1 | **浮层互斥做成一个共享 claim**（`ui-state.ts` 的 `none\\|hash\\|library\\|ai` + `claimOverlay(id)` / `releaseOverlay(id)`），**三处渲染门与 `aria-expanded` 统一读它**；hash 浮层保留 P6 已有的「可见性信号」作为 claim 的输入，不推翻 R53/R55 | §1.4 的三对同屏都源于「三处局部规则」；若错的代价：一次中等重构（3 个组件 + ui-state） |
| D-P7-2 | **徽标判定复用宿主已有的纯函数**（`src/host/skills.ts#isSkillStale` 的语义：`skillName` 非空且 `updatedAt > skillExportedAt`）——客户端不重写第二份判定，改为**共享一个纯函数**（提到双方都能 import 的零依赖模块） | 本项目已因「两处真源」炸过一次（淘汰排序键）；若错的代价：徽标与实际过期判定漂移 |
| D-P7-3 | 技能导出弹窗**挂在 `PromptSurfaceHost` 的新面板值 `'skill'`**，不新建 `shell.overlay` 条目 | 0.1 交接；若错的代价：两个 root 浮层互相覆盖 |
| D-P7-4 | 技能名一律经 `toKebab` + `isValidSkillName` **双重闸**（沿用 P3 的路由侧判定，客户端只做**预校验以提前报错**，最终判定仍在宿主） | 规格 §6.5 缺陷 2/3；若错的代价：写盘被官方 loader 静默跳过 |
| D-P7-5 | 宿主侧**不改 schema**（`skillName`/`skillExportedAt` 已在 P3 落库）；若 I-1 选「新列」，那**只**动 `prompts` 表并走 `MIGRATIONS` + 升 `SCHEMA_VERSION`（硬约束 14） | 硬约束 14；若错的代价：迁移不幂等 |

---

## 3. 待用户拍板表（**拍板前不得开工**）

| # | 问题 | 可选值 | 我的建议 | 若错的代价 |
| - | ---- | ------ | -------- | ---------- |
| **TBD-P7-1** | **浮层互斥的收口形态**（I-2 已实测：两对可同屏，其中一对 90/90 帧、覆盖词库面板 79%） | (a) `ui-state` 加 `none\\|hash\\|library\\|ai` 的共享 claim + 三处渲染门统一读；(b) 只给 AI 面板加一个「有别的浮层在场则不渲染」的局部闸门（最小改动）；(c) 不做，把同屏写进 §13.10 已知限制 | **(a)**。三对同屏的**同一根因**是「三处局部规则各自为政」；(b) 等价于再打一个补丁——P6 已经证明这类补丁会被下一条路径绕过（O-1(c) 的教训） | 选 (a)：一次中等重构（3 组件 + ui-state + 单测），可逆。选 (b)：第四对（未来新增面板）必然再漏一次。选 (c)：键盘/AT 用户会遇到 79% 覆盖的面板叠置 |
| **TBD-P7-2** | **I-1 方向持久化的落点**（`rollback` 是 `swap`，宿主不记录方向；不持久化则「切一次→关面板→重开」永远张冠李戴） | (a) 每提示词一个 `meta` 键（如 `pl:refined-dir:<id>`），客户端在每次切换后写；(b) `prompts` 表加一列 + `SCHEMA_VERSION` 3 + 迁移；(c) 不持久化，详情页只保留中性标签（现状） | **(a)**。理由：**不动导入导出格式**（§4.3 要求与上游同构，加列就得决定导出要不要带它）；`meta` 路由 P4 已用过（模板变量记忆），零 schema 风险。代价是每次切换多一次本地 PUT | 选 (a)：meta 里多出与提示词同生命周期的键（删除提示词时需顺手清，或接受少量残键）。选 (b)：动宿主 + 迁移 + 要决定导出格式，成本高一个量级 |
| **TBD-P7-3** | **技能导出的入口与批量语义**（规格 §7.6 写「管理面板工具栏的『导出为技能』按钮 → `SkillExportModal`：勾选提示词（支持全选/按标签筛选）」） | (a) 严格按规格：工具栏按钮 → 多选批量导出 + 逐条 AI 补全；(b) 详情页单条导出（更简单，但偏离 §7.6）；(c) 两者都要 | **(a)**。规格是唯一权威且已定稿；单条导出可作为详情页的一个顺手入口后置到 P8 | 选 (b)：偏离规格需回头改 §7.6。选 (c)：本里程碑范围翻倍 |
| **TBD-P7-4** | **过期徽标的重新导出语义** | (a) 手动「一键重新导出」（复用同 `skillName` 覆盖同目录，不新增目录）——规格 §6.5/§7.6 的写法；(b) 自动重导（提示词一变就重写技能） | **(a)**。规格 §6.5 明确「不做活同步引擎」，把过期做成**可见状态 + 一键动作** | 选 (b)：与 §2.2 的排除项冲突（活同步），且会在用户没准备时覆盖技能文件 |
| **TBD-P7-5** | **P6 长尾 deferred 是否并入 P7 的小修批量** | (a) 并入**影响用户可见行为/判定强度**的两条：i18n 死键检查的**管线回归网**（现在摘掉 `stripComments` 调用 8 条用例仍全绿）+ `TagManagePanel` 的 400 分支取宿主权威 `inUse`（现会渲染「正在被 0 条使用」）；(b) 全部 20 余条一次清；(c) 都不并 | **(a)**。两条都属于「判定强度/文案正确性」，改动各几行且与 P7 的测试面相邻 | 选 (a)：多两个小步。选 (b)：把长尾全塞进来会拖慢 P7 且混入无关风险。选 (c)：这两条会一路带到 P8 |

**待填：用户裁定区**（用户回复后由控制者填入并锁定）

| TBD | 裁定 |
| --- | ---- |
| P7-1 | **(a)** `ui-state` 加 `none|x|hash|library|ai` 的共享 claim（`claimOverlay`/`releaseOverlay`/`useOverlayClaim`），三处渲染门与 `aria-expanded` 统一读它 |
| P7-2 | **(a)** 每提示词一个 `meta` 键（`pl:refined-dir:<id>`），客户端在每次切换后写入 |
| P7-3 | **(a)** 严格按规格 §7.6：管理面板工具栏按钮 → 多选批量导出弹窗 |
| P7-4 | **(a)** 手动「一键重新导出」（复用同 `skillName` 覆盖同目录，不新增目录） |
| P7-5 | **(a)** 并入两条：i18n 死键检查的**管线回归网** + `TagManagePanel` 的 400 分支取宿主权威 `inUse` |

**用户原话：** 「全按建议执行（推荐）」（2026-09-24）。

---

## 4. 文件结构（P7 触及的清单）

**新增（src）**

| 文件 | 估行 | 职责 |
| ---- | ---- | ---- |
| `src/overlay-claim.ts` | ~40 | 共享浮层 claim 的**纯判定**（`OverlayKind = 'none\\|hash\\|library\\|ai'`、`canRender(kind, claimed)`）；零依赖、可 `node --test` 直测 |
| `src/skill-badge.ts` | ~30 | 过期判定与徽标语义的**单一纯函数**（宿主 `isSkillStale` 改为从它 import，客户端同源消费）——D-P7-2 |
| `src/client/components/SkillExportModal.tsx` | ~280 | 勾选（全选/按标签筛选）+ AI 补名/描述/whenToUse + 预校验 + 导出 + 结果汇总（成功/失败清单 + 目标目录）+ 同名冲突确认 |
| `src/client/components/SkillBadge.tsx` | ~80 | 列表行与详情页共用的徽标（已导出 / **技能已过期** + 一键重导） |
| `src/client/utils/refined-direction.ts` | ~50 | I-1 的方向读写（经既有 `/meta/:key` 路由）+ 纯判定（`bodyIsOriginal(direction)`） |

**改动**

| 文件 | 改动 |
| ---- | ---- |
| `src/client/utils/ui-state.ts` | 加 `claimOverlay/releaseOverlay/useOverlayClaim`（D-P7-1） |
| `src/client/components/PromptSurfaceHost.tsx` | 新面板值 `'skill'` + 统一 claim 接线 |
| `src/client/components/PromptManagerModal.tsx` | 工具栏「导出为技能」按钮；列表行与详情页挂 `SkillBadge`；详情页方向改用 `refined-direction` |
| `src/client/components/PromptLibraryButton.tsx` | 渲染门改读 claim（替换 P6 的 `shouldShowLibraryPanel({open, hashSuggestVisible})` 形态） |
| `src/client/components/HashSuggestOverlay.tsx` | 发布 `'hash'` claim（保留 P6 的可见性信号作为输入） |
| `src/client/components/AIPolishButton.tsx` | 渲染门改读 claim（**修 I2-1 / I2-2**） |
| `src/client/components/PromptManagerModal.tsx`（详情页） | 「原文／优化稿」两栏改为**按持久化方向**标注（I-1 根治） |
| `src/host/skills.ts` | `isSkillStale` 改为从 `src/skill-badge.ts` import（单一真源） |
| `tests/` | 新增 `tests/skill-badge.test.mjs` / `tests/overlay-claim.test.mjs` / `tests/refined-direction.test.mjs`；扩展 `tests/skills.test.mjs`（若宿主侧有缺口） |
| `package.json` | 若需引用宿主 types：`dsh.client.inject` 只**追加**（R8 纪律） |
| `lib/index.js` + `lib/client.js` | 与源码同批 |

---

## 5. 任务分解

> **分发纪律**：一个实现者一个任务、绝不并行；分发前记 `BASE`，评审用 `BASE..HEAD`；子代理无法向人提问 → 简报必写「遇歧义按最强证据自定 + 报告里显式列假设；会改变验收结果就直接 `NEEDS_CONTEXT`」。
> **每任务结束四项全绿**（`typecheck` / `test` / `build` / `smoke`）；客户端改动与 `lib/` 同批提交；新增负样本**先变异验证**（改坏 → 必红 → 复原）。

### 任务 1：浮层 claim 收口（TBD-P7-1 的落地；修 I2-1/I2-2/I2-3）

**文件：** 新增 `src/overlay-claim.ts`；新建 `tests/overlay-claim.test.mjs`；改写 `ui-state.ts` / `PromptSurfaceHost.tsx` / `PromptLibraryButton.tsx` / `HashSuggestOverlay.tsx` / `AIPolishButton.tsx`；`lib/client.js`

- [ ] 步骤 1：纯模块 `overlay-claim.ts`——四种 kind 与 `canRender(kind, claimed)`（**同一时刻最多一个 claim**；`claimed === kind` 时可渲染）
- [ ] 步骤 2：`ui-state` 加 `claimOverlay(kind)` / `releaseOverlay(kind)` / `useOverlayClaim()`（与本仓库既有 store 同形、幂等、不 import 宿主服务）
- [ ] 步骤 3：三处渲染门统一改读——词库面板（替换 `shouldShowLibraryPanel`）、`#` 浮层、AI 面板；`aria-expanded` 与渲染门**共用同一个派生值**（R55 的纪律）
- [ ] 步骤 4：**卸载/隐藏时释放 claim**（P6 的教训：留成 true 会把别的面压住）
- [ ] 步骤 5：测试——`overlay-claim.test.mjs` 覆盖四种 kind 的互斥与释放；组件接线**无自动化通道**（无 react-dom）→ 如实说明，落 T5 活体
- [ ] 步骤 6：变异验证：把 `canRender` 的互斥去掉 → 用例必红
- [ ] 步骤 7：全绿 + 提交 `fix(client): claim the overlay exclusively so no two surfaces coexist`

**验收映射：** I2-1 / I2-2 / I2-3（三对**全部**不得同屏）+ 回归 C14 的「互不覆盖」

### 任务 2：技能导出弹窗（TBD-P7-3 的落地；验收 15）

**文件：** 新增 `SkillExportModal.tsx`；改写 `PromptSurfaceHost.tsx` / `PromptManagerModal.tsx`（工具栏按钮）/ `i18n.ts`；`lib/client.js`

- [ ] 步骤 1：面板值 `'skill'` + 从管理面板工具栏打开（规格 §7.6）
- [ ] 步骤 2：勾选列表（全选 / 按标签筛选）+ 逐条「AI 补全名称与描述」（`POST /ai/skill-descriptor`；**失败条目行内红色标注**，不阻断其它条目）
- [ ] 步骤 3：预校验（`toKebab` + `isValidSkillName` **提前报错**；最终判定仍以宿主为准）+ description 非空（宿主兜底链全空则拒绝导出并给可读错误——验收 17）
- [ ] 步骤 4：逐条 `POST /skills/export`；`409`（同名目录不属于本插件）→ 弹确认 → 带 `conflictConfirmed` 重试
- [ ] 步骤 5：结果汇总（成功/失败清单 + **目标目录** `$DSH_HOME/skills/<name>/SKILL.md`）
- [ ] 步骤 6：全绿 + 提交 `feat(client): export prompts as official DSH skills`

**验收映射：** 验收 15（`SKILL.md` 存在且 frontmatter 含 name + description（+ whenToUse））、验收 17（无摘要也能导出；兜底全空则拒绝并给明确错误）

### 任务 3：过期徽标与一键重导（验收 16）

**文件：** 新增 `src/skill-badge.ts` + `SkillBadge.tsx`；改写 `src/host/skills.ts`（改为 import 单一真源）/ `PromptManagerModal.tsx`（列表行 + 详情页）/ `i18n.ts` / `tests/skill-badge.test.mjs`；`lib/index.js` + `lib/client.js`

- [ ] 步骤 1：把过期判定提成 `src/skill-badge.ts`（D-P7-2），宿主 `isSkillStale` 改为 import 它
- [ ] 步骤 2：徽标三态（`skillName` 空 → 不显示；未过期 → 「已导出技能 <name>」；过期 → 「**技能已过期**」+ 重新导出按钮），列表行与详情页共用同一组件
- [ ] 步骤 3：一键重导 = 复用同 `skillName` 覆盖同目录（**不新增目录**）
- [ ] 步骤 4：测试 `skill-badge.test.mjs`（三态 + 边界 `updatedAt === skillExportedAt` 不算过期）
- [ ] 步骤 5：变异验证：把 @>@ 改成 @>` → 边界用例必红
- [ ] 步骤 6：全绿 + 提交 `feat: show skill staleness and re-export in place`

**验收映射：** 验收 16（改提示词 → 徽标出现 → 重导 → 徽标消失且**未新增目录**）

### 任务 4：详情页方向持久化（TBD-P7-2 的落地；I-1 根治）

**文件：** 新增 `src/client/utils/refined-direction.ts` + `tests/refined-direction.test.mjs`；改写 `PromptManagerModal.tsx`（两栏标注）/ `i18n.ts`（去掉 P6 的中性表述或改为按方向标注）；`lib/client.js`

- [ ] 步骤 1：方向读写（经既有 `api.getMeta/setMeta`）+ 纯判定 `bodyIsOriginal(direction)`；**每次切换后写入**新方向（`rollbackPrompt` 成功返回后）
- [ ] 步骤 2：详情页两栏按**持久化方向**标注（不再靠猜）；方向缺失（P6 之前导出的记录）时退回中性表述
- [ ] 步骤 3：删除提示词时顺手清该 meta 键（或如实记录残键并接受——按 TBD-P7-2 的裁定）
- [ ] 步骤 4：测试 `refined-direction.test.mjs`（方向缺失 → 中性；两个方向各自渲染正确）
- [ ] 步骤 5：变异验证：让方向恒为 @original@ → 用例必红
- [ ] 步骤 6：全绿 + 提交 `feat(client): persist the refined/original direction per prompt`

**验收映射：** 规格 §4.4 的 UI 要求（并排对比与切换）在**跨面板重开**后仍如实；回归 P6 的 C8

### 任务 5：活 GUI 验收（M7）+ 记录文件

> 通道同 P6：`npm run build` → `dev_reload_package dsh-prompt-enhancer`（不碰 profile、不重启 `dsh web`）→ Playwright 对 `http://127.0.0.1:3080` 逐项验收。**不得发送任何聊天消息**；临时技能/提示词用后复原（**注意：技能写在 `$DSH_HOME/skills/`，收尾必须真删掉临时技能目录**，那是本任务唯一会写宿主目录的地方）。

| 验收项 | 判定方式（每条给数值或原文） |
| ------ | ---------------------------- |
| 验收 15 | 导出某条提示词为技能 → `$DSH_HOME/skills/<name>/SKILL.md` 存在；frontmatter 含 `name` + `description`（+ `whenToUse`，若 AI 成功）；**官方是否真的发现它**（读官方技能清单，给出技能名原文——这是「写盘正确」的终局证据） |
| 验收 16 | 改提示词并保存 → 列表行出现「技能已过期」→ 点重导 → 徽标消失，且 **`ls $DSH_HOME/skills` 目录数不变**（同名覆盖） |
| 验收 17 | 一条**无摘要**提示词也能导出（description 走兜底链）；构造「兜底全空」时导出被**拒绝**并给明确错误 |
| I2-1 / I2-2 | 复刻 P6 复现路径（真实 `Shift+Tab` 回 composer + 真实按键；AI 面板用页面内 `fetch` 包装造）→ **三对全部不得同屏**（0 帧），并给几何证据 |
| I-1 | 切一次 → 关面板 → 重开编辑 → **两栏标注与实际一致**（给切换前后的 HTTP `body`/`sourceBody` 与两栏原文） |
| 回归 | P6 的 C1（关闭态零遮挡）/ C3（沉淀一步到位）/ C4②（重选同文本浮层再现）/ C9（删除失败列表仍在）/ R57（键盘路径不延后兑现）/ R60（**指针点击 0/5/10ms 三档必须开面板**） |
| 零 console error + 环境复原 | `browser_console_messages(level=error)` → 0；`prompts/trash/tags/settings/meta` 逐项等于验收前，**且 `$DSH_HOME/skills/` 恢复原状**；不可逆变化 = 0 |

记录写进 `docs/superpowers/plans/2026-09-24-p7-m7-acceptance.md`（格式照 P6）。

---

## 6. 完成标准

1. 三对浮层**全部**不同屏（含 P6 已修的那一对不回归）；键盘/AT 路径也成立（I2-1/I2-2/I2-3 收口）
2. 技能导出可用：验收 15（写盘 + 官方发现）、16（过期徽标 + 一键重导且不新增目录）、17（兜底链与拒绝语义）
3. 详情页「原文／优化稿」的方向**跨重开保持一致**（I-1 根治）
4. `typecheck` / `test` / `build` / `smoke` 四项全绿；`lib/` 与源码同批；重跑 build 后 `git status` 为空
5. 零 DOM 注入 / 零键盘监听 / 零新增依赖 / systemPrompt section 数恒 **0**；座位账本仍 **5 条**（**P7 不新增座位**——技能弹窗复用 `shell.overlay` 的既有条目）
6. 规格按 TBD 的裁定就地订正（§7.6/§13.10 的相应条目）

## 7. 风险

| # | 风险 | 应对 |
| -- | ---- | ---- |
| R-P7-1 | **claim 重构动了 P6 已验证的三处渲染门**（词库面板/`#` 浮层/AI 面板） | 每处都保留 P6 的既有断言与活体判据；任务 5 逐条回归 R57/R60/C1/C14 |
| R-P7-2 | 技能写盘在 `$DSH_HOME/skills/`（**仓库外**）→ 验收会留下真实技能目录 | 验收**必须**用唯一临时名并在收尾 `rm -rf` 该目录 + 复查 `ls`；本会话沙箱对 `$DSH_HOME` 可能不可写 → 若不可写，记录 `NOT RUN` 并改用「宿主 API 层证据 + 目录只读核对」 |
| R-P7-3 | `SkillExportModal` 的 AI 逐条补全在条目多时很慢（每条一次真实调用） | 逐条**独立失败可见**、进度可读、可跳过；不阻断已成功的条目 |
| R-P7-4 | 同名冲突（用户手写技能）被误覆盖 | 宿主已实现 `409 + conflictConfirmed`；客户端**必须**先弹确认再重试；测试覆盖（既有 `tests/skills.test.mjs`） |
| R-P7-5 | I-1 的 meta 键在删除提示词后残留 | 按 TBD-P7-2 的裁定处理；至少**记录**残留策略（删除时清 / 接受残键） |
| R-P7-6 | 官方 loader 对 frontmatter 严格（name kebab、description 必填）→ 技能被**静默跳过** | 导出前本地预校验（D-P7-4）+ 验收 15 **读官方技能清单**确认它真的被发现了（不只验文件存在） |

## 8. 交接给 P8

1. **设置页即时生效**与两个 `*IconOnly` 语义统一（P4/P5/P6/P7 都是「mount 时读一次」）。
2. 上下文推荐（验收 11）+ i18n 键集收口 + README（验收 12/14/19）。
3. 建议把**详情页单条导出为技能**作为顺手入口（TBD-P7-3 选 (a) 时本里程碑不做）。
4. P6 长尾 deferred 里未并入 P7 的其余条目（见 P6 计划执行记录的「交接」类别）。

## 9. 附录：SDD 执行准备（控制者，不分发给实现者）

```bash
PLAN=docs/superpowers/plans/2026-09-24-p7-skill-export.md
SKILL="$DSH_HOME/profiles/web/node_modules/@wenaixi/dsh-superpower/skills/superpower-subagent-driven-development/scripts"
WS=$(bash "$SKILL/sdd-workspace" "$PLAN")
N=1
awk -v n="$N" '/^```/{f=!f} !f && /^### 任务 [0-9]+/ {intask = ($0 ~ ("^### 任务 " n "([：:]|$)"))} intask{print}' "$PLAN" > "$WS/task-$N-brief.md"
BASE=$(git rev-parse HEAD)
HEAD=$(git rev-parse HEAD)
bash "$SKILL/review-package" "$PLAN" "$BASE" "$HEAD" "$WS/review-$BASE..$HEAD.diff"
```

> 脚本**无可执行位** → 一律 `bash <script>`；`review-package` 内部会调 `sdd-workspace`（失败）→ **必须**显式给第 4 参 OUTFILE；工作区自忽略但**不进 git** → 收尾前把有保留价值的内容落进本文件「P7 执行记录」或验收记录，再删工作区。
