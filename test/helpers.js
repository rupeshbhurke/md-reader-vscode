const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

/** Reads a file, normalising CRLF so assertions don't depend on git autocrlf. */
function readText(...parts) {
  return fs.readFileSync(path.join(root, ...parts), 'utf8').replace(/\r\n/g, '\n');
}

function relativeLuminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #rrggbb colours. */
function contrast(a, b) {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

module.exports = {
  root,
  readText,
  contrast,
  themes: () => require('../out/test-build/themes.js'),
  starters: () => require('../out/test-build/starterThemes.js'),
  textDecode: () => require('../out/test-build/textDecode.js'),
  layouts: () => require('../out/test-build/layouts.js'),
  layoutLoader: () => require('../out/test-build/layoutLoader.js'),
  renderer: () => require('../out/test-build/markdownRenderer.js'),
};
