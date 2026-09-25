/**
 * 存储层：`node:sqlite` 4 表 + 全部存储函数（规格 §4.1 / §4.4）。
 *
 * 设计约束（见 P2 计划）：
 * - **纯模块**：零宿主依赖（不 import cordis / 任何服务），可脱离 dsh 单测。
 * - **全部函数同步**：`node:sqlite` 本身就是同步 API（P2-D11）。
 * - **路径调用期求值**：db 路径每次经 `paths.dbPath()` 解析，测试用自己的进程 + 临时
 *   `DSH_HOME` 隔离，生产代码不含任何 test-only API（P2-D1）。
 * - **无迁移**：v1 的 DDL 即终态；`MIGRATIONS` 是 v2 的接缝，顺序固定为
 *   「建表 → 索引 → 迁移 → 标签同步 → 播种」，全部同步完成（P2-D5）。
 * - 错误处理：可恢复的数据异常走 `console.warn`（可见），不可恢复的写失败**重抛**。
 */
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { createDatabase } from "./node-sqlite.ts";
import { dbPath } from "./paths.ts";
import { compareEvictionOrder } from "../eviction-order.ts";
import {
  BACKUP_VERSION,
  SCHEMA_VERSION,
  clampTitle,
  type ImportResult,
  type ImportStats,
  type ListPromptsOptions,
  type Prompt,
  type PromptBackup,
  type PromptInput,
  type PromptPatch,
  type PromptSort,
  type RollbackResult,
  type TrashItem,
} from "../types.ts";

// ── 行类型（sqlite 的列都是宽类型）─────────────────────────────────────────

interface PromptRow {
  id: string;
  title: string;
  body: string;
  tags: string | null;
  summary: string | null;
  sourceBody: string | null;
  aiRefined: number;
  aiRefinedAt: number;
  createdAt: number;
  updatedAt: number;
  usageCount: number;
  lastUsedAt: number;
  skillName: string | null;
  skillExportedAt: number;
}

interface TrashRow extends PromptRow {
  deletedAt: number;
}

interface TagRow {
  name: string;
  createdAt: number;
}

// ── 连接与惰性初始化 ───────────────────────────────────────────────────────

let db: DatabaseSync | undefined;

/**
 * 迁移接缝：在建表之后、播种之前**同步**执行（顺序固定，见 P2-D5）。
 *
 * v1 不需要任何迁移——规格 §4.3 明确不做旧库/旧 JSON 自动迁移（老用户走「旧插件导出 → 新插件导入」），
 * 因此上游那个「迁移 fire-and-forget + 播种在前」的顺序缺陷在本项目结构上不可能发生。
 * v2 起承担真实迁移：见 `migrateTrashSkillColumns`。
 */
const MIGRATIONS: Array<(cur: DatabaseSync) => void> = [migrateTrashSkillColumns];

/**
 * v1 → v2：回收站补 `skillName` / `skillExportedAt` 两列。
 *
 * 规格 §4.1 的 trash DDL 原本没有这两列，于是「软删除 → 恢复」会丢掉「已导出的技能」记录：
 * 恢复后徽标变成「从未导出」，再次导出会留下一个重复的技能目录，而旧技能仍在聊天里被触发。
 * 经用户 2026-09-24 决定补列（见规格 §13.5）。
 *
 * 先探测再 ALTER（幂等）：SQLite 的 `ADD COLUMN` 没有 `IF NOT EXISTS`，而「执行失败就吞掉」
 * 会把真实的迁移失败一并掩盖——所以这里只容忍「列已存在」这一种情况。
 */
function migrateTrashSkillColumns(cur: DatabaseSync): void {
  const existing = new Set(
    (cur.prepare("PRAGMA table_info(trash)").all() as unknown as Array<{ name: string }>).map((r) => r.name),
  );
  if (!existing.has("skillName")) cur.exec("ALTER TABLE trash ADD COLUMN skillName TEXT;");
  if (!existing.has("skillExportedAt")) {
    cur.exec("ALTER TABLE trash ADD COLUMN skillExportedAt INTEGER NOT NULL DEFAULT 0;");
  }
}

/** 新建提示词「置顶」的新鲜度窗口（默认排序用）。 */
const FRESH_MS = 7 * 24 * 60 * 60 * 1000;

function getDb(): DatabaseSync {
  if (db) return db;
  const file = dbPath();
  mkdirSync(dirname(file), { recursive: true });
  const cur = createDatabase(file);
  initDb(cur);
  db = cur;
  return cur;
}

function initDb(cur: DatabaseSync): void {
  try {
    cur.exec("PRAGMA journal_mode = WAL;");
  } catch (e) {
    // 某些文件系统/沙箱不支持 WAL：降级为默认 journal 模式，但必须留下可见痕迹（不停机）。
    console.warn("[prompt-enhancer] 无法启用 WAL，已降级为默认 journal 模式：" + String(e));
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

  cur.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run("schemaVersion", String(SCHEMA_VERSION));

  for (const migrate of MIGRATIONS) migrate(cur);

  syncTagsFromPrompts(cur);
  seedDefaultPromptIfEmpty(cur);
}

// ── 行映射 ─────────────────────────────────────────────────────────────────

/**
 * 归一 + 映射。先 `{ ...row }` 展开是**必须**的：
 * `node:sqlite` 返回的行是 null-prototype 对象，直接传播会让下游的
 * `assert.deepEqual(row, {...})` 与 `Object.prototype` 方法全部失效。
 */
function rowToPrompt(row: PromptRow): Prompt {
  const r = { ...row };
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    tags: parseTags(r.tags),
    summary: r.summary ?? undefined,
    sourceBody: r.sourceBody ?? undefined,
    aiRefined: r.aiRefined === 1,
    aiRefinedAt: r.aiRefinedAt ?? 0,
    createdAt: r.createdAt ?? 0,
    updatedAt: r.updatedAt ?? 0,
    usageCount: r.usageCount ?? 0,
    lastUsedAt: r.lastUsedAt ?? 0,
    skillName: r.skillName ?? undefined,
    skillExportedAt: r.skillExportedAt ?? 0,
  };
}

function rowToTrash(row: TrashRow): TrashItem {
  return { ...rowToPrompt(row), deletedAt: row.deletedAt };
}

function parseTags(text: string | null): string[] {
  if (!text) return [];
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t): t is string => typeof t === "string");
  } catch (e) {
    console.warn("[prompt-enhancer] tags 列内容不是合法 JSON，已按空数组处理：" + String(e));
    return [];
  }
}

/** 空数组恒存 `'[]'` 而不是 NULL（P2-D6）。 */
function tagsToJson(tags: string[]): string {
  return tags.length > 0 ? JSON.stringify(tags) : "[]";
}

function normalizeTagName(name: string): string {
  return name.trim();
}

function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags) return [];
  const out: string[] = [];
  for (const raw of tags) {
    const name = normalizeTagName(raw);
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

// ── 标签字典（内部）────────────────────────────────────────────────────────

/**
 * 用**传入的连接**确保标签存在。
 *
 * ⚠️ 刻意不接受「无参调用」：上游 `ensureTag()` 内部重新进入 `getDb()`，而 `getDb()`
 * 又会走播种/标签同步 → 再调 `ensureTag()` → **无限递归**（规格 §12 明确要求修）。
 * 这里把连接作为必填参数，使该缺陷在结构上无法复现。
 */
function ensureTagWith(cur: DatabaseSync, name: string): void {
  const tag = normalizeTagName(name);
  if (!tag) return;
  cur.prepare("INSERT OR IGNORE INTO tags (name, createdAt) VALUES (?, ?)").run(tag, Date.now());
}

function ensureTagsWith(cur: DatabaseSync, names: string[]): void {
  for (const name of names) ensureTagWith(cur, name);
}

/** 把 `prompts.tags` 里的标签补进字典表（幂等）。 */
function syncTagsFromPrompts(cur: DatabaseSync): void {
  const rows = cur.prepare("SELECT tags FROM prompts").all() as unknown as Array<{ tags: string | null }>;
  const names = new Set<string>();
  for (const row of rows) for (const t of parseTags(row.tags)) names.add(t);
  for (const name of names) ensureTagWith(cur, name);
}

function countTagUsage(name: string): number {
  const rows = selectAllPrompts();
  let n = 0;
  for (const row of rows) if (parseTags(row.tags).includes(name)) n++;
  return n;
}

// ── 播种 ───────────────────────────────────────────────────────────────────

/** 空库首启播种 1 条中文欢迎提示词（P2-D4：不读 `settings.yaml` 的 locale）。 */
function seedDefaultPromptIfEmpty(cur: DatabaseSync): void {
  const row = cur.prepare("SELECT COUNT(*) AS c FROM prompts").get() as { c: number } | undefined;
  if ((row?.c ?? 0) > 0) return;

  const now = Date.now();
  const prompt: Prompt = {
    id: randomUUID(),
    title: "欢迎使用提示词增强",
    body: [
      "这是你保存的第一条提示词，也是本插件的上手引导。",
      "",
      "你可以这样使用它：",
      "· 在输入框旁打开词库，插入 / 覆盖 / 插入并发送常用提示词；",
      "· 输入 # 触发实时筛选，快速挑一条；",
      "· 选中聊天里的文字，或把当前草稿一键存为提示词；",
      "· 用 AI 优化润色正文，并随时在「原文 ↔ 优化稿」之间切换。",
      "",
      "也可以直接编辑这条提示词，换成你自己的内容。",
    ].join("\n"),
    tags: ["欢迎"],
    aiRefined: false,
    aiRefinedAt: 0,
    createdAt: now,
    updatedAt: now,
    usageCount: 0,
    lastUsedAt: 0,
    skillExportedAt: 0,
  };
  cur.prepare(
    `INSERT INTO prompts
       (id, title, body, tags, summary, sourceBody, aiRefined, aiRefinedAt, createdAt, updatedAt, usageCount, lastUsedAt, skillName, skillExportedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    prompt.id, prompt.title, prompt.body, tagsToJson(prompt.tags), null, null,
    0, 0, now, now, 0, 0, null, 0,
  );
  // 播种必须**自己**把标签同步进字典表（上游同样是这么做的，也是 N7 的顺序要求）。
  syncTagsFromPrompts(cur);
}

// ── 行读写（内部）──────────────────────────────────────────────────────────

const PROMPT_COLUMNS = "id, title, body, tags, summary, sourceBody, aiRefined, aiRefinedAt, createdAt, updatedAt, usageCount, lastUsedAt, skillName, skillExportedAt";

function selectAllPrompts(): PromptRow[] {
  return getDb().prepare(`SELECT ${PROMPT_COLUMNS} FROM prompts`).all() as unknown as PromptRow[];
}

function selectPrompt(id: string): Prompt | undefined {
  const row = getDb().prepare(`SELECT ${PROMPT_COLUMNS} FROM prompts WHERE id = ?`).get(id) as unknown as PromptRow | undefined;
  return row ? rowToPrompt(row) : undefined;
}

/** 可直接交给 sqlite 绑定的值。 */
type SqlValue = string | number | null;

function bindPrompt(p: Prompt): SqlValue[] {
  return [
    p.title, p.body, tagsToJson(p.tags), p.summary ?? null, p.sourceBody ?? null,
    p.aiRefined ? 1 : 0, p.aiRefinedAt, p.createdAt, p.updatedAt,
    p.usageCount, p.lastUsedAt, p.skillName ?? null, p.skillExportedAt,
  ];
}

function insertPrompt(cur: DatabaseSync, p: Prompt): void {
  cur.prepare(
    `INSERT OR REPLACE INTO prompts
       (id, title, body, tags, summary, sourceBody, aiRefined, aiRefinedAt, createdAt, updatedAt, usageCount, lastUsedAt, skillName, skillExportedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(p.id, ...bindPrompt(p));
}

function writePrompt(cur: DatabaseSync, p: Prompt): void {
  cur.prepare(
    `UPDATE prompts SET
       title = ?, body = ?, tags = ?, summary = ?, sourceBody = ?,
       aiRefined = ?, aiRefinedAt = ?, createdAt = ?, updatedAt = ?,
       usageCount = ?, lastUsedAt = ?, skillName = ?, skillExportedAt = ?
     WHERE id = ?`,
  ).run(...bindPrompt(p), p.id);
}

/** 事务包装：失败必须可见（重抛），不得静默吞掉。 */
function inTransaction<T>(cur: DatabaseSync, work: () => T): T {
  cur.exec("BEGIN");
  try {
    const out = work();
    cur.exec("COMMIT");
    return out;
  } catch (e) {
    try {
      cur.exec("ROLLBACK");
    } catch (rollbackError) {
      console.warn("[prompt-enhancer] ROLLBACK 失败：" + String(rollbackError));
    }
    throw e;
  }
}

// ── 排序（上游三段式语义）──────────────────────────────────────────────────

function sortPrompts(prompts: Prompt[], sort: PromptSort): Prompt[] {
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
      const hot = rest
        .filter((p) => p.usageCount > 0)
        .sort((a, b) => b.usageCount - a.usageCount)
        .slice(0, 3);
      const hotIds = new Set(hot.map((p) => p.id));
      const tail = rest
        .filter((p) => !hotIds.has(p.id))
        .sort((a, b) => b.updatedAt - a.updatedAt || b.usageCount - a.usageCount);
      return [...fresh, ...hot, ...tail];
    }
  }
}

// ── meta ───────────────────────────────────────────────────────────────────

/** 读 meta KV；缺失或异常一律回空串。 */
export function getMetaValue(key: string): string {
  const row = getDb().prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string | null } | undefined;
  return row?.value ?? "";
}

/** UPSERT 一条 meta KV。 */
export function setMetaValue(key: string, value: string): void {
  getDb()
    .prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, value);
}

// ── 提示词 ─────────────────────────────────────────────────────────────────

/** 列表：`q` 大小写不敏感子串（title / body / tags），`tag` 精确过滤，`sort` 见 {@link PromptSort}。 */
export function listPrompts(options: ListPromptsOptions = {}): Prompt[] {
  let out = selectAllPrompts().map(rowToPrompt);

  const q = options.q?.trim().toLowerCase();
  if (q) {
    out = out.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.body.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }
  const tag = options.tag;
  if (tag) out = out.filter((p) => p.tags.includes(tag));

  return sortPrompts(out, options.sort ?? "default");
}

/** 详情；不存在返回 `undefined`（规格 §5 的 `GET /prompts/:id`）。 */
export function getPrompt(id: string): Prompt | undefined {
  return selectPrompt(id);
}

/** 新建。标签同时进入字典表（用当前连接，绝不重入 `getDb()`）。 */
export function createPrompt(input: PromptInput): Prompt {
  const cur = getDb();
  const now = Date.now();
  const tags = normalizeTags(input.tags);
  const prompt: Prompt = {
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
    skillExportedAt: 0,
  };
  insertPrompt(cur, prompt);
  ensureTagsWith(cur, tags);
  return prompt;
}

/**
 * 更新。`options.aiWriteBack` 为 true 时按规格 §4.4 回填 AI 优化前原文（P2-D12）：
 * store 无法自行分辨「AI 写回」与用户手工编辑，必须由调用方显式声明。
 */
export function updatePrompt(
  id: string,
  patch: PromptPatch,
  options: { aiWriteBack?: boolean } = {},
): Prompt | undefined {
  const cur = getDb();
  const existing = selectPrompt(id);
  if (!existing) return undefined;

  const next: Prompt = { ...existing };
  let contentChanged = false;

  if (patch.title !== undefined) {
    next.title = clampTitle(patch.title);
    contentChanged = true;
  }
  if (patch.body !== undefined) {
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
  if (patch.tags !== undefined) {
    next.tags = normalizeTags(patch.tags);
    contentChanged = true;
  }
  if (patch.summary !== undefined) {
    next.summary = patch.summary;
    contentChanged = true;
  }
  if (patch.sourceBody !== undefined) next.sourceBody = patch.sourceBody;
  if (patch.aiRefined !== undefined) next.aiRefined = patch.aiRefined;
  if (patch.aiRefinedAt !== undefined) next.aiRefinedAt = patch.aiRefinedAt;
  if (patch.skillName !== undefined) next.skillName = patch.skillName;
  if (patch.skillExportedAt !== undefined) next.skillExportedAt = patch.skillExportedAt;

  if (contentChanged) next.updatedAt = Date.now();

  writePrompt(cur, next);
  ensureTagsWith(cur, next.tags);
  return next;
}

/** 记一次使用（插入 / 覆盖 / 插入并发送 / `#` 选中 都要调）。 */
export function recordUsage(id: string): Prompt | undefined {
  const cur = getDb();
  const existing = selectPrompt(id);
  if (!existing) return undefined;
  const now = Date.now();
  cur.prepare("UPDATE prompts SET usageCount = usageCount + 1, lastUsedAt = ? WHERE id = ?").run(now, id);
  return { ...existing, usageCount: existing.usageCount + 1, lastUsedAt: now };
}

/** 软删除：整行搬进回收站，**含** skill 两列（规格 §13.5 补列后，恢复不再丢导出记录）。 */
export function deletePrompt(id: string): boolean {
  const cur = getDb();
  const existing = selectPrompt(id);
  if (!existing) return false;
  const deletedAt = Date.now();

  inTransaction(cur, () => {
    cur.prepare(
      `INSERT OR REPLACE INTO trash
         (id, title, body, tags, summary, sourceBody, aiRefined, aiRefinedAt, createdAt, updatedAt, usageCount, lastUsedAt, skillName, skillExportedAt, deletedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      existing.id, existing.title, existing.body, tagsToJson(existing.tags),
      existing.summary ?? null, existing.sourceBody ?? null,
      existing.aiRefined ? 1 : 0, existing.aiRefinedAt,
      existing.createdAt, existing.updatedAt, existing.usageCount, existing.lastUsedAt,
      existing.skillName ?? null, existing.skillExportedAt, deletedAt,
    );
    cur.prepare("DELETE FROM prompts WHERE id = ?").run(id);
  });
  return true;
}

/** 「原文 ↔ 优化稿」双向切换；没有原文时拒绝且不写任何行（N2）。 */
export function rollbackPrompt(id: string): RollbackResult {
  const cur = getDb();
  const existing = selectPrompt(id);
  if (!existing) return { ok: false, error: "提示词不存在" };
  const original = existing.sourceBody;
  if (!original) return { ok: false, error: "该提示词没有可回退的原文（sourceBody 为空）" };

  const swapped: Prompt = { ...existing, body: original, sourceBody: existing.body, updatedAt: Date.now() };
  writePrompt(cur, swapped);
  return { ok: true, prompt: swapped };
}

// ── 标签 ───────────────────────────────────────────────────────────────────

/** 新建标签（幂等），返回规范化后的名字。 */
export function createTag(name: string): string {
  const tag = normalizeTagName(name);
  ensureTagWith(getDb(), tag);
  return tag;
}

/** 标签列表 + 每个标签在 `prompts` 中的使用条数。 */
export function listTags(): Array<{ name: string; count: number }> {
  const rows = getDb().prepare("SELECT name, createdAt FROM tags ORDER BY name").all() as unknown as TagRow[];
  const counts = new Map<string, number>();
  for (const row of selectAllPrompts()) {
    for (const tag of parseTags(row.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return rows.map((r) => ({ name: r.name, count: counts.get(r.name) ?? 0 }));
}

/**
 * 重命名：字典表 + 所有引用了该标签的提示词一起改；返回受影响（提示词）条数。
 *
 * ⚠️ **不能因为「没有提示词在用」就提前返回**：字典里可能有用户手动建的空标签，
 * 它照样应该被改名。只有「没人用 **且** 字典里也没有」才是无事可做。
 * （E2E 验收发现的缺陷：早期版本对空标签直接 return 0，导致改名静默失效。）
 */
export function renameTag(from: string, to: string): number {
  const cur = getDb();
  const target = normalizeTagName(to);
  if (!target) return 0;

  const affected = selectAllPrompts().map(rowToPrompt).filter((p) => p.tags.includes(from));
  const existsInDict = cur.prepare("SELECT 1 FROM tags WHERE name = ?").get(from) !== undefined;
  if (affected.length === 0 && !existsInDict) return 0;

  return inTransaction(cur, () => {
    ensureTagWith(cur, target);
    cur.prepare("DELETE FROM tags WHERE name = ?").run(from);
    const now = Date.now();
    for (const p of affected) {
      writePrompt(cur, { ...p, tags: p.tags.map((t) => (t === from ? target : t)), updatedAt: now });
    }
    return affected.length;
  });
}

/** 删除标签：**在用则拒绝**并返回用量（N3）。 */
export function deleteTag(name: string): { deleted: boolean; inUse: number } {
  const cur = getDb();
  const inUse = countTagUsage(name);
  if (inUse > 0) return { deleted: false, inUse };
  const res = cur.prepare("DELETE FROM tags WHERE name = ?").run(name);
  return { deleted: res.changes !== undefined && Number(res.changes) > 0, inUse: 0 };
}

// ── 回收站 ─────────────────────────────────────────────────────────────────

export function listTrash(): TrashItem[] {
  const rows = getDb()
    .prepare(
      `SELECT id, title, body, tags, summary, sourceBody, aiRefined, aiRefinedAt, createdAt, updatedAt, usageCount, lastUsedAt, skillName, skillExportedAt, deletedAt
         FROM trash ORDER BY deletedAt DESC`,
    )
    .all() as unknown as TrashRow[];
  return rows.map(rowToTrash);
}

/** 恢复：搬回 `prompts` 并离开回收站；返回恢复条数。 */
export function restorePrompts(ids: string[]): number {
  const cur = getDb();
  const rows = cur.prepare("SELECT * FROM trash WHERE id = ?") as unknown as { get: (id: string) => TrashRow | undefined };
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

/** 永久删除指定回收站条目。 */
export function deleteTrash(ids: string[]): number {
  const cur = getDb();
  let removed = 0;
  inTransaction(cur, () => {
    for (const id of ids) {
      const res = cur.prepare("DELETE FROM trash WHERE id = ?").run(id);
      if (res.changes !== undefined && Number(res.changes) > 0) removed++;
    }
  });
  return removed;
}

/** 清空回收站。 */
export function emptyTrash(): number {
  const cur = getDb();
  const res = cur.prepare("DELETE FROM trash").run();
  return res.changes !== undefined ? Number(res.changes) : 0;
}

// ── 导入导出（规格 §4.3，与参考项目同构）───────────────────────────────────

/** 导出：省略 `ids` 导出全部；传数组（含空数组）只导出指定条目。 */
export function exportPrompts(ids?: string[]): PromptBackup {
  const all = selectAllPrompts().map(rowToPrompt);
  const prompts = ids === undefined ? all : all.filter((p) => ids.includes(p.id));
  const tags = (getDb().prepare("SELECT name, createdAt FROM tags ORDER BY name").all() as unknown as TagRow[]).map(
    (r) => ({ name: r.name, createdAt: r.createdAt }),
  );
  return { version: BACKUP_VERSION, exportedAt: Date.now(), prompts, tags };
}

interface ValidatedBackup {
  prompts: Prompt[];
  tags: Array<{ name: string; createdAt: number }>;
}

/** 校验信封：版本不符 / `prompts` 非数组 / 元素缺 `id` 或 `body` 一律拒绝（不静默跳过）。 */
function validateBackup(input: unknown): { ok: true; value: ValidatedBackup } | { ok: false; error: string } {
  if (typeof input !== "object" || input === null) return { ok: false, error: "备份内容不是对象" };
  const raw = input as Record<string, unknown>;

  if (raw.version !== BACKUP_VERSION) {
    return { ok: false, error: `备份版本不匹配（期望 ${BACKUP_VERSION}，实际 ${String(raw.version)}）` };
  }
  if (!Array.isArray(raw.prompts)) return { ok: false, error: "备份缺少 prompts 数组" };

  const prompts: Prompt[] = [];
  for (const [index, item] of raw.prompts.entries()) {
    if (typeof item !== "object" || item === null) return { ok: false, error: `第 ${index + 1} 条不是对象` };
    const e = item as Record<string, unknown>;
    if (typeof e.id !== "string" || !e.id) return { ok: false, error: `第 ${index + 1} 条缺少 id` };
    if (typeof e.body !== "string") return { ok: false, error: `第 ${index + 1} 条缺少 body` };
    const updatedAt = numberOr(e.updatedAt, 0);
    const createdAt = numberOr(e.createdAt, updatedAt);
    prompts.push({
      id: e.id,
      title: typeof e.title === "string" ? clampTitle(e.title) : "",
      body: e.body,
      tags: Array.isArray(e.tags) ? normalizeTags(e.tags.filter((t): t is string => typeof t === "string")) : [],
      summary: typeof e.summary === "string" ? e.summary : undefined,
      sourceBody: typeof e.sourceBody === "string" ? e.sourceBody : undefined,
      aiRefined: e.aiRefined === true || e.aiRefined === 1,
      aiRefinedAt: numberOr(e.aiRefinedAt, 0),
      createdAt,
      updatedAt,
      usageCount: numberOr(e.usageCount, 0),
      lastUsedAt: numberOr(e.lastUsedAt, 0),
      skillName: typeof e.skillName === "string" ? e.skillName : undefined,
      skillExportedAt: numberOr(e.skillExportedAt, 0),
    });
  }

  const tags: Array<{ name: string; createdAt: number }> = [];
  if (Array.isArray(raw.tags)) {
    for (const item of raw.tags) {
      if (typeof item !== "object" || item === null) continue;
      const t = item as Record<string, unknown>;
      if (typeof t.name === "string" && t.name.trim()) {
        tags.push({ name: t.name.trim(), createdAt: numberOr(t.createdAt, Date.now()) });
      }
    }
  }

  return { ok: true, value: { prompts, tags } };
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * 导入：`confirm` 为假时**只返回预览统计**，不落库；为真时同 id 覆盖、新 id 追加。
 * 标签字典同时按信封恢复（含暂无提示词引用的孤儿标签），保证往返等值。
 */
export function importPrompts(input: unknown, options: { confirm?: boolean } = {}): ImportResult {
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
  const stats: ImportStats = { added, overwritten, total: prompts.length };

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

// ── 超限淘汰（规格 §4.4）───────────────────────────────────────────────────

/**
 * 清理**本次淘汰受害者引用过的**孤儿标签：仅当某个候选标签在淘汰后已无任何 `prompts` 行引用
 * 时才从字典表删除（D-P6-6 / R46）。
 *
 * ⚠️ R46（收窄爆炸半径）：本函数**不得**扫全库 `count = 0` 的行。旧实现清掉的是**任何**零引用
 * 标签——包括用户在标签页手动建的空标签，以及与本次淘汰毫不相干的既有孤儿行；于是「淘汰一条
 * 记录」会顺带产生与淘汰无关的可见副作用（T7 活体验收被迫自建一条「保护载体」记录来保住两个
 * 既有孤儿标签，这个 workaround 本身就是气味）。全库清理交给标签页已有的「清理无用标签」按钮
 * （R37，逐个走既有 `DELETE /tags/:name`，由用户显式触发）。
 *
 * **只被 `enforceMaxCount` 在淘汰事务内调用**——软删除（进回收站）刻意**不**清标签：那条路要能
 * 「恢复后标签仍在」。用传入的连接（与淘汰同一事务），不经 `getDb()` 重入。
 */
function pruneOrphanTags(cur: DatabaseSync, candidateNames: Iterable<string>): void {
  const candidates = new Set<string>();
  for (const name of candidateNames) if (name) candidates.add(name);
  if (candidates.size === 0) return;

  const used = new Set<string>();
  const rows = cur.prepare("SELECT tags FROM prompts").all() as unknown as Array<{ tags: string | null }>;
  for (const row of rows) for (const tag of parseTags(row.tags)) used.add(tag);

  for (const name of candidates) {
    if (!used.has(name)) cur.prepare("DELETE FROM tags WHERE name = ?").run(name);
  }
}

/**
 * 超过上限时物理删除（不进回收站），返回被淘汰的 id。
 * 顺序：**`aiRefined = 0` 优先**（未经人工确认价值），其次 `lastUsedAt` 最旧、`createdAt` 最旧，
 * 最后以 `id` 升序兜底——规格 §4.4，与上游的 `usageCount` 升序**不同**，不得照抄上游（P2-D3）。
 * 键序的**唯一实现**是 `src/eviction-order.ts#compareEvictionOrder`（见下方 ⇄ 段）。
 *
 * 必须是**全序**（修复轮 1 的评审阻断项）：客户端预检读的是 `GET /prompts` 的 default 排序
 * （最新优先），而本函数读 `selectAllPrompts()`（无 `ORDER BY` = 插入序）——同一集合、**不同顺序**。
 * 键并列时排序稳定性只会各自保持输入序，两端就会给出不同的受害者；全序（最后一键 `id` 唯一）
 * 才能让「弹窗列的受害者」与「实际被物理删除的对象」必然一致。`createdAt` 也会并列
 * （导入把备份里的 `createdAt` 原样写入，见 `validateBackup`），故 `id` 兜底不是可选项。
 *
 * ⇄ **排序键的唯一实现**在 `src/eviction-order.ts#compareEvictionOrder`（R59 / F-3）：本函数与
 * `src/client/utils/eviction.ts#previewEvictions`（宿主没有 dry-run 路由，§4.4 的二次确认靠客户端
 * 预演）**import 同一个比较器**，不再各抄一份「靠注释对齐」的键序。改键序只改那个模块；
 * 「两端给出同一批受害者 / 同一顺序」由 `tests/eviction.test.mjs` 的「真实序列」逐 id 锁死（保留）。
 *
 * **R45（T8，D-1 修复）：本次调用豁免一条 id。** `POST /prompts` 的落库顺序是「先 `createPrompt`
 * 再调本函数」，故新项此刻已在库里，且它的键恒为 `(aiRefined=false, lastUsedAt=0, createdAt=最新)`——
 * 在 §4.4 的键序下它是候选集的**最小元**，旧实现于是**必然淘汰刚保存的那一条**（T7 C10 实测
 * `evicted:[刚建的那条]`），而客户端的二次确认只能看见**插入前**的集合、必然列出别的条目 →
 * 确认框与真实淘汰对象逐 id 不等（D-1）。修法：调用方传 `exceptId`（= `created.id`），
 * 新项**永不**成为本次创建的受害者。
 *
 * ⚠️ **计数仍按全集**（`all.length - maxCount`，`all` 含新项），**只有候选排序集**剔除 `exceptId`。
 * 若把计数也改成剔除后集合的 `candidates.length - maxCount`，超限时会**少淘汰一条**——
 * `tests/eviction.test.mjs` 的「真实序列」用例（存活集合断言）锁住这一点。
 *
 * ⚠️ `maxCount === 0` 是退化配置：受害者数（`all.length`）会大于候选数（`all.length - 1`），
 * `slice` 静默截断 → 留下的恰是被豁免的那一条；旧实现在 `maxCount === 0` 时会清空全库，
 * 故这一点的行为与旧版不同。**如实记录**（R45 明示），不为它加特判。
 */
export function enforceMaxCount(maxCount: number, options: { exceptId?: string } = {}): string[] {
  const cur = getDb();
  const all = selectAllPrompts().map(rowToPrompt);
  if (all.length <= maxCount) return [];

  // R45：受害者**计数按全集**（含被豁免的那条）；候选**排序集**才把 exceptId 剔掉。
  const over = all.length - maxCount;
  const candidates = options.exceptId === undefined ? all : all.filter((p) => p.id !== options.exceptId);

  const victims = [...candidates]
    // ⇄ 比较器来自 `src/eviction-order.ts`（**唯一实现**；客户端预检 eviction.ts 用的是同一个）：
    //   本处不再手抄键序，改键序请改那个模块。
    .sort(compareEvictionOrder)
    .slice(0, over);

  inTransaction(cur, () => {
    for (const victim of victims) cur.prepare("DELETE FROM prompts WHERE id = ?").run(victim.id);
    // D-P6-6 / R46：只清**本次受害者引用过的**、淘汰后已无引用的标签行（同一事务，回滚时一起回滚）。
    pruneOrphanTags(cur, victims.flatMap((victim) => victim.tags));
  });
  return victims.map((v) => v.id);
}
