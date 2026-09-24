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

test("stripAiFiller：短的收尾寒暄会被剥掉；较长的收尾句保留（刻意的安全侧残噪）", () => {
  assert.equal(text.stripAiFiller("正文内容\n谢谢"), "正文内容");
  assert.equal(text.stripAiFiller("正文内容\nThanks"), "正文内容");
  assert.equal(text.stripAiFiller("正文内容\n谢谢"), "正文内容");
  // C′ 的已知取舍：无元话语收尾信号、且不短的收尾句**不剥**。
  // 代价是留一行可见噪音（用户能删），换取「绝不静默丢正文」——这是刻意选择，不是遗漏。
  assert.equal(text.stripAiFiller("正文内容\n希望这对你有帮助"), "正文内容\n希望这对你有帮助");
  assert.equal(
    text.stripAiFiller("正文内容\nLet me know if you need anything else"),
    "正文内容\nLet me know if you need anything else",
  );
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
 * C′ 判据的回归网（两组夹具，逐条钉住行为）。
 *
 * 判据 = 行首命中套话模式 **且**（行尾是元话语信号 **或** 该行很短）。
 * 上游只有「行首命中」一个条件，于是 F 组全剥（8/8）但 C 组全灭（0/7，静默丢正文）；
 * 本判据 7/8 剥对真套话、7/7 保留正文——把失败赶到「可见残噪」那一侧。
 */
const FILLER_LINES = [
  "好的，以下是优化后的提示词：",
  "好的",
  "以下是优化后的结果：",
  "Here is the optimized prompt:",
  "Sure, here is the polished version:",
  "谢谢",
  "以下是整理后的正文",
  "希望这对你有帮助", // ← 已知漏剥（无元话语收尾且超过 6 字），见下方断言
];

const CONTENT_LINES = [
  "好的提示词应该包含明确的约束",
  "可以这样理解：把任务拆成三步",
  "谢谢配合，请按上述 JSON 格式输出",
  "如果有任何疑问，请查阅随附文档",
  "需要说明的是，输出必须是 JSON",
  "希望工程能在本季度上线",
  "以下是本文的三个要点，请逐条核对",
];

test("stripAiFiller：真套话行应被剥掉（7/8，唯一例外是已知漏剥）", () => {
  for (const line of FILLER_LINES) {
    const got = text.stripAiFiller(`${line}\n正文第一行`);
    if (line === "希望这对你有帮助") {
      assert.equal(got, `${line}\n正文第一行`, "已知漏剥：留在安全侧（可见噪音）优于冒险误剥正文");
    } else {
      assert.equal(got, "正文第一行", `「${line}」应被剥掉`);
    }
  }
});

test("stripAiFiller：正文行必须一行不剥（7/7，即使首行以套话词开头）", () => {
  for (const line of CONTENT_LINES) {
    assert.equal(
      text.stripAiFiller(`${line}\n第二行正文`),
      `${line}\n第二行正文`,
      `「${line}」是正文，被剥掉就是静默丢内容`,
    );
  }
});

test("stripAiFillerDetailed：回报被剥掉的行，供诊断日志留痕", () => {
  const detail = text.stripAiFillerDetailed("好的，以下是优化后的提示词：\n正文\n谢谢");
  assert.equal(detail.text, "正文");
  assert.deepEqual(detail.stripped, ["好的，以下是优化后的提示词：", "谢谢"], "被剥的行必须原样回报");

  const fenced = text.stripAiFillerDetailed("```\n正文\n```");
  assert.equal(fenced.text, "正文");
  assert.deepEqual(fenced.stripped, ["（整体代码围栏已剥离）"]);

  assert.deepEqual(text.stripAiFillerDetailed("").stripped, []);
  assert.deepEqual(text.stripAiFillerDetailed("正文").stripped, [], "没剥任何东西时明细必须为空");
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
