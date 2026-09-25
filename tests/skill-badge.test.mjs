/**
 * 技能徽标（过期判定 + 一键重导的请求形状）单测（P7 T3 / 规格 §7.6 / 验收 16）。
 *
 * 两个消费者：宿主 `src/host/skills.ts`（导出时判定）与客户端 `SkillBadge.tsx`（显示徽标）。
 * 它们必须是**同一份规则**——本文件用**函数恒等**锁住同源；行为表只钉住三态语义与边界。
 *
 * 组件接线（`.tsx`）进不了 `node --test`（本仓库无 react-dom，Node 的类型擦除也不认 JSX），
 * 故「徽标挂在列表行/详情页」「点按钮真的调了 api」归 T5 活体验收——这里不造空洞断言。
 * 本文件断言的是**可执行的那一半**：三态收敛、过期边界、重导请求形状与结局分类。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const badge = await import("../src/skill-badge.ts");
const skillName = await import("../src/skill-name.ts");
const hostSkills = await import("../src/host/skills.ts");

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

test("重导请求形状：**只**发 { promptId }（不带 name / descriptor / conflictConfirmed）", async () => {
  const s = scriptedSend([receipt]);
  const outcome = await badge.reExportSkill("p1", s.send);
  assert.equal(s.calls.length, 1, "恰好一次请求");
  assert.deepEqual(s.calls[0], { promptId: "p1" }, "请求体只带 promptId——多一个键就会改变宿主语义");
  assert.equal(Object.keys(s.calls[0]).length, 1);
  for (const forbidden of ["name", "descriptor", "conflictConfirmed"]) {
    assert.ok(
      !Object.hasOwn(s.calls[0], forbidden),
      "不得带 " + forbidden + "（带 name = 改名导出会新建目录 / 带 descriptor = 再跑一次 AI / 带 conflictConfirmed = 绕过归属判据）",
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