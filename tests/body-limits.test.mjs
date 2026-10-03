/**
 * 审查修复的负样本（routes.ts HTTP 边界）：
 *
 * - R1：PUT /prompts/:id 的 skillExportedAt 必须是**有限**数字。`typeof NaN === "number"`,
 *   旧的 typeof 检查放行 NaN/Infinity 直进 SQL 绑定（抛错变意外 500，或落 NULL 被 ?? 0 归零）。
 * - R2：readBody 有体积上限（5 MB），超限回 400 并 destroy，不落库。
 *
 * 非有限数字的 JSON 字面量（`1e999` → JSON.parse 得 Infinity）只能走**字符串**请求体通道：
 * JSON.stringify 对非有限数字只会产出 null（见 helpers/fake-http.mjs 的说明）。
 *
 * 隔离纪律：先把 DSH_HOME 指向临时目录，**再**动态 import 宿主模块
 * （见 tests/store.test.mjs / api.test.mjs 顶部注释）。独立成文件：node --test 每文件
 * 独立进程，避免与 api.test.mjs 里已绑定已删临时目录的 store db 句柄互相污染。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeDispatch, fakeReq, fakeRes } from "./helpers/fake-http.mjs";

test("R1+R2 负样本：skillExportedAt 有限数字校验 + 请求体 5MB 上限（真分发）", async () => {
  const home = mkdtempSync(join(tmpdir(), "dpe-body-limits-"));
  process.env.DSH_HOME = home;
  try {
    const { makeRoutes } = await import("../src/host/routes.ts");
    const { API_PREFIX } = await import("../src/types.ts");
    const dispatch = makeDispatch({ makeRoutes, API_PREFIX });

    // 建一条提示词作为 PUT 的靶子
    const created = await dispatch("POST", "/prompts", { title: "靶子", body: "正文" });
    assert.equal(created.status, 200);
    const id = created.envelope.data.prompt.id;

    // ── R1 负样本：1e999 → JSON.parse 得 Infinity，必须 400 ──
    const over = await dispatch("PUT", "/prompts/" + id, '{"skillExportedAt": 1e999}');
    assert.equal(over.status, 400, "Infinity 必须被拒（typeof 检查挡不住非有限数）");
    assert.equal(over.envelope.ok, false);
    assert.ok(over.envelope.error.includes("skillExportedAt"), "错误信息须指明字段");

    // ── R1 负样本（对象通道）：JSON.stringify(NaN) → null，键存在但非有限数字——
    //    严格边界：只要键被显式给出且不是有限数字，一律 400（客户端从不发 null，
    //    静默丢弃键的旧宽容语义只会掩盖调用方 bug，故收紧） ──
    const viaNull = await dispatch("PUT", "/prompts/" + id, { skillExportedAt: NaN });
    assert.equal(viaNull.status, 400, "键存在但非有限数字（null/NaN 序列化产物）必须被拒");
    assert.ok(viaNull.envelope.error.includes("skillExportedAt"));

    // ── R1 正向对照：合法有限数字照常写入 ──
    const good = await dispatch("PUT", "/prompts/" + id, '{"skillExportedAt": 1700000000000}');
    assert.equal(good.status, 200);
    assert.equal(good.envelope.data.skillExportedAt, 1700000000000);

    // ── R2 负样本：超过 5MB 的请求体 → 400，不落库 ──
    const huge = '{"body":"' + "x".repeat(5 * 1024 * 1024 + 64) + '"}';
    const tooBig = await dispatch("POST", "/prompts", huge);
    assert.equal(tooBig.status, 400, "超限请求体必须被拒");
    assert.ok(tooBig.envelope.error.includes("上限"), "错误信息须说明是体积超限");

    // ── R2 负样本（多块累计）：单块不超、跨块累计超限 → 400 ──
    // 单块夹具测不到这条：旧实现的累计逻辑只在「同一块内」被触发过。
    const half = "x".repeat(3 * 1024 * 1024);
    const multi = await dispatch("POST", "/prompts", ['{"body":"' + half, half + '"}']);
    assert.equal(multi.status, 400, "跨 chunk 累计超限必须被拒");
    assert.ok(multi.envelope.error.includes("上限"));

    // ── R2 负样本（响应先于关连接）：不得在写出响应前 destroy 请求流 ──
    // 旧实现先 `req.destroy()` ——真实 socket 一并被拆，客户端只拿到 EPIPE（实测），
    // 文档承诺的 400 永远到不了。夹具的 destroy 只记账，故这条断言真的在守那个顺序。
    const req = fakeReq("POST", API_PREFIX + "/prompts", huge);
    const res = fakeRes();
    await makeRoutes()[0].handler(req, res);
    assert.equal(res.statusCode, 400, "超限必须先产出 400 响应");
    assert.equal(req.destroyCalls, 0, "写出响应前不得 destroy 请求流（会把 socket 一起拆掉）");
    assert.equal(res.headers.Connection, "close", "超限响应必须带 Connection: close（剩余上传由关连接兜住）");

    // ── R2 后进程仍正常服务（destroy 不炸假夹具，路由层未被污染） ──
    const after = await dispatch("POST", "/prompts", { title: "正常", body: "第二条" });
    assert.equal(after.status, 200);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});