/**
 * 技能徽标（过期判定 + 一键重导的请求形状）单测（P7 T3 / 规格 §7.6 / 验收 16）。
 *
 * 两个消费者：宿主 `src/host/skills.ts`（导出时判定）与客户端 `SkillBadge.tsx`（显示徽标）。
 * 它们必须是**同一份规则**——本文件用**函数恒等**锁住同源；行为表只钉住三态语义与边界。
 *
 * 组件接线（`.tsx`）进不了 `node --test`（本仓库无 react-dom，Node 的类型擦除也不认 JSX），
 * 故「徽标挂在列表行/详情页」「点按钮真的调了 api」归 T5 活体验收——这里不造空洞断言。
 * 本文件断言的是**可执行的那一半**：三态收敛、过期边界、状态→色名映射、重导请求形状与结局分类、
 * 以及 R-P7-AA 的 descriptor「写 → 读 → 回传」链（含真写盘的 frontmatter 对照）。
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const badge = await import("../src/skill-badge.ts");
const skillName = await import("../src/skill-name.ts");
const skillDescription = await import("../src/skill-description.ts");
const hostSkills = await import("../src/host/skills.ts");
const exportUtils = await import("../src/client/utils/skill-export.ts");
const theme = await import("../src/client/utils/theme.ts");

/** 宿主级用例要**真写盘**（R-P7-AA 的终局证据）：DSH_HOME 指向临时目录，绝不碰用户真实技能目录。 */
const home = mkdtempSync(join(tmpdir(), "dpe-badge-"));
process.env.DSH_HOME = home;
after(() => rmSync(home, { recursive: true, force: true }));

/** 窄接口构造：默认「导出过、导出后又改过（100 → 200）」= 已过期。 */
const p = (over = {}) => ({ skillName: "weekly-report", updatedAt: 200, skillExportedAt: 100, ...over });

// ─────────────────────────────────────────────────────────────────────────────
// 三态
// ─────────────────────────────────────────────────────────────────────────────

test("skillBadgeState：三态 = 未导出（不渲染）/ 已导出未过期 / 已过期", () => {
  assert.equal(badge.skillBadgeState(p({ skillName: undefined })), "none", "从未导出（无 skillName）→ 不渲染徽标");
  assert.equal(badge.skillBadgeState(p({ skillName: "" })), "none", "空串与缺省同判（判定里是 Boolean(skillName)）");
  assert.equal(badge.skillBadgeState(p({ updatedAt: 100 })), "exported", "导出后未再改动（updatedAt === skillExportedAt）→ 已导出");
  assert.equal(badge.skillBadgeState(p({ updatedAt: 99 })), "exported", "updatedAt 早于导出时间 → 已导出");
  assert.equal(badge.skillBadgeState(p()), "stale", "导出后又改过（100 → 200）→ 过期");
});

test("边界：updatedAt === skillExportedAt **不算**过期（刚导出完立刻看）", () => {
  const same = p({ updatedAt: 100, skillExportedAt: 100 });
  assert.equal(badge.isSkillStale(same), false, "相等不算过期（是 > 不是 >=）");
  assert.equal(badge.skillBadgeState(same), "exported");
  // 反面对照：邻居（差 1ms）必须已过期——否则「判定恒为 false」也会让上面那条绿。
  assert.equal(badge.isSkillStale({ ...same, updatedAt: 101 }), true, "差 1ms 就必须过期");
  assert.equal(badge.isSkillStale({ ...same, updatedAt: 99 }), false, "早于导出时间不算过期");
});

test("isSkillStale：从未导出不算过期（缺省 / 空串都要挡，哪怕时间戳很大）", () => {
  assert.equal(badge.isSkillStale(p({ skillName: undefined, updatedAt: 999, skillExportedAt: 0 })), false);
  assert.equal(badge.isSkillStale(p({ skillName: "", updatedAt: 999, skillExportedAt: 0 })), false);
});

test("三态与判定在同一张输入表上逐一一致（三态是判定的收敛，不是第二份条件）", () => {
  const table = [
    p({ skillName: undefined, updatedAt: 5, skillExportedAt: 9 }),
    p({ skillName: "", updatedAt: 5, skillExportedAt: 9 }),
    p({ skillName: "a", updatedAt: 9, skillExportedAt: 9 }),
    p({ skillName: "a", updatedAt: 10, skillExportedAt: 9 }),
    p({ skillName: "a", updatedAt: 8, skillExportedAt: 9 }),
  ];
  for (const input of table) {
    const expected = input.skillName ? (badge.isSkillStale(input) ? "stale" : "exported") : "none";
    assert.equal(badge.skillBadgeState(input), expected, JSON.stringify(input));
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 徽标渲染参数：状态 → 色名 / 文案键 / 动作（规格 §7.6：已导出绿、已过期警示色）
// ─────────────────────────────────────────────────────────────────────────────

test("skillBadgeVisual：已导出 = 绿 + 附名；已过期 = 警示色 + 重导按钮（渲染点不再自己判一次状态）", () => {
  assert.deepEqual(badge.skillBadgeVisual("exported"), {
    tone: "success",
    labelKey: "manager.skill.badgeExported",
    action: false,
    showName: true,
  });
  assert.deepEqual(badge.skillBadgeVisual("stale"), {
    tone: "warn",
    labelKey: "manager.skill.badgeStale",
    action: true,
    showName: false,
  });
  assert.notEqual(badge.skillBadgeVisual("exported").tone, badge.skillBadgeVisual("stale").tone, "两态必须不同色");
});

test("TONE：两个状态色都读宿主 --dsw-alias-state-* 令牌（不写死主题色）且取值互不相同", () => {
  const shape = /^var\(--dsw-alias-state-[a-z-]+,\s*#?[0-9a-fA-F]{3,8}\)$/;
  for (const [name, value] of Object.entries(theme.TONE)) {
    assert.match(value, shape, name + " 必须是 var(--dsw-alias-state-*, 兜底) 形态（规格 §7.5 口径）");
  }
  assert.notEqual(theme.TONE.success, theme.TONE.warn);
  for (const state of ["exported", "stale"]) {
    const tone = badge.skillBadgeVisual(state).tone;
    assert.ok(Object.hasOwn(theme.TONE, tone), state + " 的 tone（" + tone + "）必须在 TONE 里有色值");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 同源锁：同一份规则 ≠ 两份恰好相同
// ─────────────────────────────────────────────────────────────────────────────

test("同源锁：宿主 isSkillStale 与 skill-badge 的是**同一个函数**（宿主只有 import + re-export）", () => {
  assert.equal(
    hostSkills.isSkillStale,
    badge.isSkillStale,
    "宿主必须 re-export `src/skill-badge.ts` 的实现——换成宿主本地副本（两份恰好相同）时本用例必红",
  );
});

test("同源锁的附带证据：宿主 skills.ts 的既有导出面逐字不变（import + re-export 不删任何名字）", () => {
  for (const name of [
    "SKILL_NAME_RE",
    "SKILL_NAME_MAX_LEN",
    "toKebab",
    "isValidSkillName",
    "skillDir",
    "skillFilePath",
    "resolveDescription",
    "renderSkillFile",
    "skillExists",
    "exportSkill",
    "isSkillStale",
  ]) {
    assert.ok(Object.hasOwn(hostSkills, name), "宿主 skills.ts 仍应导出 " + name);
  }
  // 技能名规则同款同源（P7 T2 立的；这里顺带钉住，防止有人在 T3 顺手把它复制回宿主）。
  assert.equal(hostSkills.toKebab, skillName.toKebab);
  assert.equal(hostSkills.isValidSkillName, skillName.isValidSkillName);
});

test("同源锁：宿主 resolveDescription 与 skill-description 的是**同一个函数**（宿主只有 import + re-export）", () => {
  assert.equal(
    hostSkills.resolveDescription,
    skillDescription.resolveDescription,
    "宿主必须 re-export `src/skill-description.ts` 的实现——换回宿主本地副本（两份恰好相同）时本用例必红",
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 一键重导：请求形状 + 结局分类
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 记录每次 send 入参的假实现（真实现 = `api.exportPromptAsSkill`）。脚本逐条给：
 * 直接给回执对象 = 成功；给 `{ throws: x }` = 抛出 x（x 可以是 Error，也可以是字符串——
 * 非 Error 的抛出同样要能被 String() 看见，见下面那条用例）。
 */
function scriptedSend(script) {
  const calls = [];
  const queue = [...script];
  const send = async (request) => {
    calls.push(request);
    const next = queue.shift();
    if (next && next.throws !== undefined) throw next.throws;
    return next;
  };
  return { calls, send };
}

const receipt = { name: "weekly-report", path: "/home/u/.dsh/skills/weekly-report/SKILL.md" };

/** `exportEach` 的条目（SkillCandidate 窄接口）。 */
const cand = (id, over = {}) => ({ id, title: "标题 " + id, body: "正文 " + id, ...over });

/** 首次导出时 AI 给的那一份（**原样**落 meta、**原样**回传的那份）。 */
const aiDescriptor = { name: "Weekly Report", description: "AI 生成的描述", whenToUse: "当用户要写周报时" };

test("重导请求形状：只有 promptId（+ 读得到的 descriptor），**不带** name / conflictConfirmed", async () => {
  // ① 降级形态（meta 缺失）：请求体回到「只有 promptId」。
  const plain = scriptedSend([receipt]);
  const plainOutcome = await badge.reExportSkill("p1", plain.send);
  assert.equal(plain.calls.length, 1, "恰好一次请求");
  assert.deepEqual(plain.calls[0], { promptId: "p1" }, "降级时请求体只带 promptId——多一个键就会改变宿主语义");
  assert.equal(Object.keys(plain.calls[0]).length, 1);
  assert.equal(plainOutcome.ok, true);

  // ② 带 descriptor 形态（R-P7-AA）：原样回传，**仍然**不带 name / conflictConfirmed。
  const withDescriptor = scriptedSend([receipt]);
  const outcome = await badge.reExportSkill("p1", withDescriptor.send, aiDescriptor);
  assert.deepEqual(withDescriptor.calls[0], { promptId: "p1", descriptor: aiDescriptor }, "descriptor 必须原样回传");
  assert.equal(Object.keys(withDescriptor.calls[0]).length, 2);
  for (const forbidden of ["name", "conflictConfirmed"]) {
    assert.ok(
      !Object.hasOwn(withDescriptor.calls[0], forbidden),
      "不得带 " + forbidden + "（带 name = 改名导出会新建目录 / 带 conflictConfirmed = 绕过归属判据）",
    );
  }
  assert.equal(outcome.ok, true);
});

test("重导结局：成功 → ok + 宿主回执原样（目标目录取宿主，不由客户端拼）", async () => {
  const s = scriptedSend([receipt]);
  const outcome = await badge.reExportSkill("p1", s.send);
  assert.deepEqual(outcome, { ok: true, receipt });
});

test("重导结局：回执缺 path → pathMissing（契约漂移不得当成功，也不得伪造路径）", async () => {
  const s = scriptedSend([{ name: "weekly-report" }]);
  const outcome = await badge.reExportSkill("p1", s.send);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.errorKey, "manager.skill.pathMissing");
  assert.equal(outcome.detail, "keys=name");
  assert.ok(!Object.hasOwn(outcome, "receipt"), "缺 path 时不得把回执当成功返回");
});

test("重导结局：宿主错误 → exportFailed + 原始 detail；409 **不得**自动确认重试（那是用户手写的目录）", async () => {
  const cases = [
    [
      Object.assign(new Error("技能目录 weekly-report 已存在，且不属于本插件的任何提示词（可能是你手写的技能）"), { status: 409 }),
      "技能目录 weekly-report 已存在，且不属于本插件的任何提示词（可能是你手写的技能）",
    ],
    [new Error("技能名非法：需要小写 kebab-case"), "技能名非法：需要小写 kebab-case"],
    ["boom", "boom"],
  ];
  for (const [thrown, detail] of cases) {
    const s = scriptedSend([{ throws: thrown }]);
    const outcome = await badge.reExportSkill("p1", s.send);
    assert.equal(outcome.ok, false);
    assert.equal(outcome.errorKey, "manager.skill.exportFailed");
    assert.equal(outcome.detail, detail, "宿主原文 / 非 Error 的 String() 都必须可见（不得静默吞掉）");
    assert.equal(s.calls.length, 1, "失败后不得自动重试（带上 conflictConfirmed 就等于替用户同意覆盖）");
    assert.deepEqual(s.calls[0], { promptId: "p1" }, "失败路径的请求形状同样是「只有 promptId」");
  }
});
// ─────────────────────────────────────────────────────────────────────────────
// R-P7-AA（修复轮 1）：descriptor 的写入 / 读取 / 回传 —— 重导不再丢 whenToUse、不降级 description
// ─────────────────────────────────────────────────────────────────────────────

test("meta 键约定：pl:skill-descriptor:<promptId>（T4 照抄这一条）", () => {
  assert.equal(exportUtils.skillDescriptorMetaKey("p1"), "pl:skill-descriptor:p1");
});

test("写入：每条**成功**导出都把用过的 descriptor **原样**落 meta，失败条目一律不落", async () => {
  const saved = [];
  const s = scriptedSend([receipt, { throws: new Error("提示词不存在") }]);
  const outcomes = await exportUtils.exportEach({
    prompts: [cand("a"), cand("b")],
    descriptors: {
      a: { ok: true, descriptor: aiDescriptor },
      b: { ok: true, descriptor: { name: "b-skill", description: "b 的描述" } },
    },
    send: s.send,
    confirmConflict: async () => false,
    saveDescriptor: async (promptId, descriptor) => {
      saved.push([promptId, descriptor]);
    },
  });
  assert.deepEqual(outcomes.map((o) => o.status), ["exported", "failed"]);
  assert.deepEqual(saved, [["a", aiDescriptor]], "只落成功那条，且是原样的 descriptor（失败条目宿主没写盘）");
});

test("写入（真实 HTTP 形状）：persistDescriptor 走 PUT /meta/<key>，体是 descriptor 的 JSON 文本", async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return { status: 200, ok: true, json: async () => ({ ok: true, data: { key: "k", value: "v" } }) };
  };
  try {
    await exportUtils.persistDescriptor("p1", aiDescriptor);
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(calls.length, 1, "恰好一次写入");
  assert.equal(calls[0].url, "/api/prompt-enhancer/meta/" + encodeURIComponent("pl:skill-descriptor:p1"));
  assert.equal(calls[0].init.method, "PUT");
  assert.deepEqual(JSON.parse(calls[0].init.body), { value: JSON.stringify(aiDescriptor) });
});

test("写 → 读 → 回传（round-trip）：落进 meta 的那份必须逐字回到重导请求体里", async () => {
  const store = new Map();
  const s = scriptedSend([receipt]);
  const outcomes = await exportUtils.exportEach({
    prompts: [cand("a")],
    descriptors: { a: { ok: true, descriptor: aiDescriptor } },
    send: s.send,
    confirmConflict: async () => false,
    saveDescriptor: async (promptId, descriptor) => {
      store.set(exportUtils.skillDescriptorMetaKey(promptId), JSON.stringify(descriptor));
    },
  });
  assert.deepEqual(outcomes.map((o) => o.status), ["exported"]);

  const loaded = await exportUtils.loadStoredDescriptor("a", async (key) => store.get(key) ?? "");
  assert.deepEqual(loaded, aiDescriptor, "读回来的必须与写进去的逐字相同");

  const spy = scriptedSend([receipt]);
  const outcome = await badge.reExportSkill("a", spy.send, loaded);
  assert.equal(outcome.ok, true);
  assert.deepEqual(spy.calls[0], { promptId: "a", descriptor: aiDescriptor }, "重导请求体把 descriptor 原样带上");
});

test("降级：meta 缺失（从未落过）⇒ 请求体回到「只有 promptId」，且重导**不失败**", async () => {
  const loaded = await exportUtils.loadStoredDescriptor("never", async () => "");
  assert.equal(loaded, undefined, "store.getMetaValue 的缺失值就是空串 ⇒ 静默降级为 undefined");
  const spy = scriptedSend([receipt]);
  const outcome = await badge.reExportSkill("never", spy.send, loaded);
  assert.equal(outcome.ok, true, "meta 缺失不得让重导失败");
  assert.deepEqual(spy.calls[0], { promptId: "never" });
});

test("降级：meta 损坏（坏 JSON / 形状不符）⇒ undefined + 可见告警，照样不失败", async () => {
  const bad = [
    "{不是 JSON",
    JSON.stringify({ description: "只有描述" }),
    JSON.stringify({ name: 42, description: "d" }),
    JSON.stringify({ name: "n", description: "d", whenToUse: 7 }),
    JSON.stringify("字符串不是对象"),
  ];
  for (const raw of bad) {
    const loaded = await exportUtils.loadStoredDescriptor("p1", async () => raw);
    assert.equal(loaded, undefined, "坏值必须降级：「" + raw + "」");
  }
  const spy = scriptedSend([receipt]);
  const outcome = await badge.reExportSkill("p1", spy.send, undefined);
  assert.equal(outcome.ok, true);
  assert.deepEqual(spy.calls[0], { promptId: "p1" }, "降级时不得多出半个键");
});

test("多余键丢弃（T7 ④ 补的用例）：meta 里多出来的字段一律不进 descriptor，只回 ≤3 个已知字段", () => {
  // 报告曾声称覆盖了这条，但仓内没有用例（T7 ④ 的裁决）——它是重导请求体形状的最后一道闸：
  // meta 是**外部数据**（用户可手改 / 老版本可能写过多余键），不能原样塞进请求体。
  // 直接用 JSON **文本**构造（而不是 JSON.stringify 一个字面量）：`"__proto__"` 要真的成为被解析对象上的
  // 一个自有键（字面量里的 `__proto__:` 是设置原型，不会进 JSON）。
  const withExtras = exportUtils.parseStoredDescriptor(
    '{"name":"weekly-report","description":"把要点整理成周报","whenToUse":"当用户要写周报时",' +
      '"extra":"多余字段","nested":{"a":1},"__proto__":{"polluted":true},"name2":"另一个名字"}',
  );
  assert.deepEqual(withExtras, {
    name: "weekly-report",
    description: "把要点整理成周报",
    whenToUse: "当用户要写周报时",
  }, "多余键必须被丢弃（逐字回一个只有已知字段的新对象）");
  assert.deepEqual(Object.keys(withExtras), ["name", "description", "whenToUse"], "键集恰好三个");

  // 缺 whenToUse 时**不得**回一个 `whenToUse: undefined` 的键：请求体里多出的半截键同样是形状漂移。
  const twoFields = exportUtils.parseStoredDescriptor(
    JSON.stringify({ name: "n", description: "d", extra: 1 }),
  );
  assert.deepEqual(twoFields, { name: "n", description: "d" });
  assert.deepEqual(Object.keys(twoFields), ["name", "description"]);
});

test("丢弃 ≠ 拒绝（P8 T5 独立反面对照）：未知键与缺必填字段分属两侧，各自单独可判假", () => {
  // 修前这条「反面对照」挂在上面那条用例里、复用的正是它刚断言过的 `withExtras`：那条断言被前一条
  // `deepEqual` 蕴含（withExtras 若是 undefined，上面先红），它自己永远不可能是首先失败的那条，等于
  // 没断言。现在自己造输入、自己给期望值，且是**独立用例**——与任何前序用例无状态耦合。
  assert.equal(
    exportUtils.parseStoredDescriptor('{"extra":1,"whenToUse":"只有多余键、没有必填字段"}'),
    undefined,
    "拒绝侧：缺 name/description ⇒ 形状不符（不得因为「多了个 whenToUse」就放行）",
  );
  assert.deepEqual(
    exportUtils.parseStoredDescriptor('{"name":"solo","description":"独立输入","nested":{"a":1}}'),
    { name: "solo", description: "独立输入" },
    "丢弃侧：必填字段齐全、只有多余键 ⇒ 形状合法、多余键逐字丢弃（丢弃 ≠ 拒绝）",
  );
});

test("读写失败都不阻断：setMeta 抛错、getMeta 抛错都只告警（导出与重导各自成立）", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new TypeError("Failed to parse URL from /api/prompt-enhancer/meta/pl:skill-descriptor:p1");
  };
  try {
    await exportUtils.persistDescriptor("p1", aiDescriptor); // 不得抛（它只是提质信息）
    const loaded = await exportUtils.loadStoredDescriptor("p1", async () => {
      throw new Error("宿主 500");
    });
    assert.equal(loaded, undefined);
  } finally {
    globalThis.fetch = original;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// R-P7-AA 的终局证据（真写盘）：重导保留 whenToUse 与 AI 描述，且写回**同一个目录**
// ─────────────────────────────────────────────────────────────────────────────

test("重导 frontmatter 对照：带 descriptor = 保留 whenToUse + AI 描述；不带 = 降级（修前形态）", () => {
  const first = hostSkills.exportSkill({
    prompt: { id: "p1", title: "周报生成", body: "把要点整理成周报" },
    descriptor: aiDescriptor,
  });
  assert.equal(first.ok, true, first.error);
  assert.equal(first.name, "weekly-report", "AI 给的名字被 kebab 化");
  const afterFirst = readFileSync(first.path, "utf8");
  assert.match(afterFirst, /whenToUse: "当用户要写周报时"/);
  assert.match(afterFirst, /description: "AI 生成的描述"/);

  // 用户改了正文 ⇒ 徽标变「技能已过期」⇒ 点重导。**修前**形态：请求体不带 descriptor。
  const changed = { id: "p1", title: "周报生成", body: "改过的正文首行\n第二行" };
  const degraded = hostSkills.exportSkill({ prompt: changed, name: "weekly-report", ownerPromptId: "p1" });
  assert.equal(degraded.ok, true, degraded.error);
  const afterDegraded = readFileSync(degraded.path, "utf8");
  assert.doesNotMatch(afterDegraded, /whenToUse/, "修前形态：不带 descriptor ⇒ whenToUse 被宿主丢掉（R-P7-AA 的缺陷）");
  assert.match(afterDegraded, /description: "改过的正文首行"/, "修前形态：description 降级成正文首行");

  // **修后**形态：重导把 meta 里那份原样回传（宿主按 toKebab(descriptor.name) 落到同一目录）。
  const fixed = hostSkills.exportSkill({ prompt: changed, descriptor: aiDescriptor, ownerPromptId: "p1" });
  assert.equal(fixed.ok, true, fixed.error);
  assert.equal(fixed.path, first.path, "重导必须写回**同一个目录**（descriptor.name kebab 化后 == 库里的 skillName）");
  const afterFixed = readFileSync(fixed.path, "utf8");
  assert.match(afterFixed, /whenToUse: "当用户要写周报时"/, "修后：whenToUse 不再丢");
  assert.match(afterFixed, /description: "AI 生成的描述"/, "修后：description 保持 AI 生成的那份");
  assert.match(afterFixed, /改过的正文首行/, "正文仍然更新（重导确实发生了）");
  assert.deepEqual(readdirSync(join(home, "skills")), ["weekly-report"], "skills 根下始终只有这一个目录（没新增）");
});