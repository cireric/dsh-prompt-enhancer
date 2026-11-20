import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { Context } from "@deepseek-ai/cordis";
import { fakeReq, fakeRes } from "./helpers/fake-http.mjs";

const home = mkdtempSync(join(tmpdir(), "dpe-host-lifecycle-"));
process.env.DSH_HOME = home;
globalThis.__DEV__ = false;
const { apply, Config } = await import("../src/index.ts");
const { API_PREFIX } = await import("../src/types.ts");
after(() => rmSync(home, { recursive: true, force: true }));

async function installHost(services = {}) {
  const ctx = new Context();
  let routes = [];
  ctx.provide("webServer", {
    register(route) {
      routes.push(route);
      return () => { routes = routes.filter((candidate) => candidate !== route); };
    },
  });
  for (const [name, service] of Object.entries(services)) ctx.provide(name, service);
  const fiber = ctx.plugin({ apply }, Config({}));
  await fiber;
  return { fiber, routes: () => routes };
}

async function readProviders(host) {
  const res = fakeRes();
  await host.routes()[0].handler(fakeReq("GET", API_PREFIX + "/ai/providers"), res);
  assert.equal(res.statusCode, 200);
  return JSON.parse(res.body).data;
}

function catalogRuntime(id) {
  return {
    listProviders: () => [{ id }],
    listModels: async () => [{ id: "chat" }],
    async *stream() { assert.fail("列出模型不能执行生成请求"); },
  };
}

test("卸载旧实例不会清空新实例的模型目录，即使两者绑定同一个 LLM 对象", async () => {
  const llm = catalogRuntime("shared");
  const first = await installHost({ llm });
  const second = await installHost({ llm });
  try {
    const expected = await readProviders(second);
    assert.equal(expected[0].provider, "shared");
    await first.fiber.dispose();
    assert.deepEqual(await readProviders(second), expected);
  } finally {
    await first.fiber.dispose();
    await second.fiber.dispose();
  }
  const { listAiSelectables } = await import("../src/host/ai.ts");
  assert.deepEqual(await listAiSelectables(), []);
});

test("撤回新实例后恢复仍存活旧实例的 LLM，最后一个实例卸载后清空目录", async () => {
  const first = await installHost({ llm: catalogRuntime("original") });
  const second = await installHost({ llm: catalogRuntime("replacement") });
  try {
    assert.equal((await readProviders(second))[0].provider, "replacement");
    await second.fiber.dispose();
    assert.equal((await readProviders(first))[0]?.provider, "original");
  } finally {
    await second.fiber.dispose();
    await first.fiber.dispose();
  }
  const { listAiSelectables } = await import("../src/host/ai.ts");
  assert.deepEqual(await listAiSelectables(), []);
});

test("unloading the plugin aborts a running generation and prevents fallback", { timeout: 2000 }, async () => {
  const started = Promise.withResolvers();
  const release = Promise.withResolvers();
  const calls = [];
  const host = await installHost({
    llm: {
      listProviders: () => [{ id: "first" }, { id: "fallback" }],
      listModels: async () => [{ id: "chat" }],
      async *stream({ provider, signal }) {
        calls.push(provider);
        if (provider === "first") {
          started.resolve(signal);
          await release.promise;
          yield { type: "finish", reason: { kind: "aborted" } };
        } else {
          yield { type: "text-delta", index: 0, text: '{"findings":[]}' };
          yield { type: "finish", reason: { kind: "stop" } };
        }
      },
    },
  });
  const [route] = host.routes();
  assert.ok(route);
  const res = Object.assign(new EventEmitter(), fakeRes());
  const pending = route.handler(fakeReq("POST", API_PREFIX + "/ai/check", { body: "Review this prompt" }), res);
  const signal = await started.promise;
  await host.fiber.dispose();
  release.resolve();
  await pending;
  assert.deepEqual(host.routes(), []);
  assert.equal(signal.aborted, true);
  assert.deepEqual(calls, ["first"]);
  assert.equal(res.statusCode, 503);
  assert.equal(res.listenerCount("close"), 0);
});

test("PUT settings reports 503 when the real Cordis context has no optional service", async () => {
  const host = await installHost();
  try {
    const [route] = host.routes();
    const res = fakeRes();
    await route.handler(fakeReq("PUT", API_PREFIX + "/settings", { maxPromptCount: 50 }), res);
    assert.equal(res.statusCode, 503);
    assert.equal(JSON.parse(res.body).ok, false);
  } finally {
    await host.fiber.dispose();
  }
});

test("PUT settings uses the active optional Cordis service when present", async () => {
  const writes = [];
  const host = await installHost({
    settings: {
      writable: true,
      async update(entry, patch) { writes.push({ entry, patch }); },
    },
  });
  try {
    const [route] = host.routes();
    const res = fakeRes();
    await route.handler(fakeReq("PUT", API_PREFIX + "/settings", { maxPromptCount: 50 }), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(writes, [{ entry: "prompt-enhancer", patch: { maxPromptCount: 50 } }]);
  } finally {
    await host.fiber.dispose();
  }
});
