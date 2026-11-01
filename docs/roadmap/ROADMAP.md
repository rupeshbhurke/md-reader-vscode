# MD Reader roadmap

Last updated: 2026-11-02 (Phases 1–4 released; Phase 5 implemented, awaiting a real-editor test and release). This is a working plan, not a promise: scope and order can change. Version numbers follow [semantic versioning](https://semver.org/) (patch = fixes, minor = features).

## Status

| | |
|---|---|
| Latest release | `v0.4.0` (Phase 4; also carries Phase 3 and the `showTOC` removal) |
| In flight | `feat/theme-system-v2` — Phase 5, version `0.5.0`: layouts, grouped theme files, version/category, dropdown categories. Implemented, 77 tests, checked in a browser harness; not yet tried in a real editor |
| Known issues | none open. The dead `mdReader.showTOC` setting found by the Phase 3 tests has been removed (the TOC always works) |
| Not in place | verified Marketplace publisher and the `VSCE_PAT` / `OVSX_PAT` secrets (maintainer — see `docs/RELEASING.md`) |
| Unresolved | F5 debugging crashed the extension host in Windsurf. It looked like a host problem, not this repo's code |

## Decisions (2026-11-02)

1. **Ship 0.3.0 now, change the theme format in 0.3.1.** Theme files are read tolerantly (unknown fields ignored, missing fields fall back), so 0.3.0 exports keep loading in 0.3.1.
2. **Build the engineering foundation** (tests, CI, Open VSX) before the larger theme-system rework.
3. **Open-without-an-editor comes before theme system v2.**

---

## Phase 1 — Ship 0.3.0 as it stands — DONE (v0.3.0, 2026-11-01)

No new code.

| Step | Owner |
|---|---|
| 1.1 Set the 0.3.0 CHANGELOG date to 2026-11-02 | Claude |
| 1.2 Test in the editor: theme editor, export, import, Add starter themes | Maintainer |
| 1.3 Test the upgrade claim: install `0.2.1`, create a theme, install the `0.3.0` `.vsix` over it, confirm the theme survives | Maintainer |
| 1.4 Open the PR and merge | Maintainer |
| 1.5 Tag `v0.3.0` and push; check the Actions run and the Release | Claude or Maintainer |

**Ships knowingly with:** no syntax colours in code blocks, and the light starter themes keeping dark code blocks as a workaround. This is existing behaviour, not a regression.

## Phase 2 — 0.3.1: syntax highlighting (defect fix + format change) — DONE (v0.3.1)

- 2.1 ~~Ship the five highlight.js stylesheets~~ Done differently: syntax colours are CSS variables in `reader.css` (five palettes selected by `mdReader.codeTheme`), because a shipped stylesheet cannot be overridden by theme colours without `!important`. No vendor stylesheet is needed.
- 2.2 Done: add ten optional syntax tokens to the theme format (keyword, string, comment, number, title, type, variable, attr, meta, built-in). A theme that sets them wins; otherwise the stylesheet applies.
- 2.3 Done: give all 20 starter themes matching syntax colours, and drop the dark-code-block workaround from the light ones.
- 2.4 Done (as scripts; becomes real tests in Phase 3): extend the checks to cover the new tokens, including contrast of code text on code background.

## Phase 3 — Foundation (no user-visible change; rides along with any version) — DONE, merged; 3.5 pending (maintainer)

- 3.1 Done: real `npm test`: validation, hostile input, export/import round-trip, contrast thresholds, token list matching the `package.json` schema. This also repaired `npm test`, which was a failing stub. It immediately found a dead setting (`showTOC`) and missing highlight.js styles for HTML tags, CSS selectors and Markdown inline code.
- 3.2 Done: CI on every pull request (Linux + Windows): type-check, test, build, package; the `.vsix` is attached as an artifact.
- 3.3 Done (activates once 3.5 secrets exist): publish to Open VSX as well as the Marketplace, for editors that use Open VSX instead of the Microsoft Marketplace.
- 3.4 Done: draft releases that publish only once verification and every store publish succeed; hyphenated tags are GitHub pre-releases only. See `docs/RELEASING.md`.
- 3.5 **Maintainer, and blocking:** confirm the `rupeshbhurke` publisher ID on the Marketplace and add the `VSCE_PAT` repository secret. Also create the Open VSX namespace and add `OVSX_PAT`. Until then, releases are GitHub downloads only. Steps are in `docs/RELEASING.md`.

*Ordering note:* doing Phase 3 before Phase 2 would have the format change arrive already guarded by tests. The current order fixes the visible defect sooner.

## Phase 4 — 0.4.0: open without an editor — DONE (v0.4.0)

- 4.1 Done: accept the URI from an Explorer right-click and load the document with `openTextDocument(uri)`, without opening a tab.
- 4.2 Done: stop disposing the panel when the source editor closes (the `onDidCloseTextDocument` handler).
- 4.3 Done: a file watcher per panel; the text is read from disk (or the dirty editor buffer), not from a held `TextDocument`, so there is no stale handle. Automatic triggers are debounced.
- Also done: Command Palette falls back to a file picker; multi-select in the Explorer opens several; task toggling saves when no editor has the file open; UTF-8 BOM and UTF-16 handled.
- Done: `CLAUDE.md` architecture notes updated, and a test guards that closing an editor does not close the reader.

## Phase 5 — 0.5.0: theme system v2 — IMPLEMENTED, awaiting release

- 5.1 Done as **layouts**, a second axis: heading font/weight/scale/spacing/rules, paragraph spacing and indent (6 ship). *Interpretation:* body font, size, line height and reading width are NOT part of a layout — they are the user's accessibility preferences and a layout must not override them.
- 5.2 Done as **independent axes**: any colour theme with any layout (20 themes × 6 layouts from 26 small files). *Interpretation:* composition is the user's choice of two settings, not a theme file that references other files.
- 5.3 Done: theme files use grouped colours (`ink.primary`, `code.blockBackground`, …), file format v2. Flat colours are still read everywhere and remain the in-memory/settings shape, so saved themes and older versions are unaffected.
- 5.4 Done (groundwork): `version` on themes and layouts, kept through export/import. *Not yet used for anything automatic* — e.g. offering to update an unmodified copy when a starter improves is deferred (below).
- 5.5 Done: starter themes are grouped by `category` (Light / Dark / Accessible) in the dropdown.

Not done, deliberately (candidates for later): user-created layouts and a layout editor; a theme that recommends a layout; a "reading style" preset pairing a theme with a layout; using `version` to offer updates to unmodified copies of starters.

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
