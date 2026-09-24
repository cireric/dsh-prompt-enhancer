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
import { api } from "../utils/api.ts";
import { en, zh } from "../utils/i18n.ts";
import { fillTemplate, memoryKey, parseVariables, pickRemembered } from "../utils/template.ts";
import { TOKEN, overlayBase } from "../utils/theme.ts";

/** 任务 6 依赖的对外接口：正文 + 取消 + 回填。 */
export type TemplateVariablesDialogProps = {
  /** 含 `{{变量}}` 的正文（模板原样，不是填充后的结果）。 */
  body: string;
  /** 取消：关窗且不改草稿；由调用方卸载本组件。 */
  onCancel: () => void;
  /** 确认：回传填充后的正文；由调用方卸载本组件并落草稿。 */
  onFilled: (filledBody: string) => void;
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

/** 容错读取变量记忆：空值即「没有记忆」，非法 JSON 按空对象并留 console 痕迹。 */
function parseMemory(raw: string): Record<string, string> {
  if (raw.trim() === "") return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string") out[name] = value;
    }
    return out;
  } catch (err) {
    console.warn("[prompt-enhancer] " + memoryKey + " 不是合法 JSON，本次按无记忆处理", err);
    return {};
  }
}

export function TemplateVariablesDialog({
  body,
  onCancel,
  onFilled,
  t,
}: TemplateVariablesDialogProps): React.ReactElement {
  const tr = t ?? fallbackTranslate();
  const names = React.useMemo(() => parseVariables(body), [body]);
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [remembered, setRemembered] = React.useState(false);
  /** 落库的完整记忆（本轮未填的变量不被抹掉）。 */
  const memory = React.useRef<Record<string, string>>({});

  // 打开时读一次记忆：预填上次填过的值，并提示用户。
  React.useEffect(() => {
    let alive = true;
    api.getMeta(memoryKey).then(
      (raw) => {
        if (!alive) return;
        const stored = parseMemory(raw);
        memory.current = stored;
        const prefill = pickRemembered(body, stored);
        // 记忆是异步回来的：合并而不是覆盖，用户在这期间敲进去的值不被抹掉。
        setValues((prev) => {
          const next: Record<string, string> = { ...prefill };
          for (const [name, value] of Object.entries(prev)) if (value !== "") next[name] = value;
          return next;
        });
        setRemembered(Object.keys(prefill).length > 0);
      },
      (err: unknown) => {
        console.warn("[prompt-enhancer] " + memoryKey + " 读取失败，本次按无记忆处理", err);
      },
    );
    return () => {
      alive = false;
    };
  }, [body]);

  const confirm = (ev: React.FormEvent<HTMLFormElement>): void => {
    ev.preventDefault();
    const merged: Record<string, string> = { ...memory.current };
    for (const [name, value] of Object.entries(values)) if (value !== "") merged[name] = value;
    // 记忆写入不阻塞插入：失败只留 console 痕迹（宿主标准 props 无 toast 座位）。
    void api.setMeta(memoryKey, JSON.stringify(merged)).catch((err: unknown) => {
      console.warn("[prompt-enhancer] " + memoryKey + " 保存失败", err);
    });
    onFilled(fillTemplate(body, values));
  };

  return (
    <div style={CARD} role="dialog" aria-label={tr("vars.title")}>
      <form style={FORM} onSubmit={confirm}>
        <div style={TITLE}>{tr("vars.title")}</div>
        <div style={HINT}>{tr("vars.hint")}</div>
        {remembered && <div style={REMEMBERED}>{tr("vars.remembered")}</div>}
        {names.map((name, index) => (
          <label key={name} style={FIELD}>
            <span style={LABEL}>{name}</span>
            <input
              type="text"
              style={INPUT}
              value={values[name] ?? ""}
              // 只对首个输入框生效；React 仅在挂载时应用 autoFocus
              autoFocus={index === 0}
              aria-label={name}
              onChange={(ev) => {
                const next = ev.currentTarget.value;
                setValues((prev) => ({ ...prev, [name]: next }));
              }}
            />
          </label>
        ))}
        <div style={ACTIONS}>
          <button type="submit" style={PRIMARY}>
            {tr("vars.fill")}
          </button>
          <button type="button" style={GHOST} onClick={onCancel}>
            {tr("vars.cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}

const CARD: React.CSSProperties = {
  ...overlayBase,
  width: 300,
  maxWidth: "100%",
  maxHeight: 320,
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
