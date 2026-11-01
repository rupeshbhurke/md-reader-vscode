# MD Reader roadmap

Last updated: 2026-11-02. This is a working plan, not a promise: scope and order can change. Version numbers follow [semantic versioning](https://semver.org/) (patch = fixes, minor = features).

## Status

| | |
|---|---|
| Latest release | `v0.2.1` |
| In flight | `feat/custom-themes` — custom themes, export/import, 20 starter themes, version `0.3.0`. Pushed, not merged, not yet tested in a real editor |
| Known defect | `mdReader.codeTheme` does nothing: no highlight.js stylesheet is loaded, so code blocks have no syntax colours. Fix is scheduled in Phase 2 |
| Not in place | tests, CI on pull requests, Open VSX publishing, verified Marketplace publisher |
| Unresolved | F5 debugging crashed the extension host in Windsurf. It looked like a host problem, not this repo's code |

## Decisions (2026-11-02)

1. **Ship 0.3.0 now, change the theme format in 0.3.1.** Theme files are read tolerantly (unknown fields ignored, missing fields fall back), so 0.3.0 exports keep loading in 0.3.1.
2. **Build the engineering foundation** (tests, CI, Open VSX) before the larger theme-system rework.
3. **Open-without-an-editor comes before theme system v2.**

---

## Phase 1 — Ship 0.3.0 as it stands

No new code.

| Step | Owner |
|---|---|
| 1.1 Set the 0.3.0 CHANGELOG date to 2026-11-02 | Claude |
| 1.2 Test in the editor: theme editor, export, import, Add starter themes | Maintainer |
| 1.3 Test the upgrade claim: install `0.2.1`, create a theme, install the `0.3.0` `.vsix` over it, confirm the theme survives | Maintainer |
| 1.4 Open the PR and merge | Maintainer |
| 1.5 Tag `v0.3.0` and push; check the Actions run and the Release | Claude or Maintainer |

**Ships knowingly with:** no syntax colours in code blocks, and the light starter themes keeping dark code blocks as a workaround. This is existing behaviour, not a regression.

## Phase 2 — 0.3.1: syntax highlighting (defect fix + format change)

- 2.1 Ship the five highlight.js stylesheets through `scripts/copy-vendor-assets.js` and wire up `mdReader.codeTheme`.
- 2.2 Add about ten optional syntax tokens to the theme format (keyword, string, comment, number, title, type, variable, attr, meta, built-in). A theme that sets them wins; otherwise the stylesheet applies.
- 2.3 Give all 20 starter themes matching syntax colours, and drop the dark-code-block workaround from the light ones.
- 2.4 Extend the checks to cover the new tokens, including contrast of code text on code background.

## Phase 3 — Foundation (no user-visible change; rides along with any version)

- 3.1 Real `npm test`: validation, hostile input, export/import round-trip, contrast thresholds, token list matching the `package.json` schema. This also repairs `npm test`, which is currently a failing stub.
- 3.2 CI on every pull request: build, type-check, test.
- 3.3 Publish to Open VSX as well as the Marketplace (Windsurf and VSCodium install from Open VSX).
- 3.4 Draft releases that publish only once all builds pass.
- 3.5 **Maintainer, and blocking:** confirm the `rupeshbhurke` publisher ID on the Marketplace and add the `VSCE_PAT` repository secret. Until then, releases are GitHub downloads only.

*Ordering note:* doing Phase 3 before Phase 2 would have the format change arrive already guarded by tests. The current order fixes the visible defect sooner.

## Phase 4 — 0.4.0: open without an editor

- 4.1 Accept the URI from an Explorer right-click and load the document with `openTextDocument(uri)`, without opening a tab.
- 4.2 Stop disposing the panel when the source editor closes (the `onDidCloseTextDocument` handler).
- 4.3 Add a file watcher per panel and re-read the document on change, so external edits still refresh with no editor open. A hidden document can be released by VS Code, so refresh re-opens it rather than holding a stale handle.
- Update the architecture notes in `CLAUDE.md`, which currently describe close-disposes-panel.

## Phase 5 — 0.5.0: theme system v2

- 5.1 Typography as a theme axis: heading sizes and spacing, paragraph spacing, reading width.
- 5.2 Composable themes: a theme references a colour scheme and a layout by name.
- 5.3 Grouped tokens (`text.primary` rather than a flat list), still reading the old format.
- 5.4 A `version` field on themes, so shipped starters can be improved without overwriting user copies.
- 5.5 Categories in the dropdown once there are more than about 30 themes.

5.2 and 5.3 change the file format and ship together, with the 0.3.x format still readable.

## Phase 6 — 0.6.0 and later

- Graphviz diagrams, lazy-loaded like Mermaid.
- Large-document performance: measure first, optimise only if genuinely slow.
- Per-theme override, so a starter can be tweaked without copying it.

---

## Deferred, with reasons

| Item | Why |
|---|---|
| Two-pane custom editor (text + preview in one tab) | Needs an embedded editor library (CodeMirror) and loses other extensions' text-editor features. A product decision, not just a feature |
| DOCX and EPUB export | A project in its own right |
| PlantUML | Needs Java or a server |
| draw.io, Vega, ECharts | Low demand for a reading-focused tool |
| Bilingual theme names; table-style as a separate theme axis | Over-engineering at this size |
| Windsurf F5 crash | Revisit only if it returns after a full restart |

## Reference: comparison notes

A comparison with other Markdown viewers (2026-11-01) shaped Phases 2 and 5.

- **docu.md `markdown-viewer`** composes themes from colour schemes, layouts, code themes and table styles (34 presets), and its themes carry syntax colours and typography. Licensed **GPL-3.0**: borrow ideas only, never code or theme files (MD Reader is MIT).
- **Obsidian** and **Typora** use CSS-file themes. **simov/markdown-viewer** accepts uploaded CSS (8 KB cap).
- MD Reader's structured, validated JSON themes avoid arbitrary-CSS injection from shared theme files, and none of the four projects compared documented an in-app colour editor with export/import.
