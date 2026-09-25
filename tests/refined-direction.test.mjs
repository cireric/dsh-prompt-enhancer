/**
 * 「原文 / 优化稿」方向持久化的单测（P7 T4 / I-1 根治；规格 §4.4、§13.10-五-4）。
 *
 * 这是本任务**唯一可自动化的面**：详情页是 `.tsx`，`node --test` import 不了它（T2 已实测
 * `ERR_UNKNOWN_FILE_EXTENSION`），组件接线归 T5 活体验收——此处不造假断言去覆盖它。被测对象是
 * 组件**真正调用**的那些函数（`src/client/utils/refined-direction.ts`）与写回缝的编排
 * （`src/client/utils/ai-flow.ts#writeBackRefined`），不是平行副本。
 *
 * 语义（R-P7-AC 修复轮 1 之后）：**有记录 ⇒ 如实标注 + 切换落库；无记录（兜底 / 读取中）⇒ 中性
 * （P6 原状）+ 不落库；记录只在 AI 写回缝**成功后**播种（方向 = `refined`）——那一刻写回的
 * `body` 就是优化稿，是唯一无需推断的已知点**。
 *
 * 四次变异验证（报告第 5 节逐次给命令与输出；红集以报告实测为准）：
 *   ① 让兜底来源也落库 ⇒ 「兜底不落库」用例必红；
 *   ② 去掉播种 ⇒ 「写回成功后 meta 里真有 refined」必红；
 *   ③ 让兜底来源仍标注方向 ⇒ 「兜底 ⇒ 中性」用例必红；
 *   ④ 把 seed 移到 update 之前 ⇒ 「写回失败不播种」用例必红。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  UNKNOWN_READING,
  bodyIsOriginal,
  canPersistDirection,
  compareLabelKeys,
  hasTwoBodies,
  loadStoredDirection,
  oppositeDirection,
  parseStoredDirection,
  persistDirectionAfterToggle,
  readRefinedDirection,
  refinedDirectionMetaKey,
  saveRefinedDirection,
  seedRefinedDirection,
} = await import("../src/client/utils/refined-direction.ts");
const { writeBackRefined } = await import("../src/client/utils/ai-flow.ts");
const { skillDescriptorMetaKey } = await import("../src/client/utils/skill-export.ts");
const i18n = await import("../src/client/utils/i18n.ts");

/** 两侧都在的提示词（**故意带上 `aiRefined` 真**：R-P7-AC 之后它必须被忽略）。 */
const twoSides = (over = {}) => ({ body: "优化稿", sourceBody: "原文", aiRefined: true, ...over });
/** 只有一侧（没有第二侧 ⇒ 两栏对比根本不成立）。 */
const singleSide = (over = {}) => ({ body: "唯一的一份", aiRefined: true, ...over });

/** 捕获 console.warn 跑一段（同步 / 异步均可）：脏值与读写 / 播种失败必须**可见**。 */
async function captureWarn(fn) {
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => {
    warnings.push(args.map((arg) => String(arg)).join(" "));
  };
  try {
    return { value: await fn(), warnings };
  } finally {
    console.warn = original;
  }
}

/** 一个只记写入的假 setMeta（用例保持 hermetic：绝不触网）。 */
function recorder() {
  const writes = [];
  return {
    writes,
    setMeta: async (key, value) => {
      writes.push([key, value]);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 键约定：与 T3 同一形态（pl:<用途>:<promptId>），不自创新前缀
// ─────────────────────────────────────────────────────────────────────────────

test("键约定：pl:refined-dir:<promptId>——与 T3 的 pl:skill-descriptor:<id> 同一形态", () => {
  const key = refinedDirectionMetaKey("p1");
  assert.equal(key, "pl:refined-dir:p1");
  // 与 T3 的键**逐段同构**：同一命名空间、同一段数（用途段是两条键的区分位）。
  const parts = key.split(":");
  const t3 = skillDescriptorMetaKey("p1").split(":");
  assert.deepEqual([parts[0], parts.length], [t3[0], t3.length], "应与 T3 的键同首段、同段数");
  assert.deepEqual([parts[0], parts[1], parts[2]], ["pl", "refined-dir", "p1"]);
  assert.equal(refinedDirectionMetaKey("p2"), "pl:refined-dir:p2", "id 必须是键的尾段（每条提示词一个键）");
  // 反面对照：自创前缀 / 换用途段 / 多一段都不是本约定——「沿用 T3 的规矩」要能被判假。
  for (const wrong of [
    "refined-dir:p1",
    "prompt-enhancer:refined-dir:p1",
    "pl:refined-direction:p1",
    "pl:refined-dir:p1:extra",
  ]) {
    assert.notEqual(key, wrong, wrong + " 不是本约定（照 T3 的 pl:<用途>:<promptId>）");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 解析与判定（方向 + 来源）
// ─────────────────────────────────────────────────────────────────────────────

test("hasTwoBodies：sourceBody 非空才算有第二侧（空串 / undefined 都不算）", () => {
  assert.equal(hasTwoBodies({ sourceBody: "原文" }), true);
  assert.equal(hasTwoBodies({ sourceBody: "" }), false);
  assert.equal(hasTwoBodies({}), false);
});

test("parseStoredDirection：只认裸的 original / refined（容忍首尾空白），两个方向解析成**不同的值**", () => {
  assert.equal(parseStoredDirection("original"), "original");
  assert.equal(parseStoredDirection("refined"), "refined");
  assert.equal(parseStoredDirection("  refined\n"), "refined", "只容忍首尾空白");
  assert.notEqual(parseStoredDirection("original"), parseStoredDirection("refined"), "两个方向必须判定不同");
});

test("parseStoredDirection：缺失 / 空串 / 未知值 / 坏 JSON 一律 undefined、**不抛**，且脏值必须可见", async () => {
  const silently = [undefined, "", "   "]; // 本来就没有记录：不是错误，不该 warn
  const dirty = ["none", "ORIGINAL", "Refined", "1", "true", '{"dir":"original"}', '"refined"', "{ oops", '["original"]'];
  for (const raw of silently) {
    const { value, warnings } = await captureWarn(() => parseStoredDirection(raw));
    assert.equal(value, undefined, JSON.stringify(raw) + " 应判为「没有记录」");
    assert.equal(warnings.length, 0, JSON.stringify(raw) + " 不该 warn");
  }
  for (const raw of dirty) {
    const { value, warnings } = await captureWarn(() => parseStoredDirection(raw));
    assert.equal(value, undefined, JSON.stringify(raw) + " 应判为「没有记录」");
    assert.equal(warnings.length, 1, JSON.stringify(raw) + " 是脏值，必须 warn（错误可见）");
  }
  assert.doesNotThrow(() => parseStoredDirection("{ oops"), "坏 JSON 不得抛");
});

test("readRefinedDirection：有记录 ⇒ source=record，方向如实（两个方向各自成立）", () => {
  assert.deepEqual(readRefinedDirection(twoSides(), "original"), { direction: "original", source: "record" });
  assert.deepEqual(readRefinedDirection(twoSides(), "refined"), { direction: "refined", source: "record" });
  assert.notEqual(
    readRefinedDirection(twoSides(), "original").direction,
    readRefinedDirection(twoSides(), "refined").direction,
    "两个方向必须给出不同的判定",
  );
});

test("readRefinedDirection：无记录（缺失 / 空串 / 空白 / 脏值）⇒ source=fallback + none（**不看 aiRefined**）", async () => {
  const { value, warnings } = await captureWarn(() =>
    [undefined, "", "   ", "bogus", "{ oops", '"refined"'].map((stored) => readRefinedDirection(twoSides(), stored)),
  );
  for (const reading of value) {
    assert.deepEqual(reading, { direction: "none", source: "fallback" });
  }
  assert.equal(warnings.length, 3, "三个真脏值（bogus / 坏 JSON / JSON 文本）各 warn 一次");
});

test("R-P7-AC 回归：P6 期切过奇数次的旧记录（无 meta + aiRefined 真）⇒ **中性**，不再自信地标错", () => {
  const p6Old = twoSides(); // aiRefined 真，但**没有**方向记录
  const reading = readRefinedDirection(p6Old, undefined);
  assert.deepEqual(reading, { direction: "none", source: "fallback" });
  assert.equal(compareLabelKeys(reading.direction).neutral, true, "旧记录只能是中性（不假装知道方向）");
  // 反面：被弃用的旧语义（用 aiRefined 推断「正文是优化稿」）会在这里给出 refined——而真值是 original。
  assert.notEqual(reading.direction, "refined", "不得由 aiRefined 推出方向（那正是被固化成反相的入口）");
});

test("readRefinedDirection：只有一侧 ⇒ 恒 fallback + none（meta 里存着方向也不例外）", () => {
  for (const prompt of [singleSide(), singleSide({ sourceBody: "" })]) {
    assert.deepEqual(readRefinedDirection(prompt, "original"), { direction: "none", source: "fallback" });
    assert.deepEqual(readRefinedDirection(prompt, "refined"), { direction: "none", source: "fallback" });
  }
});

test("canPersistDirection：只有 record 可落库；兜底 / 读取中 / 只有一侧一律不可（成对正反）", () => {
  assert.equal(canPersistDirection(readRefinedDirection(twoSides(), "original")), true);
  assert.equal(canPersistDirection(readRefinedDirection(twoSides(), "refined")), true);
  assert.equal(canPersistDirection(readRefinedDirection(twoSides(), undefined)), false, "兜底不可落库");
  assert.equal(canPersistDirection(readRefinedDirection(twoSides(), "bogus")), false, "脏值 = 没有记录");
  assert.equal(canPersistDirection(readRefinedDirection(singleSide(), "original")), false, "只有一侧");
  assert.equal(canPersistDirection(UNKNOWN_READING), false, "读取中");
});

// ─────────────────────────────────────────────────────────────────────────────
// 标注映射（两个方向的标注**必须不同**；兜底只走中性）
// ─────────────────────────────────────────────────────────────────────────────

test("标注映射：**两个方向的标注必须不同**（「恒返回 original」的实现不可能全绿）", () => {
  const asOriginal = compareLabelKeys("original");
  const asRefined = compareLabelKeys("refined");
  assert.notEqual(asOriginal.current, asRefined.current, "左栏标注必须随方向不同");
  assert.notEqual(asOriginal.counterpart, asRefined.counterpart, "右栏标注必须随方向不同");
  assert.deepEqual(asOriginal, {
    current: "manager.compare.original",
    counterpart: "manager.compare.refined",
    neutral: false,
  });
  assert.deepEqual(asRefined, {
    current: "manager.compare.refined",
    counterpart: "manager.compare.original",
    neutral: false,
  });
  // 正反对照：同一方向两次调用必须相等（否则「每次随机挑一支」也能骗过上面两条）。
  assert.deepEqual(compareLabelKeys("original"), asOriginal);
  assert.deepEqual(compareLabelKeys("refined"), asRefined);
});

test("标注映射：none（兜底 / 读取中）走 P6 的中性表述——兜底**只**有这一个出口", () => {
  assert.deepEqual(compareLabelKeys("none"), {
    current: "manager.compare.current",
    counterpart: "manager.compare.counterpart",
    neutral: true,
  });
  // 兜底来源：标注必须中性，且**不能**等于任一方向标注（R-P7-AC：带标记的错误标注仍是错误标注）。
  const fallback = readRefinedDirection(twoSides(), undefined);
  const labels = compareLabelKeys(fallback.direction);
  assert.equal(labels.neutral, true);
  assert.notEqual(labels.current, compareLabelKeys("original").current);
  assert.notEqual(labels.current, compareLabelKeys("refined").current);
  // 正面对照：有记录时**不**中性（否则上面那句在「恒中性」的实现下也成立）。
  assert.equal(compareLabelKeys(readRefinedDirection(twoSides(), "refined").direction).neutral, false);
});

test("标注键在 zh / en 字典里都存在且非空，两个方向的**文案本身**也不同（渲染得出、且真能区分）", () => {
  for (const dir of ["original", "refined", "none"]) {
    const labels = compareLabelKeys(dir);
    for (const key of [labels.current, labels.counterpart]) {
      assert.equal(typeof i18n.zh[key], "string", "zh 缺键 " + key);
      assert.notEqual(i18n.zh[key].trim(), "", "zh 的 " + key + " 不得为空");
      assert.equal(typeof i18n.en[key], "string", "en 缺键 " + key);
      assert.notEqual(i18n.en[key].trim(), "", "en 的 " + key + " 不得为空");
    }
  }
  for (const dict of [i18n.zh, i18n.en]) {
    assert.notEqual(dict["manager.compare.original"], dict["manager.compare.refined"], "原文 / 优化稿的文案必须不同");
  }
});

test("oppositeDirection：swap ⇒ 方向翻转；unknown 翻转后仍是 unknown（不得借机定方向）", () => {
  assert.equal(oppositeDirection("original"), "refined");
  assert.equal(oppositeDirection("refined"), "original");
  assert.equal(oppositeDirection("none"), "none");
  for (const dir of ["original", "refined", "none"]) {
    assert.equal(oppositeDirection(oppositeDirection(dir)), dir, "翻转两次回到原值");
  }
});

test("bodyIsOriginal：只有 original 为真（unknown 不得被当成原文）", () => {
  assert.equal(bodyIsOriginal("original"), true);
  assert.equal(bodyIsOriginal("refined"), false);
  assert.equal(bodyIsOriginal("none"), false, "未知方向不得认成原文（I-1 的错标签形态之一）");
});

// ─────────────────────────────────────────────────────────────────────────────
// 落库：只有 record 来源才写（猜测不得被固化）
// ─────────────────────────────────────────────────────────────────────────────

test("persistDirectionAfterToggle：有记录 ⇒ 写**翻转后的**方向并返回它（两个方向各一条）", async () => {
  const r = recorder();
  assert.equal(await persistDirectionAfterToggle("p1", readRefinedDirection(twoSides(), "original"), r.setMeta), "refined");
  assert.equal(await persistDirectionAfterToggle("p1", readRefinedDirection(twoSides(), "refined"), r.setMeta), "original");
  assert.deepEqual(r.writes, [
    ["pl:refined-dir:p1", "refined"],
    ["pl:refined-dir:p1", "original"],
  ]);
});

test("persistDirectionAfterToggle：兜底来源 ⇒ **一次 setMeta 都不发**（猜测不得被固化）", async () => {
  const r = recorder();
  const reading = readRefinedDirection(twoSides(), undefined);
  assert.equal(await persistDirectionAfterToggle("p1", reading, r.setMeta), undefined);
  assert.deepEqual(r.writes, [], "兜底来源第一次就不许写");
  // 反复切（用户点多少次都一样）：仍然什么都不写 —— 旧记录保持「不知道」，永远看不到错误标注。
  for (let i = 0; i < 3; i += 1) await persistDirectionAfterToggle("p1", reading, r.setMeta);
  assert.deepEqual(r.writes, []);
});

test("persistDirectionAfterToggle：读取中（UNKNOWN_READING）⇒ 不写", async () => {
  const r = recorder();
  assert.equal(await persistDirectionAfterToggle("p1", UNKNOWN_READING, r.setMeta), undefined);
  assert.deepEqual(r.writes, []);
});

test("saveRefinedDirection：写约定的键 + **裸**方向值；none 不写（第二道闸门）", async () => {
  const r = recorder();
  await saveRefinedDirection("p1", "original", r.setMeta);
  await saveRefinedDirection("p1", "refined", r.setMeta);
  await saveRefinedDirection("p1", "none", r.setMeta);
  assert.deepEqual(r.writes, [
    ["pl:refined-dir:p1", "original"],
    ["pl:refined-dir:p1", "refined"],
  ], "两次已知方向各写一条；none 不写");
  // 往返回路：写下去的值必须能被读回来判成同一个方向（否则「持久化」等于没写）。
  assert.equal(readRefinedDirection(twoSides(), r.writes[0][1]).direction, "original");
  assert.equal(readRefinedDirection(twoSides(), r.writes[1][1]).direction, "refined");
  assert.equal(readRefinedDirection(twoSides(), r.writes[0][1]).source, "record");
});

test("saveRefinedDirection：写失败只 warn，**不抛**、不阻断调用方（失败可见但不阻塞）", async () => {
  const { value, warnings } = await captureWarn(() =>
    saveRefinedDirection("p1", "original", async () => {
      throw new Error("库写失败");
    }),
  );
  assert.equal(value, undefined, "写失败不得抛");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /方向落 meta 失败/);
});

test("saveRefinedDirection 缺省实现：真走既有 api.setMeta（PUT /meta/<编码后的键>），未新增 API 方法", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return { status: 200, ok: true, json: async () => ({ ok: true, data: { key: "", value: "" } }) };
  };
  try {
    await saveRefinedDirection("p1", "refined");
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/prompt-enhancer/meta/" + encodeURIComponent("pl:refined-dir:p1"));
  assert.equal(calls[0].init.method, "PUT");
  assert.deepEqual(JSON.parse(calls[0].init.body), { value: "refined" });
});

test("loadStoredDirection：按约定的键读；读失败 → undefined + warn（读不到只退回中性，不抛）", async () => {
  const keys = [];
  const raw = await loadStoredDirection("p1", async (key) => {
    keys.push(key);
    return "refined";
  });
  assert.deepEqual(keys, ["pl:refined-dir:p1"]);
  assert.equal(raw, "refined", "返回的是 meta 原文文本（判定交给 readRefinedDirection）");

  const { value, warnings } = await captureWarn(() =>
    loadStoredDirection("p1", async () => {
      throw new Error("读挂了");
    }),
  );
  assert.equal(value, undefined);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /读取「原文 \/ 优化稿」方向失败/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 播种点：AI 写回缝（方向真正可知之处）——这里是「写回成功后 meta 里真有记录」的判据
// ─────────────────────────────────────────────────────────────────────────────

test("播种点：写回成功后 meta 里真的有 refined（端到端：真 seed + 注入式 setMeta）", async () => {
  const updates = [];
  const writes = [];
  const result = await writeBackRefined({
    promptId: "p1",
    body: "优化稿",
    update: async (id, patch) => {
      updates.push([id, patch]);
      return { id, body: patch.body, aiRefined: true, sourceBody: "旧 body" };
    },
    seed: (id) =>
      seedRefinedDirection(id, async (key, value) => {
        writes.push([id, key, value]);
      }),
  });
  assert.deepEqual(updates, [["p1", { body: "优化稿", aiWriteBack: true }]], "第一步仍是既有的 aiWriteBack PUT");
  assert.deepEqual(writes, [["p1", "pl:refined-dir:p1", "refined"]], "写回成功后必须种下 refined");
  assert.equal(result.body, "优化稿");
  // 种子就是「有记录」的来源：详情页因此能如实标注（而不是靠推断）。
  assert.deepEqual(readRefinedDirection({ sourceBody: "旧 body" }, "refined"), {
    direction: "refined",
    source: "record",
  });
});

test("播种点：写回**失败**则不播种（第二侧可能根本不存在，不得留一条凭空记录）", async () => {
  const seeds = [];
  await assert.rejects(
    writeBackRefined({
      promptId: "p1",
      body: "优化稿",
      update: async () => {
        throw new Error("宿主 500");
      },
      seed: async (id) => {
        seeds.push(id);
      },
    }),
    /宿主 500/,
  );
  assert.deepEqual(seeds, [], "写回失败 ⇒ 一次都不许播种");
});

test("播种点：seed 抛错不得把**已经成功**的写回变成失败（只 warn，不误报 writeBackFailed）", async () => {
  const { value, warnings } = await captureWarn(() =>
    writeBackRefined({
      promptId: "p1",
      body: "优化稿",
      update: async (id, patch) => ({ id, body: patch.body }),
      seed: async () => {
        throw new Error("meta 写挂了");
      },
    }),
  );
  assert.equal(value.body, "优化稿", "写回本身已成功");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /播种失败/);
});

// ─────────────────────────────────────────────────────────────────────────────
// I-1 主链（两条）：有记录全程持久化；无记录（旧记录）永远中性
// ─────────────────────────────────────────────────────────────────────────────

test("I-1 主链（有记录）：播种 → 如实 → 切一次 → 重开仍如实 → 再切回到初始（C8 回归）", async () => {
  const meta = new Map();
  const setMeta = async (key, value) => {
    meta.set(key, value);
  };
  const key = refinedDirectionMetaKey("p1");
  // ① 播种（AI 写回缝）：body 就是优化稿 ⇒ refined，无需推断。
  await seedRefinedDirection("p1", setMeta);
  assert.equal(meta.get(key), "refined");

  // ② 首开详情页：读回记录 ⇒ 如实标注（左栏 = 可编辑的 body = 优化稿）。
  const first = readRefinedDirection({ body: "优化稿", sourceBody: "原文" }, meta.get(key));
  assert.deepEqual(first, { direction: "refined", source: "record" });
  assert.equal(compareLabelKeys(first.direction).current, "manager.compare.refined");

  // ③ 点一次切换（宿主 swap）：落**翻转后**的方向。
  assert.equal(await persistDirectionAfterToggle("p1", first, setMeta), "original");
  assert.equal(meta.get(key), "original");

  // ④ 关面板 → 重开编辑：读回同一条记录 ⇒ 标注与实际一致（此刻 body 是原文）。
  const reopened = readRefinedDirection({ body: "原文", sourceBody: "优化稿" }, meta.get(key));
  assert.deepEqual(reopened, { direction: "original", source: "record" });
  assert.deepEqual(compareLabelKeys(reopened.direction), {
    current: "manager.compare.original",
    counterpart: "manager.compare.refined",
    neutral: false,
  });

  // ⑤ 再切一次（P6 的 C8 回归）：落回 refined，标注回到初始。
  assert.equal(await persistDirectionAfterToggle("p1", reopened, setMeta), "refined");
  assert.deepEqual(
    compareLabelKeys(readRefinedDirection({ body: "优化稿", sourceBody: "原文" }, meta.get(key)).direction),
    compareLabelKeys(first.direction),
  );
});

test("I-1 主链（无记录 / 旧记录）：中性 + **不落库**，且重开后仍然是中性（用户看不到错误标注）", async () => {
  const meta = new Map();
  const setMeta = async (key, value) => {
    meta.set(key, value);
  };
  const key = refinedDirectionMetaKey("p1");
  // P6 期切过奇数次的旧记录：无 meta + aiRefined 真（真值其实是 original，但**无从知道**）。
  const p6Old = { body: "原文", sourceBody: "优化稿", aiRefined: true };
  const reading = readRefinedDirection(p6Old, meta.get(key));
  assert.deepEqual(reading, { direction: "none", source: "fallback" });
  assert.equal(compareLabelKeys(reading.direction).neutral, true, "两栏保持中性（P6 原状）");

  // 切换（宿主 swap）：**不落库** —— 反转一次猜测仍是一次猜测，不得把它固化成记录。
  assert.equal(await persistDirectionAfterToggle("p1", reading, setMeta), undefined);
  assert.equal(meta.size, 0, "meta 里不得出现任何键");

  // 重开编辑页：仍然中性（而不是自信地标一个方向），读数是「不知道」而不是错误答案。
  const reopened = readRefinedDirection({ body: "优化稿", sourceBody: "原文", aiRefined: true }, meta.get(key));
  assert.deepEqual(reopened, { direction: "none", source: "fallback" });
  assert.equal(compareLabelKeys(reopened.direction).neutral, true);
});
