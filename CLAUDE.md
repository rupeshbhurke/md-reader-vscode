# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo layout

Three separate apps, each with own `package.json`, share the same rendering approach (marked + highlight.js) but no shared code:

- **Root** (`src/`) — the VS Code extension (`md-reader`), the primary project.
- `android-app/` — Capacitor + Vite + TypeScript port for Android.
- `windows-app/` — Electron + Vite port for Windows desktop.

Work in root `src/` unless task explicitly targets android-app or windows-app.

## Commands (VS Code extension, root)

- `npm run build` — bundle extension via esbuild → `out/extension.js` (what `vscode:prepublish` runs).
- `npm run watch` — esbuild in watch mode.
- `npm run compile` — `tsc -p ./` type-check (also runs webview types etc, matches `pretest`).
- `npm test` — runs `out/test/runTest.js` (compile first).
- Debug: F5 in VS Code (uses `.vscode/launch.json`) launches Extension Development Host.
- Package: `vsce package` (devDependency `@vscode/vsce`) produces the `.vsix`.

No lint script configured.

### android-app / windows-app

- `cd android-app && npm run dev` / `npm run build` (tsc + vite build); `npx cap sync` / `npx cap open android` for native step.
- `cd windows-app && npm run dev` / `npm run build` (tsc + vite build + electron-builder → nsis installer).

## Architecture (VS Code extension)

Flow: `extension.ts` registers commands/events → delegates to `PanelManager` → webview panel runs `src/webview/reader.js` + `reader.css`, communicating with the extension host via `postMessage`.

- **`src/extension.ts`** — activation entry point. Registers all `mdReader.*` commands, wires `onDidSaveTextDocument` (auto-refresh), `onDidChangeConfiguration` (live config broadcast), and `onDidCloseTextDocument` (dispose panel when source file closes).
- **`src/panelManager.ts`** — owns all webview panels, keyed by document URI string in a `Map`. Key responsibilities:
  - `open()` creates a `WebviewPanel`, builds its HTML shell (`buildShell`, inlined string containing the settings drawer/TOC overlay/find bar/shortcuts-help overlay/progress bar markup), sends initial rendered content, and wires the panel's `onDidReceiveMessage` handler (`scroll` messages for editor↔reader sync, `updateSetting` messages that mutate config via `ConfigManager`, gated by `SETTABLE_KEYS`).
  - Two-way scroll sync: reader→editor via `syncEditorScroll` (with a per-URI `ignoreEditorScrollUntil` debounce map to prevent echo loops), editor→reader via `setupScrollSync` listening to `onDidChangeTextEditorVisibleRanges`.
  - `activeUri` tracks the focused panel so toolbar commands (toggle TOC/settings/find, refresh) target the right one.
  - Content security policy is nonce-based; webview only loads `reader.css`/`reader.js` from `src/webview/` plus the source document's directory as `localResourceRoots`.
- **`src/configManager.ts`** — thin wrapper over `vscode.workspace.getConfiguration('mdReader')`. All settings are read fresh (no caching) and always written with `ConfigurationTarget.Global`. This is the single source of truth for the `ReaderConfig` shape and the `Theme`/`ReadingWidth` union types. A generic `set<K extends keyof ReaderConfig>(key, value)` replaces per-field setters; `get()` loops over a `DEFAULTS: ReaderConfig` object instead of one `.get()` call per field; `SETTABLE_KEYS` whitelists which fields the webview may write back via `updateSetting`.
- **`src/markdownRenderer.ts`** — wraps `marked` with a custom renderer: code blocks get highlight.js syntax highlighting + a copy button + language label, images become lazy-loaded `<figure>`s, tables get a scroll wrapper, blockquotes get a class, headings get GitHub-style anchor ids (via a module-scoped `github-slugger` instance) and feed a TOC array (`{level, text, id}`, levels 1-3 only) alongside the rendered HTML — both sent to the webview together in one `update` message. Uses a single module-level `Marked` instance configured once at import time — never re-configure `marked`/call `.use()` inside `renderMarkdown()`, since extensions stack additively and never un-register.
- **`src/webview/reader.js` + `reader.css`** — the panel-side runtime (plain JS/CSS, no framework). Handles applying config (theme/font/width/etc.) to the DOM, rendering the settings drawer, TOC overlay interactions, scroll-position reporting, reading-progress bar, find-in-document (CSS Custom Highlight API, no DOM mutation — see `openFindBar`/`runFind` in `reader.js`), the keyboard-shortcuts help overlay, and the reading-mode keyboard map (`j`/`k`/`space`/`g`/`G`/`n`/`p`/`t`/`s`/`?`, all skipped while focus is in an `input`/`select`/`textarea`).

### Adding a new setting

Touches four places in lockstep: `package.json` (`contributes.configuration.properties`), `configManager.ts` (`ReaderConfig` interface + one `DEFAULTS` entry, plus a `SETTABLE_KEYS` entry if the webview can write it), `panelManager.ts` (settings-drawer HTML in `buildShell` — the `updateSetting` dispatch itself is generic, no switch case needed), and `reader.js` (apply the setting to the DOM + wire up the control).

### Extension ↔ webview message protocol

Extension → webview: `{type: 'update', html, toc, config}`, `{type: 'config', config}` (live setting broadcast), `{type: 'scrollTo', percentage}`, `{type: 'toggleTOC'}`, `{type: 'toggleSettings'}`, `{type: 'find'}` (focuses/opens the find bar — triggered by the `mdReader.find` command, Ctrl/Cmd+F).
Webview → extension: `{type: 'scroll', percentage}`, `{type: 'updateSetting', key, value}` (key must be in `SETTABLE_KEYS`).
