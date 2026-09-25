/**
 * O-1 客户端侧：**不可逆删除点**清 per-prompt meta（T6 / P7 任务 6）。
 *
 * 被测对象是组件真正调用的编排（`src/client/utils/ai-flow.ts#deletePrompts`）——两个删除面板
 * （回收站的「永久删除」/「清空回收站」、列表页的软删除）都只经它收尾，不是平行副本。
 *
 * 组件（`.tsx`）进不了 `node --test`，故「面板有没有调它」归活体验收；本文件钉住那条编排的
 * **可执行语义**：哪些删除点发几次清键请求、顺序、失败面。软删除的**反面对照**（一次都不发）
 * 是本文件最重要的一条——它正是「回收站可恢复且复用同一 id」那条例外。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const { deletePrompts, perPromptMetaKeys } = await import("../src/client/utils/ai-flow.ts");
const { refinedDirectionMetaKey } = await import("../src/client/utils/refined-direction.ts");
const { skillDescriptorMetaKey } = await import("../src/client/utils/skill-export.ts");

/** 打桩 globalThis.fetch（与 tests/api.test.mjs 同款）：记录真实请求，调用方 try/finally 复原。 */
function stubFetch(handler) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init);
  };
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

const jsonRes = (body, status = 200) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

/** 记账用的假实现：事件按发生顺序进 `events`（顺序本身是语义的一部分）。 */
function harness({ removeError, failKeys = [] } = {}) {
  const events = [];
  return {
    events,
    remove: async () => {
      events.push("remove");
      if (removeError) throw removeError;
    },
    deleteMeta: async (key) => {
      events.push("meta:" + key);
      if (failKeys.includes(key)) throw new Error("宿主拒绝：" + key);
      return { key, deleted: true };
    },
  };
}

/** 捕获 console.warn 跑一段：清键失败必须**可见**（A11）。 */
async function withWarns(fn) {
  const original = console.warn;
  const warns = [];
  console.warn = (...args) => warns.push(args.map(String).join(" "));
  try {
    return { out: await fn(), warns };
  } finally {
    console.warn = original;
  }
}

// ── 键名：约定只有一处真源 ───────────────────────────────────────────────────

test("perPromptMetaKeys：恰好两把键 = 方向 + 技能 descriptor（键名取自各自主模块，不另抄一份）", () => {
  const keys = perPromptMetaKeys("p1");
  assert.deepEqual(keys, ["pl:refined-dir:p1", "pl:skill-descriptor:p1"]);
  assert.deepEqual(keys, [refinedDirectionMetaKey("p1"), skillDescriptorMetaKey("p1")], "与主模块的键构造器逐字相同");
});

// ── 不可逆删除点：逐条清 ─────────────────────────────────────────────────────

test("O-1：单条永久删除 ⇒ 主删除之后为该 id 清两把键（先删、后清）", async () => {
  const h = harness();
  const result = await deletePrompts({ ids: ["p1"], irreversible: true, remove: h.remove, deleteMeta: h.deleteMeta });
  assert.deepEqual(h.events, ["remove", "meta:pl:refined-dir:p1", "meta:pl:skill-descriptor:p1"]);
  assert.deepEqual(result, { succeeded: 2, failed: 0 });
});

test("O-1：清空回收站 ⇒ 对**每条**被删 id 清两把键（批量编排，主删除仍是一次）", async () => {
  const h = harness();
  const result = await deletePrompts({
    ids: ["a", "b", "c"],
    irreversible: true,
    remove: h.remove,
    deleteMeta: h.deleteMeta,
  });
  assert.deepEqual(h.events, [
    "remove",
    "meta:pl:refined-dir:a",
    "meta:pl:skill-descriptor:a",
    "meta:pl:refined-dir:b",
    "meta:pl:skill-descriptor:b",
    "meta:pl:refined-dir:c",
    "meta:pl:skill-descriptor:c",
  ]);
  assert.deepEqual(result, { succeeded: 6, failed: 0 });
});

// ── 反面对照：软删除一次都不发 ───────────────────────────────────────────────

test("O-1 反面对照：**软删除**（进回收站）⇒ 主删除照做，但**一次清键请求都不发**", async () => {
  const h = harness();
  const result = await deletePrompts({ ids: ["p1"], irreversible: false, remove: h.remove, deleteMeta: h.deleteMeta });
  assert.deepEqual(h.events, ["remove"], "回收站可恢复且复用同一 id：清了键，「删除 → 恢复」就会重演 I-1");
  assert.deepEqual(result, { succeeded: 0, failed: 0 }, "一次都没清 ⇒ 计数如实为 0");
});

test("O-1 反面对照：软删除哪怕涉及多条 id，也一条清键都不发", async () => {
  const h = harness();
  await deletePrompts({ ids: ["a", "b"], irreversible: false, remove: h.remove, deleteMeta: h.deleteMeta });
  assert.deepEqual(h.events, ["remove"]);
});

// ── 失败面 ───────────────────────────────────────────────────────────────────

test("O-1：主删除失败 ⇒ 原样抛出，且**一行 meta 都不动**（提示词还在，键必须还在）", async () => {
  const h = harness({ removeError: new Error("提示词不存在") });
  await assert.rejects(
    deletePrompts({ ids: ["p1"], irreversible: true, remove: h.remove, deleteMeta: h.deleteMeta }),
    /提示词不存在/,
  );
  assert.deepEqual(h.events, ["remove"], "清键是收尾：主操作没成功就谈不上收尾");
});

test("O-1：清键失败**不得静默、也不得反噬**——warn + 计入 failed，其余键照清", async () => {
  const h = harness({ failKeys: ["pl:refined-dir:a"] });
  const { out, warns } = await withWarns(() =>
    deletePrompts({ ids: ["a", "b"], irreversible: true, remove: h.remove, deleteMeta: h.deleteMeta }),
  );
  assert.deepEqual(out, { succeeded: 3, failed: 1 }, "删除本身成功；只有清键有失败计数");
  assert.equal(warns.length, 1, "至少一条 warn（错误必须可见）");
  assert.match(warns[0], /pl:refined-dir:a/, "warn 里带出残键名");
  assert.deepEqual(
    h.events.filter((e) => e.startsWith("meta:")),
    [
      "meta:pl:refined-dir:a",
      "meta:pl:skill-descriptor:a",
      "meta:pl:refined-dir:b",
      "meta:pl:skill-descriptor:b",
    ],
    "一个键失败不阻断其余键（含同一条的第二个键）",
  );
});

// ── ⑦：清谁的键以**主删除回执**为准（清空回收站的竞态窗口）───────────────────────

test("⑦ 清空回收站竞态：回执给出被删 id ⇒ 清**回执里**的每一条（含面板列表里没有的那条）", async () => {
  const h = harness();
  // 面板打开时列出的只有 `a`；清空那一刻宿主删掉的是 `a` **和** `b`（窗口内新增的回收站行）。
  const result = await deletePrompts({
    ids: ["a"],
    irreversible: true,
    remove: async () => {
      h.events.push("remove");
      return { removed: ["a", "b"] }; // = store.emptyTrash() 的返回值，路由原样放进 removed
    },
    deleteMeta: h.deleteMeta,
  });
  assert.deepEqual(
    h.events,
    [
      "remove",
      "meta:pl:refined-dir:a",
      "meta:pl:skill-descriptor:a",
      "meta:pl:refined-dir:b",
      "meta:pl:skill-descriptor:b",
    ],
    "b 不在面板列表（入参 ids）里，但它在**回执**里 ⇒ 必须清；「只清面板列表」那一版在这里必红",
  );
  assert.deepEqual(result, { succeeded: 4, failed: 0 });
});

test("⑦ 反面对照：回执没有 id 列表（单条路由回**条数**）⇒ 退回入参 ids，且不得把数值当 id", async () => {
  const h = harness();
  const result = await deletePrompts({
    ids: ["p1"],
    irreversible: true,
    remove: async () => {
      h.events.push("remove");
      return { removed: 1 }; // 单条永久删除：removed 是条数，不是 id 列表
    },
    deleteMeta: h.deleteMeta,
  });
  assert.deepEqual(h.events, ["remove", "meta:pl:refined-dir:p1", "meta:pl:skill-descriptor:p1"]);
  assert.deepEqual(result, { succeeded: 2, failed: 0 });
});

test("⑦ 回执说「一条都没删」（空列表）⇒ 一把键也不清，**不得**退回入参 ids", async () => {
  const h = harness();
  const result = await deletePrompts({
    ids: ["a", "b"],
    irreversible: true,
    remove: async () => {
      h.events.push("remove");
      return { removed: [] };
    },
    deleteMeta: h.deleteMeta,
  });
  assert.deepEqual(h.events, ["remove"], "空回执 = 宿主说没有行被删：清任何键都是凭空造事实");
  assert.deepEqual(result, { succeeded: 0, failed: 0 });
});

test("⑦ 回执形状不认识（缺键 / 非字符串数组）⇒ 退回入参 ids（不猜）", async () => {
  for (const receipt of [undefined, {}, { removed: "a" }, { removed: [1, 2] }, { removed: [""] }, { ids: ["a", "b"] }]) {
    const h = harness();
    await deletePrompts({
      ids: ["p1"],
      irreversible: true,
      remove: async () => {
        h.events.push("remove");
        return receipt;
      },
      deleteMeta: h.deleteMeta,
    });
    assert.deepEqual(
      h.events,
      ["remove", "meta:pl:refined-dir:p1", "meta:pl:skill-descriptor:p1"],
      "形状不符的回执（" + JSON.stringify(receipt) + "）只能当作「回执没说」",
    );
  }
});

// ── 缺省实现真走 DELETE /meta/:key ───────────────────────────────────────────

test("O-1：缺省 deleteMeta 真走 api.deleteMeta（DELETE /meta/<编码后的键>，无请求体）", async () => {
  const s = stubFetch(() => jsonRes({ ok: true, data: { key: "x", deleted: true } }));
  try {
    const result = await deletePrompts({ ids: ["p1"], irreversible: true, remove: async () => {} });
    assert.deepEqual(result, { succeeded: 2, failed: 0 });
    assert.equal(s.calls.length, 2, "两把键两次请求");
    assert.equal(s.calls[0].url, "/api/prompt-enhancer/meta/" + encodeURIComponent("pl:refined-dir:p1"));
    assert.equal(s.calls[0].init.method, "DELETE");
    assert.equal(s.calls[0].init.body, undefined, "DELETE 不带请求体");
    assert.equal(s.calls[1].url, "/api/prompt-enhancer/meta/" + encodeURIComponent("pl:skill-descriptor:p1"));
  } finally {
    s.restore();
  }
});
