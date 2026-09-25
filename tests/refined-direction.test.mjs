/**
 * 「原文 / 优化稿」方向持久化的单测（P7 T4 / I-1 根治；规格 §4.4、§13.10-五-4）。
 *
 * 这是本任务**唯一可自动化的面**：详情页是 `.tsx`，`node --test` import 不了它（T2 已实测
 * `ERR_UNKNOWN_FILE_EXTENSION`），组件接线归 T5 活体验收——此处不造假断言去覆盖它。
 * 被测对象是组件**真正调用**的那些函数（`src/client/utils/refined-direction.ts`），不是平行副本。
 *
 * 三次变异验证（报告里逐次给命令与输出）：
 *   ① `resolveRefinedDirection` 恒返回 `original` → 「三态」与「只有一侧」用例必红；
 *   ② 忽略已存 meta（只用 `aiRefined` 兜底）→ 「已存记录优先于兜底」用例必红；
 *   ③ `compareLabelKeys` 把 original / refined 的映射对调 → 「两个方向的标注不同」用例必红。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  bodyIsOriginal,
  compareLabelKeys,
  fallbackDirection,
  hasTwoBodies,
  loadStoredDirection,
  oppositeDirection,
  parseStoredDirection,
  refinedDirectionMetaKey,
  resolveRefinedDirection,
  saveRefinedDirection,
} = await import("../src/client/utils/refined-direction.ts");
const { skillDescriptorMetaKey } = await import("../src/client/utils/skill-export.ts");
const i18n = await import("../src/client/utils/i18n.ts");

/** 一条两侧都在、正文是 AI 优化稿的提示词（最常见的形态）。 */
const refined = (over = {}) => ({ body: "优化稿", sourceBody: "原文", aiRefined: true, ...over });
/** 一条两侧都在、但**没有**任何「正文是优化稿」依据的提示词（方向只能靠记录）。 */
const untold = (over = {}) => ({ body: "甲", sourceBody: "乙", aiRefined: false, ...over });
/** 只有一侧（没有第二侧 ⇒ 两栏对比根本不成立）。 */
const singleSide = (over = {}) => ({ body: "唯一的一份", aiRefined: true, ...over });

/**
 * 捕获 console.warn 跑一段（同步 / 异步均可）：脏值与读写失败必须**可见**，不得静默吞掉。
 * 返回 `{ value, warnings }`。
 */
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

// ─────────────────────────────────────────────────────────────────────────────
// 键约定：与 T3 同一形态（pl:<用途>:<promptId>），不自创新前缀
// ─────────────────────────────────────────────────────────────────────────────

test("键约定：pl:refined-dir:<promptId>——与 T3 的 pl:skill-descriptor:<id> 同一形态", () => {
  const key = refinedDirectionMetaKey("p1");
  assert.equal(key, "pl:refined-dir:p1");
  // 与 T3 的键**逐段同构**：同一命名空间、同一段数（用途段成了第二条键的区分位）。
  const parts = key.split(":");
  const t3 = skillDescriptorMetaKey("p1").split(":");
  assert.deepEqual([parts[0], parts.length], [t3[0], t3.length], "应与 T3 的键同首段、同段数");
  assert.deepEqual([parts[0], parts[1], parts[2]], ["pl", "refined-dir", "p1"]);
  assert.equal(refinedDirectionMetaKey("p2"), "pl:refined-dir:p2", "id 必须是键的尾段（每条提示词一个键）");
  // 反面对照：自创前缀 / 换用途段 / 多一段都不是本约定——「沿用 T3 的规矩」这件事要能被判假。
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
// 三态判定 + 边界（只有一侧 / 缺 meta / 脏值）
// ─────────────────────────────────────────────────────────────────────────────

test("hasTwoBodies：sourceBody 非空才算有第二侧（空串 / undefined 都不算）", () => {
  assert.equal(hasTwoBodies({ sourceBody: "原文", aiRefined: true }), true);
  assert.equal(hasTwoBodies({ sourceBody: "", aiRefined: true }), false);
  assert.equal(hasTwoBodies({ aiRefined: true }), false);
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

test("fallbackDirection：aiRefined 真 ⇒ refined；假 / 缺省 ⇒ none（**不猜 original**）；只有一侧一律 none", () => {
  assert.equal(fallbackDirection(refined()), "refined");
  assert.equal(fallbackDirection(untold()), "none");
  assert.equal(fallbackDirection({ body: "x", sourceBody: "y" }), "none", "aiRefined 缺省不是 true ⇒ 不猜");
  assert.equal(fallbackDirection(singleSide()), "none", "只有一侧 ⇒ 两栏对比不成立");
});

test("resolveRefinedDirection 三态：meta 记着 original / refined 时如实采信", () => {
  assert.equal(resolveRefinedDirection(refined(), "original"), "original");
  assert.equal(resolveRefinedDirection(refined(), "refined"), "refined");
  assert.equal(resolveRefinedDirection(untold(), "original"), "original");
  assert.equal(resolveRefinedDirection(untold(), "refined"), "refined");
});

test("resolveRefinedDirection：**已存记录优先于 aiRefined 兜底**（切换过之后 aiRefined 仍是 true）", () => {
  const prompt = refined(); // aiRefined = true ⇒ 兜底会说「正文是优化稿」
  assert.equal(fallbackDirection(prompt), "refined");
  assert.equal(resolveRefinedDirection(prompt, "original"), "original", "记录说正文已经是原文了");
  assert.notEqual(resolveRefinedDirection(prompt, "original"), fallbackDirection(prompt),
    "两者必须不同：否则「忽略已存 meta」的实现也能全绿");
});

test("resolveRefinedDirection 兜底：没有记录（含脏值）时 aiRefined 真 ⇒ refined，否则 none（绝不猜 original）", async () => {
  const { value } = await captureWarn(() =>
    [undefined, "", "   ", "bogus", "{ oops"].map((stored) => [
      resolveRefinedDirection(refined(), stored),
      resolveRefinedDirection(untold(), stored),
    ]),
  );
  for (const [withAi, withoutAi] of value) {
    assert.equal(withAi, "refined");
    assert.equal(withoutAi, "none");
    assert.notEqual(withoutAi, "original", "不得凭空猜 original（那会把 I-1 的错标签换个方向重现）");
  }
});

test("resolveRefinedDirection：只有一侧 ⇒ 恒 none（meta 里存着方向也不例外）", () => {
  for (const prompt of [singleSide(), singleSide({ sourceBody: "" }), singleSide({ aiRefined: false })]) {
    assert.equal(resolveRefinedDirection(prompt, "original"), "none");
    assert.equal(resolveRefinedDirection(prompt, "refined"), "none");
    assert.equal(compareLabelKeys(resolveRefinedDirection(prompt, "refined")).neutral, true, "只有一栏可比 ⇒ 中性");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 翻转与标注（两个方向的标注**必须不同**）
// ─────────────────────────────────────────────────────────────────────────────

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
  assert.equal(bodyIsOriginal("none"), false, "未知方向不得认成原文（这是 I-1 的错标签形态之一）");
});

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

test("标注映射：none 走中性表述（不假装知道哪一栏是哪一份）", () => {
  assert.deepEqual(compareLabelKeys("none"), {
    current: "manager.compare.current",
    counterpart: "manager.compare.counterpart",
    neutral: true,
  });
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

// ─────────────────────────────────────────────────────────────────────────────
// I-1 主链（纯逻辑）与 P6 C8 回归
// ─────────────────────────────────────────────────────────────────────────────

test("I-1 主链：切一次 → 重开（用落库的值重新判定）⇒ 标注翻转且与实际一致", () => {
  // 切换前：两侧都在、aiRefined 真 ⇒ 兜底认定「正文是那一次写回的优化稿」。
  const before = refined();
  const dirBefore = resolveRefinedDirection(before, undefined);
  assert.equal(dirBefore, "refined");
  assert.equal(compareLabelKeys(dirBefore).current, "manager.compare.refined", "左栏此刻确实是优化稿");

  // 切换（宿主 swap）：两份正文对调；**aiRefined 不变**（它只记「发生过写回」）。
  const stored = oppositeDirection(dirBefore);
  const after = refined({ body: "原文", sourceBody: "优化稿" });

  // 重开编辑页：读回落库的方向 ⇒ 标注跟着对调（这就是根治点）。
  assert.equal(resolveRefinedDirection(after, stored), "original");
  assert.equal(compareLabelKeys(resolveRefinedDirection(after, stored)).current, "manager.compare.original");

  // 反面：忽略记录、只看 aiRefined 兜底 ⇒ 会把已经换成原文的左栏标成「优化稿」（I-1 的错标签形态）。
  assert.equal(resolveRefinedDirection(after, undefined), "refined");
  assert.notEqual(resolveRefinedDirection(after, stored), resolveRefinedDirection(after, undefined));
});

test("P6 C8 回归（纯逻辑）：切两次回到自洽态，两栏标注与初始一致", () => {
  const prompt = refined();
  let stored = undefined;
  let direction = resolveRefinedDirection(prompt, stored);
  assert.equal(direction, "refined");

  stored = oppositeDirection(direction); // 第一次切换
  direction = resolveRefinedDirection(refined({ body: "原文", sourceBody: "优化稿" }), stored);
  assert.equal(direction, "original");

  stored = oppositeDirection(direction); // 第二次切换（回到自洽态）
  direction = resolveRefinedDirection(prompt, stored);
  assert.equal(direction, "refined");
  assert.deepEqual(compareLabelKeys(direction), compareLabelKeys(resolveRefinedDirection(prompt, undefined)));
});

// ─────────────────────────────────────────────────────────────────────────────
// 读写：既有 api.getMeta / api.setMeta（不新增 API 方法），失败可见但不阻塞
// ─────────────────────────────────────────────────────────────────────────────

test("saveRefinedDirection：写约定的键 + **裸**方向值；none 不写（未知方向不得落成记录）", async () => {
  const writes = [];
  const setMeta = async (key, value) => {
    writes.push([key, value]);
  };
  await saveRefinedDirection("p1", "original", setMeta);
  await saveRefinedDirection("p1", "refined", setMeta);
  await saveRefinedDirection("p1", "none", setMeta);
  assert.deepEqual(writes, [
    ["pl:refined-dir:p1", "original"],
    ["pl:refined-dir:p1", "refined"],
  ], "两次已知方向各写一条；none 不写");

  // 往返回路：写下去的值必须能被读回来判成同一个方向（否则「持久化」等于没写）。
  assert.equal(resolveRefinedDirection(untold(), writes[0][1]), "original");
  assert.equal(resolveRefinedDirection(untold(), writes[1][1]), "refined");
});

test("saveRefinedDirection：写失败只 warn，**不抛**、不阻断调用方（失败可见但不阻塞切换的其它效果）", async () => {
  const { value, warnings } = await captureWarn(() =>
    saveRefinedDirection("p1", "original", async () => {
      throw new Error("库写失败");
    }),
  );
  assert.equal(value, undefined, "写失败不得抛出（切换已经成功，不得因一次库写把它变成失败）");
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

test("loadStoredDirection：按约定的键读；读失败 → undefined + warn（读不到只退回兜底，不抛）", async () => {
  const keys = [];
  const raw = await loadStoredDirection("p1", async (key) => {
    keys.push(key);
    return "refined";
  });
  assert.deepEqual(keys, ["pl:refined-dir:p1"]);
  assert.equal(raw, "refined", "返回的是 meta 原文文本（判定交给 resolveRefinedDirection）");

  const { value, warnings } = await captureWarn(() =>
    loadStoredDirection("p1", async () => {
      throw new Error("读挂了");
    }),
  );
  assert.equal(value, undefined);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /读取「原文 \/ 优化稿」方向失败/);
});
