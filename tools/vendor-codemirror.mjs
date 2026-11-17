#!/usr/bin/env node
// Vendors the CodeMirror 6 packages used by Slop Code into vendor/codemirror/. Run at build time only:
//   node tools/vendor-codemirror.mjs
// Each pinned package is fetched from cdn.jsdelivr.net/npm/ (its ESM entry, copied verbatim). Every bare import
// must be another pinned package, so the import map in code/index.html covers the whole graph. Writes one
// file per package, LICENSES.txt (the licence texts, de-duplicated) and import-map.json (the map to paste into
// code/index.html). README.md is written by hand; this script prints the table rows for it.
// @codemirror/legacy-modes is vendored one file per mode (mode/<name>.js -> legacy-<name>.js, import-map key
// "@codemirror/legacy-modes/mode/<name>"), because Slop Code loads each language only when a file needs it.
import { mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'vendor', 'codemirror');
const CDN = 'https://cdn.jsdelivr.net/npm/';
const PINNED = {
  '@codemirror/autocomplete': '6.20.3', '@codemirror/commands': '6.11.1', '@codemirror/language': '6.13.1',
  '@codemirror/lang-css': '6.3.1', '@codemirror/lang-html': '6.4.12', '@codemirror/lang-javascript': '6.2.5',
  '@codemirror/lang-json': '6.0.2', '@codemirror/lang-markdown': '6.5.2', '@codemirror/lang-python': '6.2.1',
  '@codemirror/lint': '6.9.7', '@codemirror/search': '6.7.2', '@codemirror/state': '6.7.6',
  '@codemirror/streamparser': '6.0.0', '@codemirror/view': '6.43.14',
  '@lezer/common': '1.5.3', '@lezer/css': '1.3.9', '@lezer/highlight': '1.2.5', '@lezer/html': '1.3.13',
  '@lezer/javascript': '1.5.6', '@lezer/json': '1.0.3', '@lezer/lr': '1.4.11', '@lezer/markdown': '1.8.0',
  '@lezer/python': '1.1.19', '@marijn/find-cluster-break': '1.0.4', 'crelt': '1.0.7', 'style-mod': '4.1.4',
  'w3c-keyname': '2.2.8',
};
// The legacy modes Slop Code offers (code/js/langs-more.js). A mode that imports a sibling ("./simple-mode.js") needs
// that sibling listed here too; its import is rewritten to the import-map specifier.
const LEGACY = { name: '@codemirror/legacy-modes', version: '6.5.5' };
const MODES = [
  'shell', 'yaml', 'toml', 'properties', 'xml', 'sql', 'clike', 'go', 'rust', 'simple-mode', 'ruby', 'perl', 'lua',
  'swift', 'dockerfile', 'diff', 'powershell', 'r', 'haskell', 'julia', 'erlang', 'commonlisp', 'scheme', 'clojure',
  'tcl', 'vb', 'vbscript', 'pascal', 'fortran', 'verilog', 'vhdl', 'coffeescript', 'stex', 'cmake', 'nginx',
  'protobuf', 'groovy', 'http', 'd', 'elm', 'mllike', 'gherkin', 'puppet', 'crystal', 'haxe', 'jinja2', 'gas',
  'wast', 'cobol',
];
const fileName = (name) => name.replace(/^@/, '').replace('/', '-') + '.js';
const text = async (url) => { const r = await globalThis.fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.text(); };
// Top-level import/export statements only (the dist files are not minified).
const bareImports = (src) => [...src.matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s*["']([^"'\n]+)["']|^\s*import\s*["']([^"'\n]+)["']/gm)].map((m) => m[1] || m[2]);

await mkdir(OUT, { recursive: true });
// Clear the generated files, but keep README.md (it is written by hand).
for (const f of await readdir(OUT)) if (f !== 'README.md') await rm(path.join(OUT, f), { recursive: true, force: true });
const map = {}, licences = new Map(), rows = [];
for (const [name, version] of Object.entries(PINNED)) {
  const pkg = JSON.parse(await text(`${CDN}${name}@${version}/package.json`));
  if (pkg.version !== version) throw new Error(`${name}: wanted ${version}, got ${pkg.version}`);
  const entry = pkg.module || pkg.main || (typeof pkg.exports === 'object' && pkg.exports['.']?.import) || 'index.js';
  const src = await text(`${CDN}${name}@${version}/${entry}`);
  for (const spec of bareImports(src)) {
    if (spec.startsWith('.') || spec.startsWith('/')) throw new Error(`${name} imports a relative file (${spec}); vendor it too`);
    if (!PINNED[spec]) throw new Error(`${name} imports ${spec}, which is not pinned`);
  }
  const file = fileName(name);
  await writeFile(path.join(OUT, file), `/* ${name} ${version} (${pkg.license}), vendored from ${CDN}${name}@${version}/${entry}. See README.md. */\n${src}`);
  map[name] = `../vendor/codemirror/${file}`;
  let lic = '(no LICENSE file in the package)';
  try { lic = await text(`${CDN}${name}@${version}/LICENSE`); } catch (e) { /* package ships no LICENSE file */ }
  const key = lic.trim();
  if (!licences.has(key)) licences.set(key, []);
  licences.get(key).push(`${name} ${version}`);
  rows.push(`| \`${name}\` | ${version} | ${pkg.license || '?'} | \`${file}\` |`);
}
// The legacy modes: one file per mode, one licence text for the package.
const legacyPkg = JSON.parse(await text(`${CDN}${LEGACY.name}@${LEGACY.version}/package.json`));
if (legacyPkg.version !== LEGACY.version) throw new Error(`${LEGACY.name}: wanted ${LEGACY.version}, got ${legacyPkg.version}`);
for (const mode of MODES) {
  const entry = `mode/${mode}.js`, url = `${CDN}${LEGACY.name}@${LEGACY.version}/${entry}`;
  let src = await text(url), rewritten = false;
  for (const spec of bareImports(src)) {
    const sibling = /^\.\/([\w-]+)\.js$/.exec(spec);
    if (sibling && MODES.includes(sibling[1])) {
      src = src.split(`"${spec}"`).join(`"${LEGACY.name}/mode/${sibling[1]}"`).split(`'${spec}'`).join(`'${LEGACY.name}/mode/${sibling[1]}'`);
      rewritten = true;
    } else if (spec.startsWith('.') || spec.startsWith('/')) throw new Error(`${mode} imports ${spec}; add it to MODES`);
    else if (!PINNED[spec]) throw new Error(`${mode} imports ${spec}, which is not pinned`);
  }
  if (!/^export\b/m.test(src)) throw new Error(`${mode}: no export found`);
  const file = `legacy-${mode}.js`, key = `${LEGACY.name}/mode/${mode}`;
  await writeFile(path.join(OUT, file), `/* ${key} ${LEGACY.version} (${legacyPkg.license}), vendored from ${url}${rewritten ? ' (relative imports rewritten to import-map specifiers)' : ''}. See README.md. */\n${src}`);
  map[key] = `../vendor/codemirror/${file}`;
  rows.push(`| \`${key}\` | ${LEGACY.version} | ${legacyPkg.license} | \`${file}\` |`);
}
let legacyLic = '(no LICENSE file in the package)';
try { legacyLic = await text(`${CDN}${LEGACY.name}@${LEGACY.version}/LICENSE`); } catch (e) { /* package ships no LICENSE file */ }
if (!licences.has(legacyLic.trim())) licences.set(legacyLic.trim(), []);
licences.get(legacyLic.trim()).push(`${LEGACY.name} ${LEGACY.version} (${MODES.length} modes)`);
await writeFile(path.join(OUT, 'LICENSES.txt'), [...licences].map(([t, pk]) => `${pk.join(', ')}\n${'-'.repeat(60)}\n${t}\n`).join('\n'));
await writeFile(path.join(OUT, 'import-map.json'), JSON.stringify({ imports: map }, null, 2) + '\n');
console.log(rows.join('\n'));
console.log(`\n${Object.keys(PINNED).length} packages and ${MODES.length} legacy modes written to ${path.relative(ROOT, OUT)}`);
