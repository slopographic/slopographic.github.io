// shared/compat/stream.js: reading a ReadableStream where the browser cannot for-await over one (Safari, iOS included:
// pdf.js 5's getTextContent threw "undefined is not a function (near '...t of e...')" on an iPhone). The browser side, with
// pdf.js itself, is tests/pdf/ios-compat.test.html.
// Covers: shared/compat/stream.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync(new URL('../../shared/compat/stream.js', import.meta.url), 'utf8');
/** A ReadableStream look-alike without an async iterator, as Safari has it: only getReader(). */
function safariStream(chunks, log = []) {
  const real = new ReadableStream({ pull(c) { if (chunks.length) c.enqueue(chunks.shift()); else c.close(); }, cancel(r) { log.push('cancel:' + r); } });
  function RS() {}
  RS.prototype.getReader = function () { return real.getReader(); };
  return { RS, make: () => Object.setPrototypeOf({}, RS.prototype), real, log };
}
/** Runs the file in a fresh global whose ReadableStream is the look-alike. */
function load(RS) {
  const ctx = vm.createContext({ ReadableStream: RS, Symbol, Promise, Object });
  vm.runInContext(SRC, ctx);
  return ctx;
}

test('without the fill, for await over a Safari-like stream throws (the bug)', async () => {
  const { make } = safariStream(['a']);
  await assert.rejects(async () => { for await (const x of make()) void x; }, TypeError);
});

test('the fill makes for await work: every chunk in order, then done', async () => {
  const s = safariStream(['a', 'b', 'c']);
  const ctx = load(s.RS);
  assert.equal(typeof s.RS.prototype[Symbol.asyncIterator], 'function');
  assert.equal(typeof s.RS.prototype.values, 'function');
  const got = [];
  for await (const x of s.make()) got.push(x);
  assert.deepEqual(got, ['a', 'b', 'c']);
  assert.equal(typeof ctx.SlopCompat.readStream, 'function');
});

test('leaving the loop early cancels the stream; preventCancel keeps it open', async () => {
  const s = safariStream(['a', 'b', 'c']);
  load(s.RS);
  for await (const x of s.make()) { assert.equal(x, 'a'); break; }
  assert.deepEqual(s.log, ['cancel:undefined']);
  const t = safariStream(['a', 'b']);
  load(t.RS);
  for await (const x of t.make().values({ preventCancel: true })) { void x; break; }
  assert.deepEqual(t.log, []);
  assert.equal(t.real.locked, false);   // the reader was released, so it can be read again
});

test('readStream reads every chunk with the reader, awaiting each callback, and releases the lock', async () => {
  const s = safariStream([1, 2, 3]);
  const ctx = load(s.RS);
  const got = [];
  await ctx.SlopCompat.readStream(s.real, async (c) => { await new Promise((r) => setTimeout(r, 1)); got.push(c); });
  assert.deepEqual(got, [1, 2, 3]);
  assert.equal(s.real.locked, false);
});

test('a browser that has stream iteration keeps its own (the fill does nothing)', () => {
  const own = ReadableStream.prototype[Symbol.asyncIterator];
  const ctx = load(ReadableStream);
  assert.equal(ReadableStream.prototype[Symbol.asyncIterator], own);
  assert.equal(ctx.SlopCompat.installStreamIteration(ReadableStream), false);
});
