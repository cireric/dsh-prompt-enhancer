import type { TemplateVariable } from "../../types.ts";
import type { AiRefineResult } from "./api.ts";
import { markAddedVariables, missingVariables, refinedBodySections } from "./ai-flow.ts";
import { parseVariables, updateTemplateVariable } from "./template.ts";

type TemplateView = "final" | "edit" | "original";

export type TemplateRefineSession = {
  original: string;
  metadata: Pick<AiRefineResult, "title" | "tags" | "summary">;
  baseBody: string;
  suggestions: readonly string[];
  selected: readonly number[];
  variables: readonly TemplateVariable[];
  view: TemplateView;
};

export type TemplateRefineEdit =
  | { type: "view"; view: TemplateView }
  | { type: "body"; body: string }
  | { type: "suggestion"; index: number; checked: boolean }
  | { type: "variable"; name: string; field: "description" | "defaultValue"; value: string };

export function createTemplateRefinement(
  original: string, { title, tags, summary, body, suggestions = [] }: AiRefineResult,
): TemplateRefineSession {
  return { original, metadata: { title, tags, summary }, baseBody: body, suggestions, selected: [], variables: [], view: "final" };
}

export function editTemplateRefinement(session: TemplateRefineSession, edit: TemplateRefineEdit): TemplateRefineSession {
  switch (edit.type) {
    case "view": return { ...session, view: edit.view };
    case "body": return { ...session, baseBody: edit.body };
    case "suggestion": {
      if (session.selected.includes(edit.index) === edit.checked) return session;
      const selected = edit.checked ? [...session.selected, edit.index] : session.selected.filter((index) => index !== edit.index);
      return { ...session, selected };
    }
    case "variable": return { ...session, variables: updateTemplateVariable(session.variables, edit.name, edit.field, edit.value) };
  }
}

export function deriveTemplateRefinement(session: TemplateRefineSession) {
  const parts = refinedBodySections(session.baseBody, session.suggestions, session.selected);
  const body = parts.map(({ text }) => text).join("");
  const names = parseVariables(body);
  return {
    body,
    names,
    canUse: body.trim() !== "",
    needsFill: names.length > 0,
    sections: parts.map(({ text, addition }) => ({ addition, fragments: markAddedVariables(text, session.original) })),
    missing: missingVariables(session.original, body),
    variables: session.variables.filter(({ name }) => names.includes(name)),
  };
}

export type FinalTemplate = ReturnType<typeof deriveTemplateRefinement>;

/** Direct enhancement uses the source snapshot, not the editable or filled text. */
export function canApplyTemplateRefinement(session: TemplateRefineSession, composer: string): boolean {
  return composer === session.original;
}
