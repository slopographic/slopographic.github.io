// Covers: shared/patterns/patterns.js
// Covers: shared/patterns/patterns-kinds.js
// SlopPatterns: overlap priority, the options (kinds, limit, validate), count, masks, regex(kind) against scan(), ipClass.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { P, H, HP, texts, kindsOf, POS, GH, AWS, AWS_SECRET, GOOGLE, JWT, KEY, KEY_BEGIN, KEY_END, CARD, IBAN } from './patterns-fixture.mjs';

describe('overlaps: the more specific kind wins, never two hits over the same text', () => {
  test('a key inside a URL beats the URL', () => {
    const t = 'call ' + H + 'api.example.com/v1?key=' + GOOGLE + '&q=1 now';
    assert.deepEqual(P.scan(t).map((h) => [h.kind, h.text]), [['google_api_key', GOOGLE]]);
    const t2 = H + 'x.io/' + GH + '/info';
    assert.deepEqual(P.scan(t2).map((h) => h.kind), ['github_token']);
  });
  test('a URL beats an email, an IP, a UUID and a hash inside it', () => {
    const u1 = H + 'x.org/?to=bob@example.com';
    assert.deepEqual(P.scan(u1).map((h) => [h.kind, h.text]), [['url', u1]]);
    const u2 = HP + '10.1.2.3:8080/a/123e4567-e89b-12d3-a456-426614174000/' + 'ab12'.repeat(8);
    assert.deepEqual(P.scan(u2).map((h) => h.kind), ['url']);
  });
  test('an email beats an IP; an IPv6 with an IPv4 tail is one hit; a MAC is not an IPv6', () => {
    assert.deepEqual(P.scan('a@1.2.3.4.org').map((h) => h.kind), ['email']);
    assert.deepEqual(P.scan('::ffff:1.2.3.4').map((h) => [h.kind, h.text]), [['ipv6', '::ffff:1.2.3.4']]);
    assert.deepEqual(P.scan('aa:bb:cc:dd:ee:ff').map((h) => h.kind), ['mac']);
  });
  test('the same span: the specific key kind wins (jwt over bearer and assignment, github over assignment, aws_secret over hash)', () => {
    assert.deepEqual(P.scan('Authorization: Bearer ' + JWT).map((h) => h.kind), ['jwt']);
    assert.deepEqual(P.scan('token = "' + GH + '"').map((h) => [h.kind, h.text]), [['github_token', GH]]);
    const hex = 'ab12'.repeat(10);
    assert.deepEqual(P.scan('aws secret ' + hex).map((h) => h.kind), ['aws_secret']);
    assert.deepEqual(P.scan('sha1 ' + hex).map((h) => h.kind), ['hash']);
  });
  test('a secret assignment inside a URL query beats the URL; a card number beats a URL holding it', () => {
    assert.deepEqual(P.scan(H + 'x.io/cb?token=abc123def456&next=/home').map((h) => [h.kind, h.text]), [['secret_assignment', 'abc123def456']]);
    assert.deepEqual(P.scan(H + 'shop.io/pay/' + CARD.join('')).map((h) => h.kind), ['credit_card']);
  });
  test('a private key swallows what is inside it', () => {
    const body = KEY_BEGIN + '\nAKIA' + 'ABCDEFGHIJKLMNOP' + ' bob@example.com 10.0.0.1\n' + KEY_END;
    assert.deepEqual(P.scan(body).map((h) => h.kind), ['private_key']);
  });
  test('credentials in a URL: the password wins over the URL and the email-looking host part', () => {
    assert.deepEqual(P.scan(H + 'bob:Sup3rS3cret@mail.example.com/x').map((h) => [h.kind, h.text]), [['basic_auth_url', 'bob:Sup3rS3cret']]);
  });
  test('results are sorted, never overlap, and match the text', () => {
    const src = ['mail bob@example.com or call ' + H + 'a.io/x?k=' + GOOGLE, 'host 10.0.0.1 and ::1 mac aa:bb:cc:dd:ee:ff', 'password = "hunter2hunter2"; ' + GH,
      CARD.join(' ') + ' ' + IBAN.join(' ') + ' ' + JWT, KEY, 'uuid 123e4567-e89b-12d3-a456-426614174000 ' + 'ab12'.repeat(10)].join('\n');
    const hits = P.scan(src);
    assert.ok(hits.length >= 10);
    for (let i = 0; i < hits.length; i++) {
      assert.equal(src.slice(hits[i].start, hits[i].end), hits[i].text);
      assert.ok(hits[i].end > hits[i].start);
      if (i) assert.ok(hits[i].start >= hits[i - 1].end, 'overlap at ' + i);
    }
    assert.deepEqual(Object.keys(hits[0]).sort(), ['end', 'kind', 'start', 'text']);
  });
});

describe('options: kinds, limit, count, odd input', () => {
  const ips = Array.from({ length: 50 }, (_, i) => '10.0.0.' + i).join(' ');
  test('limit stops collecting', () => {
    assert.equal(P.scan(ips).length, 50);
    const three = P.scan(ips, { limit: 3 });
    assert.deepEqual(three.map((h) => h.text), ['10.0.0.0', '10.0.0.1', '10.0.0.2']);
    assert.deepEqual(P.scan(ips, { limit: 0 }), []);
    assert.equal(P.scan(ips, { limit: Infinity }).length, 50);
    assert.equal(P.DEFAULT_LIMIT, 5000);
    assert.equal(P.scan('1.2.3.4 '.repeat(6000)).length, 5000);
    assert.equal(P.scan('1.2.3.4 '.repeat(6000), { limit: 6000 }).length, 6000);
    assert.equal(P.scan('1.2.3.4 '.repeat(6000), { limit: -1 }).length, 5000);
  });
  test('limit counts hits after overlaps are settled', () => {
    const t = (H + 'x.io/?to=a@b.cc ').repeat(10);
    assert.deepEqual(P.scan(t, { limit: 4 }).map((h) => h.kind), ['url', 'url', 'url', 'url']);
  });
  test('kinds selects, ignores unknown ids, and an empty list finds nothing', () => {
    const t = 'bob@example.com 10.0.0.1 ' + H + 'a.io';
    assert.deepEqual(kindsOf(t, { kinds: ['ipv4'] }), ['ipv4']);
    assert.deepEqual(kindsOf(t, { kinds: ['ipv4', 'email', 'nope'] }), ['email', 'ipv4']);
    assert.deepEqual(P.scan(t, { kinds: [] }), []);
    assert.deepEqual(kindsOf(t), ['email', 'ipv4', 'url']);
    assert.deepEqual(P.scan(t, { kinds: ['url'] }).map((h) => h.text), [H + 'a.io']);
  });
  test('a kind left out does not hide its neighbours (the URL is gone, so the email shows)', () => {
    const t = H + 'x.org/?to=bob@example.com';
    assert.deepEqual(kindsOf(t, { kinds: ['email'] }), ['email']);
  });
  test('count', () => {
    const t = 'a@b.cc c@d.ee 1.2.3.4 ' + GH;
    assert.deepEqual(P.count(t), { email: 2, ipv4: 1, github_token: 1 });
    assert.deepEqual(P.count(t, { kinds: ['email'] }), { email: 2 });
    assert.deepEqual(P.count('nothing here'), {});
    assert.deepEqual(P.count(ips, { limit: 5 }), { ipv4: 5 });
  });
  test('odd input never throws', () => {
    for (const v of [null, undefined, '', 0, 123, {}, [], true]) assert.doesNotThrow(() => P.scan(v));
    assert.deepEqual(P.scan(null), []);
    assert.deepEqual(P.scan(''), []);
    assert.deepEqual(P.scan('ip 1.2.3.4', null), P.scan('ip 1.2.3.4'));
    assert.deepEqual(P.scan(12345, { kinds: ['ipv4'] }), []);
    assert.deepEqual(P.count(undefined), {});
  });
  test('scanning twice gives the same answer (no state left in the regular expressions)', () => {
    const t = 'bob@example.com ' + GH + ' 1.2.3.4';
    assert.deepEqual(P.scan(t), P.scan(t));
  });
  test('line breaks, tabs and unicode around the matches', () => {
    assert.deepEqual(texts('\r\nbob@example.com\r\n\t1.2.3.4\u00a0é', 'email'), ['bob@example.com']);
    assert.deepEqual(texts('\u00e9 1.2.3.4\u2028x', 'ipv4'), ['1.2.3.4']);
    assert.deepEqual(texts('\u{1F600}bob@example.com\u{1F600}', 'email'), ['bob@example.com']);
  });
});

describe('mask', () => {
  test('secrets keep the first 4 and last 2 characters', () => {
    assert.equal(P.mask('github_token', GH), GH.slice(0, 4) + '…' + GH.slice(-2));
    assert.equal(P.mask('aws_access_key', AWS), 'AKIA…OP');
    assert.equal(P.mask('credit_card', CARD.join(' ')), '4111…11');
    assert.equal(P.mask('secret_assignment', 'hunter2hunter2'), 'hunt…r2');
    assert.equal(P.mask('private_key', KEY), '----…--');
  });
  test('a short secret becomes an ellipsis', () => {
    assert.equal(P.mask('secret_assignment', 'abcd1234'), '…');
    assert.equal(P.mask('bearer', ''), '…');
    assert.equal(P.mask('bearer', 'x'.repeat(11)), '…');
    assert.equal(P.mask('bearer', 'x'.repeat(12)), 'xxxx…xx');
  });
  test('every other kind becomes [id]', () => {
    for (const k of P.KINDS.filter((x) => !x.secret)) assert.equal(P.mask(k.id, 'whatever'), '[' + k.id + ']');
    assert.equal(P.mask('ipv4', '10.0.0.1'), '[ipv4]');
    assert.equal(P.mask('email', 'bob@example.com'), '[email]');
    assert.equal(P.mask('no_such', 'x'), '[no_such]');
  });
  test('masking keeps surrogate pairs whole', () => {
    assert.equal(P.mask('secret_assignment', '\u{1F600}abc' + 'defghij' + 'kl'), '\u{1F600}abc…kl');
  });
  test('a mask never leaks the middle of a secret', () => {
    for (const [kind, rows] of Object.entries(POS)) {
      if (!P.byId(kind).secret) continue;
      for (const [, want] of rows) for (const w of want) {
        const m = P.mask(kind, w);
        if (w.length > 20) assert.ok(m.length <= 7, kind);
      }
    }
  });
});

describe('regex(kind): a search-box regular expression per kind', () => {
  test('every kind has one, it compiles, and carries no g or d flag', () => {
    for (const k of P.KINDS) {
      const r = P.regex(k.id);
      assert.equal(typeof r.source, 'string');
      assert.equal(typeof r.flags, 'string');
      assert.doesNotMatch(r.flags, /[gdy]/);
      assert.doesNotThrow(() => new RegExp(r.source, 'g' + r.flags), k.id);
    }
    assert.equal(P.regex('nope'), null);
    assert.equal(P.regex(undefined), null);
  });
  test('finds at least every match scan() finds (as a match that covers it)', () => {
    for (const kind of Object.keys(POS)) {
      const r = P.regex(kind);
      for (const [input] of POS[kind]) {
        const spans = [...input.matchAll(new RegExp(r.source, 'g' + r.flags))].map((m) => [m.index, m.index + m[0].length]);
        for (const h of P.scan(input, { kinds: [kind] })) {
          assert.ok(spans.some(([a, b]) => a <= h.start && b >= h.end), kind + ': ' + JSON.stringify(input) + ' misses ' + JSON.stringify(h.text));
        }
      }
    }
  });
  test('and is no looser than the scan on plain prose', () => {
    const prose = 'Hello there, this is a plain sentence about the weather. It is 12:30 and 3.5 degrees. Nothing sensitive in it at all.';
    for (const k of P.KINDS) {
      const r = P.regex(k.id);
      if (k.id === 'ipv6') continue; // a loose run of hex digits and colons; scan() validates it
      assert.equal([...prose.matchAll(new RegExp(r.source, 'g' + r.flags))].length, 0, k.id);
    }
  });
  test('the AWS secret search needs the aws and secret words; the scan checks the same', () => {
    const r = P.regex('aws_secret');
    const re = new RegExp(r.source, 'g' + r.flags);
    assert.equal(AWS_SECRET.match(re), null);
    assert.equal(('AWS_SECRET_KEY=' + AWS_SECRET).match(re).length, 1);
  });
});

describe('ipClass', () => {
  const table = [
    ['10.1.2.3', 'private'], ['172.16.0.1', 'private'], ['172.31.255.255', 'private'], ['192.168.0.1', 'private'], ['100.64.0.1', 'private'],
    ['127.0.0.1', 'loopback'], ['127.255.255.254', 'loopback'], ['169.254.1.1', 'link-local'], ['224.0.0.1', 'multicast'], ['239.255.255.250', 'multicast'],
    ['0.0.0.0', 'reserved'], ['255.255.255.255', 'reserved'], ['240.0.0.1', 'reserved'], ['192.0.2.1', 'reserved'], ['198.51.100.7', 'reserved'], ['203.0.113.9', 'reserved'], ['198.18.0.1', 'reserved'],
    ['8.8.8.8', 'public'], ['172.15.0.1', 'public'], ['172.32.0.1', 'public'], ['1.1.1.1', 'public'], ['100.63.0.1', 'public'], ['192.169.0.1', 'public'], ['223.255.255.255', 'public'],
    ['::1', 'loopback'], ['::', 'reserved'], ['fe80::1', 'link-local'], ['febf::1', 'link-local'], ['fec0::1', 'private'], ['fc00::1', 'private'], ['fd12:3456::1', 'private'], ['ff02::1', 'multicast'],
    ['2001:db8::1', 'reserved'], ['2606:4700:4700::1111', 'public'], ['2001:4860:4860::8888', 'public'], ['100::1', 'reserved'],
    ['::ffff:10.0.0.1', 'private'], ['::ffff:8.8.8.8', 'public'], ['::ffff:127.0.0.1', 'loopback'], ['[::1]', 'loopback'], ['fe80::1%eth0', 'link-local'], [' 10.0.0.1 ', 'private'],
  ];
  for (const [ip, want] of table) test(ip + ' is ' + want, () => assert.equal(P.ipClass(ip), want));
  test('not an IP address: null', () => {
    for (const v of ['', 'abc', '1.2.3', '256.0.0.1', '01.2.3.4', '1:2:3', null, undefined, 42, '1.2.3.4.5']) assert.equal(P.ipClass(v), null, String(v));
  });
  test('works on what scan() found', () => {
    const hits = P.scan('lan 192.168.1.20 dns 8.8.8.8 lo ::1', { kinds: ['ipv4', 'ipv6'] });
    assert.deepEqual(hits.map((h) => P.ipClass(h.text)), ['private', 'public', 'loopback']);
  });
});

