# 04 · 功能裁剪施工图：dsh-prompt-library v0.16.0 -> dsh-prompt-enhancer

> **事实基线（全部经 grep / read 实测，非推测）**
> - 源码根：`D:\Project\source\__TEST__\dsh-plugins\_ref-dsh-prompt-library`；包名 `@sunjuntao/dsh-prompt-library`，版本 `0.16.0`，License MIT（`package.json:2-3,97`）。
> - 两个构建入口（`scripts/build.mjs:53,96`）：**host** = `src/index.ts` -> `lib/index.js`（Node ESM）；**client** = `src/client/utils/index.ts` -> `lib/client.js`（`__ModuleLoader__.load({ id: 完整包名 })`，`scripts/build.mjs:74-93`）。
> - `src/` 共 65 个文件；host 19 个、client 45 个、共享根 1 个（`src/md-text.ts`）。
> - 全部行号以「`(Get-Content).Count` 实测总行数」为准；报告中的区间均为**含端点**的闭区间。

---

## 0. 结论速览

| 项 | 定位结果 | 是否需要裁 | 主要删除体量 |
|---|---|---|---|
| **A. 人格 / SOUL / character** | 完整存在，横跨 host(4 文件)+client(1 大文件)+types+routes+store+i18n+index.ts | **是** | ~2,900 行 |
| **B. 技能系统** | 需拆成 **B1 会话级技能注入**、**B2 DSH 技能导入导出**、**B3 harness 技能开关** 三个独立子系统 | **是**（三者都删） | ~5,700 行 |
| **C. 插件推荐 / 市场 / 公告 / 成就 / 桌面宠物 / QQ** | **全部不在本 repo**。grep 零命中，或仅剩注释 / i18n 键名 / 死代码 | 否（额外发现 2 处死代码可顺手删） | 0（可选 ~110 行死代码） |
| **D. scope 绑定机制** | 存在两套：人格路径/会话绑定、技能路径/会话绑定。**提示词本身一个都不需要**；但 `/fs/list`、`/fs/mkdir`、`workspace-picker.ts` 被**提示词导出目录选择**复用，**必须保留** | 部分 | `session-scope.ts` 194 行 |

**一句话**：`dsh-prompt-enhancer` 可以砍掉约 **8,450 行源码**（约占 `src/` 的 54%），且所有提示词核心功能（词库 CRUD / 标签 / 回收站 / 导入导出 / AI 优化 / 复用插入 / 变量模板 / 上下文推荐）**零依赖**于 A、B、C 任一模块。

---

## 1. 功能逐项定位

### A. 人格系统（persona / SOUL / character）

#### A-1 文件清单与代码量

| 文件 | 总行 | 角色 | 处置 |
|---|---|---|---|
| `src/host/character.ts` | **128** | SOUL 正文读写 + 热路径缓存 | **整文件删除** |
| `src/host/persona-service.ts` | **266** | 人格 CRUD + 路径/会话绑定解析 + 工作区树 | **整文件删除** |
| `src/client/components/persona-skill/PersonaManagerModal.tsx` | **1361** | 人格管理弹窗（含绑定树、AI 生成、诊断卡） | **整文件删除** |
| `src/host/store.ts`（人格相关段） | 约 **310** | 表 `personas` / `persona_scope_bindings` + 14 个导出函数 + 迁移块 | 段删除 |
| `src/host/routes.ts`（`/personas/*` 段） | 约 **95** | 10 条路由 | 段删除 |
| `src/host/ai.ts`（soul 注入） | 约 **40** | `withSoulSystem` + 6 处调用 + `generateDraft` 的 soul 分支 | 段删除 |
| `src/types.ts`（人格类型） | **27** | `PersonaMeta` / `PersonaView` / `PersonaBinding` | 段删除 |
| `src/client/utils/api.ts`（人格 API） | 约 **48** | `PERSONAS_BASE` + 9 个函数 | 段删除 |
| `src/index.ts`（persona section） | 约 **30** | order 0 的 `deployment:persona` section | 段删除 |
| i18n `pl.personas.*` / `pl.ctx.personas` | **92 key** | zh 123-166、en 606-649、ctx 86 / 569 | 段删除 |

#### A-2 导出符号 -> 被谁 import（引用点全表）

**`src/host/character.ts`**（`DEFAULT_PERSONA_ID:45`、`ensureSoulFile:58`、`ensurePersonaSoul:66`、`readSoulDoc:74`、`readPersonaSoul:79`、`writePersonaSoul:86`、`removePersonaSoul:93`、`buildSoulBoundary:100`、`invalidateSoulCache:108`、`soulSystemSync:120`）

| 引用者 | 行 | 引入符号 |
|---|---|---|
| `src/index.ts` | 22 | `soulSystemSync`, `ensureSoulFile` |
| `src/host/ai.ts` | 19 | `buildSoulBoundary`, `readSoulDoc` |
| `src/host/persona-service.ts` | 28-35 | `DEFAULT_PERSONA_ID`, `ensurePersonaSoul`, `invalidateSoulCache`, `readPersonaSoul`, `removePersonaSoul`, `writePersonaSoul` |

**`src/host/persona-service.ts`**（`normalizePersonaId:72`、`listPersonaViews:80`、`createPersonaWithSoul:102`、`updatePersonaWithContent:111`、`deletePersonaWithSoul:129`、`bindPersonaToScope:148`、`getPersonaForScopePath:160`、`resolvePersonaForPath:170`、`getPersonaForSession:194`、`resolvePersonaForSession:205`、`listScopeTree:225`、内部 `ScopeNode:51`）

| 引用者 | 行 | 引入符号 |
|---|---|---|
| `src/index.ts` | 23 | `resolvePersonaForSession` |
| `src/host/routes.ts` | 73-84 | `bindPersonaToScope`, `createPersonaWithSoul`, `deletePersonaWithSoul`, `getPersonaForScopePath`, `getPersonaForSession`, `listPersonaViews`, `listScopeTree`, `resolvePersonaForPath`, `resolvePersonaForSession`, `updatePersonaWithContent` |
| `src/host/session-scope.ts` | 15 | `listScopeTree as listPathScopeTree`, `getPersonaForSession` |

**`src/types.ts` 人格类型**：`PersonaMeta:103-114`、`PersonaView:117-122`、`PersonaBinding:125-128`。
被引：`src/client/utils/api.ts:8-9`；`src/client/components/persona-skill/PersonaManagerModal.tsx:16`。

**`PersonaManagerModal`**：导出点 `PersonaManagerModal.tsx:92`；唯一引用者 `src/client/components/data/PromptAssistant.tsx:14,79`（`case kind="persona"`）。

**`src/host/ai.ts` 人格约束链**：
- `import { buildSoulBoundary, readSoulDoc } from "./character.js"` -> **ai.ts:19**
- `withSoulSystem(system, soul?)` 定义 -> **ai.ts:421-435**；正文拼接 `"# SOUL · 人格"` 在 **ai.ts:431**
- 调用点（共 6 处）：**408**（`systemPrompt` 词库整理）、**660**、**715**、**775**、**829**（`generateIntro`）、**1019**（`generateSkillDescriptor`）
- `generateDraft(kind: "soul" | "skill", ...)` -> **1055-1129**；`kind === "soul"` 提示词分支 **1071-1079**（en）/ **1088-1096**（zh）。注意 **1109-1111** 已显式声明「不注入当前人格」。

**`src/index.ts` 人格段**：
- imports **22-23**；`ensureSoulFile().catch(...)` **145**
- `PERSONA_SECTION_NAME = "deployment:persona"` **157**（shadow 宿主全局槽位，见 149-156 注释）
- `personaSectionText` **170-174**（`order: 0`）
- section 注册 **205-209**；`disposePersona()` **216**

**`src/host/store.ts` 人格段**：

| 符号 | 行 |
|---|---|
| `getDefaultPersonaSoul` | 1584-1588 |
| `setDefaultPersonaSoul` | 1589-1595 |
| `PersonaRecord` (interface) | 1663-1692 |
| `listPersonas` | 1693 |
| `getPersona` | 1705 |
| `createPersona` | 1719 |
| `updatePersonaMeta` | 1729 |
| `deletePersona` | 1749 |
| `setScopePersonaBinding` | 1765 |
| `getScopeBoundPersonaId` | 1775 |
| `listScopeBindings` | 1787 |
| `clearScopePersonaBinding` | 1798 |
| `clearAllScopePersonaBindings` | 1807 |
| `clearAllSessionPersonaBindings` | 1885 |
| 建表 `personas` | 127-142 |
| 建表 `persona_scope_bindings` | 146-152 |
| 建表 `session_scope_bindings`（`personaId` 列） | 185-192 |
| 迁移块 `migrateMdContentToDb`（第 1 段：SOUL.md -> meta 键） | 569-578 |

**`src/host/routes.ts` 人格路由**（全部在 `handler` 内、行号即 dispatch 行）：

| 方法 + 路径 | 行 |
|---|---|
| `GET /personas` | 873 |
| `GET /personas/scopes` | 879 |
| `GET /personas/scopes/sessions` | 884 |
| `GET /personas/scopes/binding?path=` | 889 |
| `PUT /personas/scopes/binding` | 896 |
| `DELETE /personas/scopes/bindings/all` | 912 |
| `POST /personas` | 918 |
| `PUT /personas/:id` | 934-955 |
| `DELETE /personas/:id` | 956-963 |
| `PUT /session-prompts/session/persona` | 1124-1139 |
| 诊断卡中的人格字段 | 1053-1060、1092-1094 |

#### A-3 删除后的连带影响

1. `ai.ts` 的 **6 处** `withSoulSystem(...)` 调用必须同步改为直接返回 `system`（否则 TS 报「找不到名称 withSoulSystem」）。
2. `routes.ts` 的 **诊断路由 `/session-prompts/diag`** 是人/技能双耦合：删人格后需保留 `promptIds/promptTitles/checkedPaths` 字段、删除 `personaId/personaName/personaSource` 字段——**但该路由本身随 B1 一起删**，所以实际只需整段删 1043-1101。
3. `src/index.ts` 的 **order 0 section 一旦删除，宿主内置的 `deployment:persona` 全局槽位自动重新生效**（原本被本插件 shadow）。这是**行为变化**，需在发布说明中写明：精简版不再压制宿主默认人格。
4. `en: Record<keyof typeof zh, string>`（`i18n.ts:501`）是**类型强制**的：只删 zh 不删 en 会直接编译失败。这是删除 i18n 的安全网。
5. `doc/harness.default.md:29` 文案提到「人格（SOUL）与会话级技能按工作区/项目绑定自动注入」，删功能后该文案需改写（否则会向模型灌错误自述）。

---

### B. 技能系统

**关键发现：本 repo 的「技能」是三套互不相同的子系统，必须分开处理。**

| 子系统 | 本质 | 存储 | 是否注入 systemPrompt |
|---|---|---|---|
| **B1 会话级技能（SessionPrompt）** | 用户自建、绑定到工作区/项目/会话的注入段 | SQLite `session_prompts` | **是**（index.ts order 800） |
| **B2 DSH 技能导入导出** | 从 `~/.dsh/skills/<n>/SKILL.md` 逆向导入为提示词 / 把提示词导出为 SKILL.md | 文件系统 + `prompt_skill_links` 表 | 否 |
| **B3 harness 技能开关** | 屏蔽 `~/.dsh/skills`、`<项目>/.dsh/skills` 技能的「软控制」 | meta 键 `pl:harness-skill-toggles` | **是**（index.ts 186-187） |

#### B1 会话级技能与注入

| 文件 | 总行 | 处置 |
|---|---|---|
| `src/host/session-prompts.ts` | **446** | **整文件删除** |
| `src/host/session-scope.ts` | **194** | **整文件删除** |
| `src/client/components/persona-skill/PromptInjectPanel.tsx` | **1555** | **整文件删除** |
| `src/types.ts`：`SessionPrompt:40-57`、`SessionNode:131-142`、`ScopeNode:148-163`、`UNMATCHED_SCOPE_PATH:145` | **63** | 段删除 |
| `src/index.ts`：imports 12-19、`buildSessionPromptInjection:43-77`、section 正文 180-191 中的 `injected` 分支 184-185、`seedDefaultSessionPromptsIfEmpty()` **147**、section 注册 210-214 | 约 **80** | 段删除 |

**`session-prompts.ts` 导出符号与被引**：

| 导出 | 行 | 引用者 |
|---|---|---|
| `listSessionPrompts` | 83 | routes.ts:65 |
| `getSessionPromptsByIds` | 88 | index.ts:15、routes.ts:63,1072 |
| `createSessionPrompt` | 99 | routes.ts:58 |
| `updateSessionPrompt` | 121 | routes.ts:71 |
| `deleteSessionPrompt` | 148 | routes.ts:59 |
| `setScopePromptBinding` | 180 | routes.ts:67 |
| `getScopeBoundPromptIds` | 185 | routes.ts:61 |
| `listScopePromptBindings` | 190 | routes.ts:64 |
| `clearScopePromptBinding` | 195 | routes.ts:56 |
| `resolveBoundPromptIdsForPath` | 204 | 仅内部 |
| `setSessionActivePrompts` | 227 | routes.ts:68 |
| `getSessionActivePromptIds` | 234 | index.ts:14、routes.ts:62,1062 |
| `clearSessionActivePrompts` | 239 | **零外部引用（死导出）** |
| `setCurrentSessionScope` | 249 | index.ts:17 |
| `getCurrentSessionScope` | 254 | index.ts:13、routes.ts:60,249,1040,1048 |
| `setSessionPromptBindingForSession` | 261 | routes.ts:70 |
| `setSessionPersonaBindingForSession` | 266 | routes.ts:69（人格耦合点） |
| `getSessionBoundPromptIds` | 273 | 仅内部 |
| `getSessionBoundPersonaId` | 278 | **persona-service.ts:37**（反向耦合！） |
| `listSessionBindings` | 283 | **session-scope.ts:16** |
| `clearSessionBinding` | 319 | routes.ts:57 |
| `clearAllSkillBindings` | 324 | routes.ts:55 |
| `clearAllPersonaBindings` | 330 | routes.ts:85 |
| `resolveSessionPromptBindingIds` | 339 | index.ts:16、routes.ts:66,1063 |
| `seedDefaultSessionPromptsIfEmpty` | 431 | index.ts:17 |

**`session-scope.ts` 导出**：`SessionQueryRecord:19-23`、`registerSessionListProvider:29`、`recordActiveSessionCwd:39`、`getActiveSessionCwd:44`、`listSessionRecords:49`、`listSessionScopeTree:63`。
被引：`src/index.ts:25-29`（`registerSessionListProvider` / `recordActiveSessionCwd` / `SessionQueryRecord`）；`src/host/routes.ts:86`（`getActiveSessionCwd`, `listSessionRecords`, `listSessionScopeTree`）；`session-scope.ts:15-16` 反向 import `persona-service` + `session-prompts`。

> 注意：**`session-scope.ts` 不是「提示词核心」**。它只服务于 B1/B3 的绑定树与诊断卡。它内部持有的 `recordActiveSessionCwd` 被 `index.ts` 用于只读展示——删掉后 `index.ts` 的会话记录块（82-97、99-138、160-168）可整体去掉。

**路由表（B1 全部，均为 dispatch 行）**：

| 方法 + 路径 | 行 |
|---|---|
| `GET /session-prompts` | 965 |
| `POST /session-prompts` | 970 |
| `PUT /session-prompts/:id` | 978 |
| `DELETE /session-prompts/:id` | 992 |
| `GET /session-prompts/bindings` | 999 |
| `GET /session-prompts/bindings/path?path=` | 1004 |
| `PUT /session-prompts/bindings` | 1011 |
| `DELETE /session-prompts/bindings/all` | 1024 |
| `DELETE /session-prompts/bindings?path=` | 1030 |
| `GET /session-prompts/current-scope` | 1039 |
| `GET /session-prompts/diag?sessid=` | 1046-1101 |
| `GET /session-prompts/active?scope=` | 1104 |
| `PUT /session-prompts/active` | 1111 |
| `PUT /session-prompts/session/persona` | 1124 |
| `PUT /session-prompts/session/prompts` | 1140 |
| `DELETE /session-prompts/session` | 1153 |

#### B2 DSH 技能导入导出（skills.ts 前半）

| 文件 | 行区间 | 导出 | 处置 |
|---|---|---|---|
| `src/host/skills.ts` | **1-366** | `skillsRoot:30`、`SkillImportResult:60-71`、`SkillEntry:122-130`、`SkillSource:133-140`、`listAvailableSkills:143`、`listSkillsFromDir:178`、`parseSkillRaw:217`、`importSkillEntries:237`、`importSkillsFromDisk:296`、`SkillExportResult:309-318`、`exportPromptsAsSkills:328` | 段删除 |
| `src/client/components/import-export/SkillImportModal.tsx` | **2333** | `SkillImportModal:286` | **整文件删除** |
| `src/client/components/import-export/ImportExportModal.tsx` | 内嵌引用点 | import 43；state 187,195-196；守卫 387；按钮 695-697、839-841；渲染 1470-1510 | 段删除（**文件保留**） |

`src/host/skills.ts` 私有辅助（同样要删）：`toKebab:35`、`foldDescription:45`、`buildSkillBody:53`、`toReadableTitle:74`、`parseSkillFile:88-119`、`mdToPlainText` 调用点 163/196/226。

**路由（B2）**：`POST /skills/import`:543、`GET /skills/available`:585、`POST /skills/scan-dir`:591、`POST /skills/parse`:605、`POST /skills/import/entries`:618、`GET /skills/export/project-cwd`:635、`POST /skills/export/entries`:645、`POST /skills/ai-describe`:683。
routes.ts 私有辅助：`isSkillEntry:209-217`（仅 626/653 用）、`resolveCurrentProjectCwd:240-255`（仅 636/669/713 用）。

**client api.ts（B2）**：`SkillImportResult:158`、`importSkills:168`、`SkillEntry:173`、`SkillSource:182`、`listAvailableSkills:222`、`scanSkillDir:227`、`parseSkillRaw:232`、`importSkillEntries:241`、`SkillExportResult:246`、`exportSkillEntries:263`、`getExportProjectCwd:276`、`SkillDescriptor:281`、`SkillDescribeResult:291`、`describeSkill:297`。

#### B3 harness 技能开关

| 文件 | 行区间 | 导出/函数 | 处置 |
|---|---|---|---|
| `src/host/skills.ts` | **367-546** | `HARNESS_SKILL_TOGGLE_KEY:375`、`readSkillToggles:378`、`writeSkillToggles:390`、`ScanSkillDirEntry:405-411`、`scanSkillRootForToggles:412`、`HarnessSkillItem:442-457`、`listHarnessSkillToggles:463`、`setHarnessSkillToggle:488`、`deleteHarnessSkill:500`、`normalizeForInjection:515`、`disabledHarnessSkillsInstruction:526-546` | 段删除 |
| `src/client/components/persona-skill/HarnessSkillPanel.tsx` | **437** | `HarnessSkillPanel:37` | **整文件删除** |

`disabledHarnessSkillsInstruction` 唯一引用者：`src/index.ts:21,186-187`。
`HarnessSkillPanel` 唯一引用者：`src/client/components/persona-skill/PromptInjectPanel.tsx:44,321`（-> 随 PromptInjectPanel 一并消失）。
**路由（B3）**：`GET /skills/harness/list`:712、`POST /skills/harness/toggle`:719、`POST /skills/harness/delete`:734。
**client api.ts（B3）**：`HarnessSkillItem:567`、`listHarnessSkillToggles:585`、`setHarnessSkillToggle:590`、`deleteHarnessSkill:595`。

#### B-共同：删除后的连带影响

1. **`src/host/skills.ts` 可整文件删除**（B2+B3 覆盖 1-546 全部内容）。`src/host/text.ts` 的 `stripBom` 被 `store.ts:31` 引用，**不受影响**。
2. **`src/md-text.ts` 必须保留**：除 `skills.ts:27` 外，`src/client/utils/data-formats.ts:13` 也在用 `mdToPlainText`。
3. **`js-yaml` 依赖可移除**：`skills.ts:13` 是唯一 `import { load } from "js-yaml"` 处（`package.json:102` 写作 `js-yaml: ^5.3.0`，版本号可疑；以 `package-lock.json` 实际解析结果为准）。删 skills.ts 后执行 `npm remove js-yaml`（`devDependencies` 的 `@types/js-yaml` 同步删）。
4. **`prompt_skill_links` 表不再被写**：`store.ts` 的 `getSkillNameForPrompt:669`、`setSkillNameForPrompt:678`、`getPromptIdBySkillName:687` 三个函数唯一引用者是 `skills.ts`。表建议保留（不破坏老库），函数可删。
5. **`PromptInjectPanel` 是 B1+B3 的聚合面板**，删它同时解决 `HarnessSkillPanel` 与 `/personas/scopes/sessions` 的唯一 UI 消费者。
6. **目录选择能力必须保留**：`DirectoryPickerModal` 除被 `SkillImportModal`（2309,2321）使用外，**还被 `ImportExportModal:1529` 用于「提示词导出目录选择」**。因此 `workspace-picker.ts`（75 行）、`/fs/list`:549、`/fs/mkdir`:562、`routes.ts:257-361` 的 fs 浏览块、以及 client api.ts 的 `DirEntry:192` / `DirListing:199` / `listFsDirectory:211` / `createFsDirectory:217` **全部保留**。

---

### C. 插件推荐 / 市场 / 公告 / 成就 / 桌面宠物 / QQ 机器人

> **结论：这六类功能在本 repo 中一个都不存在。无需裁剪。**

**逐项 grep 证据（搜索范围：`src/` 全部 65 个文件）**：

| 关键词 | 命中 | 结论 |
|---|---|---|
| `宠物` | **0** | 无 |
| `pet` | **0** | 无 |
| `market` | **0** | 无（无市场/商店） |
| `市场` | **0** | 无 |
| `announce` | **0** | 无公告系统 |
| `公告` | **3** | 全部是注释/文档字符串：`host/store.ts:216`（迁移注释）、`host/ai.ts:885`（今日日报注释）、`client/utils/theme.ts:18`（主题 token 用途注释）。**无 UI、无路由、无数据表** |
| `成就` | **0** | 无 |
| `achievement` | **9** | **全部是 i18n 键名 `pl.achievements.loading`（值 = "加载中…"）的误命名复用**，被 `PersonaManagerModal` / `PromptInjectPanel` / `HarnessSkillPanel` 当通用 loading 文案取用。**不存在成就系统** |
| `QQ` | **2** | `client/utils/dialog-style.ts:58,62` 两行 CSS 注释（"QQ 式等级介绍" / "模仿 QQ 点亮呼吸"）。**无 QQ 机器人** |
| `featured` / `榜单` / `rank` | **0** | 无推荐榜单 |
| `推荐` | 29 | **是「上下文提示词推荐」**：`client/components/data/ContextRecommendations.tsx`（356 行，15 处）+ `types.ts:187-188` 的 `contextRecommendEnabled` + i18n。这是**保留功能**，不是插件推荐 |
| `plugin` / `插件` in i18n | 2 / 5 | 仅「关于」页免责声明与导航文案 |
| `news` | **0** | 无 |

**额外发现（可顺手删的死代码，不属于 C 但确实无用）** —— `src/host/ai.ts`：

| 符号 | 行 | 证据 |
|---|---|---|
| `DailyReportItem` | 843-849 | 仅 `generateDailyReport` 签名使用 |
| `TechNewsItem` | 851-873 | **全 repo 零引用** |
| `todayLocalDate` | 875-885 | 仅 `generateDailyReport` 内部使用 |
| `generateDailyReport` | 887-940 | **全 repo 零外部调用者**（其注释自述"供公告报纸「每日日报」栏目"，但该 UI 在本 repo 不存在） |

**相邻仓库确认**：工作区 `D:\Project\source\__TEST__\dsh-plugins` 顶层只有 `dsh-deep-research`、`dsh-routing-suite`、`_ref-dsh-prompt-library` 三项，**没有桌面宠物 / 插件市场 / QQ 机器人插件的源码**。若这些功能确实存在于上游某处，则它们属于**其他 npm 包**，与本裁剪任务无关。

---

### D. 按 workspace / session 维度做作用域绑定的机制

#### D-1 存在的六套绑定/作用域机制

| # | 机制 | 实现位置 | 存储 | 提示词核心需要？ |
|---|---|---|---|---|
| **D1** | 路径（工作区/项目）-> **人格** id | `persona-service.ts:141-163,170-188`、`store.ts:1765-1815` | `persona_scope_bindings` | 否，人格专用 |
| **D2** | 会话 id -> **人格** id | `persona-service.ts:194-217`、`session-prompts.ts:266-295` | `session_scope_bindings.personaId` | 否，人格专用 |
| **D3** | 路径 -> **会话级技能** id[] | `session-prompts.ts:177-219`、`store.ts:1596-1661` | `prompt_scope_bindings` | 否，注入专用 |
| **D4** | 会话 id -> **会话级技能** id[] + **临时注入**（内存） | `session-prompts.ts:221-345` | `session_scope_bindings.promptIds` + 进程内 `activeSessionPrompts` | 否，注入专用 |
| **D5** | 工作区->项目->会话 **树** | `persona-service.ts:225-266`（路径树）、`session-scope.ts`（挂会话/flatten/排序） | 读 `~/.dsh/storages/workspace.json` + 宿主 `sessionQuery` | 否，绑定 UI 专用 |
| **D6** | 宿主 `uiConversation` 的 chat/trajectory 快照 | `client/utils/conversation-targets.ts`（81 行） | 无（内存服务） | **是，保留**：上下文推荐读聊天上下文 |

#### D-2 精读判断：哪些是提示词本身需要的

**`session-scope.ts`（194 行）100% 是绑定/诊断专用**。它的消费者只有三个：
- `index.ts:25-29,103-135` -> 注册 `listSessions` 提供器，只喂 D5 树；
- `routes.ts:86` -> `/personas/scopes/sessions`（884）与 `/session-prompts/diag`（1046）；
- 无第三个消费者。

**`conversation-targets.ts`（81 行）必须保留**。导出 `setUiConversation:37`、`getUiConversation:42`、`useConversationTargetSnapshot:53`。被引：
- `client/utils/index.ts:27,104`（`setUiConversation`）
- `client/components/data/ContextRecommendations.tsx`（上下文推荐）与 `PromptLibraryButton.tsx` / `PromptAssistant.tsx` / `SelectionAddPrompt.tsx`（读当前会话草稿/上下文）

**`workspace-picker.ts`（75 行）必须保留**。导出 `registerWorkspaces:21`、`isDirectoryPickerAvailable:26`、`isDirectoryBrowserAvailable:34`、`pickExportDirectory:42`、`listExportDirectory:50`、`createExportDirectory:65`。被 `client/utils/index.ts:29,100` 注册，被 `DirectoryPickerModal` 使用，而 `DirectoryPickerModal` 服务于**提示词导出目录选择**（`ImportExportModal:1529-1538`）。

**结论表**：

| 模块 | 判定 | 理由 |
|---|---|---|
| `host/persona-service.ts` 全部 | 删 | D1/D2/D5 人格侧 |
| `host/session-prompts.ts` D3/D4 部分（177-345） | 删 | 注入作用域 |
| `host/session-prompts.ts` CRUD 部分（1-176, 347-446） | 删 | 属 B1 |
| `host/session-scope.ts` 全部 | 删 | D5 专用 |
| `client/utils/conversation-targets.ts` | **留** | 聊天上下文（提示词推荐/插入用） |
| `client/utils/workspace-picker.ts` | **留** | 提示词导出目录选择 |
| `routes.ts` `/fs/list`、`/fs/mkdir` + 257-361 | **留** | 同上（保留部分唯一非技能用途） |
| `types.ts` `ScopeNode` / `SessionNode` / `UNMATCHED_SCOPE_PATH` | 删 | D5 数据类型 |

---

## 2. `src/index.ts` 的 `apply()` 逐段解剖

`src/index.ts` 共 **257 行**。`apply(ctx)` 从 **79** 行起，组装了 **2 个 systemPrompt section**。

### 2-1 骨架与依赖

| 段 | 行 | 内容 | 裁剪 |
|---|---|---|---|
| imports | 8-29 | 8 个源模块 | 保留 9-11（routes/events/store） |
| `PromptSection` 接口 | 34-38 | 本地声明的 section 形状 | 保留（甲方案可删） |
| `inject = []` | 41 | 无静态必需服务 | 保留 |
| `buildSessionPromptInjection` | 43-77 | 会话级技能段文本组装 | **删** |
| `apply` | 79-257 | — | 重写 |

### 2-2 `apply()` 内部分段

| # | 行 | 干什么 | 依赖 | 裁剪 |
|---|---|---|---|---|
| 1 | 80 | `makePromptRoutes()` | routes.ts | 留 |
| 2 | 82-97 | 监听 `session/event`，写 `setCurrentSessionScope` + `recordActiveSessionCwd` | session-prompts, session-scope | 删 |
| 3 | 99-138 | `ctx.inject(["sessionQuery"])` -> `registerSessionListProvider`（`listSessions` + `readTitleSnapshots`） | session-scope | 删 |
| 4 | 140-142 | 注释（DB 懒初始化） | — | 可删 |
| 5 | 145 | `ensureSoulFile().catch()` | character.ts | 删（A） |
| 6 | 147 | `seedDefaultSessionPromptsIfEmpty()` | session-prompts | 删（B1） |
| 7 | 149-156 | `deployment:persona` section 的 scope 说明注释 | — | 删 |
| 8 | 157 | `PERSONA_SECTION_NAME = "deployment:persona"` | — | 删（A） |
| 9 | 160-168 | `resolveAssemblySession(context)` -> `{sessionId, cwd}` | session-scope(`recordActiveSessionCwd`), session-prompts(`getCurrentSessionScope`) | 删 |
| 10 | 170-174 | `personaSectionText`（**section #1**，order 0，`deployment:persona`） | persona-service, character | **删（A 核心）** |
| 11 | 180-191 | `workspaceSectionText`（**section #2**，order 800，`prompt-library-context`）拼 4 段：`harnessSystemSync()` -> `buildSessionPromptInjection()` -> `disabledHarnessSkillsInstruction()` -> `welcomePromptOnce()` | harness, session-prompts, skills, store | 拆解，见 §4 |
| 12 | 194-222 | `agentBus.on("agent/created")` -> 用 `agent.ctx` 的 scoped `inject(["systemPrompt"])` 注册两个 section | 10 + 11 | 删或改写 |
| 13 | 226-233 | `ctx.inject(["llm"])` -> `registerLlm` + `logAiInjected` | ai.ts | **留**（AI 优化必需） |
| 14 | 235-251 | `ctx.inject(["webServer"])` -> 注册全部 route + `dataChangedUpgradeRoute`（`/api/prompt-library/events`） | routes, events | **留** |
| 15 | 254-256 | 返回 dispose（`bus.off`） | — | 随 2 删 |

### 2-3 systemPrompt section 明细

| section name | order | text 来源 | 归属 | 裁剪 |
|---|---|---|---|---|
| `deployment:persona` | **0** | `soulSystemSync(resolvePersonaForSession(...))` | **A 人格** | **必须随 A 一起删**，否则 persona-service/character 悬空 |
| `prompt-library-context` | **800** | 4 段拼接（HARNESS + 技能注入 + 禁用技能 + 欢迎） | B1/B3/harness/welcome | 随 B1/B3 删除；HARNESS 段与 welcome 段按 §4 决策 |

**为什么 section 注册要放在 `agent/created` 里**（index.ts:149-156, 192-222）：宿主 `@deepseek-ai/dsh-system-prompt` 已把全局槽位 `deployment:persona`(order 0) 写死；在**插件全局上下文**注册同名 section 会重名抛错 -> 整段注入失效。正确做法是用 `payload.agent.ctx`（scoped context）经 `inject(["systemPrompt"])` 注册，落到该会话的 scoped layer，同名即 shadow 宿主默认人格，且随 agent 销毁自动回收。**这是「人格」机制独一无二的设计，删 A 后该段全部失效。**

---

## 3. 依赖倒置图：删掉 A/B/C 后的悬空引用清单

> 下表的意思是：**执行任一删除动作后，会立刻产生编译错误的 文件:行**。必须按 §5 的顺序先断引用。

### 3-1 删 A（人格）-> 悬空点

| 悬空文件:行 | 被 import 的符号 | 来源（已不存在） |
|---|---|---|
| `src/index.ts:22` | `soulSystemSync`, `ensureSoulFile` | `host/character.ts` |
| `src/index.ts:23` | `resolvePersonaForSession` | `host/persona-service.ts` |
| `src/host/ai.ts:19` | `buildSoulBoundary`, `readSoulDoc` | `host/character.ts` |
| `src/host/ai.ts:408,660,715,775,829,1019` | `withSoulSystem(...)` 调用 | ai.ts 本地（随 421-435 删） |
| `src/host/routes.ts:41` | `getPersona` | `host/store.ts` |
| `src/host/routes.ts:73-84` | 10 个人格函数 | `host/persona-service.ts` |
| `src/host/routes.ts:69` | `setSessionPersonaBindingForSession` | `host/session-prompts.ts` |
| `src/host/routes.ts:85` | `clearAllPersonaBindings` | `host/session-prompts.ts` |
| `src/host/session-prompts.ts:37` | `getSessionBoundPersonaId` -> 反向依赖 | 自身循环 |
| `src/host/character.ts:13-18` | `getDefaultPersonaSoul`, `getPersona`, `setDefaultPersonaSoul`, `updatePersonaMeta` | `host/store.ts` |
| `src/host/persona-service.ts:13-35,36-37` | store + character + session-prompts | — |
| `src/client/utils/api.ts:8-9` | `PersonaBinding`, `PersonaView` | `types.ts` |
| `src/client/components/persona-skill/PersonaManagerModal.tsx:16-29` | `PersonaView`, `ScopeNode`, `UNMATCHED_SCOPE_PATH` + 9 个 API | types + api.ts |
| `src/client/components/data/PromptAssistant.tsx:14,79` | `PersonaManagerModal` | 已删组件 |

### 3-2 删 B1（会话级技能）-> 悬空点

| 悬空文件:行 | 符号 |
|---|---|
| `src/index.ts:12-19` | `getCurrentSessionScope`, `getSessionActivePromptIds`, `getSessionPromptsByIds`, `resolveSessionPromptBindingIds`, `seedDefaultSessionPromptsIfEmpty`, `setCurrentSessionScope` |
| `src/index.ts:43-77,147,165,184-185` | `buildSessionPromptInjection` 与其依赖 |
| `src/host/routes.ts:54-72` | 18 个会话级技能函数 |
| `src/host/session-scope.ts:16` | `listSessionBindings` |
| `src/types.ts` -> client `api.ts:15` | `SessionPrompt` |
| `src/client/components/persona-skill/PromptInjectPanel.tsx:20-35` | `ScopeNode`, `SessionPrompt`, `clampTitle`, `UNMATCHED_SCOPE_PATH` + 11 个 API |
| `src/client/components/data/PromptAssistant.tsx:13,88` | `PromptInjectPanel` |

### 3-3 删 B2（技能导入导出）-> 悬空点

| 悬空文件:行 | 符号 |
|---|---|
| `src/host/routes.ts:21-31` | `exportPromptsAsSkills`, `importSkillEntries`, `importSkillsFromDisk`, `listAvailableSkills`, `listHarnessSkillToggles`, `listSkillsFromDir`, `parseSkillRaw`, `setHarnessSkillToggle`, `deleteHarnessSkill` |
| `src/host/skills.ts:13` | `js-yaml` 的 `load` |
| `src/client/components/import-export/ImportExportModal.tsx:43,187,195-196,387,695-697,839-841,1470-1510` | `SkillImportModal` + `pl.skillExport*` 调用 |
| `src/client/components/import-export/SkillImportModal.tsx:29-31,45` | 4 个 API + `DirectoryPickerModal` |
| `src/client/utils/api.ts:158-311` 中的技能函数 | 上述 12 个导出 |

### 3-4 删 B3（harness 技能开关）-> 悬空点

| 悬空文件:行 | 符号 |
|---|---|
| `src/index.ts:21,186-187` | `disabledHarnessSkillsInstruction` |
| `src/host/routes.ts:26,29,30` | `listHarnessSkillToggles`, `setHarnessSkillToggle`, `deleteHarnessSkill` |
| `src/client/components/persona-skill/HarnessSkillPanel.tsx:23` + `PromptInjectPanel.tsx:44,321` | `BookIcon`、`HarnessSkillPanel` |
| `src/client/utils/api.ts:567-599` | `HarnessSkillItem`, `listHarnessSkillToggles`, `setHarnessSkillToggle`, `deleteHarnessSkill` |

### 3-5 删 C -> **无悬空点**（C 不存在）

### 3-6 「安全删除边界」总结

**只有 5 个文件同时被「保留功能」与「待删功能」引用，必须做局部改写而非整删**：

| 文件 | 保留部分 | 删除部分 |
|---|---|---|
| `src/index.ts` | 80, 226-233, 235-251 | 12-29, 43-77, 82-224, 254-256 |
| `src/types.ts` | 1-101、166-213 | 102-165 |
| `src/host/routes.ts` | 1-207、220-234（`extractIds`）、257-583（含 fs 块）、753-872、1160-1176 | 208-217、236-255、543/585-752、873-1161 |
| `src/client/utils/api.ts` | 1-157、192-220（fs，保留）、312-405、602-615 | 20-21、158-191、221-311、403-599 |
| `src/host/ai.ts` | 1-420、436-842、941-1048（改） | 19、421-435、soul 分支 1071-1079/1088-1096、843-940（死代码） |

> 行号会随编辑漂移。**建议「从文件末尾往前删」**，或先删函数体再删 import，最后跑 `npm run typecheck` 兜底。

---

## 4. systemPrompt 注入是否还需要？index.ts 能简化到什么程度？

### 4-1 判定

**取决于精简版是否保留「把提示词注入会话」的能力。** 任务描述的目标能力是「词库 CRUD + AI 优化 + 复用」，**不含注入**。

| 方案 | 需要 systemPrompt 注入？ | section 数 | 理由 |
|---|---|---|---|
| **甲：纯词库（CRUD + AI 优化 + 复用插入）** | **完全不需要** | **0** | 「复用」通过输入触发浮层 -> 插入输入框实现（`PromptLibraryButton.tsx` + composer input 插槽），**不经过 systemPrompt**；「AI 优化」调用 `/ai/polish` -> `ai.ts` 的 `polishPromptBody`，**也不经过 systemPrompt** |
| **乙：额外保留「选中提示词 -> 注入当前会话」** | **需要 1 个** | **1** | 需要一条常驻注入通道，但**不需要 2 个 section**：原 order 0 的 `deployment:persona` 纯属人格 shadow，order 800 的 `prompt-library-context` 里的「技能注入」才是提示词注入载体 |

**推荐走甲**。理由：
1. 甲方案彻底摆脱 `agent/created` 事件、`deployment:persona` shadow 语义、`session/event` 监听、`sessionQuery` 服务依赖（指数级降低裁剪风险）。
2. 「提示词复用」的主路径本来就是 UI 插入（`PromptLibraryButton` 的 Insert / Overwrite / Insert&Send 三种模式），注入是**附加**能力。
3. 若日后要加回注入，只需保留 `session_prompts` 表 + 一个 section，改动是**加法**而非回滚。

### 4-2 甲方案 `index.ts` 简化目标（约 **55-70 行**）

```
// 精简版 src/index.ts 结构（示意，非最终代码）
export const name = "prompt-enhancer";
export const inject: string[] = [];

export function apply(ctx: Context) {
  const routes = makePromptRoutes();

  // AI 能力：llm 不可用时 AI 优化自动停用，其余功能不受影响
  ctx.inject(["llm"], (llmCtx) => {
    registerLlm(llmCtx.llm);
    logAiInjected(true);
    return () => { registerLlm(undefined); logAiInjected(false); };
  });

  // HTTP 路由 + 唯一 WS 通道（数据变更广播 / 词库助手状态流）
  ctx.inject(["webServer"], (httpCtx) => {
    httpCtx.effect(() => {
      const disposers = routes.map((r) => httpCtx.webServer.register(r));
      const server = httpCtx.webServer as unknown as { registerUpgrade?: (r: unknown) => () => void };
      if (typeof server.registerUpgrade === "function") disposers.push(server.registerUpgrade(dataChangedUpgradeRoute));
      return () => { for (const d of disposers) d(); };
    }, "prompt-enhancer: routes");
  });
}
```

**从 `apply()` 中整体消失的**：`PromptSection` 接口、`buildSessionPromptInjection`、`session/event` 监听、`ctx.inject(["sessionQuery"])`、`ensureSoulFile`、`seedDefaultSessionPromptsIfEmpty`、`resolveAssemblySession`、`personaSectionText`、`workspaceSectionText`、`agent/created` 监听、`return () => bus.off(...)`。以及 import 列表从 8 个模块降到 3 个（routes / events / ai）。
**`inject: string[]` 仍为 `[]`**（webServer / llm / systemPrompt 均按条件 `ctx.inject` 注入）。

### 4-3 附加决策：HARNESS 段与欢迎段

| 段 | 实现 | 甲方案处置 | 理由 |
|---|---|---|---|
| **HARNESS 会话上下文** | `host/harness.ts`(55) + `host/bundle-doc.ts`(23) + `doc/harness.default.md` | **删** | 它是「告诉模型本插件有哪些界面入口」的自述注入，词库 CRUD 完全不需要；且其文案第 29 行明写「人格（SOUL）与会话级技能按工作区/项目绑定自动注入」，删功能后属**错误自述** |
| **欢迎语（首次会话）** | `store.ts` 的 `welcomePromptOnce:342-412` + `meta` 键 `welcomeShown` | **可删** | 唯一调用者 `index.ts:188`。删后 `store.ts:342-412` + 相关 `meta` 读写变死代码。若想保留「第一次见面打个招呼」，则保留一个 section（此时 section 数为 1） |
| **禁用技能软控制** | `skills.ts:526-546` | 删 | B3 |

---

## 5. 逐步裁剪方案（有顺序的 checklist）

> **总原则：先删调用点（断引用）-> 再删被调用者（删文件）-> 每步跑 `npm run typecheck`。**
> 环境：`package.json:61` 定义 `typecheck: tsc --noEmit`；`package.json:57` 定义 `build`。工作目录 = `_ref-dsh-prompt-library`。

### Step 0 · 建立安全网（必做，不可跳过）
- [ ] 0.1 `git switch -c feat/prompt-enhancer-cut`（在参考工程内建分支，勿污染上游）
- [ ] 0.2 `npm ci && npm run typecheck && npm run build` -> 记录基线（必须全绿）
- [ ] 0.3 备份 `~/.dsh/prompt-library/db/prompts.db`（裁剪不改库结构，但删除 store 函数后老库中的人格行不再被读到）
- [ ] 0.4 在 `package.json` 改名：`name` -> `dsh-prompt-enhancer`（注意 `scripts/build.mjs:22-23` 从 `package.json.name` 派生 PLUGIN_ID，改名后 client bundle 注册 id 自动跟随；同时 `cordis.patch.yml:4` 的 `name:` 必须同步改）

### Step 1 · 先断开 `src/index.ts`（最高优先级，它是所有悬空的源头）
- [ ] 1.1 删除 import 12-29 中的：`session-prompts`(12-19)、`skills`(21)、`character`(22)、`persona-service`(23)、`harness`(24)、`session-scope`(25-29)。保留 9(routes)、10(events)、11(store 的 welcomePromptOnce)、20(ai 的 logAiInjected/registerLlm)
- [ ] 1.2 删除 `PromptSection` 接口 34-38（甲方案不需要 section）
- [ ] 1.3 删除 `buildSessionPromptInjection` 43-77
- [ ] 1.4 删除 `apply()` 内：82-224（bus / sessionQuery / persona / section / agent 全部）、254-256（dispose）
- [ ] 1.5 保留 80、226-233、235-251；在 251 后直接收尾
- [ ] 1.6 `npm run typecheck` -> 此时 `routes.ts` 仍完整，**应当仍然报错**（routes 引用了 skills/session-prompts），这是预期的

### Step 2 · 断开 `src/host/routes.ts`
- [ ] 2.1 删 import 21-31（`./skills.js` 全部 9 个符号）
- [ ] 2.2 删 import 54-72（`./session-prompts.js` 全部 18 个符号）
- [ ] 2.3 删 import 20 中的 `generateSkillDescriptor`（保留 `generateDraft`, `generateIntro`, `listAiSelectables`, `polishPromptBody`, `polishPromptBodyWithSummary`）；注意 `generateDraft` 若不再接受 `"soul"` 需同步 Step 3
- [ ] 2.4 删 import 73-85（`persona-service` + `clearAllPersonaBindings`）
- [ ] 2.5 删 import 86（`./session-scope.js`）
- [ ] 2.6 删 import 41（`getPersona`，来自 `./store.js`）
- [ ] 2.7 删私有类型/函数：`isSkillEntry` 208-217、`resolveCurrentProjectCwd` 236-255
- [ ] 2.8 删路由块（**从文件末尾往前**）：session-prompts 全块 965-1161 -> personas 全块 873-963 -> skills 全块（含 543 与 585-752）。**注意 549-583 的 `/fs/list`、`/fs/mkdir` 是夹在 543 与 585 之间的独立插入块，必须挑出保留**
- [ ] 2.9 删 `/skills/ai-describe` 683-711 时，同步确认 `generateSkillDescriptor` 在 ai.ts 的引用被清理（Step 3.6）
- [ ] 2.10 校验 `isAbsolute` / `resolve` / `homedir` / `readdir` / `mkdir` / `statSync` 仍被保留的 fs 块（257-361）使用 -> 全部 import 保留
- [ ] 2.11 `npm run typecheck` -> 应仅剩 `store.ts` / `ai.ts` 的报错

### Step 3 · 断开 `src/host/ai.ts`
- [ ] 3.1 删 import 19（`./character.js`）
- [ ] 3.2 删 `withSoulSystem` 定义 421-435
- [ ] 3.3 改 6 处调用：408 `return withSoulSystem(system)` -> `return system`；660、715、775、829、1019 同理（`await withSoulSystem(x)` -> `x`）
- [ ] 3.4 `generateDraft` 签名 1055-1061：`kind: "soul" | "skill"` 可保留；若 UI 已无 soul 按钮，建议收窄为 `"skill"` 并删 1071-1079 / 1088-1096 的 soul 分支
- [ ] 3.5 删死代码：`DailyReportItem` 843-849、`TechNewsItem` 851-873（确认零引用）、`todayLocalDate` 875-885、`generateDailyReport` 887-940
- [ ] 3.6 删 `generateSkillDescriptor` 985-1040（唯一调用者是 B2 的 `/skills/ai-describe`）
- [ ] 3.7 `npm run typecheck`

### Step 4 · 断开 `src/host/store.ts`
- [ ] 4.1 删人格区：`getDefaultPersonaSoul` 1584-1588、`setDefaultPersonaSoul` 1589-1595、`PersonaRecord` 1663-1692、`listPersonas` 1693-1704、`getPersona` 1705-1718、`createPersona` 1719-1728、`updatePersonaMeta` 1729-1748、`deletePersona` 1749-1764、`setScopePersonaBinding` 1765-1774、`getScopeBoundPersonaId` 1775-1786、`listScopeBindings` 1787-1797、`clearScopePersonaBinding` 1798-1806、`clearAllScopePersonaBindings` 1807-1817、`clearAllSessionPersonaBindings` 1885-1898
- [ ] 4.2 删会话级技能区：`SessionPromptRecord` 1402-1449、`listSessionPromptRecords` 1450-1473、`getSessionPromptRecord` 1474-1499、`createSessionPromptRecord` 1500-1524、`updateSessionPromptMeta` 1525-1571、`deleteSessionPromptRecord` 1572-1583、`setScopePromptBinding` 1596-1616、`getScopeBoundPromptIds` 1617-1628、`listScopePromptBindings` 1629-1642、`clearScopePromptBinding` 1643-1651、`clearAllScopePromptBindings` 1652-1662、`setSessionScopeBinding` 1818-1832、`getSessionScopeBinding` 1833-1847、`listSessionScopeBindings` 1848-1866、`clearSessionScopeBinding` 1867-1875、`clearAllSessionPromptBindings` 1876-1884
- [ ] 4.3 删技能链接区：`getSkillNameForPrompt` 669-677、`setSkillNameForPrompt` 678-686、`getPromptIdBySkillName` 687-695
- [ ] 4.4 建表语句：`personas` 127-142、`persona_scope_bindings` 146-152、`session_prompts` 163-181、`session_scope_bindings` 185-192、`prompt_skill_links` 116-124
  - **选项 A（推荐，零风险）**：**保留建表语句**。老库仍可打开，无数据丢失，代价是 5 个空表。
  - **选项 B（干净）**：删建表语句 -> 老库中这些表保留但不再被建/读，功能正常。要真删需在迁移里显式 `DROP TABLE`。
- [ ] 4.5 删 `migrateMdContentToDb` 569-589 的第 1 段 571-578 与第 2 段 579-588；函数体清空后整个删掉，并删调用点（`initDb` 内 216-218 附近）
- [ ] 4.6 `npm run typecheck`

### Step 5 · 删除 host 文件（此时已无引用者）
- [ ] 5.1 `rm src/host/character.ts`（128）
- [ ] 5.2 `rm src/host/persona-service.ts`（266）
- [ ] 5.3 `rm src/host/session-prompts.ts`（446）
- [ ] 5.4 `rm src/host/session-scope.ts`（194）
- [ ] 5.5 `rm src/host/skills.ts`（546）
- [ ] 5.6 `rm src/host/harness.ts`（55）+ `rm src/host/bundle-doc.ts`（23）—— 唯一消费者是 harness.ts
- [ ] 5.7 `rm doc/harness.default.md`；`scripts/build.mjs:116-123` 的 doc 拷贝块可保留（还拷 manual 文档）或精简
- [ ] 5.8 `src/host/paths.ts`：删 `soulPath():68-70`、`sessionPromptPath():73-75`（`join` / `dataDir` 仍被其他函数用 -> 保留）
- [ ] 5.9 `src/host/text.ts`（8 行）**保留**（被 store.ts:31 用）
- [ ] 5.10 `npm run typecheck`

### Step 6 · 断开 `src/client/utils/index.ts`（client 根入口，第二优先级源头）
- [ ] 6.1 `inject` 数组 37-42：`\"uiConversation\"` 可保留，`\"workspaces\"` **必须保留**（导出目录选择）；`\"slots\"` / `\"locale\"` 保留
- [ ] 6.2 保留 20-25 的 import：`PromptLibraryButton`, `AIPolishButton`, `ContextRecommendations`, `PromptAssistant`, `SettingsSection`, `registerSettingsAboveMenu`
- [ ] 6.3 保留 27-34（i18n / conversation-targets / data-sync / workspace-picker / api / settings-nav-icon）
- [ ] 6.4 `apply` 内 142-233 全部保留（composer 按钮、AI 润色按钮、上下文推荐、PromptAssistant 宿主、设置导航图标、设置面板、设置上方菜单按钮）
- [ ] 6.5 `npm run typecheck`（client 侧）

### Step 7 · 断开并删除 client 组件
- [ ] 7.1 `src/client/components/data/PromptAssistant.tsx`：删 import 13(`PromptInjectPanel`)、14(`PersonaManagerModal`)；删 `case "persona"` 77-85、`case "workspaceInstructions"` 86-94（124 行 -> 约 100 行）
- [ ] 7.2 `src/client/components/settings/SettingsAboveMenuButton.tsx`：删菜单项 78-84（persona）、85-91（workspaceInstructions）；删 `PANEL_TYPE_MAP` 的 `persona` / `workspaceInstructions` 98-99（533 行 -> 约 500 行）
- [ ] 7.3 `src/client/components/import-export/ImportExportModal.tsx`：删 import 43；删 state 187、195-196；删导出技能守卫 387 与按钮 695-697、839-841；删渲染 1470-1510（1644 行 -> 约 1520 行）
  - **保留** 1529-1538 的 `DirectoryPickerModal`（提示词导出目录选择）与 import 40
- [ ] 7.4 `rm src/client/components/persona-skill/PersonaManagerModal.tsx`（1361）
- [ ] 7.5 `rm src/client/components/persona-skill/PromptInjectPanel.tsx`（1555）
- [ ] 7.6 `rm src/client/components/persona-skill/HarnessSkillPanel.tsx`（437）
- [ ] 7.7 `rm -r src/client/components/persona-skill/`（目录已空）
- [ ] 7.8 `rm src/client/components/import-export/SkillImportModal.tsx`（2333）
- [ ] 7.9 保留：`common/DirectoryPickerModal.tsx`(429)、`common/BookIcon.tsx`(27，被 LexiconManagerModal / ImportExportModal / ImportEditModal 使用)、其余 common/*、`data/LexiconManagerModal.tsx`(2075)、`data/PromptLibraryButton.tsx`(1633)、`data/SelectionAddPrompt.tsx`(913)、`data/TemplateVariables.tsx`(527)、`data/TagManagePanel.tsx`(414)、`data/RecycleManagePanel.tsx`(567)、`data/ContextRecommendations.tsx`(356)、`data/AIPolishButton.tsx`(318)、`import-export/ImportConfirmModal.tsx`(202)、`import-export/ImportEditModal.tsx`(1036)、`settings/*`、`utils/*`
- [ ] 7.10 `npm run typecheck`

### Step 8 · 断开 `src/client/utils/api.ts`
- [ ] 8.1 删 import 8-9(`PersonaBinding`, `PersonaView`)、14(`ScopeNode`)、15(`SessionPrompt`)
- [ ] 8.2 删常量 20(`PERSONAS_BASE`)、21(`SESSION_PROMPTS_BASE`)
- [ ] 8.3 删技能区 158-191（`SkillImportResult` / `importSkills` / `SkillEntry` / `SkillSource`）
  - **保留 192-220**（`DirEntry` / `DirListing` / `listFsDirectory` / `createFsDirectory`）
- [ ] 8.4 删 221-311（`listAvailableSkills` 到 `describeSkill`）
- [ ] 8.5 删人格区 403-446 + `clearAllPersonaBindings` 504-507 + `setSessionPersonaBinding` 544-547
- [ ] 8.6 删会话级技能区 448-520 + `ScopeDiag` / `diagSession` 524-543 + `setSessionPromptBindingForSession` 549-556 + `clearSessionBinding` 557-565
- [ ] 8.7 删 harness 区 567-599
- [ ] 8.8 `getMetaValue:602` / `setMetaValue:609`：**实测唯一消费者是 PromptInjectPanel，可删**。建议先保留，后续再清理
- [ ] 8.9 `npm run typecheck`

### Step 9 · 清理 `src/types.ts`
- [ ] 9.1 删 39-57(`SessionPrompt`)、102-128(`PersonaMeta` / `PersonaView` / `PersonaBinding`)、130-163(`SessionNode` / `UNMATCHED_SCOPE_PATH` / `ScopeNode`)
- [ ] 9.2 保留 1-38、59-101、164-213（`Prompt` / `TrashItem` / `PromptStoreFile` / `ApiResponse` / `TITLE_MAX_LEN` / `clampTitle` / `PromptInput` / `PromptPatch` / `PluginSettings` / `DEFAULT_SETTINGS`）
- [ ] 9.3 `npm run typecheck`

### Step 10 · 清理 i18n（`src/client/utils/i18n.ts`，1058 行；zh 在 17-500，en 在 501-1058）
- [ ] 10.1 `zh` 字典删：`pl.ctx.personas`(86)、`pl.ctx.workspaceInstructions`(89)、`pl.personas.*`(123-166)、`pl.inject.*`(172-222)、`pl.harnessSkill.*`(223-237)、`pl.skillImport*`(272-273)、`pl.skillModal.*`(274-368)、`pl.skillExport*`(369-371)
  - **不要删** `pl.dirPicker.*`（342-350）—— DirectoryPickerModal 保留
- [ ] 10.2 `en` 字典删对应镜像键：`pl.ctx.personas`(569)、`pl.ctx.workspaceInstructions`(572)、`pl.personas.*`(606-649)、`pl.inject.*`(655-705)、`pl.harnessSkill.*`(706-719)、`pl.skillImport*`(755-756)、`pl.skillModal.*`(757-851)、`pl.skillExport*`(852-854)
- [ ] 10.3 `pl.achievements.loading`（242 / 725）：**先检查剩余引用者**。若 `PersonaManagerModal` / `PromptInjectPanel` / `HarnessSkillPanel` 是唯一使用者 -> 删；若保留组件也在用 -> 保留
- [ ] 10.4 `pl.ai.gen*`（`genDone` / `genFailed` / `genNeedTitle` / `generating`）与 `pl.diag.*`：确认剩余引用者，全部随面板消失则删
- [ ] 10.5 `npm run typecheck` —— `en: Record<keyof typeof zh, string>` 会把「zh 删了 en 没删」/「en 删了 zh 没删」都报成类型错误，这是最可靠的完整性校验
- [ ] 10.6 可选：写脚本比对 zh / en 的 key 集合（应当完全相等）

### Step 11 · 收尾
- [ ] 11.1 `package.json`：`dependencies` 删 `js-yaml`(102)、`devDependencies` 删 `@types/js-yaml`(91)；`name` / `description` / `keywords` 改名；`dsh.client.inject`(46-52) 中的 `@deepseek-ai/dsh-client-ui-conversation` / `ui-sidebar-right` 若仍被 PromptLibraryButton 使用则保留
- [ ] 11.2 `cordis.patch.yml:4` 的 `name:` 同步改
- [ ] 11.3 `README.md` / `README.zh.md`：删 Generate Skills / Persona 段落与「Skills」导航描述
- [ ] 11.4 `npm run build`，确认 `lib/index.js` 与 `lib/client.js` 均生成
- [ ] 11.5 运行 §7 自检清单

---

## 6. 精简版建议 `src` 目录树（文件级，含处置标注）

图例：**原样保留** / **改写** / **新建** / **删除**

```
src/
├── ambient.d.ts                                   [原样保留] 26 行（IDE 类型补充）
├── host-vendor.d.ts                               [改写]     87 行（可精简 host 侧 vendor 声明）
├── md-text.ts                                     [原样保留] 61 行（skills.ts + client/data-formats.ts 共用）
├── types.ts                                       [改写]     213 -> 约 150 行（删 102-165）
├── index.ts                                       [改写]     257 -> 约 60 行（见 §4-2）
├── host/
│   ├── ai.ts                                      [改写]     1129 -> 约 900 行（删 character 依赖 / soul / 日报死代码 / generateSkillDescriptor）
│   ├── bundle-doc.ts                              [删除]     23 行（唯一消费者 harness.ts）
│   ├── character.ts                               [删除]     128 行
│   ├── events.ts                                  [原样保留] 73 行（WS 广播，纯通用）
│   ├── harness.ts                                 [删除]     55 行
│   ├── node-sqlite.ts                             [原样保留] 43 行
│   ├── paths.ts                                   [改写]     75 -> 约 67 行（删 soulPath / sessionPromptPath）
│   ├── persona-service.ts                         [删除]     266 行
│   ├── refine.ts                                  [原样保留] 53 行（AI 输出解析，零依赖）
│   ├── routes.ts                                  [改写]     1176 -> 约 380 行（删 208-217, 236-255, 543/585-752, 873-1161）
│   ├── session-prompts.ts                         [删除]     446 行
│   ├── session-scope.ts                           [删除]     194 行
│   ├── skills.ts                                  [删除]     546 行
│   ├── store.ts                                   [改写]     1928 -> 约 1450 行（删人格 / 技能 / 绑定三区）
│   ├── text.ts                                    [原样保留] 8 行
│   ├── update.ts                                  [原样保留] 36 行（GET /version）
│   └── ws.ts                                      [原样保留] 328 行（通用 WS 框架）
└── client/
    ├── utils/
    │   ├── api.ts                                  [改写]     615 -> 约 330 行（删 20-21, 158-191, 221-311, 403-599）
    │   ├── button-style.ts                         [原样保留] 26 行
    │   ├── conversation-targets.ts                 [原样保留] 81 行（上下文推荐必需）
    │   ├── data-formats.ts                         [原样保留] 405 行
    │   ├── data-sync.ts                            [原样保留] 140 行
    │   ├── dialog-style.ts                         [原样保留] 75 行
    │   ├── i18n.ts                                 [改写]     1058 -> 约 700 行（删 §5-Step 10 列举键）
    │   ├── index.ts                                [改写]     274 -> 约 265 行（client 入口，仅删 2 处 import）
    │   ├── react-dom-shim.d.ts                     [原样保留] 14 行
    │   ├── recent-created.ts                       [原样保留] 24 行
    │   ├── settings-nav-icon.ts                    [原样保留] 95 行
    │   ├── theme.ts                                [原样保留] 165 行
    │   ├── version.ts                              [原样保留] 14 行
    │   ├── workspace-picker.ts                     [原样保留] 75 行（导出目录选择必需）
    │   └── ws.ts                                   [原样保留] 107 行
    └── components/
        ├── common/
        │   ├── BookIcon.tsx                        [原样保留] 27 行
        │   ├── ConfirmDialog.tsx                   [原样保留] 111 行
        │   ├── DialogCloseButton.tsx               [原样保留] 57 行
        │   ├── DirectoryPickerModal.tsx            [原样保留] 429 行（提示词导出目录选择）
        │   ├── Pagination.tsx                      [原样保留] 76 行
        │   ├── PanelHeader.tsx                     [原样保留] 47 行
        │   ├── SearchBox.tsx                       [原样保留] 292 行
        │   ├── SubPanelModal.tsx                   [原样保留] 135 行
        │   ├── TagInput.tsx                        [原样保留] 61 行
        │   ├── Tooltip.tsx                         [原样保留] 100 行
        │   └── WindowToggleButton.tsx              [原样保留] 62 行
        ├── data/
        │   ├── AIPolishButton.tsx                  [原样保留] 318 行
        │   ├── ContextRecommendations.tsx          [原样保留] 356 行
        │   ├── LexiconManagerModal.tsx             [原样保留] 2075 行
        │   ├── PromptAssistant.tsx                 [改写]     124 -> 约 100 行（删 2 个 case）
        │   ├── PromptLibraryButton.tsx             [原样保留] 1633 行
        │   ├── RecycleManagePanel.tsx              [原样保留] 567 行
        │   ├── SelectionAddPrompt.tsx              [原样保留] 913 行
        │   ├── TagManagePanel.tsx                  [原样保留] 414 行
        │   └── TemplateVariables.tsx               [原样保留] 527 行
        ├── import-export/
        │   ├── ImportConfirmModal.tsx              [原样保留] 202 行
        │   ├── ImportEditModal.tsx                 [原样保留] 1036 行
        │   ├── ImportExportModal.tsx               [改写]     1644 -> 约 1520 行（删技能导入导出）
        │   └── SkillImportModal.tsx                [删除]     2333 行
        ├── persona-skill/                          [删除]     整目录（3553 行）
        │   ├── HarnessSkillPanel.tsx               [删除]     437 行
        │   ├── PersonaManagerModal.tsx             [删除]     1361 行
        │   └── PromptInjectPanel.tsx               [删除]     1555 行
        └── settings/
            ├── SettingsAboveMenuButton.tsx         [改写]     533 -> 约 500 行（删 2 个菜单项）
            └── SettingsSection.tsx                 [原样保留] 759 行

doc/
└── harness.default.md                             [删除]

（可选，仅当采用方案乙「保留注入能力」）
src/host/injections.ts                             [新建] 约 80 行（注入登记 + 路径/会话解析）
src/client/components/enhance/InjectPickerModal.tsx [新建] 约 300 行（精简选择器）
```

**体量核算**：
- host 侧整文件删除：character(128) + persona-service(266) + session-prompts(446) + session-scope(194) + skills(546) + harness(55) + bundle-doc(23) = **1,658 行**；另有局部删除约 **640 行**（routes ~796 + store ~478 + ai ~230 + paths 8 + index ~197，扣除重叠）
- client 侧整文件删除：PersonaManagerModal(1361) + PromptInjectPanel(1555) + HarnessSkillPanel(437) + SkillImportModal(2333) = **5,686 行**；另有局部删除约 **1,100 行**（api ~285 + types 63 + i18n ~350 + PromptAssistant 24 + SettingsAboveMenuButton 33 + ImportExportModal 124 + 其他）
- **合计删除约 8,450 行；`src/` 从 65 文件降到 53 文件，总行数从约 15,600 降到约 7,100（-54%）**

---

## 7. 裁剪后自检清单（缺一不可）

- [ ] **V1 类型**：`npm run typecheck` 零错误（`en: Record<keyof typeof zh, string>` 会自动兜住 i18n 漏删）
- [ ] **V2 构建**：`npm run build` 成功，`lib/index.js` + `lib/client.js` + `lib/.build-meta.json` 均生成
- [ ] **V3 残留扫描**：`grep -rn "persona\|Persona\|soul\|Soul\|SOUL\|session-prompts\|ScopeNode\|SessionNode\|SkillImportModal\|HarnessSkillPanel\|PromptInjectPanel\|PersonaManagerModal\|disabledHarnessSkills\|withSoulSystem\|generateDailyReport\|js-yaml" src/` -> 只应命中被有意保留的注释或类型（目标：0 处）
- [ ] **V4 悬空 import 扫描**：`grep -rn "from \"\.\+\(character\|persona-service\|session-prompts\|session-scope\|skills\|harness\|bundle-doc\)\.js\"" src/` -> 0 处
- [ ] **V5 i18n 键一致性**：脚本比对 zh 与 en 的 key 集合完全相等
- [ ] **V6 路由实测**（在 `dsh web` 中，浏览器 DevTools 或 curl）：
  - 应 200：`GET /api/prompt-library/prompts`、`POST /prompts`、`PUT/DELETE /prompts/:id`、`/tags`、`/trash`、`/export`、`/import`、`/settings`、`/version`、`/fs/list`、`/fs/mkdir`、`POST /ai/polish`、`POST /ai/draft`
  - 应 404（`no route <METHOD> <tail>`，routes.ts:1163）：`/personas*`、`/session-prompts*`、`/skills*`
- [ ] **V7 功能烟测**：新建/编辑/删除提示词；标签增删改；回收站还原；导入导出（json / csv / md / txt）；导出到指定目录（走 DirectoryPickerModal -> /fs/list）；AI 润色；输入触发选择；上下文推荐
- [ ] **V8 注入消失确认**：观察一条新会话的 system prompt —— 不应再出现「# SOUL · 人格」「【注入技能 · ...】」「【HARNESS · 会话上下文】」。同时确认**宿主默认的 `deployment:persona` 槽位已重新生效**（此前被本插件 shadow）
- [ ] **V9 数据兼容**：用裁剪前的 `prompts.db` 直接启动 -> 提示词 / 标签 / 回收站数据完整，无 SQL 报错（说明建表保留策略有效）
- [ ] **V10 客户端 bundle 装载**：页面无 `ModuleLoader` 报错；设置面板出现「提示词」section；左侧设置按钮上方「词库」菜单只剩 数据管理 / 导入导出 / 标签 / 回收站 四项

---

## 8. 关键风险与注意事项

1. **`deployment:persona` 的 shadow 副作用**（index.ts:149-156）：这是本插件最隐蔽的设计。删 A 后宿主内置人格重新生效 —— 若用户此前依赖本插件压制宿主人格，会遇到「AI 说话风格变了」的反馈。**必须在发布说明中显式声明**。
2. **`en: Record<keyof typeof zh, string>` 是唯一强类型 i18n 校验**（`i18n.ts:501`）。不用它就没别的机制能保证 zh/en 同步。
3. **`/fs/list` 与 `/fs/mkdir` 位于技能路由块内**（`routes.ts:549`、`562`，夹在 `/skills/import`(543) 与 `/skills/available`(585) 之间）。**整块删除会误删提示词导出能力**。务必先剥离再删。
4. **`md-text.ts` / `text.ts` 是共享工具**，不要因为「看起来只有技能用」而误删。
5. **`session-prompts.ts:278` `getSessionBoundPersonaId` 被 `persona-service.ts:37` 反向引用** —— 这是 A 与 B1 之间的**双向耦合**，删任一侧都会立刻产生悬空，必须**同一步完成**。
6. **`session_scope_bindings` 表同时承载人格与技能**（`personaId` + `promptIds` 两列，store.ts:185-192）。删函数时该表可整表弃用；但**`clearAllSkillBindings` 与 `clearAllPersonaBindings` 写的是同一张表**（session-prompts.ts:324-333），别只删一个导致另一半残留。
7. **`generateDraft(kind)` 的 `kind: "soul"` 参数**不只服务人格面板 —— `/ai/draft` 路由（routes.ts:821）也可能收到 soul。收窄类型前先确认 client 侧所有 `generateDraft` 调用点（`api.ts:352`）是否都传 `"skill"`。
8. **`package.json` 的 `js-yaml: ^5.3.0`** 版本号可疑（js-yaml 实际主流为 4.x）。删依赖时以 `package-lock.json` 的解析结果为准，不要照抄 `^5.3.0`。

---

*报告完成于对 65 个源文件的逐文件 grep / read 验证。所有行号、符号名、import 边均可回溯到具体文件与行。*
