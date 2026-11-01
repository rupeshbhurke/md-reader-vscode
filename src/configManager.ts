import * as vscode from 'vscode';
import { CustomThemes, resolveCodeTheme, resolveThemeValue, sanitizeThemes } from './themes';
import { Layouts, resolveLayout } from './layouts';

const THEMES = ['auto', 'light', 'dark', 'sepia'] as const;
const WIDTHS  = ['narrow', 'medium', 'wide', 'wider', 'ultra', 'full'] as const;
const FRONT_MATTER_MODES = ['card', 'hide', 'raw'] as const;

export type BuiltinTheme = typeof THEMES[number];
/** A built-in theme name, or `custom:<id>` for a user theme (see themes.ts). */
export type Theme = string;
export type ReadingWidth = typeof WIDTHS[number];
export type FrontMatterMode = typeof FRONT_MATTER_MODES[number];

export interface ReaderConfig {
  theme: Theme;
  customThemes: CustomThemes;
  /** Layout id (typography/spacing), see layouts.ts. */
  layout: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  readingWidth: ReadingWidth;
  codeTheme: string;
  scrollSync: boolean;
  blueLightFilter: number;
  openBeside: boolean;
  showReadingTime: boolean;
  readingSpeed: number;
  frontMatter: FrontMatterMode;
}

/**
 * Settings the settings-drawer webview is allowed to write back via an
 * `updateSetting` message. Deliberately excludes fields with no drawer
 * control (codeTheme, openBeside) — those are only ever set
 * through the Settings UI (`vscode.workspace.getConfiguration`) or command
 * palette, never from webview-supplied input.
 */
export const SETTABLE_KEYS: readonly (keyof ReaderConfig)[] = [
  'theme', 'layout', 'fontFamily', 'fontSize', 'lineHeight',
  'readingWidth', 'scrollSync', 'blueLightFilter',
];

/** Defaults for every setting, keyed by its ReaderConfig field name (not its `mdReader.` id). */
const DEFAULTS: ReaderConfig = {
  theme: 'auto',
  customThemes: {},
  layout: 'standard',
  fontFamily: "Georgia, 'Times New Roman', serif",
  fontSize: 17,
  lineHeight: 1.85,
  readingWidth: 'medium',
  codeTheme: 'github-dark',
  scrollSync: false,
  blueLightFilter: 0,
  openBeside: true,
  showReadingTime: true,
  readingSpeed: 230,
  frontMatter: 'card',
};

export class ConfigManager {
  /** Starter themes loaded from the extension's `themes/` folder at activation (read-only). */
  starters: CustomThemes = {};

  /** Layouts loaded from the extension's `layouts/` folder at activation (read-only). */
  layouts: Layouts = {};

  get(): ReaderConfig {
    const cfg = vscode.workspace.getConfiguration('mdReader');
    const result = {} as ReaderConfig;
    for (const key of Object.keys(DEFAULTS) as (keyof ReaderConfig)[]) {
      (result as any)[key] = cfg.get(key, DEFAULTS[key]);
    }
    // Themes come from user-editable settings.json: never trust the shape,
    // and a `theme` pointing at a deleted custom theme falls back to auto.
    result.customThemes = sanitizeThemes(result.customThemes);
    result.theme = resolveThemeValue(result.theme, result.customThemes, this.starters);
    result.codeTheme = resolveCodeTheme(result.codeTheme);
    result.layout = resolveLayout(result.layout, this.layouts);
    return result;
  }

  /**
   * The user's own saved themes, as written at the user (Global) level —
   * the only level this extension ever writes, so workspace-level entries
   * are never copied into user settings by accident.
   */
  getSavedThemes(): CustomThemes {
    const inspected = vscode.workspace.getConfiguration('mdReader').inspect<CustomThemes>('customThemes');
    return sanitizeThemes(inspected?.globalValue);
  }

  async setSavedThemes(themes: CustomThemes): Promise<void> {
    await this.set('customThemes', themes);
  }

  /** Persist a single setting. `key` is the ReaderConfig field name, which matches its `mdReader.<key>` id. */
  async set<K extends keyof ReaderConfig>(key: K, value: ReaderConfig[K]): Promise<void> {
    await vscode.workspace.getConfiguration('mdReader')
      .update(key, value, vscode.ConfigurationTarget.Global);
  }

  nextTheme(current: BuiltinTheme): BuiltinTheme {
    const idx = THEMES.indexOf(current);
    return THEMES[(idx + 1) % THEMES.length];
  }

  nextWidth(current: ReadingWidth): ReadingWidth {
    const idx = WIDTHS.indexOf(current);
    return WIDTHS[(idx + 1) % WIDTHS.length];
  }
}
