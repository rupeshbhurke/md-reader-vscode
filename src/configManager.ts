import * as vscode from 'vscode';

const THEMES = ['auto', 'light', 'dark', 'sepia'] as const;
const WIDTHS  = ['narrow', 'medium', 'wide', 'wider', 'ultra', 'full'] as const;

export type Theme = typeof THEMES[number];
export type ReadingWidth = typeof WIDTHS[number];

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
}

export class ConfigManager {
  get(): ReaderConfig {
    const cfg = vscode.workspace.getConfiguration('mdReader');
    return {
      theme:        cfg.get<Theme>('theme', 'auto'),
      fontFamily:   cfg.get<string>('fontFamily', "Georgia, 'Times New Roman', serif"),
      fontSize:     cfg.get<number>('fontSize', 17),
      lineHeight:   cfg.get<number>('lineHeight', 1.85),
      readingWidth: cfg.get<ReadingWidth>('readingWidth', 'medium'),
      showTOC:      cfg.get<boolean>('showTOC', true),
      codeTheme:    cfg.get<string>('codeTheme', 'github-dark'),
      scrollSync:   cfg.get<boolean>('scrollSync') ?? false,
      blueLightFilter: cfg.get<number>('blueLightFilter') ?? 0,
      openBeside:   cfg.get<boolean>('openBeside') ?? true,
    };
  }

  async setTheme(theme: Theme): Promise<void> {
    await vscode.workspace.getConfiguration('mdReader')
      .update('theme', theme, vscode.ConfigurationTarget.Global);
  }

  async setWidth(width: ReadingWidth): Promise<void> {
    await vscode.workspace.getConfiguration('mdReader')
      .update('readingWidth', width, vscode.ConfigurationTarget.Global);
  }

  async setScrollSync(value: boolean): Promise<void> {
    await vscode.workspace.getConfiguration('mdReader')
      .update('scrollSync', value, vscode.ConfigurationTarget.Global);
  }

  async setBlueLightFilter(value: number): Promise<void> {
    await vscode.workspace.getConfiguration('mdReader')
      .update('blueLightFilter', value, vscode.ConfigurationTarget.Global);
  }

  async setFontFamily(fontFamily: string): Promise<void> {
    await vscode.workspace.getConfiguration('mdReader')
      .update('fontFamily', fontFamily, vscode.ConfigurationTarget.Global);
  }

  async setFontSize(fontSize: number): Promise<void> {
    await vscode.workspace.getConfiguration('mdReader')
      .update('fontSize', fontSize, vscode.ConfigurationTarget.Global);
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
