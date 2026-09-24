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

test("filterPrompts：标题/标签/正文子串匹配，标题命中优先，limit 生效", () => {
  const p = (id, title, body, tags) => ({ id, title, body, tags });
  const list = [p("1", "周报生成", "写周报", []), p("2", "翻译", "写周报的英文版", ["周报"]), p("3", "无关", "无关", [])];
  assert.deepEqual(h.filterPrompts(list, "周报").map(x => x.id), ["1", "2"], "标题命中排前，正文命中在后");
  assert.deepEqual(h.filterPrompts(list, "周报", 1).map(x => x.id), ["1"]);
  assert.equal(h.filterPrompts(list, "").length, 3, "空查询返回全部（截到 limit）");
  assert.deepEqual(h.filterPrompts(list, "不存在的词"), []);
});
