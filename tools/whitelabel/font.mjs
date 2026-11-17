// A profile's own type family: "font": { "spec": "<spec.json>", "dir": "<built folder>" } (both relative to the profiles
// folder). The spec is what tools/fonts/build.py builds (a family name, upstream OFL fonts, design changes, stylistic sets,
// ligatures, Private Use Area marks); dir is its output (faces.json, the WOFF2 files, OFL.txt, FONTLOG.txt, the zip),
// built ahead and kept with the profile, so a site build needs no Python. A build of the profile ships that folder as
// shared/fonts/brand/ and writes its @font-face rules and token names; a profile without "font" ships no family at all
// (the upstream fonts, Inter Tight and the others, stay) and no typeface page. Only a plain brand mark may go into a
// family, never a mascot (tools/fonts/spec-rules.mjs). The source site's own family is never
// copied into another build: its files are left out (BRAND_FILES) and the leak scan reads every binary name table.
// Node only. Tests: tests/node/whitelabel-font.test.mjs.
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { EMPTY, tokenValues, withBlock } from '../fonts/css.mjs';
import { specProblems } from '../fonts/spec-rules.mjs';

/** Where a family lands in a build, and the source files a renamed build never copies (this site's family, the font
 * specs, the typeface page when the profile has no family). */
export const DEST = 'shared/fonts/brand';
export const PAGE = 'typeface/';
export const BRAND_FILES = /^(shared\/fonts\/brand|tools\/fonts\/specs)\//;

export const hasFont = (p) => !!(p.font && typeof p.font === 'object');

/** Problems with a profile's font field (validate() adds them). */
export function fontProblems(f) {
  if (f === undefined || f === false) return [];
  const ok = (v) => typeof v === 'string' && /^[\w.-]+(\/[\w.-]+)*$/.test(v);
  if (!f || typeof f !== 'object' || !ok(f.spec) || !ok(f.dir)) return ['font: { spec, dir }: the font spec and its built folder, relative to the profiles folder'];
  return [];
}

/** The built folder of a profile (absolute), or null. */
export const fontDir = (profilesDir, p) => (hasFont(p) ? path.resolve(profilesDir, p.font.dir) : null);

/** The manifest of a profile's family (EMPTY without one). */
export function fontManifest(profilesDir, p) {
  const dir = fontDir(profilesDir, p);
  if (!dir) return EMPTY;
  const f = path.join(dir, 'faces.json');
  if (!existsSync(f)) throw new Error(`font.dir: no faces.json in ${dir} (build it: python3 tools/fonts/build.py <spec> <dir>)`);
  return JSON.parse(readFileSync(f, 'utf8'));
}

/** The files of a built family, from its manifest. */
export const manifestFiles = (m) => [...new Set([...m.faces.map((f) => f.file), m.licenceFile, m.fontlog, m.download, 'faces.json'])].sort();

/** Problems with a profile's family against its spec and folder: a file listed and missing, a file not listed, a spec that
 * names another family or other roles than the folder holds (the folder is out of date: rebuild it). */
export function fontFolderProblems(profilesDir, p) {
  if (!hasFont(p)) return [];
  const dir = fontDir(profilesDir, p), spec = path.resolve(profilesDir, p.font.spec);
  if (!existsSync(dir)) return [`font.dir: no folder ${dir}`];
  if (!existsSync(spec)) return [`font.spec: no file ${spec}`];
  const m = fontManifest(profilesDir, p), s = JSON.parse(readFileSync(spec, 'utf8'));
  const errs = [], have = readdirSync(dir).sort(), want = manifestFiles(m);
  for (const f of want) if (!have.includes(f)) errs.push(`font.dir: ${f} is in faces.json but not in the folder`);
  for (const f of have) if (!want.includes(f)) errs.push(`font.dir: ${f} is in the folder but not in faces.json`);
  if (s.family !== m.family) errs.push(`font: the spec builds ${s.family}, the folder holds ${m.family} (rebuild it)`);
  // only a plain brand mark goes into a font: never the profile's mascot (all-rights-reserved art; a font glyph is OFL)
  const mascot = p.mascot && typeof p.mascot === 'object' ? [p.mascot.name] : [];
  errs.push(...specProblems(s, mascot).map((e) => `font.spec: ${e}`));
  for (const g of m.pua || []) if (g.kind !== 'mark') errs.push(`font.dir: U+${g.code} ${g.name} is not a brand mark (rebuild from a spec that keeps only marks)`);
  const roles = (o) => Object.keys(o).sort().join(',');
  if (roles(s.roles) !== roles(m.roles)) errs.push(`font: the spec has roles ${roles(s.roles)}, the folder ${roles(m.roles)} (rebuild it)`);
  return errs;
}

/** The profile marker values the family sets: the token names (style/base.css), whether the site has a family (the
 * typeface page and its links) and the homepage's preload of the condensed face (the upstream file without one). */
export function fontMarkers(m) {
  return Object.assign(tokenValues(m), {
    font: m.faces.length > 0,
    fontCondPreload: m.roles && m.roles.cond ? true : { 'brand/cond-normal-latin.woff2': 'archivo/archivo-var-normal-latin.woff2' },
  });
}

/** True for a source file a renamed build of p leaves out: this site's family and specs always, the typeface page when p
 * has no family. */
export const fontExcluded = (file, p) => BRAND_FILES.test(file) || (!hasFont(p) && file.startsWith(PAGE));

/** Writes p's family into a build (out: the build folder; dir: the profile's built folder or null): its files in
 * shared/fonts/brand/ (an empty faces.json without one) and its @font-face rules in shared/fonts/fonts.css. */
export function emitFont(out, p, dir) {
  const dest = path.join(out, DEST);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  let m = EMPTY;
  if (dir) {
    m = JSON.parse(readFileSync(path.join(dir, 'faces.json'), 'utf8'));
    for (const f of manifestFiles(m)) writeFileSync(path.join(dest, f), readFileSync(path.join(dir, f)));
  } else {
    writeFileSync(path.join(dest, 'faces.json'), JSON.stringify(EMPTY, null, 1) + '\n');
  }
  const css = path.join(out, 'shared/fonts/fonts.css');
  writeFileSync(css, withBlock(readFileSync(css, 'utf8'), m));
  return m;
}
