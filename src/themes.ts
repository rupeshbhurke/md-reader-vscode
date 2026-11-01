/**
 * Custom theme model + validation. Pure (no `vscode` import) so it can be
 * shared by configManager, themeManager and panelManager.
 *
 * A custom theme stores only the colours the user changed plus a `base`
 * built-in theme; anything unset falls back to the base. That keeps saved
 * themes forward-compatible when a release adds new tokens.
 *
 * The token list here must stay in sync with the `mdReader.customThemes`
 * schema in package.json (the `colors` properties).
 */

export const THEME_BASES = ['light', 'dark', 'sepia'] as const;
export type ThemeBase = typeof THEME_BASES[number];

export interface ThemeToken {
  /** Key used in the stored `colors` object. */
  key: string;
  label: string;
  group: string;
  /** CSS custom properties (see reader.css) this token drives. */
  vars: string[];
}

export const THEME_TOKENS: readonly ThemeToken[] = [
  { key: 'bg',          label: 'Page background',   group: 'Surfaces', vars: ['--bg'] },
  { key: 'bgAlt',       label: 'Alt background',    group: 'Surfaces', vars: ['--bg-alt', '--table-head-bg'] },
  { key: 'surface',     label: 'Panels & drawer',   group: 'Surfaces', vars: ['--surface', '--toc-bg'] },
  { key: 'border',      label: 'Borders',           group: 'Surfaces', vars: ['--border'] },
  { key: 'text',        label: 'Text',              group: 'Text',     vars: ['--text'] },
  { key: 'textMuted',   label: 'Muted text',        group: 'Text',     vars: ['--text-muted', '--text-subtle'] },
  { key: 'accent',      label: 'Accent & links',    group: 'Accent',   vars: ['--accent', '--accent-hover', '--link', '--link-hover', '--progress-color', '--blockquote-border'] },
  { key: 'selection',   label: 'Text selection',    group: 'Accent',   vars: ['--selection-bg'] },
  { key: 'codeBg',      label: 'Inline code bg',    group: 'Code',     vars: ['--code-bg'] },
  { key: 'codeText',    label: 'Inline code text',  group: 'Code',     vars: ['--code-text'] },
  { key: 'preBg',       label: 'Code block bg',     group: 'Code',     vars: ['--pre-bg'] },
  { key: 'preText',     label: 'Code block text',   group: 'Code',     vars: ['--pre-text'] },
  { key: 'quoteBg',     label: 'Blockquote bg',     group: 'Content',  vars: ['--blockquote-bg'] },
  { key: 'tableStripe', label: 'Table stripe',      group: 'Content',  vars: ['--table-stripe'] },
  { key: 'hlKeyword', label: 'Keyword', group: 'Syntax', vars: ['--hl-keyword'] },
  { key: 'hlString', label: 'String', group: 'Syntax', vars: ['--hl-string'] },
  { key: 'hlComment', label: 'Comment', group: 'Syntax', vars: ['--hl-comment'] },
  { key: 'hlNumber', label: 'Number & literal', group: 'Syntax', vars: ['--hl-number'] },
  { key: 'hlTitle', label: 'Function name', group: 'Syntax', vars: ['--hl-title'] },
  { key: 'hlType', label: 'Type / class', group: 'Syntax', vars: ['--hl-type'] },
  { key: 'hlVariable', label: 'Variable', group: 'Syntax', vars: ['--hl-variable'] },
  { key: 'hlAttr', label: 'Attribute', group: 'Syntax', vars: ['--hl-attr'] },
  { key: 'hlMeta', label: 'Meta / symbol', group: 'Syntax', vars: ['--hl-meta'] },
  { key: 'hlBuiltIn', label: 'Built-in', group: 'Syntax', vars: ['--hl-built-in'] },
];

const TOKEN_KEYS = new Set(THEME_TOKENS.map(t => t.key));

/** Code-block syntax palettes (`mdReader.codeTheme`). Defined as CSS variables in reader.css. */
export const CODE_THEMES = ['github-dark', 'github-light', 'monokai', 'atom-one-dark', 'vs2015'] as const;
export const DEFAULT_CODE_THEME = 'github-dark';
export function resolveCodeTheme(value: unknown): string {
  return (CODE_THEMES as readonly unknown[]).includes(value) ? (value as string) : DEFAULT_CODE_THEME;
}

export interface CustomTheme {
  label: string;
  base: ThemeBase;
  colors: Record<string, string>;
  /** Optional credit, kept through export/import. */
  author?: string;
  /** Optional revision of the theme itself (e.g. "1.1.0"), so a shipped theme can be improved over time. */
  version?: string;
  /** Optional dropdown group (e.g. "Light", "Dark"); only used for starter themes. */
  category?: string;
}
export type CustomThemes = Record<string, CustomTheme>;

export const CUSTOM_PREFIX = 'custom:';
export const STARTER_PREFIX = 'starter:';
export const MAX_THEMES = 50;
export const MAX_LABEL = 40;
export const MAX_AUTHOR = 60;
const VERSION_RE = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,19}$/;
const CATEGORY_RE = /^[\w &-]{1,24}$/;

/**
 * Grouped colour names, used in theme *files* (export / starter themes) because
 * they read better than a flat list: `colors.ink.primary`, `colors.code.blockBackground`.
 * In memory, in settings and on the wire themes always use the flat token keys
 * (`text`, `preBg`, ...), so saved themes and older extension versions are unaffected.
 * Both shapes are accepted everywhere a theme is read.
 * Every flat token appears exactly once here (a test enforces it).
 */
export const COLOR_GROUPS: Record<string, Record<string, string>> = {
  surfaces: { page: 'bg', alt: 'bgAlt', panel: 'surface', quote: 'quoteBg', stripe: 'tableStripe' },
  lines: { border: 'border' },
  ink: { primary: 'text', muted: 'textMuted' },
  emphasis: { link: 'accent', selection: 'selection' },
  code: { inlineBackground: 'codeBg', inlineText: 'codeText', blockBackground: 'preBg', blockText: 'preText' },
  syntax: {
    keyword: 'hlKeyword', string: 'hlString', comment: 'hlComment', number: 'hlNumber', title: 'hlTitle',
    type: 'hlType', variable: 'hlVariable', attr: 'hlAttr', meta: 'hlMeta', builtIn: 'hlBuiltIn',
  },
};

/** Accepts flat keys, grouped colours, or a mix (flat wins on a clash) and returns flat, untrusted values. */
export function flattenColors(raw: unknown): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return flat; }
  const entries = Object.entries(raw as Record<string, unknown>);
  for (const [group, value] of entries) {
    const names = COLOR_GROUPS[group];
    if (names && value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [name, color] of Object.entries(value as Record<string, unknown>)) {
        if (names[name]) { flat[names[name]] = color; }
      }
    }
  }
  for (const [key, value] of entries) {
    if (typeof value === 'string' && TOKEN_KEYS.has(key)) { flat[key] = value; }
  }
  return flat;
}

/** Flat colours -> the grouped shape written to theme files. Group and name order is stable. */
export function groupColors(flat: Record<string, string>): Record<string, Record<string, string>> {
  const grouped: Record<string, Record<string, string>> = {};
  for (const [group, names] of Object.entries(COLOR_GROUPS)) {
    for (const [name, key] of Object.entries(names)) {
      if (flat[key] !== undefined) { (grouped[group] ??= {})[name] = flat[key]; }
    }
  }
  return grouped;
}
const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

// Hex or rgb()/hsl() with only digits, separators and units. Deliberately
// no url(), var(), named colours or anything else that could smuggle CSS in.
const HEX_RE = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNC_RE = /^(?:rgb|hsl)a?\(\s*[0-9.]+(?:deg|%)?(?:\s*[,\s/]\s*[0-9.]+%?){2,3}\s*\)$/i;

export function isValidColor(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 64 && (HEX_RE.test(v) || FUNC_RE.test(v));
}

export function isValidId(id: string): boolean {
  return ID_RE.test(id);
}

export function slugify(label: string): string {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return slug || 'theme';
}

/** `base` if free, else `base-2`, `base-3`, ... */
export function uniqueId(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) { return base; }
  for (let n = 2; ; n++) {
    const candidate = `${base.slice(0, 36)}-${n}`;
    if (!used.has(candidate)) { return candidate; }
  }
}

/** Returns a clean theme, or undefined if `raw` isn't usable at all. */
export function sanitizeTheme(raw: unknown, fallbackLabel = 'Theme'): CustomTheme | undefined {
  if (!raw || typeof raw !== 'object') { return undefined; }
  const r = raw as Record<string, unknown>;
  const label = (typeof r.label === 'string' ? r.label.trim() : '').slice(0, MAX_LABEL) || fallbackLabel;
  const base = (THEME_BASES as readonly unknown[]).includes(r.base) ? (r.base as ThemeBase) : 'light';
  const colors: Record<string, string> = {};
  for (const [k, v] of Object.entries(flattenColors(r.colors))) {
    if (TOKEN_KEYS.has(k) && isValidColor(v)) { colors[k] = v; }
  }
  const theme: CustomTheme = { label, base, colors };
  const author = typeof r.author === 'string' ? r.author.trim().slice(0, MAX_AUTHOR) : '';
  if (author) { theme.author = author; }
  if (typeof r.version === 'string' && VERSION_RE.test(r.version.trim())) { theme.version = r.version.trim(); }
  if (typeof r.category === 'string' && CATEGORY_RE.test(r.category.trim())) { theme.category = r.category.trim(); }
  return theme;
}

/** Sanitises a stored map; invalid entries are dropped, never thrown on. */
export function sanitizeThemes(raw: unknown): CustomThemes {
  const out: CustomThemes = {};
  if (!raw || typeof raw !== 'object') { return out; }
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_THEMES) { break; }
    if (!isValidId(id)) { continue; }
    const theme = sanitizeTheme(value, id);
    if (theme) { out[id] = theme; }
  }
  return out;
}

/**
 * The theme definition behind a `custom:<id>` or `starter:<id>` value, if any.
 * Custom themes come from the user's settings; starter themes are theme files
 * shipped in the extension's `themes/` folder (same format as an export) and
 * are read-only until added to the user's own themes.
 */
export function lookupTheme(theme: string, custom: CustomThemes, starters: CustomThemes): CustomTheme | undefined {
  if (theme.startsWith(CUSTOM_PREFIX)) { return custom[theme.slice(CUSTOM_PREFIX.length)]; }
  if (theme.startsWith(STARTER_PREFIX)) { return starters[theme.slice(STARTER_PREFIX.length)]; }
  return undefined;
}

/** The built-in theme a `theme` setting value ultimately renders on. */
export function effectiveBase(theme: string, custom: CustomThemes, starters: CustomThemes): string {
  if (theme.startsWith(CUSTOM_PREFIX) || theme.startsWith(STARTER_PREFIX)) {
    return lookupTheme(theme, custom, starters)?.base ?? 'auto';
  }
  return theme;
}

/** A `custom:`/`starter:` value pointing at a deleted/unknown theme -> 'auto'. */
export function resolveThemeValue(theme: unknown, custom: CustomThemes, starters: CustomThemes): string {
  if (typeof theme !== 'string') { return 'auto'; }
  if (theme.startsWith(CUSTOM_PREFIX) || theme.startsWith(STARTER_PREFIX)) {
    return lookupTheme(theme, custom, starters) ? theme : 'auto';
  }
  return theme;
}

/** CSS rule overriding the base theme's variables, for standalone HTML export. */
export function themeCss(theme: string, custom: CustomThemes, starters: CustomThemes): string {
  const t = lookupTheme(theme, custom, starters);
  if (!t) { return ''; }
  const decls: string[] = [];
  for (const token of THEME_TOKENS) {
    const value = t.colors[token.key];
    if (value) { for (const v of token.vars) { decls.push(`${v}:${value}`); } }
  }
  return decls.length ? `:root{${decls.join(';')}}` : '';
}

/** WCAG relative luminance of a #rgb/#rrggbb colour, or undefined for anything else. */
function hexLuminance(color: string): number | undefined {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);
  if (!m) { return undefined; }
  const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
  const [r, g, b] = [0, 2, 4].map(i => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The syntax palette to actually use for HTML export (the live reader does the
 * same check against the computed style). A light palette on a dark code block,
 * or the reverse, is unreadable, so a polarity mismatch against the theme's own
 * code-block colour falls back to the matching GitHub palette. A theme that
 * sets its own syntax colours is left alone — it overrides the palette anyway.
 */
export function codeThemeFor(codeTheme: string, theme: string, custom: CustomThemes, starters: CustomThemes): string {
  const base = resolveCodeTheme(codeTheme);
  const t = lookupTheme(theme, custom, starters);
  const preBg = t?.colors.preBg;
  const lum = preBg ? hexLuminance(preBg) : undefined;
  if (lum === undefined) { return base; }
  if (base === 'github-light' && lum < 0.35) { return 'github-dark'; }
  if (base !== 'github-light' && lum > 0.6) { return 'github-light'; }
  return base;
}

// ── Export / import file format ───────────────────────────────────────────────

/** 2 = grouped colours, `version`, `category`. Version-1 files (flat colours) are still read. */
export const FILE_FORMAT_VERSION = 2;

export interface ThemeFileEntry extends CustomTheme { id: string; }

export function buildThemeFile(entries: ThemeFileEntry[]): string {
  const themes = entries.map(e => ({ ...e, colors: groupColors(e.colors) }));
  return JSON.stringify({ mdReaderTheme: FILE_FORMAT_VERSION, themes }, null, 2) + '\n';
}

/**
 * Parses an export bundle (`{mdReaderTheme, themes:[...]}`) or a bare single
 * theme object (`{mdReaderTheme, id?, label, base, colors}`). Never throws.
 */
export function parseThemeFile(text: string): { themes: ThemeFileEntry[]; error?: string } {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { themes: [], error: 'not valid JSON' }; }
  if (!data || typeof data !== 'object' || typeof (data as any).mdReaderTheme !== 'number') {
    return { themes: [], error: 'not an MD Reader theme file' };
  }
  const d = data as Record<string, unknown>;
  if ((d.mdReaderTheme as number) > FILE_FORMAT_VERSION) {
    return { themes: [], error: 'made by a newer version of MD Reader' };
  }
  const rawList: unknown[] = Array.isArray(d.themes) ? d.themes : [d];
  const themes: ThemeFileEntry[] = [];
  for (const item of rawList) {
    const theme = sanitizeTheme(item);
    if (!theme) { continue; }
    const rawId = item && typeof (item as any).id === 'string' ? (item as any).id : '';
    const id = isValidId(rawId) ? rawId : slugify(theme.label);
    themes.push({ id, ...theme });
  }
  return themes.length ? { themes } : { themes, error: 'no usable themes in file' };
}
