// src/host/ai.ts
import { appendFileSync, mkdirSync } from "node:fs";
import { join as join2 } from "node:path";
import { BlockAssembler, createUserMessage } from "@deepseek-ai/dsh-llm";

// src/host/paths.ts
import { homedir } from "node:os";
import { join } from "node:path";
function dshHome() {
  return process.env.DSH_HOME || join(homedir(), ".dsh");
}
function dataDir() {
  return join(dshHome(), "prompt-enhancer");
}
function dbPath() {
  return join(dataDir(), "db", "prompts.db");
}
function logDir() {
  return join(dataDir(), "log");
}

// src/host/ai-cache.ts
var AI_CACHE_TTL_MS = 30 * 60 * 1e3;
var AI_CACHE_MAX_ENTRIES = 50;
function fnv1a(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}
function canonicalCacheInput(input) {
  const parts = [input.system, input.user, input.route];
  return parts.map((p) => `${p.length}:${p}`).join("|");
}
function hashCacheKey(input) {
  return fnv1a(canonicalCacheInput(input));
}
var AiResultCache = class {
  entries = /* @__PURE__ */ new Map();
  maxEntries;
  ttlMs;
  now;
  constructor(options = {}) {
    this.maxEntries = options.maxEntries ?? AI_CACHE_MAX_ENTRIES;
    this.ttlMs = options.ttlMs ?? AI_CACHE_TTL_MS;
    this.now = options.now ?? Date.now;
  }
  /** 命中返回缓存值；未命中或已过期返回 undefined（过期条目顺带清除）。 */
  get(key) {
    const entry = this.entries.get(key);
    if (entry === void 0) return void 0;
    if (this.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return void 0;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }
  /** 写入并按容量淘汰最久未用条目（TTL 到期时间以写入时刻计）。 */
  set(key, value) {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }
  delete(key) {
    this.entries.delete(key);
  }
  clear() {
    this.entries.clear();
  }
  get size() {
    return this.entries.size;
  }
};
var aiResultCache = new AiResultCache();

// src/host/ai-budget.ts
var AI_ATTEMPT_TIMEOUT_MS = 3e4;
var AI_TOTAL_BUDGET_MS = 11e4;
function startAiBudget(totalMs = AI_TOTAL_BUDGET_MS, now = Date.now()) {
  return { deadline: now + Math.max(0, totalMs) };
}
function remainingMs(budget, now = Date.now()) {
  return budget.deadline - now;
}
function attemptTimeoutMs(budget, now = Date.now()) {
  const left = remainingMs(budget, now);
  return left <= 0 ? 0 : Math.min(AI_ATTEMPT_TIMEOUT_MS, left);
}

// src/host/ai-errors.ts
function attemptFailure(code, detail) {
  return { code, detail: detail.replace(/\s+/g, " ").slice(0, 200) };
}
function failureDiagnosis(failure, expectation = "json") {
  return [
    "\u4E0A\u4E00\u6B21\u5C1D\u8BD5\u5931\u8D25\u4E86\uFF0C\u672C\u6B21\u8BF7\u4FEE\u6B63\uFF1A",
    "- \u5931\u8D25\u7C7B\u578B\uFF1A" + failure.code,
    ...failure.detail ? ["- \u5931\u8D25\u7EC6\u8282\uFF1A" + failure.detail] : [],
    expectation === "json" ? "- \u4E0A\u4E00\u6B21\u7684\u539F\u59CB\u8F93\u51FA\u5F88\u53EF\u80FD\u662F\u7A7A\u56DE\u590D\u3001\u975E JSON \u6587\u672C\u6216 JSON \u7F3A\u5B57\u6BB5\uFF1B\u672C\u6B21\u8BF7\u4E25\u683C\u8F93\u51FA\u4E00\u4E2A JSON \u5BF9\u8C61\uFF0C\u4E0D\u8981 Markdown \u4EE3\u7801\u5757\uFF0C\u4E0D\u8981\u4EFB\u4F55\u89E3\u91CA\u6216\u591A\u4F59\u6587\u5B57\u3002" : "- \u4E0A\u4E00\u6B21\u7684\u8BF7\u6C42\u5F88\u53EF\u80FD\u662F\u8D85\u65F6\u6216\u7A7A\u56DE\u590D\uFF1B\u672C\u6B21\u8BF7\u76F4\u63A5\u8F93\u51FA\u6B63\u6587\u672C\u8EAB\u2014\u2014\u7EAF\u6587\u672C\uFF0C\u4E0D\u8981\u4EFB\u4F55\u5305\u88C5\u3001\u4E0D\u8981 Markdown \u4EE3\u7801\u5757\u3001\u4E0D\u8981\u4EFB\u4F55\u89E3\u91CA\u6216\u591A\u4F59\u6587\u5B57\u3002"
  ].join("\n");
}
async function withDiagnosticRetry(attempt, expectation = "json") {
  const first = await attempt();
  if (first.ok) return { ok: true, text: first.text };
  const second = await attempt(failureDiagnosis(first.failure, expectation));
  if (second.ok) return { ok: true, text: second.text };
  return second.failure.detail === void 0 ? { ok: false, code: second.failure.code } : { ok: false, code: second.failure.code, detail: second.failure.detail };
}

// src/host/refine.ts
function parseRefineResult(text) {
  let json2 = text.trim();
  const fence = json2.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) json2 = fence[1].trim();
  const start = json2.indexOf("{");
  const end = json2.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return void 0;
  try {
    const parsed = JSON.parse(json2.slice(start, end + 1));
    const body = typeof parsed.body === "string" ? parsed.body.trim() : "";
    if (!body) return void 0;
    const tags = Array.isArray(parsed.tags) ? parsed.tags.filter((t) => typeof t === "string" && !!t.trim()).map((t) => t.trim()) : [];
    return {
      title: typeof parsed.title === "string" ? parsed.title.trim() : "",
      // 词库只支持单个标签，这里直接归一为单个，避免调用方各自处理
      tags: tags.slice(0, 1),
      summary: typeof parsed.summary === "string" ? parsed.summary.trim() : "",
      body
    };
  } catch {
    return void 0;
  }
}

// src/host/text.ts
var AI_OPEN_RE = /^(好的?|好的呢|没问题|收到|可以|想到了|毕竟是|这是我的|这是我(为[你您])?(优化|润色|完善|整理|改写)?(后|好的?|的|成的|版)?|以下为?(你|您)?(的)?(优化|润色|完善|整理|改写)?(后|好的?|的|成的|版|结果|建议)?|下面是?(的)?|以下是?[你您]?(的)?|这会?是|为你?|为您?|已(经)?为[你您]|已为你|结果如下|如下|示例如下|请[你您]查收|我给[你您]|回答完毕|帮你|现在为[你您]|给你(的)?)|^(hello|hi\b|hey\b|sure|of\s+course|no\s+problem|here(?:\s|'s| is)|below\b|this\s+is|the\s+(polished|optimized|improved|revised|updated|cleaned|final|better)\s+version|i(?:'ve| have| am)?(?: prepared| optimized| provided| polished| revised| improved| updated)?|please\s+find|glad\s+to\s+help|conforme?d)/i;
var AI_CLOSE_RE = /^(希望(?:能|对)?[你您]?|如有(?:任何)?|如果(?:有|需要|你)|倘若|有问题|有任何|祝你?|祝您|以上(?:是)?|仅供|谢谢|感谢|需要|如需|有需要|敬请|请继续|随时|以下是根据|我[可能已经]?可以|加油|总体来说|总而言之|只需|您可以在|您可以按|有任何需要)|^(hope|i\s+hope|let\s+me\s+know|if\s+you\s+need|feel\s+free|thanks|thank\s+you|regards|best\s+regards|good\s+luck|please\s+(?:feel\s+free|let\s+me|don't|do\s+not\s+hesitate)|any\s+questions|do\s+not\s+hesitate)/i;
var META_TAIL = /([:：。！!?]|以下|如下|结果|版本|提示词|正文|内容|prompt|version|result|below|following|text)$/i;
var SHORT_LINE_MAX = 6;
var STRIP_MAX_LINES = 6;
function isFillerLine(line) {
  const t = line.trim();
  if (!t) return false;
  if (!AI_OPEN_RE.test(t) && !AI_CLOSE_RE.test(t)) return false;
  return META_TAIL.test(t) || [...t].length <= SHORT_LINE_MAX;
}
function stripAiFillerDetailed(text) {
  if (!text) return { text, stripped: [] };
  let out = text.trim();
  const stripped = [];
  const unfenced = out.replace(/^\s*```[a-zA-Z0-9_+\-.]*\s*\n?([\s\S]*?)\s*\n?```\s*$/, "$1");
  if (unfenced !== out) {
    stripped.push("\uFF08\u6574\u4F53\u4EE3\u7801\u56F4\u680F\u5DF2\u5265\u79BB\uFF09");
    out = unfenced.trim();
  }
  const lines = out.split("\n");
  let start = 0;
  const maxFront = Math.min(lines.length, STRIP_MAX_LINES);
  while (start < maxFront && isFillerLine(lines[start])) {
    stripped.push(lines[start].trim());
    start++;
  }
  let end = lines.length;
  while (end - 1 > start && end - start <= STRIP_MAX_LINES && isFillerLine(lines[end - 1])) {
    stripped.push(lines[end - 1].trim());
    end--;
  }
  return { text: lines.slice(start, end).join("\n").trim(), stripped };
}
function parseSummaryJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) return void 0;
  try {
    const obj = JSON.parse(candidate.slice(start, end + 1));
    const summary = typeof obj.summary === "string" ? obj.summary.trim() : "";
    return summary || void 0;
  } catch {
    return void 0;
  }
}
function extractVariables(body) {
  return [...body.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map((m) => m[1].trim()).filter(Boolean);
}

// src/host/ai.ts
var AI_MAX_TOKENS = 2048;
var ROUTE_CACHE_TTL_MS = 3e4;
var SKILL_DESCRIBE_ATTEMPTS = 3;
var llm;
var routeCache;
var llmQueue = Promise.resolve();
function pad2(n) {
  return String(n).padStart(2, "0");
}
function localDate() {
  const d = /* @__PURE__ */ new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function localTime() {
  const d = /* @__PURE__ */ new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}
function logAI(message) {
  if (true) return;
  try {
    mkdirSync(logDir(), { recursive: true });
    appendFileSync(join2(logDir(), `ai-${localDate()}.log`), `[${localTime()}] ${message}
`, "utf8");
  } catch (e) {
    console.warn("[prompt-enhancer] AI \u65E5\u5FD7\u5199\u5165\u5931\u8D25\uFF1A" + String(e));
  }
}
function registerLlm(runtime) {
  llm = runtime;
  clearRouteCache();
  logAI(runtime ? "llm injected" : "llm removed");
}
function clearRouteCache() {
  routeCache = void 0;
}
function withLlmLock(task) {
  const next = llmQueue.then(task, task);
  llmQueue = next.then(
    () => void 0,
    () => void 0
  );
  return next;
}
async function listAiSelectables() {
  if (!llm) return [];
  const out = [];
  for (const provider of llm.listProviders()) {
    let models = [];
    try {
      models = await llm.listModels(provider.id);
    } catch (e) {
      logAI(`listModels fail ${provider.id}: ${String(e)}`);
    }
    out.push({
      provider: provider.id,
      name: provider.name || provider.id,
      models: models.map((m) => ({ id: m.id, name: m.name || m.id }))
    });
  }
  return out;
}
async function isModelAvailable(runtime, provider, model) {
  try {
    const models = await runtime.listModels(provider);
    return models.some((m) => m.id === model);
  } catch (e) {
    logAI(`isModelAvailable fail ${provider}/${model}: ${String(e)}`);
    return false;
  }
}
async function resolveCandidates(runtime, settings) {
  const key = `${settings.aiProvider}|${settings.aiModel}`;
  if (routeCache && routeCache.key === key && Date.now() - routeCache.ts < ROUTE_CACHE_TTL_MS) {
    return routeCache.value;
  }
  const candidates = [];
  const seen = /* @__PURE__ */ new Set();
  if (settings.aiProvider && settings.aiModel) {
    if (await isModelAvailable(runtime, settings.aiProvider, settings.aiModel)) {
      candidates.push({ provider: settings.aiProvider, model: settings.aiModel });
      seen.add(`${settings.aiProvider}/${settings.aiModel}`);
      logAI(`route manual ok ${settings.aiProvider}/${settings.aiModel}`);
    } else {
      logAI(`route manual bad ${settings.aiProvider}/${settings.aiModel}`);
    }
  }
  for (const provider of runtime.listProviders()) {
    let models = [];
    try {
      models = await runtime.listModels(provider.id);
    } catch (e) {
      logAI(`route listModels fail ${provider.id}: ${String(e)}`);
      continue;
    }
    if (models.length === 0) continue;
    const pick = models.find((m) => /chat|deepseek/i.test(m.id)) ?? models[0];
    const id = `${provider.id}/${pick.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    candidates.push({ provider: provider.id, model: pick.id });
  }
  routeCache = { key, ts: Date.now(), value: candidates };
  return candidates;
}
function enrichSystemPrompt(existingTags, existingVars) {
  const tagLib = existingTags.length ? existingTags.join("\u3001") : "\uFF08\u6682\u65E0\uFF09";
  return [
    "\u4F60\u662F\u4E00\u540D\u8BCD\u5E93\u6574\u7406\u52A9\u624B\uFF0C\u5E2E\u52A9\u7528\u6237\u628A\u539F\u59CB\u8F93\u5165\u6574\u7406\u6210\u9AD8\u8D28\u91CF\u3001\u53EF\u590D\u7528\u7684\u63D0\u793A\u8BCD\u3002",
    "",
    "\u3010\u6807\u7B7E\u5E93\u3011\u4EE5\u4E0B\u662F\u5F53\u524D\u5DF2\u6709\u7684\u6807\u7B7E\uFF0C\u8BF7\u4F18\u5148\u590D\u7528\u6700\u8D34\u5408\u7684\u4E00\u4E2A\uFF0C\u907F\u514D\u91CD\u590D\u521B\u5EFA\uFF1A",
    tagLib,
    "",
    "\u8BF7\u4E25\u683C\u8F93\u51FA\u4E00\u4E2A JSON \u5BF9\u8C61\uFF0C\u4E0D\u8981 Markdown \u4EE3\u7801\u5757\uFF0C\u4E0D\u8981\u4EFB\u4F55\u591A\u4F59\u6587\u5B57\uFF1A",
    '{ "title": "\u7B80\u6D01\u6807\u9898", "tags": ["\u6807\u7B7E"], "summary": "\u7528\u9014\u6458\u8981\u4E0E\u4F7F\u7528\u8BF4\u660E", "body": "\u4F18\u5316\u6539\u5199\u540E\u7684\u63D0\u793A\u8BCD\u6B63\u6587" }',
    "",
    "\u8981\u6C42\uFF1A",
    "- title\uFF1A\u7B80\u6D01\u660E\u4E86\uFF0C\u4E0D\u8D85\u8FC7 30 \u5B57\uFF1B",
    "- tags\uFF1A\u53EA\u8F93\u51FA 1 \u4E2A\u6807\u7B7E\uFF1B\u4F18\u5148\u4ECE\u3010\u6807\u7B7E\u5E93\u3011\u4E2D\u9009\u62E9\u6700\u8D34\u5408\u7684\u4E00\u4E2A\uFF0C\u82E5\u6CA1\u6709\u5408\u9002\u7684\u518D\u65B0\u9020\u4E00\u4E2A\u7B80\u6D01\u3001\u8D34\u5408\u5185\u5BB9\u7684\u65B0\u6807\u7B7E\uFF1B",
    "- summary\uFF1A\u4E00\u4E24\u53E5\u8BDD\u8BF4\u660E\u8FD9\u4E2A\u63D0\u793A\u8BCD\u7684\u7528\u9014\u4E0E\u4F7F\u7528\u65B9\u6CD5\uFF1B",
    "- body\uFF1A\u5728\u4FDD\u7559\u539F\u610F\u7684\u57FA\u7840\u4E0A\u6DA6\u8272\uFF0C\u4F7F\u8868\u8FBE\u66F4\u6E05\u6670\u3001\u901A\u7528\u3001\u53EF\u76F4\u63A5\u4F7F\u7528\uFF0C\u4E0D\u8981\u4E22\u5931\u5173\u952E\u7EC6\u8282\uFF1B",
    ...existingVars.length ? [
      "- \u6B63\u6587\u4E2D\u7684 `{{\u53D8\u91CF\u540D}}` \u662F\u6A21\u677F\u53D8\u91CF\u5360\u4F4D\u7B26\uFF08\u8FD0\u884C\u65F6\u7531\u4F7F\u7528\u8005\u66FF\u6362\uFF09\uFF1A\u6240\u6709\u5DF2\u6709\u7684 {{}} \u5FC5\u987B\u539F\u6837\u4FDD\u7559\uFF0C\u4E0D\u5F97\u5220\u9664\u3001\u6539\u5199\u6216\u66FF\u6362\u5176\u4E2D\u7684\u53D8\u91CF\u540D\u3001\u4E0D\u5F97\u4FEE\u6539\u5176\u62EC\u53F7\u683C\u5F0F\uFF1B"
    ] : [],
    "- \u82E5\u6B63\u6587\u67D0\u5904\u5185\u5BB9\u4F1A\u56E0\u4F7F\u7528\u573A\u666F\u800C\u53D8\u5316\uFF08\u5982\u89D2\u8272\u3001\u5BF9\u8C61\u3001\u4E3B\u9898\u3001\u98CE\u683C\u3001\u7EC6\u8282\u7B49\uFF09\uFF0C\u53EF\u5728\u90A3\u5904\u65B0\u589E\u547D\u540D\u6E05\u6670\u3001\u8D34\u5408\u8BED\u5883\u7684 {{\u53D8\u91CF\u540D}} \u5360\u4F4D\u7B26\uFF0C\u63D0\u5347\u63D0\u793A\u8BCD\u53EF\u590D\u7528\u6027\uFF1B\u6CA1\u6709\u8FD9\u79CD\u9700\u6C42\u65F6\u4E0D\u8981\u753B\u86C7\u6DFB\u8DB3\uFF1B"
  ].join("\n");
}
function enrichUserMessage(rawBody, tag, existingVars) {
  const lines = ["\u4EE5\u4E0B\u662F\u7528\u6237\u8981\u5B66\u4E60\u7684\u539F\u59CB\u63D0\u793A\u8BCD\uFF1A", "", rawBody];
  if (tag) lines.push("", `\u7528\u6237\u7ED9\u51FA\u7684\u5019\u9009\u6807\u7B7E\uFF1A${tag}`);
  if (existingVars.length) {
    lines.push("", `\u6B63\u6587\u5DF2\u6709\u6A21\u677F\u53D8\u91CF\uFF08{{}} \u5185\u4E3A\u53D8\u91CF\u540D\uFF0C\u8FD0\u884C\u65F6\u66FF\u6362\uFF0C\u5FC5\u987B\u539F\u6837\u4FDD\u7559\uFF09\uFF1A${existingVars.join("\u3001")}`);
  }
  return lines.join("\n");
}
function polishSystemPrompt(keepVariables) {
  return [
    "\u4F60\u662F\u4E00\u540D\u4E13\u4E1A\u7684\u63D0\u793A\u8BCD\u6DA6\u8272\u52A9\u624B\u3002",
    "",
    "\u8981\u6C42\uFF1A",
    "- \u53EA\u6DA6\u8272\u63D0\u793A\u8BCD\u5185\u5BB9\u672C\u8EAB\uFF0C\u4E0D\u8981\u6D89\u53CA\u6807\u9898\u3001\u6807\u7B7E\u3001\u5206\u7C7B\u7B49\uFF1B",
    "- \u4FDD\u6301\u539F\u610F\u4E0E\u6240\u6709\u5173\u952E\u7EC6\u8282\uFF0C\u4E0D\u5F97\u9057\u6F0F\u3001\u66F2\u89E3\u6216\u5220\u51CF\uFF1B",
    "- \u957F\u5EA6\u63A7\u5236\u5728\u7B49\u957F\u6216\u66F4\u7CBE\u70BC\uFF1A\u4E0D\u5F97\u6269\u5199\uFF0C\u4E0D\u5F97\u589E\u52A0\u539F\u6587\u6CA1\u6709\u7684\u8981\u6C42\u3001\u6B65\u9AA4\u6216\u4E8B\u5B9E\uFF1B",
    ...keepVariables ? [
      "- \u6B63\u6587\u4E2D\u7684 `{{\u53D8\u91CF\u540D}}` \u662F\u6A21\u677F\u53D8\u91CF\u5360\u4F4D\u7B26\uFF08\u8FD0\u884C\u524D\u7531\u4F7F\u7528\u8005\u66FF\u6362\uFF09\uFF1A\u6240\u6709\u5DF2\u6709\u7684 {{}} \u5FC5\u987B\u539F\u6837\u4FDD\u7559\uFF0C\u4E0D\u5F97\u5220\u9664\u3001\u6539\u5199\u6216\u66FF\u6362\u5176\u4E2D\u7684\u53D8\u91CF\u540D\uFF1B",
      "- \u4E0A\u9762\u7684\u957F\u5EA6\u7EA6\u675F\u6709\u4E00\u4E2A\u4F8B\u5916\uFF1A\u82E5\u6B63\u6587\u67D0\u5904\u5185\u5BB9\u4F1A\u56E0\u4F7F\u7528\u573A\u666F\u800C\u53D8\u5316\uFF08\u5982\u89D2\u8272\u3001\u5BF9\u8C61\u3001\u4E3B\u9898\u3001\u98CE\u683C\u3001\u7EC6\u8282\u7B49\uFF09\uFF0C\u53EF\u5728\u8BE5\u5904\u65B0\u589E\u547D\u540D\u6E05\u6670\u3001\u8D34\u5408\u8BED\u5883\u7684 {{\u53D8\u91CF\u540D}} \u5360\u4F4D\u7B26\uFF0C\u63D0\u5347\u63D0\u793A\u8BCD\u53EF\u590D\u7528\u6027\uFF1B\u6CA1\u6709\u8FD9\u79CD\u9700\u6C42\u65F6\u4E0D\u8981\u753B\u86C7\u6DFB\u8DB3\uFF1B"
    ] : [],
    "- \u8BA9\u63D0\u793A\u8BCD\u66F4\u6E05\u6670\u3001\u901A\u7528\u3001\u7ED3\u6784\u6E05\u6670\u3001\u53EF\u76F4\u63A5\u590D\u7528\uFF1B",
    "- \u76F4\u63A5\u8F93\u51FA\u6DA6\u8272\u540E\u7684\u63D0\u793A\u8BCD\u6B63\u6587\uFF0C\u4E0D\u8981\u4EFB\u4F55\u89E3\u91CA\u6216 Markdown \u4EE3\u7801\u5757\u3002"
  ].join("\n");
}
function summarySystemPrompt() {
  return [
    "\u4F60\u662F\u4E00\u540D\u4E13\u4E1A\u7684\u63D0\u793A\u8BCD\u5206\u6790\u5E08\uFF0C\u64C5\u957F\u7528\u4E00\u53E5\u8BDD\u6982\u62EC\u63D0\u793A\u8BCD\u7684\u7528\u9014\u4E0E\u7528\u6CD5\u3002",
    "",
    "\u8981\u6C42\uFF1A",
    "- \u7528\u4E00\u4E24\u53E5\u8BDD\u8BF4\u660E\u8FD9\u6761\u63D0\u793A\u8BCD\u7684\u6838\u5FC3\u7528\u9014\u4E0E\u5927\u81F4\u4F7F\u7528\u65B9\u6CD5\uFF08\u9002\u7528\u573A\u666F/\u4F7F\u7528\u65B9\u5F0F\uFF09\uFF1B",
    "- \u7B80\u6D01\u81EA\u7136\uFF0C\u4E0D\u8981\u590D\u8FF0\u6B63\u6587\u7684\u5177\u4F53\u7EC6\u8282\u4E0E\u6B65\u9AA4\uFF0C50 \u5B57\u4EE5\u5185\uFF1B",
    '- \u76F4\u63A5\u8F93\u51FA JSON\uFF1A{ "summary": "\u7528\u9014\u6458\u8981" }\uFF0C\u4E0D\u8981\u4EFB\u4F55\u89E3\u91CA\u6216 Markdown \u4EE3\u7801\u5757\u3002'
  ].join("\n");
}
function skillSystemPrompt(vars) {
  return [
    "\u4F60\u662F\u4E00\u540D DSH \u6280\u80FD\uFF08SKILL\uFF09\u8BBE\u8BA1\u52A9\u624B\u3002\u7528\u6237\u4F1A\u7ED9\u4F60\u4E00\u6761\u63D0\u793A\u8BCD\uFF0C\u8BF7\u628A\u5B83\u8F6C\u5316\u4E3A\u4E00\u4E2A\u89C4\u8303\u3001\u53EF\u76F4\u63A5\u590D\u7528\u7684\u6280\u80FD\u3002",
    "",
    "\u8981\u6C42\uFF1A",
    "- name\uFF1A\u82F1\u6587\u5C0F\u5199 kebab-case\uFF08\u4EC5\u5B57\u6BCD/\u6570\u5B57/\u8FDE\u5B57\u7B26\uFF0C4-40 \u4E2A\u5B57\u7B26\uFF09\uFF0C\u7B80\u6D01\u8FBE\u610F\uFF0C\u4F5C\u4E3A\u6280\u80FD\u76EE\u5F55\u540D\u4E0E\u804A\u5929\u6846 /\u89E6\u53D1\u540D\uFF1B",
    "- description\uFF1A\u7528\u4E00\u53E5\u82F1\u6587\u63CF\u8FF0\u8BE5\u6280\u80FD\u7684\u7528\u9014\u4E0E\u9002\u7528\u573A\u666F\uFF08\u4E0D\u8981 Markdown\uFF09\uFF0C\u4F9B\u6280\u80FD AI \u5728\u5408\u9002\u65F6\u673A\u81EA\u52A8\u89E6\u53D1\uFF1B",
    "- whenToUse\uFF1A\u82F1\u6587\uFF0C\u4E00\u4E24\u53E5\u8BDD\u8BF4\u660E\u4EC0\u4E48\u573A\u666F\u4E0B\u5E94\u8BE5\u4F7F\u7528\u8BE5\u6280\u80FD\uFF1B",
    `- \u6B63\u6587\u4E2D\u7684 {{\u53D8\u91CF\u540D}} \u662F\u6A21\u677F\u53D8\u91CF\u5360\u4F4D\u7B26\uFF08\u8FD0\u884C\u65F6\u7531\u4F7F\u7528\u8005\u66FF\u6362\uFF09\uFF0C\u5FC5\u987B\u539F\u6837\u4FDD\u7559\uFF0C\u4E0D\u5F97\u5220\u9664\u3001\u6539\u5199\u6216\u66FF\u6362\u5176\u4E2D\u7684\u53D8\u91CF\u540D\uFF1B${vars.length ? `\u8BE5\u6280\u80FD\u9700\u8981\u7528\u6237\u63D0\u4F9B\u7684\u8F93\u5165\u53D8\u91CF\u6709\uFF1A${vars.join("\u3001")}\uFF0C\u8BF7\u5728\u63CF\u8FF0\u4E2D\u4F53\u73B0\u3002` : "\u8BE5\u6280\u80FD\u6CA1\u6709\u6A21\u677F\u53D8\u91CF\u3002"}`,
    "\u8BF7\u4E25\u683C\u8F93\u51FA\u4E00\u4E2A JSON \u5BF9\u8C61\uFF0C\u4E0D\u8981 Markdown \u4EE3\u7801\u5757\uFF0C\u4E0D\u8981\u4EFB\u4F55\u591A\u4F59\u6587\u5B57\uFF1A",
    '{ "name": "skill-name", "description": "...", "whenToUse": "..." }'
  ].join("\n");
}
async function collectText(runtime, route, system, content, timeoutMs) {
  const options = {
    provider: route.provider,
    model: route.model,
    messages: [
      createUserMessage({
        content: [{ type: "text", text: content }],
        source: { kind: "prompt-enhancer" }
      })
    ],
    system,
    maxTokens: AI_MAX_TOKENS,
    temperature: 0.4,
    signal: AbortSignal.timeout(timeoutMs)
  };
  const assembler = new BlockAssembler();
  try {
    for await (const chunk of runtime.stream(options)) assembler.push(chunk);
  } catch (e) {
    const detail = `collect err ${route.provider}/${route.model}: ${String(e)}`;
    logAI(detail);
    return { ok: false, failure: attemptFailure("unknown", detail) };
  }
  if (assembler.finish.kind !== "stop" && assembler.finish.kind !== "max-tokens") {
    const failure = "failure" in assembler.finish ? assembler.finish.failure : void 0;
    const timedOut = assembler.finish.kind === "aborted" || failure !== void 0 && failure.code === "timeout";
    const code = timedOut ? "timeout" : "unknown";
    const detail = `collect abort ${assembler.finish.kind}${failure?.code ? ` (${failure.code})` : ""} ${route.provider}/${route.model}`;
    logAI(detail);
    return { ok: false, failure: attemptFailure(code, detail) };
  }
  const text = assembler.blocks().filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
  if (!text) {
    const detail = `collect empty ${route.provider}/${route.model}`;
    logAI(detail);
    return { ok: false, failure: attemptFailure("empty-output", detail) };
  }
  logAI(`collect done ${assembler.finish.kind} ${text.length}`);
  return { ok: true, text };
}
async function attemptAllCandidates(runtime, candidates, system, content, diagnosis, budget) {
  if (candidates.length === 0) {
    logAI("fallback: no candidates");
    return { ok: false, failure: attemptFailure("route", "fallback: no candidates") };
  }
  const actualContent = diagnosis ? `${content}

${diagnosis}` : content;
  let lastFailure = attemptFailure("unknown", "fallback: all failed");
  for (const route of candidates) {
    const timeoutMs = attemptTimeoutMs(budget);
    if (timeoutMs === 0) {
      logAI("fallback: budget exhausted");
      return { ok: false, failure: attemptFailure("timeout", "ai budget exhausted") };
    }
    logAI(`fallback try ${route.provider}/${route.model}`);
    const attempt = await withLlmLock(() => collectText(runtime, route, system, actualContent, timeoutMs));
    if (attempt.ok) {
      logAI(`fallback use ${route.provider}/${route.model}`);
      return attempt;
    }
    lastFailure = attempt.failure;
  }
  logAI("fallback: all failed");
  return { ok: false, failure: lastFailure };
}
function callLlmWithRetry(runtime, candidates, system, content, expectation, budget) {
  return withDiagnosticRetry(
    (diagnosis) => attemptAllCandidates(runtime, candidates, system, content, diagnosis, budget),
    expectation
  );
}
function primaryRoute(candidates) {
  const route = candidates[0];
  return `${route.provider}/${route.model}`;
}
async function withResultCache(system, user, route, factory) {
  const key = hashCacheKey({ system, user, route });
  const hit = aiResultCache.get(key);
  if (hit !== void 0) {
    logAI(`ai-cache hit ${key} (${route})`);
    return hit;
  }
  const value = await factory();
  if (value !== null && typeof value === "object" && value.ok === true) {
    aiResultCache.set(key, value);
  }
  return value;
}
async function polishPromptBodyCore(body, settings, opts) {
  if (!llm) return { ok: false, code: "no-llm" };
  const candidates = await resolveCandidates(llm, settings);
  if (candidates.length === 0) return { ok: false, code: "route" };
  const budget = opts?.budget ?? startAiBudget();
  const keepVariables = opts?.keepVariables !== false;
  const existingVars = keepVariables ? extractVariables(body) : [];
  const content = keepVariables && existingVars.length ? `\u8BF7\u6DA6\u8272\u4EE5\u4E0B\u63D0\u793A\u8BCD\u5185\u5BB9\u3002\u5176\u4E2D\u5DF2\u6709\u6A21\u677F\u53D8\u91CF\uFF08{{}} \u5185\u4E3A\u53D8\u91CF\u540D\uFF0C\u8FD0\u884C\u524D\u4F1A\u88AB\u66FF\u6362\uFF0C\u5FC5\u987B\u539F\u6837\u4FDD\u7559\uFF09\uFF1A${existingVars.join("\u3001")}

${body}` : `\u8BF7\u6DA6\u8272\u4EE5\u4E0B\u63D0\u793A\u8BCD\u5185\u5BB9\uFF1A

${body}`;
  const system = polishSystemPrompt(keepVariables);
  return withResultCache(system, content, primaryRoute(candidates), async () => {
    const result = await callLlmWithRetry(llm, candidates, system, content, "text", budget);
    if (!result.ok) return result;
    const { text: cleaned, stripped } = stripAiFillerDetailed(result.text);
    if (stripped.length > 0) {
      logAI(`polish stripped ${stripped.length} \u884C: ${stripped.join(" \u23D0 ")}`);
    }
    return { ok: true, polished: cleaned };
  });
}
async function polishPromptBodyWithSummaryCore(body, settings, opts) {
  const budget = opts?.budget ?? startAiBudget();
  const polished = await polishPromptBodyCore(body, settings, { ...opts, budget });
  if (!polished.ok) return polished;
  if (!llm) return { ok: true, polished: polished.polished };
  const candidates = await resolveCandidates(llm, settings);
  if (candidates.length === 0) return { ok: true, polished: polished.polished };
  const system = summarySystemPrompt();
  const content = `\u8BF7\u4E3A\u4EE5\u4E0B\u63D0\u793A\u8BCD\u751F\u6210\u7528\u9014\u6458\u8981\uFF1A

${polished.polished}`;
  const summary = await withResultCache(system, content, primaryRoute(candidates), async () => {
    const result = await callLlmWithRetry(llm, candidates, system, content, "json", budget);
    if (!result.ok) return { ok: false };
    const parsed = parseSummaryJson(result.text);
    return { ok: true, summary: parsed ?? void 0 };
  });
  return { ok: true, polished: polished.polished, summary: summary.ok ? summary.summary : void 0 };
}
async function refinePromptCore(body, settings, existingTags = [], opts = {}) {
  if (!llm) return { ok: false, code: "no-llm" };
  const candidates = await resolveCandidates(llm, settings);
  if (candidates.length === 0) return { ok: false, code: "route" };
  const budget = opts.budget ?? startAiBudget();
  const existingVars = extractVariables(body);
  const system = enrichSystemPrompt(existingTags, existingVars);
  const content = enrichUserMessage(body, void 0, existingVars);
  return withResultCache(system, content, primaryRoute(candidates), async () => {
    const result = await callLlmWithRetry(llm, candidates, system, content, "json", budget);
    if (!result.ok) return result;
    const refined = parseRefineResult(result.text);
    if (!refined) return { ok: false, code: "schema-mismatch" };
    return { ok: true, refined };
  });
}
function parseSkillJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) return void 0;
  try {
    const obj = JSON.parse(candidate.slice(start, end + 1));
    const name2 = typeof obj.name === "string" ? obj.name.trim() : "";
    if (!name2) return void 0;
    return {
      name: name2,
      description: typeof obj.description === "string" ? obj.description.trim() : "",
      whenToUse: typeof obj.whenToUse === "string" && obj.whenToUse.trim() ? obj.whenToUse.trim() : void 0
    };
  } catch {
    return void 0;
  }
}
async function generateSkillDescriptor(prompt, settings, budget = startAiBudget()) {
  if (!llm) return { fail: "no-llm" };
  const candidates = await resolveCandidates(llm, settings);
  if (candidates.length === 0) return { fail: "route" };
  const vars = extractVariables(prompt.body);
  const system = skillSystemPrompt(vars);
  const content = [
    `\u63D0\u793A\u8BCD\u6807\u9898\uFF1A${prompt.title}`,
    ...prompt.summary ? [`\u63D0\u793A\u8BCD\u6458\u8981\uFF1A${prompt.summary}`] : [],
    ...prompt.tags?.length ? [`\u63D0\u793A\u8BCD\u6807\u7B7E\uFF1A${prompt.tags.join("\u3001")}`] : [],
    "",
    "\u4EE5\u4E0B\u662F\u63D0\u793A\u8BCD\u6B63\u6587\uFF08{{\u53D8\u91CF\u540D}} \u4E3A\u6A21\u677F\u53D8\u91CF\uFF0C\u5FC5\u987B\u539F\u6837\u4FDD\u7559\uFF09\uFF1A",
    prompt.body
  ].join("\n");
  let lastCode = "unknown";
  for (let attempt = 1; attempt <= SKILL_DESCRIBE_ATTEMPTS; attempt++) {
    if (attemptTimeoutMs(budget) === 0) {
      logAI("skill desc: budget exhausted");
      lastCode = "timeout";
      break;
    }
    const result = await attemptAllCandidates(llm, candidates, system, content, void 0, budget);
    if (result.ok) {
      const parsed = parseSkillJson(result.text);
      if (parsed) {
        logAI(`skill desc ok ${parsed.name}`);
        return { desc: parsed };
      }
      lastCode = "schema-mismatch";
      logAI(`skill desc parse fail: ${result.text.slice(0, 300)}`);
    } else {
      lastCode = result.failure.code;
    }
    if (attempt < SKILL_DESCRIBE_ATTEMPTS) logAI(`skill desc retry ${attempt}`);
  }
  return { fail: lastCode };
}

// src/host/routes.ts
import { existsSync as existsSync2, statSync, writeFileSync as writeFileSync2 } from "node:fs";
import { isAbsolute, join as join4 } from "node:path";

// src/host/skills.ts
import { existsSync, mkdirSync as mkdirSync2, writeFileSync } from "node:fs";
import { join as join3 } from "node:path";

// src/skill-name.ts
var SKILL_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
var SKILL_NAME_MAX_LEN = 64;
function toKebab(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/[/\\]/.test(trimmed) || trimmed.includes("..")) return "";
  return trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function isValidSkillName(name2) {
  return name2.length > 0 && name2.length <= SKILL_NAME_MAX_LEN && SKILL_NAME_RE.test(name2);
}

// src/skill-description.ts
function resolveDescription(prompt, descriptor) {
  const candidates = [
    prompt.summary,
    descriptor?.description,
    prompt.body.split("\n").map((l) => l.trim()).find((l) => l.length > 0),
    prompt.title
  ];
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value) return value;
  }
  return void 0;
}

// src/host/skills.ts
function skillDir(name2) {
  return join3(dshHome(), "skills", name2);
}
function skillFilePath(name2) {
  return join3(skillDir(name2), "SKILL.md");
}
function yamlQuote(value) {
  return JSON.stringify(value);
}
function renderSkillFile(input) {
  const front = ["---", `name: ${input.name}`, `description: ${yamlQuote(input.description)}`];
  if (input.whenToUse?.trim()) front.push(`whenToUse: ${yamlQuote(input.whenToUse.trim())}`);
  front.push("---", "");
  return front.join("\n") + "\n" + input.body.trim() + "\n";
}
function skillExists(name2) {
  return existsSync(skillFilePath(name2));
}
function exportSkill(input) {
  const name2 = toKebab(input.name ?? input.descriptor?.name ?? "");
  if (!isValidSkillName(name2)) {
    return { ok: false, error: "\u6280\u80FD\u540D\u975E\u6CD5\uFF1A\u5FC5\u987B\u662F\u5C0F\u5199 kebab-case\uFF08\u4EC5\u5B57\u6BCD\u3001\u6570\u5B57\u3001\u8FDE\u5B57\u7B26\uFF09" };
  }
  const description = resolveDescription(input.prompt, input.descriptor);
  if (!description) {
    return { ok: false, error: "\u65E0\u6CD5\u751F\u6210\u975E\u7A7A description\uFF08summary / AI \u63CF\u8FF0 / \u6B63\u6587\u9996\u884C / \u6807\u9898 \u5168\u4E3A\u7A7A\uFF09\uFF0C\u5DF2\u62D2\u7EDD\u5BFC\u51FA" };
  }
  const path = skillFilePath(name2);
  if (skillExists(name2) && input.ownerPromptId !== input.prompt.id && !input.conflictConfirmed) {
    return {
      ok: false,
      conflict: true,
      name: name2,
      error: `\u6280\u80FD\u76EE\u5F55 ${name2} \u5DF2\u5B58\u5728\uFF0C\u4E14\u4E0D\u5C5E\u4E8E\u672C\u63D2\u4EF6\u7684\u4EFB\u4F55\u63D0\u793A\u8BCD\uFF08\u53EF\u80FD\u662F\u4F60\u624B\u5199\u7684\u6280\u80FD\uFF09`
    };
  }
  try {
    mkdirSync2(skillDir(name2), { recursive: true });
    writeFileSync(
      path,
      renderSkillFile({
        name: name2,
        description,
        whenToUse: input.descriptor?.whenToUse,
        body: input.prompt.body
      }),
      "utf8"
    );
  } catch (e) {
    return { ok: false, name: name2, error: "\u5199\u5165\u6280\u80FD\u6587\u4EF6\u5931\u8D25\uFF1A" + String(e) };
  }
  return { ok: true, name: name2, path };
}

// src/host/store.ts
import { randomUUID } from "node:crypto";
import { mkdirSync as mkdirSync3 } from "node:fs";
import { dirname } from "node:path";

// src/host/node-sqlite.ts
import { createRequire } from "node:module";
var origEmitWarning = process.emitWarning.bind(process);
process.emitWarning = ((...args) => {
  const warning = args[0];
  const message = typeof warning === "string" ? warning : warning instanceof Error ? warning.message : "";
  if (typeof message === "string" && message.includes("SQLite is an experimental feature")) {
    return;
  }
  return origEmitWarning(...args);
});
var requireBuiltin = createRequire(import.meta.url);
var sqliteMod;
function loadSqlite() {
  return sqliteMod ??= requireBuiltin("node:sqlite");
}
function createDatabase(path) {
  return new (loadSqlite()).DatabaseSync(path);
}

// src/eviction-order.ts
function compareEvictionOrder(a, b) {
  return Number(a.aiRefined) - Number(b.aiRefined) || a.lastUsedAt - b.lastUsedAt || a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

// src/search-match.ts
function normalizeQuery(raw) {
  return raw?.trim().toLowerCase() ?? "";
}
function matchRank(prompt, query) {
  if (query === "") return 0;
  if (prompt.title.toLowerCase().includes(query)) return 3;
  if (prompt.tags.some((t) => t.toLowerCase().includes(query))) return 2;
  if (prompt.body.toLowerCase().includes(query)) return 1;
  return 0;
}

// src/types.ts
var TITLE_MAX_LEN = 25;
var DEFAULT_MAX_PROMPT_COUNT = 300;
var SCHEMA_VERSION = 2;
var BACKUP_VERSION = 1;
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

// src/host/store.ts
var db;
var MIGRATIONS = [migrateTrashSkillColumns];
function migrateTrashSkillColumns(cur) {
  const existing = new Set(
    cur.prepare("PRAGMA table_info(trash)").all().map((r) => r.name)
  );
  if (!existing.has("skillName")) cur.exec("ALTER TABLE trash ADD COLUMN skillName TEXT;");
  if (!existing.has("skillExportedAt")) {
    cur.exec("ALTER TABLE trash ADD COLUMN skillExportedAt INTEGER NOT NULL DEFAULT 0;");
  }
}
var FRESH_MS = 7 * 24 * 60 * 60 * 1e3;
function getDb() {
  if (db) return db;
  const file = dbPath();
  mkdirSync3(dirname(file), { recursive: true });
  const cur = createDatabase(file);
  initDb(cur);
  db = cur;
  return cur;
}
function initDb(cur) {
  try {
    cur.exec("PRAGMA journal_mode = WAL;");
  } catch (e) {
    console.warn("[prompt-enhancer] \u65E0\u6CD5\u542F\u7528 WAL\uFF0C\u5DF2\u964D\u7EA7\u4E3A\u9ED8\u8BA4 journal \u6A21\u5F0F\uFF1A" + String(e));
  }
  cur.exec("PRAGMA busy_timeout = 5000;");
  cur.exec(`
    CREATE TABLE IF NOT EXISTS prompts (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      body        TEXT NOT NULL,
      tags        TEXT NOT NULL DEFAULT '[]',
      summary     TEXT,
      sourceBody  TEXT,
      aiRefined   INTEGER NOT NULL DEFAULT 0,
      aiRefinedAt INTEGER NOT NULL DEFAULT 0,
      createdAt   INTEGER NOT NULL,
      updatedAt   INTEGER NOT NULL,
      usageCount  INTEGER NOT NULL DEFAULT 0,
      lastUsedAt  INTEGER NOT NULL DEFAULT 0,
      skillName       TEXT,
      skillExportedAt INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS trash (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]', summary TEXT, sourceBody TEXT,
      aiRefined INTEGER NOT NULL DEFAULT 0, aiRefinedAt INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL,
      usageCount INTEGER NOT NULL DEFAULT 0, lastUsedAt INTEGER NOT NULL DEFAULT 0,
      skillName TEXT, skillExportedAt INTEGER NOT NULL DEFAULT 0,
      deletedAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tags (
      name      TEXT PRIMARY KEY,
      createdAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  cur.exec(`
    CREATE INDEX IF NOT EXISTS idx_prompts_updated  ON prompts(updatedAt DESC);
    CREATE INDEX IF NOT EXISTS idx_prompts_used     ON prompts(lastUsedAt DESC);
    CREATE INDEX IF NOT EXISTS idx_trash_deleted    ON trash(deletedAt DESC);
  `);
  cur.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run("schemaVersion", String(SCHEMA_VERSION));
  for (const migrate of MIGRATIONS) migrate(cur);
  syncTagsFromPrompts(cur);
  seedDefaultPromptIfEmpty(cur);
}
function rowToPrompt(row) {
  const r = { ...row };
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    tags: parseTags(r.tags),
    summary: r.summary ?? void 0,
    sourceBody: r.sourceBody ?? void 0,
    aiRefined: r.aiRefined === 1,
    aiRefinedAt: r.aiRefinedAt ?? 0,
    createdAt: r.createdAt ?? 0,
    updatedAt: r.updatedAt ?? 0,
    usageCount: r.usageCount ?? 0,
    lastUsedAt: r.lastUsedAt ?? 0,
    skillName: r.skillName ?? void 0,
    skillExportedAt: r.skillExportedAt ?? 0
  };
}
function rowToTrash(row) {
  return { ...rowToPrompt(row), deletedAt: row.deletedAt };
}
function parseTags(text) {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t) => typeof t === "string");
  } catch (e) {
    console.warn("[prompt-enhancer] tags \u5217\u5185\u5BB9\u4E0D\u662F\u5408\u6CD5 JSON\uFF0C\u5DF2\u6309\u7A7A\u6570\u7EC4\u5904\u7406\uFF1A" + String(e));
    return [];
  }
}
function tagsToJson(tags) {
  return tags.length > 0 ? JSON.stringify(tags) : "[]";
}
function normalizeTagName(name2) {
  return name2.trim();
}
function normalizeTags(tags) {
  if (!tags) return [];
  const out = [];
  for (const raw of tags) {
    const name2 = normalizeTagName(raw);
    if (name2 && !out.includes(name2)) out.push(name2);
  }
  return out;
}
function ensureTagWith(cur, name2) {
  const tag = normalizeTagName(name2);
  if (!tag) return;
  cur.prepare("INSERT OR IGNORE INTO tags (name, createdAt) VALUES (?, ?)").run(tag, Date.now());
}
function ensureTagsWith(cur, names) {
  for (const name2 of names) ensureTagWith(cur, name2);
}
function syncTagsFromPrompts(cur) {
  const rows = cur.prepare("SELECT tags FROM prompts").all();
  const names = /* @__PURE__ */ new Set();
  for (const row of rows) for (const t of parseTags(row.tags)) names.add(t);
  for (const name2 of names) ensureTagWith(cur, name2);
}
function countTagUsage(name2) {
  const rows = selectAllPrompts();
  let n = 0;
  for (const row of rows) if (parseTags(row.tags).includes(name2)) n++;
  return n;
}
function seedDefaultPromptIfEmpty(cur) {
  const row = cur.prepare("SELECT COUNT(*) AS c FROM prompts").get();
  if ((row?.c ?? 0) > 0) return;
  const now = Date.now();
  const prompt = {
    id: randomUUID(),
    title: "\u6B22\u8FCE\u4F7F\u7528\u63D0\u793A\u8BCD\u589E\u5F3A",
    body: [
      "\u8FD9\u662F\u4F60\u4FDD\u5B58\u7684\u7B2C\u4E00\u6761\u63D0\u793A\u8BCD\uFF0C\u4E5F\u662F\u672C\u63D2\u4EF6\u7684\u4E0A\u624B\u5F15\u5BFC\u3002",
      "",
      "\u4F60\u53EF\u4EE5\u8FD9\u6837\u4F7F\u7528\u5B83\uFF1A",
      "\xB7 \u5728\u8F93\u5165\u6846\u65C1\u6253\u5F00\u8BCD\u5E93\uFF0C\u63D2\u5165 / \u8986\u76D6 / \u63D2\u5165\u5E76\u53D1\u9001\u5E38\u7528\u63D0\u793A\u8BCD\uFF1B",
      "\xB7 \u8F93\u5165 # \u89E6\u53D1\u5B9E\u65F6\u7B5B\u9009\uFF0C\u5FEB\u901F\u6311\u4E00\u6761\uFF1B",
      "\xB7 \u9009\u4E2D\u804A\u5929\u91CC\u7684\u6587\u5B57\uFF0C\u6216\u628A\u5F53\u524D\u8349\u7A3F\u4E00\u952E\u5B58\u4E3A\u63D0\u793A\u8BCD\uFF1B",
      "\xB7 \u7528 AI \u4F18\u5316\u6DA6\u8272\u6B63\u6587\uFF0C\u5E76\u968F\u65F6\u5728\u300C\u539F\u6587 \u2194 \u4F18\u5316\u7A3F\u300D\u4E4B\u95F4\u5207\u6362\u3002",
      "",
      "\u4E5F\u53EF\u4EE5\u76F4\u63A5\u7F16\u8F91\u8FD9\u6761\u63D0\u793A\u8BCD\uFF0C\u6362\u6210\u4F60\u81EA\u5DF1\u7684\u5185\u5BB9\u3002"
    ].join("\n"),
    tags: ["\u6B22\u8FCE"],
    aiRefined: false,
    aiRefinedAt: 0,
    createdAt: now,
    updatedAt: now,
    usageCount: 0,
    lastUsedAt: 0,
    skillExportedAt: 0
  };
  cur.prepare(
    `INSERT INTO prompts
       (id, title, body, tags, summary, sourceBody, aiRefined, aiRefinedAt, createdAt, updatedAt, usageCount, lastUsedAt, skillName, skillExportedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    prompt.id,
    prompt.title,
    prompt.body,
    tagsToJson(prompt.tags),
    null,
    null,
    0,
    0,
    now,
    now,
    0,
    0,
    null,
    0
  );
  syncTagsFromPrompts(cur);
}
var PROMPT_COLUMNS = "id, title, body, tags, summary, sourceBody, aiRefined, aiRefinedAt, createdAt, updatedAt, usageCount, lastUsedAt, skillName, skillExportedAt";
function selectAllPrompts() {
  return getDb().prepare(`SELECT ${PROMPT_COLUMNS} FROM prompts`).all();
}
function selectPrompt(id) {
  const row = getDb().prepare(`SELECT ${PROMPT_COLUMNS} FROM prompts WHERE id = ?`).get(id);
  return row ? rowToPrompt(row) : void 0;
}
function bindPrompt(p) {
  return [
    p.title,
    p.body,
    tagsToJson(p.tags),
    p.summary ?? null,
    p.sourceBody ?? null,
    p.aiRefined ? 1 : 0,
    p.aiRefinedAt,
    p.createdAt,
    p.updatedAt,
    p.usageCount,
    p.lastUsedAt,
    p.skillName ?? null,
    p.skillExportedAt
  ];
}
function insertPrompt(cur, p) {
  cur.prepare(
    `INSERT OR REPLACE INTO prompts
       (id, title, body, tags, summary, sourceBody, aiRefined, aiRefinedAt, createdAt, updatedAt, usageCount, lastUsedAt, skillName, skillExportedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(p.id, ...bindPrompt(p));
}
function writePrompt(cur, p) {
  cur.prepare(
    `UPDATE prompts SET
       title = ?, body = ?, tags = ?, summary = ?, sourceBody = ?,
       aiRefined = ?, aiRefinedAt = ?, createdAt = ?, updatedAt = ?,
       usageCount = ?, lastUsedAt = ?, skillName = ?, skillExportedAt = ?
     WHERE id = ?`
  ).run(...bindPrompt(p), p.id);
}
function inTransaction(cur, work) {
  cur.exec("BEGIN");
  try {
    const out = work();
    cur.exec("COMMIT");
    return out;
  } catch (e) {
    try {
      cur.exec("ROLLBACK");
    } catch (rollbackError) {
      console.warn("[prompt-enhancer] ROLLBACK \u5931\u8D25\uFF1A" + String(rollbackError));
    }
    throw e;
  }
}
function sortPrompts(prompts, sort) {
  const list = [...prompts];
  switch (sort) {
    case "created":
      return list.sort((a, b) => b.createdAt - a.createdAt);
    case "updated":
      return list.sort((a, b) => b.updatedAt - a.updatedAt);
    case "used":
      return list.sort((a, b) => b.usageCount - a.usageCount || b.lastUsedAt - a.lastUsedAt);
    default: {
      const now = Date.now();
      const fresh = list.filter((p) => now - p.createdAt < FRESH_MS).sort((a, b) => b.createdAt - a.createdAt);
      const freshIds = new Set(fresh.map((p) => p.id));
      const rest = list.filter((p) => !freshIds.has(p.id));
      const hot = rest.filter((p) => p.usageCount > 0).sort((a, b) => b.usageCount - a.usageCount).slice(0, 3);
      const hotIds = new Set(hot.map((p) => p.id));
      const tail = rest.filter((p) => !hotIds.has(p.id)).sort((a, b) => b.updatedAt - a.updatedAt || b.usageCount - a.usageCount);
      return [...fresh, ...hot, ...tail];
    }
  }
}
function getMetaValue(key) {
  const row = getDb().prepare("SELECT value FROM meta WHERE key = ?").get(key);
  return row?.value ?? "";
}
function setMetaValue(key, value) {
  getDb().prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}
function deleteMetaValue(key) {
  const res = getDb().prepare("DELETE FROM meta WHERE key = ?").run(key);
  return res.changes !== void 0 && Number(res.changes) > 0;
}
function listPrompts(options = {}) {
  let out = selectAllPrompts().map(rowToPrompt);
  const q = normalizeQuery(options.q);
  if (q) out = out.filter((p) => matchRank(p, q) > 0);
  const tag = options.tag;
  if (tag) out = out.filter((p) => p.tags.includes(tag));
  return sortPrompts(out, options.sort ?? "default");
}
function getPrompt(id) {
  return selectPrompt(id);
}
function createPrompt(input) {
  const cur = getDb();
  const now = Date.now();
  const tags = normalizeTags(input.tags);
  const prompt = {
    id: randomUUID(),
    title: clampTitle(input.title ?? ""),
    body: input.body ?? "",
    tags,
    summary: input.summary,
    aiRefined: false,
    aiRefinedAt: 0,
    createdAt: now,
    updatedAt: now,
    usageCount: 0,
    lastUsedAt: 0,
    skillExportedAt: 0
  };
  insertPrompt(cur, prompt);
  ensureTagsWith(cur, tags);
  return prompt;
}
function updatePrompt(id, patch, options = {}) {
  const cur = getDb();
  const existing = selectPrompt(id);
  if (!existing) return void 0;
  const next = { ...existing };
  let contentChanged = false;
  if (patch.title !== void 0) {
    next.title = clampTitle(patch.title);
    contentChanged = true;
  }
  if (patch.body !== void 0) {
    if (patch.body !== existing.body) {
      contentChanged = true;
      if (options.aiWriteBack && !existing.sourceBody) {
        next.sourceBody = existing.body;
        next.aiRefined = true;
        next.aiRefinedAt = Date.now();
      }
    }
    next.body = patch.body;
  }
  if (patch.tags !== void 0) {
    next.tags = normalizeTags(patch.tags);
    contentChanged = true;
  }
  if (patch.summary !== void 0) {
    next.summary = patch.summary;
    contentChanged = true;
  }
  if (patch.skillName !== void 0) next.skillName = patch.skillName;
  if (patch.skillExportedAt !== void 0) next.skillExportedAt = patch.skillExportedAt;
  if (contentChanged) next.updatedAt = Date.now();
  writePrompt(cur, next);
  ensureTagsWith(cur, next.tags);
  return next;
}
function recordUsage(id) {
  const cur = getDb();
  const existing = selectPrompt(id);
  if (!existing) return void 0;
  const now = Date.now();
  cur.prepare("UPDATE prompts SET usageCount = usageCount + 1, lastUsedAt = ? WHERE id = ?").run(now, id);
  return { ...existing, usageCount: existing.usageCount + 1, lastUsedAt: now };
}
function deletePrompt(id) {
  const cur = getDb();
  const existing = selectPrompt(id);
  if (!existing) return false;
  const deletedAt = Date.now();
  inTransaction(cur, () => {
    cur.prepare(
      `INSERT OR REPLACE INTO trash
         (id, title, body, tags, summary, sourceBody, aiRefined, aiRefinedAt, createdAt, updatedAt, usageCount, lastUsedAt, skillName, skillExportedAt, deletedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      existing.id,
      existing.title,
      existing.body,
      tagsToJson(existing.tags),
      existing.summary ?? null,
      existing.sourceBody ?? null,
      existing.aiRefined ? 1 : 0,
      existing.aiRefinedAt,
      existing.createdAt,
      existing.updatedAt,
      existing.usageCount,
      existing.lastUsedAt,
      existing.skillName ?? null,
      existing.skillExportedAt,
      deletedAt
    );
    cur.prepare("DELETE FROM prompts WHERE id = ?").run(id);
  });
  return true;
}
function rollbackPrompt(id) {
  const cur = getDb();
  const existing = selectPrompt(id);
  if (!existing) return { ok: false, error: "\u63D0\u793A\u8BCD\u4E0D\u5B58\u5728" };
  const original = existing.sourceBody;
  if (!original) return { ok: false, error: "\u8BE5\u63D0\u793A\u8BCD\u6CA1\u6709\u53EF\u56DE\u9000\u7684\u539F\u6587\uFF08sourceBody \u4E3A\u7A7A\uFF09" };
  const swapped = { ...existing, body: original, sourceBody: existing.body, updatedAt: Date.now() };
  writePrompt(cur, swapped);
  return { ok: true, prompt: swapped };
}
function createTag(name2) {
  const tag = normalizeTagName(name2);
  ensureTagWith(getDb(), tag);
  return tag;
}
function listTags() {
  const rows = getDb().prepare("SELECT name, createdAt FROM tags ORDER BY name").all();
  const counts = /* @__PURE__ */ new Map();
  for (const row of selectAllPrompts()) {
    for (const tag of parseTags(row.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return rows.map((r) => ({ name: r.name, count: counts.get(r.name) ?? 0 }));
}
function renameTag(from, to) {
  const cur = getDb();
  const target = normalizeTagName(to);
  if (!target) return 0;
  const affected = selectAllPrompts().map(rowToPrompt).filter((p) => p.tags.includes(from));
  const existsInDict = cur.prepare("SELECT 1 FROM tags WHERE name = ?").get(from) !== void 0;
  if (affected.length === 0 && !existsInDict) return 0;
  return inTransaction(cur, () => {
    ensureTagWith(cur, target);
    cur.prepare("DELETE FROM tags WHERE name = ?").run(from);
    const now = Date.now();
    for (const p of affected) {
      writePrompt(cur, {
        ...p,
        tags: normalizeTags(p.tags.map((t) => t === from ? target : t)),
        updatedAt: now
      });
    }
    return affected.length;
  });
}
function deleteTag(name2) {
  const cur = getDb();
  const inUse = countTagUsage(name2);
  if (inUse > 0) return { deleted: false, inUse };
  const res = cur.prepare("DELETE FROM tags WHERE name = ?").run(name2);
  return { deleted: res.changes !== void 0 && Number(res.changes) > 0, inUse: 0 };
}
function listTrash() {
  const rows = getDb().prepare(
    `SELECT id, title, body, tags, summary, sourceBody, aiRefined, aiRefinedAt, createdAt, updatedAt, usageCount, lastUsedAt, skillName, skillExportedAt, deletedAt
         FROM trash ORDER BY deletedAt DESC`
  ).all();
  return rows.map(rowToTrash);
}
function restorePrompts(ids) {
  const cur = getDb();
  const rows = cur.prepare("SELECT * FROM trash WHERE id = ?");
  let restored = 0;
  inTransaction(cur, () => {
    for (const id of ids) {
      const row = rows.get(id);
      if (!row) continue;
      const item = rowToTrash(row);
      insertPrompt(cur, item);
      cur.prepare("DELETE FROM trash WHERE id = ?").run(id);
      ensureTagsWith(cur, item.tags);
      restored++;
    }
  });
  return restored;
}
function deleteTrash(ids) {
  const cur = getDb();
  let removed = 0;
  inTransaction(cur, () => {
    for (const id of ids) {
      const res = cur.prepare("DELETE FROM trash WHERE id = ?").run(id);
      if (res.changes !== void 0 && Number(res.changes) > 0) removed++;
    }
  });
  return removed;
}
function emptyTrash() {
  const cur = getDb();
  return inTransaction(cur, () => {
    const ids = cur.prepare("SELECT id FROM trash").all().map(
      (row) => String(row.id)
    );
    cur.prepare("DELETE FROM trash").run();
    return ids;
  });
}
function exportPrompts(ids) {
  const all = selectAllPrompts().map(rowToPrompt);
  const prompts = ids === void 0 ? all : all.filter((p) => ids.includes(p.id));
  const tags = getDb().prepare("SELECT name, createdAt FROM tags ORDER BY name").all().map(
    (r) => ({ name: r.name, createdAt: r.createdAt })
  );
  return { version: BACKUP_VERSION, exportedAt: Date.now(), prompts, tags };
}
function validateBackup(input) {
  if (typeof input !== "object" || input === null) return { ok: false, error: "\u5907\u4EFD\u5185\u5BB9\u4E0D\u662F\u5BF9\u8C61" };
  const raw = input;
  if (raw.version !== BACKUP_VERSION) {
    return { ok: false, error: `\u5907\u4EFD\u7248\u672C\u4E0D\u5339\u914D\uFF08\u671F\u671B ${BACKUP_VERSION}\uFF0C\u5B9E\u9645 ${String(raw.version)}\uFF09` };
  }
  if (!Array.isArray(raw.prompts)) return { ok: false, error: "\u5907\u4EFD\u7F3A\u5C11 prompts \u6570\u7EC4" };
  const prompts = [];
  for (const [index, item] of raw.prompts.entries()) {
    if (typeof item !== "object" || item === null) return { ok: false, error: `\u7B2C ${index + 1} \u6761\u4E0D\u662F\u5BF9\u8C61` };
    const e = item;
    if (typeof e.id !== "string" || !e.id) return { ok: false, error: `\u7B2C ${index + 1} \u6761\u7F3A\u5C11 id` };
    if (typeof e.body !== "string") return { ok: false, error: `\u7B2C ${index + 1} \u6761\u7F3A\u5C11 body` };
    const updatedAt = numberOr(e.updatedAt, 0);
    const createdAt = numberOr(e.createdAt, updatedAt);
    prompts.push({
      id: e.id,
      title: typeof e.title === "string" ? clampTitle(e.title) : "",
      body: e.body,
      tags: Array.isArray(e.tags) ? normalizeTags(e.tags.filter((t) => typeof t === "string")) : [],
      summary: typeof e.summary === "string" ? e.summary : void 0,
      sourceBody: typeof e.sourceBody === "string" ? e.sourceBody : void 0,
      aiRefined: e.aiRefined === true || e.aiRefined === 1,
      aiRefinedAt: numberOr(e.aiRefinedAt, 0),
      createdAt,
      updatedAt,
      usageCount: numberOr(e.usageCount, 0),
      lastUsedAt: numberOr(e.lastUsedAt, 0),
      skillName: typeof e.skillName === "string" ? e.skillName : void 0,
      skillExportedAt: numberOr(e.skillExportedAt, 0)
    });
  }
  const tags = [];
  if (Array.isArray(raw.tags)) {
    for (const item of raw.tags) {
      if (typeof item !== "object" || item === null) continue;
      const t = item;
      if (typeof t.name === "string" && t.name.trim()) {
        tags.push({ name: t.name.trim(), createdAt: numberOr(t.createdAt, Date.now()) });
      }
    }
  }
  return { ok: true, value: { prompts, tags } };
}
function numberOr(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function importPrompts(input, options = {}) {
  const validated = validateBackup(input);
  if (!validated.ok) return { ok: false, error: validated.error };
  const { prompts, tags } = validated.value;
  const cur = getDb();
  const existing = new Set(selectAllPrompts().map((r) => r.id));
  let added = 0;
  let overwritten = 0;
  for (const p of prompts) {
    if (existing.has(p.id)) overwritten++;
    else added++;
  }
  const stats = { added, overwritten, total: prompts.length };
  if (!options.confirm) return { ok: true, applied: false, stats };
  inTransaction(cur, () => {
    for (const p of prompts) {
      insertPrompt(cur, p);
      ensureTagsWith(cur, p.tags);
    }
    for (const t of tags) ensureTagWith(cur, t.name);
    syncTagsFromPrompts(cur);
  });
  return { ok: true, applied: true, stats };
}
function pruneOrphanTags(cur, candidateNames) {
  const candidates = /* @__PURE__ */ new Set();
  for (const name2 of candidateNames) if (name2) candidates.add(name2);
  if (candidates.size === 0) return;
  const used = /* @__PURE__ */ new Set();
  const rows = cur.prepare("SELECT tags FROM prompts").all();
  for (const row of rows) for (const tag of parseTags(row.tags)) used.add(tag);
  for (const name2 of candidates) {
    if (!used.has(name2)) cur.prepare("DELETE FROM tags WHERE name = ?").run(name2);
  }
}
function enforceMaxCount(maxCount, options = {}) {
  const cur = getDb();
  const all = selectAllPrompts().map(rowToPrompt);
  if (all.length <= maxCount) return [];
  const over = all.length - maxCount;
  const candidates = options.exceptId === void 0 ? all : all.filter((p) => p.id !== options.exceptId);
  const victims = [...candidates].sort(compareEvictionOrder).slice(0, over);
  inTransaction(cur, () => {
    for (const victim of victims) cur.prepare("DELETE FROM prompts WHERE id = ?").run(victim.id);
    pruneOrphanTags(cur, victims.flatMap((victim) => victim.tags));
  });
  return victims.map((v) => v.id);
}

// src/host/settings.ts
import z from "@deepseek-ai/schemastery";

// src/settings-shape.ts
var SETTINGS_NAMESPACE = "prompt-enhancer";
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

// src/host/settings.ts
var PromptEnhancerSettingsSchema = z.object({
  panelWidth: z.number().step(1).min(200).max(2e3).default(DEFAULT_SETTINGS.panelWidth).volatile(),
  panelHeight: z.number().step(1).min(200).max(2e3).default(DEFAULT_SETTINGS.panelHeight).volatile(),
  showComposerButton: z.boolean().default(DEFAULT_SETTINGS.showComposerButton).volatile(),
  composerButtonIconOnly: z.boolean().default(DEFAULT_SETTINGS.composerButtonIconOnly).volatile(),
  showAIPolishButton: z.boolean().default(DEFAULT_SETTINGS.showAIPolishButton).volatile(),
  aiPolishButtonIconOnly: z.boolean().default(DEFAULT_SETTINGS.aiPolishButtonIconOnly).volatile(),
  hashTriggerEnabled: z.boolean().default(DEFAULT_SETTINGS.hashTriggerEnabled).volatile(),
  contextRecommendEnabled: z.boolean().default(DEFAULT_SETTINGS.contextRecommendEnabled).volatile(),
  selectionAddEnabled: z.boolean().default(DEFAULT_SETTINGS.selectionAddEnabled).volatile(),
  showSidebarButton: z.boolean().default(DEFAULT_SETTINGS.showSidebarButton).volatile(),
  maxPromptCount: z.number().step(1).min(1).max(1e4).default(DEFAULT_SETTINGS.maxPromptCount).volatile(),
  aiProvider: z.string().default(DEFAULT_SETTINGS.aiProvider).volatile(),
  aiModel: z.string().default(DEFAULT_SETTINGS.aiModel).volatile()
});
function resolvePluginSettings(config) {
  const raw = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    const ref = config[key];
    raw[key] = ref && typeof ref === "object" && typeof ref.get === "function" ? ref.get() : ref;
  }
  return normalizeSettings(raw);
}
var host;
var runtimeConfig;
function bindSettingsHost(ctx, config) {
  host = ctx;
  runtimeConfig = config;
}
function isSettingsAvailable() {
  return host?.settings !== void 0 && host.settings.writable !== false;
}
function getSettings() {
  if (!runtimeConfig) return { ...DEFAULT_SETTINGS };
  try {
    return resolvePluginSettings(runtimeConfig);
  } catch (e) {
    console.warn("[prompt-enhancer] \u8BFB\u53D6\u8BBE\u7F6E\u5931\u8D25\uFF0C\u5DF2\u56DE\u843D\u9ED8\u8BA4\u503C\uFF1A" + String(e));
    return { ...DEFAULT_SETTINGS };
  }
}
async function updateSettings(patch) {
  if (!isSettingsAvailable() || !host?.settings) {
    throw new Error("\u8BBE\u7F6E\u670D\u52A1\u4E0D\u53EF\u7528\uFF08\u5BBF\u4E3B\u672A\u63D0\u4F9B settings \u670D\u52A1\uFF09");
  }
  await host.settings.update(SETTINGS_NAMESPACE, patch);
  return getSettings();
}

// src/host/routes.ts
var BadRequest = class extends Error {
};
function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}
function ok(res, data) {
  json(res, 200, { ok: true, data });
}
function fail(res, status, error) {
  json(res, status, { ok: false, error });
}
function failWithCode(res, status, error) {
  json(res, status, { ok: false, error });
}
function devMessage(detail) {
  return false ? detail : void 0;
}
var MAX_BODY_BYTES = 5 * 1024 * 1024;
function parseJsonBody(raw) {
  if (!raw) return {};
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new BadRequest("\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5 JSON\uFF1A" + String(e));
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new BadRequest("\u8BF7\u6C42\u4F53\u5FC5\u987B\u662F JSON \u5BF9\u8C61");
  }
  return parsed;
}
function readBody(req, res) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let settled = false;
    function cleanup() {
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("error", onError);
    }
    function onData(chunk) {
      if (settled) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > MAX_BODY_BYTES) {
        settled = true;
        cleanup();
        req.pause();
        res.setHeader("Connection", "close");
        reject(new BadRequest("\u8BF7\u6C42\u4F53\u8D85\u8FC7\u4E0A\u9650\uFF08" + MAX_BODY_BYTES + " \u5B57\u8282\uFF09"));
        return;
      }
      chunks.push(buf);
    }
    function onEnd() {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        resolve(parseJsonBody(Buffer.concat(chunks).toString("utf8").trim()));
      } catch (e) {
        reject(e);
      }
    }
    function onError(err) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    }
    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
  });
}
function isCrossSiteWrite(req) {
  if (req.headers["sec-fetch-site"] === "cross-site") return true;
  const origin = req.headers.origin;
  if (typeof origin !== "string" || origin === "") return false;
  if (origin === "null") return true;
  const host2 = req.headers.host;
  if (!host2) return true;
  try {
    return new URL(origin).host !== host2;
  } catch {
    return true;
  }
}
function asString(value) {
  return typeof value === "string" ? value : void 0;
}
function asStringArray(value) {
  return Array.isArray(value) ? value.filter((v) => typeof v === "string") : void 0;
}
function asFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function segments(pathname) {
  return pathname.slice(API_PREFIX.length).split("/").filter(Boolean).map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  });
}
function stamp() {
  const d = /* @__PURE__ */ new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
async function dispatch(req, res) {
  const method = (req.method ?? "GET").toUpperCase();
  const url = new URL(req.url ?? "/", "http://localhost");
  const seg = segments(url.pathname);
  const [a, b, c] = seg;
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS" && isCrossSiteWrite(req)) {
    console.error(
      "[prompt-enhancer] \u5DF2\u62D2\u7EDD\u8DE8\u6E90\u5199\u8BF7\u6C42 " + method + " " + url.pathname + "\uFF08Origin: " + String(req.headers.origin) + " / Host: " + String(req.headers.host) + "\uFF09"
    );
    return fail(res, 403, "\u8DE8\u6E90\u5199\u5165\u88AB\u62D2\u7EDD\uFF08\u672C\u63D2\u4EF6\u7684\u5199\u63A5\u53E3\u53EA\u63A5\u53D7\u540C\u6E90\u8BF7\u6C42\uFF09");
  }
  try {
    if (method === "GET" && seg.length === 1 && a === "prompts") {
      const sort = url.searchParams.get("sort") ?? void 0;
      const allowed = ["default", "updated", "used", "created"];
      if (sort !== void 0 && !allowed.includes(sort)) {
        return fail(res, 400, `sort \u53EA\u80FD\u662F ${allowed.join(" / ")}`);
      }
      return ok(res, listPrompts({
        q: url.searchParams.get("q") ?? void 0,
        tag: url.searchParams.get("tag") ?? void 0,
        sort
      }));
    }
    if (method === "POST" && seg.length === 1 && a === "prompts") {
      const body = await readBody(req, res);
      const text = asString(body.body);
      if (!text) return fail(res, 400, "\u7F3A\u5C11 body");
      const created = createPrompt({
        title: asString(body.title) ?? "",
        body: text,
        tags: asStringArray(body.tags),
        summary: asString(body.summary)
      });
      const evicted = enforceMaxCount(getSettings().maxPromptCount, { exceptId: created.id });
      return ok(res, { prompt: created, evicted });
    }
    if (seg.length === 2 && a === "prompts") {
      const id = b;
      if (method === "GET") {
        const found = getPrompt(id);
        return found ? ok(res, found) : fail(res, 404, "\u63D0\u793A\u8BCD\u4E0D\u5B58\u5728");
      }
      if (method === "PUT") {
        const body = await readBody(req, res);
        const patch = {};
        if (body.title !== void 0) patch.title = asString(body.title) ?? "";
        if (body.body !== void 0) {
          const text = asString(body.body);
          if (text === void 0) return fail(res, 400, "body \u5FC5\u987B\u662F\u5B57\u7B26\u4E32");
          if (!text) return fail(res, 400, "body \u4E0D\u80FD\u4E3A\u7A7A");
          patch.body = text;
        }
        if (body.tags !== void 0) patch.tags = asStringArray(body.tags) ?? [];
        if (body.summary !== void 0) patch.summary = asString(body.summary) ?? "";
        if (body.skillName !== void 0) patch.skillName = asString(body.skillName);
        if (body.skillExportedAt !== void 0) {
          const at = asFiniteNumber(body.skillExportedAt);
          if (at === void 0) return fail(res, 400, "skillExportedAt \u5FC5\u987B\u662F\u6709\u9650\u6570\u5B57");
          patch.skillExportedAt = at;
        }
        const updated = updatePrompt(id, patch, { aiWriteBack: body.aiWriteBack === true });
        return updated ? ok(res, updated) : fail(res, 404, "\u63D0\u793A\u8BCD\u4E0D\u5B58\u5728");
      }
      if (method === "DELETE") {
        return deletePrompt(id) ? ok(res, { deleted: true }) : fail(res, 404, "\u63D0\u793A\u8BCD\u4E0D\u5B58\u5728");
      }
    }
    if (method === "POST" && seg.length === 3 && a === "prompts" && c === "use") {
      const used = recordUsage(b);
      return used ? ok(res, used) : fail(res, 404, "\u63D0\u793A\u8BCD\u4E0D\u5B58\u5728");
    }
    if (method === "POST" && seg.length === 3 && a === "prompts" && c === "rollback") {
      const result = rollbackPrompt(b);
      if (!result.ok) {
        return result.error === "\u63D0\u793A\u8BCD\u4E0D\u5B58\u5728" ? fail(res, 404, result.error) : fail(res, 400, result.error ?? "\u56DE\u6EDA\u5931\u8D25");
      }
      return ok(res, result.prompt);
    }
    if (method === "GET" && seg.length === 1 && a === "tags") {
      return ok(res, listTags());
    }
    if (method === "POST" && seg.length === 1 && a === "tags") {
      const body = await readBody(req, res);
      const name2 = asString(body.name);
      if (!name2?.trim()) return fail(res, 400, "\u7F3A\u5C11 name");
      return ok(res, { name: createTag(name2) });
    }
    if (method === "PUT" && seg.length === 2 && a === "tags") {
      const body = await readBody(req, res);
      const to = asString(body.to);
      if (!to?.trim()) return fail(res, 400, "\u7F3A\u5C11 to");
      return ok(res, { affected: renameTag(b, to) });
    }
    if (method === "DELETE" && seg.length === 2 && a === "tags") {
      const result = deleteTag(b);
      if (!result.deleted) {
        return result.inUse > 0 ? fail(res, 400, `\u6807\u7B7E\u6B63\u5728\u88AB ${result.inUse} \u6761\u63D0\u793A\u8BCD\u4F7F\u7528\uFF0C\u65E0\u6CD5\u5220\u9664`) : fail(res, 404, "\u6807\u7B7E\u4E0D\u5B58\u5728");
      }
      return ok(res, result);
    }
    if (method === "GET" && seg.length === 1 && a === "trash") {
      return ok(res, listTrash());
    }
    if (method === "POST" && seg.length === 3 && a === "trash" && c === "restore") {
      const restored = restorePrompts([b]);
      return restored > 0 ? ok(res, { restored }) : fail(res, 404, "\u56DE\u6536\u7AD9\u4E2D\u6CA1\u6709\u8FD9\u6761\u63D0\u793A\u8BCD");
    }
    if (method === "DELETE" && seg.length === 1 && a === "trash") {
      const ids = emptyTrash();
      return ok(res, { removed: ids.length, ids });
    }
    if (method === "DELETE" && seg.length === 2 && a === "trash") {
      const removed = deleteTrash([b]);
      return removed > 0 ? ok(res, { removed }) : fail(res, 404, "\u56DE\u6536\u7AD9\u4E2D\u6CA1\u6709\u8FD9\u6761\u63D0\u793A\u8BCD");
    }
    if (method === "GET" && seg.length === 2 && a === "ai" && b === "providers") {
      return ok(res, await listAiSelectables());
    }
    if (method === "POST" && seg.length === 2 && a === "ai" && b === "polish") {
      const body = await readBody(req, res);
      const text = asString(body.body);
      if (!text?.trim()) return fail(res, 400, "\u7F3A\u5C11 body");
      const opts = { keepVariables: body.keepVariables !== false };
      const outcome = body.withSummary === true ? await polishPromptBodyWithSummaryCore(text, getSettings(), opts).then(
        (core) => core.ok ? { ok: true, data: core.summary === void 0 ? { polished: core.polished } : { polished: core.polished, summary: core.summary } } : { ok: false, code: core.code }
      ) : await polishPromptBodyCore(text, getSettings(), opts).then(
        (core) => core.ok ? { ok: true, data: { polished: core.polished } } : { ok: false, code: core.code }
      );
      if (!outcome.ok) return failWithCode(res, 503, { code: outcome.code, message: devMessage(outcome.code) });
      return ok(res, outcome.data);
    }
    if (method === "POST" && seg.length === 2 && a === "ai" && b === "refine") {
      const body = await readBody(req, res);
      const text = asString(body.body);
      if (!text?.trim()) return fail(res, 400, "\u7F3A\u5C11 body");
      const existingTags = listTags().map((t) => t.name);
      const refined = await refinePromptCore(text, getSettings(), existingTags);
      if (!refined.ok) return failWithCode(res, 503, { code: refined.code, message: devMessage(refined.code) });
      return ok(res, refined.refined);
    }
    if (method === "POST" && seg.length === 2 && a === "ai" && b === "skill-descriptor") {
      const body = await readBody(req, res);
      const text = asString(body.body);
      if (!text?.trim()) return fail(res, 400, "\u7F3A\u5C11 body");
      const result = await generateSkillDescriptor(
        {
          title: asString(body.title) ?? "",
          body: text,
          summary: asString(body.summary),
          tags: asStringArray(body.tags)
        },
        getSettings()
      );
      return "desc" in result ? ok(res, result.desc) : failWithCode(res, 503, { code: result.fail, message: devMessage(result.fail) });
    }
    if (method === "GET" && seg.length === 1 && a === "settings") {
      return ok(res, getSettings());
    }
    if (method === "PUT" && seg.length === 1 && a === "settings") {
      if (!isSettingsAvailable()) return fail(res, 503, "\u8BBE\u7F6E\u670D\u52A1\u4E0D\u53EF\u7528\uFF08\u5BBF\u4E3B\u672A\u63D0\u4F9B settings \u670D\u52A1\uFF09");
      const body = await readBody(req, res);
      const patch = {};
      for (const key of Object.keys(getSettings())) {
        if (body[key] !== void 0) patch[key] = body[key];
      }
      try {
        const next = await updateSettings(patch);
        clearRouteCache();
        return ok(res, next);
      } catch (e) {
        return fail(res, 400, "\u8BBE\u7F6E\u5199\u5165\u88AB\u62D2\u7EDD\uFF1A" + String(e));
      }
    }
    if (method === "POST" && seg.length === 2 && a === "export" && b === "save") {
      const body = await readBody(req, res);
      const dir = asString(body.dir);
      if (!dir) return fail(res, 400, "\u7F3A\u5C11 dir");
      if (!isAbsolute(dir)) return fail(res, 400, "dir \u5FC5\u987B\u662F\u7EDD\u5BF9\u8DEF\u5F84");
      if (!existsSync2(dir) || !statSync(dir).isDirectory()) return fail(res, 400, "dir \u4E0D\u5B58\u5728\u6216\u4E0D\u662F\u76EE\u5F55");
      const backup = exportPrompts();
      const target = join4(dir, `prompt-enhancer-backup-${stamp()}.json`);
      try {
        writeFileSync2(target, JSON.stringify(backup, null, 2) + "\n", "utf8");
      } catch (e) {
        return fail(res, 500, "\u5199\u76D8\u5931\u8D25\uFF1A" + String(e));
      }
      return ok(res, { path: target, prompts: backup.prompts.length, tags: backup.tags.length });
    }
    if (method === "POST" && seg.length === 1 && a === "import") {
      const body = await readBody(req, res);
      const result = importPrompts(body.backup, { confirm: body.confirm === true });
      return result.ok ? ok(res, result) : fail(res, 400, result.error ?? "\u5BFC\u5165\u88AB\u62D2\u7EDD");
    }
    if (seg.length === 2 && a === "meta") {
      if (method === "GET") return ok(res, { key: b, value: getMetaValue(b) });
      if (method === "PUT") {
        const body = await readBody(req, res);
        const value = asString(body.value);
        if (value === void 0) return fail(res, 400, "\u7F3A\u5C11 value");
        setMetaValue(b, value);
        return ok(res, { key: b, value });
      }
      if (method === "DELETE") return ok(res, { key: b, deleted: deleteMetaValue(b) });
    }
    if (method === "POST" && seg.length === 2 && a === "skills" && b === "export") {
      const body = await readBody(req, res);
      const promptId = asString(body.promptId);
      if (!promptId) return fail(res, 400, "\u7F3A\u5C11 promptId");
      const prompt = getPrompt(promptId);
      if (!prompt) return fail(res, 404, "\u63D0\u793A\u8BCD\u4E0D\u5B58\u5728");
      const descriptor = typeof body.descriptor === "object" && body.descriptor !== null ? body.descriptor : void 0;
      const locked = prompt.skillName !== void 0 && prompt.skillName.trim() !== "" ? prompt.skillName : void 0;
      const name2 = toKebab(locked ?? asString(body.name) ?? descriptor?.name ?? "");
      if (!isValidSkillName(name2)) return fail(res, 400, "\u6280\u80FD\u540D\u975E\u6CD5\uFF1A\u9700\u8981\u5C0F\u5199 kebab-case");
      const all = listPrompts();
      const owner = all.find((x) => x.skillName === name2 && x.id === promptId) ?? all.find((x) => x.skillName === name2);
      const result = exportSkill({
        prompt,
        name: name2,
        descriptor,
        ownerPromptId: owner?.id,
        conflictConfirmed: body.conflictConfirmed === true
      });
      if (!result.ok) {
        return fail(res, result.conflict ? 409 : 400, result.error ?? "\u5BFC\u51FA\u5931\u8D25");
      }
      const updated = updatePrompt(promptId, {
        skillName: result.name,
        skillExportedAt: Date.now()
      });
      return ok(res, { name: result.name, path: result.path, prompt: updated });
    }
    return fail(res, 404, `no route ${method} ${url.pathname}`);
  } catch (e) {
    if (e instanceof BadRequest) return fail(res, 400, e.message);
    console.error("[prompt-enhancer] \u672A\u9884\u671F\u9519\u8BEF " + method + " " + url.pathname, e);
    return fail(res, 500, "internal error");
  }
}
function makeRoutes() {
  return [{ kind: "prefix", path: API_PREFIX, handler: dispatch }];
}

// src/index.ts
var name = "prompt-enhancer";
var inject = [];
var Config = PromptEnhancerSettingsSchema;
function onSettingsChanged() {
  clearRouteCache();
}
function apply(ctx, config) {
  bindSettingsHost(ctx, config);
  onSettingsChanged();
  ctx.inject(["llm"], (llmCtx) => {
    registerLlm(llmCtx.llm);
    return () => registerLlm(void 0);
  });
  ctx.inject(["webServer"], (httpCtx) => {
    httpCtx.effect(() => {
      const disposers = makeRoutes().map((route) => httpCtx.webServer.register(route));
      return () => {
        for (const dispose of disposers) dispose();
      };
    }, "prompt-enhancer: routes");
  });
  ctx.on("loader/volatile-update", onSettingsChanged);
  ctx.effect(() => {
    if (false) console.log("[prompt-enhancer] host loaded v0.1.0");
    return () => {
      if (false) console.log("[prompt-enhancer] host unloaded");
      bindSettingsHost(void 0, void 0);
    };
  }, "prompt-enhancer: lifecycle");
}
export {
  SETTINGS_NAMESPACE as CONFIG_NAMESPACE,
  Config,
  apply,
  inject,
  name
};
//# sourceMappingURL=index.js.map
