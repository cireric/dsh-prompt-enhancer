import { test } from "node:test";
import assert from "node:assert/strict";

const { MAX_BACKUP_BYTES, parseBackupFile, classifyImportResult, clearOverwrittenMeta } = await import(
  "../src/client/utils/transfer.ts"
);
// B 的「清键」由调用方注入；组合形态用**既有**入口 deletePrompts（真实现）验一次请求形状。
const { deletePrompts } = await import("../src/client/utils/ai-flow.ts");

// 体积上限口径：5 MiB，单位是**字节**（与浏览器 File.size 同单位）。
test("transfer：MAX_BACKUP_BYTES 是 5 MiB（字节）", () => {
  assert.equal(MAX_BACKUP_BYTES, 5 * 1024 * 1024);
});

// 体积闸的唯一焦点：边界取 ">"，即**恰好等于上限放行**（改成 ">=" 这条必红）。
test("体积闸边界：恰好等于上限 → 放行", () => {
  const parsed = parseBackupFile("{}", MAX_BACKUP_BYTES);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.backup, {});
});

test("体积闸：上限 +1 字节 → tooLarge，detail 同时给出实际值与上限", () => {
  const parsed = parseBackupFile("{}", MAX_BACKUP_BYTES + 1);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.errorKey, "transfer.tooLarge");
  // A10：detail 是**纯数据**「实际值/上限」，故断言精确相等（比旧的 includes 更强——它把整个值钉死），
  // 并额外钉住「不得含中文」：旧实现把「文件 N 字节，超过上限 M 字节」写进 detail，en 语言下会显示中文。
  assert.equal(parsed.detail, `${MAX_BACKUP_BYTES + 1}/${MAX_BACKUP_BYTES}`);
  assert.doesNotMatch(parsed.detail, /[\u4e00-\u9fff]/, "detail 不得含中文：措辞由 transfer.tooLarge 承担（A10）");
});

// 顺序不可换：超限文件即使不是合法 JSON 也必须先被体积闸拒绝（不解析）。
test("两道闸的顺序：超限 + 非法 JSON → tooLarge（先体积后解析）", () => {
  const parsed = parseBackupFile("{ 这不是 JSON", MAX_BACKUP_BYTES + 1);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.errorKey, "transfer.tooLarge");
});

test("JSON.parse 失败 → badJson，detail 是解析器原文（非空）", () => {
  const parsed = parseBackupFile("{ not json", 10);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.errorKey, "transfer.badJson");
  assert.equal(typeof parsed.detail, "string");
  assert.notEqual(parsed.detail.trim(), "");
});

// 信封判定归宿主（validateBackup 在 store.ts）：合法 JSON 一律**原样透传**，客户端不重塑、不校验。
// 这条边界断言挡住「顺手在客户端复制一份校验」造成的第二处真源。
test("只做两道闸：合法 JSON 对象原样透传，backup 与解析结果同构", () => {
  const source = { hello: 1, nested: [{ text: "中" }] };
  const parsed = parseBackupFile(JSON.stringify(source), 1024);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.backup, source);
});

// ── 确认导入后的回执分类（A9 / R40）──────────────────────────────────────────
//
// 宿主 POST /import 的成功信封有两种：{ok:true, applied:false, stats} 是**预览**（只算条数、
// 没落库），{ok:true, applied:true, stats} 才是落库。只认 ok 就会把「宿主只回预览」渲染成
// 「导入完成」= 静默假成功，故成功判据只有一个：applied === true。
// 让 classifyImportResult 忽略 applied（恒返回 {ok:true}），下面两条必红。

test("classifyImportResult：applied === true → ok（真的落库了）", () => {
  assert.deepEqual(classifyImportResult({ ok: true, applied: true, stats: { added: 1, overwritten: 0, total: 1 } }), {
    ok: true,
  });
});

test("classifyImportResult：applied 不是严格 true（false / 缺失 / 字符串 / 数字）→ 一律不 ok", () => {
  const stats = { added: 2, overwritten: 1, total: 3 };
  for (const applied of [false, undefined, "true", 1]) {
    const verdict = classifyImportResult({ ok: true, applied, stats });
    assert.equal(verdict.ok, false, "applied=" + String(applied) + " 不得当成落库成功（宿主只回预览）");
    assert.equal(verdict.errorKey, "manager.transfer.importFailed", "失败必须给出 i18n 键，由渲染点翻译");
  }
});

// ── B（重要-2 / R-P7-AE 的另一个入口）：导入覆盖同 id ⇒ 让方向记录失效 ──────────────
//
// 根因链：宿主 `importPrompts` 是 INSERT OR REPLACE（连 `body`/`sourceBody` 一起换）、备份格式
// **不含 meta**、导入也**不清 meta** ⇒ 恢复旧备份后「原文／优化稿」标注会自信地反相，且切换修不回来。
// 故：对「被本次导入**覆盖**（同 id 已存在）的 id」清那两把 per-prompt 键。
//
// **变异靶**：把 `clearOverwrittenMeta` 里的 `await clear(overwritten)` 去掉（或让 overwritten 恒为空）
// ⇒ 下面第一条必红。

test("B：导入覆盖同 id ⇒ 只对被覆盖的 id 发清键调用；导入新 id（库里没有）⇒ 一次都不发（反面对照）", async () => {
  const backup = {
    version: 1,
    prompts: [
      { id: "a", body: "备份里的 a" },
      { id: "fresh", body: "库里没有这条" },
    ],
    tags: [],
  };
  const cleared = [];
  const clear = async (ids) => {
    cleared.push(...ids);
  };

  const overwritten = await clearOverwrittenMeta(backup, ["a", "b"], clear);
  assert.deepEqual(overwritten, ["a"], "被覆盖 = 备份 ∩ **导入前**的现库；fresh 不在库里 ⇒ 不算");
  assert.deepEqual(cleared, ["a"], "只对 a 发出清键调用");

  const none = await clearOverwrittenMeta(backup, ["b", "c"], clear);
  assert.deepEqual(none, [], "库里没有备份里的任何 id ⇒ 没有任何覆盖");
  assert.deepEqual(cleared, ["a"], "反面对照：新 id 一把键都不清（clear 一次都不调）");

  // 现库为空（全新库导入）同样是「没有覆盖」。
  const empty = await clearOverwrittenMeta(backup, [], clear);
  assert.deepEqual(empty, []);
  assert.deepEqual(cleared, ["a"]);
});

test("B：清键走**既有**入口 deletePrompts ⇒ 每个被覆盖 id 恰好两把键（方向 + 技能 descriptor）", async () => {
  const backup = { version: 1, prompts: [{ id: "p1" }, { id: "p2" }], tags: [] };
  const keys = [];
  const overwritten = await clearOverwrittenMeta(backup, ["p1", "p2", "left-alone"], (ids) =>
    deletePrompts({
      ids,
      irreversible: true,
      // 导入是宿主的原子事务：客户端没有任何东西要再删一次 ⇒ 已完成标记（与 capture.ts 同款）。
      remove: async () => {},
      deleteMeta: async (key) => {
        keys.push(key);
        return { key, deleted: true };
      },
    }),
  );
  assert.deepEqual(overwritten, ["p1", "p2"], "left-alone 不在备份里 ⇒ 不进清算名单");
  assert.deepEqual(
    keys,
    ["pl:refined-dir:p1", "pl:skill-descriptor:p1", "pl:refined-dir:p2", "pl:skill-descriptor:p2"],
    "每个被覆盖 id 各清两把键（键名取自各自主模块，不另抄一份）",
  );
});

test("B：备份形状不认识（非对象 / prompts 非数组）⇒ 一把键都不清，且可见地 warn（不静默）", async () => {
  for (const backup of [null, "不是对象", {}, { prompts: "不是数组" }, { prompts: null }]) {
    const calls = [];
    const warns = [];
    const original = console.warn;
    console.warn = (...args) => warns.push(args.map(String).join(" "));
    let out;
    try {
      out = await clearOverwrittenMeta(backup, ["a"], async (ids) => {
        calls.push(...ids);
      });
    } finally {
      console.warn = original;
    }
    assert.deepEqual(out, [], "形状漂移（" + JSON.stringify(backup) + "）⇒ 什么都不清");
    assert.deepEqual(calls, [], "「少清」只是残留；「多清」会毁掉一条本来正确、用户无法重建的记录");
    assert.equal(warns.length, 1, "契约漂移必须可见（不得静默）");
  }
});

test("B：备份里的重复 / 非法 id ⇒ 去重、跳过非字符串与空串（不猜、不补）", async () => {
  const backup = { prompts: [{ id: "a" }, { id: "a" }, { id: "" }, { id: 7 }, { body: "没有 id" }, "裸字符串"] };
  const seen = [];
  const out = await clearOverwrittenMeta(backup, ["a", "b"], async (ids) => {
    seen.push(...ids);
  });
  assert.deepEqual(out, ["a"]);
  assert.deepEqual(seen, ["a"], "同一个 id 只发一次清键调用");
});
