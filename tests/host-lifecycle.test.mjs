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
