/**
 * AI 结果缓存单测（Issue #3 / T2a）。
 *
 * 测试对象是**纯模块** `src/host/ai-cache.ts`：内存 LRU + TTL，零依赖
 * （不 import 任何宿主包），因此本文件永远不发网络请求、不碰文件系统。
 *
 * 负样本说明（完成标准：先变异验证能抓到对应缺陷）：
 * - TTL 过期重取  ← 变异「删掉过期判断」必须失败
 * - LRU 容量淘汰  ← 变异「删掉淘汰逻辑」必须失败
 * - 失败不入缓存  ← 变异「把 undefined/异常也缓存」必须失败
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const cache = await import("../src/host/ai-cache.ts");

// ─────────────────────────────────────────────────────────────────────────────
// hashCacheKey：键 = 哈希(system + user + route)
// ─────────────────────────────────────────────────────────────────────────────

test("hashCacheKey：同输入同哈希，任一字段不同则不同", () => {
  const a = cache.hashCacheKey({ system: "s", user: "u", route: "p/m" });
  const b = cache.hashCacheKey({ system: "s", user: "u", route: "p/m" });
  assert.equal(a, b);
  assert.notEqual(a, cache.hashCacheKey({ system: "s2", user: "u", route: "p/m" }));
  assert.notEqual(a, cache.hashCacheKey({ system: "s", user: "u2", route: "p/m" }));
  assert.notEqual(a, cache.hashCacheKey({ system: "s", user: "u", route: "p/m2" }));
});

test("canonicalCacheInput：规范化串结构精确（长度前缀消除拼接歧义，不靠哈希运气）", () => {
  assert.equal(cache.canonicalCacheInput({ system: "a", user: "bc", route: "d" }), "1:a|2:bc|1:d");
  assert.notEqual(
    cache.canonicalCacheInput({ system: "a", user: "bc", route: "d" }),
    cache.canonicalCacheInput({ system: "ab", user: "c", route: "d" }),
  );
  assert.equal(cache.canonicalCacheInput({ system: "", user: "u", route: "r" }), "0:|1:u|1:r");
});

test("hashCacheKey：字段含分隔符时无拼接歧义（裸拼接必然碰撞的对）", () => {
  // 裸 join 下两键都是 "a|b|c|r"——必然同哈希；长度前缀规范化后必然不同。
  assert.notEqual(
    cache.hashCacheKey({ system: "a|b", user: "c", route: "r" }),
    cache.hashCacheKey({ system: "a", user: "b|c", route: "r" }),
  );
  assert.notEqual(
    cache.hashCacheKey({ system: "", user: "u", route: "r" }),
    cache.hashCacheKey({ system: "u", user: "", route: "r" }),
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// AiResultCache：get / set / delete / clear / size
// ─────────────────────────────────────────────────────────────────────────────

test("set/get：命中返回原值；delete/clear/size 行为正确", () => {
  const c = new cache.AiResultCache();
  c.set("k1", { v: 1 });
  c.set("k2", 42);
  assert.deepEqual(c.get("k1"), { v: 1 });
  assert.equal(c.get("k2"), 42);
  assert.equal(c.size, 2);
  c.delete("k1");
  assert.equal(c.get("k1"), undefined);
  assert.equal(c.size, 1);
  c.clear();
  assert.equal(c.size, 0);
  assert.equal(c.get("k2"), undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
// TTL：过期重取（负样本：变异删掉过期判断必须失败）
// ─────────────────────────────────────────────────────────────────────────────

test("TTL：过期后视为未命中并清除条目", () => {
  let now = 1_000_000;
  const c = new cache.AiResultCache({ now: () => now });
  c.set("k", "v");
  assert.equal(c.get("k"), "v");
  now += 30 * 60 * 1000 - 1; // TTL 30min，边界前 1ms 仍命中
  assert.equal(c.get("k"), "v");
  now += 1; // 恰好到达 TTL → 过期
  assert.equal(c.get("k"), undefined);
  assert.equal(c.size, 0, "过期条目应被清除，不占 LRU 容量");
});

// ─────────────────────────────────────────────────────────────────────────────
// LRU：容量淘汰（负样本：变异删掉淘汰逻辑必须失败）
// ─────────────────────────────────────────────────────────────────────────────

test("LRU：超过容量淘汰最久未用条目", () => {
  const c = new cache.AiResultCache({ maxEntries: 2 });
  c.set("a", 1);
  c.set("b", 2);
  c.set("c", 3);
  assert.equal(c.get("a"), undefined, "最老的 a 被淘汰");
  assert.equal(c.get("b"), 2);
  assert.equal(c.get("c"), 3);
  assert.equal(c.size, 2);
});

test("LRU：读取会刷新新鲜度（被读的条目不该先被淘汰）", () => {
  const c = new cache.AiResultCache({ maxEntries: 2 });
  c.set("a", 1);
  c.set("b", 2);
  assert.equal(c.get("a"), 1); // a 变为最新
  c.set("c", 3);
  assert.equal(c.get("a"), 1, "刚读过的 a 不应被淘汰");
  assert.equal(c.get("b"), undefined, "b 才是最久未用的");
});

test("LRU：对已有键重新 set 视为一次使用", () => {
  const c = new cache.AiResultCache({ maxEntries: 2 });
  c.set("a", 1);
  c.set("b", 2);
  c.set("a", 10); // 更新 a → a 最新
  c.set("c", 3);
  assert.equal(c.get("a"), 10);
  assert.equal(c.get("b"), undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
// rememberAiResult：同键不触发工厂；失败结果不入缓存（负样本）
// ─────────────────────────────────────────────────────────────────────────────

test("remember：同键第二次取不触发底层工厂", async () => {
  const c = new cache.AiResultCache();
  let calls = 0;
  const factory = async () => {
    calls += 1;
    return `result-${calls}`;
  };
  const k = cache.hashCacheKey({ system: "s", user: "u", route: "p/m" });
  assert.equal(await cache.rememberAiResult(c, k, factory), "result-1");
  assert.equal(await cache.rememberAiResult(c, k, factory), "result-1", "必须复用缓存值");
  assert.equal(calls, 1, "工厂只允许被调用一次");
});

test("remember：不同键各自触发工厂", async () => {
  const c = new cache.AiResultCache();
  const calls = [];
  const factoryFor = (tag) => async () => {
    calls.push(tag);
    return tag;
  };
  const k1 = cache.hashCacheKey({ system: "s", user: "u", route: "p/m" });
  const k2 = cache.hashCacheKey({ system: "s", user: "u", route: "p/other" });
  await cache.rememberAiResult(c, k1, factoryFor("a"));
  await cache.rememberAiResult(c, k2, factoryFor("b"));
  assert.deepEqual(calls, ["a", "b"]);
});

test("remember：TTL 过期后重取工厂（换模型不命中旧缓存属同一路径）", async () => {
  let now = 0;
  const c = new cache.AiResultCache({ now: () => now });
  let calls = 0;
  const factory = async () => {
    calls += 1;
    return calls;
  };
  const k = cache.hashCacheKey({ system: "s", user: "u", route: "p/m" });
  await cache.rememberAiResult(c, k, factory);
  now = 30 * 60 * 1000; // 恰好 TTL → 过期
  assert.equal(await cache.rememberAiResult(c, k, factory), 2);
  assert.equal(calls, 2, "过期后必须重新调用工厂");
});

test("remember：工厂抛错时异常透传且缓存保持干净（负样本）", async () => {
  const c = new cache.AiResultCache();
  let calls = 0;
  const k = cache.hashCacheKey({ system: "s", user: "u", route: "p/m" });
  await assert.rejects(
    cache.rememberAiResult(c, k, async () => {
      calls += 1;
      throw new Error("boom");
    }),
    /boom/,
  );
  assert.equal(c.size, 0, "失败的调用不得留下缓存条目");
  assert.equal(c.get(k), undefined);
  // 下一次同键调用必须重新尝试工厂（而非拿到脏缓存或永久负缓存）
  assert.equal(
    await cache.rememberAiResult(c, k, async () => {
      calls += 1;
      return "ok";
    }),
    "ok",
  );
  assert.equal(calls, 2);
});

test("remember：工厂返回 undefined（本仓 AI 失败约定）不入缓存（负样本）", async () => {
  const c = new cache.AiResultCache();
  let calls = 0;
  const factory = async () => {
    calls += 1;
    return calls === 1 ? undefined : "recovered";
  };
  const k = cache.hashCacheKey({ system: "s", user: "u", route: "p/m" });
  assert.equal(await cache.rememberAiResult(c, k, factory), undefined);
  assert.equal(c.size, 0, "undefined 视为失败结果，不得缓存");
  assert.equal(await cache.rememberAiResult(c, k, factory), "recovered", "下次必须重试");
  assert.equal(calls, 2);
});
