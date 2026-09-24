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
var DEFAULT_MAX_PROMPT_COUNT = 300;
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
var PREFIX = "/api/prompt-enhancer";
var AI_TIMEOUT_MS = 12e4;
var ApiError = class extends Error {
  status;
  constructor(message, status) {
    super(message);
    this.status = status;
  }
};
async function call(method, path, body, timeoutMs) {
  const res = await fetch(PREFIX + path, {
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
  updatePrompt: (id, patch) => call("PUT", "/prompts/" + encodeURIComponent(id), patch),
  rollbackPrompt: (id) => call("POST", "/prompts/" + encodeURIComponent(id) + "/rollback"),
  listAiProviders: () => call("GET", "/ai/providers"),
  polishPrompt: (body, opts = {}) => call(
    "POST",
    "/ai/polish",
    { body, keepVariables: opts.keepVariables !== false, withSummary: false },
    AI_TIMEOUT_MS
  ),
  refinePrompt: (body) => call("POST", "/ai/refine", { body }, AI_TIMEOUT_MS)
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
  const [errorKey, setErrorKey] = React.useState(null);
  const [copied, setCopied] = React.useState(false);
  const rootRef = React.useRef(null);
  const providersRef = React.useRef(null);
  const busyRef = React.useRef(false);
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
  const settled = status === "done" || status === "error";
  React.useEffect(() => {
    if (!settled) return;
    const onPointerDown = (ev) => {
      const root = rootRef.current;
      if (root !== null && ev.target instanceof Node && root.contains(ev.target)) return;
      setStatus("idle");
      setErrorKey(null);
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
  const close = () => {
    setStatus("idle");
    setOriginal("");
    setPolished("");
    setShowOriginal(false);
    setErrorKey(null);
    setCopied(false);
  };
  const run = (snapshot) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setErrorKey(null);
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
            setErrorKey(aiErrorKey(err));
            setStatus("error");
            return;
          }
          providersRef.current = providers;
        }
        if (providers.length === 0) {
          setErrorKey("ai.unavailable");
          setStatus("error");
          return;
        }
        try {
          const result = await api.polishPrompt(snapshot, { keepVariables: keepVariablesFor(snapshot) });
          setPolished(result.polished);
          setStatus("done");
        } catch (err) {
          console.warn("[prompt-enhancer] AI \u4F18\u5316\u5931\u8D25", err);
          setErrorKey(aiErrorKey(err));
          setStatus("error");
        }
      } finally {
        busyRef.current = false;
      }
    })();
  };
  const polishing = status === "polishing";
  const empty = draft.trim() === "";
  const hint = polishing ? t("ai.polishing") : empty ? t("ai.empty") : t("ai.tip");
  const copy = () => {
    const text = polished;
    void (async () => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
      } catch (err) {
        console.warn("[prompt-enhancer] \u590D\u5236\u5931\u8D25", err);
      }
    })();
  };
  const applyResult = () => {
    inputActions.setDraft(polished);
    close();
  };
  if (settings === null || settings.showAIPolishButton === false) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { ref: rootRef, style: WRAP, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "button",
      {
        type: "button",
        style: { ...BUTTON, cursor: empty || polishing ? "default" : "pointer", opacity: empty || polishing ? 0.6 : 1 },
        title: hint,
        "aria-label": t("ai.button"),
        "aria-busy": polishing,
        disabled: empty || polishing,
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
    status !== "idle" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: ANCHOR, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { role: "dialog", "aria-label": status === "done" ? t("ai.result") : t("ai.button"), style: PANEL, children: [
      polishing && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { role: "status", "aria-live": "polite", style: MUTED, children: t("ai.polishing") }),
      status === "error" && errorKey !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { role: "status", "aria-live": "polite", style: MUTED, children: t(errorKey) }),
      status === "done" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: HEADER, children: t("ai.result") }),
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
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: PANEL_BUTTON, onClick: copy, children: copied ? t("ai.copied") : t("ai.copy") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: PANEL_BUTTON, onClick: close, children: t("ai.close") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: { ...PANEL_BUTTON, borderColor: TOKEN.accent, color: TOKEN.accent }, onClick: applyResult, children: t("ai.apply") })
        ] })
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
  "ai.tip": "\u7528 AI \u4F18\u5316\u5F53\u524D\u8F93\u5165\u6846\u5185\u5BB9",
  "ai.empty": "\u8F93\u5165\u6846\u4E3A\u7A7A\uFF0C\u5148\u5199\u70B9\u5185\u5BB9",
  "ai.unavailable": "AI \u4E0D\u53EF\u7528\uFF1A\u672A\u914D\u7F6E\u53EF\u7528\u6A21\u578B",
  "ai.polishing": "\u6B63\u5728\u8C03\u7528 AI\u2026\uFF08\u6700\u957F\u7EA6 2 \u5206\u949F\uFF09",
  "ai.result": "AI \u4F18\u5316\u7ED3\u679C",
  "ai.original": "\u539F\u6587",
  "ai.polished": "\u4F18\u5316\u7A3F",
  "ai.apply": "\u5E94\u7528\u5230\u8F93\u5165\u6846",
  "ai.copy": "\u590D\u5236",
  "ai.copied": "\u5DF2\u590D\u5236",
  "ai.close": "\u5173\u95ED",
  "ai.fail": "AI \u8C03\u7528\u5931\u8D25",
  "ai.timeout": "AI \u8C03\u7528\u8D85\u65F6\uFF08>120s\uFF09\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5"
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
  "ai.tip": "Polish the composer draft with AI",
  "ai.empty": "Composer is empty \u2014 write something first",
  "ai.unavailable": "AI unavailable: no usable model configured",
  "ai.polishing": "Calling AI\u2026 (up to ~2 minutes)",
  "ai.result": "AI polish result",
  "ai.original": "Original",
  "ai.polished": "Polished",
  "ai.apply": "Apply to composer",
  "ai.copy": "Copy",
  "ai.copied": "Copied",
  "ai.close": "Close",
  "ai.fail": "AI call failed",
  "ai.timeout": "AI call timed out (>120s), please retry later"
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
    loadError !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { role: "alert", style: ERROR, title: loadError, children: t("error.load") }),
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
var ERROR = { color: TOKEN.fg, fontSize: 11 };
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
        setNotice(t("error.noPrompt"));
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
    notice !== null && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { role: "status", "aria-live": "polite", style: NOTICE, children: notice }),
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
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: HEADER3, children: t("list.title") }),
      loadError !== null && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { role: "alert", style: ERROR2, children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: t("error.load") }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: ERROR_DETAIL, title: loadError, children: loadError })
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
var HEADER3 = { color: TOKEN.muted, fontSize: 11, fontWeight: 600 };
var MUTED3 = { color: TOKEN.muted, fontSize: 11 };
var ERROR2 = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  color: TOKEN.fg,
  fontSize: 11
};
var ERROR_DETAIL = { color: TOKEN.muted, overflowWrap: "anywhere" };
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
