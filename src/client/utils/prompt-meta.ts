/**
 * per-prompt meta 的清理编排（T6 / O-1）——从 `ai-flow.ts` 拆出（架构评审候选 1）。
 *
 * 为什么单独成模块：这段编排的 5 条语义与 AI 无关，5 个调用点里 3 个只为删除而来；与 AI 流程
 * 同住一个模块时，「提示词真的没了 ⇒ 它的键也该没了」这件事要在 5 个文件间找齐。名字即概念：
 * 本模块负责 per-prompt meta 的**清理**；写回成功后的方向播种仍走 `ai-flow.ts#writeBackRefined`
 * 的注入点（`seed`），本模块不碰那条写回缝（规格 §4.4 / §13.8-决定四）。
 *
 * 要修的问题：宿主只有「键值对」这一层（GET / PUT / DELETE /meta/:key），它**不认识**
 * `pl:refined-dir:` / `pl:skill-descriptor:` 这类**客户端**键名约定——把这份约定写进宿主就是把两处
 * 耦合成一份隐式契约。于是「提示词真的没了 ⇒ 它的键也该没了」只能由客户端**在正确的时刻**说出来。
 *
 * 键名的形态归各自的主模块（`refined-direction.ts` / `skill-export.ts`），这里只做枚举。
 * 与 AI 侧同款：不触达 fetch、不依赖 React，可直接脱离宿主单测。
 */
import { api } from "./api.ts";
import { refinedDirectionMetaKey } from "./refined-direction.ts";
import { skillDescriptorMetaKey } from "./skill-export.ts";

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
   * id 列表」（清空回收站回 `{ removed: number; ids: string[] }`，见 `receiptIds`，T7 ⑦）；读不出来就
   * 退回 `ids`，不猜。
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
 * 五条语义（每条都有对应用例，且都做过变异验证）：
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
 *  5. **并发清**（重要-4 / 批一必修）：`2×N` 条 `DELETE /meta` **一次性发出**（`Promise.allSettled`），
 *     不再串行等待——串行会把 `2×N` 次往返的耗时压在调用方的反馈上（见 `capture.ts` 第 ⑥ 条）。
 *     前四条语义一条都不受影响：仍先 `await input.remove()`（主删先行）、`irreversible` 仍是唯一
 *     决策点、失败仍只 warn + 计入 `failed`；发起次序仍是「逐 id、逐键」的既有次序。
 */
export async function deletePrompts(input: DeletePromptsInput): Promise<DeletePromptsResult> {
  const receipt = await input.remove();
  if (!input.irreversible) return { succeeded: 0, failed: 0 };
  // ⑦：清**回执说的那些** id（`{ ids }`，清空回收站的竞态窗口），回执说不出才退回调用方给的 ids。
  const ids = receiptIds(receipt) ?? input.ids;
  const deleteMeta = input.deleteMeta ?? ((key: string) => api.deleteMeta(key));
  // 5. **并发清**（重要-4）：淘汰条数由上限配置决定（上限 300 → 50 时一次新建会淘汰 ~250 条 ⇒ 2×N
  //    把请求**一次性发出去**（顺序仍是「逐 id、逐键」的既有次序），再 allSettled 收结果。
  //    T7-5①（P7 §10.4-5）：map 的同步抛出现在被逐键兜住——每个调用推迟到一个微任务里发起，
  //    于是一次**同步抛出**变成「被拒绝的 promise」，交给下面的 allSettled 逐键收下（记 failed + warn）。
  const keys: string[] = [];
  for (const id of ids) for (const key of perPromptMetaKeys(id)) keys.push(key);
  // 旧写法 `keys.map((key) => deleteMeta(key))`：注入实现若**同步抛出**，异常会当场炸穿整个
  // `deletePrompts`——一次已经成功的主删除被变成失败，正是本函数第 3 条语义要挡的事。
  // 发起次序与并发度都不变（同一轮微任务里全部发出）。
  const settled = await Promise.allSettled(keys.map((key) => Promise.resolve().then(() => deleteMeta(key))));
  let succeeded = 0;
  let failed = 0;
  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i];
    if (outcome.status === "fulfilled") {
      succeeded++;
    } else {
      failed++;
      console.warn("[prompt-enhancer] 清理提示词的 meta 键失败（提示词已删除，残留键：" + keys[i] + "）", outcome.reason);
    }
  }
  return { succeeded, failed };
}

/**
 * 主删除回执 → **真的被删掉的 id 列表**（T7 ⑦），读不出来返回 `undefined`（= 回执没说，由调用方退回入参）。
 *
 * 唯一认得下的形态是 `{ ids: string[] }`——宿主 `DELETE /trash`（清空回收站）现在**同时**回
 * `removed`（条数，既有形状）与 `ids`（被删 id 列表；T7 ⑦ / 修复轮 1）。读的键是 `ids`：`removed`
 * 按契约是**数字**，永远不是 id 列表（修复轮 1 之前那个「数组塞进 `removed`」的形状已作废）。
 * 其余三个删除点回执里没有 id：单条永久删除与单条软删除回的是**条数** / `{deleted}`，
 * 两者都不该被当成 id 列表。
 *
 * 只认**非空字符串数组**：形状不符（数值 / 空串元素 / 别的东西）一律当作「回执没说」，**不猜**——
 * 猜错的后果是清掉不该清的键（或漏清），比退回入参更糟。
 */
function receiptIds(receipt: unknown): readonly string[] | undefined {
  if (typeof receipt !== "object" || receipt === null) return undefined;
  const raw = (receipt as { ids?: unknown }).ids;
  if (!Array.isArray(raw)) return undefined;
  if (!raw.every((id): id is string => typeof id === "string" && id !== "")) return undefined;
  return raw;
}
