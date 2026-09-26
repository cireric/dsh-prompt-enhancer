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

/**
 * 清 per-prompt meta 键（`DELETE /meta/:key`）的超时（T7-1 / P7 §10.4-1）。
 *
 * **有界且独立命名**：它既不是 AI 调用超时（120s，真的在等模型），也不是探测超时（15s，只问
 * 「有没有可用模型」）——它等的是宿主一次 KV 删除。修前这条路由**不设超时**（`call()` 的
 * `timeoutMs` 缺省即不挂 signal）：一次挂住的 `DELETE /meta` 会让 `deletePrompts` 的
 * `Promise.allSettled` 永不落定 ⇒ 既无 `console.warn` 也无 UI 信号（P7 M7 的 Minor 3）。
 */
export const CLEAR_TIMEOUT_MS = 15_000;

/** `AbortSignal.timeout` 到点的形态判定（看名字，不看文案）：浏览器与 Node 都抛 `TimeoutError`。 */
function isTimeoutAbort(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const name = (err as { name?: unknown }).name;
  return name === "TimeoutError" || name === "AbortError";
}

/** 信封失败与响应解析失败统一抛出的错误：带 HTTP status，供调用方按状态分类（不匹配 message 文本）。 */
export class ApiError extends Error {
  readonly status: number;
  /**
   * T7-7：true = 这次失败发生在**探测**路径（`GET /ai/providers`，见 `listAiProviders`）。
   *
   * 只有「探测 + 本客户端主动超时」这一条路径会置位（`call()` 里唯一的 `probe` 传出点），
   * 故它等价于「探测超时」：探测拿到 4xx/5xx 走的是信封路径，构造时 `probe` 仍是缺省 false。
   * 探测超时与 AI 调用超时都是「超时」，但用户要做的事不同（探测 = 没有可用模型 / 网络不通；
   * 调用 = 模型太慢），故必须**分类可辨**（`ai-flow.ts#aiErrorKey` 据此给不同的文案键）。
   */
  readonly probe: boolean;
  /**
   * T3：宿主 AI 失败信封 `error: { code }` 里的**跨层错误码**（`src/host/ai-errors.ts` 枚举）。
   * 只有 AI 分支会带 code；其余路由的旧形字符串信封在此缺省 `undefined`——客户端分类
   * （`ai-flow.ts`）先看 code、再退回 status / name 判定，对信封形状变更透明。
   */
  readonly code: string | undefined;
  constructor(message: string, status: number, probe = false, code?: string) {
    super(message);
    this.status = status;
    this.probe = probe;
    this.code = code;
  }
}

/** `/ai/providers` 返回的可选清单（宿主按已配置的 provider 给出模型）。 */
export interface AiSelectable { provider: string; name: string; models: Array<{ id: string; name: string }> }

/** `/ai/refine` 的返回：小标题、标签（最多 1 个）、摘要、正文。 */
export interface AiRefineResult { title: string; tags: string[]; summary: string; body: string }

/**
 * `POST /ai/skill-descriptor` 的返回：AI 生成的技能名 / 描述（`whenToUse` 可选）。
 *
 * 形状照 `src/host/ai.ts#SkillDescriptor` **在客户端重述**，与 `AiSelectable` / `AiRefineResult`
 * 同款：客户端不 import 宿主模块（那会拉进 `node:fs` / `@deepseek-ai/dsh-llm`），故响应形状在此声明。
 */
export interface SkillDescriptorPayload { name: string; description: string; whenToUse?: string }

/**
 * `POST /skills/export` 的返回（宿主回执）。
 *
 * `path` 是宿主算出来的**目标 SKILL.md 绝对路径**（`$DSH_HOME/skills/<name>/SKILL.md`，
 * 见 routes.ts 的技能导出分支）。声明为可选是**有意的**：客户端不知道 `DSH_HOME`，
 * 缺席时只能显式报出契约漂移，**不得**自己拼一个路径出来（规格 §7.6 的目标目录一律取宿主返回值）。
 */
export interface SkillExportReceipt { name: string; path?: string; prompt?: Prompt }

/**
 * 响应信封（规格 §5）：客户端以 data === undefined 判失败。
 * T3 双形：`error` 可以是旧形 string（非 AI 路由），也可以是 AI 路由的
 * `{ code, message? }`——`message` 是宿主的开发诊断文案，`code` 才是跨层契约。
 */
interface Envelope<T> { ok: boolean; data?: T; error?: string | { code?: unknown; message?: unknown } }

/** 从信封 `error` 读出跨层 code（结构化形态才有；旧形 string / 杂值一律 undefined）。 */
function envelopeCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && code !== "" ? code : undefined;
}

/** 从信封 `error` 读出可读字符串（双形都兜住：旧形取原文，结构化取 message / code 兜底）。 */
function envelopeMessage(error: unknown, fallback: string): string {
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message !== "") return message;
    const code = envelopeCode(error);
    if (code) return code;
  }
  return fallback;
}

/**
 * 失败一律抛出带可读原因的 ApiError——调用方 catch 后出 toast（不得静默吞掉）。
 * `timeoutMs` 传了才挂 AbortSignal.timeout：AI 路由用 AI_TIMEOUT_MS、探测用 AI_PROBE_TIMEOUT_MS、
 * 清键用 CLEAR_TIMEOUT_MS，其余路由不设超时（保持 P4 行为）。
 *
 * `probe`（T7-7）：这次请求是不是 `GET /ai/providers` 探测。**只有探测路径**会把「到点」从
 * `DOMException("TimeoutError")` 换成带标记的 `ApiError`（见下）——探测超时与 AI 调用超时必须在
 * 分类器那里可辨；其余路径的超时**原样上抛**（既有契约，见 tests/api.test.mjs 的负面对照）。
 */
async function call<T>(method: string, path: string, body?: unknown, timeoutMs?: number, probe = false): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_PREFIX + path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: timeoutMs === undefined ? undefined : AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    /**
     * `AbortSignal.timeout` 到点抛的是 `DOMException`（名字 `TimeoutError`），它身上**没有**
     * 「这是探测」这条信息 ⇒ 探测路径换成带 `probe` 标记的 ApiError。
     * 其它路径（含清键的 CLEAR_TIMEOUT_MS）保持**原样上抛**：超时不经信封路径是既有契约，
     * 而调用方的 catch 同样会触发（`deletePrompts` 记 failed + `console.warn`）。
     */
    if (probe && isTimeoutAbort(e)) throw new ApiError("探测可用的 AI 模型超时", 0, true);
    throw e;
  }
  let parsed: Envelope<T>;
  try {
    parsed = (await res.json()) as Envelope<T>;
  } catch (e) {
    throw new ApiError(`响应不是合法 JSON（HTTP ${res.status}）：${String(e)}`, res.status);
  }
  if (parsed.data === undefined) {
    const fallback = `请求失败（HTTP ${res.status}）`;
    throw new ApiError(envelopeMessage(parsed.error, fallback), res.status, false, envelopeCode(parsed.error));
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
  /** 写设置（降级路径：无 `settingsScope` 时用；有 scope 时写走宿主 scope.set）。 */
  updateSettings: (patch: Partial<PluginSettings>) => call<PluginSettings>("PUT", "/settings", patch),
  getMeta: (key: string) => call<{ key: string; value: string }>("GET", `/meta/${encodeURIComponent(key)}`).then((r) => r.value),
  setMeta: (key: string, value: string) =>
    call<{ key: string; value: string }>("PUT", `/meta/${encodeURIComponent(key)}`, { value }),
  /**
   * 删一条 meta KV（`DELETE /meta/:key`，T6 / O-1）。**幂等**：键不存在时宿主同样回 ok
   * （`deleted: false` 只说明「这次没删到行」，不是失败）。**通用通道**：键名约定（`pl:...`）
   * 归调用方，宿主不认识它——故这里也不做任何键名特判，调用方拼好键名传进来即可。
   *
   * **超时（T7-1 / P7 §10.4-1）**：挂 `CLEAR_TIMEOUT_MS`（有界、独立命名）。到点 ⇒ `AbortSignal.timeout`
   * 中断请求 ⇒ `fetch` 拒绝（`DOMException: TimeoutError`）⇒ `deletePrompts` 的 `Promise.allSettled`
   * 记一笔 failed 并 `console.warn`。修前不设超时：挂住的 DELETE 让收尾永不落定，连 warn 都没有。
   */
  deleteMeta: (key: string) =>
    call<{ key: string; deleted: boolean }>("DELETE", `/meta/${encodeURIComponent(key)}`, undefined, CLEAR_TIMEOUT_MS),

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
  /** 探测（T7-7）：`probe = true` ⇒ 到点抛**带标记**的 ApiError，分类器据此给「探测超时」专属文案。 */
  listAiProviders: () =>
    call<AiSelectable[]>("GET", "/ai/providers", undefined, AI_PROBE_TIMEOUT_MS, true),
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
  /**
   * 逐条 AI 补全技能名与描述（`POST /ai/skill-descriptor`；规格 §7.6 的「AI 补全名称与描述」）。
   *
   * `body` 必填（宿主空 body 直接 400「缺少 body」）；`title` / `summary` / `tags` 是上下文，
   * 宿主原样喂给提示词。走 `AI_TIMEOUT_MS`——它真的在等模型（同 /ai/polish、/ai/refine）；
   * AI 不可用 → 宿主 **503**，经 `call()` 变成带 status 的 ApiError（失败必须可见）。
   */
  aiSkillDescriptor: (input: { body: string; title?: string; summary?: string; tags?: string[] }) =>
    call<SkillDescriptorPayload>("POST", "/ai/skill-descriptor", input, AI_TIMEOUT_MS),

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
  exportPromptAsSkill: (input: {
    promptId: string;
    name?: string;
    descriptor?: SkillDescriptorPayload;
    conflictConfirmed?: boolean;
  }) => call<SkillExportReceipt>("POST", "/skills/export", input),

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
  /**
   * 清空回收站（T7 ⑦ / 修复轮 1）。回执**同时**给两样：
   *   · `removed` = 被删**条数**（既有形状，未变——不破坏任何既有读法）；
   *   · `ids` = 被**物理删除的 id 列表**——客户端按**它**清 per-prompt meta（`ai-flow.ts#deletePrompts`）；
   *     面板列出的 items 是**打开那一刻**的快照，清空与列表之间的竞态窗口内新增的行同样被删，
   *     却不在快照里（按快照清键就会留下残键）。`ids.length === removed`。
   */
  emptyTrash: () => call<{ removed: number; ids: string[] }>("DELETE", "/trash"),

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
