import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ConfigManager, Theme, ReadingWidth } from './configManager';
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
    panel.webview.onDidReceiveMessage(msg => {
      if (msg.type === 'scroll' && this.config.get().scrollSync) {
        // Reader scrolled → sync the editor
        this.syncEditorScroll(key, msg.percentage);
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

  async cycleTheme(): Promise<void> {
    const current = this.config.get().theme;
    const next = this.config.nextTheme(current);
    await this.config.setTheme(next);
    vscode.window.setStatusBarMessage(`MD Reader: Theme → ${next}`, 2000);
  }

  async pickWidth(): Promise<void> {
    const current = this.config.get().readingWidth;

    const WIDTH_OPTIONS: vscode.QuickPickItem[] = [
      { label: current === 'narrow' ? '• Narrow'  : 'Narrow',  description: '640px — focused reading' },
      { label: current === 'medium' ? '• Medium'  : 'Medium',  description: '760px — balanced default' },
      { label: current === 'wide'   ? '• Wide'    : 'Wide',    description: '960px — more content visible' },
      { label: current === 'wider'  ? '• Wider'   : 'Wider',   description: '1100px — for large monitors' },
      { label: current === 'ultra'  ? '• Ultra'   : 'Ultra',   description: '1400px — maximum fixed width' },
      { label: current === 'full'   ? '• Full'    : 'Full',    description: '100% — full window width' },
    ];

    const picked = await vscode.window.showQuickPick(WIDTH_OPTIONS, {
      title: 'MD Reader — Reading Width',
      placeHolder: `Current: ${current} — select a width…`,
      matchOnDescription: true,
    });

    if (picked) {
      const key = picked.label.replace(/^• /, '').toLowerCase() as any;
      await this.config.setWidth(key);
      vscode.window.setStatusBarMessage(`MD Reader: Width → ${key}`, 2000);
    }
  }

  async toggleScrollSync(): Promise<void> {
    const current = this.config.get().scrollSync;
    await this.config.setScrollSync(!current);
    vscode.window.setStatusBarMessage(
      `MD Reader: Scroll Sync ${!current ? 'ON' : 'OFF'}`, 2000
    );
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

  async pickFontFamily(): Promise<void> {
    const current = this.config.get().fontFamily;

    const FONT_FAMILIES: vscode.QuickPickItem[] = [
      { label: '$(blank)', kind: vscode.QuickPickItemKind.Separator, description: 'Serif' },
      { label: 'Georgia',                   description: "Georgia, 'Times New Roman', serif" },
      { label: 'Palatino',                  description: "'Palatino Linotype', Palatino, serif" },
      { label: 'Times New Roman',           description: "'Times New Roman', Times, serif" },
      { label: 'Garamond',                  description: "Garamond, 'EB Garamond', serif" },
      { label: 'Book Antiqua',              description: "'Book Antiqua', Palatino, serif" },
      { label: '$(blank)', kind: vscode.QuickPickItemKind.Separator, description: 'Sans-Serif' },
      { label: 'Segoe UI',                  description: "'Segoe UI', system-ui, sans-serif" },
      { label: 'Inter',                     description: "'Inter', system-ui, sans-serif" },
      { label: 'Arial',                     description: "Arial, Helvetica, sans-serif" },
      { label: 'Verdana',                   description: "Verdana, Geneva, sans-serif" },
      { label: 'Calibri',                   description: "Calibri, Candara, sans-serif" },
      { label: '$(blank)', kind: vscode.QuickPickItemKind.Separator, description: 'Monospace' },
      { label: 'JetBrains Mono',            description: "'JetBrains Mono', 'Fira Code', monospace" },
      { label: 'Cascadia Code',             description: "'Cascadia Code', Consolas, monospace" },
      { label: 'Courier New',               description: "'Courier New', Courier, monospace" },
    ];

    // Mark current selection
    FONT_FAMILIES.forEach(item => {
      if (item.description === current) {
        item.label = '• ' + item.label;
      }
    });

    const picked = await vscode.window.showQuickPick(FONT_FAMILIES, {
      title: 'MD Reader — Font Family',
      placeHolder: 'Select a reading font…',
      matchOnDescription: true,
    });

    if (picked && picked.description && picked.kind !== vscode.QuickPickItemKind.Separator) {
      await this.config.setFontFamily(picked.description);
      vscode.window.setStatusBarMessage(`MD Reader: Font → ${picked.label.replace(/^• /, '')}`, 2000);
    }
  }

  async pickFontSize(): Promise<void> {
    const current = this.config.get().fontSize;

    const SIZES = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 24, 26, 28, 30, 32, 36, 40, 44, 48, 56, 64, 72];

    const items: vscode.QuickPickItem[] = SIZES.map(size => ({
      label: size === current ? `• ${size}px` : `${size}px`,
      description: size === current ? 'current' : '',
    }));

    const picked = await vscode.window.showQuickPick(items, {
      title: 'MD Reader — Font Size',
      placeHolder: `Current: ${current}px — select a new size…`,
    });

    if (picked) {
      const newSize = parseInt(picked.label.replace(/[^0-9]/g, ''), 10);
      if (!isNaN(newSize)) {
        await this.config.setFontSize(newSize);
        vscode.window.setStatusBarMessage(`MD Reader: Font size → ${newSize}px`, 2000);
      }
    }
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
    const { html, toc } = await renderMarkdown(document.getText());
    const cfg = this.config.get();
    panel.webview.postMessage({ type: 'update', html, toc, config: cfg });
  }

  private buildShell(webview: vscode.Webview): string {
    const webviewDir = path.join(this.context.extensionPath, 'src', 'webview');
    const cssUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(webviewDir, 'reader.css'))
    );
    const jsUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(webviewDir, 'reader.js'))
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
  <title>MD Reader</title>
</head>
<body>
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
