import type { CSSProperties } from "react";

/** 宿主主题 token 的读取口径：一律用 --dsw-alias-* 变量，不写死颜色（规格 §7.5）。 */
export const TOKEN = {
  bg: "var(--dsw-alias-bg-elevated, #ffffff)",
  fg: "var(--dsw-alias-text-primary, #1f2328)",
  muted: "var(--dsw-alias-text-secondary, #6b7280)",
  border: "var(--dsw-alias-border-secondary, #e5e7eb)",
  accent: "var(--dsw-alias-text-accent, #2563eb)",
  hover: "var(--dsw-alias-bg-hover, rgba(0,0,0,0.04))",
} as const;

/** 浮层容器样式：官方座位默认 click-through，必须自行开启 pointer-events。 */
export const overlayBase: CSSProperties = {
  pointerEvents: "auto",
  background: TOKEN.bg,
  color: TOKEN.fg,
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 10,
  boxShadow: "0 8px 24px rgba(0,0,0,0.16)",
};
