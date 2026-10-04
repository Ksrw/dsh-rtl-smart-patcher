/**
 * Prepare the Windows entry-point scripts for shipping.
 *
 * Three Windows-only details are easy to get wrong and hard to see:
 *
 *   1. `powershell.exe` 5.1 mis-parses a parameter attribute followed by a
 *      variable and a comma at a line end (`[string]$Name,`), so parameter
 *      declarations are normalized to `[string] $Name,`.
 *   2. Windows PowerShell 5.1 reads a BOM-less script in the system ANSI
 *      codepage, which mangles non-ASCII text in output and comments, so every
 *      .ps1 gets a UTF-8 BOM. Batch files stay pure ASCII instead, because
 *      cmd.exe has no reliable encoding marker.
 *   3. Every Windows script is stored with CRLF line endings.
 *
 * Run it after editing any .ps1 or .cmd file, and before committing.
 *
 * Usage: node tools/prepare-windows-scripts.js <dir> [<dir> ...]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dirs = process.argv.slice(2).map((dir) => resolve(dir));
if (dirs.length === 0) dirs.push(resolve('.'));
const BOM = '\uFEFF';
const PARAM_DECLARATION = /^(\s*)\[([A-Za-z][A-Za-z0-9_.]*)\]\$([A-Za-z_][A-Za-z0-9_]*)(.*)$/;

for (const dir of dirs) {
  for (const name of ['install.ps1', 'dsh-rtl.cmd', 'test.ps1']) {
    const file = join(dir, name);
    if (!existsSync(file)) continue;
    const original = readFileSync(file, 'utf8');
    let text = original;

    if (name.endsWith('.ps1')) {
      text = text
        .split(/\r?\n/)
        .map((line) => {
          const match = PARAM_DECLARATION.exec(line);
          if (match === null) return line;
          const [, indent, type, variable, rest] = match;
          return `${indent}[${type}] $${variable}${rest}`;
        })
        .join('\n');
    }

    text = text.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
    if (name.endsWith('.ps1') && !text.startsWith(BOM)) text = BOM + text;
    if (name.endsWith('.cmd')) text = text.replace(BOM, '');

    writeFileSync(file, text, 'utf8');
    console.log(`${name}: ${text === original ? 'unchanged' : 'prepared'}`);
  }
}
