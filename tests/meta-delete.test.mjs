/**
 * O-1 宿主侧：meta 的**删除通道**（T6 / P7 任务 6）。
 *
 * 事实源 = `src/host/routes.ts` 的 `DELETE /meta/:key` 分支 + `src/host/store.ts#deleteMetaValue`。
 * 断言走**真实分发**：`makeRoutes()` 取出 prefix 路由处理器，用假的 req/res 真跑一遍
 * （与 `tests/api.test.mjs` 打桩 fetch 看真实请求同一纪律：断言行为，不扫源码文本）。
 *
 * 为什么这条通道必须是**通用**形态：meta 是宿主的中立 KV 表，键名约定（`pl:` 前缀、
 * `<用途>:<promptId>` 分段）全归客户端——本文件用的键名就是客户端那一套，宿主不该认识它。
 *
 * 隔离：本进程把 `DSH_HOME` 指向临时目录后再 import store（同 `tests/store.test.mjs`），
 * 生产代码不含任何 test-only API。
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { makeDispatch } from "./helpers/fake-http.mjs";

const home = mkdtempSync(join(tmpdir(), "dpe-meta-"));
process.env.DSH_HOME = home; // ← 必须在 import store / routes / paths 之前
const store = await import("../src/host/store.ts");
const { makeRoutes } = await import("../src/host/routes.ts");
const { createDatabase } = await import("../src/host/node-sqlite.ts");
const { dbPath } = await import("../src/host/paths.ts");
const { API_PREFIX } = await import("../src/types.ts");

after(() => rmSync(home, { recursive: true, force: true }));

/** 真跑一次分发（路径相对 API_PREFIX），返回 `{ status, envelope }`；假 req/res 在 tests/helpers/fake-http.mjs。 */
const call = makeDispatch({ makeRoutes, API_PREFIX });

const metaPath = (key) => "/meta/" + encodeURIComponent(key);

/** 直接读产品自己的库文件（只读观察，不经生产写入路径）：行到底还在不在。 */
function countMetaRows(key) {
  const db = createDatabase(dbPath());
  try {
    return Number(db.prepare("SELECT COUNT(*) AS c FROM meta WHERE key = ?").get(key).c);
  } finally {
    db.close();
  }
}

test("O-1：PUT 有值 → DELETE 成功删行 → GET 回空串；**行真的没了**（不是写成空串的残行）", async () => {
  const key = "pl:refined-dir:p1";
  const put = await call("PUT", metaPath(key), { value: "refined" });
  assert.equal(put.status, 200);
  assert.equal(put.envelope.data.value, "refined");
  assert.equal(countMetaRows(key), 1, "先确认它真的写进去了");

  const del = await call("DELETE", metaPath(key));
  assert.equal(del.status, 200);
  assert.deepEqual(del.envelope, { ok: true, data: { key, deleted: true } });

  const get = await call("GET", metaPath(key));
  assert.equal(get.status, 200);
  assert.equal(get.envelope.data.value, "", "删掉后 GET 回空串（与「从未写过」同值）");
  assert.equal(countMetaRows(key), 0, "O-1 的正题：行必须消失——用 PUT 空串的老办法留下的是残键");
});

test("O-1：DELETE 一个不存在的键**也成功**（幂等；键不存在不是错误）", async () => {
  const key = "pl:skill-descriptor:never-written";
  assert.equal(countMetaRows(key), 0, "前提：它确实不存在");
  const del = await call("DELETE", metaPath(key));
  assert.equal(del.status, 200, "键不存在 ⇒ 仍是 200（目标状态已达成）");
  assert.deepEqual(
    del.envelope,
    { ok: true, data: { key, deleted: false } },
    "deleted 只如实说明这次没删到行，不是失败信号",
  );
});

test("O-1：连删两次都成功（第一次 true、第二次 false）——客户端重复清不得失败", async () => {
  const key = "pl:refined-dir:twice";
  await call("PUT", metaPath(key), { value: "original" });
  const first = await call("DELETE", metaPath(key));
  const second = await call("DELETE", metaPath(key));
  assert.equal(first.status, 200);
  assert.equal(first.envelope.data.deleted, true);
  assert.equal(second.status, 200, "第二次仍 200（幂等）");
  assert.equal(second.envelope.data.deleted, false);
  assert.equal(countMetaRows(key), 0);
});

test("O-1：只删这一个键（整体键名比对，不做前缀/模糊匹配）——别的键一行不动", async () => {
  const keep = "pl:refined-dir:keep-suffix";
  const target = "pl:refined-dir:keep";
  await call("PUT", metaPath(keep), { value: "original" });
  await call("PUT", metaPath(target), { value: "refined" });

  const del = await call("DELETE", metaPath(target));
  assert.equal(del.envelope.data.deleted, true);

  const still = await call("GET", metaPath(keep));
  assert.equal(still.envelope.data.value, "original", "名字相近的邻居键不得被连带删除");
  assert.equal(countMetaRows(target), 0);
  assert.equal(countMetaRows("schemaVersion"), 1, "宿主自己的键（schemaVersion）也不受影响");
});

test("O-1：store.deleteMetaValue 的返回值就是「这次删到了没有」（false ≠ 异常）", () => {
  const key = "pl:skill-descriptor:direct";
  assert.equal(store.getMetaValue(key), "", "缺失值就是空串（既有口径）");
  store.setMetaValue(key, "x");
  assert.equal(store.deleteMetaValue(key), true);
  assert.equal(store.deleteMetaValue(key), false, "再删一次仍是成功路径，只是没删到行");
  assert.equal(store.getMetaValue(key), "");
});
