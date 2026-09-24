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
