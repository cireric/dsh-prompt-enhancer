/**
 * 技能导出页（P7 T2 / 规格 §7.6 / 验收 15、17）——管理面板栈里的一页，由宿主的**面板值 `'skill'`**
 * 选中（`PromptManagerModal` 头部工具栏的「导出为技能」按钮置位，本页的「返回管理面板」清位）。
 *
 * 流程（规格 §7.6 的五步）：勾选提示词（全选 / 按标签筛选）→ 逐条「AI 补全名称与描述」
 * （`POST /ai/skill-descriptor`，**失败条目行内红色标注、不阻断其它条目**）→ 预校验
 * （`toKebab` + `isValidSkillName` 提前报错 + description 非空；**最终判定仍以宿主为准**）
 * → 逐条 `POST /skills/export`（`409` 同名目录不属于本插件 → 共享确认弹窗 → 带
 * `conflictConfirmed: true` 重试）→ 结果汇总（成功 / 失败 / 跳过清单 + **宿主回执里的目标文件路径**）。
 *
 * **非组件逻辑一律不在本文件**（P6 的 I-4 教训）：勾选 / 全选 / 标签筛选 / 预校验 / 逐条编排 /
 * 结果汇总都在 `utils/skill-export.ts`（JSX-free，`node --test` 直接可测——`.tsx` 恰恰 import 不了）。
 * 本文件只做接线：HTTP 走 `api.*`，确认走 `confirm.ts#requestConfirm`（**唯一渲染点**在
 * `PromptSurfaceHost`，不得自建第二套确认层），同进程同步走 `notifyDataChanged()`。零 DOM 注入。
 *
 * 面板与浮层的层叠关系（R-P7-Q 的核实结论）：本页活在 `shell.overlay` 的管理面板卡片内，
 * 而 `OverlayKind` 的共享 claim 管的是**会话输入区**的三张浮层/面板（词库 / `#` / AI）；
 * 管理面板卡片自带铺满 frame 的 backdrop（z=100，压住会话面的 30/31），几何上已完全接管点击，
 * 故技能页**不需要**参与 claim 互斥（扩枚举只会让两套分层语义互相污染）。详见 task-2-report.md。
 */
import * as React from "react";
import type { Prompt } from "../../types.ts";
import { api } from "../utils/api.ts";
import { requestConfirm } from "../utils/confirm.ts";
import { notifyDataChanged, useDataChanged } from "../utils/data-sync.ts";
import {
  actions,
  button,
  dialogTitle,
  errorDetail,
  errorText,
  listRow,
  muted,
  primaryButton,
  rowMeta,
  rowText,
  rowTitle,
  select,
  tagChip,
  toolbar,
} from "../utils/dialog-style.ts";
import {
  collectTags,
  createSkillRun,
  describeEach,
  exportEach,
  exportNameLocked,
  filterByTag,
  isAllSelected,
  pickSelected,
  precheckExport,
  summarizeExport,
  toggleAllVisible,
  toggleSelected,
  type DescriptorOutcome,
  type ExportOutcome,
  type SkillRun,
} from "../utils/skill-export.ts";
import type { ManagerTranslate } from "./PromptManagerModal.tsx";

export interface SkillExportModalProps {
  /** 宿主的命名空间翻译函数（由 PromptSurfaceHost → PromptManagerModal 透传）。 */
  t: ManagerTranslate;
  /** 返回管理面板（清掉宿主的面板值；开合与页签仍归 ui-state 的 store）。 */
  onBack: () => void;
}

/** 在途动作（AI 补全 / 导出）互斥：任一在途时其它按钮一律禁用。 */
type Busy = "idle" | "describing" | "exporting";

/** 失败原因给人看的那一行：ApiError / Error 自带可读 message，其余 String()。 */
function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function SkillExportModal({ t, onBack }: SkillExportModalProps): React.ReactElement {
  const [prompts, setPrompts] = React.useState<Prompt[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  /** 勾选的提示词 id（**与加载顺序无关**：全选/筛选都经纯函数在同一集合上运算）。 */
  const [selected, setSelected] = React.useState<string[]>([]);
  const [tag, setTag] = React.useState("");
  /** 逐条的 AI 补全结果（失败条目行内标注；不阻断其它条目）。 */
  const [descriptors, setDescriptors] = React.useState<Record<string, DescriptorOutcome>>({});
  const [busy, setBusy] = React.useState<Busy>("idle");
  /** 最近一次导出的逐条结局（null = 本次会话还没导出过）。 */
  const [outcomes, setOutcomes] = React.useState<ExportOutcome[] | null>(null);
  /** 编排级异常（纯函数内已逐条兜住，这里只留给「编排本身」出错，绝不静默）。 */
  const [fatal, setFatal] = React.useState<string | null>(null);
  const aliveRef = React.useRef(true);
  /**
   * 在途批次的取消令牌（R-P7-X 修复轮 1）。本组件卸载 = 「用户离开了技能页」（切页签 / 关闭面板 /
   * 点遮罩关闭都换掉本页 ⇒ 卸载），此刻必须 `cancel()`：
   *  · 要求 1：后续条目**不再启动**（在途那条不硬断——写盘是宿主的副作用，见 `SkillRun` 注释）；
   *  · 要求 3：已经发出的 409 **不再弹**无上下文的确认框；
   *  · 要求 2 不受影响（T7-4 改的是广播的**粒度**，不是这条性质）：**已完成**的条目在成功那一刻
   *    就地更新本页那一条（见下面的 `onExported`），宿主已回写的名字仍由 `runExport` 的 `finally`
   *    **批末广播一次**——那次广播与组件在世与否无关，故用户中途离开也不会让徽标缺席。
   */
  const runRef = React.useRef<SkillRun | null>(null);

  React.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      runRef.current?.cancel();
    };
  }, []);

  /**
   * A（重要-1）②：**导出成功后刷新本地列表**。锁定判定（`exportNameLocked` / `precheckExport`）读的是
   * 本地的 `prompt.skillName`，而列表原先**只在挂载时读一次** ⇒ 同一次技能页会话里
   * 「导出成功 → 再点 AI 补全（真会换名）→ 再导出」会让行内名字与锁定标注继续按**旧库**撒谎。
   *
   * 挂 `useDataChanged`（与 `PromptManagerModal` / `TagManagePanel` / `RecycleManagePanel` 同款）后，
   * 每次 `notifyDataChanged()` 都会重拉一次列表，于是行内名字与「已锁定」标注**立即如实**。
   *
   * ⚠️ **重拉粒度（T7-4 / P7 §10.4-4 / A-2）**：整库重拉的触发点只剩**批末一次**
   * （`runExport` 的 `finally`）。导出过程中的**逐条如实**由 `onExported` 的**就地更新**承担
   * （只换那一条的 `skillName`），不再「每条成功都重拉整库」——导出 N 条曾是 N 次
   * `GET /prompts` + N 次全量重渲染，换来的却是同一屏文字。
   *
   * ⚠️ 本地列表只负责**说实话**，不是防线：即使它陈旧（下拉在途 / 页面还没重拉），宿主的候选序也会
   * 把目录钉在既有 `skillName` 上（`src/host/routes.ts` 的技能导出分支）。
   */
  const [reloadSeq, setReloadSeq] = React.useState(0);
  useDataChanged(() => setReloadSeq((n) => n + 1));

  React.useEffect(() => {
    let alive = true;
    // 重拉**不清空**列表（不清成 null / []）：导出过程中列表不该闪一下「加载中」；首帧本来就是 null。
    setLoadError(null);
    // 读整库（技能导出的候选就是**全部**提示词；标签筛选在客户端做，与列表页的服务端筛选是两条独立路径）。
    api.listPrompts().then(
      (list) => {
        if (alive) setPrompts(list);
      },
      (err: unknown) => {
        if (!alive) return;
        console.warn("[prompt-enhancer] 技能导出：提示词加载失败", err);
        setPrompts([]);
        setLoadError(reasonOf(err));
      },
    );
    return () => {
      alive = false;
    };
  }, [reloadSeq]);

  const list = prompts ?? [];
  const visible = React.useMemo(() => filterByTag(list, tag), [list, tag]);
  const tags = React.useMemo(() => collectTags(list), [list]);
  const chosen = React.useMemo(() => pickSelected(list, selected), [list, selected]);
  const summary = outcomes === null ? null : summarizeExport(outcomes);
  const idle = busy === "idle";
  const allVisibleSelected = isAllSelected(visible, selected);

  /** 逐条 AI 补全：失败非阻断（语义在 `describeEach`），`onEach` 让每条的结果立刻落行内。 */
  const describeChosen = (): void => {
    if (!idle || chosen.length === 0) return;
    const run = createSkillRun();
    runRef.current = run;
    setBusy("describing");
    setOutcomes(null);
    setFatal(null);
    void (async () => {
      try {
        await describeEach(
          chosen,
          (prompt) =>
            api.aiSkillDescriptor({
              body: prompt.body,
              title: prompt.title,
              summary: prompt.summary,
              tags: prompt.tags,
            }),
          {
            run,
            onEach: (id, outcome) => {
              if (aliveRef.current) setDescriptors((prev) => ({ ...prev, [id]: outcome }));
            },
          },
        );
      } catch (err) {
        // describeEach 逐条兜错，走到这里说明是编排层的意外——显式报出（不得空吞）。
        console.warn("[prompt-enhancer] 技能补全编排异常", err);
        if (aliveRef.current) setFatal(reasonOf(err));
      } finally {
        runRef.current = null;
        if (aliveRef.current) setBusy("idle");
      }
    })();
  };

  /** 逐条导出：预校验 → 请求 → 409 走共享确认 → 带 conflictConfirmed 重试（全在纯函数里）。 */
  const runExport = (): void => {
    if (!idle || chosen.length === 0) return;
    const run = createSkillRun();
    runRef.current = run;
    setBusy("exporting");
    setOutcomes(null);
    setFatal(null);
    void (async () => {
      try {
        const results = await exportEach({
          prompts: chosen,
          descriptors,
          run,
          send: (prompt, request) =>
            api.exportPromptAsSkill({
              promptId: prompt.id,
              name: request.name,
              descriptor: request.descriptor,
              conflictConfirmed: request.conflictConfirmed,
            }),
          // 同名冲突确认：共享确认弹窗（promise 驱动；渲染点在 PromptSurfaceHost，压住管理面板）。
          confirmConflict: (info) =>
            requestConfirm({
              title: "manager.skill.conflictTitle",
              message: "manager.skill.conflictMessage",
              detail: [info.title + " → " + info.name, info.detail],
              confirmLabel: "manager.confirm.confirm",
              cancelLabel: "manager.confirm.cancel",
            }),
          /**
           * T7-4：**就地更新该条**——把刚落盘的名字写进本地那一条（锁定判定 `exportNameLocked` /
           * `precheckExport` 读的就是它），不重拉整库。这里**不编** `skillExportedAt`：它的权威值由
           * **批末那次重拉**带回（本页只渲染名字与「已锁定」标注，不渲染徽标）。
           *
           * ⚠️ 要求 2 的广播没有取消，只是**移到批末一次**（见下面 `finally` 里的 `notifyDataChanged()`）：
           * 那次广播写在异步函数里、与组件在世与否无关——用户跑到一半离开（组件卸载）时批次仍会收尾，
           * 宿主已回写的 `skillName` / `skillExportedAt` 照样广播出去，验收 16 的徽标不会缺席。
           */
          onExported: (outcome) => {
            if (!aliveRef.current) return;
            setPrompts((prev) =>
              prev === null ? prev : prev.map((p) => (p.id === outcome.id ? { ...p, skillName: outcome.name } : p)),
            );
          },
        });
        // 这里只负责渲染（组件已经走了就没有东西可渲染）：广播在下面的 finally 里**批末一次**。
        if (!aliveRef.current) return;
        setOutcomes(results);
      } catch (err) {
        console.warn("[prompt-enhancer] 技能导出编排异常", err);
        if (aliveRef.current) setFatal(reasonOf(err));
      } finally {
        runRef.current = null;
        /**
         * 要求 2（**批末一次**，T7-4）：宿主已回写的 `skillName` / `skillExportedAt` 必须让订阅者知道
         * ——否则列表页不重拉、验收 16 的徽标不出现（「导出成功但什么都没发生」）。放在 `finally` 保证
         * 三条收尾路径（正常结束 / 编排异常 / 用户中途离开）都广播一次；它是模块级调用、写在异步函数里，
         * 因此与组件在世与否无关。逐条成功**不再**各广播一次（那会让每个订阅者各重拉 N 次整库）。
         */
        notifyDataChanged();
        if (aliveRef.current) setBusy("idle");
      }
    })();
  };

  return (
    <>
      <div style={toolbar}>
        {/* T5 活体探针锚点：技能导出页在场（声明式渲染，非 DOM 注入）。 */}
        <span data-prompt-enhancer-skill="" style={dialogTitle}>
          {t("manager.skill.title")}
        </span>
        <button type="button" style={button} onClick={onBack}>
          {t("manager.skill.back")}
        </button>
      </div>
      <span style={muted}>{t("manager.skill.hint")}</span>
      <div style={toolbar}>
        <button
          type="button"
          style={button}
          disabled={!idle || visible.length === 0}
          onClick={() => setSelected(toggleAllVisible(visible, selected))}
        >
          {allVisibleSelected ? t("manager.skill.selectNone") : t("manager.skill.selectAll")}
        </button>
        <label style={muted}>
          {t("manager.skill.tagFilter")}
          <select
            aria-label={t("manager.skill.tagFilter")}
            value={tag}
            onChange={(ev) => setTag(ev.target.value)}
            style={{ ...select, marginLeft: 4 }}
          >
            <option value="">{t("manager.skill.allTags")}</option>
            {tags.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <span style={muted}>
          {t("manager.skill.selected")} {chosen.length}
        </span>
        <button
          type="button"
          style={{ ...button, opacity: idle && chosen.length > 0 ? 1 : 0.6 }}
          aria-busy={busy === "describing"}
          disabled={!idle || chosen.length === 0}
          onClick={describeChosen}
        >
          {busy === "describing" ? t("manager.skill.describing") : t("manager.skill.describe")}
        </button>
        <button
          type="button"
          style={{ ...primaryButton, opacity: idle && chosen.length > 0 ? 1 : 0.6 }}
          aria-busy={busy === "exporting"}
          disabled={!idle || chosen.length === 0}
          onClick={runExport}
        >
          {busy === "exporting" ? t("manager.skill.exporting") : t("manager.skill.export")}
        </button>
      </div>

      {loadError !== null && (
        <span role="alert" style={errorText}>
          <span>{t("manager.skill.loadFailed")}</span>
          <span style={errorDetail} title={loadError}>
            {loadError}
          </span>
        </span>
      )}
      {loadError === null && prompts === null && <span style={muted}>{t("list.loading")}</span>}
      {loadError === null && prompts !== null && visible.length === 0 && (
        <span style={muted}>{t("manager.skill.empty")}</span>
      )}

      {loadError === null && visible.length > 0 && (
        <div role="list">
          {visible.map((prompt) => {
            const recorded = descriptors[prompt.id];
            const descriptor = recorded?.ok ? recorded.descriptor : undefined;
            const pre = precheckExport(prompt, descriptor);
            /**
             * D-1（T6）：已导出条目的目录名已锁定 ⇒ 行内必须看得出「落盘就是这个名字」，
             * 否则「AI 补全显示的名字」与「最终目录名」不一致本身就是误导。
             */
            const locked = exportNameLocked(prompt);
            return (
              <div key={prompt.id} role="listitem" aria-label={prompt.title} style={listRow}>
                <input
                  type="checkbox"
                  aria-label={prompt.title}
                  checked={selected.includes(prompt.id)}
                  disabled={!idle}
                  onChange={() => setSelected(toggleSelected(selected, prompt.id))}
                />
                <span style={rowText}>
                  <span style={rowTitle}>{prompt.title}</span>
                  <span style={rowMeta}>
                    {(prompt.tags ?? []).map((name) => (
                      <span key={name} style={tagChip}>
                        {name}
                      </span>
                    ))}
                    <span style={muted}>
                      {t("manager.skill.nameLabel")}：{pre.ok ? pre.name : (prompt.skillName ?? descriptor?.name ?? "—")}
                      {locked ? " · " + t("manager.skill.nameLocked") : ""}
                    </span>
                  </span>
                  {recorded !== undefined && recorded.ok && (
                    <span style={muted}>
                      {recorded.descriptor.name} — {recorded.descriptor.description}
                      {/* 名字已锁定时说清楚：这个 AI 名不会改目录（描述与 whenToUse 仍会用它）。 */}
                      {locked ? " · " + t("manager.skill.aiNameIgnored") : ""}
                    </span>
                  )}
                  {recorded !== undefined && !recorded.ok && (
                    <span role="alert" style={errorText}>
                      <span>{t(recorded.errorKey)}</span>
                      <span style={errorDetail} title={recorded.detail}>
                        {recorded.detail}
                      </span>
                    </span>
                  )}
                  {/* 预校验失败只在**勾选后**标注：未勾选的条目不该满屏飘红。 */}
                  {!pre.ok && selected.includes(prompt.id) && (
                    <span role="alert" style={errorText}>
                      <span>{t(pre.errorKey)}</span>
                      <span style={errorDetail} title={pre.detail}>
                        {pre.detail}
                      </span>
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {fatal !== null && (
        <span role="alert" style={errorText}>
          <span>{t("manager.skill.exportFailed")}</span>
          <span style={errorDetail} title={fatal}>
            {fatal}
          </span>
        </span>
      )}

      {summary !== null && (
        <>
          <span style={dialogTitle}>{t("manager.skill.summary")}</span>
          <span role="status" aria-live="polite" style={muted}>
            {t("manager.skill.summaryOk")} {summary.okCount} · {t("manager.skill.summaryFailed")} {summary.failCount}
            {summary.declinedCount > 0 ? ` · ${t("manager.skill.summaryDeclined")} ${summary.declinedCount}` : ""}
          </span>
          {summary.exported.map((outcome) => (
            <span key={outcome.id} style={muted}>
              ✓ {outcome.title} → {outcome.name} · {t("manager.skill.target")}{" "}
              <span style={errorDetail} title={outcome.path}>
                {outcome.path}
              </span>
            </span>
          ))}
          {summary.failed.map((outcome) => (
            <span key={outcome.id} role="alert" style={errorText}>
              <span>
                ✗ {outcome.title} · {t(outcome.errorKey)}
              </span>
              <span style={errorDetail} title={outcome.detail}>
                {outcome.detail}
              </span>
            </span>
          ))}
          {summary.declined.map((outcome) => (
            <span key={outcome.id} style={muted}>
              – {outcome.title} · {t("manager.skill.declined")}
            </span>
          ))}
          <div style={actions}>
            <button type="button" style={button} onClick={onBack}>
              {t("manager.skill.back")}
            </button>
          </div>
        </>
      )}
    </>
  );
}
