import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeDispatch } from "./helpers/fake-http.mjs";

const home = mkdtempSync(join(tmpdir(), "dpe-duplicate-ids-"));
process.env.DSH_HOME = home;
after(() => rmSync(home, { recursive: true, force: true }));

const { makeRoutes } = await import("../src/host/routes.ts");
const { API_PREFIX } = await import("../src/types.ts");
const store = await import("../src/host/store.ts");
const dispatch = makeDispatch({ makeRoutes, API_PREFIX });

test("预览与确认都拒绝重复提示词 ID，保留现有数据", async () => {
  const existing = store.createPrompt({ title: "现有提示词", body: "原文" });
  for (const id of [existing.id, "new-duplicate"]) {
    const backup = {
      version: 1,
      prompts: [{ id, body: "第一版" }, { id, body: "第二版" }],
    };
    for (const confirm of [false, true]) {
      const response = await dispatch("POST", "/import", { backup, confirm });
      assert.equal(response.status, 400);
      assert.match(response.envelope.error, /重复.*id/i);
    }
  }
  assert.equal(store.getPrompt(existing.id).body, "原文");
  assert.equal(store.getPrompt("new-duplicate"), undefined);
});
