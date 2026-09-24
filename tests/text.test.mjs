/**
 * 文本后处理单测（规格 §9.1）。
 *
 * 测试对象是**纯模块**：`src/host/text.ts`（stripBom / stripAiFiller / parseSummaryJson /
 * extractVariables）与 `src/host/refine.ts`（parseRefineResult）。
 * 二者不依赖 LLM、DB、文件系统或宿主，因此本文件永远不发网络请求。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const text = await import("../src/host/text.ts");
const refine = await import("../src/host/refine.ts");

// ─────────────────────────────────────────────────────────────────────────────
// stripBom / extractVariables
// ─────────────────────────────────────────────────────────────────────────────

test("stripBom：只剥掉开头的 BOM", () => {
  assert.equal(text.stripBom("\uFEFF你好"), "你好");
  assert.equal(text.stripBom("你好"), "你好");
  assert.equal(text.stripBom(""), "");
  assert.equal(text.stripBom("\uFEFF"), "");
});

test("extractVariables：抽出 {{变量}} 名字并去空", () => {
  assert.deepEqual(text.extractVariables("把 {{文本}} 翻成 {{ 目标语言 }}"), ["文本", "目标语言"]);
  assert.deepEqual(text.extractVariables("没有变量"), []);
  assert.deepEqual(text.extractVariables("{{  }}"), [], "全空白变量名必须被丢弃");
  assert.deepEqual(text.extractVariables("{{a}}{{a}}"), ["a", "a"], "本函数不去重（去重由调用方决定）");
});

// ─────────────────────────────────────────────────────────────────────────────
// stripAiFiller
// ─────────────────────────────────────────────────────────────────────────────

test("stripAiFiller：剥掉整体代码围栏（含带语言的围栏）", () => {
  assert.equal(text.stripAiFiller("```\n正文内容\n```"), "正文内容");
  assert.equal(text.stripAiFiller("```markdown\n正文内容\n```"), "正文内容");
  assert.equal(text.stripAiFiller("```json\n{}\n```"), "{}");
});

test("stripAiFiller：剥掉中英文开场套话", () => {
  assert.equal(text.stripAiFiller("好的，以下是优化后的提示词\n正文第一行"), "正文第一行");
  assert.equal(text.stripAiFiller("Sure, here is the polished version\nBody line"), "Body line");
  assert.equal(text.stripAiFiller("以下是优化后的结果\n正文"), "正文");
});

test("stripAiFiller：剥掉中英文收尾套话", () => {
  assert.equal(text.stripAiFiller("正文内容\n希望这对你有帮助"), "正文内容");
  assert.equal(text.stripAiFiller("正文内容\nLet me know if you need anything else"), "正文内容");
  assert.equal(text.stripAiFiller("正文内容\n谢谢"), "正文内容");
});

test("stripAiFiller：正文内部的围栏与空行绝不能被改动", () => {
  const body = "第一行\n\n```js\nconst a = 1;\n```\n\n最后一行";
  assert.equal(text.stripAiFiller(body), body, "内部围栏不是整体包裹，必须原样保留");
  const withBlank = "段落一\n\n\n段落二";
  assert.equal(text.stripAiFiller(withBlank), withBlank, "内部空行必须保留");
});

test("stripAiFiller：开场套话最多剥 6 行，不越界吃掉正文", () => {
  const lines = ["好的", "没问题", "收到", "可以", "以下是我的", "结果如下", "第七行是正文"];
  assert.equal(text.stripAiFiller(lines.join("\n")), "第七行是正文", "第 7 行必须保住（上限 6 行）");
});

test("stripAiFiller：空串/纯空白安全返回", () => {
  assert.equal(text.stripAiFiller(""), "");
  assert.equal(text.stripAiFiller("   \n  "), "");
});

/**
 * ⚠️ 已知局限（上游既有行为，本版按规格「搬运」保留，见 P3 计划风险 R-P3-7）：
 * 两个套话正则只有行首锚定、没有行尾锚定，因此正文**首行以「好的」开头**时，
 * 即使后面是正常内容也会被整行剥掉。此用例把该行为**显式钉住**，
 * 以便将来决定修它时（例如给正则补 `$` 锚定）能立刻看到行为变化。
 */
test("stripAiFiller（已知局限）：首行以套话词开头但其实是正文时会被误剥", () => {
  assert.equal(
    text.stripAiFiller("好的提示词应该包含明确的约束\n第二行"),
    "第二行",
    "上游行为即如此：行首命中即剥。若要改成不误剥，需给正则补行尾锚定并同步改本用例",
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// parseSummaryJson
// ─────────────────────────────────────────────────────────────────────────────

test("parseSummaryJson：解析 {summary}，容忍围栏与前后杂质", () => {
  assert.equal(text.parseSummaryJson('{"summary":"把长文压成三点"}'), "把长文压成三点");
  assert.equal(text.parseSummaryJson('```json\n{"summary":"摘要"}\n```'), "摘要");
  assert.equal(text.parseSummaryJson('好的，结果如下：{"summary":"摘要"} 希望有帮助'), "摘要");
  assert.equal(text.parseSummaryJson('{"summary":"  前后有空格  "}'), "前后有空格");
});

test("parseSummaryJson：非法输入一律返回 undefined（不得抛）", () => {
  assert.equal(text.parseSummaryJson(""), undefined);
  assert.equal(text.parseSummaryJson("没有任何 JSON"), undefined);
  assert.equal(text.parseSummaryJson("{坏 JSON}"), undefined);
  assert.equal(text.parseSummaryJson('{"other":"x"}'), undefined, "缺 summary 键 → undefined");
  assert.equal(text.parseSummaryJson('{"summary":""}'), undefined, "空摘要 → undefined");
  assert.equal(text.parseSummaryJson('{"summary":123}'), undefined, "非字符串摘要 → undefined");
});

// ─────────────────────────────────────────────────────────────────────────────
// parseRefineResult（refine.ts）
// ─────────────────────────────────────────────────────────────────────────────

test("parseRefineResult：解析四字段，标签归一为单个", () => {
  const out = refine.parseRefineResult(
    '{"title":"标题","tags":["甲","乙","丙"],"summary":"摘要","body":"正文"}',
  );
  assert.deepEqual(out, { title: "标题", tags: ["甲"], summary: "摘要", body: "正文" });
});

test("parseRefineResult：围栏与前后杂质可解析，字段按需 trim", () => {
  const out = refine.parseRefineResult('```json\n{ "title":" T ", "tags":[" x "], "summary":" s ", "body":" B " }\n```');
  assert.deepEqual(out, { title: "T", tags: ["x"], summary: "s", body: "B" });
  const noisy = refine.parseRefineResult('好的：{"body":"正文"} 完毕');
  assert.equal(noisy.body, "正文");
  assert.equal(noisy.title, "", "缺失字段回落空串");
  assert.deepEqual(noisy.tags, []);
});

test("parseRefineResult：正文缺失/为空 → undefined（调用方按失败处理）", () => {
  assert.equal(refine.parseRefineResult('{"title":"只有标题"}'), undefined);
  assert.equal(refine.parseRefineResult('{"body":"   "}'), undefined);
  assert.equal(refine.parseRefineResult('{"body":123}'), undefined);
});

test("parseRefineResult：非 JSON / 坏 JSON → undefined（不得抛）", () => {
  assert.equal(refine.parseRefineResult(""), undefined);
  assert.equal(refine.parseRefineResult("模型今天不想输出 JSON"), undefined);
  assert.equal(refine.parseRefineResult('{"body":"未闭合"'), undefined);
  assert.equal(refine.parseRefineResult("}{"), undefined);
});

test("parseRefineResult：正文里的 {{变量}} 必须原样保留", () => {
  const out = refine.parseRefineResult('{"body":"把 {{文本}} 翻成 {{目标语言}}"}');
  assert.equal(out.body, "把 {{文本}} 翻成 {{目标语言}}");
  assert.deepEqual(text.extractVariables(out.body), ["文本", "目标语言"]);
});
