/**
 * `capture.ts`（沉淀落库的**唯一入口**，R28）的组合逻辑测试（R59 / F-2，I-4）。
 *
 * 为什么补这个文件：**D-1 正是死在这条缝上**——二次确认框列出的受害者与宿主实际物理删除的对象
 * 逐 id 不等（T7 C10 = FAIL），而这条缝就在 `preview → create` 这几行里。组件接线在本仓库没有
 * 自动化通道（无 react-dom / jsdom，全局硬约束 5），但 `capture.ts` 是**非组件、可测**的模块，
 * 「组件接线无自动化」这句话盖不住它。下面四条逐一钉住它的四个出口。
 *
 * 手法与 `tests/api.test.mjs` 一致：打桩 `globalThis.fetch`（`api.ts` 在调用期解析 fetch）。
 * 确认弹窗**不**打桩——用的是真实的 `confirm.ts`（先发布在途请求、再由本文件 resolve）：
 * 「弹不弹确认、明细是什么、什么时候不发 POST」正是被测对象本身。
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";

const { API_PREFIX, DEFAULT_SETTINGS } = await import("../src/types.ts");
const { ApiError } = await import("../src/client/utils/api.ts");
const { createFromCapture } = await import("../src/client/utils/capture.ts");
const { getConfirmSnapshot, resolveConfirm } = await import("../src/client/utils/confirm.ts");
const { subscribeDataChanged } = await import("../src/client/utils/data-sync.ts");
const { previewEvictions } = await import("../src/client/utils/eviction.ts");

/** 每个用例结束后都把可能在途的确认落地（无在途时是安全 no-op），不让单例状态漏到下一个用例。 */
afterEach(() => resolveConfirm(false));

/** 打桩 globalThis.fetch：记录每次调用，调用方必须 try/finally 复原（与 tests/api.test.mjs 同手法）。 */
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

/** 只数「创建」那一次 POST /prompts（预检用的 GET /prompts 不算）。 */
const isCreate = (call) => (call.init?.method ?? "GET") === "POST" && call.url === API_PREFIX + "/prompts";

/** 合成一条最小 Prompt（本模块的预检只读 id / title / aiRefined / lastUsedAt / createdAt）。 */
function mk(id, title, aiRefined = false, lastUsedAt = 0, createdAt = 0) {
  return {
    id,
    title,
    body: "正文 " + id,
    tags: [],
    summary: "",
    aiRefined,
    aiRefinedAt: 0,
    createdAt,
    updatedAt: createdAt,
    usageCount: 0,
    lastUsedAt,
    skillExportedAt: 0,
  };
}

/** 路由桩：GET /prompts（插入前集合）、GET /settings、POST /prompts（创建）。未打桩的请求直接抛（不静默）。 */
function routes({ prompts, settings, create }) {
  return (url, init) => {
    const method = init?.method ?? "GET";
    if (url === API_PREFIX + "/prompts" && method === "GET") return jsonRes({ ok: true, data: prompts });
    if (url === API_PREFIX + "/prompts" && method === "POST") return create();
    if (url === API_PREFIX + "/settings" && method === "GET") return jsonRes({ ok: true, data: settings });
    throw new Error("未打桩的请求：" + method + " " + url);
  };
}

/**
 * 给可能永不落地的 promise 一个上限：实现若弹了确认却没人 resolve，用例必须**快速变红**，
 * 而不是让整轮 `npm test` 挂住（node --test 默认不设超时）。
 */
function raceTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("超时（" + ms + "ms）：" + label)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** 等一个宏任务：requestConfirm 同步发布在途请求（先建 promise 再 emit），故这一拍快照必然就位。 */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * 超限夹具：3 条既有（P1/P2 未优化、P3 已优化）+ 上限 3 → 再存一条必然淘汰 lastUsedAt 最旧的 P1。
 * 键序的权威定义在 `src/eviction-order.ts`（F-3 抽出的共享比较器）。
 */
function overLimitFixture() {
  const prompts = [
    mk("p1", "最久未用", false, 1),
    mk("p2", "次久未用", false, 2),
    mk("p3", "已优化过", true, 0),
  ];
  return { prompts, settings: { ...DEFAULT_SETTINGS, maxPromptCount: 3 } };
}

/** 未超限夹具：上限远大于条数，预检必然为空。 */
function underLimitFixture() {
  return { prompts: [mk("a", "旧 A", false, 5)], settings: { ...DEFAULT_SETTINGS, maxPromptCount: 10 } };
}

test("出口 1 未超限：不弹确认、直接创建，返回 { ok:true, prompt, evicted }（标题首行兜底 + 载荷透传）", async () => {
  const { prompts, settings } = underLimitFixture();
  const created = mk("new", "第一行");
  const s = stubFetch(
    routes({ prompts, settings, create: () => jsonRes({ ok: true, data: { prompt: created, evicted: [] } }) }),
  );
  let broadcasts = 0;
  const unsub = subscribeDataChanged(() => {
    broadcasts += 1;
  });
  try {
    const outcome = await raceTimeout(
      createFromCapture({ body: "第一行\n第二行", tags: ["t"], summary: "s" }),
      2000,
      "未超限不得弹确认（弹了就没人 resolve，本调用永不落地）",
    );
    assert.deepEqual(outcome, { ok: true, prompt: created, evicted: [] }, "成功出口的形状");
    assert.equal(getConfirmSnapshot(), null, "未超限不得弹确认（在途请求快照为空）");
    const posts = s.calls.filter(isCreate);
    assert.equal(posts.length, 1, "只发一次 POST /prompts");
    assert.deepEqual(
      JSON.parse(posts[0].init.body),
      { title: "第一行", body: "第一行\n第二行", tags: ["t"], summary: "s" },
      "标题取正文首个非空行兜底；body / tags / summary 原样透传",
    );
    assert.equal(broadcasts, 1, "创建成功后必须广播一次数据变更");
  } finally {
    unsub();
    s.restore();
  }
});

test("出口 2 超限：弹确认，detail 逐字等于预演出的受害者标题；确认前一条也不创建", async () => {
  const { prompts, settings } = overLimitFixture();
  const created = mk("new", "新的一条");
  const s = stubFetch(
    routes({
      prompts,
      settings,
      create: () => jsonRes({ ok: true, data: { prompt: created, evicted: [prompts[0].title] } }),
    }),
  );
  const pending = createFromCapture({ body: "新正文" });
  let settled = null;
  let failed = null;
  pending.then(
    (value) => {
      settled = value;
    },
    (err) => {
      failed = err;
    },
  );
  try {
    await tick();
    const request = getConfirmSnapshot();
    assert.ok(request !== null, "超限必须弹确认");
    assert.deepEqual(
      request.detail,
      previewEvictions(prompts, settings.maxPromptCount, 1).map((p) => p.title),
      "明细必须逐字等于预演出的受害者标题清单（D-1 的缝：预演与真实淘汰必须同一批）",
    );
    assert.deepEqual(request.detail, ["最久未用"], "aiRefined=false 且 lastUsedAt 最旧的 P1");
    assert.equal(request.title, "manager.evict.title");
    assert.equal(request.message, "manager.evict.message");
    assert.equal(request.confirmLabel, "manager.evict.confirm");
    assert.equal(request.cancelLabel, "manager.evict.cancel");
    assert.equal(settled, null, "确认落地前不得返回成功");
    assert.equal(failed, null, "确认落地前不得失败");
    assert.equal(s.calls.filter(isCreate).length, 0, "确认落地前不得发 POST /prompts");

    resolveConfirm(true);
    const outcome = await raceTimeout(pending, 2000, "确认后必须落地");
    assert.equal(outcome.ok, true);
    assert.deepEqual(outcome.prompt, created, "返回宿主实际创建的那一条");
    assert.deepEqual(outcome.evicted, [prompts[0].title], "淘汰名单以宿主响应里的 evicted 为准");
    assert.equal(s.calls.filter(isCreate).length, 1, "确认后恰好创建一次");
  } finally {
    resolveConfirm(false); // 断言中途失败时不留挂在途请求
    s.restore();
  }
});

test("出口 3 取消：返回 { ok:false, reason:'cancelled' }，POST /prompts 一次都没发、也不广播", async () => {
  const { prompts, settings } = overLimitFixture();
  const s = stubFetch(
    routes({
      prompts,
      settings,
      create: () => jsonRes({ ok: true, data: { prompt: mk("new", "不该被创建"), evicted: [] } }),
    }),
  );
  let broadcasts = 0;
  const unsub = subscribeDataChanged(() => {
    broadcasts += 1;
  });
  const pending = createFromCapture({ body: "新正文" });
  try {
    await tick();
    assert.ok(getConfirmSnapshot() !== null, "前提：确实弹了确认（否则本用例没走到取消路径）");
    resolveConfirm(false);
    const outcome = await raceTimeout(pending, 2000, "取消后必须落地（不得挂住）");
    assert.deepEqual(outcome, { ok: false, reason: "cancelled" }, "取消是安全 no-op，不是失败");
    assert.equal(s.calls.filter(isCreate).length, 0, "取消路径不得创建：一次 POST /prompts 都不许发");
    assert.equal(broadcasts, 0, "取消没有产生任何变更，不得广播");
  } finally {
    resolveConfirm(false);
    unsub();
    s.restore();
  }
});

test("出口 4 create 抛错：原样上抛（同一对象）、不转成 cancelled、不广播", async () => {
  const { prompts, settings } = overLimitFixture();
  const boom = new Error("磁盘满了");
  const s = stubFetch(
    routes({
      prompts,
      settings,
      create: () => {
        throw boom;
      },
    }),
  );
  let broadcasts = 0;
  const unsub = subscribeDataChanged(() => {
    broadcasts += 1;
  });
  try {
    // 超限路径：先真走一次确认（同意），再让 create 抛错——覆盖「确认之后那一步失败」。
    const pending = createFromCapture({ body: "新正文" });
    await tick();
    assert.ok(getConfirmSnapshot() !== null, "前提：超限先弹确认");
    resolveConfirm(true);
    let caught = null;
    try {
      await raceTimeout(pending, 2000, "create 抛错后必须落地（不得被吞掉）");
    } catch (err) {
      caught = err;
    }
    assert.equal(caught, boom, "必须原样上抛**同一个**错误对象（不得吞、不得包装、不得转成 cancelled）");
    assert.equal(broadcasts, 0, "创建失败不得广播数据变更");
    assert.equal(s.calls.filter(isCreate).length, 1, "前提：那次 POST 确实发出去并失败了");
  } finally {
    resolveConfirm(false);
    unsub();
    s.restore();
  }

  // 第二种失败形态：宿主回信封失败（HTTP 500）——同样上抛 ApiError，而不是被转成 cancelled 返回值。
  const under = underLimitFixture();
  const s2 = stubFetch(
    routes({
      prompts: under.prompts,
      settings: under.settings,
      create: () => jsonRes({ ok: false, error: "提示词数量已达上限" }, 500),
    }),
  );
  try {
    let caught = null;
    try {
      await raceTimeout(createFromCapture({ body: "第二份正文" }), 2000, "信封失败也必须上抛");
    } catch (err) {
      caught = err;
    }
    assert.ok(caught instanceof ApiError, "信封失败必须是 ApiError（不是返回值的取消态）");
    assert.equal(caught.message, "提示词数量已达上限", "宿主文案原样带出");
    assert.equal(caught.status, 500);
    assert.equal(caught.ok, undefined, "不得被转成 { ok:false, reason:'cancelled' } 这种返回值");
  } finally {
    s2.restore();
  }
});
