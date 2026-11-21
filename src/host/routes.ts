/**
 * Host HTTP API：单条 prefix 路由 + **分发表驱动**。
 *
 * 路由清单（`ROUTE_SPECS`）是**单一真源**（审查 #10-③）：`dispatch` 按它匹配与分发，
 * `tests/api.test.mjs` 的覆盖账本按 `pattern` 与它**双向对齐**——加一条路由必须同时加一条覆盖行
 * （或豁免行），否则那条用例直接红。此前 dispatch 是手写 if 链、测试另有一份手抄的 27 行副本，
 * 两边各自漂移且无人发现。
 *
 * 本文件是**薄路由层**：只做「解析请求 → 调 store / ai / skills / settings → 组装信封 → 错误映射」，
 * 业务语义全部在各自模块里且已有测试。响应信封固定 `{ ok, data?, error? }`——
 * 客户端以 `data === undefined` 判失败，故此约定不可改。
 *
 * 失败信封（T3）为**双形**：`error` 可以是旧形字符串（非 AI 分支不变），也可以是 AI 分支的
 * 结构化形态 `{ code, message? }`——`code` 是 `ai-errors.ts` 的跨层枚举，`message` 仅作开发诊断
 * （仅 __DEV__ 构建下发；宿主**零用户文案**，面向用户的句子只存在于客户端字典）。
 * 两种形态并存是**有意**的：客户端 `ApiError.code` 对旧形缺省为 `undefined`，解析对信封形状透明。
 *
 * 状态码：400 参数错误 / 403 跨源写入被拒（见 isCrossSiteWrite）/ 404 未找到 / 409 同名冲突需确认 /
 * 503 AI 或设置服务不可用 / 500 未预期异常。
 */
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { closeSync, existsSync, openSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { isAbsolute, join } from "node:path";
import * as ai from "./ai.ts";
import { readDraftRequest } from "./draft.ts";
import { searchDraftSources } from "./draft-search.ts";
import * as skills from "./skills.ts";
import * as store from "./store.ts";
import { clearRouteCache } from "./ai.ts";
import { getSettings, isSettingsAvailable, updateSettings } from "./settings.ts";
import { safeErrorCode, startReviewTrace, type ReviewTrace } from "./review-trace.ts";
import { readTemplateVariables } from "../template-variables.ts";
import { IMPORT_REQUEST_OVERHEAD, MAX_REQUEST_BODY_BYTES } from "../backup-transfer.ts";
import { API_PREFIX, type Prompt, type PromptSort, type PromptWritablePatch } from "../types.ts";

/** 路由注册对象（与 `@deepseek-ai/dsh-host-webserver` 的 `WebRoute` 对齐）。 */
export interface PromptEnhancerRoute {
  kind: "prefix";
  path: string;
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
}

/** 请求体不是合法 JSON / 参数缺失时抛出，由分发层映射成 400。 */
class BadRequest extends Error {}

const skillConflictKey = randomBytes(32);

class SkillConflict extends Error {
  readonly conflict: { name: string; token: string } | undefined;
  constructor(message: string, conflict?: { name: string; token: string }) {
    super(message);
    this.conflict = conflict;
  }
}

function requestVersion(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^[a-f\d]{64}$/.test(value)) throw new BadRequest("contentVersion 无效");
  return value;
}

function versioned(prompt: Prompt): Prompt {
  return { ...prompt, contentVersion: store.promptContentVersion(prompt) };
}

function requestVariables(value: unknown) {
  if (value === undefined) return undefined;
  const variables = readTemplateVariables(value);
  if (!variables) throw new BadRequest("变量配置无效");
  return variables;
}

function requestSkillDescriptor(value: unknown): ai.SkillDescriptor | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BadRequest("技能描述符必须是对象");
  }
  const { name = "", description = "", whenToUse } = value as Record<string, unknown>;
  if (typeof name !== "string" || typeof description !== "string" ||
      (whenToUse !== undefined && typeof whenToUse !== "string")) {
    throw new BadRequest("技能描述符字段必须是字符串");
  }
  return { name, description, whenToUse };
}

// ── 信封与工具 ─────────────────────────────────────────────────────────────

function json(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function ok<T>(res: ServerResponse, data: T): void {
  json(res, 200, { ok: true, data });
}

function fail(res: ServerResponse, status: number, error: string): void {
  json(res, status, { ok: false, error });
}

/** AI 失败信封：`error = { code, message? }`（T3；message 仅 __DEV__ 下发，见本文件头）。 */
function failWithCode(
  res: ServerResponse,
  status: number,
  error: { code: string; message?: string },
  trace?: ReviewTrace,
): void {
  trace?.("request-failed", { code: error.code });
  json(res, status, { ok: false, error });
}

/** 组装开发诊断 message：非 __DEV__ 构建恒为 undefined（宿主零用户文案）。 */
function devMessage(detail: string): string | undefined {
  return __DEV__ ? detail : undefined;
}

/** 解析已读满的请求体；空体按空对象处理（GET 语义的 POST 也照旧）。 */
function parseJsonBody(raw: string): Record<string, unknown> {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new BadRequest("请求体不是合法 JSON：" + String(e));
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new BadRequest("请求体必须是 JSON 对象");
  }
  return parsed as Record<string, unknown>;
}

/**
 * 读请求体（上限 {@link MAX_REQUEST_BODY_BYTES}）。
 *
 * ⚠️ 超限时**不得**先 `req.destroy()`：`IncomingMessage.destroy()` 会连底层 socket 一起拆掉，
 * 响应还没写出去客户端只会拿到 `TypeError: fetch failed (cause: EPIPE)`——文档承诺的 400 信封
 * 永远到不了（2026-10-03 用真实 server + 6 MB 请求体实测）。改成：**停止读取**（pause，剩余字节
 * 由连接关闭兜住）+ 给本次响应挂 `Connection: close`，让分发层的 400 正常写出。
 *
 * 用事件而非 `for await`：`for await` 在 break/throw 时会对流调 `return()`，同样会提前销毁
 * 请求流，把上面这条约束从后门放回来。
 */
function readBody(req: IncomingMessage, res: ServerResponse, signal?: AbortSignal): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    function cleanup(): void {
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("error", onError);
      signal?.removeEventListener("abort", onAbort);
    }

    function onData(chunk: Buffer): void {
      if (settled) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      total += buf.length;
      if (total > MAX_REQUEST_BODY_BYTES) {
        settled = true;
        cleanup();
        req.pause();
        res.setHeader("Connection", "close");
        reject(new BadRequest("请求体超过上限（" + MAX_REQUEST_BODY_BYTES + " 字节）"));
        return;
      }
      chunks.push(buf);
    }

    function onEnd(): void {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        resolve(parseJsonBody(Buffer.concat(chunks).toString("utf8").trim()));
      } catch (e) {
        reject(e as Error);
      }
    }

    function onError(err: Error): void {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    }

    function onAbort(): void {
      if (settled) return;
      settled = true;
      cleanup();
      reject(signal?.reason);
    }

    if (signal?.aborted) return onAbort();
    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * 跨源写入闸（安全，2026-10-03 审查 C1）：浏览器对**跨源简单请求**不做预检，而带
 * `Content-Type: text/plain` 的 POST 恰好能携带任意 JSON 正文——只要用户在浏览器里开着任意
 * 网页，它就能对固定的 `127.0.0.1:3080` 发起写请求（`/import` 覆盖词库、`/prompts` 灌条目、
 * `/ai/*` 烧额度、`/export/save` 往已存在目录落文件、`/skills/export` 写技能）。
 *
 * 宿主的 webServer 只做「匹配 → route.handler」（packages/host/webserver/src/index.ts 的 handle()），
 * 没有任何 origin / token / CSRF 守卫，故这道闸必须落在插件自己的路由层；本仓「修复一律在插件侧」
 * 的纪律也要求如此。
 *
 * 判据只认**正向的跨源证据**，没有证据即放行（`curl`、脚本、宿主自己的 agent 都不带这些头；
 * 同源页面的写请求带 `Origin` 且与 `Host` 同值）：
 *   - `Sec-Fetch-Site: cross-site`——现代浏览器对跨源请求恒发；
 *   - `Origin` 存在且与 `Host` 不同源，含 `Origin: null`（沙箱 iframe / `file://`）。
 * 已知边界：反向代理若把 `Host` 改写成与浏览器 `Origin` 不同源，写请求会被一并挡住——
 * 本仓未部署该形态，不为它预留开关（留开关等于给这条闸门开一个默认关闭的后门）。
 */
function isCrossSiteWrite(req: IncomingMessage): boolean {
  if (req.headers["sec-fetch-site"] === "cross-site") return true;
  const origin = req.headers.origin;
  if (typeof origin !== "string" || origin === "") return false;
  if (origin === "null") return true;
  const host = req.headers.host;
  if (!host) return true;
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : undefined;
}

function segments(pathname: string): string[] {
  return pathname
    .slice(API_PREFIX.length)
    .split("/")
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });
}

/** 独占创建，写盘失败时只清理本次创建的文件。 */
function writeNewBackup(target: string, contents: string): void {
  const fd = openSync(target, "wx");
  try {
    try {
      writeFileSync(fd, contents, "utf8");
    } finally {
      closeSync(fd);
    }
  } catch (error) {
    try {
      unlinkSync(target);
    } catch (cleanupError) {
      console.warn("[prompt-enhancer] 未能清理写入失败的备份文件：" + target, cleanupError);
    }
    throw error;
  }
}

/** 导出文件名用的时间戳（本地时区）。 */
function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// ── 分发 ───────────────────────────────────────────────────────────────────

// ── 路由清单（单一真源）────────────────────────────────────────────────────

/** 处理函数拿到的上下文：请求、响应、**已切好的路径段**与已解析的 URL。 */
interface RouteContext {
  req: IncomingMessage;
  res: ServerResponse;
  /** API_PREFIX 之后、已 decodeURIComponent 的路径段。 */
  seg: string[];
  /** 已解析的请求 URL（查询参数从它取）。 */
  url: URL;
  trace?: ReviewTrace;
  signal?: AbortSignal;
}

/** 段匹配器：逐段比对，`null` = 任意参数段；**段数必须精确相等**。 */
function shape(...fixed: Array<string | null>): (seg: string[]) => boolean {
  return (seg) =>
    seg.length === fixed.length && fixed.every((want, i) => want === null || seg[i] === want);
}

/**
 * 一条逻辑路由。**这份清单是路由的单一真源**（审查 #10-③）：
 *   · `dispatch` 按它匹配与分发；
 *   · 测试侧的覆盖账本（`tests/api.test.mjs#ROUTE_CASES`）按 `pattern` 与它**双向对齐**——
 *     加一条路由必须同时加一条覆盖行（或豁免行），否则那条用例直接红。
 *     此前测试手里那 27 行是**手抄副本**，加第 28 条路由时全套测试毫无反应。
 */
interface RouteSpec {
  method: "GET" | "POST" | "PUT" | "DELETE";
  /** 形状，如 `POST /prompts/:id/use`；测试的覆盖账本按它作键。 */
  pattern: string;
  match: (seg: string[]) => boolean;
  handle: (ctx: RouteContext) => Promise<void> | void;
}

/**
 * 全部逻辑路由。**顺序无关**：没有两条 route 的方法 + 段形状重叠——三条
 * `GET/PUT/DELETE /prompts/:id` 靠方法区分，`/trash` 与 `/trash/:id` 靠段数区分，
 * 三条 `/meta/:key` 同样靠方法区分。
 */
export const ROUTE_SPECS: readonly RouteSpec[] = [
  // ── 提示词 ──────────────────────────────────────────────────────────────
  {
    method: "GET",
    pattern: "GET /prompts",
    match: shape("prompts"),
    handle: ({ res, url }) => {
      const sort = url.searchParams.get("sort") ?? undefined;
      const allowed: PromptSort[] = ["default", "updated", "used", "created"];
      if (sort !== undefined && !allowed.includes(sort as PromptSort)) {
        return fail(res, 400, `sort 只能是 ${allowed.join(" / ")}`);
      }
      return ok(res, store.listPrompts({
        q: url.searchParams.get("q") ?? undefined,
        tag: url.searchParams.get("tag") ?? undefined,
        sort: sort as PromptSort | undefined,
      }).map(versioned));
    },
  },
  {
    method: "POST",
    pattern: "POST /prompts",
    match: shape("prompts"),
    handle: async ({ req, res }) => {
      const body = await readBody(req, res);
      const text = asString(body.body);
      if (!text) return fail(res, 400, "缺少 body");
      const rawApproved = body.approvedEvictions;
      const approvedEvictions = asStringArray(rawApproved);
      if (rawApproved !== undefined && (!Array.isArray(rawApproved) || approvedEvictions?.length !== rawApproved.length)) {
        return fail(res, 400, "approvedEvictions 必须是字符串数组");
      }
      const created = store.createPromptWithEvictions({
        title: asString(body.title) ?? "",
        body: text,
        tags: asStringArray(body.tags),
        summary: asString(body.summary),
        variables: requestVariables(body.variables),
      }, getSettings().maxPromptCount, approvedEvictions ?? []);
      return created
        ? ok(res, { ...created, prompt: versioned(created.prompt) })
        : fail(res, 409, "待淘汰的提示词已变化，请重试并重新确认");
    },
  },
  {
    method: "GET",
    pattern: "GET /prompts/:id",
    match: shape("prompts", null),
    handle: ({ res, seg }) => {
      const found = store.getPrompt(seg[1]!);
      return found ? ok(res, versioned(found)) : fail(res, 404, "提示词不存在");
    },
  },
  {
    method: "PUT",
    pattern: "PUT /prompts/:id",
    match: shape("prompts", null),
    handle: async ({ req, res, seg }) => {
      const id = seg[1]!;
      const body = await readBody(req, res);
      for (const field of ["skillName", "skillExportedAt"]) {
        if (Object.hasOwn(body, field)) return fail(res, 400, `${field} 只读，请使用技能导出`);
      }
      const patch: PromptWritablePatch = {};
      if (body.title !== undefined) patch.title = asString(body.title) ?? "";
      if (body.body !== undefined) {
        const text = asString(body.body);
        if (text === undefined) return fail(res, 400, "body 必须是字符串");
        // 与 POST /prompts 同一条非空口径（审查 2026-10-03 实测：PUT body:"" → 200 且正文落成
        // 空串，而 POST 同样入参是 400）——同一资源的两条写入口不得一条拒空、一条收空。
        if (!text) return fail(res, 400, "body 不能为空");
        patch.body = text;
      }
      if (body.tags !== undefined) patch.tags = asStringArray(body.tags) ?? [];
      if (body.summary !== undefined) patch.summary = asString(body.summary) ?? "";
      if (body.variables !== undefined) patch.variables = requestVariables(body.variables);
      const updated = store.updatePrompt(id, patch, {
        aiWriteBack: body.aiWriteBack === true,
        contentVersion: requestVersion(body.contentVersion),
      });
      return updated ? ok(res, versioned(updated)) : fail(res, 404, "提示词不存在");
    },
  },
  {
    method: "DELETE",
    pattern: "DELETE /prompts/:id",
    match: shape("prompts", null),
    handle: ({ res, seg }) =>
      store.deletePrompt(seg[1]!) ? ok(res, { deleted: true }) : fail(res, 404, "提示词不存在"),
  },
  {
    method: "POST",
    pattern: "POST /prompts/:id/use",
    match: shape("prompts", null, "use"),
    handle: ({ res, seg }) => {
      const used = store.recordUsage(seg[1]!);
      return used ? ok(res, versioned(used)) : fail(res, 404, "提示词不存在");
    },
  },
  {
    method: "POST",
    pattern: "POST /prompts/:id/rollback",
    match: shape("prompts", null, "rollback"),
    handle: async ({ req, res, seg }) => {
      const body = await readBody(req, res);
      const result = store.rollbackPrompt(seg[1]!, requestVersion(body.contentVersion));
      if (!result.ok) {
        return result.error === "提示词不存在"
          ? fail(res, 404, result.error)
          : fail(res, 400, result.error ?? "回滚失败");
      }
      return ok(res, versioned(result.prompt));
    },
  },

  // ── 标签 ────────────────────────────────────────────────────────────────
  { method: "GET", pattern: "GET /tags", match: shape("tags"), handle: ({ res }) => ok(res, store.listTags()) },
  {
    method: "POST",
    pattern: "POST /tags",
    match: shape("tags"),
    handle: async ({ req, res }) => {
      const body = await readBody(req, res);
      const name = asString(body.name);
      if (!name?.trim()) return fail(res, 400, "缺少 name");
      return ok(res, { name: store.createTag(name) });
    },
  },
  {
    method: "PUT",
    pattern: "PUT /tags/:from",
    match: shape("tags", null),
    handle: async ({ req, res, seg }) => {
      const body = await readBody(req, res);
      const to = asString(body.to);
      if (!to?.trim()) return fail(res, 400, "缺少 to");
      return ok(res, { affected: store.renameTag(seg[1]!, to) });
    },
  },
  {
    method: "DELETE",
    pattern: "DELETE /tags/:name",
    match: shape("tags", null),
    handle: ({ res, seg }) => {
      const result = store.deleteTag(seg[1]!);
      if (!result.deleted) {
        return result.inUse > 0
          ? fail(res, 400, `标签正在被 ${result.inUse} 条提示词使用，无法删除`)
          : fail(res, 404, "标签不存在");
      }
      return ok(res, result);
    },
  },

  // ── 回收站 ──────────────────────────────────────────────────────────────
  { method: "GET", pattern: "GET /trash", match: shape("trash"), handle: ({ res }) => ok(res, store.listTrash()) },
  {
    method: "POST",
    pattern: "POST /trash/:id/restore",
    match: shape("trash", null, "restore"),
    handle: ({ res, seg }) => {
      const restored = store.restorePrompts([seg[1]!]);
      return restored > 0 ? ok(res, { restored }) : fail(res, 404, "回收站中没有这条提示词");
    },
  },
  {
    method: "DELETE",
    pattern: "DELETE /trash",
    match: shape("trash"),
    handle: ({ res }) => {
      // T7 ⑦（修复轮 1）：`removed` 仍是**条数**（既有信封形状不破坏）；被删的 id 列表**新增**在 `ids`。
      // 客户端只能按宿主回执清 per-prompt meta —— 面板列出的 items 是打开那一刻的快照，清空与列表之间
      // 存在竞态窗口，窗口内新增的回收站行同样被删掉却不在快照里。`ids.length === removed`。
      const ids = store.emptyTrash();
      return ok(res, { removed: ids.length, ids });
    },
  },
  {
    method: "DELETE",
    pattern: "DELETE /trash/:id",
    match: shape("trash", null),
    handle: ({ res, seg }) => {
      const removed = store.deleteTrash([seg[1]!]);
      return removed > 0 ? ok(res, { removed }) : fail(res, 404, "回收站中没有这条提示词");
    },
  },

  // ── AI ──────────────────────────────────────────────────────────────────
  {
    method: "GET",
    pattern: "GET /ai/providers",
    match: shape("ai", "providers"),
    handle: async ({ res, trace, signal }) => ok(res, await ai.listAiSelectables(trace, signal)),
  },
  {
    method: "POST",
    pattern: "POST /ai/polish",
    match: shape("ai", "polish"),
    handle: async ({ req, res, trace, signal }) => {
      const body = await readBody(req, res, signal);
      const text = asString(body.body);
      if (!text?.trim()) return fail(res, 400, "缺少 body");
      const opts = { keepVariables: body.keepVariables !== false, trace, signal };
      // 成功分支归一为 data 形状（`{polished}`），不把能力层的 `ok:true` 泄进响应体。
      // 此前的 `body.withSummary === true` 变体已删（审查 #9）：唯一发送方 `client/utils/api.ts`
      // 恒传 false，那条分支连同它的 Core 在客户端不可达（死代码）；用途摘要由 `/ai/refine`
      // 的 summary 字段提供，UI 走的就是那条。
      const outcome = await ai.polishPromptBodyCore(text, getSettings(), opts).then((core) =>
        core.ok
          ? { ok: true as const, data: { polished: core.polished } }
          : { ok: false as const, code: core.code },
      );
      if (!outcome.ok) return failWithCode(res, 503, { code: outcome.code, message: devMessage(outcome.code) }, trace);
      return ok(res, outcome.data);
    },
  },
  {
    method: "POST",
    pattern: "POST /ai/check",
    match: shape("ai", "check"),
    handle: async ({ req, res, trace, signal }) => {
      const body = await readBody(req, res, signal);
      const text = asString(body.body);
      if (!text?.trim()) return fail(res, 400, "缺少 body");
      const draftContext = readDraftRequest(body.draftContext);
      if (body.draftContext !== undefined && (!draftContext || draftContext.revision)) {
        return fail(res, 400, "起草上下文格式不正确");
      }
      const checked = await ai.checkPromptCore(text, getSettings(), trace, signal, draftContext);
      if (!checked.ok) return failWithCode(res, 503, { code: checked.code, message: devMessage(checked.code) }, trace);
      return ok(res, checked.report);
    },
  },
  {
    method: "POST",
    pattern: "POST /ai/draft",
    match: shape("ai", "draft"),
    handle: async ({ req, res, trace, signal }) => {
      const request = readDraftRequest(await readBody(req, res, signal));
      if (!request) return fail(res, 400, "起草参数格式不正确");
      const result = await ai.draftPromptCore(request, getSettings(), trace, signal);
      if (!result.ok) return failWithCode(res, 503, { code: result.code, message: devMessage(result.code) }, trace);
      return ok(res, result.draft);
    },
  },
  {
    method: "POST",
    pattern: "POST /ai/draft/search",
    match: shape("ai", "draft", "search"),
    handle: async ({ req, res, trace, signal }) => {
      const query = asString((await readBody(req, res, signal)).query)?.trim();
      if (!query || query.length > 240) return fail(res, 400, "查询词为空或超长");
      return ok(res, await searchDraftSources(query, trace, signal));
    },
  },
  {
    method: "POST",
    pattern: "POST /ai/refine",
    match: shape("ai", "refine"),
    handle: async ({ req, res, trace, signal }) => {
      const body = await readBody(req, res, signal);
      const text = asString(body.body);
      if (!text?.trim()) return fail(res, 400, "缺少 body");
      const existingTags = store.listTags().map((t) => t.name);
      const refined = await ai.refinePromptCore(text, getSettings(), existingTags, { trace, signal });
      if (!refined.ok) return failWithCode(res, 503, { code: refined.code, message: devMessage(refined.code) }, trace);
      return ok(res, refined.refined);
    },
  },
  {
    method: "POST",
    pattern: "POST /ai/skill-descriptor",
    match: shape("ai", "skill-descriptor"),
    handle: async ({ req, res, trace, signal }) => {
      const body = await readBody(req, res, signal);
      const text = asString(body.body);
      if (!text?.trim()) return fail(res, 400, "缺少 body");
      const result = await ai.generateSkillDescriptor(
        {
          title: asString(body.title) ?? "",
          body: text,
          summary: asString(body.summary),
          tags: asStringArray(body.tags),
        },
        getSettings(),
        undefined,
        trace,
        signal,
      );
      return "desc" in result
        ? ok(res, result.desc)
        : failWithCode(res, 503, { code: result.fail, message: devMessage(result.fail) }, trace);
    },
  },

  // ── 设置 ────────────────────────────────────────────────────────────────
  { method: "GET", pattern: "GET /settings", match: shape("settings"), handle: ({ res }) => ok(res, getSettings()) },
  {
    method: "PUT",
    pattern: "PUT /settings",
    match: shape("settings"),
    handle: async ({ req, res }) => {
      if (!isSettingsAvailable()) return fail(res, 503, "设置服务不可用（宿主未提供 settings 服务）");
      const body = await readBody(req, res);
      const patch: Record<string, unknown> = {};
      for (const key of Object.keys(getSettings())) {
        if (body[key] !== undefined) patch[key] = body[key];
      }
      try {
        const next = await updateSettings(patch);
        // 设置改了 provider / 模型之后必须清路由缓存（规格 §6.2 的待修缺陷）
        clearRouteCache();
        return ok(res, next);
      } catch (e) {
        return fail(res, 400, "设置写入被拒绝：" + String(e));
      }
    },
  },

  // ── 导入导出 ────────────────────────────────────────────────────────────
  {
    method: "POST",
    pattern: "POST /export/save",
    match: shape("export", "save"),
    handle: async ({ req, res }) => {
      const body = await readBody(req, res);
      const dir = asString(body.dir);
      if (!dir) return fail(res, 400, "缺少 dir");
      if (!isAbsolute(dir)) return fail(res, 400, "dir 必须是绝对路径");
      if (!existsSync(dir) || !statSync(dir).isDirectory()) return fail(res, 400, "dir 不存在或不是目录");

      const backup = store.exportPrompts();
      const compact = JSON.stringify(backup);
      if (Buffer.byteLength(compact) + IMPORT_REQUEST_OVERHEAD > MAX_REQUEST_BODY_BYTES) {
        return fail(res, 400, `备份超过导入请求体上限（${MAX_REQUEST_BODY_BYTES} 字节），未写入文件`);
      }
      const pretty = JSON.stringify(backup, null, 2) + "\n";
      const contents = Buffer.byteLength(pretty) <= MAX_REQUEST_BODY_BYTES ? pretty : compact + "\n";
      const target = join(dir, `prompt-enhancer-backup-${stamp()}-${randomUUID()}.json`);
      try {
        writeNewBackup(target, contents);
      } catch (e) {
        return fail(res, 500, "写盘失败：" + String(e));
      }
      return ok(res, { path: target, prompts: backup.prompts.length, tags: backup.tags.length });
    },
  },
  {
    method: "POST",
    pattern: "POST /import",
    match: shape("import"),
    handle: async ({ req, res }) => {
      const body = await readBody(req, res);
      const result = store.importPrompts(body.backup, { confirm: body.confirm === true });
      return result.ok ? ok(res, result) : fail(res, 400, result.error ?? "导入被拒绝");
    },
  },

  // ── meta（模板变量记忆）─────────────────────────────────────────────────
  {
    method: "GET",
    pattern: "GET /meta/:key",
    match: shape("meta", null),
    handle: ({ res, seg }) => ok(res, { key: seg[1], value: store.getMetaValue(seg[1]!) }),
  },
  {
    method: "PUT",
    pattern: "PUT /meta/:key",
    match: shape("meta", null),
    handle: async ({ req, res, seg }) => {
      const body = await readBody(req, res);
      const value = asString(body.value);
      if (value === undefined) return fail(res, 400, "缺少 value");
      store.setMetaValue(seg[1]!, value);
      return ok(res, { key: seg[1], value });
    },
  },
  {
    method: "DELETE",
    pattern: "DELETE /meta/:key",
    match: shape("meta", null),
    handle: ({ res, seg }) => {
      /**
       * DELETE（T6 / O-1）：清键通道。**通用形态**——宿主不认识 `pl:` 这类客户端键名约定，
       * 也不做任何特判（键名归客户端，写进宿主就是两处耦合）。**幂等**：键不存在同样回 200，
       * `deleted` 只如实说明这次是否真的删掉了行。
       *
       * 客户端只在**不可逆删除点**（单条永久删除 / 清空回收站）用它清 per-prompt 残键；
       * **软删除（进回收站）绝不清**——回收站可恢复且复用同一 id，清了键会让「删除 → 恢复」重演 I-1。
       */
      return ok(res, { key: seg[1], deleted: store.deleteMetaValue(seg[1]!) });
    },
  },

  // ── 技能导出 ────────────────────────────────────────────────────────────
  {
    method: "POST",
    pattern: "POST /skills/export",
    match: shape("skills", "export"),
    handle: async ({ req, res }) => {
      const body = await readBody(req, res);
      const promptId = asString(body.promptId);
      if (!promptId) return fail(res, 400, "缺少 promptId");
      const descriptor = requestSkillDescriptor(body.descriptor);
      const candidate = asString(body.name) ?? descriptor?.name ?? "";
      const confirmation = asString(body.conflictToken);
      const updated = store.recordSkillExport(promptId, candidate, ({ prompt, name, owned, competingClaims }) => {
        const file = skills.skillFileVersion(name);
        const conflicts = competingClaims.length > 0 || (!owned && file !== undefined);
        if (conflicts) {
          const state = [prompt.id, store.promptContentVersion(prompt), prompt.skillName, prompt.skillExportedAt,
            name, descriptor, competingClaims, file];
          const token = createHmac("sha256", skillConflictKey).update(JSON.stringify(state)).digest("hex");
          if (confirmation !== token) {
            const message = confirmation === undefined ? "同名技能覆盖需要确认" : "技能冲突已变化，请重新发起导出";
            throw new SkillConflict(message, { name, token });
          }
        } else if (confirmation !== undefined) {
          throw new SkillConflict("技能冲突已变化，请重新发起导出");
        }
        const result = skills.exportSkill({
          prompt, name, descriptor, ownerPromptId: owned ? prompt.id : undefined, conflictConfirmed: conflicts,
        });
        if (result.ok) return;
        const message = result.error ?? "导出失败";
        if (result.conflict) throw new SkillConflict(message);
        throw new BadRequest(message);
      });
      if (!updated.ok) {
        return updated.error === "not-found"
          ? fail(res, 404, "提示词不存在")
          : fail(res, 400, "技能名非法：需要小写 kebab-case");
      }
      return ok(res, { name: updated.name, path: skills.skillFilePath(updated.name), prompt: versioned(updated.prompt) });
    },
  },
];

// ── 分发 ───────────────────────────────────────────────────────────────────

async function dispatch(req: IncomingMessage, res: ServerResponse, lifetime?: AbortSignal): Promise<void> {
  const method = (req.method ?? "GET").toUpperCase();
  const url = new URL(req.url ?? "/", "http://localhost");
  const seg = segments(url.pathname);

  // 写方法先过跨源闸：GET/HEAD/OPTIONS 无副作用，不挡（跨源 GET 的响应本来也读不到，
  // 有 CORS 兜着）；写方法在触库/触模型之前就拒，连请求体都不读。
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS" && isCrossSiteWrite(req)) {
    console.error(
      "[prompt-enhancer] 已拒绝跨源写请求 " + method + " " + url.pathname
        + "（Origin: " + String(req.headers.origin) + " / Host: " + String(req.headers.host) + "）",
    );
    return fail(res, 403, "跨源写入被拒绝（本插件的写接口只接受同源请求）");
  }

  let trace: ReviewTrace | undefined;
  let requestCancellation: AbortController | undefined;
  const onClose = () => {
    if (!res.writableFinished && !requestCancellation?.signal.aborted) {
      trace?.("request-cancelled");
      requestCancellation?.abort();
    }
  };
  try {
    for (const route of ROUTE_SPECS) {
      if (route.method !== method || !route.match(seg)) continue;
      if (seg[0] === "ai") {
        trace = startReviewTrace(seg.slice(1).join("/"));
        trace("request-start");
        requestCancellation = new AbortController();
        res.once?.("close", onClose);
        if (res.destroyed) onClose();
        const signal = lifetime ? AbortSignal.any([lifetime, requestCancellation.signal]) : requestCancellation.signal;
        signal.throwIfAborted();
        return await route.handle({ req, res, seg, url, trace, signal });
      }
      return await route.handle({ req, res, seg, url });
    }
    return fail(res, 404, `no route ${method} ${url.pathname}`);
  } catch (e) {
    if (requestCancellation?.signal.aborted) return;
    if (requestCancellation && lifetime?.aborted) return failWithCode(res, 503, { code: "no-llm" }, trace);
    if (e instanceof BadRequest) return fail(res, 400, e.message);
    if (e instanceof SkillConflict) return json(res, 409, { ok: false, error: { message: e.message, conflict: e.conflict } });
    if (e instanceof store.PromptConflict) return fail(res, 409, e.message);
    if (trace) trace("request-threw", { code: safeErrorCode(e) });
    else console.error("[prompt-enhancer] 未预期错误 " + method + " " + url.pathname, e);
    return fail(res, 500, "internal error");
  } finally {
    if (requestCancellation) res.off?.("close", onClose);
    trace?.("request-end", { httpStatus: res.statusCode, connectionClosed: res.destroyed === true });
  }
}

/** 构造注册用的路由数组（单条 prefix 路由）。 */
export function makeRoutes(lifetime?: AbortSignal): PromptEnhancerRoute[] {
  return [{ kind: "prefix", path: API_PREFIX, handler: (req, res) => dispatch(req, res, lifetime) }];
}
