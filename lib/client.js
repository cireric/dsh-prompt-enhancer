window.__ModuleLoader__.load({
  id: "dsh-prompt-enhancer",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/components/AIPolishButton.tsx
var React = __toESM(require("react"), 1);

// src/overlay-claim.ts
function canRender(kind, claimed) {
  return claimed === kind;
}
function canTakeHash(visible) {
  return visible;
}
function canRetakeHash(visible, claimed) {
  return visible && claimed !== "hash";
}

// src/types.ts
var TITLE_MAX_LEN = 25;
var DEFAULT_MAX_PROMPT_COUNT = 300;
var API_PREFIX = "/api/prompt-enhancer";
function clampTitle(title) {
  return title.slice(0, TITLE_MAX_LEN);
}
var DEFAULT_SETTINGS = {
  panelWidth: 420,
  panelHeight: 560,
  showComposerButton: true,
  composerButtonIconOnly: true,
  showAIPolishButton: true,
  aiPolishButtonIconOnly: true,
  hashTriggerEnabled: true,
  contextRecommendEnabled: true,
  selectionAddEnabled: true,
  showSidebarButton: true,
  maxPromptCount: DEFAULT_MAX_PROMPT_COUNT,
  aiProvider: "",
  aiModel: ""
};

// src/client/utils/api.ts
var AI_TIMEOUT_MS = 12e4;
var AI_PROBE_TIMEOUT_MS = 15e3;
var ApiError = class extends Error {
  status;
  constructor(message, status) {
    super(message);
    this.status = status;
  }
};
async function call(method, path, body, timeoutMs) {
  const res = await fetch(API_PREFIX + path, {
    method,
    headers: body === void 0 ? void 0 : { "Content-Type": "application/json" },
    body: body === void 0 ? void 0 : JSON.stringify(body),
    signal: timeoutMs === void 0 ? void 0 : AbortSignal.timeout(timeoutMs)
  });
  let parsed;
  try {
    parsed = await res.json();
  } catch (e) {
    throw new ApiError(`\u54CD\u5E94\u4E0D\u662F\u5408\u6CD5 JSON\uFF08HTTP ${res.status}\uFF09\uFF1A${String(e)}`, res.status);
  }
  if (parsed.data === void 0) {
    throw new ApiError(parsed.error ?? `\u8BF7\u6C42\u5931\u8D25\uFF08HTTP ${res.status}\uFF09`, res.status);
  }
  return parsed.data;
}
var api = {
  listPrompts: (opts = {}) => {
    const qs = new URLSearchParams();
    if (opts.q) qs.set("q", opts.q);
    if (opts.tag) qs.set("tag", opts.tag);
    if (opts.sort) qs.set("sort", opts.sort);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return call("GET", `/prompts${suffix}`);
  },
  recordUsage: (id) => call("POST", `/prompts/${encodeURIComponent(id)}/use`),
  getSettings: () => call("GET", "/settings"),
  /** 写设置（降级路径：无 `settingsScope` 时用；有 scope 时写走宿主 scope.set）。 */
  updateSettings: (patch) => call("PUT", "/settings", patch),
  getMeta: (key) => call("GET", `/meta/${encodeURIComponent(key)}`).then((r) => r.value),
  setMeta: (key, value) => call("PUT", `/meta/${encodeURIComponent(key)}`, { value }),
  /**
   * 删一条 meta KV（`DELETE /meta/:key`，T6 / O-1）。**幂等**：键不存在时宿主同样回 ok
   * （`deleted: false` 只说明「这次没删到行」，不是失败）。**通用通道**：键名约定（`pl:...`）
   * 归调用方，宿主不认识它——故这里也不做任何键名特判，调用方拼好键名传进来即可。
   */
  deleteMeta: (key) => call("DELETE", `/meta/${encodeURIComponent(key)}`),
  createPrompt: (input) => call("POST", "/prompts", input),
  /**
   * 宿主 PUT 只认白名单字段（事实见 `src/host/routes.ts` 的 PUT 分发：title | body | tags |
   * summary | skillName | skillExportedAt），其余字段被静默丢弃且仍回 200。故补丁类型取
   * `PromptWritablePatch`（types.ts 已导出，由 `PROMPT_WRITABLE_KEYS` 派生的 6 键 Pick），
   * 把 `sourceBody` / `aiRefined` / `aiRefinedAt` 这类「可读不可写」字段挡在编译期。
   * `aiWriteBack` 是写回 `sourceBody` 的唯一路径（§4.4），它不是记录字段（store.updatePrompt
   * 的选项目志），用交叉类型补上。
   */
  updatePrompt: (id, patch) => call("PUT", "/prompts/" + encodeURIComponent(id), patch),
  rollbackPrompt: (id) => call("POST", "/prompts/" + encodeURIComponent(id) + "/rollback"),
  listAiProviders: () => call("GET", "/ai/providers", void 0, AI_PROBE_TIMEOUT_MS),
  /**
   * `keepVariables` **必填**（P5 延期 #9 / T6-A3）：缺省 `true` 会让漏传的调用方静默落回被否决的
   * 常量，改成必填即由编译期拦住漏传。运行期仍按 `!== false` 判定，JS 调用方缺省时的旧行为不变。
   */
  polishPrompt: (body, opts) => call(
    "POST",
    "/ai/polish",
    { body, keepVariables: opts.keepVariables !== false, withSummary: false },
    AI_TIMEOUT_MS
  ),
  refinePrompt: (body) => call("POST", "/ai/refine", { body }, AI_TIMEOUT_MS),
  /**
   * 逐条 AI 补全技能名与描述（`POST /ai/skill-descriptor`；规格 §7.6 的「AI 补全名称与描述」）。
   *
   * `body` 必填（宿主空 body 直接 400「缺少 body」）；`title` / `summary` / `tags` 是上下文，
   * 宿主原样喂给提示词。走 `AI_TIMEOUT_MS`——它真的在等模型（同 /ai/polish、/ai/refine）；
   * AI 不可用 → 宿主 **503**，经 `call()` 变成带 status 的 ApiError（失败必须可见）。
   */
  aiSkillDescriptor: (input) => call("POST", "/ai/skill-descriptor", input, AI_TIMEOUT_MS),
  // ── 技能导出（P7 T2）──────────────────────────────────────────────────
  /**
   * 导出为官方 DSH 技能（`POST /skills/export`）。**不设超时**（写盘，同其余非 AI 路由，
   * 保持 P4 行为）。错误映射全部走 `call()` 的信封路径，调用方**按 status 分类**、不匹配文案：
   *   · 400 技能名非法 / description 兜底链全空（宿主原文）；
   *   · 404 提示词不存在；
   *   · 409 同名目录**不属于本插件**（用户手写的技能）→ 确认后带 `conflictConfirmed: true` 重试。
   * 缺省不发的键由 `JSON.stringify` 丢弃：只传 `promptId` 时宿主自己推名字，候选序为
   * `prompt.skillName（非空）→ body.name → descriptor?.name`（**唯一事实源**：`routes.ts` 的技能导出分支）。
   */
  exportPromptAsSkill: (input) => call("POST", "/skills/export", input),
  // ── 提示词：单条读写（P6）──────────────────────────────────────────────
  /** 单条读取；不存在时宿主回 404（信封失败 → ApiError.status === 404）。 */
  getPrompt: (id) => call("GET", "/prompts/" + encodeURIComponent(id)),
  /** 软删除：进回收站（规格 §4.4），故返回的是「已删除」而不是被删实体。 */
  deletePrompt: (id) => call("DELETE", "/prompts/" + encodeURIComponent(id)),
  // ── 标签（P6）──────────────────────────────────────────────────────────
  listTags: () => call("GET", "/tags"),
  createTag: (name) => call("POST", "/tags", { name }),
  /** 改名：旧名是路径段，新名在新体（宿主 PUT 只读 body.to）。 */
  renameTag: (from, to) => call("PUT", "/tags/" + encodeURIComponent(from), { to }),
  /** 在用标签宿主回 400 并带用量（信封失败 → ApiError.status === 400），调用方按状态分类。 */
  deleteTag: (name) => call("DELETE", "/tags/" + encodeURIComponent(name)),
  // ── 回收站（P6）────────────────────────────────────────────────────────
  listTrash: () => call("GET", "/trash"),
  restoreTrash: (id) => call("POST", "/trash/" + encodeURIComponent(id) + "/restore"),
  deleteTrash: (id) => call("DELETE", "/trash/" + encodeURIComponent(id)),
  /**
   * 清空回收站（T7 ⑦ / 修复轮 1）。回执**同时**给两样：
   *   · `removed` = 被删**条数**（既有形状，未变——不破坏任何既有读法）；
   *   · `ids` = 被**物理删除的 id 列表**——客户端按**它**清 per-prompt meta（`ai-flow.ts#deletePrompts`）；
   *     面板列出的 items 是**打开那一刻**的快照，清空与列表之间的竞态窗口内新增的行同样被删，
   *     却不在快照里（按快照清键就会留下残键）。`ids.length === removed`。
   */
  emptyTrash: () => call("DELETE", "/trash"),
  // ── 导入导出（P6）──────────────────────────────────────────────────────
  /**
   * 导入备份。**只是信封封装，语义照宿主**（P6-4 裁定）：confirm 不为 true 时宿主只回预览
   * （applied: false + stats），且**不**自动淘汰超限条目（「导入不淘汰」是用户裁定）。
   * confirm 缺省时不发该键（宿主同判为未确认），调用方显式传 true 才落库。
   */
  importBackup: (backup, confirm) => call("POST", "/import", { backup, confirm }),
  /** 把备份写到宿主可写的绝对路径目录；文件名由服务端生成（客户端不能指定任意文件名）。 */
  exportBackup: (dir) => call("POST", "/export/save", { dir })
};

// src/client/utils/template.ts
function parseVariables(body) {
  const out = [];
  for (const m of body.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
    const name = m[1].trim();
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}
function fillTemplate(body, values) {
  return body.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (whole, raw) => {
    const name = raw.trim();
    const value = values[name];
    return value !== void 0 && value !== "" ? value : whole;
  });
}
function needsValues(body) {
  return parseVariables(body).length > 0;
}
var memoryKey = "pl:template-var-memory";
function parseMemory(raw) {
  if (raw.trim() === "") return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out = {};
    for (const [name, value] of Object.entries(parsed)) {
      if (typeof value === "string") out[name] = value;
    }
    return out;
  } catch (err) {
    console.warn("[prompt-enhancer] " + memoryKey + " \u4E0D\u662F\u5408\u6CD5 JSON\uFF0C\u672C\u6B21\u6309\u65E0\u8BB0\u5FC6\u5904\u7406", err);
    return {};
  }
}
function pickRemembered(body, memory) {
  const out = {};
  for (const name of parseVariables(body)) {
    const value = memory[name];
    if (typeof value === "string" && value !== "") out[name] = value;
  }
  return out;
}

// src/client/utils/refined-direction.ts
var UNKNOWN_READING = { direction: "none", source: "fallback" };
function refinedDirectionMetaKey(promptId) {
  return "pl:refined-dir:" + promptId;
}
function hasTwoBodies(prompt) {
  return Boolean(prompt.sourceBody);
}
function parseStoredDirection(raw) {
  if (raw === void 0) return void 0;
  const text = raw.trim();
  if (text === "") return void 0;
  if (text === "original" || text === "refined") return text;
  console.warn("[prompt-enhancer] \u300C\u539F\u6587 / \u4F18\u5316\u7A3F\u300D\u65B9\u5411\u7684 meta \u503C\u4E0D\u53EF\u8BC6\u522B\uFF08\u6309\u65E0\u8BB0\u5F55\u5904\u7406\uFF09\uFF1A" + JSON.stringify(raw));
  return void 0;
}
function readRefinedDirection(prompt, stored) {
  if (!hasTwoBodies(prompt)) return UNKNOWN_READING;
  const recorded = parseStoredDirection(stored);
  if (recorded === void 0) return UNKNOWN_READING;
  return { direction: recorded, source: "record" };
}
function canPersistDirection(reading) {
  return reading.source === "record";
}
function oppositeDirection(direction) {
  if (direction === "original") return "refined";
  if (direction === "refined") return "original";
  return "none";
}
function compareLabelKeys(direction) {
  if (direction === "original") {
    return { current: "manager.compare.original", counterpart: "manager.compare.refined", neutral: false };
  }
  if (direction === "refined") {
    return { current: "manager.compare.refined", counterpart: "manager.compare.original", neutral: false };
  }
  return { current: "manager.compare.current", counterpart: "manager.compare.counterpart", neutral: true };
}
async function loadStoredDirection(promptId, getMeta) {
  try {
    return await getMeta(refinedDirectionMetaKey(promptId));
  } catch (err) {
    console.warn("[prompt-enhancer] \u8BFB\u53D6\u300C\u539F\u6587 / \u4F18\u5316\u7A3F\u300D\u65B9\u5411\u5931\u8D25\uFF08\u672C\u6B21\u6253\u5F00\u9000\u56DE\u4E2D\u6027\u6807\u6CE8\uFF09", err);
    return void 0;
  }
}
async function saveRefinedDirection(promptId, direction, setMeta = (key, value) => api.setMeta(key, value)) {
  if (direction === "none") return;
  try {
    await setMeta(refinedDirectionMetaKey(promptId), direction);
  } catch (err) {
    console.warn("[prompt-enhancer] \u300C\u539F\u6587 / \u4F18\u5316\u7A3F\u300D\u65B9\u5411\u843D meta \u5931\u8D25\uFF08\u4E0B\u6B21\u6253\u5F00\u4F1A\u9000\u56DE\u4E2D\u6027\u6807\u6CE8\uFF09", err);
  }
}
function toggleDirectionWrite(prompt, reading) {
  if (!hasTwoBodies(prompt)) return "none";
  return canPersistDirection(reading) ? "persist" : "clear";
}
function shouldAcceptLateRead(toggledSinceRead) {
  return !toggledSinceRead;
}
async function clearRefinedDirection(promptId, setMeta = (key, value) => api.setMeta(key, value)) {
  try {
    await setMeta(refinedDirectionMetaKey(promptId), "");
  } catch (err) {
    console.warn("[prompt-enhancer] \u300C\u539F\u6587 / \u4F18\u5316\u7A3F\u300D\u65B9\u5411\u7684\u65E7\u8BB0\u5F55\u4F5C\u5E9F\u5931\u8D25\uFF08\u4E0B\u6B21\u6253\u5F00\u53EF\u80FD\u91C7\u4FE1\u4E00\u6761\u5DF2\u9648\u65E7\u7684\u8BB0\u5F55\uFF09", err);
  }
}
function applyToggleDirection(promptId, prompt, reading, setMeta = (key, value) => api.setMeta(key, value)) {
  const write = toggleDirectionWrite(prompt, reading);
  if (write === "none") return { write, next: void 0, done: Promise.resolve() };
  if (write === "clear") return { write, next: void 0, done: clearRefinedDirection(promptId, setMeta) };
  const next = oppositeDirection(reading.direction);
  return { write, next, done: saveRefinedDirection(promptId, next, setMeta) };
}
async function seedRefinedDirection(promptId, setMeta = (key, value) => api.setMeta(key, value)) {
  await saveRefinedDirection(promptId, "refined", setMeta);
}

// src/skill-name.ts
var SKILL_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
var SKILL_NAME_MAX_LEN = 64;
function toKebab(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/[/\\]/.test(trimmed) || trimmed.includes("..")) return "";
  return trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function isValidSkillName(name) {
  return name.length > 0 && name.length <= SKILL_NAME_MAX_LEN && SKILL_NAME_RE.test(name);
}

// src/client/utils/skill-export.ts
function createSkillRun() {
  const run = {
    cancelled: false,
    cancel() {
      run.cancelled = true;
    }
  };
  return run;
}
function toggleSelected(selected, id) {
  return selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
}
function isAllSelected(visible, selected) {
  return visible.length > 0 && visible.every((p) => selected.includes(p.id));
}
function toggleAllVisible(visible, selected) {
  if (isAllSelected(visible, selected)) {
    return selected.filter((id) => !visible.some((p) => p.id === id));
  }
  const out = [...selected];
  for (const prompt of visible) if (!out.includes(prompt.id)) out.push(prompt.id);
  return out;
}
function filterByTag(prompts, tag) {
  if (tag === "") return [...prompts];
  return prompts.filter((p) => (p.tags ?? []).includes(tag));
}
function collectTags(prompts) {
  const out = [];
  for (const prompt of prompts) {
    for (const tag of prompt.tags ?? []) if (!out.includes(tag)) out.push(tag);
  }
  return out.sort((a, b) => a.localeCompare(b));
}
function pickSelected(prompts, selected) {
  return prompts.filter((p) => selected.includes(p.id));
}
function resolveDescriptionForClient(prompt, descriptor) {
  const candidates = [
    prompt.summary,
    descriptor?.description,
    prompt.body.split("\n").map((line) => line.trim()).find((line) => line.length > 0),
    prompt.title
  ];
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value) return value;
  }
  return void 0;
}
function exportNameLocked(prompt) {
  return Boolean(prompt.skillName?.trim());
}
function precheckExport(prompt, descriptor) {
  const raw = exportNameLocked(prompt) ? prompt.skillName ?? "" : descriptor?.name ?? "";
  const name = toKebab(raw);
  if (!isValidSkillName(name)) {
    return {
      ok: false,
      errorKey: raw.trim() === "" ? "manager.skill.nameMissing" : "manager.skill.nameInvalid",
      detail: "kebab=" + JSON.stringify(name)
    };
  }
  const description = resolveDescriptionForClient(prompt, descriptor);
  if (description === void 0) {
    return {
      ok: false,
      errorKey: "manager.skill.descMissing",
      detail: "summary|descriptor.description|body[0]|title all empty"
    };
  }
  return { ok: true, name, description };
}
async function describeEach(prompts, describeOne, options = {}) {
  const out = {};
  for (const prompt of prompts) {
    if (options.run?.cancelled) break;
    let outcome;
    try {
      outcome = { ok: true, descriptor: await describeOne(prompt) };
    } catch (err) {
      outcome = { ok: false, errorKey: "manager.skill.describeFailed", detail: reasonOf(err) };
    }
    out[prompt.id] = outcome;
    options.onEach?.(prompt.id, outcome);
  }
  return out;
}
async function exportEach(input) {
  const outcomes = [];
  for (const prompt of input.prompts) {
    if (input.run?.cancelled) break;
    outcomes.push(await exportOne(prompt, input));
  }
  return outcomes;
}
async function exportOne(prompt, input) {
  const recorded = input.descriptors[prompt.id];
  const descriptor = recorded?.ok ? recorded.descriptor : void 0;
  const pre = precheckExport(prompt, descriptor);
  if (!pre.ok) {
    return { status: "failed", id: prompt.id, title: prompt.title, errorKey: pre.errorKey, detail: pre.detail };
  }
  const request = { name: pre.name, descriptor, conflictConfirmed: false };
  let receipt;
  try {
    receipt = await input.send(prompt, request);
  } catch (err) {
    if (!isConflict(err)) return failedOutcome(prompt, err);
    if (input.run?.cancelled) {
      return { status: "declined", id: prompt.id, title: prompt.title, name: pre.name, detail: reasonOf(err) };
    }
    const approved = await input.confirmConflict({
      id: prompt.id,
      title: prompt.title,
      name: pre.name,
      detail: reasonOf(err)
    });
    if (!approved) {
      return { status: "declined", id: prompt.id, title: prompt.title, name: pre.name, detail: reasonOf(err) };
    }
    try {
      receipt = await input.send(prompt, { ...request, conflictConfirmed: true });
    } catch (retryErr) {
      return failedOutcome(prompt, retryErr);
    }
  }
  if (!receipt.path) {
    return {
      status: "failed",
      id: prompt.id,
      title: prompt.title,
      errorKey: "manager.skill.pathMissing",
      detail: "keys=" + Object.keys(receipt).sort().join(",")
    };
  }
  const exported = { status: "exported", id: prompt.id, title: prompt.title, name: receipt.name, path: receipt.path };
  input.onExported?.(exported);
  if (descriptor) {
    const used = exportNameLocked(prompt) ? { ...descriptor, name: exported.name } : descriptor;
    await (input.saveDescriptor ?? persistDescriptor)(prompt.id, used);
  }
  return exported;
}
function isConflict(err) {
  return err instanceof ApiError && err.status === 409;
}
function failedOutcome(prompt, err) {
  return {
    status: "failed",
    id: prompt.id,
    title: prompt.title,
    errorKey: "manager.skill.exportFailed",
    detail: reasonOf(err)
  };
}
function reasonOf(err) {
  return err instanceof Error ? err.message : String(err);
}
function skillDescriptorMetaKey(promptId) {
  return "pl:skill-descriptor:" + promptId;
}
function isDescriptorPayload(value) {
  if (typeof value !== "object" || value === null) return false;
  const v = value;
  if (typeof v.name !== "string" || typeof v.description !== "string") return false;
  return v.whenToUse === void 0 || typeof v.whenToUse === "string";
}
function parseStoredDescriptor(raw) {
  if (!raw) return void 0;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn("[prompt-enhancer] \u6280\u80FD descriptor \u7684 meta \u4E0D\u662F\u5408\u6CD5 JSON\uFF08\u91CD\u5BFC\u9000\u56DE\u515C\u5E95\u94FE\uFF09", err);
    return void 0;
  }
  if (!isDescriptorPayload(parsed)) {
    console.warn("[prompt-enhancer] \u6280\u80FD descriptor \u7684 meta \u5F62\u72B6\u4E0D\u7B26\uFF08\u91CD\u5BFC\u9000\u56DE\u515C\u5E95\u94FE\uFF09");
    return void 0;
  }
  const out = { name: parsed.name, description: parsed.description };
  if (parsed.whenToUse !== void 0) out.whenToUse = parsed.whenToUse;
  return out;
}
async function persistDescriptor(promptId, descriptor) {
  try {
    await api.setMeta(skillDescriptorMetaKey(promptId), JSON.stringify(descriptor));
  } catch (err) {
    console.warn("[prompt-enhancer] \u6280\u80FD descriptor \u843D meta \u5931\u8D25\uFF08\u91CD\u5BFC\u4F1A\u9000\u56DE\u515C\u5E95\u94FE\uFF09", err);
  }
}
async function loadStoredDescriptor(promptId, getMeta) {
  try {
    return parseStoredDescriptor(await getMeta(skillDescriptorMetaKey(promptId)));
  } catch (err) {
    console.warn("[prompt-enhancer] \u8BFB\u53D6\u6280\u80FD descriptor \u5931\u8D25\uFF08\u91CD\u5BFC\u9000\u56DE\u515C\u5E95\u94FE\uFF09", err);
    return void 0;
  }
}
function summarizeExport(outcomes) {
  const exported = outcomes.filter((o) => o.status === "exported");
  const failed = outcomes.filter((o) => o.status === "failed");
  const declined = outcomes.filter((o) => o.status === "declined");
  return {
    exported,
    failed,
    declined,
    okCount: exported.length,
    failCount: failed.length,
    declinedCount: declined.length,
    total: outcomes.length
  };
}

// src/client/utils/ai-flow.ts
function keepVariablesFor(draft) {
  return needsValues(draft);
}
function libraryCreateInput(refined, originalDraft) {
  const firstLine = (originalDraft.split(/\r\n|\n|\r/).find((line) => line.trim() !== "") ?? "").trim();
  return {
    // AI 标题只有空白字符时等于没给标题：判据用 trim，兜底后才交给 clampTitle。
    title: clampTitle(refined.title.trim() || firstLine),
    body: originalDraft,
    tags: refined.tags.slice(0, 1),
    summary: refined.summary
  };
}
function needsWriteBack(refinedBody, originalDraft) {
  return refinedBody !== originalDraft;
}
async function writeBackRefined(input) {
  const updated = await input.update(input.promptId, { body: input.body, aiWriteBack: true });
  try {
    await input.seed(input.promptId);
  } catch (err) {
    console.warn("[prompt-enhancer] \u5199\u56DE\u6210\u529F\u4F46\u65B9\u5411\u8BB0\u5F55\u64AD\u79CD\u5931\u8D25\uFF08\u91CD\u5F00\u8BE6\u60C5\u9875\u4F1A\u9000\u56DE\u4E2D\u6027\u6807\u6CE8\uFF09", err);
  }
  return updated;
}
function canToggle(current2) {
  return Boolean(current2.sourceBody);
}
function errorName(err) {
  if (typeof err !== "object" || err === null) return void 0;
  const name = err.name;
  return typeof name === "string" ? name : void 0;
}
function statusOf(err) {
  if (typeof err !== "object" || err === null || !("status" in err)) return void 0;
  const status = err.status;
  return typeof status === "number" ? status : void 0;
}
function aiErrorKey(err) {
  if (errorName(err) === "TimeoutError") return "ai.timeout";
  if (statusOf(err) === 503) return "ai.unavailable";
  return "ai.fail";
}
function perPromptMetaKeys(promptId) {
  return [refinedDirectionMetaKey(promptId), skillDescriptorMetaKey(promptId)];
}
async function deletePrompts(input) {
  const receipt = await input.remove();
  if (!input.irreversible) return { succeeded: 0, failed: 0 };
  const ids = receiptIds(receipt) ?? input.ids;
  const deleteMeta = input.deleteMeta ?? ((key) => api.deleteMeta(key));
  const keys = [];
  for (const id of ids) for (const key of perPromptMetaKeys(id)) keys.push(key);
  const settled = await Promise.allSettled(keys.map((key) => deleteMeta(key)));
  let succeeded = 0;
  let failed = 0;
  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i];
    if (outcome.status === "fulfilled") {
      succeeded++;
    } else {
      failed++;
      console.warn("[prompt-enhancer] \u6E05\u7406\u63D0\u793A\u8BCD\u7684 meta \u952E\u5931\u8D25\uFF08\u63D0\u793A\u8BCD\u5DF2\u5220\u9664\uFF0C\u6B8B\u7559\u952E\uFF1A" + keys[i] + "\uFF09", outcome.reason);
    }
  }
  return { succeeded, failed };
}
function receiptIds(receipt) {
  if (typeof receipt !== "object" || receipt === null) return void 0;
  const raw = receipt.ids;
  if (!Array.isArray(raw)) return void 0;
  if (!raw.every((id) => typeof id === "string" && id !== "")) return void 0;
  return raw;
}

// src/settings-shape.ts
function pickNumber(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function pickBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}
function pickString(value, fallback) {
  return typeof value === "string" ? value : fallback;
}
function normalizeSettings(raw) {
  const r = typeof raw === "object" && raw !== null ? raw : {};
  const d = DEFAULT_SETTINGS;
  return {
    panelWidth: pickNumber(r.panelWidth, d.panelWidth),
    panelHeight: pickNumber(r.panelHeight, d.panelHeight),
    showComposerButton: pickBoolean(r.showComposerButton, d.showComposerButton),
    composerButtonIconOnly: pickBoolean(r.composerButtonIconOnly, d.composerButtonIconOnly),
    showAIPolishButton: pickBoolean(r.showAIPolishButton, d.showAIPolishButton),
    aiPolishButtonIconOnly: pickBoolean(r.aiPolishButtonIconOnly, d.aiPolishButtonIconOnly),
    hashTriggerEnabled: pickBoolean(r.hashTriggerEnabled, d.hashTriggerEnabled),
    contextRecommendEnabled: pickBoolean(r.contextRecommendEnabled, d.contextRecommendEnabled),
    selectionAddEnabled: pickBoolean(r.selectionAddEnabled, d.selectionAddEnabled),
    showSidebarButton: pickBoolean(r.showSidebarButton, d.showSidebarButton),
    maxPromptCount: pickNumber(r.maxPromptCount, d.maxPromptCount),
    aiProvider: pickString(r.aiProvider, d.aiProvider),
    aiModel: pickString(r.aiModel, d.aiModel)
  };
}

// src/client/utils/react-hooks.ts
var reactHooks;
function hooks() {
  if (reactHooks === void 0) {
    reactHooks = null;
    if (typeof require === "function") {
      try {
        reactHooks = require("react");
      } catch (e) {
        console.warn("[prompt-enhancer] \u65E0\u6CD5\u89E3\u6790 react\uFF0Chook \u4E0D\u53EF\u7528\uFF1A", e);
      }
    } else {
      console.warn("[prompt-enhancer] \u5F53\u524D\u73AF\u5883\u6CA1\u6709 require\uFF0C\u65E0\u6CD5\u89E3\u6790 react\uFF08hook \u53EA\u80FD\u5728\u5BBF\u4E3B\u91CC\u8C03\u7528\uFF09");
    }
  }
  if (!reactHooks) {
    throw new Error("prompt-enhancer: react \u8FD0\u884C\u65F6\u4E0D\u53EF\u7528\uFF08hook \u53EA\u80FD\u5728\u5BBF\u4E3B\u91CC\u8C03\u7528\uFF09");
  }
  return reactHooks;
}

// src/client/utils/settings-store.ts
var scope = null;
var unsubscribeScope;
var snapshot = { ...DEFAULT_SETTINGS };
var listeners = /* @__PURE__ */ new Set();
function emit() {
  for (const listener of [...listeners]) listener();
}
function derive() {
  snapshot = scope === null ? { ...DEFAULT_SETTINGS } : normalizeSettings(scope.getSnapshot().value);
  emit();
}
function readSettingsFallback() {
  api.getSettings().then(
    (value) => {
      if (scope !== null) return;
      snapshot = normalizeSettings(value);
      emit();
    },
    (err) => {
      console.warn("[prompt-enhancer] \u65E0 settingsScope\uFF0C\u964D\u7EA7\u8BFB\u53D6\u8BBE\u7F6E\u5931\u8D25\uFF0C\u5DF2\u6309\u9ED8\u8BA4\u503C\u663E\u793A\uFF1A", err);
    }
  );
}
function setSettingsScope(next) {
  unsubscribeScope?.();
  unsubscribeScope = void 0;
  scope = next;
  if (next !== null) unsubscribeScope = next.subscribe(derive);
  derive();
  if (next === null) readSettingsFallback();
}
function getSettingsSnapshot() {
  return { ...snapshot };
}
function subscribeSettings(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function useSettings() {
  const { useState: useState13, useEffect: useEffect13 } = hooks();
  const [value, setValue] = useState13(getSettingsSnapshot);
  useEffect13(() => subscribeSettings(() => setValue(getSettingsSnapshot())), []);
  return value;
}
readSettingsFallback();

// src/client/utils/confirm.ts
var current = null;
var settle = null;
var nextId = 1;
var listeners2 = /* @__PURE__ */ new Set();
function emit2() {
  for (const listener of [...listeners2]) listener();
}
function subscribeConfirm(listener) {
  listeners2.add(listener);
  return () => {
    listeners2.delete(listener);
  };
}
function getConfirmSnapshot() {
  return current;
}
function requestConfirm(input) {
  if (current !== null) {
    console.warn("[prompt-enhancer] \u5DF2\u6709\u4E00\u4E2A\u786E\u8BA4\u5F39\u7A97\u5728\u9014\uFF0C\u672C\u6B21\u786E\u8BA4\u8BF7\u6C42\u4EE5\u300C\u53D6\u6D88\u300D\u7ACB\u5373\u843D\u5730\uFF08\u4E0D\u6392\u961F\uFF09");
    return Promise.resolve(false);
  }
  const promise = new Promise((resolve) => {
    settle = resolve;
  });
  current = { ...input, id: nextId++ };
  emit2();
  return promise;
}
function resolveConfirm(approved) {
  const done = settle;
  if (done === null) return;
  current = null;
  settle = null;
  emit2();
  done(approved);
}
function useConfirmRequest() {
  const { useState: useState13, useEffect: useEffect13 } = hooks();
  const [snapshot2, setSnapshot] = useState13(getConfirmSnapshot);
  useEffect13(() => subscribeConfirm(() => setSnapshot(getConfirmSnapshot())), []);
  return snapshot2;
}

// src/client/utils/data-sync.ts
var DATA_CHANGED = "prompt-enhancer:data-changed";
function hasEventFace() {
  const candidate = globalThis;
  return typeof candidate.addEventListener === "function" && typeof candidate.dispatchEvent === "function";
}
var bus = hasEventFace() ? globalThis : new EventTarget();
function subscribeDataChanged(fn) {
  bus.addEventListener(DATA_CHANGED, fn);
  return () => bus.removeEventListener(DATA_CHANGED, fn);
}
function notifyDataChanged() {
  bus.dispatchEvent(new Event(DATA_CHANGED));
}
function useDataChanged(fn, deps = []) {
  const { useEffect: useEffect13 } = hooks();
  useEffect13(() => subscribeDataChanged(fn), deps);
}

// src/eviction-order.ts
function compareEvictionOrder(a, b) {
  return Number(a.aiRefined) - Number(b.aiRefined) || a.lastUsedAt - b.lastUsedAt || a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

// src/client/utils/eviction.ts
function previewEvictions(prompts, maxCount, incoming = 1) {
  const over = Math.max(0, prompts.length + incoming - maxCount);
  if (over === 0) return [];
  return [...prompts].sort(compareEvictionOrder).slice(0, over);
}

// src/client/utils/capture.ts
function fallbackTitle(body) {
  const firstLine = body.split(/\r\n|\n|\r/).find((line) => line.trim() !== "") ?? "";
  return firstLine.trim();
}
async function createFromCapture(input) {
  const [prompts, settings] = await Promise.all([api.listPrompts(), api.getSettings()]);
  const victims = previewEvictions(prompts, settings.maxPromptCount, 1);
  if (victims.length > 0) {
    const approved = await requestConfirm({
      title: "manager.evict.title",
      message: "manager.evict.message",
      detail: victims.map((p) => p.title),
      confirmLabel: "manager.evict.confirm",
      cancelLabel: "manager.evict.cancel"
    });
    if (!approved) return { ok: false, reason: "cancelled" };
  }
  const created = await api.createPrompt({
    title: clampTitle((input.title ?? "").trim() || fallbackTitle(input.body)),
    body: input.body,
    tags: input.tags,
    summary: input.summary
  });
  notifyDataChanged();
  const evicted = created.evicted ?? [];
  if (evicted.length > 0) {
    void deletePrompts({ ids: evicted, irreversible: true, remove: async () => {
    } }).catch((err) => {
      console.warn(
        "[prompt-enhancer] \u6DD8\u6C70\u8005\u7684 meta \u952E\u6E05\u7406\u672A\u8DD1\u5B8C\uFF08\u63D0\u793A\u8BCD\u5DF2\u521B\u5EFA\uFF0C\u6B8B\u7559\u952E\uFF1A" + evicted.join(",") + "\uFF09",
        err
      );
    });
  }
  return { ok: true, prompt: created.prompt, evicted };
}

// src/client/utils/theme.ts
var TOKEN = {
  bg: "var(--dsw-alias-bg-elevated, #ffffff)",
  fg: "var(--dsw-alias-text-primary, #1f2328)",
  muted: "var(--dsw-alias-text-secondary, #6b7280)",
  border: "var(--dsw-alias-border-secondary, #e5e7eb)",
  accent: "var(--dsw-alias-text-accent, #2563eb)",
  hover: "var(--dsw-alias-bg-hover, rgba(0,0,0,0.04))"
};
var TONE = {
  success: "var(--dsw-alias-state-success-primary, #15803d)",
  warn: "var(--dsw-alias-state-warn-label, #b45309)"
};
var overlayBase = {
  pointerEvents: "auto",
  background: TOKEN.bg,
  color: TOKEN.fg,
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 10,
  boxShadow: "0 8px 24px rgba(0,0,0,0.16)"
};

// src/client/utils/ui-state.ts
var DEFAULT_PANEL = "list";
var state = { open: false, panel: DEFAULT_PANEL };
var capture = null;
var listeners3 = /* @__PURE__ */ new Set();
function emit3() {
  for (const listener of [...listeners3]) listener();
}
function subscribe(listener) {
  listeners3.add(listener);
  return () => {
    listeners3.delete(listener);
  };
}
function getSnapshot() {
  return state;
}
function getCaptureSnapshot() {
  return capture;
}
function openManager(panel = DEFAULT_PANEL) {
  if (state.open && state.panel === panel) return;
  state = { open: true, panel };
  emit3();
}
function closeManager() {
  if (!state.open) return;
  state = { open: false, panel: state.panel };
  emit3();
}
function pushCapture(payload) {
  capture = { body: payload.body, title: payload.title ?? "" };
  emit3();
}
function takeCapture() {
  const pending = capture;
  capture = null;
  if (pending) emit3();
  return pending;
}
function useManagerState() {
  const { useState: useState13, useEffect: useEffect13 } = hooks();
  const [snapshot2, setSnapshot] = useState13(getSnapshot);
  useEffect13(() => subscribe(() => setSnapshot(getSnapshot())), []);
  return snapshot2;
}
function useCapture() {
  const { useState: useState13, useEffect: useEffect13 } = hooks();
  const [snapshot2, setSnapshot] = useState13(getCaptureSnapshot);
  useEffect13(() => subscribe(() => setSnapshot(getCaptureSnapshot())), []);
  return snapshot2;
}
var hashSuggestVisible = false;
var hashSuggestListeners = /* @__PURE__ */ new Set();
function getHashSuggestVisibleSnapshot() {
  return hashSuggestVisible;
}
function subscribeHashSuggestVisible(listener) {
  hashSuggestListeners.add(listener);
  return () => {
    hashSuggestListeners.delete(listener);
  };
}
function setHashSuggestVisible(visible) {
  if (hashSuggestVisible === visible) return;
  hashSuggestVisible = visible;
  for (const listener of [...hashSuggestListeners]) listener();
}
function useHashSuggestVisible() {
  const { useState: useState13, useEffect: useEffect13 } = hooks();
  const [snapshot2, setSnapshot] = useState13(getHashSuggestVisibleSnapshot);
  useEffect13(() => subscribeHashSuggestVisible(() => setSnapshot(getHashSuggestVisibleSnapshot())), []);
  return snapshot2;
}
var claimedOverlay = "none";
var overlayClaimListeners = /* @__PURE__ */ new Set();
function getOverlayClaimSnapshot() {
  return claimedOverlay;
}
function subscribeOverlayClaim(listener) {
  overlayClaimListeners.add(listener);
  return () => {
    overlayClaimListeners.delete(listener);
  };
}
function claimOverlay(kind) {
  if (claimedOverlay === kind) return;
  claimedOverlay = kind;
  for (const listener of [...overlayClaimListeners]) listener();
}
function claimOverlayIfFree(kind) {
  if (claimedOverlay === kind) return;
  if (claimedOverlay !== "none") return;
  claimedOverlay = kind;
  for (const listener of [...overlayClaimListeners]) listener();
}
function releaseOverlay(kind) {
  if (claimedOverlay !== kind) return;
  claimedOverlay = "none";
  for (const listener of [...overlayClaimListeners]) listener();
}
function useOverlayClaim() {
  const { useState: useState13, useEffect: useEffect13 } = hooks();
  const [snapshot2, setSnapshot] = useState13(getOverlayClaimSnapshot);
  useEffect13(() => subscribeOverlayClaim(() => setSnapshot(getOverlayClaimSnapshot())), []);
  return snapshot2;
}

// src/client/components/AIPolishButton.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var COPIED_MS = 2e3;
var PREVIEW_MAX = 120;
function previewText(body) {
  return body.length > PREVIEW_MAX ? body.slice(0, PREVIEW_MAX) + "\u2026" : body;
}
function reasonOf2(err) {
  return err instanceof Error ? err.message : String(err);
}
function SparkleIcon() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true", style: ICON, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "path",
    {
      d: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z",
      stroke: "currentColor",
      strokeWidth: "1.6",
      strokeLinejoin: "round"
    }
  ) });
}
function AIPolishButton({ t, useInput, inputActions }) {
  const draft = useInput((s) => s.draft);
  const settings = useSettings();
  const [status, setStatus] = React.useState("idle");
  const [original, setOriginal] = React.useState("");
  const [polished, setPolished] = React.useState("");
  const [showOriginal, setShowOriginal] = React.useState(false);
  const [refined, setRefined] = React.useState(null);
  const [saved, setSaved] = React.useState(null);
  const [evicted, setEvicted] = React.useState(false);
  const [saveError, setSaveError] = React.useState(null);
  const [errorKey, setErrorKey] = React.useState(null);
  const [refineErrorKey, setRefineErrorKey] = React.useState(null);
  const [copied, setCopied] = React.useState(false);
  const rootRef = React.useRef(null);
  const providersRef = React.useRef(null);
  const busyRef = React.useRef(false);
  const aliveRef = React.useRef(true);
  React.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  const claimed = useOverlayClaim();
  const aiWanted = status !== "idle";
  const aiVisible = aiWanted && canRender("ai", claimed);
  React.useEffect(() => {
    if (!aiWanted) {
      releaseOverlay("ai");
      return;
    }
    claimOverlayIfFree("ai");
  }, [aiWanted, claimed]);
  React.useEffect(() => () => releaseOverlay("ai"), []);
  const close = () => {
    setStatus("idle");
    setOriginal("");
    setPolished("");
    setShowOriginal(false);
    setRefined(null);
    setSaved(null);
    setEvicted(false);
    setSaveError(null);
    setErrorKey(null);
    setRefineErrorKey(null);
    setCopied(false);
  };
  const settled = status === "done" || status === "error" || status === "refined" || status === "saved" || status === "saveFailed" || status === "writeBackFailed";
  React.useEffect(() => {
    if (!settled) return;
    const onPointerDown = (ev) => {
      const root = rootRef.current;
      if (root !== null && ev.target instanceof Node && root.contains(ev.target)) return;
      close();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [settled]);
  React.useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), COPIED_MS);
    return () => {
      window.clearTimeout(id);
    };
  }, [copied]);
  const run = (snapshot2) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setErrorKey(null);
    setRefineErrorKey(null);
    setOriginal(snapshot2);
    setShowOriginal(false);
    setCopied(false);
    setStatus("polishing");
    void (async () => {
      try {
        let providers = providersRef.current;
        if (providers === null) {
          try {
            providers = await api.listAiProviders();
          } catch (err) {
            console.warn("[prompt-enhancer] AI \u53EF\u7528\u6027\u63A2\u6D4B\u5931\u8D25", err);
            if (!aliveRef.current) return;
            setErrorKey(aiErrorKey(err));
            setStatus("error");
            return;
          }
          providersRef.current = providers;
        }
        if (providers.length === 0) {
          if (!aliveRef.current) return;
          setErrorKey("ai.unavailable");
          setStatus("error");
          return;
        }
        try {
          const result = await api.polishPrompt(snapshot2, { keepVariables: keepVariablesFor(snapshot2) });
          if (!aliveRef.current) return;
          setPolished(result.polished);
          setStatus("done");
        } catch (err) {
          console.warn("[prompt-enhancer] AI \u4F18\u5316\u5931\u8D25", err);
          if (!aliveRef.current) return;
          setErrorKey(aiErrorKey(err));
          setStatus("error");
        }
      } finally {
        busyRef.current = false;
      }
    })();
  };
  const refine = () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setRefineErrorKey(null);
    setSaveError(null);
    setStatus("refining");
    void (async () => {
      try {
        const result = await api.refinePrompt(original);
        if (!aliveRef.current) return;
        setRefined(result);
        setStatus("refined");
      } catch (err) {
        console.warn("[prompt-enhancer] \u4E00\u952E\u5B8C\u5584\u5931\u8D25", err);
        if (!aliveRef.current) return;
        setRefineErrorKey(aiErrorKey(err));
        setStatus("done");
      } finally {
        busyRef.current = false;
      }
    })();
  };
  const save = () => {
    if (busyRef.current || refined === null) return;
    busyRef.current = true;
    setSaveError(null);
    setStatus("saving");
    void (async () => {
      try {
        let outcome;
        try {
          outcome = await createFromCapture(libraryCreateInput(refined, original));
        } catch (err) {
          console.warn("[prompt-enhancer] \u5B58\u5165\u8BCD\u5E93\u5931\u8D25", err);
          if (!aliveRef.current) return;
          setSaveError(reasonOf2(err));
          setStatus("saveFailed");
          return;
        }
        if (!aliveRef.current) return;
        if (!outcome.ok) {
          setStatus("refined");
          return;
        }
        setSaved(outcome.prompt);
        setEvicted(outcome.evicted.length > 0);
        if (!needsWriteBack(refined.body, original)) {
          setStatus("saved");
          return;
        }
        try {
          const updated = await writeBackRefined({
            promptId: outcome.prompt.id,
            body: refined.body,
            update: api.updatePrompt,
            seed: seedRefinedDirection
          });
          if (!aliveRef.current) return;
          setSaved(updated);
          setStatus("saved");
        } catch (err) {
          console.warn("[prompt-enhancer] \u4F18\u5316\u7A3F\u5199\u56DE\u5931\u8D25\uFF08\u539F\u6587\u5DF2\u5165\u5E93\uFF09", err);
          if (!aliveRef.current) return;
          setSaveError(reasonOf2(err));
          setStatus("writeBackFailed");
        }
      } finally {
        busyRef.current = false;
      }
    })();
  };
  const retryWriteBack = () => {
    if (busyRef.current || saved === null || refined === null) return;
    busyRef.current = true;
    setSaveError(null);
    setStatus("saving");
    void (async () => {
      try {
        const updated = await writeBackRefined({
          promptId: saved.id,
          body: refined.body,
          update: api.updatePrompt,
          seed: seedRefinedDirection
        });
        if (!aliveRef.current) return;
        setSaved(updated);
        setStatus("saved");
      } catch (err) {
        console.warn("[prompt-enhancer] \u4F18\u5316\u7A3F\u5199\u56DE\u91CD\u8BD5\u5931\u8D25", err);
        if (!aliveRef.current) return;
        setSaveError(reasonOf2(err));
        setStatus("writeBackFailed");
      } finally {
        busyRef.current = false;
      }
    })();
  };
  const copy = (text) => {
    void (async () => {
      try {
        await navigator.clipboard.writeText(text);
        if (aliveRef.current) setCopied(true);
      } catch (err) {
        console.warn("[prompt-enhancer] \u590D\u5236\u5931\u8D25", err);
      }
    })();
  };
  const apply2 = (text) => {
    inputActions.setDraft(text);
    close();
  };
  if (settings.showAIPolishButton === false) return null;
  const busyKey = status === "polishing" ? "ai.polishing" : status === "refining" ? "ai.refining" : status === "saving" ? "ai.saving" : null;
  const empty = draft.trim() === "";
  const hint = busyKey !== null ? t(busyKey) : empty ? t("ai.empty") : t("ai.tip");
  const evictedNotice = evicted ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: MUTED, children: t("ai.evicted") }) : null;
  const showRefined = status === "refined" || status === "saveFailed";
  const dialogLabel = status === "done" ? t("ai.result") : showRefined || status === "saving" || status === "writeBackFailed" ? t("ai.refined") : status === "saved" ? t("ai.saved") : t("ai.button");
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { ref: rootRef, style: WRAP, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "button",
      {
        type: "button",
        style: { ...BUTTON, cursor: empty || busyKey !== null ? "default" : "pointer", opacity: empty || busyKey !== null ? 0.6 : 1 },
        title: hint,
        "aria-label": t("ai.button"),
        "aria-busy": busyKey !== null,
        disabled: empty || busyKey !== null,
        onClick: () => {
          if (empty) return;
          run(draft);
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SparkleIcon, {}),
          settings.aiPolishButtonIconOnly === false && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t("ai.button") })
        ]
      }
    ),
    aiVisible && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: ANCHOR, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { role: "dialog", "aria-label": dialogLabel, style: PANEL, children: [
      busyKey !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { role: "status", "aria-live": "polite", style: MUTED, children: t(busyKey) }),
      status === "error" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { role: "status", "aria-live": "polite", style: MUTED, children: errorKey === null ? t("ai.fail") : t(errorKey) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: ACTIONS, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: PANEL_BUTTON, onClick: close, children: t("ai.close") }) })
      ] }),
      status === "done" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: HEADER, children: t("ai.result") }),
        refineErrorKey !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { role: "status", "aria-live": "polite", style: MUTED, children: t(refineErrorKey) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: PILLS, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              style: pill(!showOriginal),
              "aria-pressed": !showOriginal,
              onClick: () => setShowOriginal(false),
              children: t("ai.polished")
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              style: pill(showOriginal),
              "aria-pressed": showOriginal,
              onClick: () => setShowOriginal(true),
              children: t("ai.original")
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "textarea",
          {
            value: showOriginal ? original : polished,
            readOnly: showOriginal,
            rows: 7,
            "aria-label": t(showOriginal ? "ai.original" : "ai.polished"),
            onChange: (ev) => setPolished(ev.target.value),
            style: { ...TEXTAREA, opacity: showOriginal ? 0.75 : 1 }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: ACTIONS, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: PANEL_BUTTON, onClick: refine, children: t("ai.refine") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: PANEL_BUTTON, onClick: () => copy(polished), children: copied ? t("ai.copied") : t("ai.copy") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: PANEL_BUTTON, onClick: close, children: t("ai.close") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              style: { ...PANEL_BUTTON, borderColor: TOKEN.accent, color: TOKEN.accent },
              onClick: () => apply2(polished),
              children: t("ai.apply")
            }
          )
        ] })
      ] }),
      showRefined && refined !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: HEADER, children: t("ai.refined") }),
        status === "saveFailed" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { role: "alert", style: ERROR, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t("ai.saveFail") }),
          saveError !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: ERROR_DETAIL, title: saveError, children: saveError })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: META, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: META_KEY, children: t("ai.fieldTitle") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: META_VALUE, children: refined.title }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: META_KEY, children: t("ai.fieldTags") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: META_VALUE, children: refined.tags.join(" / ") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: META_KEY, children: t("ai.fieldSummary") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: META_VALUE, children: refined.summary })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "textarea",
          {
            value: refined.body,
            rows: 7,
            "aria-label": t("ai.refined"),
            onChange: (ev) => setRefined({ ...refined, body: ev.target.value }),
            style: TEXTAREA
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: ACTIONS, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: PANEL_BUTTON, onClick: save, children: t("ai.save") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: PANEL_BUTTON, onClick: () => copy(refined.body), children: copied ? t("ai.copied") : t("ai.copy") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: PANEL_BUTTON, onClick: close, children: t("ai.close") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              style: { ...PANEL_BUTTON, borderColor: TOKEN.accent, color: TOKEN.accent },
              onClick: () => apply2(refined.body),
              children: t("ai.apply")
            }
          )
        ] })
      ] }),
      status === "writeBackFailed" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { role: "alert", style: ERROR, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t("ai.writeBackFail") }),
          saveError !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: ERROR_DETAIL, title: saveError, children: saveError })
        ] }),
        evictedNotice,
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: ACTIONS, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: PANEL_BUTTON, onClick: retryWriteBack, children: t("ai.retryWriteBack") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: PANEL_BUTTON, onClick: close, children: t("ai.close") })
        ] })
      ] }),
      status === "saved" && saved !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { role: "status", "aria-live": "polite", style: MUTED, children: t("ai.saved") }),
        evictedNotice,
        canToggle(saved) ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: MUTED, children: t("ai.toggleMoved") }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: MUTED, children: t("ai.sameAsOriginal") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: PREVIEW, children: previewText(saved.body) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: ACTIONS, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: PANEL_BUTTON, onClick: close, children: t("ai.close") }) })
      ] })
    ] }) })
  ] });
}
var WRAP = {
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  gap: 6
};
var ICON = { display: "block", flex: "0 0 auto" };
var BUTTON = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  height: 24,
  padding: "0 8px",
  fontSize: 12,
  color: TOKEN.fg,
  background: "transparent",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  cursor: "pointer"
};
var ANCHOR = {
  position: "absolute",
  bottom: "calc(100% + 6px)",
  left: 0,
  zIndex: 31,
  maxWidth: "calc(100vw - 24px)"
};
var PANEL = {
  ...overlayBase,
  display: "flex",
  flexDirection: "column",
  gap: 6,
  width: 380,
  maxHeight: 420,
  overflowY: "auto",
  padding: 8,
  fontSize: 12
};
var HEADER = { color: TOKEN.muted, fontSize: 11, fontWeight: 600 };
var MUTED = { color: TOKEN.muted, fontSize: 11, overflowWrap: "anywhere" };
var ERROR = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  color: TOKEN.fg,
  fontSize: 11
};
var ERROR_DETAIL = { color: TOKEN.muted, overflowWrap: "anywhere" };
var META = {
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  columnGap: 6,
  rowGap: 2,
  alignItems: "baseline"
};
var META_KEY = { color: TOKEN.muted, fontSize: 11, whiteSpace: "nowrap" };
var META_VALUE = { color: TOKEN.fg, fontSize: 11, overflowWrap: "anywhere" };
var PREVIEW = {
  color: TOKEN.muted,
  fontSize: 11,
  overflowWrap: "anywhere",
  whiteSpace: "pre-wrap",
  maxHeight: 72,
  overflowY: "auto",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  padding: "4px 6px"
};
var PILLS = { display: "flex", gap: 4, alignItems: "center" };
var pill = (active) => ({
  padding: "1px 10px",
  fontSize: 11,
  lineHeight: "16px",
  color: active ? TOKEN.accent : TOKEN.muted,
  background: "transparent",
  border: `1px solid ${active ? TOKEN.accent : TOKEN.border}`,
  borderRadius: 999,
  cursor: "pointer"
});
var TEXTAREA = {
  width: "100%",
  boxSizing: "border-box",
  resize: "vertical",
  padding: "6px 8px",
  color: TOKEN.fg,
  background: "transparent",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  fontSize: 12,
  fontFamily: "inherit",
  outline: "none"
};
var ACTIONS = { display: "flex", gap: 6, justifyContent: "flex-end" };
var PANEL_BUTTON = {
  padding: "2px 8px",
  fontSize: 11,
  lineHeight: "16px",
  color: TOKEN.fg,
  background: "transparent",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  cursor: "pointer"
};

// src/client/components/HashSuggestOverlay.tsx
var React3 = __toESM(require("react"), 1);

// src/client/utils/hash-token.ts
function readHashToken(draft) {
  const m = draft.match(/(^|\s)#([^\s#]*)$/);
  if (!m) return null;
  const start = m.index + m[1].length;
  return { query: m[2] ?? "", start };
}
function shouldShowSuggest(input) {
  return input.open && input.tokenKey !== null && input.dismissedKey !== input.tokenKey;
}
function nextDismissedKey(open, dismissedKey) {
  return open ? dismissedKey : null;
}
function replaceHashToken(draft, body) {
  const token = readHashToken(draft);
  if (!token) return draft;
  const head = draft.slice(0, token.start).replace(/\s+$/, "");
  return head ? `${head} ${body}` : body;
}
function filterPrompts(prompts, query, limit = 5) {
  const q = query.trim().toLowerCase();
  if (!q) return prompts.slice(0, limit);
  const scored = [];
  for (const p of prompts) {
    const title = p.title.toLowerCase();
    const tags = p.tags.join(" ").toLowerCase();
    const body = p.body.toLowerCase();
    const score = title.includes(q) ? 3 : tags.includes(q) ? 2 : body.includes(q) ? 1 : 0;
    if (score > 0) scored.push({ p, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.p);
}

// src/client/utils/insert.ts
function composeDraft(draft, body, mode) {
  const send = mode === "insert-send";
  if (mode === "overwrite") return { draft: body, send };
  return { draft: draft ? `${draft}
${body}` : body, send };
}
function promptSummary(p, max = 60) {
  const source = p.summary?.trim() || p.body.replace(/\s+/g, " ").trim();
  return source.length > max ? `${source.slice(0, max)}\u2026` : source;
}

// src/client/components/TemplateVariablesDialog.tsx
var React2 = __toESM(require("react"), 1);

// src/client/utils/i18n.ts
var NS = "prompt-enhancer";
var zh = {
  "button.title": "\u8BCD\u5E93",
  "button.tip": "\u6253\u5F00\u63D0\u793A\u8BCD\u5E93",
  "list.title": "\u5E38\u7528\u63D0\u793A\u8BCD",
  "list.empty": "\u8FD8\u6CA1\u6709\u63D0\u793A\u8BCD",
  "list.loading": "\u52A0\u8F7D\u4E2D\u2026",
  "action.insert": "\u63D2\u5165",
  "action.overwrite": "\u8986\u76D6",
  "action.send": "\u63D2\u5165\u5E76\u53D1\u9001",
  "hash.title": "\u9009\u62E9\u63D0\u793A\u8BCD",
  "hash.empty": "\u6CA1\u6709\u5339\u914D\u7684\u63D0\u793A\u8BCD",
  "vars.title": "\u586B\u5145\u6A21\u677F\u53D8\u91CF",
  "vars.hint": "{{\u53D8\u91CF}} \u4F1A\u5728\u63D2\u5165\u65F6\u66FF\u6362\u4E3A\u4E0B\u9762\u7684\u5185\u5BB9",
  "vars.fill": "\u586B\u5165",
  "vars.cancel": "\u53D6\u6D88",
  "vars.remembered": "\u5DF2\u5E26\u51FA\u4E0A\u6B21\u586B\u5199\u7684\u503C",
  "error.load": "\u52A0\u8F7D\u63D0\u793A\u8BCD\u5931\u8D25",
  "error.use": "\u8BB0\u5F55\u4F7F\u7528\u5931\u8D25",
  "error.noPrompt": "\u8BE5\u63D0\u793A\u8BCD\u5DF2\u4E0D\u5B58\u5728",
  "ai.button": "AI \u4F18\u5316",
  "ai.tip": "\u7528 AI \u4F18\u5316\u5F53\u524D\u8F93\u5165\u6846\u5185\u5BB9\uFF08\u53EF\u80FD\u9700\u8981\u4E00\u4E24\u5206\u949F\uFF09",
  "ai.empty": "\u8F93\u5165\u6846\u4E3A\u7A7A\uFF0C\u5148\u5199\u70B9\u5185\u5BB9",
  "ai.unavailable": "AI \u4E0D\u53EF\u7528\uFF1A\u672A\u914D\u7F6E\u53EF\u7528\u6A21\u578B",
  "ai.polishing": "\u6B63\u5728\u8C03\u7528 AI\u2026",
  "ai.result": "AI \u4F18\u5316\u7ED3\u679C",
  "ai.original": "\u539F\u6587",
  "ai.polished": "\u4F18\u5316\u7A3F",
  "ai.apply": "\u5E94\u7528\u5230\u8F93\u5165\u6846",
  "ai.copy": "\u590D\u5236",
  "ai.copied": "\u5DF2\u590D\u5236",
  "ai.close": "\u5173\u95ED",
  "ai.fail": "AI \u8C03\u7528\u5931\u8D25",
  "ai.timeout": "AI \u8BF7\u6C42\u8D85\u65F6\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5",
  "ai.refine": "\u4E00\u952E\u5B8C\u5584",
  "ai.refining": "\u6B63\u5728\u5B8C\u5584\u2026",
  "ai.refined": "\u5B8C\u5584\u7A3F",
  "ai.fieldTitle": "\u6807\u9898",
  "ai.fieldTags": "\u6807\u7B7E",
  "ai.fieldSummary": "\u6458\u8981",
  "ai.save": "\u5B58\u5165\u8BCD\u5E93",
  "ai.saving": "\u6B63\u5728\u5B58\u5165\u2026",
  "ai.saved": "\u5DF2\u5B58\u5165\u8BCD\u5E93",
  "ai.saveFail": "\u5B58\u5165\u8BCD\u5E93\u5931\u8D25",
  "ai.writeBackFail": "\u5DF2\u5B58\u5165\u539F\u6587\uFF0C\u4F46\u4F18\u5316\u7A3F\u5199\u56DE\u5931\u8D25",
  "ai.retryWriteBack": "\u91CD\u8BD5\u5199\u56DE",
  "ai.sameAsOriginal": "\u5B8C\u5584\u7A3F\u4E0E\u539F\u6587\u76F8\u540C\uFF0C\u65E0\u9700\u5207\u6362",
  "ai.evicted": "\u5DF2\u5B58\u5165\u8BCD\u5E93\uFF1B\u6709\u65E7\u63D0\u793A\u8BCD\u56E0\u8D85\u51FA\u4E0A\u9650\u88AB\u6DD8\u6C70",
  "ai.toggleMoved": "\u300C\u539F\u6587 / \u4F18\u5316\u7A3F\u300D\u7684\u5BF9\u6BD4\u4E0E\u5207\u6362\u5DF2\u79FB\u81F3\u7BA1\u7406\u9762\u677F\u7684\u8BE6\u60C5\u9875",
  // ── P6：管理面板（列表 / 详情 / §4.4 并排对比）────────────────────────
  "list.manage": "\u7BA1\u7406",
  "list.saveDraft": "\u5F53\u524D\u8349\u7A3F\u5B58\u4E3A\u63D0\u793A\u8BCD",
  // 沉淀入口 B：选中聊天文字浮出的按钮。
  "selection.save": "\u5B58\u4E3A\u63D0\u793A\u8BCD",
  "manager.title": "\u63D0\u793A\u8BCD\u7BA1\u7406",
  "manager.close": "\u5173\u95ED",
  "manager.tab.list": "\u5217\u8868",
  "manager.tab.tags": "\u6807\u7B7E",
  "manager.tab.trash": "\u56DE\u6536\u7AD9",
  "manager.tab.transfer": "\u5BFC\u5165\u5BFC\u51FA",
  "manager.list.new": "\u65B0\u5EFA",
  "manager.list.search": "\u641C\u7D22\u63D0\u793A\u8BCD",
  "manager.list.searchPlaceholder": "\u641C\u7D22\u6807\u9898 / \u6B63\u6587 / \u6807\u7B7E",
  "manager.list.sort": "\u6392\u5E8F",
  "manager.list.sortDefault": "\u9ED8\u8BA4",
  "manager.list.sortUpdated": "\u6700\u8FD1\u66F4\u65B0",
  "manager.list.sortUsed": "\u6700\u5E38\u4F7F\u7528",
  "manager.list.sortCreated": "\u6700\u8FD1\u521B\u5EFA",
  "manager.list.tagFilter": "\u6807\u7B7E\u7B5B\u9009",
  "manager.list.allTags": "\u5168\u90E8\u6807\u7B7E",
  "manager.list.tagsFailed": "\u6807\u7B7E\u52A0\u8F7D\u5931\u8D25",
  "manager.list.usage": "\u7528\u91CF",
  "manager.list.edit": "\u7F16\u8F91",
  "manager.list.delete": "\u5220\u9664",
  "manager.list.deleted": "\u5DF2\u79FB\u5165\u56DE\u6536\u7AD9",
  "manager.list.evicted": "\u5DF2\u4FDD\u5B58\uFF1B\u6709\u65E7\u63D0\u793A\u8BCD\u56E0\u8D85\u51FA\u4E0A\u9650\u88AB\u6DD8\u6C70",
  "manager.edit.newTitle": "\u65B0\u5EFA\u63D0\u793A\u8BCD",
  "manager.edit.editTitle": "\u7F16\u8F91\u63D0\u793A\u8BCD",
  "manager.edit.title": "\u6807\u9898",
  "manager.edit.body": "\u6B63\u6587",
  "manager.edit.tags": "\u6807\u7B7E",
  "manager.edit.summary": "\u6458\u8981",
  "manager.edit.tagsPlaceholder": "\u7528\u9017\u53F7\u5206\u9694\uFF0C\u5982\uFF1A\u5199\u4F5C, \u7FFB\u8BD1",
  "manager.edit.bodyRequired": "\u6B63\u6587\u4E0D\u80FD\u4E3A\u7A7A",
  "manager.edit.save": "\u4FDD\u5B58",
  "manager.edit.saving": "\u6B63\u5728\u4FDD\u5B58\u2026",
  "manager.edit.saved": "\u5DF2\u4FDD\u5B58",
  "manager.edit.back": "\u8FD4\u56DE\u5217\u8868",
  // R59（F-5）：中性表述——宿主不记录方向，客户端不得声称某一栏是原文或优化稿。
  "manager.compare.title": "\u4E24\u4EFD\u6B63\u6587",
  "manager.compare.current": "\u5F53\u524D\u6B63\u6587",
  "manager.compare.counterpart": "\u53E6\u4E00\u4EFD",
  "manager.compare.toggle": "\u4E92\u6362\u4E24\u4EFD\u6B63\u6587",
  "manager.compare.toggling": "\u6B63\u5728\u4E92\u6362\u2026",
  "manager.compare.unknownDirection": "\u5BBF\u4E3B\u4E0D\u8BB0\u5F55\u54EA\u4E00\u4EFD\u662F\u539F\u6587\uFF0C\u8FD9\u91CC\u53EA\u5E76\u5217\u4E24\u4EFD\u6B63\u6587\uFF1B\u4E92\u6362\u540E\u4E24\u4EFD\u5BF9\u8C03\u3002",
  // P7 T4（I-1 根治）：方向已按提示词持久化（pl:refined-dir:<id>），已知方向时如实标注。
  "manager.compare.original": "\u539F\u6587",
  "manager.compare.refined": "\u4F18\u5316\u7A3F",
  "manager.compare.directionPersisted": "\u65B9\u5411\u5DF2\u968F\u8FD9\u6761\u63D0\u793A\u8BCD\u8BB0\u5F55\uFF1A\u5173\u95ED\u9762\u677F\u518D\u6253\u5F00\uFF0C\u4E24\u680F\u6807\u6CE8\u4E0D\u53D8\u3002",
  // ── P6 T4：标签页 / 回收站页 / 共享确认弹窗 / 淘汰二次确认 ────────────────
  "manager.tags.empty": "\u8FD8\u6CA1\u6709\u6807\u7B7E",
  "manager.tags.usage": "\u7528\u91CF",
  "manager.tags.rename": "\u91CD\u547D\u540D",
  "manager.tags.renameSave": "\u4FDD\u5B58",
  "manager.tags.renameCancel": "\u53D6\u6D88",
  "manager.tags.delete": "\u5220\u9664",
  "manager.tags.inUseBefore": "\u8BE5\u6807\u7B7E\u6B63\u5728\u88AB",
  "manager.tags.inUseAfter": "\u6761\u63D0\u793A\u8BCD\u4F7F\u7528\uFF0C\u65E0\u6CD5\u5220\u9664\uFF08\u4E0E\u5BBF\u4E3B 400 \u8BED\u4E49\u4E00\u81F4\uFF09",
  "manager.tags.renamed": "\u5DF2\u91CD\u547D\u540D\u6807\u7B7E",
  "manager.tags.deleted": "\u5DF2\u5220\u9664\u6807\u7B7E",
  "manager.tags.renameFailed": "\u91CD\u547D\u540D\u6807\u7B7E\u5931\u8D25",
  "manager.tags.deleteFailed": "\u5220\u9664\u6807\u7B7E\u5931\u8D25",
  "manager.tags.clean": "\u6E05\u7406\u65E0\u7528\u6807\u7B7E",
  "manager.tags.cleaned": "\u5DF2\u6E05\u7406\u65E0\u7528\u6807\u7B7E\uFF1A",
  "manager.tags.cleanNone": "\u6CA1\u6709\u53EF\u6E05\u7406\u7684\u65E0\u7528\u6807\u7B7E",
  "manager.tags.cleanFailed": "\u4EE5\u4E0B\u6807\u7B7E\u6E05\u7406\u5931\u8D25\uFF1A",
  "manager.tags.loadFailed": "\u6807\u7B7E\u52A0\u8F7D\u5931\u8D25",
  "manager.trash.empty": "\u56DE\u6536\u7AD9\u662F\u7A7A\u7684",
  "manager.trash.deletedAt": "\u5220\u9664\u65F6\u95F4",
  "manager.trash.usage": "\u7528\u91CF",
  "manager.trash.restore": "\u6062\u590D",
  "manager.trash.restored": "\u5DF2\u6062\u590D",
  "manager.trash.restoreFailed": "\u6062\u590D\u5931\u8D25",
  "manager.trash.purge": "\u6C38\u4E45\u5220\u9664",
  "manager.trash.purged": "\u5DF2\u6C38\u4E45\u5220\u9664",
  "manager.trash.purgeFailed": "\u6C38\u4E45\u5220\u9664\u5931\u8D25",
  "manager.trash.emptyAll": "\u6E05\u7A7A\u56DE\u6536\u7AD9",
  "manager.trash.emptied": "\u56DE\u6536\u7AD9\u5DF2\u6E05\u7A7A",
  "manager.trash.emptyFailed": "\u6E05\u7A7A\u56DE\u6536\u7AD9\u5931\u8D25",
  "manager.trash.loadFailed": "\u56DE\u6536\u7AD9\u52A0\u8F7D\u5931\u8D25",
  // 共享确认弹窗（confirm.ts 的 requestConfirm；文案键由响应式渲染点翻译）
  "manager.confirm.confirm": "\u786E\u8BA4",
  "manager.confirm.cancel": "\u53D6\u6D88",
  "manager.confirm.purgeTitle": "\u6C38\u4E45\u5220\u9664",
  "manager.confirm.purgeMessage": "\u5220\u9664\u540E\u65E0\u6CD5\u6062\u590D\uFF0C\u786E\u8BA4\u7EE7\u7EED\uFF1F",
  "manager.confirm.emptyTitle": "\u6E05\u7A7A\u56DE\u6536\u7AD9",
  "manager.confirm.emptyMessage": "\u56DE\u6536\u7AD9\u5185\u7684\u5168\u90E8\u63D0\u793A\u8BCD\u5C06\u88AB\u6C38\u4E45\u5220\u9664\uFF0C\u4E14\u65E0\u6CD5\u6062\u590D\u3002",
  // §4.4 淘汰二次确认（客户端预检，capture.ts 发起）
  "manager.evict.title": "\u8BCD\u5E93\u5DF2\u8FBE\u4E0A\u9650",
  "manager.evict.message": "\u7EE7\u7EED\u4FDD\u5B58\u4F1A\u76F4\u63A5\u5220\u9664\u4EE5\u4E0B\u65E7\u63D0\u793A\u8BCD\uFF08\u7269\u7406\u5220\u9664\uFF0C\u4E0D\u8FDB\u56DE\u6536\u7AD9\uFF09\uFF1A",
  "manager.evict.confirm": "\u7EE7\u7EED\u4FDD\u5B58",
  "manager.evict.cancel": "\u53D6\u6D88",
  "error.save": "\u4FDD\u5B58\u5931\u8D25",
  "error.create": "\u521B\u5EFA\u5931\u8D25",
  "error.delete": "\u5220\u9664\u5931\u8D25",
  "error.rollbackNoSource": "\u8BE5\u63D0\u793A\u8BCD\u6CA1\u6709\u53EF\u5207\u6362\u7684\u539F\u6587",
  // ── P6 T5：导入导出（D5 / §4.3）────────────────────────────────────────
  "transfer.tooLarge": "\u5907\u4EFD\u6587\u4EF6\u8FC7\u5927\uFF08\u8D85\u8FC7 5 MB\uFF09\uFF0C\u672A\u5BFC\u5165",
  "transfer.badJson": "\u5907\u4EFD\u6587\u4EF6\u4E0D\u662F\u5408\u6CD5\u7684 JSON",
  "manager.transfer.export": "\u5BFC\u51FA\u5907\u4EFD",
  "manager.transfer.exporting": "\u6B63\u5728\u5BFC\u51FA\u2026",
  "manager.transfer.exportUnavailable": "\u5F53\u524D\u5BBF\u4E3B\u672A\u63D0\u4F9B\u76EE\u5F55\u9009\u62E9\u80FD\u529B\uFF0C\u6682\u65F6\u65E0\u6CD5\u5BFC\u51FA\u5907\u4EFD",
  "manager.transfer.exported": "\u5907\u4EFD\u5DF2\u5199\u5165",
  "manager.transfer.prompts": "\u63D0\u793A\u8BCD",
  "manager.transfer.tags": "\u6807\u7B7E",
  "manager.transfer.exportFailed": "\u5BFC\u51FA\u5931\u8D25",
  "manager.transfer.import": "\u9009\u62E9\u5907\u4EFD\u6587\u4EF6\u2026",
  "manager.transfer.readFailed": "\u8BFB\u53D6\u6240\u9009\u6587\u4EF6\u5931\u8D25",
  "manager.transfer.importFailed": "\u5BFC\u5165\u5931\u8D25",
  "manager.transfer.noStats": "\u5BBF\u4E3B\u9884\u89C8\u54CD\u5E94\u7F3A\u5C11\u6761\u6570",
  "manager.transfer.previewAdded": "\u65B0\u589E",
  "manager.transfer.previewOverwritten": "\u8986\u76D6",
  "manager.transfer.previewTotal": "\u5408\u8BA1",
  "manager.transfer.overwriteWarning": "\u540C id \u7684\u63D0\u793A\u8BCD\u5C06\u88AB\u8986\u76D6\uFF0C\u4E14\u4E0D\u53EF\u64A4\u9500\u3002",
  "manager.transfer.cancel": "\u53D6\u6D88",
  "manager.transfer.confirm": "\u786E\u8BA4\u5BFC\u5165",
  "manager.transfer.importing": "\u6B63\u5728\u5BFC\u5165\u2026",
  "manager.transfer.imported": "\u5BFC\u5165\u5B8C\u6210",
  "manager.transfer.countsFailed": "\u5BFC\u5165\u5DF2\u5B8C\u6210\uFF0C\u4F46\u8BFB\u53D6\u5F53\u524D\u6761\u6570\u5931\u8D25",
  "manager.transfer.overLimitBefore": "\u672C\u6B21\u5BFC\u5165\u6D89\u53CA",
  "manager.transfer.overLimitMid": "\u6761\uFF0C\u5BFC\u5165\u540E\u5E93\u4E2D\u5171",
  "manager.transfer.overLimitAfter": "\u6761\uFF0C\u5DF2\u8D85\u8FC7\u4E0A\u9650",
  "manager.transfer.overLimitNote": "\u6761\u3002\u5BFC\u5165\u4E0D\u4F1A\u89E6\u53D1\u6DD8\u6C70\uFF0C\u6DD8\u6C70\u53EA\u4F1A\u5728\u540E\u7EED\u65B0\u5EFA\u63D0\u793A\u8BCD\u65F6\u53D1\u751F\u3002",
  // ── P7 T2：技能导出（规格 §7.6 / 验收 15、17）─────────────────────────────
  "manager.skill.open": "\u5BFC\u51FA\u4E3A\u6280\u80FD",
  "manager.skill.title": "\u5BFC\u51FA\u4E3A\u6280\u80FD",
  "manager.skill.back": "\u8FD4\u56DE\u7BA1\u7406\u9762\u677F",
  "manager.skill.hint": "\u52FE\u9009\u63D0\u793A\u8BCD \u2192 \u9010\u6761\u300CAI \u8865\u5168\u540D\u79F0\u4E0E\u63CF\u8FF0\u300D\u2192 \u5BFC\u51FA\u4E3A\u5B98\u65B9 DSH \u6280\u80FD\uFF08\u5199\u5165 skills/<name>/SKILL.md\uFF0C\u5BBF\u4E3B\u5373\u65F6\u53D1\u73B0\uFF09\u3002",
  "manager.skill.selectAll": "\u5168\u9009",
  "manager.skill.selectNone": "\u6E05\u9664\u9009\u62E9",
  "manager.skill.tagFilter": "\u6309\u6807\u7B7E\u7B5B\u9009",
  "manager.skill.allTags": "\u5168\u90E8\u6807\u7B7E",
  "manager.skill.selected": "\u5DF2\u9009",
  "manager.skill.nameLabel": "\u6280\u80FD\u540D",
  "manager.skill.nameLocked": "\u5DF2\u9501\u5B9A\uFF1A\u6CBF\u7528\u5DF2\u5BFC\u51FA\u6280\u80FD\u7684\u76EE\u5F55\u540D",
  "manager.skill.aiNameIgnored": "AI \u540D\u4EC5\u4F9B\u53C2\u8003\uFF0C\u4E0D\u4F1A\u6539\u76EE\u5F55",
  "manager.skill.describe": "AI \u8865\u5168\u540D\u79F0\u4E0E\u63CF\u8FF0",
  "manager.skill.describing": "\u6B63\u5728\u8865\u5168\u2026",
  "manager.skill.export": "\u5F00\u59CB\u5BFC\u51FA",
  "manager.skill.exporting": "\u6B63\u5728\u5BFC\u51FA\u2026",
  "manager.skill.loadFailed": "\u63D0\u793A\u8BCD\u52A0\u8F7D\u5931\u8D25",
  "manager.skill.empty": "\u6CA1\u6709\u53EF\u5BFC\u51FA\u7684\u63D0\u793A\u8BCD",
  "manager.skill.nameMissing": "\u8BE5\u6761\u8FD8\u6CA1\u6709\u6280\u80FD\u540D\uFF1A\u5148\u70B9\u300CAI \u8865\u5168\u540D\u79F0\u4E0E\u63CF\u8FF0\u300D\uFF08\u6216\u5B83\u5DF2\u5BFC\u51FA\u8FC7\u4E00\u6B21\uFF09",
  "manager.skill.nameInvalid": "\u6280\u80FD\u540D\u975E\u6CD5\uFF1Akebab \u5316\u540E\u5FC5\u987B\u662F\u5C0F\u5199 kebab-case\uFF08\u4EC5\u5B57\u6BCD\u3001\u6570\u5B57\u3001\u8FDE\u5B57\u7B26\uFF09",
  "manager.skill.descMissing": "\u6458\u8981\u3001AI \u63CF\u8FF0\u3001\u6B63\u6587\u9996\u884C\u4E0E\u6807\u9898\u5168\u4E3A\u7A7A\uFF0C\u5BBF\u4E3B\u4F1A\u62D2\u7EDD\u5BFC\u51FA",
  "manager.skill.describeFailed": "AI \u8865\u5168\u5931\u8D25",
  "manager.skill.exportFailed": "\u5BFC\u51FA\u5931\u8D25",
  "manager.skill.pathMissing": "\u5BBF\u4E3B\u672A\u8FD4\u56DE\u76EE\u6807\u6587\u4EF6\u8DEF\u5F84\uFF08\u5951\u7EA6\u6F02\u79FB\uFF09\uFF0C\u672C\u6761\u6309\u5931\u8D25\u5904\u7406",
  "manager.skill.conflictTitle": "\u540C\u540D\u6280\u80FD\u76EE\u5F55\u5DF2\u5B58\u5728",
  "manager.skill.conflictMessage": "\u8BE5\u76EE\u5F55\u4E0D\u5C5E\u4E8E\u672C\u63D2\u4EF6\u7684\u4EFB\u4F55\u63D0\u793A\u8BCD\uFF08\u53EF\u80FD\u662F\u4F60\u624B\u5199\u7684\u6280\u80FD\uFF09\u3002\u7EE7\u7EED\u5BFC\u51FA\u4F1A\u8986\u76D6\u5B83\u7684 SKILL.md\u3002",
  "manager.skill.summary": "\u5BFC\u51FA\u7ED3\u679C",
  "manager.skill.summaryOk": "\u6210\u529F",
  "manager.skill.summaryFailed": "\u5931\u8D25",
  "manager.skill.summaryDeclined": "\u8DF3\u8FC7",
  "manager.skill.target": "\u76EE\u6807\u6587\u4EF6",
  "manager.skill.declined": "\u5DF2\u8DF3\u8FC7\uFF08\u672A\u786E\u8BA4\u8986\u76D6\u540C\u540D\u76EE\u5F55\uFF09",
  "manager.skill.badgeExported": "\u5DF2\u5BFC\u51FA\u6280\u80FD",
  "manager.skill.badgeStale": "\u6280\u80FD\u5DF2\u8FC7\u671F",
  "manager.skill.reExport": "\u91CD\u65B0\u5BFC\u51FA",
  "manager.skill.reExporting": "\u6B63\u5728\u91CD\u65B0\u5BFC\u51FA\u2026",
  "manager.skill.reExported": "\u5DF2\u91CD\u65B0\u5BFC\u51FA\uFF08\u540C\u540D\u8986\u76D6\uFF0C\u672A\u65B0\u589E\u6280\u80FD\u76EE\u5F55\uFF09",
  "sidebar.entry.title": "\u63D0\u793A\u8BCD",
  "sidebar.entry.tip": "\u6253\u5F00\u63D0\u793A\u8BCD\u7BA1\u7406\u9762\u677F"
};
var en = {
  "button.title": "Library",
  "button.tip": "Open the prompt library",
  "list.title": "Saved prompts",
  "list.empty": "No prompts yet",
  "list.loading": "Loading\u2026",
  "action.insert": "Insert",
  "action.overwrite": "Overwrite",
  "action.send": "Insert & send",
  "hash.title": "Pick a prompt",
  "hash.empty": "No matching prompt",
  "vars.title": "Fill template variables",
  "vars.hint": "Each {{name}} below is substituted when inserted",
  "vars.fill": "Fill in",
  "vars.cancel": "Cancel",
  "vars.remembered": "Filled with values from last time",
  "error.load": "Failed to load prompts",
  "error.use": "Failed to record usage",
  "error.noPrompt": "That prompt no longer exists",
  "ai.button": "AI polish",
  "ai.tip": "Polish the composer draft with AI (may take a minute or two)",
  "ai.empty": "Composer is empty \u2014 write something first",
  "ai.unavailable": "AI unavailable: no usable model configured",
  "ai.polishing": "Calling AI\u2026",
  "ai.result": "AI polish result",
  "ai.original": "Original",
  "ai.polished": "Polished",
  "ai.apply": "Apply to composer",
  "ai.copy": "Copy",
  "ai.copied": "Copied",
  "ai.close": "Close",
  "ai.fail": "AI call failed",
  "ai.timeout": "The AI request timed out, please retry later",
  "ai.refine": "One-click refine",
  "ai.refining": "Refining\u2026",
  "ai.refined": "Refined draft",
  "ai.fieldTitle": "Title",
  "ai.fieldTags": "Tags",
  "ai.fieldSummary": "Summary",
  "ai.save": "Save to library",
  "ai.saving": "Saving\u2026",
  "ai.saved": "Saved to library",
  "ai.saveFail": "Failed to save to library",
  "ai.writeBackFail": "The original was saved, but writing back the refined draft failed",
  "ai.retryWriteBack": "Retry write-back",
  "ai.sameAsOriginal": "The refined draft matches the original \u2014 nothing to toggle",
  "ai.evicted": "Saved to library; older prompts were evicted past the limit",
  "ai.toggleMoved": "The original/refined compare and toggle now live on the manager's detail page",
  // ── P6: manager panel (list / detail / §4.4 side-by-side)──────────────
  "list.manage": "Manage",
  "list.saveDraft": "Save current draft as prompt",
  // Capture entry B: the button floating above a chat selection.
  "selection.save": "Save as prompt",
  "manager.title": "Prompt manager",
  "manager.close": "Close",
  "manager.tab.list": "List",
  "manager.tab.tags": "Tags",
  "manager.tab.trash": "Trash",
  "manager.tab.transfer": "Import & export",
  "manager.list.new": "New",
  "manager.list.search": "Search prompts",
  "manager.list.searchPlaceholder": "Search title, body or tags",
  "manager.list.sort": "Sort",
  "manager.list.sortDefault": "Default",
  "manager.list.sortUpdated": "Recently updated",
  "manager.list.sortUsed": "Most used",
  "manager.list.sortCreated": "Recently created",
  "manager.list.tagFilter": "Tag filter",
  "manager.list.allTags": "All tags",
  "manager.list.tagsFailed": "Failed to load tags",
  "manager.list.usage": "Uses",
  "manager.list.edit": "Edit",
  "manager.list.delete": "Delete",
  "manager.list.deleted": "Moved to trash",
  "manager.list.evicted": "Saved; older prompts were evicted past the limit",
  "manager.edit.newTitle": "New prompt",
  "manager.edit.editTitle": "Edit prompt",
  "manager.edit.title": "Title",
  "manager.edit.body": "Body",
  "manager.edit.tags": "Tags",
  "manager.edit.summary": "Summary",
  "manager.edit.tagsPlaceholder": "Comma separated, e.g. writing, translation",
  "manager.edit.bodyRequired": "Body must not be empty",
  "manager.edit.save": "Save",
  "manager.edit.saving": "Saving\u2026",
  "manager.edit.saved": "Saved",
  "manager.edit.back": "Back to list",
  // R59 (F-5): neutral wording — the host does not record which body is the original.
  "manager.compare.title": "Two bodies",
  "manager.compare.current": "Current body",
  "manager.compare.counterpart": "The other body",
  "manager.compare.toggle": "Swap the two bodies",
  "manager.compare.toggling": "Swapping\u2026",
  "manager.compare.unknownDirection": "The host does not record which body is the original, so both are shown side by side; swapping exchanges them.",
  // P7 T4 (root fix for I-1): the direction is persisted per prompt (pl:refined-dir:<id>), so a known direction is labelled as such.
  "manager.compare.original": "Original",
  "manager.compare.refined": "Refined draft",
  "manager.compare.directionPersisted": "The direction is recorded with this prompt: close the panel and reopen it and the labels stay the same.",
  // ── P6 T4: tags / trash / shared confirm / pre-eviction confirmation ─────
  "manager.tags.empty": "No tags yet",
  "manager.tags.usage": "Uses",
  "manager.tags.rename": "Rename",
  "manager.tags.renameSave": "Save",
  "manager.tags.renameCancel": "Cancel",
  "manager.tags.delete": "Delete",
  "manager.tags.inUseBefore": "This tag is used by",
  "manager.tags.inUseAfter": "prompts and cannot be deleted (same semantics as the host 400)",
  "manager.tags.renamed": "Tag renamed",
  "manager.tags.deleted": "Tag deleted",
  "manager.tags.renameFailed": "Failed to rename the tag",
  "manager.tags.deleteFailed": "Failed to delete the tag",
  "manager.tags.clean": "Clean unused tags",
  "manager.tags.cleaned": "Unused tags cleaned:",
  "manager.tags.cleanNone": "No unused tags to clean",
  "manager.tags.cleanFailed": "These tags could not be cleaned:",
  "manager.tags.loadFailed": "Failed to load tags",
  "manager.trash.empty": "The trash is empty",
  "manager.trash.deletedAt": "Deleted",
  "manager.trash.usage": "Uses",
  "manager.trash.restore": "Restore",
  "manager.trash.restored": "Restored",
  "manager.trash.restoreFailed": "Failed to restore",
  "manager.trash.purge": "Delete forever",
  "manager.trash.purged": "Deleted forever",
  "manager.trash.purgeFailed": "Failed to delete forever",
  "manager.trash.emptyAll": "Empty trash",
  "manager.trash.emptied": "Trash emptied",
  "manager.trash.emptyFailed": "Failed to empty the trash",
  "manager.trash.loadFailed": "Failed to load the trash",
  // Shared confirm dialog (confirm.ts#requestConfirm; labels are keys translated at the render point)
  "manager.confirm.confirm": "Confirm",
  "manager.confirm.cancel": "Cancel",
  "manager.confirm.purgeTitle": "Delete forever",
  "manager.confirm.purgeMessage": "This cannot be undone. Continue?",
  "manager.confirm.emptyTitle": "Empty trash",
  "manager.confirm.emptyMessage": "Every prompt in the trash will be permanently deleted and cannot be recovered.",
  // 4.4 pre-eviction confirmation (client-side pre-check, raised by capture.ts)
  "manager.evict.title": "Library limit reached",
  "manager.evict.message": "Saving now deletes these older prompts outright (no trash, unrecoverable):",
  "manager.evict.confirm": "Save anyway",
  "manager.evict.cancel": "Cancel",
  "error.save": "Failed to save",
  "error.create": "Failed to create",
  "error.delete": "Failed to delete",
  "error.rollbackNoSource": "This prompt has no original to toggle",
  // ── P6 T5: import / export (D5 / 4.3)────────────────────────────────────
  "transfer.tooLarge": "The backup file is too large (over 5 MB) and was not imported",
  "transfer.badJson": "The backup file is not valid JSON",
  "manager.transfer.export": "Export backup",
  "manager.transfer.exporting": "Exporting\u2026",
  "manager.transfer.exportUnavailable": "This host exposes no directory picker, so exporting is unavailable",
  "manager.transfer.exported": "Backup written to",
  "manager.transfer.prompts": "Prompts",
  "manager.transfer.tags": "Tags",
  "manager.transfer.exportFailed": "Export failed",
  "manager.transfer.import": "Choose a backup file\u2026",
  "manager.transfer.readFailed": "Failed to read the selected file",
  "manager.transfer.importFailed": "Import failed",
  "manager.transfer.noStats": "The host preview response carries no counts",
  "manager.transfer.previewAdded": "Added",
  "manager.transfer.previewOverwritten": "Overwritten",
  "manager.transfer.previewTotal": "Total",
  "manager.transfer.overwriteWarning": "Prompts sharing an id will be overwritten, and this cannot be undone.",
  "manager.transfer.cancel": "Cancel",
  "manager.transfer.confirm": "Confirm import",
  "manager.transfer.importing": "Importing\u2026",
  "manager.transfer.imported": "Import finished",
  "manager.transfer.countsFailed": "The import finished, but reading the current prompt count failed",
  "manager.transfer.overLimitBefore": "This import covered",
  "manager.transfer.overLimitMid": "prompts; the library now holds",
  "manager.transfer.overLimitAfter": "prompts, above the limit of",
  "manager.transfer.overLimitNote": "prompts. The import evicted nothing \u2014 eviction only happens on later creates.",
  // ── P7 T2: skill export (spec 7.6 / acceptance 15, 17)────────────────────
  "manager.skill.open": "Export as skill",
  "manager.skill.title": "Export as skills",
  "manager.skill.back": "Back to the manager",
  "manager.skill.hint": "Tick prompts, fill names & descriptions with AI per item, then export them as official DSH skills (written to skills/<name>/SKILL.md and picked up by the host right away).",
  "manager.skill.selectAll": "Select all",
  "manager.skill.selectNone": "Clear selection",
  "manager.skill.tagFilter": "Filter by tag",
  "manager.skill.allTags": "All tags",
  "manager.skill.selected": "Selected",
  "manager.skill.nameLabel": "Skill name",
  "manager.skill.nameLocked": "locked: keeps the exported skill folder name",
  "manager.skill.aiNameIgnored": "the AI name is only a suggestion and will not rename the folder",
  "manager.skill.describe": "Fill names & descriptions with AI",
  "manager.skill.describing": "Filling\u2026",
  "manager.skill.export": "Start export",
  "manager.skill.exporting": "Exporting\u2026",
  "manager.skill.loadFailed": "Failed to load prompts",
  "manager.skill.empty": "No prompts to export",
  "manager.skill.nameMissing": 'This prompt has no skill name yet: run "fill names & descriptions with AI" first (or export it once)',
  "manager.skill.nameInvalid": "Invalid skill name: it must kebab-case into lowercase kebab (letters, digits, hyphens only)",
  "manager.skill.descMissing": "Summary, AI description, first body line and title are all empty \u2014 the host will refuse the export",
  "manager.skill.describeFailed": "AI completion failed",
  "manager.skill.exportFailed": "Export failed",
  "manager.skill.pathMissing": "The host returned no target path (contract drift); this item is reported as failed",
  "manager.skill.conflictTitle": "A skill folder with this name already exists",
  "manager.skill.conflictMessage": "That folder belongs to no prompt of this plugin (it may be a skill you wrote by hand). Exporting will overwrite its SKILL.md.",
  "manager.skill.summary": "Export result",
  "manager.skill.summaryOk": "Succeeded",
  "manager.skill.summaryFailed": "Failed",
  "manager.skill.summaryDeclined": "Skipped",
  "manager.skill.target": "Target file",
  "manager.skill.declined": "Skipped (the overwrite was not confirmed)",
  "manager.skill.badgeExported": "Exported as skill",
  "manager.skill.badgeStale": "Skill is out of date",
  "manager.skill.reExport": "Re-export",
  "manager.skill.reExporting": "Re-exporting\u2026",
  "manager.skill.reExported": "Re-exported (overwrote the same folder, no new folder created)",
  "sidebar.entry.title": "Prompts",
  "sidebar.entry.tip": "Open the prompt manager"
};

// src/client/components/TemplateVariablesDialog.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function hostLanguage() {
  if (typeof document !== "undefined" && document.documentElement.lang !== "") {
    return document.documentElement.lang;
  }
  if (typeof navigator !== "undefined" && navigator.language !== "") return navigator.language;
  return "en";
}
function fallbackTranslate() {
  const dict = hostLanguage().toLowerCase().startsWith("zh") ? zh : en;
  return (key) => dict[key] ?? key;
}
function TemplateVariablesDialog({
  body,
  onCancel,
  onFilled,
  t
}) {
  const tr = t ?? fallbackTranslate();
  const names = React2.useMemo(() => parseVariables(body), [body]);
  const [values, setValues] = React2.useState({});
  const [remembered, setRemembered] = React2.useState(false);
  const memory = React2.useRef({});
  const readState = React2.useRef("pending");
  React2.useEffect(() => {
    let alive = true;
    readState.current = "pending";
    api.getMeta(memoryKey).then(
      (raw) => {
        if (!alive) return;
        const stored = parseMemory(raw);
        memory.current = stored;
        readState.current = "ok";
        const prefill = pickRemembered(body, stored);
        setValues((prev) => {
          const next = { ...prefill };
          for (const [name, value] of Object.entries(prev)) if (value !== "") next[name] = value;
          return next;
        });
        setRemembered(Object.keys(prefill).length > 0);
      },
      (err) => {
        if (!alive) return;
        readState.current = "failed";
        console.warn("[prompt-enhancer] " + memoryKey + " \u8BFB\u53D6\u5931\u8D25\uFF0C\u672C\u6B21\u6309\u65E0\u8BB0\u5FC6\u5904\u7406", err);
      }
    );
    return () => {
      alive = false;
    };
  }, [body]);
  const confirm = (ev) => {
    ev.preventDefault();
    if (readState.current === "ok") {
      const merged = { ...memory.current };
      for (const [name, value] of Object.entries(values)) if (value !== "") merged[name] = value;
      void api.setMeta(memoryKey, JSON.stringify(merged)).catch((err) => {
        console.warn("[prompt-enhancer] " + memoryKey + " \u4FDD\u5B58\u5931\u8D25", err);
      });
    } else {
      console.warn("[prompt-enhancer] " + memoryKey + " \u8BB0\u5FC6\u672A\u5C31\u7EEA\uFF0C\u672C\u6B21\u4E0D\u5199\u56DE");
    }
    onFilled(fillTemplate(body, values));
  };
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: CARD, role: "dialog", "aria-label": tr("vars.title"), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("form", { style: FORM, onSubmit: confirm, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: TITLE, children: tr("vars.title") }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: HINT, children: tr("vars.hint") }),
    remembered && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: REMEMBERED, children: tr("vars.remembered") }),
    names.map((name, index) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { style: FIELD, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: LABEL, children: name }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "input",
        {
          type: "text",
          style: INPUT,
          value: values[name] ?? "",
          autoFocus: index === 0,
          "aria-label": name,
          onChange: (ev) => {
            const next = ev.currentTarget.value;
            setValues((prev) => ({ ...prev, [name]: next }));
          }
        }
      )
    ] }, name)),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: ACTIONS2, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "submit", style: PRIMARY, children: tr("vars.fill") }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", style: GHOST, onClick: onCancel, children: tr("vars.cancel") })
    ] })
  ] }) });
}
var CARD = {
  ...overlayBase,
  width: 300,
  maxWidth: "100%",
  maxHeight: 320,
  overflowY: "auto",
  padding: 10,
  fontSize: 12,
  lineHeight: 1.5
};
var FORM = { display: "flex", flexDirection: "column", gap: 8 };
var TITLE = { color: TOKEN.fg, fontSize: 12, fontWeight: 600 };
var HINT = { color: TOKEN.muted, fontSize: 11 };
var REMEMBERED = { color: TOKEN.accent, fontSize: 11 };
var FIELD = { display: "flex", flexDirection: "column", gap: 3 };
var LABEL = { color: TOKEN.muted, fontSize: 11 };
var INPUT = {
  padding: "4px 6px",
  fontSize: 12,
  color: TOKEN.fg,
  background: "transparent",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6
};
var ACTIONS2 = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  marginTop: 2
};
var BUTTON2 = {
  padding: "3px 10px",
  fontSize: 11,
  color: TOKEN.fg,
  background: "transparent",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  cursor: "pointer"
};
var PRIMARY = { ...BUTTON2, color: TOKEN.accent, borderColor: TOKEN.accent };
var GHOST = { ...BUTTON2, color: TOKEN.muted };

// src/client/components/HashSuggestOverlay.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
function HashSuggestOverlay({
  t,
  useInput,
  inputActions
}) {
  const draft = useInput((s) => s.draft);
  const token = readHashToken(draft);
  const open = token !== null;
  const tokenKey = token === null ? null : `${token.start}:${token.query}`;
  const [dismissedKey, setDismissedKey] = React3.useState(null);
  const visible = shouldShowSuggest({ open, tokenKey, dismissedKey });
  const claimed = useOverlayClaim();
  const onScreen = visible && canRender("hash", claimed);
  const rootRef = React3.useRef(null);
  const [prompts, setPrompts] = React3.useState(null);
  const [loadError, setLoadError] = React3.useState(null);
  const [pending, setPending] = React3.useState(null);
  React3.useEffect(() => {
    if (!open) {
      setPending(null);
      setDismissedKey((prev) => nextDismissedKey(open, prev));
      return;
    }
    let alive = true;
    setPrompts(null);
    setLoadError(null);
    api.listPrompts().then(
      (list) => {
        if (alive) setPrompts(list);
      },
      (err) => {
        if (!alive) return;
        console.warn("[prompt-enhancer] \u63D0\u793A\u8BCD\u5217\u8868\u52A0\u8F7D\u5931\u8D25", err);
        setPrompts([]);
        setLoadError(err instanceof Error ? err.message : String(err));
      }
    );
    return () => {
      alive = false;
    };
  }, [open]);
  React3.useEffect(() => {
    if (!visible) return;
    const onPointerDown = (ev) => {
      const root = rootRef.current;
      if (root !== null && ev.target instanceof Node && root.contains(ev.target)) return;
      if (tokenKey !== null) setDismissedKey(tokenKey);
      setPending(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [visible, tokenKey]);
  const apply2 = (prompt, body) => {
    inputActions.setDraft(replaceHashToken(draft, body));
    setPending(null);
    void api.recordUsage(prompt.id).catch((err) => {
      console.warn("[prompt-enhancer] " + t("error.use"), err);
    });
  };
  React3.useEffect(() => {
    setHashSuggestVisible(visible);
    return () => {
      setHashSuggestVisible(false);
    };
  }, [visible]);
  React3.useEffect(() => {
    if (canTakeHash(visible)) claimOverlay("hash");
    return () => {
      releaseOverlay("hash");
    };
  }, [visible]);
  React3.useEffect(() => {
    if (canRetakeHash(visible, getOverlayClaimSnapshot())) claimOverlay("hash");
  }, [visible, claimed]);
  if (token === null || !onScreen) return null;
  if (pending !== null) {
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { ref: rootRef, style: ANCHOR2, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      TemplateVariablesDialog,
      {
        body: pending.body,
        t,
        onCancel: () => setPending(null),
        onFilled: (filled) => apply2(pending, filled)
      }
    ) });
  }
  const filtered = filterPrompts(prompts ?? [], token.query);
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { ref: rootRef, style: ANCHOR2, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { role: "group", "aria-label": t("hash.title"), style: PANEL2, children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: HEADER2, children: t("hash.title") }),
    loadError !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { role: "alert", style: ERROR2, title: loadError, children: t("error.load") }),
    loadError === null && prompts === null && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: MUTED2, children: t("list.loading") }),
    loadError === null && prompts !== null && filtered.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: MUTED2, children: t("hash.empty") }),
    loadError === null && filtered.map((prompt) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
      "button",
      {
        type: "button",
        style: ROW,
        title: prompt.title,
        "aria-label": prompt.title,
        onClick: () => {
          if (needsValues(prompt.body)) setPending(prompt);
          else apply2(prompt, prompt.body);
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: ROW_TITLE, children: prompt.title }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: ROW_SUMMARY, children: promptSummary(prompt) }),
          prompt.tags.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: TAGS, children: prompt.tags.map((tag) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: TAG, children: tag }, tag)) })
        ]
      },
      prompt.id
    ))
  ] }) });
}
var ANCHOR2 = {
  position: "absolute",
  bottom: 8,
  left: 8,
  zIndex: 30,
  maxWidth: "calc(100vw - 24px)"
};
var PANEL2 = {
  ...overlayBase,
  display: "flex",
  flexDirection: "column",
  gap: 4,
  width: 300,
  maxHeight: 320,
  overflowY: "auto",
  padding: 6,
  fontSize: 12
};
var HEADER2 = { color: TOKEN.muted, fontSize: 11, fontWeight: 600 };
var MUTED2 = { color: TOKEN.muted, fontSize: 11 };
var ERROR2 = { color: TOKEN.fg, fontSize: 11 };
var ROW = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 2,
  width: "100%",
  padding: "5px 4px",
  color: TOKEN.fg,
  background: "transparent",
  border: 0,
  borderTop: `1px solid ${TOKEN.border}`,
  textAlign: "left",
  font: "inherit",
  fontSize: 12,
  cursor: "pointer"
};
var ROW_TITLE = {
  color: TOKEN.fg,
  fontSize: 12,
  fontWeight: 600,
  maxWidth: "100%",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap"
};
var ROW_SUMMARY = { color: TOKEN.muted, fontSize: 11, overflowWrap: "anywhere" };
var TAGS = { display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 };
var TAG = {
  color: TOKEN.accent,
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 999,
  padding: "0 6px",
  fontSize: 10
};

// src/client/components/PromptLibraryButton.tsx
var React5 = __toESM(require("react"), 1);

// src/client/components/SelectionAddPrompt.tsx
var React4 = __toESM(require("react"), 1);

// src/client/utils/selection.ts
function normalizeSelection(text) {
  return text.replace(/\r\n?/g, "\n").trim();
}
function selectionKey(text, anchorOffset, focusOffset) {
  return text + "\0" + anchorOffset + ":" + focusOffset;
}
function decideSelection(facts) {
  if (!facts.enabled) return { show: false, text: "", reason: "disabled" };
  if (facts.collapsed) return { show: false, text: "", reason: "collapsed" };
  const text = normalizeSelection(facts.text);
  if (text === "") return { show: false, text: "", reason: "empty" };
  if (facts.inComposerSeat) return { show: false, text: "", reason: "composer" };
  if (facts.inOurRoot) return { show: false, text: "", reason: "own-root" };
  if (!facts.inConversation) return { show: false, text: "", reason: "outside-conversation" };
  return { show: true, text, reason: "ok" };
}

// src/client/components/SelectionAddPrompt.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
var ABOVE_MIN_TOP = 44;
function elementOf(node) {
  if (node === null) return null;
  return node.nodeType === 1 ? node : node.parentElement;
}
function SelectionAddPrompt({
  enabled,
  rootRef,
  label: label2,
  onSave
}) {
  const [anchor, setAnchor] = React4.useState(null);
  const liveRef = React4.useRef(null);
  const dismissedRef = React4.useRef(null);
  const pressingRef = React4.useRef(false);
  const draggingRef = React4.useRef(false);
  const buttonRef = React4.useRef(null);
  React4.useEffect(() => {
    liveRef.current = null;
    dismissedRef.current = null;
    pressingRef.current = false;
    draggingRef.current = false;
    setAnchor(null);
    if (!enabled) return;
    const evaluate = () => {
      const sel = window.getSelection();
      const anchorNode = sel === null ? null : sel.anchorNode;
      const el = elementOf(anchorNode);
      const root = rootRef.current;
      const decision = decideSelection({
        text: sel === null ? "" : sel.toString(),
        collapsed: sel === null ? true : sel.isCollapsed,
        inConversation: el !== null && el.closest("[data-conversation-scroll]") !== null,
        inComposerSeat: el !== null && el.closest("[data-composer-seat]") !== null,
        inOurRoot: root !== null && anchorNode !== null && root.contains(anchorNode),
        enabled: true
      });
      if (!decision.show || sel === null) {
        liveRef.current = null;
        if (decision.reason === "collapsed" || decision.reason === "empty") dismissedRef.current = null;
        setAnchor(null);
        return;
      }
      const key = selectionKey(decision.text, sel.anchorOffset, sel.focusOffset);
      if (key === dismissedRef.current) {
        liveRef.current = null;
        setAnchor(null);
        return;
      }
      const range = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
      const rect = range === null ? null : range.getBoundingClientRect();
      if (rect === null || rect.width === 0 && rect.height === 0) {
        liveRef.current = null;
        setAnchor(null);
        return;
      }
      const above = rect.top >= ABOVE_MIN_TOP;
      liveRef.current = { text: decision.text, key };
      setAnchor({
        top: above ? rect.top - 8 : rect.bottom + 8,
        left: Math.max(8, rect.left),
        above
      });
    };
    const isOnButton = (target) => buttonRef.current !== null && target instanceof Node && buttonRef.current.contains(target);
    const onSelectionChange = () => {
      if (pressingRef.current || draggingRef.current) {
        liveRef.current = null;
        setAnchor(null);
        return;
      }
      evaluate();
    };
    const onPointerDown = (ev) => {
      pressingRef.current = isOnButton(ev.target);
      if (pressingRef.current) return;
      draggingRef.current = true;
      liveRef.current = null;
      setAnchor(null);
      dismissedRef.current = null;
    };
    const onPointerUp = () => {
      const pressedOnButton = pressingRef.current;
      pressingRef.current = false;
      draggingRef.current = false;
      if (pressedOnButton) return;
      evaluate();
    };
    const onScroll = () => {
      if (pressingRef.current || draggingRef.current) return;
      evaluate();
    };
    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [enabled, rootRef]);
  const pick = () => {
    const live = liveRef.current;
    if (live === null) return;
    dismissedRef.current = live.key;
    liveRef.current = null;
    setAnchor(null);
    onSave(live.text);
  };
  if (!enabled || anchor === null) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
    "button",
    {
      ref: buttonRef,
      type: "button",
      style: {
        ...FLOATING,
        top: anchor.top,
        left: anchor.left,
        transform: anchor.above ? "translateY(-100%)" : void 0
      },
      title: label2,
      "aria-label": label2,
      onClick: pick,
      children: label2
    }
  );
}
var FLOATING = {
  ...overlayBase,
  position: "fixed",
  zIndex: 60,
  padding: "2px 10px",
  fontSize: 11,
  lineHeight: "18px",
  color: TOKEN.fg,
  whiteSpace: "nowrap",
  cursor: "pointer"
};

// src/client/components/PromptLibraryButton.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
var ACTIONS3 = [
  { mode: "insert", label: "action.insert" },
  { mode: "overwrite", label: "action.overwrite" },
  { mode: "insert-send", label: "action.send" }
];
var NOTICE_MS = 4e3;
function PromptLibraryButton({
  t,
  useInput,
  inputActions
}) {
  const draft = useInput((s) => s.draft);
  const hashVisible = useHashSuggestVisible();
  const settings = useSettings();
  const [open, setOpen] = React5.useState(false);
  const [prompts, setPrompts] = React5.useState(null);
  const [loadError, setLoadError] = React5.useState(null);
  const [notice, setNotice] = React5.useState(null);
  const [pending, setPending] = React5.useState(null);
  const rootRef = React5.useRef(null);
  const claimed = useOverlayClaim();
  const panelOpen = open && canRender("library", claimed);
  React5.useEffect(() => {
    if (!open) return;
    let alive = true;
    setPrompts(null);
    setLoadError(null);
    api.listPrompts({ sort: "default" }).then(
      (list) => {
        if (alive) setPrompts(list);
      },
      (err) => {
        if (!alive) return;
        console.warn("[prompt-enhancer] \u63D0\u793A\u8BCD\u5217\u8868\u52A0\u8F7D\u5931\u8D25", err);
        setPrompts([]);
        setLoadError(err instanceof Error ? err.message : String(err));
      }
    );
    return () => {
      alive = false;
    };
  }, [open]);
  React5.useEffect(() => {
    if (!open) return;
    const onPointerDown = (ev) => {
      const root = rootRef.current;
      if (root !== null && ev.target instanceof Node && root.contains(ev.target)) return;
      setOpen(false);
      setPending(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open]);
  React5.useEffect(() => {
    if (notice === null) return;
    const id = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => {
      window.clearTimeout(id);
    };
  }, [notice]);
  const close = () => {
    setOpen(false);
    setPending(null);
  };
  React5.useEffect(() => {
    if (!open) return;
    if (claimed === "library") return;
    setOpen(false);
  }, [open, claimed]);
  React5.useEffect(() => {
    if (open) return;
    releaseOverlay("library");
  }, [open]);
  React5.useEffect(() => () => releaseOverlay("library"), []);
  const saveSelection = (text) => {
    pushCapture({ body: text });
    openManager("list");
  };
  const saveDraft = () => {
    if (draft.trim() === "") return;
    close();
    pushCapture({ body: draft });
    openManager("list");
  };
  const apply2 = (prompt, body, mode) => {
    const next = composeDraft(draft, body, mode);
    inputActions.setDraft(next.draft);
    if (next.send) inputActions.submit();
    close();
    void api.recordUsage(prompt.id).catch((err) => {
      console.warn("[prompt-enhancer] " + t("error.use"), err);
      const reason = err instanceof Error ? err.message : String(err);
      if (reason.includes("\u4E0D\u5B58\u5728")) {
        setPrompts((prev) => prev === null ? prev : prev.filter((item) => item.id !== prompt.id));
        setNotice((prev) => ({ text: t("error.noPrompt"), seq: (prev?.seq ?? 0) + 1 }));
      }
    });
  };
  const choose = (prompt, mode) => {
    if (needsValues(prompt.body)) setPending({ prompt, mode });
    else apply2(prompt, prompt.body, mode);
  };
  if (!settings.showComposerButton) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
    "span",
    {
      ref: rootRef,
      style: WRAP2,
      "data-prompt-enhancer-claim": claimed,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "button",
          {
            type: "button",
            style: BUTTON3,
            title: t("button.tip"),
            "aria-label": t("button.tip"),
            "aria-haspopup": "dialog",
            "aria-expanded": panelOpen,
            onClick: (event) => {
              if (event.detail === 0 && hashVisible) return;
              if (panelOpen) close();
              else {
                claimOverlay("library");
                setOpen(true);
              }
            },
            children: t("button.title")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          SelectionAddPrompt,
          {
            enabled: settings.selectionAddEnabled,
            rootRef,
            label: t("selection.save"),
            onSave: saveSelection
          }
        ),
        notice !== null && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { role: "status", "aria-live": "polite", style: NOTICE, children: notice.text }),
        panelOpen && pending !== null && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: ANCHOR3, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          TemplateVariablesDialog,
          {
            body: pending.prompt.body,
            t,
            onCancel: () => setPending(null),
            onFilled: (filled) => apply2(pending.prompt, filled, pending.mode)
          }
        ) }),
        panelOpen && pending === null && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: ANCHOR3, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { role: "dialog", "aria-label": t("list.title"), style: PANEL3, children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { style: PANEL_HEADER, children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: HEADER3, children: t("list.title") }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { style: PANEL_ACTIONS, children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                "button",
                {
                  type: "button",
                  style: {
                    ...ACTION_BUTTON,
                    opacity: draft.trim() === "" ? 0.6 : 1,
                    cursor: draft.trim() === "" ? "default" : "pointer"
                  },
                  title: t("list.saveDraft"),
                  "aria-label": t("list.saveDraft"),
                  disabled: draft.trim() === "",
                  onClick: saveDraft,
                  children: t("list.saveDraft")
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                "button",
                {
                  type: "button",
                  style: ACTION_BUTTON,
                  title: t("list.manage"),
                  "aria-label": t("list.manage"),
                  "aria-haspopup": "dialog",
                  onClick: () => {
                    close();
                    openManager();
                  },
                  children: t("list.manage")
                }
              )
            ] })
          ] }),
          loadError !== null && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { role: "alert", style: ERROR3, children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: t("error.load") }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: ERROR_DETAIL2, title: loadError, children: loadError })
          ] }),
          loadError === null && prompts === null && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: MUTED3, children: t("list.loading") }),
          loadError === null && prompts !== null && prompts.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: MUTED3, children: t("list.empty") }),
          loadError === null && prompts !== null && prompts.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { role: "list", style: LIST, children: prompts.map((prompt) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { role: "listitem", "aria-label": prompt.title, style: ROW2, children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { style: ROW_TEXT, children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: ROW_TITLE2, children: prompt.title }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: ROW_SUMMARY2, children: promptSummary(prompt) }),
              (prompt.summary ?? "").trim() !== "" && (prompt.tags ?? []).length > 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: TAGS2, children: (prompt.tags ?? []).map((tag) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: TAG2, children: tag }, tag)) })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: ROW_ACTIONS, children: ACTIONS3.map(({ mode, label: label2 }) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
              "button",
              {
                type: "button",
                style: ACTION_BUTTON,
                title: `${t(label2)} ${prompt.title}`,
                "aria-label": `${t(label2)} ${prompt.title}`,
                onClick: () => choose(prompt, mode),
                children: t(label2)
              },
              mode
            )) })
          ] }, prompt.id)) })
        ] }) })
      ]
    }
  );
}
var WRAP2 = {
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  gap: 6
};
var BUTTON3 = {
  display: "inline-flex",
  alignItems: "center",
  height: 24,
  padding: "0 8px",
  fontSize: 12,
  color: TOKEN.fg,
  background: "transparent",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  cursor: "pointer"
};
var NOTICE = { color: TOKEN.muted, fontSize: 11, whiteSpace: "nowrap" };
var ANCHOR3 = {
  position: "absolute",
  bottom: "calc(100% + 6px)",
  left: 0,
  zIndex: 30,
  maxWidth: "calc(100vw - 24px)"
};
var PANEL3 = {
  ...overlayBase,
  display: "flex",
  flexDirection: "column",
  gap: 6,
  width: 320,
  maxHeight: 320,
  overflowY: "auto",
  padding: 8,
  fontSize: 12
};
var PANEL_HEADER = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: 6
};
var PANEL_ACTIONS = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  flex: "0 0 auto"
};
var HEADER3 = { color: TOKEN.muted, fontSize: 11, fontWeight: 600 };
var MUTED3 = { color: TOKEN.muted, fontSize: 11 };
var ERROR3 = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  color: TOKEN.fg,
  fontSize: 11
};
var ERROR_DETAIL2 = { color: TOKEN.muted, overflowWrap: "anywhere" };
var LIST = { display: "flex", flexDirection: "column" };
var ROW2 = {
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  padding: "6px 2px",
  borderTop: `1px solid ${TOKEN.border}`
};
var ROW_TEXT = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  flex: "1 1 auto",
  minWidth: 0
};
var ROW_TITLE2 = {
  color: TOKEN.fg,
  fontSize: 12,
  fontWeight: 600,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap"
};
var ROW_SUMMARY2 = { color: TOKEN.muted, fontSize: 11, overflowWrap: "anywhere" };
var TAGS2 = { display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 };
var TAG2 = {
  color: TOKEN.accent,
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 999,
  padding: "0 6px",
  fontSize: 10
};
var ROW_ACTIONS = {
  display: "flex",
  flexDirection: "column",
  flex: "0 0 auto",
  gap: 4
};
var ACTION_BUTTON = {
  padding: "1px 6px",
  fontSize: 11,
  lineHeight: "16px",
  color: TOKEN.fg,
  background: "transparent",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  cursor: "pointer"
};

// src/client/components/PromptSurfaceHost.tsx
var React12 = __toESM(require("react"), 1);

// src/client/utils/dialog-style.ts
var backdrop = {
  position: "fixed",
  inset: 0,
  zIndex: 100,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  background: "rgba(0, 0, 0, 0.35)"
};
function surface(width, height) {
  return {
    ...overlayBase,
    display: "flex",
    flexDirection: "column",
    width,
    height,
    maxWidth: "calc(100vw - 40px)",
    maxHeight: "calc(100vh - 40px)",
    overflow: "hidden",
    fontSize: 12
  };
}
var dialogHeader = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 12px",
  borderBottom: `1px solid ${TOKEN.border}`,
  flex: "0 0 auto"
};
var dialogTitle = { color: TOKEN.fg, fontSize: 13, fontWeight: 600, flex: "0 0 auto" };
var dialogTabs = {
  display: "flex",
  gap: 4,
  flex: "1 1 auto",
  minWidth: 0,
  overflowX: "auto"
};
function dialogTab(active) {
  return {
    padding: "2px 10px",
    fontSize: 11,
    lineHeight: "18px",
    color: active ? TOKEN.accent : TOKEN.muted,
    background: active ? TOKEN.hover : "transparent",
    border: `1px solid ${active ? TOKEN.accent : TOKEN.border}`,
    borderRadius: 999,
    cursor: "pointer",
    whiteSpace: "nowrap",
    flex: "0 0 auto"
  };
}
var dialogBody = {
  flex: "1 1 auto",
  minHeight: 0,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 12
};
var toolbar = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 6,
  flex: "0 0 auto"
};
var textInput = {
  boxSizing: "border-box",
  minWidth: 0,
  padding: "4px 8px",
  color: TOKEN.fg,
  background: "transparent",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  fontSize: 12,
  fontFamily: "inherit",
  outline: "none"
};
var textArea = {
  ...textInput,
  width: "100%",
  resize: "vertical",
  padding: "6px 8px",
  lineHeight: 1.5
};
var select = { ...textInput, cursor: "pointer" };
var fieldLabel = { color: TOKEN.muted, fontSize: 11, flex: "0 0 auto", width: 42 };
var fieldRow = { display: "flex", alignItems: "flex-start", gap: 6 };
var button = {
  padding: "2px 8px",
  fontSize: 11,
  lineHeight: "16px",
  color: TOKEN.fg,
  background: "transparent",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  cursor: "pointer",
  flex: "0 0 auto"
};
var primaryButton = { ...button, borderColor: TOKEN.accent, color: TOKEN.accent };
var actions = { display: "flex", gap: 6, justifyContent: "flex-end", flex: "0 0 auto" };
var muted = { color: TOKEN.muted, fontSize: 11, overflowWrap: "anywhere" };
var errorText = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  color: TOKEN.fg,
  fontSize: 11
};
var errorDetail = { color: TOKEN.muted, overflowWrap: "anywhere" };
var listRow = {
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  padding: "6px 0",
  borderTop: `1px solid ${TOKEN.border}`
};
var rowText = { display: "flex", flexDirection: "column", gap: 2, flex: "1 1 auto", minWidth: 0 };
var rowTitle = {
  color: TOKEN.fg,
  fontSize: 12,
  fontWeight: 600,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap"
};
var rowMeta = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4 };
var tagChip = {
  color: TOKEN.accent,
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 999,
  padding: "0 6px",
  fontSize: 10
};
var compareGrid = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 };
var compareBlock = { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 };
var compareHead = { color: TOKEN.muted, fontSize: 11, fontWeight: 600 };
var compareBody = {
  flex: "1 1 auto",
  minHeight: 0,
  maxHeight: 180,
  overflowY: "auto",
  color: TOKEN.fg,
  fontSize: 11,
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  padding: "4px 6px"
};

// src/client/components/PromptManagerModal.tsx
var React11 = __toESM(require("react"), 1);

// src/client/components/ImportExportModal.tsx
var React6 = __toESM(require("react"), 1);

// src/client/utils/transfer.ts
var MAX_BACKUP_BYTES = 5 * 1024 * 1024;
function parseBackupFile(text, byteLength) {
  if (byteLength > MAX_BACKUP_BYTES) {
    return {
      ok: false,
      errorKey: "transfer.tooLarge",
      // 纯数据（实际值/上限），措辞在 i18n 的 transfer.tooLarge（A10）。
      detail: `${byteLength}/${MAX_BACKUP_BYTES}`
    };
  }
  try {
    return { ok: true, backup: JSON.parse(text) };
  } catch (err) {
    return {
      ok: false,
      errorKey: "transfer.badJson",
      detail: err instanceof Error ? err.message : String(err)
    };
  }
}
function classifyImportResult(result) {
  return result.applied === true ? { ok: true } : { ok: false, errorKey: "manager.transfer.importFailed" };
}
async function clearOverwrittenMeta(backup, existingIds, clear) {
  const ids = backupPromptIds(backup);
  if (ids.length === 0 || existingIds.length === 0) return [];
  const existing = new Set(existingIds);
  const overwritten = ids.filter((id) => existing.has(id));
  if (overwritten.length === 0) return [];
  await clear(overwritten);
  return overwritten;
}
async function readExistingPromptIds(readActive, readTrash) {
  const [active, trash] = await Promise.all([
    readIdsSafely(readActive, "\u6D3B\u8DC3\u63D0\u793A\u8BCD"),
    readIdsSafely(readTrash, "\u56DE\u6536\u7AD9")
  ]);
  return [.../* @__PURE__ */ new Set([...active, ...trash])];
}
async function readIdsSafely(read, label2) {
  try {
    const items = await read();
    return items.map((item) => item?.id).filter((id) => typeof id === "string" && id !== "");
  } catch (err) {
    console.warn("[prompt-enhancer] \u5BFC\u5165\u524D\u8BFB\u53D6" + label2 + " id \u5931\u8D25\uFF08\u672C\u6B21\u4E0D\u6E05\u8BE5\u6765\u6E90\u6D89\u53CA\u7684 per-prompt meta \u952E\uFF09", err);
    return [];
  }
}
function clearOverwrittenMetaDetached(backup, existingIds, clear) {
  void clearOverwrittenMeta(backup, existingIds, clear).catch((err) => {
    console.warn("[prompt-enhancer] \u5BFC\u5165\u6210\u529F\uFF0C\u4F46\u88AB\u8986\u76D6\u6761\u76EE\u7684 per-prompt meta \u952E\u672A\u80FD\u6E05\u7406", err);
  });
}
function backupPromptIds(backup) {
  if (typeof backup !== "object" || backup === null) {
    console.warn("[prompt-enhancer] \u5BFC\u5165\u56DE\u6267\u7684\u5907\u4EFD\u4E0D\u662F\u5BF9\u8C61\uFF08\u672C\u6B21\u4E0D\u6E05 per-prompt meta \u952E\uFF09");
    return [];
  }
  const raw = backup.prompts;
  if (!Array.isArray(raw)) {
    console.warn("[prompt-enhancer] \u5BFC\u5165\u7684\u5907\u4EFD\u91CC prompts \u4E0D\u662F\u6570\u7EC4\uFF08\u672C\u6B21\u4E0D\u6E05 per-prompt meta \u952E\uFF09");
    return [];
  }
  const out = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const id = item.id;
    if (typeof id === "string" && id !== "" && !out.includes(id)) out.push(id);
  }
  return out;
}

// src/client/utils/workspace-dir.ts
var capability = null;
function setDirectoryCapability(cap) {
  capability = cap ?? null;
}
function isDirectoryPickerAvailable() {
  return !!capability && typeof capability.pickDirectory === "function";
}
async function pickExportDirectory() {
  if (!capability || typeof capability.pickDirectory !== "function") {
    throw new Error("\u5BBF\u4E3B\u672A\u63D0\u4F9B\u76EE\u5F55\u9009\u62E9\u80FD\u529B\uFF08ui-workspace \u5BA2\u6237\u7AEF\u7F3A\u5931\uFF09\uFF0C\u65E0\u6CD5\u9009\u62E9\u5BFC\u51FA\u76EE\u5F55");
  }
  return capability.pickDirectory();
}

// src/client/components/ImportExportModal.tsx
var import_jsx_runtime6 = require("react/jsx-runtime");
function reasonOf3(err) {
  return err instanceof Error ? err.message : String(err);
}
function ImportExportModal({ t }) {
  const [busy, setBusy] = React6.useState("idle");
  const [exported, setExported] = React6.useState(null);
  const [exportFailed, setExportFailed] = React6.useState(null);
  const [preview, setPreview] = React6.useState(null);
  const [applied, setApplied] = React6.useState(null);
  const [overflow, setOverflow] = React6.useState(null);
  const [failure, setFailure] = React6.useState(null);
  const fileRef = React6.useRef(null);
  const aliveRef = React6.useRef(true);
  React6.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  const pickerAvailable = isDirectoryPickerAvailable();
  const idle = busy === "idle";
  const runExport = () => {
    if (!idle || !pickerAvailable) return;
    setExported(null);
    setExportFailed(null);
    setFailure(null);
    setBusy("exporting");
    void (async () => {
      try {
        const dir = await pickExportDirectory();
        if (dir === null) return;
        const result = await api.exportBackup(dir);
        if (!aliveRef.current) return;
        setExported(result);
      } catch (err) {
        console.warn("[prompt-enhancer] \u5BFC\u51FA\u5907\u4EFD\u5931\u8D25", err);
        if (aliveRef.current) setExportFailed(reasonOf3(err));
      } finally {
        if (aliveRef.current) setBusy("idle");
      }
    })();
  };
  const onPickFile = (ev) => {
    const file = ev.target.files?.[0] ?? null;
    ev.target.value = "";
    if (file === null || !idle) return;
    setPreview(null);
    setApplied(null);
    setOverflow(null);
    setFailure(null);
    setExportFailed(null);
    setBusy("reading");
    void (async () => {
      try {
        let text;
        try {
          text = await file.text();
        } catch (err) {
          console.warn("[prompt-enhancer] \u8BFB\u53D6\u6240\u9009\u5907\u4EFD\u6587\u4EF6\u5931\u8D25", err);
          if (aliveRef.current) setFailure({ key: "manager.transfer.readFailed", detail: reasonOf3(err) });
          return;
        }
        const parsed = parseBackupFile(text, file.size);
        if (!parsed.ok) {
          if (aliveRef.current) setFailure({ key: parsed.errorKey, detail: parsed.detail });
          return;
        }
        try {
          const result = await api.importBackup(parsed.backup, false);
          if (!aliveRef.current) return;
          if (result.stats === void 0) {
            setFailure({ key: "manager.transfer.noStats", detail: "keys=" + Object.keys(result).sort().join(",") });
            return;
          }
          setPreview({ backup: parsed.backup, stats: result.stats });
        } catch (err) {
          console.warn("[prompt-enhancer] \u5BFC\u5165\u9884\u89C8\u88AB\u5BBF\u4E3B\u62D2\u7EDD", err);
          if (aliveRef.current) setFailure({ key: "manager.transfer.importFailed", detail: reasonOf3(err) });
        }
      } finally {
        if (aliveRef.current) setBusy("idle");
      }
    })();
  };
  const cancelImport = () => {
    setPreview(null);
    setFailure(null);
  };
  const confirmImport = () => {
    if (preview === null || !idle) return;
    const { backup, stats } = preview;
    setFailure(null);
    setBusy("applying");
    void (async () => {
      try {
        const existingIds = await readExistingPromptIds(
          () => api.listPrompts(),
          () => api.listTrash()
        );
        const result = await api.importBackup(backup, true);
        if (!aliveRef.current) return;
        const verdict = classifyImportResult(result);
        if (!verdict.ok) {
          setFailure({ key: verdict.errorKey, detail: "applied=" + String(result.applied) });
          return;
        }
        clearOverwrittenMetaDetached(
          backup,
          existingIds,
          (ids) => deletePrompts({ ids, irreversible: true, remove: async () => {
          } })
        );
        const done = result.stats ?? stats;
        setPreview(null);
        setApplied(done);
        notifyDataChanged();
        try {
          const list = await api.listPrompts();
          if (!aliveRef.current) return;
          const settings = getSettingsSnapshot();
          if (list.length > settings.maxPromptCount) {
            setOverflow({ imported: done.total, total: list.length, max: settings.maxPromptCount });
          }
        } catch (err) {
          console.warn("[prompt-enhancer] \u5BFC\u5165\u6210\u529F\uFF0C\u4F46\u8BFB\u53D6\u5F53\u524D\u6761\u6570 / \u4E0A\u9650\u5931\u8D25", err);
          if (aliveRef.current) setFailure({ key: "manager.transfer.countsFailed", detail: reasonOf3(err) });
        }
      } catch (err) {
        console.warn("[prompt-enhancer] \u5BFC\u5165\u843D\u5E93\u5931\u8D25", err);
        if (aliveRef.current) setFailure({ key: "manager.transfer.importFailed", detail: reasonOf3(err) });
      } finally {
        if (aliveRef.current) setBusy("idle");
      }
    })();
  };
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: toolbar, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
      "button",
      {
        type: "button",
        style: { ...primaryButton, opacity: pickerAvailable && idle ? 1 : 0.6 },
        "aria-busy": busy === "exporting",
        disabled: !pickerAvailable || !idle,
        onClick: runExport,
        children: busy === "exporting" ? t("manager.transfer.exporting") : t("manager.transfer.export")
      }
    ) }),
    !pickerAvailable && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: muted, children: t("manager.transfer.exportUnavailable") }),
    exported !== null && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { role: "status", "aria-live": "polite", style: muted, children: [
      t("manager.transfer.exported"),
      " ",
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: errorDetail, title: exported.path, children: exported.path }),
      " \xB7 ",
      t("manager.transfer.prompts"),
      " ",
      exported.prompts,
      " \xB7 ",
      t("manager.transfer.tags"),
      " ",
      exported.tags
    ] }),
    exportFailed !== null && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { role: "alert", style: errorText, children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: t("manager.transfer.exportFailed") }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: errorDetail, title: exportFailed, children: exportFailed })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: toolbar, children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "button", style: button, disabled: !idle, onClick: () => fileRef.current?.click(), children: t("manager.transfer.import") }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
        "input",
        {
          ref: fileRef,
          type: "file",
          accept: ".json,application/json",
          hidden: true,
          "aria-label": t("manager.transfer.import"),
          onChange: onPickFile
        }
      )
    ] }),
    preview !== null && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { style: muted, children: [
        t("manager.transfer.previewAdded"),
        " ",
        preview.stats.added,
        " \xB7 ",
        t("manager.transfer.previewOverwritten"),
        " ",
        preview.stats.overwritten,
        " \xB7 ",
        t("manager.transfer.previewTotal"),
        " ",
        preview.stats.total
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { role: "alert", style: errorText, children: t("manager.transfer.overwriteWarning") }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: actions, children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "button", style: button, onClick: cancelImport, children: t("manager.transfer.cancel") }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
          "button",
          {
            type: "button",
            style: { ...primaryButton, opacity: idle ? 1 : 0.6 },
            "aria-busy": busy === "applying",
            disabled: !idle,
            onClick: confirmImport,
            children: busy === "applying" ? t("manager.transfer.importing") : t("manager.transfer.confirm")
          }
        )
      ] })
    ] }),
    applied !== null && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { role: "status", "aria-live": "polite", style: muted, children: [
      t("manager.transfer.imported"),
      " \xB7 ",
      t("manager.transfer.previewAdded"),
      " ",
      applied.added,
      " \xB7 ",
      t("manager.transfer.previewOverwritten"),
      " ",
      applied.overwritten,
      " \xB7 ",
      t("manager.transfer.previewTotal"),
      " ",
      applied.total
    ] }),
    overflow !== null && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { role: "status", "aria-live": "polite", style: muted, children: [
      t("manager.transfer.overLimitBefore"),
      " ",
      overflow.imported,
      " ",
      t("manager.transfer.overLimitMid"),
      " ",
      overflow.total,
      " ",
      t("manager.transfer.overLimitAfter"),
      " ",
      overflow.max,
      " ",
      t("manager.transfer.overLimitNote")
    ] }),
    failure !== null && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { role: "alert", style: errorText, children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: t(failure.key) }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: errorDetail, title: failure.detail, children: failure.detail })
    ] })
  ] });
}

// src/client/components/RecycleManagePanel.tsx
var React7 = __toESM(require("react"), 1);
var import_jsx_runtime7 = require("react/jsx-runtime");
function reasonOf4(err) {
  return err instanceof Error ? err.message : String(err);
}
function deletedAtText(ms) {
  return new Date(ms).toLocaleString();
}
function RecycleManagePanel({ t }) {
  const [items, setItems] = React7.useState(null);
  const [loadError, setLoadError] = React7.useState(null);
  const [notice, setNotice] = React7.useState(null);
  const [failure, setFailure] = React7.useState(null);
  const [busy, setBusy] = React7.useState(null);
  const [reloadSeq, setReloadSeq] = React7.useState(0);
  const aliveRef = React7.useRef(true);
  React7.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  useDataChanged(() => setReloadSeq((n) => n + 1));
  React7.useEffect(() => {
    let alive = true;
    api.listTrash().then(
      (list) => {
        if (!alive) return;
        setItems(list);
        setLoadError(null);
      },
      (err) => {
        if (!alive) return;
        console.warn("[prompt-enhancer] \u56DE\u6536\u7AD9\u52A0\u8F7D\u5931\u8D25", err);
        setItems([]);
        setLoadError(reasonOf4(err));
      }
    );
    return () => {
      alive = false;
    };
  }, [reloadSeq]);
  const begin = () => {
    setNotice(null);
    setFailure(null);
  };
  const restore = (item) => {
    if (busy !== null) return;
    begin();
    setBusy(item.id);
    api.restoreTrash(item.id).then(
      () => {
        if (!aliveRef.current) return;
        setBusy(null);
        setNotice(t("manager.trash.restored"));
        notifyDataChanged();
      },
      (err) => {
        console.warn("[prompt-enhancer] \u6062\u590D\u63D0\u793A\u8BCD\u5931\u8D25", err);
        if (!aliveRef.current) return;
        setBusy(null);
        setFailure({ key: "manager.trash.restoreFailed", detail: reasonOf4(err) });
      }
    );
  };
  const purge = (item) => {
    if (busy !== null) return;
    begin();
    setBusy(item.id);
    void (async () => {
      try {
        const approved = await requestConfirm({
          title: "manager.confirm.purgeTitle",
          message: "manager.confirm.purgeMessage",
          detail: [item.title],
          confirmLabel: "manager.confirm.confirm",
          cancelLabel: "manager.confirm.cancel"
        });
        if (!approved) {
          if (aliveRef.current) setBusy(null);
          return;
        }
        await deletePrompts({ ids: [item.id], irreversible: true, remove: () => api.deleteTrash(item.id) });
        if (!aliveRef.current) return;
        setBusy(null);
        setNotice(t("manager.trash.purged"));
        notifyDataChanged();
      } catch (err) {
        console.warn("[prompt-enhancer] \u6C38\u4E45\u5220\u9664\u56DE\u6536\u7AD9\u6761\u76EE\u5931\u8D25", err);
        if (!aliveRef.current) return;
        setBusy(null);
        setFailure({ key: "manager.trash.purgeFailed", detail: reasonOf4(err) });
      }
    })();
  };
  const emptyAll = () => {
    if (busy !== null) return;
    begin();
    setBusy("empty");
    void (async () => {
      try {
        const approved = await requestConfirm({
          title: "manager.confirm.emptyTitle",
          message: "manager.confirm.emptyMessage",
          detail: (items ?? []).map((item) => item.title),
          confirmLabel: "manager.confirm.confirm",
          cancelLabel: "manager.confirm.cancel"
        });
        if (!approved) {
          if (aliveRef.current) setBusy(null);
          return;
        }
        await deletePrompts({
          ids: (items ?? []).map((it) => it.id),
          irreversible: true,
          remove: () => api.emptyTrash()
        });
        if (!aliveRef.current) return;
        setBusy(null);
        setNotice(t("manager.trash.emptied"));
        notifyDataChanged();
      } catch (err) {
        console.warn("[prompt-enhancer] \u6E05\u7A7A\u56DE\u6536\u7AD9\u5931\u8D25", err);
        if (!aliveRef.current) return;
        setBusy(null);
        setFailure({ key: "manager.trash.emptyFailed", detail: reasonOf4(err) });
      }
    })();
  };
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { style: { ...toolbar, justifyContent: "flex-end" }, children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
      "button",
      {
        type: "button",
        style: primaryButton,
        disabled: busy !== null || items === null || items.length === 0,
        onClick: emptyAll,
        children: t("manager.trash.emptyAll")
      }
    ) }),
    notice !== null && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { role: "status", "aria-live": "polite", style: muted, children: notice }),
    failure !== null && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { role: "alert", style: errorText, children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { children: t(failure.key) }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { style: errorDetail, title: failure.detail, children: failure.detail })
    ] }),
    loadError !== null && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { role: "alert", style: errorText, children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { children: t("manager.trash.loadFailed") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { style: errorDetail, title: loadError, children: loadError })
    ] }),
    loadError === null && items === null && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { style: muted, children: t("list.loading") }),
    loadError === null && items !== null && items.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { style: muted, children: t("manager.trash.empty") }),
    loadError === null && items !== null && items.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { role: "list", children: items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { role: "listitem", "aria-label": item.title, style: listRow, children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { style: rowText, children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { style: rowTitle, children: item.title }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { style: rowMeta, children: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { style: tagChip, children: [
          t("manager.trash.usage"),
          " ",
          item.usageCount
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { style: muted, children: [
          t("manager.trash.deletedAt"),
          " ",
          deletedAtText(item.deletedAt)
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { style: actions, children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { type: "button", style: button, disabled: busy !== null, onClick: () => restore(item), children: t("manager.trash.restore") }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { type: "button", style: button, disabled: busy !== null, onClick: () => purge(item), children: t("manager.trash.purge") })
      ] })
    ] }, item.id)) })
  ] });
}

// src/client/components/SkillBadge.tsx
var React8 = __toESM(require("react"), 1);

// src/skill-badge.ts
function isSkillStale(prompt) {
  return Boolean(prompt.skillName) && prompt.updatedAt > prompt.skillExportedAt;
}
function skillBadgeState(prompt) {
  if (!prompt.skillName) return "none";
  return isSkillStale(prompt) ? "stale" : "exported";
}
function skillBadgeVisual(state2) {
  return state2 === "stale" ? { tone: "warn", labelKey: "manager.skill.badgeStale", action: true, showName: false } : { tone: "success", labelKey: "manager.skill.badgeExported", action: false, showName: true };
}
async function reExportSkill(promptId, send, descriptor) {
  const request = descriptor ? { promptId, descriptor } : { promptId };
  let receipt;
  try {
    receipt = await send(request);
  } catch (err) {
    return {
      ok: false,
      errorKey: "manager.skill.exportFailed",
      detail: err instanceof Error ? err.message : String(err)
    };
  }
  if (!receipt.path) {
    return { ok: false, errorKey: "manager.skill.pathMissing", detail: "keys=" + Object.keys(receipt).sort().join(",") };
  }
  return { ok: true, receipt };
}

// src/client/components/SkillBadge.tsx
var import_jsx_runtime8 = require("react/jsx-runtime");
function chipStyle(tone, emphasize) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "0 6px",
    fontSize: 10,
    fontWeight: emphasize ? 600 : 400,
    color: tone,
    border: "1px solid " + (emphasize ? tone : TOKEN.border),
    borderRadius: 999
  };
}
var WRAP3 = { display: "inline-flex", flexDirection: "column", gap: 2, minWidth: 0 };
function SkillBadge({ t, prompt, onReExported }) {
  const [busy, setBusy] = React8.useState(false);
  const [failure, setFailure] = React8.useState(null);
  const [notice, setNotice] = React8.useState(null);
  const aliveRef = React8.useRef(true);
  React8.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  const state2 = skillBadgeState(prompt);
  if (state2 === "none") return null;
  const visual = skillBadgeVisual(state2);
  const reExport = () => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    setNotice(null);
    void (async () => {
      const descriptor = await loadStoredDescriptor(prompt.id, api.getMeta);
      const outcome = await reExportSkill(prompt.id, api.exportPromptAsSkill, descriptor);
      if (!outcome.ok) console.warn("[prompt-enhancer] \u91CD\u65B0\u5BFC\u51FA\u6280\u80FD\u5931\u8D25", outcome.detail);
      if (outcome.ok) notifyDataChanged();
      if (!aliveRef.current) return;
      setBusy(false);
      if (outcome.ok) {
        setNotice(t("manager.skill.reExported"));
        onReExported?.(outcome.receipt);
      } else {
        setFailure({ key: outcome.errorKey, detail: outcome.detail });
      }
    })();
  };
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { style: WRAP3, children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { style: chipStyle(TONE[visual.tone], visual.action), children: [
      t(visual.labelKey),
      visual.showName && " " + (prompt.skillName ?? ""),
      visual.action && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { type: "button", style: primaryButton, "aria-busy": busy, disabled: busy, onClick: reExport, children: busy ? t("manager.skill.reExporting") : t("manager.skill.reExport") })
    ] }),
    notice !== null && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { role: "status", "aria-live": "polite", style: muted, children: notice }),
    failure !== null && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { role: "alert", style: errorText, children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: t(failure.key) }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { style: errorDetail, title: failure.detail, children: failure.detail })
    ] })
  ] });
}

// src/client/components/SkillExportModal.tsx
var React9 = __toESM(require("react"), 1);
var import_jsx_runtime9 = require("react/jsx-runtime");
function reasonOf5(err) {
  return err instanceof Error ? err.message : String(err);
}
function SkillExportModal({ t, onBack }) {
  const [prompts, setPrompts] = React9.useState(null);
  const [loadError, setLoadError] = React9.useState(null);
  const [selected, setSelected] = React9.useState([]);
  const [tag, setTag] = React9.useState("");
  const [descriptors, setDescriptors] = React9.useState({});
  const [busy, setBusy] = React9.useState("idle");
  const [outcomes, setOutcomes] = React9.useState(null);
  const [fatal, setFatal] = React9.useState(null);
  const aliveRef = React9.useRef(true);
  const runRef = React9.useRef(null);
  React9.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      runRef.current?.cancel();
    };
  }, []);
  const [reloadSeq, setReloadSeq] = React9.useState(0);
  useDataChanged(() => setReloadSeq((n) => n + 1));
  React9.useEffect(() => {
    let alive = true;
    setLoadError(null);
    api.listPrompts().then(
      (list2) => {
        if (alive) setPrompts(list2);
      },
      (err) => {
        if (!alive) return;
        console.warn("[prompt-enhancer] \u6280\u80FD\u5BFC\u51FA\uFF1A\u63D0\u793A\u8BCD\u52A0\u8F7D\u5931\u8D25", err);
        setPrompts([]);
        setLoadError(reasonOf5(err));
      }
    );
    return () => {
      alive = false;
    };
  }, [reloadSeq]);
  const list = prompts ?? [];
  const visible = React9.useMemo(() => filterByTag(list, tag), [list, tag]);
  const tags = React9.useMemo(() => collectTags(list), [list]);
  const chosen = React9.useMemo(() => pickSelected(list, selected), [list, selected]);
  const summary = outcomes === null ? null : summarizeExport(outcomes);
  const idle = busy === "idle";
  const allVisibleSelected = isAllSelected(visible, selected);
  const describeChosen = () => {
    if (!idle || chosen.length === 0) return;
    const run = createSkillRun();
    runRef.current = run;
    setBusy("describing");
    setOutcomes(null);
    setFatal(null);
    void (async () => {
      try {
        await describeEach(
          chosen,
          (prompt) => api.aiSkillDescriptor({
            body: prompt.body,
            title: prompt.title,
            summary: prompt.summary,
            tags: prompt.tags
          }),
          {
            run,
            onEach: (id, outcome) => {
              if (aliveRef.current) setDescriptors((prev) => ({ ...prev, [id]: outcome }));
            }
          }
        );
      } catch (err) {
        console.warn("[prompt-enhancer] \u6280\u80FD\u8865\u5168\u7F16\u6392\u5F02\u5E38", err);
        if (aliveRef.current) setFatal(reasonOf5(err));
      } finally {
        runRef.current = null;
        if (aliveRef.current) setBusy("idle");
      }
    })();
  };
  const runExport = () => {
    if (!idle || chosen.length === 0) return;
    const run = createSkillRun();
    runRef.current = run;
    setBusy("exporting");
    setOutcomes(null);
    setFatal(null);
    void (async () => {
      try {
        const results = await exportEach({
          prompts: chosen,
          descriptors,
          run,
          send: (prompt, request) => api.exportPromptAsSkill({
            promptId: prompt.id,
            name: request.name,
            descriptor: request.descriptor,
            conflictConfirmed: request.conflictConfirmed
          }),
          // 同名冲突确认：共享确认弹窗（promise 驱动；渲染点在 PromptSurfaceHost，压住管理面板）。
          confirmConflict: (info) => requestConfirm({
            title: "manager.skill.conflictTitle",
            message: "manager.skill.conflictMessage",
            detail: [info.title + " \u2192 " + info.name, info.detail],
            confirmLabel: "manager.confirm.confirm",
            cancelLabel: "manager.confirm.cancel"
          }),
          /**
           * 要求 2：**每条成功即广播**，而不是等批次结束再广播一次。差别在「用户跑到一半就离开」：
           * 组件卸载后批次仍会收尾（剩余条目不再启动），若广播挂在下面那段组件回调里就会一起被丢掉，
           * 于是宿主已回写 `skillName` / `skillExportedAt` 而列表页不重拉 ⇒ 验收 16 的徽标不出现。
           * 回调只依赖模块级的 `notifyDataChanged()`，与组件在世与否无关。
           */
          onExported: () => notifyDataChanged()
        });
        if (!aliveRef.current) return;
        setOutcomes(results);
      } catch (err) {
        console.warn("[prompt-enhancer] \u6280\u80FD\u5BFC\u51FA\u7F16\u6392\u5F02\u5E38", err);
        if (aliveRef.current) setFatal(reasonOf5(err));
      } finally {
        runRef.current = null;
        if (aliveRef.current) setBusy("idle");
      }
    })();
  };
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { style: toolbar, children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { "data-prompt-enhancer-skill": "", style: dialogTitle, children: t("manager.skill.title") }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("button", { type: "button", style: button, onClick: onBack, children: t("manager.skill.back") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { style: muted, children: t("manager.skill.hint") }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { style: toolbar, children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
        "button",
        {
          type: "button",
          style: button,
          disabled: !idle || visible.length === 0,
          onClick: () => setSelected(toggleAllVisible(visible, selected)),
          children: allVisibleSelected ? t("manager.skill.selectNone") : t("manager.skill.selectAll")
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("label", { style: muted, children: [
        t("manager.skill.tagFilter"),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
          "select",
          {
            "aria-label": t("manager.skill.tagFilter"),
            value: tag,
            onChange: (ev) => setTag(ev.target.value),
            style: { ...select, marginLeft: 4 },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("option", { value: "", children: t("manager.skill.allTags") }),
              tags.map((name) => /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("option", { value: name, children: name }, name))
            ]
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { style: muted, children: [
        t("manager.skill.selected"),
        " ",
        chosen.length
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
        "button",
        {
          type: "button",
          style: { ...button, opacity: idle && chosen.length > 0 ? 1 : 0.6 },
          "aria-busy": busy === "describing",
          disabled: !idle || chosen.length === 0,
          onClick: describeChosen,
          children: busy === "describing" ? t("manager.skill.describing") : t("manager.skill.describe")
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
        "button",
        {
          type: "button",
          style: { ...primaryButton, opacity: idle && chosen.length > 0 ? 1 : 0.6 },
          "aria-busy": busy === "exporting",
          disabled: !idle || chosen.length === 0,
          onClick: runExport,
          children: busy === "exporting" ? t("manager.skill.exporting") : t("manager.skill.export")
        }
      )
    ] }),
    loadError !== null && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { role: "alert", style: errorText, children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: t("manager.skill.loadFailed") }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { style: errorDetail, title: loadError, children: loadError })
    ] }),
    loadError === null && prompts === null && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { style: muted, children: t("list.loading") }),
    loadError === null && prompts !== null && visible.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { style: muted, children: t("manager.skill.empty") }),
    loadError === null && visible.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { role: "list", children: visible.map((prompt) => {
      const recorded = descriptors[prompt.id];
      const descriptor = recorded?.ok ? recorded.descriptor : void 0;
      const pre = precheckExport(prompt, descriptor);
      const locked = exportNameLocked(prompt);
      return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { role: "listitem", "aria-label": prompt.title, style: listRow, children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
          "input",
          {
            type: "checkbox",
            "aria-label": prompt.title,
            checked: selected.includes(prompt.id),
            disabled: !idle,
            onChange: () => setSelected(toggleSelected(selected, prompt.id))
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { style: rowText, children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { style: rowTitle, children: prompt.title }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { style: rowMeta, children: [
            (prompt.tags ?? []).map((name) => /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { style: tagChip, children: name }, name)),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { style: muted, children: [
              t("manager.skill.nameLabel"),
              "\uFF1A",
              pre.ok ? pre.name : prompt.skillName ?? descriptor?.name ?? "\u2014",
              locked ? " \xB7 " + t("manager.skill.nameLocked") : ""
            ] })
          ] }),
          recorded !== void 0 && recorded.ok && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { style: muted, children: [
            recorded.descriptor.name,
            " \u2014 ",
            recorded.descriptor.description,
            locked ? " \xB7 " + t("manager.skill.aiNameIgnored") : ""
          ] }),
          recorded !== void 0 && !recorded.ok && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { role: "alert", style: errorText, children: [
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: t(recorded.errorKey) }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { style: errorDetail, title: recorded.detail, children: recorded.detail })
          ] }),
          !pre.ok && selected.includes(prompt.id) && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { role: "alert", style: errorText, children: [
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: t(pre.errorKey) }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { style: errorDetail, title: pre.detail, children: pre.detail })
          ] })
        ] })
      ] }, prompt.id);
    }) }),
    fatal !== null && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { role: "alert", style: errorText, children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: t("manager.skill.exportFailed") }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { style: errorDetail, title: fatal, children: fatal })
    ] }),
    summary !== null && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { style: dialogTitle, children: t("manager.skill.summary") }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { role: "status", "aria-live": "polite", style: muted, children: [
        t("manager.skill.summaryOk"),
        " ",
        summary.okCount,
        " \xB7 ",
        t("manager.skill.summaryFailed"),
        " ",
        summary.failCount,
        summary.declinedCount > 0 ? ` \xB7 ${t("manager.skill.summaryDeclined")} ${summary.declinedCount}` : ""
      ] }),
      summary.exported.map((outcome) => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { style: muted, children: [
        "\u2713 ",
        outcome.title,
        " \u2192 ",
        outcome.name,
        " \xB7 ",
        t("manager.skill.target"),
        " ",
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { style: errorDetail, title: outcome.path, children: outcome.path })
      ] }, outcome.id)),
      summary.failed.map((outcome) => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { role: "alert", style: errorText, children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { children: [
          "\u2717 ",
          outcome.title,
          " \xB7 ",
          t(outcome.errorKey)
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { style: errorDetail, title: outcome.detail, children: outcome.detail })
      ] }, outcome.id)),
      summary.declined.map((outcome) => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { style: muted, children: [
        "\u2013 ",
        outcome.title,
        " \xB7 ",
        t("manager.skill.declined")
      ] }, outcome.id)),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { style: actions, children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("button", { type: "button", style: button, onClick: onBack, children: t("manager.skill.back") }) })
    ] })
  ] });
}

// src/client/components/TagManagePanel.tsx
var React10 = __toESM(require("react"), 1);
var import_jsx_runtime10 = require("react/jsx-runtime");
function reasonOf6(err) {
  return err instanceof Error ? err.message : String(err);
}
function TagManagePanel({ t }) {
  const [tags, setTags] = React10.useState(null);
  const [loadError, setLoadError] = React10.useState(null);
  const [notice, setNotice] = React10.useState(null);
  const [failure, setFailure] = React10.useState(null);
  const [editing, setEditing] = React10.useState(null);
  const [inUse, setInUse] = React10.useState(null);
  const [busy, setBusy] = React10.useState(false);
  const [reloadSeq, setReloadSeq] = React10.useState(0);
  const aliveRef = React10.useRef(true);
  React10.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  useDataChanged(() => setReloadSeq((n) => n + 1));
  React10.useEffect(() => {
    let alive = true;
    api.listTags().then(
      (list) => {
        if (!alive) return;
        setTags(list);
        setLoadError(null);
      },
      (err) => {
        if (!alive) return;
        console.warn("[prompt-enhancer] \u6807\u7B7E\u52A0\u8F7D\u5931\u8D25", err);
        setTags([]);
        setLoadError(reasonOf6(err));
      }
    );
    return () => {
      alive = false;
    };
  }, [reloadSeq]);
  const begin = () => {
    setNotice(null);
    setFailure(null);
    setInUse(null);
    setBusy(true);
  };
  const rename = (from, value) => {
    const target = value.trim();
    if (target === "" || target === from) {
      setEditing(null);
      return;
    }
    if (busy) return;
    begin();
    api.renameTag(from, target).then(
      () => {
        if (!aliveRef.current) return;
        setBusy(false);
        setEditing(null);
        setNotice(t("manager.tags.renamed"));
        notifyDataChanged();
      },
      (err) => {
        console.warn("[prompt-enhancer] \u6807\u7B7E\u91CD\u547D\u540D\u5931\u8D25", err);
        if (!aliveRef.current) return;
        setBusy(false);
        setFailure({ key: "manager.tags.renameFailed", detail: reasonOf6(err) });
      }
    );
  };
  const remove = (item) => {
    if (busy) return;
    begin();
    api.deleteTag(item.name).then(
      () => {
        if (!aliveRef.current) return;
        setBusy(false);
        setNotice(t("manager.tags.deleted"));
        notifyDataChanged();
      },
      (err) => {
        console.warn("[prompt-enhancer] \u6807\u7B7E\u5220\u9664\u5931\u8D25", err);
        if (!aliveRef.current) return;
        setBusy(false);
        if (err instanceof ApiError && err.status === 400) {
          setInUse({ name: item.name, count: item.count });
          setReloadSeq((n) => n + 1);
          return;
        }
        setFailure({ key: "manager.tags.deleteFailed", detail: reasonOf6(err) });
      }
    );
  };
  const cleanUnused = () => {
    if (busy) return;
    const orphans = (tags ?? []).filter((item) => item.count === 0);
    if (orphans.length === 0) {
      setNotice(t("manager.tags.cleanNone"));
      setFailure(null);
      setInUse(null);
      return;
    }
    begin();
    void (async () => {
      const removed = [];
      const failed = [];
      for (const item of orphans) {
        try {
          await api.deleteTag(item.name);
          removed.push(item.name);
        } catch (err) {
          console.warn("[prompt-enhancer] \u6E05\u7406\u65E0\u7528\u6807\u7B7E\u5931\u8D25\uFF1A" + item.name, err);
          failed.push(item.name);
        }
      }
      if (!aliveRef.current) return;
      setBusy(false);
      if (failed.length > 0) setFailure({ key: "manager.tags.cleanFailed", detail: failed.join(", ") });
      if (removed.length > 0) {
        setNotice(t("manager.tags.cleaned") + " " + removed.join(", "));
        notifyDataChanged();
      } else {
        setReloadSeq((n) => n + 1);
      }
    })();
  };
  const inUseCount = inUse === null ? null : (tags ?? []).find((item) => item.name === inUse.name)?.count ?? inUse.count;
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(import_jsx_runtime10.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { style: { ...toolbar, justifyContent: "flex-end" }, children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("button", { type: "button", style: primaryButton, disabled: busy || tags === null, onClick: cleanUnused, children: t("manager.tags.clean") }) }),
    inUse !== null && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { role: "alert", style: errorText, children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { children: [
        t("manager.tags.inUseBefore"),
        " ",
        inUseCount,
        " ",
        t("manager.tags.inUseAfter")
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { style: errorDetail, title: inUse.name, children: inUse.name })
    ] }),
    notice !== null && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { role: "status", "aria-live": "polite", style: muted, children: notice }),
    failure !== null && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { role: "alert", style: errorText, children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: t(failure.key) }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { style: errorDetail, title: failure.detail, children: failure.detail })
    ] }),
    loadError !== null && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { role: "alert", style: errorText, children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: t("manager.tags.loadFailed") }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { style: errorDetail, title: loadError, children: loadError })
    ] }),
    loadError === null && tags === null && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { style: muted, children: t("list.loading") }),
    loadError === null && tags !== null && tags.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { style: muted, children: t("manager.tags.empty") }),
    loadError === null && tags !== null && tags.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { role: "list", children: tags.map((item) => /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { role: "listitem", "aria-label": item.name, style: listRow, children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { style: rowText, children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { style: rowTitle, children: item.name }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { style: rowMeta, children: /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { style: tagChip, children: [
          t("manager.tags.usage"),
          " ",
          item.count
        ] }) }),
        editing !== null && editing.from === item.name && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
          "input",
          {
            type: "text",
            "aria-label": t("manager.tags.rename"),
            value: editing.value,
            onChange: (ev) => setEditing({ from: item.name, value: ev.target.value }),
            style: textInput
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { style: actions, children: editing !== null && editing.from === item.name ? /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(import_jsx_runtime10.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("button", { type: "button", style: primaryButton, disabled: busy, onClick: () => rename(item.name, editing.value), children: t("manager.tags.renameSave") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("button", { type: "button", style: button, disabled: busy, onClick: () => setEditing(null), children: t("manager.tags.renameCancel") })
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(import_jsx_runtime10.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
          "button",
          {
            type: "button",
            style: button,
            disabled: busy,
            onClick: () => {
              setNotice(null);
              setFailure(null);
              setInUse(null);
              setEditing({ from: item.name, value: item.name });
            },
            children: t("manager.tags.rename")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("button", { type: "button", style: button, disabled: busy, onClick: () => remove(item), children: t("manager.tags.delete") })
      ] }) })
    ] }, item.name)) })
  ] });
}

// src/client/components/PromptManagerModal.tsx
var import_jsx_runtime11 = require("react/jsx-runtime");
var PANEL_ORDER = ["list", "tags", "trash", "transfer"];
var PANEL_LABEL = {
  list: "manager.tab.list",
  tags: "manager.tab.tags",
  trash: "manager.tab.trash",
  transfer: "manager.tab.transfer"
};
var SORTS = [
  { value: "default", label: "manager.list.sortDefault" },
  { value: "updated", label: "manager.list.sortUpdated" },
  { value: "used", label: "manager.list.sortUsed" },
  { value: "created", label: "manager.list.sortCreated" }
];
var SEARCH_DEBOUNCE_MS = 300;
function reasonOf7(err) {
  return err instanceof Error ? err.message : String(err);
}
function parseTagList(text) {
  const out = [];
  for (const raw of text.split(/[,，]/)) {
    const tag = raw.trim();
    if (tag !== "" && !out.includes(tag)) out.push(tag);
  }
  return out;
}
function fallbackTitle2(body) {
  const firstLine = body.split(/\r\n|\n|\r/).find((line) => line.trim() !== "") ?? "";
  return firstLine.trim();
}
function PromptManagerModal({ t, panel, panelValue, onPanelValue }) {
  const settings = useSettings();
  const [target, setTarget] = React11.useState(null);
  const capture2 = useCapture();
  const editingRef = React11.useRef(false);
  React11.useEffect(() => {
    editingRef.current = target !== null;
  }, [target]);
  React11.useEffect(() => {
    if (capture2 === null) return;
    const pending = takeCapture();
    if (pending === null) return;
    if (editingRef.current || panel !== "list") {
      console.warn("[prompt-enhancer] \u6C89\u6DC0\u8F7D\u8377\u5230\u8FBE\u65F6\u8BE6\u60C5\u9875\u6B63\u5728\u7F16\u8F91\u6216\u9762\u677F\u4E0D\u5728\u5217\u8868\u9875\uFF0C\u672C\u6B21\u9884\u586B\u5DF2\u653E\u5F03\uFF08\u4E0D\u8986\u76D6\u5F53\u524D\u8F93\u5165\uFF09");
      return;
    }
    setTarget({ kind: "create", prefill: pending });
  }, [capture2, panel]);
  const showingSkill = panelValue === "skill";
  const openPanel = (next) => {
    setTarget(null);
    onPanelValue(null);
    openManager(next);
  };
  const startCreate = () => setTarget({ kind: "create", prefill: takeCapture() });
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(
    "div",
    {
      "data-prompt-enhancer-manager": "",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": t("manager.title"),
      style: surface(settings.panelWidth, settings.panelHeight),
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { style: dialogHeader, children: [
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { style: dialogTitle, children: t("manager.title") }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { role: "tablist", "aria-label": t("manager.title"), style: dialogTabs, children: PANEL_ORDER.map((id) => /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
            "button",
            {
              type: "button",
              role: "tab",
              "aria-selected": !showingSkill && panel === id,
              style: dialogTab(!showingSkill && panel === id),
              onClick: () => openPanel(id),
              children: t(PANEL_LABEL[id])
            },
            id
          )) }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
            "button",
            {
              type: "button",
              "data-prompt-enhancer-skill-open": "",
              style: button,
              onClick: () => {
                setTarget(null);
                onPanelValue("skill");
              },
              children: t("manager.skill.open")
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("button", { type: "button", style: button, onClick: closeManager, children: t("manager.close") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
          "div",
          {
            role: "tabpanel",
            "aria-label": showingSkill ? t("manager.skill.title") : t(PANEL_LABEL[panel]),
            style: dialogBody,
            children: showingSkill ? (
              /* 技能导出页（规格 §7.6）：管理面板栈里的一页，与详情页同级（都在本卡片的内容区）。 */
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(SkillExportModal, { t, onBack: () => onPanelValue(null) })
            ) : /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(import_jsx_runtime11.Fragment, { children: [
              panel === "list" && target === null && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(PromptList, { t, onCreate: startCreate, onEdit: (prompt) => setTarget({ kind: "edit", prompt }) }),
              panel === "list" && target !== null && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
                PromptDetail,
                {
                  t,
                  target,
                  onBack: () => setTarget(null)
                },
                target.kind === "edit" ? target.prompt.id : "create"
              ),
              panel === "tags" && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(TagManagePanel, { t }),
              panel === "trash" && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(RecycleManagePanel, { t }),
              panel === "transfer" && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(ImportExportModal, { t })
            ] })
          }
        )
      ]
    }
  );
}
function PromptList({ t, onCreate, onEdit }) {
  const [query, setQuery] = React11.useState("");
  const [applied, setApplied] = React11.useState("");
  const [sort, setSort] = React11.useState("default");
  const [tag, setTag] = React11.useState("");
  const [prompts, setPrompts] = React11.useState(null);
  const [tags, setTags] = React11.useState(null);
  const [loadError, setLoadError] = React11.useState(null);
  const [tagsError, setTagsError] = React11.useState(null);
  const [notice, setNotice] = React11.useState(null);
  const [busyId, setBusyId] = React11.useState(null);
  const [deleteError, setDeleteError] = React11.useState(null);
  const [reloadSeq, setReloadSeq] = React11.useState(0);
  const aliveRef = React11.useRef(true);
  React11.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  React11.useEffect(() => {
    const id = window.setTimeout(() => setApplied(query), SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(id);
    };
  }, [query]);
  useDataChanged(() => setReloadSeq((n) => n + 1));
  React11.useEffect(() => {
    let alive = true;
    setPrompts(null);
    setLoadError(null);
    api.listPrompts({ q: applied.trim() || void 0, tag: tag || void 0, sort }).then(
      (list) => {
        if (alive) setPrompts(list);
      },
      (err) => {
        if (!alive) return;
        console.warn("[prompt-enhancer] \u63D0\u793A\u8BCD\u5217\u8868\u52A0\u8F7D\u5931\u8D25", err);
        setPrompts([]);
        setLoadError(reasonOf7(err));
      }
    );
    return () => {
      alive = false;
    };
  }, [applied, tag, sort, reloadSeq]);
  React11.useEffect(() => {
    let alive = true;
    api.listTags().then(
      (list) => {
        if (!alive) return;
        setTags(list);
        setTagsError(null);
      },
      (err) => {
        if (!alive) return;
        console.warn("[prompt-enhancer] \u6807\u7B7E\u52A0\u8F7D\u5931\u8D25", err);
        setTags(null);
        setTagsError(reasonOf7(err));
      }
    );
    return () => {
      alive = false;
    };
  }, [reloadSeq]);
  const remove = (prompt) => {
    if (busyId !== null) return;
    setBusyId(prompt.id);
    setNotice(null);
    setDeleteError(null);
    deletePrompts({ ids: [prompt.id], irreversible: false, remove: () => api.deletePrompt(prompt.id) }).then(
      () => {
        if (!aliveRef.current) return;
        setBusyId(null);
        setNotice(t("manager.list.deleted"));
        notifyDataChanged();
      },
      (err) => {
        console.warn("[prompt-enhancer] \u5220\u9664\u63D0\u793A\u8BCD\u5931\u8D25", err);
        if (!aliveRef.current) return;
        setBusyId(null);
        setDeleteError({ id: prompt.id, detail: reasonOf7(err) });
      }
    );
  };
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(import_jsx_runtime11.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { style: toolbar, children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
        "input",
        {
          type: "search",
          "aria-label": t("manager.list.search"),
          placeholder: t("manager.list.searchPlaceholder"),
          value: query,
          onChange: (ev) => setQuery(ev.target.value),
          style: { ...textInput, flex: "1 1 160px" }
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("label", { style: muted, children: [
        t("manager.list.sort"),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
          "select",
          {
            "aria-label": t("manager.list.sort"),
            value: sort,
            onChange: (ev) => setSort(ev.target.value),
            style: { ...select, marginLeft: 4 },
            children: SORTS.map(({ value, label: label2 }) => /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("option", { value, children: t(label2) }, value))
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("label", { style: muted, children: [
        t("manager.list.tagFilter"),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(
          "select",
          {
            "aria-label": t("manager.list.tagFilter"),
            value: tag,
            onChange: (ev) => setTag(ev.target.value),
            style: { ...select, marginLeft: 4 },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("option", { value: "", children: t("manager.list.allTags") }),
              (tags ?? []).map((item) => /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("option", { value: item.name, children: [
                item.name,
                " (",
                item.count,
                ")"
              ] }, item.name))
            ]
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("button", { type: "button", style: primaryButton, onClick: onCreate, children: t("manager.list.new") })
    ] }),
    tagsError !== null && /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { style: errorText, children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { children: t("manager.list.tagsFailed") }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { style: errorDetail, title: tagsError, children: tagsError })
    ] }),
    notice !== null && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { role: "status", "aria-live": "polite", style: muted, children: notice }),
    loadError !== null && /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { role: "alert", style: errorText, children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { children: t("error.load") }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { style: errorDetail, title: loadError, children: loadError })
    ] }),
    loadError === null && prompts === null && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { style: muted, children: t("list.loading") }),
    loadError === null && prompts !== null && prompts.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { style: muted, children: t("list.empty") }),
    loadError === null && prompts !== null && prompts.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { role: "list", children: prompts.map((prompt) => /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { role: "listitem", "aria-label": prompt.title, style: listRow, children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { style: rowText, children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { style: rowTitle, children: prompt.title }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { style: muted, children: promptSummary(prompt) }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { style: rowMeta, children: [
          (prompt.tags ?? []).map((item) => /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { style: tagChip, children: item }, item)),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { style: muted, children: [
            t("manager.list.usage"),
            " ",
            prompt.usageCount
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(SkillBadge, { t, prompt })
        ] }),
        deleteError !== null && deleteError.id === prompt.id && /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { role: "alert", style: errorText, children: [
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { children: t("error.delete") }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { style: errorDetail, title: deleteError.detail, children: deleteError.detail })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { style: actions, children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("button", { type: "button", style: button, onClick: () => onEdit(prompt), children: t("manager.list.edit") }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
          "button",
          {
            type: "button",
            style: { ...button, opacity: busyId === null ? 1 : 0.6 },
            "aria-busy": busyId === prompt.id,
            disabled: busyId !== null,
            onClick: () => remove(prompt),
            children: t("manager.list.delete")
          }
        )
      ] })
    ] }, prompt.id)) })
  ] });
}
function PromptDetail({ t, target, onBack }) {
  const initial = target.kind === "edit" ? target.prompt : null;
  const prefill = target.kind === "create" ? target.prefill : null;
  const [title, setTitle] = React11.useState(initial ? initial.title : prefill?.title ?? "");
  const [body, setBody] = React11.useState(initial ? initial.body : prefill?.body ?? "");
  const [tagsText, setTagsText] = React11.useState(initial ? (initial.tags ?? []).join(", ") : "");
  const [summary, setSummary] = React11.useState(initial ? initial.summary ?? "" : "");
  const [current2, setCurrent] = React11.useState(initial);
  const [busy, setBusy] = React11.useState("idle");
  const [failure, setFailure] = React11.useState(null);
  const [notice, setNotice] = React11.useState(null);
  const aliveRef = React11.useRef(true);
  React11.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  const [storedDirection, setStoredDirection] = React11.useState(
    initial === null ? void 0 : null
  );
  const toggleSeqRef = React11.useRef(0);
  React11.useEffect(() => {
    const id = initial === null ? null : initial.id;
    if (id === null) return;
    let alive = true;
    const seqAtStart = toggleSeqRef.current;
    void loadStoredDirection(id, api.getMeta).then((raw) => {
      if (!alive) return;
      if (!shouldAcceptLateRead(toggleSeqRef.current !== seqAtStart)) return;
      setStoredDirection(raw);
    });
    return () => {
      alive = false;
    };
  }, [initial === null ? null : initial.id]);
  const blankBody = body.trim() === "";
  const save = () => {
    if (busy !== "idle" || blankBody) return;
    const editing = current2;
    const input = {
      title: clampTitle(title.trim() || fallbackTitle2(body)),
      body,
      tags: parseTagList(tagsText),
      summary: summary.trim()
    };
    setBusy("saving");
    setFailure(null);
    setNotice(null);
    void (async () => {
      try {
        if (editing === null) {
          const outcome = await createFromCapture(input);
          if (!aliveRef.current) return;
          if (!outcome.ok) return;
          setCurrent(outcome.prompt);
          setTitle(outcome.prompt.title);
          setNotice(outcome.evicted.length > 0 ? t("manager.list.evicted") : t("manager.edit.saved"));
        } else {
          const updated = await api.updatePrompt(editing.id, input);
          if (!aliveRef.current) return;
          setCurrent(updated);
          setTitle(updated.title);
          setBody(updated.body);
          setTagsText((updated.tags ?? []).join(", "));
          setSummary(updated.summary ?? "");
          setNotice(t("manager.edit.saved"));
          notifyDataChanged();
        }
      } catch (err) {
        console.warn("[prompt-enhancer] \u63D0\u793A\u8BCD\u4FDD\u5B58\u5931\u8D25", err);
        if (!aliveRef.current) return;
        setFailure({ key: editing === null ? "error.create" : "error.save", detail: reasonOf7(err) });
      } finally {
        if (aliveRef.current) setBusy("idle");
      }
    })();
  };
  const toggle = () => {
    if (busy !== "idle" || current2 === null) return;
    const id = current2.id;
    setBusy("toggling");
    setFailure(null);
    setNotice(null);
    void (async () => {
      try {
        const swapped = await api.rollbackPrompt(id);
        const applied = applyToggleDirection(id, current2, reading);
        toggleSeqRef.current += 1;
        void applied.done;
        if (!aliveRef.current) return;
        setCurrent(swapped);
        setBody(swapped.body);
        if (applied.write === "persist") setStoredDirection(applied.next);
        else if (applied.write === "clear") setStoredDirection(void 0);
        notifyDataChanged();
      } catch (err) {
        console.warn("[prompt-enhancer] \u4E24\u4EFD\u6B63\u6587\u4E92\u6362\u5931\u8D25", err);
        if (!aliveRef.current) return;
        const notFound = err instanceof ApiError && err.status === 404;
        setFailure({
          key: notFound ? "error.noPrompt" : "error.rollbackNoSource",
          detail: reasonOf7(err)
        });
      } finally {
        if (aliveRef.current) setBusy("idle");
      }
    })();
  };
  const reading = React11.useMemo(
    () => current2 === null || storedDirection === null ? UNKNOWN_READING : readRefinedDirection(current2, storedDirection),
    [current2, storedDirection]
  );
  const direction = reading.direction;
  const labels = compareLabelKeys(direction);
  const currentBodyShown = current2 === null ? "" : current2.body;
  const counterpartBody = current2 === null ? "" : current2.sourceBody ?? "";
  const busyButton = blankBody || busy !== "idle";
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(import_jsx_runtime11.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { style: dialogTitle, children: t(target.kind === "create" ? "manager.edit.newTitle" : "manager.edit.editTitle") }),
    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { style: fieldRow, children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { style: fieldLabel, children: t("manager.edit.title") }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
        "input",
        {
          type: "text",
          "aria-label": t("manager.edit.title"),
          value: title,
          onChange: (ev) => setTitle(ev.target.value),
          style: { ...textInput, flex: "1 1 auto" }
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { style: fieldRow, children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { style: fieldLabel, children: t("manager.edit.body") }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
        "textarea",
        {
          "aria-label": t("manager.edit.body"),
          value: body,
          rows: 8,
          onChange: (ev) => setBody(ev.target.value),
          style: textArea
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { style: fieldRow, children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { style: fieldLabel, children: t("manager.edit.tags") }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
        "input",
        {
          type: "text",
          "aria-label": t("manager.edit.tags"),
          placeholder: t("manager.edit.tagsPlaceholder"),
          value: tagsText,
          onChange: (ev) => setTagsText(ev.target.value),
          style: { ...textInput, flex: "1 1 auto" }
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { style: fieldRow, children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { style: fieldLabel, children: t("manager.edit.summary") }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
        "input",
        {
          type: "text",
          "aria-label": t("manager.edit.summary"),
          value: summary,
          onChange: (ev) => setSummary(ev.target.value),
          style: { ...textInput, flex: "1 1 auto" }
        }
      )
    ] }),
    blankBody && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { style: muted, children: t("manager.edit.bodyRequired") }),
    notice !== null && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { role: "status", "aria-live": "polite", style: muted, children: notice }),
    failure !== null && /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { role: "alert", style: errorText, children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { children: t(failure.key) }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { style: errorDetail, title: failure.detail, children: failure.detail })
    ] }),
    current2 !== null && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
      SkillBadge,
      {
        t,
        prompt: current2,
        onReExported: (receipt) => {
          if (!receipt.prompt) {
            console.warn("[prompt-enhancer] \u91CD\u5BFC\u56DE\u6267\u7F3A\u5C11 prompt\uFF08\u5951\u7EA6\u6F02\u79FB\uFF09\uFF0C\u8BE6\u60C5\u9875\u65E0\u6CD5\u5C31\u5730\u5237\u65B0\u6280\u80FD\u72B6\u6001", receipt);
            return;
          }
          setCurrent(receipt.prompt);
        }
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { style: actions, children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("button", { type: "button", style: button, onClick: onBack, children: t("manager.edit.back") }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
        "button",
        {
          type: "button",
          style: { ...primaryButton, opacity: busyButton ? 0.6 : 1, cursor: busyButton ? "default" : "pointer" },
          "aria-busy": busy === "saving",
          disabled: busyButton,
          onClick: save,
          children: busy === "saving" ? t("manager.edit.saving") : t("manager.edit.save")
        }
      )
    ] }),
    current2 !== null && canToggle(current2) && /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(import_jsx_runtime11.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { style: dialogTitle, children: t("manager.compare.title") }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { style: compareGrid, children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { style: compareBlock, children: [
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { style: compareHead, children: t(labels.current) }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { style: compareBody, children: currentBodyShown })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { style: compareBlock, children: [
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { style: compareHead, children: t(labels.counterpart) }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { style: compareBody, children: counterpartBody })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { style: muted, children: t(labels.neutral ? "manager.compare.unknownDirection" : "manager.compare.directionPersisted") }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { style: actions, children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
        "button",
        {
          type: "button",
          style: { ...primaryButton, opacity: busy === "idle" ? 1 : 0.6 },
          "aria-busy": busy === "toggling",
          disabled: busy !== "idle",
          onClick: toggle,
          children: busy === "toggling" ? t("manager.compare.toggling") : t("manager.compare.toggle")
        }
      ) })
    ] })
  ] });
}

// src/client/components/PromptSurfaceHost.tsx
var import_jsx_runtime12 = require("react/jsx-runtime");
var DICT_KEYS = new Set(Object.keys(zh));
function label(t, text) {
  return DICT_KEYS.has(text) ? t(text) : text;
}
function ConfirmDialog({
  request,
  t
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
    "div",
    {
      "data-prompt-enhancer-confirm": "",
      style: CONFIRM_LAYER,
      onPointerDownCapture: (ev) => {
        if (ev.target === ev.currentTarget) resolveConfirm(false);
      },
      children: /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { role: "dialog", "aria-modal": "true", "aria-label": label(t, request.title), style: CONFIRM_SURFACE, children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { style: dialogTitle, children: label(t, request.title) }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { style: muted, children: label(t, request.message) }),
        request.detail.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("ul", { style: CONFIRM_LIST, children: request.detail.map((line, index) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("li", { children: line }, index)) }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { style: actions, children: [
          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("button", { type: "button", style: button, onClick: () => resolveConfirm(false), children: label(t, request.cancelLabel) }),
          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("button", { type: "button", style: primaryButton, onClick: () => resolveConfirm(true), children: label(t, request.confirmLabel) })
        ] })
      ] })
    }
  );
}
function PromptSurfaceHost({ t }) {
  const { open, panel } = useManagerState();
  const confirmRequest = useConfirmRequest();
  const claimed = useOverlayClaim();
  const [panelValue, setPanelValue] = React12.useState(null);
  React12.useEffect(() => {
    if (!open) setPanelValue(null);
  }, [open]);
  if (!open && confirmRequest === null) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(
    "div",
    {
      "data-prompt-enhancer-claim": claimed,
      style: backdrop,
      onPointerDownCapture: (ev) => {
        if (ev.target === ev.currentTarget) closeManager();
      },
      children: [
        open && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(PromptManagerModal, { t, panel, panelValue, onPanelValue: setPanelValue }),
        confirmRequest !== null && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(ConfirmDialog, { request: confirmRequest, t })
      ]
    }
  );
}
var CONFIRM_LAYER = {
  position: "fixed",
  inset: 0,
  zIndex: 120,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  background: "rgba(0, 0, 0, 0.35)"
};
var CONFIRM_SURFACE = {
  ...overlayBase,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  width: 360,
  maxWidth: "calc(100vw - 40px)",
  maxHeight: "calc(100vh - 40px)",
  overflow: "hidden",
  padding: 12,
  fontSize: 12
};
var CONFIRM_LIST = {
  margin: 0,
  paddingLeft: 18,
  maxHeight: 180,
  overflowY: "auto",
  color: TOKEN.muted,
  fontSize: 11,
  overflowWrap: "anywhere"
};

// src/client/components/SidebarPromptEntry.tsx
var import_jsx_runtime13 = require("react/jsx-runtime");
function entryStyle(wide) {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    height: 28,
    width: wide ? void 0 : 28,
    padding: wide ? "0 8px" : 0,
    flex: "0 0 auto",
    fontSize: 12,
    color: TOKEN.fg,
    background: "transparent",
    border: `1px solid ${TOKEN.border}`,
    borderRadius: 6,
    cursor: "pointer"
  };
}
function SidebarPromptEntry({ t, wide }) {
  const settings = useSettings();
  if (!settings.showSidebarButton) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)(
    "button",
    {
      type: "button",
      style: entryStyle(wide),
      title: t("sidebar.entry.tip"),
      "aria-label": t("sidebar.entry.title"),
      "aria-haspopup": "dialog",
      onClick: () => openManager(),
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(BookIcon, {}),
        wide && /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { children: t("sidebar.entry.title") })
      ]
    }
  );
}
function BookIcon() {
  return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true", style: ICON2, children: [
    /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
      "path",
      {
        d: "M4 5.5C4 4.7 4.7 4 5.5 4H11v15H5.5C4.7 19 4 18.3 4 17.5v-12Z",
        stroke: "currentColor",
        strokeWidth: "1.7",
        strokeLinejoin: "round"
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
      "path",
      {
        d: "M20 5.5C20 4.7 19.3 4 18.5 4H13v15h5.5c.8 0 1.5-.7 1.5-1.5v-12Z",
        stroke: "currentColor",
        strokeWidth: "1.7",
        strokeLinejoin: "round"
      }
    )
  ] });
}
var ICON2 = { display: "block", flex: "0 0 auto" };

// src/client/index.ts
var SETTINGS_NAMESPACE = "prompt-enhancer";
var inject = ["slots", "locale"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "prompt-enhancer: dictionaries");
  ctx.inject(["slots"], (scope2) => {
    scope2.slots.inject(
      "conversation.input.left",
      () => scope2.slots.register(
        { name: "conversation.input.left", id: "prompt-enhancer", order: 10, locale: NS },
        PromptLibraryButton
      )
    );
    scope2.slots.inject(
      "conversation.input.overlay",
      () => scope2.slots.register(
        { name: "conversation.input.overlay", id: "prompt-enhancer-hash", order: 20, locale: NS },
        HashSuggestOverlay
      )
    );
    scope2.slots.inject(
      "conversation.input.left",
      () => scope2.slots.register(
        { name: "conversation.input.left", id: "prompt-enhancer-ai-polish", order: 11, locale: NS },
        AIPolishButton
      )
    );
    scope2.slots.inject(
      "shell.overlay",
      () => scope2.slots.register(
        { name: "shell.overlay", id: "prompt-enhancer", order: 100, locale: NS },
        PromptSurfaceHost
      )
    );
    scope2.slots.inject(
      "sidebar.footer.action",
      () => scope2.slots.register(
        { name: "sidebar.footer.action", id: "prompt-enhancer", order: 100, locale: NS },
        SidebarPromptEntry
      )
    );
  });
  ctx.inject(["uiWorkspace"], (scope2) => {
    setDirectoryCapability(scope2.uiWorkspace ?? null);
    return () => setDirectoryCapability(null);
  });
  ctx.effect(() => {
    if (false) console.log("[prompt-enhancer] client loaded v0.1.0");
    return () => {
      if (false) console.log("[prompt-enhancer] client unloaded");
    };
  }, "prompt-enhancer: lifecycle");
  ctx.inject(["settingsScope"], (scope2) => {
    const binder = scope2.settingsScope;
    setSettingsScope(binder ? binder.bind({ namespace: SETTINGS_NAMESPACE }) : null);
    return () => setSettingsScope(null);
  });
}
    module.exports = { apply, inject };
    return module.exports;
  }
});

//# sourceMappingURL=client.js.map
