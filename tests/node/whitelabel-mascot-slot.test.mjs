// Covers: tools/whitelabel/mascot.mjs, tools/whitelabel/emit.mjs, tools/whitelabel/profile.mjs, brand/profiles/overlays/acme/icon.js
// The build side of a profile's own mascot: the overlay's file list, its icons, LICENSE-ART, NOTICE and TRADEMARKS, the
// markers. The moments: tests/node/mascot-moments.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { mascotProblems, slotMarkers, ROAM, overlayDir, overlayProblems, overlayIcons, artFiles, licenseArt, artNotice, artTrademarks, artAllow, artHolder, DEST } from '../../tools/whitelabel/mascot.mjs';
import { loadProfile, profilesDir, validate } from '../../tools/whitelabel/profile.mjs';
import { markerValues, applyMarkers, notice, trademarks, readme, logoSvg } from '../../tools/whitelabel/emit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = profilesDir(ROOT);

test('the profile field: false, true, or an overlay with its name and files', () => {
  assert.deepEqual(mascotProblems(false), []);
  assert.deepEqual(mascotProblems({ overlay: 'o', name: 'Bot', files: ['mascot.js', 'icon.js'] }), []);
  assert.equal(mascotProblems({ overlay: 'o' }).length, 2);
  assert.match(mascotProblems('yes')[0], /true, false/);
  assert.match(validate({ legal: { holder: 'A', year: '2026', trademarks: [1] } }).join('\n'), /legal\.trademarks/);
});

test('the sample overlay: every file listed, the required modules, icons drawn in Node', () => {
  const p = loadProfile(DIR, 'sample'), dir = overlayDir(DIR, p);
  assert.deepEqual(overlayProblems(dir, p), []);
  const short = Object.assign({}, p, { mascot: Object.assign({}, p.mascot, { files: ['mascot.js', 'gone.js'] }) });
  const bad = overlayProblems(dir, short).join('\n');
  assert.match(bad, /icon\.js is in the overlay but not listed/);
  assert.match(bad, /gone\.js is listed but not in the overlay/);
  const icons = overlayIcons(dir);
  assert.match(icons.full, /^<svg[^>]* width="64"[^>]*viewBox="0 0 64 64"/);
  assert.match(icons.small, /^<svg[^>]* width="16"/);
  assert.notEqual(icons.full, icons.small);
  assert.match(logoSvg(p, icons.full), /<svg x="0" y="0" width="32" height="32" viewBox="0 0 64 64">.*Acme Tools/s);
});

test('LICENSE-ART, NOTICE and TRADEMARKS name the character and its files', () => {
  const p = loadProfile(DIR, 'sample');
  const files = artFiles(p);
  assert.ok(files.includes(`${DEST}/mascot.js`) && files.includes(`${DEST}/icon.js`) && files.includes('favicon.ico'));
  const art = licenseArt(p);
  assert.match(art, /Copyright \(c\) 2026 Acme Example Ltd\. All rights reserved\./);
  assert.match(art, /not covered by the MIT License/);
  for (const f of files) assert.ok(art.includes(`  ${f}\n`), f);
  assert.match(notice(p), /3\. The Acme Bot character\. Its art, 3D model, animations and icons/);
  assert.match(artNotice(p), /all rights reserved/);
  assert.match(trademarks(p), /"Acme", "Acme Tools", "Acme Bot", their logos and the Acme Bot character design are trademarks of Acme Example Ltd/);
  assert.match(artTrademarks(p), /grants no trademark rights/);
  assert.match(trademarks(p), /different name, logo and mascot/);
  assert.match(readme(p), /LICENSE-ART/);
  const plain = loadProfile(DIR, 'sample-sv');                       // no overlay: no art item, the old wording
  assert.deepEqual(artFiles(plain), []);
  assert.doesNotMatch(notice(plain), /character/);
  assert.match(trademarks(plain), /different name and logo,/);
});

test('a character owned by someone else: its owner in the art files and notices only', () => {
  const p = loadProfile(DIR, 'sample');
  assert.deepEqual(artAllow(p), []);                                  // the site's holder owns it
  const q = Object.assign({}, p, { mascot: Object.assign({}, p.mascot, { holder: 'Bots Inc', trademarks: ['Bots Inc', 'Acme Bot'] }) });
  assert.equal(artHolder(q), 'Bots Inc');
  assert.match(licenseArt(q), /Copyright \(c\) 2026 Bots Inc\. All rights reserved\./);
  assert.match(trademarks(q), /"Acme", "Acme Tools", "Acme Bot" and their logos belong to Acme Example Ltd\. "Bots Inc", "Acme Bot", their logos and the Acme Bot character design are trademarks of Bots Inc\./);
  assert.match(trademarks(q), /suggest that Acme Example Ltd or Bots Inc made/);
  const allow = artAllow(q);
  assert.deepEqual(allow.map((a) => a.file), ['brand/mascot/icon.js', 'brand/mascot/mascot.js', 'LICENSE-ART', 'NOTICE.md', 'TRADEMARKS.md']);
  assert.ok(allow.every((a) => a.term === 'bots inc' && a.why));
});

test('markers: an overlay turns the built-in buddy off and the slot on', () => {
  const v = markerValues(loadProfile(DIR, 'sample'));
  assert.equal(v.mascot, false);
  assert.equal(v.mascotOverlay, true);
  const src = 'const MASCOT = /*profile:mascot*/true;\nconst OVERLAY = /*profile:mascotOverlay*/false;';
  assert.equal(applyMarkers(src, v), 'const MASCOT = /*profile:mascot*/false;\nconst OVERLAY = /*profile:mascotOverlay*/true;');
  const own = markerValues(loadProfile(DIR, 'slopographic'));
  assert.equal(applyMarkers(src, own), src);
});

test('the slot\'s size and roaming: checked in the profile, written into slot.js by the markers', () => {
  const base = { overlay: 'o', name: 'Bot', files: ['mascot.js', 'icon.js'] };
  assert.deepEqual(mascotProblems(Object.assign({}, base, { size: { desktop: 200, phone: 64 }, roam: 'float' })), []);
  assert.deepEqual(mascotProblems(Object.assign({}, base, { size: { desktop: 190 }, roam: true })), []);
  assert.match(mascotProblems(Object.assign({}, base, { size: { desktop: 5 } })).join(), /mascot\.size/);
  assert.match(mascotProblems(Object.assign({}, base, { size: { desktop: 200.5 } })).join(), /mascot\.size/);
  assert.match(mascotProblems(Object.assign({}, base, { size: { tablet: 100 } })).join(), /mascot\.size/);
  assert.match(mascotProblems(Object.assign({}, base, { roam: 'jump' })).join(), /mascot\.roam: true, false or "float" or "hop"/);
  assert.deepEqual(ROAM, ['float', 'hop']);
  const p = loadProfile(DIR, 'sample');                       // the sample sets both
  assert.deepEqual(slotMarkers(p), { mascotDesktop: p.mascot.size.desktop, mascotPhone: p.mascot.size.phone, mascotRoam: 'float' });
  assert.deepEqual(slotMarkers(Object.assign({}, p, { mascot: Object.assign({}, p.mascot, { roam: true, size: undefined }) })), { mascotDesktop: undefined, mascotPhone: undefined, mascotRoam: 'float' });
  assert.deepEqual(slotMarkers(loadProfile(DIR, 'sample-sv')), { mascotDesktop: undefined, mascotPhone: undefined, mascotRoam: undefined });
  const src = readFileSync(path.join(ROOT, 'shared/mascot/slot.js'), 'utf8');
  const line = src.split('\n').find((l) => l.includes('/*profile:mascotRoam*/'));
  assert.ok(line, 'slot.js carries the markers');
  const built = applyMarkers(line, markerValues(p));
  assert.match(built, /\/\*profile:mascotDesktop\*\/200/);
  assert.match(built, /\/\*profile:mascotPhone\*\/64/);
  assert.match(built, /\/\*profile:mascotRoam\*\/"float"/);
  assert.equal(applyMarkers(line, markerValues(loadProfile(DIR, 'slopographic'))), line);   // this site: unchanged
  assert.equal(applyMarkers(line, markerValues(loadProfile(DIR, 'sample-sv'))), line);
});
