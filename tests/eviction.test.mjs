/**
 * 淘汰预检的「真实序列对照」（§13.9 四 / T4 约束 E、T8 约束 C/R45b）：`previewEvictions` 与宿主
 * `store.enforceMaxCount` 必须**逐 id 相等**，且**刚保存的那一条必须存活**。
 *
 * 隔离：本文件在自己的进程里把 `DSH_HOME` 指向临时目录后再 import store
 * （与 tests/store.test.mjs 同一手法，生产代码无 test-only API）。
 *
 * ⚠️ **对照口径（T8/R45b 订正）**：复刻 `POST /prompts` 的**真实调用序**——
 *   ① `listPrompts()` 取插入前集合 → ② `previewEvictions(before, max, 1)` 预演
 *   → ③ **真的插入**一条新项（`createPrompt`）→ ④ **真的** `enforceMaxCount(max, { exceptId: created.id })`。
 *
 * **旧口径已废止**：`previewEvictions(prompts, max, incoming) ≡ enforceMaxCount(max - incoming)`
 * 把「在插入**前**集合上降低上限」当成了「先插入、再按 max 淘汰」的等价物——两者在**候选集合**上
 * 根本不同：宿主读到的是插入**后**的集合（含新项），而新项的键
 * `(aiRefined=false, lastUsedAt=0)` 是候选最小元，于是旧实现必然淘汰**刚保存的那条**，
 * 预演却只能列出既有条目（T7 活体验收 C10 = FAIL / D-1）。这句错误的等价关系正是漏检的文字证据；
 * R45 的 `exceptId` 豁免让本文件的用例第一次能钉住它。
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

/**
 * 复刻 `POST /prompts` 的**真实调用序**（T8/R45b）：
 *   ① `listPrompts()`（= 客户端预演看到的集合与顺序）→ ② `previewEvictions(before, max, 1)`
 *   → ③ **真的插入**一条新项（`createPrompt`，键恒为 `aiRefined=false / lastUsedAt=0`）
 *   → ④ **真的** `enforceMaxCount(max, { exceptId: created.id })`。
 *
 * `predicted` = 二次确认框会列出的受害者；`actual` = 宿主真正物理删除的 id（按淘汰次序）。
 * 新项**不豁免**时 ④ 必然先删它自己 —— 这正是 D-1 的复现路径。
 */
function saveThroughRoute(maxCount) {
  const before = store.listPrompts();
  const predicted = previewEvictions(before, maxCount, 1).map((p) => p.id);
  const created = store.createPrompt({ title: "刚刚保存的一条", body: "new" });
  const actual = store.enforceMaxCount(maxCount, { exceptId: created.id });
  return { before, predicted, actual, created };
}

// ─────────────────────────────────────────────────────────────────────────────
// 双跑对照
// ─────────────────────────────────────────────────────────────────────────────
test("真实序列（max=3）：预演与真实淘汰逐 id 相等、新项存活，且命中 lastUsedAt 最旧的 aiRefined=0 行", async () => {
  const { p1, p2, p3 } = await buildDataset();
  const maxCount = 3; // 3 条既有 + 1 条新 = 超 1 条

  const { predicted, actual, created } = saveThroughRoute(maxCount);

  assert.deepEqual(predicted, [p1.id], "必须是 aiRefined=0 且 lastUsedAt 最旧的 P1（不是刚保存的新项）");
  assert.deepEqual(predicted, actual, "真实序列对照：确认框所列与实际受害者必须逐 id 相等");
  assert.ok(store.getPrompt(created.id), "R45：刚保存的那条必须存活（去掉 exceptId 豁免后这里必红）");
  assert.equal(store.getPrompt(p1.id), undefined, "P1 已被真实淘汰");
  assert.ok(store.getPrompt(p2.id), "P2 仍在（只超 1 条）");
  assert.ok(store.getPrompt(p3.id), "aiRefined=1 的行不得被淘汰");
  assert.deepEqual(
    store.listPrompts().map((p) => p.id).sort(),
    [created.id, p2.id, p3.id].sort(),
    "存活集合必须恰好剩 maxCount 条（计数若按「剔除后的集合」算会少淘汰一条 → 这里必红）",
  );
});

test("真实序列（max=2，多受害者）：次序也逐 id 相等（aiRefined 升序 → lastUsedAt 升序）", async () => {
  const { p1, p2, p3 } = await buildDataset();
  // 上限被（设置或导入后）压到 2：一次保存就超 2 条 —— 这是多受害者唯一可达的真实路径
  // （每次 POST 只插入 1 条，故 incoming 恒为 1；旧用例的 incoming=3 不对应任何真实序列）。
  const maxCount = 2;

  const { predicted, actual, created } = saveThroughRoute(maxCount);

  assert.deepEqual(predicted, [p1.id, p2.id], "两名候选按 lastUsedAt 升序：先 P1、后 P2；P3 受保护");
  assert.deepEqual(predicted, actual, "多受害者时也必须逐 id 相等（含次序）");
  assert.ok(store.getPrompt(created.id), "R45：多受害者场景下新项同样不得成为受害者");
  assert.ok(store.getPrompt(p3.id));
  assert.deepEqual(store.listPrompts().map((p) => p.id).sort(), [created.id, p3.id].sort(), "存活集合 = maxCount 条");
});

test("未超限：length + incoming <= maxCount 时预演为空，真实淘汰也一条不删（边界含 length === maxCount）", async () => {
  await buildDataset();
  const before = store.listPrompts();

  assert.deepEqual(previewEvictions(before, before.length + 1, 1), [], "未超限必须空结果");
  // 恰好等于上限时，未超限的判定与 exceptId 无关（`all.length <= maxCount` 先短路），故这里不传 options。
  assert.deepEqual(store.enforceMaxCount(before.length), [], "对照：该情形下真实淘汰也必须为空");
  assert.equal(store.listPrompts().length, before.length, "一条都不许删");

  // 边界：恰好等于上限时，再新增 1 条就会触发淘汰 → 预检必须报出 1 名受害者
  assert.equal(previewEvictions(before, before.length, 1).length, 1, "length === maxCount 时必须预演出 1 名受害者");
});

// ─────────────────────────────────────────────────────────────────────────────
// 并列兜底（aiRefined / lastUsedAt / createdAt 全并列，只剩 id 裁决）
//
// A7（R38）：本用例原先声称「并列键时取**输入数组**的第一个」——那是补 id 兜底键**之前**的行为。
// 比较器现已全序化（见 eviction.ts 顶部：… → createdAt 升序 → id 升序），而旧夹具恰好是
// 「id 次序 = 输入次序」（输入 [a,b,c]），于是用例**只靠巧合**通过：同样三条数据以 [c,b,a]
// 传入时实现返回 a，而不是输入首元素 c。现改为如实描述规则（并列由 id 升序兜底），并把夹具
// 顺序**反向**（输入首元素是 id 最大的 c），使它不再依赖巧合。
// ─────────────────────────────────────────────────────────────────────────────
test("稳定性：并列键由 id 升序裁决（与输入次序无关）；同输入 → 逐 id 相等", () => {
  // 夹具顺序刻意与预期反向：输入首元素是 id 最大的 "c"，而受害者是末元素 "a"。
  const tied = [mk("c", false, 0), mk("b", false, 0), mk("a", false, 0), mk("p", true, 0)];

  const first = previewEvictions(tied, 4, 1).map((p) => p.id);
  assert.deepEqual(first, ["a"], "并列键由 id 升序裁决——不是输入数组的第一个（那是 c）");
  assert.deepEqual(
    previewEvictions(tied, 4, 1).map((p) => p.id),
    first,
    "同输入必须给出逐 id 相同的结果（可重复，不是随机挑一个）",
  );
  assert.deepEqual(
    previewEvictions([...tied].reverse(), 4, 1).map((p) => p.id),
    first,
    "把输入数组倒过来，受害者不变——结果只由键决定，与输入次序无关",
  );
  assert.deepEqual(
    previewEvictions(tied, 3, 1).map((p) => p.id),
    ["a", "b"],
    "同一次预演的多名受害者同样按 id 升序",
  );
  assert.deepEqual(
    previewEvictions(tied, 0, 1).map((p) => p.id),
    ["a", "b", "c", "p"],
    "aiRefined=true 的行排在全部候选之后（即使 lastUsedAt 完全并列也不得越位）",
  );

  // 另一组全并列夹具（输入序 z/y/x ≠ id 次序）：受害者必须是 id 升序的前 N 个。
  const dup = [mk("z", false, 0), mk("y", false, 0), mk("x", false, 0)];
  assert.deepEqual(
    previewEvictions(dup, 1, 0).map((p) => p.id),
    ["x", "y"],
    "全部并列时受害者 = id 升序的前 N 个（不是输入数组的前 N 个：那是 z、y）",
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

test("修复轮 1 ① 复现场景：客户端最新优先、存储层插入序，全并列下真实序列仍逐 id 相等", async () => {
  wipe();
  const a = store.createPrompt({ title: "A 最旧", body: "a" });
  await pause();
  const b = store.createPrompt({ title: "B 中间", body: "b" });
  await pause();
  const c = store.createPrompt({ title: "C 最新", body: "c" });

  const { before: clientOrder, predicted, actual, created } = saveThroughRoute(3);
  assert.deepEqual(
    clientOrder.map((p) => p.id),
    [c.id, b.id, a.id],
    "前提：客户端顺序是「最新优先」，与存储层插入序正好相反（这正是故障的土壤）",
  );
  assert.ok(
    clientOrder.every((p) => !p.aiRefined && p.lastUsedAt === 0),
    "前提：新建的 lastUsedAt 恒为 0 → 三条在 (aiRefined, lastUsedAt) 上完全并列",
  );

  assert.deepEqual(predicted, [a.id], "全序第三键 createdAt 升序 → 命中最旧的那条（不是客户端顺序的第一条）");
  assert.deepEqual(predicted, actual, "对照：弹窗列的受害者必须 = 实际被物理删除的对象");
  assert.ok(store.getPrompt(created.id), "R45：刚保存的那条必须存活");
  assert.deepEqual(store.listPrompts().map((p) => p.id).sort(), [created.id, b.id, c.id].sort(), "存活集合 = maxCount 条");
});

test("修复轮 1 ② 五条 lastUsedAt=0 / aiRefined=false 的并列集：真实序列逐 id 相等，淘汰最旧的两条", async () => {
  wipe();
  const ids = [];
  for (let i = 0; i < 5; i += 1) {
    ids.push(store.createPrompt({ title: "并列 " + i, body: "x" + i }).id);
    await pause();
  }
  // 上限 4 + 5 条既有 + 1 条新 = 2 名受害者（多受害者场景）。
  const { before: clientOrder, predicted, actual, created } = saveThroughRoute(4);
  assert.equal(
    clientOrder.filter((p) => !p.aiRefined && p.lastUsedAt === 0).length,
    5,
    "前提：五条在 (aiRefined, lastUsedAt) 上全部并列（≥4 条）",
  );

  assert.deepEqual(predicted, [ids[0], ids[1]], "并列时按 createdAt 升序淘汰最旧的两条");
  assert.deepEqual(predicted, actual, "对照：并列集也必须逐 id 相等（含次序）");
  assert.ok(store.getPrompt(created.id), "R45：新项不得进入受害者名单");
  assert.deepEqual(
    store.listPrompts().map((p) => p.id).sort(),
    [created.id, ids[2], ids[3], ids[4]].sort(),
    "存活集合 = maxCount 条",
  );
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

  const { before: clientOrder, predicted, actual, created } = saveThroughRoute(3);
  assert.equal(new Set(clientOrder.map((p) => p.createdAt)).size, 1, "前提：createdAt 全部并列");
  assert.deepEqual(
    clientOrder.map((p) => p.id),
    [c.id, b.id, a.id],
    "前提：客户端顺序（最新更新优先）与存储层插入序相反",
  );

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
  assert.ok(store.getPrompt(created.id), "R45：createdAt 并列时新项同样存活");
});

