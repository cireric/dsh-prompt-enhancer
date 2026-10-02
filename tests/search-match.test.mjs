/**
 * 搜索口径（`src/search-match.ts`）的行为表。
 *
 * 为什么单独成文件：这条口径此前有两份实现（客户端 `filterPrompts` 与宿主 `listPrompts`），
 * 靠一句注释与只锁客户端一份的负样本维系——实测**已经分叉**（标签的跨边界子串命中）。
 * 归一之后字段集、归一化、命中档位只剩一处；「两处入口成员集一致」是另一条判据，
 * 需要 DB 装配，落在 `tests/store.test.mjs` 末尾。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const { matchRank, normalizeQuery } = await import("../src/search-match.ts");

const p = (over = {}) => ({ title: "无关标题", body: "无关正文", tags: [], ...over });

test("matchRank：档位 = 标题 3 > 标签 2 > 正文 1 > 不命中 0", () => {
  assert.equal(matchRank(p({ title: "周报生成" }), normalizeQuery("周报")), 3, "标题命中 = 3");
  assert.equal(matchRank(p({ tags: ["周报"] }), normalizeQuery("周报")), 2, "标签命中 = 2");
  assert.equal(matchRank(p({ body: "写周报" }), normalizeQuery("周报")), 1, "正文命中 = 1");
  assert.equal(matchRank(p({}), normalizeQuery("周报")), 0, "都不含 = 0");
});

test("matchRank：先命中先算——标题命中时不再看标签与正文", () => {
  assert.equal(matchRank(p({ title: "周报", tags: ["周报"], body: "周报" }), normalizeQuery("周报")), 3);
  assert.equal(matchRank(p({ tags: ["周报"], body: "周报" }), normalizeQuery("周报")), 2, "无标题命中时标签优先于正文");
});

test("matchRank：标签是**原子标签**——跨标签边界的子串不得命中（今天分叉的那条）", () => {
  // tags = ["ab","cd"] 拼成 "ab cd" 会包含 "b c"，逐标签匹配不会。此前客户端正是拼串，
  // 于是「快速列表」命中而「管理面板」不命中——同一个词、同一个库、两处不同结果。
  const cross = p({ tags: ["ab", "cd"] });
  assert.equal(matchRank(cross, normalizeQuery("b c")), 0, "跨标签边界不得命中");
  assert.equal(matchRank(cross, normalizeQuery("ab cd")), 0, "拼串命中的另一种形态同样不得命中");
  assert.equal(matchRank(cross, normalizeQuery("cd")), 2, "落在单个标签内仍命中");
  assert.equal(matchRank(p({ tags: ["foo bar"] }), normalizeQuery("o b")), 2, "同一标签内的子串仍命中（原子 ≠ 词边界）");
});

test("matchRank：summary 一律不参与（字段集的负样本）", () => {
  assert.equal(matchRank(p({ summary: "这里才含目标词：复盘" }), normalizeQuery("复盘")), 0, "summary 命中不得让条目入列");
  assert.equal(matchRank(p({ body: "这里含复盘" }), normalizeQuery("复盘")), 1, "反面对照：同一个词放进正文即命中");
});

test("normalizeQuery：trim + 小写；空查询归一为 \"\"（= 不过滤，由调用方决定）", () => {
  assert.equal(normalizeQuery("  AB  "), "ab");
  assert.equal(normalizeQuery(undefined), "");
  assert.equal(normalizeQuery("   "), "");
  assert.equal(matchRank(p({ title: "ab" }), normalizeQuery("AB")), 3, "大小写不敏感");
  assert.equal(matchRank(p({ title: "ab" }), ""), 0, "空查询本身不是命中——「不过滤」是调用方的策略");
});
