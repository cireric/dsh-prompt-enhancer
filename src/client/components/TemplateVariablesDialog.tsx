/**
 * 模板变量填充弹窗：`{{变量}}` 逐个给输入框，确认后回填正文。
 *
 * 组件自身不做定位，只画一张自包含的卡片（`overlayBase`）：落点由调用方决定
 * ——任务 5 的 `PromptLibraryButton` 把它放进词库面板，任务 6 的 `#` 候选浮层
 * 放进同一个浮层容器；开合也由调用方管（挂载即打开，卸载即关闭）。
 *
 * 占位语义不动：未填写的变量交给 `fillTemplate` 原样保留，绝不填空串。
 */
import * as React from "react";
import type { TranslateNS } from "@deepseek-ai/dsh-client-ui-slots";
import type { TemplateVariable } from "../../types.ts";
import { api, CLEAR_TIMEOUT_MS } from "../utils/api.ts";
import { en, zh } from "../utils/i18n.ts";
import { fillTemplate, initialTemplateValues, parseVariables, parseMemory, pickRemembered, templateMemoryKey, unfilledVariables } from "../utils/template.ts";
import { TOKEN, overlayBase } from "../utils/theme.ts";

const NO_VARIABLES: readonly TemplateVariable[] = [];

/** 任务 6 依赖的对外接口：正文 + 取消 + 回填。 */
export type TemplateVariablesDialogProps = {
  /** 含 `{{变量}}` 的正文（模板原样，不是填充后的结果）。 */
  body: string;
  variables?: readonly TemplateVariable[];
  /** 取消：关窗且不改草稿；由调用方卸载本组件。 */
  onCancel: () => void;
  /** 确认：回传填充后的正文；由调用方卸载本组件并落草稿。 */
  onFilled?: (filledBody: string) => void;
  confirmLabel?: string;
  applyNotice?: string;
  panelSize?: Pick<React.CSSProperties, "width" | "height">;
  /** 应用到草稿前，未填项需要显式选择保留。 */
  confirmUnfilled?: boolean;
  promptId?: string;
  focusVariable?: string;
  /**
   * 宿主 locale 座位（`PropsLocale<'prompt-enhancer'>` 的 `t`）。
   *
   * 可选：`t` 只在插槽边界注入（ui-slots 没有可读的 locale React context），
   * 嵌套组件拿不到；调用方手上有 `t` 就传进来，词库按钮与任务 6 的 `#` 浮层都有。
   * 缺省时按宿主 locale 服务写入的 `<html lang>`（`dsh-client-locale` 的
   * `syncDocumentLanguage`）在 zh/en 之间兜底，语言仍跟宿主一致。
   */
  t?: TranslateNS<"prompt-enhancer">;
};

/** 宿主当前语言：优先 locale 服务同步到 `<html lang>` 的值，非浏览器环境退回 navigator。 */
function hostLanguage(): string {
  if (typeof document !== "undefined" && document.documentElement.lang !== "") {
    return document.documentElement.lang;
  }
  if (typeof navigator !== "undefined" && navigator.language !== "") return navigator.language;
  return "en";
}

/** 缺省翻译：按宿主语言在 zh/en 之间选一份字典。 */
function fallbackTranslate(): TranslateNS<"prompt-enhancer"> {
  const dict: Record<string, string> = hostLanguage().toLowerCase().startsWith("zh") ? zh : en;
  return (key: string) => dict[key] ?? key;
}

export function TemplateVariablesDialog({
  body,
  variables = NO_VARIABLES,
  onCancel,
  onFilled,
  confirmLabel,
  applyNotice,
  panelSize,
  confirmUnfilled = false,
  promptId,
  focusVariable,
  t,
}: TemplateVariablesDialogProps): React.ReactElement {
  const tr = t ?? fallbackTranslate();
  const expanded = panelSize?.height !== undefined;
  const names = React.useMemo(() => parseVariables(body), [body]);
  const focusedName = focusVariable && names.includes(focusVariable) ? focusVariable : names[0];
  const configured = new Map(variables.map((variable) => [variable.name, variable]));
  const [values, setValues] = React.useState<Record<string, string>>({});
  const filledValues = { ...initialTemplateValues(body, variables), ...values };
  const [remembered, setRemembered] = React.useState(false);
  const [rememberValues, setRememberValues] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saveFailed, setSaveFailed] = React.useState(false);
  const restoreDefaults = React.useRef(false);
  const savingRef = React.useRef(false);
  const active = React.useRef(false);
  const latestOnFilled = React.useRef(onFilled);
  const savedMemory = React.useRef<{ key: string; value: string | null } | null>(null);
  const memoryKey = promptId === undefined ? undefined : templateMemoryKey(promptId);

  React.useLayoutEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  React.useLayoutEffect(() => {
    latestOnFilled.current = onFilled;
  }, [onFilled]);

  React.useEffect(() => {
    if (!memoryKey) return;
    let alive = true;
    api.getMeta(memoryKey).then(
      (raw) => {
        if (!alive || restoreDefaults.current || savingRef.current) return;
        const prefill = pickRemembered(body, parseMemory(raw));
        if (!Object.keys(prefill).length) return;
        setValues((previous) => ({ ...prefill, ...previous }));
        setRemembered(true);
      },
      (error: unknown) => console.warn("[prompt-enhancer] 读取模板变量记忆失败", error),
    );
    return () => { alive = false; };
  }, [body, memoryKey]);

  const filled = fillTemplate(body, filledValues);
  const unfilled = unfilledVariables(names, filledValues);
  const needsDecision = confirmUnfilled && unfilled.length > 0;
  const commit = async (): Promise<void> => {
    if (!onFilled || savingRef.current) return;
    if (!memoryKey || (!rememberValues && !restoreDefaults.current)) {
      onFilled(filled);
      return;
    }

    const value = rememberValues ? JSON.stringify(pickRemembered(body, filledValues)) : null;
    if (savedMemory.current?.key === memoryKey && savedMemory.current.value === value) {
      onFilled(filled);
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setSaveFailed(false);
    try {
      if (value === null) {
        await api.deleteMeta(memoryKey);
      } else {
        await api.setMeta(memoryKey, value, CLEAR_TIMEOUT_MS);
      }
      savedMemory.current = { key: memoryKey, value };
    } catch (error) {
      console.warn("[prompt-enhancer] 保存模板变量记忆失败", error);
      if (active.current) setSaveFailed(true);
      return;
    } finally {
      savingRef.current = false;
      if (active.current) setSaving(false);
    }
    if (active.current) latestOnFilled.current?.(filled);
  };

  return (
    <div
      style={{
        ...CARD,
        width: panelSize?.width ?? CARD.width,
        ...(expanded ? { height: panelSize.height, maxHeight: undefined, padding: 12, overflow: "hidden" } : {}),
      }}
      role="dialog"
      aria-label={tr("vars.title")}
    >
      <form style={expanded ? EXPANDED_FORM : FORM} onSubmit={(event) => {
        event.preventDefault();
        if (!needsDecision) void commit();
      }}>
        <div style={TITLE}>{tr("vars.title")}</div>
        <div style={HINT}>{tr("vars.hint")}</div>
        {remembered && <div style={REMEMBERED}>{tr("vars.remembered")}</div>}
        <div style={expanded ? EXPANDED_FIELDS : FORM}>
          {names.map((name) => (
            <label key={name} style={FIELD}>
              <span style={LABEL}>{name}</span>
              {configured.get(name)?.description && <span style={HINT}>{configured.get(name)?.description}</span>}
              <input
                type="text"
                style={INPUT}
                value={Object.hasOwn(filledValues, name) ? filledValues[name] : ""}
                disabled={saving}
                autoFocus={name === focusedName}
                aria-label={name}
                onChange={(ev) => {
                  const next = ev.currentTarget.value;
                  setValues((prev) => ({ ...prev, [name]: next }));
                }}
              />
            </label>
          ))}
          {unfilled.length > 0 && (
            <div role="status" style={HINT}>{tr("vars.unfilled")} {unfilled.join(", ")}</div>
          )}
        </div>
        <div style={expanded ? EXPANDED_PREVIEW_FIELD : FIELD}>
          <span style={TITLE}>{tr("vars.preview")}</span>
          <pre style={expanded ? EXPANDED_PREVIEW : PREVIEW} tabIndex={0}>{filled}</pre>
        </div>
        {memoryKey && onFilled && (
          <div style={MEMORY_ACTIONS}>
            <label>
              <input type="checkbox" checked={rememberValues} disabled={saving} onChange={(event) => {
                setRememberValues(event.currentTarget.checked);
                setSaveFailed(false);
              }} />
              {tr("vars.rememberTemplate")}
            </label>
            <button type="button" style={GHOST} disabled={saving} onClick={() => {
              restoreDefaults.current = true;
              setValues({});
              setRememberValues(false);
              setRemembered(false);
              setSaveFailed(false);
            }}>{tr("vars.restoreDefaults")}</button>
          </div>
        )}
        {applyNotice && <div role="alert" style={HINT}>{applyNotice}</div>}
        {saveFailed && (
          <div role="alert" style={MEMORY_ACTIONS}>
            <span style={HINT}>{tr("vars.memoryFailed")}</span>
            <button type="button" style={GHOST} onClick={() => onFilled?.(filled)}>{tr("vars.continueWithoutMemory")}</button>
          </div>
        )}
        <div style={ACTIONS}>
          {onFilled && (needsDecision ? (
            <button type="button" style={PRIMARY} disabled={saving} onClick={() => void commit()}>{tr("vars.applyWithPlaceholders")}</button>
          ) : (
            <button type="submit" style={PRIMARY} disabled={saving}>{confirmLabel ?? tr("vars.fill")}</button>
          ))}
          <button type="button" style={GHOST} disabled={saving} onClick={onCancel}>
            {tr("vars.cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}

const CARD: React.CSSProperties = {
  ...overlayBase,
  width: "min(360px, calc(100vw - 32px))",
  boxSizing: "border-box",
  maxWidth: "100%",
  maxHeight: "min(460px, calc(100dvh - 130px))",
  overflowY: "auto",
  padding: 10,
  fontSize: 12,
  lineHeight: 1.5,
};

const FORM: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 8 };

const TITLE: React.CSSProperties = { color: TOKEN.fg, fontSize: 12, fontWeight: 600 };

const HINT: React.CSSProperties = { color: TOKEN.muted, fontSize: 11 };

const REMEMBERED: React.CSSProperties = { color: TOKEN.accent, fontSize: 11 };

const FIELD: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 3 };

const LABEL: React.CSSProperties = { color: TOKEN.muted, fontSize: 11 };

const INPUT: React.CSSProperties = {
  padding: "4px 6px",
  fontSize: 12,
  color: TOKEN.fg,
  background: "transparent",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
};

const ACTIONS: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  flexWrap: "wrap",
  flexShrink: 0,
  marginTop: 2,
};

const BUTTON: React.CSSProperties = {
  padding: "3px 10px",
  fontSize: 11,
  color: TOKEN.fg,
  background: "transparent",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  cursor: "pointer",
};

const PRIMARY: React.CSSProperties = { ...BUTTON, color: TOKEN.accent, borderColor: TOKEN.accent };

const GHOST: React.CSSProperties = { ...BUTTON, color: TOKEN.muted };


const PREVIEW: React.CSSProperties = {
  margin: 0, padding: 8, maxHeight: 150, overflowY: "auto",
  background: TOKEN.hover, borderRadius: 6, whiteSpace: "pre-wrap",
  overflowWrap: "anywhere", font: "inherit", lineHeight: 1.55,
};


const EXPANDED_FORM: React.CSSProperties = { ...FORM, height: "100%", overflowY: "auto", padding: 2, boxSizing: "border-box" };

const EXPANDED_FIELDS: React.CSSProperties = {
  ...FORM,
  flex: "0 1 auto",
  minHeight: 48,
  maxHeight: "38%",
  overflowY: "auto",
  padding: 2,
};

const EXPANDED_PREVIEW_FIELD: React.CSSProperties = { ...FIELD, flex: "1 0 84px", minHeight: 0 };

const EXPANDED_PREVIEW: React.CSSProperties = {
  ...PREVIEW,
  flex: "1 1 0",
  minHeight: 0,
  maxHeight: undefined,
  fontSize: 13,
};


const MEMORY_ACTIONS: React.CSSProperties = {
  display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 4,
};
