const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { readText, root } = require('./helpers');

const pkg = JSON.parse(readText('package.json'));
const props = pkg.contributes.configuration.properties;

const DEFAULTS_BLOCK = /const DEFAULTS: ReaderConfig = \{([\s\S]*?)\n\};/;
const hostSources = () => ['extension.ts', 'panelManager.ts', 'themeManager.ts', 'markdownRenderer.ts']
  .map(f => readText('src', f)).join('\n');

function readerConfigKeys() {
  const block = DEFAULTS_BLOCK.exec(readText('src', 'configManager.ts'));
  assert.ok(block, 'could not find DEFAULTS in configManager.ts');
  return [...block[1].matchAll(/^ {2}(\w+):/gm)].map(m => m[1]);
}

// ── settings stay in lockstep (CLAUDE.md "Adding a new setting") ──────────────

test('every ReaderConfig default is a package.json setting, and every other setting is read somewhere', () => {
  const inCode = readerConfigKeys();
  const inManifest = Object.keys(props).map(k => k.replace(/^mdReader\./, ''));
  for (const k of inCode) {
    assert.ok(inManifest.includes(k), `ReaderConfig.${k} is not declared in package.json`);
  }
  // Settings read directly rather than via ReaderConfig: autoRefresh, customCssPath, export.embedImages.
  const sources = hostSources();
  for (const k of inManifest.filter(k => !inCode.includes(k))) {
    assert.ok(sources.includes(`'${k}'`), `setting mdReader.${k} is declared but never read in src/`);
  }
});

// Settings known to be declared but ignored. Each entry is a bug to fix (wire it up
// or remove it) — tracked under "Known issues" in docs/roadmap/ROADMAP.md. The test
// below fails if an entry here starts being used, so this list can only shrink.
const KNOWN_UNUSED = {
  showTOC: 'documented as "Enable table of contents" but the TOC works regardless',
};

function unusedSettings() {
  const consumers = hostSources() + readText('src', 'webview', 'reader.js');
  return readerConfigKeys().filter(k => {
    const used = new RegExp(`\\.${k}\\b|'${k}'|\\b${k}\\s*[,}]`);
    return !used.test(consumers);
  });
}

test('no setting is dead: each ReaderConfig key is used outside its own definition', () => {
  // Regression guard: mdReader.codeTheme once shipped with nothing reading it.
  const unexpected = unusedSettings().filter(k => !(k in KNOWN_UNUSED));
  assert.deepEqual(unexpected, [], 'settings that nothing reads: ' + unexpected.join(', '));
});

test('KNOWN_UNUSED only lists settings that are still unused', () => {
  const stillUnused = unusedSettings();
  for (const k of Object.keys(KNOWN_UNUSED)) {
    assert.ok(stillUnused.includes(k), `${k} is now used — remove it from KNOWN_UNUSED (and from ROADMAP "Known issues")`);
  }
});

test('SETTABLE_KEYS only lists real settings, and never customThemes', () => {
  const block = /SETTABLE_KEYS[^=]*=\s*\[([\s\S]*?)\];/.exec(readText('src', 'configManager.ts'));
  assert.ok(block);
  const keys = [...block[1].matchAll(/'(\w+)'/g)].map(m => m[1]);
  for (const k of keys) {
    assert.ok(props['mdReader.' + k], `SETTABLE_KEYS has ${k} but package.json does not`);
  }
  assert.ok(!keys.includes('customThemes'), 'customThemes must go through the validated saveTheme messages');
});

test('every command registered in extension.ts is declared in package.json, and vice versa', () => {
  const registered = [...readText('src', 'extension.ts').matchAll(/registerCommand\('([\w.]+)'/g)].map(m => m[1]).sort();
  const declared = pkg.contributes.commands.map(c => c.command).sort();
  assert.deepEqual(registered, declared);
});

test('mdReader.theme still accepts built-in, custom and starter values', () => {
  const [builtin, other] = props['mdReader.theme'].anyOf;
  assert.deepEqual(builtin.enum, ['auto', 'light', 'dark', 'sepia']);
  const re = new RegExp(other.pattern);
  assert.ok(re.test('custom:ocean') && re.test('starter:nord'));
  assert.ok(!re.test('custom:Bad Id') && !re.test('other:x'));
});

// ── release metadata: the mechanical half of the documentation rule ───────────

test('package.json, package-lock.json and the latest CHANGELOG entry agree on the version', () => {
  const lock = JSON.parse(readText('package-lock.json'));
  assert.equal(lock.version, pkg.version, 'package-lock.json "version"');
  assert.equal(lock.packages[''].version, pkg.version, 'package-lock.json packages[""].version');
  const latest = /^## \[(\d+\.\d+\.\d+[^\]]*)\]/m.exec(readText('CHANGELOG.md'));
  assert.ok(latest, 'CHANGELOG.md has no "## [x.y.z]" entry');
  assert.equal(latest[1], pkg.version,
    'top CHANGELOG entry must match package.json version (put pending work under "## [Unreleased]" above it)');
});

test('the documentation named by the documentation rule exists', () => {
  for (const f of ['README.md', 'CHANGELOG.md', 'CLAUDE.md', path.join('docs', 'roadmap', 'ROADMAP.md')]) {
    assert.ok(fs.existsSync(path.join(root, f)), `${f} is missing`);
  }
});

test('publisher metadata is complete for publishing', () => {
  for (const field of ['name', 'displayName', 'description', 'version', 'publisher', 'license', 'icon']) {
    assert.ok(pkg[field], `package.json is missing "${field}"`);
  }
  assert.ok(fs.existsSync(path.join(root, pkg.icon)), `icon ${pkg.icon} does not exist`);
  assert.ok(pkg.repository && pkg.repository.url, 'repository.url');
});

test('the .vsix keeps shipping the starter themes and keeps dev files out', () => {
  const ignore = readText('.vscodeignore').split('\n').map(l => l.trim()).filter(Boolean);
  assert.ok(!ignore.some(l => /^themes\/?(\*\*)?$/.test(l)),
    '.vscodeignore must not exclude themes/ (starter themes are loaded at runtime)');
  for (const dev of ['test/**', 'docs/**', 'scripts/**', '.github/**']) {
    assert.ok(ignore.includes(dev), `.vscodeignore should exclude ${dev}`);
  }
});
