// Covers: shared/patterns/patterns.js
// Covers: shared/patterns/patterns-kinds.js
// SlopPatterns (shared/patterns/HANDOFF.md): the table of kinds, and for each kind a table of positives and negatives, with the
// checks (validate: false skips them). Fixtures: patterns-fixture.mjs. Other files: patterns-engine.test.mjs, patterns-perf.test.mjs.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { P, texts, POS, NEG, KEY, KEY_BEGIN, KEY_END, BEARER_TOKEN } from './patterns-fixture.mjs';

describe('kinds table', () => {
  test('ids, groups, secrets and labels', () => {
    const ids = P.KINDS.map((k) => k.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const k of P.KINDS) {
      assert.deepEqual(Object.keys(k).sort(), ['group', 'id', 'label', 'secret']);
      assert.match(k.id, /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/);
      assert.ok(['network', 'identity', 'secret', 'id'].includes(k.group), k.id);
      assert.equal(typeof k.secret, 'boolean');
      assert.ok(k.label && typeof k.label === 'string');
    }
    for (const id of ['ipv4', 'ipv6', 'mac', 'email', 'url', 'uuid', 'jwt', 'aws_access_key', 'aws_secret', 'github_token', 'slack_token', 'stripe_key', 'google_api_key',
      'private_key', 'bearer', 'basic_auth_url', 'secret_assignment', 'hash', 'credit_card', 'iban']) assert.ok(ids.includes(id), id);
    assert.equal(ids.slice(0, 5).join(), 'ipv4,ipv6,mac,email,url');
    assert.deepEqual(P.KINDS.filter((k) => k.secret).map((k) => k.id), ['jwt', 'aws_access_key', 'aws_secret', 'github_token', 'slack_token', 'stripe_key', 'google_api_key',
      'private_key', 'bearer', 'basic_auth_url', 'secret_assignment', 'credit_card']);
    assert.equal(P.byId('hash').label, 'Hash (MD5, SHA-1, SHA-256)');
    assert.deepEqual(Object.keys(POS).sort(), ids.slice().sort());
    assert.deepEqual(Object.keys(NEG).sort(), ids.slice().sort());
  });
  test('byId', () => {
    assert.equal(P.byId('email'), P.KINDS.find((k) => k.id === 'email'));
    for (const bad of ['nope', '', null, undefined, 'constructor', '__proto__', 'toString']) assert.equal(P.byId(bad), null, String(bad));
  });
});

describe('every kind: positives and negatives', () => {
  for (const kind of Object.keys(POS)) {
    test(kind + ' finds what it should', () => {
      assert.ok(POS[kind].length >= 1);
      for (const [input, want] of POS[kind]) assert.deepEqual(texts(input, kind), want, JSON.stringify(input));
    });
    test(kind + ' ignores what it should', () => {
      for (const input of NEG[kind]) assert.deepEqual(texts(input, kind), [], JSON.stringify(input));
    });
    test(kind + ' reports exact offsets', () => {
      for (const [input] of POS[kind]) {
        const pre = 'start ', post = ' end';
        const s = pre + input + post;
        for (const h of P.scan(s, { kinds: [kind] })) {
          assert.equal(h.kind, kind);
          assert.equal(s.slice(h.start, h.end), h.text);
        }
      }
    });
  }
  test('private key: ends at the END line, at the end of the text, and never over 20000 characters', () => {
    const t = 'before\n' + KEY + '\nafter ' + KEY_BEGIN;
    assert.deepEqual(texts(t, 'private_key'), [KEY, KEY_BEGIN]);
    const long = P.scan('x ' + KEY_BEGIN + '\n' + 'A'.repeat(50000), { kinds: ['private_key'] });
    assert.equal(long.length, 1);
    assert.ok(long[0].end - long[0].start <= 20000 && long[0].end - long[0].start > 19000);
    const big = P.scan(KEY_BEGIN + '\n' + 'QUJD\n'.repeat(3000) + KEY_END, { kinds: ['private_key'] });
    assert.equal(big.length, 1);
    assert.ok(big[0].text.endsWith(KEY_END));
  });
  test('bearer and password-in-URL and assignments report only the secret part', () => {
    const h = P.scan('Authorization: Bearer ' + BEARER_TOKEN)[0];
    assert.deepEqual([h.kind, h.start, h.text], ['bearer', 22, BEARER_TOKEN]);
    const u = P.scan('db = postgres://alice:S3cr3tPw@db.example.com/app')[0];
    assert.deepEqual([u.kind, u.text], ['basic_auth_url', 'alice:S3cr3tPw']);
    const a = P.scan('password = "hunter2hunter2"')[0];
    assert.deepEqual([a.kind, a.start, a.end, a.text], ['secret_assignment', 12, 26, 'hunter2hunter2']);
  });
  test('validate: false skips the checks (Luhn, mod 97, structure) but still scans', () => {
    assert.deepEqual(texts('4111111111111112', 'credit_card', { validate: false }), ['4111111111111112']);
    assert.deepEqual(texts('GB82' + 'WEST12345698765431', 'iban', { validate: false }), ['GB82' + 'WEST12345698765431']);
    assert.deepEqual(texts('aws secret ' + 'x'.repeat(0) + 'Ab3d'.repeat(10), 'aws_secret', { validate: false }), ['Ab3d'.repeat(10)]);
    assert.deepEqual(texts('plain ' + 'Ab3d'.repeat(10), 'aws_secret', { validate: false }), ['Ab3d'.repeat(10)]);
    assert.deepEqual(texts('password=changeme123', 'secret_assignment', { validate: false }), ['changeme123']);
    assert.deepEqual(texts('password=xxxxxxxx', 'secret_assignment', { validate: false }), ['xxxxxxxx']);
    assert.ok(texts('a:b:c', 'ipv6', { validate: false }).length >= 1);
    assert.deepEqual(texts('a:b:c', 'ipv6'), []);
    assert.deepEqual(texts('1'.repeat(32), 'hash', { validate: false }), ['1'.repeat(32)]);
  });
});
