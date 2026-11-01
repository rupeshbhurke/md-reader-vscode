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
];

const TOKEN_KEYS = new Set(THEME_TOKENS.map(t => t.key));

export interface CustomTheme {
  label: string;
  base: ThemeBase;
  colors: Record<string, string>;
}
export type CustomThemes = Record<string, CustomTheme>;

export const CUSTOM_PREFIX = 'custom:';
export const MAX_THEMES = 50;
export const MAX_LABEL = 40;
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
  if (r.colors && typeof r.colors === 'object') {
    for (const [k, v] of Object.entries(r.colors as Record<string, unknown>)) {
      if (TOKEN_KEYS.has(k) && isValidColor(v)) { colors[k] = v; }
    }
  }
  return { label, base, colors };
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

/** The built-in theme a `theme` setting value ultimately renders on. */
export function effectiveBase(theme: string, themes: CustomThemes): string {
  if (theme.startsWith(CUSTOM_PREFIX)) {
    return themes[theme.slice(CUSTOM_PREFIX.length)]?.base ?? 'auto';
  }
  return theme;
}

/** A `theme` value that points at a deleted/unknown custom theme → 'auto'. */
export function resolveThemeValue(theme: unknown, themes: CustomThemes): string {
  if (typeof theme !== 'string') { return 'auto'; }
  if (theme.startsWith(CUSTOM_PREFIX)) {
    return themes[theme.slice(CUSTOM_PREFIX.length)] ? theme : 'auto';
  }
  return theme;
}

/** CSS rule overriding the base theme's variables, for standalone HTML export. */
export function themeCss(theme: string, themes: CustomThemes): string {
  if (!theme.startsWith(CUSTOM_PREFIX)) { return ''; }
  const t = themes[theme.slice(CUSTOM_PREFIX.length)];
  if (!t) { return ''; }
  const decls: string[] = [];
  for (const token of THEME_TOKENS) {
    const value = t.colors[token.key];
    if (value) { for (const v of token.vars) { decls.push(`${v}:${value}`); } }
  }
  return decls.length ? `:root{${decls.join(';')}}` : '';
}

// ── Export / import file format ───────────────────────────────────────────────

export const FILE_FORMAT_VERSION = 1;

export interface ThemeFileEntry extends CustomTheme { id: string; }

export function buildThemeFile(entries: ThemeFileEntry[]): string {
  return JSON.stringify({ mdReaderTheme: FILE_FORMAT_VERSION, themes: entries }, null, 2) + '\n';
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
