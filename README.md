<div align="center">

[🇨🇳 中文](./README.zh.md) | 🌐 **English**

</div>

# dsh-prompt-enhancer

A DSH (DeepSeek Harness) plugin focused on **prompts only**: manage and reuse prompts beside the chat input, AI-polish them, capture them, and keep improving them.

Derived from [`master1Sun/dsh-prompt-library`](https://github.com/master1Sun/dsh-prompt-library) v0.16.0 (MIT) — see "Origin and license" below.

## Scope

**Included** (eleven delivered capabilities, in spec order):

1. **Prompt library**: CRUD (title + body + tags), search, sorting, tag grouping, usage-count statistics; **two entries** — a button beside the composer and an entry at the sidebar foot (next to Settings) — both open the manager panel
2. **Reuse**: insert (append) / overwrite / insert-and-send; type `#` for a live-filtering overlay
3. **Template variables**: `{{name}}` placeholders, with a fill-in dialog on insert that remembers the last values
4. **AI polish**: body refinement (optionally preserving variables), one-click refine (title/tags/summary/body), usage summary
5. **Rollback**: the pre-polish body is kept, so you can switch back and forth between "original" and "polished"
6. **Three capture paths**: create/edit in the manager panel, "save as prompt" from selected text, save the current draft
7. **Tag management** and a **recycle bin** (soft delete + restore + permanent delete + empty)
8. **Import/export**: JSON backup; import shows a preview and asks for confirmation
9. **Context suggestions**: with a non-empty draft, keyword-match prompts against the current input plus the last 3 user messages (max 5)
10. **Settings page**: AI model, panel size, entry visibility, `#` trigger toggle, suggestions toggle, selection-capture toggle, storage cap
11. **Skill export**: export a prompt as an official DSH Skill (`$DSH_HOME/skills/<name>/SKILL.md`); once the prompt changes, a "skill is stale" badge appears with one-click re-export

**Explicitly out of scope:**

- Persona (SOUL) system and per-workspace/project/session scope binding
- Session-level skill injection (pushing prompts into the system prompt), DSH Skill reverse import, harness skill switches and soft-control injection
- A live sync engine between prompts and exported skills (replaced by explicit one-way export + a staleness badge)
- Exporting to a project-level skill root (`<project>/.dsh/skills`)
- systemPrompt injection — this plugin registers **zero** systemPrompt sections
- Self-learning / auto-capture (no threshold rule; replaced by the three manual capture paths)
- A version-history table and arbitrary version rollback
- WebSocket push, plugin marketplace/recommendations, announcements, achievements, dashboards, desktop pets, QQ bots
- Auto-update / version checks, scheduled backups
- Slash commands

## Status

All eight milestones (M1–M8) are delivered:

| Milestone | Delivered |
| --- | --- |
| **M1 Skeleton and build contract** | dual host/client build, `tsc --noEmit`, artifact-shape checks; the plugin loads in `dsh web` |
| **M2 Data layer** | the four SQLite tables and the full storage function set, covered by `tests/store.test.mjs` |
| **M3 API surface** | the HTTP routes plus the ported AI module |
| **M4 Reuse loop** | library button, `#` trigger, insert / overwrite / insert-and-send, template variables |
| **M5 AI + rollback** | AI polish button, one-click refine, original ↔ polished switching |
| **M6 Capture + management** | manager panel, the three capture paths, tag management, recycle bin, import/export |
| **M7 Skill export (D8)** | `skills.ts` export, `generateSkillDescriptor`, `SkillExportModal`, the staleness badge |
| **M8 Wrap-up** | context suggestions, settings page, i18n close-out, documentation, licensing |

The work ran as eight plans (P1–P8) under `docs/superpowers/plans/`; the design contract is `docs/superpowers/specs/2026-09-24-dsh-prompt-enhancer-design.md`.

## Known limitations

These are deliberate trade-offs recorded during development, not open bugs — please don't "fix" them without a design decision (spec §13.10-五, §13.11-五):

1. **While the `#` overlay is on screen, a non-pointer activation cannot open the library panel** (spec §13.10-五-1). The gate branches on the activation channel: an activation with `event.detail === 0` — keyboard Enter/Space, `element.click()`, some assistive technology — is only let through when the overlay is absent, while a real pointer click (`detail > 0`) always is. A non-pointer activation does not latch the panel open, so once the overlay disappears you have to activate once more. The pointer path is unaffected, down to a down→up interval of 0 ms.
2. **Per-keystroke input in the variable fill dialog is lost when the dialog unmounts** (spec §13.10-五-2). `values` is component-local state of `TemplateVariablesDialog`; closing the panel unmounts it. Only the selected prompt and the pending action survive.
3. **Component wiring has no automated assertions** (spec §13.10-五-3). This repository has no react-dom/jsdom (hard constraint 5 forbids installing them), so invariants such as "the render gate really uses the derived value" are covered only by live acceptance. Mutation evidence: degrading `panelOpen` to `open` leaves the whole test suite green.
4. **Type `#`, close the library panel, and the `#` overlay does not return by itself** (P8 ruling TBD-P8-6). Programmatic focus + Range restore does not bring it back on screen; only real typing does. Recorded as a trade-off, not a defect.
5. **The AI result panel geometrically covers the composer** (P8 ruling TBD-P8-6). Its anchor and the matching setting belong to the overlay-placement / panel-size design space; explicitly recorded and **left unchanged** in this milestone.

## systemPrompt footprint

**This plugin registers zero systemPrompt sections** (acceptance 14). No prompt text is ever injected into the system prompt: every write is an explicit, user-triggered insertion into the composer. A section count of 0 is a product commitment, not an omission (spec §2.2, hard constraint 2).

Because upstream registered a `deployment:persona` section and this plugin does not, removing that upstream section means the host's built-in global `deployment:persona` slot **takes effect again**. That is **expected behavior**, not a regression — recorded in spec §0.1 (last row) and §12.

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
npm test                         # node --test
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
