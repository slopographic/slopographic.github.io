// Covers: code/js/findall.js
// The engine of Search in files: the expression from the box and its switches, matches with their line, replacements as changes, and
// the file-name filter. Run with: node --test tests/node/code-findall.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRegex, findIn, countIn, replaceIn, nameFilter } from '../../code/js/findall.js';

const re = (q) => { const r = buildRegex(q); assert.ok(r.re, JSON.stringify(r)); return r.re; };

test('an empty box and a broken expression are errors, not exceptions', () => {
  assert.equal(buildRegex({ find: '' }).error, 'empty');
  assert.equal(buildRegex({}).error, 'empty');
  const bad = buildRegex({ find: '(', regexp: true });
  assert.equal(bad.error, 'regex');
  assert.ok(bad.message.length > 0);
});

test('text is searched literally unless the regular expression switch is on', () => {
  assert.equal(countIn('a.b a+b aXb', re({ find: 'a.b' })), 1);
  assert.equal(countIn('a.b a+b aXb', re({ find: 'a.b', regexp: true })), 3);
  assert.equal(countIn('f(x) f(y)', re({ find: 'f(x)' })), 1);
});

test('match case and whole word', () => {
  assert.equal(countIn('Cat cat CAT', re({ find: 'cat' })), 3);
  assert.equal(countIn('Cat cat CAT', re({ find: 'cat', caseSensitive: true })), 1);
  assert.equal(countIn('cat concat cats cat_x cat', re({ find: 'cat', wholeWord: true })), 2);
  assert.equal(countIn('naïve nav', re({ find: 'na', wholeWord: true })), 0);   // a letter with a mark is still a letter
  assert.equal(countIn('ärt är', re({ find: 'är', wholeWord: true })), 1);
});

test('a pattern that is only valid without the u flag still works', () => {
  assert.equal(countIn('a_b', re({ find: 'a\\_b', regexp: true })), 1);
});

test('matches know their line and column, and show the line around them', () => {
  const text = 'one\ntwo needle three\n\nfour';
  const { matches } = findIn(text, re({ find: 'needle' }));
  assert.equal(matches.length, 1);
  assert.deepEqual([matches[0].line, matches[0].col, matches[0].from, matches[0].to], [2, 5, 8, 14]);
  assert.equal(matches[0].before, 'two ');
  assert.equal(matches[0].hit, 'needle');
  assert.equal(matches[0].after, ' three');
});

test('a long line is cut around the match, and the cut is marked', () => {
  const text = 'x'.repeat(200) + 'needle' + 'y'.repeat(200);
  const m = findIn(text, re({ find: 'needle' }), { context: 10 }).matches[0];
  assert.equal(m.before, '…' + 'x'.repeat(10));
  assert.equal(m.after, 'y'.repeat(10) + '…');
});

test('the limit caps the list but not the count', () => {
  const text = 'a '.repeat(1000);
  const r = findIn(text, re({ find: 'a' }), { limit: 50 });
  assert.equal(r.matches.length, 50);
  assert.equal(r.more, 950);
  assert.equal(countIn(text, re({ find: 'a' })), 1000);
});

test('an expression that can match nothing does not loop, and empty matches are not matches', () => {
  assert.equal(countIn('abc', re({ find: 'x*', regexp: true })), 0);
  assert.equal(countIn('abc xx', re({ find: 'x*', regexp: true })), 1);
  assert.equal(replaceIn('abc', re({ find: 'x*', regexp: true }), '-', true).text, 'abc');
});

test('lines are \\n: ^ and $ match at each line, and a pattern can span a line break', () => {
  assert.equal(countIn('a\nb\na', re({ find: '^a$', regexp: true })), 2);
  assert.equal(countIn('foo\nbar', re({ find: 'foo\\nbar', regexp: true })), 1);
});

test('replace: the changes are against the original text and give the new text', () => {
  const text = 'foo bar foo';
  const r = replaceIn(text, re({ find: 'foo' }), 'quux');
  assert.equal(r.text, 'quux bar quux');
  assert.equal(r.count, 2);
  assert.deepEqual(r.changes, [{ from: 0, to: 3, insert: 'quux' }, { from: 8, to: 11, insert: 'quux' }]);
});

test('replace: a literal search takes the replacement literally ($1 stays $1); a regular expression reads $1, $& and $$', () => {
  assert.equal(replaceIn('ab', re({ find: 'a' }), '$1$&').text, '$1$&b');
  assert.equal(replaceIn('2024-05-06', re({ find: '(\\d+)-(\\d+)-(\\d+)', regexp: true }), '$3.$2.$1', true).text, '06.05.2024');
  assert.equal(replaceIn('cost 5', re({ find: '\\d', regexp: true }), '$$$&', true).text, 'cost $5');
  assert.equal(replaceIn('x', re({ find: '(x)', regexp: true }), '[$2]', true).text, '[$2]');   // no such group: left as written
  assert.equal(replaceIn('john smith', re({ find: '(?<f>\\w+) (?<l>\\w+)', regexp: true }), '$<l>, $<f>', true).text, 'smith, john');
});

test('replacing with nothing deletes the matches', () => {
  assert.equal(replaceIn('a1b22c', re({ find: '\\d+', regexp: true }), '', true).text, 'abc');
});

test('replace works the same on text with non-Latin letters and astral characters', () => {
  assert.equal(replaceIn('日本語 テキスト 😀 日本語', re({ find: '日本語' }), 'JP').text, 'JP テキスト 😀 JP');
  assert.equal(replaceIn('a😀b😀', re({ find: '😀' }), ':)').text, 'a:)b:)');
});

test('the name filter takes names and paths, with * as a wildcard, and lets everything through when empty', () => {
  const all = nameFilter('');
  assert.ok(all('anything/at.all'));
  const f = nameFilter('*.js, src/*.css');
  assert.ok(f('app.js'));
  assert.ok(f('lib/deep/app.JS'));
  assert.ok(f('src/site.css'));
  assert.ok(!f('other/site.css'));
  assert.ok(!f('app.json'));
  assert.ok(nameFilter('Makefile')('build/Makefile'));
});

test('a search and a replace over a 6 MB text are quick, with the list capped', () => {
  const text = 'line of text with a needle in it\n'.repeat(180000);
  const t0 = Date.now();
  const r = findIn(text, re({ find: 'needle' }), { limit: 200 });
  assert.equal(r.matches.length, 200);
  assert.equal(r.more, 179800);
  assert.equal(r.matches[199].line, 200);
  assert.equal(replaceIn(text, re({ find: 'needle' }), 'pin').count, 180000);
  assert.ok(Date.now() - t0 < 4000);
});
