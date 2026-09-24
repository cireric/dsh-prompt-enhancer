/**
 * 回收站页（T4 填 T2 的外壳）：列表（标题 / 删除时间 / 用量）→ 恢复 → 永久删除 → 清空。
 *
 * 四个动作全部走既有 P6 客户端 API（`listTrash` / `restoreTrash` / `deleteTrash` / `emptyTrash`），
 * 成功一律 `notifyDataChanged()`（D6 同进程数据同步）。
 *
 * 「永久删除」「清空」是**不可恢复**的物理删除，故都走共享的二次确认
 * （`confirm.ts#requestConfirm`，唯一渲染点在 `PromptSurfaceHost`，压在管理面板之上）：
 * 用户取消 → promise 落地 false → 直接返回（不发起请求、不渲染错误）。
 * 零 DOM 注入、不新引入依赖。
 */
import * as React from "react";
import type { TrashItem } from "../../types.ts";
import { api } from "../utils/api.ts";
import { requestConfirm } from "../utils/confirm.ts";
import { notifyDataChanged, useDataChanged } from "../utils/data-sync.ts";
import {
  actions,
  button,
  errorDetail,
  errorText,
  listRow,
  muted,
  primaryButton,
  rowMeta,
  rowText,
  rowTitle,
  tagChip,
  toolbar,
} from "../utils/dialog-style.ts";
import type { PromptEnhancerKey } from "../utils/i18n.ts";
import type { ManagerTranslate } from "./PromptManagerModal.tsx";

export interface RecycleManagePanelProps {
  /** 宿主的命名空间翻译函数（由 PromptManagerModal 透传）。 */
  t: ManagerTranslate;
}

/** 失败原因给人看的那一行：Error 自带可读 message，其余 String()。 */
function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** 删除时间：本地时区可读串（不引日期库）。 */
function deletedAtText(ms: number): string {
  return new Date(ms).toLocaleString();
}

/** 回收站页。 */
export function RecycleManagePanel({ t }: RecycleManagePanelProps): React.ReactElement {
  /** null = 本次还没加载完。 */
  const [items, setItems] = React.useState<TrashItem[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [failure, setFailure] = React.useState<{ key: PromptEnhancerKey; detail: string } | null>(null);
  /** 正在处理的那一条（整表禁用，避免并发删同一批）；`empty` 表示正在清空。 */
  const [busy, setBusy] = React.useState<string | "empty" | null>(null);
  const [reloadSeq, setReloadSeq] = React.useState(0);
  const aliveRef = React.useRef(true);

  React.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useDataChanged(() => setReloadSeq((n) => n + 1));

  React.useEffect(() => {
    let alive = true;
    api.listTrash().then(
      (list) => {
        if (!alive) return;
        setItems(list);
        setLoadError(null);
      },
      (err: unknown) => {
        if (!alive) return;
        console.warn("[prompt-enhancer] 回收站加载失败", err);
        setItems([]);
        setLoadError(reasonOf(err));
      },
    );
    return () => {
      alive = false;
    };
  }, [reloadSeq]);

  /** 开始一次写动作前的统一收口：旧提示清掉（忙标记由各动作自己置位）。 */
  const begin = (): void => {
    setNotice(null);
    setFailure(null);
  };

  /** 恢复：不算破坏性，故不弹二次确认（误恢复的代价是再删一次）。 */
  const restore = (item: TrashItem): void => {
    if (busy !== null) return;
    begin();
    setBusy(item.id);
    api.restoreTrash(item.id).then(
      () => {
        if (!aliveRef.current) return;
        setBusy(null);
        setNotice(t("manager.trash.restored"));
        notifyDataChanged();
      },
      (err: unknown) => {
        console.warn("[prompt-enhancer] 恢复提示词失败", err);
        if (!aliveRef.current) return;
        setBusy(null);
        setFailure({ key: "manager.trash.restoreFailed", detail: reasonOf(err) });
      },
    );
  };

  /** 永久删除：不可恢复 → 先二次确认；取消是安全 no-op。 */
  const purge = (item: TrashItem): void => {
    if (busy !== null) return;
    begin();
    setBusy(item.id);
    void (async () => {
      try {
        const approved = await requestConfirm({
          title: "manager.confirm.purgeTitle",
          message: "manager.confirm.purgeMessage",
          detail: [item.title],
          confirmLabel: "manager.confirm.confirm",
          cancelLabel: "manager.confirm.cancel",
        });
        if (!approved) {
          if (aliveRef.current) setBusy(null);
          return;
        }
        await api.deleteTrash(item.id);
        if (!aliveRef.current) return;
        setBusy(null);
        setNotice(t("manager.trash.purged"));
        notifyDataChanged();
      } catch (err) {
        console.warn("[prompt-enhancer] 永久删除回收站条目失败", err);
        if (!aliveRef.current) return;
        setBusy(null);
        setFailure({ key: "manager.trash.purgeFailed", detail: reasonOf(err) });
      }
    })();
  };

  /** 清空：不可恢复 → 二次确认（明细列出将被删除的标题）。 */
  const emptyAll = (): void => {
    if (busy !== null) return;
    begin();
    setBusy("empty");
    void (async () => {
      try {
        const approved = await requestConfirm({
          title: "manager.confirm.emptyTitle",
          message: "manager.confirm.emptyMessage",
          detail: (items ?? []).map((item) => item.title),
          confirmLabel: "manager.confirm.confirm",
          cancelLabel: "manager.confirm.cancel",
        });
        if (!approved) {
          if (aliveRef.current) setBusy(null);
          return;
        }
        await api.emptyTrash();
        if (!aliveRef.current) return;
        setBusy(null);
        setNotice(t("manager.trash.emptied"));
        notifyDataChanged();
      } catch (err) {
        console.warn("[prompt-enhancer] 清空回收站失败", err);
        if (!aliveRef.current) return;
        setBusy(null);
        setFailure({ key: "manager.trash.emptyFailed", detail: reasonOf(err) });
      }
    })();
  };

  return (
    <>
      <div style={{ ...toolbar, justifyContent: "flex-end" }}>
        <button
          type="button"
          style={primaryButton}
          disabled={busy !== null || items === null || items.length === 0}
          onClick={emptyAll}
        >
          {t("manager.trash.emptyAll")}
        </button>
      </div>
      {notice !== null && (
        <span role="status" aria-live="polite" style={muted}>
          {notice}
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
      {loadError !== null && (
        <span role="alert" style={errorText}>
          <span>{t("manager.trash.loadFailed")}</span>
          <span style={errorDetail} title={loadError}>
            {loadError}
          </span>
        </span>
      )}
      {loadError === null && items === null && <span style={muted}>{t("list.loading")}</span>}
      {loadError === null && items !== null && items.length === 0 && <span style={muted}>{t("manager.trash.empty")}</span>}
      {loadError === null && items !== null && items.length > 0 && (
        <div role="list">
          {items.map((item) => (
            <div key={item.id} role="listitem" aria-label={item.title} style={listRow}>
              <span style={rowText}>
                <span style={rowTitle}>{item.title}</span>
                <span style={rowMeta}>
                  <span style={tagChip}>
                    {t("manager.trash.usage")} {item.usageCount}
                  </span>
                </span>
                <span style={muted}>
                  {t("manager.trash.deletedAt")} {deletedAtText(item.deletedAt)}
                </span>
              </span>
              <span style={actions}>
                <button type="button" style={button} disabled={busy !== null} onClick={() => restore(item)}>
                  {t("manager.trash.restore")}
                </button>
                <button type="button" style={button} disabled={busy !== null} onClick={() => purge(item)}>
                  {t("manager.trash.purge")}
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
