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

// Issue #2（Suggested 裁决）：草稿词硬门槛——一条提示词必须命中至少一个**草稿**关键词才有资格
// 推荐；会话上下文关键词只影响资格内排序。仅命中上下文词的提示词一律不出现（杜绝闲聊历史把
// 无关项顶进推荐条）。
test("recommend：仅命中上下文词的提示词被排除（草稿词硬门槛）", () => {
  const ctxOnly = p("ctx", "部署流程", "", [], 40, NOW - 1000); // 高频 + 新鲜，仍不得入选
  const gated = reco.recommend({ draft: "写个总结", contextText: "上一轮在讲部署流程", prompts: [ctxOnly], now: NOW });
  assert.deepEqual(gated, [], "只命中上下文词 ⇒ 不推荐");
  // 对照组：草稿自己也命中时，上下文词仍可参与排序加分（硬门槛不退化为「忽略上下文」）。
  const both = p("both", "部署流程", "", [], 40, NOW - 1000);
  const pass = reco.recommend({ draft: "总结部署", contextText: "部署流程的注意事项", prompts: [both], now: NOW });
  assert.deepEqual(pass.map((x) => x.id), ["both"], "草稿命中 ⇒ 有资格，上下文词叠加排序");
});

// Issue #2（Suggested 裁决 Q16）：usage 封顶 15% 微调——强相关的低频项必须稳定压过弱相关的高频项，
// 无论高频项多热。旧实现 relevance × (1 + usage) 最高放大 2 倍，弱相关高频会反超。
test("scorePrompt/recommend：强相关低频稳定胜过弱相关高频（usage 封顶 15%）", () => {
  // 草稿「代码 规范 整理」（空格分隔 ⇒ 3 个独立二元组，无滑动交叠）：
  // 强相关标题命中全部 3 词（r=6），弱相关标题只命中 2 词（r=4）。
  // 旧公式 r_w × (1+1) = 8 > 6（高频反超，正是 issue 要灭的行为）；新公式 4 × 1.15 = 4.6 < 6。
  const draft = "代码 规范 整理";
  const strong = reco.scorePrompt(p("s", "代码审查规范整理清单"), reco.extractKeywords(draft), NOW);
  const weakHot = reco.scorePrompt(p("w", "代码规范", "", [], 10_000, NOW - 1000), reco.extractKeywords(draft), NOW);
  assert.ok(strong > weakHot, "强相关 0 用量 > 弱相关极高频，实为 " + strong + " vs " + weakHot);
  const hit = reco.recommend({ draft, contextText: "", prompts: [p("w", "代码规范", "", [], 10_000, NOW - 1000), p("s", "代码审查规范整理清单")], now: NOW });
  assert.deepEqual(hit.map((x) => x.id), ["s", "w"]);
  // 数值封顶本身：usage 上限贡献恒为 ×1.15（freq 与 fresh 全满也不得超过；0.15 是裁决定值）。
  const maxed = reco.scorePrompt(p("m", "代码审查清单", "", [], 1e9, NOW), reco.extractKeywords(draft), NOW);
  const base = reco.scorePrompt(p("m", "代码审查清单"), reco.extractKeywords(draft), NOW);
  assert.ok(maxed <= base * 1.15 + 1e-12, "usage 贡献封顶 15%，实为 " + maxed / base);
});

test("recommend：停用词不产生匹配（「帮我」这类噪声不推荐任何东西）", () => {
  const prompts = [p("1", "帮我")];
  assert.deepEqual(reco.recommend({ draft: "帮我", contextText: "", prompts, now: NOW }), []);
});

// Issue #2 更新语义：上下文词不再单独给资格（硬门槛），但仍给资格内的提示词叠加排序分。
test("recommend：上下文词只影响资格内排序（草稿命中 ⇒ 上下文加分；仅上下文命中 ⇒ 排除）", () => {
  const prompts = [p("1", "代码审查清单")];
  assert.deepEqual(
    reco.recommend({ draft: "继续", contextText: "上一轮在讲代码审查", prompts, now: NOW }),
    [],
    "草稿不命中 ⇒ 不推荐（旧实现会经上下文词放行）",
  );
  const hit = reco.recommend({ draft: "代码审查", contextText: "上一轮在讲代码审查", prompts, now: NOW });
  assert.deepEqual(hit.map((x) => x.id), ["1"], "草稿命中 ⇒ 有资格；上下文词叠加在池关键词里参与排序");
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

// 评审 R1-2：`CONTEXT_USER_COUNT`（规格 §7.1.1 的**确定参数**）此前只被组件的
// `.slice(-CONTEXT_USER_COUNT)` 消费 ⇒ 参数在组件里没有任何自动化判据（改成 1、或删掉 slice，
// 全部用例仍然全绿）。把「取最近 N 条」提到纯模块后它才有判据面；两条变异原文见报告。
test("recentUserText：只取最近 N 条且保序；N 大于总数返回全部；N<=0 是空串（不是 slice(-0) 的全部）", () => {
  const msgs = ["第一条", "第二条", "第三条", "第四条", "第五条"];
  assert.equal(reco.recentUserText(msgs, 3), "第三条\n第四条\n第五条", "只取尾部 3 条，旧消息在前");
  assert.equal(reco.recentUserText(msgs), "第三条\n第四条\n第五条", "缺省 = 规格 §7.1.1 的 CONTEXT_USER_COUNT = 3");
  assert.equal(reco.recentUserText(msgs, 9), msgs.join("\n"), "N 大于总数 ⇒ 全部（不抛、不退化为空）");
  assert.equal(reco.recentUserText(msgs, 0), "", "N<=0 ⇒ 空串");
  assert.equal(reco.recentUserText([], 3), "", "空输入 ⇒ 空串");
});
