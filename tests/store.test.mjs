/**
 * 存储层单测（规格 §9.1）。
 *
 * 隔离方式：本文件在自己的进程里把 `DSH_HOME` 指向临时目录后再 import store，
 * 因此拿到一个全新的空库——生产代码不含任何 test-only API。
 *
 * ⚠️ 断言纪律：`node:sqlite` 返回的行是 **null-prototype 对象**，对行对象直接
 * `assert.deepEqual(row, {...})` 必失败（ERR_ASSERTION）。凡是要对行做深比较，
 * 必须先用 `{ ...row }` 展开归一。
 *
 * 测试按声明顺序串行执行，且**顺序有意义**：N1 必须是本库的第一次 store 调用
 * （它验证的正是「冷启动建库时的递归缺陷」）。
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, after } from "node:test";
import assert from "node:assert/strict";

const home = mkdtempSync(join(tmpdir(), "dpe-store-"));
process.env.DSH_HOME = home; // ← 必须在 import store 之前
const store = await import("../src/host/store.ts");
const { SCHEMA_VERSION } = await import("../src/types.ts");

after(() => rmSync(home, { recursive: true, force: true }));

/** 毫秒级排序断言需要可控的时间差（同一毫秒创建会让排序不确定）。 */
const pause = () => new Promise((r) => setTimeout(r, 5));

// ─────────────────────────────────────────────────────────────────────────────
// N1：冷启动路径（本库的第一次 store 调用）
// ─────────────────────────────────────────────────────────────────────────────
test("N1 冷启动：createPrompt 带全新标签不得递归爆栈，且标签立即进字典表", () => {
  const p = store.createPrompt({ title: "冷启动", body: "hello", tags: ["冷启动标签"] });
  assert.ok(p.id, "必须返回带 id 的提示词");
  assert.deepEqual(p.tags, ["冷启动标签"]);
  assert.equal(p.usageCount, 0);
  assert.equal(p.aiRefined, false);

  const names = store.listTags().map((t) => t.name);
  assert.ok(
    names.includes("冷启动标签"),
    "新标签必须进入 tags 表（上游 ensureTag 无限递归缺陷的负样本：正确实现下这里不会爆栈）",
  );

  const read = store.getPrompt(p.id);
  assert.equal(read.title, "冷启动");
  assert.deepEqual(read.body, "hello");
});

// ─────────────────────────────────────────────────────────────────────────────
// N7：首启播种与标签同步的顺序
// ─────────────────────────────────────────────────────────────────────────────
test("N7 首启播种：种子提示词落库，且其标签已同步进 tags 表", () => {
  const others = store.listPrompts().filter((p) => !p.tags.includes("冷启动标签"));
  assert.equal(others.length, 1, "空库首启必须播种恰好 1 条提示词");

  const seedTags = others[0].tags;
  assert.ok(seedTags.length > 0, "种子提示词应带标签（供 N7 校验同步顺序）");
  for (const name of seedTags) {
    const t = store.listTags().find((x) => x.name === name);
    assert.ok(t && t.count >= 1, `种子标签「${name}」必须已在 tags 表中（上游「播种先于同步」顺序缺陷的负样本）`);
  }
  assert.equal(store.getMetaValue("schemaVersion"), String(SCHEMA_VERSION), "schemaVersion 必须与 SCHEMA_VERSION 一致");
});

// ─────────────────────────────────────────────────────────────────────────────
// schema 形状（逐字对齐规格 §4.1 的 DDL）
// ─────────────────────────────────────────────────────────────────────────────
test("schema 形状：4 张表 + 索引 + trash 含 skill 两列", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const { dbPath } = await import("../src/host/paths.ts");
  const db = new DatabaseSync(dbPath());
  try {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all()
      .map((r) => r.name);
    assert.deepEqual(tables, ["meta", "prompts", "tags", "trash"], "表集合必须恰好是规格 §4.1 的 4 张");

    const cols = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((r) => r.name);
    assert.deepEqual(cols("prompts"), [
      "id", "title", "body", "tags", "summary", "sourceBody", "aiRefined", "aiRefinedAt",
      "createdAt", "updatedAt", "usageCount", "lastUsedAt", "skillName", "skillExportedAt",
    ]);
    assert.deepEqual(cols("trash"), [
      "id", "title", "body", "tags", "summary", "sourceBody", "aiRefined", "aiRefinedAt",
      "createdAt", "updatedAt", "usageCount", "lastUsedAt",
      "skillName", "skillExportedAt", "deletedAt",
    ]);
    assert.deepEqual(cols("tags"), ["name", "createdAt"]);
    assert.deepEqual(cols("meta"), ["key", "value"]);
    assert.ok(cols("trash").includes("skillName"), "回收站必须保留 skillName（规格 §13.5 补列）");
    assert.ok(cols("trash").includes("skillExportedAt"), "回收站必须保留 skillExportedAt（规格 §13.5 补列）");

    const idx = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all()
      .map((r) => r.name);
    assert.deepEqual(idx, ["idx_prompts_updated", "idx_prompts_used", "idx_trash_deleted"]);

    // 空数组必须存 '[]' 而不是 NULL（P2-D6）
    const raw = db.prepare("SELECT tags FROM prompts WHERE tags IS NULL").all();
    assert.equal(raw.length, 0, "tags 列不得出现 NULL（P2-D6）");
  } finally {
    db.close();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CRUD / 搜索 / 过滤 / 排序
// ─────────────────────────────────────────────────────────────────────────────
test("CRUD 与列表：搜索大小写不敏感、标签过滤、四种排序", async () => {
  const a = store.createPrompt({ title: "翻译助手", body: "把这段话翻成日语", tags: ["翻译"] });
  await pause();
  const b = store.createPrompt({ title: "代码审查", body: "审查这段 TypeScript 代码", tags: ["代码"] });
  await pause();
  const c = store.createPrompt({ title: "周报模板", body: "把本周工作整理成周报", tags: ["写作"] });

  assert.deepEqual(store.listPrompts({ q: "日语" }).map((p) => p.id), [a.id]);
  assert.deepEqual(store.listPrompts({ q: "typescript" }).map((p) => p.id), [b.id], "q 必须大小写不敏感");
  assert.deepEqual(store.listPrompts({ tag: "写作" }).map((p) => p.id), [c.id]);
  assert.equal(store.listPrompts({ tag: "不存在的标签" }).length, 0);

  const created = store.listPrompts({ sort: "created" }).map((p) => p.id);
  assert.ok(created.indexOf(c.id) < created.indexOf(b.id), "created 排序：后建在前");
  assert.ok(created.indexOf(b.id) < created.indexOf(a.id));

  const updated = store.listPrompts({ sort: "updated" }).map((p) => p.id);
  assert.equal(updated[0], c.id, "updated 排序：最近更新在前");

  const upd = store.updatePrompt(a.id, { title: "翻译助手 v2", tags: ["翻译", "日文"] });
  assert.equal(upd.title, "翻译助手 v2");
  assert.ok(upd.updatedAt >= a.updatedAt);
  assert.equal(store.listPrompts({ tag: "日文" }).length, 1, "标签更新必须可被过滤到");
  assert.equal(store.listPrompts({ sort: "updated" })[0].id, a.id);

  assert.equal(store.deletePrompt(b.id), true);
  assert.equal(store.getPrompt(b.id), undefined, "软删除后详情不可见");
  assert.equal(store.listPrompts().some((p) => p.id === b.id), false);
  assert.equal(store.deletePrompt("不存在"), false);
  assert.equal(store.updatePrompt("不存在", { title: "x" }), undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
// AI 写回 + 回滚（含 N2）
// ─────────────────────────────────────────────────────────────────────────────
test("AI 写回回填 sourceBody；rollback 双向切换；N2 无原文时必须拒绝且不清空正文", () => {
  const p = store.createPrompt({ title: "润色对象", body: "原始正文" });

  const ai = store.updatePrompt(p.id, { body: "优化后正文" }, { aiWriteBack: true });
  assert.equal(ai.body, "优化后正文");
  assert.equal(ai.sourceBody, "原始正文", "AI 写回必须把旧正文存进 sourceBody");
  assert.equal(ai.aiRefined, true);
  assert.ok(ai.aiRefinedAt > 0);

  const manual = store.updatePrompt(p.id, { body: "手工改的正文" });
  assert.equal(manual.sourceBody, "原始正文", "普通编辑不得回填或覆盖 sourceBody");
  assert.equal(manual.aiRefined, true, "普通编辑不得重置 aiRefined");

  const r1 = store.rollbackPrompt(p.id);
  assert.equal(r1.ok, true);
  assert.equal(r1.prompt.body, "原始正文");
  assert.equal(r1.prompt.sourceBody, "手工改的正文");

  const r2 = store.rollbackPrompt(p.id);
  assert.equal(r2.ok, true);
  assert.equal(r2.prompt.body, "手工改的正文", "两次回滚必须回到原状（可反复双向切换）");
  assert.equal(r2.prompt.sourceBody, "原始正文");

  // N2：没有原文时必须拒绝，且正文一动不动
  const q = store.createPrompt({ title: "没有原文", body: "正文必须保住" });
  const bad = store.rollbackPrompt(q.id);
  assert.equal(bad.ok, false, "N2：sourceBody 为空时必须拒绝回滚");
  assert.ok(bad.error);
  assert.equal(store.getPrompt(q.id).body, "正文必须保住", "N2：拒绝时不得清空正文");
  assert.equal(store.rollbackPrompt("不存在").ok, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// 使用统计
// ─────────────────────────────────────────────────────────────────────────────
test("使用统计：usageCount 与 lastUsedAt 累加", async () => {
  const p = store.createPrompt({ title: "统计对象", body: "x" });
  assert.equal(p.usageCount, 0);
  assert.equal(p.lastUsedAt, 0);

  const u1 = store.recordUsage(p.id);
  assert.equal(u1.usageCount, 1);
  assert.ok(u1.lastUsedAt > 0);
  await pause();
  const u2 = store.recordUsage(p.id);
  assert.equal(u2.usageCount, 2);
  assert.ok(u2.lastUsedAt >= u1.lastUsedAt);

  assert.equal(store.recordUsage("不存在"), undefined);
  assert.equal(store.listPrompts({ sort: "used" })[0].id, p.id, "used 排序：最常使用在前");
});

// ─────────────────────────────────────────────────────────────────────────────
// 回收站
// ─────────────────────────────────────────────────────────────────────────────
test("回收站：软删除 → 可见 → 恢复无损 → 永久删除 → 清空", () => {
  const p = store.createPrompt({ title: "待删除", body: "内容", summary: "摘要", tags: ["回收"] });
  assert.equal(store.deletePrompt(p.id), true);

  const inTrash = store.listTrash().find((t) => t.id === p.id);
  assert.ok(inTrash, "软删除后必须出现在回收站");
  assert.ok(inTrash.deletedAt > 0);
  assert.equal(inTrash.body, "内容");
  assert.equal(inTrash.summary, "摘要");
  assert.deepEqual(inTrash.tags, ["回收"]);

  assert.equal(store.restorePrompts([p.id]), 1);
  const restored = store.getPrompt(p.id);
  assert.equal(restored.body, "内容");
  assert.deepEqual(restored.tags, ["回收"]);
  assert.equal(store.listTrash().some((t) => t.id === p.id), false, "恢复后必须离开回收站");

  store.deletePrompt(p.id);
  assert.equal(store.deleteTrash([p.id]), 1);
  assert.equal(store.listTrash().some((t) => t.id === p.id), false);

  assert.equal(store.restorePrompts(["不存在"]), 0);
  assert.equal(store.deleteTrash(["不存在"]), 0);

  const q = store.createPrompt({ title: "再删一条", body: "y" });
  store.deletePrompt(q.id);
  assert.ok(store.emptyTrash() >= 1, "清空必须报告删除条数");
  assert.equal(store.listTrash().length, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// 回收站保留技能导出记录（规格 §13.5）
// ─────────────────────────────────────────────────────────────────────────────
test("回收站保留技能导出记录：软删除 → 恢复后 skillName/skillExportedAt 不丢", async () => {
  const p = store.createPrompt({ title: "导出技能的对象", body: "z" });
  const exportedAt = Date.now();
  const exported = store.updatePrompt(p.id, { skillName: "weekly-report", skillExportedAt: exportedAt });
  assert.equal(exported.skillName, "weekly-report");
  assert.equal(exported.skillExportedAt, exportedAt);

  store.deletePrompt(p.id);
  const inTrash = store.listTrash().find((t) => t.id === p.id);
  assert.ok(inTrash);
  assert.equal(inTrash.skillName, "weekly-report", "回收站必须保留 skillName（规格 §13.5）");
  assert.equal(inTrash.skillExportedAt, exportedAt, "回收站必须保留 skillExportedAt（规格 §13.5）");

  assert.equal(store.restorePrompts([p.id]), 1);
  const restored = store.getPrompt(p.id);
  assert.equal(restored.skillName, "weekly-report", "恢复后必须仍知道自己导出过技能");
  assert.equal(restored.skillExportedAt, exportedAt);

  // 恢复后的过期判定仍然可用：改动正文后 updatedAt > skillExportedAt
  await pause();
  const edited = store.updatePrompt(p.id, { body: "改过了" });
  assert.ok(
    edited.updatedAt > edited.skillExportedAt,
    "改动后必须满足「技能已过期」的判定条件（updatedAt > skillExportedAt）",
  );

  // T4 补断言（同一用例内补，不重复造用例）：回收站 INSERT 路径可反复走——第二轮软删除/恢复
  // 仍完整搬运技能两列（回收站条目被删掉过一次，之后不能再依赖任何残留）。
  store.deletePrompt(p.id);
  const inTrashAgain = store.listTrash().find((t) => t.id === p.id);
  assert.ok(inTrashAgain, "第二次软删除后必须再次出现在回收站");
  assert.equal(inTrashAgain.skillName, "weekly-report", "第二轮软删除仍必须保留 skillName（§13.5）");
  assert.equal(inTrashAgain.skillExportedAt, exportedAt, "第二轮软删除仍必须保留 skillExportedAt（§13.5）");
  assert.equal(store.restorePrompts([p.id]), 1);
  const restoredAgain = store.getPrompt(p.id);
  assert.equal(restoredAgain.skillName, "weekly-report", "第二轮恢复后仍知道自己导出过技能");
  assert.equal(restoredAgain.skillExportedAt, exportedAt);
});

// ─────────────────────────────────────────────────────────────────────────────
// 标签（含 N3）
// ─────────────────────────────────────────────────────────────────────────────
test("标签：in-use 拒绝（N3）、重命名连带更新提示词、计数", () => {
  const p1 = store.createPrompt({ title: "标签甲", body: "x", tags: ["在用标签"] });
  const before = store.listTags().find((t) => t.name === "在用标签");
  assert.equal(before.count, 1);

  const del = store.deleteTag("在用标签");
  assert.equal(del.deleted, false, "N3：在用标签必须拒绝删除");
  assert.equal(del.inUse, 1);
  assert.ok(store.listTags().some((t) => t.name === "在用标签"), "N3：拒绝后字典表不得改动");
  assert.ok(store.getPrompt(p1.id).tags.includes("在用标签"), "N3：拒绝后提示词不得改动");

  assert.equal(store.renameTag("在用标签", "改名后"), 1);
  assert.ok(store.getPrompt(p1.id).tags.includes("改名后"), "重命名必须连带更新提示词");
  assert.ok(!store.listTags().some((t) => t.name === "在用标签"));

  const p2 = store.createPrompt({ title: "标签乙", body: "y", tags: ["孤儿标签"] });
  store.updatePrompt(p2.id, { tags: [] });
  const del2 = store.deleteTag("孤儿标签");
  assert.equal(del2.deleted, true, "不在用的标签可以删除");

  assert.equal(store.createTag("重复创建"), "重复创建");
  assert.equal(store.createTag("重复创建"), "重复创建", "createTag 必须幂等");
});

test("标签重命名：空标签（无人使用但字典里有）也必须改名，不存在才返回 0", () => {
  // E2E 验收发现的缺陷回归：早期实现对「没有被任何提示词使用」的标签直接 return 0，
  // 于是字典里的空标签改名静默失效（旧名残留、新名不存在）。
  store.createTag("空标签旧名");
  assert.equal(store.renameTag("空标签旧名", "空标签新名"), 0, "没有提示词受影响，返回 0");
  const names = store.listTags().map((t) => t.name);
  assert.ok(names.includes("空标签新名"), "字典里的标签必须已改名");
  assert.ok(!names.includes("空标签旧名"), "旧名必须从字典消失");

  assert.equal(store.renameTag("根本不存在的标签", "x"), 0, "字典里没有 → 返回 0");

  // 被提示词使用的标签仍是「连带更新 + 返回受影响条数」
  const p = store.createPrompt({ title: "改名对象", body: "x", tags: ["连带旧名"] });
  assert.equal(store.renameTag("连带旧名", "连带新名"), 1);
  assert.ok(store.getPrompt(p.id).tags.includes("连带新名"));
});

// ─────────────────────────────────────────────────────────────────────────────
// 超限淘汰：N5 + N6（本文件最后一个用例，会清空全库以构造受控数据集）
// ─────────────────────────────────────────────────────────────────────────────
test("淘汰：N5 未超限不删；N6 aiRefined=0 优先于更旧的 aiRefined=1", async () => {
  const total = store.listPrompts().length;
  assert.deepEqual(store.enforceMaxCount(total + 50), [], "N5：未超限必须一条都不删");
  assert.equal(store.listPrompts().length, total);

  // 构造唯一的受控数据集：A 未使用但已 AI 优化；B 较新且被使用过
  for (const p of store.listPrompts()) store.deletePrompt(p.id);
  store.emptyTrash();
  assert.equal(store.listPrompts().length, 0);

  const A = store.createPrompt({ title: "A 已优化", body: "a" });
  store.updatePrompt(A.id, { body: "a2" }, { aiWriteBack: true });
  await pause();
  const B = store.createPrompt({ title: "B 未优化", body: "b" });
  store.recordUsage(B.id);

  const evicted = store.enforceMaxCount(1);
  assert.deepEqual(
    evicted,
    [B.id],
    "N6：aiRefined=0 的行必须先被淘汰——即使它比 aiRefined=1 的行更新（规格 §4.4，非上游的 usageCount 升序）",
  );
  assert.ok(store.getPrompt(A.id), "aiRefined=1 的行不得被提前淘汰");
  assert.equal(store.getPrompt(B.id), undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
// 淘汰的孤儿标签清理（D-P6-6 / R37）：与 enforceMaxCount 同事务，且不越界到软删除路径
// ─────────────────────────────────────────────────────────────────────────────
test("淘汰同事务清理孤儿标签：count===0 的被清掉，仍被引用的不被误删", () => {
  // 自持数据集（不依赖上一条用例的残留）
  for (const p of store.listPrompts()) store.deletePrompt(p.id);
  store.emptyTrash();
  assert.equal(store.listPrompts().length, 0);

  const doomed = store.createPrompt({ title: "注定淘汰", body: "d", tags: ["孤儿候选"] });
  const keeper = store.createPrompt({ title: "必须保留", body: "k", tags: ["在用候选"] });
  // keeper 已 AI 优化 → 排序在后，不会被淘汰（only 1 victim）。
  store.updatePrompt(keeper.id, { body: "k2" }, { aiWriteBack: true });

  const before = store.listTags().find((t) => t.name === "孤儿候选");
  assert.ok(before, "构造前提：孤儿候选标签必须已在字典表");
  assert.equal(before.count, 1);

  const evicted = store.enforceMaxCount(1);
  assert.deepEqual(evicted, [doomed.id], "aiRefined=0 的 doomed 必须先被淘汰");

  assert.ok(
    !store.listTags().some((t) => t.name === "孤儿候选"),
    "D-P6-6：淘汰后 count===0 的标签必须在同一事务内被清理",
  );
  assert.deepEqual(
    store.listTags().find((t) => t.name === "在用候选"),
    { name: "在用候选", count: 1 },
    "仍被引用的标签不得被误删（计数也不得漂移）",
  );
});

test("孤儿标签清理不越界：软删除（进回收站）不清标签，恢复后标签仍在", () => {
  const p = store.createPrompt({ title: "软删除不动标签", body: "s", tags: ["软删标签"] });
  store.deletePrompt(p.id);
  assert.ok(
    store.listTags().some((t) => t.name === "软删标签"),
    "R37：软删除不是淘汰——标签必须留在字典表（否则恢复后引用就没了）",
  );
  assert.equal(store.restorePrompts([p.id]), 1);
  assert.ok(store.getPrompt(p.id).tags.includes("软删标签"), "恢复后引用完整");
});
