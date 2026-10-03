/**
 * T3 客户端侧：结构化失败信封的**透明解析**（issue #4 验收 3）与 code → i18n 映射（验收 4）。
 *
 * - `api.ts#call`：`error: { code, message? }` → `ApiError.code`（旧形 string 信封 code 缺省 undefined——
 *   「信封形状变更对 client 透明」的判据）；
 * - `ai-flow.ts#aiErrorKey`：先按宿主 code（七码映射），退回既有判定（探测超时 / TimeoutError / 503）；
 * - `i18n.ts`：每个 code 一条 zh/en 文案，键集全等（`ai.code.*`），host 零文案。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const { api, ApiError } = await import("../src/client/utils/api.ts");
const { aiErrorKey } = await import("../src/client/utils/ai-flow.ts");
const i18n = await import("../src/client/utils/i18n.ts");

/** 打桩 globalThis.fetch：记录每次调用，调用方必须 try/finally 复原。 */
function stubFetch(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => handler(url, init);
  return { restore: () => { globalThis.fetch = original; } };
}

function jsonRes(body, status = 200) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

// ── 信封解析（api.ts）──────────────────────────────────────────────────────

test("结构化信封：error:{code,message} → ApiError 带 code，message 取服务端诊断文案", async () => {
  const s = stubFetch(() => jsonRes({ ok: false, error: { code: "timeout", message: "collect abort aborted" } }, 503));
  try {
    await assert.rejects(api.polishPrompt("草稿", { keepVariables: true }), (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 503);
      assert.equal(err.code, "timeout");
      assert.equal(err.message, "collect abort aborted");
      return true;
    });
  } finally {
    s.restore();
  }
});

test("结构化信封：error:{code}（无 message，生产形态）→ message 兜底为 code 本身", async () => {
  const s = stubFetch(() => jsonRes({ ok: false, error: { code: "empty-output" } }, 503));
  try {
    await assert.rejects(api.refinePrompt("草稿"), (err) => {
      assert.equal(err.code, "empty-output");
      assert.equal(err.message, "empty-output");
      return true;
    });
  } finally {
    s.restore();
  }
});

test("旧形 string 信封：code 缺省 undefined（对信封形状变更透明，既有分类不破坏）", async () => {
  const s = stubFetch(() => jsonRes({ ok: false, error: "提示词不存在" }, 404));
  try {
    await assert.rejects(api.getPrompt("gone"), (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.code, undefined);
      assert.equal(err.message, "提示词不存在");
      return true;
    });
  } finally {
    s.restore();
  }
});

// ── 分类器（ai-flow.ts#aiErrorKey）─────────────────────────────────────────

test("aiErrorKey：七码逐个映射到 ai.code.* 键（unknown 与未知 code → ai.fail）", () => {
  const cases = [
    ["no-llm", "ai.code.noLlm"],
    ["route", "ai.code.route"],
    ["timeout", "ai.code.timeout"],
    ["empty-output", "ai.code.emptyOutput"],
    ["parse", "ai.code.parse"],
    ["schema-mismatch", "ai.code.schemaMismatch"],
    ["unknown", "ai.fail"],
  ];
  for (const [code, key] of cases) {
    assert.equal(aiErrorKey(new ApiError(code, 503, false, code)), key, code + " → " + key);
  }
  // 未来宿主新增的 code：客户端不得炸，落通用文案
  assert.equal(aiErrorKey(new ApiError("x", 503, false, "some-future-code")), "ai.fail");
});

test("aiErrorKey：既有判定全数保留（探测超时 / TimeoutError / 503 无 code / 其它）", () => {
  assert.equal(aiErrorKey(new ApiError("probe", 0, true)), "ai.probeTimeout");
  assert.equal(aiErrorKey(new DOMException("x", "TimeoutError")), "ai.timeout");
  assert.equal(aiErrorKey(new ApiError("宿主 503（旧形信封）", 503)), "ai.unavailable");
  assert.equal(aiErrorKey(new ApiError("400", 400)), "ai.fail");
  assert.equal(aiErrorKey(new Error("boom")), "ai.fail");
});

test("aiErrorKey：探测超时优先于宿主 code（探测路径没有 code，但次序钉死防回归）", () => {
  // 探测超时的 ApiError 恒无 code（call() 超时分支不传 code）；万一将来带了 code，
  // 探测超时仍必须赢——它是「用户要做的事不同」的那一支。
  assert.equal(aiErrorKey(new ApiError("m", 0, true, "timeout")), "ai.probeTimeout");
});

// ── i18n：每码一条，键集全等（验收 4）─────────────────────────────────────

test("i18n：七个 ai.code.* 键在 zh/en 双字典齐备、非空且键集全等", () => {
  const keys = [
    "ai.code.noLlm", "ai.code.route", "ai.code.timeout", "ai.code.emptyOutput",
    "ai.code.parse", "ai.code.schemaMismatch",
  ];
  for (const key of keys) {
    assert.ok(key in i18n.zh, "zh 缺 " + key);
    assert.ok(key in i18n.en, "en 缺 " + key);
    assert.notEqual(i18n.zh[key].trim(), "");
    assert.notEqual(i18n.en[key].trim(), "");
  }
  // 键集全等的总检（含本批新键）由 i18n.test.mjs 承担；这里钉「code 键与 host 枚举一一对应」：
  // 每个宿主 code 都能在 zh 字典里找到自己的键（snakeCase → camelCase 的映射表钉在 ai-flow.ts）。
});

/** 递归收集 src/** 下的 .ts / .tsx（按 URL 走，跨平台且不依赖 cwd）。 */
async function srcFiles(dir = new URL("../src/", import.meta.url)) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) out.push(...(await srcFiles(new URL(entry.name + "/", dir))));
    else if (/\.tsx?$/.test(entry.name)) out.push(new URL(entry.name, dir));
  }
  return out;
}

test("i18n：六个 ai.code.* 键在 src/** 有字面量引用（死键检查的针对性前哨；全量检查在 i18n.test.mjs）", async () => {
  // 真引用点是 ai-flow.ts 的 keyForCode。旧实现只断言「aiErrorKey 是函数」——恒真，键改名或掉线
  // 时它照样绿（审查 2026-10-03 抓到的空转用例）。这里改成真的扫源码文本。
  const codeKeys = [
    "ai.code.noLlm", "ai.code.route", "ai.code.timeout",
    "ai.code.emptyOutput", "ai.code.parse", "ai.code.schemaMismatch",
  ];
  // ⚠️ 必须排除字典文件本身（变异实测教训）：`"ai.code.timeout"` 在 i18n.ts 里作为**键定义**也存在，
  // 连它一起扫的话，把 ai-flow.ts 的引用改名后用例照样绿——那正是本用例要修的空转形态。
  const files = (await srcFiles()).filter((file) => !String(file).endsWith("/utils/i18n.ts"));
  assert.ok(files.length > 0, "src/** 扫不到文件 ⇒ 本用例的判据本身失效");
  const text = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
  for (const key of codeKeys) {
    assert.ok(text.includes('"' + key + '"'), key + " 在 src/** 里没有任何字面量引用（死键）");
  }
});
