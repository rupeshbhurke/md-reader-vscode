const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { themes, root } = require('./helpers');

const t = themes();
const flatKeys = t.THEME_TOKENS.map(x => x.key);

// ── grouped colours (the v2 file shape) ───────────────────────────────────────

test('COLOR_GROUPS covers every theme token exactly once, with no name clashing with a flat key', () => {
  const mapped = Object.values(t.COLOR_GROUPS).flatMap(g => Object.values(g));
  assert.deepEqual([...mapped].sort(), [...flatKeys].sort());
  assert.equal(new Set(mapped).size, mapped.length, 'a token is mapped twice');
  for (const group of Object.keys(t.COLOR_GROUPS)) {
    assert.ok(!flatKeys.includes(group), `group name "${group}" collides with a flat token key`);
  }
});

test('flat -> grouped -> flat is lossless for every token', () => {
  const flat = Object.fromEntries(flatKeys.map((k, i) => [k, '#' + String(i + 10).padStart(2, '0').repeat(3)]));
  const grouped = t.groupColors(flat);
  assert.deepEqual(Object.keys(grouped).sort(), Object.keys(t.COLOR_GROUPS).sort());
  assert.deepEqual(t.flattenColors(grouped), flat);
});

test('flattenColors accepts flat, grouped and mixed input; flat wins on a clash', () => {
  assert.deepEqual(t.flattenColors({ bg: '#111' }), { bg: '#111' });
  assert.deepEqual(t.flattenColors({ surfaces: { page: '#222' } }), { bg: '#222' });
  assert.deepEqual(t.flattenColors({ surfaces: { page: '#222' }, bg: '#333' }), { bg: '#333' });
  assert.deepEqual(t.flattenColors({ ink: { primary: '#444', muted: '#555' }, accent: '#666' }),
    { text: '#444', textMuted: '#555', accent: '#666' });
});

test('flattenColors ignores junk without throwing', () => {
  for (const junk of [null, undefined, 5, 'x', [], [1], { surfaces: 'no' }, { surfaces: [1] }, { nope: { page: '#fff' } }, { surfaces: { nope: '#fff' } }]) {
    assert.deepEqual(t.flattenColors(junk), {}, JSON.stringify(junk));
  }
});

test('sanitizeTheme normalises grouped colours to flat and validates each one', () => {
  const s = t.sanitizeTheme({
    label: 'g', base: 'dark',
    colors: { surfaces: { page: '#001122', alt: 'url(x)' }, code: { blockText: '#fff' }, evil: { page: '#fff' } },
  });
  assert.deepEqual(s.colors, { bg: '#001122', preText: '#fff' });
});

// ── file format v2 and compatibility with v1 ──────────────────────────────────

const flatTheme = { id: 'ocean', label: 'Ocean', base: 'dark', colors: { bg: '#001122', text: '#d6e6f2', preBg: '#000000', hlKeyword: '#ff0000' } };

test('theme files are written in the grouped v2 shape', () => {
  const file = JSON.parse(t.buildThemeFile([flatTheme]));
  assert.equal(file.mdReaderTheme, 2);
  assert.deepEqual(file.themes[0].colors, {
    surfaces: { page: '#001122' },
    ink: { primary: '#d6e6f2' },
    code: { blockBackground: '#000000' },
    syntax: { keyword: '#ff0000' },
  });
});

test('a v2 export reads back to the same flat theme', () => {
  const back = t.parseThemeFile(t.buildThemeFile([flatTheme]));
  assert.equal(back.error, undefined);
  assert.deepEqual(back.themes, [flatTheme]);
});

test('version-1 theme files (flat colours) still load', () => {
  const v1 = JSON.stringify({ mdReaderTheme: 1, themes: [flatTheme] });
  const back = t.parseThemeFile(v1);
  assert.equal(back.error, undefined);
  assert.deepEqual(back.themes, [flatTheme]);
});

test('a bare version-1 single theme file still loads', () => {
  const r = t.parseThemeFile(JSON.stringify({ mdReaderTheme: 1, id: 'x', label: 'X', base: 'light', colors: { bg: '#fff' } }));
  assert.equal(r.themes[0].id, 'x');
});

test('files from a newer format version are refused with a clear error', () => {
  assert.match(t.parseThemeFile(JSON.stringify({ mdReaderTheme: 3, themes: [flatTheme] })).error, /newer version/);
});

// ── version and category ──────────────────────────────────────────────────────

test('version and category are kept when valid and dropped when not', () => {
  const ok = t.sanitizeTheme({ label: 'a', base: 'dark', colors: {}, version: '1.2.3', category: 'Dark' });
  assert.equal(ok.version, '1.2.3');
  assert.equal(ok.category, 'Dark');
  const bad = t.sanitizeTheme({ label: 'a', base: 'dark', colors: {}, version: '1.2.3; x', category: '<b>x</b>' });
  assert.ok(!('version' in bad) && !('category' in bad));
  assert.ok(!('version' in t.sanitizeTheme({ label: 'a', base: 'dark', colors: {}, version: 'x'.repeat(30) })));
  assert.ok(!('category' in t.sanitizeTheme({ label: 'a', base: 'dark', colors: {}, category: 'x'.repeat(30) })));
});

test('version and category survive export and import', () => {
  const entry = { ...flatTheme, version: '2.0.0', category: 'Accessible', author: 'Ann' };
  assert.deepEqual(t.parseThemeFile(t.buildThemeFile([entry])).themes, [entry]);
});

// ── the starter files on disk ─────────────────────────────────────────────────

const dir = path.join(root, 'themes');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.mdtheme.json'));

test('every starter file uses the grouped v2 format with a version and a category', () => {
  for (const f of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    assert.equal(raw.mdReaderTheme, 2, `${f}: format version`);
    assert.match(raw.version, /^\d+\.\d+\.\d+$/, `${f}: version`);
    assert.ok(raw.category, `${f}: category`);
    // grouped, not flat: every colours entry is a known group object
    for (const [group, value] of Object.entries(raw.colors)) {
      assert.ok(t.COLOR_GROUPS[group], `${f}: unknown colour group "${group}"`);
      assert.equal(typeof value, 'object', `${f}: ${group} must be an object`);
    }
  }
});

test('starter files contain no unknown colour names (typos would be silently dropped)', () => {
  for (const f of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const leafCount = Object.values(raw.colors).reduce((n, g) => n + Object.keys(g).length, 0);
    const parsed = t.sanitizeTheme(raw);
    assert.equal(Object.keys(parsed.colors).length, leafCount, `${f}: some colours were rejected by validation`);
  }
});

test('starter categories match their base: Light / Dark, plus Accessible for high-contrast', () => {
  for (const f of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const expected = raw.id === 'high-contrast' ? 'Accessible' : (raw.base === 'light' ? 'Light' : 'Dark');
    assert.equal(raw.category, expected, `${f}: category`);
  }
});

// ── tweaking a starter (`from`) ───────────────────────────────────────────────

const starters = { nord: { label: 'Nord', base: 'dark', colors: { bg: '#2e3440', text: '#e5e9f0', accent: '#88c0d0' } } };

test('a theme with `from` keeps it; an invalid `from` is dropped', () => {
  assert.equal(t.sanitizeTheme({ label: 'x', base: 'light', colors: {}, from: 'nord' }).from, 'nord');
  for (const bad of ['Nord', '../x', 'a b', '', 5, null, 'x'.repeat(41)]) {
    assert.ok(!('from' in t.sanitizeTheme({ label: 'x', base: 'light', colors: {}, from: bad })), String(bad));
  }
});

test('resolveTheme layers the changes over the starter, and takes the starter base', () => {
  const r = t.resolveTheme({ label: 'Mine', base: 'light', from: 'nord', colors: { accent: '#ff0000' } }, starters);
  assert.equal(r.base, 'dark');
  assert.deepEqual(r.colors, { bg: '#2e3440', text: '#e5e9f0', accent: '#ff0000' });
});

test('resolveTheme leaves a theme alone when it has no `from`, or its starter is gone', () => {
  const plain = { label: 'P', base: 'sepia', colors: { bg: '#fff' } };
  assert.equal(t.resolveTheme(plain, starters), plain);
  const orphan = { label: 'O', base: 'light', from: 'deleted', colors: { bg: '#fff' } };
  assert.equal(t.resolveTheme(orphan, starters), orphan);
});

test('a tweaked starter follows the starter: lookup, base and export CSS all use the merged theme', () => {
  const custom = { mine: { label: 'Mine', base: 'light', from: 'nord', colors: { accent: '#ff0000' } } };
  assert.equal(t.effectiveBase('custom:mine', custom, starters), 'dark');
  const css = t.themeCss('custom:mine', custom, starters);
  assert.match(css, /#2e3440/);   // inherited from the starter
  assert.match(css, /#ff0000/);   // the tweak
  // the starter improves later: the tweak picks it up
  const improved = { nord: { ...starters.nord, colors: { ...starters.nord.colors, bg: '#111111' } } };
  assert.match(t.themeCss('custom:mine', custom, improved), /#111111/);
});
