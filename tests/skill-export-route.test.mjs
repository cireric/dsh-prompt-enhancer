/**
 * 技能导出**路由**的名字候选序（T6 / D-1 的宿主端；A / 重要-1 起改成**权威层**）。
 *
 * **现行次序**（`src/host/routes.ts` 的技能导出分支）：
 *   `prompt.skillName（非空）→ body.name → descriptor?.name`
 *
 * 为什么名字序必须在**权威层**（而不是只靠客户端每次都显式下发）：目录名是这个技能在官方根下的
 * **身份**。客户端的 `exportNameLocked` / `precheckExport` 读的是**本地**列表里的 `skillName`，
 * 而本地列表可能陈旧（技能页只在挂载时读一次、或有别的入口根本不读）⇒ 「导出成功 → 再点 AI
 * 补全（真会换名）→ 再导出」会按 AI 名下发，**另建目录、旧目录从此无主**（后续对旧名 409）。
 * 承重不变量放权威层，任何新入口都自动被覆盖——与 R55 的教训同形。
 *
 * 故这里走**真实分发**：真的建目录、真的回名字、真的写库的 `skillName`，并比较**技能根下的目录集合**
 * （「有没有多出目录」比逐个 `existsSync` 更强：它同时挡住改名与另建）。
 *
 * 隔离：临时 `DSH_HOME`（`skills.exportSkill` 会真的写盘），绝不碰用户真实技能目录。
 */
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
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
/** 技能根下的目录名集合（排序后比较：导出前后「目录集合逐字不变」= 没改名也没另建）。 */
const skillNames = () => {
  const root = join(dshHome(), "skills");
  return existsSync(root) ? readdirSync(root).sort() : [];
};

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

test("A / 重要-1：**不下发** name 时也由 skillName 决定（descriptor.name 退到首次导出的候选）", async () => {
  const id = exportedPrompt("周报生成 B", "mine-b");
  await post("/skills/export", { promptId: id, name: "mine-b" });
  assert.equal(existsSync(skillFile("mine-b")), true, "先确认它在 mine-b 目录里");

  const res = await post("/skills/export", {
    promptId: id,
    descriptor: { name: "ai-renamed-b", description: "AI 描述" },
  });
  assert.equal(res.status, 200);
  assert.equal(res.envelope.data.name, "mine-b", "宿主候选序把 prompt.skillName 排在 descriptor.name 之前");
  assert.equal(res.envelope.data.path, skillFile("mine-b"));
  assert.equal(existsSync(skillDir("ai-renamed-b")), false, "不再另建目录（旧目录会从此无主）");
  assert.equal(store.getPrompt(id).skillName, "mine-b", "库里的 skillName 不变");
});

// ── A（重要-1）：权威层把「已导出条目的目录名」钉在 skillName 上 ──────────────────
//
// **变异靶**：把 `routes.ts` 的候选序改回 `body.name ?? descriptor?.name ?? prompt.skillName`
// ⇒ 下面第一条必红（落盘名会变成 body.name、并另建一个目录）。

test("A / 重要-1：skillName 非空时，body.name 与 descriptor.name **都换了名**也仍落在既有目录", async () => {
  const id = exportedPrompt("月报生成", "mine-locked");
  const before = skillNames();

  const res = await post("/skills/export", {
    promptId: id,
    name: "brand-new-ai-name",
    descriptor: { name: "descriptor-other-name", description: "AI 描述" },
  });
  assert.equal(res.status, 200);
  assert.equal(res.envelope.data.name, "mine-locked", "已导出的目录名只能由 skillName 决定（body.name 不得赢）");
  assert.equal(res.envelope.data.path, skillFile("mine-locked"));
  assert.equal(existsSync(skillFile("mine-locked")), true, "SKILL.md 写在既有目录里");
  assert.equal(existsSync(skillDir("brand-new-ai-name")), false, "body.name 不得另建目录");
  assert.equal(existsSync(skillDir("descriptor-other-name")), false, "descriptor.name 也不得另建目录");
  assert.equal(store.getPrompt(id).skillName, "mine-locked", "库里的 skillName 不变 ⇒ 旧目录不无主");
  assert.deepEqual(skillNames(), [...before, "mine-locked"].sort(), "技能根下只多了既有的那一个目录");
});

test("A / 重要-1 ②：同一次会话内连续两次导出（第二次带一个**不同的 AI 名**）⇒ 目录集合不变、skillName 不变", async () => {
  const created = store.createPrompt({ title: "连续导出", body: "连续导出的正文" });
  const before = skillNames();

  const first = await post("/skills/export", {
    promptId: created.id,
    name: "ai-first",
    descriptor: { name: "Ai First", description: "第一次" },
  });
  assert.equal(first.status, 200);
  assert.equal(first.envelope.data.name, "ai-first", "首次导出：skillName 还空着 ⇒ AI 名就是候选");
  assert.equal(store.getPrompt(created.id).skillName, "ai-first", "首次导出后名字进库 ⇒ 此后即锁定");
  const afterFirst = skillNames();
  assert.deepEqual(afterFirst, [...before, "ai-first"].sort(), "只多了 ai-first 一个目录");

  // **陈旧客户端形态**：本地列表还是导出前那一份（skillName 空）⇒ 它以为未锁定，按第二个 AI 名下发。
  // 这正是 A 的入口：技能页列表只在挂载时读一次 + 导出成功不刷新本地列表。
  const second = await post("/skills/export", {
    promptId: created.id,
    name: "ai-second",
    descriptor: { name: "Ai Second", description: "第二次" },
  });
  assert.equal(second.status, 200);
  assert.equal(second.envelope.data.name, "ai-first", "第二次仍落在第一次的目录（权威层不看客户端怎么想）");
  assert.equal(second.envelope.data.path, skillFile("ai-first"));
  assert.equal(store.getPrompt(created.id).skillName, "ai-first", "skillName 不变");
  assert.deepEqual(skillNames(), afterFirst, "目录集合逐字不变（不另建、旧目录不无主）");
  assert.equal(existsSync(skillDir("ai-second")), false, "第二个 AI 名一次都没落盘");
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
