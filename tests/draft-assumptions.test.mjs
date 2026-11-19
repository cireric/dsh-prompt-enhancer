import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

globalThis.__DEV__ = false;
const ai = await import("../src/host/ai.ts");
const { aiResultCache } = await import("../src/host/ai-cache.ts");
const { parseDraftResult } = await import("../src/host/draft.ts");
const settings = { aiProvider: "fake", aiModel: "draft" };

beforeEach(() => {
  aiResultCache.clear();
  ai.clearRouteCache();
});

test("起草拒绝只存在于假设栏的执行默认值，不自动追加到正文", () => {
  for (const [body, assumption] of [
    ["按邮箱列去重 CSV。", "默认保留首次出现的记录。"],
    ["只读分析构建耗时，不修改文件。", "权限未明确，按只读分析起草。"],
    ["只用 Python 标准库。", "允许安装 requests。"],
  ]) {
    assert.equal(parseDraftResult(JSON.stringify({ kind: "draft", body, assumptions: [assumption] }), true), undefined);
    const complete = { kind: "draft", body, assumptions: [body] };
    assert.deepEqual(parseDraftResult(JSON.stringify(complete), true), complete);
  }
});

test("假设须在模型正文中落实，不能靠待补材料自动追加而通过", () => {
  const step = "先确认是否允许修改文件。";
  const reply = { kind: "draft", body: "分析构建耗时。", assumptions: [step], missingInputs: [step] };
  assert.equal(parseDraftResult(JSON.stringify(reply), false), undefined);
});

test("改写缺失正文假设时沿用诊断重试，原始需求、反馈和执行环境保持不变", async () => {
  const request = {
    idea: "只读分析 /repo 的 npm test 日志，中文输出，不修改文件。",
    executor: "只读编程代理，无提交权限。",
    answers: [],
    feedbackHistory: ["只报告最重要的问题。"],
    revision: { body: "只读分析 /repo 的 npm test 日志，中文输出，不修改文件。", feedback: "列三个要点。" },
  };
  const assumption = "仅阅读现有日志，不运行命令。";
  const complete = { kind: "draft", body: request.revision.body + assumption + "列三个要点。", assumptions: [assumption] };
  const replies = [{ ...complete, body: request.revision.body + "列三个要点。" }, complete];
  const calls = [];
  ai.registerLlm({
    listProviders: () => [{ id: "fake" }],
    listModels: async () => [{ id: "draft" }],
    resolveModelInfo: async () => ({ reasoning: { efforts: [{ id: "off" }] } }),
    async *stream(options) {
      calls.push(options);
      yield { type: "text-delta", index: 0, text: JSON.stringify(replies[Math.min(calls.length - 1, 1)]) };
      yield { type: "finish", reason: { kind: "stop" } };
    },
  });
  assert.deepEqual(await ai.draftPromptCore(request, settings), { ok: true, draft: complete });
  assert.equal(calls.length, 2);
  assert.ok(calls[0].system.includes("assumptions 引用正文中说明关键假设的原句，不另写同义说明"));
  assert.ok(calls[0].system.includes("assumptions、missingInputs 和 toVerify 的每条必须逐字包含在 body"));
  assert.deepEqual(JSON.parse(calls[0].messages[0].content[0].text), request);
  const { retryDiagnosis, ...retried } = JSON.parse(calls[1].messages[0].content[0].text);
  assert.match(retryDiagnosis, /schema-mismatch/);
  assert.deepEqual(retried, request);
});

test("两轮仍未把假设写进正文时失败，不缓存不完整稿", async () => {
  let calls = 0;
  ai.registerLlm({
    listProviders: () => [{ id: "fake" }],
    listModels: async () => [{ id: "draft" }],
    async *stream() {
      calls++;
      yield { type: "text-delta", index: 0, text: JSON.stringify({ kind: "draft", body: "分析构建耗时。", assumptions: ["只读，不修改文件。"] }) };
      yield { type: "finish", reason: { kind: "stop" } };
    },
  });
  const request = { idea: "构建很慢", answers: [] };
  assert.deepEqual(await ai.draftPromptCore(request, settings), { ok: false, code: "schema-mismatch" });
  assert.deepEqual(await ai.draftPromptCore(request, settings), { ok: false, code: "schema-mismatch" });
  assert.equal(calls, 4);
});
