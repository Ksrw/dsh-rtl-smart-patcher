/**
 * Normalize the JSON shape the installer writes into a DSH profile manifest.
 *
 * Windows PowerShell 5.1's `ConvertTo-Json` indents nested objects four spaces
 * per level, which turns a three-line manifest into a twenty-line diff and grows
 * with every profile plugin. This normalizer re-indents the parsed manifest back
 * to the two-space style the app's own writer uses, so installing this plugin
 * leaves a one-line diff.
 *
 * Usage: node tools/format-profile-manifest.js <manifest.json> [--check]
 */
import { readFileSync, writeFileSync } from 'node:fs';

const file = process.argv[2];
const checkOnly = process.argv.includes('--check');
if (!file) {
  console.error('usage: node tools/format-profile-manifest.js <manifest.json> [--check]');
  process.exit(1);
}

const original = readFileSync(file, 'utf8');
const parsed = JSON.parse(original);

/** Re-indent with two spaces, preserving key order, and end with one newline. */
function format(value, depth) {
  const pad = '  '.repeat(depth);
  const padInner = '  '.repeat(depth + 1);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map((item) => `${padInner}${format(item, depth + 1)}`);
    return `[\n${items.join(',\n')}\n${pad}]`;
  }
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return '{}';
    const entries = keys.map((key) => `${padInner}${JSON.stringify(key)}: ${format(value[key], depth + 1)}`);
    return `{\n${entries.join(',\n')}\n${pad}}`;
  }
  return JSON.stringify(value);
}

const formatted = `${format(parsed, 0)}\n`;

if (formatted === original) {
  console.log('manifest already formatted');
  process.exit(0);
}

if (checkOnly) {
  console.error(`${file}: not in the two-space form the app writes`);
  process.exit(1);
}

writeFileSync(file, formatted, 'utf8');
console.log(`reformatted ${file}`);
