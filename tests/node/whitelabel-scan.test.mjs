// Covers: tools/whitelabel/scan.mjs
// The leak scan: names in file names, text and bytes; English words allowed; the build's own account in addresses
// allowed; an allowlist entry reported, not hidden.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scan, findTerms, isText, report } from '../../tools/whitelabel/scan.mjs';

test('findTerms: the stem, but not slope, sloped, SLOPE or slopeX', () => {
  assert.equal(findTerms('a slope that sloped, SLOPE(), slopeX, caretSlopeRise', ['slop']).length, 0);
  assert.equal(findTerms('sloppy', ['slop']).length, 1);   // only the slope family is allowed
  assert.equal(findTerms('SlopUI and slop-drive', ['slop']).length, 2);
  assert.equal(findTerms('see https://github.com/acme/x and acme.github.io', ['acme'], { account: 'acme' }).length, 0);
  assert.equal(findTerms('made by acme', ['acme'], { account: 'acme' }).length, 1);
  assert.equal(findTerms('the acme/cdn repository', ['acme'], { account: 'acme' }).length, 0);
  assert.equal(findTerms('/gh\\/acme\\/cdn@/ and acme@users.noreply.github.com', ['acme'], { account: 'acme' }).length, 0);
});

test('scan: file names, text lines, bytes and the allowlist', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'wl-scan-'));
  mkdirSync(path.join(dir, 'a'));
  writeFileSync(path.join(dir, 'a', 'ok.txt'), 'a gentle slope\n');
  writeFileSync(path.join(dir, 'a', 'bad.js'), 'line one\nwindow.SlopUI = 1;\n');
  writeFileSync(path.join(dir, 'slopfile.txt'), 'clean\n');
  writeFileSync(path.join(dir, 'bin.dat'), Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from('xxslopographicxx')]));
  writeFileSync(path.join(dir, 'w.bin'), Buffer.concat([Buffer.from([0]), Buffer.from('slop', 'utf16le')]));
  const r = scan(dir, ['slop'], [{ file: 'w.bin', term: 'slop', why: 'test' }]);
  const where = r.found.map((h) => `${h.file}:${h.line}`).sort();
  assert.deepEqual(where, ['a/bad.js:2', 'bin.dat:-1', 'slopfile.txt:0']);
  assert.equal(r.allowed.length, 1);
  assert.match(report(r), /3 leftover match\(es\) in 3 file\(s\)/);
  assert.equal(isText(Buffer.from('abc')), true);
});
