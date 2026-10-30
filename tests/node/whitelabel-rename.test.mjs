// Covers: tools/whitelabel/rename.mjs
// The renamer's three passes: links, visible names (prose only, never code), and the reversible token map (case kept,
// English words with the stem left alone, folder names, the exact reverse, the collision check).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { urls, phraseRules, phrases, tokenRules, reverseRules, tokens, renamePath, mapPairs, collisions, KEEP } from '../../tools/whitelabel/rename.mjs';

const MAP = { stem: ['slop', 'tlbx'], compounds: [
  { from: 'slopographic', to: 'worksuite', fromCamel: 'Slopographic', toCamel: 'WorkSuite' },
  { from: 'photoslop', to: 'imageeditor', fromCamel: 'PhotoSlop', toCamel: 'ImageEditor', path: 'image-editor' },
  { from: 'slopedit', to: 'videoedit', fromCamel: 'SlopEdit', toCamel: 'VideoEdit' },
] };
const fwd = tokenRules(MAP), rev = reverseRules(MAP);

test('urls: the origin, the account, the site repository and the mail domain', () => {
  const m = { origin: 'https://tools.acme.example', github: 'acme', repo: 'acme/tools', mail: 'acme.example' };
  assert.equal(urls('see https://slopographic.com/pdf/ and https://www.slopographic.com', m), 'see https://tools.acme.example/pdf/ and https://www.tools.acme.example');
  assert.equal(urls('https://github.com/slopographic/apps/blob/main/LICENSE', m), 'https://github.com/acme/tools/blob/main/LICENSE');
  assert.equal(urls('https://cdn.jsdelivr.net/gh/slopographic/cdn@1/x', m), 'https://cdn.jsdelivr.net/gh/acme/cdn@1/x');
  assert.equal(urls('mail noreply@slopographic.com', m), 'mail noreply@acme.example');
  assert.equal(urls('https://x.com/Slopographic', m), 'https://tools.acme.example/');
  assert.equal(urls('/OLLAMA_ORIGINS to https:\\/\\/slopographic\\.com/', m), '/OLLAMA_ORIGINS to https:\\/\\/tools\\.acme\\.example/');
});

test('phrases: names in prose change, names written as code do not', () => {
  const r = phraseRules([['Slop Drive', 'Files'], ['PhotoSlop', 'Image Editor'], ['Slopographic', 'Acme Tools']], 'Acme');
  assert.equal(phrases('Save to Slop Drive.', r), 'Save to Files.');
  assert.equal(phrases("'PhotoSlop: photo editor'", r), "'Image Editor: photo editor'");
  assert.equal(phrases('window.PhotoSlop.open(); new PhotoSlop; const PhotoSlop = 1;', r), 'window.PhotoSlop.open(); new PhotoSlop; const PhotoSlop = 1;');
  assert.equal(phrases('PhotoSlop(x) PhotoSlop[0] my-PhotoSlop PhotoSlopX', r), 'PhotoSlop(x) PhotoSlop[0] my-PhotoSlop PhotoSlopX');
  assert.equal(phrases('Open in Slop Hub, the Slop apps', r), 'Open in Hub, the Acme apps');
  assert.equal(phrases('Made by Slopographic', r), 'Made by Acme Tools');
});

test('tokens: every case form, compounds before the stem, folder names before a slash', () => {
  assert.equal(tokens('SlopUI SLOP_APPS data-slop-ad slopui.css', fwd), 'TlbxUI TLBX_APPS data-tlbx-ad tlbxui.css');
  assert.equal(tokens('PhotoSlop photoSlop PHOTOSLOP photoslop Photoslop', fwd), 'ImageEditor imageEditor IMAGEEDITOR imageeditor Imageeditor');
  assert.equal(tokens("'photoslop/js/app.js' data-app=\"photoslop\"", fwd), "'image-editor/js/app.js' data-app=\"imageeditor\"");
  assert.equal(tokens('slopedit sloped', fwd), 'videoedit sloped');
  assert.equal(renamePath('photoslop/css/photoslop.css', fwd), 'image-editor/css/imageeditor.css');
});

test('tokens: English words with the stem are kept (no partial-word damage)', () => {
  const words = 'a slope, two slopes, it sloped, sloping, sloppy work, SLOPE(x), slopeX, getSlope()';
  assert.equal(tokens(words, fwd), words);
  assert.ok(KEEP.includes('sloped'));
});

test('reverse: the token pass comes back exactly, paths too', () => {
  const src = "PhotoSlop SlopUI SLOP_APPS 'photoslop/x.js' slopedit Slopographic slopographic-backup.json a slope";
  assert.equal(tokens(tokens(src, fwd), rev), src);
  for (const p of ['photoslop/css/photoslop.css', 'tests/photoslop/a.test.html', 'shared/slopui.js']) assert.equal(renamePath(renamePath(p, fwd), rev), p);
});

test('collisions: a target that already occurs in the source is found', () => {
  assert.deepEqual(collisions('nothing here', MAP), []);
  assert.deepEqual(collisions('a Tlbx and an imageeditor', MAP).map((c) => c[0]).sort(), ['Tlbx', 'imageeditor']);
  assert.ok(mapPairs(MAP).pairs.some(([a, b]) => a === 'SLOP' && b === 'TLBX'));
});
