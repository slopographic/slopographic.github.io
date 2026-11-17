// Slop Compare, the text diff: the sequence diff (diff/js/core/myers.js), lines and words (text.js) and the unified patch
// (patch.js), checked on small cases and on random edits whose patch must turn A back into B.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffSeq, runs } from '../../diff/js/core/myers.js';
import { diffLines, diffWords, splitLines, visible, blockOf, keyOf } from '../../diff/js/core/text.js';
import { unified, applyPatch } from '../../diff/js/core/patch.js';

const rebuild = (a, b, ops) => ops.filter((o) => o.op !== 'del').map((o) => (o.op === 'eq' ? a[o.a] : b[o.b]));
const cost = (ops) => ops.filter((o) => o.op !== 'eq').length;

test('the sequence diff finds the smallest edit script and rebuilds B', () => {
  const a = 'ABCABBA'.split(''), b = 'CBABAC'.split('');
  const { ops, exact } = diffSeq(a, b);
  assert.equal(exact, true);
  assert.equal(cost(ops), 5);   // Myers' paper: D = 5
  assert.deepEqual(rebuild(a, b, ops), b);
  assert.deepEqual(diffSeq([], []).ops, []);
  assert.deepEqual(diffSeq(['x'], []).ops, [{ op: 'del', a: 0, b: -1 }]);
  assert.deepEqual(diffSeq([], ['y']).ops, [{ op: 'ins', a: -1, b: 0 }]);
});

test('random edits: every diff rebuilds B, and equal inputs have no edits', () => {
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let t = 0; t < 200; t++) {
    const a = Array.from({ length: rnd(30) }, () => 'abcde'[rnd(5)]);
    const b = a.slice();
    for (let k = rnd(6); k > 0; k--) { const i = rnd(b.length + 1); if (rnd(2)) b.splice(i, 1); else b.splice(i, 0, 'xyz'[rnd(3)]); }
    const { ops } = diffSeq(a, b);
    assert.deepEqual(rebuild(a, b, ops), b);
    assert.equal(cost(diffSeq(a, a).ops), 0);
  }
});

test('past maxCost the middle is one block, still correct', () => {
  const a = Array.from({ length: 50 }, (_, i) => 'a' + i), b = Array.from({ length: 50 }, (_, i) => 'b' + i);
  const r = diffSeq(a, b, undefined, { maxCost: 10 });
  assert.equal(r.exact, false);
  assert.deepEqual(rebuild(a, b, r.ops), b);
  assert.equal(runs(r.ops).length, 1);
});

test('lines: a changed line is a mod pair; added and removed lines; blocks in order', () => {
  const r = diffLines('one\ntwo\nthree\nfour\n', 'one\nTWO\nthree\nfour\nfive\n');
  assert.deepEqual(r.rows.map((x) => x.t), ['eq', 'mod', 'eq', 'eq', 'ins']);
  assert.deepEqual(r.blocks, [{ start: 1, end: 2 }, { start: 4, end: 5 }]);
  assert.equal(r.stats.blocks, 2);
  assert.equal(r.stats.added, 2);
  assert.equal(r.stats.removed, 1);
  assert.equal(blockOf(r.blocks, 4), 1);
  assert.equal(blockOf(r.blocks, 0), -1);
});

test('ignore whitespace and ignore case', () => {
  assert.equal(diffLines('a  b\nC\n', 'a b \nc\n').stats.changed, 2);
  assert.equal(diffLines('a  b\nC\n', 'a b \nc\n', { ignoreWs: true, ignoreCase: true }).stats.blocks, 0);
  assert.equal(keyOf('  A\tB ', { ignoreWs: true, ignoreCase: true }), 'a b');
  assert.deepEqual(splitLines('a\r\nb\r\n'), { lines: ['a', 'b'], newline: true });
  assert.equal(diffLines('a\nb', 'a\nb\n').stats.newlineOnly, true);
});

test('words: only the changed words are marked, and alike lines score high', () => {
  const w = diffWords('The quick brown fox', 'The quick red fox');
  assert.deepEqual(w.a.filter((p) => p.ch).map((p) => p.text), ['brown']);
  assert.deepEqual(w.b.filter((p) => p.ch).map((p) => p.text), ['red']);
  assert.ok(w.similarity > 0.6);
  assert.ok(diffWords('alpha beta', 'gamma delta').similarity < 0.1);
  assert.deepEqual(diffWords('Hello World', 'hello world', { ignoreCase: true }).a.filter((p) => p.ch), []);
});

test('folds: long unchanged runs fold, keeping the context around each change', () => {
  const a = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n'), b = a.replace('line 10', 'line ten');
  const r = diffLines(a, b);
  const v = visible(r.rows, r.blocks, 2);
  assert.deepEqual(v.map((x) => x.t), ['fold', 'eq', 'eq', 'mod', 'eq', 'eq', 'fold']);
  assert.deepEqual([v[0].from, v[0].to, v[6].from, v[6].to], [0, 8, 13, 20]);
  assert.equal(visible(r.rows, r.blocks, -1).length, 20);
});

test('the unified patch: hunk headers as diff -u writes them, and it applies back', () => {
  const a = 'a\nb\nc\nd\ne\nf\ng\nh\ni\nj\n', b = 'a\nb\nC\nd\ne\nf\ng\nh\ni\nj\nk\n';
  const p = unified(diffLines(a, b), { nameA: 'a.txt', nameB: 'b.txt' });
  assert.equal(p, '--- a.txt\n+++ b.txt\n@@ -1,6 +1,6 @@\n a\n b\n-c\n+C\n d\n e\n f\n@@ -8,3 +8,4 @@\n h\n i\n j\n+k\n');
  assert.equal(applyPatch(a, p), b);
  assert.equal(unified(diffLines(a, a)), '');
});

test('the patch marks a missing final line break, and round-trips random texts', () => {
  const p = unified(diffLines('x\ny', 'x\ny\n'));
  assert.match(p, /-y\n\\ No newline at end of file\n\+y\n/);
  assert.equal(applyPatch('x\ny', p), 'x\ny\n');
  let seed = 3;
  const rnd = (n) => { seed = (seed * 16807) % 2147483647; return seed % n; };
  for (let t = 0; t < 120; t++) {
    const a = Array.from({ length: rnd(25) + 1 }, () => 'w' + rnd(6)), b = a.slice();
    for (let k = rnd(5) + 1; k > 0; k--) { const i = rnd(b.length + 1); if (rnd(2)) b.splice(i, 1); else b.splice(i, 0, 'n' + rnd(4)); }
    const ta = a.join('\n') + (rnd(2) ? '\n' : ''), tb = b.join('\n') + (rnd(2) ? '\n' : '');
    for (const context of [0, 1, 3]) assert.equal(applyPatch(ta, unified(diffLines(ta, tb), { context })) || '', tb.length ? tb : '', `case ${t} context ${context}`);
  }
});
