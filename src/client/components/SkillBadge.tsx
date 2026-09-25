/**
 * 技能状态徽标（P7 T3 / 规格 §7.6 / 验收 16）：**列表行与详情页共用同一个**组件。
 *
 * 三态由 `src/skill-badge.ts` 的纯函数给出（本文件不写第二份判定）：
 *   `none`     → `skillName` 空（从未导出）⇒ **不渲染任何东西**；
 *   `exported` → 「已导出技能 <name>」；
 *   `stale`    → 「技能已过期」+「重新导出」按钮。
 *
 * 配色按规格 §7.6：**未过期 = 绿**（`--dsw-alias-state-success-primary`）、**已过期 = 警示色**
 * （`--dsw-alias-state-warn-label`）。色名由 `skillBadgeVisual` 给（纯函数），色值来自 `theme.ts` 的
 * `TONE`——组件里不出现颜色字面量、不注入 `<style>`。
 *
 * 一键重导（机制见 `reExportSkill` 的注释）：只发 `{ promptId }` + 首次导出时落在 meta 里的
 * `descriptor`（R-P7-AA：不带它宿主会丢 `whenToUse`、并把 `description` 降级成兜底链）⇒ **同名覆盖
 * 同一目录、不新增目录**，也不再跑一次 AI 补名补描述。成功后 `notifyDataChanged()` 让列表页等
 * 消费者重拉；详情页另经 `onReExported` 拿宿主回执**就地**换掉本地记录——详情页不订阅数据变更
 * 事件（只广播的话它自己的徽标不会消失）。
 *
 * 零 DOM 注入：只用内联样式与 dialog-style / theme 的既有 token，不注入 `<style>`、不碰宿主 DOM。
 * 本文件是 `.tsx`，进不了 `node --test`（本仓库无 react-dom，Node 的类型擦除也不认 JSX）⇒
 * 纯语义全部在 `tests/skill-badge.test.mjs`，**接线**归 T5 活体验收（不在此造空洞断言）。
 */
import * as React from "react";
import type { TranslateNS } from "@deepseek-ai/dsh-client-ui-slots";
import { reExportSkill, skillBadgeState, skillBadgeVisual } from "../../skill-badge.ts";
import type { Prompt } from "../../types.ts";
import { type SkillExportReceipt, api } from "../utils/api.ts";
import { notifyDataChanged } from "../utils/data-sync.ts";
import { errorDetail, errorText, muted, primaryButton } from "../utils/dialog-style.ts";
import { loadStoredDescriptor } from "../utils/skill-export.ts";
import { TOKEN, TONE } from "../utils/theme.ts";

export interface SkillBadgeProps {
  /** 宿主的命名空间翻译函数（由 PromptManagerModal 透传）。 */
  t: TranslateNS<"prompt-enhancer">;
  /** 被标注的提示词：只读这四个字段（列表行直接传整条 `Prompt`）。 */
  prompt: Pick<Prompt, "id" | "skillName" | "updatedAt" | "skillExportedAt">;
  /** 重导成功后把**宿主回执**交给父级（详情页据此就地刷新；列表行不需要）。 */
  onReExported?: (receipt: SkillExportReceipt) => void;
}

/**
 * 徽标外形的唯一构造点：色值取 `TONE[tone]`（语义色），组件里**没有**颜色字面量。
 * `emphasize` = 过期态：加粗、且描边也走警示色，与「已导出」的浅描边一眼可分（规格 §7.6 的两态）。
 */
function chipStyle(tone: string, emphasize: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "0 6px",
    fontSize: 10,
    fontWeight: emphasize ? 600 : 400,
    color: tone,
    border: "1px solid " + (emphasize ? tone : TOKEN.border),
    borderRadius: 999,
  };
}

/** 徽标外层：状态 +（过期的）按钮 + 就地结果/错误，纵向堆叠，不撑破列表行。 */
const WRAP: React.CSSProperties = { display: "inline-flex", flexDirection: "column", gap: 2, minWidth: 0 };

/** 重导失败的两条措辞（`reExportSkill` 只回这两种键，键集在此收窄，渲染点不做字符串判断）。 */
type ReExportErrorKey = "manager.skill.exportFailed" | "manager.skill.pathMissing";

export function SkillBadge({ t, prompt, onReExported }: SkillBadgeProps): React.ReactElement | null {
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<{ key: ReExportErrorKey; detail: string } | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  /** 卸载后不再 setState（挂在列表行里时，一次重导就可能让整行被重拉替换掉）。 */
  const aliveRef = React.useRef(true);

  React.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const state = skillBadgeState(prompt);
  // 从未导出 → 不渲染（`skillName` 空）。判据只有一处：skill-badge.ts 的纯函数。
  if (state === "none") return null;
  // 色名 / 文案键 / 是否带动作 / 是否附名四件事都从这一个纯函数来（本组件不再判一次状态）。
  const visual = skillBadgeVisual(state);

  /** 一键重导：只发 promptId（同名覆盖同目录，机制见 reExportSkill）。失败显式落行内，绝不静默。 */
  const reExport = (): void => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    setNotice(null);
    void (async () => {
      // R-P7-AA：先把首次导出时落在 meta 里的 descriptor 读回来，**原样回传**——不带它宿主只能走
      // description 兜底链、并且丢掉 whenToUse。meta 缺失/损坏 ⇒ undefined（退回兜底链，且**不失败**），
      // 故这一步不会挡住重导；读失败只在 skill-export 里 warn（可见但不阻断）。
      const descriptor = await loadStoredDescriptor(prompt.id, api.getMeta);
      const outcome = await reExportSkill(prompt.id, api.exportPromptAsSkill, descriptor);
      if (!outcome.ok) console.warn("[prompt-enhancer] 重新导出技能失败", outcome.detail);
      // 成功即广播，**与组件在世与否无关**（同 T2 的 R-P7-X 要求 2）：宿主已写 skillExportedAt，
      // 列表页等消费者必须重拉，否则「重导成功但徽标还在」。
      if (outcome.ok) notifyDataChanged();
      if (!aliveRef.current) return;
      setBusy(false);
      if (outcome.ok) {
        setNotice(t("manager.skill.reExported"));
        onReExported?.(outcome.receipt);
      } else {
        setFailure({ key: outcome.errorKey, detail: outcome.detail });
      }
    })();
  };

  return (
    <span style={WRAP}>
      <span style={chipStyle(TONE[visual.tone], visual.action)}>
        {t(visual.labelKey)}
        {visual.showName && " " + (prompt.skillName ?? "")}
        {visual.action && (
          <button type="button" style={primaryButton} aria-busy={busy} disabled={busy} onClick={reExport}>
            {busy ? t("manager.skill.reExporting") : t("manager.skill.reExport")}
          </button>
        )}
      </span>
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
    </span>
  );
}