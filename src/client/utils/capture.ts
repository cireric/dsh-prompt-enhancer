/**
 * 沉淀落库的**唯一入口**（R28）：管理面板新建、选中文字、当前草稿、AI 面板「存入词库」
 * 四个入口都走这里（R31 把 AI 面板从直连 `api.createPrompt` 收回）。
 *
 * 它负责 §4.4 的**淘汰二次确认（客户端预检）**与落库：
 *   1. 读现状与上限：`Promise.all([api.listPrompts(), api.getSettings()])`；
 *   2. `previewEvictions(prompts, maxPromptCount, 1)` → 非空则弹确认（明细 = 将淘汰的标题）；
 *   3. 用户取消 → `{ ok: false, reason: "cancelled" }`：**不创建、不留半成品、不渲染成错误**；
 *   4. 同意或无需淘汰 → `api.createPrompt` → 成功后 `notifyDataChanged()` → `{ ok: true, … }`；
 *   5. `api` 抛错**照旧上抛**（调用方已有失败分支，本层不吞——全局硬约束 15）。
 *
 * 提示文案（title/message/confirmLabel/cancelLabel）是 i18n 键，由唯一渲染点
 * `PromptSurfaceHost` 翻译——本模块不引 react、不知道 locale（见 confirm.ts 头部）。
 * 淘汰结果以宿主响应里的 `evicted` 为准（客户端预检只是「事先问一次」，
 * 真正的受害者名单由 `store.enforceMaxCount` 决定）。
 */
import { clampTitle, type Prompt } from "../../types.ts";
import { api } from "./api.ts";
import { requestConfirm } from "./confirm.ts";
import { notifyDataChanged } from "./data-sync.ts";
import { previewEvictions } from "./eviction.ts";

/** 沉淀载荷：标题可省（B/C 两个入口只有正文），正文必填。 */
export interface CaptureInput {
  title?: string;
  body: string;
  tags?: string[];
  summary?: string;
}

/**
 * 落库结果：`ok: false` 只表示「用户在淘汰二次确认里取消」——
 * 它不是失败（调用方不得渲染成错误，只需静默回到原状态）。
 */
export type CaptureOutcome =
  | { ok: true; prompt: Prompt; evicted: string[] }
  | { ok: false; reason: "cancelled" };

/** 标题兜底：没给标题（或只有空白）时取正文**首个非空行**（与 `ai-flow#libraryCreateInput` 同口径）。 */
function fallbackTitle(body: string): string {
  const firstLine = body.split(/\r\n|\n|\r/).find((line) => line.trim() !== "") ?? "";
  return firstLine.trim();
}

/** 创建一条提示词（超限时先二次确认）并广播数据变更。 */
export async function createFromCapture(input: CaptureInput): Promise<CaptureOutcome> {
  // 1) 读现状与上限——宿主没有 dry-run 路由，预检只能在客户端做（规格 §13.9 四）。
  const [prompts, settings] = await Promise.all([api.listPrompts(), api.getSettings()]);

  // 2) 预演「再新增 1 条」的受害者；排序键与 store.enforceMaxCount 同源。
  const victims = previewEvictions(prompts, settings.maxPromptCount, 1);
  if (victims.length > 0) {
    const approved = await requestConfirm({
      title: "manager.evict.title",
      message: "manager.evict.message",
      detail: victims.map((p) => p.title),
      confirmLabel: "manager.evict.confirm",
      cancelLabel: "manager.evict.cancel",
    });
    // 3) 取消：一条也不创建，也不落任何中间状态。
    if (!approved) return { ok: false, reason: "cancelled" };
  }

  // 4) 落库（失败上抛）；结果提示以响应里的 evicted 为准。
  const created = await api.createPrompt({
    title: clampTitle((input.title ?? "").trim() || fallbackTitle(input.body)),
    body: input.body,
    tags: input.tags,
    summary: input.summary,
  });
  notifyDataChanged();
  return { ok: true, prompt: created.prompt, evicted: created.evicted };
}
