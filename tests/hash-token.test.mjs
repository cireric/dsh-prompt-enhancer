import { test } from "node:test";
import assert from "node:assert/strict";
const h = await import("../src/client/utils/hash-token.ts");

test("readHashToken：只认草稿末尾的 #令牌（无 caret 可用，这是 D2 的约定）", () => {
  assert.deepEqual(h.readHashToken("帮我 #周报"), { query: "周报", start: 3 });
  assert.deepEqual(h.readHashToken("#"), { query: "", start: 0 });
  assert.deepEqual(h.readHashToken("前文 #a b"), null, "令牌后有空格即视为已结束");
  assert.equal(h.readHashToken("没有井号"), null);
  assert.equal(h.readHashToken("邮件 a#b"), null, "井号紧贴字母不算触发（避免撞 #tag 之类）");
  assert.deepEqual(h.readHashToken("换行\n#翻"), { query: "翻", start: 3 });
});

test("replaceHashToken：用正文替换尾令牌，保留令牌之前的文本", () => {
  assert.equal(h.replaceHashToken("帮我 #周报", "生成周报"), "帮我 生成周报");
  assert.equal(h.replaceHashToken("#周", "生成周报"), "生成周报");
});

test("replaceHashToken：草稿里没有令牌时原样返回（不得吞掉/改写正文）", () => {
  assert.equal(h.replaceHashToken("没有令牌", "正文"), "没有令牌");
  assert.equal(h.replaceHashToken("", "正文"), "");
});

test("filterPrompts：标题/标签/正文子串匹配，标题命中优先，limit 生效", () => {
  const p = (id, title, body, tags) => ({ id, title, body, tags });
  // 低优先级命中（p2：标签+正文）故意排在标题命中（p1）之前：只有真正的打分优先级
  // 才能把它顶到前面，扁平化/倒置优先级/只按正文匹配/删掉 sort 都会退化为输入顺序 ["2","1"]。
  const list = [p("2", "翻译", "写周报的英文版", ["周报"]), p("1", "周报生成", "写周报", []), p("3", "无关", "无关", [])];
  assert.deepEqual(h.filterPrompts(list, "周报").map(x => x.id), ["1", "2"], "标题命中排前，标签/正文命中在后");
  assert.deepEqual(h.filterPrompts(list, "周报", 1).map(x => x.id), ["1"], "limit 生效：截断发生在排序之后");
  assert.equal(h.filterPrompts(list, "").length, 3, "空查询返回全部（截到 limit）");
  assert.deepEqual(h.filterPrompts(list, "不存在的词"), []);
});

test("filterPrompts：标签命中优先于正文命中（title > tags > body 契约的中段）", () => {
  const p = (id, title, body, tags) => ({ id, title, body, tags });
  // 正文命中(b) 故意排在标签命中(t) 之前；只有「标签 2 > 正文 1」才能把 t 顶到前面。
  const list = [p("b", "翻译", "写周报", []), p("t", "翻译", "无关", ["周报"])];
  assert.deepEqual(h.filterPrompts(list, "周报").map(x => x.id), ["t", "b"], "标签命中排前，正文命中在后");
});
