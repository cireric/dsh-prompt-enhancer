import * as React from "react";
import type { PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";

/** 输入框旁「词库」按钮（任务 5 落地完整行为）。 */
export type PromptLibraryButtonProps =
  PropsRuntime<"conversation.input.left"> & PropsLocale<"prompt-enhancer">;

export function PromptLibraryButton({ t }: PromptLibraryButtonProps): React.ReactElement | null {
  return React.createElement("button", { type: "button", title: t("button.tip") }, t("button.title"));
}
