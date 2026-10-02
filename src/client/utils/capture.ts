/**
 * 沉淀落库的**唯一入口**（R28）：管理面板新建、选中文字、当前草稿、AI 面板「存入词库」
 * 四个入口都走这里（R31 把 AI 面板从直连 `api.createPrompt` 收回）。
 *
 * 它负责 §4.4 的**淘汰二次确认（客户端预检）**与落库：
 *   0. **就绪闸门**：`isSettingsReady()` 为假 ⇒ **抛出**可读错误（失败**关闭**；调用方的既有失败
 *      分支呈现它），绝不按快照里的默认上限继续——见下面 `createFromCapture` 第 0 条的完整理由；
 *   1. 读现状与上限：`await api.listPrompts()` + `getSettingsSnapshot()`（设置唯一真源，D-P8-2）；
 *   2. `previewEvictions(prompts, maxPromptCount, 1)` → 非空则弹确认（明细 = 将淘汰的标题）；
 *   3. 用户取消 → `{ ok: false, reason: "cancelled" }`：**不创建、不留半成品、不渲染成错误**；
 *   4. 同意或无需淘汰 → `api.createPrompt` → 成功后 `notifyDataChanged()` → `{ ok: true, … }`；
 *   5. **淘汰者的 per-prompt meta 由本层清**（T7 ①）：被超限淘汰的提示词**不进回收站**（宿主
 *      `store.enforceMaxCount` 直接 `DELETE FROM prompts`）⇒ 它的键**没有第二个清理点**，
 *      `pl:refined-dir:<id>` / `pl:skill-descriptor:<id>` 会永久残留；
 *   6. `api` 抛错**照旧上抛**（调用方已有失败分支，本层不吞——全局硬约束 15）。
 *
 * 提示文案（title/message/confirmLabel/cancelLabel）是 i18n 键，由唯一渲染点
 * `PromptSurfaceHost` 翻译——本模块不引 react、不知道 locale（见 confirm.ts 头部）。
 * 淘汰结果以宿主响应里的 `evicted` 为准（客户端预检只是「事先问一次」，
 * 真正的受害者名单由 `store.enforceMaxCount` 决定）。
 */
import { clampTitle, type Prompt } from "../../types.ts";
import { deletePrompts } from "./prompt-meta.ts";
import { api } from "./api.ts";
import { requestConfirm } from "./confirm.ts";
import { notifyDataChanged } from "./data-sync.ts";
import { previewEvictions } from "./eviction.ts";
import { getSettingsSnapshot, isSettingsReady } from "./settings-store.ts";

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
  // 0) **就绪闸门**（P8 二审 I2：修掉失败开放的回归）。快照不可信 ⇒ **抛出**（调用方既有的失败分支
  //    呈现可读原因），**不得**按快照里的默认上限继续。
  //
  //    为什么这是承重的：宿主真实上限（如 20）低于快照默认值（300）时，`previewEvictions` 得到**空**
  //    受害者 ⇒ 跳过二次确认 ⇒ 宿主 `store.enforceMaxCount` **静默淘汰**，且**不可逆**（被淘汰的行
  //    不进回收站）。改造前这里读的是**宿主设置路由**（`GET /settings`）——读失败即**抛出**
  //    （失败**关闭**、可见报错）；改读快照后，快照拿不到真值时会用默认值顶上，于是同一场景从
  //    「可见报错」退化成「静默数据损失」。
  //
  //    就绪面由 `settings-store.ts#isSettingsReady` 提供：有 scope ⇒ 宿主镜像 `status === "ready"`；
  //    无 scope ⇒ 那次降级读**已成功落地**（失败或仍在途 ⇒ 永远不就绪）。窗口窄（无 scope 部署且
  //    降级读失败、或有 scope 但镜像首推之前），但后果不可逆，故此处**失败关闭**。
  //    `getSettingsSnapshot()` 仍照旧调用：它同时是「首次消费」那一次降级读的触发入口。
  const settings = getSettingsSnapshot();
  if (!isSettingsReady()) {
    throw new Error("设置尚未就绪，无法确认存储上限；已中止本次沉淀，以免提示词被宿主静默淘汰");
  }

  // 1) 读现状与上限——宿主没有 dry-run 路由，预检只能在客户端做（规格 §13.9 四）。
  //    上限改读**设置唯一真源**（D-P8-2）：同一个值不再留第二条读路径；命令式读取即此处的正确形状
  //    （它要的是「此刻生效的上限」，不是一份需要跟随重渲染的快照）。
  const prompts = await api.listPrompts();

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

  // 5) ①（T7）：清掉**被超限淘汰者**的 per-prompt meta 键。宿主回执里的 `evicted` 是**被物理删除的
  //    id 列表**（不是标题），那些行从不进回收站 ⇒ 不走本层这条路就永远没人清它们的键。
  //
  //    为什么用 T6 的收尾编排（`deletePrompts`）而不是在这里重写一遍循环：键的枚举（`perPromptMetaKeys`）
  //    与「逐条清、失败只 warn 不反噬」的语义只有那一处真源，第三份拷贝迟早漂移。
  //    为什么**不得**改成宿主在同一个事务里清 meta：`pl:` 键名是**客户端**的约定，宿主不认识它
  //    （T6-B 的「通用形态」：宿主只有 `DELETE /meta/:key` 这个通用通道）——把键名搬进宿主就是把两处
  //    耦合成一份隐式契约。
  //
  //    `remove` 传一个**已完成标记**：淘汰发生在宿主 `POST /prompts` 的同一个事务里，客户端拿到
  //    `created` 时那次物理删除**已经提交** ⇒ T6 的「主删先行」次序在此天然成立，这里既不需要也
  //    不可能再发一次删除。清键失败只 warn（`deletePrompts` 内部），**绝不影响**这次创建的结局。
  //
  //    ⑥ **不阻塞保存反馈**（重要-4 / 批一必修）：**不 await**。淘汰条数由**上限配置**决定、不由用户这一
  //    次操作决定（上限 300 → 50 之后，一次新建会淘汰 ~250 条 ⇒ 2×N = ~500 次 `DELETE /meta`），而
  //    `AIPolishButton` / `PromptManagerModal` 都 await 本次落库的结果——把它们压在清键 HTTP 上，就是
  //    把「已保存」的反馈交给一次**与本次操作无关**的批量清理。本项目在 `refined-direction.ts` 里已
  //    明确避免「把 UI 等在一次库写上」（`done` 不 await），这里与那条口径对齐：**清键照跑，只是不等它**。
  //    清键本身仍逐键 warn + 计数（`deletePrompts` 内部），它 reject 的唯一途径是 `remove`（此处是
  //    已完成标记，不会抛）——下面的 catch 是防注入实现把它捅穿时的**可见**兜底，绝不静默吞掉。
  const evicted = created.evicted ?? [];
  if (evicted.length > 0) {
    void deletePrompts({ ids: evicted, irreversible: true, remove: async () => {} }).catch((err: unknown) => {
      console.warn(
        "[prompt-enhancer] 淘汰者的 meta 键清理未跑完（提示词已创建，残留键：" + evicted.join(",") + "）",
        err,
      );
    });
  }
  return { ok: true, prompt: created.prompt, evicted };
}
