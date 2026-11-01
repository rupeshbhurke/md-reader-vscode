/**
 * `npm test`: bundles the pure (vscode-free) modules the tests exercise, then
 * runs every test/*.test.js with Node's built-in test runner (no extra
 * dependency). Bundling with esbuild keeps the tests on the real TypeScript
 * source without a separate tsc emit — `tsc` would overwrite the bundled
 * out/extension.js that esbuild produces.
 *
 * The runner passes explicit file paths rather than a directory or glob,
 * because `node --test <dir>` / glob handling differs across Node 20 and 22
 * and between Windows and POSIX shells.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'out', 'test-build');

esbuild.buildSync({
  entryPoints: [
    path.join(root, 'src', 'themes.ts'),
    path.join(root, 'src', 'starterThemes.ts'),
    path.join(root, 'src', 'textDecode.ts'),
    path.join(root, 'src', 'layouts.ts'),
    path.join(root, 'src', 'layoutLoader.ts'),
  ],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outdir: outDir,
  logLevel: 'warning',
});

const testDir = path.join(root, 'test');
const files = fs.readdirSync(testDir)
  .filter(f => f.endsWith('.test.js'))
  .sort()
  .map(f => path.join(testDir, f));

if (files.length === 0) {
  console.error('No test files found in test/');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit', cwd: root });
process.exit(result.status === null ? 1 : result.status);
