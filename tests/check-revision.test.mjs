import assert from "node:assert/strict";
import { test } from "node:test";
import * as check from "../src/client/utils/check-revision.ts";
const { prepareCheckRevision, applyCheckRevision } = check;

const baseline = { draft: "原文 {{输入}}", draftRev: 1 };
const report = { findings: [
  { quote: "原文", issue: "范围", suggestion: "限定范围" },
  { quote: "原文", issue: "输出", suggestion: "加格式" },
] };

test("检查改稿只提交选中的建议及本次检查原文", () => {
  assert.equal(prepareCheckRevision(baseline, report, []), undefined);
  assert.deepEqual(prepareCheckRevision(baseline, report, [1]), { body: baseline.draft, findings: [report.findings[1]] });
});

test("普通检查默认不选，只从检查快照和已勾选建议生成改稿", () => {
  const result = check.editCheckSession(check.startCheck(baseline), { type: "reported", report });
  assert.equal(check.beginCheckRevision(result), undefined);
  const selected = check.editCheckSession(result, { type: "select", index: 1, selected: true });
  assert.deepEqual(check.beginCheckRevision(selected)?.request, { body: baseline.draft, findings: [report.findings[1]] });
});

test("取消或失败回到原报告，重试沿用勾选", () => {
  const result = check.editCheckSession(check.startCheck(baseline), { type: "reported", report });
  const selected = check.editCheckSession(result, { type: "select", index: 0, selected: true });
  const inFlight = check.beginCheckRevision(selected).session;
  const returned = check.editCheckSession(inFlight, { type: "returnToReport" });
  assert.deepEqual(returned.report, report);
  assert.deepEqual(check.beginCheckRevision(returned)?.request, { body: baseline.draft, findings: [report.findings[0]] });
});

test("重查不继承旧勾选、编辑稿或覆盖确认", () => {
  const result = check.editCheckSession(check.startCheck(baseline), { type: "reported", report });
  const selected = check.editCheckSession(result, { type: "select", index: 1, selected: true });
  const revision = check.editCheckSession(check.beginCheckRevision(selected).session, {
    type: "revised", revision: { body: "旧改稿", pending: [] },
  });
  const confirmation = check.editCheckSession(revision, { type: "confirm", reviewed: baseline });
  assert.equal(confirmation.phase, "confirming");
  const next = { draft: "新版", draftRev: 2 };
  const nextReport = { findings: [{ quote: "新版", issue: "交付", suggestion: "补上验收条件" }] };
  const recheck = check.editCheckSession(check.startCheck(next), { type: "reported", report: nextReport });
  assert.equal(recheck.phase, "report");
  assert.deepEqual(recheck.report, nextReport);
  assert.equal(check.beginCheckRevision(recheck), undefined);
  const selectedAgain = check.editCheckSession(recheck, { type: "select", index: 0, selected: true });
  assert.deepEqual(check.beginCheckRevision(selectedAgain)?.request, { body: "新版", findings: nextReport.findings });
});

test("覆盖确认取消后保留编辑稿，并恢复从检查原文复核", () => {
  const result = check.editCheckSession(check.startCheck(baseline), { type: "reported", report });
  const selected = check.editCheckSession(result, { type: "select", index: 0, selected: true });
  const revision = check.editCheckSession(check.beginCheckRevision(selected).session, {
    type: "revised", revision: { body: "AI 改稿", pending: ["确认格式"] },
  });
  const edited = check.editCheckSession(revision, { type: "editRevision", body: "手工改稿" });
  const changed = { draft: "另一版", draftRev: 2 };
  const confirmed = check.editCheckSession(edited, { type: "confirm", reviewed: changed });
  assert.deepEqual(check.checkRevisionBaseline(confirmed), changed);
  const returned = check.editCheckSession(confirmed, { type: "keepEditing" });
  assert.deepEqual(returned.revision, { body: "手工改稿", pending: ["确认格式"] });
  assert.deepEqual(check.checkRevisionBaseline(returned), baseline);
});

test("覆盖确认以展示过的正文和修订号为准，最终只写编辑稿", () => {
  const writes = [];
  const actions = { setDraft: (body) => writes.push(body) };
  const first = { draft: "变化后的正文", draftRev: 2, phase: "idle" };
  const latest = { ...first, draftRev: 3 };
  const edited = "用户编辑后的优化稿  ";
  const review = applyCheckRevision(actions, baseline, first, edited);
  assert.deepEqual(review, { kind: "confirm", reviewed: { draft: first.draft, draftRev: 2 } });
  const recheck = applyCheckRevision(actions, review.reviewed, latest, edited);
  assert.equal(recheck.kind, "confirm");
  assert.deepEqual(writes, []);
  assert.deepEqual(applyCheckRevision(actions, recheck.reviewed, latest, edited), { kind: "applied" });
  assert.deepEqual(writes, [edited]);
});

test("写入被锁定或捕获到更晚修订号时保留输入框", () => {
  const actions = { setDraft: () => assert.fail("不应覆盖输入框") };
  const locked = { ...baseline, phase: "sending" };
  assert.deepEqual(applyCheckRevision(actions, baseline, locked, "优化稿"), { kind: "rejected" });
  const raced = { ...actions, captureInsertion: () => ({ draftRev: 2 }) };
  assert.deepEqual(applyCheckRevision(raced, baseline, { ...baseline, phase: "idle" }, "优化稿"), { kind: "rejected" });
});
