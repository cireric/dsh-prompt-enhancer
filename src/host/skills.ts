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
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
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
export { isSkillStale } from "../skill-badge.ts";

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

/**
 * description 兜底链：summary → AI description → 正文首行 → 标题。
 * 全空则返回 `undefined`——调用方**必须拒绝导出**（官方 loader 要求 description 必填，
 * 空描述会让模型无法自动发现该技能；上游直接写空串是缺陷）。
 */
export function resolveDescription(prompt: SkillPromptLike, descriptor?: SkillDescriptor): string | undefined {
  const candidates = [
    prompt.summary,
    descriptor?.description,
    prompt.body.split("\n").map((l) => l.trim()).find((l) => l.length > 0),
    prompt.title,
  ];
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value) return value;
  }
  return undefined;
}

/** YAML 双引号标量：JSON 字符串转义与 YAML 双引号风格兼容，能安全承载冒号/引号/换行。 */
function yamlQuote(value: string): string {
  return JSON.stringify(value);
}

/** 渲染 SKILL.md：frontmatter + 正文原样。 */
export function renderSkillFile(input: {
  name: string;
  description: string;
  whenToUse?: string;
  body: string;
}): string {
  const front = ["---", `name: ${input.name}`, `description: ${yamlQuote(input.description)}`];
  if (input.whenToUse?.trim()) front.push(`whenToUse: ${yamlQuote(input.whenToUse.trim())}`);
  front.push("---", "");
  return front.join("\n") + "\n" + input.body.trim() + "\n";
}

/** 目标目录是否已存在（同名冲突判定用）。 */
export function skillExists(name: string): boolean {
  return existsSync(skillFilePath(name));
}

export interface SkillExportInput {
  prompt: SkillPromptLike;
  /** 目标技能名（AI 生成或用户指定）；与 `descriptor.name` 二选一。 */
  name?: string;
  descriptor?: SkillDescriptor;
  /** 该技能名当前在**本插件内**归属的提示词 id（由路由查库传入）；用于区分「我们的」与「用户手写的」。 */
  ownerPromptId?: string;
  /** 目标目录已存在且不属于本插件时，路由确认后的重试标记。 */
  conflictConfirmed?: boolean;
}

export interface SkillExportResult {
  ok: boolean;
  name?: string;
  path?: string;
  error?: string;
  /** 需要用户先确认同名冲突（目标目录已存在，且不属于本插件任何提示词）。 */
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
      error: `技能目录 ${name} 已存在，且不属于本插件的任何提示词（可能是你手写的技能）`,
    };
  }

  try {
    mkdirSync(skillDir(name), { recursive: true });
    writeFileSync(
      path,
      renderSkillFile({
        name,
        description,
        whenToUse: input.descriptor?.whenToUse,
        body: input.prompt.body,
      }),
      "utf8",
    );
  } catch (e) {
    return { ok: false, name, error: "写入技能文件失败：" + String(e) };
  }

  return { ok: true, name, path };
}
