/**
 * 导入导出格式单测（规格 §4.3 / §9.1）。
 *
 * 与 store.test.mjs 同样的隔离方式（本进程独享临时 DSH_HOME），因此两个文件
 * 各有一个全新的库；`node --test` 一文件一进程，天然互不干扰。
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, after } from "node:test";
import assert from "node:assert/strict";

const home = mkdtempSync(join(tmpdir(), "dpe-formats-"));
process.env.DSH_HOME = home;
const store = await import("../src/host/store.ts");

after(() => rmSync(home, { recursive: true, force: true }));

/** 造一条完整的备份条目（对齐规格 §4.3 的字段面）。 */
const entry = (over) => ({
  id: "x",
  title: "t",
  body: "b",
  tags: [],
  aiRefined: false,
  aiRefinedAt: 0,
  createdAt: 1,
  updatedAt: 2,
  usageCount: 0,
  lastUsedAt: 0,
  skillExportedAt: 0,
  ...over,
});

test("往返：export → 清空 → import(confirm) → 再 export 逐字段等值", () => {
  const a = store.createPrompt({ title: "往返甲", body: "正文甲", tags: ["往返"], summary: "摘要甲" });
  store.recordUsage(a.id);
  store.recordUsage(a.id);
  const b = store.createPrompt({ title: "往返乙", body: "正文乙", tags: ["往返", "乙"] });

  const backup = store.exportPrompts();
  assert.equal(backup.version, 1, "信封版本必须为 1（与参考项目同构）");
  assert.ok(backup.exportedAt > 0);
  assert.ok(backup.prompts.length >= 3, "导出默认包含全部提示词（含种子）");
  assert.ok(backup.tags.length >= 2);
  assert.ok(backup.tags.every((t) => typeof t.name === "string" && typeof t.createdAt === "number"));

  for (const p of store.listPrompts()) store.deletePrompt(p.id);
  store.emptyTrash();
  assert.equal(store.listPrompts().length, 0);

  const res = store.importPrompts(backup, { confirm: true });
  assert.equal(res.ok, true);
  assert.equal(res.applied, true);
  assert.equal(res.stats.total, backup.prompts.length);

  // 逐字段等值（exportedAt 与顺序除外）
  const norm = (list) =>
    JSON.parse(JSON.stringify(list)).sort((p, q) => String(p.id).localeCompare(String(q.id)));
  const again = store.exportPrompts();
  assert.deepEqual(norm(again.prompts), norm(backup.prompts), "往返后提示词必须逐字段等值");
  assert.deepEqual(
    again.tags.map((t) => t.name).sort(),
    backup.tags.map((t) => t.name).sort(),
    "往返后标签字典必须等值（含未被任何提示词引用的孤儿标签）",
  );

  // 使用统计与技能字段也必须被恢复
  const restoredA = store.getPrompt(a.id);
  assert.equal(restoredA.usageCount, 2);
  assert.ok(restoredA.lastUsedAt > 0);
  assert.equal(store.getPrompt(b.id).title, "往返乙");
});

test("N4 信封版本不符必须拒绝，且库内行数不变", () => {
  const before = store.listPrompts().length;
  const res = store.importPrompts(
    { version: 2, exportedAt: 0, prompts: [entry({ id: "v2-id" })], tags: [] },
    { confirm: true },
  );
  assert.equal(res.ok, false, "N4：version !== 1 必须拒绝");
  assert.ok(res.error);
  assert.equal(store.listPrompts().length, before, "N4：拒绝时不得写入任何行");
  assert.equal(store.getPrompt("v2-id"), undefined);
});

test("结构不合法必须拒绝（prompts 非数组 / 元素缺 body）", () => {
  const before = store.listPrompts().length;
  assert.equal(store.importPrompts({ version: 1, exportedAt: 0, tags: [] }, { confirm: true }).ok, false);
  assert.equal(
    store.importPrompts({ version: 1, exportedAt: 0, prompts: [{ id: "no-body", title: "t" }], tags: [] }, { confirm: true }).ok,
    false,
    "缺 body 的条目必须被拒绝（不得静默落库空正文）",
  );
  assert.equal(store.listPrompts().length, before);
});

test("confirm:false 只预览不落库；confirm:true 同 id 覆盖、新 id 追加", () => {
  const p = store.createPrompt({ title: "覆盖对象", body: "旧正文", tags: ["旧标签"] });
  const backup = {
    version: 1,
    exportedAt: 1,
    tags: [{ name: "备份标签", createdAt: 7 }],
    prompts: [
      entry({ id: p.id, title: "覆盖对象", body: "新正文", tags: ["新标签"], updatedAt: 99 }),
      entry({ id: "brand-new-id", title: "新增", body: "全新", tags: ["备份标签"] }),
    ],
  };

  const preview = store.importPrompts(backup, { confirm: false });
  assert.equal(preview.ok, true);
  assert.equal(preview.applied, false, "预览不得落库");
  assert.equal(preview.stats.added, 1);
  assert.equal(preview.stats.overwritten, 1);
  assert.equal(preview.stats.total, 2);
  assert.equal(store.getPrompt(p.id).body, "旧正文", "预览之后原数据必须原样");

  const applied = store.importPrompts(backup, { confirm: true });
  assert.equal(applied.ok, true);
  assert.equal(applied.applied, true);
  assert.equal(store.getPrompt(p.id).body, "新正文", "同 id 必须覆盖");
  assert.deepEqual(store.getPrompt(p.id).tags, ["新标签"]);
  assert.equal(store.getPrompt("brand-new-id").body, "全新", "新 id 必须追加");

  // 导入后标签字典必须与备份及提示词一致
  const names = store.listTags().map((t) => t.name);
  assert.ok(names.includes("备份标签"), "备份信封里的标签必须被恢复（即使暂无提示词引用）");
  assert.ok(names.includes("新标签"), "导入提示词的新标签必须进字典表");
});

test("exportPrompts(ids) 只导出指定条目", () => {
  const p = store.createPrompt({ title: "子集", body: "只导我" });
  const only = store.exportPrompts([p.id]);
  assert.deepEqual(only.prompts.map((x) => x.id), [p.id]);
  assert.deepEqual(store.exportPrompts([]).prompts, [], "空 ids 数组导出空集合（不同于省略参数）");
});
