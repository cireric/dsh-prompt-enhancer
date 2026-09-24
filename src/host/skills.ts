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

/** 技能名的严格形态：纯小写 kebab（官方 loader 只接受 [a-z0-9-]，且目录名即触发名）。 */
export const SKILL_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** 技能名长度上限（目录名不宜过长）。 */
export const SKILL_NAME_MAX_LEN = 64;

/**
 * 把候选名 kebab 化，供 AI 生成的 `"Weekly Report"` 这类输入使用。
 *
 * ⚠️ 含路径分隔符或 `..` 的输入一律返回空串（=拒绝），**不做猜测性修正**：
 * 「`../evil` 被悄悄改成 `evil` 再写盘」虽然路径安全，但会掩盖调用方的结构错误。
 */
export function toKebab(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/[/\\]/.test(trimmed) || trimmed.includes("..")) return "";
  return trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** 写入前的最后一道闸：只接受严格 kebab（路径穿越在这一步被彻底挡死）。 */
export function isValidSkillName(name: string): boolean {
  return name.length > 0 && name.length <= SKILL_NAME_MAX_LEN && SKILL_NAME_RE.test(name);
}

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

/** 「技能已过期」判定：导出过、且导出后提示词又改过。 */
export function isSkillStale(prompt: { skillName?: string; updatedAt: number; skillExportedAt: number }): boolean {
  return Boolean(prompt.skillName) && prompt.updatedAt > prompt.skillExportedAt;
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
