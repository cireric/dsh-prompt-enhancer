/**
 * `capture.ts`（沉淀落库的**唯一入口**，R28）的组合逻辑测试（R59 / F-2，I-4）。
 *
 * 为什么补这个文件：**D-1 正是死在这条缝上**——二次确认框列出的受害者与宿主实际物理删除的对象
 * 逐 id 不等（T7 C10 = FAIL），而这条缝就在 `preview → create` 这几行里。组件接线在本仓库没有
 * 自动化通道（无 react-dom / jsdom，全局硬约束 5），但 `capture.ts` 是**非组件、可测**的模块，
 * 「组件接线无自动化」这句话盖不住它。下面五条逐一钉住它的五个出口（⑤ = T7 ①：淘汰者的清键）。
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
const { setSettingsScope, isSettingsReady } = await import("../src/client/utils/settings-store.ts");
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

/** 捕获 console.warn：降级读失败是**被断言的行为**，不是散落噪声。 */
function spyWarn() {
  const seen = [];
  const real = console.warn;
  console.warn = (...args) => { seen.push(args.map((a) => String(a)).join(" ")); };
  return { seen, restore: () => { console.warn = real; } };
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

/**
 * 路由桩：GET /prompts（插入前集合）、GET /settings、POST /prompts（创建）、
 * DELETE /meta/\<key\>（T7 ① 的清键）。未打桩的请求直接抛（不静默）。
 */
function routes({ prompts, settings, create }) {
  return (url, init) => {
    const method = init?.method ?? "GET";
    if (url === API_PREFIX + "/prompts" && method === "GET") return jsonRes({ ok: true, data: prompts });
    if (url === API_PREFIX + "/prompts" && method === "POST") return create();
    if (url === API_PREFIX + "/settings" && method === "GET") return jsonRes({ ok: true, data: settings });
    // T7 ①：淘汰者的 per-prompt meta 由客户端清（`DELETE /meta/<key>`，宿主那条是**通用**清键路由，
    // 键名约定归客户端）——按真实回执打桩，而不是让请求掉进「未打桩」的抛错里。
    if (url.startsWith(API_PREFIX + "/meta/") && method === "DELETE") {
      return jsonRes({ ok: true, data: { key: "k", deleted: true } });
    }
    throw new Error("未打桩的请求：" + method + " " + url);
  };
}

/** 只数 meta 清键请求（T7 ①）：`DELETE /meta/<key>`。 */
const isMetaDelete = (call) =>
  (call.init?.method ?? "GET") === "DELETE" && call.url.startsWith(API_PREFIX + "/meta/");

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
 * 等到 predicate 为真（轮询宏任务，带上限）。自 C（重要-4）起清键是**后台**的——`capture.ts` 不再
 * `await deletePrompts`——故断言「发了哪些请求」之前必须先等它落地。上限只是防挂住：
 * 正常路径在第一个宏任务内就已就位。
 */
async function until(predicate, ms = 1000) {
  const deadline = Date.now() + ms;
  while (!predicate()) {
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return true;
}

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

/**
 * 把夹具里的设置装进**设置唯一真源**（D-P8-2 / P8 T1）。
 *
 * 为什么夹具必须走这一步：`capture.ts` 的超限预检读的是 `getSettingsSnapshot()`，不再走
 * `GET /settings` ⇒ 只打桩 fetch 的话预检会看到默认的 300 条上限，淘汰路径永不触发。
 * 用**假 scope** 注入（`scope !== null` ⇒ 不会触发 HTTP 降级读），因此既不改动任何断言，
 * 也不往 fetch 桩的调用账本里多记一笔。
 */
function installSettings(settings) {
  setSettingsScope({
    getSnapshot: () => ({ status: "ready", value: settings }),
    subscribe: () => () => {},
    set: () => Promise.resolve(),
  });
}

/** 未超限夹具：上限远大于条数，预检必然为空。 */
function underLimitFixture() {
  return { prompts: [mk("a", "旧 A", false, 5)], settings: { ...DEFAULT_SETTINGS, maxPromptCount: 10 } };
}

test("出口 1 未超限：不弹确认、直接创建，返回 { ok:true, prompt, evicted }（标题首行兜底 + 载荷透传）", async () => {
  const { prompts, settings } = underLimitFixture();
  installSettings(settings);
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
    // T7 ① 的反面对照：没有淘汰 ⇒ 一次清键请求都不发（否则「无脑全清」也能让上面那条正向用例绿）。
    assert.equal(s.calls.filter(isMetaDelete).length, 0, "evicted 为空 ⇒ 一把键都不清");
  } finally {
    unsub();
    s.restore();
  }
});

test("出口 2 超限：弹确认，detail 逐字等于预演出的受害者标题；确认前一条也不创建", async () => {
  const { prompts, settings } = overLimitFixture();
  installSettings(settings);
  const created = mk("new", "新的一条");
  const s = stubFetch(
    routes({
      prompts,
      settings,
      // 宿主回执里的 evicted 是**被物理删除的 id 列表**（store.enforceMaxCount 的返回值），不是标题。
      create: () => jsonRes({ ok: true, data: { prompt: created, evicted: [prompts[0].id] } }),
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
    assert.deepEqual(outcome.evicted, [prompts[0].id], "淘汰名单以宿主响应里的 evicted（被删 id）为准");
    assert.equal(s.calls.filter(isCreate).length, 1, "确认后恰好创建一次");
    // 淘汰者的两把键就该被清（T7 ① 正是补在这里：被淘汰者不进回收站 ⇒ 没有第二个清理点）。
    // C（重要-4）后清键**不再压着保存反馈**（后台）⇒ 断言请求形状前先等它落地。
    assert.ok(await until(() => s.calls.filter(isMetaDelete).length === 2), "清键必须最终发出（非阻塞 ≠ 不做）");
    assert.deepEqual(
      s.calls.filter(isMetaDelete).map((c) => c.url),
      [
        API_PREFIX + "/meta/" + encodeURIComponent("pl:refined-dir:" + prompts[0].id),
        API_PREFIX + "/meta/" + encodeURIComponent("pl:skill-descriptor:" + prompts[0].id),
      ],
      "被淘汰的那条各清两把键",
    );
  } finally {
    resolveConfirm(false); // 断言中途失败时不留挂在途请求
    s.restore();
  }
});

test("出口 3 取消：返回 { ok:false, reason:'cancelled' }，POST /prompts 一次都没发、也不广播", async () => {
  const { prompts, settings } = overLimitFixture();
  installSettings(settings);
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
  installSettings(settings);
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
  installSettings(under.settings);
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

test("出口 5（T7 ① 真遗留）：淘汰者的 meta 键**逐 id 清两把**——被淘汰者不进回收站，故这是唯一清理点", async () => {
  // 宿主一次淘汰多条（预检只看得见插入前的集合，真正的受害者名单由宿主事务定）⇒ 回执里的 id 全都要清。
  const { prompts, settings } = overLimitFixture();
  installSettings(settings);
  const created = mk("new", "新的一条");
  const evicted = [prompts[0].id, prompts[1].id];
  const s = stubFetch(routes({ prompts, settings, create: () => jsonRes({ ok: true, data: { prompt: created, evicted } }) }));
  try {
    const pending = createFromCapture({ body: "新正文" });
    await tick();
    assert.ok(getConfirmSnapshot() !== null, "前提：超限先弹确认");
    resolveConfirm(true);
    const outcome = await raceTimeout(pending, 2000, "确认后必须落地");
    assert.deepEqual(outcome.evicted, evicted, "回执里的淘汰名单原样带回调用方");
    // 键名与 `ai-flow.ts#perPromptMetaKeys` 同源（这里按约定重写一次，两处不一致即红）。
    const expected = [];
    for (const id of evicted) {
      expected.push(
        API_PREFIX + "/meta/" + encodeURIComponent("pl:refined-dir:" + id),
        API_PREFIX + "/meta/" + encodeURIComponent("pl:skill-descriptor:" + id),
      );
    }
    // C（重要-4）：清键是**后台**的（`capture.ts` 不再 await）⇒ 先等 4 条请求都发出，再逐条断言形状。
    assert.ok(
      await until(() => s.calls.filter(isMetaDelete).length === expected.length),
      "清键必须最终发出（非阻塞 ≠ 不做）",
    );
    assert.deepEqual(s.calls.filter(isMetaDelete).map((c) => c.url), expected, "每个被淘汰的 id 各清两把键");
    for (const call of s.calls.filter(isMetaDelete)) {
      assert.equal(call.init.method, "DELETE", "清键走 DELETE（无请求体）");
      assert.equal(call.init.body, undefined);
    }
  } finally {
    resolveConfirm(false);
    s.restore();
  }
});

// ── C（重要-4 / 批一必修）：清键**不得压在保存反馈上** ─────────────────────────
//
// 缺陷形态：`capture.ts` 原来 `await deletePrompts(...)` ⇒ 「已保存」的反馈被压在 2×N 条
// `DELETE /meta` 上，而 N 由**上限配置**决定（上限 300 → 50 之后一次新建会淘汰 ~250 条 ⇒ ~500 次
// 串行 HTTP）。下面两条分别钉住「不阻塞」与「并发」，都做过变异验证。

test("出口 6（重要-4）：一条 DELETE 永远挂着，保存反馈照样立刻落地（不阻塞）", async () => {
  const { prompts, settings } = overLimitFixture();
  installSettings(settings);
  const created = mk("new", "新的一条");
  const s = stubFetch((url, init) => {
    const method = init?.method ?? "GET";
    if (url === API_PREFIX + "/prompts" && method === "GET") return jsonRes({ ok: true, data: prompts });
    if (url === API_PREFIX + "/prompts" && method === "POST") {
      return jsonRes({ ok: true, data: { prompt: created, evicted: [prompts[0].id] } });
    }
    if (url === API_PREFIX + "/settings" && method === "GET") return jsonRes({ ok: true, data: settings });
    // 清键：**永不落地**的 promise。反馈一旦 await 它，raceTimeout 必红（变异：把 void 改回 await）。
    if (url.startsWith(API_PREFIX + "/meta/") && method === "DELETE") return new Promise(() => {});
    throw new Error("未打桩的请求：" + method + " " + url);
  });
  try {
    const pending = createFromCapture({ body: "新正文" });
    await tick();
    assert.ok(getConfirmSnapshot() !== null, "前提：超限先弹确认");
    resolveConfirm(true);
    const outcome = await raceTimeout(
      pending,
      2000,
      "保存反馈不得压在清键 HTTP 上（变异：capture.ts 的 void 改回 await ⇒ 本用例必红）",
    );
    assert.equal(outcome.ok, true, "清键一条都没回来，创建仍必须如实回成功");
    assert.deepEqual(outcome.evicted, [prompts[0].id], "淘汰名单照旧如实带回调用方");
    assert.equal(s.calls.filter(isMetaDelete).length, 2, "清键请求照发（不阻塞 ≠ 不做）");
  } finally {
    resolveConfirm(false);
    s.restore();
  }
});

// ── C1（P8 二审 I2）：就绪闸门——失败**关闭**，绝不按默认上限静默继续 ────────────────
//
// 缺陷形态（改造后回归出来的「失败开放」）：淘汰预检读 `getSettingsSnapshot()`，快照拿不到真值时
// 按默认值（`maxPromptCount: 300`）顶上 ⇒ 宿主真实上限更低（如 20）时 `previewEvictions` 得到**空**
// 受害者 ⇒ 跳过二次确认 ⇒ 宿主 `enforceMaxCount` **静默淘汰**，且不可逆（淘汰者不进回收站）。
// 改造前是 `await api.getSettings()`：读失败即抛出（失败关闭 + 可见报错）——下面两条正负成对复原
// 那一性质，负条在「无闸门 / 按默认值继续」的写法下必红。

test("C1 正面：无 scope + 降级读成功 ⇒ isSettingsReady() 为真，预检按**真实上限**弹确认", async () => {
  const { prompts, settings } = overLimitFixture(); // maxPromptCount: 3、条数 3 ⇒ 再存一条必然超限
  const created = mk("new", "新的一条");
  const s = stubFetch(
    routes({ prompts, settings, create: () => jsonRes({ ok: true, data: { prompt: created, evicted: [prompts[0].id] } }) }),
  );
  try {
    setSettingsScope(null); // 显式进入「无 scope 缺失期」并触发那一次降级读
    await tick(); // 让它落地
    assert.equal(isSettingsReady(), true, "降级读成功 ⇒ 快照可信");
    const pending = createFromCapture({ body: "新正文" });
    await tick();
    const confirm = getConfirmSnapshot();
    assert.ok(confirm !== null, "就绪 + 真实上限 3 ⇒ 必须弹二次确认（按默认 300 会静默跳过）");
    assert.deepEqual(confirm.detail, ["最久未用"], "受害者按快照里的**真实**上限算出");
    resolveConfirm(true);
    const outcome = await raceTimeout(pending, 2000, "确认后必须落地");
    assert.equal(outcome.ok, true);
  } finally {
    resolveConfirm(false);
    s.restore();
  }
});

test("C1 反面（回归钉）：无 scope + 降级读失败 ⇒ 不就绪，createFromCapture 抛出可读错误且**不创建**", async () => {
  const { prompts, settings } = overLimitFixture();
  const created = mk("new", "新的一条");
  const warn = spyWarn();
  const s = stubFetch((url, init) => {
    const method = init?.method ?? "GET";
    if (url === API_PREFIX + "/settings" && method === "GET") {
      return jsonRes({ ok: false, error: "宿主读取设置失败（模拟）" }, 500);
    }
    return routes({ prompts, settings, create: () => jsonRes({ ok: true, data: { prompt: created, evicted: [] } }) })(url, init);
  });
  try {
    setSettingsScope(null);
    await tick();
    assert.equal(isSettingsReady(), false, "降级读失败 ⇒ 永远不就绪（本期不重试）");
    let caught = null;
    try {
      await raceTimeout(createFromCapture({ body: "新正文" }), 2000, "不就绪必须立刻抛出，不得挂住");
    } catch (err) {
      caught = err;
    }
    assert.ok(caught instanceof Error, "不就绪必须抛出（失败关闭），不得静默继续");
    assert.match(caught.message, /设置尚未就绪/, "错误必须可读——调用方原样呈现 err.message");
    assert.equal(s.calls.filter(isCreate).length, 0, "一条也不得创建（静默创建正是被修掉的那个缺陷）");
    assert.equal(getConfirmSnapshot(), null, "不得用「空受害者」跳过确认后继续");
    assert.equal(warn.seen.length, 1, "降级读失败仍留一条可读 warn（错误可见）");
    assert.match(warn.seen[0], /降级读取设置失败/);
  } finally {
    warn.restore();
    s.restore();
  }
});

test("出口 6b（重要-4）：多条清键**并发在途**（串行 await ⇒ 至多 1 条在途，本用例必红）", async () => {
  const { prompts, settings } = overLimitFixture();
  installSettings(settings);
  const created = mk("new", "新的一条");
  const evicted = [prompts[0].id, prompts[1].id]; // 2 个 id × 2 把键 = 4 条清键请求
  let inFlight = 0;
  let maxInFlight = 0;
  let releaseGate = () => {};
  const gate = new Promise((resolve) => {
    releaseGate = resolve;
  });
  const s = stubFetch((url, init) => {
    const method = init?.method ?? "GET";
    if (url === API_PREFIX + "/prompts" && method === "GET") return jsonRes({ ok: true, data: prompts });
    if (url === API_PREFIX + "/prompts" && method === "POST") {
      return jsonRes({ ok: true, data: { prompt: created, evicted } });
    }
    if (url === API_PREFIX + "/settings" && method === "GET") return jsonRes({ ok: true, data: settings });
    if (url.startsWith(API_PREFIX + "/meta/") && method === "DELETE") {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      // 全部挂在同一道闸上：串行实现只可能发出第一条（第二条要等第一条回来）。
      return gate.then(() => {
        inFlight -= 1;
        return jsonRes({ ok: true, data: { key: "k", deleted: true } });
      });
    }
    throw new Error("未打桩的请求：" + method + " " + url);
  });
  try {
    const pending = createFromCapture({ body: "新正文" });
    await tick();
    resolveConfirm(true);
    const outcome = await raceTimeout(pending, 2000, "保存必须落地（不阻塞）");
    assert.deepEqual(outcome.evicted, evicted);
    assert.ok(
      await until(() => maxInFlight === 4),
      "4 条清键必须**同时**在途（实测 maxInFlight=" + maxInFlight + "；串行 await 时恒为 1）",
    );
    assert.equal(maxInFlight, 4);
  } finally {
    releaseGate();
    resolveConfirm(false);
    s.restore();
  }
});
