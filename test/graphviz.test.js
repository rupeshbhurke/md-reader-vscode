const { test } = require('node:test');
const assert = require('node:assert/strict');
const { renderer, readText } = require('./helpers');

const R = renderer();
const fence = (lang, src) => '```' + lang + '\n' + src + '\n```\n';

test('a ```dot block renders to inline SVG on the host', async () => {
  const r = await R.renderMarkdown(fence('dot', 'digraph { a -> b }'));
  assert.equal(r.hasGraphviz, true);
  assert.match(r.html, /<div class="graphviz"><svg/);
  assert.match(r.html, /<text[^>]*>a<\/text>/);
  assert.ok(!r.html.includes('md-reader-graph'), 'placeholder must be replaced');
});

test('```graphviz is an alias, and several diagrams keep their own output', async () => {
  const r = await R.renderMarkdown(fence('graphviz', 'digraph { first -> x }') + '\ntext\n\n' + fence('dot', 'graph { second -- y }'));
  const svgs = r.html.match(/<div class="graphviz">/g) || [];
  assert.equal(svgs.length, 2);
  assert.ok(r.html.indexOf('>first<') < r.html.indexOf('>second<'));
});

test('invalid source falls back to an escaped block with the reason', async () => {
  const r = await R.renderMarkdown(fence('dot', 'digraph { a -> <b> '));
  assert.match(r.html, /<pre class="graphviz graphviz-error" data-error="[^"]+">/);
  assert.ok(!r.html.includes('<svg'));
  assert.ok(r.html.includes('&lt;b&gt;'), 'source must be HTML-escaped');
});

test('links and images in a diagram are stripped (a URL= attribute cannot become a clickable link)', async () => {
  const r = await R.renderMarkdown(fence('dot', 'digraph { a [URL="javascript:alert(1)"]; b [image="x.png"] }'));
  assert.ok(!/href=/i.test(r.html), 'no href may survive');
  assert.ok(!/<image/i.test(r.html));
});

test('documents without a diagram do not touch the engine', async () => {
  const r = await R.renderMarkdown('# hi\n\n```js\nlet a = 1\n```\n');
  assert.equal(r.hasGraphviz, false);
  assert.ok(!r.html.includes('graphviz'));
});

test('concurrent renders do not mix their diagrams', async () => {
  const [a, b] = await Promise.all([
    R.renderMarkdown(fence('dot', 'digraph { alpha -> one }')),
    R.renderMarkdown('plain text, no diagram'),
  ]);
  assert.equal(a.hasGraphviz, true);
  assert.equal(b.hasGraphviz, false);
  assert.ok(a.html.includes('>alpha<'));
});

test('cleanGraphSvg drops the XML prolog and comments', () => {
  const out = R.cleanGraphSvg('<?xml version="1.0"?>\n<!-- c -->\n<svg width="1pt"><g/></svg>');
  assert.ok(out.startsWith('<svg'));
  assert.equal(R.cleanGraphSvg('no svg here'), '');
});

test('reader.css maps Graphviz black/white onto the theme and styles the error fallback', () => {
  const css = readText('src', 'webview', 'reader.css');
  assert.match(css, /\.graphviz svg \[fill="black"\]\s*\{\s*fill: var\(--text\)/);
  assert.match(css, /\.graphviz svg \[stroke="black"\]\s*\{\s*stroke: var\(--text\)/);
  assert.match(css, /pre\.graphviz-error/);
});

// ── performance: the footnote extension is quadratic, so it only runs when needed ──

test('footnotes still render, and documents without them skip the footnote extension', async () => {
  const withNote = await R.renderMarkdown('Text[^1].\n\n[^1]: The note.\n');
  assert.match(withNote.html, /footnote/);
  const without = await R.renderMarkdown('Plain text.\n');
  assert.ok(!/footnote/.test(without.html));
});

test('a large document renders in roughly linear time', async () => {
  const doc = (n) => 'Some *text* with `code`, a [link](http://x.y) and **bold**.\n\n'.repeat(n);
  await R.renderMarkdown(doc(200)); // warm up
  const time = async (n) => { const t = process.hrtime.bigint(); await R.renderMarkdown(doc(n)); return Number(process.hrtime.bigint() - t) / 1e6; };
  const small = await time(1000);
  const large = await time(8000);
  assert.ok(large < 2500, `8000 paragraphs took ${large | 0} ms`);
  assert.ok(large < Math.max(small, 5) * 40, `scaling looks superlinear: ${small | 0} ms -> ${large | 0} ms for 8x the content`);
});
