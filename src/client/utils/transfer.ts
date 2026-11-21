import { IMPORT_REQUEST_OVERHEAD, MAX_REQUEST_BODY_BYTES } from "../../backup-transfer.ts";
import type { ImportStats } from "../../types.ts";
import { reasonOf } from "../../err-text.ts";
import { api } from "./api.ts";
import { notifyDataChanged } from "./data-sync.ts";
import { deletePrompts } from "./prompt-meta.ts";

/** 备份文件体积上限（5 MiB，字节）。与 `File.size` 同单位（字节，不是字符数）。 */
export const MAX_BACKUP_BYTES = MAX_REQUEST_BODY_BYTES;

export type BackupParse =
  | { ok: true; backup: unknown }
  | { ok: false; errorKey: "transfer.tooLarge" | "transfer.badJson"; detail: string };

function checkSize(byteLength: number): Extract<BackupParse, { ok: false }> | undefined {
  if (byteLength <= MAX_BACKUP_BYTES) return undefined;
  return {
    ok: false,
    errorKey: "transfer.tooLarge",
    detail: `${byteLength}/${MAX_BACKUP_BYTES}`,
  };
}

export async function readBackupFile(file: Pick<File, "size" | "text">): Promise<BackupParse> {
  return checkSize(file.size) ?? parseBackupFile(await file.text(), file.size);
}

/** 旧备份可含排版空白，请求按解析后的紧凑 JSON 计量。备份结构由宿主验证。 */
export function parseBackupFile(text: string, byteLength: number): BackupParse {
  const oversized = checkSize(byteLength);
  if (oversized) return oversized;
  let backup: unknown;
  try {
    backup = JSON.parse(text);
  } catch (err) {
    return { ok: false, errorKey: "transfer.badJson", detail: reasonOf(err) };
  }
  const bytes = new TextEncoder().encode(JSON.stringify(backup)).byteLength + IMPORT_REQUEST_OVERHEAD;
  return checkSize(bytes) ?? { ok: true, backup };
}

/** 已提交后的清理与通知不依赖面板是否还在；清理失败不反噬导入。 */
export async function confirmBackupImport(backup: unknown): Promise<
  { applied: true; stats?: ImportStats } | { applied: false; detail: string }
> {
  const result = await api.importBackup(backup, true);
  if (result.applied !== true) return { applied: false, detail: "applied=" + String(result.applied) };

  const ids = result.overwrittenIds;
  if (!Array.isArray(ids) || ids.length !== result.stats?.overwritten ||
    new Set(ids).size !== ids.length || !ids.every((id) => typeof id === "string" && id !== "")) {
    // Older hosts may confirm the import without a receipt. Do not guess which keys to delete.
    console.warn("[prompt-enhancer] 导入成功，但缺少有效的覆盖回执，未清理旧元数据");
  } else if (ids.length > 0) {
    // The import has already committed; only its associated metadata remains to be cleared.
    void deletePrompts({ ids, irreversible: true, remove: async () => {} }).catch((error: unknown) => {
      console.warn("[prompt-enhancer] 导入成功，但旧元数据清理未完成", error);
    });
  }
  notifyDataChanged();
  return { applied: true, stats: result.stats };
}
