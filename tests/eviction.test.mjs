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
