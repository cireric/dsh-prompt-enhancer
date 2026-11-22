import assert from "node:assert/strict";
import { test } from "node:test";
import { prepareCheckRevision, applyCheckRevision } from "../src/client/utils/check-revision.ts";

const baseline = { draft: "原文 {{输入}}", draftRev: 1 };
const report = { findings: [
  { quote: "原文", issue: "范围", suggestion: "限定范围" },
  { quote: "原文", issue: "输出", suggestion: "加格式" },
] };

test("检查改稿只提交选中的建议及本次检查原文", () => {
  assert.equal(prepareCheckRevision(baseline, report, []), undefined);
  assert.deepEqual(prepareCheckRevision(baseline, report, [1]), { body: baseline.draft, findings: [report.findings[1]] });
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
