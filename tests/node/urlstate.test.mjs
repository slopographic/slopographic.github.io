// SlopUrlState (shared/urlstate/urlstate.js) in a vm context with a fake window, location and history.
// The browser page tests/urlstate/urlstate.test.html covers the real history API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'shared', 'urlstate', 'urlstate.js'), 'utf8');

/** A fake window: a mutable URL, a history that records pushes, and a popstate that tests can fire. */
function env(url = 'https://example.test/drive/?keep=1#top') {
  const loc = new URL(url);
  const location = { get href() { return loc.href; }, get pathname() { return loc.pathname; }, get search() { return loc.search; }, get hash() { return loc.hash; } };
  const win = { location, listeners: {}, pushes: 0, replaces: 0, console };
  win.history = {
    state: null,
    replaceState(s, _t, u) { this.state = s; win.replaces++; loc.href = new URL(u, loc.href).href; },
    pushState(s, _t, u) { this.state = s; win.pushes++; loc.href = new URL(u, loc.href).href; },
  };
  win.addEventListener = (type, fn) => { (win.listeners[type] ||= []).push(fn); };
  win.pop = (href, state = null) => { loc.href = href; win.history.state = state; for (const f of win.listeners.popstate || []) f({ state }); };
  vm.runInContext(SRC, vm.createContext({ window: win, URL, URLSearchParams }));
  return win;
}

test('get and set keep plain values and use the default when a key is missing', () => {
  const w = env();
  const U = w.SlopUrlState;
  assert.equal(U.set({ a: 'x', n: 3, ok: true }), true);
  assert.equal(U.get('a', ''), 'x');
  assert.equal(U.get('n', 0), 3);
  assert.equal(U.get('ok', false), true);
  assert.equal(U.get('missing', 'dflt'), 'dflt');
  assert.equal(U.get('missing', null), null);
});

test('set replaces by default and pushes only when replace is false', () => {
  const w = env();
  w.SlopUrlState.set({ p: '1' });
  assert.equal(w.replaces, 1);
  assert.equal(w.pushes, 0);
  w.SlopUrlState.set({ p: '2' }, { replace: false });
  assert.equal(w.pushes, 1);
  assert.equal(w.location.search, '?keep=1&p=2');
});

test('a patch merges, null and undefined remove keys, and an unchanged patch does nothing', () => {
  const w = env();
  const U = w.SlopUrlState;
  U.set({ a: '1', b: '2' });
  U.set({ b: null, c: '3' });
  assert.equal(U.get('a', ''), '1');
  assert.equal(U.get('b', 'gone'), 'gone');
  assert.equal(U.get('c', ''), '3');
  U.set({ a: undefined });
  assert.equal(U.get('a', 'gone'), 'gone');
  const before = w.replaces;
  assert.equal(U.set({ c: '3' }), false);
  assert.equal(w.replaces, before);
});

test('unknown parameters and the hash are kept as written', () => {
  const w = env('https://example.test/drive/?other=1&weird=%20x+y&a=old&a=dup#frag');
  w.SlopUrlState.set({ a: 'new' });
  assert.equal(w.location.search, '?other=1&weird=%20x+y&a=new');
  assert.equal(w.location.hash, '#frag');
});

test('scopes keep two apps apart and prefix every key', () => {
  const w = env('https://example.test/drive/');
  const A = w.SlopUrlState.scope('aaa'), B = w.SlopUrlState.scope('bbb');
  A.set({ cwd: 'f1' });
  B.set({ cwd: 'g2' });
  assert.equal(A.get('cwd', null), 'f1');
  assert.equal(B.get('cwd', null), 'g2');
  assert.equal(w.location.search, '?aaa.cwd=f1&bbb.cwd=g2');
  assert.equal(w.SlopUrlState.get('cwd', null), null);
});

test('objects, arrays, numbers and awkward text round-trip', () => {
  const w = env('https://example.test/drive/');
  const U = w.SlopUrlState;
  const obj = { key: 'size', dir: -1, nested: [1, 'a&b=c', 'é ✓'] };
  U.set({ sort: obj, text: 'a b&c=d?e#f%g', id: 'k9Zz-_.', num: 2.5, neg: -4, flag: false });
  assert.equal(JSON.stringify(U.get("sort", {})), JSON.stringify(obj));
  assert.equal(JSON.stringify(U.get("sort", null)), JSON.stringify(obj));
  assert.equal(U.get('text', ''), 'a b&c=d?e#f%g');
  assert.equal(U.get('text', null), 'a b&c=d?e#f%g');
  assert.equal(U.get('id', ''), 'k9Zz-_.');
  assert.equal(U.get('num', 0), 2.5);
  assert.equal(U.get('neg', 0), -4);
  assert.equal(U.get('flag', true), false);
});

test('a number default ignores text that is not a number, and an object default ignores text that is not JSON', () => {
  const w = env('https://example.test/drive/?drv.n=abc&drv.o=notjson');
  const S = w.SlopUrlState.scope('drv');
  assert.equal(S.get('n', 7), 7);
  assert.equal(JSON.stringify(S.get("o", { d: 1 })), "{\"d\":1}");
});

test('onChange runs on popstate with the restored URL, and stops when told', () => {
  const w = env('https://example.test/drive/?drv.cwd=a');
  const seen = [];
  const off = w.SlopUrlState.scope('drv').onChange(() => seen.push(w.SlopUrlState.scope('drv').get('cwd', null)));
  w.pop('https://example.test/drive/?drv.cwd=b');
  w.pop('https://example.test/drive/');
  assert.equal(JSON.stringify(seen), "[\"b\",null]");
  off();
  w.pop('https://example.test/drive/?drv.cwd=c');
  assert.equal(JSON.stringify(seen), "[\"b\",null]");
});

test('link returns the full URL with the current state', () => {
  const w = env('https://example.test/drive/?keep=1');
  w.SlopUrlState.set({ view: 'list' });
  assert.equal(w.SlopUrlState.link(), 'https://example.test/drive/?keep=1&view=list');
});

test('a blocked history API never throws', () => {
  const w = env();
  w.history.replaceState = () => { throw new Error('blocked'); };
  w.history.pushState = () => { throw new Error('blocked'); };
  const U = w.SlopUrlState;
  assert.equal(U.set({ x: '1' }), false);
  assert.equal(U.set({ y: '2' }, { replace: false }), false);
  assert.equal(U.get('x', 'none'), 'none');
  assert.equal(typeof U.link(), 'string');
});

test('codec: encode and decode are the inverse for the supported types', () => {
  const { encode, decode } = env().SlopUrlState._codec;
  assert.equal(encode(null), null);
  assert.equal(encode(undefined), null);
  assert.equal(encode(Number.NaN), null);
  assert.equal(encode({ a: [1] }), '{"a":[1]}');
  assert.equal(decode("[1,2]", null).length, 2);
  assert.equal(decode('plain', null), 'plain');
});
