import type { CSSProperties } from "react";
import { TOKEN } from "../utils/theme.ts";

export const HEADER: CSSProperties = { color: TOKEN.muted, fontSize: 11, fontWeight: 600 };
export const MUTED: CSSProperties = { color: TOKEN.muted, fontSize: 11, overflowWrap: "anywhere" };

export const PREVIEW: CSSProperties = {
  color: TOKEN.muted,
  fontSize: 11,
  overflowWrap: "anywhere",
  whiteSpace: "pre-wrap",
  maxHeight: 72,
  overflowY: "auto",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  padding: "4px 6px",
};

export const TEXTAREA: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  resize: "vertical",
  padding: "6px 8px",
  color: TOKEN.fg,
  background: "transparent",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  fontSize: 12,
  fontFamily: "inherit",
};

export const ACTIONS: CSSProperties = { display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" };

export const PANEL_BUTTON: CSSProperties = {
  padding: "2px 8px",
  fontSize: 11,
  lineHeight: "16px",
  color: TOKEN.fg,
  background: "transparent",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  cursor: "pointer",
};

export const PRIMARY: CSSProperties = { ...PANEL_BUTTON, color: TOKEN.accent, borderColor: TOKEN.accent };
export const MENU_BUTTON: CSSProperties = {
  ...PANEL_BUTTON, textAlign: "start", padding: "6px 9px", fontSize: 12, borderColor: "transparent", overflowWrap: "anywhere",
};
export const DISABLED_MODE: CSSProperties = { ...MENU_BUTTON, opacity: 0.5, cursor: "default" };

export const RESULT_CONTENT: CSSProperties = {
  flex: "1 1 auto",
  minHeight: 0,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: 2,
};

export const RESULT_ACTIONS: CSSProperties = {
  ...ACTIONS,
  flex: "0 0 auto",
  paddingTop: 8,
  borderTop: `1px solid ${TOKEN.border}`,
};
