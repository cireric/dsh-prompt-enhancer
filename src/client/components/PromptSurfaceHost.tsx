/**
 * `shell.overlay` 宿主：管理 / 导出 / 导入弹窗与**共享确认弹窗**的唯一挂载点（D-P6-1 / R36）。
 *
 * **关闭态必须 `return null`**（T2 约束 B1 的硬要求）：`shell.overlay` 的 `.overlayLayer` 是
 * `position:absolute; inset:0; z-index:20; pointer-events:none`，而层内每个 list 席位的包装器是
 * `display:contents`，故**我方根元素直接继承 `pointer-events:auto`**。关闭态若渲染任何铺满
 * frame 的根元素，真实点击会被整层吞掉（等于挡死整个应用）；故关闭态零盒子，打开态才铺 backdrop。
 * 有在途确认但管理面板已关（AI 面板「存入词库」路径）时同样只铺确认层——它是此刻唯一的界面。
 *
 * 打开态也不假设自己是该层唯一元素（活体上已有第三方 occupant）：只铺自己的 backdrop，
 * 不读写层内其它节点（零 DOM 注入）。
 *
 * 确认弹窗（`confirm.ts#requestConfirm` 的 promise 驱动）是**嵌套**在管理面板之上的模态层：
 * 自带更高 z-index 的 backdrop，点它的遮罩 = 取消，压住管理面板的关闭判定（点击目标是内层，
 * 外层 `ev.target !== ev.currentTarget`，故不会误关管理面板）。
 */
import * as React from "react";
import type { PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
// type-only：拉入 ui-layout/client 对 `shell.overlay` 的 SlotMap 声明（无运行时依赖 → 不产生 external 导入）
import type {} from "@deepseek-ai/dsh-client-ui-layout/client";
import { resolveConfirm, useConfirmRequest, type ConfirmRequest } from "../utils/confirm.ts";
import { actions, backdrop, button, dialogTitle, muted, primaryButton } from "../utils/dialog-style.ts";
import { zh, type PromptEnhancerKey } from "../utils/i18n.ts";
import { TOKEN, overlayBase } from "../utils/theme.ts";
import { closeManager, useManagerState, useOverlayClaim } from "../utils/ui-state.ts";
import { PromptManagerModal } from "./PromptManagerModal.tsx";

/** shell.overlay 的 props：无 owner props（B1），只用 locale 面的 `t`。 */
export type PromptSurfaceHostProps = PropsRuntime<"shell.overlay"> & PropsLocale<"prompt-enhancer">;

/**
 * 管理面板栈的**追加面板值**（规格 §7.6 / 计划 D-P7-3）：`null` = 当前页签的内容，
 * `'skill'` = 技能导出页。值住在弹窗宿主（`shell.overlay` 的唯一挂载点，D-P7-1），
 * 由管理面板头部的工具栏按钮置位、由技能页的「返回管理面板」清位。
 *
 * 为什么不进 `ui-state.ts` 的 `ManagerPanel`：那是 P6 定的四页签枚举（T2 约束 F 段明列
 * `ui-state.ts` 不得触碰），而规格 §7.6 要的是**工具栏按钮**打开的一个页面，不是第五个页签。
 */
export type ManagerPanelValue = "skill" | null;

/** 字典键集：请求里的文案字段要么是键（翻译），要么是调用方直接给的原文（照旧显示）。 */
const DICT_KEYS = new Set<string>(Object.keys(zh));

/** 文案取值：命中字典就翻译，否则原样显示（`confirm.ts` 的口径：字段是 i18n 键）。 */
function label(t: PromptSurfaceHostProps["t"], text: string): string {
  return DICT_KEYS.has(text) ? t(text as PromptEnhancerKey) : text;
}

/** 嵌套确认层：自带遮罩，z-index 压在管理面板（100）之上；点遮罩 = 取消。 */
function ConfirmDialog({
  request,
  t,
}: {
  request: ConfirmRequest;
  t: PromptSurfaceHostProps["t"];
}): React.ReactElement {
  return (
    <div
      // T7 活体探针的**独立**锚点：确认层存在即在场，与 data-prompt-enhancer-manager 分开取证。
      data-prompt-enhancer-confirm=""
      style={CONFIRM_LAYER}
      onPointerDownCapture={(ev) => {
        if (ev.target === ev.currentTarget) resolveConfirm(false);
      }}
    >
      <div role="dialog" aria-modal="true" aria-label={label(t, request.title)} style={CONFIRM_SURFACE}>
        <span style={dialogTitle}>{label(t, request.title)}</span>
        <span style={muted}>{label(t, request.message)}</span>
        {request.detail.length > 0 && (
          <ul style={CONFIRM_LIST}>
            {request.detail.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
        )}
        <div style={actions}>
          <button type="button" style={button} onClick={() => resolveConfirm(false)}>
            {label(t, request.cancelLabel)}
          </button>
          <button type="button" style={primaryButton} onClick={() => resolveConfirm(true)}>
            {label(t, request.confirmLabel)}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PromptSurfaceHost({ t }: PromptSurfaceHostProps): React.ReactElement | null {
  const { open, panel } = useManagerState();
  // 在途确认也可能在管理面板关闭时发生（AI 面板的「存入词库」）→ 它单独也要能渲染。
  const confirmRequest = useConfirmRequest();
  /**
   * **T1 的 claim 接线（R-P7-A）**：本宿主是 P7 唯一的 root 弹窗宿主（D-P7-1），T2 的新面板值
   * （`'skill'`）只在此扩展、不重排接线。这里读的是与三面**同一个**派生值，但**不据它做门控**——
   * 三层理由，逐条有裁决/实测依据：
   *
   * 1. `OverlayKind` 的四值由 T1 约束 B.1 固定为 `none | hash | library | ai`：共享 claim 管的是
   *    **会话输入区**的三张浮层/面板（词库 / `#` / AI）；弹窗栈与它们分属两层（P6 的 D-P6-1）。
   * 2. P6 已验收的**预期**形态里就有「AI 面板 × 确认层同屏」：AI 面板「存入词库」在触发淘汰时弹出嵌套
   *    确认层（M6 的 C14 与 A 行记录）。若本宿主改读 claim 才渲染（或反向去压会话内的面），那条已验收
   *    路径会当场坏掉——`confirm.ts` 的 promise 驱动确认层不渲染 = 那次创建永远悬挂。
   * 3. 弹窗自带**铺满 frame 的 backdrop**（`z-index` 100，确认层 120，压住会话面的 30/31），几何上已经
   *    完全接管点击；P6 的「关闭态零遮挡」探针（C1）只要求弹窗**关闭**时零盒子——故本组件的门仍是
   *    `open || 确认层在途`、关闭态仍 `return null`（两处都不得改）。
   *
   * 于是这里的接线是「读同一派生值 + 给 T5 一个独立探针锚点」（照 P6 的 `data-prompt-enhancer-manager`
   * / `-confirm` 口径，声明式渲染、非 DOM 注入），**不改任何渲染门**。
   */
  const claimed = useOverlayClaim();
  /**
   * 面板值（T2 新增的**唯一**一处状态）。它不进任何渲染门：管理面板「何时渲染」仍只看
   * `open` 与在途确认层，claim 读数的接线也不动（R-P7-A 的两条禁令）。关闭面板即复位——
   * 下次打开回到管理面板本身，不留「重开还停在技能页」的隐式记忆。
   */
  const [panelValue, setPanelValue] = React.useState<ManagerPanelValue>(null);
  React.useEffect(() => {
    if (!open) setPanelValue(null);
  }, [open]);
  // hook 全部在此之前调用，故「开 → 关」分支切换不违反 hook 规则。
  if (!open && confirmRequest === null) return null;
  return (
    <div
      // T1：弹窗在场时的 claim 读数（**不是**管理面板锚点，两者语义不同；T5 用它判「弹窗栈不改寄存器归属」）。
      data-prompt-enhancer-claim={claimed}
      // 本节点只是「遮罩层」：它铺 backdrop 并接管「点外面关」。**不带管理面板的探针锚点**——
      // 管理面板的锚点挂在管理面板自己的对话框元素上（见 PromptManagerModal 根节点），
      // 于是「只有确认层在场」时不存在 data-prompt-enhancer-manager，
      // T7 的「关闭态零盒子」探针不会被误判成「管理面板开着」（修复轮 1 评审要求 6）。
      style={backdrop}
      // 点外面关：作用域是**本弹窗根节点**（不是 document），且判定是「点在遮罩自身」——
      // 卡片内 / 嵌套确认层内的点击目标是后代节点，target !== currentTarget，因此不会被误关。
      onPointerDownCapture={(ev) => {
        if (ev.target === ev.currentTarget) closeManager();
      }}
    >
      {open && <PromptManagerModal t={t} panel={panel} panelValue={panelValue} onPanelValue={setPanelValue} />}
      {confirmRequest !== null && <ConfirmDialog request={confirmRequest} t={t} />}
    </div>
  );
}

/** 确认层：铺满 frame（与 backdrop 同款），但 z-index 更高，压住管理面板。 */
const CONFIRM_LAYER: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 120,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  background: "rgba(0, 0, 0, 0.35)",
};

/** 确认卡片：窄一些（它是「一个问题」而不是管理面板），明细区超出在卡内滚动。 */
const CONFIRM_SURFACE: React.CSSProperties = {
  ...overlayBase,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  width: 360,
  maxWidth: "calc(100vw - 40px)",
  maxHeight: "calc(100vh - 40px)",
  overflow: "hidden",
  padding: 12,
  fontSize: 12,
};

/** 明细清单（例如将淘汰 / 将永久删除的提示词标题）。 */
const CONFIRM_LIST: React.CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  maxHeight: 180,
  overflowY: "auto",
  color: TOKEN.muted,
  fontSize: 11,
  overflowWrap: "anywhere",
};
