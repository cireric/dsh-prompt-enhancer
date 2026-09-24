# 01 · Host 层 HTTP 路由与数据存储（裁剪施工图）

> **分析对象**：`_ref-dsh-prompt-library` v0.16.0（包名 `@sunjuntao/dsh-prompt-library`，MIT，main=`lib/index.js`，exports 另外暴露 `./client`）。
> **精读文件**：`src/host/routes.ts`(1176 行)、`store.ts`(1928 行)、`paths.ts`(75)、`events.ts`(73)、`ws.ts`(328)、`node-sqlite.ts`(43)、`text.ts`(8)、`bundle-doc.ts`(23)。
> **交叉核对**：`src/index.ts`(257)、`src/types.ts`(213)、`src/client/utils/api.ts`(615)、`src/client/utils/{ws,data-sync}.ts`、`src/host/{skills,session-prompts,persona-service,character,ai,session-scope,harness,update,refine}.ts` 的导入/调用点。
> **目标读者**：把本项目裁剪为 `dsh-prompt-enhancer` 的实现者。文中行号均为上述文件内的 1-based 行号。

---

## 0. 结论速览（先读这一段）

| 事实 | 结论 |
| --- | --- |
| HTTP 路由 | 全插件**只有 1 条 prefix 路由**：`/api/prompt-library`，由 `makePromptRoutes()` 返回（`routes.ts:363-1176`，`kind:"prefix"` 在 `routes.ts:1171`）。单函数内手写 `if` 链分发，共 **64 条**逻辑路由 |
| 路由注册点 | 唯一：`index.ts:80` 构造 → `index.ts:235-251` `ctx.inject(["webServer"], ...)` → `webServer.register(route)`（`index.ts:237`） |
| WS | 唯一：`dataChangedUpgradeRoute`（`events.ts:21-29`）→ `index.ts:245` `webServer.registerUpgrade`（宿主无该 API 时静默跳过，`index.ts:241-246`） |
| 数据存储 | **唯一一个 SQLite 文件** `~/.dsh/prompt-library/db/prompts.db`（`paths.ts:43-45`），**12 张表**，**零 FOREIGN KEY**；数组字段以 JSON 文本存 TEXT 列 |
| DB 初始化时机 | 懒初始化，首次调用 `getDb()`（`store.ts:38-224`）时建目录+建表+三种迁移+播种 |
| 设置存储 | `~/.dsh/settings.yaml` 的 `prompt-library` 命名空间（`paths.ts:52-58`，读写 `store.ts:1294-1396`），**不是**插件私有文件 |
| 磁盘路径常量 | 见 §5，共 7 个导出函数 + 1 个常量；其中 4 个只服务于"人格/会话技能/Skill" |
| WS 事件 | 通道 `/api/prompt-library/events`；消息 3 种：`data-changed` / `fill-draft` / `export-download`。**host 侧 v0.16.0 无任何调用点**（§4.4），裁剪可直接整层删除 |
| 可整块删除 | 路由：人格 9 + 会话技能 16 + 磁盘技能 11 + `/ai/intro` + `/ai/draft` = **37 条**；表：`personas`、`persona_scope_bindings`、`session_prompts`、`prompt_scope_bindings`、`session_scope_bindings`、`prompt_skill_links`、`usage_log`、`pl_prompt_versions` = **8 张**；另有整个 WS 层。详见 §6 |

---

## 1. 完整 HTTP 路由表

### 1.0 分发机制（读 `routes.ts:90-234, 363-1167`）

- 常量 `PREFIX = "/api/prompt-library"`（`routes.ts:90`）。
- 响应信封 `ApiResponse<T>`（`types.ts:66-73`）：`{ ok:boolean, data?:T, error?:string }`；统一 `json(res,status,body)`（`routes.ts:92-95`），Header `content-type: application/json; charset=utf-8`。
- `parseTail(req.url)`（`routes.ts:186-193`）：**先去 query**，再切掉 PREFIX，再 `split("/").filter(Boolean)` → `{ tail, segments }`。因此 `tail` 是**不含 query** 的路径，路径参数取自 `segments[]`，query 参数各自用 `new URLSearchParams(...)` 重解析（注意 `routes.ts:1154-1156` 的注释：`tail` 已丢 query，必须回到 `req.url` 取）。
- `promptId` 只在 `segments.length===2 && segments[0]==="prompts"` 时非空（`routes.ts:367`）。
- 请求体：`readJsonBody(req)`（`routes.ts:159-184`），**硬上限 1 MiB**（`CAP = 1 << 20`，`routes.ts:163`），超限 `reject` + `req.destroy()`；空体返回 `{}`；JSON 解析失败 `reject`。
- **错误约定**：所有未捕获异常落到 `routes.ts:1164-1166` → **HTTP 500 + `{ok:false,error:"internal error"}`**（原始错误被丢弃、不写日志）。因此 1 MiB 超限、DB 异常等一律表现为 500。
- 未命中 → `routes.ts:1163` **404 `no route ${method} ${tail}`**。
- 状态码使用面：`200`（绝大多数）、`201`（POST /prompts、POST /tags、POST /personas、POST /session-prompts）、`400`（入参/写盘/路径非法）、`404`（not found）、`500`（内部异常）、`503`（AI 不可用，仅 `/ai/polish`、`/ai/intro`、`/ai/draft`）。
- **分发是"顺序 if 链"**：新增/删除路由时必须保持更具体的 `tail` 判断在更泛的 `segments` 判断之前；`PUT /prompts/:id`（`388`）之前没有其它 `PUT` 分支，反之 `/session-prompts/:id` 的 `DELETE`（`992`）显式排除了 `bindings`/`active`/`session` 三个保留字。

---

### 1.1 提示词 CRUD（核心，必须保留）

| # | Method | Path | 行号 | 处理函数 | 请求体 | 响应 `data` | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | GET | `/` 或 `/prompts` | 371-377 | `listPrompts()` (`store.ts:660`) | — | `Prompt[]`（已排序） | 两者等价；根路径也返回列表 |
| 2 | POST | `/prompts` | 380-385 | `createPrompt(body)` (`store.ts:707`) | `{title,body,tags?}`，校验 `isInput`（`195-202`：title/body 必须 string） | `Prompt` | **201**；标签只保留 1 个；淘汰检查后台异步（`store.ts:747`）；写版本快照 v1 |
| 3 | PUT | `/prompts/:id` | 388-394 | `updatePrompt(id, body)` (`store.ts:756`) | `PromptPatch`（`types.ts:91-100`，`isPatch` 仅判 object，字段不白名单） | `Prompt` | 不存在 → 404 |
| 4 | DELETE | `/prompts/:id` | 397-401 | `deletePrompt(id)` (`store.ts:884`) | — | `{id}` | **软删除**：移入 `trash` 表（事务） |
| 5 | POST | `/prompts/:id` | 404-408 | `recordUsage(id)` (`store.ts:837`) | — | `Prompt` | 点击插入即调用；`usageCount+1`、`lastUsedAt`、追加 `usage_log` 行；不存在 → 404 |

`Prompt` 字段（`types.ts:6-31`）：`id,title,body,tags?,summary?,sourceBody?,aiRefined?,aiRefinedAt?,updatedAt,createdAt,usageCount,lastUsedAt`。

### 1.2 标签（核心，必须保留）

| # | Method | Path | 行号 | 处理函数 | 请求体 | 响应 `data` |
| --- | --- | --- | --- | --- | --- | --- |
| 6 | GET | `/tags` | 497-500 | `listTags()` (`store.ts:1182`) | — | `{name,count}[]`（count 降序，再按名字升序） |
| 7 | PUT | `/tags/:name` | 503-514 | `renameTag(from,to)` (`store.ts:1210`) | `{to:string}` | `{changed:number}` |
| 8 | DELETE | `/tags/:name` | 517-521 | `deleteTag(name)` (`store.ts:1254`) | — | `{changed:number}` |
| 9 | POST | `/tags` | 524-534 | `createTag(name)` (`store.ts:1171`) | `{name:string}` | `{name}`，**201** |

`segments[1]` 经 `decodeURIComponent`（`504`、`518`）。标签更新规则：**只保留 1 个标签**（`store.ts:716,776,1235`）——这是裁剪时需要知道的产品约束。

### 1.3 回收站（核心，必须保留）

| # | Method | Path | 行号 | 处理函数 | 请求体 | 响应 `data` |
| --- | --- | --- | --- | --- | --- | --- |
| 10 | GET | `/trash` | 537-540 | `listTrash()` (`store.ts:933`) | — | `TrashItem[]`（`deletedAt` 降序） |
| 11 | POST | `/trash/restore` | 753-758 | `restorePrompts(ids)` (`store.ts:949`) | `{ids:[]}` 或 `{promptIds:[]}`（`extractIds`，`221-234`） | `{restored:number}` |
| 12 | POST | `/trash/delete` | 761-766 | `deleteTrash(ids)` (`store.ts:998`) | 同上 | `{deleted:number}` |
| 13 | POST | `/trash/empty` | 769-772 | `emptyTrash()` (`store.ts:1022`) | — | `{deleted:number}` |

隐藏行为：`listTrash()` 每次调用会**先物理清除 `deletedAt < now-30d`** 的行（`store.ts:927,938`，`TRASH_RETENTION_MS`），即回收站自动过期只在这一个入口触发。

### 1.4 导入 / 导出（核心，必须保留）

| # | Method | Path | 行号 | 处理函数 | 请求体 | 响应 `data` |
| --- | --- | --- | --- | --- | --- | --- |
| 14 | GET | `/export` | 426-429 | `exportPrompts()` (`store.ts:1045`) | — | `PromptBackup` ＝ `{version:1,exportedAt,prompts:Prompt[]}`（`store.ts:1035-1039`），按 title 升序 |
| 15 | POST | `/export` | 432-442 | `exportPrompts(ids)` | `{ids?:string[]}`，空/缺省 = 全部 | `PromptBackup` |
| 16 | POST | `/export/save` | 447-487 | `exportPrompts(ids)` + `buildExportFile(format,...)`（`98-157`）+ `fs/promises.writeFile` | `{ids?:string[],format?:"json"/"csv"/"md"/"txt",dir?:string}` | `{count:number,filePath:string}` |
| 17 | POST | `/import` | 490-494 | `importPrompts(body)` (`store.ts:1063`) | `PromptBackup` 或裸数组 | `{imported,updated,skipped,items:[{title,status}]}` |

`/export/save` 细节（`routes.ts:444-487`）：
- 目标目录：`body.dir` 优先，否则 `downloadDir()`（`paths.ts:32-35`，Windows 取 `USERPROFILE/Downloads`）。
- 文件名 `prompt-library-YYYYMMDD.{json|csv|md|txt}`（`routes.ts:105`）；已存在时按 Windows 风格追加 ` (n)`（`471-474`）。
- `csv` 头 `title,body,tags,summary`，多行/引号按 RFC 转义，**前置 UTF-8 BOM**（`136`）；`tags` 用 `|` 连接（`132`）。
- `md` 用空行 + `---` 分隔；`txt` 用 `【标题】` + 24 个 `-` 分隔（`138-155`）。
- 未知 format → `400 {ok:false,error:"bad request"}`（`462`）；`mkdir/writeFile` 失败 → `400 write failed: <异常信息>`（`479-485`）。
- `importPrompts` 语义：按 id upsert；**缺 body 跳过**；缺 id 用 `randomUUID`；缺 title 用 `buildTitle(body)`（`store.ts:862-878`）；普通导入 `usageCount/lastUsedAt` **清零**，仅 `opts.keepUsage`（当前无路由传）保留（`store.ts:1135-1138`）。

### 1.5 插件级元数据 meta（核心保留；当前唯一调用方是模板变量记忆）

| # | Method | Path | 行号 | 处理函数 | 请求体 | 响应 `data` |
| --- | --- | --- | --- | --- | --- | --- |
| 18 | GET | `/meta/:key` | 411-414 | `getMetaValue(key)` (`store.ts:227`) | — | `{key,value:string}`（缺失 = 空串） |
| 19 | PUT | `/meta/:key` | 417-423 | `setMetaValue(key,value)` (`store.ts:239`) | `{value:string}`（非 string → 空串） | `{key,value}` |

客户端唯一使用者：`client/components/data/TemplateVariables.tsx:180,187,207`，key `pl:template-var-memory`（模板变量记忆）→ **属提示词增强功能，建议保留**。

### 1.6 AI 能力

| # | Method | Path | 行号 | 处理函数 | 请求体 | 响应 `data` | 归类 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 20 | GET | `/ai/providers` | 775-778 | `listAiSelectables()` (`ai.ts:282`) | — | `AiSelectable[]` ＝ `{provider,name,models:{id,name}[]}[]` | 保留（设置界面 AI 模型下拉） |
| 21 | POST | `/ai/polish` | 783-805 | `polishPromptBody` / `polishPromptBodyWithSummary` (`ai.ts:673/754`) | `{body:string,keepVariables?:boolean=true,withSummary?:boolean=false}` | `{polished}` 或 `{polished,summary?}` | **保留**（提示词润色核心） |
| 22 | POST | `/ai/intro` | 808-817 | `generateIntro(lang,settings)` (`ai.ts:788`) | `{lang?:"zh"/"en"}` | `{lines:string[]}` | **删**：浮动助手气泡已移除，全仓无调用方 |
| 23 | POST | `/ai/draft` | 821-847 | `generateDraft(kind,title,input,settings,lang)` (`ai.ts:1055`) | `{kind:"soul"/"skill",title,input?,lang?}` | `{content:string}` | **删**：唯一调用方是 PersonaManagerModal / PromptInjectPanel |

`/ai/polish` 失败返回 **503** `AI 不可用或优化失败，请确认已连接 LLM 服务`（`796`、`802`）；`withSummary=true` 走独立摘要提示词（`ai.ts:764-771`），摘要解析失败静默降级只返回 `polished`。

### 1.7 设置与版本

| # | Method | Path | 行号 | 处理函数 | 请求体 | 响应 `data` |
| --- | --- | --- | --- | --- | --- | --- |
| 24 | GET | `/settings` | 850-853 | `getSettings()` (`store.ts:1371`) | — | `PluginSettings`（`types.ts:166-195`） |
| 25 | PUT | `/settings` | 861-868 | `updateSettings(patch)` (`store.ts:1390`) | `Partial<PluginSettings>` | `PluginSettings`（合并后的全量） |
| 26 | GET | `/version` | 856-858 | `getVersionInfo()` (`update.ts:34`) | — | `{server:string,installed:string}` |

`PluginSettings` 14 个键与裁剪建议见 §6.4；注意 `dataManagementEnabled` 被 `PERSIST_EXCLUDED_KEYS`（`store.ts:1317-1319`）排除，**永不落盘、读回默认值**。

### 1.8 人格 personas（**整块可删**，9 条）

| # | Method | Path | 行号 | 处理函数 |
| --- | --- | --- | --- | --- |
| 27 | GET | `/personas` | 873-876 | `listPersonaViews()` (`persona-service.ts:80`) |
| 28 | GET | `/personas/scopes` | 879-881 | `listScopeTree()` (`persona-service.ts:225`) |
| 29 | GET | `/personas/scopes/sessions` | 884-886 | `listSessionScopeTree()` (`session-scope.ts:63`) |
| 30 | GET | `/personas/scopes/binding?path=` | 889-893 | `getPersonaForScopePath(path)` (`persona-service.ts:160`) |
| 31 | PUT | `/personas/scopes/binding` | 896-909 | `bindPersonaToScope(path,personaId)` (`persona-service.ts:148`)；body `{path,personaId}` |
| 32 | DELETE | `/personas/scopes/bindings/all` | 912-915 | `clearAllPersonaBindings()` (`session-prompts.ts:330`) → 返回 `{cleared:true}` |
| 33 | POST | `/personas` | 918-929 | `createPersonaWithSoul(name)` (`persona-service.ts:102`)，body `{name}`，**201** |
| 34 | PUT | `/personas/:id` | 932-953 | `updatePersonaWithContent(id,{name?,enabled?,content?})` (`persona-service.ts:111`)；`id==="default"` → 400 |
| 35 | DELETE | `/personas/:id` | 956-960 | `deletePersonaWithSoul(id)` (`persona-service.ts:129`) |

注意 `932-938`/`956` 的路由守护：`segments[1]` 不得为 `binding`/`scopes`。

### 1.9 磁盘技能 Skill / HARNESS（**整块可删**，11 条）

| # | Method | Path | 行号 | 处理函数 | 请求体 | 响应 `data` |
| --- | --- | --- | --- | --- | --- | --- |
| 36 | POST | `/skills/import` | 543-546 | `importSkillsFromDisk()` (`skills.ts:296`) | — | `SkillImportResult` |
| 37 | GET | `/skills/available` | 585-588 | `listAvailableSkills()` (`skills.ts:143`) | — | `SkillSource[]` |
| 38 | POST | `/skills/scan-dir` | 591-602 | `listSkillsFromDir(dir)` (`skills.ts:178`) | `{dir:string}` | `SkillSource[]` |
| 39 | POST | `/skills/parse` | 605-615 | `parseSkillRaw(text)` (`skills.ts:217`) | `{raw:string}` | `{title,body,summary}` |
| 40 | POST | `/skills/import/entries` | 618-632 | `importSkillEntries(entries)` (`skills.ts:237`) | `{entries:SkillEntry[]}`（`isSkillEntry`，`209-218`） | `{imported,updated,skipped,items,errors}` |
| 41 | GET | `/skills/export/project-cwd` | 635-638 | `resolveCurrentProjectCwd()` (`routes.ts:240-255`) | — | `{cwd:string/null}` |
| 42 | POST | `/skills/export/entries` | 645-680 | `exportPromptsAsSkills(entries,root?)` (`skills.ts:328`) | `{entries,scope?:"global"/"project",rootPath?}` | `SkillExportResult` |
| 43 | POST | `/skills/ai-describe` | 683-708 | `generateSkillDescriptor({title,body,summary?,tags?},settings)` (`ai.ts:985`) | 同左 | `{desc?:{name,description,whenToUse?}}` 或 `{fail:"no-llm"/"route"/"empty"/"parse"}` |
| 44 | GET | `/skills/harness/list` | 712-716 | `listHarnessSkillToggles(projectRoot)` (`skills.ts:463`) | — | `{items:HarnessSkillItem[],projectRoot:string/null}` |
| 45 | POST | `/skills/harness/toggle` | 719-731 | `setHarnessSkillToggle(id,enabled)` (`skills.ts:488`) | `{id:string,enabled:boolean}` | `{id,enabled}` |
| 46 | POST | `/skills/harness/delete` | 734-750 | `deleteHarnessSkill(id)` (`skills.ts:500`) | `{id:string}` | `{id}`，未找到 → 404 |

`exportPromptsAsSkills` 的落盘根目录：global → `~/.dsh/skills/<name>/SKILL.md`（`skills.ts:31`）；project → `<项目>/.dsh/skills/<name>/SKILL.md`（`routes.ts:677`）。project 且无 root 且解析不到 cwd → 400 中文错误（`670-675`）。

### 1.10 会话级技能 session-prompts（**整块可删**，16 条）

| # | Method | Path | 行号 | 处理函数（`session-prompts.ts` 除注明外） |
| --- | --- | --- | --- | --- |
| 47 | GET | `/session-prompts` | 965-967 | `listSessionPrompts()` (`:83`) |
| 48 | POST | `/session-prompts` | 970-975 | `createSessionPrompt({title,body,tags?})` (`:99`)，**201**；body 校验 `isInput` |
| 49 | PUT | `/session-prompts/:id` | 978-989 | `updateSessionPrompt(id,{title,body,tags,enabled})` (`:121`) |
| 50 | DELETE | `/session-prompts/:id` | 992-996 | `deleteSessionPrompt(id)` (`:148`) |
| 51 | GET | `/session-prompts/bindings` | 999-1001 | `listScopePromptBindings()` (`:190`) |
| 52 | GET | `/session-prompts/bindings/path?path=` | 1004-1008 | `getScopeBoundPromptIds(path)` (`:185`) → `{promptIds}` |
| 53 | PUT | `/session-prompts/bindings` | 1011-1021 | `setScopePromptBinding(path,promptIds)` (`:180`)；body `{path,promptIds}` |
| 54 | DELETE | `/session-prompts/bindings/all` | 1024-1027 | `clearAllSkillBindings()` (`:324`) → `{cleared:true}` |
| 55 | DELETE | `/session-prompts/bindings?path=` | 1030-1036 | `clearScopePromptBinding(path)` (`:195`) |
| 56 | GET | `/session-prompts/current-scope` | 1039-1041 | `getCurrentSessionScope()` (`:254`) → `{scope:string/null}` |
| 57 | GET | `/session-prompts/diag?sessid=` | 1046-1101 | 自包含诊断（`listSessionRecords`、`getActiveSessionCwd`、`getPersonaForSession`、`resolvePersonaForPath`、`resolvePersonaForSession`、`getSessionActivePromptIds`、`resolveSessionPromptBindingIds`、`getSessionPromptsByIds`） |
| 58 | GET | `/session-prompts/active?scope=` | 1104-1108 | `getSessionActivePromptIds(scope)` (`:234`) |
| 59 | PUT | `/session-prompts/active` | 1111-1121 | `setSessionActivePrompts(scope,promptIds)` (`:227`) |
| 60 | PUT | `/session-prompts/session/persona` | 1124-1137 | `setSessionPersonaBindingForSession(sessionId,personaId)` (`:266`) |
| 61 | PUT | `/session-prompts/session/prompts` | 1140-1150 | `setSessionPromptBindingForSession(sessionId,promptIds)` (`:261`) |
| 62 | DELETE | `/session-prompts/session?sessionId=` | 1153-1161 | `clearSessionBinding(sessionId)` (`:319`) |

路由 57 的响应结构（`routes.ts:1087-1100`）：`{sessid,cwd,personaId,personaName,personaSource:"session"/"path"/"default",promptIds,promptTitles,activeCount,checkedPaths:string[]}`。

### 1.11 目录浏览 fs（**保留**：提示词导出目录选择器也用它，共 34 行代码）

| # | Method | Path | 行号 | 处理函数 | 请求 | 响应 `data` |
| --- | --- | --- | --- | --- | --- | --- |
| 63 | GET | `/fs/list?path=` | 549-559 | `listFsDirectory(input?)` (`routes.ts:318-350`) | query `path`（相对路径基于 `homedir()`，`311-315`） | `DirListing` ＝ `{path,home,crumbs:DirEntry[],entries:DirEntry[],truncated}`（`272-279`），上限 `DIR_LIST_LIMIT=500`（`282`） |
| 64 | POST | `/fs/mkdir` | 562-582 | `createFsDirectory(parent,name)` (`routes.ts:353-361`) | `{path,name}` | `{path:string}` |

`DirEntry` ＝ `{name,path,hidden}`（`routes.ts:266-270`）；只列**目录**（含符号链接指向目录者，`328-335`），按 `localeCompare(...,{numeric:true})` 排序（`342`）。客户端另一个使用者 `client/utils/workspace-picker.ts:5-14,54-56` 会优先用宿主 `workspaces.listDirectory`，缺失时回退到这里。

### 1.12 兜底

| 情形 | 行号 | 响应 |
| --- | --- | --- |
| 未匹配任何分支 | 1163 | `404 {ok:false,error:"no route " + method + " " + tail}`（模板串：“no route ${method} ${tail}”） |
| 抛出任何异常 | 1164-1166 | `500 {ok:false,error:"internal error"}` |

---

## 2. SQLite 数据库 schema

### 2.1 文件路径与初始化时机

| 项 | 值 | 出处 |
| --- | --- | --- |
| DB 文件 | `~/.dsh/prompt-library/db/prompts.db`（`DSH_HOME` 可覆盖） | `paths.ts:43-45`，`store.ts:43` |
| 目录创建 | `mkdirSync(dirname(path),{recursive:true})` | `store.ts:44` |
| 打开方式 | `createDatabase(path)` → 惰性 `require("node:sqlite").DatabaseSync` | `node-sqlite.ts:41-43`（`node-sqlite.ts:14-25` 拦截 `SQLite is an experimental feature` 警告） |
| PRAGMA | `journal_mode = WAL; busy_timeout = 5000` | `store.ts:47` |
| 初始化时机 | **懒**：模块单例 `let db`（`store.ts:36`），首次调用任意真实数据函数时经 `getDb()`（`store.ts:38-224`）建表。`index.ts:140-142` 明确说明**不显式初始化**（避免 headless profile 触发副作用） | `store.ts:38-224`，`index.ts:140-142` |
| 进程内并发模型 | 单进程单连接串行（`store.ts:11` 注释），无连接池、无锁 | `store.ts:1-12` |
| 例外：5 个函数不触发初始化 | `getSkillNameForPrompt`(669)、`setSkillNameForPrompt`(678)、`getPromptIdBySkillName`(687)、`isPromptActive`(696)、`isPromptTrashed`(702) 都以 `if (!db) return ...` 早退，**不会创建 DB 文件** | `store.ts:669-705` |

### 2.2 表清单（逐表，DDL 行号 + 字段）

> 全部 DDL 集中在 `getDb()` 内，依次执行。**没有一张表声明 FOREIGN KEY / UNIQUE（除 PRIMARY KEY）/ CHECK**；数组一律以 JSON 文本存 TEXT。

**T1 `prompts`（`store.ts:49-61`，含后补列 62-74）** — 提示词主表

| 列 | 类型/约束 | 说明 |
| --- | --- | --- |
| `id` | TEXT PRIMARY KEY | UUID（`randomUUID`，`store.ts:718`） |
| `title` | TEXT NOT NULL | 写入前 `clampTitle` 截到 `TITLE_MAX_LEN=25`（`types.ts:76-81`） |
| `body` | TEXT NOT NULL | 正文 |
| `tags` | TEXT | JSON 字符串数组或 NULL；产品上只存 1 个 |
| `summary` | TEXT | AI 用途摘要 |
| `sourceBody` | TEXT | AI 改写前原文 |
| `aiRefined` | INTEGER NOT NULL DEFAULT 0 | 0/1 |
| `updatedAt` | INTEGER NOT NULL | epoch ms |
| `usageCount` | INTEGER NOT NULL DEFAULT 0 | |
| `lastUsedAt` | INTEGER NOT NULL DEFAULT 0 | |
| `createdAt` | INTEGER NOT NULL DEFAULT 0 | **后补列**：`ALTER TABLE ADD COLUMN`（`64`），随后 `UPDATE ... SET createdAt=updatedAt WHERE createdAt=0`（`65`） |
| `aiRefinedAt` | INTEGER NOT NULL DEFAULT 0 | **后补列**：`ALTER TABLE ADD COLUMN`（`71`），0 = 从未完善 |

无索引（列表读全表 `SELECT *`，`store.ts:625`）。

**T2 `usage_log`（`store.ts:78-83`）** — 使用历史（**只写不读**）

| 列 | 约束 |
| --- | --- |
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT |
| `promptId` | TEXT NOT NULL（**无外键**） |
| `usedAt` | INTEGER NOT NULL |

索引：`idx_usage_log_usedAt ON usage_log(usedAt)`（`store.ts:84`）。写入点仅 `recordUsage`（`store.ts:845`）；**全仓无 SELECT** → 裁剪时可删表 + 删那一行 INSERT。

**T3 `tags`（`store.ts:87-90`）** — 标签字典

| 列 | 约束 |
| --- | --- |
| `name` | TEXT PRIMARY KEY |
| `createdAt` | INTEGER NOT NULL |

**T4 `trash`（`store.ts:94-107`）** — 回收站（`prompts` 的宽表副本 + `deletedAt`）

列：`id`(PK)、`title`、`body`、`tags`、`summary`、`sourceBody`、`aiRefined`(DEFAULT 0)、`updatedAt`、`usageCount`(0)、`lastUsedAt`(0)、`createdAt`(0)、`deletedAt`(NOT NULL)。无索引（`ORDER BY deletedAt DESC` 全表扫，`store.ts:940`）。

**T5 `meta`（`store.ts:111-114`）** — KV 表

列：`key`(TEXT PK)、`value`(TEXT，可 NULL)。已知键：
- `welcomeShown`＝`"1"`（首次欢迎，`store.ts:351,366`）
- `pl:default-persona-soul`（默认人格正文，`store.ts:1581`）— **人格功能**
- `pl:harness-skill-toggles`（JSON 映射，`skills.ts:375`）— **Skill 功能**
- `session-prompts-seeded`＝`"1"`（`session-prompts.ts:433,435,442`）— **会话技能功能**
- 路由 `/meta/:key` 写入的任意键，实际使用 `pl:template-var-memory`（客户端）

**T6 `prompt_skill_links`（`store.ts:119-123`）** — 提示词与技能名关联（**Skill 功能，可删**）

列：`promptId`(TEXT PK)、`skillName`(TEXT NOT NULL)、`updatedAt`(INTEGER NOT NULL)。反查 `skillName → promptId` 无索引（全表扫，`store.ts:690`）。

**T7 `personas`（`store.ts:128-135`）** — 人格（**可删**）

列：`id`(PK)、`name`(NOT NULL)、`enabled`(INTEGER DEFAULT 1)、`createdAt`、`updatedAt`、`body`(TEXT NOT NULL DEFAULT ''，**后补列** `139`)。

**T8 `persona_scope_bindings`（`store.ts:147-151`）** — 路径→人格（**可删**）

列：`path`(TEXT PK)、`personaId`(TEXT NOT NULL)、`updatedAt`(INTEGER NOT NULL)。解析规则"最深祖先/相等匹配"（`store.ts:144`，实现于 `persona-service.ts:170-193`）。

**T9 `prompt_scope_bindings`（`store.ts:156-160`）** — 路径→会话技能 id 列表（**可删**）

列：`path`(TEXT PK)、`promptIds`(TEXT NOT NULL，JSON 数组文本)、`updatedAt`(INTEGER NOT NULL)。

**T10 `session_prompts`（`store.ts:164-174`）** — 会话级技能（**可删**）

列：`id`(PK)、`title`(NOT NULL)、`tags`(TEXT JSON)、`enabled`(INTEGER DEFAULT 1)、`createdAt`、`updatedAt`、`usageCount`(DEFAULT 0)、`lastUsedAt`(DEFAULT 0)、`body`(TEXT NOT NULL DEFAULT ''，**后补列** `178`)。

**T11 `session_scope_bindings`（`store.ts:186-191`）** — 会话 id→人格+技能（**可删**）

列：`sessionId`(TEXT PK)、`personaId`(TEXT，空串=未绑定)、`promptIds`(TEXT，JSON 数组)、`updatedAt`(INTEGER NOT NULL)。

**T12 `pl_prompt_versions`（`store.ts:195-206`）** — 提示词版本快照（**只写不读**）

| 列 | 约束 |
| --- | --- |
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT |
| `promptId` | TEXT NOT NULL |
| `version` | INTEGER NOT NULL（`MAX(version)+1`） |
| `title` / `body` | TEXT NOT NULL |
| `tags` / `summary` / `sourceBody` | TEXT |
| `reason` | TEXT NOT NULL DEFAULT 'update'（`"create"/"update"/"refine"`） |
| `snapshotAt` | INTEGER NOT NULL |

索引：`idx_pl_prompt_versions_prompt ON pl_prompt_versions(promptId, version)`（`store.ts:208`）。写入点：`createPrompt`（`749`）、`updatePrompt` 内容变更时（`824-826`）。**无任何读取/路由** → 可整表删除（连带 `snapshotPromptVersion`）。

### 2.3 迁移逻辑（按 `getDb()` 执行顺序）

| 顺序 | 名称 | 行号 | 触发/条件 | 行为 |
| --- | --- | --- | --- | --- |
| 1 | 列补建（prompts.createdAt） | 63-68 | `ALTER TABLE` 失败即忽略（列已存在） | 补列 + 回填 `createdAt=updatedAt WHERE createdAt=0` |
| 2 | 列补建（prompts.aiRefinedAt） | 69-74 | 同上 | 补列，DEFAULT 0 |
| 3 | 列补建（personas.body） | 138-142 | 同上 | 补列，DEFAULT '' |
| 4 | 列补建（session_prompts.body） | 176-181 | 同上 | 补列，DEFAULT '' |
| 5 | `syncTagsFromPrompts(cur)` | 437-461，调用点 210 | 每次初始化（幂等） | 事务扫 `prompts.tags` JSON，`INSERT OR IGNORE INTO tags`；全程 try/catch 静默 |
| 6 | `seedDefaultPromptIfEmpty(cur)` | 269-315，调用点 212 | 仅当 `COUNT(*) FROM prompts == 0` | 播种 1 条欢迎提示词（中/英按 `readUiLangSync()`，标签 `欢迎`/`Welcome`），然后 `syncTagsFromPrompts`。**注意 299 行注释：此处不得调 `ensureTag()`（会重入 `getDb()` 无限递归）** |
| 7 | **旧 JSON 迁移** `migrateLegacyJsonIfNeeded()` | 503-561，调用点 215（`void ...catch(()=>{})` 异步） | 文件 `~/.dsh/prompt-library/prompts.json` 存在 **且** `hasAnyPrompts()===false` | `JSON.parse(stripBom(text))` → `parsed.prompts[]` → 事务 `INSERT OR IGNORE`（字段级兜底：缺 title→''、缺 createdAt→updatedAt→0、`aiRefined` 布尔转 0/1）；成功后 `rm(legacy)` 删除旧文件（失败保留）。解析失败/无 prompts 数组则静默返回 |
| 8 | **旧 MD 正文迁移** `migrateMdContentToDb()` | 569-589，调用点 218-222（同步 try/catch） | 对应库内正文为空时 | (a) `character/SOUL.md` → meta `pl:default-persona-soul`；(b) `session-prompts/<id>.md` → `session_prompts.body`（遍历 `listSessionPromptRecords()`）。**原文件不删除**；单条失败静默 |

> 迁移顺序坑：`migrateLegacyJsonIfNeeded` 是 **async 且不 await**（`215`），而 `seedDefaultPromptIfEmpty` 是**同步且在它之前**（`212`）。旧 JSON 存在但 db 为空时，播种可能先写入数据，随后 `hasAnyPrompts()` 检查失败而**跳过 JSON 迁移**。裁剪时若保留 JSON 迁移，建议改为 await 或把种子判定放到迁移之后。

### 2.4 其它 SQL 细节

- 事务均用裸 `BEGIN/COMMIT/ROLLBACK`（`store.ts:444-457, 527-554, 890-917, 962-986, 1005-1014, 1099-1161, 1221-1246, 1264-1279`）。
- `listTags` 的 count 在 JS 侧统计（`store.ts:1187-1199`），不是 SQL 聚合。
- `enforceMaxCount(maxCount)`（`store.ts:640-658`）：`total > max` 时按 `usageCount` 升序再 `updatedAt` 升序淘汰，**物理 DELETE（不进回收站）**；由 `createPrompt` 以 `void getSettings().then(...)` 异步触发（`store.ts:747`），用 `s.maxPromptCount`（默认 100，`types.ts:201`）。
- 排序 `sortPrompts`（`store.ts:598-620`）：① 创建 <7 天（`FRESH_MS`，`596`）按 createdAt 降序置顶；② 其余中 usageCount 前 3 名；③ 余下按 updatedAt 降序、再 usageCount 降序。

---

## 3. `store.ts` 模块划分与导出清单

`store.ts` 单文件 1928 行，顶部分段注释：SQLite 连接与初始化（33）、行映射（374）、独立标签表（412）、回收站行映射（463）、旧 JSON 迁移（497）、设置存储（1287）、会话级技能（1398）、默认人格 SOUL（1578）、路径→技能绑定（1593）、人格（1660）、路径→人格绑定（1762）、会话绑定（1815）、版本历史（1893）。

### 3.1 非导出（内部）函数 — 共 21 个

| 函数 | 行号 | 职责 |
| --- | --- | --- |
| `getDb` | 38 | 懒初始化单例：建目录/PRAGMA/12 表/索引/迁移/播种 |
| `seedDefaultPromptIfEmpty` | 269 | 首启播种 1 条欢迎提示词 |
| `rowToPrompt` | 391 | `PromptRow` → `Prompt`（tags JSON.parse，`aiRefined===1`） |
| `tagsToJson` | 408 | `string[] → JSON 或 null`（空数组→null） |
| `ensureTags` | 426 | 批量 `ensureTag` |
| `syncTagsFromPrompts` | 437 | 把 prompts.tags 同步进 tags 表（幂等/事务） |
| `rowToTrash` | 480 | `TrashRow` → `TrashItem` |
| `migrateLegacyJsonIfNeeded` | 503 | 旧 `prompts.json` → SQLite，成功后删旧文件 |
| `migrateMdContentToDb` | 569 | 旧 SOUL.md / session-prompts/*.md → DB |
| `sortPrompts` | 598 | 列表排序（新→热→旧） |
| `findAll` | 623 | `SELECT * FROM prompts` 未排序 |
| `hasAnyPrompts` | 630 | `EXISTS(SELECT 1 FROM prompts)` |
| `enforceMaxCount` | 640 | 超上限淘汰（物理删除） |
| `buildTitle` | 862 | 无 AI 时从正文抽标题 |
| `readSystemSettingsNamespace` | 1294 | 读 settings.yaml 的 `prompt-library` 命名空间 |
| `stripPersistExcluded` | 1322 | 剔除 `PERSIST_EXCLUDED_KEYS` |
| `writeSettingsRaw` | 1336 | 读整份 settings.yaml → 只替换自己命名空间 → `dump` 写回 |
| `readSettingsRaw` | 1355 | 合并 `DEFAULT_SETTINGS`；命名空间缺失时落盘初始化 |
| `sessionPromptFromRow` | 1416 | 会话技能行映射 |
| `parsePromptIds` | 1607 | JSON 数组文本 → string[] |
| `personaFromRow` | 1674 | 人格行映射 |

### 3.2 导出函数清单（按功能分组，★=提示词核心必须保留，✗=可删）

**A. meta / 语言（★）**

| 导出 | 行号 | 说明 | 裁剪 |
| --- | --- | --- | --- |
| `getMetaValue(key)` | 227 | 读 meta KV，异常回空串 | ★ |
| `setMetaValue(key,value)` | 239 | upsert meta KV | ★ |
| `readUiLangSync()` | 255 | 同步读 `settings.yaml` 的 `locale.preference` → `"zh" 或 "en"`（默认 zh） | ★（播种/文案需要） |
| `welcomePromptOnce(scope)` | 342 | 首次欢迎：读写 meta `welcomeShown`，进程内 `welcomeBound` 缓存 | 可选删（属会话注入，非提示词库） |

**B. 提示词 CRUD（★）**

| 导出 | 行号 |
| --- | --- |
| `listPrompts()` | 660 |
| `createPrompt({title,body,tags?,summary?})` | 707 |
| `updatePrompt(id, patch)` | 756 |
| `recordUsage(id)` | 837 |
| `deletePrompt(id)` | 884 |
| `ensureTag(name)` | 415 |

**C. 标签（★）**：`createTag`(1171)、`listTags`(1182)、`renameTag`(1210)、`deleteTag`(1254)

**D. 回收站（★）**：`listTrash`(933)、`restorePrompts`(949)、`deleteTrash`(998)、`emptyTrash`(1022)

**E. 导入导出（★）**：`exportPrompts`(1045)、`importPrompts`(1063)、`PromptBackup` 接口(1035)

**F. 设置（★）**：`getSettings`(1371)、`updateSettings`(1390)、`readGlobalLocale`(1379，读 `locale.preference`，供 AI 提示词语言)

**G. 提示词与技能名关联（✗ Skill 功能）**：`getSkillNameForPrompt`(669)、`setSkillNameForPrompt`(678)、`getPromptIdBySkillName`(687)、`isPromptActive`(696)、`isPromptTrashed`(702)

**H. 版本历史（✗ 只写不读）**：`snapshotPromptVersion`(1899)

**I. 会话级技能（✗ SessionPrompt 功能）**：`SessionPromptRecord` 接口(1402)、`listSessionPromptRecords`(1450)、`getSessionPromptRecord`(1474)、`createSessionPromptRecord`(1500)、`updateSessionPromptMeta`(1525)、`deleteSessionPromptRecord`(1572)

**J. 默认人格 SOUL（✗ 人格功能）**：`getDefaultPersonaSoul`(1584)、`setDefaultPersonaSoul`(1589)

**K. 路径→技能绑定（✗ 会话技能功能）**：`setScopePromptBinding`(1596)、`getScopeBoundPromptIds`(1617)、`listScopePromptBindings`(1629)、`clearScopePromptBinding`(1643)、`clearAllScopePromptBindings`(1652)

**L. 人格 CRUD/绑定（✗ 人格功能）**：`PersonaRecord` 接口(1663)、`listPersonas`(1693)、`getPersona`(1705)、`createPersona`(1719)、`updatePersonaMeta`(1729)、`deletePersona`(1749)、`setScopePersonaBinding`(1765)、`getScopeBoundPersonaId`(1775)、`listScopeBindings`(1787)、`clearScopePersonaBinding`(1798)、`clearAllScopePersonaBindings`(1807)

**M. 会话绑定（✗ 人格+技能功能）**：`setSessionScopeBinding`(1818)、`getSessionScopeBinding`(1833)、`listSessionScopeBindings`(1848)、`clearSessionScopeBinding`(1867)、`clearAllSessionPromptBindings`(1876)、`clearAllSessionPersonaBindings`(1885)

**导出合计**：A 4 + B 6 + C 4 + D 4 + E 3 + F 3 + G 5 + H 1 + I 6 + J 2 + K 5 + L 11 + M 6 = **60 个导出**（含 4 个 interface）。其中 ★ 必须保留 **23** 个（A 组 3 + B 6 + C 4 + D 4 + E 3 + F 3），✗ 可删 **36** 个（G 5 + H 1 + I 6 + J 2 + K 5 + L 11 + M 6），A 组 `welcomePromptOnce` 为可选删（1 个）。

### 3.3 依赖（import）一览（`store.ts:13-31`）

`node:fs/promises`(readFile,rm,writeFile)、`node:fs`(mkdirSync,readFileSync)、`node:path`(dirname)、`node:crypto`(randomUUID)、`./node-sqlite.js`(createDatabase)、`node:sqlite`(类型 DatabaseSync)、**`js-yaml`(load,dump) ← 唯一第三方运行时依赖**、`../types.js`(PluginSettings,Prompt,TrashItem,clampTitle,DEFAULT_SETTINGS,TITLE_MAX_LEN)、`./paths.js`(dbPath,sessionPromptPath,SETTINGS_NAMESPACE,soulPath,storePath,systemSettingsPath)、`./text.js`(stripBom)。

---

## 4. WS 事件（`events.ts` / `ws.ts`）

### 4.1 传输层 `ws.ts`（零依赖自研 RFC6455 子集）

| 项 | 值 | 行号 |
| --- | --- | --- |
| 导出 | `WsSession` 接口(35)、`WsRouteOptions` 接口(54)、`createWsRoute(options)`(107) | 35/54/107 |
| 依赖 | `node:crypto` 的 `createHash`、`@deepseek-ai/dsh-host-webserver` 类型 `WebUpgradeRoute` | 14-17 |
| 握手 | 校验 `upgrade: websocket` + `sec-websocket-key`，否则 `400 Bad Request` 关闭；成功回 `101 Switching Protocols` + `Sec-WebSocket-Accept` | 110-122 |
| 帧支持 | TEXT/BINARY/CONTINUATION/PING/PONG/CLOSE；客户端帧必须带掩码，服务端帧不带 | 193-278 |
| 载荷上限 | `MAX_PAYLOAD_BYTES = 16 MiB`（超限直接 destroy） | 22, 220-230 |
| 心跳 | 默认 `DEFAULT_HEARTBEAT_MS = 15000`（`heartbeatMs:0` 关闭）；`3x` 周期无任何数据（含 pong）即断开；定时器 `unref()` | 24, 134, 293-309 |
| 关闭 | close 码 `1000`（字节 `0x03 0xe8`） | 154 |
| `WsSession` 成员 | `send(text)`、`close()`、`onMessage(listener)`、`onClose(listener)`、`closed`、`req` | 137-170 |

### 4.2 通道与广播

| 项 | 值 | 出处 |
| --- | --- | --- |
| 唯一通道 | `ws(s)://<host>/api/prompt-library/events`（upgrade 精确路径） | `events.ts:4,15,22`；客户端 `client/utils/ws.ts:13` |
| 注册 | `index.ts:245` `server.registerUpgrade(dataChangedUpgradeRoute)`；宿主无 `registerUpgrade` 时静默跳过（`index.ts:241-246`） | — |
| 在线集合 | 模块级 `const clients = new Set<WsSession>()`（`events.ts:18`），`onOpen` 加入、`onClose` 移除（`events.ts:23-28`） | — |
| 广播实现 | `broadcast(message)`（`events.ts:35-52`）：`JSON.stringify` 后逐个 `session.send`；已关闭/抛错者从集合剔除；返回成功条数 | — |
| 客户端 | 单例连接 + 重连退避 1s→10s（`client/utils/ws.ts:14-16,38-94`），`subscribePush(listener)` 注册监听；连接常驻不随取消订阅关闭 | `client/utils/ws.ts:96-107` |

### 4.3 消息类型（信封 `{type, ...}`）

| `type` | 载荷 | host 发送函数 | 行号 | 客户端处理 |
| --- | --- | --- | --- | --- |
| `data-changed` | 无 | `emitDataChanged()` | `events.ts:55-57` | `data-sync.ts:27-30` → 派发 window 事件 `pl:data-changed` → `useDataChanged` 触发 reload |
| `fill-draft` | `{body:string}` | `emitFillDraft(body)` | `events.ts:63-65` | `data-sync.ts:31-37` → `pl:fill-draft` → `useFillDraft` 填入聊天草稿 |
| `export-download` | `{name:string, json:string}` | `emitExportDownload(name,json): boolean`（返回是否送达至少 1 个） | `events.ts:71-73` | `data-sync.ts:38-69` → 解析 `prompts.length` → Blob 触发浏览器下载 → `pl:export-downloaded` |

### 4.4 关键发现：三个 emit 函数在 v0.16.0 **无任何 host 调用点**

全仓检索 `emitDataChanged(` / `emitFillDraft(` / `emitExportDownload(` 的调用，**只命中定义处**（`events.ts:55/63/71`）。即：

- 数据变更不再由 host 广播；客户端改用同进程 window 事件 `notifyDataChanged()`（`data-sync.ts:15-17`）做同页同步，跨窗口/多页面板不再同步。
- `/ai/polish` 改为**同步 HTTP 返回** polished（`routes.ts:798,804`），不再走 `fill-draft` 推送（这正是 `AIPolishButton.tsx:106` 里"兜底监听"的含义）。
- 导出改为 `POST /export/save` 由后端写盘（`routes.ts:447-487`），不再走 `export-download` 推送。

**裁剪结论**：WS 层（`ws.ts` 328 行 + `events.ts` 73 行 + `index.ts:245` + 客户端 `utils/ws.ts` 与 `data-sync.ts` 的订阅部分）可**整体删除**，仅需保留客户端同页事件（或一并删掉）。若追求最小改动且保留客户端 WS 监听代码，则保留 `events.ts` 的 `dataChangedUpgradeRoute` 注册即可（成本约为 0，但不产生任何消息）。

---

## 5. `paths.ts`：磁盘路径与设置位置

| 导出 | 行号 | 返回值 | 使用者 | 裁剪 |
| --- | --- | --- | --- | --- |
| `dshHome()` | 20-22 | `process.env.DSH_HOME` 或 `~/.dsh` | `dataDir`、`workspaceStorePath`、`systemSettingsPath`、`skills.ts:31` | ★ |
| `downloadDir()` | 32-35 | `(USERPROFILE 或 homedir())/Downloads` | `routes.ts:465`（`/export/save` 默认目录） | ★ |
| `storePath()` | 38-40 | `~/.dsh/prompt-library/prompts.json`（**旧版 JSON，仅迁移读**） | `store.ts:504` | ★（迁移用；若不需兼容旧版可删） |
| `dbPath()` | 43-45 | `~/.dsh/prompt-library/db/prompts.db` | `store.ts:43` | ★ |
| `workspaceStorePath()` | 48-50 | `~/.dsh/storages/workspace.json`（宿主工作区清单） | 仅 `persona-service.ts:231-233` | ✗ 人格 |
| `systemSettingsPath()` | 53-55 | `~/.dsh/settings.yaml` | `store.ts:257,1297,1339,1348,1381` | ★ |
| `SETTINGS_NAMESPACE` | 58 | `"prompt-library"`（字符串常量） | `store.ts:1308,1347`；改名即改 settings.yaml 顶层 key | ★（建议**保留原名**以免用户设置丢失；改名需写迁移） |
| `logDir()` | 61-63 | `~/.dsh/prompt-library/log/`（按本机日期分文件 `ai-YYYY-MM-DD.log`） | `ai.ts:49` | ★（AI 诊断日志） |
| `soulPath()` | 68-70 | `~/.dsh/prompt-library/character/SOUL.md`（**仅迁移读**） | `store.ts:573` | ✗ 人格 |
| `sessionPromptPath(id)` | 73-75 | `~/.dsh/prompt-library/session-prompts/<id>.md`（**仅迁移读**） | `store.ts:583` | ✗ 会话技能 |
| （私有）`dataDir()` | 25-27 | `~/.dsh/prompt-library/` | 内部 | ★ |

### 5.1 settings.yaml 命名空间与键名

写入位置：**顶层键 `prompt-library`**（`SETTINGS_NAMESPACE`），结构为扁平对象，键名与 `PluginSettings`（`types.ts:166-195`）**完全同名**：

```yaml
prompt-library:
  panelWidth: 360
  panelHeight: 500
  aiProvider: ""
  aiModel: ""
  maxPromptCount: 100
  settingsAboveMenuEnabled: true
  showComposerButton: true
  composerButtonIconOnly: true
  showAIPolishButton: true
  aiPolishButtonIconOnly: true
  tildaTriggerEnabled: true
  selectionAddEnabled: true
  contextRecommendEnabled: true
```

（`dataManagementEnabled` **不写入**，见 `PERSIST_EXCLUDED_KEYS` `store.ts:1317-1319`。）

读写全流程（★裁剪时保留）：
- 读：`readSettingsRaw`（`store.ts:1355-1369`）→ `readSystemSettingsNamespace`（`1294-1311`）→ 与 `DEFAULT_SETTINGS` 合并 → `stripPersistExcluded`；命名空间缺失时用默认值**主动写盘初始化**（`1362-1364`）。
- 写：`updateSettings(patch)`（`1390-1396`）→ `writeSettingsRaw`（`1336-1349`）：**读整份 `settings.yaml` → 仅替换 `root["prompt-library"]` → `dump(root,{indent:2})` 整体写回**。YAML 注释/排版会丢失，其它命名空间值保留。
- 另一个**只读**用途：宿主界面语言 `locale.preference`（`store.ts:255-263` 同步版、`1379-1388` 异步版 `readGlobalLocale`）。

> 裁剪改名注意：若把命名空间改成 `prompt-enhancer`，用户已存在的 `prompt-library` 设置将全部回默认值；建议保留 `prompt-library` 或增加一次性迁移（读旧键 → 写新键）。

---

## 6. 裁剪清单（可直接照此施工）

### 6.1 可整块删除 · HTTP 路由（`routes.ts`）

| 删除对象 | 行号区间 | 条数 | 归类 |
| --- | --- | --- | --- |
| `/personas*` 全部分支 | 870-960 | 9 | 人格 |
| `/session-prompts*` 全部分支 | 962-1161 | 16 | Skill 与 SessionPrompt |
| `/skills/*` 全部分支 | 542-750（除 549-582 的 `/fs/*`） | 11 | Skill / HARNESS |
| `POST /ai/intro` | 807-817 | 1 | 浮动助手（已无调用方） |
| `POST /ai/draft` | 819-847 | 1 | 人格/技能 AI 生成 |

连带删除的私有辅助（删后无引用）：
- `resolveCurrentProjectCwd()`（240-255）—— 仅 `/skills/export/project-cwd` 与 `/skills/export/entries` 用
- `isSkillEntry()`（209-218）—— 仅上述两条 skills 路由用
- `extractIds()`（221-234）—— 被 `/trash/restore|delete`（★保留）与 session-prompts 系列共用 → **保留**
- `routes.ts:19-88` 的 import 需同步收缩：去掉 `ai.js` 的 `generateIntro/generateDraft/generateSkillDescriptor`、`skills.js` 全部、`session-prompts.js` 全部、`persona-service.js` 全部、`session-scope.js` 全部；保留 `ai.js` 的 `listAiSelectables/polishPromptBody/polishPromptBodyWithSummary`、`store.js` 的 23 个 ★ 导出、`paths.js` 的 `downloadDir`、`update.js` 的 `getVersionInfo`

### 6.2 可整块删除 · SQLite 表

| 表 | DDL 行号 | 归类 | 备注 |
| --- | --- | --- | --- |
| `personas` | 127-142 | 人格 | — |
| `persona_scope_bindings` | 146-152 | 人格 | — |
| `session_prompts` | 163-181 | SessionPrompt | — |
| `prompt_scope_bindings` | 155-161 | SessionPrompt | 注意与 `persona_scope_bindings` 区分 |
| `session_scope_bindings` | 185-192 | 人格+SessionPrompt | 两维各占一列 |
| `prompt_skill_links` | 118-124 | Skill | 仅 `skills.ts` 使用 |
| `usage_log` | 77-84 | 死数据 | 只写不读；连同 `store.ts:845` 的 INSERT 与索引一起删 |
| `pl_prompt_versions` | 194-208 | 死数据 | 只写不读；连同 `snapshotPromptVersion` 与其两处调用（749、824-826）一起删 |

**必须保留的 4 张表**：`prompts`(49-74)、`trash`(93-108)、`tags`(86-91)、`meta`(110-115)。

### 6.3 可整块删除 · `store.ts` 导出（36 个）

- G 组 5 个：`getSkillNameForPrompt` / `setSkillNameForPrompt` / `getPromptIdBySkillName` / `isPromptActive` / `isPromptTrashed`（669-705）
- H 组 1 个：`snapshotPromptVersion`（1899-1928）
- I 组 6 个 + `SessionPromptRecord`（1402-1576）
- J 组 2 个：`getDefaultPersonaSoul` / `setDefaultPersonaSoul`（1584-1591）+ 私有 `DEFAULT_SOUL_META_KEY`（1581）
- K 组 5 个（1596-1658）
- L 组 11 个 + `PersonaRecord`（1663-1813）
- M 组 6 个（1818-1891）

同时删除的私有辅助与 import：`sessionPromptFromRow`(1416)、`personaFromRow`(1674)、`parsePromptIds`(1607，删 M 组后无引用)、`migrateMdContentToDb`(569-589)、`paths.js` 的 `sessionPromptPath/soulPath`。

### 6.4 需"改写"而非删除（边界项）

| 项 | 位置 | 处理建议 |
| --- | --- | --- |
| `welcomePromptOnce` + `WELCOME_SYSTEM` | `store.ts:317-372` | 属 systemPrompt 注入（会话欢迎），不是提示词库功能。可删；删后同时去掉 `index.ts:11,189` |
| `/fs/list`、`/fs/mkdir` + `DirEntry`/`DirListing`/`DIR_LIST_LIMIT`/`crumbsOf`/`rootOf`/`resolveDirInput`/`listFsDirectory`/`createFsDirectory` | `routes.ts:256-361, 548-582` | **保留**：`ImportExportModal.tsx:371,1529` 用它选导出目录。共计约 130 行 |
| `/version` + `update.ts` | `routes.ts:855-858` | 保留（体量 36 行，设置页"关于"用） |
| `/meta/:key` | `routes.ts:410-423` | 保留（`TemplateVariables.tsx` 模板变量记忆） |
| `PluginSettings` 14 键 | `types.ts:166-195` | ★保留全部：`panelWidth/panelHeight/maxPromptCount/aiProvider/aiModel/settingsAboveMenuEnabled/showComposerButton/composerButtonIconOnly/showAIPolishButton/aiPolishButtonIconOnly/tildaTriggerEnabled/selectionAddEnabled/contextRecommendEnabled`（+不落盘的 `dataManagementEnabled`）。`contextRecommendEnabled` 对应客户端"上下文提示词推荐"（`ContextRecommendations.tsx`），**是提示词功能，保留**；该功能**无专属 host 路由**，靠 `GET /prompts` + 设置项在客户端算分排序 |
| `/ai/polish` | `routes.ts:780-805` | 保留。但它依赖 `ai.ts`（1129 行）的 `registerLlm/resolveCandidates/withSoulSystem/日志`；其中 `withSoulSystem` 会读人格 SOUL（依赖 `character.ts` 与 `store.getDefaultPersonaSoul`）→ **删人格时必须一并改 `ai.ts` 的 system 前缀构造**，否则编译失败 |
| `ai.ts` 死导出 | `generateDailyReport`(887)、`todayLocalDate`(875)、`DailyReportItem`(843)、`TechNewsItem`(851)、`enrichLearnedPrompt`(529)、`enrichPromptProfessional`(635) | 全仓**无调用方**（公告/报纸/自学习面板已移除）→ 可删（ai.ts 可瘦身数百行） |
| `refine.ts` | 全文 53 行 | 仅被 `ai.ts:16,519` 使用（`parseRefineResult`）→ 随 enrich/polish 解析链保留或同删 |
| WS 层 | `ws.ts` 全部、`events.ts` 全部、`index.ts:10,238-246` | 可整删（§4.4）；若客户端仍保留 `client/utils/ws.ts` 则会不断重连一个 404 端点 → **host 与 client 必须同删** |
| `session-scope.ts` | 全文 194 行 | 服务 persona/session-prompts 的树与诊断；删对应路由后可整删（`index.ts:26-29,99-138` 的 `session/event` 监听与 `sessionQuery` 注入也一并删） |
| `harness.ts` | 全文 55 行 | `harnessSystemSync()` 注入 HARNESS 上下文（`index.ts:183`）→ 属"其它"，可删 |
| `bundle-doc.ts` + `doc/` | 23 行 | 读包内 `doc/manual.zh.txt` 等（命令帮助文案）；若不再注册命令可删，但删前确认无调用方 |
| `text.ts` 的 `stripBom` | 8 行 | ★保留（JSON/settings 解析都需要） |
| `node-sqlite.ts` | 43 行 | ★**必须保留**（唯一 DB 入口，且负责屏蔽实验特性警告） |

### 6.5 建议的最终 `dsh-prompt-enhancer` host 面

- **路由**：64 → **26 条** = 提示词 5 + 标签 4 + 回收站 4 + 导入导出 4 + meta 2 + `/ai/providers` 1 + `/ai/polish` 1 + `/settings` GET/PUT 2 + `/version` 1 + `/fs/list`/`/fs/mkdir` 2。
- **表**：12 → **4 张**（`prompts`、`trash`、`tags`、`meta`）。
- **`store.ts`**：1928 行 → 预计约 950 行（删 I/J/K/L/M 组 + 两个行映射 + `migrateMdContentToDb`，保留 A/B/C/D/E/F 组）。
- **WS**：0 条通道。
- **`paths.ts`**：保留 `dshHome/downloadDir/storePath/dbPath/systemSettingsPath/SETTINGS_NAMESPACE/logDir` 7 项 + 私有 `dataDir`。
- **迁移保留**：`prompts.createdAt/aiRefinedAt` 列补建、`syncTagsFromPrompts`、`seedDefaultPromptIfEmpty`、`migrateLegacyJsonIfNeeded`（旧 `prompts.json`）。**删除** `migrateMdContentToDb`。**DB 路径建议保持** `~/.dsh/prompt-library/db/prompts.db` 不变以便老用户无痛升级；若改路径需写"旧库复制/改名"迁移。

---

## 附录 A · host 路由与客户端封装对照（`client/utils/api.ts`）

| 路由 | 客户端函数（行号） |
| --- | --- |
| `GET/POST /prompts` | `listPrompts`(54)、`createPrompt`(58) |
| `PUT/DELETE/POST /prompts/:id` | `updatePrompt`(62)、`deletePrompt`(66)、`usePrompt`(71) |
| `GET/POST /export`、`POST /export/save` | `exportPrompts`(86)、`saveExportFile`(104) |
| `POST /import` | `importPrompts`(126) |
| `/tags` 四式 | `listTags`(131)、`renameTag`(136)、`deleteTag`(145)、`createTag`(153) |
| `/trash` 四式 | `listTrash`(313)、`restoreTrash`(318)、`deleteTrash`(323)、`emptyTrash`(328) |
| `/meta/:key` | `getMetaValue`(602)、`setMetaValue`(609) |
| `/fs/list`、`/fs/mkdir` | `listDir`(213)、`makeDir`(218) |
| `/ai/providers`、`/ai/polish`、`/ai/draft` | (375)、(341)、(358) |
| `/settings`、`/version` | (395/400)、(388) |
| `/skills/*` | (169, 223, 228, 233, 242, 268, 277, 306, 586, 591, 596) |
| `/personas/*` | (407, 412, 420, 425, 430, 435, 440, 445, 506) |
| `/session-prompts/*` | (452, 457, 465, 470, 475, 480, 488, 493, 501, 511, 519, 540, 545, 553, 558) |

**注意**：`/ai/intro` 在 `api.ts` 中**无封装**（与 §4.4 的"已移除浮动助手"结论一致）。

## 附录 B · 裁剪时最容易踩的 6 个坑

1. `store.ts` 的 `getDb()` 是**唯一**建表处，删表要连同 `seedDefaultPromptIfEmpty` 与 `syncTagsFromPrompts` 中对被删表的读写一起处理（否则启动即 500）。
2. `ensureTag()` 在 `getDb()` 未赋值时会被调用到 → **无限递归**（源码注释 `store.ts:299`）。改写播种逻辑时必须用"传入 `cur`"的私有辅助，不能直接调导出函数。
3. `migrateLegacyJsonIfNeeded()` 是 fire-and-forget（`store.ts:215`），与同步播种存在顺序竞态（§2.3 末）。
4. `extractIds` 同时被 `/trash/*` 与 `/session-prompts/*` 使用 → 删 session-prompts 时不要顺手删掉它。
5. 删 `personas` 会连带破坏 `ai.ts`（`withSoulSystem`/`character.ts`）与 `index.ts` 的 `deployment:persona` section（`index.ts:157,205-209`）——后者与宿主全局槽位同名，删错时机/位置会抛错。
6. `prompt_scope_bindings`（`promptIds`）服务于"会话技能"，与提示词库主表 `prompts` **无关**；不要因为名字里带 prompt 而保留。
