/**
 * 「技能已过期」判定的**零依赖单一真源**（P7 T3 / 规格 §7.6 / 验收 16）。
 *
 * 与 `src/skill-name.ts` 同款的处境（P7 T2 的 R-P7-I 修正）：这条规则要**双方共用**，而两个
 * 消费者各自的 **bundle 面不同**——
 *   · 宿主 `src/host/skills.ts`：导出时它就是判定者，但顶部 `import ... from "node:fs"`；
 *   · 客户端 `SkillBadge.tsx`：列表行与详情页要显示徽标，而客户端 bundle 引用不了 `node:fs`
 *     （浏览器里没有它，硬约束 12 也只允许 `react` / `react/jsx-runtime` 两个 external）。
 * 故规则搬到这里：宿主改为 `import` + **原样 re-export**（既有导出面逐字不变 ⇒
 * `tests/skills.test.mjs` 与 routes.ts 无需改动），客户端直接消费同一份。
 *
 * **本模块零 import**：既能被 `node --test` 直接 import（测试直跑 `.ts` 源码），也能进 esbuild 的
 * 客户端与宿主 bundle。「两边是同一份规则」这件事**不可以靠两份恰好相同**来保证——那必然漂移，
 * 故 `tests/skill-badge.test.mjs` 用**函数恒等**（`hostSkills.isSkillStale === isSkillStale`）钉住。
 */

import { reasonOf } from "./err-text.ts";

/** 过期判定只读这三个字段（窄接口：调用方传整条 `Prompt` 也满足）。 */
export interface SkillStalenessLike {
  /** 已导出的技能名（kebab-case）；缺省 / 空串 = 从未导出。 */
  skillName?: string;
  updatedAt: number;
  /** 上次导出时间；小于 updatedAt 即「技能已过期」（见 `src/types.ts` 的字段注释）。 */
  skillExportedAt: number;
}

/**
 * 「技能已过期」判定：**导出过**、且导出后提示词又改过。
 *
 * 边界（验收 16 明确要求）：`updatedAt === skillExportedAt` **不算过期**——「刚导出完立刻看」
 * 必须是未过期。符号是 `>` 而不是 `>=`，与宿主 P3-D8 的原判定**逐字一致**（不得顺手改）。
 */
export function isSkillStale(prompt: SkillStalenessLike): boolean {
  return Boolean(prompt.skillName) && prompt.updatedAt > prompt.skillExportedAt;
}

/** 徽标三态：`none` = 不渲染；`exported` = 已导出且未过期；`stale` = 导出后又改过。 */
export type SkillBadgeState = "none" | "exported" | "stale";

/**
 * 把三态收敛成一个枚举——**渲染点只 switch 它**，不自己再写一遍条件（否则三态与判定就成了
 * 两处真源，迟早分叉）。
 */
export function skillBadgeState(prompt: SkillStalenessLike): SkillBadgeState {
  if (!prompt.skillName) return "none";
  return isSkillStale(prompt) ? "stale" : "exported";
}
/** 徽标三态里**需要渲染**的两态的渲染参数（`none` 不渲染，故不在其中）。 */
export interface SkillBadgeVisual {
  /** 语义色名：渲染点映射到 `src/client/utils/theme.ts` 的 `TONE`（`success` = 绿 / `warn` = 警示色）。 */
  tone: "success" | "warn";
  /** 文案键（渲染点直接 `t(labelKey)`）。 */
  labelKey: "manager.skill.badgeExported" | "manager.skill.badgeStale";
  /** 是否渲染「重新导出」按钮（只有过期态需要重导）。 */
  action: boolean;
  /** 是否在文案后附上技能名（只有「已导出技能 <name>」这一态需要）。 */
  showName: boolean;
}

/**
 * 状态 → 渲染参数（规格 §7.6：已导出绿、已过期警示色 + 重导按钮）。**渲染点不自己再判一次状态**：
 * 色名 / 文案键 / 是否带动作 / 是否附名，四者在这一处收敛——三态语义或配色变化只改这里。
 */
export function skillBadgeVisual(state: Exclude<SkillBadgeState, "none">): SkillBadgeVisual {
  return state === "stale"
    ? { tone: "warn", labelKey: "manager.skill.badgeStale", action: true, showName: false }
    : { tone: "success", labelKey: "manager.skill.badgeExported", action: false, showName: true };
}

// ── 一键重导：同名覆盖同一目录，**绝不新增目录**（验收 16）────────────────────

/** AI 补全的技能名/描述（结构照 `api.ts` 的 `SkillDescriptorPayload`；本模块零 import，故在此重述）。 */
export interface SkillDescriptorLike {
  name: string;
  description: string;
  whenToUse?: string;
}

/**
 * 重导请求体：`promptId` 必带；`descriptor` 是首次导出时存进 meta 的那一份（R-P7-AA），
 * 读得到就原样回传、读不到就**整个不带**（退回宿主兜底链）。
 */
export interface SkillReExportRequest {
  promptId: string;
  descriptor?: SkillDescriptorLike;
}

/** 宿主回执里与本次判定有关的两个字段；`path` 缺席 = 契约漂移。 */
export interface SkillReExportReceiptLike {
  name: string;
  path?: string;
}

/** 重导结局：成功带回执原文（详情页据此就地刷新技能状态），失败带 i18n 键与原始 detail。 */
export type SkillReExportOutcome<R> =
  | { ok: true; receipt: R }
  | { ok: false; errorKey: "manager.skill.exportFailed" | "manager.skill.pathMissing"; detail: string };

/**
 * 一键重导（`POST /skills/export` 的单条形态）。
 *
 * 请求体只有两个键，各有分工，多一个都不要：
 *   · **必带 `promptId`**：宿主据此查库取既有 `skillName` 与目录归属（`routes.ts` 的技能导出分支）。
 *   · 不带 `name`：宿主按候选序 `prompt.skillName（非空）→ body.name → descriptor?.name` 取名——
 *     A / 重要-1 起已导出条目的**第一格就是盘上已有的名字**（不再需要靠「不传 name」才落到它），故重导
 *     写回同一目录；带**别的** name 也不再能改目录（宿主只把 name 当**首次导出**的候选）。这正是验收 16 要挡的。
 *   · **`descriptor` 读得到就原样回传**（R-P7-AA 修复轮 1）：它是首次导出成功时落进 meta 的那一份 AI
 *     补全结果。不带它时宿主只能走 description 兜底链、并且**丢掉 `whenToUse`**——而「AI 生成了 whenToUse
 *     却被客户端丢弃」正是 `src/host/skills.ts` 文件头声明修掉的上游缺陷，重导是**常规路径**（徽标的
 *     意义就是「改了就重导」），不补这条它就会原样复活。meta 缺失时（本轮之前导出的、或从未跑过 AI
 *     补全的）退回兜底链，**不得因此失败**。
 *   · 不带 `conflictConfirmed`：不替用户确认覆盖。同名目录**属于本插件自己**（ownerPromptId
 *     就是本条）时本就不该 409；真回 409 就说明那是用户手写的技能目录，必须让它挡住。
 *
 * `send` 由调用方注入（真实现 = `api.exportPromptAsSkill`），故本模块保持零依赖、可单测；
 * 目标目录一律取**宿主回执**的 `path`，缺席即报契约漂移——客户端不知道 `DSH_HOME`，
 * 不得自己拼路径（同 T2 的 `pathMissing` 口径，也顺带挡住「假成功」）。
 */
export async function reExportSkill<R extends SkillReExportReceiptLike>(
  promptId: string,
  send: (request: SkillReExportRequest) => Promise<R>,
  descriptor?: SkillDescriptorLike,
): Promise<SkillReExportOutcome<R>> {
  // 有 descriptor 才带这个键：请求形状用例用 deepEqual 钉住「降级时不得多出半个键」。
  const request: SkillReExportRequest = descriptor ? { promptId, descriptor } : { promptId };
  let receipt: R;
  try {
    receipt = await send(request);
  } catch (err) {
    // 宿主 409 / 400 / 404 与网络异常一律原样可见（ApiError.message 就是宿主原文），不吞、不重试。
    return {
      ok: false,
      errorKey: "manager.skill.exportFailed",
      detail: reasonOf(err),
    };
  }
  if (!receipt.path) {
    return { ok: false, errorKey: "manager.skill.pathMissing", detail: "keys=" + Object.keys(receipt).sort().join(",") };
  }
  return { ok: true, receipt };
}