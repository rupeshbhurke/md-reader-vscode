/**
 * Copies third-party browser assets the webview loads at runtime (mermaid's
 * client-side renderer, KaTeX's stylesheet + fonts) into src/webview/vendor/.
 *
 * These are NOT bundled by esbuild — esbuild only bundles the extension-host
 * TypeScript (src/extension.ts → out/extension.js). The webview's own script
 * (reader.js) is loaded as a plain static file via a webview URI, so any
 * library it needs at runtime has to exist as a static file under
 * src/webview/ (the one directory, besides the source doc's own folder,
 * that's in the webview's localResourceRoots — see panelManager.ts).
 *
 * Run via `npm run copy-assets`, which `npm run build` depends on.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const vendorDir = path.join(root, 'src', 'webview', 'vendor');

fs.rmSync(vendorDir, { recursive: true, force: true });
fs.mkdirSync(vendorDir, { recursive: true });

// ── Mermaid (client-side diagram renderer) ──────────────────────────────────
fs.copyFileSync(
  path.join(root, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js'),
  path.join(vendorDir, 'mermaid.min.js')
);

// ── KaTeX stylesheet + fonts (math is rendered to HTML host-side; the
//    webview only needs the CSS so it displays correctly) ──────────────────
const katexDir = path.join(vendorDir, 'katex');
const katexFontsDir = path.join(katexDir, 'fonts');
fs.mkdirSync(katexFontsDir, { recursive: true });

fs.copyFileSync(
  path.join(root, 'node_modules', 'katex', 'dist', 'katex.min.css'),
  path.join(katexDir, 'katex.min.css')
);

const srcFontsDir = path.join(root, 'node_modules', 'katex', 'dist', 'fonts');
for (const file of fs.readdirSync(srcFontsDir)) {
  fs.copyFileSync(path.join(srcFontsDir, file), path.join(katexFontsDir, file));
}

console.log('[copy-vendor-assets] mermaid.min.js + katex (css + %d fonts) → src/webview/vendor/',
  fs.readdirSync(katexFontsDir).length);
