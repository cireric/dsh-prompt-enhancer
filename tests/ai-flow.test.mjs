import { test } from "node:test";
import assert from "node:assert/strict";

const flow = await import("../src/client/utils/ai-flow.ts");
const { ApiError } = await import("../src/client/utils/api.ts");
const { TITLE_MAX_LEN } = await import("../src/types.ts");

test("keepVariablesFor：含 {{变量}} → true；普通文本 → false；空变量名 {{}} 与 {{   }} → false（与 parseVariables 口径一致）", () => {
  assert.equal(flow.keepVariablesFor("请用 {{主题}} 写"), true);
  assert.equal(flow.keepVariablesFor("普通文本"), false);
  assert.equal(flow.keepVariablesFor("{{}}"), false);
  assert.equal(flow.keepVariablesFor("{{   }}"), false);
});

test("libraryCreateInput：body 用原文草稿（不是完善稿）、tags 最多 1 个、summary 透传", () => {
  const refined = { title: "AI 标题", tags: ["重要", "备用"], summary: "AI 摘要", body: "AI 完善稿" };
  const out = flow.libraryCreateInput(refined, "原文草稿");
  assert.deepEqual(out, { title: "AI 标题", body: "原文草稿", tags: ["重要"], summary: "AI 摘要" });
  assert.notEqual(out.body, refined.body);
});

test("libraryCreateInput：AI title 超过 TITLE_MAX_LEN 被截断", () => {
  const long = "标".repeat(TITLE_MAX_LEN + 10);
  const out = flow.libraryCreateInput({ title: long, tags: [], summary: "", body: "完善稿" }, "原文");
  assert.equal(out.title.length, TITLE_MAX_LEN);
  assert.equal(out.title, long.slice(0, TITLE_MAX_LEN));
});

test("libraryCreateInput：AI title 为空串时取原文首行（第一个换行之前）再截断", () => {
  const refined = { title: "", tags: [], summary: "", body: "完善稿" };
  assert.equal(flow.libraryCreateInput(refined, "第一行\n第二行\n第三行").title, "第一行");
  const longFirstLine = "甲".repeat(TITLE_MAX_LEN + 5) + "\n第二行";
  assert.equal(flow.libraryCreateInput(refined, longFirstLine).title, "甲".repeat(TITLE_MAX_LEN));
});

test("libraryCreateInput：原文以空行开头时取首个非空行（否则落库 title 为空）", () => {
  const refined = { title: "", tags: [], summary: "", body: "完善稿" };
  assert.equal(flow.libraryCreateInput(refined, "\n标题").title, "标题");
  assert.equal(flow.libraryCreateInput(refined, "\n\n标题\n正文").title, "标题");
  const blank = flow.libraryCreateInput(refined, "   \n\t\n  ");
  assert.equal(blank.title, "", "全空白草稿 → 空 title，且不抛");
  assert.equal(blank.body, "   \n\t\n  ", "body 永远是原文，一字不改");
});

test("libraryCreateInput：AI title 只有空白字符时视为没有标题，取原文首行", () => {
  const refined = { title: "  ", tags: [], summary: "", body: "完善稿" };
  assert.equal(flow.libraryCreateInput(refined, "第一行\n第二行").title, "第一行");
  assert.equal(flow.libraryCreateInput({ ...refined, title: "\t" }, "第一行").title, "第一行");
});

test("needsWriteBack：完善稿与原文不同 → true；完全相同 → false（对应 store.ts 的写回边界）", () => {
  assert.equal(flow.needsWriteBack("AI 完善稿", "原文草稿"), true);
  assert.equal(flow.needsWriteBack("原文草稿", "原文草稿"), false);
  assert.equal(flow.needsWriteBack("原文草稿\n", "原文草稿"), true);
});

test("canToggle：sourceBody 非空 → true；缺字段或空串 → false", () => {
  assert.equal(flow.canToggle({ sourceBody: "x" }), true);
  assert.equal(flow.canToggle({}), false);
  assert.equal(flow.canToggle({ sourceBody: "" }), false);
});

test("aiErrorKey：按 HTTP 503 判 ai.unavailable、按 TimeoutError 判 ai.timeout、其余 ai.fail", () => {
  assert.equal(flow.aiErrorKey(new ApiError("AI 不可用或调用失败（请检查模型设置）", 503)), "ai.unavailable");
  assert.equal(flow.aiErrorKey(new DOMException("x", "TimeoutError")), "ai.timeout");
  assert.equal(flow.aiErrorKey(new ApiError("该提示词没有可回退的原文（sourceBody 为空）", 400)), "ai.fail");
  assert.equal(flow.aiErrorKey(new Error("boom")), "ai.fail");
});
