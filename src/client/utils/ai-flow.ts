/**
 * AI 优化 / 完善的纯逻辑层 **+ per-prompt meta 的生命周期编排**（写回时播种、不可逆删除时清理）：
 * 不触达 fetch、不依赖 React，可直接脱离宿主单测。
 *
 * `api.ts` 只 import 两样：**类型**（`import type`）与 `api` 这一个对象——后者仅作
 * `deletePrompts` 清键的**缺省**实现（调用方可注入替代实现，测试据此保持 hermetic）；
 * 其余 HTTP 一律由调用方注入（见 `WriteBackInput.update` / `DeletePromptsInput.remove`）。
 * 错误分类按「HTTP status / err.name」判定，不匹配 message 文本（宿主文案可改）。
 */
import type { Prompt, PromptWritablePatch } from "../../types.ts";
import type { AiRefineResult } from "./api.ts";
import { api } from "./api.ts";
import { clampTitle } from "../../types.ts";
import { needsValues } from "./template.ts";
import { refinedDirectionMetaKey } from "./refined-direction.ts";
import { skillDescriptorMetaKey } from "./skill-export.ts";

/** keepVariables 开关口径：草稿含 `{{变量}}` 才勾选；`{{}}` / `{{   }}` 不算（复用 parseVariables 口径）。 */
export function keepVariablesFor(draft: string): boolean {
  return needsValues(draft);
}

/** 落到提示词库的入参：body 用**原文**（AI 完善稿只进输入框），title 走 clampTitle，tags 最多 1 个。 */
export function libraryCreateInput(refined: AiRefineResult, originalDraft: string): {
  title: string;
  body: string;
  tags: string[];
  summary: string;
} {
  // 兜底取**首个非空行**：草稿以空行开头（先回车再打字）时 [0] 是空串，落库 title 就会是空的；
  // 整份草稿全空白时没有任何可用标题（返回空串，不抛）。
  // trim 不可省：`"\n  标题"` 的首个非空行带前导空白，不 trim 就会把空格写进 title（P5 延期 #2 / A4）。
  const firstLine = (originalDraft.split(/\r\n|\n|\r/).find((line) => line.trim() !== "") ?? "").trim();
  return {
    // AI 标题只有空白字符时等于没给标题：判据用 trim，兜底后才交给 clampTitle。
    title: clampTitle(refined.title.trim() || firstLine),
    body: originalDraft,
    tags: refined.tags.slice(0, 1),
    summary: refined.summary,
  };
}

/** 完善稿与原文不同才需要写回（对应 store.ts 的 sourceBody 写回边界：相同则不动 body）。 */
export function needsWriteBack(refinedBody: string, originalDraft: string): boolean {
  return refinedBody !== originalDraft;
}

// ── §4.4 写回缝（P7 T4 修复轮 1：方向**真正可知**之处，顺手播种）────────────────────

/** `updatePrompt` 的窄接口（真实现 = `api.updatePrompt`；本模块不 import 它的运行期值）。 */
export type PromptUpdater = (id: string, patch: PromptWritablePatch & { aiWriteBack?: boolean }) => Promise<Prompt>;

export interface WriteBackInput {
  promptId: string;
  /** 写回的正文（= AI 优化稿）。 */
  body: string;
  /** 第一步：宿主的 `store.updatePrompt` 在此回填 `sourceBody = 旧 body` 并置 `aiRefined`。 */
  update: PromptUpdater;
  /**
   * 第二步：把方向 `refined` 种进 meta（真实现 = `refined-direction.ts#seedRefinedDirection`）。
   * 内部只 warn、不抛——一次 meta 写失败不得把**已经成功**的写回变成失败。
   */
  seed: (promptId: string) => Promise<void>;
}

/**
 * §4.4 写回缝的**唯一编排**（组件不再自己拼 `aiWriteBack: true`）：写入优化稿，成功后**播种方向**。
 *
 * 为什么写回缝是「方向真正可知」之处：宿主的回填意味着「此刻的 `body` 就是那一次写回的优化稿」，
 * 于是 `refined` 是一条**事实**而不是推断（对比 R-P7-AC 弃用的 `aiRefined` 兜底：那条推断在
 * 「切换过奇数次」的旧记录上恰好反相，且会被下一次切换固化成反相，用户任何操作都修不好）。
 *
 * 顺序不可交换：**只有写回成功才播种**。写回失败 ⇒ 宿主没回填 `sourceBody`、第二侧可能根本
 * 不存在，此时种一条方向记录就是凭空造事实。第一步抛错照旧抛给调用方（面内 `ai.writeBackFail`）。
 */
export async function writeBackRefined(input: WriteBackInput): Promise<Prompt> {
  const updated = await input.update(input.promptId, { body: input.body, aiWriteBack: true });
  try {
    await input.seed(input.promptId);
  } catch (err) {
    // 播种失败**不得**把一次已经成功的写回变成失败（否则面内会误报 `ai.writeBackFail`，用户会以为
    // 优化稿没写回）。真实现（`seedRefinedDirection`）内部本就不抛；这里是防注入实现把它捅穿。
    console.warn("[prompt-enhancer] 写回成功但方向记录播种失败（重开详情页会退回中性标注）", err);
  }
  return updated;
}

/** 是否可切换「原文 ↔ 优化稿」：sourceBody 非空（与 store.ts 回滚守卫一致）。 */
export function canToggle(current: Pick<Prompt, "sourceBody">): boolean {
  return Boolean(current.sourceBody);
}

function errorName(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const name = (err as { name?: unknown }).name;
  return typeof name === "string" ? name : undefined;
}

function statusOf(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null || !("status" in err)) return undefined;
  const status = (err as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

/** 客户端 toast 文案的 i18n key：超时 / AI 不可用 / 其它失败。 */
export function aiErrorKey(err: unknown): "ai.timeout" | "ai.unavailable" | "ai.fail" {
  if (errorName(err) === "TimeoutError") return "ai.timeout";
  if (statusOf(err) === 503) return "ai.unavailable";
  return "ai.fail";
}

// ── per-prompt meta 的清理（T6 / O-1）──────────────────────────────────────
//
// 要修的问题：宿主只有「键值对」这一层（GET / PUT / 现在多了 DELETE /meta/:key），它**不认识**
// `pl:refined-dir:` / `pl:skill-descriptor:` 这类**客户端**键名约定——把这份约定写进宿主就是把两处
// 耦合成一份隐式契约。于是「提示词真的没了 ⇒ 它的键也该没了」只能由客户端**在正确的时刻**说出来。

/** 删一条 meta KV（真实现 = `api.deleteMeta`；幂等，键不存在也算成功）。 */
export type MetaDeleter = (key: string) => Promise<unknown>;

/**
 * 某条提示词在 meta 里的两把「AI 派生」键：方向（`pl:refined-dir:<id>`）与技能 descriptor
 * （`pl:skill-descriptor:<id>`）。**键的形态归各自的主模块**（`refined-direction.ts` /
 * `skill-export.ts`），这里只做枚举——不另抄一份键名字符串，否则约定就有了第二处真源。
 */
export function perPromptMetaKeys(promptId: string): string[] {
  return [refinedDirectionMetaKey(promptId), skillDescriptorMetaKey(promptId)];
}

/** `deletePrompts` 的入参。 */
export interface DeletePromptsInput {
  /** 涉及删除的提示词 id（单条永久删除通常 1 条；清空回收站是本次列出的全部）。 */
  ids: readonly string[];
  /**
   * **是否不可逆**：true = 单条永久删除 / 清空回收站（回收站里的行被物理删除）；
   * false = 软删除（进回收站，可恢复）。
   * 这个布尔量是「清键只发生在不可逆删除点」的**唯一决策点**——调用方不得再自己判一次。
   */
  irreversible: boolean;
  /**
   * 主删除（先做、做成功才谈收尾）：真实现 = `api.deleteTrash`（单条）/ `api.emptyTrash`（整批）/
   * `api.deletePrompt`（软删）。一次调用即代表「本次要删的都删了」。
   *
   * 返回类型是 `unknown`：宿主那三个路由各回各的回执。收尾**只从回执里读一件事**——「真的被删掉的
   * id 列表」（`{ removed: string[] }`，见 `receiptIds`，T7 ⑦）；读不出来就退回 `ids`，不猜。
   * 回执抛出仍是**唯一的失败信号**（主操作失败 ⇒ 清键一步都不做）。
   */
  remove: () => Promise<unknown>;
  /** 清键实现；缺省 = `api.deleteMeta`。测试注入假实现以保持 hermetic。 */
  deleteMeta?: MetaDeleter;
}

/**
 * 收尾结果：**清键请求**的成功 / 失败计数（T7 ⑧-⑤ 更名：旧名 `cleared` 读起来像「删掉的行数」，
 * 实际数的是**成功的请求数**——宿主 `DELETE /meta/:key` 是幂等的，键不存在时同样回 ok
 * （`{deleted: false}`），故一次成功只说明「这次请求被接受了」，不等于删掉了一行）。
 * 每次失败都有 `console.warn`（不静默）。
 */
export interface DeletePromptsResult {
  succeeded: number;
  failed: number;
}

/**
 * 删除提示词的**唯一收尾编排**（T6 / O-1）：先做主删除，再**仅当不可逆时**清 per-prompt meta。
 * 两个删除面板（回收站的「永久删除」/「清空回收站」、列表页的软删除）都只经它收尾。
 *
 * 三条语义（每条都有对应用例，且都做过变异验证）：
 *
 *  1. **软删除绝不清键**（`irreversible: false` ⇒ 一次清键请求都不发）。回收站可恢复且**复用同一
 *     id**，清了键，「删除 → 恢复」就会重演 I-1：方向记录消失（详情页退回中性标注）、descriptor
 *     消失（重导丢掉 `whenToUse` 且 description 降级成兜底链）。这是本函数存在的主要理由。
 *  2. **不可逆删除后逐条清**：每条 id × 每个键一次 `DELETE /meta/:key`（宿主幂等，重复清不失败）。
 *  3. **主操作先行，清键不得反噬**：主删除失败 ⇒ 原样抛出、**一行 meta 都不动**（提示词还在，键
 *     必须还在）；清键失败 ⇒ 只 `console.warn` + 计入 `failed`，绝不把已经成功的删除变成失败
 *     （删除是主操作、清键是收尾），也绝不静默（A11：错误必须可见）。
 *  4. **清谁的键以主删除回执为准**（T7 ⑦）：回执给出被删 id 列表时用它，给不出才退回 `input.ids`。
 *     这条专治「清空回收站」的竞态——面板列出的 items 是打开那一刻的快照，窗口内新增的行同样被删，
 *     却不在快照里；按回执清键之后，`ids` 只用来决定「要不要清」的语义（软删除仍然一把都不清），
 *     而**删了谁**只有宿主说了算。`irreversible` 仍是「清键」这件事的**唯一决策点**。
 */
export async function deletePrompts(input: DeletePromptsInput): Promise<DeletePromptsResult> {
  const receipt = await input.remove();
  if (!input.irreversible) return { succeeded: 0, failed: 0 };
  // ⑦：清**回执说被删掉的那些** id（清空回收站的竞态窗口），回执说不出才退回调用方给的 ids。
  const ids = receiptIds(receipt) ?? input.ids;
  const deleteMeta = input.deleteMeta ?? ((key: string) => api.deleteMeta(key));
  let succeeded = 0;
  let failed = 0;
  for (const id of ids) {
    for (const key of perPromptMetaKeys(id)) {
      try {
        await deleteMeta(key);
        succeeded++;
      } catch (err) {
        failed++;
        console.warn("[prompt-enhancer] 清理提示词的 meta 键失败（提示词已删除，残留键：" + key + "）", err);
      }
    }
  }
  return { succeeded, failed };
}

/**
 * 主删除回执 → **真的被删掉的 id 列表**（T7 ⑦），读不出来返回 `undefined`（= 回执没说，由调用方退回入参）。
 *
 * 唯一认得下的形态是 `{ removed: string[] }`——宿主 `DELETE /trash`（清空回收站）就是这个形状：
 * `store.emptyTrash()` 返回被删 id 列表，路由原样放进 `removed`。其余三个删除点回执里没有 id：
 * 单条永久删除与单条软删除回的是**条数** / `{deleted}`，两者都不该被当成 id 列表。
 *
 * 只认**非空字符串数组**：形状不符（数值 / 空数组里的非串元素 / 别的东西）一律当作「回执没说」，
 * **不猜**——猜错的后果是清掉不该清的键（或漏清），比退回入参更糟。
 */
function receiptIds(receipt: unknown): readonly string[] | undefined {
  if (typeof receipt !== "object" || receipt === null) return undefined;
  const raw = (receipt as { removed?: unknown }).removed;
  if (!Array.isArray(raw)) return undefined;
  if (!raw.every((id): id is string => typeof id === "string" && id !== "")) return undefined;
  return raw;
}
