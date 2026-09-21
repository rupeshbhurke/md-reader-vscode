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

## Android App

The project includes a standalone companion Android application located in the [android-app](file:///c:/RB/Workarea/Repo/RnD/md-reader-vscode/android-app) directory. Built with Vite, TypeScript, and [Capacitor](https://capacitorjs.com/), it brings the same reading-focused Markdown previewing experience to mobile devices.

### Features
- 📱 **Mobile-Optimized Interface** — Fast, lightweight, and fully responsive layout tailored for phones and tablets.
- 📂 **Local File Viewer** — Tap the Floating Action Button (FAB) to open and read any `.md` file from your device storage.
- 🎨 **Reading Customization** — Adjust font size (10px–72px), line height, choose from serif/sans-serif/monospace font families, and toggle themes (Light, Dark, Sepia, or Auto/System default).
- 👁️ **Eye Care Mode** — Built-in blue light filter overlay to reduce eye strain when reading at night.
- 📋 **Floating Table of Contents** — Easily navigate long documents via the floating TOC menu.
- 📊 **Reading Progress** — Top progress bar tracks your scroll position in real-time.
- 💻 **Code Highlighting** — Syntactical highlighting for code blocks with one-click copy functionality.
- 💾 **Persistent Settings** — Your preferences are automatically saved on the device.

### Development Setup

To build and run the Android app locally:

1. **Install Dependencies**:
   Ensure you have Node.js and Android Studio installed. Then navigate to the directory and install dependencies:
   ```bash
   cd android-app
   npm install
   ```

2. **Run in Browser (Dev Mode)**:
   You can run the web portion of the app in your browser:
   ```bash
   npm run dev
   ```

3. **Build the App**:
   Compile the TypeScript files and build the web assets:
   ```bash
   npm run build
   ```

4. **Sync with Android**:
   Copy the built assets into the Android native project:
   ```bash
   npx cap sync
   ```

5. **Open in Android Studio**:
   Open the native Android project folder to build, debug, or deploy the `.apk` using Android Studio:
   ```bash
   npx cap open android
   ```

## Windows App

The project also includes a standalone companion desktop application for Windows located in the [windows-app](file:///c:/RB/Workarea/Repo/RnD/md-reader-vscode/windows-app) directory. Built with Electron and Vite, it brings the Markdown previewing experience to your desktop with native OS integration.

### Features
- 🖥️ **Native Desktop Experience** — Fast and responsive desktop application wrapper.
- 📂 **Native File Dialog** — Use the standard Windows file picker to open `.md` files.
- 🎨 **Reading Customization** — Full support for reading customizations (font size, themes, layout).
- 💾 **Persistent Settings** — Your preferences are automatically saved on the device via local storage.

### Development Setup

To build and run the Windows app locally, ensure you have **Node.js** installed:

1. **Install Dependencies**:
   ```bash
   cd windows-app
   npm install
   ```

2. **Run in Dev Mode**:
   Starts the Electron app connected to the Vite development server.
   ```bash
   npm run dev
   ```

3. **Build the App**:
   Compile the app and package it into a Windows executable installer using `electron-builder`.
   ```bash
   npm run build
   ```

## License

MIT — See [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! This project is open source under the MIT License.
