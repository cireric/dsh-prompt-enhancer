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

/** 备份文件体积上限（5 MiB，字节）。与 `File.size` 同单位（字节，不是字符数）。 */
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

/**
 * 两道闸的判定结果：
 *   · 放行 → `{ ok: true, backup }`，`backup` 就是 `JSON.parse` 的原样产物（不重塑、不校验）；
 *   · 拒绝 → `{ ok: false, errorKey, detail }`。`errorKey` 是 i18n 键（由渲染点翻译），
 *     `detail` 给人看的**补充事实**（体积闸给实际值与上限，解析闸给解析器原文）。
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
      detail: `文件 ${byteLength} 字节，超过上限 ${MAX_BACKUP_BYTES} 字节`,
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
