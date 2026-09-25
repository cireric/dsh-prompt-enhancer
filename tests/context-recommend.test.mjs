import { test } from "node:test";
import assert from "node:assert/strict";
const reco = await import("../src/client/utils/context-recommend.ts");

/** 造一条提示词（只填算法用到的字段）。 */
const p = (id, title, body = "", tags = [], usageCount = 0, lastUsedAt = 0) =>
  ({ id, title, body, tags, usageCount, lastUsedAt });

const NOW = 1_760_000_000_000;

test("recommend：草稿为空 ⇒ 一条都不推荐（规格 §7.1.1 的触发条件，**与上游 README 相反**）", () => {
  const prompts = [p("1", "代码审查清单", "review checklist")];
  assert.deepEqual(reco.recommend({ draft: "", contextText: "审查 代码", prompts, now: NOW }), []);
  assert.deepEqual(reco.recommend({ draft: "   ", contextText: "审查 代码", prompts, now: NOW }), []);
});

test("recommend：草稿非空且命中 ⇒ 返回该条；无匹配 ⇒ 返回空", () => {
  const prompts = [p("1", "代码审查清单"), p("2", "周报模板")];
  const hit = reco.recommend({ draft: "帮我做代码审查", contextText: "", prompts, now: NOW });
  assert.deepEqual(hit.map((x) => x.id), ["1"]);
  assert.deepEqual(reco.recommend({ draft: "zzz qqq", contextText: "", prompts, now: NOW }), []);
});

test("recommend：最多 5 条（LIMIT）", () => {
  const prompts = Array.from({ length: 9 }, (_, i) => p(String(i), "审查清单 " + i));
  const hit = reco.recommend({ draft: "审查", contextText: "", prompts, now: NOW });
  assert.equal(hit.length, 5);
});

test("recommend：同相关度下，高频/近期使用者在前（使用智能真的参与排序）", () => {
  const cold = p("cold", "部署流程", "", [], 0, 0);
  const hot = p("hot", "部署流程", "", [], 40, NOW - 1000);
  const hit = reco.recommend({ draft: "部署", contextText: "", prompts: [cold, hot], now: NOW });
  assert.deepEqual(hit.map((x) => x.id), ["hot", "cold"]);
});

test("recommend：停用词不产生匹配（「帮我」这类噪声不推荐任何东西）", () => {
  const prompts = [p("1", "帮我")];
  assert.deepEqual(reco.recommend({ draft: "帮我", contextText: "", prompts, now: NOW }), []);
});

test("recommend：最近聊天上下文参与匹配（草稿本身无命中，上下文里有命中）", () => {
  const prompts = [p("1", "代码审查清单")];
  const hit = reco.recommend({ draft: "继续", contextText: "上一轮在讲代码审查", prompts, now: NOW });
  assert.deepEqual(hit.map((x) => x.id), ["1"]);
});

test("extractKeywords：中文二元组 + 英文单词；长度 < 2 的词被丢弃", () => {
  const kw = reco.extractKeywords("审查 api a");
  assert.ok(kw.has("审查"), "中文二元组");
  assert.ok(kw.has("api"), "英文单词");
  assert.equal(kw.has("a"), false, "单字符被丢弃");
});

test("scorePrompt：相关度 0 ⇒ 0 分（不推荐）；标题命中权重高于正文", () => {
  const kw = reco.extractKeywords("回滚");
  const byTitle = reco.scorePrompt(p("t", "回滚方案", ""), kw, NOW);
  const byBody = reco.scorePrompt(p("b", "别的", "回滚方案"), kw, NOW);
  assert.equal(reco.scorePrompt(p("n", "无关", "无关"), kw, NOW), 0);
  assert.ok(byTitle > byBody, "标题权重 2 > 正文权重 1");
});

// F-4（控制者裁决）：计划 §4 的覆盖表承诺了「英文词长加权 > 中文二元组」，但步骤 1 的代码块漏了它。
// 以 §4 的覆盖承诺为准补齐：同样的命中位置（标题）与同样的词频（各 1 次）、同样的零使用度，
// 唯一变量是词长加权——英文长词必须比中文二元组（恒 1）得分更高。
test("scorePrompt：英文长词的词长加权高于中文二元组（命中位置与词频相同）", () => {
  const en = reco.scorePrompt(p("en", "refactor"), reco.extractKeywords("refactor"), NOW);
  const zh = reco.scorePrompt(p("zh", "审查"), reco.extractKeywords("审查"), NOW);
  assert.ok(en > zh, "英文长词应比中文二元组得分更高，实为 " + en + " vs " + zh);
});
