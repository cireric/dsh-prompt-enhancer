/**
 * `#` 候选浮层：草稿**末尾**出现 `#查询词` 令牌时列出匹配的提示词，点行即替换。
 *
 * 落点在 `conversation.input.overlay`（composer 卡内的浮动层）：宿主容器
 * `.overlayAnchor` 是 `position: absolute; inset: 0 0 auto; height: 0` 的零高
 * 锚点，故本组件自行绝对定位到锚点上方（与官方 `MenuView` 同款落点）。
 *
 * **D2（用户 2026-09-24 裁定）**：只做鼠标点击选择，**不接管键盘**——本文件
 * 没有任何 keydown/keyup 处理、没有 `tabIndex`、不挂任何键盘监听；唯一的关闭
 * 路径是「令牌消失」（用户删掉 `#` 或补了空格）。因此本组件**不需要**任何
 * document 级监听（连只读式的也不用）。
 *
 * 职责单一：读草稿 → 判尾令牌 → 渲染候选 → 点击改草稿。纯逻辑一律复用既有
 * 函数：令牌检测/替换/过滤走 `../utils/hash-token.ts`，变量判定走
 * `../utils/template.ts`，含变量的提示词复用任务 5 的 `TemplateVariablesDialog`
 * （本任务只复用、不另建弹窗）。
 */
import * as React from "react";
import type { PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import type { Prompt } from "../../types.ts";
import { api } from "../utils/api.ts";
import { filterPrompts, readHashToken, replaceHashToken } from "../utils/hash-token.ts";
import { promptSummary } from "../utils/insert.ts";
import { needsValues } from "../utils/template.ts";
import { TOKEN, overlayBase } from "../utils/theme.ts";
import { TemplateVariablesDialog } from "./TemplateVariablesDialog.tsx";

/** `#` 候选浮层（任务 6 落地完整行为）。 */
export type HashSuggestOverlayProps =
  PropsRuntime<"conversation.input.overlay"> & PropsLocale<"prompt-enhancer">;

export function HashSuggestOverlay({
  t,
  useInput,
  inputActions,
}: HashSuggestOverlayProps): React.ReactElement | null {
  const draft = useInput((s) => s.draft);
  const token = readHashToken(draft);
  const open = token !== null;
  /** null = 本次打开还没加载完。 */
  const [prompts, setPrompts] = React.useState<Prompt[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  /** 已点击的含变量提示词：非空即变量填窗打开（列表让位给弹窗）。 */
  const [pending, setPending] = React.useState<Prompt | null>(null);

  // 每次打开拉一次并缓存：查询词变化只走本地 filterPrompts，不再请求宿主。
  // 只依赖 open（布尔）：失败文案的本地化由渲染期的 t 负责，把 t 放进依赖会让
  // 「t 身份不稳定」的实现变成重拉循环。令牌消失时顺带丢弃未完成的变量填窗，
  // 否则下次 `#` 会复现上一次的旧弹窗。
  React.useEffect(() => {
    if (!open) {
      setPending(null);
      return;
    }
    let alive = true;
    setPrompts(null);
    setLoadError(null);
    api.listPrompts().then(
      (list) => {
        if (alive) setPrompts(list);
      },
      (err: unknown) => {
        if (!alive) return;
        // 加载失败必须可见：既留 console 痕迹，也在浮层里显示一行错误（不是空态）。
        console.warn("[prompt-enhancer] 提示词列表加载失败", err);
        setPrompts([]);
        setLoadError(err instanceof Error ? err.message : String(err));
      },
    );
    return () => {
      alive = false;
    };
  }, [open]);

  /** 落草稿（替换尾令牌）+ 上报用量（规格 §4.4：「# 选中」也算一次使用）。 */
  const apply = (prompt: Prompt, body: string): void => {
    inputActions.setDraft(replaceHashToken(draft, body));
    setPending(null);
    // 选中后浮层立即随令牌消失，故失败只能留痕迹（没有可显示提示的行）。
    void api.recordUsage(prompt.id).catch((err: unknown) => {
      console.warn("[prompt-enhancer] " + t("error.use"), err);
    });
  };

  if (token === null) return null;

  // 含变量的提示词：先开任务 5 的变量填窗，填完再落草稿。
  if (pending !== null) {
    return (
      <div style={ANCHOR}>
        <TemplateVariablesDialog
          body={pending.body}
          t={t}
          onCancel={() => setPending(null)}
          onFilled={(filled) => apply(pending, filled)}
        />
      </div>
    );
  }

  const filtered = filterPrompts(prompts ?? [], token.query);

  return (
    <div style={ANCHOR}>
      <div role="group" aria-label={t("hash.title")} style={PANEL}>
        <div style={HEADER}>{t("hash.title")}</div>
        {loadError !== null && (
          <div role="alert" style={ERROR} title={loadError}>
            {t("error.load")}
          </div>
        )}
        {loadError === null && prompts === null && <div style={MUTED}>{t("list.loading")}</div>}
        {loadError === null && prompts !== null && filtered.length === 0 && (
          <div style={MUTED}>{t("hash.empty")}</div>
        )}
        {loadError === null &&
          filtered.map((prompt) => (
            <button
              key={prompt.id}
              type="button"
              style={ROW}
              title={prompt.title}
              aria-label={prompt.title}
              onClick={() => {
                if (needsValues(prompt.body)) setPending(prompt);
                else apply(prompt, prompt.body);
              }}
            >
              <span style={ROW_TITLE}>{prompt.title}</span>
              <span style={ROW_SUMMARY}>{promptSummary(prompt)}</span>
              {prompt.tags.length > 0 && (
                <span style={TAGS}>
                  {prompt.tags.map((tag) => (
                    <span key={tag} style={TAG}>
                      {tag}
                    </span>
                  ))}
                </span>
              )}
            </button>
          ))}
      </div>
    </div>
  );
}

/**
 * 浮层落点：只负责定位，不画卡片。
 *
 * 容器（`overlayBase` + 卡片外观）要么是候选列表、要么是变量填窗——后者自带
 * `overlayBase`（任务 5 的 `TemplateVariablesDialog` 不接 style），把 `overlayBase`
 * 同时放在定位容器上会出现「双层卡片」（两层描边与阴影叠在一起）。故外观一律
 * 由内容自带，与任务 5 的 `PromptLibraryButton` 的 ANCHOR/PANEL 分工一致。
 * `left: 8` 对齐 composer 左缘；`zIndex: 30` 与词库面板同级（浮层互不重叠）。
 */
const ANCHOR: React.CSSProperties = {
  position: "absolute",
  bottom: 8,
  left: 8,
  zIndex: 30,
  maxWidth: "calc(100vw - 24px)",
};

/** 候选列表卡片：设计上限 320，超出在卡内滚动。 */
const PANEL: React.CSSProperties = {
  ...overlayBase,
  display: "flex",
  flexDirection: "column",
  gap: 4,
  width: 300,
  maxHeight: 320,
  overflowY: "auto",
  padding: 6,
  fontSize: 12,
};

const HEADER: React.CSSProperties = { color: TOKEN.muted, fontSize: 11, fontWeight: 600 };

const MUTED: React.CSSProperties = { color: TOKEN.muted, fontSize: 11 };

const ERROR: React.CSSProperties = { color: TOKEN.fg, fontSize: 11 };

const ROW: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 2,
  width: "100%",
  padding: "5px 4px",
  color: TOKEN.fg,
  background: "transparent",
  border: 0,
  borderTop: `1px solid ${TOKEN.border}`,
  textAlign: "left",
  font: "inherit",
  fontSize: 12,
  cursor: "pointer",
};

const ROW_TITLE: React.CSSProperties = {
  color: TOKEN.fg,
  fontSize: 12,
  fontWeight: 600,
  maxWidth: "100%",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const ROW_SUMMARY: React.CSSProperties = { color: TOKEN.muted, fontSize: 11, overflowWrap: "anywhere" };

const TAGS: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 };

const TAG: React.CSSProperties = {
  color: TOKEN.accent,
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 999,
  padding: "0 6px",
  fontSize: 10,
};
