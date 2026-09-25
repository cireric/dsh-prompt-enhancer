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
import { notifyDataChanged } from "../utils/data-sync.ts";
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
  describeEach,
  exportEach,
  filterByTag,
  isAllSelected,
  pickSelected,
  precheckExport,
  summarizeExport,
  toggleAllVisible,
  toggleSelected,
  type DescriptorOutcome,
  type ExportOutcome,
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

  React.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  React.useEffect(() => {
    let alive = true;
    setPrompts(null);
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
  }, []);

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
          (id, outcome) => {
            if (aliveRef.current) setDescriptors((prev) => ({ ...prev, [id]: outcome }));
          },
        );
      } catch (err) {
        // describeEach 逐条兜错，走到这里说明是编排层的意外——显式报出（不得空吞）。
        console.warn("[prompt-enhancer] 技能补全编排异常", err);
        if (aliveRef.current) setFatal(reasonOf(err));
      } finally {
        if (aliveRef.current) setBusy("idle");
      }
    })();
  };

  /** 逐条导出：预校验 → 请求 → 409 走共享确认 → 带 conflictConfirmed 重试（全在纯函数里）。 */
  const runExport = (): void => {
    if (!idle || chosen.length === 0) return;
    setBusy("exporting");
    setOutcomes(null);
    setFatal(null);
    void (async () => {
      try {
        const results = await exportEach({
          prompts: chosen,
          descriptors,
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
        });
        if (!aliveRef.current) return;
        setOutcomes(results);
        // 有成功条目 ⇒ 宿主已回写 skillName / skillExportedAt：广播一次，让列表页等消费者重拉。
        if (results.some((outcome) => outcome.status === "exported")) notifyDataChanged();
      } catch (err) {
        console.warn("[prompt-enhancer] 技能导出编排异常", err);
        if (aliveRef.current) setFatal(reasonOf(err));
      } finally {
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
                      {t("manager.skill.nameLabel")}：{pre.ok ? pre.name : (descriptor?.name ?? prompt.skillName ?? "—")}
                    </span>
                  </span>
                  {recorded !== undefined && recorded.ok && (
                    <span style={muted}>{recorded.descriptor.name} — {recorded.descriptor.description}</span>
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
