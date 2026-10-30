// Covers: tools/whitelabel/import.mjs, tools/whitelabel/linediff.mjs, tools/whitelabel/transform.mjs
// A change made in a mirror, turned back into a change here: the line diff, a changed line with a renamed identifier and
// a plain name (the source name comes back), a line in regenerated text (reported, not guessed), and a new file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { matches, hunks } from '../../tools/whitelabel/linediff.mjs';
import { backFile, backNewFile, GENERATED } from '../../tools/whitelabel/import.mjs';
import { context, forward, backLine, backPath, forwardPath } from '../../tools/whitelabel/transform.mjs';
import { loadProfile, loadMap, profilesDir } from '../../tools/whitelabel/profile.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ctx = context(ROOT, loadProfile(profilesDir(ROOT), 'sample'), loadMap(profilesDir(ROOT), 'sample'));

test('linediff: matches and hunks', () => {
  const a = ['a', 'b', 'c', 'd'], b = ['a', 'x', 'c', 'd', 'e'];
  assert.deepEqual(matches(a, b), [[0, 0], [2, 2], [3, 3]]);
  assert.deepEqual(hunks(a, b), [{ a: [1, 2], b: [1, 2] }, { a: [4, 4], b: [4, 5] }]);
  assert.deepEqual(hunks(['same'], ['same']), []);
});

test('a changed line comes back with its source names', () => {
  const S = ["// Slop Drive keeps the files", "window.SlopUI.say('Saved to Slop Drive');", 'end();'].join('\n');
  const MA = forward(S, ctx, 'x.js');
  assert.match(MA, /TlbxUI\.say\('Saved to Files'\)/);
  const MB = MA.replace("say('Saved to Files')", "say('Saved to Files, all done')");
  const r = backFile(S, MA, MB, ctx, 'x.js');
  assert.equal(r.text.split('\n')[1], "window.SlopUI.say('Saved to Slop Drive, all done');");
  assert.deepEqual(r.notes, []);
});

test('a line with the profile’s own words is reported', () => {
  const S = 'const a = 1;';
  const MB = 'const a = 1; // Acme Tools only';
  const r = backFile(S, forward(S, ctx, 'y.js'), MB, ctx, 'y.js');
  assert.ok(r.notes.some((n) => /profile's own words/.test(n)));
});

test('a new file, a marker line and a path', () => {
  const r = backNewFile('export const X = window.TlbxApps;\n', ctx, 'shared/n.mjs');
  assert.equal(r.text, 'export const X = window.SlopApps;\n');
  const marker = backLine("const NAMING = /*profile:naming*/\"plain\";", ["const NAMING = /*profile:naming*/'brand';"], ctx, 'shared/apps.js');
  assert.deepEqual(marker, { line: "const NAMING = /*profile:naming*/'brand';", sure: true });
  assert.equal(backPath(forwardPath('photoslop/js/app.js', ctx), ctx), 'photoslop/js/app.js');
  assert.ok(GENERATED.test('brand/brand.json') && !GENERATED.test('pdf/index.html'));
});
