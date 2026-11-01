# Changelog

All notable changes to **MD Reader** will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.5.0] — 2026-11-02

### Added
- **Layouts**: a second axis next to the colour theme. A layout sets heading font, weight, size scale, spacing and rules, plus paragraph spacing and first-line indent. Six ship: Standard, Compact, Book, Editorial, Magazine and Academic. Pick one in the settings drawer (**Layout**) or with `mdReader.layout`; any theme works with any layout. Body font, size, line height and width stay your own settings. HTML export carries the layout.
- Layouts are plain files in `layouts/*.mdlayout.json`, validated like themes (see `docs/THEME-FORMAT.md`).
- Starter themes are grouped in the dropdown by category (Light / Dark / Accessible).
- Themes can carry a `version` and a `category`; both survive export and import.
- `docs/THEME-FORMAT.md` documents the theme and layout file formats.

### Changed
- Theme files (export and starter themes) are now written in a **grouped** shape: `colors.ink.primary` instead of a flat `text`, `colors.code.blockBackground` instead of `preBg`. The file format version is now `2`. Version-1 files and themes already saved in your settings (flat keys) keep working unchanged, and both shapes are accepted everywhere. A theme exported from this version cannot be read by an older release, which will say it was made by a newer version.

---

## [0.4.0] — 2026-11-02

### Added
- **Open without an editor.** The reader no longer needs the Markdown file open in an editor tab. Right-click a `.md` file in the Explorer and choose **Open in MD Reader**; select several files to open them all; or run the command from the Command Palette and pick a file when no Markdown editor is active.
- Each reader panel watches its own file, so external edits (another program, `git checkout`, a build script) refresh the panel even when no editor has the file open.

### Changed
- Closing the Markdown editor tab no longer closes the reader. A panel closes when you close it.
- Clicking a task-list checkbox when the file is not open in an editor now saves the file straight away (previously the edit stayed as an invisible unsaved buffer). If the file is open in an editor, the edit follows your normal save workflow as before.
- Several triggers for one save (file watcher + editor save event) are now coalesced into a single refresh.
- Files with a UTF-8 byte-order mark render correctly (front matter is still detected).

### Internal (no user-visible change)
- Real automated tests (`npm test`, Node's built-in runner): theme validation and the export/import format, starter-theme contrast, highlight.js token styling, settings/command/manifest consistency, and version/CHANGELOG agreement.
- CI on every pull request (type-check, test, build, package on Linux and Windows) with the `.vsix` attached as a downloadable artifact.
- Release workflow now creates a draft GitHub release, publishes to the VS Code Marketplace and Open VSX when their tokens are configured, and only then publishes the release; hyphenated tags (`v0.4.0-beta.1`) are GitHub pre-releases only. See `docs/RELEASING.md`.
- `npm run compile` is now a pure type-check (`--noEmit`); it no longer overwrites the bundled `out/extension.js`.

### Removed
- `mdReader.showTOC`: the setting did nothing (it was declared and documented, but never read) and the table of contents always worked. A leftover `mdReader.showTOC` entry in your `settings.json` is harmless and can be deleted.

### Fixed
- Highlight.js token classes for HTML tags, CSS selectors and Markdown inline code had no style rule and rendered uncoloured; found by the new tests.

---

## [0.3.1] — 2026-11-02

### Fixed
- Code blocks had no syntax colours: highlight.js markup was emitted but no stylesheet defined its classes, and `mdReader.codeTheme` was never read. Syntax highlighting now works, and `mdReader.codeTheme` selects one of five palettes (`github-dark`, `github-light`, `monokai`, `atom-one-dark`, `vs2015`).

### Added
- Themes can carry their own syntax colours: 10 new optional colours (keyword, string, comment, number, function name, type, variable, attribute, meta, built-in) in the theme editor and the theme file format. Themes saved or exported from 0.3.0 keep working unchanged.
- All 20 starter themes now ship matching syntax colours, and the 7 light ones have light code blocks (they previously kept dark code blocks as a workaround).
- HTML export carries the syntax palette.

### Changed
- If a syntax palette's light/dark polarity doesn't match the code block (for example `github-light` on a dark theme), the matching GitHub palette is used so code stays readable.

---

## [0.3.0] — 2026-11-02

### Added
- Custom themes: create, edit, save and delete your own colour themes from the settings drawer (**Customize theme**), with live preview and 14 themeable colours. A theme stores only the colours you changed plus a base theme.
- Themes are stored in user settings (`mdReader.customThemes`), so they survive extension updates — including installing a newer `.vsix` over the old one — and uninstall/reinstall.
- Export and import themes as `.json` files, one at a time or in bulk (**Export Themes…**, **Import Themes…**), with a single Replace / Keep both / Skip choice for conflicts.
- **Delete All Custom Themes…** command (offers a backup export first) for a clean removal before uninstalling.
- 20 starter themes (Solarized, Nord, Dracula, Gruvbox, One Dark, Monokai, Tokyo Night, Catppuccin, Rosé Pine, GitHub, Ayu, Night Owl, Paper, Forest, High Contrast …) shipped as ordinary theme files in `themes/` — the same format as Export/Import, so anyone can contribute one by pull request. They are read-only; **Save as new** or **Add Starter Themes to My Themes…** makes editable copies.
- HTML export and Mermaid diagrams follow the selected custom or starter theme.

### Changed
- `mdReader.theme` now also accepts `custom:<id>` and `starter:<id>`; an unknown or deleted custom theme falls back to Auto.

---

## [0.2.1] — 2026-11-01

### Fixed
- Changing the reading font size or family in the settings drawer no longer resizes/restyles the drawer, table of contents, or find bar — typography now applies to the document only
- The settings drawer no longer dims the rest of the reader, so live changes (eye care, theme, font) are visible while adjusting
- Eye Care (blue light) filter was nearly invisible on dark themes; it now uses a normal amber wash that works on light, sepia and dark
- Eye Care and Line Height sliders reverted (or never saved) when released: the release handler sent the value as a string instead of a number

---

## [0.2.0] — 2026-11-01

### Added
- Mermaid diagrams (lazy-loaded) and KaTeX math (`$inline$`, `$$block$$`)
- GFM footnotes and YAML front matter (`mdReader.frontMatter`: card / hide / raw)
- Find in document (Ctrl/Cmd+F), reading-mode keyboard shortcuts and a `?` shortcuts help overlay
- Estimated reading time and word count (`mdReader.readingSpeed`)
- Interactive task lists, smart link navigation, heading anchor links, image lightbox, scroll-position persistence
- Export as PDF (print stylesheet) and as standalone HTML (`mdReader.export.embedImages`)
- Custom CSS override (`mdReader.customCssPath`)
- Auto-refresh also on external file changes
- GitHub Actions workflow that builds the `.vsix` and publishes a GitHub Release on `v*` tags

### Changed
- Publisher/author metadata now point to rupeshbhurke
- `.vsix` is ~2.6 MB (was ~283 MB, `windows-app/` was being packaged)

### Fixed
- Settings drawer used undefined CSS custom properties

---

## [0.1.0] — 2024

### Added
- Multi-document support — each Markdown file gets its own fully isolated reader panel
- 4 themes: Auto, Light, Dark, Sepia (live-applied, no reload needed)
- Font family picker — grouped serif, sans-serif, and monospace options
- Font size picker — 10px to 72px
- 6 reading widths: Narrow (640px), Medium (760px), Wide (960px), Wider (1100px), Ultra (1400px), Full (100%)
- Auto-generated Table of Contents floating overlay with active heading highlight
- Reading progress bar
- Syntax-highlighted code blocks with language labels and copy-to-clipboard buttons
- Two-way scroll sync between editor and reader panel
- Auto-refresh on file save
- Live configuration — all open panels update instantly when any setting changes
- Per-panel toolbar with 7 action buttons (TOC, Theme, Font Family, Font Size, Scroll Sync, Width, Refresh)
- Open beside editor (split view) or in a new column
- Right-click context menu on `.md` files in Explorer and editor tabs
- MIT License
