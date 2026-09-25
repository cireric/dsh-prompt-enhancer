/**
 * 技能导出的**纯逻辑**单测（P7 T2 / 规格 §7.6）。
 *
 * 这是本任务**唯一可自动化的面**：弹窗是 `.tsx`，`node --test` import 不了它
 * （实测 `Unknown file extension ".tsx"`），组件接线归 T5 活体验收——此处不造假断言去覆盖它。
 * 被测对象是组件**真正调用**的那些函数（`src/client/utils/skill-export.ts`），不是平行副本。
 *
 * 变异验证（报告里逐次给命令与输出）：
 *   ① 预校验（`isValidSkillName`）被绕过 → 「预校验先行的负样本」必红；
 *   ② 409 重试丢掉 `conflictConfirmed` → 「确认后重试必须带标记」必红；
 *   ③ AI 失败改成整体中止 → 「单条失败不阻断」必红。
 *
 * 修复轮 1（R-P7-X）追加（在同一批用例里做的变异验证）：
 *   ④ 去掉「离开即停止」的条目边界检查 → 「不再启动新条目」必红；
 *   ⑤ 去掉 onExported 回调 → 「完成即广播（组件卸载后仍广播）」必红。
 *
 * T6（修复轮 2）追加（同一批用例里做的变异验证）：
 *   ⑥ 名字候选退回 `descriptor.name → prompt.skillName` → 「D-1：显式下发 name = skillName」必红；
 *   ⑦ 落库的 descriptor 名字退回 AI 名 → 「用过的名字与库里 skillName 同步」必红。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  collectTags,
  createSkillRun,
  describeEach,
  exportEach,
  exportNameLocked,
  filterByTag,
  isAllSelected,
  pickSelected,
  precheckExport,
  resolveDescriptionForClient,
  summarizeExport,
  toggleAllVisible,
  toggleSelected,
} = await import("../src/client/utils/skill-export.ts");
const { ApiError } = await import("../src/client/utils/api.ts");
const hostSkills = await import("../src/host/skills.ts");
const skillName = await import("../src/skill-name.ts");

/** 一条候选提示词（只给纯逻辑真正读的字段）。 */
const prompt = (over = {}) => ({ id: "p1", title: "周报生成", body: "把要点整理成周报", tags: ["写作", "办公"], ...over });
const descriptor = (over = {}) => ({ name: "weekly-report", description: "把要点整理成周报", ...over });

/** 假 `send`：记录每次请求，按脚本返回/抛错。 */
function scriptedSend(script) {
  const calls = [];
  return {
    calls,
    send: async (p, request) => {
      calls.push({ id: p.id, request });
      const step = script[Math.min(calls.length - 1, script.length - 1)];
      if (step instanceof Error) throw step;
      return step;
    },
  };
}

/**
 * R-P7-AA（修复轮 1）：`exportEach` 每条成功导出后会调 `saveDescriptor`（缺省实现会走 `api.setMeta`）
 * 把这一次用过的 descriptor 落 meta。本文件只测**编排**，故下面每处都显式注入空实现——保持用例
 * hermetic（真实现的 HTTP 形状由打桩 fetch 覆盖）。**断言一行未动**，只是把新 effect 也注入掉。
 */
const noSave = async () => {};

// ─────────────────────────────────────────────────────────────────────────────
// B 段：技能名规则与宿主同源（不是「两份一样的代码」，是同一个函数）
// ─────────────────────────────────────────────────────────────────────────────

test("skill-name：宿主 skills.ts 的四个导出与零依赖模块是同一个值（单一真源，不是副本）", () => {
  assert.equal(hostSkills.toKebab, skillName.toKebab);
  assert.equal(hostSkills.isValidSkillName, skillName.isValidSkillName);
  assert.equal(hostSkills.SKILL_NAME_RE, skillName.SKILL_NAME_RE);
  assert.equal(hostSkills.SKILL_NAME_MAX_LEN, skillName.SKILL_NAME_MAX_LEN);
});

// ─────────────────────────────────────────────────────────────────────────────
// 勾选 / 全选 / 按标签筛选（都在标签筛选的语境下取值）
// ─────────────────────────────────────────────────────────────────────────────

test("toggleSelected：加入/移出都返回新数组，不动入参", () => {
  const before = ["a"];
  const added = toggleSelected(before, "b");
  assert.deepEqual(added, ["a", "b"]);
  assert.deepEqual(before, ["a"], "入参不得被就地改写");
  assert.deepEqual(toggleSelected(added, "a"), ["b"], "再次点击同一条 = 移出");
});

test("isAllSelected：空可见集合**不算**全选（否则空列表上的按钮语义翻转）", () => {
  const list = [prompt({ id: "a" }), prompt({ id: "b" })];
  assert.equal(isAllSelected([], []), false);
  assert.equal(isAllSelected(list, ["a", "b"]), true);
  assert.equal(isAllSelected(list, ["a"]), false);
  assert.equal(isAllSelected(list, ["a", "b", "c"]), true, "多出来的勾选不影响「可见集合已全选」");
});

test("toggleAllVisible：未全选则并入可见集合；已全选只移出可见集合（保留集合外的勾选）", () => {
  const list = [prompt({ id: "a" }), prompt({ id: "b" })];
  assert.deepEqual(toggleAllVisible(list, []), ["a", "b"]);
  assert.deepEqual(toggleAllVisible(list, ["z"]), ["z", "a", "b"], "集合外的既有勾选必须保留");
  assert.deepEqual(toggleAllVisible(list, ["a", "b", "z"]), ["z"], "只移出可见集合，z 保留");
  assert.deepEqual(toggleAllVisible([], ["z"]), ["z"], "空可见集合不产生任何副作用");
});

test("filterByTag：空串 = 不过滤（复制），否则按 tags 精确匹配", () => {
  const list = [
    prompt({ id: "a", tags: ["写作"] }),
    prompt({ id: "b", tags: ["办公"] }),
    prompt({ id: "c", tags: [] }),
    prompt({ id: "d", tags: ["写作", "办公"] }),
  ];
  assert.deepEqual(filterByTag(list, "").map((p) => p.id), ["a", "b", "c", "d"]);
  assert.deepEqual(filterByTag(list, "写作").map((p) => p.id), ["a", "d"]);
  assert.deepEqual(filterByTag(list, "办公").map((p) => p.id), ["b", "d"]);
  assert.deepEqual(filterByTag(list, "不存在").map((p) => p.id), []);
  assert.notEqual(filterByTag(list, ""), list, "不过滤也要返回新数组（调用方按引用换 state）");
});

test("collectTags：去重 + 稳定排序（与加载次序无关）", () => {
  const ascii = [prompt({ id: "a", tags: ["b", "a"] }), prompt({ id: "b", tags: ["a", "c"] }), prompt({ id: "c", tags: [] })];
  assert.deepEqual(collectTags(ascii), ["a", "b", "c"], "去重且排序（ASCII 标签的顺序是 locale 无关的）");
  // 中文标签只断言「去重 + 成员齐」：它们的相对顺序由 ICU 排序决定（不是本模块的语义），
  // 在这里钉一个具体次序会把测试绑死在 Node 的 ICU 版本上。
  const cjk = [prompt({ id: "a", tags: ["写作", "办公"] }), prompt({ id: "b", tags: ["写作"] })];
  assert.deepEqual([...collectTags(cjk)].sort(), ["办公", "写作"].sort());
  assert.deepEqual(collectTags([]), []);
});

test("pickSelected：按**列表顺序**取已选（不是勾选顺序），导出清单因此稳定", () => {
  const list = [prompt({ id: "a" }), prompt({ id: "b" }), prompt({ id: "c" })];
  assert.deepEqual(pickSelected(list, ["c", "a"]).map((p) => p.id), ["a", "c"]);
});

// ─────────────────────────────────────────────────────────────────────────────
// 预校验：名字（toKebab + isValidSkillName）与 description 非空
// ─────────────────────────────────────────────────────────────────────────────

test("precheckExport：AI 名 kebab 化后通过，并给出将提交的名字与描述", () => {
  const pre = precheckExport(prompt(), descriptor({ name: "Weekly Report" }));
  assert.equal(pre.ok, true);
  assert.equal(pre.name, "weekly-report");
  assert.equal(pre.description, "把要点整理成周报", "description 优先取 summary，其次 AI 描述");
});

test("precheckExport：没有 AI 结果时用 prompt.skillName 重导（与宿主的候选同序）", () => {
  const pre = precheckExport(prompt({ skillName: "weekly-report" }));
  assert.equal(pre.ok, true);
  assert.equal(pre.name, "weekly-report");
  assert.equal(pre.description, "把要点整理成周报", "描述回落到正文");
});

test("precheckExport 负样本：既无 AI 名也无 skillName → nameMissing（不是 nameInvalid）", () => {
  const pre = precheckExport(prompt());
  assert.equal(pre.ok, false);
  assert.equal(pre.errorKey, "manager.skill.nameMissing");
  assert.equal(pre.detail, 'kebab=""');
  assert.doesNotMatch(pre.detail, /[\u4e00-\u9fff]/, "detail 只承载纯数据（措辞由 errorKey 承担，A10）");
});

test("precheckExport 负样本：结构性非法名（../evil）→ nameInvalid，且 kebab 后为空", () => {
  const pre = precheckExport(prompt(), descriptor({ name: "../evil" }));
  assert.equal(pre.ok, false);
  assert.equal(pre.errorKey, "manager.skill.nameInvalid");
  assert.equal(pre.detail, 'kebab=""', "toKebab 对含 .. 的输入返回空串（不做猜测性修正）");
});

// 注意哪些输入**不算**非法：`a--b` / `A_B` / `-lead` 会被 toKebab 归一成合法 kebab 后接受
// （宿主 P3 已定的策略：只有含路径分隔符或 .. 的**结构性**输入才拒绝，见 tests/skills.test.mjs）。
// 故这里的样本取「kebab 归一后仍然非法」的两类：超长、归一后为空。
test("precheckExport 负样本：名字非空但 kebab 后仍非法（超长 / 归一为空）→ nameInvalid", () => {
  for (const raw of ["a".repeat(65), "___"]) {
    const pre = precheckExport(prompt(), descriptor({ name: raw }));
    assert.equal(pre.ok, false, raw + " 必须被拒");
    assert.equal(pre.errorKey, "manager.skill.nameInvalid", raw + " 的键");
    assert.doesNotMatch(pre.detail, /[\u4e00-\u9fff]/);
  }
});

test("precheckExport 负样本：兜底链全空 → descMissing（宿主也会拒，这里提前报错）", () => {
  const pre = precheckExport(prompt({ title: "", body: "   ", summary: "" }), descriptor({ name: "x", description: "" }));
  assert.equal(pre.ok, false);
  assert.equal(pre.errorKey, "manager.skill.descMissing");
  assert.equal(pre.detail, "summary|descriptor.description|body[0]|title all empty");
  assert.doesNotMatch(pre.detail, /[\u4e00-\u9fff]/);
});

// ─────────────────────────────────────────────────────────────────────────────
// description 兜底链：与宿主逐格同值（两处真源会漂移，故用同一张表同时喂两边）
// ─────────────────────────────────────────────────────────────────────────────

test("resolveDescriptionForClient：与宿主 resolveDescription 逐格同值（含回车与空白的边角）", () => {
  const table = [
    { p: prompt({ summary: "摘要优先" }), d: { name: "x", description: "AI 描述" } },
    { p: prompt({ summary: "" }), d: { name: "x", description: "AI 描述" } },
    { p: prompt({ summary: "   " }), d: { name: "x", description: "  AI 描述  " } },
    { p: prompt({ body: "\n\n  正文首行  \n第二行" }) },
    { p: prompt({ body: "" }) },
    { p: prompt({ title: "", body: "   " }) },
    { p: prompt({ title: "", body: "   ", summary: "" }), d: { name: "x", description: "" } },
    { p: prompt({ title: "", body: "x\ry" }) },
    { p: prompt({ title: "", body: "\r" }) },
    { p: prompt({ body: "第一行", title: "标题" }) },
  ];
  for (const [i, row] of table.entries()) {
    const client = resolveDescriptionForClient(row.p, row.d);
    const host = hostSkills.resolveDescription(row.p, row.d);
    assert.equal(client, host, "第 " + i + " 格必须与宿主同值（客户端 = " + String(client) + " / 宿主 = " + String(host) + "）");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 逐条 AI 补全：失败非阻断（规格 §7.6）
// ─────────────────────────────────────────────────────────────────────────────

test("describeEach：单条失败只记在该条上，其余条目照跑（AI 不可用不得中断整批）", async () => {
  const list = [prompt({ id: "a" }), prompt({ id: "b" }), prompt({ id: "c" })];
  const tried = [];
  const seen = [];
  const out = await describeEach(
    list,
    async (p) => {
      tried.push(p.id);
      if (p.id === "b") throw new ApiError("AI 生成技能描述失败（no-llm）", 503);
      return descriptor({ name: "skill-" + p.id });
    },
    { onEach: (id, outcome) => seen.push([id, outcome.ok]) },
  );
  assert.deepEqual(tried, ["a", "b", "c"], "失败的 b 不得中断 c");
  assert.equal(out.a.ok, true);
  assert.equal(out.b.ok, false, "503 只记在 b 上");
  assert.equal(out.b.errorKey, "manager.skill.describeFailed");
  assert.equal(out.b.detail, "AI 生成技能描述失败（no-llm）", "detail 是宿主/AI 侧原文（原样透出）");
  assert.equal(out.c.ok, true);
  assert.deepEqual(seen, [["a", true], ["b", false], ["c", true]], "onEach 逐条回调（UI 的响应式渲染点）");
});

test("describeEach：非 Error 抛出也要变成可见的 detail（不得空吞）", async () => {
  const out = await describeEach([prompt({ id: "a" })], async () => {
    throw "boom";
  });
  assert.equal(out.a.ok, false);
  assert.equal(out.a.detail, "boom");
});

// ─────────────────────────────────────────────────────────────────────────────
// 导出编排：预校验先行 / 409 确认后带标记重试 / 目标目录只取宿主回执
// ─────────────────────────────────────────────────────────────────────────────

test("exportEach：预校验不通过就**不发请求**（负样本：名字非法 / 描述全空）", async () => {
  const bad = scriptedSend([]);
  const outcomes = await exportEach({
    prompts: [prompt({ id: "a", title: "", body: "   " }), prompt({ id: "b" })],
    descriptors: { a: { ok: true, descriptor: descriptor({ name: "../evil", description: "" }) } },
    send: bad.send,
    saveDescriptor: noSave,
    confirmConflict: async () => {
      throw new Error("预校验失败时不得问冲突");
    },
  });
  assert.equal(bad.calls.length, 0, "预校验失败的条目一条请求都不该发");
  assert.deepEqual(outcomes.map((o) => o.status), ["failed", "failed"]);
  assert.equal(outcomes[0].errorKey, "manager.skill.nameInvalid");
  assert.equal(outcomes[1].errorKey, "manager.skill.nameMissing");
});

test("exportEach：成功路径——请求带 kebab 名与 descriptor、conflictConfirmed=false；结果取宿主回执", async () => {
  const s = scriptedSend([{ name: "weekly-report", path: "/home/u/.dsh/skills/weekly-report/SKILL.md", prompt: { id: "p1" } }]);
  const outcomes = await exportEach({
    prompts: [prompt()],
    descriptors: { p1: { ok: true, descriptor: descriptor({ name: "Weekly Report" }) } },
    send: s.send,
    saveDescriptor: noSave,
    confirmConflict: async () => {
      throw new Error("没有 409 时不得弹确认");
    },
  });
  assert.deepEqual(s.calls[0].request, {
    name: "weekly-report",
    descriptor: descriptor({ name: "Weekly Report" }),
    conflictConfirmed: false,
  });
  assert.deepEqual(outcomes, [
    { status: "exported", id: "p1", title: "周报生成", name: "weekly-report", path: "/home/u/.dsh/skills/weekly-report/SKILL.md" },
  ]);
});

test("exportEach：409 → 弹确认 → 重试**必须带 conflictConfirmed: true**（否则用户白确认一次）", async () => {
  const conflict = new ApiError("技能目录 mine 已存在，且不属于本插件的任何提示词（可能是你手写的技能）", 409);
  const s = scriptedSend([conflict, { name: "mine", path: "/h/.dsh/skills/mine/SKILL.md" }]);
  const asked = [];
  const outcomes = await exportEach({
    prompts: [prompt({ id: "p1", title: "我的技能", skillName: "mine" })],
    descriptors: {},
    send: s.send,
    saveDescriptor: noSave,
    confirmConflict: async (info) => {
      asked.push(info);
      return true;
    },
  });
  assert.equal(s.calls.length, 2, "先失败再重试：恰好两次请求");
  assert.equal(s.calls[0].request.conflictConfirmed, false);
  assert.equal(s.calls[1].request.conflictConfirmed, true, "重试必须带 conflictConfirmed: true");
  assert.deepEqual(asked, [
    { id: "p1", title: "我的技能", name: "mine", detail: "技能目录 mine 已存在，且不属于本插件的任何提示词（可能是你手写的技能）" },
  ]);
  assert.deepEqual(outcomes.map((o) => o.status), ["exported"]);
  assert.equal(outcomes[0].path, "/h/.dsh/skills/mine/SKILL.md", "目标目录取宿主回执，不由客户端拼");
});

test("exportEach：409 后用户取消 → declined（不覆盖、不算失败、不再发请求）", async () => {
  const s = scriptedSend([new ApiError("技能目录 mine 已存在", 409)]);
  const outcomes = await exportEach({
    prompts: [prompt({ skillName: "mine" })],
    descriptors: {},
    send: s.send,
    saveDescriptor: noSave,
    confirmConflict: async () => false,
  });
  assert.equal(s.calls.length, 1, "取消后不得重试");
  assert.equal(outcomes[0].status, "declined");
  assert.equal(outcomes[0].name, "mine");
  assert.equal(summarizeExport(outcomes).declinedCount, 1);
});

test("exportEach：确认后仍 409 → failed，且**不再二次询问**（不得陷入确认循环）", async () => {
  const conflict = new ApiError("技能目录 mine 已存在", 409);
  const s = scriptedSend([conflict, conflict, conflict]);
  let asked = 0;
  const outcomes = await exportEach({
    prompts: [prompt({ skillName: "mine" })],
    descriptors: {},
    send: s.send,
    saveDescriptor: noSave,
    confirmConflict: async () => {
      asked++;
      return true;
    },
  });
  assert.equal(asked, 1, "用户确认一次就够");
  assert.equal(s.calls.length, 2);
  assert.deepEqual(outcomes.map((o) => o.status), ["failed"]);
  assert.equal(outcomes[0].errorKey, "manager.skill.exportFailed");
});

test("exportEach：非 409 的宿主错误（400/404）→ failed，不弹确认，detail 是宿主原文", async () => {
  for (const [status, message] of [[400, "技能名非法：需要小写 kebab-case"], [404, "提示词不存在"]]) {
    const s = scriptedSend([new ApiError(message, status)]);
    let asked = 0;
    const outcomes = await exportEach({
      prompts: [prompt()],
      descriptors: { p1: { ok: true, descriptor: descriptor({ name: "ok-name" }) } },
      send: s.send,
      saveDescriptor: noSave,
      confirmConflict: async () => {
        asked++;
        return true;
      },
    });
    assert.equal(asked, 0, status + " 不该弹同名冲突确认");
    assert.equal(outcomes[0].status, "failed");
    assert.equal(outcomes[0].errorKey, "manager.skill.exportFailed");
    assert.equal(outcomes[0].detail, message);
  }
});

test("exportEach：宿主回执没带 path → pathMissing（**不得**在客户端拼一个 $DSH_HOME 路径出来）", async () => {
  const s = scriptedSend([{ name: "weekly-report" }]);
  const outcomes = await exportEach({
    prompts: [prompt()],
    descriptors: { p1: { ok: true, descriptor: descriptor({ name: "weekly-report" }) } },
    send: s.send,
    saveDescriptor: noSave,
    confirmConflict: async () => false,
  });
  assert.equal(outcomes[0].status, "failed");
  assert.equal(outcomes[0].errorKey, "manager.skill.pathMissing");
  assert.equal(outcomes[0].detail, "keys=name");
  assert.ok(!Object.hasOwn(outcomes[0], "path"), "缺 path 时不得伪造目标目录");
  assert.doesNotMatch(outcomes[0].detail, /skills\/|DSH_HOME/, "detail 里不得出现拼出来的路径");
});

test("exportEach：超时等非 ApiError 异常 → failed（原样可见，不吞）", async () => {
  const s = scriptedSend([new DOMException("signal timed out", "TimeoutError")]);
  const outcomes = await exportEach({
    prompts: [prompt()],
    descriptors: { p1: { ok: true, descriptor: descriptor({ name: "weekly-report" }) } },
    send: s.send,
    saveDescriptor: noSave,
    confirmConflict: async () => true,
  });
  assert.equal(outcomes[0].status, "failed");
  assert.equal(outcomes[0].errorKey, "manager.skill.exportFailed");
  assert.equal(outcomes[0].detail, "signal timed out");
});

test("exportEach：一条失败不影响其余条目（逐条独立，结果与顺序都对得上）", async () => {
  const list = [prompt({ id: "a" }), prompt({ id: "b" }), prompt({ id: "c" })];
  const s = scriptedSend([
    { name: "skill-a", path: "/h/skills/skill-a/SKILL.md" },
    new ApiError("提示词不存在", 404),
    { name: "skill-c", path: "/h/skills/skill-c/SKILL.md" },
  ]);
  const outcomes = await exportEach({
    prompts: list,
    descriptors: {
      a: { ok: true, descriptor: descriptor({ name: "skill-a" }) },
      b: { ok: true, descriptor: descriptor({ name: "skill-b" }) },
      c: { ok: true, descriptor: descriptor({ name: "skill-c" }) },
    },
    send: s.send,
    saveDescriptor: noSave,
    confirmConflict: async () => true,
  });
  assert.deepEqual(outcomes.map((o) => o.status), ["exported", "failed", "exported"]);
  assert.deepEqual(outcomes.map((o) => o.id), ["a", "b", "c"]);
});

// ─────────────────────────────────────────────────────────────────────────────
// 结果汇总
// ─────────────────────────────────────────────────────────────────────────────

test("summarizeExport：三桶 + 计数 + total（UI 只渲染这个结构）", () => {
  const outcomes = [
    { status: "exported", id: "a", title: "A", name: "a", path: "/h/skills/a/SKILL.md" },
    { status: "failed", id: "b", title: "B", errorKey: "manager.skill.exportFailed", detail: "宿主 400" },
    { status: "declined", id: "c", title: "C", name: "c", detail: "409" },
    { status: "exported", id: "d", title: "D", name: "d", path: "/h/skills/d/SKILL.md" },
  ];
  const summary = summarizeExport(outcomes);
  assert.deepEqual(summary.exported.map((o) => o.id), ["a", "d"]);
  assert.deepEqual(summary.failed.map((o) => o.id), ["b"]);
  assert.deepEqual(summary.declined.map((o) => o.id), ["c"]);
  assert.equal(summary.okCount, 2);
  assert.equal(summary.failCount, 1);
  assert.equal(summary.declinedCount, 1);
  assert.equal(summary.total, 4);
  const empty = summarizeExport([]);
  assert.deepEqual([empty.okCount, empty.failCount, empty.declinedCount, empty.total], [0, 0, 0, 0]);
});

// ─────────────────────────────────────────────────────────────────────────────
// 修复轮 1（R-P7-X）：在途离开的保护 —— 停止新条目 / 完成仍广播 / 不再弹确认
// ─────────────────────────────────────────────────────────────────────────────

test("createSkillRun：新令牌未取消；cancel() 置位且幂等", () => {
  const run = createSkillRun();
  assert.equal(run.cancelled, false);
  run.cancel();
  assert.equal(run.cancelled, true);
  run.cancel();
  assert.equal(run.cancelled, true, "重复取消是幂等空操作（卸载清理可能多次跑到）");
});

test("describeEach + run（要求 1）：取消后不再启动新条目，已经发起的那条照常收下结果", async () => {
  const list = [prompt({ id: "a" }), prompt({ id: "b" }), prompt({ id: "c" })];
  const run = createSkillRun();
  const tried = [];
  const out = await describeEach(
    list,
    async (p) => {
      tried.push(p.id);
      // 模拟「用户在第一条在途时离开技能页」：卸载清理把令牌置位。
      run.cancel();
      return descriptor({ name: "skill-" + p.id });
    },
    { run },
  );
  assert.deepEqual(tried, ["a"], "b / c 不得被发起（离开即停）");
  assert.deepEqual(Object.keys(out), ["a"], "返回已经拿到的那部分（UI 侧已卸载，不再渲染）");
  assert.equal(out.a.ok, true, "在途那条不硬断：它跑完并留下结果");
});

test("exportEach + run（要求 1 + 要求 2）：取消后不再启动新条目，但**已完成的那条仍然广播**", async () => {
  const list = [prompt({ id: "a" }), prompt({ id: "b" }), prompt({ id: "c" })];
  const run = createSkillRun();
  const sent = [];
  const broadcast = [];
  const outcomes = await exportEach({
    prompts: list,
    descriptors: {
      a: { ok: true, descriptor: descriptor({ name: "skill-a" }) },
      b: { ok: true, descriptor: descriptor({ name: "skill-b" }) },
      c: { ok: true, descriptor: descriptor({ name: "skill-c" }) },
    },
    send: async (p) => {
      sent.push(p.id);
      // 第一条在途时用户离开技能页（组件卸载 ⇒ cancel()），但**该条已经落盘**。
      run.cancel();
      return { name: "skill-" + p.id, path: "/h/skills/skill-" + p.id + "/SKILL.md" };
    },
    saveDescriptor: noSave,
    confirmConflict: async () => {
      throw new Error("没有 409 时不得弹确认");
    },
    run,
    onExported: (outcome) => broadcast.push(outcome.id),
  });
  assert.deepEqual(sent, ["a"], "b / c 不得被发起（离开即停）");
  assert.deepEqual(broadcast, ["a"], "已完成条目的广播不得因为组件没了就被跳过（验收 16 的徽标依赖它）");
  assert.deepEqual(outcomes.map((o) => o.status), ["exported"]);
});

test("exportEach + run（要求 3）：取消后已发出的 409 不再弹确认，落成 declined（未确认 ⇒ 不覆盖）", async () => {
  const run = createSkillRun();
  let asked = 0;
  const outcomes = await exportEach({
    prompts: [prompt({ skillName: "mine" }), prompt({ id: "b", skillName: "mine" })],
    descriptors: {},
    send: async () => {
      // 请求已发出 → 用户此刻离开 → 宿主才回 409。
      run.cancel();
      throw new ApiError("技能目录 mine 已存在，且不属于本插件的任何提示词（可能是你手写的技能）", 409);
    },
    saveDescriptor: noSave,
    confirmConflict: async () => {
      asked++;
      return true;
    },
    run,
  });
  assert.equal(asked, 0, "离开后不得再弹没有上下文来源的同名冲突确认框");
  assert.deepEqual(outcomes.map((o) => o.status), ["declined"], "同一事实：没有确认 ⇒ 不覆盖");
  assert.equal(outcomes[0].name, "mine");
});

test("exportEach：onExported 只对**成功**条目触发（失败 / 预校验拒绝都不广播）", async () => {
  const broadcast = [];
  const s = scriptedSend([{ name: "ok-name", path: "/h/skills/ok-name/SKILL.md" }, new ApiError("提示词不存在", 404)]);
  const outcomes = await exportEach({
    prompts: [prompt({ id: "a" }), prompt({ id: "b" }), prompt({ id: "c", title: "", body: "   " })],
    descriptors: {
      a: { ok: true, descriptor: descriptor({ name: "ok-name" }) },
      b: { ok: true, descriptor: descriptor({ name: "b-name" }) },
    },
    send: s.send,
    saveDescriptor: noSave,
    confirmConflict: async () => false,
    onExported: (outcome) => broadcast.push(outcome.id),
  });
  assert.deepEqual(outcomes.map((o) => o.status), ["exported", "failed", "failed"]);
  assert.deepEqual(broadcast, ["a"], "失败（404）与预校验拒绝都不得广播：宿主没写库");
});

test("exportEach + run：**批次开始前**就已取消 ⇒ 一条请求都不发（边界情形）", async () => {
  const run = createSkillRun();
  run.cancel();
  const s = scriptedSend([{ name: "x", path: "/h/skills/x/SKILL.md" }]);
  const outcomes = await exportEach({
    prompts: [prompt({ id: "a" })],
    descriptors: { a: { ok: true, descriptor: descriptor({ name: "x" }) } },
    send: s.send,
    saveDescriptor: noSave,
    confirmConflict: async () => true,
    run,
  });
  assert.equal(s.calls.length, 0);
  assert.deepEqual(outcomes, []);
});

// ─────────────────────────────────────────────────────────────────────────────
// T6 / D-1：已导出条目的目录名**恒为 prompt.skillName**（AI 名只是「尚未导出」条目的候选）
//
// 实测缺陷：技能页以 `descriptor.name` 优先于 `prompt.skillName` ⇒ 对已导出条目
// 「AI 补全 → 导出」一换名就**另建目录**，旧目录从此无主（后续对旧名 409）。
// ─────────────────────────────────────────────────────────────────────────────

test("D-1：exportNameLocked —— skillName 非空即锁定（空白串不算名字）", async () => {
  assert.equal(exportNameLocked(prompt({ skillName: "mine" })), true);
  assert.equal(exportNameLocked(prompt()), false, "从未导出 ⇒ 未锁定（AI 名是候选）");
  assert.equal(exportNameLocked(prompt({ skillName: "   " })), false, "空白串不构成锁定");
});

test("D-1：precheckExport —— skillName 非空时优先于 AI 名（AI 换名不改它）", () => {
  const pre = precheckExport(prompt({ skillName: "mine" }), descriptor({ name: "ai-renamed" }));
  assert.equal(pre.ok, true);
  assert.equal(pre.name, "mine", "已导出条目的名字已锁定：AI 名不得胜出");
  assert.notEqual(pre.name, "ai-renamed");
});

test("D-1 请求形状：skillName 非空 ⇒ **显式**带 name = skillName（且 ≠ AI 名）", async () => {
  const s = scriptedSend([{ name: "mine", path: "/h/skills/mine/SKILL.md" }]);
  const ai = descriptor({ name: "ai-renamed", description: "AI 描述", whenToUse: "当你要改名时" });
  const outcomes = await exportEach({
    prompts: [prompt({ skillName: "mine" })],
    descriptors: { p1: { ok: true, descriptor: ai } },
    send: s.send,
    saveDescriptor: noSave,
    confirmConflict: async () => {
      throw new Error("没有 409 时不得弹确认");
    },
  });
  assert.equal(s.calls.length, 1);
  assert.equal(s.calls[0].request.name, "mine", "必须显式下发 skillName（宿主候选序把 descriptor.name 排在它之前，只靠「不下发」AI 名会赢）");
  assert.notEqual(s.calls[0].request.name, ai.name, "下发的是锁定名，不是 AI 名");
  assert.deepEqual(s.calls[0].request.descriptor, ai, "descriptor 仍原样下发：description / whenToUse 照旧提质");
  assert.equal(outcomes[0].status, "exported");
  assert.equal(outcomes[0].name, "mine", "导出名取宿主回执（与锁定名一致）");
});

test("D-1 反面对照：skillName 为空 ⇒ 仍用 AI 名（AI 名是「尚未导出」条目的候选）", async () => {
  const s = scriptedSend([{ name: "ai-name", path: "/h/skills/ai-name/SKILL.md" }]);
  await exportEach({
    prompts: [prompt()],
    descriptors: { p1: { ok: true, descriptor: descriptor({ name: "AI Name" }) } },
    send: s.send,
    saveDescriptor: noSave,
    confirmConflict: async () => {
      throw new Error("没有 409 时不得弹确认");
    },
  });
  assert.equal(s.calls[0].request.name, "ai-name", "未导出条目：kebab 后的 AI 名就是这次的目录名");
});

test("D-1 落库：descriptor.name 存**这一次真正用过的**名字（否则徽标重导会另建目录）", async () => {
  const saved = [];
  const s = scriptedSend([{ name: "mine", path: "/h/skills/mine/SKILL.md" }]);
  await exportEach({
    prompts: [prompt({ skillName: "mine" })],
    descriptors: {
      p1: { ok: true, descriptor: descriptor({ name: "ai-renamed", description: "AI 描述", whenToUse: "当你要改名时" }) },
    },
    send: s.send,
    saveDescriptor: async (id, d) => saved.push({ id, d }),
    confirmConflict: async () => {
      throw new Error("没有 409 时不得弹确认");
    },
  });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].id, "p1");
  assert.equal(
    saved[0].d.name,
    "mine",
    "存进 meta 的目录名候选必须与库里的 skillName 同步——徽标重导只带 promptId + 这份 descriptor，宿主仍按 descriptor.name 优先",
  );
  assert.equal(saved[0].d.description, "AI 描述", "description 原样保留（T3：重导保留 AI descriptor 不受影响）");
  assert.equal(saved[0].d.whenToUse, "当你要改名时", "whenToUse 也原样保留");
});

