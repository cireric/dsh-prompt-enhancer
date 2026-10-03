/**
 * C1 负样本（2026-10-03 审查）：跨源写入闸。
 *
 * 背景：宿主 webServer 只做「匹配 → route.handler」，无 origin / token / CSRF 守卫；而浏览器对
 * **跨源简单请求**不做预检，`Content-Type: text/plain` 的 POST 能带任意 JSON 正文打到固定的
 * 127.0.0.1 端口。实测（真实 server）这种请求会被正常执行并落库。
 *
 * 本用例钉住闸门的三条拒 / 两条放（判据只认**正向的跨源证据**）：
 *   拒：Origin 异源 · Sec-Fetch-Site: cross-site · Origin: null
 *   放：同源写请求（Origin 与 Host 同值）· 无 Origin 的客户端（curl / 脚本 / 宿主 agent）
 *
 * 隔离纪律：先把 DSH_HOME 指向临时目录，**再**动态 import 宿主模块（见 tests/store.test.mjs 顶部）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeDispatch } from "./helpers/fake-http.mjs";

test("C1 跨源写入闸：异源写被拒（403 且不落库），同源与无头客户端放行，GET 不挡", async () => {
  const home = mkdtempSync(join(tmpdir(), "dpe-cross-origin-"));
  process.env.DSH_HOME = home;
  try {
    const { makeRoutes } = await import("../src/host/routes.ts");
    const { API_PREFIX } = await import("../src/types.ts");
    const dispatch = makeDispatch({ makeRoutes, API_PREFIX });
    const evil = { origin: "https://evil.example", host: "127.0.0.1:3080" };

    // ① 跨源简单请求（text/plain，无预检）→ 403
    const cross = await dispatch("POST", "/prompts", { title: "CSRF", body: "x" }, { ...evil, "content-type": "text/plain" });
    assert.equal(cross.status, 403, "跨源写请求必须被拒");
    assert.equal(cross.envelope.ok, false);

    // ①b 被拒的请求一条都没落库（读用 GET：不挡）
    const listed = await dispatch("GET", "/prompts", undefined, evil);
    assert.equal(listed.status, 200);
    assert.equal(listed.envelope.data.filter((p) => p.title === "CSRF").length, 0, "被拒的写请求不得落库");

    // ② 只有 Sec-Fetch-Site（旧浏览器之外的所有现代浏览器都会发）→ 403
    const byFetchSite = await dispatch("POST", "/prompts", { title: "SFS", body: "x" },
      { "sec-fetch-site": "cross-site", host: "127.0.0.1:3080" });
    assert.equal(byFetchSite.status, 403, "Sec-Fetch-Site: cross-site 必须被拒（无 Origin 也要挡）");

    // ③ Origin: null（沙箱 iframe / file://）→ 403
    const byNullOrigin = await dispatch("POST", "/prompts", { title: "NULL", body: "x" },
      { origin: "null", host: "127.0.0.1:3080" });
    assert.equal(byNullOrigin.status, 403, "Origin: null 按跨源处理");

    // ④ 正面对照：同源页面的写请求（浏览器同源 POST 也发 Origin，值与 Host 同）→ 放行
    const sameOrigin = await dispatch("POST", "/prompts", { title: "同源", body: "x" },
      { origin: "http://127.0.0.1:3080", host: "127.0.0.1:3080", "sec-fetch-site": "same-origin" });
    assert.equal(sameOrigin.status, 200, "同源写请求不得被误挡（否则 GUI 全挂）");

    // ⑤ 正面对照：无 Origin / 无 Sec-Fetch 的客户端（curl、脚本、宿主 agent）→ 放行
    const headless = await dispatch("POST", "/prompts", { title: "无头客户端", body: "x" }, { host: "127.0.0.1:3080" });
    assert.equal(headless.status, 200, "无跨源证据的客户端必须放行");

    // ⑥ Origin 解析不了的畸形值（不是合法 URL）→ 按跨源拒
    const malformed = await dispatch("POST", "/prompts", { title: "MAL", body: "x" },
      { origin: "not a url", host: "127.0.0.1:3080" });
    assert.equal(malformed.status, 403);

    // ⑦ 写方法不止 POST：PUT 同样过闸
    const put = await dispatch("PUT", "/settings", { panelWidth: 420 }, evil);
    assert.equal(put.status, 403, "PUT 也必须过跨源闸");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
