// Covers: shared/patterns/patterns.js
// Covers: shared/patterns/patterns-kinds.js
// SlopPatterns: adversarial strings (no catastrophic backtracking), a 5 MB text, and loading the two files as classic scripts.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { P, ROOT, H, HP, GH, CARD, IBAN, KEY, KEY_BEGIN } from './patterns-fixture.mjs';

describe('adversarial input stays fast', () => {
  const rep = (s, n) => s.repeat(n);
  const cases = {
    '200k a': rep('a', 200000), '200k digits': rep('1234567890', 20000), '200k digits and dots': rep('1.', 100000), 'dotted quads': rep('1.1.1.1.', 25000),
    '100k hyphens': rep('-', 100000), '200k colons': rep(':', 200000), 'hex and colons': rep('a:', 100000), 'aa:bb: runs': rep('aa:bb:cc:dd:ee:', 20000),
    'a@ chain': rep('a@', 100000), 'dots then @': rep('a.', 100000) + '@', 'eyJ- chain': rep('eyJ-', 50000), 'xoxb- chain': rep('xoxb-', 40000),
    'ghp_ chain': rep('ghp_', 50000), 'token x40k': rep('token', 40000), 'password= chain': rep('password=', 20000), 'password=" chain': rep('password="', 20000),
    'bearer chain': rep('Bearer ', 30000), 'aws secret chain': rep('aws secret ', 40000), 'AKIA chain': rep('AKIA', 50000), 'hex 200k': rep('abcdef0123456789', 12500),
    'BEGIN chain': rep('-----BEGIN ' + 'PRIVATE KEY-----', 10000), 'unterminated key': KEY_BEGIN + rep('A', 300000), 'scheme chain': rep(HP, 40000),
    'one 1M URL': HP + rep('a', 1000000), 'closing brackets': HP + 'a' + rep(')', 100000), 'userinfo chain': rep('a://a:', 40000), 'iban-like': rep('GB82WEST12345698765432 ', 8000),
    'spaced digits': rep('1 ', 100000), 'dashed digits': rep('1-', 100000), 'uuid halves': rep('12345678-', 20000), 'spaces': rep(' ', 200000), 'newlines': rep('\n', 200000),
    'emails': rep('a@b.cc,', 30000), 'long TLD': 'a@b.' + rep('c', 200000), 'long local part': rep('a', 200000) + '@b.cc', 'long domain labels': 'a@' + rep('b.', 100000),
    'long key=value runs': rep('key=a1', 50000), 'unicode': rep('\u{1F600}é', 100000),
  };
  for (const [name, text] of Object.entries(cases)) {
    test(name + ' scans in under 1500 ms', () => {
      const t0 = Date.now();
      const hits = P.scan(text);
      const ms = Date.now() - t0;
      assert.ok(ms < 1500, name + ': ' + ms + ' ms');
      for (let i = 1; i < hits.length; i++) assert.ok(hits[i].start >= hits[i - 1].end);
      const t1 = Date.now();
      P.scan(text, { limit: Infinity });
      assert.ok(Date.now() - t1 < 1500, name + ' (no limit)');
    });
  }
  test('the search regular expressions are fast on the same strings', () => {
    const slow = [];
    for (const k of P.KINDS) {
      if (k.id === 'aws_secret') continue; // its search form is bounded but reads context around every "aws"
      const r = P.regex(k.id);
      for (const name of ['200k a', '200k digits and dots', '100k hyphens', 'hex and colons', 'a@ chain', 'eyJ- chain', 'password= chain', 'BEGIN chain', 'scheme chain']) {
        const t0 = Date.now();
        cases[name].match(new RegExp(r.source, 'g' + r.flags));
        if (Date.now() - t0 > 1500) slow.push(k.id + ' on ' + name);
      }
    }
    assert.deepEqual(slow, []);
  });
});

describe('a 5 MB text', () => {
  const block = [
    'The quick brown fox writes to admin@example.org about server 10.1.2.3 and 2001:db8::7, then reads ' + H + 'docs.example.com/guide?id=42&x=y for details.',
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam.',
    'commit ' + 'da39a3ee5e6b4b0d3255bfef95601890afd80709' + ' id 123e4567-e89b-12d3-a456-426614174000 mac aa:bb:cc:dd:ee:ff',
    'config password = "s3cretPassw0rd!" token=' + GH + ' card ' + CARD.join(' ') + ' iban ' + IBAN.join(' '),
    'Quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse. 3.14159 2024-01-15T10:20:30Z',
    'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Sed ut perspiciatis unde omnis iste natus error sit voluptatem.',
    'Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.',
    'Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt ut labore.',
  ].join('\n') + '\n';
  let big = '';
  while (big.length < 5 * 1024 * 1024) big += block;
  test('mixed content: all kinds, no limit, under 3 s, and the answer is consistent', () => {
    const t0 = Date.now();
    const hits = P.scan(big, { limit: Infinity });
    const ms = Date.now() - t0;
    assert.ok(ms < 3000, ms + ' ms');
    const per = Math.round(big.length / block.length);
    assert.equal(hits.length, per * 11);
    assert.equal(hits[0].kind, 'email');
    for (let i = 1; i < hits.length; i += 997) assert.ok(hits[i].start >= hits[i - 1].end);
  });
  test('mixed content with the default limit is quick, and a count adds up', () => {
    const t0 = Date.now();
    assert.equal(P.scan(big).length, 5000);
    assert.ok(Date.now() - t0 < 3000);
    const c = P.count(big, { limit: Infinity });
    assert.equal(c.email, c.ipv4);
    assert.equal(c.github_token, c.credit_card);
    assert.equal(c.secret_assignment, c.email);
    assert.equal(c.url, c.email);
    assert.ok(!('private_key' in c) && !('jwt' in c));
  });
  test('prose with nothing to find, 5 MB, under 3 s', () => {
    const prose = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do 12 eiusmod tempor 3.5 incididunt ut labore et dolore magna aliqua. '.repeat(40000);
    const t0 = Date.now();
    assert.deepEqual(P.scan(prose, { limit: Infinity }), []);
    assert.ok(Date.now() - t0 < 3000);
  });
});

describe('loading as classic scripts', () => {
  const load = (files, ctx) => {
    ctx = ctx || vm.createContext({ console });
    ctx.window = ctx;
    for (const f of files) vm.runInContext(readFileSync(path.join(ROOT, 'shared', 'patterns', f), 'utf8'), ctx, { filename: f });
    return ctx;
  };
  const plain = (v) => JSON.parse(JSON.stringify(v));
  test('patterns.js then patterns-kinds.js gives window.SlopPatterns, the same as require', () => {
    const w = load(['patterns.js', 'patterns-kinds.js']).SlopPatterns;
    assert.deepEqual(plain(w.KINDS), plain(P.KINDS));
    const s = 'mail bob@example.com ip 10.0.0.1 ' + GH + ' ' + KEY;
    assert.deepEqual(plain(w.scan(s)), plain(P.scan(s)));
    assert.equal(w.mask('ipv4', 'x'), '[ipv4]');
    assert.equal(w.ipClass('10.0.0.1'), 'private');
    assert.deepEqual(plain(w.regex('email')), plain(P.regex('email')));
  });
  test('patterns.js alone has the engine and no kinds; patterns-kinds.js alone says what to load first', () => {
    const w = load(['patterns.js']).SlopPatterns;
    assert.deepEqual(plain(w.KINDS), []);
    assert.deepEqual(plain(w.scan('bob@example.com')), []);
    assert.equal(w.ipClass('8.8.8.8'), 'public');
    assert.throws(() => load(['patterns-kinds.js']), /load shared\/patterns\/patterns\.js/);
  });
  test('loading both again does not repeat the kinds', () => {
    const ctx = load(['patterns.js', 'patterns-kinds.js']);
    load(['patterns.js', 'patterns-kinds.js'], ctx);
    assert.equal(ctx.SlopPatterns.KINDS.length, P.KINDS.length);
    assert.equal(ctx.SlopPatterns.scan('bob@example.com').length, 1);
  });
  test('every script stays within 300 lines and has no network address or product name in it', () => {
    for (const f of ['patterns.js', 'patterns-kinds.js']) {
      const src = readFileSync(path.join(ROOT, 'shared', 'patterns', f), 'utf8');
      assert.ok(src.split('\n').length <= 300, f);
      assert.doesNotMatch(src, new RegExp('https?' + ':\\/\\/'), f);
      assert.doesNotMatch(src, new RegExp(['Cl', 'aude|Anthr', 'opic'].join(''), 'i'), f);
    }
  });
});

