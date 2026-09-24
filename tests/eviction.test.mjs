/**
 * 淘汰预检的「双跑对照」（§13.9 四 / T4 约束 E）：`previewEvictions` 与真实
 * `store.enforceMaxCount` 在同一组输入下必须**逐 id 相等**。
 *
 * 隔离：本文件在自己的进程里把 `DSH_HOME` 指向临时目录后再 import store
 * （与 tests/store.test.mjs 同一手法，生产代码无 test-only API）。
 *
 * 对照口径：`previewEvictions(prompts, max, incoming)` ≡ `enforceMaxCount(max - incoming)`
 * ——后者删掉的就是「先落库 incoming 条、再按 max 淘汰」会删掉的那一批。
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, after } from "node:test";
import assert from "node:assert/strict";

const home = mkdtempSync(join(tmpdir(), "dpe-evict-"));
process.env.DSH_HOME = home; // ← 必须在 import store 之前
const store = await import("../src/host/store.ts");
const { previewEvictions } = await import("../src/client/utils/eviction.ts");

after(() => rmSync(home, { recursive: true, force: true }));

/** 毫秒级排序断言需要可控的时间差（同一毫秒会让次序不确定）。 */
const pause = () => new Promise((r) => setTimeout(r, 5));

/** 合成一条最小 Prompt（previewEvictions 只读 id / aiRefined / lastUsedAt）。 */
const mk = (id, aiRefined, lastUsedAt) => ({
  id,
  title: id,
  body: "",
  tags: [],
  aiRefined,
  aiRefinedAt: 0,
  createdAt: 0,
  updatedAt: 0,
  usageCount: 0,
  lastUsedAt,
  skillExportedAt: 0,
});

/** 清空全库（含回收站），换来自持的数据集。 */
function wipe() {
  for (const p of store.listPrompts()) store.deletePrompt(p.id);
  store.emptyTrash();
}

/**
 * 受控数据集：P1 / P2 都是 `aiRefined=0`（候选），P3 是 `aiRefined=1`（受保护）。
 *
 * 关键构造：**lastUsedAt 与 updatedAt 的次序相反**——P1 的 lastUsedAt 更小（更旧）但 updatedAt
 * 更大（更晚创建）。于是「第二个排序键 = lastUsedAt」与「= updatedAt」给出**不同**的受害者：
 * 变异验证 ②（把第二键改成 updatedAt）就靠它必然变红。
 */
async function buildDataset() {
  wipe();
  const p2 = store.createPrompt({ title: "P2 晚用", body: "2" }); // updatedAt 较早
  await pause();
  const p1 = store.createPrompt({ title: "P1 早用", body: "1" }); // updatedAt 较新
  const p3 = store.createPrompt({ title: "P3 已优化", body: "3" });
  store.updatePrompt(p3.id, { body: "3-refined" }, { aiWriteBack: true }); // aiRefined = 1
  store.recordUsage(p1.id); // P1.lastUsedAt：较早
  await pause();
  store.recordUsage(p2.id); // P2.lastUsedAt：较晚
  return { p1, p2, p3 };
}

// ─────────────────────────────────────────────────────────────────────────────
// 双跑对照
// ─────────────────────────────────────────────────────────────────────────────
test("双跑对照（incoming=1）：预演与真实淘汰逐 id 相等，且命中 lastUsedAt 最旧的 aiRefined=0 行", async () => {
  const { p1, p2, p3 } = await buildDataset();
  const maxCount = 3; // 3 条 + 1 条新 = 超 1 条

  const before = store.listPrompts();
  const predicted = previewEvictions(before, maxCount, 1).map((p) => p.id);
  const actual = store.enforceMaxCount(maxCount - 1); // ≡ 先落库 1 条再按 maxCount 淘汰

  assert.deepEqual(predicted, [p1.id], "必须是 aiRefined=0 且 lastUsedAt 最旧的 P1");
  assert.deepEqual(predicted, actual, "双跑对照：同一组输入下预演与实际受害者必须逐 id 相等");
  assert.equal(store.getPrompt(p1.id), undefined, "P1 已被真实淘汰");
  assert.ok(store.getPrompt(p2.id), "P2 仍在（只超 1 条）");
  assert.ok(store.getPrompt(p3.id), "aiRefined=1 的行不得被淘汰");
});

test("双跑对照（incoming>1）：多受害者时次序也逐 id 相等（aiRefined 升序 → lastUsedAt 升序）", async () => {
  const { p1, p2, p3 } = await buildDataset();
  const maxCount = 4;
  const incoming = 3; // 3 条 + 3 条新 - 4 = 2 名受害者

  const before = store.listPrompts();
  const predicted = previewEvictions(before, maxCount, incoming).map((p) => p.id);
  const actual = store.enforceMaxCount(maxCount - incoming);

  assert.deepEqual(predicted, [p1.id, p2.id], "两名候选按 lastUsedAt 升序：先 P1、后 P2；P3 受保护");
  assert.deepEqual(predicted, actual, "多受害者时也必须逐 id 相等（含次序）");
  assert.ok(store.getPrompt(p3.id));
});

test("未超限：length + incoming <= maxCount 时预演为空，真实淘汰也一条不删（边界含 length === maxCount）", async () => {
  await buildDataset();
  const before = store.listPrompts();

  assert.deepEqual(previewEvictions(before, before.length + 1, 1), [], "未超限必须空结果");
  assert.deepEqual(store.enforceMaxCount(before.length), [], "对照：该情形下真实淘汰也必须为空");
  assert.equal(store.listPrompts().length, before.length, "一条都不许删");

  // 边界：恰好等于上限时，再新增 1 条就会触发淘汰 → 预检必须报出 1 名受害者
  assert.equal(previewEvictions(before, before.length, 1).length, 1, "length === maxCount 时必须预演出 1 名受害者");
});

// ─────────────────────────────────────────────────────────────────────────────
// 稳定性（同 aiRefined 且同 lastUsedAt）
// ─────────────────────────────────────────────────────────────────────────────
test("稳定性：并列键按输入次序取前 N；同输入 → 逐 id 相等（两端依赖的同一个不变量）", () => {
  const tied = [mk("a", false, 0), mk("b", false, 0), mk("c", false, 0), mk("p", true, 0)];

  const first = previewEvictions(tied, 4, 1).map((p) => p.id);
  assert.deepEqual(first, ["a"], "并列键时取输入数组的第一个（ES2019 起 Array.prototype.sort 稳定）");
  assert.deepEqual(
    previewEvictions(tied, 4, 1).map((p) => p.id),
    first,
    "同输入必须给出逐 id 相同的结果（可重复，不是随机挑一个）",
  );
  assert.deepEqual(
    previewEvictions(tied, 3, 1).map((p) => p.id),
    ["a", "b"],
    "同一次预演的多名受害者同样保持输入次序",
  );
  assert.deepEqual(
    previewEvictions(tied, 0, 1).map((p) => p.id),
    ["a", "b", "c", "p"],
    "aiRefined=true 的行排在全部候选之后（即使 lastUsedAt 完全并列也不得越位）",
  );

  const dup = [mk("x", false, 0), mk("y", false, 0), mk("z", false, 0)];
  assert.deepEqual(
    previewEvictions(dup, 1, 0).map((p) => p.id),
    ["x", "y"],
    "全部并列时受害者即输入数组的前 N 个",
  );
});

test("不改动入参：previewEvictions 不得就地排序调用方给的数组", () => {
  const prompts = [mk("late", false, 100), mk("early", false, 1)];
  const ids = prompts.map((p) => p.id);
  previewEvictions(prompts, 1, 0);
  assert.deepEqual(prompts.map((p) => p.id), ids, "入参数组的顺序必须原样保留（内部先复制）");
});

// ─────────────────────────────────────────────────────────────────────────────
// 修复轮 1（评审阻断项）：客户端读到的顺序 ≠ 存储层的行序
//
// 客户端读 `GET /prompts`（api.listPrompts 不传 sort → 宿主的 default 排序 = 最新优先），
// 而 `enforceMaxCount` 读 `selectAllPrompts()`（无 ORDER BY = 插入序）。同一集合、**不同顺序**：
// 键并列时排序稳定性只会各自保持输入序，两端就会给出不同的受害者（实测：弹窗报最新的一条、
// 实际物理删除最旧的一条）。下面三组用例分别锁住「复现场景 / ≥4 条并列 / createdAt 也并列」。
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 把全库 `createdAt` 统一成同一个值。
 *
 * store 的公开 API 不写 `createdAt`（不在 PUT 白名单），但**导入**路径会把备份里的 `createdAt`
 * 原样写入（`store.ts#validateBackup`），故「createdAt 并列」是**可达状态**，不是人为构造的边角。
 * 这里直接对临时库执行 UPDATE 来造它（与 tests/store.test.mjs 的 schema 用例同一手法）。
 */
async function flattenCreatedAt(value) {
  const { DatabaseSync } = await import("node:sqlite");
  const { dbPath } = await import("../src/host/paths.ts");
  const db = new DatabaseSync(dbPath());
  try {
    db.prepare("UPDATE prompts SET createdAt = ?").run(value);
  } finally {
    db.close();
  }
}

test("修复轮 1 ① 复现场景：客户端最新优先、存储层插入序，全并列下双跑仍逐 id 相等", async () => {
  wipe();
  const a = store.createPrompt({ title: "A 最旧", body: "a" });
  await pause();
  const b = store.createPrompt({ title: "B 中间", body: "b" });
  await pause();
  const c = store.createPrompt({ title: "C 最新", body: "c" });

  const clientOrder = store.listPrompts(); // = GET /prompts 的真实顺序
  assert.deepEqual(
    clientOrder.map((p) => p.id),
    [c.id, b.id, a.id],
    "前提：客户端顺序是「最新优先」，与存储层插入序正好相反（这正是故障的土壤）",
  );
  assert.ok(
    clientOrder.every((p) => !p.aiRefined && p.lastUsedAt === 0),
    "前提：新建的 lastUsedAt 恒为 0 → 三条在 (aiRefined, lastUsedAt) 上完全并列",
  );

  const predicted = previewEvictions(clientOrder, 3, 1).map((p) => p.id);
  const actual = store.enforceMaxCount(3 - 1); // ≡ 落库 1 条后按上限 3 淘汰
  assert.deepEqual(predicted, [a.id], "全序第三键 createdAt 升序 → 命中最旧的那条（不是客户端顺序的第一条）");
  assert.deepEqual(predicted, actual, "双跑对照：弹窗列的受害者必须 = 实际被物理删除的对象");
});

test("修复轮 1 ② 五条 lastUsedAt=0 / aiRefined=false 的并列集：双跑逐 id 相等，淘汰最旧的两条", async () => {
  wipe();
  const ids = [];
  for (let i = 0; i < 5; i += 1) {
    ids.push(store.createPrompt({ title: "并列 " + i, body: "x" + i }).id);
    await pause();
  }
  const clientOrder = store.listPrompts();
  assert.equal(
    clientOrder.filter((p) => !p.aiRefined && p.lastUsedAt === 0).length,
    5,
    "前提：五条在 (aiRefined, lastUsedAt) 上全部并列（≥4 条）",
  );

  const predicted = previewEvictions(clientOrder, 5, 2).map((p) => p.id);
  const actual = store.enforceMaxCount(5 - 2); // 2 名受害者
  assert.deepEqual(predicted, [ids[0], ids[1]], "并列时按 createdAt 升序淘汰最旧的两条");
  assert.deepEqual(predicted, actual, "双跑对照：并列集也必须逐 id 相等（含次序）");
});

test("修复轮 1 ③ createdAt 也全部并列（导入可达）：id 兜底键给出同一名受害者", async () => {
  wipe();
  const a = store.createPrompt({ title: "同刻 A", body: "a" });
  await pause();
  const b = store.createPrompt({ title: "同刻 B", body: "b" });
  await pause();
  const c = store.createPrompt({ title: "同刻 C", body: "c" });

  // 早于 FRESH_MS：让 default 排序走 tail 分支（按 updatedAt desc），客户端顺序与插入序相反。
  await flattenCreatedAt(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const clientOrder = store.listPrompts();
  assert.equal(new Set(clientOrder.map((p) => p.createdAt)).size, 1, "前提：createdAt 全部并列");
  assert.deepEqual(
    clientOrder.map((p) => p.id),
    [c.id, b.id, a.id],
    "前提：客户端顺序（最新更新优先）与存储层插入序相反",
  );

  const predicted = previewEvictions(clientOrder, 3, 1).map((p) => p.id);
  const actual = store.enforceMaxCount(3 - 1);
  assert.deepEqual(
    predicted,
    actual,
    "createdAt 并列时必须由 id 兜底键决出同一名受害者（删掉 id 键本用例必红）",
  );
  assert.deepEqual(
    previewEvictions(clientOrder, 3, 1).map((p) => p.id),
    predicted,
    "同输入必须给出同一结果（可重复）",
  );
  assert.equal(store.getPrompt(predicted[0]), undefined, "该受害者确实被物理删除");
});

