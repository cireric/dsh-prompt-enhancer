/**
 * 沉淀落库的**唯一入口**（R28）：管理面板新建、选中文字、当前草稿三个入口都走这里。
 *
 * 它负责：`api.createPrompt` → 成功后 `notifyDataChanged()`（同进程数据同步，规格 §3.3）→
 * 返回 `{ prompt, evicted }`。**T4 的淘汰预检将插在这里**——故三个入口不得各自直连
 * `api.createPrompt`（否则 T4 要改三处）。
 *
 * 失败一律向上抛（可读原因来自 `api.ts` 的 ApiError）：错误必须可见（全局硬约束 15），本层不吞。
 */
import { clampTitle, type Prompt } from "../../types.ts";
import { api } from "./api.ts";
import { notifyDataChanged } from "./data-sync.ts";

/** 沉淀载荷：标题可省（B/C 两个入口只有正文），正文必填。 */
export interface CaptureInput {
  title?: string;
  body: string;
  tags?: string[];
  summary?: string;
}

/** 标题兜底：没给标题（或只有空白）时取正文**首个非空行**（与 `ai-flow#libraryCreateInput` 同口径）。 */
function fallbackTitle(body: string): string {
  const firstLine = body.split(/\r\n|\n|\r/).find((line) => line.trim() !== "") ?? "";
  return firstLine.trim();
}

/** 创建一条提示词并广播数据变更（返回值透传宿主的 `{ prompt, evicted }`）。 */
export async function createFromCapture(
  input: CaptureInput,
): Promise<{ prompt: Prompt; evicted: string[] }> {
  const created = await api.createPrompt({
    title: clampTitle((input.title ?? "").trim() || fallbackTitle(input.body)),
    body: input.body,
    tags: input.tags,
    summary: input.summary,
  });
  notifyDataChanged();
  return created;
}
