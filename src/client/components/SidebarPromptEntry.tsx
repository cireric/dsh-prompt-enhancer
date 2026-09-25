/**
 * `sidebar.footer.action` 入口（P6-2(a) / 规格 §7.3 / 验收 18）：左侧下方（设置按钮旁）打开管理面板。
 *
 * 契约（T2 约束 B2，源码 + 活体双证据）：`kind: list` / `scope: root` / owner props = `{ wide: boolean }`；
 * 该行**已有 3 个 occupant**，故本入口不得假设自己是唯一元素：`wide === false`（56px 收起轨道）
 * 只出图标，`wide === true` 才带文字。受 `settings.showSidebarButton` 门控（mount 时读一次）。
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
 * 视觉与词库按钮同族（24–28px 高、1px 描边、6px 圆角），不引任何 UI 依赖。
 */
function entryStyle(wide: SidebarFooterActionOwnerProps["wide"]): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    height: 28,
    width: wide ? undefined : 28,
    padding: wide ? "0 8px" : 0,
    flex: "0 0 auto",
    fontSize: 12,
    color: TOKEN.fg,
    background: "transparent",
    border: `1px solid ${TOKEN.border}`,
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
