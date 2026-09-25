/**
 * 导入文件的**客户端独有**两道闸（R14 修订版，T5）——除此外客户端不做任何信封校验。
 *
 * 为什么只有这两条：
 *   · **体积闸**（`byteLength > MAX_BACKUP_BYTES`）：超大文件不该先被读进内存再解析；
 *     这个上界只有客户端有（浏览器的 `File.size`），宿主拿不到。
 *   · **`JSON.parse` 失败分类**：解析器错误必须转成可读文案，而不是把 `SyntaxError` 抛给 UI。
 *
 * **不在这里做**（R14 修订版 / 约束 C）：`version` 是否为 1、`prompts` 是否为数组、元素是否缺
 * `id`/`body`——那是宿主 `src/host/store.ts#validateBackup` 的判定。客户端复制一份会形成
 * **第二处真源**、并随时间与宿主漂移。宿主拒绝时把它的报错**原文**显示出来即可。
 *
 * 纯模块（无 React、无 DOM、无 fetch）：`node --test` 直接删 import 源码即可测。
 */

import type { ImportResult } from "../../types.ts";

/** 备份文件体积上限（5 MiB，字节）。与 `File.size` 同单位（字节，不是字符数）。 */
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

/**
 * 两道闸的判定结果：
 *   · 放行 → `{ ok: true, backup }`，`backup` 就是 `JSON.parse` 的原样产物（不重塑、不校验）；
 *   · 拒绝 → `{ ok: false, errorKey, detail }`。`errorKey` 是 i18n 键（由渲染点翻译），
 *     `detail` **只承载纯数据**（体积闸给 `实际值/上限` 的字节数，解析闸给解析器原文）——
 *     不得写中文措辞：`detail` 会原样出现在面内，en 语言下就成了中英混排（A10）；
 *     一切措辞由 `errorKey` 对应的 i18n 键承担。
 */
export type BackupParse =
  | { ok: true; backup: unknown }
  | { ok: false; errorKey: "transfer.tooLarge" | "transfer.badJson"; detail: string };

/**
 * 只做两道闸：先体积、后解析（顺序不可换——超限文件不该被解析）。
 * `byteLength` 由调用方给 `file.size`（字节）；边界取 `>`，即**恰好等于上限放行**。
 */
export function parseBackupFile(text: string, byteLength: number): BackupParse {
  if (byteLength > MAX_BACKUP_BYTES) {
    return {
      ok: false,
      errorKey: "transfer.tooLarge",
      // 纯数据（实际值/上限），措辞在 i18n 的 transfer.tooLarge（A10）。
      detail: `${byteLength}/${MAX_BACKUP_BYTES}`,
    };
  }
  try {
    return { ok: true, backup: JSON.parse(text) };
  } catch (err) {
    return {
      ok: false,
      errorKey: "transfer.badJson",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 确认导入后的**回执分类**（A9 / R40，T5 评审轻微 5 的收口）。
 *
 * 为什么必须判 `applied`：宿主 `POST /import` 的成功信封有两种——`{ok:true, applied:false, stats}`
 * 是**预览**（只算了条数，没落库），`{ok:true, applied:true, stats}` 才是落库。只看 `ok`
 * （或只看「信封里有 data」）会把「宿主只回预览」渲染成「导入完成」= **静默假成功**。
 * 故成功判据只有一个：`applied === true`（严格相等：`"true"` / `1` 都不算）。
 *
 * 做成纯函数（无 React / 无 fetch / 不引宿主）是为了让这条防御能被 `node --test` 直接钉住——
 * 否则它只能靠活体验收证明自己存在，无法变异验证（T5 评审把这一点记为缺陷）。
 */
export type ImportVerdict = { ok: true } | { ok: false; errorKey: "manager.transfer.importFailed" };

/** 回执分类：`applied === true` 才算落库成功（见上文）。 */
export function classifyImportResult(result: ImportResult): ImportVerdict {
  return result.applied === true ? { ok: true } : { ok: false, errorKey: "manager.transfer.importFailed" };
}

/**
 * **导入覆盖后的方向/描述符失效**（B / 重要-2，跨入口漏洞的另一个入口）。
 *
 * 根因链（复审实测）：宿主 `store.importPrompts` 是 `INSERT OR REPLACE` ⇒ 备份里与现库**同 id** 的
 * 条目会被连 `body`/`sourceBody` 一起换掉；而备份格式**不含 meta**，导入也**不清 meta** ⇒
 * `readRefinedDirection` 只要 `sourceBody` 非空就采信那条旧记录 ⇒ **恢复旧备份后「原文／优化稿」
 * 标注自信地反相，且切换修不回来**（翻转的是那条本就错的记录）。同一根因的次生后果：备份里的
 * `skillName` 可能与 meta 里的旧 `descriptor.name` 不一致 ⇒ 徽标重导改指向。
 *
 * 故：**被本次导入覆盖的 id**（备份 ∩ 导入前的现库）清掉那两把 per-prompt 键
 * （`pl:refined-dir:<id>` / `pl:skill-descriptor:<id>`，键名与其清法归 `ai-flow.ts` 的既有入口）。
 * 语义：方向回到「不知道」⇒ 中性标注（不撒谎）；descriptor 回到「不知道」⇒ 徽标重导重走一次命名
 * （**这是正确的**：备份里的 `skillName` 才是权威，meta 里的旧 descriptor 不再可信）。
 *
 * **导入新 id（库里没有）⇒ 一把键都不清**（反面对照）：没有覆盖就没有失效。
 *
 * `existingIds` 必须是**导入前**读到的现库 id 集合——导入后再读就晚了（那时备份里的 id 全都存在，
 * 交集等于全部）。它对应宿主算 `stats.overwritten` 的**同一个集合**（`selectAllPrompts()` = 活跃
 * 提示词表；回收站是另一张表，同 id 落进活跃表时并不构成覆盖）。
 *
 * `clear` 由调用方注入（真实现 = `ai-flow.ts#deletePrompts` 的收尾编排）：本模块是纯模块
 * （无 React / 无 DOM / 无 fetch，见文件头），不 import HTTP 层。返回被清键的 id（供调用方与用例断言）；
 * 没有被覆盖者时**一个请求都不发**。
 */
export async function clearOverwrittenMeta(
  backup: unknown,
  existingIds: readonly string[],
  clear: (ids: readonly string[]) => Promise<unknown>,
): Promise<string[]> {
  const ids = backupPromptIds(backup);
  if (ids.length === 0 || existingIds.length === 0) return [];
  const existing = new Set(existingIds);
  const overwritten = ids.filter((id) => existing.has(id));
  if (overwritten.length === 0) return [];
  await clear(overwritten);
  return overwritten;
}

/**
 * 备份 payload 里的提示词 id（按出现次序去重）。**只读形状，不校验信封**——信封判定归宿主
 * `store.ts#validateBackup`（见文件头）：能走到这里说明宿主已经 `applied: true` 收下了它。
 *
 * 形状不认识时返回 `[]`（= 不清任何键，方向记录原样留着）并**可见地 warn**：这是契约漂移，
 * 而两种误判里「少清」只是残留（可再清），「多清」会毁掉一条本来正确、且用户无法重建的记录。
 */
function backupPromptIds(backup: unknown): string[] {
  if (typeof backup !== "object" || backup === null) {
    console.warn("[prompt-enhancer] 导入回执的备份不是对象（本次不清 per-prompt meta 键）");
    return [];
  }
  const raw = (backup as { prompts?: unknown }).prompts;
  if (!Array.isArray(raw)) {
    console.warn("[prompt-enhancer] 导入的备份里 prompts 不是数组（本次不清 per-prompt meta 键）");
    return [];
  }
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const id = (item as { id?: unknown }).id;
    if (typeof id === "string" && id !== "" && !out.includes(id)) out.push(id);
  }
  return out;
}
