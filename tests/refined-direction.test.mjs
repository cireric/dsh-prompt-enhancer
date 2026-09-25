/**
 * 「原文 / 优化稿」方向持久化的单测（P7 T4 / I-1 根治；规格 §4.4、§13.10-五-4）。
 *
 * 这是本任务**唯一可自动化的面**：详情页是 `.tsx`，`node --test` import 不了它（T2 已实测
 * `ERR_UNKNOWN_FILE_EXTENSION`），组件接线归 T5 活体验收——此处不造假断言去覆盖它。被测对象是
 * 组件**真正调用**的那些函数（`src/client/utils/refined-direction.ts`）与写回缝的编排
 * （`src/client/utils/ai-flow.ts#writeBackRefined`），不是平行副本。
 *
 * 语义（R-P7-AC 修复轮 1 + R-P7-AE 修复轮 2 之后）：
 *   有记录 ⇒ 如实标注 + 切换落**翻转后**的方向；无记录（兜底 / 读取中 / 读失败）⇒ **中性**（P6 原状）
 *   且**绝不写方向值**；已知来源下的切换 ⇒ 记录失效；来源未知下的切换 ⇒ **作废记录**（写空串）；
 *   **迟到的读结果**若出生在切换之前 ⇒ 丢弃；记录只在 AI 写回缝**成功后**播种（方向 = `refined`）。
 *
 * 变异验证（报告第 5 / 5b 节逐次给命令与输出；红集以报告实测为准）：
 *   ① 让兜底来源也落库（去掉两层闸门）⇒ 「兜底不落库」用例必红；
 *   ② 去掉播种 ⇒ 「写回成功后 meta 里真有 refined」必红；
 *   ③ 让兜底来源仍标注方向 ⇒ 「兜底 ⇒ 中性」用例必红；
 *   ④ 把 seed 移到 update 之前 ⇒ 「写回失败不播种」必红；
 *   ⑤ 去掉「未知来源下清空记录」⇒ 「读取中 / 读失败时切换 ⇒ 记录必须被清空」必红；
 *   ⑥ 让迟到读结果无条件采信 ⇒ 「期间发生过切换 ⇒ 必须丢弃」必红；
 *   ⑦ 把清空写成方向值（不落库被破坏）⇒ 「作废只写空串」必红。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const {
  REFINED_DIRECTION_DECISIONS,
  REFINED_DIRECTION_ENTRY,
  REFINED_DIRECTIONS,
  UNKNOWN_READING,
  applyToggleDirection,
  bodyIsOriginal,
  canPersistDirection,
  clearRefinedDirection,
  compareLabelKeys,
  hasTwoBodies,
  loadStoredDirection,
  oppositeDirection,
  parseStoredDirection,
  readRefinedDirection,
  refinedDirectionMetaKey,
  saveRefinedDirection,
  seedRefinedDirection,
  shouldAcceptLateRead,
  toggleDirectionWrite,
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

/**
 * 剥掉注释（T7-3）：块注释先、行注释后（与 `tests/i18n.test.mjs` 的 R59 口径同一形态）。
 * 方向是保守的：只会让某个真引用看不见（误报），绝不会凭空造出一个引用（假绿）。
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
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
  const silently = [undefined, "", "   "]; // 本来就没有记录（含「已作废」的空串）：不是错误，不该 warn
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
// R-P7-AE 决策一：切换之后那条记录该被怎么处理（persist / clear / none）
// ─────────────────────────────────────────────────────────────────────────────

test("toggleDirectionWrite：有记录 ⇒ persist；来源未知（无记录 / 脏值 / 读取中）⇒ **clear**；只有一侧 ⇒ none", () => {
  // 有记录：正常路径
  assert.equal(toggleDirectionWrite(twoSides(), readRefinedDirection(twoSides(), "original")), "persist");
  assert.equal(toggleDirectionWrite(twoSides(), readRefinedDirection(twoSides(), "refined")), "persist");
  // 来源未知但有两侧：**必须作废**（切换改变了真值 ⇒ 旧记录不再可信）
  assert.equal(toggleDirectionWrite(twoSides(), readRefinedDirection(twoSides(), undefined)), "clear", "没有记录");
  assert.equal(toggleDirectionWrite(twoSides(), readRefinedDirection(twoSides(), "bogus")), "clear", "脏值");
  assert.equal(toggleDirectionWrite(twoSides(), UNKNOWN_READING), "clear", "读取中 / 读失败");
  // 只有一侧：谈不上方向，也没有需要作废的记录
  assert.equal(toggleDirectionWrite(singleSide(), UNKNOWN_READING), "none");
  // 正反对照：同一输入两次调用必须相等（否则「每次随机挑一支」也能骗过上面几条）
  assert.equal(toggleDirectionWrite(twoSides(), UNKNOWN_READING), "clear");
  assert.notEqual(toggleDirectionWrite(twoSides(), UNKNOWN_READING), "persist", "未知来源不得走落库路径");
});

test("shouldAcceptLateRead：读取期间发生过切换 ⇒ **丢弃**；没发生过 ⇒ 采信（成对正反）", () => {
  assert.equal(shouldAcceptLateRead(false), true, "读取期间没有切换 ⇒ 采信");
  assert.equal(shouldAcceptLateRead(true), false, "读取期间发生过切换 ⇒ 丢弃（库里那条已不代表当前内容）");
  assert.notEqual(shouldAcceptLateRead(true), shouldAcceptLateRead(false));
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
// 落库：有记录才写方向值；未知来源只写空串（作废）；只有一侧什么都不写
// ─────────────────────────────────────────────────────────────────────────────

/**
 * T7 ⑧-①：`applyToggleDirection` 现在**同步**返回 `{ write, next, done }`（决策同步可得，落库在
 * `done` 里跑）。本 helper 等落库落地后把「决策 + 后果」这一对取出来——与旧断言（返回方向 / undefined）
 * 钉住的是同一批事实，只是形状换了：`next` 就是旧返回值，`write` 是它的决策来源。
 */
async function applyAndSettle(applied) {
  await applied.done;
  return { write: applied.write, next: applied.next };
}

/**
 * T7-3（P7 §10.4-3）：**单点锁改成结构锁**。
 *
 * 修前是**文本锁**：读组件源码数 `toggleDirectionWrite\(` 的出现次数，并用一条带分号与**局部变量名**
 * 的正则匹配 `const applied = applyToggleDirection(id, current, reading);`。它对注释与排版过敏
 * （组件里一句提到该函数名的注释就假红），也对改名过敏（换掉那个局部变量名就假红）。
 *
 * 现在两道锁各司其职：
 *   · **结构锁**（本用例）：`REFINED_DIRECTION_ENTRY` 的键集**只有** `applyToggleDirection`——
 *     「同一纯决策只有一个求值点」在结构上写明；纯判定面的键集与取值也逐项钉住；
 *   · **源码锁**（下面那条）：组件确实只读共用入口；判定前**先剥注释**，故对注释免疫。
 * 组件**行为**仍归 T5 活体验收——这里断言的是「第二个求值点不存在」。
 */
test("⑧-① 结构锁（T7-3）：组件入口面只有 applyToggleDirection，纯判定面的键集与取值逐项钉住", () => {
  assert.deepEqual(
    Object.keys(REFINED_DIRECTION_ENTRY),
    ["applyToggleDirection"],
    "组件唯一入口 = applyToggleDirection（决策不在组件里被第二次求值）",
  );
  assert.equal(REFINED_DIRECTION_ENTRY.applyToggleDirection, applyToggleDirection, "取值 = 函数本身");
  assert.deepEqual(
    Object.keys(REFINED_DIRECTION_DECISIONS).sort(),
    [
      "bodyIsOriginal",
      "canPersistDirection",
      "compareLabelKeys",
      "hasTwoBodies",
      "oppositeDirection",
      "parseStoredDirection",
      "readRefinedDirection",
      "shouldAcceptLateRead",
      "toggleDirectionWrite",
    ].sort(),
    "纯判定面的键集（本模块对外承诺的判定清单）",
  );
  assert.equal(REFINED_DIRECTION_DECISIONS.toggleDirectionWrite, toggleDirectionWrite, "取值 = 函数本身");
  assert.equal(REFINED_DIRECTION_DECISIONS.oppositeDirection, oppositeDirection, "取值 = 函数本身");
  // 两个纯决策**不在**组件入口面里（结构上写明「它们是本模块的，不是组件可自行求值的」）。
  assert.ok(!Object.keys(REFINED_DIRECTION_ENTRY).includes("toggleDirectionWrite"));
  assert.ok(!Object.keys(REFINED_DIRECTION_ENTRY).includes("oppositeDirection"));
  // 方向取值全集：三个值逐项断言（枚举常量，供渲染点与测试共读）。
  assert.deepEqual(REFINED_DIRECTIONS, ["original", "refined", "none"]);
});

test("⑧-① 源码锁（T7-3）：组件不自己求值那两处纯决策——**剥注释后**判定", () => {
  const component = stripComments(
    readFileSync(
      fileURLToPath(new URL("../src/client/components/PromptManagerModal.tsx", import.meta.url)),
      "utf8",
    ),
  );
  assert.equal(
    (component.match(/toggleDirectionWrite\s*\(/g) ?? []).length,
    0,
    "组件里**一次**都不许调用 toggleDirectionWrite（决策只在 applyToggleDirection 内部求值一次）",
  );
  assert.equal(
    (component.match(/oppositeDirection\s*\(/g) ?? []).length,
    0,
    "组件也不许自己算翻转后的方向——它取返回值里的 next（本地态与落库值必须是同一个值）",
  );
  assert.ok(
    /applyToggleDirection\s*\(/.test(component),
    "组件读共用入口的返回值（不锁那一行的排版与局部变量名）",
  );
});

test("applyToggleDirection：有记录 ⇒ 写**翻转后的**方向并返回 {write:'persist', next}（两个方向各一条）", async () => {
  const r = recorder();
  const prompt = twoSides();
  assert.deepEqual(
    await applyAndSettle(applyToggleDirection("p1", prompt, readRefinedDirection(prompt, "original"), r.setMeta)),
    { write: "persist", next: "refined" },
  );
  assert.deepEqual(
    await applyAndSettle(applyToggleDirection("p1", prompt, readRefinedDirection(prompt, "refined"), r.setMeta)),
    { write: "persist", next: "original" },
  );
  assert.deepEqual(r.writes, [
    ["pl:refined-dir:p1", "refined"],
    ["pl:refined-dir:p1", "original"],
  ]);
});

test("applyToggleDirection：未知来源 ⇒ **作废**（只写空串），绝不写方向值；反复切也不写方向值", async () => {
  const r = recorder();
  const prompt = twoSides();
  const unknowns = [
    readRefinedDirection(prompt, undefined), // 没有记录
    readRefinedDirection(prompt, "bogus"), // 脏值
    UNKNOWN_READING, // 读取中 / 读失败
  ];
  for (const reading of unknowns) {
    assert.deepEqual(
      await applyAndSettle(applyToggleDirection("p1", prompt, reading, r.setMeta)),
      { write: "clear", next: undefined },
      "未知来源一律走作废（clear），且没有方向值可给",
    );
  }
  assert.deepEqual(
    r.writes,
    [
      ["pl:refined-dir:p1", ""],
      ["pl:refined-dir:p1", ""],
      ["pl:refined-dir:p1", ""],
    ],
    "每次都只写空串（作废）——**一个方向值都不许出现**",
  );
  for (const [, value] of r.writes) {
    assert.equal(parseStoredDirection(value), undefined, "写进去的东西必须仍然等于「没有记录」");
  }
});

test("applyToggleDirection：只有一侧 ⇒ none（一次 setMeta 都不发）", async () => {
  const r = recorder();
  assert.deepEqual(await applyAndSettle(applyToggleDirection("p1", singleSide(), UNKNOWN_READING, r.setMeta)), {
    write: "none",
    next: undefined,
  });
  assert.deepEqual(r.writes, [], "没有第二侧 ⇒ 没有需要作废的记录，也没有方向可写");
});

test("clearRefinedDirection：写**空串**（既有 setMeta，无需新 API）；失败只 warn 不抛", async () => {
  const r = recorder();
  await clearRefinedDirection("p1", r.setMeta);
  assert.deepEqual(r.writes, [["pl:refined-dir:p1", ""]]);
  assert.equal(readRefinedDirection(twoSides(), r.writes[0][1]).source, "fallback", "空串 = 没有记录");
  const { value, warnings } = await captureWarn(() =>
    clearRefinedDirection("p1", async () => {
      throw new Error("库写失败");
    }),
  );
  assert.equal(value, undefined, "作废失败不得抛");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /旧记录作废失败/);
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
// 播种点：AI 写回缝（方向真正可知之处）——「写回成功后 meta 里真有记录」的判据
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
// I-1 主链（三条）：有记录全程持久化；无记录（旧记录）永远中性；**未知来源下的切换作废记录**
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
  assert.deepEqual(await applyAndSettle(applyToggleDirection("p1", twoSides(), first, setMeta)), {
    write: "persist",
    next: "original",
  });
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
  assert.deepEqual(await applyAndSettle(applyToggleDirection("p1", twoSides(), reopened, setMeta)), {
    write: "persist",
    next: "refined",
  });
  assert.deepEqual(
    compareLabelKeys(readRefinedDirection({ body: "优化稿", sourceBody: "原文" }, meta.get(key)).direction),
    compareLabelKeys(first.direction),
  );
});

test("I-1 主链（无记录 / 旧记录）：中性 + 不写方向值，且重开后仍然是中性（用户看不到错误标注）", async () => {
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

  // 切换（宿主 swap）：**不写方向值**（作废只写空串）——反转一次猜测仍是一次猜测，不得固化成记录。
  assert.deepEqual(await applyAndSettle(applyToggleDirection("p1", p6Old, reading, setMeta)), {
    write: "clear",
    next: undefined,
  });
  assert.equal(meta.get(key), "", "记录被作废（空串 = 没有记录）");
  assert.equal(parseStoredDirection(meta.get(key)), undefined, "作废后不得残留任何可采信的方向");

  // 重开编辑页：仍然中性（而不是自信地标一个方向），读数是「不知道」而不是错误答案。
  const reopened = readRefinedDirection({ body: "优化稿", sourceBody: "原文", aiRefined: true }, meta.get(key));
  assert.deepEqual(reopened, { direction: "none", source: "fallback" });
  assert.equal(compareLabelKeys(reopened.direction).neutral, true);
});

test("R-P7-AE 主链（读取中 / 读失败时切换）：陈旧记录必须被**作废**，重开不得采信它", async () => {
  const meta = new Map();
  const setMeta = async (key, value) => {
    meta.set(key, value);
  };
  const key = refinedDirectionMetaKey("p1");
  // 库里有一条**曾经正确**的记录，但本次挂载还没读到它（读取中）——UI 此刻是中性的。
  await seedRefinedDirection("p1", setMeta);
  assert.equal(meta.get(key), "refined");
  const loading = UNKNOWN_READING;

  // 用户在读取回来之前点了切换：宿主 swap 了真值 ⇒ 那条记录**不再代表当前内容**（它没有翻转）。
  assert.equal(toggleDirectionWrite(twoSides(), loading), "clear");
  assert.deepEqual(await applyAndSettle(applyToggleDirection("p1", twoSides(), loading, setMeta)), {
    write: "clear",
    next: undefined,
  });
  assert.equal(meta.get(key), "", "陈旧记录必须被作废——留着它就是一条会反相的错记录");
  // 迟到的读结果（读到作废**之前**的值）必须被丢弃，不得贴到屏上。
  assert.equal(shouldAcceptLateRead(true), false);

  // 重开详情页：读回来的是空串 ⇒ **中性**（而不是自信地把已换成原文的左栏标成「优化稿」）。
  const reopened = readRefinedDirection({ body: "原文", sourceBody: "优化稿" }, meta.get(key));
  assert.deepEqual(reopened, { direction: "none", source: "fallback" });
  assert.equal(compareLabelKeys(reopened.direction).neutral, true);

  // 反面控制（证明「作废」确实救了这一次）：若那条陈旧记录还在，重开会得到**反相**的标注。
  const stale = readRefinedDirection({ body: "原文", sourceBody: "优化稿" }, "refined");
  assert.deepEqual(stale, { direction: "refined", source: "record" });
  assert.equal(compareLabelKeys(stale.direction).current, "manager.compare.refined", "这就是「自信且无法纠正」的形态");

  // 读失败（undefined）与读取中同一条路径。
  const failed = readRefinedDirection(twoSides(), undefined);
  assert.equal(toggleDirectionWrite(twoSides(), failed), "clear");
});
