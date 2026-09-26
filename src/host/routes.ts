/**
 * Host HTTP API：单条 prefix 路由 + 手写分发（规格 §5，共 27 条逻辑路由）。
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
 * 状态码：400 参数错误 / 404 未找到 / 409 同名冲突需确认 / 503 AI 或设置服务不可用 / 500 未预期异常。
 */
import { existsSync, statSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { isAbsolute, join } from "node:path";
import * as ai from "./ai.ts";
import * as skills from "./skills.ts";
import * as store from "./store.ts";
import { clearRouteCache } from "./ai.ts";
import { getSettings, isSettingsAvailable, updateSettings } from "./settings.ts";
import { API_PREFIX, type PromptSort, type PromptWritablePatch } from "../types.ts";

/** 路由注册对象（与 `@deepseek-ai/dsh-host-webserver` 的 `WebRoute` 对齐）。 */
export interface PromptEnhancerRoute {
  kind: "prefix";
  path: string;
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
}

/** 请求体不是合法 JSON / 参数缺失时抛出，由分发层映射成 400。 */
class BadRequest extends Error {}

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
): void {
  json(res, status, { ok: false, error });
}

/** 组装开发诊断 message：非 __DEV__ 构建恒为 undefined（宿主零用户文案）。 */
function devMessage(detail: string): string | undefined {
  return __DEV__ ? detail : undefined;
}

/** 请求体体积上限（5 MB）：提示词正文与导入备份都远小于此；防超大 POST 打满宿主进程内存。 */
const MAX_BODY_BYTES = 5 * 1024 * 1024;

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.from(chunk as Uint8Array);
    total += buf.length;
    if (total > MAX_BODY_BYTES) {
      req.destroy(); // 掐断上传：超限后不再让字节继续流入
      throw new BadRequest("请求体超过上限（" + MAX_BODY_BYTES + " 字节）");
    }
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
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

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : undefined;
}

/**
 * 有限数字才收：typeof NaN === "number" 为真，须用 Number.isFinite 显式排除 NaN/Infinity
 * ——否则直进 SQL 绑定，要么抛错变意外 500，要么落 NULL 被 ?? 0 静默归零。
 */
function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
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

/** 导出文件名用的时间戳（本地时区）。 */
function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// ── 分发 ───────────────────────────────────────────────────────────────────

async function dispatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = (req.method ?? "GET").toUpperCase();
  const url = new URL(req.url ?? "/", "http://localhost");
  const seg = segments(url.pathname);
  const [a, b, c] = seg;

  try {
    // ── 提示词 ────────────────────────────────────────────────────────────
    if (method === "GET" && seg.length === 1 && a === "prompts") {
      const sort = url.searchParams.get("sort") ?? undefined;
      const allowed: PromptSort[] = ["default", "updated", "used", "created"];
      if (sort !== undefined && !allowed.includes(sort as PromptSort)) {
        return fail(res, 400, `sort 只能是 ${allowed.join(" / ")}`);
      }
      return ok(res, store.listPrompts({
        q: url.searchParams.get("q") ?? undefined,
        tag: url.searchParams.get("tag") ?? undefined,
        sort: sort as PromptSort | undefined,
      }));
    }

    if (method === "POST" && seg.length === 1 && a === "prompts") {
      const body = await readBody(req);
      const text = asString(body.body);
      if (!text) return fail(res, 400, "缺少 body");
      const created = store.createPrompt({
        title: asString(body.title) ?? "",
        body: text,
        tags: asStringArray(body.tags),
        summary: asString(body.summary),
      });
      // 超限淘汰按设置里的上限（上限不在 store 内读取：store 保持纯模块）。
      // R45：把刚创建的那条豁免出去——落库次序是「先 createPrompt 再淘汰」，新项的键
      // (aiRefined=false, lastUsedAt=0) 是候选最小元，不豁免就会把刚保存的那条物理删除，
      // 而客户端的二次确认只看得见插入前的集合（D-1：确认框撒谎 + 刚保存的记录被静默销毁）。
      const evicted = store.enforceMaxCount(getSettings().maxPromptCount, { exceptId: created.id });
      return ok(res, { prompt: created, evicted });
    }

    if (seg.length === 2 && a === "prompts") {
      const id = b!;
      if (method === "GET") {
        const found = store.getPrompt(id);
        return found ? ok(res, found) : fail(res, 404, "提示词不存在");
      }
      if (method === "PUT") {
        const body = await readBody(req);
        const patch: PromptWritablePatch = {};
        if (body.title !== undefined) patch.title = asString(body.title) ?? "";
        if (body.body !== undefined) {
          const text = asString(body.body);
          if (text === undefined) return fail(res, 400, "body 必须是字符串");
          patch.body = text;
        }
        if (body.tags !== undefined) patch.tags = asStringArray(body.tags) ?? [];
        if (body.summary !== undefined) patch.summary = asString(body.summary) ?? "";
        if (body.skillName !== undefined) patch.skillName = asString(body.skillName);
        if (body.skillExportedAt !== undefined) {
          const at = asFiniteNumber(body.skillExportedAt);
          if (at === undefined) return fail(res, 400, "skillExportedAt 必须是有限数字");
          patch.skillExportedAt = at;
        }
        const updated = store.updatePrompt(id, patch, { aiWriteBack: body.aiWriteBack === true });
        return updated ? ok(res, updated) : fail(res, 404, "提示词不存在");
      }
      if (method === "DELETE") {
        return store.deletePrompt(id) ? ok(res, { deleted: true }) : fail(res, 404, "提示词不存在");
      }
    }

    if (method === "POST" && seg.length === 3 && a === "prompts" && c === "use") {
      const used = store.recordUsage(b!);
      return used ? ok(res, used) : fail(res, 404, "提示词不存在");
    }

    if (method === "POST" && seg.length === 3 && a === "prompts" && c === "rollback") {
      const result = store.rollbackPrompt(b!);
      if (!result.ok) {
        return result.error === "提示词不存在"
          ? fail(res, 404, result.error)
          : fail(res, 400, result.error ?? "回滚失败");
      }
      return ok(res, result.prompt);
    }

    // ── 标签 ──────────────────────────────────────────────────────────────
    if (method === "GET" && seg.length === 1 && a === "tags") {
      return ok(res, store.listTags());
    }

    if (method === "POST" && seg.length === 1 && a === "tags") {
      const body = await readBody(req);
      const name = asString(body.name);
      if (!name?.trim()) return fail(res, 400, "缺少 name");
      return ok(res, { name: store.createTag(name) });
    }

    if (method === "PUT" && seg.length === 2 && a === "tags") {
      const body = await readBody(req);
      const to = asString(body.to);
      if (!to?.trim()) return fail(res, 400, "缺少 to");
      return ok(res, { affected: store.renameTag(b!, to) });
    }

    if (method === "DELETE" && seg.length === 2 && a === "tags") {
      const result = store.deleteTag(b!);
      if (!result.deleted) {
        return result.inUse > 0
          ? fail(res, 400, `标签正在被 ${result.inUse} 条提示词使用，无法删除`)
          : fail(res, 404, "标签不存在");
      }
      return ok(res, result);
    }

    // ── 回收站 ────────────────────────────────────────────────────────────
    if (method === "GET" && seg.length === 1 && a === "trash") {
      return ok(res, store.listTrash());
    }

    if (method === "POST" && seg.length === 3 && a === "trash" && c === "restore") {
      const restored = store.restorePrompts([b!]);
      return restored > 0 ? ok(res, { restored }) : fail(res, 404, "回收站中没有这条提示词");
    }

    if (method === "DELETE" && seg.length === 1 && a === "trash") {
      // T7 ⑦（修复轮 1）：`removed` 仍是**条数**（既有信封形状不破坏）；被删的 id 列表**新增**在 `ids`。
      // 客户端只能按宿主回执清 per-prompt meta —— 面板列出的 items 是打开那一刻的快照，清空与列表之间
      // 存在竞态窗口，窗口内新增的回收站行同样被删掉却不在快照里。`ids.length === removed`。
      const ids = store.emptyTrash();
      return ok(res, { removed: ids.length, ids });
    }

    if (method === "DELETE" && seg.length === 2 && a === "trash") {
      const removed = store.deleteTrash([b!]);
      return removed > 0 ? ok(res, { removed }) : fail(res, 404, "回收站中没有这条提示词");
    }

    // ── AI ────────────────────────────────────────────────────────────────
    if (method === "GET" && seg.length === 2 && a === "ai" && b === "providers") {
      return ok(res, await ai.listAiSelectables());
    }

    if (method === "POST" && seg.length === 2 && a === "ai" && b === "polish") {
      const body = await readBody(req);
      const text = asString(body.body);
      if (!text?.trim()) return fail(res, 400, "缺少 body");
      const opts = { keepVariables: body.keepVariables !== false };
      // 两条 Core 都可能失败；成功分支归一为旧 data 形状（`{polished}` / `{polished, summary?}`，
      // 不把能力层的 `ok:true` 泄进响应体——客户端按 data 形状消费）。
      const outcome = body.withSummary === true
        ? await ai.polishPromptBodyWithSummaryCore(text, getSettings(), opts).then((core) =>
            core.ok
              ? { ok: true as const, data: core.summary === undefined ? { polished: core.polished } : { polished: core.polished, summary: core.summary } }
              : { ok: false as const, code: core.code },
          )
        : await ai.polishPromptBodyCore(text, getSettings(), opts).then((core) =>
            core.ok
              ? { ok: true as const, data: { polished: core.polished } }
              : { ok: false as const, code: core.code },
          );
      if (!outcome.ok) return failWithCode(res, 503, { code: outcome.code, message: devMessage(outcome.code) });
      return ok(res, outcome.data);
    }

    if (method === "POST" && seg.length === 2 && a === "ai" && b === "refine") {
      const body = await readBody(req);
      const text = asString(body.body);
      if (!text?.trim()) return fail(res, 400, "缺少 body");
      const existingTags = store.listTags().map((t) => t.name);
      const refined = await ai.refinePromptCore(text, getSettings(), existingTags);
      if (!refined.ok) return failWithCode(res, 503, { code: refined.code, message: devMessage(refined.code) });
      return ok(res, refined.refined);
    }

    if (method === "POST" && seg.length === 2 && a === "ai" && b === "skill-descriptor") {
      const body = await readBody(req);
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
      );
      return "desc" in result
        ? ok(res, result.desc)
        : failWithCode(res, 503, { code: result.fail, message: devMessage(result.fail) });
    }

    // ── 设置 ──────────────────────────────────────────────────────────────
    if (method === "GET" && seg.length === 1 && a === "settings") {
      return ok(res, getSettings());
    }

    if (method === "PUT" && seg.length === 1 && a === "settings") {
      if (!isSettingsAvailable()) return fail(res, 503, "设置服务不可用（宿主未提供 settings 服务）");
      const body = await readBody(req);
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
    }

    // ── 导入导出 ──────────────────────────────────────────────────────────
    if (method === "POST" && seg.length === 2 && a === "export" && b === "save") {
      const body = await readBody(req);
      const dir = asString(body.dir);
      if (!dir) return fail(res, 400, "缺少 dir");
      if (!isAbsolute(dir)) return fail(res, 400, "dir 必须是绝对路径");
      if (!existsSync(dir) || !statSync(dir).isDirectory()) return fail(res, 400, "dir 不存在或不是目录");

      const backup = store.exportPrompts();
      // 文件名由服务端生成：不让客户端指定任意路径，也顺带避免覆盖同名文件
      const target = join(dir, `prompt-enhancer-backup-${stamp()}.json`);
      try {
        writeFileSync(target, JSON.stringify(backup, null, 2) + "\n", "utf8");
      } catch (e) {
        return fail(res, 500, "写盘失败：" + String(e));
      }
      return ok(res, { path: target, prompts: backup.prompts.length, tags: backup.tags.length });
    }

    if (method === "POST" && seg.length === 1 && a === "import") {
      const body = await readBody(req);
      const result = store.importPrompts(body.backup, { confirm: body.confirm === true });
      return result.ok ? ok(res, result) : fail(res, 400, result.error ?? "导入被拒绝");
    }

    // ── meta（模板变量记忆）───────────────────────────────────────────────
    if (seg.length === 2 && a === "meta") {
      if (method === "GET") return ok(res, { key: b, value: store.getMetaValue(b!) });
      if (method === "PUT") {
        const body = await readBody(req);
        const value = asString(body.value);
        if (value === undefined) return fail(res, 400, "缺少 value");
        store.setMetaValue(b!, value);
        return ok(res, { key: b, value });
      }
      /**
       * DELETE（T6 / O-1）：清键通道。**通用形态**——宿主不认识 `pl:` 这类客户端键名约定，
       * 也不做任何特判（键名归客户端，写进宿主就是两处耦合）。**幂等**：键不存在同样回 200，
       * `deleted` 只如实说明这次是否真的删掉了行。
       *
       * 客户端只在**不可逆删除点**（单条永久删除 / 清空回收站）用它清 per-prompt 残键；
       * **软删除（进回收站）绝不清**——回收站可恢复且复用同一 id，清了键会让「删除 → 恢复」重演 I-1。
       */
      if (method === "DELETE") return ok(res, { key: b, deleted: store.deleteMetaValue(b!) });
    }

    // ── 技能导出 ──────────────────────────────────────────────────────────
    if (method === "POST" && seg.length === 2 && a === "skills" && b === "export") {
      const body = await readBody(req);
      const promptId = asString(body.promptId);
      if (!promptId) return fail(res, 400, "缺少 promptId");
      const prompt = store.getPrompt(promptId);
      if (!prompt) return fail(res, 404, "提示词不存在");

      const descriptor =
        typeof body.descriptor === "object" && body.descriptor !== null
          ? (body.descriptor as ai.SkillDescriptor)
          : undefined;
      /**
       * 名字候选序（A / 重要-1）：**已导出条目（`skillName` 非空）的目录名只能由 `skillName` 决定**。
       * 它是这个技能在官方根下的**身份**，`body.name` / `descriptor.name` 只在**首次导出**
       * （`skillName` 为空）时参与。这条不变量**必须落在权威层**：客户端只是「尽量说对」，
       * 任何入口（同一次会话里的陈旧列表 / 徽标重导 / 旧版本页面）都可能送来一个与库里不一致的
       * 名字，只有这里能保证「旧目录不会变成无主孤儿、下次对旧名 409」——与 R55 的教训同形
       * （承重不变量放权威层，而不是在每个调用点的边沿上）。
       * 空白串不算名字（与客户端 `exportNameLocked` 同口径）：只判「非 undefined」会把 `"  "`
       * 当成锁定名，`toKebab` 之后算出空名 ⇒ 400。
       */
      const locked = prompt.skillName !== undefined && prompt.skillName.trim() !== "" ? prompt.skillName : undefined;
      const name = skills.toKebab(locked ?? asString(body.name) ?? descriptor?.name ?? "");
      if (!skills.isValidSkillName(name)) return fail(res, 400, "技能名非法：需要小写 kebab-case");

      /**
       * 目录归属：查库看这个技能名是否属于本插件的某条提示词（P3-D8）。
       *
       * **自持优先（T7-2 / P7 §10.4-2）**：先认**自己**（本次导出的这条），再认别人。
       * 两条提示词 `skillName` 相同是**可达状态**（同名目录确认后覆盖 / 导入备份），普通 `find`
       * 取的是**首条**——首条不是本条时，本插件自己的目录就被判成「用户手写的」，对自有目录**误报 409**
       * （用户被迫确认覆盖自己的技能，或干脆导不出去）。自持优先把这个窄口封在查询里：
       * 只要这条提示词自己就是这个技能名的归属者，归属判定必须落在它身上。
       */
      const all = store.listPrompts();
      const owner = all.find((x) => x.skillName === name && x.id === promptId) ?? all.find((x) => x.skillName === name);
      const result = skills.exportSkill({
        prompt,
        name,
        descriptor,
        ownerPromptId: owner?.id,
        conflictConfirmed: body.conflictConfirmed === true,
      });
      if (!result.ok) {
        // 409 专用于「同名目录不属于本插件」——前端据此弹确认后再带 conflictConfirmed 重试
        return fail(res, result.conflict ? 409 : 400, result.error ?? "导出失败");
      }
      const updated = store.updatePrompt(promptId, {
        skillName: result.name,
        skillExportedAt: Date.now(),
      });
      return ok(res, { name: result.name, path: result.path, prompt: updated });
    }

    return fail(res, 404, `no route ${method} ${url.pathname}`);
  } catch (e) {
    if (e instanceof BadRequest) return fail(res, 400, e.message);
    console.error("[prompt-enhancer] 未预期错误 " + method + " " + url.pathname, e);
    return fail(res, 500, "internal error");
  }
}

/** 构造注册用的路由数组（单条 prefix 路由）。 */
export function makeRoutes(): PromptEnhancerRoute[] {
  return [{ kind: "prefix", path: API_PREFIX, handler: dispatch }];
}
