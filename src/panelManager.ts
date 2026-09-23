import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ConfigManager, ReaderConfig, SETTABLE_KEYS } from './configManager';
import { renderMarkdown } from './markdownRenderer';

export class PanelManager {
  /** Map of document URI → webview panel */
  private panels = new Map<string, vscode.WebviewPanel>();

  /** Track active URI so toolbar commands know which panel to target */
  private activeUri: string | undefined;

  /**
   * Per-URI timestamp: ignore editor scroll events that arrive within
   * this many ms after a reader-driven scroll (prevents echo loops).
   */
  private ignoreEditorScrollUntil = new Map<string, number>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly config: ConfigManager
  ) {}

  // ── Open ────────────────────────────────────────────────────────────────────

  async open(document: vscode.TextDocument, newColumn: boolean): Promise<void> {
    const key = document.uri.toString();

    // If panel already exists, reveal it
    if (this.panels.has(key)) {
      this.panels.get(key)!.reveal();
      return;
    }

    const cfg = vscode.workspace.getConfiguration('mdReader');
    const openBeside = cfg.get<boolean>('openBeside', true);
    const column = newColumn
      ? vscode.ViewColumn.Two
      : openBeside
        ? vscode.ViewColumn.Beside
        : vscode.ViewColumn.Active;

    const panel = vscode.window.createWebviewPanel(
      'mdReaderPanel',
      `📖 ${path.basename(document.fileName)}`,
      column,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview')),
          vscode.Uri.file(path.dirname(document.fileName)),
        ],
        retainContextWhenHidden: true,
      }
    );

    this.panels.set(key, panel);
    this.activeUri = key;

    // Set initial HTML shell
    panel.webview.html = this.buildShell(panel.webview);

    // Send rendered content
    await this.sendUpdate(panel, document);

    // Track active panel
    panel.onDidChangeViewState(e => {
      if (e.webviewPanel.active) {
        this.activeUri = key;
      }
    });

    // Handle messages from webview
    panel.webview.onDidReceiveMessage(async msg => {
      if (msg.type === 'scroll' && this.config.get().scrollSync) {
        // Reader scrolled → sync the editor
        this.syncEditorScroll(key, msg.percentage);
      } else if (msg.type === 'updateSetting') {
        if ((SETTABLE_KEYS as readonly string[]).includes(msg.key)) {
          await this.config.set(msg.key as keyof ReaderConfig, msg.value);
        }
      }
    });

    // Clean up on close
    panel.onDidDispose(() => {
      this.panels.delete(key);
      if (this.activeUri === key) { this.activeUri = undefined; }
    }, null, this.context.subscriptions);
  }

  // ── Refresh ─────────────────────────────────────────────────────────────────

  async refresh(uri: vscode.Uri): Promise<void> {
    const key = uri.toString();
    const panel = this.panels.get(key);
    if (!panel) { return; }

    const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === key);
    if (doc) { await this.sendUpdate(panel, doc); }
  }

  async refreshActive(): Promise<void> {
    if (this.activeUri) { await this.refresh(vscode.Uri.parse(this.activeUri)); }
  }

  async refreshAll(): Promise<void> {
    for (const [key] of this.panels) {
      await this.refresh(vscode.Uri.parse(key));
    }
  }

  // ── Config broadcast ─────────────────────────────────────────────────────────

  broadcastConfig(): void {
    const cfg = this.config.get();
    for (const [, panel] of this.panels) {
      panel.webview.postMessage({ type: 'config', config: cfg });
    }
  }

  // ── Toolbar commands ─────────────────────────────────────────────────────────

  postToActive(message: object): void {
    if (this.activeUri) {
      this.panels.get(this.activeUri)?.webview.postMessage(message);
    }
  }

  toggleSettings(): void {
    this.postToActive({ type: 'toggleSettings' });
  }

  /**
   * Register the editor → reader scroll listener.
   * Call once from extension.ts after creating PanelManager.
   */
  setupScrollSync(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.window.onDidChangeTextEditorVisibleRanges(e => {
        if (!this.config.get().scrollSync) { return; }

        const key = e.textEditor.document.uri.toString();
        const panel = this.panels.get(key);
        if (!panel) { return; }

        // Suppress if we recently triggered a scroll from the reader side
        const suppressUntil = this.ignoreEditorScrollUntil.get(key) ?? 0;
        if (Date.now() < suppressUntil) { return; }

        const totalLines = e.textEditor.document.lineCount;
        if (totalLines === 0) { return; }

        const firstVisible = e.visibleRanges[0]?.start.line ?? 0;
        const percentage   = Math.min(1, firstVisible / totalLines);

        panel.webview.postMessage({ type: 'scrollTo', percentage });
      })
    );
  }

  // ── Dispose ──────────────────────────────────────────────────────────────────

  /** Scroll the editor to match the reader's scroll percentage. */
  private syncEditorScroll(key: string, percentage: number): void {
    const editor = vscode.window.visibleTextEditors.find(
      e => e.document.uri.toString() === key
    );
    if (!editor) { return; }

    const totalLines = editor.document.lineCount;
    const targetLine = Math.min(totalLines - 1, Math.floor(percentage * totalLines));
    const range = new vscode.Range(targetLine, 0, targetLine, 0);

    // Tell the editor-→-reader listener to ignore the next echo
    this.ignoreEditorScrollUntil.set(key, Date.now() + 500);

    editor.revealRange(range, vscode.TextEditorRevealType.AtTop);
  }

  disposeForUri(uri: vscode.Uri): void {
    const key = uri.toString();
    this.panels.get(key)?.dispose();
    this.panels.delete(key);
  }

  disposeAll(): void {
    for (const [, panel] of this.panels) { panel.dispose(); }
    this.panels.clear();
  }

  // ── Internals ────────────────────────────────────────────────────────────────

  private async sendUpdate(
    panel: vscode.WebviewPanel,
    document: vscode.TextDocument
  ): Promise<void> {
    const { html, toc, hasMermaid } = await renderMarkdown(document.getText());
    const cfg = this.config.get();
    panel.webview.postMessage({ type: 'update', html, toc, hasMermaid, config: cfg });
  }

  private buildShell(webview: vscode.Webview): string {
    const webviewDir = path.join(this.context.extensionPath, 'src', 'webview');
    const vendorDir = path.join(webviewDir, 'vendor');
    const cssUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(webviewDir, 'reader.css'))
    );
    const jsUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(webviewDir, 'reader.js'))
    );
    const katexCssUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(vendorDir, 'katex', 'katex.min.css'))
    );
    const mermaidJsUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(vendorDir, 'mermaid.min.js'))
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${webview.cspSource} 'unsafe-inline';
             script-src 'nonce-${nonce}';
             img-src ${webview.cspSource} https: data:;
             font-src ${webview.cspSource} https:;" />
  <link rel="stylesheet" href="${cssUri}" />
  <link rel="stylesheet" href="${katexCssUri}" />
  <title>MD Reader</title>
  <script nonce="${nonce}">
    // mermaid.min.js is loaded lazily (see reader.js) only when a document
    // actually contains a fenced mermaid code block — most documents don't,
    // and the file is ~3.5MB. Same nonce as reader.js/reader.css so the
    // dynamically created script tag is allowed under the CSP above.
    window.__mdReaderVendor = { mermaidJsUri: ${JSON.stringify(mermaidJsUri.toString())}, nonce: ${JSON.stringify(nonce)} };
  </script>
</head>
<body>
  <!-- Settings Drawer -->
  <aside id="settings-drawer" aria-label="Settings">
    <div class="settings-header">
      <h2>Reader Settings</h2>
      <button id="settings-close" aria-label="Close Settings">✕</button>
    </div>
    <div class="settings-content">
      
      <div class="setting-group">
        <label for="set-theme">Theme</label>
        <select id="set-theme">
          <option value="auto">Auto (Matches VS Code)</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="sepia">Sepia</option>
        </select>
      </div>

      <div class="setting-group">
        <label for="set-font">Font Family</label>
        <select id="set-font">
          <optgroup label="Serif">
            <option value="Georgia, 'Times New Roman', serif">Georgia</option>
            <option value="'Palatino Linotype', Palatino, serif">Palatino</option>
            <option value="'Times New Roman', Times, serif">Times New Roman</option>
            <option value="Garamond, 'EB Garamond', serif">Garamond</option>
            <option value="'Book Antiqua', Palatino, serif">Book Antiqua</option>
          </optgroup>
          <optgroup label="Sans-Serif">
            <option value="'Segoe UI', system-ui, sans-serif">Segoe UI</option>
            <option value="'Inter', system-ui, sans-serif">Inter</option>
            <option value="Arial, Helvetica, sans-serif">Arial</option>
            <option value="Verdana, Geneva, sans-serif">Verdana</option>
            <option value="Calibri, Candara, sans-serif">Calibri</option>
          </optgroup>
          <optgroup label="Monospace">
            <option value="'JetBrains Mono', 'Fira Code', monospace">JetBrains Mono</option>
            <option value="'Cascadia Code', Consolas, monospace">Cascadia Code</option>
            <option value="'Courier New', Courier, monospace">Courier New</option>
          </optgroup>
        </select>
      </div>

      <div class="setting-group">
        <div class="setting-label-row">
          <label for="set-size">Font Size</label>
          <span id="val-size">17px</span>
        </div>
        <input type="range" id="set-size" min="10" max="72" step="1">
      </div>

      <div class="setting-group">
        <div class="setting-label-row">
          <label for="set-lineheight">Line Height</label>
          <span id="val-lineheight">1.85</span>
        </div>
        <input type="range" id="set-lineheight" min="1.0" max="2.5" step="0.05">
      </div>

      <div class="setting-group">
        <label for="set-width">Reading Width</label>
        <select id="set-width">
          <option value="narrow">Narrow (640px)</option>
          <option value="medium">Medium (760px)</option>
          <option value="wide">Wide (960px)</option>
          <option value="wider">Wider (1100px)</option>
          <option value="ultra">Ultra (1400px)</option>
          <option value="full">Full Width (100%)</option>
        </select>
      </div>

      <div class="setting-group">
        <div class="setting-label-row">
          <label for="set-eyecare">Eye Care (Blue Light)</label>
          <span id="val-eyecare">0%</span>
        </div>
        <input type="range" id="set-eyecare" min="0" max="100" step="1">
      </div>

      <div class="setting-group toggle-group">
        <label for="set-scrollsync">Editor Scroll Sync</label>
        <label class="switch">
          <input type="checkbox" id="set-scrollsync">
          <span class="slider round"></span>
        </label>
      </div>

    </div>
  </aside>
  <div id="settings-backdrop"></div>

  <!-- Find in document -->
  <div id="find-bar" role="search" aria-label="Find in document">
    <input type="text" id="find-input" placeholder="Find in document…" autocomplete="off" spellcheck="false" />
    <span id="find-count">0/0</span>
    <button id="find-prev" aria-label="Previous match" title="Previous match (Shift+Enter)">˄</button>
    <button id="find-next" aria-label="Next match" title="Next match (Enter)">˅</button>
    <button id="find-case" aria-label="Match case" title="Match case">Aa</button>
    <button id="find-close" aria-label="Close find" title="Close (Esc)">✕</button>
  </div>

  <!-- Keyboard shortcuts help -->
  <div id="shortcuts-overlay" role="dialog" aria-label="Keyboard shortcuts">
    <div class="shortcuts-header">
      <h2>Keyboard Shortcuts</h2>
      <button id="shortcuts-close" aria-label="Close shortcuts help">✕</button>
    </div>
    <div class="shortcuts-content">
      <dl>
        <dt><kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>F</kbd></dt><dd>Find in document</dd>
        <dt><kbd>Enter</kbd> / <kbd>Shift</kbd>+<kbd>Enter</kbd></dt><dd>Next / previous match</dd>
        <dt><kbd>j</kbd> / <kbd>k</kbd></dt><dd>Scroll down / up</dd>
        <dt><kbd>Space</kbd> / <kbd>Shift</kbd>+<kbd>Space</kbd></dt><dd>Page down / up</dd>
        <dt><kbd>g</kbd> / <kbd>G</kbd></dt><dd>Top / bottom of document</dd>
        <dt><kbd>n</kbd> / <kbd>p</kbd></dt><dd>Next / previous heading</dd>
        <dt><kbd>t</kbd></dt><dd>Toggle table of contents</dd>
        <dt><kbd>s</kbd></dt><dd>Toggle settings</dd>
        <dt><kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>+</kbd>/<kbd>-</kbd>/<kbd>0</kbd></dt><dd>Font size + / − / reset</dd>
        <dt><kbd>Esc</kbd></dt><dd>Close whichever panel is open</dd>
        <dt><kbd>?</kbd></dt><dd>Toggle this help</dd>
      </dl>
    </div>
  </div>
  <div id="shortcuts-backdrop"></div>

  <!-- Reading progress bar -->
  <div id="progress-bar"></div>

  <!-- TOC floating overlay -->
  <nav id="toc-overlay" aria-label="Table of Contents">
    <div id="toc-header">
      <span>Contents</span>
      <button id="toc-close" aria-label="Close TOC">✕</button>
    </div>
    <ul id="toc-list"></ul>
  </nav>
  <div id="toc-backdrop"></div>

  <!-- Main content -->
  <main id="reader-main">
    <article id="reader-content">
      <div id="loading">
        <div class="spinner"></div>
        <p>Rendering…</p>
      </div>
    </article>
  </main>

  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
