<div align="center">

[🇨🇳 中文](./README.zh.md) | 🌐 **English**

</div>

# dsh-prompt-enhancer

A DSH (DeepSeek Harness) Web plugin for managing, improving, and reusing prompts without leaving the chat input.

## Features

- **Prompt library:** open the manager from the composer picker or sidebar. Create and edit prompts, search, sort, group by tag, and track usage. Save selected text or the current draft, restore deleted entries from the recycle bin, and export or preview JSON backups.
- **Reuse and templates:** type `#` to find prompts, or use the composer picker to append, overwrite, or insert and send. Fill `{{name}}` variables before insertion. Templates can define descriptions and defaults; the library can remember values for each template.
- **Context suggestions:** show up to five library prompts that match keywords in the current draft. The last three user messages help rank matches; they don't make a prompt eligible on their own. This runs in the browser without an AI request.
- **AI optimization:** use Light polish for an editable revision, or Enhance as template for an editable template with optional suggestions. Try variable values without changing the template, or save it to the library.
- **Check prompt:** review findings for the current composer draft, select suggestions, and generate an editable revision. Applying it to the composer does not send a message or save a library entry.
- **Draft from an idea:** start even with an empty composer. Add execution context or reference material if needed, then answer or skip clarification if asked. Edit the resulting prompt, review its assumptions and information still needed, or enhance it as a template. From a draft check, you can bring a suggestion back to the feedback field and decide whether to request another revision.
- **Library rollback:** when a saved entry has an AI source version, switch between the original and the optimized body from its library details. This is not composer undo.
- **Skill export:** export to `$DSH_HOME/skills/<name>/SKILL.md`. You can preview the file and ask AI to suggest a name and description. An outdated export is marked for re-export; it is not updated automatically or imported back into the library.
- **Settings:** choose the AI model, manager size, entry visibility, composer button labels, `#` suggestions, context suggestions, selection capture, and the library limit.

The plugin registers **zero `systemPrompt` sections**. It does not inject prompts, roles, or Skills into sessions.

## Install

The package is not published to npm. Install it from a local checkout into an existing DSH Web profile. The checkout includes the runtime bundles, so you don't need to build first. Run DSH with Node.js 22.19 or later. `DSH_HOME` defaults to `~/.dsh`.

```sh
node "${DSH_HOME:-$HOME/.dsh}/profiles/node_modules/@deepseek-ai/dsh/lib/bin.js" plugin --profile web add /path/to/dsh-prompt-enhancer
```

After a `link:` install, the profile reads the checkout directly. When you change the source, run `npm run build` and restart `dsh web`; no file copying is needed. To confirm the profile entry:

```sh
node "${DSH_HOME:-$HOME/.dsh}/profiles/node_modules/@deepseek-ai/dsh/lib/bin.js" --profile web --dump-config | grep -A2 'dsh-prompt-enhancer'
```

## Usage notes

- If the `#` overlay is open, dismiss it before opening the prompt picker with the keyboard. Closing the picker does not automatically reopen the `#` overlay.
- Closing or unmounting the variable dialog discards in-progress values. A library template's previously remembered values are separate.
- JSON backups contain active prompts and tags, not the recycle bin, remembered variable values, or exported Skill files. Confirming an import replaces local entries with matching IDs, including entries in the recycle bin.
- Generative AI actions use DSH's configured model providers. The optional source search in **Draft from an idea** runs only when requested and sends the search keywords to DSH's search service; returned links are leads, not verified facts. If a structured AI request stalls or produces no answer, see [AI model troubleshooting (Chinese)](docs/troubleshooting-ai.md).

## Development

Use Node 24 to match CI. The full local verification uses DSH packages from an initialized profile; `link-dsh-deps` links them into this checkout's `node_modules`.

```sh
npm install --cache .npm-cache
npm run link-dsh-deps
npm run verify
```

`npm run verify` runs typecheck, all Node tests, build, and smoke. Source changes and the rebuilt `lib/` bundles belong in the same commit.

GitHub Actions runs a DSH-free test subset and checks that the tracked bundles match the rebuild. This is not full local verification or a live DSH Web test. To reproduce CI in a clean checkout:

```sh
npm ci --cache .npm-cache
npm run verify:ci
```

`npm ci` replaces `node_modules`, so use a separate checkout if your development checkout has linked DSH packages. See [Architecture](docs/architecture.md) for host services, slots, storage, and design decisions. See [AGENTS.md](AGENTS.md) for repository rules and acceptance requirements.

## Origin and license

This project is derived from [`master1Sun/dsh-prompt-library`](https://github.com/master1Sun/dsh-prompt-library) v0.16.0 (MIT). The upstream MIT text and `Copyright (c) master1Sun` notice are preserved in [`LICENSE`](LICENSE).
