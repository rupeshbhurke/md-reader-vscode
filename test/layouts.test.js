const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { layouts, layoutLoader, readText, root } = require('./helpers');

const L = layouts();
const dir = path.join(root, 'layouts');
const loaded = layoutLoader().loadLayouts(dir);
const ids = Object.keys(loaded);
const css = readText('src', 'webview', 'reader.css');

// ── validation ────────────────────────────────────────────────────────────────

const ok = { label: 'x', headings: { weight: 700, scale: { h1: 2 }, spaceBefore: 2, font: "Georgia, 'Times New Roman', serif" }, paragraphs: { space: 1, indent: 1.5 } };

test('sanitizeLayout keeps valid values and maps file paths to flat keys', () => {
  const s = L.sanitizeLayout(ok);
  assert.deepEqual(s.values, { headingFont: "Georgia, 'Times New Roman', serif", headingWeight: 700, headingSpaceBefore: 2, h1Size: 2, paragraphSpace: 1, paragraphIndent: 1.5 });
});

test('sanitizeLayout drops out-of-range, wrong-type and non-finite numbers', () => {
  const s = L.sanitizeLayout({ label: 'x', headings: { weight: 5000, spaceBefore: -1, spaceAfter: '2', lineHeight: NaN, scale: { h1: 99, h2: 1.5 } }, paragraphs: { space: Infinity } });
  assert.deepEqual(s.values, { h2Size: 1.5 });
});

test('sanitizeLayout rejects fonts that could carry CSS', () => {
  for (const font of ['Arial; color:red', 'x}body{display:none', 'url(http://x)', 'Arial)', '"; x', '', 'a'.repeat(200), 5]) {
    assert.ok(!('headingFont' in L.sanitizeLayout({ headings: { font } }).values), `should reject ${String(font).slice(0, 30)}`);
  }
  assert.equal(L.sanitizeLayout({ headings: { font: "'Segoe UI', system-ui, sans-serif" } }).values.headingFont, "'Segoe UI', system-ui, sans-serif");
});

test('sanitizeLayout rejects non-objects and ignores unknown keys', () => {
  for (const junk of [null, undefined, 5, 'x', [], [1]]) { assert.equal(L.sanitizeLayout(junk), undefined); }
  assert.deepEqual(L.sanitizeLayout({ label: 'x', headings: { bogus: 1 }, other: 1 }).values, {});
});

test('parseLayoutFile validates the marker, version and id', () => {
  const file = (o) => JSON.stringify(o);
  assert.ok(L.parseLayoutFile(file({ mdReaderLayout: 1, id: 'book', label: 'Book', headings: { weight: 700 } })).layout);
  assert.ok(L.parseLayoutFile('nope').error);
  assert.ok(L.parseLayoutFile(file({ id: 'x' })).error);
  assert.match(L.parseLayoutFile(file({ mdReaderLayout: 9, id: 'x' })).error, /newer version/);
  assert.ok(L.parseLayoutFile(file({ mdReaderLayout: 1, id: '../etc', label: 'x' })).error);
  assert.ok(L.parseLayoutFile(file({ mdReaderLayout: 1, label: 'x' })).error);
});

test('layoutVars adds units; layoutCss builds a :root rule; unknown layouts give nothing', () => {
  const layout = L.sanitizeLayout(ok);
  const vars = L.layoutVars(layout);
  assert.equal(vars['--h1-size'], '2em');
  assert.equal(vars['--h-weight'], '700');
  assert.equal(vars['--p-indent'], '1.5em');
  assert.match(L.layoutCss('book', { book: layout }), /^:root\{.*--h1-size:2em.*\}$/);
  assert.equal(L.layoutCss('nope', { book: layout }), '');
});

test('resolveLayout falls back to the default for unknown values', () => {
  assert.equal(L.resolveLayout('book', { book: {} }), 'book');
  assert.equal(L.resolveLayout('gone', { book: {} }), L.DEFAULT_LAYOUT);
  assert.equal(L.resolveLayout(42, {}), L.DEFAULT_LAYOUT);
});

test('loadLayouts never throws on a missing folder', () => {
  assert.deepEqual(layoutLoader().loadLayouts(path.join(root, 'no-such-folder')), {});
});

// ── the layout files that ship ────────────────────────────────────────────────

test('every layouts/*.mdlayout.json file loads, and its id matches its file name', () => {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.mdlayout.json'));
  assert.equal(ids.length, files.length, 'a layout file was rejected by validation');
  assert.ok(ids.length >= 6);
  for (const id of ids) { assert.ok(fs.existsSync(path.join(dir, `${id}.mdlayout.json`)), `${id}: file name must be <id>.mdlayout.json`); }
  assert.ok(loaded[L.DEFAULT_LAYOUT], 'the default layout must exist');
});

test('layout files contain no unknown keys (a typo would be silently dropped)', () => {
  const META = new Set(['mdReaderLayout', 'id', 'label', 'author', 'version']);
  const known = new Set(L.LAYOUT_SPEC.map(s => s.path.join('.')));
  const leaves = (o, prefix = []) => Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === 'object' ? leaves(v, [...prefix, k]) : [[...prefix, k].join('.')]);
  for (const id of ids) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, `${id}.mdlayout.json`), 'utf8'));
    const body = Object.fromEntries(Object.entries(raw).filter(([k]) => !META.has(k)));
    for (const leaf of leaves(body)) { assert.ok(known.has(leaf), `${id}: unknown layout key "${leaf}"`); }
  }
});

test('every shipped layout defines every numeric value (so switching layouts never leaves a stray value)', () => {
  const numeric = L.LAYOUT_SPEC.filter(s => s.kind === 'number').map(s => s.key);
  for (const id of ids) {
    for (const key of numeric) { assert.ok(key in loaded[id].values, `${id} is missing ${key}`); }
  }
});

test('the standard layout mirrors the defaults in reader.css exactly', () => {
  const vars = L.layoutVars(loaded.standard);
  assert.ok(Object.keys(vars).length >= 14, 'standard should define every numeric layout value');
  for (const [name, value] of Object.entries(vars)) {
    const m = new RegExp(`${name}:\\s*([^;]+);`).exec(css);
    assert.ok(m, `${name} has no default in reader.css`);
    assert.equal(m[1].trim(), value, `${name}: reader.css default and layouts/standard.mdlayout.json disagree`);
  }
});

test('reader.css declares a default for every layout variable and actually uses it', () => {
  for (const spec of L.LAYOUT_SPEC) {
    assert.ok(new RegExp(`${spec.cssVar}:\\s*[^;]+;`).test(css), `${spec.cssVar} has no default on :root`);
    assert.ok(css.includes(`var(${spec.cssVar})`), `${spec.cssVar} is declared but no rule uses it`);
  }
});

test('mdReader.layout in package.json lists exactly the shipped layouts, default standard', () => {
  const prop = JSON.parse(readText('package.json')).contributes.configuration.properties['mdReader.layout'];
  assert.equal(prop.default, 'standard');
  assert.deepEqual([...prop.enum].sort(), [...ids].sort());
  assert.equal(prop.enumDescriptions.length, prop.enum.length);
});

test('layouts ship in the .vsix', () => {
  const ignore = readText('.vscodeignore').split('\n').map(l => l.trim());
  assert.ok(!ignore.some(l => /^layouts\/?(\*\*)?$/.test(l)), '.vscodeignore must not exclude layouts/');
});

test('shipped layout files lose nothing in validation (an invalid or out-of-range value would be silently dropped)', () => {
  const META = new Set(['mdReaderLayout', 'id', 'label', 'author', 'version']);
  const count = (o) => Object.values(o).reduce((n, v) => n + (v && typeof v === 'object' ? count(v) : 1), 0);
  for (const id of ids) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, `${id}.mdlayout.json`), 'utf8'));
    const body = Object.fromEntries(Object.entries(raw).filter(([k]) => !META.has(k)));
    assert.equal(Object.keys(loaded[id].values).length, count(body), `${id}: some values were rejected by validation (bad font? out of range?)`);
  }
});
