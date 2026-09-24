/** 本插件在宿主的 i18n 命名空间（同时用于 PropsLocale<'prompt-enhancer'>）。 */
export const NS = "prompt-enhancer";

export const zh = {
  "button.title": "词库",
  "button.tip": "打开提示词库",
  "list.title": "常用提示词",
  "list.empty": "还没有提示词",
  "list.loading": "加载中…",
  "action.insert": "插入",
  "action.overwrite": "覆盖",
  "action.send": "插入并发送",
  "hash.title": "选择提示词",
  "hash.empty": "没有匹配的提示词",
  "vars.title": "填充模板变量",
  "vars.hint": "{{变量}} 会在插入时替换为下面的内容",
  "vars.fill": "填入",
  "vars.cancel": "取消",
  "vars.remembered": "已带出上次填写的值",
  "error.load": "加载提示词失败",
  "error.use": "记录使用失败",
  "error.noPrompt": "该提示词已不存在",
} as const;

/** en 必须与 zh 键集完全一致——类型注解让 tsc 直接报出漏译/漏删。 */
export const en: Record<keyof typeof zh, string> = {
  "button.title": "Library",
  "button.tip": "Open the prompt library",
  "list.title": "Saved prompts",
  "list.empty": "No prompts yet",
  "list.loading": "Loading…",
  "action.insert": "Insert",
  "action.overwrite": "Overwrite",
  "action.send": "Insert & send",
  "hash.title": "Pick a prompt",
  "hash.empty": "No matching prompt",
  "vars.title": "Fill template variables",
  "vars.hint": "Each {{name}} below is substituted when inserted",
  "vars.fill": "Fill in",
  "vars.cancel": "Cancel",
  "vars.remembered": "Filled with values from last time",
  "error.load": "Failed to load prompts",
  "error.use": "Failed to record usage",
  "error.noPrompt": "That prompt no longer exists",
};

/** 供宿主 LocaleNamespaceMap 挂载的键联合（P4 只用到上表里的键）。 */
export type PromptEnhancerKey = keyof typeof zh;
