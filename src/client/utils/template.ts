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

/**
 * 容错读取变量记忆：空值即「没有记忆」，非法 JSON 按空对象并留 console 痕迹。
 *
 * 下移自 `TemplateVariablesDialog`（P5 任务 4）：只搬位置，行为与文案逐字不变，
 * 目的是让这条容错链能被单测钉住（`tests/template.test.mjs`）。
 */
export function parseMemory(raw: string): Record<string, string> {
  if (raw.trim() === "") return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string") out[name] = value;
    }
    return out;
  } catch (err) {
    console.warn("[prompt-enhancer] " + memoryKey + " 不是合法 JSON，本次按无记忆处理", err);
    return {};
  }
}

export function pickRemembered(body: string, memory: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of parseVariables(body)) {
    const value = memory[name];
    if (typeof value === "string" && value !== "") out[name] = value;
  }
  return out;
}
