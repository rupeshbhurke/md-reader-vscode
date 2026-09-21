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
  - `open()` creates a `WebviewPanel`, builds its HTML shell (`buildShell`, inlined string containing the settings drawer/TOC overlay/progress bar markup), sends initial rendered content, and wires the panel's `onDidReceiveMessage` handler (`scroll` messages for editor↔reader sync, `updateSetting` messages that mutate config via `ConfigManager`).
  - Two-way scroll sync: reader→editor via `syncEditorScroll` (with a per-URI `ignoreEditorScrollUntil` debounce map to prevent echo loops), editor→reader via `setupScrollSync` listening to `onDidChangeTextEditorVisibleRanges`.
  - `activeUri` tracks the focused panel so toolbar commands (toggle TOC/settings, refresh) target the right one.
  - Content security policy is nonce-based; webview only loads `reader.css`/`reader.js` from `src/webview/` plus the source document's directory as `localResourceRoots`.
- **`src/configManager.ts`** — thin wrapper over `vscode.workspace.getConfiguration('mdReader')`. All settings are read fresh (no caching) and always written with `ConfigurationTarget.Global`. This is the single source of truth for the `ReaderConfig` shape and the `Theme`/`ReadingWidth` union types.
- **`src/markdownRenderer.ts`** — wraps `marked` with a custom renderer: code blocks get highlight.js syntax highlighting + a copy button + language label, images become lazy-loaded `<figure>`s, tables get a scroll wrapper, blockquotes get a class. Also intercepts headings to build a TOC array (`{level, text, id}`, levels 1-3 only) alongside the rendered HTML — both are sent to the webview together in one `update` message.
- **`src/webview/reader.js` + `reader.css`** — the panel-side runtime (plain JS/CSS, no framework). Handles applying config (theme/font/width/etc.) to the DOM, rendering the settings drawer, TOC overlay interactions, scroll-position reporting, and reading-progress bar.

### Adding a new setting

Touches four places in lockstep: `package.json` (`contributes.configuration.properties`), `configManager.ts` (`ReaderConfig` interface + getter + setter), `panelManager.ts` (`updateSetting` switch case + settings-drawer HTML in `buildShell`), and `reader.js` (apply the setting to the DOM + wire up the control).

### Extension ↔ webview message protocol

Extension → webview: `{type: 'update', html, toc, config}`, `{type: 'config', config}` (live setting broadcast), `{type: 'scrollTo', percentage}`, `{type: 'toggleTOC'}`, `{type: 'toggleSettings'}`.
Webview → extension: `{type: 'scroll', percentage}`, `{type: 'updateSetting', key, value}`.
