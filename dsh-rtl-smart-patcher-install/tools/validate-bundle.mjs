/**
 * Validate every static artifact of the plugin the way the host reads it:
 *
 *   - `package.json` against the fields app-boot and client-modules consume
 *     (identity, `dsh.bundle.patch`, `dsh.client`, exported resources);
 *   - `cordis.patch.yml` as a Loader patch list of insert rows;
 *   - the icon's media type and size limit;
 *   - the two locale dictionaries.
 *
 * Usage: node tools/validate-bundle.mjs <plugin-dir>
 */
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import yaml from './vendor/js-yaml.mjs';

const root = resolve(process.argv[2] ?? '.');
const failures = [];
const check = (name, condition, detail) => {
  if (condition) console.log(`ok    ${name}`);
  else {
    failures.push(name);
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

/* ── identity and compatibility ──────────────────────────────────────────── */

check('manifest has a name', typeof manifest.name === 'string' && manifest.name.length > 0);
check('manifest has a version', typeof manifest.version === 'string' && /^\d+\.\d+\.\d+/.test(manifest.version));
check('manifest is ESM', manifest.type === 'module');
check('manifest declares a bundle', typeof manifest.dsh?.bundle?.patch === 'string');
check('manifest declares a web client', manifest.dsh?.client?.platform === 'web');
check('client bundle loads eagerly', manifest.dsh?.client?.immediately === true);
check(
  'no dsh peers that could fail compatibility evaluation',
  Object.keys(manifest.peerDependencies ?? {}).every((name) => name !== '@deepseek-ai/dsh' && !name.startsWith('@deepseek-ai/dsh-')),
  JSON.stringify(Object.keys(manifest.peerDependencies ?? {})),
);

/* ── resources the host resolves by specifier ────────────────────────────── */

const entry = manifest.exports?.['.'] ?? manifest.main;
const client = manifest.exports?.['./client'];
check('root export resolves', typeof entry === 'string' && existsSync(join(root, entry)), entry);
check('client export resolves', typeof client === 'string' && existsSync(join(root, client)), client);
check('package.json is exported', manifest.exports?.['./package.json'] === './package.json');
check('locale files are exported', manifest.exports?.['./locale/*.json'] === './locale/*.json');

for (const relative of ['locale/en.json', 'locale/fa.json']) {
  const file = join(root, relative);
  if (!existsSync(file)) {
    check(`${relative} exists`, false);
    continue;
  }
  const dictionary = JSON.parse(readFileSync(file, 'utf8'));
  check(`${relative} has title and description`, typeof dictionary.title === 'string' && typeof dictionary.description === 'string');
}

/* ── icon limits taken from app-boot's package-meta reader ───────────────── */

const ICON_TYPES = new Map([
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
]);
const MAX_ICON_BYTES = 256 * 1024;
const icon = manifest.icon;
check('manifest declares a relative icon', typeof icon === 'string' && !icon.startsWith('/') && !/^[A-Za-z][A-Za-z\d+.-]*:/.test(icon), icon);
if (typeof icon === 'string') {
  const extension = icon.slice(icon.lastIndexOf('.')).toLowerCase();
  check('icon media type is accepted', ICON_TYPES.has(extension), extension);
  const iconPath = join(root, icon);
  check('icon exists', existsSync(iconPath));
  if (existsSync(iconPath)) {
    const size = statSync(iconPath).size;
    check(`icon is at most ${MAX_ICON_BYTES} bytes`, size <= MAX_ICON_BYTES, `${size} bytes`);
  }
}

/* ── the Loader patch ────────────────────────────────────────────────────── */

const patchText = readFileSync(join(root, manifest.dsh.bundle.patch), 'utf8');
let patch;
try {
  patch = yaml.load(patchText);
  check('patch parses as YAML', true);
} catch (error) {
  check('patch parses as YAML', false, error.message);
}

if (Array.isArray(patch)) {
  check('patch is a top-level array', true);
  const inserts = patch.flatMap((entryPatch) => entryPatch?.insert ?? []);
  check('patch inserts exactly one row', inserts.length === 1, `${inserts.length} rows`);
  const row = inserts[0] ?? {};
  check('row has an id', typeof row.id === 'string' && row.id.length > 0, row.id);
  check('row names this package', row.name === manifest.name, row.name);
  check('row is not disabled', row.disabled !== true);
} else {
  check('patch is a top-level array', false, JSON.stringify(patch)?.slice(0, 80));
}

/* ── the browser bundle's registration shape ─────────────────────────────── */

const clientSource = readFileSync(join(root, client), 'utf8');
check('client bundle registers with the module loader', clientSource.includes('window.__ModuleLoader__.load('));
check('client bundle registers under the package name', clientSource.includes(`id: '${manifest.name}'`));
check('client bundle resolves react from the platform table', clientSource.includes("require('react')"));

console.log('');
if (failures.length > 0) {
  console.log(`${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('all bundle checks passed');
