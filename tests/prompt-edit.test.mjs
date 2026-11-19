import assert from "node:assert/strict";
import { test } from "node:test";
import { changedPromptFields } from "../src/client/utils/prompt-edit.ts";

const prior = {
  title: "",
  body: "Run {{target}}",
  tags: ["tag, with comma"],
  summary: " old summary ",
  sourceBody: "Run {{original}}",
  variables: [{ name: "target", defaultValue: "test" }, { name: "original", description: "Retain for rollback" }],
};

const fields = {
  title: prior.title,
  body: prior.body,
  tagsText: prior.tags.join(", "),
  summary: prior.summary,
  variables: prior.variables,
};

test("editing a title sends only that field, preserving stored legacy formatting", () => {
  assert.deepEqual(changedPromptFields(prior, fields), {});
  assert.deepEqual(changedPromptFields(prior, { ...fields, title: "New title" }), { title: "New title" });
});

test("editing the body retains variables in the other stored version", () => {
  assert.deepEqual(changedPromptFields(prior, { ...fields, body: "No variable" }), {
    body: "No variable",
    variables: [prior.variables[1]],
  });
});
