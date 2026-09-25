/**
 * 「原文 / 优化稿」方向的**非组件纯逻辑 + 读写**（P7 T4 / I-1 根治；规格 §4.4、§13.10-五-4）。
 *
 * 要修的问题：`POST /prompts/:id/rollback` 是 **swap**——宿主把 `body` 与 `sourceBody` 对调，且
 * **不记录方向**。于是「此刻的 `body` 是哪一侧」只能由客户端自己记：P6 的详情页并排两栏在
 * 「切一次 → 关面板 → 重开编辑」后会张冠李戴。根治 = 把方向**持久化在该提示词上**：切换成功后
 * 写 meta，重开详情页读回来。
 *
 * ⚠️ **R-P7-AC（修复轮 1）：方向只能来自记录——`aiRefined` 推断不再是标注依据。**
 * 初版的兜底是「无记录 + `aiRefined` 真 ⇒ 正文是优化稿」。对 **P6 期已切过奇数次**的旧记录
 * （无 meta + `aiRefined` 真）它恰好**反相**：首开就自信地标错，点一次切换又把那个猜测的**反面**
 * 落盘 ⇒ 错位被固化，此后任何次数点击都反相。**反转一次猜测仍然是一次猜测**——用户任何操作都
 * 修不好，与「把不可知固化成记录」同一类缺陷。故现在的语义（判定 = 方向 + **来源**）：
 *
 *   · **`record`**：meta 里有可用记录 ⇒ **如实标注**（原文 / 优化稿），切换后落**翻转**后的方向；
 *   · **`fallback`**：没有可用记录（缺失 / 脏值 / 只有一侧）或**读取中** ⇒ **中性**表述（与 P6 一致）
 *     且**切换后不落库**（猜测不得被固化）；
 *   · 记录**只在方向真正可知之处播种**：AI 写回缝（`ai-flow.ts#writeBackRefined` 成功后调
 *     `seedRefinedDirection`）——那一刻写回的 `body` 就是优化稿，无需任何推断。
 *   ⇒ 老记录（P6 期 / 导入）永远是中性（不会被自信地标错，也不再可能被点成反相）；
 *     新记录（经过一次 AI 写回）全程可持久化。
 *
 * ⚠️ **R-P7-AE（修复轮 2）：来源未知时的切换必须让记录**一起失效**。**
 * 切换改变的是**真值**（`body` / `sourceBody` 对调），而「来源未知 ⇒ 不落库」意味着那条**可能存在的**
 * 记录不会跟着翻转 ⇒ 它**变成了错的**，下一次挂载还会把它当作有效记录采信（自信且用户无法纠正的反相
 * 标注——与 R-P7-AC 要消灭的伤害同类，而且**不需要写入任何猜测**就能产生）。故现在两条硬规则：
 *
 *   · 来源未知（没有记录 / 脏值 / **读取中** / 读失败）时切换 ⇒ **作废记录**（写空串，走既有
 *     `setMeta`，不需要新 API；空串在本模块就是「没有记录」）——宁可退回中性，也不留会反相的陈旧记录；
 *   · **迟到的读结果**若出生在切换之前 ⇒ **丢弃**（`shouldAcceptLateRead`），不得覆盖本地态。
 * 两条都是**纯决策**（`toggleDirectionWrite` / `shouldAcceptLateRead`），`.tsx` 只接线。
 *
 * 为什么单独成 `.ts` 模块（P6 的 I-4 教训，与 `skill-export.ts` 同款）：弹窗是 `.tsx`，而
 * `node --test` **import 不了**（`ERR_UNKNOWN_FILE_EXTENSION`）。故判定 / 来源 / 翻转 /「方向 →
 * 标注」的映射 / 落库闸门都必须待在这里；组件只做接线（接线的正确性归 T5 活体验收，不在此造空洞断言）。
 *
 * 纯：无 React、无 DOM；HTTP 由调用方**注入**（`getMeta` / `setMeta`，真实现 = 既有 `api.*`）。
 *
 * ⚠️ **meta 键约定（与 T3 同一形态）**：每条提示词一个键，形如 `pl:refined-dir:<promptId>`，
 * 值为**裸的** `original` / `refined`。`pl:` 是本插件在宿主 meta 表里的命名空间，其后按
 * `<用途>:<promptId>` 排布（冒号分段，不拼长句）——与 `skill-export.ts#skillDescriptorMetaKey`
 * 的 `pl:skill-descriptor:<id>` 同款（T3 立的规矩，本任务沿用，不自创新前缀）。
 */
import { api } from "./api.ts";
import type { PromptEnhancerKey } from "./i18n.ts";

/** 已知方向只两个值；`none` = **不知道**（中性标注，且一律不落库）。 */
export type RefinedDirection = "original" | "refined" | "none";

/** 能落进 meta 的值：只有两个已知方向（`none` 不是记录）。 */
export type StoredDirection = Exclude<RefinedDirection, "none">;

/**
 * 判定所需的窄接口：**只有 `sourceBody`**。`aiRefined` 不再参与判定——R-P7-AC：它是「发生过一次
 * 写回」的印记，**不是**「此刻的 `body` 是哪一侧」的证据（宿主 swap 不会更新它，所以它会在切换过的
 * 记录上给出反相答案）。
 */
export interface DirectionCarrier {
  /** AI 优化前的原文；非空才谈得上「两侧对比」（与 `canToggle` / 宿主 rollback 守卫同口径）。 */
  sourceBody?: string;
}

/** 判定的**来源**：`record` = meta 有可用记录（可信、可落库）；`fallback` = 没有（中性、不落库）。 */
export type DirectionSource = "record" | "fallback";

/** 一次判定：方向 + 来源。组件按 `direction` 标注，按 `source` 决定能否落库。 */
export interface DirectionReading {
  direction: RefinedDirection;
  source: DirectionSource;
}

/** 「不知道」的唯一取值（没有记录 / 脏值 / 读取中 / 只有一侧）。**只读**，不要改写它。 */
export const UNKNOWN_READING: DirectionReading = { direction: "none", source: "fallback" };

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

// ── 判定（方向 + 来源）───────────────────────────────────────────────────────

/** 两侧都在（`sourceBody` 非空）才谈得上「方向」：只有一侧时两栏对比根本不成立。 */
export function hasTwoBodies(prompt: DirectionCarrier): boolean {
  return Boolean(prompt.sourceBody);
}

/**
 * meta 文本 → 已存方向。**缺失 / 空串 / 未知值 / 坏 JSON 一律 `undefined`**（= 没有记录），**绝不抛**。
 *
 * 口径刻意从严：本键的约定就是**裸的** `original` / `refined`（只容忍首尾空白）。其余任何内容
 * （`none`、`ORIGINAL`、`{"dir":"original"}`、`"refined"` 这种 JSON 文本、半截 JSON…）都意味着
 * 「写下它的不是本模块、或不是这个版本」——读成「没有记录」（⇒ 中性）比照着猜一次方向更安全。
 */
export function parseStoredDirection(raw: string | undefined): StoredDirection | undefined {
  if (raw === undefined) return undefined;
  const text = raw.trim();
  if (text === "") return undefined;
  if (text === "original" || text === "refined") return text;
  // 脏值的后果是「标注退回中性」，必须可见（但绝不阻断渲染、绝不抛）。
  console.warn("[prompt-enhancer] 「原文 / 优化稿」方向的 meta 值不可识别（按无记录处理）：" + JSON.stringify(raw));
  return undefined;
}

/**
 * 纯判定（本模块的核心）：给「该提示词的现状」与「已存的 meta 文本」⇒ `{ direction, source }`。
 *
 * 次序（每一步都有对应用例，且做过变异验证）：
 *  ① **只有一侧** ⇒ 兜底（对比不成立，任何记录都造不出第二侧）；
 *  ② **有可用记录** ⇒ `record` + 记录里的方向（**唯一**能给出「如实标注」的来源）；
 *  ③ 其余（缺失 / 脏值）⇒ 兜底 `none` + 中性——**不看 `aiRefined`**（R-P7-AC：那条推断会自信地
 *     标错，而且会被下一次切换固化成反相，用户任何操作都修不好）。
 */
export function readRefinedDirection(prompt: DirectionCarrier, stored: string | undefined): DirectionReading {
  if (!hasTwoBodies(prompt)) return UNKNOWN_READING;
  const recorded = parseStoredDirection(stored);
  if (recorded === undefined) return UNKNOWN_READING;
  return { direction: recorded, source: "record" };
}

/**
 * **落库闸门**：只有 `record` 来源的判定才可写（兜底 / 读取中一律不写）。
 * 「猜测不得被固化」在代码里就是这一行；组件与 `persistDirectionAfterToggle` 共用它，避免两处漂移。
 */
export function canPersistDirection(reading: DirectionReading): boolean {
  return reading.source === "record";
}

/**
 * 切换 = 宿主执行 swap(body, sourceBody) ⇒ 方向**翻转**（`original` ↔ `refined`）。
 *
 * 未知（`none`）翻转后**仍是未知**：swap 交换的是位置，不产生「哪一份是原文」的信息，不得借机
 * 定一个方向（否则「用户任何操作都修不好」的错误标注就从这一步长出来）。
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
  /** true = 方向不可知（兜底 / 读取中）⇒ 组件渲染中性表述，**不假装**知道哪一栏是哪一份。 */
  neutral: boolean;
}

/**
 * 方向 → 两栏标注键（**方向与标注的唯一映射点**：组件不再自己拼措辞，也不再看 `aiRefined`）。
 *
 * 两个已知方向给出的键**必须不同**（T4 约束 B 的硬要求：否则「恒返回 original」的实现也能全绿）；
 * `none` 走 P6 的中性表述（"两份正文" / "另一份"）——兜底来源只可能拿到 `none`，故中性是兜底的
 * **唯一**出口（R-P7-AC：带标记的错误标注仍然是错误标注）。
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
 * 读失败只 `console.warn` 并返回 `undefined`：读不到只让标注退回中性，**不得**影响详情页渲染。
 */
export async function loadStoredDirection(promptId: string, getMeta: MetaReader): Promise<string | undefined> {
  try {
    return await getMeta(refinedDirectionMetaKey(promptId));
  } catch (err) {
    console.warn("[prompt-enhancer] 读取「原文 / 优化稿」方向失败（本次打开退回中性标注）", err);
    return undefined;
  }
}

/**
 * 落库：把方向写进 meta（缺省实现 = 既有 `api.setMeta`，**不新增 API 方法**）。
 *
 * `none` **不写**（第二道闸门，第一道是 `canPersistDirection`）：未知方向不得落成记录。
 * 写失败只 `console.warn`——调用方此刻已经成功了（宿主已 swap / 已写回），一次库写失败不得把它
 * 变成失败，也不得挡住后续效果（T4 约束 A.2：失败可见 + 不阻塞）。
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
    console.warn("[prompt-enhancer] 「原文 / 优化稿」方向落 meta 失败（下次打开会退回中性标注）", err);
  }
}

/** 切换成功后**该写什么**：`persist` = 写翻转后的方向；`clear` = 作废那条可能已陈旧的记录（写空串）；`none` = 什么都不写。 */
export type ToggleWrite = "persist" | "clear" | "none";

/**
 * 纯决策（R-P7-AE 的第一条修法）：切换（宿主 swap）之后，库里那条记录该被怎么处理。
 *
 * 关键：**切换改变的是真值**（`body` / `sourceBody` 对调），所以任何「可能存在的记录」在切换之后都
 * **不再可信**——尤其当来源未知（没有记录 / 脏值 / **读取中** / 读失败）时，那条记录**没有跟着翻转**，
 * 它就变成了错的，而下一次挂载还会把它当作有效记录采信 ⇒ 自信且用户无法纠正的反相标注
 * （与 R-P7-AC 要消灭的伤害同类，且**不需要写入任何猜测**就能产生）。
 *
 *   · 来源 `record` ⇒ `persist`（写翻转后的方向，正常路径）；
 *   · 来源未知且两侧都在 ⇒ `clear`（**作废**：写空串。宁可退回「不知道」的中性，也不留一条会反相的
 *     陈旧记录——包括顺手清掉一条脏值）；
 *   · 只有一侧 ⇒ `none`（没有第二侧 ⇒ 谈不上方向，也没有需要作废的记录）。
 */
export function toggleDirectionWrite(prompt: DirectionCarrier, reading: DirectionReading): ToggleWrite {
  if (!hasTwoBodies(prompt)) return "none";
  return canPersistDirection(reading) ? "persist" : "clear";
}

/**
 * 纯决策（R-P7-AE 的第二条修法）：**迟到的读结果**是否采信。
 *
 * `toggledSinceRead` = 这次读**开始之后**是否发生过切换。为真时那个返回值描述的是**切换之前**的内容：
 * 贴到屏上就是错标注（库里虽然已被作废，屏上仍会先闪一帧错的，并让本地态误以为「有记录」）。故一律
 * 丢弃；为假（读取期间没有切换）才采信。
 */
export function shouldAcceptLateRead(toggledSinceRead: boolean): boolean {
  return !toggledSinceRead;
}

/**
 * **作废**记录：把键写**空串**（T4 约束 A.3 认可的清理路径；本模块对「没有记录」的判据就是空串 / 缺失，
 * 见 `parseStoredDirection`）。走既有 `api.setMeta`，**不需要新 API、不需要新依赖**。
 *
 * 失败只 warn：与其它 meta 写同款——一次库写失败不得把一次**成功**的切换变成失败（代价是本次作废没落库，
 * 即「不动它」的旧行为，严格不比修复前更糟；报告 §9 已记这条残差）。
 */
export async function clearRefinedDirection(
  promptId: string,
  setMeta: MetaWriter = (key, value) => api.setMeta(key, value),
): Promise<void> {
  try {
    await setMeta(refinedDirectionMetaKey(promptId), "");
  } catch (err) {
    console.warn("[prompt-enhancer] 「原文 / 优化稿」方向的旧记录作废失败（下次打开可能采信一条已陈旧的记录）", err);
  }
}

/**
 * 切换成功后落库的**唯一入口**（组件只调它）：按 `toggleDirectionWrite` 的决策执行——
 * `persist` 写**翻转后的**方向并返回它；`clear` 写空串并返回 `undefined`（本地态应回到「没有记录」）；
 * `none` **一次 `setMeta` 都不发**。写失败只 warn（内部），绝不抛。
 */
export async function applyToggleDirection(
  promptId: string,
  prompt: DirectionCarrier,
  reading: DirectionReading,
  setMeta: MetaWriter = (key, value) => api.setMeta(key, value),
): Promise<RefinedDirection | undefined> {
  const action = toggleDirectionWrite(prompt, reading);
  if (action === "none") return undefined;
  if (action === "clear") {
    await clearRefinedDirection(promptId, setMeta);
    return undefined;
  }
  const next = oppositeDirection(reading.direction);
  await saveRefinedDirection(promptId, next, setMeta);
  return next;
}

/**
 * **播种**：在方向**真正可知**之处写下第一条记录——即 §4.4 的 AI 写回缝刚成功时
 * （`ai-flow.ts#writeBackRefined` 的第二步）。那一刻写回的 `body` 就是优化稿 ⇒ 方向 `refined`，
 * 这条判定**不需要任何推断**（这正是它与「兜底推断」的本质区别，见 R-P7-AC）。
 *
 * 为什么必须有它：新语义下兜底来源不落库 ⇒ 没有播种点就**永远建不起记录**，详情页对谁都只能中性，
 * 整个功能失效。播种失败只 warn（复用 `saveRefinedDirection`），不影响已经成功的写回。
 */
export async function seedRefinedDirection(
  promptId: string,
  setMeta: MetaWriter = (key, value) => api.setMeta(key, value),
): Promise<void> {
  await saveRefinedDirection(promptId, "refined", setMeta);
}
