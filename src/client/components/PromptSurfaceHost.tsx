/**
 * `shell.overlay` 宿主：管理 / 导出 / 导入弹窗的**唯一**挂载点（D-P6-1）。
 *
 * **关闭态必须 `return null`**（T2 约束 B1 的硬要求）：`shell.overlay` 的 `.overlayLayer` 是
 * `position:absolute; inset:0; z-index:20; pointer-events:none`，而层内每个 list 席位的包装器是
 * `display:contents`，故**我方根元素直接继承 `pointer-events:auto`**。关闭态若渲染任何铺满
 * frame 的根元素，真实点击会被整层吞掉（等于挡死整个应用）；故关闭态零盒子，打开态才铺 backdrop。
 *
 * 打开态也不假设自己是该层唯一元素（活体上已有第三方 occupant）：只铺自己的 backdrop，
 * 不读写层内其它节点（零 DOM 注入）。
 */
import * as React from "react";
import type { PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
// type-only：拉入 ui-layout/client 对 `shell.overlay` 的 SlotMap 声明（无运行时依赖 → 不产生 external 导入）
import type {} from "@deepseek-ai/dsh-client-ui-layout/client";
import { backdrop } from "../utils/dialog-style.ts";
import { closeManager, useManagerState } from "../utils/ui-state.ts";
import { PromptManagerModal } from "./PromptManagerModal.tsx";

/** shell.overlay 的 props：无 owner props（B1），只用 locale 面的 `t`。 */
export type PromptSurfaceHostProps = PropsRuntime<"shell.overlay"> & PropsLocale<"prompt-enhancer">;

export function PromptSurfaceHost({ t }: PromptSurfaceHostProps): React.ReactElement | null {
  const { open, panel } = useManagerState();
  // hook 全部在此之前调用，故「开 → 关」分支切换不违反 hook 规则。
  if (!open) return null;
  return (
    <div
      // T7 活体探针的锚点：关闭态该节点**不存在**（不是「存在但零尺寸」）。
      data-prompt-enhancer-manager=""
      style={backdrop}
      // 点外面关：作用域是**本弹窗根节点**（不是 document），且判定是「点在遮罩自身」——
      // 卡片内的点击目标是后代节点，target !== currentTarget，因此不会被误关。
      onPointerDownCapture={(ev) => {
        if (ev.target === ev.currentTarget) closeManager();
      }}
    >
      <PromptManagerModal t={t} panel={panel} />
    </div>
  );
}
