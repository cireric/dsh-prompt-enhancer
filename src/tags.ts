/**
 * 标签的**零依赖单一真源**（审查 #7）：normalizeTagName / normalizeTags 原先只活在宿主 store.ts
 * 内部，而客户端标签输入框（PromptManagerModal）另写了一份同规则实现——两条规则（去空 + 保序去重）
 * 各写一遍，漂移是静默的：同一次输入在界面上与落库后可能得到不同的标签集。
 *
 * 这里把两条都收进来：宿主 store.ts 改成 import（其使用点一字不动），客户端只保留「文本 → 数组」的
 * 切分（半角/全角逗号），其余走同一份归一。
 *
 * **本模块零 import**：既能被 node --test 直接 import，也能进 esbuild 的客户端 bundle。
 */

/** 标签名的规范化：去首尾空白（空串表示「不算一个标签」）。 */
export function normalizeTagName(name: string): string {
  return name.trim();
}

/** 数组级归一：逐项去空白、丢空项、**保序**去重。 */
export function normalizeTags(tags: readonly string[] | undefined): string[] {
  if (!tags) return [];
  const out: string[] = [];
  for (const raw of tags) {
    const name = normalizeTagName(raw);
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

/** 半角与全角逗号都算分隔符（中文输入法下用户敲的就是全角）。 */
const TAG_SEPARATORS = /[,，]/;

/** 文本输入 → 标签数组：按逗号切分，其余一律交给 normalizeTags（同一条归一规则）。 */
export function parseTagList(text: string): string[] {
  return normalizeTags(text.split(TAG_SEPARATORS));
}
