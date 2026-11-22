import assert from "node:assert/strict";
import { test } from "node:test";
import { createAIRequestLifecycle } from "../src/client/utils/ai-request-lifecycle.ts";

function start(lifecycle, events, label) {
  const reply = Promise.withResolvers();
  let signal;
  const done = lifecycle.start({
    onStart: () => events.push(`${label}:waiting`),
    request: (requestSignal) => {
      signal = requestSignal;
      return reply.promise;
    },
    onSuccess: (value) => events.push(`${label}:${value}`),
    onError: (error) => events.push(`${label}:${error.message}`),
    onFinish: () => events.push(`${label}:finished`),
    onCancel: () => events.push(`${label}:cancelled`),
  });
  return { ...reply, signal, done };
}

for (const outcome of ["resolve", "reject"]) {
  test(`a cancelled request's late ${outcome} neither updates the view nor unlocks its replacement`, async () => {
    const lifecycle = createAIRequestLifecycle();
    const events = [];
    const a = start(lifecycle, events, "A");
    let elapsedOnAbort;
    a.signal.addEventListener("abort", () => {
      elapsedOnAbort = lifecycle.elapsedSeconds();
      events.push("A:aborted");
    });
    lifecycle.cancel();
    lifecycle.cancel();
    assert.equal(elapsedOnAbort, undefined);
    const b = start(lifecycle, events, "B");

    a[outcome](outcome === "resolve" ? "stale" : new Error("stale"));
    await a.done;
    // Resolve the would-be third request before awaiting, so a broken lock fails by assertion.
    const c = start(lifecycle, events, "C");
    c.resolve("duplicate");
    await c.done;
    assert.deepEqual(events, ["A:waiting", "A:aborted", "A:cancelled", "B:waiting"]);
    assert.equal(b.signal.aborted, false);

    b.resolve("fresh");
    await b.done;
    assert.deepEqual(events.slice(4), ["B:fresh", "B:finished"]);
  });
}

test("each accepted request starts at zero; a duplicate cannot reset its clock", async () => {
  let time = 500;
  const lifecycle = createAIRequestLifecycle(() => time);
  const events = [];
  const a = start(lifecycle, events, "A");
  assert.equal(lifecycle.elapsedSeconds(), 0);
  time += 1999;
  const duplicate = start(lifecycle, events, "duplicate");
  duplicate.resolve("duplicate");
  await duplicate.done;
  assert.equal(lifecycle.elapsedSeconds(), 1);
  time += 1;
  assert.equal(lifecycle.elapsedSeconds(), 2);
  a.reject(new Error("failed"));
  await a.done;
  assert.deepEqual(events, ["A:waiting", "A:failed", "A:finished"]);
  assert.equal(lifecycle.elapsedSeconds(), undefined);

  const b = start(lifecycle, events, "B");
  assert.equal(lifecycle.elapsedSeconds(), 0);
  b.resolve("fresh");
  await b.done;
});

test("unmount aborts the request without navigating or committing a late response", async () => {
  const lifecycle = createAIRequestLifecycle();
  const events = [];
  const a = start(lifecycle, events, "A");
  lifecycle.invalidate();
  assert.equal(a.signal.aborted, true);
  assert.equal(lifecycle.elapsedSeconds(), undefined);
  const b = start(lifecycle, events, "B");
  a.resolve("stale");
  await a.done;
  b.resolve("fresh");
  await b.done;
  assert.deepEqual(events, ["A:waiting", "B:waiting", "B:fresh", "B:finished"]);
});

test("save or write-back retry holds the same slot as AI but is not cancelled by AI controls", async () => {
  const lifecycle = createAIRequestLifecycle();
  const events = [];
  const a = start(lifecycle, events, "A");
  await lifecycle.runSave(async () => { events.push("duplicate save"); });
  lifecycle.cancel();

  const writeBack = Promise.withResolvers();
  const saved = lifecycle.runSave(async () => {
    events.push("saving");
    await writeBack.promise;
    events.push("saved");
  });
  lifecycle.cancel();
  lifecycle.invalidate();
  a.resolve("stale");
  await a.done;
  const b = start(lifecycle, events, "B");
  b.resolve("duplicate");
  await b.done;
  await lifecycle.runSave(async () => { events.push("duplicate retry"); });
  assert.equal(lifecycle.elapsedSeconds(), undefined);
  assert.deepEqual(events, ["A:waiting", "A:cancelled", "saving"]);

  writeBack.resolve();
  await saved;
  const c = start(lifecycle, events, "C");
  c.resolve("fresh");
  await c.done;
  assert.deepEqual(events.slice(3), ["saved", "C:waiting", "C:fresh", "C:finished"]);
});
