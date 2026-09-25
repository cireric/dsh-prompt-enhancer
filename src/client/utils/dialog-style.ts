/**
 * 弹窗共享样式（P6 起，管理面板与后续标签 / 回收站 / 导入导出弹窗复用）。
 *
 * 口径与 theme.ts 一致：颜色一律走宿主 `--dsw-alias-*` 令牌，不写死颜色（规格 §7.5）；
 * 只导出**内联样式常量**，不注入 `<style>`、不改宿主 DOM（全局硬约束 3：零 DOM 注入）。
 * 上游 `common/*` 与 `dialog-style.ts` 的类名方案（`.pl-dialog` + CSS 注入）不移植（P6-9(a) 重写口径）。
 */
import type { CSSProperties } from "react";
import { TOKEN, overlayBase } from "./theme.ts";

/** 遮罩：铺满整个 frame，只有点在遮罩自身（不是卡片内）才算「点外面关」。 */
export const backdrop: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 100,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  background: "rgba(0, 0, 0, 0.35)",
};

/**
 * 弹窗卡片表面：尺寸来自设置（`panelWidth` / `panelHeight`），并在视口内夹住——
 * 小窗口下不会溢出到屏幕外（`maxWidth/Height` 由 CSS 计算，无需读 viewport）。
 */
export function surface(width: number, height: number): CSSProperties {
  return {
    ...overlayBase,
    display: "flex",
    flexDirection: "column",
    width,
    height,
    maxWidth: "calc(100vw - 40px)",
    maxHeight: "calc(100vh - 40px)",
    overflow: "hidden",
    fontSize: 12,
  };
}

/**
 * 头部容器：**两行纵向**（P8 T9 的最小修，源自反馈 F2）——
 * 第 1 行 = 标题 + 关闭（`dialogHeaderTop`），第 2 行 = 四页签 + 导出为技能（`dialogHeaderBottom`）。
 * 改前是「标题 + 四页签 + 导出 + 关闭」压在**同一行 nowrap**、页签区自带横向滚动，
 * 默认面板宽（420）下页签被右侧按钮裁切；纵向拆行后页签区拿到整行宽度，不再被裁。
 */
export const dialogHeader: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: "10px 12px",
  borderBottom: `1px solid ${TOKEN.border}`,
  flex: "0 0 auto",
};

/** 头部第 1 行：标题（左）+ 关闭按钮（右，靠 `marginLeft: "auto"` 推到行尾）。 */
export const dialogHeaderTop: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

/** 头部第 2 行：四页签（左）+ 导出为技能（右，靠 `marginLeft: "auto"` 推到行尾）。 */
export const dialogHeaderBottom: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

export const dialogTitle: CSSProperties = { color: TOKEN.fg, fontSize: 13, fontWeight: 600, flex: "0 0 auto" };

/** 页签行：**可换行**（去掉 `overflowX: "auto"`）——这是「页签不再被裁切」的关键。 */
export const dialogTabs: CSSProperties = {
  display: "flex",
  gap: 4,
  flex: "1 1 auto",
  minWidth: 0,
  flexWrap: "wrap",
};

/** 页签按钮；选中态用 accent 描边 + hover 底色。 */
export function dialogTab(active: boolean): CSSProperties {
  return {
    padding: "2px 10px",
    fontSize: 11,
    lineHeight: "18px",
    color: active ? TOKEN.accent : TOKEN.muted,
    background: active ? TOKEN.hover : "transparent",
    border: `1px solid ${active ? TOKEN.accent : TOKEN.border}`,
    borderRadius: 999,
    cursor: "pointer",
    whiteSpace: "nowrap",
    flex: "0 0 auto",
  };
}

/** 内容区：唯一滚动容器（R25：不做分页，用可滚动容器 + 每行摘要）。 */
export const dialogBody: CSSProperties = {
  flex: "1 1 auto",
  minHeight: 0,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 12,
};

/** 工具行（搜索 / 排序 / 标签筛选 / 新建）。 */
export const toolbar: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 6,
  flex: "0 0 auto",
};

export const textInput: CSSProperties = {
  boxSizing: "border-box",
  minWidth: 0,
  padding: "4px 8px",
  color: TOKEN.fg,
  background: "transparent",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  fontSize: 12,
  fontFamily: "inherit",
  outline: "none",
};

export const textArea: CSSProperties = {
  ...textInput,
  width: "100%",
  resize: "vertical",
  padding: "6px 8px",
  lineHeight: 1.5,
};

/** 下拉与输入同形；原生 select 的字体继承需要显式声明。 */
export const select: CSSProperties = { ...textInput, cursor: "pointer" };

/** 字段标签（详情页每行的字段名）。 */
export const fieldLabel: CSSProperties = { color: TOKEN.muted, fontSize: 11, flex: "0 0 auto", width: 42 };

/** 详情页一行：字段名 + 控件。 */
export const fieldRow: CSSProperties = { display: "flex", alignItems: "flex-start", gap: 6 };

/** 次要按钮（关闭 / 返回 / 编辑 / 删除）。 */
export const button: CSSProperties = {
  padding: "2px 8px",
  fontSize: 11,
  lineHeight: "16px",
  color: TOKEN.fg,
  background: "transparent",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  cursor: "pointer",
  flex: "0 0 auto",
};

/** 主按钮（保存 / 切换 / 新建）：accent 描边。 */
export const primaryButton: CSSProperties = { ...button, borderColor: TOKEN.accent, color: TOKEN.accent };

/** 动作行：右对齐。 */
export const actions: CSSProperties = { display: "flex", gap: 6, justifyContent: "flex-end", flex: "0 0 auto" };

export const muted: CSSProperties = { color: TOKEN.muted, fontSize: 11, overflowWrap: "anywhere" };

export const errorText: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  color: TOKEN.fg,
  fontSize: 11,
};

export const errorDetail: CSSProperties = { color: TOKEN.muted, overflowWrap: "anywhere" };

/** 列表行：文字块 + 动作块。 */
export const listRow: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  padding: "6px 0",
  borderTop: `1px solid ${TOKEN.border}`,
};

export const rowText: CSSProperties = { display: "flex", flexDirection: "column", gap: 2, flex: "1 1 auto", minWidth: 0 };

export const rowTitle: CSSProperties = {
  color: TOKEN.fg,
  fontSize: 12,
  fontWeight: 600,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

export const rowMeta: CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4 };

export const tagChip: CSSProperties = {
  color: TOKEN.accent,
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 999,
  padding: "0 6px",
  fontSize: 10,
};

/** §4.4 的并排对比：两块等宽只读区。 */
export const compareGrid: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 };

export const compareBlock: CSSProperties = { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 };

export const compareHead: CSSProperties = { color: TOKEN.muted, fontSize: 11, fontWeight: 600 };

/** 只读正文块：保留换行，长串可断（长 URL / 无空格正文不撑破弹窗）。 */
export const compareBody: CSSProperties = {
  flex: "1 1 auto",
  minHeight: 0,
  maxHeight: 180,
  overflowY: "auto",
  color: TOKEN.fg,
  fontSize: 11,
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  padding: "4px 6px",
};
