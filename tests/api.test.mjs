import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeDispatch } from "./helpers/fake-http.mjs";

const { api, ApiError, AI_TIMEOUT_MS, AI_PROBE_TIMEOUT_MS } = await import("../src/client/utils/api.ts");

/**
 * D（批一第二条）：本文件被加载那一刻的 `DSH_HOME`。下面那条**真分发**用例会在进程里覆盖它，
 * 故必须按原值形态还原（`undefined` 与「键存在但是空串」是两种状态，不得一律写成 `""`），
 * 并由文件末尾的回归钉复核「还原到位」。
 */
const HOME_BEFORE_API_TEST = process.env.DSH_HOME;

// 假 IncomingMessage / ServerResponse（+ 「真跑一次分发」）**在 `tests/helpers/fake-http.mjs`**：
// 本文件原先的那份与 meta-delete / skill-export-route 逐字相同（R1 必修 1 / 追加项），现已统一。
// **本文件的其它用例都不需要它**——只有下面那条「真分发」用例会绕过打桩的 fetch，直接调宿主的 handler。

/** 打桩 globalThis.fetch：记录每次调用，调用方必须 try/finally 复原。 */
function stubFetch(handler) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init);
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

function jsonRes(body, status = 200) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

test("信封失败：ok:false 且无 data → 抛 ApiError，message 为服务端文案、status 为 HTTP 状态", async () => {
  const s = stubFetch(() => jsonRes({ ok: false, error: "提示词不存在" }, 404));
  try {
    await assert.rejects(api.listPrompts(), (err) => {
      assert.ok(err instanceof ApiError, "应是 ApiError");
      assert.equal(err.message, "提示词不存在");
      assert.equal(err.status, 404);
      return true;
    });
  } finally {
    s.restore();
  }
});

test("非 JSON 响应（HTML）→ 抛可读 ApiError 且 message 含 HTTP 状态", async () => {
  const s = stubFetch(() => ({
    status: 500,
    ok: false,
    json: async () => { throw new SyntaxError("Unexpected token < in JSON at position 0"); },
  }));
  try {
    await assert.rejects(api.getSettings(), (err) => {
      assert.ok(err instanceof ApiError, "应是 ApiError");
      assert.match(err.message, /500/);
      assert.equal(err.status, 500);
      return true;
    });
  } finally {
    s.restore();
  }
});

// 超时路径不在此伪造 120s 真超时（不可等待）：AbortSignal 的存在性在此断言，
// TimeoutError → "ai.timeout" 的映射由 ai-flow.test.mjs 的 DOMException("TimeoutError") 用例覆盖。
test("polishPrompt：请求体 {body,keepVariables,withSummary:false} 且带未中断的 AbortSignal，返回 polished", async () => {
  const s = stubFetch(() => jsonRes({ ok: true, data: { polished: "AI 完善稿" } }));
  try {
    const out = await api.polishPrompt("原文草稿", { keepVariables: true });
    assert.deepEqual(out, { polished: "AI 完善稿" });
    assert.equal(s.calls.length, 1);
    const { url, init } = s.calls[0];
    assert.equal(url, "/api/prompt-enhancer/ai/polish");
    assert.equal(init.method, "POST");
    assert.deepEqual(JSON.parse(init.body), { body: "原文草稿", keepVariables: true, withSummary: false });
    assert.ok(init.signal instanceof AbortSignal, "init.signal 应是 AbortSignal");
    assert.equal(init.signal.aborted, false);
  } finally {
    s.restore();
  }
});

test("polishPrompt：keepVariables:false 透传 false", async () => {
  const s = stubFetch(() => jsonRes({ ok: true, data: { polished: "x" } }));
  try {
    await api.polishPrompt("原文", { keepVariables: false });
    assert.deepEqual(JSON.parse(s.calls[0].init.body), { body: "原文", keepVariables: false, withSummary: false });
  } finally {
    s.restore();
  }
});

test("refinePrompt：{title,tags,summary,body} 原样透传，并带 AbortSignal", async () => {
  const payload = { title: "标题", tags: ["a"], summary: "摘要", body: "正文" };
  const s = stubFetch(() => jsonRes({ ok: true, data: payload }));
  try {
    const out = await api.refinePrompt("原文草稿");
    assert.deepEqual(out, payload);
    assert.equal(s.calls[0].url, "/api/prompt-enhancer/ai/refine");
    assert.ok(s.calls[0].init.signal instanceof AbortSignal);
  } finally {
    s.restore();
  }
});

test("createPrompt：返回 {prompt, evicted}，evicted 不丢", async () => {
  const s = stubFetch(() => jsonRes({ ok: true, data: { prompt: { id: "p1", title: "t" }, evicted: ["p2", "p3"] } }));
  try {
    const out = await api.createPrompt({ title: "t", body: "b" });
    assert.deepEqual(out.prompt, { id: "p1", title: "t" });
    assert.deepEqual(out.evicted, ["p2", "p3"]);
    assert.equal(s.calls[0].url, "/api/prompt-enhancer/prompts");
    assert.deepEqual(JSON.parse(s.calls[0].init.body), { title: "t", body: "b" });
  } finally {
    s.restore();
  }
});

test("updatePrompt：PUT 到带编码的 id 路径并透传补丁", async () => {
  const s = stubFetch(() => jsonRes({ ok: true, data: { id: "a/b", title: "改后" } }));
  try {
    const out = await api.updatePrompt("a/b", { title: "改后" });
    assert.equal(out.title, "改后");
    assert.equal(s.calls[0].url, "/api/prompt-enhancer/prompts/a%2Fb");
    assert.equal(s.calls[0].init.method, "PUT");
    assert.deepEqual(JSON.parse(s.calls[0].init.body), { title: "改后" });
  } finally {
    s.restore();
  }
});

test("rollbackPrompt 400：抛 ApiError 且 message 含「没有可回退的原文」", async () => {
  const s = stubFetch(() => jsonRes({ ok: false, error: "该提示词没有可回退的原文（sourceBody 为空）" }, 400));
  try {
    await assert.rejects(api.rollbackPrompt("p1"), (err) => {
      assert.ok(err instanceof ApiError);
      assert.match(err.message, /没有可回退的原文/);
      assert.equal(err.status, 400);
      return true;
    });
    assert.equal(s.calls[0].url, "/api/prompt-enhancer/prompts/p1/rollback");
  } finally {
    s.restore();
  }
});

test("listAiProviders：数组原样透传", async () => {
  const providers = [{ provider: "deepseek", name: "DeepSeek", models: [{ id: "m1", name: "M1" }] }];
  const s = stubFetch(() => jsonRes({ ok: true, data: providers }));
  try {
    assert.deepEqual(await api.listAiProviders(), providers);
    assert.equal(s.calls[0].url, "/api/prompt-enhancer/ai/providers");
    assert.equal(s.calls[0].init.method, "GET");
  } finally {
    s.restore();
  }
});

// 探测请求也必须自己收尾：任务 2 的重入闸门会一直持有到它落定，
// 没有 AbortSignal 时 GET /ai/providers 挂起 = AI 按钮持续 disabled。
test("listAiProviders：探测请求带未中断的 AbortSignal，且超时常量有界、短于 AI 调用", async () => {
  const s = stubFetch(() => jsonRes({ ok: true, data: [] }));
  try {
    assert.deepEqual(await api.listAiProviders(), []);
    const { init } = s.calls[0];
    assert.ok(init.signal instanceof AbortSignal, "init.signal 应是 AbortSignal");
    assert.equal(init.signal.aborted, false);
    assert.equal(AI_PROBE_TIMEOUT_MS, 15000, "探测超时 15s");
    assert.ok(AI_PROBE_TIMEOUT_MS < AI_TIMEOUT_MS, "探测不得等满 2 分钟");
  } finally {
    s.restore();
  }
});

// 非探测路径的超时靠「call() 的 catch 不改形、原样 throw e」这一结构成立：一旦有人为统一错误面把
// fetch 包进 try/catch 重抛 ApiError，DOMException("TimeoutError") 会被降级成 "ai.fail"。
// 这条零等待用例把该结构钉死（不伪造 120s 真实超时）。
//
// ⚠️ **该不变量按路径成立，不按整个函数成立**（T7-7 / R1 修正表述）：call() 的 catch **只对探测路径**
// （probe === true，即 GET /ai/providers）特殊处理——那一条把「到点」换成带 probe 标记的 ApiError
// （ai-flow.ts#aiErrorKey 据此给「探测超时」的专属文案）；其余路径（含本用例的 /ai/polish）仍是 throw e。
// 故本用例钉的是**非探测**那一支；探测那一支目前**没有**常驻用例（一次性 node 探针 + T10 活体判据，
// 见 task-7-report.md §T7-7）。
test("polishPrompt：超时异常原样穿过 call() 抵达分类器（TimeoutError → ai.timeout）", async () => {
  const { aiErrorKey } = await import("../src/client/utils/ai-flow.ts");
  const s = stubFetch(() => {
    throw new DOMException("signal timed out", "TimeoutError");
  });
  try {
    await assert.rejects(api.polishPrompt("原文草稿", { keepVariables: true }), (err) => {
      assert.equal(err.name, "TimeoutError", "不得被包装成 ApiError");
      assert.equal(err instanceof ApiError, false, "超时不走 ApiError 信封路径");
      assert.equal(aiErrorKey(err), "ai.timeout");
      return true;
    });
  } finally {
    s.restore();
  }
});

test("api 表面：P4 的 5 个方法与 P5 新增的 6 个方法都在，且 AI 超时为 120000ms", () => {
  for (const name of ["listPrompts", "recordUsage", "getSettings", "getMeta", "setMeta"]) {
    assert.equal(typeof api[name], "function", name + " 应保留");
  }
  for (const name of ["createPrompt", "updatePrompt", "rollbackPrompt", "listAiProviders", "polishPrompt", "refinePrompt"]) {
    assert.equal(typeof api[name], "function", name + " 应新增");
  }
  assert.equal(AI_TIMEOUT_MS, 120000);
});

// 宿主 PUT 只认白名单（事实在 src/host/routes.ts 的 PUT 分发）：客户端补丁类型必须与之一致。
// 此前 api.updatePrompt 的类型宽于白名单，sourceBody / aiRefined / aiRefinedAt 被编译期放行、
// 运行期被宿主静默丢弃且仍回 200，注释宣称的「防拼错字段」不成立。这里断言白名单本身
// （不扫描 routes.ts 源码——那种断言会因排版变化而假阳性/假阴性）。
test("PROMPT_WRITABLE_KEYS：恰好是宿主 PUT 白名单的 6 个键，且不含 sourceBody/aiRefined/aiRefinedAt", async () => {
  const { PROMPT_WRITABLE_KEYS } = await import("../src/types.ts");
  assert.deepEqual([...PROMPT_WRITABLE_KEYS], ["title", "body", "tags", "summary", "skillName", "skillExportedAt"]);
  for (const key of ["sourceBody", "aiRefined", "aiRefinedAt"]) {
    assert.ok(!PROMPT_WRITABLE_KEYS.includes(key), key + " 不可经 PUT 写入，不得进 api.updatePrompt 的补丁类型");
  }
});

// ── P6 客户端 HTTP 面：路由覆盖（R19）─────────────────────────────────────
//
// 宿主共 27 条逻辑路由（事实源 src/host/routes.ts 的分发表）。这里逐条对照：
//   · 有对应客户端方法的 → 逐条断言「HTTP 方法 + 路径」（打桩 fetch 看真实请求的行为断言；
//     不做源码文本解析——P5 已把 smoke 从文本扫描升级为行为断言，倒退不可接受）
//   · 没有对应方法的 → 必须逐条进下面的豁免清单，且每条写明理由
//
// 路径段一律 encodeURIComponent：本表的 url 用含 "/" 的样例参数，顺带把编码钉死。
// body 缺省表示「该请求不得带请求体」。
const ROUTES = [
  // 提示词
  { route: "GET /prompts", client: "listPrompts", call: (a) => a.listPrompts(), method: "GET", url: "/api/prompt-enhancer/prompts", data: [] },
  { route: "POST /prompts", client: "createPrompt", call: (a) => a.createPrompt({ title: "t", body: "b" }), method: "POST", url: "/api/prompt-enhancer/prompts", body: { title: "t", body: "b" }, data: { prompt: { id: "p1" }, evicted: [] } },
  { route: "GET /prompts/:id", client: "getPrompt", call: (a) => a.getPrompt("a/b"), method: "GET", url: "/api/prompt-enhancer/prompts/a%2Fb", data: { id: "a/b", title: "t" } },
  { route: "PUT /prompts/:id", client: "updatePrompt", call: (a) => a.updatePrompt("a/b", { title: "x" }), method: "PUT", url: "/api/prompt-enhancer/prompts/a%2Fb", body: { title: "x" }, data: { id: "a/b", title: "x" } },
  { route: "DELETE /prompts/:id", client: "deletePrompt", call: (a) => a.deletePrompt("a/b"), method: "DELETE", url: "/api/prompt-enhancer/prompts/a%2Fb", data: { deleted: true } },
  { route: "POST /prompts/:id/use", client: "recordUsage", call: (a) => a.recordUsage("a/b"), method: "POST", url: "/api/prompt-enhancer/prompts/a%2Fb/use", data: { id: "a/b" } },
  { route: "POST /prompts/:id/rollback", client: "rollbackPrompt", call: (a) => a.rollbackPrompt("a/b"), method: "POST", url: "/api/prompt-enhancer/prompts/a%2Fb/rollback", data: { id: "a/b" } },
  // 标签
  { route: "GET /tags", client: "listTags", call: (a) => a.listTags(), method: "GET", url: "/api/prompt-enhancer/tags", data: [{ name: "a", count: 1 }] },
  { route: "POST /tags", client: "createTag", call: (a) => a.createTag("新标签"), method: "POST", url: "/api/prompt-enhancer/tags", body: { name: "新标签" }, data: { name: "新标签" } },
  { route: "PUT /tags/:from", client: "renameTag", call: (a) => a.renameTag("a/b", "c"), method: "PUT", url: "/api/prompt-enhancer/tags/a%2Fb", body: { to: "c" }, data: { affected: 2 } },
  { route: "DELETE /tags/:name", client: "deleteTag", call: (a) => a.deleteTag("a/b"), method: "DELETE", url: "/api/prompt-enhancer/tags/a%2Fb", data: { deleted: true, inUse: 0 } },
  // 回收站
  { route: "GET /trash", client: "listTrash", call: (a) => a.listTrash(), method: "GET", url: "/api/prompt-enhancer/trash", data: [] },
  { route: "POST /trash/:id/restore", client: "restoreTrash", call: (a) => a.restoreTrash("a/b"), method: "POST", url: "/api/prompt-enhancer/trash/a%2Fb/restore", data: { restored: 1 } },
  // T7 ⑦（修复轮 1）：清空回收站的信封**同时**回条数（`removed`，数字，既有形状）与被删 id（`ids`）。
  // 这张表的 `data` 是客户端封装的桥接数据；**信封形状本身**由文件末尾那条「真分发」用例逐字段核对。
  { route: "DELETE /trash", client: "emptyTrash", call: (a) => a.emptyTrash(), method: "DELETE", url: "/api/prompt-enhancer/trash", data: { removed: 2, ids: ["a/b", "c/d"] } },
  { route: "DELETE /trash/:id", client: "deleteTrash", call: (a) => a.deleteTrash("a/b"), method: "DELETE", url: "/api/prompt-enhancer/trash/a%2Fb", data: { removed: 1 } },
  // AI
  { route: "GET /ai/providers", client: "listAiProviders", call: (a) => a.listAiProviders(), method: "GET", url: "/api/prompt-enhancer/ai/providers", data: [] },
  { route: "POST /ai/polish", client: "polishPrompt", call: (a) => a.polishPrompt("草稿", { keepVariables: true }), method: "POST", url: "/api/prompt-enhancer/ai/polish", body: { body: "草稿", keepVariables: true, withSummary: false }, data: { polished: "x" } },
  { route: "POST /ai/refine", client: "refinePrompt", call: (a) => a.refinePrompt("草稿"), method: "POST", url: "/api/prompt-enhancer/ai/refine", body: { body: "草稿" }, data: { title: "t", tags: [], summary: "", body: "b" } },
  { route: "POST /ai/skill-descriptor", client: "aiSkillDescriptor", call: (a) => a.aiSkillDescriptor({ body: "草稿" }), method: "POST", url: "/api/prompt-enhancer/ai/skill-descriptor", body: { body: "草稿" }, data: { name: "weekly-report", description: "把要点整理成周报" } },
  // 设置
  { route: "GET /settings", client: "getSettings", call: (a) => a.getSettings(), method: "GET", url: "/api/prompt-enhancer/settings", data: {} },
  { route: "PUT /settings", client: null },
  // 导入导出
  { route: "POST /export/save", client: "exportBackup", call: (a) => a.exportBackup("/tmp/dir"), method: "POST", url: "/api/prompt-enhancer/export/save", body: { dir: "/tmp/dir" }, data: { path: "/tmp/dir/backup.json", prompts: 1, tags: 0 } },
  { route: "POST /import", client: "importBackup", call: (a) => a.importBackup({ version: 1 }), method: "POST", url: "/api/prompt-enhancer/import", body: { backup: { version: 1 } }, data: { ok: true, applied: false, stats: { added: 0, overwritten: 0, total: 0 } } },
  // meta（模板变量记忆）
  { route: "GET /meta/:key", client: "getMeta", call: (a) => a.getMeta("a/b"), method: "GET", url: "/api/prompt-enhancer/meta/a%2Fb", data: { key: "a/b", value: "v" } },
  { route: "PUT /meta/:key", client: "setMeta", call: (a) => a.setMeta("a/b", "v"), method: "PUT", url: "/api/prompt-enhancer/meta/a%2Fb", body: { value: "v" }, data: { key: "a/b", value: "v" } },
  // DELETE 是 T6 / O-1 新增的**通用**清键通道（键名约定归客户端，宿主不认识 pl: 前缀）。
  { route: "DELETE /meta/:key", client: "deleteMeta", call: (a) => a.deleteMeta("a/b"), method: "DELETE", url: "/api/prompt-enhancer/meta/a%2Fb", data: { key: "a/b", deleted: true } },
  // 技能导出（T2 落地；T7 ②：本条与上面的 /ai/skill-descriptor 从「豁免」升级为**覆盖行**）
  { route: "POST /skills/export", client: "exportPromptAsSkill", call: (a) => a.exportPromptAsSkill({ promptId: "p1" }), method: "POST", url: "/api/prompt-enhancer/skills/export", body: { promptId: "p1" }, data: { name: "weekly-report", path: "/skills/weekly-report/SKILL.md" } },
];

/**
 * 路由覆盖的**显式豁免清单**（照 T1 约束 F 节，逐条给理由，不得扩写）。
 * T7 ②：T2 之后 `POST /ai/skill-descriptor` 与 `POST /skills/export` 都已有客户端方法
 * （`aiSkillDescriptor` / `exportPromptAsSkill`），故两条陈旧豁免被上面的覆盖行取代并删除——
 * 留在这里的只剩「本轮确实还没有客户端方法」与「已覆盖但保留说明」两类。
 */
const EXEMPT_ROUTES = [
  { route: "PUT /settings", why: "归 P8（设置页）" },
  { route: "PUT /meta/:key", why: "已由 P4 的 setMeta 覆盖（保留即可）", coveredBy: "setMeta" },
];

/** 有客户端方法的路由（行为断言的输入）。 */
const COVERED = ROUTES.filter((r) => r.client !== null);

test("路由覆盖：宿主 27 条逻辑路由 = 客户端方法覆盖 + 显式豁免（R19，不看源码文本）", () => {
  assert.equal(ROUTES.length, 27, "宿主路由表共 27 条逻辑路由");
  const gaps = ROUTES.filter((r) => r.client === null).map((r) => r.route);
  const exemptWithoutClient = EXEMPT_ROUTES.filter((e) => e.coveredBy === undefined).map((e) => e.route);
  // 顺序无关：两边只是同一批路由的两种枚举顺序，比集合而不是比序列。
  assert.deepEqual([...gaps].sort(), [...exemptWithoutClient].sort(), "未覆盖的路由必须逐条列在豁免清单里");
  assert.equal(EXEMPT_ROUTES.length, 2, "豁免清单恰好 2 条（1 条归 P8 的设置页 + 1 条已由 setMeta 覆盖）");
  for (const e of EXEMPT_ROUTES) assert.ok(e.why.trim() !== "", e.route + " 的豁免理由不得为空");
  const noted = EXEMPT_ROUTES.filter((e) => e.coveredBy !== undefined);
  assert.equal(noted.length, 1, "只有 PUT /meta/:key 是「已覆盖但保留说明」");
  assert.equal(ROUTES.find((r) => r.route === noted[0].route).client, noted[0].coveredBy);
  for (const r of COVERED) assert.equal(typeof api[r.client], "function", r.route + " 应有客户端方法 " + r.client);
});

test("逐方法：HTTP 方法与路径逐条相符（打桩 fetch，看真实请求）", async () => {
  for (const r of COVERED) {
    const s = stubFetch(() => jsonRes({ ok: true, data: r.data }));
    try {
      await r.call(api);
      assert.equal(s.calls.length, 1, r.route + " 应恰好发一次请求");
      assert.equal(s.calls[0].init.method, r.method, r.route + " 的 HTTP 方法");
      assert.equal(s.calls[0].url, r.url, r.route + " 的请求路径");
      if (r.body === undefined) {
        assert.equal(s.calls[0].init.body, undefined, r.route + " 不应带请求体");
      } else {
        assert.deepEqual(JSON.parse(s.calls[0].init.body), r.body, r.route + " 的请求体形状");
      }
    } finally {
      s.restore();
    }
  }
});

test("逐方法：信封失败一律抛带 status 的 ApiError（不静默、不返回 undefined）", async () => {
  for (const r of COVERED) {
    const s = stubFetch(() => jsonRes({ ok: false, error: "宿主拒绝：" + r.route }, 400));
    try {
      await assert.rejects(r.call(api), (err) => {
        assert.ok(err instanceof ApiError, r.route + " 应抛 ApiError");
        assert.equal(err.status, 400, r.route + " 应带 HTTP 状态");
        assert.equal(err.message, "宿主拒绝：" + r.route, r.route + " 的消息取服务端文案");
        return true;
      });
    } finally {
      s.restore();
    }
  }
});

test("api 表面：P6 的 12 个新方法都在，P4/P5 的 11 个不动", () => {
  for (const name of [
    "getPrompt", "deletePrompt", "listTags", "createTag", "renameTag", "deleteTag",
    "listTrash", "restoreTrash", "deleteTrash", "emptyTrash", "importBackup", "exportBackup",
  ]) {
    assert.equal(typeof api[name], "function", name + " 应新增（P6）");
  }
  for (const name of [
    "listPrompts", "recordUsage", "getSettings", "getMeta", "setMeta",
    "createPrompt", "updatePrompt", "rollbackPrompt", "listAiProviders", "polishPrompt", "refinePrompt",
  ]) {
    assert.equal(typeof api[name], "function", name + " 应保留（P4/P5）");
  }
  assert.equal(COVERED.length, 26, "27 条路由里 26 条有客户端方法");
});

// P6-4 裁定：导入不自动淘汰，「确认」与否决定落库还是只预览——客户端只是信封封装，
// 语义全在宿主（confirm !== true 即预览）。这条把「缺省不发 confirm 键」钉死。
test("importBackup：缺省只发 {backup}（预览），显式 true 才发 confirm:true（落库）", async () => {
  const backup = { version: 1, prompts: [], tags: [] };
  let s = stubFetch(() => jsonRes({ ok: true, data: { ok: true, applied: false, stats: { added: 0, overwritten: 0, total: 0 } } }));
  try {
    const preview = await api.importBackup(backup);
    assert.equal(preview.applied, false, "未确认 → 只预览");
    assert.deepEqual(JSON.parse(s.calls[0].init.body), { backup });
  } finally {
    s.restore();
  }
  s = stubFetch(() => jsonRes({ ok: true, data: { ok: true, applied: true, stats: { added: 1, overwritten: 0, total: 1 } } }));
  try {
    const applied = await api.importBackup(backup, true);
    assert.equal(applied.applied, true, "显式确认 → 落库");
    assert.deepEqual(JSON.parse(s.calls[0].init.body), { backup, confirm: true });
  } finally {
    s.restore();
  }
});

// 在用标签的 400 带用量文案：调用方按 status 分类后要把条数读给用户（不匹配 message 文本）。
test("deleteTag 400（标签在用）：ApiError.status 400，文案里带用量", async () => {
  const s = stubFetch(() => jsonRes({ ok: false, error: "标签正在被 3 条提示词使用，无法删除" }, 400));
  try {
    await assert.rejects(api.deleteTag("常用"), (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 400);
      assert.match(err.message, /3 条/);
      return true;
    });
    assert.equal(s.calls[0].url, "/api/prompt-enhancer/tags/" + encodeURIComponent("常用"));
    assert.equal(s.calls[0].init.method, "DELETE");
  } finally {
    s.restore();
  }
});

// ── DELETE /trash 的信封形状（T7 ⑦ 修复轮 1）：真分发，不是打桩 ──────────────────
//
// 为什么必须走**真分发**：`removed` 的语义（条数 vs id 列表）与 `ids` 的存在与否都产生在
// `routes.ts` 的那一个 hunk 里，客户端单测打桩 fetch 看不见它（这正是修复轮 1 要堵的缺口：
// 上一轮把数组塞进了 `removed`，而 `api.ts` 的声明仍写着 number ⇒ 契约悄悄变了形状却无人红）。
// 隔离：临时 `DSH_HOME` —— 本文件的其它用例只打桩 fetch、从不碰 store，且 `paths.ts` 是**调用期**
// 求值、store 的 db 句柄首次 `getDb()` 才建，故这里（该进程里唯一的 store 调用者）设它是安全的。
test("DELETE /trash 信封（真分发）：removed 仍是**数字**、被删 id 在 ids、且 ids.length === removed", async () => {
  const home = mkdtempSync(join(tmpdir(), "dpe-trash-envelope-"));
  // D（批一第二条）：`DSH_HOME` 是**进程级**环境变量 ⇒ 覆盖后必须还原。当下本文件的后续用例都只
  // 打桩 fetch、从不碰 store/paths，故这个坑暂时不炸；但将来任一条碰 store/paths 就会读到下面
  // 已经 `rmSync` 掉的临时目录（而 `paths.ts` 是**调用期**求值，正是这种坑最容易踩的形态）。
  process.env.DSH_HOME = home;
  try {
    const store = await import("../src/host/store.ts");
    const { makeRoutes } = await import("../src/host/routes.ts");
    // **本文件与另三处的差异**：`makeRoutes` 是本用例**在里面**动态 import 的（这个用例要自己
    // 重指 `DSH_HOME`），故 `makeDispatch` 也只能在这里构造；`API_PREFIX` 同样按本文件的动态
    // import 口径取（它正是路由注册用的那个常量 ⇒ 拼出来的路径与原先硬写的
    // "/api/prompt-enhancer/trash" **逐字相同**）。
    const { API_PREFIX } = await import("../src/types.ts");
    const dispatch = makeDispatch({ makeRoutes, API_PREFIX });
    const trashIds = [];
    for (const title of ["甲", "乙"]) {
      const p = store.createPrompt({ title, body: title + " 的正文" });
      store.deletePrompt(p.id); // 软删除 ⇒ 进回收站
      trashIds.push(p.id);
    }

    /** 真跑一次 `DELETE /trash`（路径相对 API_PREFIX；假 req/res 在 helper 里）。 */
    const callEmptyTrash = () => dispatch("DELETE", "/trash");

    const first = await callEmptyTrash();
    assert.equal(first.status, 200);
    assert.equal(first.envelope.ok, true);
    assert.equal(first.envelope.data.removed, 2, "removed = 被删**条数**（数字；既有形状不破坏）");
    assert.equal(typeof first.envelope.data.removed, "number", "removed 不得变成数组（修复轮 1 的形态）");
    assert.ok(Array.isArray(first.envelope.data.ids), "被删 id 必须显式出现在 ids 里");
    assert.deepEqual([...first.envelope.data.ids].sort(), [...trashIds].sort(), "逐条等于被物理删除的 id");
    assert.equal(first.envelope.data.ids.length, first.envelope.data.removed, "ids.length === removed");

    // 空回收站：两个字段**仍然都在**（形状稳定；客户端不得靠「有没有这个键」猜语义）。
    const second = await callEmptyTrash();
    assert.equal(second.status, 200);
    assert.equal(second.envelope.data.removed, 0);
    assert.deepEqual(second.envelope.data.ids, [], "空的时候 ids 是空数组，不是被省略的键");
    assert.deepEqual(Object.keys(second.envelope.data).sort(), ["ids", "removed"], "键集恒为两项");
  } finally {
    rmSync(home, { recursive: true, force: true });
    // 还原到位（按原值形态）：见文件头的 HOME_BEFORE_API_TEST。
    if (HOME_BEFORE_API_TEST === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = HOME_BEFORE_API_TEST;
  }
});

// D（批一第二条）的**回归钉**：隔离不得泄漏。变异 = 删掉上面 finally 里的那两行还原 ⇒ 本条必红。
test("D：DELETE /trash 的临时 DSH_HOME 不得泄漏到后续用例（逐字还原）", () => {
  assert.equal(
    process.env.DSH_HOME,
    HOME_BEFORE_API_TEST,
    "本文件跑到这里时 DSH_HOME 必须与文件被加载时逐字相同（泄漏出去的值是已删除的临时目录）",
  );
});

// 404 是「不存在」而不是「参数错」：getPrompt 调用方据此清掉已失效的引用。
test("getPrompt 404：ApiError.status 404（软删除后仍被引用的旧 id）", async () => {
  const s = stubFetch(() => jsonRes({ ok: false, error: "提示词不存在" }, 404));
  try {
    await assert.rejects(api.getPrompt("gone"), (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 404);
      assert.equal(s.calls[0].url, "/api/prompt-enhancer/prompts/gone");
      return true;
    });
  } finally {
    s.restore();
  }
});

