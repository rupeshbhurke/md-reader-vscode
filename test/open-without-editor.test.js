const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readText, textDecode } = require('./helpers');

const { decodeText } = textDecode();
const bytes = (...n) => Uint8Array.from(n);
const utf8 = s => new TextEncoder().encode(s);

// ── decoding a file read straight from disk ───────────────────────────────────

test('decodeText decodes plain UTF-8 and keeps line endings', () => {
  assert.deepEqual(decodeText(utf8('# Hi\r\nthere\n')), { text: '# Hi\r\nthere\n', ok: true });
  assert.deepEqual(decodeText(utf8('')), { text: '', ok: true });
});

test('decodeText handles multi-byte characters', () => {
  assert.equal(decodeText(utf8('café — 日本語 🎉')).text, 'café — 日本語 🎉');
});

test('decodeText strips a UTF-8 BOM so front matter is still detected', () => {
  const withBom = Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8('---\ntitle: x\n---\n')]);
  const { text, ok } = decodeText(withBom);
  assert.ok(ok);
  assert.ok(text.startsWith('---'), 'BOM must not precede the opening --- of front matter');
});

test('decodeText refuses UTF-16 so the caller can fall back to VS Code decoding', () => {
  assert.equal(decodeText(bytes(0xff, 0xfe, 0x23, 0x00)).ok, false);   // UTF-16 LE BOM
  assert.equal(decodeText(bytes(0xfe, 0xff, 0x00, 0x23)).ok, false);   // UTF-16 BE BOM
});

test('decodeText refuses invalid UTF-8 instead of returning garbage', () => {
  assert.equal(decodeText(bytes(0x23, 0x20, 0xc3, 0x28)).ok, false);
  assert.equal(decodeText(bytes(0xff, 0xff, 0xff)).ok, false);
});

// ── the requirement: the reader must not depend on an open editor ─────────────

const extension = readText('src', 'extension.ts');
const panel = readText('src', 'panelManager.ts');

test('closing the source editor does not close the reader', () => {
  assert.ok(!/onDidCloseTextDocument/.test(extension),
    'extension.ts must not dispose panels when a document closes — the reader outlives its editor tab');
  assert.ok(!/disposeForUri\(/.test(extension), 'extension.ts must not call disposeForUri on close');
});

test('the open commands take a file URI instead of requiring an active editor', () => {
  for (const cmd of ['mdReader.open', 'mdReader.openNewColumn']) {
    const re = new RegExp(`registerCommand\\('${cmd.replace('.', '\\.')}',\\s*async \\(uri\\?: vscode\\.Uri`);
    assert.ok(re.test(extension), `${cmd} must accept an optional URI argument`);
  }
  assert.ok(/showOpenDialog/.test(extension), 'with no URI and no Markdown editor, a file picker is offered');
});

test('PanelManager works from a URI: no TextDocument parameters, file watcher present', () => {
  assert.ok(/async open\(uri: vscode\.Uri,/.test(panel), 'open() must take a URI');
  assert.ok(!/document: vscode\.TextDocument/.test(panel), 'no method should require a TextDocument');
  assert.ok(/createFileSystemWatcher/.test(panel), 'each panel watches its own file');
  assert.ok(/watcher\.dispose\(\)/.test(panel), 'the watcher is disposed with the panel');
});

test('automatic refresh triggers are debounced, manual refresh is not', () => {
  assert.ok(/refreshDebounced\(doc\.uri\)/.test(extension) && /refreshDebounced\(e\.document\.uri\)/.test(extension));
  assert.ok(/refreshDebounced\(uri\)/.test(panel));
  assert.ok(/async refreshActive\(\)[\s\S]*?this\.refresh\(/.test(panel), 'refreshActive stays immediate');
});

test('task toggling saves when no editor has the file open (otherwise the edit would be invisible)', () => {
  assert.ok(/!hadEditor && !wasDirty/.test(panel) && /document\.save\(\)/.test(panel));
});

test('the Explorer, editor-tab and editor menus still offer Open in MD Reader for Markdown files', () => {
  const menus = JSON.parse(readText('package.json')).contributes.menus;
  for (const menu of ['explorer/context', 'editor/title/context', 'editor/context']) {
    assert.ok((menus[menu] || []).some(m => m.command === 'mdReader.open'), `${menu} lost the open command`);
  }
});
