import * as fs from 'fs';
import * as path from 'path';
import { CustomThemes, MAX_THEMES, parseThemeFile } from './themes';

const FILE_SUFFIX = '.mdtheme.json';
const MAX_FILE_BYTES = 64 * 1024;

/**
 * Loads the starter themes shipped in the extension's `themes/` folder.
 * They are ordinary theme files (the same format Export writes and Import
 * reads), so adding a starter theme is just dropping a `*.mdtheme.json` file
 * there. Never throws: an unreadable or invalid file is skipped.
 */
export function loadStarterThemes(dir: string): CustomThemes {
  const out: CustomThemes = {};
  let files: string[];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith(FILE_SUFFIX)).sort(); } catch { return out; }
  for (const file of files) {
    if (Object.keys(out).length >= MAX_THEMES) { break; }
    try {
      const full = path.join(dir, file);
      if (fs.statSync(full).size > MAX_FILE_BYTES) { continue; }
      for (const { id, ...theme } of parseThemeFile(fs.readFileSync(full, 'utf8')).themes) {
        if (!out[id]) { out[id] = theme; }
      }
    } catch { /* skip this file */ }
  }
  return out;
}
