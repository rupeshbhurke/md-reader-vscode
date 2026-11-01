import * as fs from 'fs';
import * as path from 'path';
import { Layouts, MAX_LAYOUTS, parseLayoutFile } from './layouts';

const FILE_SUFFIX = '.mdlayout.json';
const MAX_FILE_BYTES = 16 * 1024;

/**
 * Loads the layouts shipped in the extension's `layouts/` folder. Like starter
 * themes they are plain data files: to add a layout, drop a `*.mdlayout.json`
 * there. Never throws — an unreadable or invalid file is skipped.
 */
export function loadLayouts(dir: string): Layouts {
  const out: Layouts = {};
  let files: string[];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith(FILE_SUFFIX)).sort(); } catch { return out; }
  for (const file of files) {
    if (Object.keys(out).length >= MAX_LAYOUTS) { break; }
    try {
      const full = path.join(dir, file);
      if (fs.statSync(full).size > MAX_FILE_BYTES) { continue; }
      const { layout } = parseLayoutFile(fs.readFileSync(full, 'utf8'));
      if (layout) {
        const { id, ...rest } = layout;
        if (!out[id]) { out[id] = rest; }
      }
    } catch { /* skip this file */ }
  }
  return out;
}
