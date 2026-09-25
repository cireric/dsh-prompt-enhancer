/**
 * `sidebar.footer.action` 入口（P6-2(a) / 规格 §7.3 / 验收 18）：左侧下方（设置按钮旁）打开管理面板。
 *
 * 契约（T2 约束 B2，源码 + 活体双证据）：`kind: list` / `scope: root` / owner props = `{ wide: boolean }`；
 * 该行**已有 3 个 occupant**，故本入口不得假设自己是唯一元素：`wide === false`（56px 收起轨道）
 * 只出图标，`wide === true` 才带文字。受 `settings.showSidebarButton` 门控（读共享响应式 store，
 * 改了就即时生效，不再是 mount 时读一次——见下方 `useSettings()`）。
 *
 * 与输入框旁的词库按钮**不耦合**（D-P6-1）：两者都只调 `openManager()`，共享状态在 `ui-state.ts`。
 */
import * as React from "react";
import type { PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import type { SidebarFooterActionOwnerProps } from "@deepseek-ai/dsh-client-ui-sidebar/client";
import { useSettings } from "../utils/settings-store.ts";
import { TOKEN } from "../utils/theme.ts";
import { openManager } from "../utils/ui-state.ts";

/**
 * 组件 props = 注册面（owner 面 `{ wide }` + 全局标准面）∩ 本插件的 locale 面。
 * `SidebarFooterActionOwnerProps` 由 `PropsRuntime<'sidebar.footer.action'>` 带入，这里再显式列出，
 * 使「宽窄两态来自宿主 owner 面」在类型层可见（同一契约，不是第二处事实源）。
 */
export type SidebarPromptEntryProps = PropsRuntime<"sidebar.footer.action"> &
  PropsLocale<"prompt-enhancer"> &
  SidebarFooterActionOwnerProps;

/**
 * 宽窄两态：`wide === false` 是 56px 收起轨道，只放图标（正方形点击区）；`wide === true` 出文字。
 * 宽态几何与宿主条目同形（P8 T8，反馈 F1；R1 两条修复 + R2 由活体读数驱动的一处纠正）：内容左对齐、
 * 行高 42、宿主实测的非对称内边距 `0 10px 0 8px`（内容起始 x 与宿主相同）、无自绘描边、`overflow: hidden`、
 * `line-height: 22`（后两项同宿主 `.trigger`）。
 * 横向填满该行用 `alignSelf: "stretch"`（交叉轴填满，flex 原生）而**不是** `flex: "1"`：本按钮的宿主容器
 * `footerActions` 是 **column** 容器（活体实测：`flex: "1"` = `1 1 0%` 的 flex-basis 走纵轴，直接盖掉
 * `height: 42`，行高塌成 15px），故 `flex` 恒为 `"0 0 auto"`；`alignSelf: "stretch"` 在 column 容器里
 * 沿交叉轴（水平）填满，若容器是 row 则退化为无害的 no-op（`height` 已显式给定）。
 * 宿主 `SidebarRoot.module.css:388-389`：每个 occupant 自负 button geometry；
 * 轨道态保持 P6 活体验收时的现状（28×28、内容居中、无内边距、含 1px 描边——56px 轨道是另一视觉语境）。
 * 仍不引任何 UI 依赖。
 */
function entryStyle(wide: SidebarFooterActionOwnerProps["wide"]): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: wide ? "flex-start" : "center",
    gap: 4,
    height: wide ? 42 : 28,
    width: wide ? undefined : 28,
    alignSelf: wide ? "stretch" : undefined,
    padding: wide ? "0 10px 0 8px" : 0,
    flex: "0 0 auto",
    minWidth: wide ? 0 : undefined,
    overflow: wide ? "hidden" : undefined,
    lineHeight: wide ? 22 : undefined,
    fontSize: 12,
    color: TOKEN.fg,
    background: "transparent",
    border: wide ? "none" : `1px solid ${TOKEN.border}`,
    borderRadius: 6,
    cursor: "pointer",
  };
}

export function SidebarPromptEntry({ t, wide }: SidebarPromptEntryProps): React.ReactElement | null {
  /**
   * 设置改读**共享响应式 store**（P8 T1）：宿主 scope 每次已提交变更都推一次快照，入口的显隐随之
   * 即时生效——不再是「mount 时读一次」。无 scope 时 store 给默认值（不再有未就绪的 null 态）。
   */
  const settings = useSettings();

  if (!settings.showSidebarButton) return null;

  return (
    <button
      type="button"
      style={entryStyle(wide)}
      title={t("sidebar.entry.tip")}
      aria-label={t("sidebar.entry.title")}
      aria-haspopup="dialog"
      onClick={() => openManager()}
    >
      <BookIcon />
      {wide && <span>{t("sidebar.entry.title")}</span>}
    </button>
  );
}

/** 书本图标（随文本色）：内联 SVG，不引 `@deepseek-ai/dsh-client-ui-primitives`（R20 禁新增 external 导入）。 */
function BookIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={ICON}>
      <path
        d="M4 5.5C4 4.7 4.7 4 5.5 4H11v15H5.5C4.7 19 4 18.3 4 17.5v-12Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M20 5.5C20 4.7 19.3 4 18.5 4H13v15h5.5c.8 0 1.5-.7 1.5-1.5v-12Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 图标盒（与 AIPolishButton 的 SparkleIcon 同形）。 */
const ICON: React.CSSProperties = { display: "block", flex: "0 0 auto" };
