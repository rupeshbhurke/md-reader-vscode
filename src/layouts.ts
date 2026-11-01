/**
 * Layouts: the typography/spacing half of a reading style, independent of the
 * colour theme (any theme works with any layout). A layout controls heading
 * font/weight/scale/spacing/rules and paragraph spacing/indent. Body font,
 * size, line height and reading width deliberately stay the user's own
 * settings — they are personal accessibility preferences a layout must not
 * override.
 *
 * Layouts are data: each `layouts/*.mdlayout.json` is loaded at activation
 * (see layoutLoader.ts). Pure — no `vscode` import — so it is unit-tested.
 * Every value is validated against LAYOUT_SPEC (type + range) so a shared file
 * cannot inject CSS; invalid values are dropped and fall back to the defaults
 * in reader.css `:root`, which the `standard` layout mirrors (a test enforces it).
 */

export interface LayoutSpec {
  /** Flat key used in memory. */
  key: string;
  /** Location in a layout file, e.g. ['headings', 'scale', 'h1']. */
  path: string[];
  /** CSS custom property in reader.css this value drives. */
  cssVar: string;
  kind: 'font' | 'number';
  unit: '' | 'em' | 'px';
  min?: number;
  max?: number;
}

const sizeSpec = (level: number): LayoutSpec => ({
  key: `h${level}Size`, path: ['headings', 'scale', `h${level}`], cssVar: `--h${level}-size`,
  kind: 'number', unit: 'em', min: 0.6, max: 4,
});

export const LAYOUT_SPEC: readonly LayoutSpec[] = [
  { key: 'headingFont',        path: ['headings', 'font'],         cssVar: '--h-font',         kind: 'font',   unit: '' },
  { key: 'headingWeight',      path: ['headings', 'weight'],       cssVar: '--h-weight',       kind: 'number', unit: '',   min: 300, max: 900 },
  { key: 'headingLineHeight',  path: ['headings', 'lineHeight'],   cssVar: '--h-line',         kind: 'number', unit: '',   min: 1,   max: 2.2 },
  { key: 'headingSpaceBefore', path: ['headings', 'spaceBefore'],  cssVar: '--h-space-before', kind: 'number', unit: 'em', min: 0,   max: 5 },
  { key: 'headingSpaceAfter',  path: ['headings', 'spaceAfter'],   cssVar: '--h-space-after',  kind: 'number', unit: 'em', min: 0,   max: 3 },
  sizeSpec(1), sizeSpec(2), sizeSpec(3), sizeSpec(4), sizeSpec(5), sizeSpec(6),
  { key: 'h1Rule',             path: ['headings', 'rules', 'h1'],  cssVar: '--h1-rule',        kind: 'number', unit: 'px', min: 0,   max: 6 },
  { key: 'h2Rule',             path: ['headings', 'rules', 'h2'],  cssVar: '--h2-rule',        kind: 'number', unit: 'px', min: 0,   max: 6 },
  { key: 'paragraphSpace',     path: ['paragraphs', 'space'],      cssVar: '--p-space',        kind: 'number', unit: 'em', min: 0,   max: 3 },
  { key: 'paragraphIndent',    path: ['paragraphs', 'indent'],     cssVar: '--p-indent',       kind: 'number', unit: 'em', min: 0,   max: 4 },
];

export interface Layout {
  label: string;
  author?: string;
  version?: string;
  /** Only valid values, keyed by LAYOUT_SPEC key. */
  values: Record<string, string | number>;
}
export type Layouts = Record<string, Layout>;
export interface LayoutFileEntry extends Layout { id: string; }

export const LAYOUT_FILE_VERSION = 1;
export const DEFAULT_LAYOUT = 'standard';
export const MAX_LAYOUTS = 50;

const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const VERSION_RE = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,19}$/;
// Letters, digits, spaces and the punctuation of a font-family list. No ; { } ( ) so it cannot end the declaration.
const FONT_RE = /^[A-Za-z0-9 ,'"._-]{1,120}$/;

function getPath(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const part of path) {
    if (!cur || typeof cur !== 'object' || Array.isArray(cur)) { return undefined; }
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function isValidLayoutId(id: string): boolean { return ID_RE.test(id); }

/** A clean layout from an untrusted file/object; undefined if it isn't an object at all. */
export function sanitizeLayout(raw: unknown, fallbackLabel = 'Layout'): Layout | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
  const r = raw as Record<string, unknown>;
  const label = (typeof r.label === 'string' ? r.label.trim() : '').slice(0, 40) || fallbackLabel;
  const values: Record<string, string | number> = {};
  for (const spec of LAYOUT_SPEC) {
    const v = getPath(r, spec.path);
    if (spec.kind === 'font') {
      if (typeof v === 'string' && FONT_RE.test(v.trim())) { values[spec.key] = v.trim(); }
    } else if (typeof v === 'number' && Number.isFinite(v) && v >= (spec.min ?? -Infinity) && v <= (spec.max ?? Infinity)) {
      values[spec.key] = v;
    }
  }
  const layout: Layout = { label, values };
  const author = typeof r.author === 'string' ? r.author.trim().slice(0, 60) : '';
  if (author) { layout.author = author; }
  if (typeof r.version === 'string' && VERSION_RE.test(r.version.trim())) { layout.version = r.version.trim(); }
  return layout;
}

/** Parses a layout file. Never throws. */
export function parseLayoutFile(text: string): { layout?: LayoutFileEntry; error?: string } {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { error: 'not valid JSON' }; }
  if (!data || typeof data !== 'object' || typeof (data as any).mdReaderLayout !== 'number') {
    return { error: 'not an MD Reader layout file' };
  }
  if ((data as any).mdReaderLayout > LAYOUT_FILE_VERSION) { return { error: 'made by a newer version of MD Reader' }; }
  const layout = sanitizeLayout(data);
  const id = (data as any).id;
  if (!layout || typeof id !== 'string' || !ID_RE.test(id)) { return { error: 'missing or invalid id' }; }
  return { layout: { id, ...layout } };
}

/** A layout value that names a missing layout falls back to the default. */
export function resolveLayout(value: unknown, layouts: Layouts): string {
  return typeof value === 'string' && layouts[value] ? value : DEFAULT_LAYOUT;
}

/** CSS custom properties (`--h1-size` -> `2em`) for one layout. */
export function layoutVars(layout: Layout): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const spec of LAYOUT_SPEC) {
    const v = layout.values[spec.key];
    if (v !== undefined) { vars[spec.cssVar] = `${v}${spec.unit}`; }
  }
  return vars;
}

/** What the webview needs: label + ready-to-apply CSS variables, per layout id. */
export function layoutsForWebview(layouts: Layouts): Record<string, { label: string; vars: Record<string, string> }> {
  const out: Record<string, { label: string; vars: Record<string, string> }> = {};
  for (const [id, l] of Object.entries(layouts)) { out[id] = { label: l.label, vars: layoutVars(l) }; }
  return out;
}

/** A `:root` rule for standalone HTML export (empty if the layout is unknown). */
export function layoutCss(layoutId: string, layouts: Layouts): string {
  const layout = layouts[layoutId];
  if (!layout) { return ''; }
  const decls = Object.entries(layoutVars(layout)).map(([k, v]) => `${k}:${v}`);
  return decls.length ? `:root{${decls.join(';')}}` : '';
}
