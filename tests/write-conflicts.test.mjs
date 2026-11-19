import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, beforeEach, test } from "node:test";
import { makeDispatch } from "./helpers/fake-http.mjs";

const originalHome = process.env.DSH_HOME;
const home = mkdtempSync(join(tmpdir(), "dpe-write-conflicts-"));
process.env.DSH_HOME = home;
const { dbPath } = await import("../src/host/paths.ts");
const { makeRoutes } = await import("../src/host/routes.ts");
const { API_PREFIX } = await import("../src/types.ts");
const { bindSettingsHost } = await import("../src/host/settings.ts");
const store = await import("../src/host/store.ts");
const dispatch = makeDispatch({ makeRoutes, API_PREFIX });

after(() => {
  if (originalHome === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = originalHome;
  rmSync(home, { recursive: true, force: true });
});

beforeEach(() => {
  store.emptyTrash();
  for (const prompt of store.listPrompts()) store.deletePrompt(prompt.id);
  store.emptyTrash();
  bindSettingsHost(undefined, { maxPromptCount: 20 });
});

function fillLibrary() {
  return Array.from({ length: 20 }, (_, index) => store.createPrompt({ title: "existing", body: String(index) }));
}

test("creation rejects missing and stale eviction approval without changing the library", async () => {
  fillLibrary();
  const [first, second] = store.listPrompts().sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  const body = { title: "incoming", body: "new" };
  store.recordUsage(first.id);
  assert.equal((await dispatch("POST", "/prompts", { ...body, approvedEvictions: [first.id] })).status, 409);
  assert.equal((await dispatch("POST", "/prompts", body)).status, 409);
  assert.equal(store.listPrompts().length, 20);
  assert.ok(store.getPrompt(first.id));
  assert.ok(store.getPrompt(second.id));
  const approved = await dispatch("POST", "/prompts", { ...body, approvedEvictions: [second.id] });
  assert.equal(approved.status, 200);
  assert.deepEqual(approved.envelope.data.evicted, [second.id]);
  assert.ok(store.getPrompt(approved.envelope.data.prompt.id));
  assert.equal(store.getPrompt(second.id), undefined);
  assert.deepEqual(store.listTrash(), []);
});

test("failed eviction rolls back creation and tag insertion", async () => {
  fillLibrary();
  const [victim] = store.listPrompts().sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  const fixture = new DatabaseSync(dbPath());
  fixture.exec("CREATE TRIGGER deny_eviction BEFORE DELETE ON prompts BEGIN SELECT RAISE(ABORT, 'deny eviction'); END");
  try {
    const { status } = await dispatch("POST", "/prompts", {
      title: "incoming", body: "new", tags: ["atomic tag"], approvedEvictions: [victim.id],
    });
    assert.equal(status, 500);
    assert.equal(store.listPrompts().length, 20);
    assert.ok(store.getPrompt(victim.id));
    assert.ok(!store.listTags().some(({ name }) => name === "atomic tag"));
  } finally {
    fixture.exec("DROP TRIGGER deny_eviction");
    fixture.close();
  }
});

test("confirmed import counts a trashed ID as overwritten and removes the old copy", async () => {
  const original = store.createPrompt({ title: "kept", body: "backup body" });
  const backup = store.exportPrompts();
  store.updatePrompt(original.id, { body: "old trash body" });
  store.deletePrompt(original.id);
  const preview = await dispatch("POST", "/import", { backup });
  assert.deepEqual(preview.envelope.data.stats, { added: 0, overwritten: 1, total: 1 });
  assert.equal(store.listTrash().length, 1);
  assert.equal((await dispatch("POST", "/import", { backup, confirm: true })).status, 200);
  assert.equal(store.getPrompt(original.id).body, "backup body");
  assert.deepEqual(store.listTrash(), []);
});

test("restoring a pre-existing duplicate never replaces the active prompt", async () => {
  const prompt = store.createPrompt({ title: "duplicate", body: "trash body" });
  store.deletePrompt(prompt.id);
  const fixture = new DatabaseSync(dbPath());
  try {
    fixture.prepare("INSERT INTO prompts (id, title, body, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)")
      .run(prompt.id, prompt.title, "active body", 1, 1);
  } finally {
    fixture.close();
  }
  const path = "/trash/" + prompt.id + "/restore";
  assert.equal((await dispatch("POST", path)).status, 409);
  assert.equal((await dispatch("DELETE", "/prompts/" + prompt.id)).status, 409);
  assert.equal(store.getPrompt(prompt.id).body, "active body");
  assert.equal(store.listTrash()[0].body, "trash body");
});

test("edit and rollback reject a stale content version even when timestamps match", async () => {
  const original = store.createPrompt({ title: "old title", body: "original" });
  store.updatePrompt(original.id, { body: "refined" }, { aiWriteBack: true });
  const path = "/prompts/" + original.id;
  const first = await dispatch("GET", path);
  const { contentVersion: stale, updatedAt } = first.envelope.data;
  assert.match(stale, /^[a-f\d]{64}$/);

  const backup = store.exportPrompts();
  backup.prompts[0].body = "new body with the same timestamp";
  assert.equal((await dispatch("POST", "/import", { backup, confirm: true })).status, 200);
  assert.equal(store.getPrompt(original.id).updatedAt, updatedAt);
  assert.equal((await dispatch("PUT", path, { contentVersion: stale, title: "changed title" })).status, 409);
  assert.equal((await dispatch("POST", path + "/rollback", { contentVersion: stale })).status, 409);

  const latest = (await dispatch("GET", path)).envelope.data;
  const saved = await dispatch("PUT", path, { contentVersion: latest.contentVersion, title: "changed title" });
  assert.equal(saved.status, 200);
  assert.notEqual(saved.envelope.data.contentVersion, latest.contentVersion);
  assert.equal(saved.envelope.data.body, "new body with the same timestamp");
});
