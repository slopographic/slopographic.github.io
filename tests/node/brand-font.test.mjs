// The site's type family (shared/fonts/brand/, built by tools/fonts/build.py from a font spec): every file of the
// manifest is there, each WOFF2 file is named after its family (and nothing else keeps an upstream name), the OFL
// licence, its copyright lines and the FONTLOG ship with it, the download holds the TTFs and both texts, the files are
// no larger than the upstream web fonts they replace, and the CSS (the brand-font block of fonts.css and the token
// markers of style/base.css) agrees with the manifest. Generic: a white-label build runs it on its own family, and on a
// build without one (an empty manifest) it checks that the tokens name the upstream fonts.
// Covers: tools/fonts/css.mjs, tools/fonts/woff2.mjs, tools/fonts/zip.mjs, tools/fonts/spec-rules.mjs
// Run: node --test tests/node/brand-font.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANIFEST, UPSTREAM, readManifest, withBlock, tokenValues, tokenProblems, faceRules } from '../../tools/fonts/css.mjs';
import { woff2Tables, nameRecords, nameOf, featureTags, axes } from '../../tools/fonts/woff2.mjs';
import { zipMembers } from '../../tools/fonts/zip.mjs';
import { specProblems } from '../../tools/fonts/spec-rules.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = path.join(ROOT, path.dirname(MANIFEST));
const m = readManifest(path.join(ROOT, MANIFEST));
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const tables = (f) => woff2Tables(readFileSync(path.join(DIR, f)));
/** The upstream web fonts of this repository, by family: the files a brand face of that origin must not outgrow. */
const UPSTREAM_FILES = {
  'Inter Tight': (style, sub) => `inter-tight/inter-tight-var-normal-${sub}.woff2`,
  'Instrument Serif': (style, sub) => `instrument-serif/instrument-serif-${style}-${sub}.woff2`,
  'JetBrains Mono': (style, sub) => `jetbrains-mono/jetbrains-mono-var-normal-${sub}.woff2`,
  Archivo: (style, sub) => `archivo/archivo-var-${style}-${sub}.woff2`,
};

test('the manifest lists files that are all there, in both subsets of every style', () => {
  for (const f of m.faces) assert.ok(existsSync(path.join(DIR, f.file)), f.file);
  if (!m.faces.length) return;
  for (const f of [m.licenceFile, m.fontlog, m.download]) assert.ok(existsSync(path.join(DIR, f)), f);
  for (const [key, r] of Object.entries(m.roles)) {
    for (const style of r.styles) for (const sub of ['latin', 'latin-ext']) {
      assert.ok(m.faces.some((f) => f.role === key && f.style === style && f.subset === sub), `${r.family} ${style} ${sub}`);
    }
  }
});

test('each file is named after its family, with the copyright lines, and no upstream family name outside them', () => {
  for (const f of m.faces) {
    const t = tables(f.file), role = m.roles[f.role];
    assert.equal(nameOf(t, 16) || nameOf(t, 1), f.family, `${f.file}: family name`);
    const copyright = nameOf(t, 0);
    assert.ok(copyright.includes(m.copyright), `${f.file}: our copyright line`);
    assert.match(copyright, /^Copyright \d{4} /, `${f.file}: the upstream copyright line comes first`);
    assert.match(nameOf(t, 13), /Open Font License/, `${f.file}: licence description`);
    for (const r of nameRecords(t)) {
      if (r.nameID !== 0) assert.ok(!r.text.toLowerCase().includes(role.upstream.toLowerCase()), `${f.file}: name ${r.nameID} "${r.text}" keeps the upstream name`);
    }
    const wght = axes(t).find((a) => a.tag === 'wght');
    if (wght) assert.equal(`${wght.min} ${wght.max}`, f.weight, `${f.file}: the weight range matches the CSS`);
  }
});

test('each file has the layout features the manifest offers for its role', () => {
  for (const f of m.faces.filter((x) => x.subset === 'latin')) {
    const have = featureTags(tables(f.file), 'GSUB');
    for (const feat of m.features.filter((x) => x.roles.includes(f.role))) assert.ok(have.includes(feat.tag), `${f.file}: ${feat.tag}`);
    const gpos = featureTags(tables(f.file), 'GPOS');
    assert.ok(gpos.includes('mark'), `${f.file}: mark positioning kept`);
    if (m.roles[f.role].category !== 'mono') assert.ok(gpos.includes('kern'), `${f.file}: kerning kept`);   // a mono font has none upstream
  }
});

test('the OFL licence, every copyright line and the FONTLOG ship with the family, also in the download', () => {
  if (!m.faces.length) return;
  const ofl = readFileSync(path.join(DIR, m.licenceFile), 'utf8');
  assert.match(ofl, /SIL OPEN FONT LICENSE Version 1\.1/);
  assert.ok(ofl.includes(m.copyright), 'our copyright line');
  for (const f of m.faces) assert.ok(ofl.includes(nameOf(tables(f.file), 0).split('; ')[0]), `${f.file}: its upstream copyright line is in OFL.txt`);
  assert.match(readFileSync(path.join(DIR, m.fontlog), 'utf8'), /FONTLOG/);
  const zip = zipMembers(readFileSync(path.join(DIR, m.download))).map((z) => z.name);
  assert.ok(zip.some((n) => n.endsWith('/OFL.txt')) && zip.some((n) => n.endsWith('/FONTLOG.txt')), 'the zip holds the licence and the log');
  const styles = Object.values(m.roles).reduce((n, r) => n + r.styles.length, 0);
  assert.equal(zip.filter((n) => n.endsWith('.ttf')).length, styles, 'one TTF per style');
});

test('no file is larger than the upstream web font it replaces', () => {
  for (const f of m.faces) {
    const up = UPSTREAM_FILES[m.roles[f.role].upstream];
    const file = up && path.join(ROOT, 'shared/fonts', up(f.style, f.subset));
    if (!file || !existsSync(file)) continue;
    assert.ok(statSync(path.join(DIR, f.file)).size <= statSync(file).size, `${f.file} is larger than ${path.relative(ROOT, file)}`);
  }
});

test('fonts.css carries the manifest\'s faces, and the tokens name the family first (or the upstream font without one)', () => {
  const css = read('shared/fonts/fonts.css');
  assert.equal(withBlock(css, m), css, 'the brand-font block is the manifest (node tools/fonts/css.mjs)');
  assert.deepEqual(tokenProblems(read('style/base.css'), tokenValues(m)), []);
  const values = tokenValues(m);
  for (const [role, up] of Object.entries(UPSTREAM)) {
    assert.equal(values[up.marker], m.roles[role] ? m.roles[role].family : up.family);
    const fallback = values[up.marker + 'Fallback'];
    assert.ok(css.includes(`font-family: '${fallback}'`), `${role}: the fallback ${fallback} is declared`);
  }
  assert.equal(faceRules({ faces: [], fallbacks: [] }), '', 'an empty manifest writes no rules');
});

test('the Private Use Area holds brand marks only, never a mascot (a glyph in an OFL font is OFL)', () => {
  for (const g of m.pua) assert.equal(g.kind, 'mark', `U+${g.code} ${g.name}`);
  assert.deepEqual(specProblems({ pua: Object.fromEntries(m.pua.map((g) => [g.code, g])) }), []);
});
