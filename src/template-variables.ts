import type { TemplateVariable } from "./types.ts";

/** Validate an optional array from an HTTP request, a backup or SQLite. */
export function readTemplateVariables(input: unknown): TemplateVariable[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const variables: TemplateVariable[] = [];
  const names = new Set<string>();
  for (const entry of input) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return undefined;
    const { name, description, defaultValue } = entry as Record<string, unknown>;
    if (typeof name !== "string" || !name.trim() || names.has(name.trim())) return undefined;
    if (description !== undefined && typeof description !== "string") return undefined;
    if (defaultValue !== undefined && typeof defaultValue !== "string") return undefined;
    names.add(name.trim());
    if (description?.trim() || defaultValue?.trim()) {
      variables.push({
        name: name.trim(),
        ...(description?.trim() ? { description: description.trim() } : {}),
        ...(defaultValue?.trim() ? { defaultValue } : {}),
      });
    }
  }
  return variables;
}
