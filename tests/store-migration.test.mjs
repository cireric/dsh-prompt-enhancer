/**
 * 迁移单测：v1 → v2（回收站补 `skillName` / `skillExportedAt`，规格 §13.5）。
 *
 * 本文件**必须独立成进程**：它先手工造一个 v1 形状的库（trash 没有那两列），
 * 再让 store 的首次初始化去迁移它。若与 store.test.mjs 同进程，就造不出「旧库」前提。
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, after } from "node:test";
import assert from "node:assert/strict";

const home = mkdtempSync(join(tmpdir(), "dpe-migrate-"));
process.env.DSH_HOME = home;
const STORE_URL = new URL("../src/host/store.ts", import.meta.url).href;

const { dbPath } = await import("../src/host/paths.ts");
const { DatabaseSync } = await import("node:sqlite");

// ── 手工造 v1 形状的库：trash 刻意不含 skill 两列 ──
const file = dbPath();
mkdirSync(dirname(file), { recursive: true });
const legacy = new DatabaseSync(file);
legacy.exec(`
  CREATE TABLE prompts (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]', summary TEXT, sourceBody TEXT,
    aiRefined INTEGER NOT NULL DEFAULT 0, aiRefinedAt INTEGER NOT NULL DEFAULT 0,
    createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL,
    usageCount INTEGER NOT NULL DEFAULT 0, lastUsedAt INTEGER NOT NULL DEFAULT 0,
    skillName TEXT, skillExportedAt INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE trash (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]', summary TEXT, sourceBody TEXT,
    aiRefined INTEGER NOT NULL DEFAULT 0, aiRefinedAt INTEGER NOT NULL DEFAULT 0,
    createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL,
    usageCount INTEGER NOT NULL DEFAULT 0, lastUsedAt INTEGER NOT NULL DEFAULT 0,
    deletedAt INTEGER NOT NULL
  );
  CREATE TABLE tags (name TEXT PRIMARY KEY, createdAt INTEGER NOT NULL);
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);
legacy.prepare("INSERT INTO meta (key, value) VALUES ('schemaVersion', '1')").run();
legacy
  .prepare(
    `INSERT INTO prompts
       (id, title, body, tags, aiRefined, aiRefinedAt, createdAt, updatedAt, usageCount, lastUsedAt, skillExportedAt)
     VALUES ('legacy-1', '老数据', '正文', '["老标签"]', 0, 0, 111, 222, 3, 444, 0)`,
  )
  .run();
legacy
  .prepare(
    `INSERT INTO trash
       (id, title, body, tags, aiRefined, aiRefinedAt, createdAt, updatedAt, usageCount, lastUsedAt, deletedAt)
     VALUES ('legacy-trash', '回收站老数据', '正文', '[]', 0, 0, 1, 2, 0, 0, 333)`,
  )
  .run();
legacy.close();

// 首次数据访问触发 getDb() → 建表（no-op）→ 迁移 → 播种判定
const store = await import("../src/host/store.ts");

after(() => rmSync(home, { recursive: true, force: true }));

test("v1 库首次初始化即自动补列，且原有数据无损", () => {
  const all = store.listPrompts();
  assert.equal(all.length, 1, "库里已有数据时不得播种");
  assert.equal(all[0].id, "legacy-1");
  assert.equal(all[0].usageCount, 3, "旧行的统计字段必须原样保留");
  assert.deepEqual(all[0].tags, ["老标签"]);
  assert.equal(all[0].skillExportedAt, 0, "旧行缺失的新列必须取默认值 0");
  assert.equal(store.getMetaValue("schemaVersion"), "2", "迁移后 schemaVersion 必须升到 2");

  const db = new DatabaseSync(file);
  try {
    const cols = db
      .prepare("PRAGMA table_info(trash)")
      .all()
      .map((r) => r.name);
    assert.ok(cols.includes("skillName"), "迁移必须给 trash 补上 skillName");
    assert.ok(cols.includes("skillExportedAt"), "迁移必须给 trash 补上 skillExportedAt");

    // 旧回收站行仍可读（展开归一：sqlite 的行是 null-prototype 对象）
    const rows = db.prepare("SELECT id, skillExportedAt FROM trash").all().map((r) => ({ ...r }));
    assert.deepEqual(rows, [{ id: "legacy-trash", skillExportedAt: 0 }]);
  } finally {
    db.close();
  }
});

test("迁移必须幂等：已迁移的库再次启动不得抛错", () => {
  const script = `
    const store = await import(${JSON.stringify(STORE_URL)});
    const n = store.listPrompts().length;
    if (n !== 1) { console.error("行数异常: " + n); process.exit(2); }
    console.log("second-boot-ok");
  `;
  const out = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    env: { ...process.env, DSH_HOME: home },
    encoding: "utf8",
  });
  assert.match(out, /second-boot-ok/, "第二次启动必须能正常打开已迁移的库（列已存在时不得重复 ALTER）");
});
