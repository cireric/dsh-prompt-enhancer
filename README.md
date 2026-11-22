<div align="center">

[🇨🇳 中文](./README.zh.md) | 🌐 **English**

</div>

# dsh-prompt-enhancer

A DSH (DeepSeek Harness) Web plugin for managing, improving, and reusing prompts without leaving the chat input.

## Features

- **Prompt library:** create and edit prompts, search, sort, group by tag, and track usage. Open the manager from the composer or sidebar. Save selected text or the current draft as a prompt. Use the recycle bin to restore deleted entries, and preview JSON backups before importing.
- **Reuse and templates:** type `#` to find prompts, or use the composer picker to append, overwrite, or insert and send. Fill `{{name}}` variables before insertion. Templates can define descriptions and defaults; the library can remember values for each template.
- **Context suggestions:** while the draft is non-empty, show up to five prompts matched against the current draft and the last three user messages.
- **AI optimization:** use Light polish to edit a draft, or Enhance as template to get an editable template with optional suggestions. Try variable values without changing the template, or save the template to the library.
- **Check prompt:** review findings, select suggestions, and generate an editable revision. Applying it to the composer does not send a message or save a library entry.
- **Draft from an idea:** start even with an empty composer. Describe the intended execution environment, answer or skip clarification, and review the resulting prompt and its assumptions. A draft check can send suggestions back to the feedback field for another revision. You can also enhance the draft as a template.
- **Library rollback:** when a saved entry has an AI source version, switch between the original and the optimized body from its library details. This is not composer undo.
- **Skill export:** export to `$DSH_HOME/skills/<name>/SKILL.md`. An outdated export is marked for re-export. Export is one-way; it does not import Skills back into the library or keep them in sync automatically.
- **Settings:** choose the AI model, manager size, entry visibility, composer button labels, `#` suggestions, context suggestions, selection capture, and the library limit.

The plugin registers **zero `systemPrompt` sections**. It does not inject prompts, roles, or Skills into sessions.

## Install

The package is not published to npm. Use a local checkout and an existing DSH Web profile. The plugin runtime requires Node.js 22.19 or later. Set `DSH_HOME` to your DSH data directory, or use the default `~/.dsh`.

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
- If a structured AI request stalls or produces no answer, see [AI model troubleshooting (Chinese)](docs/troubleshooting-ai.md).

## Development

Use Node 24 for development and CI. Local typechecking needs the DSH packages from an initialized profile.

```sh
npm install --cache .npm-cache
npm run link-dsh-deps
npm run verify
```

`npm run verify` runs typecheck, all Node tests, build, and smoke. Source changes and the rebuilt `lib/` bundles belong in the same commit.

GitHub Actions runs a DSH-free subset and checks that the tracked bundles match the rebuild. To reproduce it in a clean checkout:

```sh
npm ci --cache .npm-cache
npm run verify:ci
```

`npm ci` replaces `node_modules`, so use a separate checkout if your development checkout has linked DSH packages. See [Architecture](docs/architecture.md) for host services, slots, storage, and design decisions. See [AGENTS.md](AGENTS.md) for repository rules and acceptance requirements.

## Origin and license

This project is derived from [`master1Sun/dsh-prompt-library`](https://github.com/master1Sun/dsh-prompt-library) v0.16.0 (MIT). The upstream MIT text and `Copyright (c) master1Sun` notice are preserved in [`LICENSE`](LICENSE).
