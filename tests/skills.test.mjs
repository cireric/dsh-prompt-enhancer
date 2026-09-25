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
import { setTimeout as sleep } from "node:timers/promises";

const home = mkdtempSync(join(tmpdir(), "dpe-skills-"));
process.env.DSH_HOME = home;

const skills = await import("../src/host/skills.ts");
// T7-2 的路由用例走**真实分发**（真查库、真写盘）：DSH_HOME 已在上方指向本次临时目录，
// 而 store 的 db 路径是**调用期**求值（硬约束 13），故这里的 import 顺序不是承重条件。
const store = await import("../src/host/store.ts");
const { makeRoutes } = await import("../src/host/routes.ts");
const { dshHome } = await import("../src/host/paths.ts");
const { API_PREFIX } = await import("../src/types.ts");

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

// ─────────────────────────────────────────────────────────────────────────────
// T7-2：归属查询「自持优先」（**路由层**）——同名的两条各自都能导出，不误报 409
// ─────────────────────────────────────────────────────────────────────────────
//
// 修前 `routes.ts` 用 `store.listPrompts().find((p) => p.skillName === name)` 定归属，取的是**首条**。
// 两条提示词同名是**可达状态**（同名目录确认后覆盖 / 导入备份），首条不是本次导出的那条时，
// `exportSkill` 就把本插件自己的目录判成「用户手写的」⇒ 对自有目录**误报 409**。
// 这条用例必须走**真实分发**（真建目录、真写库）：缺陷在路由的归属查询里，纯 `exportSkill` 看不到它。
//
// **变异靶**：把归属查询退回单个 `find` ⇒ 第二次导出必红（409）。

/** 假 IncomingMessage（同 tests/skill-export-route.test.mjs：够分发层用即可）。 */
function fakeReq(method, url, body) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body), "utf8")];
  return {
    method,
    url,
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk;
    },
  };
}

function fakeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(chunk) {
      this.body = chunk;
    },
  };
}

/** 真的走一遍 POST /skills/export 的分发（单条 prefix 路由）。 */
async function postSkillExport(body) {
  const res = fakeRes();
  await makeRoutes()[0].handler(fakeReq("POST", API_PREFIX + "/skills/export", body), res);
  return { status: res.statusCode, envelope: JSON.parse(res.body) };
}

test("T7-2：两条提示词同名（目录属于本插件）⇒ 各自导出都不 409，且写在同一个目录", async () => {
  const NAME = "dup-owner";
  // 先建「第二次导出」的那条（`mine`），隔开 5ms 再建「第一次导出」的那条（`other`）：
  // default 排序是**新建在前**（`createdAt` 降序，FRESH_MS = 7 天），故列表里 other 在 mine 之前——
  // 普通 `find` 取首条会拿到 other，于是第二次导出（mine）就被判成「目录属于别人」⇒ 误报 409。
  const mine = store.createPrompt({ title: "同名（本次导出）", body: "mine 的正文" });
  store.updatePrompt(mine.id, { skillName: NAME });
  await sleep(5); // 保证两条 createdAt 不同 ⇒ 上面的排序确定（不依赖并列时 sort 的稳定性）
  const other = store.createPrompt({ title: "同名（另一条）", body: "other 的正文" });
  store.updatePrompt(other.id, { skillName: NAME });

  // 前提：普通 `find`（缺陷形态）取到的首条**不是**本次导出的那条——否则本用例抓不到任何东西。
  const sameName = store.listPrompts().filter((p) => p.skillName === NAME);
  assert.equal(sameName.length, 2, "前提：库里确实有两条同名（skillName 相同）的提示词");
  assert.deepEqual(sameName.map((p) => p.id), [other.id, mine.id], "前提：default 排序把后建的那条排在前");
  assert.notEqual(sameName[0].id, mine.id, "前提：首条 ≠ 本次要导出的那条（find 取首条会误判归属）");

  // 第一次导出：目录还不存在 ⇒ 与归属判定无关，先把本插件自己的目录建出来。
  const first = await postSkillExport({ promptId: other.id });
  assert.equal(first.status, 200, "首次导出应 200：" + JSON.stringify(first.envelope));
  const file = join(dshHome(), "skills", NAME, "SKILL.md");
  assert.equal(existsSync(file), true, "技能目录已建出（后续导出都落在它上面）");

  // 第二次导出：目录已存在，归属查询必须认出「它是本插件自己的（就是这条提示词）」⇒ 不得 409。
  const second = await postSkillExport({ promptId: mine.id });
  assert.equal(
    second.status,
    200,
    "同名目录属于本插件自己的另一条提示词 ⇒ 不得 409：" + JSON.stringify(second.envelope),
  );
  assert.equal(second.envelope.data.name, NAME, "回执的名字就是那个同名目录");
  assert.equal(second.envelope.data.path, file, "两条同名提示词落在**同一个目录**（没有另建）");
  assert.equal(store.getPrompt(mine.id).skillName, NAME);
  assert.equal(store.listPrompts().filter((p) => p.skillName === NAME).length, 2, "两条都还挂着这个名字");
});
