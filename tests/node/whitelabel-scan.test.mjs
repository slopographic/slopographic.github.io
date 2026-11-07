// Covers: tools/whitelabel/scan.mjs
// The leak scan: names in file names, text and bytes; English words allowed; the build's own account in addresses
// allowed; an allowlist entry reported, not hidden, and only for the exact bytes it names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scan, findTerms, isText, report } from '../../tools/whitelabel/scan.mjs';

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

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
  const w = Buffer.concat([Buffer.from([0]), Buffer.from('slop', 'utf16le')]);
  writeFileSync(path.join(dir, 'w.bin'), w);
  const r = scan(dir, ['slop'], [{ file: 'w.bin', term: 'slop', why: 'test', sha256: sha(w) }]);
  const where = r.found.map((h) => `${h.file}:${h.line}`).sort();
  assert.deepEqual(where, ['a/bad.js:2', 'bin.dat:-1', 'slopfile.txt:0']);
  assert.equal(r.allowed.length, 1);
  assert.match(report(r), /3 leftover match\(es\) in 3 file\(s\)/);
  assert.equal(isText(Buffer.from('abc')), true);
});

test('scan: a word spelled so a plain search misses it, and a PDF it cannot read (allowed only for its exact bytes)', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'wl-scan-'));
  writeFileSync(path.join(dir, 'a.js'), "const x = 1;\nconst w = ['a', 'c', 'm', 'e'].join('');\n");
  const pdf = Buffer.from('%PDF-1.7\nnot really a PDF\n%%EOF\n');
  writeFileSync(path.join(dir, 'b.pdf'), pdf);
  const r = scan(dir, ['acme']);
  assert.deepEqual(r.found.map((h) => `${h.file}:${h.line} ${h.term}`), ['a.js:2 acme', 'b.pdf:-1 (unreadable)']);
  assert.match(r.found[0].text, /^\(spelled\) 'a', 'c'/);
  assert.match(report(r), /unreadable PDF/);
  const ok = scan(dir, ['acme'], [{ file: 'b.pdf', term: '(unreadable)', why: 'test', sha256: sha(pdf) }]);
  assert.deepEqual([ok.found.map((h) => h.file), ok.allowed.length], [['a.js'], 1]);
});

test('scan: an allow entry is for the exact bytes it names; other bytes, or no hash, allow nothing', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'wl-scan-'));
  const model = Buffer.concat([Buffer.from([0, 7]), Buffer.from('xxSLOPxx')]);
  writeFileSync(path.join(dir, 'm.onnx'), model);
  const entry = { file: 'm.onnx', term: 'slop', why: 'model weights' };
  const same = scan(dir, ['slop'], [Object.assign({ sha256: sha(model).toUpperCase() }, entry)]);
  assert.deepEqual([same.found.length, same.allowed.length], [0, 1]);
  const other = scan(dir, ['slop'], [Object.assign({ sha256: sha(Buffer.from('an older version')) }, entry)]);
  assert.deepEqual([other.found.length, other.allowed.length], [1, 0]);
  assert.match(report(other), /the allowed file changed/);
  const none = scan(dir, ['slop'], [entry]);
  assert.deepEqual([none.found.length, none.allowed.length], [1, 0]);
  assert.match(report(none), /its allow entry has no sha256/);
});
