/**
 * Host HTTP API：单条 prefix 路由 + 手写分发（规格 §5，共 27 条逻辑路由）。
 *
 * 本文件是**薄路由层**：只做「解析请求 → 调 store / ai / skills / settings → 组装信封 → 错误映射」，
 * 业务语义全部在各自模块里且已有测试。响应信封固定 `{ ok, data?, error? }`——
 * 客户端以 `data === undefined` 判失败，故此约定不可改。
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
import { API_PREFIX, type PromptPatch, type PromptSort } from "../types.ts";

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

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk as Uint8Array));
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
        const patch: PromptPatch = {};
        if (body.title !== undefined) patch.title = asString(body.title) ?? "";
        if (body.body !== undefined) {
          const text = asString(body.body);
          if (text === undefined) return fail(res, 400, "body 必须是字符串");
          patch.body = text;
        }
        if (body.tags !== undefined) patch.tags = asStringArray(body.tags) ?? [];
        if (body.summary !== undefined) patch.summary = asString(body.summary) ?? "";
        if (body.skillName !== undefined) patch.skillName = asString(body.skillName);
        if (body.skillExportedAt !== undefined && typeof body.skillExportedAt === "number") {
          patch.skillExportedAt = body.skillExportedAt;
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
      return ok(res, { removed: store.emptyTrash() });
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
      const result =
        body.withSummary === true
          ? await ai.polishPromptBodyWithSummary(text, getSettings(), opts)
          : await ai.polishPromptBody(text, getSettings(), opts).then((polished) =>
              polished === undefined ? undefined : { polished },
            );
      if (result === undefined) return fail(res, 503, "AI 不可用或调用失败（请检查模型设置）");
      return ok(res, result);
    }

    if (method === "POST" && seg.length === 2 && a === "ai" && b === "refine") {
      const body = await readBody(req);
      const text = asString(body.body);
      if (!text?.trim()) return fail(res, 400, "缺少 body");
      const existingTags = store.listTags().map((t) => t.name);
      const refined = await ai.refinePrompt(text, getSettings(), existingTags);
      return refined ? ok(res, refined) : fail(res, 503, "AI 不可用或调用失败（请检查模型设置）");
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
        : fail(res, 503, `AI 生成技能描述失败（${result.fail}）`);
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
      const name = skills.toKebab(asString(body.name) ?? descriptor?.name ?? prompt.skillName ?? "");
      if (!skills.isValidSkillName(name)) return fail(res, 400, "技能名非法：需要小写 kebab-case");

      // 目录归属：查库看这个技能名是否属于本插件的某条提示词（P3-D8）
      const owner = store.listPrompts().find((p) => p.skillName === name);
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
