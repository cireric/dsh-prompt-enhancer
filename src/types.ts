/**
 * 插件共享的纯类型与常量（host 与 client 皆不依赖任何宿主服务）。
 *
 * 本文件不含任何运行时代码生成语法（`erasableSyntaxOnly` 强制），
 * 以便测试直接 import `.ts` 源码执行。
 */

/** 小标题允许的最大字符数（中文按字计，超长直接截断）。 */
export const TITLE_MAX_LEN = 25;

/** 提示词最大存储数量（超出时按规格 §4.4 的淘汰策略清理）。 */
export const DEFAULT_MAX_PROMPT_COUNT = 300;

/** 数据库 schema 版本，写入 meta 表。v2：回收站补 `skillName` / `skillExportedAt`（规格 §13.5）。 */
export const SCHEMA_VERSION = 2;

/** 导入导出信封的版本号（与参考项目同构，见规格 §4.3）。 */
export const BACKUP_VERSION = 1;

/** 把小标题限制在 TITLE_MAX_LEN 个字符内。 */
export function clampTitle(title: string): string {
  return title.slice(0, TITLE_MAX_LEN);
}

/** 一条提示词。 */
export interface Prompt {
  id: string;
  title: string;
  body: string;
  tags: string[];
  summary?: string;
  /** AI 优化前原文；非空即可在「原文 ↔ 优化稿」之间双向切换（规格 §4.4）。 */
  sourceBody?: string;
  aiRefined: boolean;
  aiRefinedAt: number;
  createdAt: number;
  updatedAt: number;
  usageCount: number;
  lastUsedAt: number;
  /** 已导出的 DSH 技能名（kebab-case）；undefined = 从未导出。 */
  skillName?: string;
  /** 上次导出时间；小于 updatedAt 即「技能已过期」。 */
  skillExportedAt: number;
}

/** 回收站条目（提示词行 + 删除时间）。 */
export interface TrashItem extends Prompt {
  deletedAt: number;
}

/** 新建提示词的入参。 */
export interface PromptInput {
  title: string;
  body: string;
  tags?: string[];
  summary?: string;
}

/** 更新提示词的补丁（仅传入的字段生效）。 */
export interface PromptPatch {
  title?: string;
  body?: string;
  tags?: string[];
  summary?: string;
  sourceBody?: string;
  aiRefined?: boolean;
  aiRefinedAt?: number;
  skillName?: string;
  skillExportedAt?: number;
}

/** 插件设置（规格 §4.2）。P3 由它派生宿主 settings 命名空间的 schema。 */
export interface PluginSettings {
  panelWidth: number;
  panelHeight: number;
  showComposerButton: boolean;
  composerButtonIconOnly: boolean;
  showAIPolishButton: boolean;
  aiPolishButtonIconOnly: boolean;
  hashTriggerEnabled: boolean;
  contextRecommendEnabled: boolean;
  selectionAddEnabled: boolean;
  showSidebarButton: boolean;
  maxPromptCount: number;
  aiProvider: string;
  aiModel: string;
}

/** 设置默认值。 */
export const DEFAULT_SETTINGS: PluginSettings = {
  panelWidth: 420,
  panelHeight: 560,
  showComposerButton: true,
  composerButtonIconOnly: true,
  showAIPolishButton: true,
  aiPolishButtonIconOnly: true,
  hashTriggerEnabled: true,
  contextRecommendEnabled: true,
  selectionAddEnabled: true,
  showSidebarButton: true,
  maxPromptCount: DEFAULT_MAX_PROMPT_COUNT,
  aiProvider: "",
  aiModel: "",
};

/** 导入导出信封（与参考项目同构：旧插件导出可直接导入）。 */
export interface PromptBackup {
  version: number;
  exportedAt: number;
  prompts: Prompt[];
  tags: Array<{ name: string; createdAt: number }>;
}

/** 列表排序方式：默认三段式 / 最近更新 / 最常使用 / 最近创建。 */
export type PromptSort = "default" | "updated" | "used" | "created";

/** `listPrompts` 的筛选与排序选项。 */
export interface ListPromptsOptions {
  /** 大小写不敏感子串，匹配 title / body / tags。 */
  q?: string;
  /** 精确匹配某一个标签。 */
  tag?: string;
  sort?: PromptSort;
}

/** 导入预览统计。 */
export interface ImportStats {
  added: number;
  overwritten: number;
  total: number;
}

/** 导入结果：未确认时只返回预览，已确认时同时返回落库统计。 */
export interface ImportResult {
  ok: boolean;
  error?: string;
  stats?: ImportStats;
  applied?: boolean;
}

/** 回滚结果：`sourceBody` 为空时拒绝（不得清空正文）。 */
export interface RollbackResult {
  ok: boolean;
  error?: string;
  prompt?: Prompt;
}
