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

// ── 一键重导：同名覆盖同一目录，**绝不新增目录**（验收 16）────────────────────

/** 重导请求体：**只有** promptId（宿主据此查库取既有 skillName 与目录归属）。 */
export interface SkillReExportRequest {
  promptId: string;
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
 * 请求体**只**带 `promptId`，一个键都不多——这就是「同名覆盖、不新增目录」的全部机制：
 *   · 不带 `name`：宿主落到 `body.name ?? descriptor?.name ?? prompt.skillName` 的**最后一格**
 *     （既定事实见 `src/host/routes.ts` 的技能导出分支），取的是盘上已有的名字 ⇒ 写回同一目录。
 *     带 name 等于「改名导出」，那会**新建目录**（正是验收 16 要挡的）。
 *   · 不带 `descriptor`：不再跑一次 AI 补名/补描述（名字与描述已在盘上，描述走兜底链）。
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
): Promise<SkillReExportOutcome<R>> {
  let receipt: R;
  try {
    receipt = await send({ promptId });
  } catch (err) {
    // 宿主 409 / 400 / 404 与网络异常一律原样可见（ApiError.message 就是宿主原文），不吞、不重试。
    return {
      ok: false,
      errorKey: "manager.skill.exportFailed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
  if (!receipt.path) {
    return { ok: false, errorKey: "manager.skill.pathMissing", detail: "keys=" + Object.keys(receipt).sort().join(",") };
  }
  return { ok: true, receipt };
}