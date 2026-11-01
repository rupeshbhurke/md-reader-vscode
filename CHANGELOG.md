# Changelog

All notable changes to **MD Reader** will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.2.0] � 2026-11-01

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
