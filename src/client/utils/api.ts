import { API_PREFIX, type PluginSettings, type Prompt, type PromptPatch, type PromptSort } from "../../types.ts";

/** 前端 AI 路由超时（120s，用户裁定）；超时由 AbortSignal.timeout 触发，分类见 ai-flow.ts#aiErrorKey。 */
export const AI_TIMEOUT_MS = 120_000;

/**
 * `/ai/providers` 探测超时（15s）。
 *
 * 与 AI_TIMEOUT_MS 分开：探测只问「有没有可用模型」，不该让按钮等满 2 分钟。
 * 它是硬需求而非优化——任务 2 的重入闸门（busyRef）会一直持有到该请求落定，
 * 没有 signal 时一次挂起的 GET 等于 AI 按钮永久 disabled，而「最长约 2 分钟」
 * 那句文案约束不到这个请求。
 */
export const AI_PROBE_TIMEOUT_MS = 15_000;

/** 信封失败与响应解析失败统一抛出的错误：带 HTTP status，供调用方按状态分类（不匹配 message 文本）。 */
export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** `/ai/providers` 返回的可选清单（宿主按已配置的 provider 给出模型）。 */
export interface AiSelectable { provider: string; name: string; models: Array<{ id: string; name: string }> }

/** `/ai/refine` 的返回：小标题、标签（最多 1 个）、摘要、正文。 */
export interface AiRefineResult { title: string; tags: string[]; summary: string; body: string }

/** 响应信封（规格 §5）：客户端以 data === undefined 判失败。 */
interface Envelope<T> { ok: boolean; data?: T; error?: string }

/**
 * 失败一律抛出带可读原因的 ApiError——调用方 catch 后出 toast（不得静默吞掉）。
 * `timeoutMs` 传了才挂 AbortSignal.timeout：AI 路由用 AI_TIMEOUT_MS，其余路由不设超时（保持 P4 行为）。
 */
async function call<T>(method: string, path: string, body?: unknown, timeoutMs?: number): Promise<T> {
  const res = await fetch(API_PREFIX + path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: timeoutMs === undefined ? undefined : AbortSignal.timeout(timeoutMs),
  });
  let parsed: Envelope<T>;
  try {
    parsed = (await res.json()) as Envelope<T>;
  } catch (e) {
    throw new ApiError(`响应不是合法 JSON（HTTP ${res.status}）：${String(e)}`, res.status);
  }
  if (parsed.data === undefined) {
    throw new ApiError(parsed.error ?? `请求失败（HTTP ${res.status}）`, res.status);
  }
  return parsed.data;
}

export const api = {
  listPrompts: (opts: { q?: string; tag?: string; sort?: PromptSort } = {}) => {
    const qs = new URLSearchParams();
    if (opts.q) qs.set("q", opts.q);
    if (opts.tag) qs.set("tag", opts.tag);
    if (opts.sort) qs.set("sort", opts.sort);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return call<Prompt[]>("GET", `/prompts${suffix}`);
  },
  recordUsage: (id: string) => call<Prompt>("POST", `/prompts/${encodeURIComponent(id)}/use`),
  getSettings: () => call<PluginSettings>("GET", "/settings"),
  getMeta: (key: string) => call<{ key: string; value: string }>("GET", `/meta/${encodeURIComponent(key)}`).then((r) => r.value),
  setMeta: (key: string, value: string) =>
    call<{ key: string; value: string }>("PUT", `/meta/${encodeURIComponent(key)}`, { value }),

  createPrompt: (input: { title: string; body: string; tags?: string[]; summary?: string }) =>
    call<{ prompt: Prompt; evicted: string[] }>("POST", "/prompts", input),
  /**
   * 宿主 PUT 只认白名单字段：拼错字段名会被静默丢弃且仍回 200，故补丁类型必须是
   * `PromptPatch`（types.ts 已导出）而不是 `Record<string, unknown>`。
   * `aiWriteBack` 不在 `PromptPatch` 里（它是 store.updatePrompt 的选项目志，不是记录字段），
   * 用交叉类型补上。
   */
  updatePrompt: (id: string, patch: PromptPatch & { aiWriteBack?: boolean }) =>
    call<Prompt>("PUT", "/prompts/" + encodeURIComponent(id), patch),
  rollbackPrompt: (id: string) => call<Prompt>("POST", "/prompts/" + encodeURIComponent(id) + "/rollback"),
  listAiProviders: () => call<AiSelectable[]>("GET", "/ai/providers", undefined, AI_PROBE_TIMEOUT_MS),
  polishPrompt: (body: string, opts: { keepVariables?: boolean } = {}) =>
    call<{ polished: string; summary?: string }>(
      "POST",
      "/ai/polish",
      { body, keepVariables: opts.keepVariables !== false, withSummary: false },
      AI_TIMEOUT_MS,
    ),
  refinePrompt: (body: string) => call<AiRefineResult>("POST", "/ai/refine", { body }, AI_TIMEOUT_MS),
};
