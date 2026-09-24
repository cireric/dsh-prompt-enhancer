# dsh-prompt-enhancer P3：Host API 面 实施计划

> **面向 Agent 执行者：** 必需子技能：superpower-subagent-driven-development（推荐）或 superpower-executing-plans，逐任务执行 + 逐任务评审。步骤用复选框（`- [ ]`）跟踪。

**目标：** 交付 **M3**——完整 host 面：**26 条 HTTP 路由** + AI 模块（6 个导出）+ 技能写盘 + 设置读写；每条路由在**活宿主**上 curl 都返回合法信封。

**架构：** 沿用规格 §3.2 的三段装配（本计划按 §13.6 修订为四段）：

```
src/index.ts（唯一 host 装配点）
├── ctx.inject(["settings"])  → registerSettings(scope)      // 新增（§13.6）
├── ctx.inject(["llm"])       → registerLlm(ctx.llm)         // 缺失则 AI 自动停用
├── ctx.inject(["webServer"]) → webServer.register(route) ×1（单条 prefix 路由）
└── ✗ 无 systemPrompt section；✗ 无 agent/session 监听；✗ 无 registerUpgrade（无 WS）
```

**技术栈：** Node ≥ 22.19（实测 v24.19.0）、`node:http` 裸 `req/res`、`@deepseek-ai/dsh-llm`（`stream` + `BlockAssembler`）、`@deepseek-ai/schemastery`（设置 schema）、esbuild（沿用 P1 契约）、`node --test`。

**规格：** `docs/superpowers/specs/2026-09-24-dsh-prompt-enhancer-design.md`（权威）。执行前必读 §3.2、§4.2/§4.3/§4.4、§5（路由表）、**§6 全节**（AI 能力与技能导出）、§9.2/§9.3、§12、§13.5/§13.6。

---

## 全局约束

1. 路径一律项目根相对 + 正斜杠；命令默认 CWD = 项目根；宿主侧路径用 `$DSH_HOME` 表达。
2. npm 带 `--cache .npm-cache`。
3. **不引入 `js-yaml`**（设置走宿主服务，见 §13.6）；**不引入任何第三方运行时依赖**。
4. `src/` 内相对导入写显式 `.ts`；`src/**` 必须可擦除 TS；`src/host/store.ts` 保持零宿主依赖——**宿主能力只允许出现在 `routes.ts` / `ai.ts` / `settings.ts` / `skills.ts` / `index.ts`**。
5. **只修改本计划列出的文件**；`.tmp/dsh-prompt-library/` 只读。
6. **AI 相关函数绝不在 `node --test` 里发网络请求**：纯文本后处理（`stripAiFiller` / `parseRefineResult` / `parseSummaryJson`）可单测；凡是需要 `LlmRuntime` 的，一律把它作为**参数**传入（上游即如此），测试只测参数之外的部分。
7. Shell：macOS（bash）。

## 环境事实（实测，2026-09-24）

| 项 | 结论 |
| --- | --- |
| 路由契约 | `WebRoute = { kind: 'exact' \| 'prefix', path: string; handler: (req: IncomingMessage, res: ServerResponse) => void \| Promise<void> }`；`webServer.register(route): () => void`（`packages/host/webserver/src/index.ts:42,165`）。**裸 Node http，无框架**：自己 setHeader / end |
| LLM 契约 | `ctx.llm.stream(options: GenerateOptions): AsyncIterable<StreamChunk>`；`listProviders(): LlmProviderInfo[]`（`{id, name}`）；`listModels(providerId): Promise<LlmModelInfo[]>`（`{id, …}`）。`BlockAssembler`、`createUserMessage`、`GenerateOptions`、`LlmModelInfo` 均由 `@deepseek-ai/dsh-llm` 导出——**上游 `ai.ts` 的调用形状在当前版本依然成立**（已逐项核对），本计划是移植而非改线 |
| 设置契约 | `ctx.settings.register(ns, schema: z<T>, options?) → SettingsScope<T>`，scope 有 `get() / watch(cb) / update(patch) / replace(section)`；命名空间必须是小写连字符标识（`prompt-enhancer` ✓）；宿主负责 `settings.yaml` 的读写与校验，只 patch 我们的命名空间。`settings.get(ns)` 可在未注册时只读兜底 |
| schemastery | `@deepseek-ai/schemastery@3.18.2` **只在共享的** `$DSH_HOME/profiles/node_modules`（`link-dsh-deps` 已把它链进本项目 `node_modules`）；web profile 的 `node_modules` 里没有它、profile 也没把它列为直接依赖。运行时 Node 从插件目录向上查找会命中共享根，故**今天就能解析**。用法：`import z from "@deepseek-ai/schemastery"`，`z.object({...字段: z.number().min().max().default()})` |
| 上游的取径对照 | 上游**不用**官方服务：`store.ts:20` `import { load, dump } from "js-yaml"`，自己读整份 `settings.yaml` 再写回（`package.json.dependencies.js-yaml` 是真的运行时依赖，全仓 `ctx.settings` 零命中）。本机生态 3 个第三方插件（modsearch / better-sidebar / dshmarket）都用官方服务 |
| 路由条数 | 规格 §5 表逐项展开是 **26 条**（正文写「约 22 条」为约数）：prompts 7 + tags 4 + trash 4 + AI 3 + settings 2 + 导入导出 2 + meta 2 + 技能 2 |

## 文件结构

| 文件 | 处置 | 职责 |
| --- | --- | --- |
| `src/host/settings.ts` | 新写 | 设置：schema 定义、`registerSettings(scope)`、`getSettings()`、`updateSettings(patch)`；**接收 scope 接口以便单测** |
| `src/host/ai.ts` | 改写移植 | 6 个导出：`registerLlm` / `listAiSelectables` / `polishPromptBody` / `polishPromptBodyWithSummary` / `refinePrompt` / `generateSkillDescriptor`（删人格与死代码） |
| `src/host/refine.ts` | 原样搬运 | `parseRefineResult` |
| `src/host/skills.ts` | 新写（仅导出半区） | 校验 + 写 `$DSH_HOME/skills/<name>/SKILL.md` + 同名冲突判定 + 过期判定（不做反向导入） |
| `src/host/routes.ts` | 新写 | 26 条路由 + 统一 `ApiResponse` 信封 + 错误映射 |
| `src/index.ts` | 改写 | 四段装配（settings / llm / webServer） |
| `package.json` | 改写 | 增 `peerDependencies`（cordis 必需；dsh-llm / schemastery 为 **optional** peer，见 P3-D11）；`test` 脚本已有 |
| `scripts/build.mjs` | 改写 | external 增加 `@deepseek-ai/schemastery`（host 侧用到） |
| `tests/text.test.mjs` | 新写 | `stripAiFiller` / `parseRefineResult` / `parseSummaryJson` |
| `tests/skills.test.mjs` | 新写 | kebab 校验、frontmatter 三字段、description 兜底链与空值拒导、同名冲突、过期判定 |
| `tests/settings.test.mjs` | 新写 | 无 provider 时的默认值兜底、patch 合并、非法值拦截（**规格测试清单未列，属新增：设置是 P3 的新增面，必须有回归网**） |

**不在本计划内：** `src/client/**` 与 6 个插槽（P4+）、`SkillExportModal` 与过期徽标 UI（P7）、`workspaces.pickDirectory()` 客户端调用（P6）、`src/host/text.ts`（仍无消费者：导入接收**已解析**对象，不碰原始文本/BOM）。

---

## 设计决策

| # | 决策 | 理由 |
| --- | --- | --- |
| **P3-D1** | 设置走**宿主 `settings` 服务**（§13.6，用户已认可调研结论）：`registerSettings(scope)` 把 scope 存进模块级引用（与上游 `registerLlm` 同款模式），路由直接 `getSettings()` | 同时满足规格 §4.2（落在 `settings.yaml` 的 `prompt-enhancer` 命名空间）与 §6.5（不需要 js-yaml）；宿主只 patch 我们的段，不会像上游那样毁掉其它插件与注释 |
| **P3-D2** | `settings.ts` 依赖**注入的 scope 接口**（最小面：`get()` / `update(patch)`），而不是直接吃 `ctx` | 设置是 P3 新增面，必须有单测；跑 `node --test` 时没有宿主，用假 scope 就能覆盖默认值兜底、patch 合并、非法值 |
| **P3-D3** | 设置写入后**清 AI 路由缓存**（路由层显式调 `clearRouteCache()`） | 规格 §6.2 已把「上游 `PUT /settings` 不清缓存」列为待修缺陷 |
| **P3-D4** | 单条 `prefix` 路由 `/api/prompt-enhancer`，内部手写 `method + path` 分发（移植上游 `routes.ts` 的分发机制） | 与上游一致、与生态一致；`webServer.register` 一次、卸载时一次 dispose |
| **P3-D5** | AI 函数把 `LlmRuntime` 作为**参数**传入；`registerLlm()` 只维护模块级引用供路由取用 | 上游即如此；使纯文本后处理可单测、网络调用绝不进 `node --test` |
| **P3-D6** | `/export/save`：校验 `dir` 是**已存在的绝对目录**，文件名由服务端生成（`prompt-enhancer-backup-<YYYYMMDD-HHmmss>.json`），拒绝相对路径与不存在目录，并把最终路径回给客户端 | 该角色以宿主身份写用户磁盘：不能让客户端指定任意文件名/穿越路径；服务端生成名字也顺带避免覆盖用户已有文件 |
| **P3-D7** | `/skills/export`：技能名必须过 `/^[a-z0-9]+(-[a-z0-9]+)*$/` 且 `description` 非空（走 summary → AI description → body 首行 → 标题的兜底链），否则**拒绝导出**并回明确错误；目标目录固定 `$DSH_HOME/skills/<name>/` | 规格 §6.5 的三个实测缺陷修正；kebab 校验同时阻断路径穿越（`../` 不可能通过该正则） |
| **P3-D8** | 技能目录归属判定：读 `$DSH_HOME/skills/<name>/SKILL.md` 的 frontmatter 之外，另用 `getPromptIdBySkillName`（遍历 store 里 `skillName` 字段）判断「该目录是否属于本插件」 | 规格 §7.6「同名冲突确认」需要它；只用文件系统判断无法区分「我们导出的」与「用户手写的」 |
| **P3-D9** | 路由层**不写业务逻辑**：只做「解析请求 → 调 store/ai/skills → 组装信封 → 错误映射」 | 保证 26 条路由薄而一致；业务语义全部已在 P2 的 store 与 P3 的 ai/skills 中，且各有测试 |
| **P3-D10** | 统一错误映射：`ApiResponse` 一律 `{ ok, data?, error? }`；参数错误 400、未找到 404、AI 不可用 503、未预期异常 500（且 `console.error` 打印堆栈） | 规格 §5 的信封契约；「错误可见」是全局规则 |
| **P3-D11** | `@deepseek-ai/dsh-llm` 与 `@deepseek-ai/schemastery` 声明为 **optional peer**（`peerDependenciesMeta.optional = true`），`@deepseek-ai/cordis` 保持必需 | schemastery 不在 web profile 的依赖树里（只在共享 `profiles/node_modules`）：若声明为**必需** peer，pnpm 默认的 `auto-install-peers` 会去 registry 拉一个**版本可能与宿主不同**的副本——既是一次供应链事件（用户对此敏感），也会造成「两份 schemastery」的隐患。声明为 optional 的语义正是「宿主提供、缺失可降级」，与我们既定的降级行为（无 settings → 默认值；无 llm → 503）一致。上游正是用 optional 标记 `dsh-llm` |

---

## 任务 1：依赖与装配骨架

- [ ] **步骤 1：`package.json` 增 `peerDependencies`**（对齐上游做法：宿主提供，不打包）

```json
"peerDependencies": {
  "@deepseek-ai/cordis": "*",
  "@deepseek-ai/dsh-llm": "*",
  "@deepseek-ai/schemastery": "*"
},
"peerDependenciesMeta": {
  "@deepseek-ai/dsh-llm": { "optional": true },
  "@deepseek-ai/schemastery": { "optional": true }
}
```

> 两个 optional 是必须的（P3-D11）：`@deepseek-ai/schemastery` 不在 web profile 的依赖树里，声明为必需 peer 会让 pnpm 的 `auto-install-peers` 去 registry 拉一个副本。

- [ ] **步骤 2：`scripts/build.mjs` 的 external 增 `@deepseek-ai/schemastery`、`@deepseek-ai/dsh-settings`**
- [ ] **步骤 3：`src/index.ts` 改写为四段装配**，shape 与规格 §3.2 一致，只多 settings 一段：

```ts
export const name = "prompt-enhancer";
export const inject: string[] = [];

export function apply(ctx: Context): void {
  ctx.inject(["settings"], (settingsCtx) => {
    registerSettings(settingsCtx.settings.register("prompt-enhancer", PromptEnhancerSettingsSchema));
    return () => registerSettings(undefined);
  });
  ctx.inject(["llm"], (llmCtx) => {
    registerLlm(llmCtx.llm);
    return () => registerLlm(undefined);
  });
  ctx.inject(["webServer"], (httpCtx) => {
    httpCtx.effect(() => {
      const routes = makeRoutes();
      const disposers = routes.map((r) => httpCtx.webServer.register(r));
      return () => { for (const d of disposers) d(); };
    }, "prompt-enhancer: routes");
  });
}
```

- [ ] **步骤 4：验证**：`npm run typecheck` + `npm run build` + `npm run smoke` 全绿（此时 `makeRoutes` 等尚不存在，本步骤先只改清单与 external，装配留到任务 6）
- [ ] **步骤 5：提交**：`chore: declare host peer dependencies and schemastery external`

---

## 任务 2：设置模块（+ 单测）

**文件：** 新建 `src/host/settings.ts`、`tests/settings.test.mjs`

- [ ] **步骤 1：写 schema 与 scope 抽象**

```ts
import z from "@deepseek-ai/schemastery";
import { DEFAULT_SETTINGS, type PluginSettings } from "../types.ts";

/** 最小依赖面：宿主 SettingsScope 的 get/update 子集（便于单测注入假实现）。 */
export interface SettingsScopeLike {
  get(): unknown;
  update(patch: object): Promise<void> | void;
}

export const SETTINGS_NAMESPACE = "prompt-enhancer";

export const PromptEnhancerSettingsSchema = z.object({ /* 规格 §4.2 的 13 个键，逐字带默认值 */ });

export function registerSettings(scope: SettingsScopeLike | undefined): void;
export function getSettings(): PluginSettings;          // 无 scope / 值缺失 → DEFAULT_SETTINGS 深拷贝
export async function updateSettings(patch: Partial<PluginSettings>): Promise<PluginSettings>;
```

- [ ] **步骤 2：单测（含负样本）**
  - 无 scope 时 `getSettings()` 必须等于 `DEFAULT_SETTINGS`（且**返回副本**：改返回值不得污染默认值）
  - scope 返回缺字段/`undefined`/非法类型时，逐字段回落默认值
  - `updateSettings({panelWidth: 500})` 只改该字段，其余保持
  - 无 scope 时 `updateSettings` 必须**拒绝并可见报错**（不得静默丢弃用户设置）
- [ ] **步骤 3：验证** `npm test`；**步骤 4：提交** `feat(settings): host settings service binding with schema and fallbacks`

---

## 任务 3：AI 文本后处理与 refine（先写测试）

**文件：** 新建 `tests/text.test.mjs`、`src/host/refine.ts`

- [ ] **步骤 1：写 `tests/text.test.mjs`（红灯）**，覆盖规格 §9.1：
  - `stripAiFiller`：剥 ``` 代码围栏；剥首尾各最多 6 行中英套话（「好的，以下是…」「Sure, here is…」）；**正文内部的围栏与空行不得被误删**
  - `parseRefineResult`：合法 JSON → `{title, tags, summary, body}`；缺字段 → 兜底；非 JSON / 夹带解释文字 → 返回 `undefined`（不得抛）
  - `parseSummaryJson`：同上口径
- [ ] **步骤 2：跑出红灯**：`npm test`
- [ ] **步骤 3：搬 `src/host/refine.ts`**（上游原文）并实现 `stripAiFiller` / `parseSummaryJson`（落在 `ai.ts`，任务 4）
- [ ] **步骤 4：提交**：`test(ai): add failing specs for AI text post-processing`

---

## 任务 4：AI 模块移植

**文件：** 新建 `src/host/ai.ts`

- [ ] **步骤 1：移植这 6 个导出**（规格 §6.1），全部把 `LlmRuntime` 作参数（P3-D5）：

| 导出 | 行为 |
| --- | --- |
| `registerLlm(runtime \| undefined)` | 存模块级引用 + `clearRouteCache()` |
| `listAiSelectables()` | `listProviders()` × `listModels()` → `[{provider, name, models:[{id,name}]}]` |
| `polishPromptBody(body, settings, { keepVariables })` | 单次 `collectText`，返回 `string \| undefined` |
| `polishPromptBodyWithSummary(body, settings, opts)` | 润色 + 用途摘要 → `{ polished, summary? }` |
| `refinePrompt(body, settings)` | 一键完善 → `{ title, tags, summary, body } \| undefined`（用 `parseRefineResult`） |
| `generateSkillDescriptor(prompt, settings)` | → `{ name, description, whenToUse }`（**三字段全部返回**，修上游丢弃缺陷） |

- [ ] **步骤 2：搬运调用层**（规格 §6.2）：`collectText`（`system` 走 `GenerateOptions.system`、`maxTokens 2048`、`temperature 0.4`、`AbortSignal.timeout(30_000)`）+ `BlockAssembler`；`collectTextWithFallback` 按候选路由轮询；`withLlmLock` 全局串行；`resolveCandidates`（手动 provider/model 先校验可用 → 否则遍历全部 provider，优先 id 匹配 `/chat|deepseek/i` 的模型；30s TTL 缓存）
- [ ] **步骤 3：只保留规格 §6.3 的 4 组提示词模板**（润色 system/user、用途摘要 system/user、一键完善 system/user），模板原文取上游 `ai.ts`（分析报告 §4 已 100% 摘录），**删掉其中的人格注入段**
- [ ] **步骤 4：搬运输出后处理**（`stripAiFiller` / `parseSummaryJson` / `parseRefineResult`）→ 任务 3 的测试转绿
- [ ] **步骤 5：日志**：`$DSH_HOME/prompt-enhancer/log/ai-YYYY-MM-DD.log`，**仅在 `__DEV__` 时写**；失败一律返回 `undefined`，由路由转 503
- [ ] **步骤 6：验证**：`npm test`（text 用例转绿）+ `npm run typecheck`
- [ ] **步骤 7：提交**：`feat(ai): port LLM routing, prompts and output post-processing`

---

## 任务 5：技能导出（+ 单测）

**文件：** 新建 `src/host/skills.ts`、`tests/skills.test.mjs`

- [ ] **步骤 1：实现**（规格 §6.5，只导出）：

```ts
export const SKILL_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export function normalizeSkillName(raw: string): string | undefined;   // kebab 化 + 校验，非法返回 undefined
export function resolveDescription(prompt, descriptor?): string | undefined; // summary → AI description → body 首行 → 标题
export function renderSkillFile(input): string;                          // frontmatter(name/description/whenToUse) + 正文原样
export function exportSkill(input): { ok: boolean; path?: string; error?: string };
export function skillTargetPath(name: string): string;                   // $DSH_HOME/skills/<name>/SKILL.md
```

- [ ] **步骤 2：单测（含负样本）**
  - 名字校验：`"Weekly Report"` → `weekly-report`；`"../evil"`、`"a/b"`、`""`、`"A_B"` **必须拒绝**（路径穿越防护）
  - frontmatter **三字段齐全**（含 `whenToUse`；AI 没给时省略该行但 name/description 必有）
  - description 兜底链：只有 summary → 用 summary；只有正文 → 用首行；全空 → **拒绝导出**并回明确错误（负样本：空 description 必须拒）
  - 同名冲突：目标目录已存在且**不属于本插件任何提示词** → 返回 `conflict: true`（由路由决定是否弹确认）
  - 过期判定：`updatedAt > skillExportedAt` → `stale: true`
  - 写盘用 `mkdtemp` 临时 `DSH_HOME`，断言文件内容与 frontmatter 逐字
- [ ] **步骤 3：验证** `npm test`；**步骤 4：提交** `feat(skills): one-way skill export with kebab and description guards`

---

## 任务 6：26 条路由

**文件：** 新建 `src/host/routes.ts`

- [ ] **步骤 1：移植分发机制**（上游 `routes.ts:90-234`）：`PREFIX = "/api/prompt-enhancer"`，从 `req.url` 取 pathname + query，`req.method` + `tail` 手写 `if` 链分发；`json(res, status, envelope)` 工具；统一 `try/catch` → 500（并 `console.error` 打印堆栈）
- [ ] **步骤 2：按规格 §5 实现 26 条路由**（业务逻辑全部委托 store/ai/skills/settings）：

| 分组 | 路由 | 说明 |
| --- | --- | --- |
| prompts | `GET /prompts`（`q`/`tag`/`sort`）、`POST /prompts`、`GET /prompts/:id`、`PUT /prompts/:id`、`DELETE /prompts/:id`、`POST /prompts/:id/use`、`POST /prompts/:id/rollback` | `PUT` 的 body 支持 `aiWriteBack` 直通 store 的第三参；`POST /prompts` 后按 `settings.maxPromptCount` 调 `enforceMaxCount` |
| tags | `GET /tags`、`POST /tags`、`PUT /tags/:name`、`DELETE /tags/:name` | 删除在用标签 → 400 + `inUse` 用量 |
| trash | `GET /trash`、`POST /trash/:id/restore`、`DELETE /trash/:id`、`DELETE /trash` | `DELETE /trash` 清空 |
| AI | `GET /ai/providers`、`POST /ai/polish`、`POST /ai/refine` | 无 llm 服务或调用失败 → 503 + 可读原因 |
| settings | `GET /settings`、`PUT /settings` | `PUT` 后调 `clearRouteCache()`（P3-D3） |
| 导入导出 | `POST /export/save`、`POST /import` | 见 P3-D6/D9；`/import` 的 `confirm` 直通 store |
| meta | `GET /meta/:key`、`PUT /meta/:key` | 模板变量记忆 |
| 技能 | `POST /ai/skill-descriptor`、`POST /skills/export` | 导出成功后回写 `skillName` / `skillExportedAt` |

- [ ] **步骤 3：`makeRoutes()` 返回单条 `{ kind: "prefix", path: PREFIX, handler }`**
- [ ] **步骤 4：`src/index.ts` 接上 `makeRoutes()`**（任务 1 已留位）
- [ ] **步骤 5：验证**：`npm run typecheck` + `npm run build` + `npm run smoke` + `npm test` 全绿
- [ ] **步骤 6：提交**：`feat(routes): add the 26-route host API surface`

---

## 任务 7：活宿主 E2E（M3 验收，用运行时注入）

> 本步骤**不需要写 profile、不需要重启 `dsh web`**：用 super-injector 热重载已注入的本插件（P1 已建立该通道并修好其骨架门）。

- [ ] **步骤 1：构建并热重载**：`npm run build:dev` → `dev_reload_package dsh-prompt-enhancer`，确认 before/after 均 `active` 且 `client ✓`
- [ ] **步骤 2：逐条 curl 26 条路由**，断言：HTTP 状态符合预期、body 是合法 `{ok:true,data}` 或 `{ok:false,error}`
  - 每条路由至少 1 个正样本 + 1 个负样本（如 `GET /prompts/不存在` → 404；`PUT /settings` 非法值 → 400；`DELETE /tags/在用标签` → 400 + `inUse`）
  - **AI 路由只做 1 次最小真实调用**（`POST /ai/polish`，短正文）以证明链路通，其余 AI 路由用「无 llm 时不崩、返回 503」的方式覆盖
- [ ] **步骤 3：验证副作用**：`GET /settings` 能读回 `PUT /settings` 写入的值，且 `$DSH_HOME/settings.yaml` 里出现 `prompt-enhancer:` 段、**其它命名空间未被改动**（与写入前逐字节比对同名段）
- [ ] **步骤 4：验证技能导出**：`POST /skills/export` → 断言 `$DSH_HOME/skills/<name>/SKILL.md` 存在且 frontmatter 三字段齐；再改提示词 → `GET /prompts/:id` 的 `updatedAt > skillExportedAt`（过期判定就绪）
- [ ] **步骤 5：记录验收结论**到本文件末尾（命令、实际输出摘要、失败项若有）
- [ ] **步骤 6：提交**：`test(routes): record live-host acceptance for the 26 routes`

---

## 完成标准

- 26 条路由在**活宿主**上逐条 curl 通过（正/负样本都有），全部返回合法信封
- `npm test` 全绿（text / skills / settings / store / formats / migration 六个文件），且**新增负样本都经过变异验证**
- `npm run typecheck` / `build` / `smoke` 全绿
- 无新增运行时依赖；`package.json` 只多了 peerDependencies
- `$DSH_HOME/settings.yaml` 的其它命名空间在 `PUT /settings` 前后**逐字节不变**
- 技能导出拒绝非法名与空 description 的能力有**可复现的负样本**
- 插件仍未注册任何 systemPrompt section

## 风险

| # | 风险 | 应对 |
| --- | --- | --- |
| R-P3-1 | 设置服务在部分 profile 可能不存在（如 headless/测试环境） | `ctx.inject(["settings"])` 是条件注入，缺失时 `getSettings()` 回落默认值、`PUT /settings` 返回 503（有可见错误），其余功能不受影响 |
| R-P3-2 | `/export/save` 以宿主身份写用户磁盘 | P3-D6：绝对路径 + 已存在目录 + 服务端生成文件名；拒绝相对路径与不存在目录；把最终路径回给客户端 |
| R-P3-3 | AI 路由真实调用消耗 token 且有 30s 超时 | 只做 1 次最小真实调用；其余用 503 路径覆盖；`withLlmLock` 串行避免并发放大 |
| R-P3-4 | 上游模板里残留人格注入段被误搬 | 任务 4 步骤 3 明确「只保留 4 组、删人格段」；审查 diff 时专查 system 模板 |
| R-P3-5 | 26 条路由手写分发易漏 `await` / 漏 return 导致响应悬挂 | 每条路由处理器统一 `async`、统一 `return json(...)`；E2E 步骤逐条 curl（悬挂会直接超时暴露） |
| R-P3-6 | 规格写「约 22 条」而实际 26 条 | 本计划按 §5 表逐项展开为 26；执行时若发现某条不该存在，回头改规格并记录 §13.x，**不得**为对齐数字而删功能 |

## 交接给 P4+

1. 客户端若要写设置，走 `PUT /settings`（不必直接碰 settings 服务）。
2. `GET /ai/providers` 的返回形状由 P4/P8 的设置页下拉直接消费。
3. 技能过期判定字段（`updatedAt` vs `skillExportedAt`）已就绪，P7 只做 UI。
4. P6 的导入导出 UI：导入走「客户端读文件 → 解析成对象 → `POST /import`」；导出走「选目录 → `POST /export/save`」（**不需要** `/fs/*` 路由）。
