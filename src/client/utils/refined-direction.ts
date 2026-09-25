/**
 * 「原文 / 优化稿」方向的**非组件纯逻辑 + 读写**（P7 T4 / I-1 根治；规格 §4.4、§13.10-五-4）。
 *
 * 要修的问题：`POST /prompts/:id/rollback` 是 **swap**——宿主把 `body` 与 `sourceBody` 对调，且
 * **不记录方向**（`store.rollbackPrompt` 只换两份正文，`aiRefined` 原样保留）。于是客户端只能猜
 * 「此刻的 `body` 是哪一侧」：P6 的详情页并排两栏在「切一次 → 关面板 → 重开编辑」后会**张冠李戴**
 * （左栏显示优化稿却标 Original）。P6（R59 / F-5）只做到「不再用错误标签断言方向」（两栏按实际字段给
 * 中性标题）；根治 = 把方向**持久化在该提示词上**：切换成功后写 meta，重开详情页读回来如实标注。
 *
 * 为什么单独成 `.ts` 模块（P6 的 I-4 教训，与 `skill-export.ts` 同款）：弹窗是 `.tsx`，而
 * `node --test` **import 不了**（`ERR_UNKNOWN_FILE_EXTENSION`）。故三态判定、脏值兜底、方向翻转
 * 与「方向 → 标注」的映射都必须待在这里；组件只做接线（接线的正确性归 T5 活体验收，不在此造空洞断言）。
 *
 * 纯：无 React、无 DOM；HTTP 由调用方**注入**（`getMeta` / `setMeta`，真实现 = 既有 `api.*`）。
 *
 * ⚠️ **meta 键约定（与 T3 同一形态）**：每条提示词一个键，形如 `pl:refined-dir:<promptId>`，值为**裸的**
 * `original` / `refined`。`pl:` 是本插件在宿主 meta 表里的命名空间，其后按 `<用途>:<promptId>` 排布
 * （冒号分段，不拼长句）——与 `skill-export.ts#skillDescriptorMetaKey` 的 `pl:skill-descriptor:<id>`
 * 同款（T3 立的规矩，本任务沿用，不自创新前缀）。
 */
import { api } from "./api.ts";
import type { PromptEnhancerKey } from "./i18n.ts";

/** 判定的三个取值：`body` 是原文 / `body` 是优化稿 / **无从判断**（此时不得假装有两栏）。 */
export type RefinedDirection = "original" | "refined" | "none";

/** 能落进 meta 的值：只有两个已知方向（`none` 不是记录，见 `saveRefinedDirection`）。 */
export type StoredDirection = Exclude<RefinedDirection, "none">;

/** 判定方向所需的最小字段面（窄接口：纯逻辑不依赖整条 `Prompt`）。 */
export interface DirectionCarrier {
  /** AI 优化前的原文；非空才谈得上「两侧对比」（与 `canToggle` / 宿主 rollback 守卫同口径）。 */
  sourceBody?: string;
  /** P5 的写回缝置位：为真即「正文是那一次写回的优化稿」。 */
  aiRefined?: boolean;
}

/** meta 的读写面（真实现 = 既有 `api.getMeta` / `api.setMeta`；本模块**不新增** API 方法）。 */
export type MetaReader = (key: string) => Promise<string>;
export type MetaWriter = (key: string, value: string) => Promise<unknown>;

// ── 键约定 ───────────────────────────────────────────────────────────────────

/**
 * meta 键：某条提示词的「哪一侧是原文」方向（约定见文件头）。
 * `refined-dir` 是**用途段**，不是新前缀——键的形态与 T3 的 `pl:skill-descriptor:<id>` 完全同款。
 */
export function refinedDirectionMetaKey(promptId: string): string {
  return "pl:refined-dir:" + promptId;
}

// ── 纯判定 ───────────────────────────────────────────────────────────────────

/** 两侧都在（`sourceBody` 非空）才谈得上「方向」：只有一侧时两栏对比根本不成立。 */
export function hasTwoBodies(prompt: DirectionCarrier): boolean {
  return Boolean(prompt.sourceBody);
}

/**
 * meta 文本 → 已存方向。**缺失 / 空串 / 未知值 / 坏 JSON 一律 `undefined`**（= 走兜底），**绝不抛**。
 *
 * 口径刻意从严：本键的约定就是**裸的** `original` / `refined`（只容忍首尾空白）。其余任何内容
 * （`none`、`ORIGINAL`、`{"dir":"original"}`、`"refined"` 这种 JSON 文本、半截 JSON…）都意味着
 * 「写下它的不是本模块、或不是这个版本」——读成「没有记录」比照着猜一次方向更安全。
 */
export function parseStoredDirection(raw: string | undefined): StoredDirection | undefined {
  if (raw === undefined) return undefined;
  const text = raw.trim();
  if (text === "") return undefined;
  if (text === "original" || text === "refined") return text;
  // 脏值的后果是「标注退回兜底」，必须可见（但绝不阻断渲染、绝不抛）。
  console.warn("[prompt-enhancer] 「原文 / 优化稿」方向的 meta 值不可识别（按无记录处理）：" + JSON.stringify(raw));
  return undefined;
}

/**
 * 无可用记录时的兜底：能由 `aiRefined`（P5 的写回缝置位）推出「正文是优化稿」就是 `refined`；
 * 其余一律 `none`——**绝不凭空猜 `original`**（猜错等于把 I-1 的错标签换个方向重现）。
 */
export function fallbackDirection(prompt: DirectionCarrier): RefinedDirection {
  if (!hasTwoBodies(prompt)) return "none";
  return prompt.aiRefined === true ? "refined" : "none";
}

/**
 * 纯判定（本模块的核心）：给「该提示词的现状」与「已存的 meta 文本」⇒ 方向三值之一。
 *
 * 次序（每一步都有对应用例，且做过变异验证）：
 *  ① **只有一侧** ⇒ `none`：没有第二侧，任何记录都造不出两栏对比；
 *  ② **有可用记录** ⇒ 如实采信——已存记录**优先于** `aiRefined` 兜底：切换过之后 `aiRefined` 仍是
 *     true，只有记录知道「现在的 `body` 已经不是那一次写回的优化稿了」；
 *  ③ 否则兜底（见 `fallbackDirection`）。
 */
export function resolveRefinedDirection(prompt: DirectionCarrier, stored: string | undefined): RefinedDirection {
  if (!hasTwoBodies(prompt)) return "none";
  return parseStoredDirection(stored) ?? fallbackDirection(prompt);
}

/**
 * 切换 = 宿主执行 swap(body, sourceBody) ⇒ 方向**翻转**（`original` ↔ `refined`）。
 *
 * 未知（`none`）翻转后**仍是未知**：swap 交换的是位置，不产生「哪一份是原文」的信息，不得借机
 * 落一个猜出来的方向（否则下一次打开就会自信地标错）。
 */
export function oppositeDirection(direction: RefinedDirection): RefinedDirection {
  if (direction === "original") return "refined";
  if (direction === "refined") return "original";
  return "none";
}

/** 这一栏（`body`，详情页可直接编辑的那一份）是不是原文。`none` 恒 false：不知道就不认。 */
export function bodyIsOriginal(direction: RefinedDirection): boolean {
  return direction === "original";
}

// ── 方向 → 两栏标注 ──────────────────────────────────────────────────────────

/** 并排两栏的标注键：`current` = 左栏（`body`），`counterpart` = 右栏（`sourceBody`）。 */
export interface CompareLabels {
  current: PromptEnhancerKey;
  counterpart: PromptEnhancerKey;
  /** true = 方向不可知 ⇒ 组件渲染中性说明，**不假装**知道哪一栏是哪一份。 */
  neutral: boolean;
}

/**
 * 方向 → 两栏标注键（**方向与标注的唯一映射点**：组件不再自己拼措辞，也不再去看 `aiRefined`）。
 *
 * 两个已知方向给出的键**必须不同**（T4 约束 B 的硬要求：否则「恒返回 original」的实现也能全绿）；
 * `none` 走 P6 的中性表述（"两份正文" / "另一份"）。
 */
export function compareLabelKeys(direction: RefinedDirection): CompareLabels {
  if (direction === "original") {
    return { current: "manager.compare.original", counterpart: "manager.compare.refined", neutral: false };
  }
  if (direction === "refined") {
    return { current: "manager.compare.refined", counterpart: "manager.compare.original", neutral: false };
  }
  return { current: "manager.compare.current", counterpart: "manager.compare.counterpart", neutral: true };
}

// ── 读写（既有 api.getMeta / api.setMeta）─────────────────────────────────────

/**
 * 读取某条提示词的已存方向文本（缺失 = 空串，即宿主 `getMetaValue` 的缺失值）。
 *
 * 读失败只 `console.warn` 并返回 `undefined`：读不到只让标注退回兜底，**不得**影响详情页渲染。
 */
export async function loadStoredDirection(promptId: string, getMeta: MetaReader): Promise<string | undefined> {
  try {
    return await getMeta(refinedDirectionMetaKey(promptId));
  } catch (err) {
    console.warn("[prompt-enhancer] 读取「原文 / 优化稿」方向失败（本次打开退回兜底标注）", err);
    return undefined;
  }
}

/**
 * 落库：把方向写进 meta（缺省实现 = 既有 `api.setMeta`，**不新增 API 方法**）。
 *
 * `none` **不写**：未知方向不得落成记录（否则下次打开会自信地标错）。写失败只 `console.warn`——
 * 切换本身已经成功（宿主已 swap 并回了新记录），一次库写失败不得把它变成失败，也不得挡住
 * `notifyDataChanged()` 等后续效果（T4 约束 A.2：失败可见 + 不阻塞）。
 */
export async function saveRefinedDirection(
  promptId: string,
  direction: RefinedDirection,
  setMeta: MetaWriter = (key, value) => api.setMeta(key, value),
): Promise<void> {
  if (direction === "none") return;
  try {
    await setMeta(refinedDirectionMetaKey(promptId), direction);
  } catch (err) {
    console.warn("[prompt-enhancer] 「原文 / 优化稿」方向落 meta 失败（下次打开会退回兜底标注）", err);
  }
}
