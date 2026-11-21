import assert from "node:assert/strict";
import test from "node:test";
import { DRAFT_FEEDBACK_MAX_LENGTH } from "../src/types.ts";
import {
  createDraftSession, editDraftSession, prepareDraftGeneration, generateDraft,
  prepareDraftHandoff, draftCheckIsStale, draftSuggestionFeedback,
  requestDraftApplication, confirmDraftApplication,
} from "../src/client/utils/draft-session.ts";

const question = "交付用什么语言？";
const clarify = { kind: "clarify", questions: [{ question, options: ["中文", "英文"] }] };
const draft = { kind: "draft", body: "用中文总结访谈。", assumptions: [] };
const finding = { quote: "总结", issue: "缺少归属", suggestion: "注明发言人。" };
const report = { findings: [finding] };
const context = { idea: "总结访谈", executor: "只读聊天模型", references: "逐字稿在附件中" };
const signal = new AbortController().signal;

function withFields(session, fields) {
  for (const [field, value] of Object.entries(fields)) {
    session = editDraftSession(session, { type: "field", field, value });
  }
  return session;
}

function start() {
  return withFields(createDraftSession(""), context);
}

async function respond(session, action, expected, result) {
  const request = prepareDraftGeneration(session, action);
  assert.deepEqual(request, expected);
  return generateDraft(session, request, signal, async () => result);
}

async function firstDraft() {
  return respond(start(), "generate", context, draft);
}

test("跳过澄清发送空回答，拒绝再追问；失败、取消与重试保留原输入", async () => {
  const questions = await respond(start(), "generate", context, clarify);
  const edited = editDraftSession(questions, { type: "answer", index: 0, value: "英文" });
  const skipped = { ...context, answers: [{ question, answer: "" }] };
  const request = prepareDraftGeneration(edited, "skip");
  assert.deepEqual(request, skipped);
  await assert.rejects(generateDraft(edited, request, signal, async () => clarify));
  assert.deepEqual(edited.answers, ["英文"]);

  const abort = new AbortController();
  const pending = generateDraft(edited, request, abort.signal, async () => draft);
  abort.abort();
  assert.equal(await pending, undefined);
  const result = await respond(edited, "skip", skipped, draft);
  assert.deepEqual(result.generatedFrom, skipped);
  assert.equal(result.body, draft.body);

  const answers = editDraftSession(result, { type: "editInputs" });
  await respond(answers, "generate", { ...context, answers: [{ question, answer: "英文" }] }, draft);
  const idea = editDraftSession(answers, { type: "editIdea" });
  assert.equal((await respond(idea, "generate", context, clarify)).step, "questions");
});

test("澄清后从想法页重新生成并直接出稿，编辑输入不返回旧澄清页", async () => {
  const questions = await respond(start(), "generate", context, clarify);
  const answered = editDraftSession(questions, { type: "answer", index: 0, value: "中文" });
  const first = await respond(answered, "generate", { ...context, answers: [{ question, answer: "中文" }] }, draft);
  const inputs = editDraftSession(first, { type: "editInputs" });
  assert.equal(inputs.step, "questions");

  const idea = editDraftSession(inputs, { type: "editIdea" });
  const direct = await respond(idea, "generate", context, draft);
  assert.equal(editDraftSession(direct, { type: "editInputs" }).step, "idea");
});

test("按反馈改写使用当前编辑稿及原生成依据，只有成功才追加历史", async () => {
  const first = await firstDraft();
  const edited = withFields(first, { body: "用中文总结附件访谈。", feedback: "  改为英文。  " });
  const request = prepareDraftGeneration(edited, "revise");
  assert.deepEqual(request, { ...context, revision: { body: edited.body, feedback: "改为英文。" } });
  await assert.rejects(generateDraft(edited, request, signal, async () => { throw new Error("offline"); }), /offline/);
  const abort = new AbortController();
  const pending = generateDraft(edited, request, abort.signal, async () => draft);
  abort.abort();
  assert.equal(await pending, undefined);
  assert.deepEqual(edited.generatedFrom, context);
  assert.equal(edited.feedback, "  改为英文。  ");
  assert.equal(edited.body, "用中文总结附件访谈。");

  const revised = await generateDraft(edited, request, signal, async () => ({ ...draft, body: "Summarize in English." }));
  assert.equal(revised.feedback, "");
  const secondEdit = withFields(revised, { feedback: "最多三条。" });
  const second = await respond(secondEdit, "revise", {
    ...context, feedbackHistory: ["改为英文。"], revision: { body: "Summarize in English.", feedback: "最多三条。" },
  }, { ...draft, body: "Summarize in up to three points." });
  assert.deepEqual(second.generatedFrom, { ...context, feedbackHistory: ["改为英文。", "最多三条。"] });
});

test("编辑下一稿的输入不改旧稿依据，新稿成功后也不继承旧反馈", async () => {
  const first = await firstDraft();
  const edited = withFields(first, { feedback: "改为英文。" });
  const revised = await generateDraft(edited, prepareDraftGeneration(edited, "revise"), signal, async () => draft);
  const pending = withFields(editDraftSession(revised, { type: "editInputs" }), { idea: "列出行动项" });
  const source = { url: "https://example.com/interview" };
  const sourced = editDraftSession(pending, { type: "searched", search: { status: "found", sources: [source] } });
  const old = editDraftSession(sourced, { type: "returnResult" });
  assert.deepEqual(old.generatedFrom, { ...context, feedbackHistory: ["改为英文。"] });
  assert.equal(old.body, draft.body);
  const expected = { ...context, idea: "列出行动项", sources: [source] };
  const next = await respond(sourced, "generate", expected, draft);
  assert.deepEqual(next.generatedFrom, expected);
  const changedQuery = withFields(sourced, { query: "新查询" });
  assert.deepEqual(prepareDraftGeneration(changedQuery, "generate"), { ...context, idea: "列出行动项" });
});

test("检查建议只对同一生成结果与逐字一致正文有效，带入不改正文或历史", async () => {
  const edited = withFields(await firstDraft(), { body: "用中文总结附件访谈。", feedback: "保留日期。" });
  const snapshot = prepareDraftHandoff(edited);
  assert.deepEqual(snapshot, { body: "用中文总结附件访谈。", generatedFrom: context });
  const checked = editDraftSession(edited, { type: "checked", snapshot, report });
  assert.equal(draftSuggestionFeedback(checked, finding), "保留日期。\n\n注明发言人。");
  const used = editDraftSession(checked, { type: "useSuggestion", finding });
  assert.equal(used.feedback, "保留日期。\n\n注明发言人。");
  assert.equal(used.body, edited.body);
  assert.deepEqual(used.generatedFrom, context);
  const changed = withFields(used, { body: used.body + " " });
  assert.equal(draftCheckIsStale(changed), true);
  assert.equal(editDraftSession(changed, { type: "useSuggestion", finding }), changed);
  const restored = withFields(changed, { body: edited.body });
  assert.equal(draftCheckIsStale(restored), false);
  assert.ok(draftSuggestionFeedback(restored, finding));
  const fits = "a".repeat(DRAFT_FEEDBACK_MAX_LENGTH - "\n\n注明发言人。".length);
  assert.equal(draftSuggestionFeedback(withFields(restored, { feedback: fits }), finding), fits + "\n\n注明发言人。");
  assert.equal(draftSuggestionFeedback(withFields(restored, { feedback: fits + "a" }), finding), undefined);

  const revised = await generateDraft(restored, prepareDraftGeneration(restored, "revise"), signal, async () => ({ ...draft, body: edited.body }));
  assert.equal(draftCheckIsStale(revised), true);
  assert.equal(draftSuggestionFeedback(revised, finding), undefined);
});

test("重新生成的相同正文和相同输入也不能使上一稿的检查重新有效", async () => {
  const first = await firstDraft();
  const snapshot = prepareDraftHandoff(first);
  const checked = editDraftSession(first, { type: "checked", snapshot, report });
  const next = await respond(editDraftSession(checked, { type: "editInputs" }), "generate", context, draft);
  assert.deepEqual(next.generatedFrom, first.generatedFrom);
  assert.equal(draftCheckIsStale(next), true);
  assert.equal(draftSuggestionFeedback(next, finding), undefined);
  const newFinding = { ...finding };
  const rechecked = editDraftSession(next, { type: "checked", snapshot: prepareDraftHandoff(next), report: { findings: [newFinding] } });
  assert.equal(draftSuggestionFeedback(rechecked, newFinding), "注明发言人。");
  assert.equal(draftSuggestionFeedback(rechecked, finding), undefined);
});

test("应用起草或增强稿以进入时的 Composer 为基线，变化后两次确认不写旧版", async () => {
  const session = createDraftSession("未改的 Composer");
  assert.deepEqual(requestDraftApplication(session, "未改的 Composer", draft.body), { kind: "apply", text: draft.body });
  const enhanced = "用中文总结附件访谈：{{逐字稿}}。";
  const first = requestDraftApplication(session, "用户改了草稿", enhanced);
  assert.deepEqual(first, { kind: "confirm", current: "用户改了草稿", proposed: enhanced });
  const second = confirmDraftApplication(first, "用户再次改了草稿");
  assert.deepEqual(second, { kind: "confirm", current: "用户再次改了草稿", proposed: enhanced });
  assert.deepEqual(confirmDraftApplication(second, "用户再次改了草稿"), { kind: "apply", text: enhanced });
});
