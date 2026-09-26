/**
 * 统一 AI 错误码 + 诊断注入重试（Issue #4 / T3）——`src/host/ai-errors.ts` 纯模块单测。
 *
 * 覆盖 issue #4 验收 1、2 的**映射与编排**部分：
 * - 失败形态 → code 映射的单元判据（TIMEOUT / EMPTY_OUTPUT / SCHEMA_MISMATCH 的 host 归因）；
 * - `withDiagnosticRetry`：只重试一次；重试请求携带上次失败诊断；仍失败返回最终 code。
 *
 * 端到端归因（fake LlmRuntime → collectText 的 code 判定）见 tests/ai-errors-route.test.mjs。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const errors = await import("../src/host/ai-errors.ts");

// ── 失败形态 → code 映射（单元素判据）────────────────────────────────────────

test("attemptFailure：构造失败形态并把 detail 压成单行、截到 200 字符", () => {
  const f = errors.attemptFailure("timeout", "collect abort\naborted  deepseek/deepseek-chat");
  assert.equal(f.code, "timeout");
  assert.equal(f.detail, "collect abort aborted deepseek/deepseek-chat");
  const long = errors.attemptFailure("unknown", "x".repeat(500));
  assert.equal(long.detail.length, 200);
});

test("code 枚举覆盖宿主全部失败形态（7 码：既有 no-llm/route + 新增 TIMEOUT/EMPTY_OUTPUT/SCHEMA_MISMATCH/parse/unknown）", () => {
  // 以 type 层的真源（TS 编译期）为准，这里钉**运行期拼写**——client 字典的键映射依赖这些字符串。
  const seen = new Set();
  const samples = [
    ["no-llm", "no-llm"], ["route", "route"], ["timeout", "timeout"],
    ["empty-output", "empty-output"], ["parse", "parse"],
    ["schema-mismatch", "schema-mismatch"], ["unknown", "unknown"],
  ];
  for (const [code] of samples) seen.add(errors.attemptFailure(code, "d").code);
  assert.equal(seen.size, 7);
  // 客户端 keyForCode 的七个映射键（ai-flow.ts）与这里的拼写逐字一致（跨层契约钉死）。
  assert.deepEqual([...seen].sort(), [
    "empty-output", "no-llm", "parse", "route", "schema-mismatch", "timeout", "unknown",
  ].sort());
});

// ── withDiagnosticRetry ─────────────────────────────────────────────────────

test("withDiagnosticRetry：首试成功 → 只调用一次，绝不发第二次请求", async () => {
  let calls = 0;
  const result = await errors.withDiagnosticRetry((diagnosis) => {
    calls++;
    assert.equal(diagnosis, undefined, "首试不得携带诊断");
    return Promise.resolve({ ok: true, text: "成品" });
  });
  assert.deepEqual(result, { ok: true, text: "成品" });
  assert.equal(calls, 1, "只重试一次意味着成功路径恰好一次调用");
});

test("withDiagnosticRetry：首试失败 → 恰好重试一次，重试请求携带上次失败诊断", async () => {
  const diagnoses = [];
  let calls = 0;
  const result = await errors.withDiagnosticRetry((diagnosis) => {
    calls++;
    diagnoses.push(diagnosis);
    if (calls === 1) {
      return Promise.resolve({ ok: false, failure: errors.attemptFailure("parse", "输出是闲聊文本") });
    }
    return Promise.resolve({ ok: true, text: "重试成功" });
  });
  assert.deepEqual(result, { ok: true, text: "重试成功" });
  assert.equal(calls, 2, "首试 + 一次重试，不得更多");
  assert.equal(diagnoses[0], undefined);
  assert.ok(diagnoses[1].includes("parse"), "重试诊断必须携带失败类型");
  assert.ok(diagnoses[1].includes("输出是闲聊文本"), "重试诊断必须携带失败细节");
});

test("withDiagnosticRetry：重试仍失败 → 返回最终那次的 code（失败形态变化时以重试为准）", async () => {
  let calls = 0;
  const result = await errors.withDiagnosticRetry((diagnosis) => {
    calls++;
    if (calls === 1) return Promise.resolve({ ok: false, failure: errors.attemptFailure("parse", "首轮") });
    return Promise.resolve({ ok: false, failure: errors.attemptFailure("empty-output", "终轮") });
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "empty-output", "最终 code 取最后一次尝试");
  assert.equal(result.detail, "终轮");
  assert.equal(calls, 2);
});

test("withDiagnosticRetry：重试仍失败且无 detail → detail 缺省（不造空串）", async () => {
  const result = await errors.withDiagnosticRetry(() =>
    Promise.resolve({ ok: false, failure: { code: "route" } }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "route");
  assert.equal("detail" in result, false, "无 detail 时不落 detail 键");
});

// ── failureDiagnosis（诚实披露块的形状）─────────────────────────────────────

test("failureDiagnosis：含失败类型、失败细节与「严格输出 JSON」的修正要求", () => {
  const text = errors.failureDiagnosis(errors.attemptFailure("schema-mismatch", "缺 body 字段"));
  assert.ok(text.includes("schema-mismatch"));
  assert.ok(text.includes("缺 body 字段"));
  assert.ok(text.includes("JSON"), "诊断必须告诉模型上一次为什么失败、这次该怎么做");
});
