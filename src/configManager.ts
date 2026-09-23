import * as vscode from 'vscode';

const THEMES = ['auto', 'light', 'dark', 'sepia'] as const;
const WIDTHS  = ['narrow', 'medium', 'wide', 'wider', 'ultra', 'full'] as const;
const FRONT_MATTER_MODES = ['card', 'hide', 'raw'] as const;

export type Theme = typeof THEMES[number];
export type ReadingWidth = typeof WIDTHS[number];
export type FrontMatterMode = typeof FRONT_MATTER_MODES[number];

export interface ReaderConfig {
  theme: Theme;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  readingWidth: ReadingWidth;
  showTOC: boolean;
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
 * control (showTOC, codeTheme, openBeside) — those are only ever set
 * through the Settings UI (`vscode.workspace.getConfiguration`) or command
 * palette, never from webview-supplied input.
 */
export const SETTABLE_KEYS: readonly (keyof ReaderConfig)[] = [
  'theme', 'fontFamily', 'fontSize', 'lineHeight',
  'readingWidth', 'scrollSync', 'blueLightFilter',
];

/** Defaults for every setting, keyed by its ReaderConfig field name (not its `mdReader.` id). */
const DEFAULTS: ReaderConfig = {
  theme: 'auto',
  fontFamily: "Georgia, 'Times New Roman', serif",
  fontSize: 17,
  lineHeight: 1.85,
  readingWidth: 'medium',
  showTOC: true,
  codeTheme: 'github-dark',
  scrollSync: false,
  blueLightFilter: 0,
  openBeside: true,
  showReadingTime: true,
  readingSpeed: 230,
  frontMatter: 'card',
};

export class ConfigManager {
  get(): ReaderConfig {
    const cfg = vscode.workspace.getConfiguration('mdReader');
    const result = {} as ReaderConfig;
    for (const key of Object.keys(DEFAULTS) as (keyof ReaderConfig)[]) {
      (result as any)[key] = cfg.get(key, DEFAULTS[key]);
    }
    return result;
  }

  /** Persist a single setting. `key` is the ReaderConfig field name, which matches its `mdReader.<key>` id. */
  async set<K extends keyof ReaderConfig>(key: K, value: ReaderConfig[K]): Promise<void> {
    await vscode.workspace.getConfiguration('mdReader')
      .update(key, value, vscode.ConfigurationTarget.Global);
  }

  nextTheme(current: Theme): Theme {
    const idx = THEMES.indexOf(current);
    return THEMES[(idx + 1) % THEMES.length];
  }

  nextWidth(current: ReadingWidth): ReadingWidth {
    const idx = WIDTHS.indexOf(current);
    return WIDTHS[(idx + 1) % WIDTHS.length];
  }
}
