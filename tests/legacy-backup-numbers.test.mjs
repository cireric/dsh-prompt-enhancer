import { after, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const home = mkdtempSync(join(tmpdir(), "dpe-legacy-numbers-"));
process.env.DSH_HOME = home;
after(() => rmSync(home, { recursive: true, force: true }));

const storeUrl = new URL("../src/host/store.ts", import.meta.url).href;
const { dbPath } = await import("../src/host/paths.ts");
const maxCount = Number.MAX_SAFE_INTEGER;

test("旧库含无效整数时保留提示词、标签与回收站，并修复读取和删除", async () => {
  const script = `
    const store = await import(${JSON.stringify(storeUrl)});
    store.importPrompts({
      version: 1,
      prompts: [{ id: "active", body: "正文", tags: ["留存标签"] }, { id: "discarded", body: "回收站正文" }],
    }, { confirm: true });
    store.deletePrompt("discarded");
  `;
  execFileSync(process.execPath, ["--input-type=module", "-e", script], { env: process.env });

  const legacy = new DatabaseSync(dbPath());
  try {
    legacy.prepare("UPDATE meta SET value = '3' WHERE key = 'schemaVersion'").run();
    legacy.prepare("UPDATE prompts SET usageCount = ?, updatedAt = -12 WHERE id = 'active'").run(9007199254740992n);
    legacy.prepare("UPDATE trash SET skillExportedAt = ?, aiRefinedAt = 37.5 WHERE id = 'discarded'").run(9223372036854775807n);
    legacy.prepare("UPDATE tags SET createdAt = ? WHERE name = '留存标签'").run(9007199254740992n);
  } finally {
    legacy.close();
  }

  const store = await import(storeUrl);
  const active = store.listPrompts().find((prompt) => prompt.id === "active");
  assert.equal(active.body, "正文");
  assert.equal(active.usageCount, maxCount);
  assert.equal(active.updatedAt, 0);
  const discarded = store.listTrash().find((prompt) => prompt.id === "discarded");
  assert.equal(discarded.body, "回收站正文");
  assert.equal(discarded.skillExportedAt, maxCount);
  assert.equal(discarded.aiRefinedAt, 37);
  assert.equal(store.exportPrompts().tags.find((tag) => tag.name === "留存标签").createdAt, maxCount);
  assert.equal(store.getMetaValue("schemaVersion"), "4");
  assert.equal(store.deletePrompt("active"), true);
});
