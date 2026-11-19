import { firstNonEmptyLine } from "../../first-line.ts";
import { parseTagList } from "../../tags.ts";
import { readTemplateVariables } from "../../template-variables.ts";
import { clampTitle, type Prompt, type PromptInput, type PromptWritablePatch, type TemplateVariable } from "../../types.ts";
import { parseVariables } from "./template.ts";

interface EditorFields {
  title: string;
  body: string;
  tagsText: string;
  summary: string;
  variables: TemplateVariable[];
}

export function promptFormInput(fields: EditorFields, sourceBody = ""): PromptInput {
  const names = new Set([...parseVariables(fields.body), ...parseVariables(sourceBody)]);
  return {
    title: clampTitle(fields.title.trim() || firstNonEmptyLine(fields.body)),
    body: fields.body,
    tags: parseTagList(fields.tagsText),
    summary: fields.summary.trim(),
    variables: readTemplateVariables(fields.variables.filter(({ name }) => names.has(name))) ?? [],
  };
}

export function changedPromptFields(prompt: Prompt, fields: EditorFields): PromptWritablePatch {
  const input = promptFormInput(fields, prompt.sourceBody);
  const patch: PromptWritablePatch = {};
  if (fields.title !== prompt.title && input.title !== prompt.title) patch.title = input.title;
  if (fields.body !== prompt.body) patch.body = input.body;
  if (fields.tagsText !== prompt.tags.join(", ") &&
      JSON.stringify(input.tags) !== JSON.stringify(prompt.tags)) patch.tags = input.tags;
  if (fields.summary !== (prompt.summary ?? "") && input.summary !== (prompt.summary ?? "")) patch.summary = input.summary;

  const storedVariables = JSON.stringify(prompt.variables ?? []);
  if ((patch.body !== undefined || JSON.stringify(fields.variables) !== storedVariables) &&
      JSON.stringify(input.variables) !== storedVariables) patch.variables = input.variables;
  return patch;
}
