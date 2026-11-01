const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { themes, starters, contrast, root } = require('./helpers');

const t = themes();
const dir = path.join(root, 'themes');
const loaded = starters().loadStarterThemes(dir);
const ids = Object.keys(loaded);

test('every themes/*.mdtheme.json file loads as a starter theme', () => {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.mdtheme.json'));
  assert.equal(ids.length, files.length, 'a theme file was rejected by validation');
  assert.ok(ids.length >= 20, `expected at least 20 starter themes, found ${ids.length}`);
});

test('loadStarterThemes never throws on a missing folder', () => {
  assert.deepEqual(starters().loadStarterThemes(path.join(root, 'no-such-folder')), {});
});

test('starter ids match their file names and are unique labels', () => {
  const labels = new Set();
  for (const id of ids) {
    assert.ok(fs.existsSync(path.join(dir, `${id}.mdtheme.json`)), `${id}: file name must be <id>.mdtheme.json`);
    assert.ok(!labels.has(loaded[id].label), `duplicate label ${loaded[id].label}`);
    labels.add(loaded[id].label);
  }
});

test('every starter sets every theme colour and survives sanitising unchanged', () => {
  const keys = t.THEME_TOKENS.map(x => x.key).sort();
  for (const id of ids) {
    assert.deepEqual(Object.keys(loaded[id].colors).sort(), keys, `${id} must set all ${keys.length} colours`);
    assert.deepEqual(t.sanitizeTheme(loaded[id]), loaded[id], `${id} changed under sanitizeTheme (invalid colour?)`);
    assert.ok(loaded[id].author, `${id} should credit an author`);
  }
});

// Reading-focused themes: body text AAA, everything else AA. Comments are
// allowed a little less (they are meant to recede, but must stay legible).
const PAIRS = [
  ['text', 'bg', 7], ['text', 'bgAlt', 4.5], ['text', 'surface', 4.5], ['text', 'quoteBg', 4.5],
  ['text', 'tableStripe', 4.5], ['text', 'selection', 4.5],
  ['textMuted', 'bg', 4.5], ['textMuted', 'surface', 4.5],
  ['accent', 'bg', 4.5], ['accent', 'surface', 4.5], ['accent', 'quoteBg', 4.5],
  ['codeText', 'codeBg', 4.5], ['codeText', 'bg', 4.5],
  ['preText', 'preBg', 7],
  ['hlKeyword', 'preBg', 4.5], ['hlString', 'preBg', 4.5], ['hlComment', 'preBg', 4],
  ['hlNumber', 'preBg', 4.5], ['hlTitle', 'preBg', 4.5], ['hlType', 'preBg', 4.5],
  ['hlVariable', 'preBg', 4.5], ['hlAttr', 'preBg', 4.5], ['hlMeta', 'preBg', 4.5],
  ['hlBuiltIn', 'preBg', 4.5],
];

test('every starter meets the contrast thresholds', () => {
  const failures = [];
  for (const id of ids) {
    const c = loaded[id].colors;
    for (const [fg, bg, min] of PAIRS) {
      const ratio = contrast(c[fg], c[bg]);
      if (ratio < min) { failures.push(`${id}: ${fg} ${c[fg]} on ${bg} ${c[bg]} = ${ratio.toFixed(2)} (< ${min})`); }
    }
  }
  assert.deepEqual(failures, [], '\n' + failures.join('\n'));
});

test('light starters have light code blocks and dark starters dark ones (syntax colours assume it)', () => {
  const lum = hex => {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
      .map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); })
      .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  };
  for (const id of ids) {
    const light = loaded[id].base === 'light';
    const blockIsLight = lum(loaded[id].colors.preBg) > 0.35;
    assert.equal(blockIsLight, light, `${id}: base is ${loaded[id].base} but its code block is ${blockIsLight ? 'light' : 'dark'}`);
  }
});
