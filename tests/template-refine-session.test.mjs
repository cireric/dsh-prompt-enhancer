import assert from "node:assert/strict";
import test from "node:test";
import { createTemplateRefinement, deriveTemplateRefinement, editTemplateRefinement } from "../src/client/utils/template-refine-session.ts";
import { requestComposerApplication } from "../src/client/utils/composer-application.ts";
import { fillTemplate, initialTemplateValues } from "../src/client/utils/template.ts";

const original = "原文 {{范围}} {{旧变量}}";
const result = {
  title: "模板", summary: "摘要", tags: ["模板"],
  body: "检查 {{ 范围 }} 和 {{旧变量}}。 \n",
  suggestions: ["再用 {{格式}}。", "不要加这条。", "补充 {{示例}}。"],
};

const edit = (session, ...edits) => edits.reduce(editTemplateRefinement, session);

test("只合成勾选建议，按建议列表顺序保留预览字符及标记", () => {
  let session = createTemplateRefinement(original, result);
  assert.equal(deriveTemplateRefinement(session).body, "检查 {{ 范围 }} 和 {{旧变量}}。 \n");
  session = edit(session, { type: "body", body: "复核 {{ 范围 }} 和 {{目标}}。 \n" },
    { type: "suggestion", index: 2, checked: true }, { type: "suggestion", index: 0, checked: true },
    { type: "view", view: "original" });
  const final = deriveTemplateRefinement(session);
  assert.equal(session.original, original);
  assert.equal(final.body, "复核 {{ 范围 }} 和 {{目标}}。\n\n再用 {{格式}}。\n\n补充 {{示例}}。");
  const sectionText = ({ fragments }) => fragments.map(({ text }) => text).join("");
  assert.equal(final.sections.map(sectionText).join(""), final.body);
  assert.deepEqual(final.sections.filter(({ addition }) => addition).map(sectionText), ["\n\n再用 {{格式}}。", "\n\n补充 {{示例}}。"]);
  assert.deepEqual(final.sections.flatMap(({ fragments }) => fragments.filter(({ added }) => added).map(({ text, name }) => [text, name])),
    [["{{目标}}", "目标"], ["{{格式}}", "格式"], ["{{示例}}", "示例"]]);
  assert.deepEqual(final.missing, ["旧变量"]);
  assert.equal(deriveTemplateRefinement(edit(session, { type: "suggestion", index: 2, checked: false })).body,
    "复核 {{ 范围 }} 和 {{目标}}。\n\n再用 {{格式}}。");
});

test("删除或新增占位符后，有效变量配置跟随最终模板", () => {
  const session = edit(createTemplateRefinement(original, result),
    { type: "variable", name: "旧变量", field: "defaultValue", value: "旧默认值" },
    { type: "body", body: "检查 {{范围}}" },
    { type: "suggestion", index: 0, checked: true },
    { type: "variable", name: "格式", field: "description", value: "输出格式" },
    { type: "variable", name: "格式", field: "defaultValue", value: "文本" });
  const final = deriveTemplateRefinement(session);
  assert.deepEqual(final.names, ["范围", "格式"]);
  assert.deepEqual(final.variables, [{ name: "格式", description: "输出格式", defaultValue: "文本" }]);
  const withoutSuggestion = deriveTemplateRefinement(edit(session, { type: "suggestion", index: 0, checked: false }));
  assert.deepEqual(withoutSuggestion.names, ["范围"]);
  assert.deepEqual(withoutSuggestion.variables, []);
});

test("试填采用当前默认值并保留未填项，不替换最终模板或默认值", () => {
  const session = edit(createTemplateRefinement(original, result),
    { type: "body", body: "检查 {{范围}}，输出 {{格式}}，采用 {{示例}}。" },
    { type: "variable", name: "范围", field: "defaultValue", value: "src" },
    { type: "variable", name: "格式", field: "defaultValue", value: "文本" });
  const { body, variables } = deriveTemplateRefinement(session);
  const defaults = initialTemplateValues(body, variables);
  assert.deepEqual(defaults, { 范围: "src", 格式: "文本" });
  assert.equal(fillTemplate(body, { ...defaults, 范围: "tests" }), "检查 tests，输出 文本，采用 {{示例}}。");
  const final = deriveTemplateRefinement(session);
  assert.equal(final.body, "检查 {{范围}}，输出 {{格式}}，采用 {{示例}}。");
  assert.deepEqual(final.variables, [{ name: "范围", defaultValue: "src" }, { name: "格式", defaultValue: "文本" }]);
});

test("最终模板的可用性与试填模式取决于合成后的正文", () => {
  const session = edit(createTemplateRefinement(original, result), { type: "body", body: " \n " });
  assert.equal(deriveTemplateRefinement(session).canUse, false);
  const attempt = (text) => requestComposerApplication({ kind: "template", original }, original, { kind: "try", text });
  const plain = deriveTemplateRefinement(edit(session, { type: "body", body: "纯文本" }));
  assert.equal(plain.canUse, true);
  assert.deepEqual(attempt(plain.body), { kind: "apply", text: "纯文本" });
  const template = deriveTemplateRefinement(edit(session, { type: "suggestion", index: 0, checked: true }));
  assert.equal(template.canUse, true);
  assert.deepEqual(attempt(template.body), { kind: "fill" });
});

test("直接增强以原文快照保护覆盖，拒绝哪怕只增加空白的 Composer", () => {
  const session = edit(createTemplateRefinement(original, result), { type: "body", body: "编辑稿" });
  const source = { kind: "template", original: session.original };
  const attempt = (current) => requestComposerApplication(source, current, { kind: "try", text: deriveTemplateRefinement(session).body });
  assert.deepEqual(attempt(original), { kind: "apply", text: "编辑稿" });
  assert.deepEqual(attempt(original + " "), { kind: "blocked" });
  assert.deepEqual(attempt("编辑稿"), { kind: "blocked" });
});
