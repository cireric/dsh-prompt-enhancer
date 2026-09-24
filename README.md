<div align="center">

[🇨🇳 中文](./README.zh.md) | 🌐 **English**

</div>

# dsh-prompt-enhancer

A DSH (DeepSeek Harness) plugin focused on **prompts only**: manage and reuse prompts beside the chat input, AI-polish them, capture them, and keep improving them.

Derived from [`master1Sun/dsh-prompt-library`](https://github.com/master1Sun/dsh-prompt-library) v0.16.0 (MIT) — see "Origin and license" below.

## Scope

**Included:**

- Prompt library: CRUD (title + body + tags), search, sorting, tag grouping, usage-count statistics
- Two entries: a button beside the composer, and an entry at the sidebar foot (next to Settings); both open the manager panel
- Reuse: insert (append) / overwrite / insert-and-send; type `#` for a live-filtering overlay
- Template variables: `{{name}}` placeholders with a fill-in dialog that remembers the last values
- AI polish: body refinement (optionally preserving variables), one-click refine (title/tags/summary/body), usage summary
- Rollback: the pre-polish body is kept, so you can switch back and forth between "original" and "polished"
- Three capture paths: create/edit in the manager panel, "save as prompt" from selected text, save the current draft
- Tag management, recycle bin (soft delete + restore + permanent delete + empty)
- Import/export: JSON backup; import shows a preview and asks for confirmation
- Context suggestions: with a non-empty draft, keyword-match prompts against the current input plus the last 3 user messages (max 5)
- Settings page: AI model, panel size, entry visibility, `#` trigger toggle, suggestions toggle, selection-capture toggle, storage cap
- Skill export: export a prompt as an official DSH Skill (`$DSH_HOME/skills/<name>/SKILL.md`); once the prompt changes, a "skill is stale" badge appears with one-click re-export

**Explicitly out of scope:**

- Persona (SOUL) system and per-workspace/session scope binding
- Session-level skill injection (pushing prompts into the system prompt), DSH Skill reverse import, harness skill switches
- Live sync between prompts and exported skills (replaced by explicit one-way export + staleness badge)
- systemPrompt injection — this plugin registers **zero** systemPrompt sections
- Self-learning / auto-capture, version-history table, WebSocket push, plugin marketplace/recommendations, announcements, achievements, dashboards, auto-update, slash commands

## Status

Currently at **P1 (skeleton and build contract)**: the dual host/client build, typecheck, and artifact shape checks pass, and the plugin loads in `dsh web` — it contains **no product features yet**. Features ship as eight independently executable plans (P1–P8) under `docs/superpowers/plans/`.

## Install

This project is not published to npm yet. To install it locally into a DSH profile (use the launcher script when `dsh` is not on your PATH):

```sh
node "$DSH_HOME/profiles/node_modules/@deepseek-ai/dsh/lib/bin.js" plugin --profile web add /path/to/dsh-prompt-enhancer
```

A `link:` install means the profile resolves this project directory directly, so afterwards you only need `npm run build` and to **restart `dsh web`** (stop the current process and start it again) — no file copying. Confirm the profile layer with:

```sh
node "$DSH_HOME/profiles/node_modules/@deepseek-ai/dsh/lib/bin.js" --profile web --dump-config | grep -A2 'dsh-prompt-enhancer'
```

## Development

```sh
npm install --cache .npm-cache   # keep the cache inside the workspace (sandboxed writes)
npm run link-dsh-deps            # link the profile's @deepseek-ai/* type packages for tsc
npm run typecheck                # tsc --noEmit (includes i18n key-set checks)
npm run build                    # production build: lib/index.js + lib/client.js
npm run build:dev                # dev build: also prints load diagnostics
npm run smoke                    # artifact shape checks: really executes the client bundle
npm test                         # node --test (available from P2 on)
```

Stack: TypeScript (`noEmit`, typecheck only) + esbuild (two entries) + Node's built-in `node --test`; runtime uses `node:sqlite` (Node ≥ 22.19, verified on v24). The build contract lives in `docs/superpowers/specs/`.

## Layout

```
src/index.ts           host entry (Node ESM)
src/client/index.ts    client entry (browser, __ModuleLoader__ module format)
scripts/build.mjs      esbuild dual-entry build
scripts/smoke.mjs      artifact shape checks
scripts/link-dsh-deps.mjs  DSH type-package linker
docs/                  design spec and implementation plans
lib/                   build artifacts (tracked in git)
```

## Origin and license

This project is a **derivative** of [`master1Sun/dsh-prompt-library`](https://github.com/master1Sun/dsh-prompt-library) v0.16.0 (MIT):

- **Ported**: the SQLite storage layer (schema and semantics of its 4 tables), the AI module (LLM route resolution, prompt templates, output post-processing), shared UI components and template-variable logic, and the import/export format (kept compatible, so exports from the old plugin import directly)
- **Removed**: the persona system, session-level skill injection, DSH skill reverse import and live sync, the WebSocket layer, DOM-injection entries, and dead code
- **Added**: rollback (original ↔ polished), explicit triggering semantics for context suggestions, the staleness badge for skill exports, and official slots instead of DOM injection

The upstream MIT text and `Copyright (c) master1Sun` notice are preserved in `LICENSE`.
