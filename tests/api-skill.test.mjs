/**
 * 技能导出两条路由的**客户端封装**单测（P7 T2 的 C 段）。
 *
 * 手法照 `tests/api.test.mjs`：打桩 `globalThis.fetch` 看**真实请求**（method / 路径 / 体），
 * 并逐状态断言**错误可见**（非 2xx ⇒ 带 HTTP status 与宿主 detail 的 ApiError，不静默、不返回 undefined）。
 * 路由契约的事实源是 `src/host/routes.ts` 的 `POST /ai/skill-descriptor`（254-270）与
 * `POST /skills/export`（332-364）两个分支。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const { api, ApiError, AI_TIMEOUT_MS } = await import("../src/client/utils/api.ts");

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

const BASE = "/api/prompt-enhancer";
const descriptor = { name: "weekly-report", description: "把要点整理成周报", whenToUse: "写周报时" };
const receipt = { name: "weekly-report", path: "/home/u/.dsh/skills/weekly-report/SKILL.md", prompt: { id: "p1" } };

// ── POST /ai/skill-descriptor ────────────────────────────────────────────────

test("aiSkillDescriptor：POST 到 /ai/skill-descriptor，体 {body,title,summary,tags} 原样，带未中断的 AbortSignal", async () => {
  const s = stubFetch(() => jsonRes({ ok: true, data: descriptor }));
  try {
    const out = await api.aiSkillDescriptor({ body: "把要点整理成周报", title: "周报生成", summary: "摘要", tags: ["写作"] });
    assert.deepEqual(out, descriptor);
    assert.equal(s.calls.length, 1);
    assert.equal(s.calls[0].url, BASE + "/ai/skill-descriptor");
    assert.equal(s.calls[0].init.method, "POST");
    assert.deepEqual(JSON.parse(s.calls[0].init.body), { body: "把要点整理成周报", title: "周报生成", summary: "摘要", tags: ["写作"] });
    assert.ok(s.calls[0].init.signal instanceof AbortSignal, "AI 路由必须带超时信号（同 polish/refine）");
    assert.equal(s.calls[0].init.signal.aborted, false);
  } finally {
    s.restore();
  }
});

// 只给 body 也合法（title/summary/tags 是可选上下文）——缺省键不得变成 "undefined" 字面量。
test("aiSkillDescriptor：可省上下文键（只发 body），走 AI_TIMEOUT_MS", async () => {
  const s = stubFetch(() => jsonRes({ ok: true, data: descriptor }));
  try {
    await api.aiSkillDescriptor({ body: "只有正文" });
    assert.deepEqual(JSON.parse(s.calls[0].init.body), { body: "只有正文" });
    assert.equal(AI_TIMEOUT_MS, 120000, "AI 路由超时是 P5 定的 120s，本方法不另立常量");
  } finally {
    s.restore();
  }
});

test("aiSkillDescriptor 503（未配置模型）：ApiError.status 503，message 取宿主 detail", async () => {
  const s = stubFetch(() => jsonRes({ ok: false, error: "AI 生成技能描述失败（no-llm）" }, 503));
  try {
    await assert.rejects(api.aiSkillDescriptor({ body: "正文" }), (err) => {
      assert.ok(err instanceof ApiError, "应是 ApiError（错误必须可见）");
      assert.equal(err.status, 503);
      assert.equal(err.message, "AI 生成技能描述失败（no-llm）");
      return true;
    });
  } finally {
    s.restore();
  }
});

test("aiSkillDescriptor 400（缺少 body）：ApiError.status 400", async () => {
  const s = stubFetch(() => jsonRes({ ok: false, error: "缺少 body" }, 400));
  try {
    await assert.rejects(api.aiSkillDescriptor({ body: "   " }), (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 400);
      assert.equal(err.message, "缺少 body");
      return true;
    });
  } finally {
    s.restore();
  }
});

test("aiSkillDescriptor：非 JSON 响应 → 可读 ApiError，带 HTTP 状态", async () => {
  const s = stubFetch(() => ({
    status: 502,
    ok: false,
    json: async () => {
      throw new SyntaxError("Unexpected token < in JSON at position 0");
    },
  }));
  try {
    await assert.rejects(api.aiSkillDescriptor({ body: "正文" }), (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 502);
      assert.match(err.message, /502/);
      return true;
    });
  } finally {
    s.restore();
  }
});

// ── POST /skills/export ──────────────────────────────────────────────────────

test("exportPromptAsSkill：只需 promptId（缺省键不发：宿主自己按 descriptor/skillName 推名字）", async () => {
  const s = stubFetch(() => jsonRes({ ok: true, data: receipt }));
  try {
    const out = await api.exportPromptAsSkill({ promptId: "p1" });
    assert.deepEqual(out, receipt);
    assert.equal(s.calls[0].url, BASE + "/skills/export");
    assert.equal(s.calls[0].init.method, "POST");
    assert.deepEqual(JSON.parse(s.calls[0].init.body), { promptId: "p1" });
    assert.equal(s.calls[0].init.signal, undefined, "写盘路由不设超时（保持 P4 行为）");
  } finally {
    s.restore();
  }
});

test("exportPromptAsSkill：name / descriptor / conflictConfirmed 原样透传（重试路径的体形状）", async () => {
  const s = stubFetch(() => jsonRes({ ok: true, data: receipt }));
  try {
    await api.exportPromptAsSkill({ promptId: "p1", name: "weekly-report", descriptor, conflictConfirmed: true });
    assert.deepEqual(JSON.parse(s.calls[0].init.body), { promptId: "p1", name: "weekly-report", descriptor, conflictConfirmed: true });
  } finally {
    s.restore();
  }
});

test("exportPromptAsSkill 409（同名目录不属于本插件）：ApiError.status 409 + 宿主原文，确认后带标记重试成功", async () => {
  const conflictText = "技能目录 weekly-report 已存在，且不属于本插件的任何提示词（可能是你手写的技能）";
  let s = stubFetch(() => jsonRes({ ok: false, error: conflictText }, 409));
  try {
    await assert.rejects(api.exportPromptAsSkill({ promptId: "p1", name: "weekly-report" }), (err) => {
      assert.ok(err instanceof ApiError, "409 必须可见（前端据此弹确认）");
      assert.equal(err.status, 409);
      assert.equal(err.message, conflictText);
      return true;
    });
  } finally {
    s.restore();
  }
  s = stubFetch(() => jsonRes({ ok: true, data: receipt }));
  try {
    const out = await api.exportPromptAsSkill({ promptId: "p1", name: "weekly-report", conflictConfirmed: true });
    assert.equal(out.path, receipt.path);
    assert.deepEqual(JSON.parse(s.calls[0].init.body), { promptId: "p1", name: "weekly-report", conflictConfirmed: true });
  } finally {
    s.restore();
  }
});

test("exportPromptAsSkill 400（技能名非法 / description 全空）：ApiError.status 400 + 宿主原文", async () => {
  const s = stubFetch(() => jsonRes({ ok: false, error: "技能名非法：需要小写 kebab-case" }, 400));
  try {
    await assert.rejects(api.exportPromptAsSkill({ promptId: "p1", name: "../evil" }), (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 400);
      assert.equal(err.message, "技能名非法：需要小写 kebab-case");
      return true;
    });
  } finally {
    s.restore();
  }
});

test("exportPromptAsSkill 404（promptId 无效）：ApiError.status 404，与 400 可区分（调用方按状态分类）", async () => {
  const s = stubFetch(() => jsonRes({ ok: false, error: "提示词不存在" }, 404));
  try {
    await assert.rejects(api.exportPromptAsSkill({ promptId: "gone" }), (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 404);
      assert.equal(err.message, "提示词不存在");
      return true;
    });
  } finally {
    s.restore();
  }
});

test("exportPromptAsSkill 500：信封失败同样带 status（不得静默返回 undefined）", async () => {
  const s = stubFetch(() => jsonRes({ ok: false, error: "internal error" }, 500));
  try {
    const result = await api.exportPromptAsSkill({ promptId: "p1" }).catch((err) => err);
    assert.ok(result instanceof ApiError);
    assert.equal(result.status, 500);
  } finally {
    s.restore();
  }
});

test("exportPromptAsSkill：非 JSON 响应 → 可读 ApiError，带 HTTP 状态（与 aiSkillDescriptor 的覆盖对等）", async () => {
  const s = stubFetch(() => ({
    status: 504,
    ok: false,
    json: async () => {
      throw new SyntaxError("Unexpected token < in JSON at position 0");
    },
  }));
  try {
    await assert.rejects(api.exportPromptAsSkill({ promptId: "p1" }), (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 504);
      assert.match(err.message, /504/);
      return true;
    });
  } finally {
    s.restore();
  }
});

// ── 表面 ─────────────────────────────────────────────────────────────────────

test("api 表面：P7 的两个新方法都在，且各自只取**一个**入参对象（arity 是接口形态的一部分）", () => {
  assert.equal(typeof api.aiSkillDescriptor, "function");
  assert.equal(typeof api.exportPromptAsSkill, "function");
  // 修复轮 1（复审 P3）：旧断言 `typeof ….length === "number"` 对**任何**函数恒真，等于没断言。
  // arity 钉成 1：两个方法都只收一个入参对象（把入参对象拆成位置参数会当场变红）。
  assert.equal(api.aiSkillDescriptor.length, 1, "aiSkillDescriptor 只取一个入参对象");
  assert.equal(api.exportPromptAsSkill.length, 1, "exportPromptAsSkill 只取一个入参对象");
});
