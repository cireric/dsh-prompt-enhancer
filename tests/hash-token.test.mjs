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

// ─────────────────────────────────────────────────────────────────────────────
// R48：`#` 浮层的显示判定（「静默抑制」类缺陷的回归锁）
//
// 缺陷本体：收起态在令牌消失时没被复位 → 「收起 → 删光令牌 → 在同一起点重打同一查询词」会拿到
// 完全相同的 tokenKey，浮层被**永久静默**压住（再多敲一个字符才恢复）。判定与复位都在本模块
// （纯函数），所以能在这里逐条钉住；组件只消费（厚判定在纯模块、薄 DOM 在组件）。
// ─────────────────────────────────────────────────────────────────────────────

/** 组件侧用的令牌身份（与 HashSuggestOverlay 同构：start + query）。 */
const tokenKeyOf = (draft) => {
  const token = h.readHashToken(draft);
  return token === null ? null : `${token.start}:${token.query}`;
};

test("R48 ① 令牌消失后同一 tokenKey 重现：收起态必须已复位，浮层必须显示（缺陷本体）", () => {
  const token = h.readHashToken("#周报");
  const key = `${token.start}:${token.query}`;
  assert.equal(key, "0:周报", "前提：令牌身份 = 起点 + 查询词");
  assert.equal(
    h.shouldShowSuggest({ open: true, tokenKey: key, dismissedKey: key }),
    false,
    "前提：同一令牌被点外部收起后不显示",
  );

  // 令牌消失（草稿里不再有 # 令牌）→ 收起态必须复位
  const afterTokenGone = h.nextDismissedKey(false, key);
  assert.equal(afterTokenGone, null, "令牌消失时必须清空收起态（去掉这一句 → 本用例必红）");

  assert.equal(
    h.shouldShowSuggest({ open: true, tokenKey: key, dismissedKey: afterTokenGone }),
    true,
    "在同一起点重打同一查询词（tokenKey 完全相同）必须重新显示——修复前这里恒为 false，即静默抑制",
  );
});

test("R48 ② 被收起且令牌未变：不显示；令牌仍在时收起态粘住（不自弹回）", () => {
  const dismissed = h.nextDismissedKey(true, "0:周报");
  assert.equal(dismissed, "0:周报", "令牌仍在 → 收起态保持（令牌变化才算新的一次打开）");
  assert.equal(h.shouldShowSuggest({ open: true, tokenKey: "0:周报", dismissedKey: dismissed }), false);
  assert.equal(
    h.shouldShowSuggest({ open: true, tokenKey: "0:周报", dismissedKey: dismissed }),
    false,
    "同一输入重复判定必须稳定（不是随机/时序相关）",
  );
});

test("R48 ③ 令牌变化（查询词或起点）：显示", () => {
  const dismissed = h.nextDismissedKey(true, "0:周报");
  assert.equal(
    h.shouldShowSuggest({ open: true, tokenKey: "0:周", dismissedKey: dismissed }),
    true,
    "退回查询词 = 一次新的打开",
  );
  assert.equal(
    h.shouldShowSuggest({ open: true, tokenKey: "3:周报", dismissedKey: dismissed }),
    true,
    "令牌位移 = 一次新的打开",
  );
});

test("R48 ④ 没有令牌时恒不显示（open 为假 / tokenKey 为 null），复位幂等", () => {
  assert.equal(h.shouldShowSuggest({ open: false, tokenKey: null, dismissedKey: null }), false);
  assert.equal(
    h.shouldShowSuggest({ open: true, tokenKey: null, dismissedKey: null }),
    false,
    "两个输入自相矛盾时保守取「不显示」",
  );
  assert.equal(h.nextDismissedKey(false, null), null, "本就无收起态 → 复位仍是 null（幂等，不制造假变更）");
});

test("R48 ⑤ 复刻交互序列：显示 → 收起 → 删光令牌 → 重打同一令牌 → 必须再显示", () => {
  let dismissedKey = null;
  let draft = "#周报";
  assert.equal(
    h.shouldShowSuggest({ open: true, tokenKey: tokenKeyOf(draft), dismissedKey }),
    true,
    "① 敲出令牌 → 显示",
  );
  dismissedKey = tokenKeyOf(draft); // 点浮层外部 → 收起
  assert.equal(
    h.shouldShowSuggest({ open: true, tokenKey: tokenKeyOf(draft), dismissedKey }),
    false,
    "② 收起后不显示",
  );
  draft = ""; // 删光令牌：组件在 open===false 的那一拍调用复位
  dismissedKey = h.nextDismissedKey(tokenKeyOf(draft) !== null, dismissedKey);
  assert.equal(dismissedKey, null, "③ 令牌消失 → 收起态复位（组件调用点：HashSuggestOverlay 的 open 效果）");
  draft = "#周报"; // 在同一起点重打同一查询词
  assert.equal(
    h.shouldShowSuggest({ open: true, tokenKey: tokenKeyOf(draft), dismissedKey }),
    true,
    "④ 必须重新显示——这就是本缺陷的现场（修复前静默不再出现）",
  );
});
