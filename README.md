# MD Reader — VS Code Extension

A reading-focused, fully customizable Markdown viewer for Visual Studio Code. Unlike other Markdown preview extensions, MD Reader correctly handles **multiple independent document windows** — each Markdown file gets its own fully isolated reader panel with independent state.

## Features

- 📖 **Multi-document support** — Open as many Markdown files as you want; each gets its own independent reader panel. No shared state, no conflicts.
- 🎨 **4 themes** — Light, Dark, Sepia, and Auto (follows VS Code's color theme automatically)
- 🖊️ **Fully customizable typography** — Pick from curated font families (serif, sans-serif, monospace) and choose any font size from 10px to 72px
- 📐 **6 reading widths** — Narrow, Medium, Wide, Wider, Ultra, and Full (100% window width)
- 📋 **Table of Contents** — Auto-generated floating overlay with active heading highlight as you scroll
- 📊 **Reading progress bar** — Thin bar at the top of the panel tracks your position
- 💻 **Syntax highlighting** — Code blocks with language labels and one-click copy-to-clipboard
- 🔄 **Auto-refresh** — Panels update automatically when the file is saved
- 🔗 **Scroll sync** — Two-way synchronization between the editor and reader panel
- ⚡ **Live config** — Change any setting and all open panels update instantly without reloading

## Usage

| Action | How |
|---|---|
| Open reader (split view) | Right-click a `.md` file → **Open in MD Reader** |
| Open in new column | `Ctrl+Shift+P` → **MD Reader: Open in MD Reader (New Column)** |
| Refresh all panels | `Ctrl+Shift+P` → **MD Reader: Refresh All Reader Panels** |

## Toolbar

When a reader panel is focused, a toolbar appears in the panel's title bar:

| Icon | Button | Action |
|---|---|---|
| `$(list-tree)` | Table of Contents | Toggle the floating TOC overlay |
| `$(symbol-color)` | Theme | Cycle: Auto → Light → Dark → Sepia → Auto |
| `$(symbol-string)` | Font Family | Pick from a grouped list of reading fonts |
| `$(text-size)` | Font Size | Pick from 10px – 72px |
| `$(link)` | Scroll Sync | Toggle two-way editor ↔ reader scroll sync |
| `$(layout-centered)` | Reading Width | Pick from 6 width options |
| `$(refresh)` | Refresh | Re-render the current panel |

## Font Families

The font family picker is grouped by type:

| Group | Fonts |
|---|---|
| **Serif** | Georgia, Palatino, Times New Roman, Garamond, Book Antiqua |
| **Sans-Serif** | Segoe UI, Inter, Arial, Verdana, Calibri |
| **Monospace** | JetBrains Mono, Cascadia Code, Courier New |

## Reading Widths

| Option | Width | Best for |
|---|---|---|
| Narrow | 640px | Focused distraction-free reading |
| Medium *(default)* | 760px | Balanced layout |
| Wide | 960px | Tables and wide code blocks |
| Wider | 1100px | Large monitors |
| Ultra | 1400px | Maximum fixed column |
| Full | 100% | Edge-to-edge, no side margins |

## Configuration

All settings are under `mdReader.*` in VS Code Settings (`Ctrl+,`):

| Setting | Default | Description |
|---|---|---|
| `mdReader.theme` | `auto` | Color theme: `auto` / `light` / `dark` / `sepia` |
| `mdReader.fontFamily` | `Georgia, 'Times New Roman', serif` | Body font family |
| `mdReader.fontSize` | `17` | Base font size in px (10–72) |
| `mdReader.lineHeight` | `1.85` | Line spacing multiplier |
| `mdReader.readingWidth` | `medium` | Reading column width |
| `mdReader.showTOC` | `true` | Enable table of contents |
| `mdReader.codeTheme` | `github-dark` | Syntax highlight theme for code blocks |
| `mdReader.autoRefresh` | `true` | Refresh panel on file save |
| `mdReader.scrollSync` | `false` | Two-way scroll sync with the editor |
| `mdReader.openBeside` | `true` | Open reader beside the editor (split view) |

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Escape` | Close the TOC overlay |

## Context Menus

Right-clicking a `.md` file in the **Explorer** or **editor tab** also shows **Open in MD Reader**.

## License

MIT — See [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! This project is open source under the MIT License.
