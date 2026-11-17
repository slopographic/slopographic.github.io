// Covers: tools/whitelabel/roundtrip.mjs
// The rename map comes back exactly over the whole repository (every copied file and path), for the sample profile:
// what lets a mirror change be imported without guessing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { roundTrip, checkTree } from '../../tools/whitelabel/roundtrip.mjs';
import { context } from '../../tools/whitelabel/transform.mjs';
import { loadProfile, loadMap, profilesDir } from '../../tools/whitelabel/profile.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = profilesDir(ROOT);

test('one text comes back; a planted target is caught', () => {
  const ctx = context(ROOT, loadProfile(DIR, 'sample'), loadMap(DIR, 'sample'));
  assert.deepEqual(roundTrip('window.SlopUI; photoslop/x; a slope', ctx), []);
  const r = roundTrip('ok\nalready Tlbx here', ctx);
  assert.equal(r[0], 2);
});

test('the whole repository comes back (sample profile)', () => {
  const r = checkTree('sample');
  assert.ok(r.files > 1000);
  assert.deepEqual(r.bad, []);
});
