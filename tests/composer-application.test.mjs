import assert from "node:assert/strict";
import test from "node:test";
import { applyCheckRevision, confirmDraftApplication, requestComposerApplication } from "../src/client/utils/composer-application.ts";
import { fillTemplate } from "../src/client/utils/template.ts";

const submit = (text) => ({ kind: "submit", text });
const tryFill = (text) => ({ kind: "try", text });

test("直接润色无变量时立即应用当前编辑稿，正文任何变化都阻止覆盖", () => {
  const source = { kind: "polish", original: "发起时的正文" };
  const edited = tryFill("当前编辑稿  ");
  assert.deepEqual(requestComposerApplication(source, source.original, edited), { kind: "apply", text: edited.text });
  assert.deepEqual(requestComposerApplication(source, source.original + " ", edited), { kind: "blocked" });
});

test("直接增强打开试填，提交时重读 Composer，显式保留的占位符不会再次打开试填", () => {
  const source = { kind: "template", original: "增强原文" };
  const template = "检查 {{范围}}，输出 {{格式}}。";
  assert.deepEqual(requestComposerApplication(source, source.original, tryFill(template)), { kind: "fill" });
  const filled = fillTemplate(template, { 范围: "src" });
  assert.deepEqual(requestComposerApplication(source, "试填期间改了 Composer", submit(filled)), { kind: "blocked" });
  assert.deepEqual(requestComposerApplication(source, source.original, submit(filled)),
    { kind: "apply", text: "检查 src，输出 {{格式}}。" });
});

test("从空 Composer 起草后增强，试填稿的覆盖基线仍是进入起草时的正文", () => {
  const source = { kind: "template", original: "交给增强的起草稿", draftComposer: "" };
  const template = "检查 {{范围}}。";
  assert.deepEqual(requestComposerApplication(source, "", tryFill(template)), { kind: "fill" });
  const filled = submit(fillTemplate(template, { 范围: "src" }));
  assert.deepEqual(requestComposerApplication(source, "", filled), { kind: "apply", text: "检查 src。" });
  const first = requestComposerApplication(source, source.original, filled);
  assert.deepEqual(first, { kind: "confirm", current: source.original, proposed: "检查 src。" });
  const second = confirmDraftApplication(first, "确认期间再次修改");
  assert.deepEqual(second, { kind: "confirm", current: "确认期间再次修改", proposed: "检查 src。" });
  assert.deepEqual(confirmDraftApplication(second, second.current), { kind: "apply", text: "检查 src。" });
});

const baseline = { draft: "检查原文", draftRev: 1 };
const current = { ...baseline, phase: "idle" };
const check = { visible: true, liveClaim: "ai", baseline, body: "检查编辑稿  " };

test("旧 Composer 或让位的检查结果不写入，重新可见仍能应用原编辑稿", () => {
  const noWrite = { setDraft: () => assert.fail("不可见或不属于当前 Composer 时不能写入") };
  const writes = [];
  const owner = {
    setDraft: (text) => writes.push(text),
    submit: () => assert.fail("应用结果不发送"),
  };
  const application = { ...check, owner };
  assert.deepEqual(applyCheckRevision(noWrite, application, current), { kind: "ignored" });
  assert.deepEqual(applyCheckRevision(owner, { ...application, visible: false }, current), { kind: "ignored" });
  assert.deepEqual(applyCheckRevision(owner, { ...application, liveClaim: "library" }, current), { kind: "ignored" });
  assert.deepEqual(writes, []);
  assert.deepEqual(applyCheckRevision(owner, application, current), { kind: "applied" });
  assert.deepEqual(writes, [check.body]);
});

test("检查正文不变但修订号变化仍需确认；确认后再变也不能写入", () => {
  const owner = { setDraft: () => assert.fail("未确认当前修订号时不能写入") };
  const changed = { ...current, draftRev: 2 };
  const first = applyCheckRevision(owner, { ...check, owner }, changed);
  assert.deepEqual(first, { kind: "confirm", reviewed: { draft: baseline.draft, draftRev: 2 } });
  const latest = { ...changed, draftRev: 3 };
  assert.deepEqual(applyCheckRevision(owner, { ...check, owner, reviewed: first.reviewed }, latest),
    { kind: "confirm", reviewed: { draft: baseline.draft, draftRev: 3 } });
});

test("检查编辑稿为空不尝试写；捕获到更晚修订号不报成功，复核后仍可应用原编辑稿", () => {
  const writes = [];
  let capturedRev = current.draftRev;
  const owner = { setDraft: (text) => writes.push(text), captureInsertion: () => ({ draftRev: capturedRev }) };
  assert.deepEqual(applyCheckRevision(owner, { ...check, owner, body: " \n " }, current), { kind: "rejected" });
  capturedRev = 2;
  assert.deepEqual(applyCheckRevision(owner, { ...check, owner }, current), { kind: "rejected" });
  assert.deepEqual(writes, []);
  const latest = { ...current, draftRev: capturedRev };
  const approval = applyCheckRevision(owner, { ...check, owner }, latest);
  assert.deepEqual(approval, { kind: "confirm", reviewed: { draft: baseline.draft, draftRev: capturedRev } });
  assert.deepEqual(applyCheckRevision(owner, { ...check, owner, reviewed: approval.reviewed }, latest), { kind: "applied" });
  assert.deepEqual(writes, [check.body]);
});
