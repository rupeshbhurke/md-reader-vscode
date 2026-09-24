import * as vscode from 'vscode';
import { PanelManager } from './panelManager';
import { ConfigManager } from './configManager';

let panelManager: PanelManager;

export function activate(context: vscode.ExtensionContext) {
  const configManager = new ConfigManager();
  panelManager = new PanelManager(context, configManager);
  panelManager.setupScrollSync(context);

  // ── Commands ────────────────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('mdReader.open', () => {
      const doc = activeMarkdownDocument();
      if (doc) { panelManager.open(doc, false); }
    }),

    vscode.commands.registerCommand('mdReader.openNewColumn', () => {
      const doc = activeMarkdownDocument();
      if (doc) { panelManager.open(doc, true); }
    }),

    vscode.commands.registerCommand('mdReader.toggleTOC', () => {
      panelManager.postToActive({ type: 'toggleTOC' });
    }),

    vscode.commands.registerCommand('mdReader.refresh', () => {
      panelManager.refreshActive();
    }),

    vscode.commands.registerCommand('mdReader.refreshAll', () => {
      panelManager.refreshAll();
    }),

    vscode.commands.registerCommand('mdReader.toggleSettings', () => {
      panelManager.toggleSettings();
    }),

    vscode.commands.registerCommand('mdReader.find', () => {
      panelManager.postToActive({ type: 'find' });
    }),

    vscode.commands.registerCommand('mdReader.exportPdf', () => {
      panelManager.postToActive({ type: 'print' });
    }),

    vscode.commands.registerCommand('mdReader.exportHtml', () => {
      panelManager.exportActiveAsHtml();
    }),

    vscode.commands.registerCommand('mdReader.showShortcuts', () => {
      panelManager.postToActive({ type: 'toggleShortcuts' });
    })
  );

  // ── Auto-refresh ─────────────────────────────────────────────────────────────
  // Two triggers are needed, not one:
  //
  // 1. onDidSaveTextDocument — a save made *through* VS Code's own editor
  //    (Ctrl+S, Save All, format-on-save, ...).
  // 2. onDidChangeTextDocument, filtered to `!document.isDirty` — a file
  //    changed *outside* VS Code's editor (another program, another VS Code
  //    window, `git checkout`, a build script, editing in Notepad, etc.)
  //    while the document is open here, even in a background/unfocused tab.
  //    VS Code detects the on-disk change and silently reloads the buffer;
  //    that reload fires onDidChangeTextDocument, never onDidSaveTextDocument
  //    — so relying on (1) alone means an external save never refreshes the
  //    preview. `!isDirty` is what distinguishes this reload (buffer now
  //    matches disk) from ordinary live typing (buffer instantly goes dirty),
  //    which we still don't want to preview on every keystroke.

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(doc => {
      if (shouldAutoRefresh(doc)) { panelManager.refresh(doc.uri); }
    }),

    vscode.workspace.onDidChangeTextDocument(e => {
      if (e.contentChanges.length === 0) { return; }
      if (e.document.isDirty) { return; }
      if (shouldAutoRefresh(e.document)) { panelManager.refresh(e.document.uri); }
    })
  );

  // ── Live config updates ────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('mdReader')) {
        panelManager.broadcastConfig();
      }
    })
  );

  // ── Dispose panels when their source document closes ───────────────────────

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument(doc => {
      if (doc.languageId === 'markdown') {
        panelManager.disposeForUri(doc.uri);
      }
    })
  );
}

export function deactivate() {
  panelManager?.disposeAll();
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function shouldAutoRefresh(document: vscode.TextDocument): boolean {
  if (document.languageId !== 'markdown') { return false; }
  return vscode.workspace.getConfiguration('mdReader').get<boolean>('autoRefresh', true);
}

function activeMarkdownDocument(): vscode.TextDocument | undefined {
  const editor = vscode.window.activeTextEditor;
  if (editor && editor.document.languageId === 'markdown') {
    return editor.document;
  }
  vscode.window.showWarningMessage('MD Reader: Open a Markdown file first.');
  return undefined;
}
