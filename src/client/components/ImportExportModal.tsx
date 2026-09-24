/**
 * 导入导出页（T5 填 T2 的外壳；D5 / 规格 §4.3 / 验收 10）。
 *
 * 两条链路都只走**已封装的官方能力**，不新增 `/fs/*` 路由、不自建目录浏览器、不移植上游
 * `DirectoryPickerModal`（429 行，D5 明确禁止）：
 *
 *   · **导出**：`isDirectoryPickerAvailable()` 预检——不可用时按钮禁用 + 可读原因（不静默）
 *     → `pickExportDirectory()`（T1 持有的 `ctx.uiWorkspace.pickDirectory`）
 *     → 返回 `null`（用户取消）**静默**回到面板（不是错误）→ `api.exportBackup(dir)`
 *     （文件名由宿主生成，客户端不能指定）→ 显示宿主返回的 `path` 与条数；失败行内红色原文。
 *
 *   · **导入**：**React 渲染**的隐藏 `<input type="file">`（不是 `document.createElement` +
 *     `appendChild` 那种 DOM 注入）→ `file.text()` → `parseBackupFile`（客户端独有的两道闸：
 *     体积 / JSON 解析，见 utils/transfer.ts）→ `api.importBackup(backup, false)` 取**宿主**预览
 *     → 展示 `{added, overwritten, total}` + 一行「同 id 覆盖且不可撤销」→ 确认按钮
 *     → `api.importBackup(backup, true)` → `notifyDataChanged()`。
 *
 * **信封校验一律委托宿主**：`version !== 1` / `prompts` 非数组 / 元素缺 `id`|`body` 都由宿主
 * `store.ts#validateBackup` 判，客户端**不复制**一份（第二处真源会漂移）；宿主 400 时把它返回的
 * **原文**显示出来即可。
 *
 * **P6-4(a)（用户裁定）**：导入**不触发淘汰**——淘汰是物理删除且无回收站，导入后自动删掉用户刚
 * 导入的数据不可接受。故这里只读一次「当前总数 / 上限」并**显式提示**（约束 D3），绝不走淘汰路径。
 *
 * 副作用面只有两处：`api.*`（HTTP）与 `notifyDataChanged()`（D6 同进程数据同步）。零 DOM 注入。
 */
import * as React from "react";
import type { ImportStats } from "../../types.ts";
import { api } from "../utils/api.ts";
import { notifyDataChanged } from "../utils/data-sync.ts";
import { actions, button, errorDetail, errorText, muted, primaryButton, toolbar } from "../utils/dialog-style.ts";
import type { PromptEnhancerKey } from "../utils/i18n.ts";
import { parseBackupFile } from "../utils/transfer.ts";
import { isDirectoryPickerAvailable, pickExportDirectory } from "../utils/workspace-dir.ts";
import type { ManagerTranslate } from "./PromptManagerModal.tsx";

export interface ImportExportModalProps {
  /** 宿主的命名空间翻译函数（由 PromptManagerModal 透传）。 */
  t: ManagerTranslate;
}

/** 搬运动作（导出 / 读文件 / 落库）互斥：任一在途时其它按钮一律禁用。 */
type Busy = "idle" | "exporting" | "reading" | "applying";

/** 失败原因给人看的那一行：ApiError / Error 自带可读 message，其余 String()。 */
function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** 导入导出页。 */
export function ImportExportModal({ t }: ImportExportModalProps): React.ReactElement {
  const [busy, setBusy] = React.useState<Busy>("idle");
  /** 导出成功的宿主回执（`path` 由服务端生成）。 */
  const [exported, setExported] = React.useState<{ path: string; prompts: number; tags: number } | null>(null);
  const [exportFailed, setExportFailed] = React.useState<string | null>(null);
  /** 宿主返回的预览（`backup` 原样留着，确认时把它再发一次）。 */
  const [preview, setPreview] = React.useState<{ backup: unknown; stats: ImportStats } | null>(null);
  const [applied, setApplied] = React.useState<ImportStats | null>(null);
  /** 导入后的超限提示（总数 / 上限）——只提示，不淘汰。 */
  const [overflow, setOverflow] = React.useState<{ imported: number; total: number; max: number } | null>(null);
  const [failure, setFailure] = React.useState<{ key: PromptEnhancerKey; detail: string } | null>(null);
  /** 隐藏的文件输入（React 自有 DOM）：按钮只负责点它。 */
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const aliveRef = React.useRef(true);

  React.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  /**
   * 目录能力可用性：每次渲染重新判（能力在插件卸载时被复位为 null）。
   * 不可用时按钮**禁用并给出可读原因**（D-P6-4：不静默、不假装能点）。
   */
  const pickerAvailable = isDirectoryPickerAvailable();
  const idle = busy === "idle";

  const runExport = (): void => {
    if (!idle || !pickerAvailable) return;
    setExported(null);
    setExportFailed(null);
    setFailure(null);
    setBusy("exporting");
    void (async () => {
      try {
        const dir = await pickExportDirectory();
        // 用户取消（null）：**静默**回到面板——不是错误、不写任何提示（约束 D1）。
        if (dir === null) return;
        const result = await api.exportBackup(dir);
        if (!aliveRef.current) return;
        setExported(result);
      } catch (err) {
        console.warn("[prompt-enhancer] 导出备份失败", err);
        if (aliveRef.current) setExportFailed(reasonOf(err));
      } finally {
        if (aliveRef.current) setBusy("idle");
      }
    })();
  };

  const onPickFile = (ev: React.ChangeEvent<HTMLInputElement>): void => {
    const file = ev.target.files?.[0] ?? null;
    // 清空 value：允许连续选中**同一个**文件（change 才会再触发）。file 已取出，清空不影响后续读取。
    ev.target.value = "";
    if (file === null || !idle) return;
    setPreview(null);
    setApplied(null);
    setOverflow(null);
    setFailure(null);
    setExportFailed(null);
    setBusy("reading");
    void (async () => {
      try {
        let text: string;
        try {
          text = await file.text();
        } catch (err) {
          console.warn("[prompt-enhancer] 读取所选备份文件失败", err);
          if (aliveRef.current) setFailure({ key: "manager.transfer.readFailed", detail: reasonOf(err) });
          return;
        }
        // 客户端独有的两道闸（体积 / JSON 解析）；信封判定归宿主，见文件头。
        const parsed = parseBackupFile(text, file.size);
        if (!parsed.ok) {
          if (aliveRef.current) setFailure({ key: parsed.errorKey, detail: parsed.detail });
          return;
        }
        try {
          const result = await api.importBackup(parsed.backup, false);
          if (!aliveRef.current) return;
          if (result.stats === undefined) {
            // 宿主契约漂移（预览必带 stats）：可见地报出来，不静默当作空预览。
            setFailure({ key: "manager.transfer.noStats", detail: reasonOf(new Error("宿主预览响应缺少 stats")) });
            return;
          }
          setPreview({ backup: parsed.backup, stats: result.stats });
        } catch (err) {
          // 宿主拒绝（版本不符 / prompts 非数组 / 元素缺 id|body）→ 显示宿主报错**原文**。
          console.warn("[prompt-enhancer] 导入预览被宿主拒绝", err);
          if (aliveRef.current) setFailure({ key: "manager.transfer.importFailed", detail: reasonOf(err) });
        }
      } finally {
        if (aliveRef.current) setBusy("idle");
      }
    })();
  };

  /** 取消预览：本地丢弃即可（宿主未落库，无需回滚请求）。 */
  const cancelImport = (): void => {
    setPreview(null);
    setFailure(null);
  };

  const confirmImport = (): void => {
    if (preview === null || !idle) return;
    const { backup, stats } = preview;
    setFailure(null);
    setBusy("applying");
    void (async () => {
      try {
        const result = await api.importBackup(backup, true);
        if (!aliveRef.current) return;
        const done = result.stats ?? stats;
        setPreview(null);
        setApplied(done);
        notifyDataChanged();
        // 约束 D3：成功导入后读一次「当前总数」与上限，超出则**显式提示**条数与上限的关系。
        // 读数失败不得把「导入成功」变成失败——单列一条可见提示（不静默吞掉）。
        try {
          const [list, settings] = await Promise.all([api.listPrompts(), api.getSettings()]);
          if (!aliveRef.current) return;
          if (list.length > settings.maxPromptCount) {
            setOverflow({ imported: done.total, total: list.length, max: settings.maxPromptCount });
          }
        } catch (err) {
          console.warn("[prompt-enhancer] 导入成功，但读取当前条数 / 上限失败", err);
          if (aliveRef.current) setFailure({ key: "manager.transfer.countsFailed", detail: reasonOf(err) });
        }
      } catch (err) {
        console.warn("[prompt-enhancer] 导入落库失败", err);
        if (aliveRef.current) setFailure({ key: "manager.transfer.importFailed", detail: reasonOf(err) });
      } finally {
        if (aliveRef.current) setBusy("idle");
      }
    })();
  };

  return (
    <>
      <div style={toolbar}>
        <button
          type="button"
          style={{ ...primaryButton, opacity: pickerAvailable && idle ? 1 : 0.6 }}
          aria-busy={busy === "exporting"}
          disabled={!pickerAvailable || !idle}
          onClick={runExport}
        >
          {busy === "exporting" ? t("manager.transfer.exporting") : t("manager.transfer.export")}
        </button>
      </div>
      {!pickerAvailable && <span style={muted}>{t("manager.transfer.exportUnavailable")}</span>}
      {exported !== null && (
        <span role="status" aria-live="polite" style={muted}>
          {t("manager.transfer.exported")}{" "}
          <span style={errorDetail} title={exported.path}>
            {exported.path}
          </span>
          {" · "}
          {t("manager.transfer.prompts")} {exported.prompts}
          {" · "}
          {t("manager.transfer.tags")} {exported.tags}
        </span>
      )}
      {exportFailed !== null && (
        <span role="alert" style={errorText}>
          <span>{t("manager.transfer.exportFailed")}</span>
          <span style={errorDetail} title={exportFailed}>
            {exportFailed}
          </span>
        </span>
      )}

      <div style={toolbar}>
        <button type="button" style={button} disabled={!idle} onClick={() => fileRef.current?.click()}>
          {t("manager.transfer.import")}
        </button>
        {/* 隐藏的文件输入由 **React** 渲染（约束 D2：不得 document.createElement + appendChild）。 */}
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          aria-label={t("manager.transfer.import")}
          onChange={onPickFile}
        />
      </div>
      {preview !== null && (
        <>
          <span style={muted}>
            {t("manager.transfer.previewAdded")} {preview.stats.added}
            {" · "}
            {t("manager.transfer.previewOverwritten")} {preview.stats.overwritten}
            {" · "}
            {t("manager.transfer.previewTotal")} {preview.stats.total}
          </span>
          <span role="alert" style={errorText}>
            {t("manager.transfer.overwriteWarning")}
          </span>
          <div style={actions}>
            <button type="button" style={button} onClick={cancelImport}>
              {t("manager.transfer.cancel")}
            </button>
            <button
              type="button"
              style={{ ...primaryButton, opacity: idle ? 1 : 0.6 }}
              aria-busy={busy === "applying"}
              disabled={!idle}
              onClick={confirmImport}
            >
              {busy === "applying" ? t("manager.transfer.importing") : t("manager.transfer.confirm")}
            </button>
          </div>
        </>
      )}
      {applied !== null && (
        <span role="status" aria-live="polite" style={muted}>
          {t("manager.transfer.imported")}
          {" · "}
          {t("manager.transfer.previewAdded")} {applied.added}
          {" · "}
          {t("manager.transfer.previewOverwritten")} {applied.overwritten}
          {" · "}
          {t("manager.transfer.previewTotal")} {applied.total}
        </span>
      )}
      {overflow !== null && (
        <span role="status" aria-live="polite" style={muted}>
          {t("manager.transfer.overLimitBefore")} {overflow.imported} {t("manager.transfer.overLimitMid")} {overflow.total}{" "}
          {t("manager.transfer.overLimitAfter")} {overflow.max} {t("manager.transfer.overLimitNote")}
        </span>
      )}
      {failure !== null && (
        <span role="alert" style={errorText}>
          <span>{t(failure.key)}</span>
          <span style={errorDetail} title={failure.detail}>
            {failure.detail}
          </span>
        </span>
      )}
    </>
  );
}
