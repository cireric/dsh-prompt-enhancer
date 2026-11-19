import { test } from "node:test";
import assert from "node:assert/strict";
const ins = await import("../src/client/utils/insert.ts");

test("旧宿主追加、覆盖和替换 # 令牌通过普通文本写入", () => {
  const writes = [];
  const actions = { setDraft: (draft) => writes.push(draft) };
  const input = { draft: "已有内容", draftRev: undefined };
  assert.equal(ins.insertPromptDraft(actions, input, "提示词", "insert"), true);
  assert.equal(ins.insertPromptDraft(actions, { ...input, draft: "" }, "提示词", "insert"), true);
  assert.equal(ins.insertPromptDraft(actions, input, "提示词", "insert-send"), true);
  assert.equal(ins.insertPromptDraft(actions, input, "提示词", "overwrite"), true);
  assert.equal(ins.insertPromptDraft(actions, { ...input, draft: "先前 #令牌" }, "提示词", "replace-hash"), true);
  assert.deepEqual(writes, ["已有内容\n提示词", "提示词", "已有内容\n提示词", "提示词", "先前 提示词"]);
});

test("模板填值时草稿变化，覆盖和发送需要重新确认", () => {
  const initial = { draft: "相同文本", draftRev: 7 };
  const changed = { draft: initial.draft, draftRev: 8 };
  assert.equal(ins.needsInsertionConfirmation("overwrite", initial, changed), true);
  assert.equal(ins.needsInsertionConfirmation("insert-send", initial, changed), true);
  assert.equal(ins.needsInsertionConfirmation("insert", initial, changed), false);
  assert.equal(ins.needsInsertionConfirmation("overwrite", initial, initial), false);
  assert.equal(ins.needsInsertionConfirmation("insert-send", { draft: "old" }, { draft: "new" }), true);
});

test("插入计算编辑器坐标，保留命令和参考卡片的结构", () => {
  const writes = [];
  const replacements = [];
  const actions = {
    captureInsertion: () => ({ start: 0, end: 0, draftRev: 4 }),
    insertText: (text, span) => { writes.push({ text, span }); return true; },
    setDraft: (text) => replacements.push(text),
  };
  const input = {
    draft: "/goal 👋 @first @second  #find",
    draftRev: 4,
    claim: { token: "/goal " },
    occurrences: [{ offset: 9, length: 6 }, { offset: 16, length: 7 }],
  };
  assert.equal(ins.insertPromptDraft(actions, input, "提示词", "insert"), true);
  assert.equal(ins.insertPromptDraft(actions, input, "提示词", "insert-send"), true);
  assert.equal(ins.insertPromptDraft(actions, input, "提示词", "replace-hash"), true);
  assert.equal(ins.insertPromptDraft(actions, input, "提示词", "overwrite"), true);
  assert.deepEqual(writes, [
    { text: "\n提示词", span: { start: 15, end: 15, draftRev: 4 } },
    { text: "\n提示词", span: { start: 15, end: 15, draftRev: 4 } },
    { text: " 提示词", span: { start: 8, end: 15, draftRev: 4 } },
  ]);
  assert.deepEqual(replacements, ["提示词"]);
});

test("覆盖含引用选区卡片的草稿使用整体替换，不从展开文本猜编辑器长度", () => {
  const replacements = [];
  const actions = {
    captureInsertion: () => ({ start: 6, end: 6, draftRev: 4 }),
    insertText: () => assert.fail("覆盖不能使用不完整的引用投影计算坐标"),
    setDraft: (text) => replacements.push(text),
  };
  const input = { draft: "> quoted selection tail", draftRev: 4, occurrences: [] };
  assert.equal(ins.insertPromptDraft(actions, input, "新正文", "overwrite"), true);
  assert.deepEqual(replacements, ["新正文"]);
  assert.equal(ins.insertPromptDraft(actions, { ...input, draftRev: 3 }, "过期正文", "overwrite"), false);
  assert.deepEqual(replacements, ["新正文"]);
});

test("草稿快照已过期、宿主拒绝插入或仅有会丢卡片的写入方式时，不改写草稿", () => {
  const writes = [];
  const legacy = { setDraft: (draft) => writes.push(draft) };
  const actions = {
    ...legacy,
    captureInsertion: () => ({ start: 0, end: 0, draftRev: 8 }),
    insertText: (...args) => { writes.push(args); return false; },
  };
  const input = { draft: "@file", draftRev: 7, occurrences: [{ offset: 0, length: 5 }] };
  assert.equal(ins.insertPromptDraft(actions, input, "later", "insert-send"), false);
  assert.equal(ins.insertPromptDraft(legacy, input, "later", "insert-send"), false);
  assert.deepEqual(writes, []);
  assert.equal(ins.insertPromptDraft(actions, { ...input, draftRev: 8 }, "later", "insert-send"), false);
  assert.deepEqual(writes, [["\nlater", { start: 1, end: 1, draftRev: 8 }]]);
});

// promptSummary：列表行摘要（P4 已实现，本任务只补覆盖，不改实现）。
test("promptSummary：有 summary 时优先，并去掉首尾换行/空白", () => {
  assert.equal(ins.promptSummary({ summary: "\nAI 摘要\n", body: "正文内容" }), "AI 摘要");
  assert.equal(ins.promptSummary({ summary: "  AI 摘要  ", body: "正文内容" }), "AI 摘要");
  assert.equal(ins.promptSummary({ summary: "   ", body: "正文内容" }), "正文内容");
});

test("promptSummary：无 summary 时取正文并把连续空白压成单空格", () => {
  assert.equal(ins.promptSummary({ body: "第一行\n\n第二行   第三行" }), "第一行 第二行 第三行");
  assert.equal(ins.promptSummary({ body: "  首尾  \t 空白  " }), "首尾 空白");
});

test("promptSummary：超过 max 时截断并补 …（恰好等于 max 不截断）", () => {
  const long = "字".repeat(80);
  const out = ins.promptSummary({ body: long });
  assert.equal(out, "字".repeat(60) + "…");
  assert.equal(out.length, 61);
  assert.equal(ins.promptSummary({ body: "12345678901" }, 10), "1234567890…");
  assert.equal(ins.promptSummary({ body: "字".repeat(60) }), "字".repeat(60));
});

test("promptSummary：空正文 → 空串", () => {
  assert.equal(ins.promptSummary({ body: "" }), "");
  assert.equal(ins.promptSummary({ body: "   \n\t " }), "");
});


test("最近使用按最后插入时间排序，排除从未使用的条目", () => {
  const prompts = [
    { id: "never", lastUsedAt: 0, usageCount: 0 },
    { id: "frequent", lastUsedAt: 10, usageCount: 500 },
    { id: "recent", lastUsedAt: 20, usageCount: 1 },
  ];
  assert.deepEqual(ins.recentPrompts(prompts, 1).map((p) => p.id), ["recent"]);
  assert.deepEqual(ins.recentPrompts(prompts).map((p) => p.id), ["recent", "frequent"]);
});
