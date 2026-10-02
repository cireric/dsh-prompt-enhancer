/**
 * 标签页（T4 填 T2 的外壳）：列表（name + count）→ 重命名 → 删除 → 「清理无用标签」。
 *
 * 数据面全部走既有 P6 客户端 API（`src/client/utils/api.ts`），**不新增宿主路由**：
 *   · 重命名 `PUT /tags/:from {to}`（宿主连带更新所有引用该标签的提示词）；
 *   · 删除 `DELETE /tags/:name`——**在用即宿主 400**（R37：这正是安全网），故本页把 400
 *     单独识别为「在用」并**显示用量**，不当通用错误；用量取**宿主权威值**（重拉后的 `listTags`，
 *     见 `inUseCount`），不拿列表快照当权威（T7 ⑥）；
 *   · 「清理无用标签」= 对 `count === 0` 的标签逐个调上面这条既有路由（逐个失败必须可见，
 *     不许静默跳过）。
 *
 * 副作用面：`api.*`（HTTP）、`notifyDataChanged()`（同进程数据同步，D6）。零 DOM 注入。
 */
import * as React from "react";
import { ApiError, api } from "../utils/api.ts";
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
  textInput,
  toolbar,
} from "../utils/dialog-style.ts";
import type { PromptEnhancerKey } from "../utils/i18n.ts";
import type { ManagerTranslate } from "./PromptManagerModal.tsx";
import { reasonOf } from "../../err-text.ts";
import { useAsyncList } from "../utils/async-list.ts";

export interface TagManagePanelProps {
  /** 宿主的命名空间翻译函数（由 PromptManagerModal 透传）。 */
  t: ManagerTranslate;
}


/** 标签页。 */
export function TagManagePanel({ t }: TagManagePanelProps): React.ReactElement {
  /** null = 本次还没加载完。 */
  const [notice, setNotice] = React.useState<string | null>(null);
  const [failure, setFailure] = React.useState<{ key: PromptEnhancerKey; detail: string } | null>(null);
  /** 正在重命名的标签（null = 无）；改名期间那一行换成输入框 + 保存/取消。 */
  const [editing, setEditing] = React.useState<{ from: string; value: string } | null>(null);
  /** 被宿主 400 拒绝的「在用标签」：显示用量（不是通用错误）。 */
  const [inUse, setInUse] = React.useState<{ name: string; count: number } | null>(null);
  /** 一次只跑一个写动作（重命名 / 删除 / 清理共用），避免并发改同一条。 */
  const [busy, setBusy] = React.useState(false);
  const [reloadSeq, setReloadSeq] = React.useState(0);
  const aliveRef = React.useRef(true);

  React.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // 同进程数据同步（D6）：别处改了标签/提示词，这里重拉。
  useDataChanged(() => setReloadSeq((n) => n + 1));

  // 重拉**不清**旧错误行（`clearErrorOnStart` 缺省 false）：本仓两处刻意让旧提示留到重拉成功。
  const { items: tags, error: loadError } = useAsyncList(() => api.listTags(), [reloadSeq], { label: "标签加载失败" });

  /** 开始一次写动作前的统一收口：旧提示清掉，忙标记置位。 */
  const begin = (): void => {
    setNotice(null);
    setFailure(null);
    setInUse(null);
    setBusy(true);
  };

  const rename = (from: string, value: string): void => {
    const target = value.trim();
    // 空名/同名都是「无事可做」：直接退出编辑态，不发请求（宿主对空 to 回 400）。
    if (target === "" || target === from) {
      setEditing(null);
      return;
    }
    if (busy) return;
    begin();
    api.renameTag(from, target).then(
      () => {
        if (!aliveRef.current) return;
        setBusy(false);
        setEditing(null);
        setNotice(t("manager.tags.renamed"));
        notifyDataChanged();
      },
      (err: unknown) => {
        console.warn("[prompt-enhancer] 标签重命名失败", err);
        if (!aliveRef.current) return;
        setBusy(false);
        setFailure({ key: "manager.tags.renameFailed", detail: reasonOf(err) });
      },
    );
  };

  const remove = (item: { name: string; count: number }): void => {
    if (busy) return;
    begin();
    api.deleteTag(item.name).then(
      () => {
        if (!aliveRef.current) return;
        setBusy(false);
        setNotice(t("manager.tags.deleted"));
        notifyDataChanged();
      },
      (err: unknown) => {
        console.warn("[prompt-enhancer] 标签删除失败", err);
        if (!aliveRef.current) return;
        setBusy(false);
        if (err instanceof ApiError && err.status === 400) {
          // 在用标签（宿主 400「标签正在被 N 条提示词使用」）：显示用量并拒绝，不当通用错误。
          //
          // ⚠️ N 必须取**宿主权威值**（T7 ⑥）：这里记下的 count 只是**触发那一刻**的列表快照，而
          // 渲染期会优先读重拉后的列表（见下面的 `inUseCount`）——直接用快照会在列表过期时渲染出
          // 「正在被 0 条提示词使用，无法删除」这种自相矛盾的文案。
          // 删除**回执**（`ApiError`）里没有 `inUse` 字段（宿主 `fail()` 只回 `{ok:false,error}`，
          // 缺口记在 task-7-report.md ⑥），也**不许**去解析那句本地化文案——故取宿主算出来的第二来源：
          // 重拉一次 `listTags`（`count` 由宿主统计）。重拉失败时退回上面那个快照值（旧行为、不更糟）。
          setInUse({ name: item.name, count: item.count });
          setReloadSeq((n) => n + 1);
          return;
        }
        setFailure({ key: "manager.tags.deleteFailed", detail: reasonOf(err) });
      },
    );
  };

  /** 「清理无用标签」（R37）：对 `count === 0` 的标签逐个调既有 deleteTag；失败必须可见。 */
  const cleanUnused = (): void => {
    if (busy) return;
    const orphans = (tags ?? []).filter((item) => item.count === 0);
    if (orphans.length === 0) {
      setNotice(t("manager.tags.cleanNone"));
      setFailure(null);
      setInUse(null);
      return;
    }
    begin();
    void (async () => {
      const removed: string[] = [];
      const failed: string[] = [];
      for (const item of orphans) {
        try {
          await api.deleteTag(item.name);
          removed.push(item.name);
        } catch (err) {
          // 并发期间被别人用上了（400）等：逐个的失败必须可见，不得静默跳过。
          console.warn("[prompt-enhancer] 清理无用标签失败：" + item.name, err);
          failed.push(item.name);
        }
      }
      if (!aliveRef.current) return;
      setBusy(false);
      if (failed.length > 0) setFailure({ key: "manager.tags.cleanFailed", detail: failed.join(", ") });
      if (removed.length > 0) {
        setNotice(t("manager.tags.cleaned") + " " + removed.join(", "));
        notifyDataChanged();
      } else {
        setReloadSeq((n) => n + 1);
      }
    })();
  };

  /**
   * 「在用标签」的用量（T7 ⑥）：**渲染期**取宿主权威值。
   *
   * `tags` 是 `api.listTags()` 的结果（每条的 `count` 由**宿主**统计），而 400 分支已经推进
   * `reloadSeq` ⇒ 这一格在 400 之后立刻跟上，屏上的数字不会再停留在过期快照上。
   * 列表里找不到该标签（这段窗口里被改名 / 删除）时退回快照值——此时无从取权威值，且该不一致已在
   * 400 那次 `console.warn` 里留了痕（不静默）。
   */
  const inUseCount =
    inUse === null ? null : ((tags ?? []).find((item) => item.name === inUse.name)?.count ?? inUse.count);

  return (
    <>
      <div style={{ ...toolbar, justifyContent: "flex-end" }}>
        <button type="button" style={primaryButton} disabled={busy || tags === null} onClick={cleanUnused}>
          {t("manager.tags.clean")}
        </button>
      </div>
      {inUse !== null && (
        <span role="alert" style={errorText}>
          <span>
            {t("manager.tags.inUseBefore")} {inUseCount} {t("manager.tags.inUseAfter")}
          </span>
          <span style={errorDetail} title={inUse.name}>
            {inUse.name}
          </span>
        </span>
      )}
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
          <span>{t("manager.tags.loadFailed")}</span>
          <span style={errorDetail} title={loadError}>
            {loadError}
          </span>
        </span>
      )}
      {loadError === null && tags === null && <span style={muted}>{t("list.loading")}</span>}
      {loadError === null && tags !== null && tags.length === 0 && <span style={muted}>{t("manager.tags.empty")}</span>}
      {loadError === null && tags !== null && tags.length > 0 && (
        <div role="list">
          {tags.map((item) => (
            <div key={item.name} role="listitem" aria-label={item.name} style={listRow}>
              <span style={rowText}>
                <span style={rowTitle}>{item.name}</span>
                <span style={rowMeta}>
                  <span style={tagChip}>
                    {t("manager.tags.usage")} {item.count}
                  </span>
                </span>
                {editing !== null && editing.from === item.name && (
                  <input
                    type="text"
                    aria-label={t("manager.tags.rename")}
                    value={editing.value}
                    onChange={(ev) => setEditing({ from: item.name, value: ev.target.value })}
                    style={textInput}
                  />
                )}
              </span>
              <span style={actions}>
                {editing !== null && editing.from === item.name ? (
                  <>
                    <button type="button" style={primaryButton} disabled={busy} onClick={() => rename(item.name, editing.value)}>
                      {t("manager.tags.renameSave")}
                    </button>
                    <button type="button" style={button} disabled={busy} onClick={() => setEditing(null)}>
                      {t("manager.tags.renameCancel")}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      style={button}
                      disabled={busy}
                      onClick={() => {
                        setNotice(null);
                        setFailure(null);
                        setInUse(null);
                        setEditing({ from: item.name, value: item.name });
                      }}
                    >
                      {t("manager.tags.rename")}
                    </button>
                    <button type="button" style={button} disabled={busy} onClick={() => remove(item)}>
                      {t("manager.tags.delete")}
                    </button>
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
