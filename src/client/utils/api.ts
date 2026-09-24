import type { PluginSettings, Prompt, PromptSort } from "../../types.ts";

const PREFIX = "/api/prompt-enhancer";

/** 响应信封（规格 §5）：客户端以 data === undefined 判失败。 */
interface Envelope<T> { ok: boolean; data?: T; error?: string }

/** 失败一律抛出带可读原因的 Error——调用方 catch 后出 toast（不得静默吞掉）。 */
async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(PREFIX + path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let parsed: Envelope<T>;
  try {
    parsed = (await res.json()) as Envelope<T>;
  } catch (e) {
    throw new Error(`响应不是合法 JSON（HTTP ${res.status}）：${String(e)}`);
  }
  if (parsed.data === undefined) {
    throw new Error(parsed.error ?? `请求失败（HTTP ${res.status}）`);
  }
  return parsed.data;
}

export const api = {
  listPrompts: (opts: { q?: string; tag?: string; sort?: PromptSort } = {}) => {
    const qs = new URLSearchParams();
    if (opts.q) qs.set("q", opts.q);
    if (opts.tag) qs.set("tag", opts.tag);
    if (opts.sort) qs.set("sort", opts.sort);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return call<Prompt[]>("GET", `/prompts${suffix}`);
  },
  recordUsage: (id: string) => call<Prompt>("POST", `/prompts/${encodeURIComponent(id)}/use`),
  getSettings: () => call<PluginSettings>("GET", "/settings"),
  getMeta: (key: string) => call<{ key: string; value: string }>("GET", `/meta/${encodeURIComponent(key)}`).then((r) => r.value),
  setMeta: (key: string, value: string) =>
    call<{ key: string; value: string }>("PUT", `/meta/${encodeURIComponent(key)}`, { value }),
};
