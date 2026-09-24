/**
 * AI 能力模块：把用户提示词交给 harness 的 LLM 加工（规格 §6）。
 *
 * 设计要点：
 * - `LlmRuntime` **由 `registerLlm()` 注入**（不直接吃 `ctx`），缺失即整体降级为 `undefined`；
 * - **不 import store**：需要标签库/已有变量时由调用方传参（P3-D12），故本模块除注入的
 *   runtime 外零副作用，纯文本处理全部落在 `text.ts` / `refine.ts` 以便单测；
 * - 单点网络出口 `collectText()`：所有能力都经它 → `withLlmLock` 全局串行；
 * - 失败一律返回 `undefined` / `{ fail }`，由路由层转 503，绝不上抛打断宿主。
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { BlockAssembler, createUserMessage } from "@deepseek-ai/dsh-llm";
import type { GenerateOptions, LlmModelInfo, LlmRuntime } from "@deepseek-ai/dsh-llm";
import { logDir } from "./paths.ts";
import { parseRefineResult, type AiRefineResult } from "./refine.ts";
import { extractVariables, parseSummaryJson, stripAiFillerDetailed } from "./text.ts";
import type { PluginSettings } from "../types.ts";

/** 一条候选路由（provider + model）。 */
export interface AiRoute {
  provider: string;
  model: string;
}

/** 设置页下拉用的可选 provider / 模型清单。 */
export interface AiSelectable {
  provider: string;
  name: string;
  models: Array<{ id: string; name: string }>;
}

/** AI 生成的技能描述符（三个字段都要落盘，修上游「生成了又丢弃」的缺陷）。 */
export interface SkillDescriptor {
  name: string;
  description: string;
  whenToUse?: string;
}

/** 技能描述符生成结果。 */
export type SkillDescribeResult =
  | { desc: SkillDescriptor }
  | { fail: "no-llm" | "route" | "empty" | "parse" };

/** 润色 + 用途摘要的结果；`summary` 缺失表示摘要生成失败（不影响正文返回）。 */
export interface PolishWithSummary {
  polished: string;
  summary?: string;
}

const AI_TIMEOUT_MS = 30_000;
const AI_MAX_TOKENS = 2048;
const ROUTE_CACHE_TTL_MS = 30_000;
const SKILL_DESCRIBE_ATTEMPTS = 3;

let llm: LlmRuntime | undefined;
let routeCache: { key: string; ts: number; value: AiRoute[] } | undefined;
let llmQueue: Promise<unknown> = Promise.resolve();

// ── 诊断日志（仅开发构建写盘；失败必须可见但绝不打断主流程）────────────────

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function localDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function localTime(): string {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function logAI(message: string): void {
  if (!__DEV__) return;
  try {
    mkdirSync(logDir(), { recursive: true });
    appendFileSync(join(logDir(), `ai-${localDate()}.log`), `[${localTime()}] ${message}\n`, "utf8");
  } catch (e) {
    console.warn("[prompt-enhancer] AI 日志写入失败：" + String(e));
  }
}

// ── 注入与缓存 ─────────────────────────────────────────────────────────────

/** 注入 / 注销 harness LLM；无论哪种情况都清掉路由缓存。 */
export function registerLlm(runtime: LlmRuntime | undefined): void {
  llm = runtime;
  clearRouteCache();
  logAI(runtime ? "llm injected" : "llm removed");
}

/** 清路由缓存。设置改了 provider/model 之后**必须**调（规格 §6.2 待修缺陷）。 */
export function clearRouteCache(): void {
  routeCache = undefined;
}

/** 全局串行锁：同一时刻只允许一个 LLM 调用，避免并发把额度打爆。 */
function withLlmLock<T>(task: () => Promise<T>): Promise<T> {
  const next = llmQueue.then(task, task);
  llmQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

// ── provider / model 解析 ──────────────────────────────────────────────────

/** 列出所有 provider 及其模型（设置页下拉用）。 */
export async function listAiSelectables(): Promise<AiSelectable[]> {
  if (!llm) return [];
  const out: AiSelectable[] = [];
  for (const provider of llm.listProviders()) {
    let models: readonly LlmModelInfo[] = [];
    try {
      models = await llm.listModels(provider.id);
    } catch (e) {
      // 某个 provider 列不出模型不影响其它 provider：记录后跳过
      logAI(`listModels fail ${provider.id}: ${String(e)}`);
    }
    out.push({
      provider: provider.id,
      name: provider.name || provider.id,
      models: models.map((m) => ({ id: m.id, name: m.name || m.id })),
    });
  }
  return out;
}

async function isModelAvailable(runtime: LlmRuntime, provider: string, model: string): Promise<boolean> {
  try {
    const models = await runtime.listModels(provider);
    return models.some((m) => m.id === model);
  } catch (e) {
    logAI(`isModelAvailable fail ${provider}/${model}: ${String(e)}`);
    return false;
  }
}

/**
 * 解析候选路由（30s TTL 缓存）：
 * 1. 设置了 provider + model 且核验可用 → 首选；
 * 2. 否则遍历全部 provider，每个 provider 优先取 id 匹配 `/chat|deepseek/i` 的模型，其次取第一个；
 * 3. 去重后按 provider 顺序构成有序候选。
 */
async function resolveCandidates(runtime: LlmRuntime, settings: PluginSettings): Promise<AiRoute[]> {
  const key = `${settings.aiProvider}|${settings.aiModel}`;
  if (routeCache && routeCache.key === key && Date.now() - routeCache.ts < ROUTE_CACHE_TTL_MS) {
    return routeCache.value;
  }

  const candidates: AiRoute[] = [];
  const seen = new Set<string>();

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
    let models: readonly LlmModelInfo[] = [];
    try {
      models = await runtime.listModels(provider.id);
    } catch (e) {
      logAI(`route listModels fail ${provider.id}: ${String(e)}`);
      continue;
    }
    if (models.length === 0) continue;

    const pick = models.find((m) => /chat|deepseek/i.test(m.id)) ?? models[0]!;
    const id = `${provider.id}/${pick.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    candidates.push({ provider: provider.id, model: pick.id });
  }

  routeCache = { key, ts: Date.now(), value: candidates };
  return candidates;
}

// ── 提示词模板（规格 §6.3 的 4 组；**已删除上游的人格注入段**）──────────────

function enrichSystemPrompt(existingTags: string[], existingVars: string[]): string {
  const tagLib = existingTags.length ? existingTags.join("、") : "（暂无）";
  return [
    "你是一名词库整理助手，帮助用户把原始输入整理成高质量、可复用的提示词。",
    "",
    "【标签库】以下是当前已有的标签，请优先复用最贴合的一个，避免重复创建：",
    tagLib,
    "",
    "请严格输出一个 JSON 对象，不要 Markdown 代码块，不要任何多余文字：",
    '{ "title": "简洁标题", "tags": ["标签"], "summary": "用途摘要与使用说明", "body": "优化改写后的提示词正文" }',
    "",
    "要求：",
    "- title：简洁明了，不超过 30 字；",
    "- tags：只输出 1 个标签；优先从【标签库】中选择最贴合的一个，若没有合适的再新造一个简洁、贴合内容的新标签；",
    "- summary：一两句话说明这个提示词的用途与使用方法；",
    "- body：在保留原意的基础上润色，使表达更清晰、通用、可直接使用，不要丢失关键细节；",
    ...(existingVars.length
      ? [
          "- 正文中的 `{{变量名}}` 是模板变量占位符（运行时由使用者替换）：所有已有的 {{}} 必须原样保留，不得删除、改写或替换其中的变量名、不得修改其括号格式；",
        ]
      : []),
    "- 若正文某处内容会因使用场景而变化（如角色、对象、主题、风格、细节等），可在那处新增命名清晰、贴合语境的 {{变量名}} 占位符，提升提示词可复用性；没有这种需求时不要画蛇添足；",
  ].join("\n");
}

function enrichUserMessage(rawBody: string, tag: string | undefined, existingVars: string[]): string {
  const lines = ["以下是用户要学习的原始提示词：", "", rawBody];
  if (tag) lines.push("", `用户给出的候选标签：${tag}`);
  if (existingVars.length) {
    lines.push("", `正文已有模板变量（{{}} 内为变量名，运行时替换，必须原样保留）：${existingVars.join("、")}`);
  }
  return lines.join("\n");
}

function polishSystemPrompt(keepVariables: boolean): string {
  return [
    "你是一名专业的提示词润色助手，擅长贴合用户的写作风格对提示词进行润色。",
    "",
    "要求：",
    "- 只润色提示词内容本身，不要涉及标题、标签、分类等；",
    "- 保持原意与所有关键细节，不得遗漏、曲解或删减；",
    ...(keepVariables
      ? [
          "- 正文中的 `{{变量名}}` 是模板变量占位符（运行前由使用者替换）：所有已有的 {{}} 必须原样保留，不得删除、改写或替换其中的变量名；",
          "- 若正文某处内容会因使用场景而变化（如角色、对象、主题、风格、细节等），可在该处新增命名清晰、贴合语境的 {{变量名}} 占位符，提升提示词可复用性；没有这种需求时不要画蛇添足；",
        ]
      : []),
    "- 让提示词更清晰、通用、结构清晰、可直接复用；",
    "- 直接输出润色后的提示词正文，不要任何解释或 Markdown 代码块。",
  ].join("\n");
}

function summarySystemPrompt(): string {
  return [
    "你是一名专业的提示词分析师，擅长用一句话概括提示词的用途与用法。",
    "",
    "要求：",
    "- 用一两句话说明这条提示词的核心用途与大致使用方法（适用场景/使用方式）；",
    "- 简洁自然，不要复述正文的具体细节与步骤，50 字以内；",
    '- 直接输出 JSON：{ "summary": "用途摘要" }，不要任何解释或 Markdown 代码块。',
  ].join("\n");
}

function skillSystemPrompt(vars: string[]): string {
  return [
    "你是一名 DSH 技能（SKILL）设计助手。用户会给你一条提示词，请把它转化为一个规范、可直接复用的技能。",
    "",
    "要求：",
    "- name：英文小写 kebab-case（仅字母/数字/连字符，4-40 个字符），简洁达意，作为技能目录名与聊天框 /触发名；",
    "- description：用一句英文描述该技能的用途与适用场景（不要 Markdown），供技能 AI 在合适时机自动触发；",
    "- whenToUse：英文，一两句话说明什么场景下应该使用该技能；",
    `- 正文中的 {{变量名}} 是模板变量占位符（运行时由使用者替换），必须原样保留，不得删除、改写或替换其中的变量名；${
      vars.length ? `该技能需要用户提供的输入变量有：${vars.join("、")}，请在描述中体现。` : "该技能没有模板变量。"
    }`,
    "请严格输出一个 JSON 对象，不要 Markdown 代码块，不要任何多余文字：",
    '{ "name": "skill-name", "description": "...", "whenToUse": "..." }',
  ].join("\n");
}

// ── 单点网络出口 ───────────────────────────────────────────────────────────

/** 单次调用：把流式分片拼成纯文本。失败返回 `undefined`（并写诊断日志）。 */
async function collectText(
  runtime: LlmRuntime,
  route: AiRoute,
  system: string,
  content: string,
): Promise<string | undefined> {
  const options: GenerateOptions = {
    provider: route.provider,
    model: route.model,
    messages: [
      createUserMessage({
        content: [{ type: "text", text: content }],
        source: { kind: "plugin", plugin: "prompt-enhancer" },
      }),
    ],
    system,
    maxTokens: AI_MAX_TOKENS,
    temperature: 0.4,
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  };

  const assembler = new BlockAssembler();
  try {
    for await (const chunk of runtime.stream(options)) assembler.push(chunk);
  } catch (e) {
    logAI(`collect err ${route.provider}/${route.model}: ${String(e)}`);
    return undefined;
  }

  if (assembler.finish.kind !== "stop" && assembler.finish.kind !== "max-tokens") {
    logAI(`collect abort ${assembler.finish.kind}`);
    return undefined;
  }

  const text = assembler
    .blocks()
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("")
    .trim();
  if (!text) {
    logAI("collect empty");
    return undefined;
  }
  logAI(`collect done ${assembler.finish.kind} ${text.length}`);
  return text;
}

/** 按候选顺序轮询，第一个成功即采用；全部失败返回 `undefined`。 */
async function collectTextWithFallback(
  runtime: LlmRuntime,
  candidates: AiRoute[],
  system: string,
  content: string,
): Promise<string | undefined> {
  if (candidates.length === 0) {
    logAI("fallback: no candidates");
    return undefined;
  }
  for (const route of candidates) {
    logAI(`fallback try ${route.provider}/${route.model}`);
    const text = await withLlmLock(() => collectText(runtime, route, system, content));
    if (text !== undefined) {
      logAI(`fallback use ${route.provider}/${route.model}`);
      return text;
    }
  }
  logAI("fallback: all failed");
  return undefined;
}

// ── 能力 1：润色 ───────────────────────────────────────────────────────────

/**
 * 润色正文（等长或更精炼），返回纯文本。
 * `keepVariables` 默认为 true：保留并可按需新增 `{{变量}}`。
 */
export async function polishPromptBody(
  body: string,
  settings: PluginSettings,
  opts?: { keepVariables?: boolean },
): Promise<string | undefined> {
  if (!llm) return undefined;
  const candidates = await resolveCandidates(llm, settings);
  if (candidates.length === 0) return undefined;

  const keepVariables = opts?.keepVariables !== false;
  const existingVars = keepVariables ? extractVariables(body) : [];
  const content =
    keepVariables && existingVars.length
      ? `请润色以下提示词内容。其中已有模板变量（{{}} 内为变量名，运行前会被替换，必须原样保留）：${existingVars.join("、")}\n\n${body}`
      : `请润色以下提示词内容：\n\n${body}`;

  const text = await collectTextWithFallback(llm, candidates, polishSystemPrompt(keepVariables), content);
  if (!text) return undefined;

  // 剥离套话并**把被剥的行写进诊断日志**：这样「模型吐不吐套话」「有没有误剥正文」
  // 两件事都有原始行可查（仅在 __DEV__ 构建下落盘），不必再靠抽样猜。
  const { text: cleaned, stripped } = stripAiFillerDetailed(text);
  if (stripped.length > 0) {
    logAI(`polish stripped ${stripped.length} 行: ${stripped.join(" ⏐ ")}`);
  }
  return cleaned;
}

/** 润色 + 用途摘要（摘要失败时只返回正文，不视为整体失败）。 */
export async function polishPromptBodyWithSummary(
  body: string,
  settings: PluginSettings,
  opts?: { keepVariables?: boolean },
): Promise<PolishWithSummary | undefined> {
  const polished = await polishPromptBody(body, settings, opts);
  if (polished === undefined) return undefined;
  if (!llm) return { polished };

  const candidates = await resolveCandidates(llm, settings);
  if (candidates.length === 0) return { polished };

  const text = await collectTextWithFallback(
    llm,
    candidates,
    summarySystemPrompt(),
    `请为以下提示词生成用途摘要：\n\n${polished}`,
  );
  if (!text) return { polished };

  const summary = parseSummaryJson(text);
  return summary ? { polished, summary } : { polished };
}

// ── 能力 2：一键完善 ───────────────────────────────────────────────────────

/**
 * 一键完善：返回 `{ title, tags, summary, body }`（不写库，写回由路由决定）。
 *
 * `existingTags` 由调用方从词库取出传入——本模块**不 import store**（P3-D12），
 * 既让标签复用逻辑可测，也让 ai.ts 除注入的 runtime 外零副作用。
 */
export async function refinePrompt(
  body: string,
  settings: PluginSettings,
  existingTags: string[] = [],
): Promise<AiRefineResult | undefined> {
  if (!llm) return undefined;
  const candidates = await resolveCandidates(llm, settings);
  if (candidates.length === 0) return undefined;

  const existingVars = extractVariables(body);
  const text = await collectTextWithFallback(
    llm,
    candidates,
    enrichSystemPrompt(existingTags, existingVars),
    enrichUserMessage(body, undefined, existingVars),
  );
  if (!text) return undefined;
  return parseRefineResult(text);
}

// ── 能力 3：技能描述符 ─────────────────────────────────────────────────────

function parseSkillJson(text: string): SkillDescriptor | undefined {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1]! : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) return undefined;
  try {
    const obj = JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
    const name = typeof obj.name === "string" ? obj.name.trim() : "";
    if (!name) return undefined;
    return {
      name,
      description: typeof obj.description === "string" ? obj.description.trim() : "",
      whenToUse: typeof obj.whenToUse === "string" && obj.whenToUse.trim() ? obj.whenToUse.trim() : undefined,
    };
  } catch {
    return undefined;
  }
}

/**
 * 生成技能描述符：`{ name, description, whenToUse }`（**三字段全部返回**，
 * 修上游「生成了 whenToUse 却在客户端丢弃」的缺陷）。
 * 模型返回空/解析失败多为瞬时故障，最多重试 3 次后判失败。
 */
export async function generateSkillDescriptor(
  prompt: { title: string; body: string; summary?: string; tags?: string[] },
  settings: PluginSettings,
): Promise<SkillDescribeResult> {
  if (!llm) return { fail: "no-llm" };
  const candidates = await resolveCandidates(llm, settings);
  if (candidates.length === 0) return { fail: "route" };

  const vars = extractVariables(prompt.body);
  const system = skillSystemPrompt(vars);
  const content = [
    `提示词标题：${prompt.title}`,
    ...(prompt.summary ? [`提示词摘要：${prompt.summary}`] : []),
    ...(prompt.tags?.length ? [`提示词标签：${prompt.tags.join("、")}`] : []),
    "",
    "以下是提示词正文（{{变量名}} 为模板变量，必须原样保留）：",
    prompt.body,
  ].join("\n");

  for (let attempt = 1; attempt <= SKILL_DESCRIBE_ATTEMPTS; attempt++) {
    const text = await collectTextWithFallback(llm, candidates, system, content);
    if (text) {
      const parsed = parseSkillJson(text);
      if (parsed) {
        logAI(`skill desc ok ${parsed.name}`);
        return { desc: parsed };
      }
      logAI(`skill desc parse fail: ${text.slice(0, 300)}`);
    }
    if (attempt < SKILL_DESCRIBE_ATTEMPTS) logAI(`skill desc retry ${attempt}`);
  }
  return { fail: "empty" };
}
