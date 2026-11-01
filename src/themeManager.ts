import * as vscode from 'vscode';
import * as fs from 'fs';
import { ConfigManager } from './configManager';
import {
  CUSTOM_PREFIX, MAX_THEMES, ThemeFileEntry, buildThemeFile, isValidId,
  parseThemeFile, sanitizeTheme, slugify, uniqueId,
} from './themes';

type ConflictChoice = 'Replace' | 'Keep both' | 'Skip';

/** Import files bigger than this are rejected unread — themes are tiny. */
const MAX_IMPORT_BYTES = 1024 * 1024;

/**
 * Persists user themes and runs export/import. Themes live in the
 * `mdReader.customThemes` user setting — NOT in the extension folder or
 * globalState — so they survive extension updates (Marketplace or a .vsix
 * installed over the top), publisher/ID changes, and uninstall/reinstall.
 */
export class ThemeManager {
  constructor(private readonly config: ConfigManager) {}

  /**
   * Create or update a theme from the webview's editor and select it.
   * `id` set + existing → overwrite that theme; otherwise a new id is derived
   * from the label. Everything is re-validated here: the webview is not trusted.
   */
  async save(payload: { id?: unknown; label?: unknown; base?: unknown; colors?: unknown }): Promise<void> {
    const theme = sanitizeTheme(payload);
    if (!theme || typeof payload.label !== 'string' || !payload.label.trim()) {
      vscode.window.showWarningMessage('MD Reader: give the theme a name before saving.');
      return;
    }
    const themes = this.config.getSavedThemes();
    let id: string;
    if (typeof payload.id === 'string' && isValidId(payload.id) && themes[payload.id]) {
      id = payload.id;
    } else {
      if (Object.keys(themes).length >= MAX_THEMES) {
        vscode.window.showWarningMessage(`MD Reader: at most ${MAX_THEMES} custom themes are supported.`);
        return;
      }
      id = uniqueId(slugify(theme.label), Object.keys(themes));
    }
    themes[id] = theme;
    // Themes first, then the selection, so the selection never points at a
    // theme that isn't stored yet.
    await this.config.setSavedThemes(themes);
    await this.config.set('theme', CUSTOM_PREFIX + id);
  }

  async delete(id: unknown): Promise<void> {
    if (typeof id !== 'string') { return; }
    const themes = this.config.getSavedThemes();
    if (!themes[id]) { return; }
    const choice = await vscode.window.showWarningMessage(
      `Delete the theme "${themes[id].label}"?`, { modal: true }, 'Delete');
    if (choice !== 'Delete') { return; }
    delete themes[id];
    await this.config.setSavedThemes(themes);
    await this.deselectIfMissing(themes);
  }

  /** Export the given theme ids, or every saved theme when `ids` is omitted. */
  async exportThemes(ids?: string[]): Promise<boolean> {
    const themes = this.config.getSavedThemes();
    const entries: ThemeFileEntry[] = Object.keys(themes)
      .filter(id => !ids || ids.includes(id))
      .map(id => ({ id, ...themes[id] }));
    if (entries.length === 0) {
      vscode.window.showInformationMessage('MD Reader: there are no custom themes to export.');
      return false;
    }
    const name = entries.length === 1 ? `${entries[0].id}.mdtheme.json` : 'mdreader-themes.json';
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(name),
      filters: { 'MD Reader themes': ['json'] },
      saveLabel: 'Export Themes',
    });
    if (!uri) { return false; }
    try {
      fs.writeFileSync(uri.fsPath, buildThemeFile(entries), 'utf8');
    } catch (err) {
      vscode.window.showErrorMessage(`MD Reader: could not write ${uri.fsPath}: ${(err as Error).message}`);
      return false;
    }
    vscode.window.showInformationMessage(
      `MD Reader: exported ${entries.length} theme${entries.length === 1 ? '' : 's'}.`);
    return true;
  }

  async importThemes(): Promise<void> {
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: true,
      canSelectFiles: true,
      canSelectFolders: false,
      filters: { 'MD Reader themes': ['json'] },
      openLabel: 'Import Themes',
    });
    if (!uris || uris.length === 0) { return; }

    const incoming: ThemeFileEntry[] = [];
    const problems: string[] = [];
    for (const uri of uris) {
      const name = uri.fsPath.split(/[\\/]/).pop() ?? uri.fsPath;
      try {
        if (fs.statSync(uri.fsPath).size > MAX_IMPORT_BYTES) { problems.push(`${name}: file too large`); continue; }
        const { themes, error } = parseThemeFile(fs.readFileSync(uri.fsPath, 'utf8'));
        if (error) { problems.push(`${name}: ${error}`); }
        incoming.push(...themes);
      } catch (err) {
        problems.push(`${name}: ${(err as Error).message}`);
      }
    }

    const themes = this.config.getSavedThemes();
    const conflicts = incoming.filter(t => themes[t.id]);
    // One decision for every conflict, so a bulk import isn't a string of prompts.
    let onConflict: ConflictChoice = 'Keep both';
    if (conflicts.length > 0) {
      const choice = await vscode.window.showWarningMessage(
        `${conflicts.length} imported theme${conflicts.length === 1 ? '' : 's'} already exist${conflicts.length === 1 ? 's' : ''} ` +
        `(${conflicts.slice(0, 3).map(t => `"${t.label}"`).join(', ')}${conflicts.length > 3 ? ', …' : ''}). What should happen?`,
        { modal: true }, 'Replace', 'Keep both', 'Skip');
      if (!choice) { return; }
      onConflict = choice as ConflictChoice;
    }

    let added = 0;
    let skippedForLimit = 0;
    for (const t of incoming) {
      const { id: wantedId, ...theme } = t;
      let id = wantedId;
      if (themes[id]) {
        if (onConflict === 'Skip') { continue; }
        if (onConflict === 'Keep both') { id = uniqueId(id, Object.keys(themes)); }
      }
      if (!themes[id] && Object.keys(themes).length >= MAX_THEMES) { skippedForLimit++; continue; }
      themes[id] = theme;
      added++;
    }
    if (added > 0) { await this.config.setSavedThemes(themes); }

    const notes: string[] = [];
    if (skippedForLimit) { notes.push(`${skippedForLimit} skipped (limit of ${MAX_THEMES})`); }
    if (problems.length) { notes.push(`problems: ${problems.join('; ')}`); }
    const summary = `MD Reader: imported ${added} theme${added === 1 ? '' : 's'}.` + (notes.length ? ` ${notes.join(' — ')}` : '');
    if (problems.length) { vscode.window.showWarningMessage(summary); }
    else { vscode.window.showInformationMessage(summary); }
  }

  /** Command-palette cleanup before uninstalling: confirm, offer a backup. */
  async deleteAll(): Promise<void> {
    const themes = this.config.getSavedThemes();
    const count = Object.keys(themes).length;
    if (count === 0) {
      vscode.window.showInformationMessage('MD Reader: there are no custom themes to delete.');
      return;
    }
    const choice = await vscode.window.showWarningMessage(
      `Delete all ${count} custom theme${count === 1 ? '' : 's'}? This cannot be undone.`,
      { modal: true }, 'Export a backup first', 'Delete');
    if (!choice) { return; }
    if (choice === 'Export a backup first') {
      // A cancelled export aborts the delete — never lose themes by accident.
      if (!(await this.exportThemes())) { return; }
    }
    await this.config.setSavedThemes({});
    await this.deselectIfMissing({});
    vscode.window.showInformationMessage('MD Reader: all custom themes deleted.');
  }

  private async deselectIfMissing(themes: Record<string, unknown>): Promise<void> {
    const current = vscode.workspace.getConfiguration('mdReader').inspect<string>('theme')?.globalValue;
    if (typeof current === 'string' && current.startsWith(CUSTOM_PREFIX) && !themes[current.slice(CUSTOM_PREFIX.length)]) {
      await this.config.set('theme', 'auto');
    }
  }
}
