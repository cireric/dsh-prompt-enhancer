/** 语义与 host 侧 `text.ts#extractVariables` 一致：trim 去空、保序；此处额外去重。 */
export function parseVariables(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
    const name = m[1]!.trim();
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

export function fillTemplate(body: string, values: Record<string, string>): string {
  return body.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (whole, raw: string) => {
    const name = raw.trim();
    const value = values[name];
    return value !== undefined && value !== "" ? value : whole;
  });
}

export function needsValues(body: string): boolean {
  return parseVariables(body).length > 0;
}

/** 模板变量记忆的 meta 键（与上游客户端一致）。 */
export const memoryKey = "pl:template-var-memory";

export function pickRemembered(body: string, memory: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of parseVariables(body)) {
    const value = memory[name];
    if (typeof value === "string" && value !== "") out[name] = value;
  }
  return out;
}
