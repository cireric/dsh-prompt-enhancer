/**
 * 技能导出的**非组件纯逻辑**：勾选 / 全选 / 按标签筛选 / 预校验 / 逐条 AI 补全编排 / 导出编排 /
 * 结果汇总（规格 §7.6 / 验收 15、17）。
 *
 * 为什么单独成模块（P6 的 I-4 教训：D-1 正是死在「非组件、可测」的缝上）：
 * 弹窗本体是 `.tsx`，而 `node --test` **import 不了 `.tsx`**——实测
 * `TypeError: Unknown file extension ".tsx"`（Node 的类型擦除不认 JSX），本仓库又没有 react-dom /
 * 组件渲染通道（硬约束 5）。因此凡是需要被断言的行为都必须待在 JSX-free 的模块里；
 * 组件只做接线，接线的正确性归 T5 活体验收（**不**在此造空洞断言）。
 *
 * 纯：无 React、无 DOM、无 fetch——HTTP 与确认弹窗都由调用方**注入**（`send` / `confirmConflict`），
 * 于是三条易错的时序（AI 单条失败不阻断 / 409 确认后重试 / 预校验提前拒绝）都能用假实现逐条钉住。
 *
 * 技能名规则来自 `src/skill-name.ts`——与宿主 `src/host/skills.ts` **同一份**（宿主也改成从那里
 * import）；`src/host/skills.ts` 顶部有 `node:fs`，客户端 bundle 引不了（P7 T2 的 R-P7-I 修正）。
 */
import { isValidSkillName, toKebab } from "../../skill-name.ts";
import { ApiError, type SkillDescriptorPayload, type SkillExportReceipt } from "./api.ts";

// ── 在途批次的取消令牌（R-P7-X 修复轮 1）────────────────────────────────────

/**
 * 一次在途批次（AI 补全或导出）的**取消令牌**。技能页卸载（= 用户离开，切页签 / 关闭面板）时
 * `cancel()`；编排在**每个条目之前**读它，于是：
 *
 *  · **不再启动新条目**（要求 1）——已经开始的那条让它跑完，不硬断 HTTP；
 *  · **不再弹出同名冲突确认**（要求 3）——离开后确认框没有上下文来源，用户不知道它在问什么；
 *  · **已完成的条目照旧回调**（要求 2）——广播不能因为组件没了就被跳过（验收 16 的徽标依赖它）。
 *
 * 为什么不直接 `AbortSignal`：条目的 HTTP 是 `api.*` 内部的信封调用，且「取消」在这里的语义是
 * 「别再开新的」而不是「掐断写盘」——写盘是宿主的**副作用**，中途掐断既拦不住已发出的请求，
 * 又会把「成功但结果丢失」变成「成功/失败不明」。故取消做成**协作式**：条目边界上一个布尔量。
 */
export interface SkillRun {
  cancelled: boolean;
  cancel(): void;
}

/** 建一个未取消的令牌。 */
export function createSkillRun(): SkillRun {
  const run: SkillRun = {
    cancelled: false,
    cancel() {
      run.cancelled = true;
    },
  };
  return run;
}

/** 参与导出的提示词字段（窄接口：纯逻辑不依赖整条 `Prompt` 的其它字段）。 */
export interface SkillCandidate {
  id: string;
  title: string;
  body: string;
  summary?: string;
  tags?: string[];
  /** 已导出的技能名（重导时的名字候选，序与宿主 routes.ts 的 `body.name ?? descriptor?.name ?? prompt.skillName` 一致）。 */
  skillName?: string;
}

/** 预校验 / 导出失败的 i18n 键（宿主的最终判定报错走 detail 原文，不占这些键）。 */
export type SkillExportErrorKey =
  | "manager.skill.nameMissing"
  | "manager.skill.nameInvalid"
  | "manager.skill.descMissing"
  | "manager.skill.exportFailed"
  | "manager.skill.pathMissing";

// ── 勾选 / 筛选 ──────────────────────────────────────────────────────────────

/** 勾选或取消勾选一条（返回**新数组**：调用方 setState 直接换引用，便于 React 察觉变化）。 */
export function toggleSelected(selected: readonly string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
}

/** 可见集合是否**全部**已勾选（空集合不算「全部已选」——否则空列表上的按钮语义会翻转）。 */
export function isAllSelected(visible: readonly SkillCandidate[], selected: readonly string[]): boolean {
  return visible.length > 0 && visible.every((p) => selected.includes(p.id));
}

/**
 * 「全选 / 清除」按钮：可见集合**已全选**时只把可见集合移出选择（集合外的勾选保留），
 * 否则把可见集合全部加入（同样是并集）。故它受标签筛选影响，而不会悄悄吃掉抽屉外的勾选。
 */
export function toggleAllVisible(visible: readonly SkillCandidate[], selected: readonly string[]): string[] {
  if (isAllSelected(visible, selected)) {
    return selected.filter((id) => !visible.some((p) => p.id === id));
  }
  const out = [...selected];
  for (const prompt of visible) if (!out.includes(prompt.id)) out.push(prompt.id);
  return out;
}

/** 按标签筛选：`tag === ""` = 不过滤（与列表页「全部标签」同口径）。 */
export function filterByTag<T extends { tags?: string[] }>(prompts: readonly T[], tag: string): T[] {
  if (tag === "") return [...prompts];
  return prompts.filter((p) => (p.tags ?? []).includes(tag));
}

/** 筛选下拉的候选标签：去重后按 `localeCompare` 稳定排序（顺序不得随加载次序漂移）。 */
export function collectTags(prompts: readonly SkillCandidate[]): string[] {
  const out: string[] = [];
  for (const prompt of prompts) {
    for (const tag of prompt.tags ?? []) if (!out.includes(tag)) out.push(tag);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

/** 按**列表顺序**（不是勾选顺序）取已选条目：导出顺序与结果清单都稳定。 */
export function pickSelected<T extends { id: string }>(prompts: readonly T[], selected: readonly string[]): T[] {
  return prompts.filter((p) => selected.includes(p.id));
}

// ── 预校验 ───────────────────────────────────────────────────────────────────

/**
 * description 兜底链的**客户端预检**：summary → AI description → 正文首个非空行 → 标题。
 *
 * 与宿主 `src/host/skills.ts#resolveDescription` **逐格同值**（包括 `split("\n")` 这个细节：
 * 客户端不得「顺手改好」`\r` 的切分，否则预检与宿主判定会在 `\r`-only 正文上分叉）。
 * 为什么复制一份：宿主模块 import `node:fs`，客户端引不了（见文件头）；两处同值这件事由
 * `tests/skill-export.test.mjs` 用**同一张输入表**同时喂两个实现来锁住——漂移必红。
 * **最终判定仍以宿主为准**：这里只负责「提前报错」，不替宿主下结论。
 */
export function resolveDescriptionForClient(
  prompt: SkillCandidate,
  descriptor?: SkillDescriptorPayload,
): string | undefined {
  const candidates = [
    prompt.summary,
    descriptor?.description,
    prompt.body.split("\n").map((line) => line.trim()).find((line) => line.length > 0),
    prompt.title,
  ];
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value) return value;
  }
  return undefined;
}

/** 预校验结果：通过时给出**将要提交给宿主的**名字与描述（宿主仍是最终判定者）。 */
export type SkillPrecheck =
  | { ok: true; name: string; description: string }
  | { ok: false; errorKey: SkillExportErrorKey; detail: string };

/**
 * 导出前的预校验（规格 §7.6 的「校验」步）：名字必须先过 `toKebab` + `isValidSkillName`，
 * 描述必须非空（兜底链全空 ⇒ 宿主一定拒绝，这里提前给可读错误，不把请求发出去白跑一趟）。
 *
 * 名字候选的序与宿主一致：`descriptor.name → prompt.skillName`（客户端不发 `name` 时宿主也这么算）；
 * 通过后客户端会把 kebab 后的名字**显式**发出去，于是「宿主算出来的名字」与预检结果是同一个。
 * `detail` 只承载**纯数据**（措辞一律由 errorKey 的 i18n 键承担，A10：en 语言下不得混排中文）。
 */
export function precheckExport(prompt: SkillCandidate, descriptor?: SkillDescriptorPayload): SkillPrecheck {
  const raw = descriptor?.name ?? prompt.skillName ?? "";
  const name = toKebab(raw);
  if (!isValidSkillName(name)) {
    // 「还没补全过」与「补全了但名字非法」是两种处境，给不同的键（用户要做的事不同）。
    return {
      ok: false,
      errorKey: raw.trim() === "" ? "manager.skill.nameMissing" : "manager.skill.nameInvalid",
      detail: "kebab=" + JSON.stringify(name),
    };
  }
  const description = resolveDescriptionForClient(prompt, descriptor);
  if (description === undefined) {
    return {
      ok: false,
      errorKey: "manager.skill.descMissing",
      detail: "summary|descriptor.description|body[0]|title all empty",
    };
  }
  return { ok: true, name, description };
}

// ── 逐条 AI 补全 ─────────────────────────────────────────────────────────────

/** 一条的 AI 补全结果：失败只影响该条（`detail` 是宿主/AI 侧的原文，可能是中文，原样透出）。 */
export type DescriptorOutcome =
  | { ok: true; descriptor: SkillDescriptorPayload }
  | { ok: false; errorKey: "manager.skill.describeFailed"; detail: string };

/** `describeEach` 的可选面：取消令牌与逐条回调。 */
export interface DescribeEachOptions {
  /** 取消令牌：置位后**不再启动新条目**（离开技能页的语义），已完成的条目仍会回调 `onEach`。 */
  run?: SkillRun;
  /** 每条结果的就地回调（UI 的响应式渲染点），不影响「失败不阻断」的语义。 */
  onEach?: (id: string, outcome: DescriptorOutcome) => void;
}

/**
 * 逐条「AI 补全名称与描述」（`POST /ai/skill-descriptor`）——**失败非阻断**（规格 §7.6：
 * 「失败条目行内红色标注，不阻断其它条目」）。
 *
 * 这就是「不阻断」的**唯一实现点**：单条失败被就地记成 `{ok:false}` 并**继续下一条**，
 * 绝不 throw、绝不中途 return（AI 不可用时宿主回 503，用户仍应看到其余条目的补全结果）。
 * `onEach` 让 UI 能逐条刷新（响应式渲染点），不影响上面的语义。
 *
 * `options.run` 置位（用户已离开技能页）时**在条目边界停住**：不再发起新的 AI 调用，
 * 返回已经拿到的那部分结果（`Object.keys` 少几条 = 停在了哪里，UI 侧已卸载、不再渲染）。
 */
export async function describeEach(
  prompts: readonly SkillCandidate[],
  describeOne: (prompt: SkillCandidate) => Promise<SkillDescriptorPayload>,
  options: DescribeEachOptions = {},
): Promise<Record<string, DescriptorOutcome>> {
  const out: Record<string, DescriptorOutcome> = {};
  for (const prompt of prompts) {
    // 要求 1（AI 侧）：离开即停——不启动新条目。
    if (options.run?.cancelled) break;
    let outcome: DescriptorOutcome;
    try {
      outcome = { ok: true, descriptor: await describeOne(prompt) };
    } catch (err) {
      outcome = { ok: false, errorKey: "manager.skill.describeFailed", detail: reasonOf(err) };
    }
    out[prompt.id] = outcome;
    options.onEach?.(prompt.id, outcome);
  }
  return out;
}

// ── 导出编排 ─────────────────────────────────────────────────────────────────

/** 每次 `POST /skills/export` 的入参（`conflictConfirmed` 由编排决定，UI 不自己拼）。 */
export interface SkillExportRequest {
  name: string;
  descriptor?: SkillDescriptorPayload;
  conflictConfirmed: boolean;
}

/** 成功：名字与**目标文件路径**都取宿主回执（客户端不拼路径）。 */
export type ExportedOutcome = { status: "exported"; id: string; title: string; name: string; path: string };

/** 失败：`errorKey` 是我们要给的措辞，`detail` 是纯数据或宿主原文。 */
export type FailedOutcome = { status: "failed"; id: string; title: string; errorKey: SkillExportErrorKey; detail: string };

/** 跳过：用户在「同名目录不属于本插件」的确认里选了取消（不覆盖、不算失败）。 */
export type DeclinedOutcome = { status: "declined"; id: string; title: string; name: string; detail: string };

/** 一条的导出结局（三态判别联合）。 */
export type ExportOutcome = ExportedOutcome | FailedOutcome | DeclinedOutcome;

export interface ExportEachInput {
  prompts: readonly SkillCandidate[];
  /** 该条的 AI 补全结果（缺省 = 没补全过，仍可凭 `skillName` 重导）。 */
  descriptors: Record<string, DescriptorOutcome>;
  send: (prompt: SkillCandidate, request: SkillExportRequest) => Promise<SkillExportReceipt>;
  /** 同名目录不属于本插件时先问用户（真实现 = `confirm.ts#requestConfirm`）；返回 false = 不覆盖。 */
  confirmConflict: (info: { id: string; title: string; name: string; detail: string }) => Promise<boolean>;
  /** 取消令牌：置位后**不再启动新条目**、也不再弹同名冲突确认（见 `SkillRun`）。 */
  run?: SkillRun;
  /**
   * 每条**成功落盘之后**立即回调（真实现 = `notifyDataChanged()`）。
   *
   * 为什么做成回调而不是「批次结束后由调用方统一广播」：用户可能在批次跑到一半时离开技能页
   * （组件卸载），若广播挂在批次末尾的组件回调里，就会随组件一起消失——宿主的 `skillName` /
   * `skillExportedAt` 已写库，而列表页不重拉 ⇒ **验收 16 的徽标不出现**（「导出成功但什么都没发生」）。
   * 回调在**每条成功的那一刻**触发，因此与组件在世与否无关（要求 2）。
   */
  onExported?: (outcome: ExportedOutcome) => void;
}

/**
 * 逐条导出（规格 §7.6 的「导出」步）。三条不变量（每条都有对应用例，且都做过变异验证）：
 *
 *  1. **预校验先行**：`precheckExport` 不通过就**不发出请求**（名字非法 / 描述兜底链全空），
 *     结果是带 errorKey 的 failed——宿主的 400 是最终判定，但客户端不该先白跑一趟。
 *  2. **409 才问，且重试必须带 `conflictConfirmed: true`**：宿主 409 专用于「同名目录不属于本插件
 *     （可能是你手写的技能）」（routes.ts）；用户取消 → `declined`（不覆盖、不算失败）；
 *     确认后重试仍失败 → failed（**不再二次询问**，否则用户确认一次就够，不该陷入循环）。
 *  3. **目标目录只取宿主回执**：`receipt.path` 缺席时显式报 `manager.skill.pathMissing`——
 *     客户端不知道 `DSH_HOME`，**不得**自己拼路径（这条同时挡住「假成功」）。
 *  4. **离开即停 + 完成即广播**（R-P7-X 修复轮 1）：`run` 置位后不启动新条目、不再弹确认；
 *     而每条**成功落盘**都立刻走 `onExported`（即使这一刻组件已经卸载）——见 `ExportEachInput`。
 */
export async function exportEach(input: ExportEachInput): Promise<ExportOutcome[]> {
  const outcomes: ExportOutcome[] = [];
  for (const prompt of input.prompts) {
    // 要求 1（导出侧）：离开即停——不启动新条目（已发出的那条让它跑完，见 SkillRun 的注释）。
    if (input.run?.cancelled) break;
    outcomes.push(await exportOne(prompt, input));
  }
  return outcomes;
}

async function exportOne(prompt: SkillCandidate, input: ExportEachInput): Promise<ExportOutcome> {
  const recorded = input.descriptors[prompt.id];
  const descriptor = recorded?.ok ? recorded.descriptor : undefined;
  const pre = precheckExport(prompt, descriptor);
  if (!pre.ok) {
    return { status: "failed", id: prompt.id, title: prompt.title, errorKey: pre.errorKey, detail: pre.detail };
  }

  const request: SkillExportRequest = { name: pre.name, descriptor, conflictConfirmed: false };
  let receipt: SkillExportReceipt;
  try {
    receipt = await input.send(prompt, request);
  } catch (err) {
    if (!isConflict(err)) return failedOutcome(prompt, err);
    /**
     * 要求 3：用户已离开技能页 ⇒ **不弹**同名冲突确认。此刻弹出来的框没有任何上下文来源
     * （技能页已卸载，用户不知道它在问哪一条），故按「没有确认 ⇒ 不覆盖」落地成 `declined`：
     * 事实与「用户点了取消」逐字相同（未确认 ⇒ 未覆盖），且该条此刻无处渲染。
     */
    if (input.run?.cancelled) {
      return { status: "declined", id: prompt.id, title: prompt.title, name: pre.name, detail: reasonOf(err) };
    }
    const approved = await input.confirmConflict({
      id: prompt.id,
      title: prompt.title,
      name: pre.name,
      detail: reasonOf(err),
    });
    if (!approved) {
      return { status: "declined", id: prompt.id, title: prompt.title, name: pre.name, detail: reasonOf(err) };
    }
    try {
      receipt = await input.send(prompt, { ...request, conflictConfirmed: true });
    } catch (retryErr) {
      return failedOutcome(prompt, retryErr);
    }
  }

  if (!receipt.path) {
    return {
      status: "failed",
      id: prompt.id,
      title: prompt.title,
      errorKey: "manager.skill.pathMissing",
      detail: "keys=" + Object.keys(receipt).sort().join(","),
    };
  }
  // 名字取**宿主回执**（它才是最终判定者），而不是预检算出来的那个。
  const exported: ExportedOutcome = { status: "exported", id: prompt.id, title: prompt.title, name: receipt.name, path: receipt.path };
  /**
   * 要求 2：**完成即广播**。宿主此刻已经把 `skillName` / `skillExportedAt` 写库，
   * 数据变更必须让消费者知道——否则列表页不重拉、验收 16 的徽标不出现（「导出成功但什么都没发生」）。
   * 回调里不得有任何依赖组件在世的东西（真实现只是 `notifyDataChanged()`）。
   */
  input.onExported?.(exported);
  return exported;
}

/** 409 判定按 **HTTP 状态**（不匹配文案；宿主 409 专用于同名目录冲突）。 */
function isConflict(err: unknown): boolean {
  return err instanceof ApiError && err.status === 409;
}

function failedOutcome(prompt: SkillCandidate, err: unknown): ExportOutcome {
  return {
    status: "failed",
    id: prompt.id,
    title: prompt.title,
    errorKey: "manager.skill.exportFailed",
    detail: reasonOf(err),
  };
}

/** 失败原因给人看的那一行：ApiError / Error 自带可读 message（宿主原文），其余 String()。 */
function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ── 结果汇总 ─────────────────────────────────────────────────────────────────

/**
 * 结果汇总（规格 §7.6 的「成功/失败清单」）：三桶 + 计数，UI 只渲染这个结构。
 *
 * 三个桶按**判别联合**收窄（`Extract<…>`）：渲染点因此不需要再写一次 `status` 判断，
 * 「成功清单里冒出 errorKey」「失败行里读 path」这类错配在编译期就被拦住。
 */
export interface ExportSummary {
  exported: ExportedOutcome[];
  failed: FailedOutcome[];
  declined: DeclinedOutcome[];
  okCount: number;
  failCount: number;
  declinedCount: number;
  total: number;
}

export function summarizeExport(outcomes: readonly ExportOutcome[]): ExportSummary {
  const exported = outcomes.filter((o): o is ExportedOutcome => o.status === "exported");
  const failed = outcomes.filter((o): o is FailedOutcome => o.status === "failed");
  const declined = outcomes.filter((o): o is DeclinedOutcome => o.status === "declined");
  return {
    exported,
    failed,
    declined,
    okCount: exported.length,
    failCount: failed.length,
    declinedCount: declined.length,
    total: outcomes.length,
  };
}
