import * as vscode from 'vscode';
import { PanelManager } from './panelManager';
import { ConfigManager } from './configManager';
import { ThemeManager } from './themeManager';
import { loadStarterThemes } from './starterThemes';
import { loadLayouts } from './layoutLoader';
import * as path from 'path';

let panelManager: PanelManager;

export function activate(context: vscode.ExtensionContext) {
  const configManager = new ConfigManager();
  configManager.starters = loadStarterThemes(path.join(context.extensionPath, 'themes'));
  configManager.layouts = loadLayouts(path.join(context.extensionPath, 'layouts'));
  const themeManager = new ThemeManager(configManager);
  panelManager = new PanelManager(context, configManager, themeManager);
  panelManager.setupScrollSync(context);

  // ── Commands ────────────────────────────────────────────────────────────────
  // The two open commands take the file as an argument (Explorer, editor-tab and
  // editor context menus pass it), so a Markdown file does NOT have to be open
  // in an editor. From the Command Palette they fall back to the active Markdown
  // editor, then to a file picker.

  context.subscriptions.push(
    vscode.commands.registerCommand('mdReader.open', async (uri?: vscode.Uri, selected?: vscode.Uri[]) => {
      for (const target of await resolveTargets(uri, selected)) { await panelManager.open(target, false); }
    }),

    vscode.commands.registerCommand('mdReader.openNewColumn', async (uri?: vscode.Uri, selected?: vscode.Uri[]) => {
      for (const target of await resolveTargets(uri, selected)) { await panelManager.open(target, true); }
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
    }),

    vscode.commands.registerCommand('mdReader.exportThemes', () => themeManager.exportThemes()),
    vscode.commands.registerCommand('mdReader.importThemes', () => themeManager.importThemes()),
    vscode.commands.registerCommand('mdReader.addStarterThemes', () => themeManager.addStarters()),
    vscode.commands.registerCommand('mdReader.deleteAllThemes', () => themeManager.deleteAll())
  );

  // ── Auto-refresh ─────────────────────────────────────────────────────────────
  // PanelManager watches each panel's own file on disk, which covers every case
  // for a file that is NOT open in an editor (another program, `git checkout`,
  // a build script, a second VS Code window, ...). The two document events below
  // remain for files that ARE open, and for file systems where the OS watcher
  // does not fire (some remote/virtual workspaces). All three funnel into
  // refreshDebounced(), so one save still produces one refresh.
  //
  // 1. onDidSaveTextDocument — a save made through VS Code's own editor.
  // 2. onDidChangeTextDocument, filtered to `!document.isDirty` — VS Code
  //    reloading an open buffer after an external change. `!isDirty`
  //    distinguishes that reload (buffer now matches disk) from ordinary live
  //    typing (buffer instantly goes dirty), which we don't preview per keystroke.

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(doc => {
      if (shouldAutoRefresh(doc)) { panelManager.refreshDebounced(doc.uri); }
    }),

    vscode.workspace.onDidChangeTextDocument(e => {
      if (e.contentChanges.length === 0) { return; }
      if (e.document.isDirty) { return; }
      if (shouldAutoRefresh(e.document)) { panelManager.refreshDebounced(e.document.uri); }
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

  // Panels deliberately outlive their source editor: closing the Markdown tab
  // must not close the reader (that was the old "file must stay open" rule).
  // A panel goes away when the user closes it, or the extension deactivates.
}

export function deactivate() {
  panelManager?.disposeAll();
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function shouldAutoRefresh(document: vscode.TextDocument): boolean {
  if (document.languageId !== 'markdown') { return false; }
  return vscode.workspace.getConfiguration('mdReader').get<boolean>('autoRefresh', true);
}

const MARKDOWN_FILE = /\.(md|markdown)$/i;

/**
 * Which file(s) a command invocation means, in order of preference:
 *   1. an explicit multi-selection (Explorer passes `(clicked, allSelected)`),
 *   2. an explicit resource URI (Explorer / editor-tab / editor context menu),
 *   3. the active Markdown editor,
 *   4. a file picker (Command Palette with nothing relevant open).
 */
async function resolveTargets(uri?: vscode.Uri, selected?: vscode.Uri[]): Promise<vscode.Uri[]> {
  if (Array.isArray(selected) && selected.length > 1) {
    const markdown = selected.filter(u => MARKDOWN_FILE.test(u.fsPath));
    if (markdown.length > 0) { return markdown; }
  }
  if (uri instanceof vscode.Uri) { return [uri]; }

  const editor = vscode.window.activeTextEditor;
  if (editor && editor.document.languageId === 'markdown') { return [editor.document.uri]; }

  const picked = await vscode.window.showOpenDialog({
    canSelectMany: true,
    canSelectFiles: true,
    canSelectFolders: false,
    filters: { Markdown: ['md', 'markdown'] },
    openLabel: 'Open in MD Reader',
  });
  return picked ?? [];
}
