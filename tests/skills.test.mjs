/**
 * 技能导出单测（规格 §6.5 / §9.1）。
 *
 * 写盘落到临时 `DSH_HOME`，因此不碰用户真实技能目录。
 * 负样本（非法名 / 空 description / 同名冲突）必须真的拒绝且**不留下文件**。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, after } from "node:test";
import assert from "node:assert/strict";

const home = mkdtempSync(join(tmpdir(), "dpe-skills-"));
process.env.DSH_HOME = home;

const skills = await import("../src/host/skills.ts");

after(() => rmSync(home, { recursive: true, force: true }));

const prompt = (over = {}) => ({ id: "p1", title: "周报生成", body: "把要点整理成周报", ...over });

// ─────────────────────────────────────────────────────────────────────────────
// 名字：kebab 化与严格校验
// ─────────────────────────────────────────────────────────────────────────────

test("toKebab：把 AI 常见写法归一，但不咀嚼结构性输入", () => {
  assert.equal(skills.toKebab("Weekly Report"), "weekly-report");
  assert.equal(skills.toKebab("  Code_Review  "), "code-review");
  assert.equal(skills.toKebab("a  b"), "a-b");
  assert.equal(skills.toKebab("---lead-and-trail---"), "lead-and-trail");
  assert.equal(skills.toKebab(""), "");
  assert.equal(skills.toKebab("   "), "");
  assert.equal(skills.toKebab("../evil"), "", "含 .. 的输入必须返回空（拒绝），不得悄悄改成 evil");
  assert.equal(skills.toKebab("a/b"), "", "含路径分隔符必须返回空");
  assert.equal(skills.toKebab("a\\b"), "");
});

test("isValidSkillName：严格 kebab 校验（路径穿越的最后一道闸）", () => {
  assert.equal(skills.isValidSkillName("weekly-report"), true);
  assert.equal(skills.isValidSkillName("a"), true);
  assert.equal(skills.isValidSkillName("a1-b2"), true);
  assert.equal(skills.isValidSkillName("../evil"), false);
  assert.equal(skills.isValidSkillName("a/b"), false);
  assert.equal(skills.isValidSkillName("A_B"), false, "大写与下划线不是合法 kebab");
  assert.equal(skills.isValidSkillName("-lead"), false);
  assert.equal(skills.isValidSkillName("trail-"), false);
  assert.equal(skills.isValidSkillName("a--b"), false);
  assert.equal(skills.isValidSkillName(""), false);
  assert.equal(skills.isValidSkillName("a".repeat(65)), false, "超过长度上限必须拒绝");
});

// ─────────────────────────────────────────────────────────────────────────────
// description 兜底链
// ─────────────────────────────────────────────────────────────────────────────

test("resolveDescription：summary → AI 描述 → 正文首行 → 标题", () => {
  assert.equal(skills.resolveDescription(prompt({ summary: "摘要优先" }), { name: "x", description: "AI 描述" }), "摘要优先");
  assert.equal(skills.resolveDescription(prompt(), { name: "x", description: "AI 描述" }), "AI 描述");
  assert.equal(
    skills.resolveDescription(prompt({ body: "\n\n  正文首行  \n第二行" })),
    "正文首行",
    "正文首行必须跳过空白行并 trim",
  );
  assert.equal(skills.resolveDescription(prompt({ body: "" })), "周报生成", "正文为空时兜底到标题");
  assert.equal(
    skills.resolveDescription(prompt({ title: "", body: "   " })),
    undefined,
    "全空必须返回 undefined（由调用方拒绝导出）",
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 渲染
// ─────────────────────────────────────────────────────────────────────────────

test("renderSkillFile：frontmatter 含 name/description，whenToUse 有则写、无则省略", () => {
  const withWhen = skills.renderSkillFile({
    name: "weekly-report",
    description: "把要点整理成周报",
    whenToUse: "当用户需要写周报时",
    body: "正文内容",
  });
  assert.match(withWhen, /^---\nname: weekly-report\ndescription: "把要点整理成周报"\nwhenToUse: "当用户需要写周报时"\n---\n/);
  assert.match(withWhen, /\n正文内容\n$/);

  const withoutWhen = skills.renderSkillFile({ name: "x", description: "d", body: "b" });
  assert.ok(!withoutWhen.includes("whenToUse"), "无 whenToUse 时不得写出空字段行");
});

test("renderSkillFile：description 里的冒号/引号不会破坏 frontmatter", () => {
  const rendered = skills.renderSkillFile({
    name: "colon-test",
    description: 'Careful: has "quotes" and: colons',
    body: "b",
  });
  const line = rendered.split("\n").find((l) => l.startsWith("description:"));
  assert.ok(line);
  const parsed = JSON.parse(line.slice("description: ".length));
  assert.equal(parsed, 'Careful: has "quotes" and: colons');
});

// ─────────────────────────────────────────────────────────────────────────────
// 导出（含负样本）
// ─────────────────────────────────────────────────────────────────────────────

test("exportSkill：写出 SKILL.md，正文原样、path 指向 $DSH_HOME/skills", () => {
  const res = skills.exportSkill({
    prompt: prompt({ body: "把 {{要点}} 整理成周报" }),
    descriptor: { name: "Weekly Report", description: "Turn notes into a weekly report", whenToUse: "When writing a weekly report" },
  });
  assert.equal(res.ok, true, res.error);
  assert.equal(res.name, "weekly-report", "AI 给的名字必须被 kebab 化");
  assert.equal(res.path, join(home, "skills", "weekly-report", "SKILL.md"));
  const content = readFileSync(res.path, "utf8");
  assert.match(content, /whenToUse: "When writing a weekly report"/, "whenToUse 必须落盘（修上游丢弃缺陷）");
  assert.ok(content.includes("把 {{要点}} 整理成周报"), "正文必须原样写入（含模板变量）");
});

test("exportSkill 负样本：description 全空必须拒绝，且不创建任何文件", () => {
  const res = skills.exportSkill({
    prompt: { id: "p2", title: "", body: "   " },
    name: "empty-desc",
  });
  assert.equal(res.ok, false);
  assert.match(res.error, /description/);
  assert.equal(existsSync(join(home, "skills", "empty-desc")), false, "拒绝时不得留下目录或文件");
});

test("exportSkill 负样本：非法名（路径穿越 / 空）必须拒绝且不越界写盘", () => {
  for (const bad of ["../evil", "a/b", ""]) {
    const res = skills.exportSkill({ prompt: prompt(), name: bad, descriptor: { name: bad, description: "d" } });
    assert.equal(res.ok, false, `「${bad}」必须被拒绝`);
    assert.match(res.error, /技能名非法/);
  }
  // 「不得越界写盘」的正面证据：skills 根与其父目录都不该出现我们的文件
  assert.equal(existsSync(join(home, "SKILL.md")), false, "绝不能在 skills 根之外落文件");
  assert.equal(existsSync(join(home, "evil")), false, "`../evil` 不得被解释成 skills 的兄弟目录");
  assert.equal(existsSync(join(home, "skills", "a")), false, "`a/b` 不得被拆成两级目录");
});

/**
 * 策略澄清（与计划初稿不同，执行时细化）：
 * 「路径安全」由**校验最终名字**保证，而不是由「拒绝原始输入的一切异常形态」保证。
 * 因此大小写混合/下划线这类**无害**输入会被 kebab 化后接受（AI 常给 "Weekly Report"，
 * 若一律拒绝会把正常流程堵死）；只有含路径分隔符或 `..` 的**结构性**输入才直接拒绝。
 */
test("exportSkill：无害输入被 kebab 化接受，结构性输入才拒绝", () => {
  const mixed = skills.exportSkill({ prompt: prompt({ id: "p-upper" }), name: "UPPER", descriptor: { name: "UPPER", description: "d" } });
  assert.equal(mixed.ok, true);
  assert.equal(mixed.name, "upper", "大写被归一为小写后接受");
  assert.equal(mixed.path, join(home, "skills", "upper", "SKILL.md"));

  // 注意：同一进程共享一个临时 DSH_HOME，所以这里必须用**前面用例没建过**的名字，
  // 否则会命中「同名目录不属于本插件」的冲突分支（那是另一个用例专门覆盖的行为）。
  const spaced = skills.exportSkill({ prompt: prompt({ id: "p-space" }), name: "Daily Standup", descriptor: { name: "Daily Standup", description: "d" } });
  assert.equal(spaced.ok, true);
  assert.equal(spaced.name, "daily-standup", "带空格的名字必须被归一而不是拒绝");
  assert.equal(spaced.path, join(home, "skills", "daily-standup", "SKILL.md"));
});

test("exportSkill 负样本：同名目录不属于本插件时必须先确认，且不覆盖", () => {
  const dir = join(home, "skills", "mine");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), "用户手写的技能，不能被覆盖", "utf8");

  const blocked = skills.exportSkill({ prompt: prompt({ id: "p9" }), name: "mine" });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.conflict, true, "必须返回 conflict 标记，供前端弹确认");
  assert.equal(readFileSync(join(dir, "SKILL.md"), "utf8"), "用户手写的技能，不能被覆盖", "未确认前不得覆盖");

  const confirmed = skills.exportSkill({ prompt: prompt({ id: "p9" }), name: "mine", conflictConfirmed: true });
  assert.equal(confirmed.ok, true);
  assert.match(readFileSync(join(dir, "SKILL.md"), "utf8"), /name: mine/);
});

test("exportSkill：重新导出同一条提示词必须覆盖同一目录（不新增目录）", () => {
  const first = skills.exportSkill({ prompt: prompt({ id: "p3" }), name: "re-export", descriptor: { name: "re-export", description: "v1" } });
  assert.equal(first.ok, true);
  const second = skills.exportSkill({
    prompt: prompt({ id: "p3", body: "改过之后" }),
    name: "re-export",
    descriptor: { name: "re-export", description: "v2" },
    ownerPromptId: "p3",
  });
  assert.equal(second.ok, true, "同一提示词重导不得被冲突判定挡住");
  assert.equal(second.path, first.path);
  assert.match(readFileSync(second.path, "utf8"), /改过之后/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 过期判定
// ─────────────────────────────────────────────────────────────────────────────

test("isSkillStale：导出后改动才算过期；从未导出不算", () => {
  assert.equal(skills.isSkillStale({ skillName: "x", updatedAt: 100, skillExportedAt: 100 }), false);
  assert.equal(skills.isSkillStale({ skillName: "x", updatedAt: 101, skillExportedAt: 100 }), true);
  assert.equal(skills.isSkillStale({ updatedAt: 999, skillExportedAt: 0 }), false, "从未导出（无 skillName）不算过期");
  assert.equal(skills.isSkillStale({ skillName: "", updatedAt: 999, skillExportedAt: 0 }), false);
});
