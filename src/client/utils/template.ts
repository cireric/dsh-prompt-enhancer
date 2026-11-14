import type { TemplateVariable } from "../../types.ts";

/** 语义与 host 侧 `text.ts#extractVariables` 一致：trim 去空、保序；此处额外去重。 */
export function parseVariables(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
    const name = m[1]!.trim();
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

function templateValue(values: Record<string, string>, name: string): string | undefined {
  const value = Object.hasOwn(values, name) ? values[name] : undefined;
  return value?.trim() ? value : undefined;
}

export function unfilledVariables(names: readonly string[], values: Record<string, string>): string[] {
  return names.filter((name) => templateValue(values, name) === undefined);
}

export function fillTemplate(body: string, values: Record<string, string>): string {
  return body.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (whole, raw: string) => {
    return templateValue(values, raw.trim()) ?? whole;
  });
}

export function needsValues(body: string): boolean {
  return parseVariables(body).length > 0;
}

export function templateMemoryKey(promptId: string): string {
  return `pl:template-var-memory:${promptId}`;
}

/** Read only string values from stored template memory. */
export function parseMemory(raw: string): Record<string, string> {
  if (raw.trim() === "") return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === "string"));
  } catch (err) {
    console.warn("[prompt-enhancer] 模板变量记忆不是合法 JSON", err);
    return {};
  }
}

export function pickRemembered(body: string, memory: Record<string, string>): Record<string, string> {
  return Object.fromEntries(parseVariables(body).flatMap((name) => {
    const value = templateValue(memory, name);
    return value === undefined ? [] : [[name, value]];
  }));
}

/** Only defaults of variables present in the displayed body are prefilled. */
export function initialTemplateValues(
  body: string,
  variables: readonly TemplateVariable[],
): Record<string, string> {
  const configured = new Map(variables.map((variable) => [variable.name, variable]));
  const entries: Array<[string, string]> = [];
  for (const name of parseVariables(body)) {
    const value = configured.get(name)?.defaultValue;
    if (value !== undefined) entries.push([name, value]);
  }
  return Object.fromEntries(entries);
}


export function updateTemplateVariable(
  variables: readonly TemplateVariable[],
  name: string,
  field: "description" | "defaultValue",
  value: string,
): TemplateVariable[] {
  return [
    ...variables.filter((item) => item.name !== name),
    { ...variables.find((item) => item.name === name), name, [field]: value },
  ];
}
