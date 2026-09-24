window.__ModuleLoader__.load({
  id: "dsh-prompt-enhancer",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/components/AIPolishButton.tsx
var React = __toESM(require("react"), 1);

// src/types.ts
var TITLE_MAX_LEN = 25;
var DEFAULT_MAX_PROMPT_COUNT = 300;
var API_PREFIX = "/api/prompt-enhancer";
function clampTitle(title) {
  return title.slice(0, TITLE_MAX_LEN);
}
var DEFAULT_SETTINGS = {
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
  aiModel: ""
};

// src/client/utils/template.ts
function parseVariables(body) {
  const out = [];
  for (const m of body.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
    const name = m[1].trim();
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}
function fillTemplate(body, values) {
  return body.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (whole, raw) => {
    const name = raw.trim();
    const value = values[name];
    return value !== void 0 && value !== "" ? value : whole;
  });
}
function needsValues(body) {
  return parseVariables(body).length > 0;
}
var memoryKey = "pl:template-var-memory";
function parseMemory(raw) {
  if (raw.trim() === "") return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out = {};
    for (const [name, value] of Object.entries(parsed)) {
      if (typeof value === "string") out[name] = value;
    }
    return out;
  } catch (err) {
    console.warn("[prompt-enhancer] " + memoryKey + " \u4E0D\u662F\u5408\u6CD5 JSON\uFF0C\u672C\u6B21\u6309\u65E0\u8BB0\u5FC6\u5904\u7406", err);
    return {};
  }
}
function pickRemembered(body, memory) {
  const out = {};
  for (const name of parseVariables(body)) {
    const value = memory[name];
    if (typeof value === "string" && value !== "") out[name] = value;
  }
  return out;
}

// src/client/utils/ai-flow.ts
function keepVariablesFor(draft) {
  return needsValues(draft);
}
function libraryCreateInput(refined, originalDraft) {
  const firstLine = originalDraft.split(/\r\n|\n|\r/).find((line) => line.trim() !== "") ?? "";
  return {
    // AI 标题只有空白字符时等于没给标题：判据用 trim，兜底后才交给 clampTitle。
    title: clampTitle(refined.title.trim() || firstLine),
    body: originalDraft,
    tags: refined.tags.slice(0, 1),
    summary: refined.summary
  };
}
function needsWriteBack(refinedBody, originalDraft) {
  return refinedBody !== originalDraft;
}
function canToggle(current) {
  return Boolean(current.sourceBody);
}
function errorName(err) {
  if (typeof err !== "object" || err === null) return void 0;
  const name = err.name;
  return typeof name === "string" ? name : void 0;
}
function statusOf(err) {
  if (typeof err !== "object" || err === null || !("status" in err)) return void 0;
  const status = err.status;
  return typeof status === "number" ? status : void 0;
}
function aiErrorKey(err) {
  if (errorName(err) === "TimeoutError") return "ai.timeout";
  if (statusOf(err) === 503) return "ai.unavailable";
  return "ai.fail";
}

// src/client/utils/api.ts
var AI_TIMEOUT_MS = 12e4;
var AI_PROBE_TIMEOUT_MS = 15e3;
var ApiError = class extends Error {
  status;
  constructor(message, status) {
    super(message);
    this.status = status;
  }
};
async function call(method, path, body, timeoutMs) {
  const res = await fetch(API_PREFIX + path, {
    method,
    headers: body === void 0 ? void 0 : { "Content-Type": "application/json" },
    body: body === void 0 ? void 0 : JSON.stringify(body),
    signal: timeoutMs === void 0 ? void 0 : AbortSignal.timeout(timeoutMs)
  });
  let parsed;
  try {
    parsed = await res.json();
  } catch (e) {
    throw new ApiError(`\u54CD\u5E94\u4E0D\u662F\u5408\u6CD5 JSON\uFF08HTTP ${res.status}\uFF09\uFF1A${String(e)}`, res.status);
  }
  if (parsed.data === void 0) {
    throw new ApiError(parsed.error ?? `\u8BF7\u6C42\u5931\u8D25\uFF08HTTP ${res.status}\uFF09`, res.status);
  }
  return parsed.data;
}
var api = {
  listPrompts: (opts = {}) => {
    const qs = new URLSearchParams();
    if (opts.q) qs.set("q", opts.q);
    if (opts.tag) qs.set("tag", opts.tag);
    if (opts.sort) qs.set("sort", opts.sort);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return call("GET", `/prompts${suffix}`);
  },
  recordUsage: (id) => call("POST", `/prompts/${encodeURIComponent(id)}/use`),
  getSettings: () => call("GET", "/settings"),
  getMeta: (key) => call("GET", `/meta/${encodeURIComponent(key)}`).then((r) => r.value),
  setMeta: (key, value) => call("PUT", `/meta/${encodeURIComponent(key)}`, { value }),
  createPrompt: (input) => call("POST", "/prompts", input),
  /**
   * 宿主 PUT 只认白名单字段（事实见 `src/host/routes.ts` 的 PUT 分发：title | body | tags |
   * summary | skillName | skillExportedAt），其余字段被静默丢弃且仍回 200。故补丁类型取
   * `PromptWritablePatch`（types.ts 已导出，由 `PROMPT_WRITABLE_KEYS` 派生的 6 键 Pick），
   * 把 `sourceBody` / `aiRefined` / `aiRefinedAt` 这类「可读不可写」字段挡在编译期。
   * `aiWriteBack` 是写回 `sourceBody` 的唯一路径（§4.4），它不是记录字段（store.updatePrompt
   * 的选项目志），用交叉类型补上。
   */
  updatePrompt: (id, patch) => call("PUT", "/prompts/" + encodeURIComponent(id), patch),
  rollbackPrompt: (id) => call("POST", "/prompts/" + encodeURIComponent(id) + "/rollback"),
  listAiProviders: () => call("GET", "/ai/providers", void 0, AI_PROBE_TIMEOUT_MS),
  polishPrompt: (body, opts = {}) => call(
    "POST",
    "/ai/polish",
    { body, keepVariables: opts.keepVariables !== false, withSummary: false },
    AI_TIMEOUT_MS
  ),
  refinePrompt: (body) => call("POST", "/ai/refine", { body }, AI_TIMEOUT_MS),
  // ── 提示词：单条读写（P6）──────────────────────────────────────────────
  /** 单条读取；不存在时宿主回 404（信封失败 → ApiError.status === 404）。 */
  getPrompt: (id) => call("GET", "/prompts/" + encodeURIComponent(id)),
  /** 软删除：进回收站（规格 §4.4），故返回的是「已删除」而不是被删实体。 */
  deletePrompt: (id) => call("DELETE", "/prompts/" + encodeURIComponent(id)),
  // ── 标签（P6）──────────────────────────────────────────────────────────
  listTags: () => call("GET", "/tags"),
  createTag: (name) => call("POST", "/tags", { name }),
  /** 改名：旧名是路径段，新名在新体（宿主 PUT 只读 body.to）。 */
  renameTag: (from, to) => call("PUT", "/tags/" + encodeURIComponent(from), { to }),
  /** 在用标签宿主回 400 并带用量（信封失败 → ApiError.status === 400），调用方按状态分类。 */
  deleteTag: (name) => call("DELETE", "/tags/" + encodeURIComponent(name)),
  // ── 回收站（P6）────────────────────────────────────────────────────────
  listTrash: () => call("GET", "/trash"),
  restoreTrash: (id) => call("POST", "/trash/" + encodeURIComponent(id) + "/restore"),
  deleteTrash: (id) => call("DELETE", "/trash/" + encodeURIComponent(id)),
  emptyTrash: () => call("DELETE", "/trash"),
  // ── 导入导出（P6）──────────────────────────────────────────────────────
  /**
   * 导入备份。**只是信封封装，语义照宿主**（P6-4 裁定）：confirm 不为 true 时宿主只回预览
   * （applied: false + stats），且**不**自动淘汰超限条目（「导入不淘汰」是用户裁定）。
   * confirm 缺省时不发该键（宿主同判为未确认），调用方显式传 true 才落库。
   */
  importBackup: (backup, confirm) => call("POST", "/import", { backup, confirm }),
  /** 把备份写到宿主可写的绝对路径目录；文件名由服务端生成（客户端不能指定任意文件名）。 */
  exportBackup: (dir) => call("POST", "/export/save", { dir })
};

// src/client/utils/theme.ts
var TOKEN = {
  bg: "var(--dsw-alias-bg-elevated, #ffffff)",
  fg: "var(--dsw-alias-text-primary, #1f2328)",
  muted: "var(--dsw-alias-text-secondary, #6b7280)",
  border: "var(--dsw-alias-border-secondary, #e5e7eb)",
  accent: "var(--dsw-alias-text-accent, #2563eb)",
  hover: "var(--dsw-alias-bg-hover, rgba(0,0,0,0.04))"
};
var overlayBase = {
  pointerEvents: "auto",
  background: TOKEN.bg,
  color: TOKEN.fg,
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 10,
  boxShadow: "0 8px 24px rgba(0,0,0,0.16)"
};

// src/client/components/AIPolishButton.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var COPIED_MS = 2e3;
var PREVIEW_MAX = 120;
function previewText(body) {
  return body.length > PREVIEW_MAX ? body.slice(0, PREVIEW_MAX) + "\u2026" : body;
}
function reasonOf(err) {
  return err instanceof Error ? err.message : String(err);
}
function SparkleIcon() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true", style: ICON, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "path",
    {
      d: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z",
      stroke: "currentColor",
      strokeWidth: "1.6",
      strokeLinejoin: "round"
    }
  ) });
}
function AIPolishButton({ t, useInput, inputActions }) {
  const draft = useInput((s) => s.draft);
  const [settings, setSettings] = React.useState(null);
  const [status, setStatus] = React.useState("idle");
  const [original, setOriginal] = React.useState("");
  const [polished, setPolished] = React.useState("");
  const [showOriginal, setShowOriginal] = React.useState(false);
  const [refined, setRefined] = React.useState(null);
  const [saved, setSaved] = React.useState(null);
  const [evicted, setEvicted] = React.useState(false);
  const [saveError, setSaveError] = React.useState(null);
  const [errorKey, setErrorKey] = React.useState(null);
  const [refineErrorKey, setRefineErrorKey] = React.useState(null);
  const [copied, setCopied] = React.useState(false);
  const rootRef = React.useRef(null);
  const providersRef = React.useRef(null);
  const busyRef = React.useRef(false);
  const aliveRef = React.useRef(true);
  React.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  React.useEffect(() => {
    let alive = true;
    api.getSettings().then(
      (value) => {
        if (alive) setSettings(value);
      },
      (err) => {
        console.warn("[prompt-enhancer] \u8BBE\u7F6E\u8BFB\u53D6\u5931\u8D25\uFF0C\u672C\u6B21\u6309\u9ED8\u8BA4\u8BBE\u7F6E\u663E\u793A\u6309\u94AE", err);
        if (alive) setSettings(DEFAULT_SETTINGS);
      }
    );
    return () => {
      alive = false;
    };
  }, []);
  const close = () => {
    setStatus("idle");
    setOriginal("");
    setPolished("");
    setShowOriginal(false);
    setRefined(null);
    setSaved(null);
    setEvicted(false);
    setSaveError(null);
    setErrorKey(null);
    setRefineErrorKey(null);
    setCopied(false);
  };
  const settled = status === "done" || status === "error" || status === "refined" || status === "saved" || status === "saveFailed" || status === "writeBackFailed";
  React.useEffect(() => {
    if (!settled) return;
    const onPointerDown = (ev) => {
      const root = rootRef.current;
      if (root !== null && ev.target instanceof Node && root.contains(ev.target)) return;
      close();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [settled]);
  React.useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), COPIED_MS);
    return () => {
      window.clearTimeout(id);
    };
  }, [copied]);
  const run = (snapshot) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setErrorKey(null);
    setRefineErrorKey(null);
    setOriginal(snapshot);
    setShowOriginal(false);
    setCopied(false);
    setStatus("polishing");
    void (async () => {
      try {
        let providers = providersRef.current;
        if (providers === null) {
          try {
            providers = await api.listAiProviders();
          } catch (err) {
            console.warn("[prompt-enhancer] AI \u53EF\u7528\u6027\u63A2\u6D4B\u5931\u8D25", err);
            if (!aliveRef.current) return;
            setErrorKey(aiErrorKey(err));
            setStatus("error");
            return;
          }
          providersRef.current = providers;
        }
        if (providers.length === 0) {
          if (!aliveRef.current) return;
          setErrorKey("ai.unavailable");
          setStatus("error");
          return;
        }
        try {
          const result = await api.polishPrompt(snapshot, { keepVariables: keepVariablesFor(snapshot) });
          if (!aliveRef.current) return;
          setPolished(result.polished);
          setStatus("done");
        } catch (err) {
          console.warn("[prompt-enhancer] AI \u4F18\u5316\u5931\u8D25", err);
          if (!aliveRef.current) return;
          setErrorKey(aiErrorKey(err));
          setStatus("error");
        }
      } finally {
        busyRef.current = false;
      }
    })();
  };
  const refine = () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setRefineErrorKey(null);
    setSaveError(null);
    setStatus("refining");
    void (async () => {
      try {
        const result = await api.refinePrompt(original);
        if (!aliveRef.current) return;
        setRefined(result);
        setStatus("refined");
      } catch (err) {
        console.warn("[prompt-enhancer] \u4E00\u952E\u5B8C\u5584\u5931\u8D25", err);
        if (!aliveRef.current) return;
        setRefineErrorKey(aiErrorKey(err));
        setStatus("done");
      } finally {
        busyRef.current = false;
      }
    })();
  };
  const save = () => {
    if (busyRef.current || refined === null) return;
    busyRef.current = true;
    setSaveError(null);
    setStatus("saving");
    void (async () => {
      try {
        let created = null;
        try {
          created = await api.createPrompt(libraryCreateInput(refined, original));
        } catch (err) {
          console.warn("[prompt-enhancer] \u5B58\u5165\u8BCD\u5E93\u5931\u8D25", err);
          if (!aliveRef.current) return;
          setSaveError(reasonOf(err));
          setStatus("saveFailed");
          return;
        }
        if (created === null || !aliveRef.current) return;
        setSaved(created.prompt);
        setEvicted(created.evicted.length > 0);
        if (!needsWriteBack(refined.body, original)) {
          setStatus("saved");
          return;
        }
        try {
          const updated = await api.updatePrompt(created.prompt.id, { body: refined.body, aiWriteBack: true });
          if (!aliveRef.current) return;
          setSaved(updated);
          setStatus("saved");
        } catch (err) {
          console.warn("[prompt-enhancer] \u4F18\u5316\u7A3F\u5199\u56DE\u5931\u8D25\uFF08\u539F\u6587\u5DF2\u5165\u5E93\uFF09", err);
          if (!aliveRef.current) return;
          setSaveError(reasonOf(err));
          setStatus("writeBackFailed");
        }
      } finally {
        busyRef.current = false;
      }
    })();
  };
  const retryWriteBack = () => {
    if (busyRef.current || saved === null || refined === null) return;
    busyRef.current = true;
    setSaveError(null);
    setStatus("saving");
    void (async () => {
      try {
        const updated = await api.updatePrompt(saved.id, { body: refined.body, aiWriteBack: true });
        if (!aliveRef.current) return;
        setSaved(updated);
        setStatus("saved");
      } catch (err) {
        console.warn("[prompt-enhancer] \u4F18\u5316\u7A3F\u5199\u56DE\u91CD\u8BD5\u5931\u8D25", err);
        if (!aliveRef.current) return;
        setSaveError(reasonOf(err));
        setStatus("writeBackFailed");
      } finally {
        busyRef.current = false;
      }
    })();
  };
  const copy = (text) => {
    void (async () => {
      try {
        await navigator.clipboard.writeText(text);
        if (aliveRef.current) setCopied(true);
      } catch (err) {
        console.warn("[prompt-enhancer] \u590D\u5236\u5931\u8D25", err);
      }
    })();
  };
  const apply2 = (text) => {
    inputActions.setDraft(text);
    close();
  };
  if (settings === null || settings.showAIPolishButton === false) return null;
  const busyKey = status === "polishing" ? "ai.polishing" : status === "refining" ? "ai.refining" : status === "saving" ? "ai.saving" : null;
  const empty = draft.trim() === "";
  const hint = busyKey !== null ? t(busyKey) : empty ? t("ai.empty") : t("ai.tip");
  const evictedNotice = evicted ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: MUTED, children: t("ai.evicted") }) : null;
  const showRefined = status === "refined" || status === "saveFailed";
  const dialogLabel = status === "done" ? t("ai.result") : showRefined || status === "saving" || status === "writeBackFailed" ? t("ai.refined") : status === "saved" ? t("ai.saved") : t("ai.button");
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { ref: rootRef, style: WRAP, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "button",
      {
        type: "button",
        style: { ...BUTTON, cursor: empty || busyKey !== null ? "default" : "pointer", opacity: empty || busyKey !== null ? 0.6 : 1 },
        title: hint,
        "aria-label": t("ai.button"),
        "aria-busy": busyKey !== null,
        disabled: empty || busyKey !== null,
        onClick: () => {
          if (empty) return;
          run(draft);
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SparkleIcon, {}),
          settings.aiPolishButtonIconOnly === false && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t("ai.button") })
        ]
      }
    ),
    status !== "idle" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: ANCHOR, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { role: "dialog", "aria-label": dialogLabel, style: PANEL, children: [
      busyKey !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { role: "status", "aria-live": "polite", style: MUTED, children: t(busyKey) }),
      status === "error" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { role: "status", "aria-live": "polite", style: MUTED, children: errorKey === null ? t("ai.fail") : t(errorKey) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: ACTIONS, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: PANEL_BUTTON, onClick: close, children: t("ai.close") }) })
      ] }),
      status === "done" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: HEADER, children: t("ai.result") }),
        refineErrorKey !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { role: "status", "aria-live": "polite", style: MUTED, children: t(refineErrorKey) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: PILLS, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              style: pill(!showOriginal),
              "aria-pressed": !showOriginal,
              onClick: () => setShowOriginal(false),
              children: t("ai.polished")
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              style: pill(showOriginal),
              "aria-pressed": showOriginal,
              onClick: () => setShowOriginal(true),
              children: t("ai.original")
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "textarea",
          {
            value: showOriginal ? original : polished,
            readOnly: showOriginal,
            rows: 7,
            "aria-label": t(showOriginal ? "ai.original" : "ai.polished"),
            onChange: (ev) => setPolished(ev.target.value),
            style: { ...TEXTAREA, opacity: showOriginal ? 0.75 : 1 }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: ACTIONS, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: PANEL_BUTTON, onClick: refine, children: t("ai.refine") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: PANEL_BUTTON, onClick: () => copy(polished), children: copied ? t("ai.copied") : t("ai.copy") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: PANEL_BUTTON, onClick: close, children: t("ai.close") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              style: { ...PANEL_BUTTON, borderColor: TOKEN.accent, color: TOKEN.accent },
              onClick: () => apply2(polished),
              children: t("ai.apply")
            }
          )
        ] })
      ] }),
      showRefined && refined !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: HEADER, children: t("ai.refined") }),
        status === "saveFailed" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { role: "alert", style: ERROR, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t("ai.saveFail") }),
          saveError !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: ERROR_DETAIL, title: saveError, children: saveError })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: META, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: META_KEY, children: t("ai.fieldTitle") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: META_VALUE, children: refined.title }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: META_KEY, children: t("ai.fieldTags") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: META_VALUE, children: refined.tags.join(" / ") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: META_KEY, children: t("ai.fieldSummary") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: META_VALUE, children: refined.summary })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "textarea",
          {
            value: refined.body,
            rows: 7,
            "aria-label": t("ai.refined"),
            onChange: (ev) => setRefined({ ...refined, body: ev.target.value }),
            style: TEXTAREA
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: ACTIONS, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: PANEL_BUTTON, onClick: save, children: t("ai.save") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: PANEL_BUTTON, onClick: () => copy(refined.body), children: copied ? t("ai.copied") : t("ai.copy") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: PANEL_BUTTON, onClick: close, children: t("ai.close") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              style: { ...PANEL_BUTTON, borderColor: TOKEN.accent, color: TOKEN.accent },
              onClick: () => apply2(refined.body),
              children: t("ai.apply")
            }
          )
        ] })
      ] }),
      status === "writeBackFailed" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { role: "alert", style: ERROR, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t("ai.writeBackFail") }),
          saveError !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: ERROR_DETAIL, title: saveError, children: saveError })
        ] }),
        evictedNotice,
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: ACTIONS, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: PANEL_BUTTON, onClick: retryWriteBack, children: t("ai.retryWriteBack") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: PANEL_BUTTON, onClick: close, children: t("ai.close") })
        ] })
      ] }),
      status === "saved" && saved !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { role: "status", "aria-live": "polite", style: MUTED, children: t("ai.saved") }),
        evictedNotice,
        canToggle(saved) ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: MUTED, children: t("ai.toggleMoved") }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: MUTED, children: t("ai.sameAsOriginal") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: PREVIEW, children: previewText(saved.body) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: ACTIONS, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: PANEL_BUTTON, onClick: close, children: t("ai.close") }) })
      ] })
    ] }) })
  ] });
}
var WRAP = {
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  gap: 6
};
var ICON = { display: "block", flex: "0 0 auto" };
var BUTTON = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  height: 24,
  padding: "0 8px",
  fontSize: 12,
  color: TOKEN.fg,
  background: "transparent",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  cursor: "pointer"
};
var ANCHOR = {
  position: "absolute",
  bottom: "calc(100% + 6px)",
  left: 0,
  zIndex: 31,
  maxWidth: "calc(100vw - 24px)"
};
var PANEL = {
  ...overlayBase,
  display: "flex",
  flexDirection: "column",
  gap: 6,
  width: 380,
  maxHeight: 420,
  overflowY: "auto",
  padding: 8,
  fontSize: 12
};
var HEADER = { color: TOKEN.muted, fontSize: 11, fontWeight: 600 };
var MUTED = { color: TOKEN.muted, fontSize: 11, overflowWrap: "anywhere" };
var ERROR = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  color: TOKEN.fg,
  fontSize: 11
};
var ERROR_DETAIL = { color: TOKEN.muted, overflowWrap: "anywhere" };
var META = {
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  columnGap: 6,
  rowGap: 2,
  alignItems: "baseline"
};
var META_KEY = { color: TOKEN.muted, fontSize: 11, whiteSpace: "nowrap" };
var META_VALUE = { color: TOKEN.fg, fontSize: 11, overflowWrap: "anywhere" };
var PREVIEW = {
  color: TOKEN.muted,
  fontSize: 11,
  overflowWrap: "anywhere",
  whiteSpace: "pre-wrap",
  maxHeight: 72,
  overflowY: "auto",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  padding: "4px 6px"
};
var PILLS = { display: "flex", gap: 4, alignItems: "center" };
var pill = (active) => ({
  padding: "1px 10px",
  fontSize: 11,
  lineHeight: "16px",
  color: active ? TOKEN.accent : TOKEN.muted,
  background: "transparent",
  border: `1px solid ${active ? TOKEN.accent : TOKEN.border}`,
  borderRadius: 999,
  cursor: "pointer"
});
var TEXTAREA = {
  width: "100%",
  boxSizing: "border-box",
  resize: "vertical",
  padding: "6px 8px",
  color: TOKEN.fg,
  background: "transparent",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  fontSize: 12,
  fontFamily: "inherit",
  outline: "none"
};
var ACTIONS = { display: "flex", gap: 6, justifyContent: "flex-end" };
var PANEL_BUTTON = {
  padding: "2px 8px",
  fontSize: 11,
  lineHeight: "16px",
  color: TOKEN.fg,
  background: "transparent",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  cursor: "pointer"
};

// src/client/components/HashSuggestOverlay.tsx
var React3 = __toESM(require("react"), 1);

// src/client/utils/hash-token.ts
function readHashToken(draft) {
  const m = draft.match(/(^|\s)#([^\s#]*)$/);
  if (!m) return null;
  const start = m.index + m[1].length;
  return { query: m[2] ?? "", start };
}
function replaceHashToken(draft, body) {
  const token = readHashToken(draft);
  if (!token) return draft;
  const head = draft.slice(0, token.start).replace(/\s+$/, "");
  return head ? `${head} ${body}` : body;
}
function filterPrompts(prompts, query, limit = 5) {
  const q = query.trim().toLowerCase();
  if (!q) return prompts.slice(0, limit);
  const scored = [];
  for (const p of prompts) {
    const title = p.title.toLowerCase();
    const tags = p.tags.join(" ").toLowerCase();
    const body = p.body.toLowerCase();
    const score = title.includes(q) ? 3 : tags.includes(q) ? 2 : body.includes(q) ? 1 : 0;
    if (score > 0) scored.push({ p, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.p);
}

// src/client/utils/insert.ts
function composeDraft(draft, body, mode) {
  const send = mode === "insert-send";
  if (mode === "overwrite") return { draft: body, send };
  return { draft: draft ? `${draft}
${body}` : body, send };
}
function promptSummary(p, max = 60) {
  const source = p.summary?.trim() || p.body.replace(/\s+/g, " ").trim();
  return source.length > max ? `${source.slice(0, max)}\u2026` : source;
}

// src/client/components/TemplateVariablesDialog.tsx
var React2 = __toESM(require("react"), 1);

// src/client/utils/i18n.ts
var NS = "prompt-enhancer";
var zh = {
  "button.title": "\u8BCD\u5E93",
  "button.tip": "\u6253\u5F00\u63D0\u793A\u8BCD\u5E93",
  "list.title": "\u5E38\u7528\u63D0\u793A\u8BCD",
  "list.empty": "\u8FD8\u6CA1\u6709\u63D0\u793A\u8BCD",
  "list.loading": "\u52A0\u8F7D\u4E2D\u2026",
  "action.insert": "\u63D2\u5165",
  "action.overwrite": "\u8986\u76D6",
  "action.send": "\u63D2\u5165\u5E76\u53D1\u9001",
  "hash.title": "\u9009\u62E9\u63D0\u793A\u8BCD",
  "hash.empty": "\u6CA1\u6709\u5339\u914D\u7684\u63D0\u793A\u8BCD",
  "vars.title": "\u586B\u5145\u6A21\u677F\u53D8\u91CF",
  "vars.hint": "{{\u53D8\u91CF}} \u4F1A\u5728\u63D2\u5165\u65F6\u66FF\u6362\u4E3A\u4E0B\u9762\u7684\u5185\u5BB9",
  "vars.fill": "\u586B\u5165",
  "vars.cancel": "\u53D6\u6D88",
  "vars.remembered": "\u5DF2\u5E26\u51FA\u4E0A\u6B21\u586B\u5199\u7684\u503C",
  "error.load": "\u52A0\u8F7D\u63D0\u793A\u8BCD\u5931\u8D25",
  "error.use": "\u8BB0\u5F55\u4F7F\u7528\u5931\u8D25",
  "error.noPrompt": "\u8BE5\u63D0\u793A\u8BCD\u5DF2\u4E0D\u5B58\u5728",
  "ai.button": "AI \u4F18\u5316",
  "ai.tip": "\u7528 AI \u4F18\u5316\u5F53\u524D\u8F93\u5165\u6846\u5185\u5BB9\uFF08\u53EF\u80FD\u9700\u8981\u4E00\u4E24\u5206\u949F\uFF09",
  "ai.empty": "\u8F93\u5165\u6846\u4E3A\u7A7A\uFF0C\u5148\u5199\u70B9\u5185\u5BB9",
  "ai.unavailable": "AI \u4E0D\u53EF\u7528\uFF1A\u672A\u914D\u7F6E\u53EF\u7528\u6A21\u578B",
  "ai.polishing": "\u6B63\u5728\u8C03\u7528 AI\u2026",
  "ai.result": "AI \u4F18\u5316\u7ED3\u679C",
  "ai.original": "\u539F\u6587",
  "ai.polished": "\u4F18\u5316\u7A3F",
  "ai.apply": "\u5E94\u7528\u5230\u8F93\u5165\u6846",
  "ai.copy": "\u590D\u5236",
  "ai.copied": "\u5DF2\u590D\u5236",
  "ai.close": "\u5173\u95ED",
  "ai.fail": "AI \u8C03\u7528\u5931\u8D25",
  "ai.timeout": "AI \u8BF7\u6C42\u8D85\u65F6\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5",
  "ai.refine": "\u4E00\u952E\u5B8C\u5584",
  "ai.refining": "\u6B63\u5728\u5B8C\u5584\u2026",
  "ai.refined": "\u5B8C\u5584\u7A3F",
  "ai.fieldTitle": "\u6807\u9898",
  "ai.fieldTags": "\u6807\u7B7E",
  "ai.fieldSummary": "\u6458\u8981",
  "ai.save": "\u5B58\u5165\u8BCD\u5E93",
  "ai.saving": "\u6B63\u5728\u5B58\u5165\u2026",
  "ai.saved": "\u5DF2\u5B58\u5165\u8BCD\u5E93",
  "ai.saveFail": "\u5B58\u5165\u8BCD\u5E93\u5931\u8D25",
  "ai.writeBackFail": "\u5DF2\u5B58\u5165\u539F\u6587\uFF0C\u4F46\u4F18\u5316\u7A3F\u5199\u56DE\u5931\u8D25",
  "ai.retryWriteBack": "\u91CD\u8BD5\u5199\u56DE",
  "ai.sameAsOriginal": "\u5B8C\u5584\u7A3F\u4E0E\u539F\u6587\u76F8\u540C\uFF0C\u65E0\u9700\u5207\u6362",
  "ai.evicted": "\u5DF2\u5B58\u5165\u8BCD\u5E93\uFF1B\u6709\u65E7\u63D0\u793A\u8BCD\u56E0\u8D85\u51FA\u4E0A\u9650\u88AB\u6DD8\u6C70",
  "ai.toggleMoved": "\u300C\u539F\u6587 / \u4F18\u5316\u7A3F\u300D\u7684\u5BF9\u6BD4\u4E0E\u5207\u6362\u5DF2\u79FB\u81F3\u7BA1\u7406\u9762\u677F\u7684\u8BE6\u60C5\u9875",
  // ── P6：管理面板（列表 / 详情 / §4.4 并排对比）────────────────────────
  "list.manage": "\u7BA1\u7406",
  "manager.title": "\u63D0\u793A\u8BCD\u7BA1\u7406",
  "manager.close": "\u5173\u95ED",
  "manager.tab.list": "\u5217\u8868",
  "manager.tab.tags": "\u6807\u7B7E",
  "manager.tab.trash": "\u56DE\u6536\u7AD9",
  "manager.tab.transfer": "\u5BFC\u5165\u5BFC\u51FA",
  "manager.tags.pending": "\u6807\u7B7E\u7BA1\u7406\u5C06\u5728\u540E\u7EED\u4EFB\u52A1\u586B\u5145",
  "manager.trash.pending": "\u56DE\u6536\u7AD9\u5C06\u5728\u540E\u7EED\u4EFB\u52A1\u586B\u5145",
  "manager.transfer.pending": "\u5BFC\u5165\u5BFC\u51FA\u5C06\u5728\u540E\u7EED\u4EFB\u52A1\u586B\u5145",
  "manager.list.new": "\u65B0\u5EFA",
  "manager.list.search": "\u641C\u7D22\u63D0\u793A\u8BCD",
  "manager.list.searchPlaceholder": "\u641C\u7D22\u6807\u9898 / \u6B63\u6587 / \u6807\u7B7E",
  "manager.list.sort": "\u6392\u5E8F",
  "manager.list.sortDefault": "\u9ED8\u8BA4",
  "manager.list.sortUpdated": "\u6700\u8FD1\u66F4\u65B0",
  "manager.list.sortUsed": "\u6700\u5E38\u4F7F\u7528",
  "manager.list.sortCreated": "\u6700\u8FD1\u521B\u5EFA",
  "manager.list.tagFilter": "\u6807\u7B7E\u7B5B\u9009",
  "manager.list.allTags": "\u5168\u90E8\u6807\u7B7E",
  "manager.list.tagsFailed": "\u6807\u7B7E\u52A0\u8F7D\u5931\u8D25",
  "manager.list.usage": "\u7528\u91CF",
  "manager.list.edit": "\u7F16\u8F91",
  "manager.list.delete": "\u5220\u9664",
  "manager.list.deleted": "\u5DF2\u79FB\u5165\u56DE\u6536\u7AD9",
  "manager.list.evicted": "\u5DF2\u4FDD\u5B58\uFF1B\u6709\u65E7\u63D0\u793A\u8BCD\u56E0\u8D85\u51FA\u4E0A\u9650\u88AB\u6DD8\u6C70",
  "manager.edit.newTitle": "\u65B0\u5EFA\u63D0\u793A\u8BCD",
  "manager.edit.editTitle": "\u7F16\u8F91\u63D0\u793A\u8BCD",
  "manager.edit.title": "\u6807\u9898",
  "manager.edit.body": "\u6B63\u6587",
  "manager.edit.tags": "\u6807\u7B7E",
  "manager.edit.summary": "\u6458\u8981",
  "manager.edit.tagsPlaceholder": "\u7528\u9017\u53F7\u5206\u9694\uFF0C\u5982\uFF1A\u5199\u4F5C, \u7FFB\u8BD1",
  "manager.edit.bodyRequired": "\u6B63\u6587\u4E0D\u80FD\u4E3A\u7A7A",
  "manager.edit.save": "\u4FDD\u5B58",
  "manager.edit.saving": "\u6B63\u5728\u4FDD\u5B58\u2026",
  "manager.edit.saved": "\u5DF2\u4FDD\u5B58",
  "manager.edit.back": "\u8FD4\u56DE\u5217\u8868",
  "manager.compare.original": "\u539F\u6587",
  "manager.compare.refined": "\u4F18\u5316\u7A3F",
  "manager.compare.toggle": "\u5207\u6362\u539F\u6587 / \u4F18\u5316\u7A3F",
  "manager.compare.toggling": "\u6B63\u5728\u5207\u6362\u2026",
  "manager.compare.showingOriginal": "\u5F53\u524D\u6B63\u6587\uFF1A\u539F\u6587",
  "manager.compare.showingRefined": "\u5F53\u524D\u6B63\u6587\uFF1A\u4F18\u5316\u7A3F",
  "error.save": "\u4FDD\u5B58\u5931\u8D25",
  "error.create": "\u521B\u5EFA\u5931\u8D25",
  "error.delete": "\u5220\u9664\u5931\u8D25",
  "error.rollbackNoSource": "\u8BE5\u63D0\u793A\u8BCD\u6CA1\u6709\u53EF\u5207\u6362\u7684\u539F\u6587",
  "sidebar.entry.title": "\u63D0\u793A\u8BCD",
  "sidebar.entry.tip": "\u6253\u5F00\u63D0\u793A\u8BCD\u7BA1\u7406\u9762\u677F"
};
var en = {
  "button.title": "Library",
  "button.tip": "Open the prompt library",
  "list.title": "Saved prompts",
  "list.empty": "No prompts yet",
  "list.loading": "Loading\u2026",
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
  "ai.button": "AI polish",
  "ai.tip": "Polish the composer draft with AI (may take a minute or two)",
  "ai.empty": "Composer is empty \u2014 write something first",
  "ai.unavailable": "AI unavailable: no usable model configured",
  "ai.polishing": "Calling AI\u2026",
  "ai.result": "AI polish result",
  "ai.original": "Original",
  "ai.polished": "Polished",
  "ai.apply": "Apply to composer",
  "ai.copy": "Copy",
  "ai.copied": "Copied",
  "ai.close": "Close",
  "ai.fail": "AI call failed",
  "ai.timeout": "The AI request timed out, please retry later",
  "ai.refine": "One-click refine",
  "ai.refining": "Refining\u2026",
  "ai.refined": "Refined draft",
  "ai.fieldTitle": "Title",
  "ai.fieldTags": "Tags",
  "ai.fieldSummary": "Summary",
  "ai.save": "Save to library",
  "ai.saving": "Saving\u2026",
  "ai.saved": "Saved to library",
  "ai.saveFail": "Failed to save to library",
  "ai.writeBackFail": "The original was saved, but writing back the refined draft failed",
  "ai.retryWriteBack": "Retry write-back",
  "ai.sameAsOriginal": "The refined draft matches the original \u2014 nothing to toggle",
  "ai.evicted": "Saved to library; older prompts were evicted past the limit",
  "ai.toggleMoved": "The original/refined compare and toggle now live on the manager's detail page",
  // ── P6: manager panel (list / detail / §4.4 side-by-side)──────────────
  "list.manage": "Manage",
  "manager.title": "Prompt manager",
  "manager.close": "Close",
  "manager.tab.list": "List",
  "manager.tab.tags": "Tags",
  "manager.tab.trash": "Trash",
  "manager.tab.transfer": "Import & export",
  "manager.tags.pending": "Tag management is filled in by a later task",
  "manager.trash.pending": "The trash panel is filled in by a later task",
  "manager.transfer.pending": "Import & export is filled in by a later task",
  "manager.list.new": "New",
  "manager.list.search": "Search prompts",
  "manager.list.searchPlaceholder": "Search title, body or tags",
  "manager.list.sort": "Sort",
  "manager.list.sortDefault": "Default",
  "manager.list.sortUpdated": "Recently updated",
  "manager.list.sortUsed": "Most used",
  "manager.list.sortCreated": "Recently created",
  "manager.list.tagFilter": "Tag filter",
  "manager.list.allTags": "All tags",
  "manager.list.tagsFailed": "Failed to load tags",
  "manager.list.usage": "Uses",
  "manager.list.edit": "Edit",
  "manager.list.delete": "Delete",
  "manager.list.deleted": "Moved to trash",
  "manager.list.evicted": "Saved; older prompts were evicted past the limit",
  "manager.edit.newTitle": "New prompt",
  "manager.edit.editTitle": "Edit prompt",
  "manager.edit.title": "Title",
  "manager.edit.body": "Body",
  "manager.edit.tags": "Tags",
  "manager.edit.summary": "Summary",
  "manager.edit.tagsPlaceholder": "Comma separated, e.g. writing, translation",
  "manager.edit.bodyRequired": "Body must not be empty",
  "manager.edit.save": "Save",
  "manager.edit.saving": "Saving\u2026",
  "manager.edit.saved": "Saved",
  "manager.edit.back": "Back to list",
  "manager.compare.original": "Original",
  "manager.compare.refined": "Refined",
  "manager.compare.toggle": "Toggle original / refined",
  "manager.compare.toggling": "Switching\u2026",
  "manager.compare.showingOriginal": "Current body: original",
  "manager.compare.showingRefined": "Current body: refined",
  "error.save": "Failed to save",
  "error.create": "Failed to create",
  "error.delete": "Failed to delete",
  "error.rollbackNoSource": "This prompt has no original to toggle",
  "sidebar.entry.title": "Prompts",
  "sidebar.entry.tip": "Open the prompt manager"
};

// src/client/components/TemplateVariablesDialog.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function hostLanguage() {
  if (typeof document !== "undefined" && document.documentElement.lang !== "") {
    return document.documentElement.lang;
  }
  if (typeof navigator !== "undefined" && navigator.language !== "") return navigator.language;
  return "en";
}
function fallbackTranslate() {
  const dict = hostLanguage().toLowerCase().startsWith("zh") ? zh : en;
  return (key) => dict[key] ?? key;
}
function TemplateVariablesDialog({
  body,
  onCancel,
  onFilled,
  t
}) {
  const tr = t ?? fallbackTranslate();
  const names = React2.useMemo(() => parseVariables(body), [body]);
  const [values, setValues] = React2.useState({});
  const [remembered, setRemembered] = React2.useState(false);
  const memory = React2.useRef({});
  const readState = React2.useRef("pending");
  React2.useEffect(() => {
    let alive = true;
    readState.current = "pending";
    api.getMeta(memoryKey).then(
      (raw) => {
        if (!alive) return;
        const stored = parseMemory(raw);
        memory.current = stored;
        readState.current = "ok";
        const prefill = pickRemembered(body, stored);
        setValues((prev) => {
          const next = { ...prefill };
          for (const [name, value] of Object.entries(prev)) if (value !== "") next[name] = value;
          return next;
        });
        setRemembered(Object.keys(prefill).length > 0);
      },
      (err) => {
        if (!alive) return;
        readState.current = "failed";
        console.warn("[prompt-enhancer] " + memoryKey + " \u8BFB\u53D6\u5931\u8D25\uFF0C\u672C\u6B21\u6309\u65E0\u8BB0\u5FC6\u5904\u7406", err);
      }
    );
    return () => {
      alive = false;
    };
  }, [body]);
  const confirm = (ev) => {
    ev.preventDefault();
    if (readState.current === "ok") {
      const merged = { ...memory.current };
      for (const [name, value] of Object.entries(values)) if (value !== "") merged[name] = value;
      void api.setMeta(memoryKey, JSON.stringify(merged)).catch((err) => {
        console.warn("[prompt-enhancer] " + memoryKey + " \u4FDD\u5B58\u5931\u8D25", err);
      });
    } else {
      console.warn("[prompt-enhancer] " + memoryKey + " \u8BB0\u5FC6\u672A\u5C31\u7EEA\uFF0C\u672C\u6B21\u4E0D\u5199\u56DE");
    }
    onFilled(fillTemplate(body, values));
  };
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: CARD, role: "dialog", "aria-label": tr("vars.title"), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("form", { style: FORM, onSubmit: confirm, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: TITLE, children: tr("vars.title") }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: HINT, children: tr("vars.hint") }),
    remembered && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: REMEMBERED, children: tr("vars.remembered") }),
    names.map((name, index) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { style: FIELD, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: LABEL, children: name }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "input",
        {
          type: "text",
          style: INPUT,
          value: values[name] ?? "",
          autoFocus: index === 0,
          "aria-label": name,
          onChange: (ev) => {
            const next = ev.currentTarget.value;
            setValues((prev) => ({ ...prev, [name]: next }));
          }
        }
      )
    ] }, name)),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: ACTIONS2, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "submit", style: PRIMARY, children: tr("vars.fill") }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", style: GHOST, onClick: onCancel, children: tr("vars.cancel") })
    ] })
  ] }) });
}
var CARD = {
  ...overlayBase,
  width: 300,
  maxWidth: "100%",
  maxHeight: 320,
  overflowY: "auto",
  padding: 10,
  fontSize: 12,
  lineHeight: 1.5
};
var FORM = { display: "flex", flexDirection: "column", gap: 8 };
var TITLE = { color: TOKEN.fg, fontSize: 12, fontWeight: 600 };
var HINT = { color: TOKEN.muted, fontSize: 11 };
var REMEMBERED = { color: TOKEN.accent, fontSize: 11 };
var FIELD = { display: "flex", flexDirection: "column", gap: 3 };
var LABEL = { color: TOKEN.muted, fontSize: 11 };
var INPUT = {
  padding: "4px 6px",
  fontSize: 12,
  color: TOKEN.fg,
  background: "transparent",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6
};
var ACTIONS2 = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  marginTop: 2
};
var BUTTON2 = {
  padding: "3px 10px",
  fontSize: 11,
  color: TOKEN.fg,
  background: "transparent",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  cursor: "pointer"
};
var PRIMARY = { ...BUTTON2, color: TOKEN.accent, borderColor: TOKEN.accent };
var GHOST = { ...BUTTON2, color: TOKEN.muted };

// src/client/components/HashSuggestOverlay.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
function HashSuggestOverlay({
  t,
  useInput,
  inputActions
}) {
  const draft = useInput((s) => s.draft);
  const token = readHashToken(draft);
  const open = token !== null;
  const [prompts, setPrompts] = React3.useState(null);
  const [loadError, setLoadError] = React3.useState(null);
  const [pending, setPending] = React3.useState(null);
  React3.useEffect(() => {
    if (!open) {
      setPending(null);
      return;
    }
    let alive = true;
    setPrompts(null);
    setLoadError(null);
    api.listPrompts().then(
      (list) => {
        if (alive) setPrompts(list);
      },
      (err) => {
        if (!alive) return;
        console.warn("[prompt-enhancer] \u63D0\u793A\u8BCD\u5217\u8868\u52A0\u8F7D\u5931\u8D25", err);
        setPrompts([]);
        setLoadError(err instanceof Error ? err.message : String(err));
      }
    );
    return () => {
      alive = false;
    };
  }, [open]);
  const apply2 = (prompt, body) => {
    inputActions.setDraft(replaceHashToken(draft, body));
    setPending(null);
    void api.recordUsage(prompt.id).catch((err) => {
      console.warn("[prompt-enhancer] " + t("error.use"), err);
    });
  };
  if (token === null) return null;
  if (pending !== null) {
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: ANCHOR2, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      TemplateVariablesDialog,
      {
        body: pending.body,
        t,
        onCancel: () => setPending(null),
        onFilled: (filled) => apply2(pending, filled)
      }
    ) });
  }
  const filtered = filterPrompts(prompts ?? [], token.query);
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: ANCHOR2, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { role: "group", "aria-label": t("hash.title"), style: PANEL2, children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: HEADER2, children: t("hash.title") }),
    loadError !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { role: "alert", style: ERROR2, title: loadError, children: t("error.load") }),
    loadError === null && prompts === null && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: MUTED2, children: t("list.loading") }),
    loadError === null && prompts !== null && filtered.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: MUTED2, children: t("hash.empty") }),
    loadError === null && filtered.map((prompt) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
      "button",
      {
        type: "button",
        style: ROW,
        title: prompt.title,
        "aria-label": prompt.title,
        onClick: () => {
          if (needsValues(prompt.body)) setPending(prompt);
          else apply2(prompt, prompt.body);
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: ROW_TITLE, children: prompt.title }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: ROW_SUMMARY, children: promptSummary(prompt) }),
          prompt.tags.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: TAGS, children: prompt.tags.map((tag) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: TAG, children: tag }, tag)) })
        ]
      },
      prompt.id
    ))
  ] }) });
}
var ANCHOR2 = {
  position: "absolute",
  bottom: 8,
  left: 8,
  zIndex: 30,
  maxWidth: "calc(100vw - 24px)"
};
var PANEL2 = {
  ...overlayBase,
  display: "flex",
  flexDirection: "column",
  gap: 4,
  width: 300,
  maxHeight: 320,
  overflowY: "auto",
  padding: 6,
  fontSize: 12
};
var HEADER2 = { color: TOKEN.muted, fontSize: 11, fontWeight: 600 };
var MUTED2 = { color: TOKEN.muted, fontSize: 11 };
var ERROR2 = { color: TOKEN.fg, fontSize: 11 };
var ROW = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 2,
  width: "100%",
  padding: "5px 4px",
  color: TOKEN.fg,
  background: "transparent",
  border: 0,
  borderTop: `1px solid ${TOKEN.border}`,
  textAlign: "left",
  font: "inherit",
  fontSize: 12,
  cursor: "pointer"
};
var ROW_TITLE = {
  color: TOKEN.fg,
  fontSize: 12,
  fontWeight: 600,
  maxWidth: "100%",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap"
};
var ROW_SUMMARY = { color: TOKEN.muted, fontSize: 11, overflowWrap: "anywhere" };
var TAGS = { display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 };
var TAG = {
  color: TOKEN.accent,
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 999,
  padding: "0 6px",
  fontSize: 10
};

// src/client/components/PromptLibraryButton.tsx
var React4 = __toESM(require("react"), 1);

// src/client/utils/react-hooks.ts
var reactHooks;
function hooks() {
  if (reactHooks === void 0) {
    reactHooks = null;
    if (typeof require === "function") {
      try {
        reactHooks = require("react");
      } catch (e) {
        console.warn("[prompt-enhancer] \u65E0\u6CD5\u89E3\u6790 react\uFF0Chook \u4E0D\u53EF\u7528\uFF1A", e);
      }
    } else {
      console.warn("[prompt-enhancer] \u5F53\u524D\u73AF\u5883\u6CA1\u6709 require\uFF0C\u65E0\u6CD5\u89E3\u6790 react\uFF08hook \u53EA\u80FD\u5728\u5BBF\u4E3B\u91CC\u8C03\u7528\uFF09");
    }
  }
  if (!reactHooks) {
    throw new Error("prompt-enhancer: react \u8FD0\u884C\u65F6\u4E0D\u53EF\u7528\uFF08hook \u53EA\u80FD\u5728\u5BBF\u4E3B\u91CC\u8C03\u7528\uFF09");
  }
  return reactHooks;
}

// src/client/utils/ui-state.ts
var DEFAULT_PANEL = "list";
var state = { open: false, panel: DEFAULT_PANEL };
var capture = null;
var listeners = /* @__PURE__ */ new Set();
function emit() {
  for (const listener of [...listeners]) listener();
}
function subscribe(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function getSnapshot() {
  return state;
}
function openManager(panel = DEFAULT_PANEL) {
  if (state.open && state.panel === panel) return;
  state = { open: true, panel };
  emit();
}
function closeManager() {
  if (!state.open) return;
  state = { open: false, panel: state.panel };
  emit();
}
function takeCapture() {
  const pending = capture;
  capture = null;
  if (pending) emit();
  return pending;
}
function useManagerState() {
  const { useState: useState7, useEffect: useEffect7 } = hooks();
  const [snapshot, setSnapshot] = useState7(getSnapshot);
  useEffect7(() => subscribe(() => setSnapshot(getSnapshot())), []);
  return snapshot;
}

// src/client/components/PromptLibraryButton.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
var ACTIONS3 = [
  { mode: "insert", label: "action.insert" },
  { mode: "overwrite", label: "action.overwrite" },
  { mode: "insert-send", label: "action.send" }
];
var NOTICE_MS = 4e3;
function PromptLibraryButton({
  t,
  useInput,
  inputActions
}) {
  const draft = useInput((s) => s.draft);
  const [settings, setSettings] = React4.useState(null);
  const [open, setOpen] = React4.useState(false);
  const [prompts, setPrompts] = React4.useState(null);
  const [loadError, setLoadError] = React4.useState(null);
  const [notice, setNotice] = React4.useState(null);
  const [pending, setPending] = React4.useState(null);
  const rootRef = React4.useRef(null);
  React4.useEffect(() => {
    let alive = true;
    api.getSettings().then(
      (value) => {
        if (alive) setSettings(value);
      },
      (err) => {
        console.warn("[prompt-enhancer] \u8BBE\u7F6E\u8BFB\u53D6\u5931\u8D25\uFF0C\u672C\u6B21\u6309\u9ED8\u8BA4\u8BBE\u7F6E\u663E\u793A\u6309\u94AE", err);
        if (alive) setSettings(DEFAULT_SETTINGS);
      }
    );
    return () => {
      alive = false;
    };
  }, []);
  React4.useEffect(() => {
    if (!open) return;
    let alive = true;
    setPrompts(null);
    setLoadError(null);
    api.listPrompts({ sort: "default" }).then(
      (list) => {
        if (alive) setPrompts(list);
      },
      (err) => {
        if (!alive) return;
        console.warn("[prompt-enhancer] \u63D0\u793A\u8BCD\u5217\u8868\u52A0\u8F7D\u5931\u8D25", err);
        setPrompts([]);
        setLoadError(err instanceof Error ? err.message : String(err));
      }
    );
    return () => {
      alive = false;
    };
  }, [open]);
  React4.useEffect(() => {
    if (!open) return;
    const onPointerDown = (ev) => {
      const root = rootRef.current;
      if (root !== null && ev.target instanceof Node && root.contains(ev.target)) return;
      setOpen(false);
      setPending(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open]);
  React4.useEffect(() => {
    if (notice === null) return;
    const id = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => {
      window.clearTimeout(id);
    };
  }, [notice]);
  const close = () => {
    setOpen(false);
    setPending(null);
  };
  const apply2 = (prompt, body, mode) => {
    const next = composeDraft(draft, body, mode);
    inputActions.setDraft(next.draft);
    if (next.send) inputActions.submit();
    close();
    void api.recordUsage(prompt.id).catch((err) => {
      console.warn("[prompt-enhancer] " + t("error.use"), err);
      const reason = err instanceof Error ? err.message : String(err);
      if (reason.includes("\u4E0D\u5B58\u5728")) {
        setPrompts((prev) => prev === null ? prev : prev.filter((item) => item.id !== prompt.id));
        setNotice((prev) => ({ text: t("error.noPrompt"), seq: (prev?.seq ?? 0) + 1 }));
      }
    });
  };
  const choose = (prompt, mode) => {
    if (needsValues(prompt.body)) setPending({ prompt, mode });
    else apply2(prompt, prompt.body, mode);
  };
  if (settings === null || !settings.showComposerButton) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { ref: rootRef, style: WRAP2, children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      "button",
      {
        type: "button",
        style: BUTTON3,
        title: t("button.tip"),
        "aria-label": t("button.tip"),
        "aria-haspopup": "dialog",
        "aria-expanded": open,
        onClick: () => {
          if (open) close();
          else setOpen(true);
        },
        children: t("button.title")
      }
    ),
    notice !== null && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { role: "status", "aria-live": "polite", style: NOTICE, children: notice.text }),
    open && pending !== null && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: ANCHOR3, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      TemplateVariablesDialog,
      {
        body: pending.prompt.body,
        t,
        onCancel: () => setPending(null),
        onFilled: (filled) => apply2(pending.prompt, filled, pending.mode)
      }
    ) }),
    open && pending === null && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: ANCHOR3, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { role: "dialog", "aria-label": t("list.title"), style: PANEL3, children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { style: PANEL_HEADER, children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: HEADER3, children: t("list.title") }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "button",
          {
            type: "button",
            style: ACTION_BUTTON,
            title: t("list.manage"),
            "aria-label": t("list.manage"),
            "aria-haspopup": "dialog",
            onClick: () => {
              close();
              openManager();
            },
            children: t("list.manage")
          }
        )
      ] }),
      loadError !== null && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { role: "alert", style: ERROR3, children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: t("error.load") }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: ERROR_DETAIL2, title: loadError, children: loadError })
      ] }),
      loadError === null && prompts === null && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: MUTED3, children: t("list.loading") }),
      loadError === null && prompts !== null && prompts.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: MUTED3, children: t("list.empty") }),
      loadError === null && prompts !== null && prompts.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { role: "list", style: LIST, children: prompts.map((prompt) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { role: "listitem", "aria-label": prompt.title, style: ROW2, children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { style: ROW_TEXT, children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: ROW_TITLE2, children: prompt.title }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: ROW_SUMMARY2, children: promptSummary(prompt) }),
          (prompt.summary ?? "").trim() !== "" && (prompt.tags ?? []).length > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: TAGS2, children: (prompt.tags ?? []).map((tag) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: TAG2, children: tag }, tag)) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: ROW_ACTIONS, children: ACTIONS3.map(({ mode, label }) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "button",
          {
            type: "button",
            style: ACTION_BUTTON,
            title: `${t(label)} ${prompt.title}`,
            "aria-label": `${t(label)} ${prompt.title}`,
            onClick: () => choose(prompt, mode),
            children: t(label)
          },
          mode
        )) })
      ] }, prompt.id)) })
    ] }) })
  ] });
}
var WRAP2 = {
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  gap: 6
};
var BUTTON3 = {
  display: "inline-flex",
  alignItems: "center",
  height: 24,
  padding: "0 8px",
  fontSize: 12,
  color: TOKEN.fg,
  background: "transparent",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  cursor: "pointer"
};
var NOTICE = { color: TOKEN.muted, fontSize: 11, whiteSpace: "nowrap" };
var ANCHOR3 = {
  position: "absolute",
  bottom: "calc(100% + 6px)",
  left: 0,
  zIndex: 30,
  maxWidth: "calc(100vw - 24px)"
};
var PANEL3 = {
  ...overlayBase,
  display: "flex",
  flexDirection: "column",
  gap: 6,
  width: 320,
  maxHeight: 320,
  overflowY: "auto",
  padding: 8,
  fontSize: 12
};
var PANEL_HEADER = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 6
};
var HEADER3 = { color: TOKEN.muted, fontSize: 11, fontWeight: 600 };
var MUTED3 = { color: TOKEN.muted, fontSize: 11 };
var ERROR3 = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  color: TOKEN.fg,
  fontSize: 11
};
var ERROR_DETAIL2 = { color: TOKEN.muted, overflowWrap: "anywhere" };
var LIST = { display: "flex", flexDirection: "column" };
var ROW2 = {
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  padding: "6px 2px",
  borderTop: `1px solid ${TOKEN.border}`
};
var ROW_TEXT = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  flex: "1 1 auto",
  minWidth: 0
};
var ROW_TITLE2 = {
  color: TOKEN.fg,
  fontSize: 12,
  fontWeight: 600,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap"
};
var ROW_SUMMARY2 = { color: TOKEN.muted, fontSize: 11, overflowWrap: "anywhere" };
var TAGS2 = { display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 };
var TAG2 = {
  color: TOKEN.accent,
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 999,
  padding: "0 6px",
  fontSize: 10
};
var ROW_ACTIONS = {
  display: "flex",
  flexDirection: "column",
  flex: "0 0 auto",
  gap: 4
};
var ACTION_BUTTON = {
  padding: "1px 6px",
  fontSize: 11,
  lineHeight: "16px",
  color: TOKEN.fg,
  background: "transparent",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  cursor: "pointer"
};

// src/client/utils/dialog-style.ts
var backdrop = {
  position: "fixed",
  inset: 0,
  zIndex: 100,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  background: "rgba(0, 0, 0, 0.35)"
};
function surface(width, height) {
  return {
    ...overlayBase,
    display: "flex",
    flexDirection: "column",
    width,
    height,
    maxWidth: "calc(100vw - 40px)",
    maxHeight: "calc(100vh - 40px)",
    overflow: "hidden",
    fontSize: 12
  };
}
var dialogHeader = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 12px",
  borderBottom: `1px solid ${TOKEN.border}`,
  flex: "0 0 auto"
};
var dialogTitle = { color: TOKEN.fg, fontSize: 13, fontWeight: 600, flex: "0 0 auto" };
var dialogTabs = {
  display: "flex",
  gap: 4,
  flex: "1 1 auto",
  minWidth: 0,
  overflowX: "auto"
};
function dialogTab(active) {
  return {
    padding: "2px 10px",
    fontSize: 11,
    lineHeight: "18px",
    color: active ? TOKEN.accent : TOKEN.muted,
    background: active ? TOKEN.hover : "transparent",
    border: `1px solid ${active ? TOKEN.accent : TOKEN.border}`,
    borderRadius: 999,
    cursor: "pointer",
    whiteSpace: "nowrap",
    flex: "0 0 auto"
  };
}
var dialogBody = {
  flex: "1 1 auto",
  minHeight: 0,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 12
};
var toolbar = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 6,
  flex: "0 0 auto"
};
var textInput = {
  boxSizing: "border-box",
  minWidth: 0,
  padding: "4px 8px",
  color: TOKEN.fg,
  background: "transparent",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  fontSize: 12,
  fontFamily: "inherit",
  outline: "none"
};
var textArea = {
  ...textInput,
  width: "100%",
  resize: "vertical",
  padding: "6px 8px",
  lineHeight: 1.5
};
var select = { ...textInput, cursor: "pointer" };
var fieldLabel = { color: TOKEN.muted, fontSize: 11, flex: "0 0 auto", width: 42 };
var fieldRow = { display: "flex", alignItems: "flex-start", gap: 6 };
var button = {
  padding: "2px 8px",
  fontSize: 11,
  lineHeight: "16px",
  color: TOKEN.fg,
  background: "transparent",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  cursor: "pointer",
  flex: "0 0 auto"
};
var primaryButton = { ...button, borderColor: TOKEN.accent, color: TOKEN.accent };
var actions = { display: "flex", gap: 6, justifyContent: "flex-end", flex: "0 0 auto" };
var muted = { color: TOKEN.muted, fontSize: 11, overflowWrap: "anywhere" };
var errorText = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  color: TOKEN.fg,
  fontSize: 11
};
var errorDetail = { color: TOKEN.muted, overflowWrap: "anywhere" };
var listRow = {
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  padding: "6px 0",
  borderTop: `1px solid ${TOKEN.border}`
};
var rowText = { display: "flex", flexDirection: "column", gap: 2, flex: "1 1 auto", minWidth: 0 };
var rowTitle = {
  color: TOKEN.fg,
  fontSize: 12,
  fontWeight: 600,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap"
};
var rowMeta = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4 };
var tagChip = {
  color: TOKEN.accent,
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 999,
  padding: "0 6px",
  fontSize: 10
};
var compareGrid = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 };
var compareBlock = { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 };
var compareHead = { color: TOKEN.muted, fontSize: 11, fontWeight: 600 };
var compareBody = {
  flex: "1 1 auto",
  minHeight: 0,
  maxHeight: 180,
  overflowY: "auto",
  color: TOKEN.fg,
  fontSize: 11,
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  padding: "4px 6px"
};

// src/client/components/PromptManagerModal.tsx
var React5 = __toESM(require("react"), 1);

// src/client/utils/data-sync.ts
var DATA_CHANGED = "prompt-enhancer:data-changed";
function hasEventFace() {
  const candidate = globalThis;
  return typeof candidate.addEventListener === "function" && typeof candidate.dispatchEvent === "function";
}
var bus = hasEventFace() ? globalThis : new EventTarget();
function subscribeDataChanged(fn) {
  bus.addEventListener(DATA_CHANGED, fn);
  return () => bus.removeEventListener(DATA_CHANGED, fn);
}
function notifyDataChanged() {
  bus.dispatchEvent(new Event(DATA_CHANGED));
}
function useDataChanged(fn, deps = []) {
  const { useEffect: useEffect7 } = hooks();
  useEffect7(() => subscribeDataChanged(fn), deps);
}

// src/client/components/PromptManagerModal.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
var PANEL_ORDER = ["list", "tags", "trash", "transfer"];
var PANEL_LABEL = {
  list: "manager.tab.list",
  tags: "manager.tab.tags",
  trash: "manager.tab.trash",
  transfer: "manager.tab.transfer"
};
var PANEL_PENDING = {
  list: "manager.tab.list",
  tags: "manager.tags.pending",
  trash: "manager.trash.pending",
  transfer: "manager.transfer.pending"
};
var SORTS = [
  { value: "default", label: "manager.list.sortDefault" },
  { value: "updated", label: "manager.list.sortUpdated" },
  { value: "used", label: "manager.list.sortUsed" },
  { value: "created", label: "manager.list.sortCreated" }
];
var SEARCH_DEBOUNCE_MS = 300;
function reasonOf2(err) {
  return err instanceof Error ? err.message : String(err);
}
function parseTagList(text) {
  const out = [];
  for (const raw of text.split(/[,，]/)) {
    const tag = raw.trim();
    if (tag !== "" && !out.includes(tag)) out.push(tag);
  }
  return out;
}
function fallbackTitle(body) {
  const firstLine = body.split(/\r\n|\n|\r/).find((line) => line.trim() !== "") ?? "";
  return firstLine.trim();
}
function PromptManagerModal({ t, panel }) {
  const [settings, setSettings] = React5.useState(DEFAULT_SETTINGS);
  const [target, setTarget] = React5.useState(null);
  React5.useEffect(() => {
    let alive = true;
    api.getSettings().then(
      (value) => {
        if (alive) setSettings(value);
      },
      (err) => {
        console.warn("[prompt-enhancer] \u8BBE\u7F6E\u8BFB\u53D6\u5931\u8D25\uFF0C\u672C\u6B21\u6309\u9ED8\u8BA4\u5C3A\u5BF8\u663E\u793A\u7BA1\u7406\u9762\u677F", err);
      }
    );
    return () => {
      alive = false;
    };
  }, []);
  const openPanel = (next) => {
    setTarget(null);
    openManager(next);
  };
  const startCreate = () => setTarget({ kind: "create", prefill: takeCapture() });
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
    "div",
    {
      role: "dialog",
      "aria-modal": "true",
      "aria-label": t("manager.title"),
      style: surface(settings.panelWidth, settings.panelHeight),
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: dialogHeader, children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: dialogTitle, children: t("manager.title") }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { role: "tablist", "aria-label": t("manager.title"), style: dialogTabs, children: PANEL_ORDER.map((id) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
            "button",
            {
              type: "button",
              role: "tab",
              "aria-selected": panel === id,
              style: dialogTab(panel === id),
              onClick: () => openPanel(id),
              children: t(PANEL_LABEL[id])
            },
            id
          )) }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", style: button, onClick: closeManager, children: t("manager.close") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { role: "tabpanel", "aria-label": t(PANEL_LABEL[panel]), style: dialogBody, children: [
          panel === "list" && target === null && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(PromptList, { t, onCreate: startCreate, onEdit: (prompt) => setTarget({ kind: "edit", prompt }) }),
          panel === "list" && target !== null && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
            PromptDetail,
            {
              t,
              target,
              onBack: () => setTarget(null)
            },
            target.kind === "edit" ? target.prompt.id : "create"
          ),
          panel !== "list" && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: muted, children: t(PANEL_PENDING[panel]) })
        ] })
      ]
    }
  );
}
function PromptList({ t, onCreate, onEdit }) {
  const [query, setQuery] = React5.useState("");
  const [applied, setApplied] = React5.useState("");
  const [sort, setSort] = React5.useState("default");
  const [tag, setTag] = React5.useState("");
  const [prompts, setPrompts] = React5.useState(null);
  const [tags, setTags] = React5.useState(null);
  const [loadError, setLoadError] = React5.useState(null);
  const [tagsError, setTagsError] = React5.useState(null);
  const [notice, setNotice] = React5.useState(null);
  const [busyId, setBusyId] = React5.useState(null);
  const [deleteError, setDeleteError] = React5.useState(null);
  const [reloadSeq, setReloadSeq] = React5.useState(0);
  const aliveRef = React5.useRef(true);
  React5.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  React5.useEffect(() => {
    const id = window.setTimeout(() => setApplied(query), SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(id);
    };
  }, [query]);
  useDataChanged(() => setReloadSeq((n) => n + 1));
  React5.useEffect(() => {
    let alive = true;
    setPrompts(null);
    setLoadError(null);
    api.listPrompts({ q: applied.trim() || void 0, tag: tag || void 0, sort }).then(
      (list) => {
        if (alive) setPrompts(list);
      },
      (err) => {
        if (!alive) return;
        console.warn("[prompt-enhancer] \u63D0\u793A\u8BCD\u5217\u8868\u52A0\u8F7D\u5931\u8D25", err);
        setPrompts([]);
        setLoadError(reasonOf2(err));
      }
    );
    return () => {
      alive = false;
    };
  }, [applied, tag, sort, reloadSeq]);
  React5.useEffect(() => {
    let alive = true;
    api.listTags().then(
      (list) => {
        if (!alive) return;
        setTags(list);
        setTagsError(null);
      },
      (err) => {
        if (!alive) return;
        console.warn("[prompt-enhancer] \u6807\u7B7E\u52A0\u8F7D\u5931\u8D25", err);
        setTags(null);
        setTagsError(reasonOf2(err));
      }
    );
    return () => {
      alive = false;
    };
  }, [reloadSeq]);
  const remove = (prompt) => {
    if (busyId !== null) return;
    setBusyId(prompt.id);
    setNotice(null);
    setDeleteError(null);
    api.deletePrompt(prompt.id).then(
      () => {
        if (!aliveRef.current) return;
        setBusyId(null);
        setNotice(t("manager.list.deleted"));
        notifyDataChanged();
      },
      (err) => {
        console.warn("[prompt-enhancer] \u5220\u9664\u63D0\u793A\u8BCD\u5931\u8D25", err);
        if (!aliveRef.current) return;
        setBusyId(null);
        setDeleteError({ id: prompt.id, detail: reasonOf2(err) });
      }
    );
  };
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: toolbar, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        "input",
        {
          type: "search",
          "aria-label": t("manager.list.search"),
          placeholder: t("manager.list.searchPlaceholder"),
          value: query,
          onChange: (ev) => setQuery(ev.target.value),
          style: { ...textInput, flex: "1 1 160px" }
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { style: muted, children: [
        t("manager.list.sort"),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "select",
          {
            "aria-label": t("manager.list.sort"),
            value: sort,
            onChange: (ev) => setSort(ev.target.value),
            style: { ...select, marginLeft: 4 },
            children: SORTS.map(({ value, label }) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value, children: t(label) }, value))
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { style: muted, children: [
        t("manager.list.tagFilter"),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
          "select",
          {
            "aria-label": t("manager.list.tagFilter"),
            value: tag,
            onChange: (ev) => setTag(ev.target.value),
            style: { ...select, marginLeft: 4 },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: "", children: t("manager.list.allTags") }),
              (tags ?? []).map((item) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("option", { value: item.name, children: [
                item.name,
                " (",
                item.count,
                ")"
              ] }, item.name))
            ]
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", style: primaryButton, onClick: onCreate, children: t("manager.list.new") })
    ] }),
    tagsError !== null && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { style: errorText, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: t("manager.list.tagsFailed") }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: errorDetail, title: tagsError, children: tagsError })
    ] }),
    notice !== null && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { role: "status", "aria-live": "polite", style: muted, children: notice }),
    loadError !== null && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { role: "alert", style: errorText, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: t("error.load") }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: errorDetail, title: loadError, children: loadError })
    ] }),
    loadError === null && prompts === null && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: muted, children: t("list.loading") }),
    loadError === null && prompts !== null && prompts.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: muted, children: t("list.empty") }),
    loadError === null && prompts !== null && prompts.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { role: "list", children: prompts.map((prompt) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { role: "listitem", "aria-label": prompt.title, style: listRow, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { style: rowText, children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: rowTitle, children: prompt.title }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: muted, children: promptSummary(prompt) }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { style: rowMeta, children: [
          (prompt.tags ?? []).map((item) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: tagChip, children: item }, item)),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { style: muted, children: [
            t("manager.list.usage"),
            " ",
            prompt.usageCount
          ] })
        ] }),
        deleteError !== null && deleteError.id === prompt.id && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { role: "alert", style: errorText, children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: t("error.delete") }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: errorDetail, title: deleteError.detail, children: deleteError.detail })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { style: actions, children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", style: button, onClick: () => onEdit(prompt), children: t("manager.list.edit") }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "button",
          {
            type: "button",
            style: { ...button, opacity: busyId === null ? 1 : 0.6 },
            "aria-busy": busyId === prompt.id,
            disabled: busyId !== null,
            onClick: () => remove(prompt),
            children: t("manager.list.delete")
          }
        )
      ] })
    ] }, prompt.id)) })
  ] });
}
function PromptDetail({ t, target, onBack }) {
  const initial = target.kind === "edit" ? target.prompt : null;
  const prefill = target.kind === "create" ? target.prefill : null;
  const [title, setTitle] = React5.useState(initial ? initial.title : prefill?.title ?? "");
  const [body, setBody] = React5.useState(initial ? initial.body : prefill?.body ?? "");
  const [tagsText, setTagsText] = React5.useState(initial ? (initial.tags ?? []).join(", ") : "");
  const [summary, setSummary] = React5.useState(initial ? initial.summary ?? "" : "");
  const [current, setCurrent] = React5.useState(initial);
  const [bodyIsOriginal, setBodyIsOriginal] = React5.useState(false);
  const [busy, setBusy] = React5.useState("idle");
  const [failure, setFailure] = React5.useState(null);
  const [notice, setNotice] = React5.useState(null);
  const aliveRef = React5.useRef(true);
  React5.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  const blankBody = body.trim() === "";
  const save = () => {
    if (busy !== "idle" || blankBody) return;
    const editing = current;
    const input = {
      title: clampTitle(title.trim() || fallbackTitle(body)),
      body,
      tags: parseTagList(tagsText),
      summary: summary.trim()
    };
    setBusy("saving");
    setFailure(null);
    setNotice(null);
    void (async () => {
      try {
        if (editing === null) {
          const created = await api.createPrompt(input);
          if (!aliveRef.current) return;
          setCurrent(created.prompt);
          setTitle(created.prompt.title);
          setNotice(created.evicted.length > 0 ? t("manager.list.evicted") : t("manager.edit.saved"));
        } else {
          const updated = await api.updatePrompt(editing.id, input);
          if (!aliveRef.current) return;
          setCurrent(updated);
          setTitle(updated.title);
          setBody(updated.body);
          setTagsText((updated.tags ?? []).join(", "));
          setSummary(updated.summary ?? "");
          setNotice(t("manager.edit.saved"));
        }
        notifyDataChanged();
      } catch (err) {
        console.warn("[prompt-enhancer] \u63D0\u793A\u8BCD\u4FDD\u5B58\u5931\u8D25", err);
        if (!aliveRef.current) return;
        setFailure({ key: editing === null ? "error.create" : "error.save", detail: reasonOf2(err) });
      } finally {
        if (aliveRef.current) setBusy("idle");
      }
    })();
  };
  const toggle = () => {
    if (busy !== "idle" || current === null) return;
    const id = current.id;
    setBusy("toggling");
    setFailure(null);
    setNotice(null);
    void (async () => {
      try {
        const swapped = await api.rollbackPrompt(id);
        if (!aliveRef.current) return;
        setCurrent(swapped);
        setBody(swapped.body);
        setBodyIsOriginal((prev) => !prev);
        notifyDataChanged();
      } catch (err) {
        console.warn("[prompt-enhancer] \u539F\u6587 / \u4F18\u5316\u7A3F\u5207\u6362\u5931\u8D25", err);
        if (!aliveRef.current) return;
        const notFound = err instanceof ApiError && err.status === 404;
        setFailure({
          key: notFound ? "error.noPrompt" : "error.rollbackNoSource",
          detail: reasonOf2(err)
        });
      } finally {
        if (aliveRef.current) setBusy("idle");
      }
    })();
  };
  const originalBody = current === null ? "" : bodyIsOriginal ? current.body : current.sourceBody ?? "";
  const refinedBody = current === null ? "" : bodyIsOriginal ? current.sourceBody ?? "" : current.body;
  const busyButton = blankBody || busy !== "idle";
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: dialogTitle, children: t(target.kind === "create" ? "manager.edit.newTitle" : "manager.edit.editTitle") }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: fieldRow, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: fieldLabel, children: t("manager.edit.title") }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        "input",
        {
          type: "text",
          "aria-label": t("manager.edit.title"),
          value: title,
          onChange: (ev) => setTitle(ev.target.value),
          style: { ...textInput, flex: "1 1 auto" }
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: fieldRow, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: fieldLabel, children: t("manager.edit.body") }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        "textarea",
        {
          "aria-label": t("manager.edit.body"),
          value: body,
          rows: 8,
          onChange: (ev) => setBody(ev.target.value),
          style: textArea
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: fieldRow, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: fieldLabel, children: t("manager.edit.tags") }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        "input",
        {
          type: "text",
          "aria-label": t("manager.edit.tags"),
          placeholder: t("manager.edit.tagsPlaceholder"),
          value: tagsText,
          onChange: (ev) => setTagsText(ev.target.value),
          style: { ...textInput, flex: "1 1 auto" }
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: fieldRow, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: fieldLabel, children: t("manager.edit.summary") }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        "input",
        {
          type: "text",
          "aria-label": t("manager.edit.summary"),
          value: summary,
          onChange: (ev) => setSummary(ev.target.value),
          style: { ...textInput, flex: "1 1 auto" }
        }
      )
    ] }),
    blankBody && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: muted, children: t("manager.edit.bodyRequired") }),
    notice !== null && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { role: "status", "aria-live": "polite", style: muted, children: notice }),
    failure !== null && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { role: "alert", style: errorText, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: t(failure.key) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: errorDetail, title: failure.detail, children: failure.detail })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: actions, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", style: button, onClick: onBack, children: t("manager.edit.back") }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        "button",
        {
          type: "button",
          style: { ...primaryButton, opacity: busyButton ? 0.6 : 1, cursor: busyButton ? "default" : "pointer" },
          "aria-busy": busy === "saving",
          disabled: busyButton,
          onClick: save,
          children: busy === "saving" ? t("manager.edit.saving") : t("manager.edit.save")
        }
      )
    ] }),
    current !== null && canToggle(current) && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { style: dialogTitle, children: [
        t("manager.compare.original"),
        " / ",
        t("manager.compare.refined")
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: compareGrid, children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { style: compareBlock, children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: compareHead, children: t("manager.compare.original") }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: compareBody, children: originalBody })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { style: compareBlock, children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: compareHead, children: t("manager.compare.refined") }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: compareBody, children: refinedBody })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: muted, children: t(bodyIsOriginal ? "manager.compare.showingOriginal" : "manager.compare.showingRefined") }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: actions, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        "button",
        {
          type: "button",
          style: { ...primaryButton, opacity: busy === "idle" ? 1 : 0.6 },
          "aria-busy": busy === "toggling",
          disabled: busy !== "idle",
          onClick: toggle,
          children: busy === "toggling" ? t("manager.compare.toggling") : t("manager.compare.toggle")
        }
      ) })
    ] })
  ] });
}

// src/client/components/PromptSurfaceHost.tsx
var import_jsx_runtime6 = require("react/jsx-runtime");
function PromptSurfaceHost({ t }) {
  const { open, panel } = useManagerState();
  if (!open) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
    "div",
    {
      "data-prompt-enhancer-manager": "",
      style: backdrop,
      onPointerDownCapture: (ev) => {
        if (ev.target === ev.currentTarget) closeManager();
      },
      children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(PromptManagerModal, { t, panel })
    }
  );
}

// src/client/components/SidebarPromptEntry.tsx
var React6 = __toESM(require("react"), 1);
var import_jsx_runtime7 = require("react/jsx-runtime");
function entryStyle(wide) {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    height: 28,
    width: wide ? void 0 : 28,
    padding: wide ? "0 8px" : 0,
    flex: "0 0 auto",
    fontSize: 12,
    color: TOKEN.fg,
    background: "transparent",
    border: `1px solid ${TOKEN.border}`,
    borderRadius: 6,
    cursor: "pointer"
  };
}
function SidebarPromptEntry({ t, wide }) {
  const [settings, setSettings] = React6.useState(null);
  React6.useEffect(() => {
    let alive = true;
    api.getSettings().then(
      (value) => {
        if (alive) setSettings(value);
      },
      (err) => {
        console.warn("[prompt-enhancer] \u8BBE\u7F6E\u8BFB\u53D6\u5931\u8D25\uFF0C\u672C\u6B21\u6309\u9ED8\u8BA4\u8BBE\u7F6E\u663E\u793A\u4FA7\u680F\u5165\u53E3", err);
        if (alive) setSettings(DEFAULT_SETTINGS);
      }
    );
    return () => {
      alive = false;
    };
  }, []);
  if (settings === null || !settings.showSidebarButton) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
    "button",
    {
      type: "button",
      style: entryStyle(wide),
      title: t("sidebar.entry.tip"),
      "aria-label": t("sidebar.entry.title"),
      "aria-haspopup": "dialog",
      onClick: () => openManager(),
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(BookIcon, {}),
        wide && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { children: t("sidebar.entry.title") })
      ]
    }
  );
}
function BookIcon() {
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true", style: ICON2, children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
      "path",
      {
        d: "M4 5.5C4 4.7 4.7 4 5.5 4H11v15H5.5C4.7 19 4 18.3 4 17.5v-12Z",
        stroke: "currentColor",
        strokeWidth: "1.7",
        strokeLinejoin: "round"
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
      "path",
      {
        d: "M20 5.5C20 4.7 19.3 4 18.5 4H13v15h5.5c.8 0 1.5-.7 1.5-1.5v-12Z",
        stroke: "currentColor",
        strokeWidth: "1.7",
        strokeLinejoin: "round"
      }
    )
  ] });
}
var ICON2 = { display: "block", flex: "0 0 auto" };

// src/client/utils/workspace-dir.ts
var capability = null;
function setDirectoryCapability(cap) {
  capability = cap ?? null;
}

// src/client/index.ts
var inject = ["slots", "locale"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "prompt-enhancer: dictionaries");
  ctx.inject(["slots"], (scope) => {
    scope.slots.inject(
      "conversation.input.left",
      () => scope.slots.register(
        { name: "conversation.input.left", id: "prompt-enhancer", order: 10, locale: NS },
        PromptLibraryButton
      )
    );
    scope.slots.inject(
      "conversation.input.overlay",
      () => scope.slots.register(
        { name: "conversation.input.overlay", id: "prompt-enhancer-hash", order: 20, locale: NS },
        HashSuggestOverlay
      )
    );
    scope.slots.inject(
      "conversation.input.left",
      () => scope.slots.register(
        { name: "conversation.input.left", id: "prompt-enhancer-ai-polish", order: 11, locale: NS },
        AIPolishButton
      )
    );
    scope.slots.inject(
      "shell.overlay",
      () => scope.slots.register(
        { name: "shell.overlay", id: "prompt-enhancer", order: 100, locale: NS },
        PromptSurfaceHost
      )
    );
    scope.slots.inject(
      "sidebar.footer.action",
      () => scope.slots.register(
        { name: "sidebar.footer.action", id: "prompt-enhancer", order: 100, locale: NS },
        SidebarPromptEntry
      )
    );
  });
  ctx.inject(["uiWorkspace"], (scope) => {
    setDirectoryCapability(scope.uiWorkspace ?? null);
    return () => setDirectoryCapability(null);
  });
  ctx.effect(() => {
    if (false) console.log("[prompt-enhancer] client loaded v0.1.0");
    return () => {
      if (false) console.log("[prompt-enhancer] client unloaded");
    };
  }, "prompt-enhancer: lifecycle");
}
    module.exports = { apply, inject };
    return module.exports;
  }
});

//# sourceMappingURL=client.js.map
