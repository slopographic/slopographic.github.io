// Whisper's per-step logit rules (aitools/workers/whisper-logits.js) on fake logits: suppress lists, the timestamp rules
// (pairs, never backwards, the first one by 1.0 s, forced when the timestamps together win), sampling and languages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { S, V, ts, ctx, row } from './whisper-fake.mjs';

const require = createRequire(import.meta.url);
const L = require('../../aitools/workers/whisper-logits.js');
const best = (r) => L.pick(r, 0);
const dead = (r, t) => r[t] === -Infinity;

test('suppress_tokens, begin_suppress on the first token, and every special but end-of-text are never picked', () => {
  const c = ctx({ suppress: [3], beginSuppress: [4, S.eot], timestamps: false });
  const r = L.applyRules(row(3, [[4, 9], [S.sot, 20], [S.noTimestamps, 30], [S.noSpeech, 25], [5, 1]]), [], c);
  assert.ok(dead(r, 3) && dead(r, 4) && dead(r, S.sot) && dead(r, S.noTimestamps) && dead(r, S.noSpeech) && dead(r, S.eot));
  assert.equal(best(r), 5);
  // after the first token, begin_suppress no longer applies
  assert.equal(best(L.applyRules(row(4), [5], c)), 4);
  assert.equal(best(L.applyRules(row(S.eot), [5], c)), S.eot);
});

test('the first token is a timestamp, no later than max_initial_timestamp (1.0 s)', () => {
  const r = L.applyRules(row(2, [[ts(3), 12], [ts(0.4), 1]]), [], ctx());
  assert.ok(dead(r, 2), 'text cannot come first');
  assert.ok(dead(r, ts(3)) && dead(r, ts(1.02)), 'nothing after 1.0 s');
  assert.ok(!dead(r, ts(1.0)));
  assert.equal(best(r), ts(0.4));
});

test('timestamps come in pairs: after text and a timestamp, the next is a timestamp or the end', () => {
  const seq = [ts(0), 1, 2, ts(2)];   // a closing timestamp
  const r = L.applyRules(row(3, [[ts(2), 5], [S.eot, 4]]), seq, ctx());
  assert.ok(dead(r, 3), 'no text right after a closing timestamp');
  assert.ok(!dead(r, ts(2)), 'the next segment may start where this one ended');
  assert.ok(dead(r, ts(1.98)), 'never backwards');
  assert.equal(best(r), ts(2));
  // after a pair (closing + opening) comes text, never a third timestamp
  const r2 = L.applyRules(row(ts(3), [[3, 1]]), seq.concat([ts(2)]), ctx());
  assert.ok(dead(r2, ts(3)));
  assert.equal(best(r2), 3);
});

test('timestamps never go backwards, and <|notimestamps|> is never chosen', () => {
  const r = L.applyRules(row(ts(1), [[4, 12], [S.noTimestamps, 50]]), [ts(0), 1, 2, ts(3), ts(3), 5], ctx());
  assert.ok(dead(r, S.noTimestamps));
  for (const t of [ts(0), ts(1), ts(3)]) assert.ok(dead(r, t), `${t} is not after 3 s`);
  assert.equal(best(r), 4);
});

test('a timestamp is forced when the timestamps together are more likely than the best text token', () => {
  // text token 1 has the single highest logit, but many timestamps together outweigh it
  const extra = []; for (let s = 2.1; s < 4; s += 0.02) extra.push([ts(s), 6]);
  const r = L.applyRules(row(null, [[1, 8], ...extra]), [ts(0), 1, 2], ctx());
  assert.ok(dead(r, 1), 'text is ruled out');
  assert.ok(best(r) >= S.ts0);
  // one weak timestamp does not force anything
  const r2 = L.applyRules(row(null, [[1, 8], [ts(2.5), 6]]), [ts(0), 1, 2], ctx());
  assert.equal(best(r2), 1);
});

test('sampling: temperature 0 is the best token; a seeded generator gives the same samples every time', () => {
  const r = Float32Array.from({ length: V }, (_, i) => (i < 6 ? 1 : -Infinity));
  assert.equal(L.pick(row(3), 0), 3);
  const a = L.rng(7), b = L.rng(7);
  const xs = Array.from({ length: 20 }, () => L.pick(r, 1, a)), ys = Array.from({ length: 20 }, () => L.pick(r, 1, b));
  assert.deepEqual(xs, ys);
  assert.ok(new Set(xs).size > 1, 'a hot sample is not always the same token');
  assert.ok(xs.every((x) => x < 6), 'never a ruled-out token');
});

test('language probabilities are over the language tokens only, most likely first', () => {
  const langs = [{ code: 'en', id: 1 }, { code: 'sv', id: 2 }, { code: 'de', id: 3 }];
  const p = L.languageProbs(row(null, [[1, 1], [2, 3], [3, 0], [5, 50]]), langs);
  assert.deepEqual(p.map((x) => x.code), ['sv', 'en', 'de']);
  assert.ok(Math.abs(p.reduce((n, x) => n + x.p, 0) - 1) < 1e-9);
  assert.ok(p[0].p > 0.8);
  assert.ok(Math.abs(L.probOf(row(null, [[4, 30]]), 4) - 1) < 1e-6);
});
