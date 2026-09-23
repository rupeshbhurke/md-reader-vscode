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
    })
  );

  // ── Auto-refresh on save ────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(doc => {
      const cfg = vscode.workspace.getConfiguration('mdReader');
      if (cfg.get<boolean>('autoRefresh') && doc.languageId === 'markdown') {
        panelManager.refresh(doc.uri);
      }
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

function activeMarkdownDocument(): vscode.TextDocument | undefined {
  const editor = vscode.window.activeTextEditor;
  if (editor && editor.document.languageId === 'markdown') {
    return editor.document;
  }
  vscode.window.showWarningMessage('MD Reader: Open a Markdown file first.');
  return undefined;
}
