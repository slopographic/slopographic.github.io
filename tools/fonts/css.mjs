#!/usr/bin/env node
// The brand family in the site's CSS, written from its manifest (shared/fonts/brand/faces.json, made by build.py):
// the @font-face rules in shared/fonts/fonts.css (between the brand-font markers) and the values of the font tokens'
// profile markers in style/base.css (/*profile:fontSans*/"..."). A role the family does not have, or a site without a
// brand family, keeps the upstream font (UPSTREAM). The white-label build calls the same functions with a profile's family.
//   node tools/fonts/css.mjs           rewrite the block in shared/fonts/fonts.css from shared/fonts/brand/faces.json
//   node tools/fonts/css.mjs --check   exit 1 when the block or the token markers differ from the manifest
// Node only. Tests: tests/node/brand-font.test.mjs, tests/node/whitelabel-font.test.mjs.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const MANIFEST = 'shared/fonts/brand/faces.json';
export const START = '/* brand-font:start: written by tools/fonts/css.mjs from brand/faces.json; do not edit */';
export const END = '/* brand-font:end */';
/** The font each token uses without a brand family, and the metric-matched local fallback after it (fonts.css). */
export const UPSTREAM = {
  sans: { family: 'Inter Tight', fallback: 'Inter Tight Fallback', marker: 'fontSans' },
  serif: { family: 'Instrument Serif', fallback: 'Instrument Serif Fallback', marker: 'fontSerif' },
  mono: { family: 'JetBrains Mono', fallback: 'JetBrains Mono Fallback', marker: 'fontMono' },
  cond: { family: 'Archivo', fallback: 'Archivo Fallback', marker: 'fontCond' },
};
/** A manifest with no family (a site that ships none). */
export const EMPTY = { family: null, roles: {}, faces: [], fallbacks: [], features: [], pua: [] };

/** The manifest of a font folder, or EMPTY when there is none. */
export function readManifest(file) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : EMPTY;
}

const q = (s) => `'${String(s).replace(/['\\]/g, '')}'`;
/** The @font-face rules of a manifest (urls relative to fonts.css), and its computed fallbacks. */
export function faceRules(m, dir = 'brand/') {
  const out = [];
  for (const f of m.faces) {                       // one line per face (fonts.css stays under the 300-line rule)
    out.push(`@font-face { font-family: ${q(f.family)}; font-style: ${f.style}; font-weight: ${f.weight};${f.stretch ? ` font-stretch: ${f.stretch};` : ''}`
      + ` font-display: swap; src: url('${dir}${f.file}') format('woff2'); unicode-range: ${f.unicodeRange}; }`);
  }
  for (const b of m.fallbacks || []) {
    out.push(`@font-face { font-family: ${q(b.family)}; font-weight: ${b.weight}; src: ${b.local.map((n) => `local(${q(n)})`).join(', ')};`,
      `  size-adjust: ${b.sizeAdjust}; ascent-override: ${b.ascentOverride}; descent-override: ${b.descentOverride}; line-gap-override: ${b.lineGapOverride}; }`);
  }
  return out.join('\n');
}

/** fonts.css with its brand block replaced by the manifest's rules (an empty block for EMPTY). */
export function withBlock(css, m) {
  const a = css.indexOf(START), b = css.indexOf(END);
  if (a < 0 || b < a) throw new Error('shared/fonts/fonts.css: no brand-font block');
  const rules = faceRules(m);
  return css.slice(0, a) + START + '\n' + (rules ? rules + '\n' : '') + css.slice(b);
}

/** The profile marker values of the font tokens: { fontSans: 'Slopographic Sans', fontSansFallback: 'Inter Tight Fallback', ... }. */
export function tokenValues(m) {
  const out = {};
  for (const [role, up] of Object.entries(UPSTREAM)) {
    const r = (m.roles || {})[role];
    out[up.marker] = r ? r.family : up.family;
    out[up.marker + 'Fallback'] = r ? r.fallback : up.fallback;
  }
  return out;
}

/** The token markers of a stylesheet that disagree with the values: ["fontSans: ... (want ...)"]. */
export function tokenProblems(css, values) {
  const out = [];
  for (const [k, v] of Object.entries(values)) {
    const m = css.match(new RegExp(`/\\*profile:${k}\\*/"([^"]*)"`));
    if (!m) out.push(`${k}: no marker`);
    else if (m[1] !== v) out.push(`${k}: "${m[1]}" (the manifest says "${v}")`);
  }
  return out;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const m = readManifest(path.join(ROOT, MANIFEST));
  const file = path.join(ROOT, 'shared/fonts/fonts.css'), css = readFileSync(file, 'utf8'), next = withBlock(css, m);
  const problems = tokenProblems(readFileSync(path.join(ROOT, 'style/base.css'), 'utf8'), tokenValues(m));
  if (process.argv.includes('--check')) {
    if (next !== css) problems.unshift('shared/fonts/fonts.css: the brand block is not the manifest (run node tools/fonts/css.mjs)');
    for (const p of problems) console.error(p);
    process.exit(problems.length ? 1 : 0);
  }
  writeFileSync(file, next);
  for (const p of problems) console.error(`style/base.css ${p}`);
  console.log(`shared/fonts/fonts.css: ${m.faces.length} brand faces`);
}
