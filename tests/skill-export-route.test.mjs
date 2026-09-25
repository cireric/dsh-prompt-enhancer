/**
 * 技能导出**路由**的名字候选序（T6 / D-1 的宿主端）——客户端显式下发的 `name` 必须赢。
 *
 * 为什么单独钉这一条：D-1 的客户端修法是「已导出条目**显式**下发 `name: prompt.skillName`」，
 * 它成立的前提是宿主按 `body.name ?? descriptor?.name ?? prompt.skillName` 取名字
 * （`src/host/routes.ts` 的技能导出分支）。若这个次序被改掉，客户端的显式下发就白发了一次，
 * 而那种失败在客户端单测里**看不出来**（那里只看到「请求体带了 name」）。故这里走**真实分发**：
 * 真的建目录、真的回名字、真的写库的 `skillName`。
 *
 * 隔离：临时 `DSH_HOME`（`skills.exportSkill` 会真的写盘），绝不碰用户真实技能目录。
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, after } from "node:test";
import assert from "node:assert/strict";

const home = mkdtempSync(join(tmpdir(), "dpe-skill-route-"));
process.env.DSH_HOME = home; // ← 必须在 import store / routes / paths 之前
const store = await import("../src/host/store.ts");
const { makeRoutes } = await import("../src/host/routes.ts");
const { dshHome } = await import("../src/host/paths.ts");
const { API_PREFIX } = await import("../src/types.ts");

after(() => rmSync(home, { recursive: true, force: true }));

/** 假 IncomingMessage / ServerResponse（同 tests/meta-delete.test.mjs：够分发层用即可）。 */
function fakeReq(method, url, body) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body), "utf8")];
  return {
    method,
    url,
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk;
    },
  };
}

function fakeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(chunk) {
      this.body = chunk;
    },
  };
}

async function post(path, body) {
  const res = fakeRes();
  await makeRoutes()[0].handler(fakeReq("POST", API_PREFIX + path, body), res);
  return { status: res.statusCode, envelope: JSON.parse(res.body) };
}

/** 建一条**已导出**的提示词（skillName = 目录名身份）。 */
function exportedPrompt(title, skillName) {
  const p = store.createPrompt({ title, body: title + " 的正文" });
  store.updatePrompt(p.id, { skillName, skillExportedAt: Date.now() });
  return p.id;
}

const skillDir = (name) => join(dshHome(), "skills", name);
const skillFile = (name) => join(skillDir(name), "SKILL.md");

test("D-1 宿主端：显式 name（= 已导出技能名）优先于 descriptor.name ⇒ 落在既有目录，**不另建**", async () => {
  const id = exportedPrompt("周报生成", "mine");
  const res = await post("/skills/export", {
    promptId: id,
    name: "mine",
    descriptor: { name: "ai-renamed", description: "AI 描述" },
  });
  assert.equal(res.status, 200);
  assert.equal(res.envelope.data.name, "mine", "宿主取的是显式下发的锁定名");
  assert.equal(res.envelope.data.path, skillFile("mine"));
  assert.equal(existsSync(skillFile("mine")), true, "SKILL.md 写在既有目录里");
  assert.equal(existsSync(skillDir("ai-renamed")), false, "AI 名不得另建目录（旧目录会从此无主）");
  assert.equal(store.getPrompt(id).skillName, "mine", "库里的 skillName 不变");
});

test("D-1 特征化：**不下发** name 时宿主取 descriptor.name（故客户端必须显式下发——不能只靠「不下发」）", async () => {
  const id = exportedPrompt("周报生成 B", "mine-b");
  await post("/skills/export", { promptId: id, name: "mine-b" });
  assert.equal(existsSync(skillFile("mine-b")), true, "先确认它在 mine-b 目录里");

  const res = await post("/skills/export", {
    promptId: id,
    descriptor: { name: "ai-renamed-b", description: "AI 描述" },
  });
  assert.equal(res.status, 200);
  assert.equal(res.envelope.data.name, "ai-renamed-b", "宿主候选序把 descriptor.name 排在 prompt.skillName 之前");
  assert.equal(existsSync(skillFile("ai-renamed-b")), true, "另建了目录");
  assert.equal(
    store.getPrompt(id).skillName,
    "ai-renamed-b",
    "库里的 skillName 被指到新目录 ⇒ mine-b 从此无主（这正是客户端显式下发 name 要挡住的结局）",
  );
  // 若哪天宿主的候选序改成「skillName 优先」，本条会红——那是**好消息**（客户端就不必再显式下发了）：
  // 改这条用例即可，不要把宿主改回去。
});

test("D-1 宿主端：未导出条目（无 skillName）仍按 AI 名建目录（AI 名是「尚未导出」条目的候选）", async () => {
  const created = store.createPrompt({ title: "全新条目", body: "全新条目的正文" });
  const res = await post("/skills/export", {
    promptId: created.id,
    name: "ai-first-name",
    descriptor: { name: "AI First Name", description: "AI 描述" },
  });
  assert.equal(res.status, 200);
  assert.equal(res.envelope.data.name, "ai-first-name");
  assert.equal(existsSync(skillFile("ai-first-name")), true);
  assert.equal(store.getPrompt(created.id).skillName, "ai-first-name", "首次导出的名字进库，此后即锁定");
});
