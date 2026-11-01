const { test } = require('node:test');
const assert = require('node:assert/strict');
const { themes, readText } = require('./helpers');

const t = themes();

test('isValidColor accepts real colours', () => {
  for (const ok of ['#fff', '#ffff', '#a1b2c3', '#a1b2c3d4', 'rgb(1,2,3)', 'rgba(1, 2, 3, 0.5)', 'hsl(210 50% 40%)', 'hsla(210deg,50%,40%,.5)']) {
    assert.ok(t.isValidColor(ok), `should accept ${ok}`);
  }
});

test('isValidColor rejects anything that could carry CSS', () => {
  const bad = ['red', 'url(http://x)', 'var(--bg)', '#12', '#ggg', 'rgb(1,2,3);color:red', 'rgb(1,2,3)}',
    '', 5, null, undefined, '#' + 'a'.repeat(70), 'expression(1)', '#fff;}body{display:none'];
  for (const v of bad) { assert.ok(!t.isValidColor(v), `should reject ${String(v)}`); }
});

test('sanitizeTheme drops unknown tokens and bad colours, defaults the base, caps the label', () => {
  const s = t.sanitizeTheme({
    label: '  ' + 'x'.repeat(60) + '  ', base: 'neon',
    colors: { bg: '#000', evil: '#fff', text: 'url(x)', accent: '#123456' },
  });
  assert.equal(s.label.length, t.MAX_LABEL);
  assert.equal(s.base, 'light');
  assert.deepEqual(s.colors, { bg: '#000', accent: '#123456' });
  assert.equal(t.sanitizeTheme('nope'), undefined);
  assert.equal(t.sanitizeTheme(null), undefined);
});

test('sanitizeTheme keeps and caps the optional author', () => {
  assert.equal(t.sanitizeTheme({ label: 'a', base: 'dark', colors: {}, author: '  Ann  ' }).author, 'Ann');
  assert.equal(t.sanitizeTheme({ label: 'a', base: 'dark', colors: {}, author: 'x'.repeat(100) }).author.length, t.MAX_AUTHOR);
  assert.ok(!('author' in t.sanitizeTheme({ label: 'a', base: 'dark', colors: {}, author: 5 })));
});

test('sanitizeThemes never throws on junk, drops bad ids, caps the count', () => {
  assert.deepEqual(t.sanitizeThemes(null), {});
  assert.deepEqual(t.sanitizeThemes('x'), {});
  assert.deepEqual(t.sanitizeThemes([1, 2]), {});
  const many = {};
  for (let i = 0; i < 80; i++) { many['t' + i] = { base: 'dark', colors: {} }; }
  many['Bad Id!'] = { base: 'dark', colors: {} };
  const out = t.sanitizeThemes(many);
  assert.equal(Object.keys(out).length, t.MAX_THEMES);
  assert.ok(!('Bad Id!' in out));
});

test('slugify and uniqueId', () => {
  assert.equal(t.slugify('My Ocean Theme!'), 'my-ocean-theme');
  assert.equal(t.slugify('!!!'), 'theme');
  assert.equal(t.uniqueId('ocean', ['ocean']), 'ocean-2');
  assert.equal(t.uniqueId('ocean', ['ocean', 'ocean-2']), 'ocean-3');
  assert.equal(t.uniqueId('fresh', ['ocean']), 'fresh');
});

const custom = { ocean: { label: 'Ocean', base: 'dark', colors: { bg: '#001122' } } };
const starters = { nord: { label: 'Nord', base: 'dark', colors: { bg: '#2e3440' } } };

test('resolveThemeValue falls back to auto for unknown custom/starter themes', () => {
  assert.equal(t.resolveThemeValue('custom:ocean', custom, starters), 'custom:ocean');
  assert.equal(t.resolveThemeValue('custom:gone', custom, starters), 'auto');
  assert.equal(t.resolveThemeValue('starter:nord', custom, starters), 'starter:nord');
  assert.equal(t.resolveThemeValue('starter:gone', custom, starters), 'auto');
  assert.equal(t.resolveThemeValue('sepia', custom, starters), 'sepia');
  assert.equal(t.resolveThemeValue(42, custom, starters), 'auto');
});

test('a custom theme never shadows a starter with the same id', () => {
  const shadow = { nord: { label: 'Mine', base: 'light', colors: {} } };
  assert.equal(t.effectiveBase('custom:nord', shadow, starters), 'light');
  assert.equal(t.effectiveBase('starter:nord', shadow, starters), 'dark');
});

test('effectiveBase and themeCss', () => {
  assert.equal(t.effectiveBase('custom:ocean', custom, starters), 'dark');
  assert.equal(t.effectiveBase('light', custom, starters), 'light');
  assert.equal(t.themeCss('light', custom, starters), '');
  assert.equal(t.themeCss('custom:ocean', custom, starters), ':root{--bg:#001122}');
  assert.equal(t.themeCss('custom:gone', custom, starters), '');
});

test('codeThemeFor falls back on a light/dark polarity mismatch', () => {
  const lightBlock = { colors: { preBg: '#f6f8fa' }, base: 'light', label: 'x' };
  const darkBlock = { colors: { preBg: '#111111' }, base: 'dark', label: 'x' };
  const c = { l: lightBlock, d: darkBlock };
  assert.equal(t.codeThemeFor('github-dark', 'custom:l', c, {}), 'github-light');
  assert.equal(t.codeThemeFor('monokai', 'custom:l', c, {}), 'github-light');
  assert.equal(t.codeThemeFor('github-light', 'custom:d', c, {}), 'github-dark');
  assert.equal(t.codeThemeFor('monokai', 'custom:d', c, {}), 'monokai');
  assert.equal(t.codeThemeFor('github-light', 'dark', {}, {}), 'github-light');   // built-in: no preBg known
  assert.equal(t.codeThemeFor('bogus', 'dark', {}, {}), 'github-dark');
});

test('resolveCodeTheme only accepts the known palettes', () => {
  for (const name of t.CODE_THEMES) { assert.equal(t.resolveCodeTheme(name), name); }
  assert.equal(t.resolveCodeTheme('nope'), t.DEFAULT_CODE_THEME);
  assert.equal(t.resolveCodeTheme(undefined), t.DEFAULT_CODE_THEME);
});

test('theme files round-trip through build/parse, author included', () => {
  const entry = { id: 'ocean', label: 'Ocean', base: 'dark', colors: { bg: '#001122' }, author: 'Ann' };
  const back = t.parseThemeFile(t.buildThemeFile([entry]));
  assert.equal(back.error, undefined);
  assert.deepEqual(back.themes, [entry]);
});

test('parseThemeFile accepts a bare single theme and derives the id', () => {
  const r = t.parseThemeFile(JSON.stringify({ mdReaderTheme: 1, label: 'Solar Flare', base: 'sepia', colors: { bg: '#fff' } }));
  assert.equal(r.themes[0].id, 'solar-flare');
});

test('parseThemeFile rejects bad input without throwing', () => {
  assert.ok(t.parseThemeFile('not json').error);
  assert.ok(t.parseThemeFile('{"a":1}').error);
  assert.ok(t.parseThemeFile('null').error);
  assert.ok(t.parseThemeFile(JSON.stringify({ mdReaderTheme: 99, themes: [] })).error);
  assert.ok(t.parseThemeFile(JSON.stringify({ mdReaderTheme: 1, themes: [] })).error);
});

test('parseThemeFile sanitises hostile themes', () => {
  const r = t.parseThemeFile(JSON.stringify({
    mdReaderTheme: 1,
    themes: [{ id: '../../etc', label: 'x', base: 'dark', colors: { bg: 'url(javascript:1)', text: '#fff' } }],
  }));
  assert.deepEqual(r.themes[0].colors, { text: '#fff' });
  assert.ok(t.isValidId(r.themes[0].id), 'unsafe id is replaced by a slug');
});

test('THEME_TOKENS match the mdReader.customThemes schema in package.json', () => {
  const pkg = JSON.parse(readText('package.json'));
  const schema = pkg.contributes.configuration.properties['mdReader.customThemes'];
  const colorProps = schema.additionalProperties.properties.colors.properties;
  const flat = Object.keys(colorProps).filter(k => colorProps[k].type === 'string').sort();
  assert.deepEqual(flat, t.THEME_TOKENS.map(x => x.key).sort());
  // ...and the grouped shape used in theme files is described too.
  const groups = Object.keys(colorProps).filter(k => colorProps[k].type === 'object').sort();
  assert.deepEqual(groups, Object.keys(t.COLOR_GROUPS).sort());
  for (const g of groups) {
    assert.deepEqual(Object.keys(colorProps[g].properties).sort(), Object.keys(t.COLOR_GROUPS[g]).sort(), `schema for group ${g}`);
  }
});

test('every theme token has distinct CSS variables that reader.css actually defines', () => {
  const css = readText('src', 'webview', 'reader.css');
  const seen = new Set();
  for (const token of t.THEME_TOKENS) {
    for (const v of token.vars) {
      assert.ok(!seen.has(v), `${v} is driven by two tokens`);
      seen.add(v);
      assert.ok(css.includes(`${v}:`), `${v} (token ${token.key}) is not defined in reader.css`);
    }
  }
});
