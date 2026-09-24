import {
  API_PREFIX,
  type ImportResult,
  type PluginSettings,
  type Prompt,
  type PromptSort,
  type PromptWritablePatch,
  type TrashItem,
} from "../../types.ts";

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
   * 宿主 PUT 只认白名单字段（事实见 `src/host/routes.ts` 的 PUT 分发：title | body | tags |
   * summary | skillName | skillExportedAt），其余字段被静默丢弃且仍回 200。故补丁类型取
   * `PromptWritablePatch`（types.ts 已导出，由 `PROMPT_WRITABLE_KEYS` 派生的 6 键 Pick），
   * 把 `sourceBody` / `aiRefined` / `aiRefinedAt` 这类「可读不可写」字段挡在编译期。
   * `aiWriteBack` 是写回 `sourceBody` 的唯一路径（§4.4），它不是记录字段（store.updatePrompt
   * 的选项目志），用交叉类型补上。
   */
  updatePrompt: (id: string, patch: PromptWritablePatch & { aiWriteBack?: boolean }) =>
    call<Prompt>("PUT", "/prompts/" + encodeURIComponent(id), patch),
  rollbackPrompt: (id: string) => call<Prompt>("POST", "/prompts/" + encodeURIComponent(id) + "/rollback"),
  listAiProviders: () => call<AiSelectable[]>("GET", "/ai/providers", undefined, AI_PROBE_TIMEOUT_MS),
  /**
   * `keepVariables` **必填**（P5 延期 #9 / T6-A3）：缺省 `true` 会让漏传的调用方静默落回被否决的
   * 常量，改成必填即由编译期拦住漏传。运行期仍按 `!== false` 判定，JS 调用方缺省时的旧行为不变。
   */
  polishPrompt: (body: string, opts: { keepVariables: boolean }) =>
    call<{ polished: string; summary?: string }>(
      "POST",
      "/ai/polish",
      { body, keepVariables: opts.keepVariables !== false, withSummary: false },
      AI_TIMEOUT_MS,
    ),
  refinePrompt: (body: string) => call<AiRefineResult>("POST", "/ai/refine", { body }, AI_TIMEOUT_MS),

  // ── 提示词：单条读写（P6）──────────────────────────────────────────────
  /** 单条读取；不存在时宿主回 404（信封失败 → ApiError.status === 404）。 */
  getPrompt: (id: string) => call<Prompt>("GET", "/prompts/" + encodeURIComponent(id)),
  /** 软删除：进回收站（规格 §4.4），故返回的是「已删除」而不是被删实体。 */
  deletePrompt: (id: string) => call<{ deleted: true }>("DELETE", "/prompts/" + encodeURIComponent(id)),

  // ── 标签（P6）──────────────────────────────────────────────────────────
  listTags: () => call<Array<{ name: string; count: number }>>("GET", "/tags"),
  createTag: (name: string) => call<{ name: string }>("POST", "/tags", { name }),
  /** 改名：旧名是路径段，新名在新体（宿主 PUT 只读 body.to）。 */
  renameTag: (from: string, to: string) =>
    call<{ affected: number }>("PUT", "/tags/" + encodeURIComponent(from), { to }),
  /** 在用标签宿主回 400 并带用量（信封失败 → ApiError.status === 400），调用方按状态分类。 */
  deleteTag: (name: string) =>
    call<{ deleted: boolean; inUse: number }>("DELETE", "/tags/" + encodeURIComponent(name)),

  // ── 回收站（P6）────────────────────────────────────────────────────────
  listTrash: () => call<TrashItem[]>("GET", "/trash"),
  restoreTrash: (id: string) =>
    call<{ restored: number }>("POST", "/trash/" + encodeURIComponent(id) + "/restore"),
  deleteTrash: (id: string) => call<{ removed: number }>("DELETE", "/trash/" + encodeURIComponent(id)),
  emptyTrash: () => call<{ removed: number }>("DELETE", "/trash"),

  // ── 导入导出（P6）──────────────────────────────────────────────────────
  /**
   * 导入备份。**只是信封封装，语义照宿主**（P6-4 裁定）：confirm 不为 true 时宿主只回预览
   * （applied: false + stats），且**不**自动淘汰超限条目（「导入不淘汰」是用户裁定）。
   * confirm 缺省时不发该键（宿主同判为未确认），调用方显式传 true 才落库。
   */
  importBackup: (backup: unknown, confirm?: boolean) =>
    call<ImportResult>("POST", "/import", { backup, confirm }),
  /** 把备份写到宿主可写的绝对路径目录；文件名由服务端生成（客户端不能指定任意文件名）。 */
  exportBackup: (dir: string) =>
    call<{ path: string; prompts: number; tags: number }>("POST", "/export/save", { dir }),
};
