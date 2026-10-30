// A brand profile's type family in a white-label build (tools/whitelabel/font.mjs): the profile names its font spec and
// built folder, the build ships that family instead of this site's (or no family, and the upstream fonts, without one),
// the token markers and the typeface page follow, and the leak scan reads the name tables inside WOFF2 files and zips,
// so no build can carry a font named after another brand.
// Covers: tools/whitelabel/font.mjs, tools/whitelabel/unpack.mjs, tools/whitelabel/emit.mjs, tools/whitelabel/build.mjs, tools/whitelabel/scan.mjs, tools/whitelabel/profile.mjs, tools/fonts/zip.mjs, tools/fonts/spec-rules.mjs
// Run: node --test tests/node/whitelabel-font.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProfile, validate } from '../../tools/whitelabel/profile.mjs';
import { markerValues, applyMarkers, applyBlocks } from '../../tools/whitelabel/emit.mjs';
import { excluded } from '../../tools/whitelabel/build.mjs';
import { fontProblems, fontFolderProblems, emitFont, fontDir, DEST, PAGE } from '../../tools/whitelabel/font.mjs';
import { scan } from '../../tools/whitelabel/scan.mjs';
import { unpack } from '../../tools/whitelabel/unpack.mjs';
import { woff2Tables, nameRecords } from '../../tools/fonts/woff2.mjs';
import { START, END } from '../../tools/fonts/css.mjs';
import { specProblems } from '../../tools/fonts/spec-rules.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = path.join(ROOT, 'brand', 'profiles');
const own = loadProfile(DIR, 'slopographic'), acme = loadProfile(DIR, 'sample'), plain = loadProfile(DIR, 'sample-sv');

test('a profile names its font spec and built folder, and the folder matches the spec', () => {
  assert.deepEqual(fontProblems(undefined), []);
  assert.deepEqual(fontProblems({ spec: 'fonts/acme/acme.json', dir: 'fonts/acme/dist' }), []);
  assert.equal(fontProblems({ spec: '../x y.json' }).length, 1);
  assert.ok(validate(Object.assign({}, plain, { font: 'acme' })).some((e) => /^font:/.test(e)));
  for (const p of [own, acme]) assert.deepEqual(fontFolderProblems(DIR, p), [], p.id);
  assert.equal(acme.fontManifest.family, 'Acme');
  assert.equal(plain.fontManifest.faces.length, 0);
});

test('the token markers name each profile\'s family, or the upstream fonts without one', () => {
  const css = readFileSync(path.join(ROOT, 'style/base.css'), 'utf8');
  assert.equal(applyMarkers(css, markerValues(own)), css, 'this site: the source as it is');
  const a = applyMarkers(css, markerValues(acme));
  assert.match(a, /--sans: \/\*profile:fontSans\*\/"Acme Sans", \/\*profile:fontSansFallback\*\/"Inter Tight Fallback"/);
  assert.match(a, /--serif: \/\*profile:fontSerif\*\/"Instrument Serif"/, 'a role the family lacks keeps the upstream font');
  const p = applyMarkers(css, markerValues(plain));
  assert.match(p, /--sans: \/\*profile:fontSans\*\/"Inter Tight"/);
  assert.ok(!/Slopographic|Acme/.test(p.match(/--cond:[^;]*;|--serif:[^;]*;|--sans:[^;]*;|--mono:[^;]*;/g).join('')));
});

test('one-line HTML blocks: kept, emptied, or kept with a replacement; the line count never changes', () => {
  const html = '<a><!--profile:font--><b>x</b><!--/profile:font--></a>';
  assert.equal(applyBlocks(html, { font: true }), html);
  assert.equal(applyBlocks(html, { font: false }), '<a><!--profile:font--><!--/profile:font--></a>');
  assert.equal(applyBlocks('<!--profile:fontCondPreload-->brand/cond-normal-latin.woff2<!--/profile:fontCondPreload-->', markerValues(plain)),
    '<!--profile:fontCondPreload-->archivo/archivo-var-normal-latin.woff2<!--/profile:fontCondPreload-->');
  assert.throws(() => applyBlocks('<!--profile:nope-->x<!--/profile:nope-->', {}), /unknown profile marker/);
  const home = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.equal(applyMarkers(home, markerValues(plain)).split('\n').length, home.split('\n').length);
  assert.ok(!applyMarkers(home, markerValues(plain)).includes('href="typeface/"'), 'no link to a page the build leaves out');
});

test('a renamed build never copies this site\'s family or specs, and leaves the typeface page out without a family', () => {
  for (const p of [acme, plain]) {
    assert.ok(excluded(`${DEST}/sans-normal-latin.woff2`, p));
    assert.ok(excluded('tools/fonts/specs/slopographic.json', p));
    assert.ok(!excluded('tools/fonts/build.py', p));
  }
  assert.ok(!excluded(`${PAGE}index.html`, acme));
  assert.ok(excluded(`${PAGE}index.html`, plain));
});

function siteCopy() {
  const out = mkdtempSync(path.join(tmpdir(), 'wl-font-'));
  mkdirSync(path.join(out, 'shared/fonts'), { recursive: true });
  copyFileSync(path.join(ROOT, 'shared/fonts/fonts.css'), path.join(out, 'shared/fonts/fonts.css'));
  return out;
}

test('a build ships the profile\'s family: its files, its CSS block, and names that say so', () => {
  const out = siteCopy();
  try {
    const m = emitFont(out, acme, fontDir(DIR, acme));
    const files = readdirSync(path.join(out, DEST));
    assert.ok(files.includes('faces.json') && files.includes('OFL.txt') && files.includes(m.download));
    const css = readFileSync(path.join(out, 'shared/fonts/fonts.css'), 'utf8');
    assert.ok(css.includes("font-family: 'Acme Sans'") && !css.includes('Slopographic Sans'));
    for (const f of files.filter((x) => x.endsWith('.woff2'))) {
      const names = nameRecords(woff2Tables(readFileSync(path.join(out, DEST, f)))).map((r) => r.text).join('\n');
      assert.match(names, /Acme Sans/, f);
      assert.doesNotMatch(names, /slop/i, f);
    }
    assert.deepEqual(scan(out, ['slop', 'acme tools']).found.filter((h) => h.file.startsWith(DEST) && h.term === 'slop'), []);
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('a build without a family ships an empty manifest, an empty block and no font file at all', () => {
  const out = siteCopy();
  try {
    emitFont(out, plain, null);
    assert.deepEqual(readdirSync(path.join(out, DEST)), ['faces.json']);
    const css = readFileSync(path.join(out, 'shared/fonts/fonts.css'), 'utf8');
    assert.ok(css.includes(START + '\n' + END), 'an empty brand block');
    assert.ok(!/Slopographic/.test(css));
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('the leak scan reads the name tables inside WOFF2 files and zips', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'wl-scan-'));
  try {
    const m = own.fontManifest;
    copyFileSync(path.join(ROOT, DEST, m.faces[0].file), path.join(dir, 'a.woff2'));
    copyFileSync(path.join(ROOT, DEST, m.download), path.join(dir, 'b.zip'));
    writeFileSync(path.join(dir, 'c.bin'), Buffer.from([0, 1, 2, 3]));
    const hits = scan(dir, ['slop']).found;
    assert.ok(hits.some((h) => h.file === 'a.woff2' && /table name/.test(h.text)), 'the name table inside the WOFF2');
    assert.ok(hits.some((h) => h.file === 'b.zip' && /\.ttf/.test(h.text)), 'the fonts inside the zip');
    assert.ok(!hits.some((h) => h.file === 'c.bin'));
    assert.ok(unpack('a.woff2', readFileSync(path.join(dir, 'a.woff2'))).some((x) => x.label === 'table name'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a spec that puts a mascot into a font is refused: only a plain brand mark may go in', () => {
  const mark = { pua: { mark: { code: 'E000', name: 'Acme mark', kind: 'mark', drawing: 'mark' } }, drawings: { mark: {} } };
  assert.deepEqual(specProblems(mark, ['Acme Bot']), []);
  assert.ok(specProblems({ pua: { bot: { code: 'E000', name: 'Helper', drawing: 'x' } } }).some((e) => /only a brand mark/.test(e)), 'no kind: refused');
  assert.ok(specProblems({ pua: { m: { code: 'E000', name: 'Acme Bot', kind: 'mark', drawing: 'x' } } }, ['Acme Bot']).some((e) => /mascot/.test(e)), 'named after the profile\'s mascot');
  assert.ok(specProblems({ mascots: ['Mascot One'], drawings: { 'mascot one': {} } }).length > 0, 'a drawing of the spec\'s own mascot');
  // the real profiles: the white-label build refuses a font folder whose spec or glyphs break the rule
  const bad = Object.assign({}, acme, { mascot: Object.assign({}, acme.mascot, { name: 'Acme mark' }) });
  Object.defineProperty(bad, 'fontManifest', { value: acme.fontManifest });
  assert.ok(fontFolderProblems(DIR, bad).some((e) => /font\.spec: pua\.mark/.test(e)));
  for (const p of [own, acme]) {
    const spec = JSON.parse(readFileSync(path.resolve(DIR, p.font.spec), 'utf8'));
    assert.deepEqual(specProblems(spec, p.mascot && typeof p.mascot === 'object' ? [p.mascot.name] : []), [], p.id);
    assert.ok(p.fontManifest.pua.every((g) => g.kind === 'mark'), p.id);
  }
});
