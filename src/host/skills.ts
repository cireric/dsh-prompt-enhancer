/**
 * 技能导出（规格 §6.5，D8）——**只导出，不做反向导入**。
 *
 * 目标：`$DSH_HOME/skills/<name>/SKILL.md`（官方 skill-filesystem 的 user-dsh root，自动发现 + watch）。
 * frontmatter：`name`（必填）/ `description`（必填）/ `whenToUse`（可选）——三个字段**全部落盘**
 * （修上游「AI 生成了 whenToUse 却被客户端丢弃」的缺陷）。
 *
 * 本模块不 import store：目录归属判定所需的「这个技能名属于哪条提示词」由路由层查库后传入（P3-D8），
 * 因此它可以脱离宿主与数据库单测。
 */
import { randomUUID } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dshHome } from "./paths.ts";
import type { SkillDescriptor } from "./ai.ts";
// 技能名规则（SKILL_NAME_RE / SKILL_NAME_MAX_LEN / toKebab / isValidSkillName）的**单一真源**在
// `src/skill-name.ts`：本模块顶部有 `node:fs`，客户端 bundle 引用不了，故规则必须待在零依赖模块里
// （P7 T2 的 R-P7-I 修正：计划原先写「客户端复用 skills.ts 的导出」，那条不可执行）。
// 这里只 import + 原样 re-export——**既有导出面逐字不变**（tests/skills.test.mjs 与 routes.ts 无需改）。
import { isValidSkillName, toKebab } from "../skill-name.ts";

export { SKILL_NAME_MAX_LEN, SKILL_NAME_RE, isValidSkillName, toKebab } from "../skill-name.ts";

// 「技能已过期」判定（P7 T3）的**单一真源**在 `src/skill-badge.ts`，同款理由：本模块顶部有
// `node:fs`，而客户端徽标 `SkillBadge.tsx` 引用不了它。这里只做**原样 re-export**——既有导出面
// 逐字不变（tests/skills.test.mjs 因此无需改）；「两边是同一份规则」由 tests/skill-badge.test.mjs
// 的**函数恒等**断言钉住（两份恰好相同的实现不算同源，会漂移）。本模块自己没有用到它，故不写
// import：`export ... from` 直接转发同一个绑定（既有导出面与恒等两全），也免了 TS6133 的未读名。
//
// ⚠️ **它不是死导出（T7-6 / P7 §10.4-6 的复核结论）**：P7 收尾记它「被 tree-shake 出 host bundle」，
// 但仓内**有引用**——`tests/skills.test.mjs` 与 `tests/skill-badge.test.mjs`（宿主 ↔ 徽标的**函数
// 恒等锁**）都从**本模块**取它。删掉会同时打红那两处，并拆掉「宿主与徽标同源」的唯一锁 ⇒ **保留**。
// `lib/index.js` 里看不到它，只说明宿主 loader 只取默认导出、这份绑定在产物里未被使用，与本模块的
// 导出面无关（客户端 bundle `lib/client.js` 里的 isSkillStale 走的是 `src/skill-badge.ts` 本身）。
export { isSkillStale } from "../skill-badge.ts";

// description 兜底链（summary → AI 描述 → 正文首行 → 标题）的**单一真源**在 `src/skill-description.ts`，
// 同款理由：本模块顶部有 `node:fs`，客户端 bundle 引不了它（客户端侧此前有一份靠逐格对照表维持同值的
// 副本，本次已收敛为一份实现）。这里只 import + 原样 re-export——**既有导出面逐字不变**
// （tests/skills.test.mjs、tests/skill-badge.test.mjs 的导出面清单与 routes.ts 无需改）。
import { renderSkillFile, resolveDescription } from "../skill-description.ts";

export { renderSkillFile, resolveDescription } from "../skill-description.ts";

/** 技能目录：`$DSH_HOME/skills/<name>/`。 */
export function skillDir(name: string): string {
  return join(dshHome(), "skills", name);
}

/** 技能文件：`$DSH_HOME/skills/<name>/SKILL.md`。 */
export function skillFilePath(name: string): string {
  return join(skillDir(name), "SKILL.md");
}

/** 导出用到的提示词字段（窄接口，避免依赖整个 store 类型）。 */
export interface SkillPromptLike {
  id: string;
  title: string;
  body: string;
  summary?: string;
  tags?: string[];
}

/** 目标目录是否已存在（同名冲突判定用）。 */
export function skillExists(name: string): boolean {
  return existsSync(skillFilePath(name));
}

/** Identify the file shown in a conflict, including replacements and in-place edits. */
export function skillFileVersion(name: string): string | undefined {
  const stat = statSync(skillFilePath(name), { bigint: true, throwIfNoEntry: false });
  return stat && [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(":");
}

function replaceSkillFile(path: string, contents: string): void {
  const temporary = `${path}.${randomUUID()}.tmp`;
  const fd = openSync(temporary, "wx", 0o600);
  try {
    try {
      writeFileSync(fd, contents, "utf8");
    } finally {
      closeSync(fd);
    }
    renameSync(temporary, path);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch (cleanupError) {
      console.warn("[prompt-enhancer] 未能清理技能导出的临时文件", cleanupError);
    }
    throw error;
  }
}

export interface SkillExportInput {
  prompt: SkillPromptLike;
  /** 目标技能名（AI 生成或用户指定）；与 `descriptor.name` 二选一。 */
  name?: string;
  descriptor?: SkillDescriptor;
  /** 该技能名当前在**本插件内**归属的提示词 id（由路由查库传入）；用于区分「我们的」与「用户手写的」。 */
  ownerPromptId?: string;
  /** 目标目录已有其他归属时，路由确认后的重试标记。 */
  conflictConfirmed?: boolean;
}

export interface SkillExportResult {
  ok: boolean;
  name?: string;
  path?: string;
  error?: string;
  /** 目标文件已存在，替换需要用户确认。 */
  conflict?: boolean;
}

/**
 * 导出（写盘）。失败一律返回 `{ ok: false, error }`，**绝不写半个文件**（先全部校验再落盘）。
 */
export function exportSkill(input: SkillExportInput): SkillExportResult {
  const name = toKebab(input.name ?? input.descriptor?.name ?? "");
  if (!isValidSkillName(name)) {
    return { ok: false, error: "技能名非法：必须是小写 kebab-case（仅字母、数字、连字符）" };
  }

  const description = resolveDescription(input.prompt, input.descriptor);
  if (!description) {
    return { ok: false, error: "无法生成非空 description（summary / AI 描述 / 正文首行 / 标题 全为空），已拒绝导出" };
  }

  const path = skillFilePath(name);
  if (skillExists(name) && input.ownerPromptId !== input.prompt.id && !input.conflictConfirmed) {
    return {
      ok: false,
      conflict: true,
      name,
      error: `技能目录 ${name} 已存在，覆盖需要确认`,
    };
  }

  try {
    const contents = renderSkillFile({
      name,
      description,
      whenToUse: input.descriptor?.whenToUse,
      body: input.prompt.body,
    });
    mkdirSync(skillDir(name), { recursive: true });
    replaceSkillFile(path, contents);
  } catch (e) {
    return { ok: false, name, error: `写入技能文件失败：${String(e)}` };
  }

  return { ok: true, name, path };
}
