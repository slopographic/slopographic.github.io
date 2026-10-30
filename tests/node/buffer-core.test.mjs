// Unit tests for shared/buffer: the record shape, the format choice, CSV helpers, storing and reading back (a fake
// IndexedDB), other tabs (a fake BroadcastChannel bus), the system clipboard write and drop binding.
// Run: node tests/run.mjs buffer
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadInto, plain } from './fx-env.mjs';

const FILES = ['buffer/formats.js', 'buffer/store.js', 'buffer/clipboard.js', 'buffer/buffer.js'];

/** A fake IndexedDB: databases hold stores, stores hold keyed values. Requests and transactions finish on a later tick. */
function fakeIDB() {
  const dbs = new Map();
  const later = (fn) => setTimeout(fn, 0);
  return {
    open(name) {
      const req = { result: null, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null };
      later(() => {
        const fresh = !dbs.has(name);
        if (fresh) dbs.set(name, new Map());
        const stores = dbs.get(name);
        req.result = {
          objectStoreNames: { contains: (n) => stores.has(n) },
          createObjectStore: (n) => { stores.set(n, new Map()); },
          close() {},
          transaction(store) {
            const map = stores.get(store);
            const t = { oncomplete: null, onerror: null, onabort: null, error: null };
            const reqOf = (fn) => {
              const r = { result: undefined, onsuccess: null, onerror: null };
              later(() => { r.result = fn(); if (r.onsuccess) r.onsuccess(); later(() => { if (t.oncomplete) t.oncomplete(); }); });
              return r;
            };
            t.objectStore = () => ({
              get: (k) => reqOf(() => map.get(k)),
              put: (v, k) => reqOf(() => { map.set(k, v); return k; }),
              delete: (k) => reqOf(() => { map.delete(k); }),
            });
            return t;
          },
        };
        if (fresh && req.onupgradeneeded) req.onupgradeneeded();
        if (req.onsuccess) req.onsuccess();
      });
      return req;
    },
    dbs,
  };
}

/** A BroadcastChannel stand-in: every instance with the same name hears the others' posts (not its own), on a later tick. */
const bus = new Map();
class FakeChannel {
  constructor(name) { this.name = name; this.onmessage = null; if (!bus.has(name)) bus.set(name, new Set()); bus.get(name).add(this); }
  postMessage(data) { for (const other of bus.get(this.name)) if (other !== this) setTimeout(() => other.onmessage && other.onmessage({ data }), 0); }
  close() { bus.get(this.name).delete(this); }
}

/** A clipboard that behaves like the browser: write() waits for every value and rejects if one rejects. */
function fakeClipboard({ refuse = false } = {}) {
  const writes = [];
  class FakeItem { constructor(items) { this.items = items; this.types = Object.keys(items); } }
  return {
    writes,
    ClipboardItem: FakeItem,
    navigator: {
      clipboard: {
        async write(list) {
          if (refuse) throw new Error('NotAllowed');
          const out = {};
          for (const item of list) for (const [type, v] of Object.entries(item.items)) { const b = await v; out[type] = type === 'image/png' ? b : await b.text(); }
          writes.push(out);
        },
      },
    },
  };
}

/** One buffer instance: its own window (globals) sharing the given database and channel bus. */
async function instance({ idb, clip = fakeClipboard(), withClipboard = true } = {}) {
  const extra = {
    Blob, setTimeout, clearTimeout, Promise, Date, Error, Map, Set,
    indexedDB: idb,
    BroadcastChannel: FakeChannel,
    ...(withClipboard ? { navigator: clip.navigator, ClipboardItem: clip.ClipboardItem } : { navigator: {} }),
  };
  const ctx = await loadInto(FILES, extra);
  await ctx.SlopBuffer.ready;
  return { B: ctx.SlopBuffer, ctx, clip };
}

const png = () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>';

test('record: infers the kind, keeps the formats, fills source and t, and rejects bad input', async () => {
  const { B } = await instance({ idb: fakeIDB(), withClipboard: false });
  const v = B.record({ formats: { 'image/svg+xml': SVG }, source: 'vector', t: 5 });
  assert.deepEqual(plain(v), { kind: 'vector', formats: { 'image/svg+xml': SVG }, source: 'vector', t: 5 });
  assert.equal(B.record({ formats: { 'image/png': png() } }).kind, 'image');
  assert.equal(B.record({ formats: { 'text/csv': 'a,b' } }).kind, 'table');
  assert.equal(B.record({ formats: { 'text/html': '<p>x</p>' } }).kind, 'text');
  assert.equal(B.record({ formats: { 'text/plain': 'x', 'text/html': '<p>x</p>' } }).kind, 'text');
  assert.equal(B.record({ formats: { 'text/plain': 'x' }, kind: 'clip' }).kind, 'clip');
  assert.equal(B.record({ formats: { 'text/plain': 'x' } }).source, 'unknown');
  assert.ok(typeof B.record({ formats: { 'text/plain': 'x' } }).t === 'number');
  assert.throws(() => B.record({ formats: {} }), /at least one format/);
  assert.throws(() => B.record({ formats: { 'application/pdf': 'x' } }), /Unknown buffer format/);
  assert.throws(() => B.record({ formats: { 'image/png': 'not a blob' } }), /must be a Blob/);
  assert.throws(() => B.record({ formats: { 'text/plain': 5 } }), /must be a string/);
  assert.throws(() => B.record({ formats: { 'text/plain': 'x' }, kind: 'shape' }), /Unknown buffer kind/);
  assert.throws(() => B.record(null), /needs/);
});

test('format choice: the target order wins, native formats are not simplified, converted ones say so', async () => {
  const { B } = await instance({ idb: fakeIDB(), withClipboard: false });
  const vec = B.record({ formats: { 'image/svg+xml': SVG }, t: 1 });
  const ok = B.choose(vec, ['image/svg+xml', 'image/png']);
  assert.equal(ok.type, 'image/svg+xml');
  assert.equal(ok.simplified, false);
  const raster = B.choose(vec, ['image/png', 'image/svg+xml']);
  assert.equal(raster.type, 'image/svg+xml', 'a record with no PNG gives its SVG');
  const onlyPng = B.record({ formats: { 'image/png': png() }, t: 2 });
  const conv = B.choose(onlyPng, ['image/svg+xml']);
  assert.equal(conv, null, 'no matching format gives null');
  const pngVector = B.record({ kind: 'vector', formats: { 'image/svg+xml': SVG, 'image/png': png() }, t: 3 });
  assert.equal(B.choose(pngVector, ['image/png']).simplified, true, 'a PNG kept for a vector is a converted copy');
  const text = B.record({ formats: { 'text/html': '<b>x</b>', 'text/plain': 'x' }, t: 4 });
  assert.equal(B.choose(text, ['text/html', 'text/plain']).type, 'text/html');
  assert.equal(B.choose(text, ['text/plain']).simplified, true);
  assert.match(B.choose(text, ['text/plain']).note, /PLAIN/);
  assert.equal(B.choose(text, ['image/png']), null);
  assert.equal(B.choose(null, ['text/plain']), null);
});

test('CSV helpers: quoted commas, quotes and line breaks parse; TSV and CSV round-trip', async () => {
  const { B } = await instance({ idb: fakeIDB(), withClipboard: false });
  assert.deepEqual(plain(B.parseCsv('a,b\r\n"x, y","say ""hi"""\n1,"two\nlines"')), [['a', 'b'], ['x, y', 'say "hi"'], ['1', 'two\nlines']]);
  assert.deepEqual(plain(B.parseCsv('\uFEFFname,qty\nbolts,4\n')), [['name', 'qty'], ['bolts', '4']]);
  assert.equal(B.csvToTsv('a,"b,c"\n1,2'), 'a\tb,c\n1\t2');
  const rows = [['n', 'note'], ['1', 'a "quoted", note'], ['2', 'two\nlines']];
  assert.deepEqual(plain(B.parseCsv(B.toCsv(rows))), rows);
});

test('storing: put keeps the item in memory and IndexedDB, and a fresh instance reads it back after a reload', async () => {
  const idb = fakeIDB();
  const first = await instance({ idb });
  const rec = await first.B.put({ kind: 'vector', formats: { 'image/svg+xml': SVG }, source: 'vector' }, { system: false });
  assert.equal(first.B.get().t, rec.t);
  assert.ok(idb.dbs.has('slop-buffer'), 'the slop-buffer database exists');
  const second = await instance({ idb });
  assert.deepEqual(plain(second.B.get()), { kind: 'vector', formats: { 'image/svg+xml': SVG }, source: 'vector', t: rec.t });
});

test('storing: a blob in image/png is stored and read back as a blob', async () => {
  const idb = fakeIDB();
  const first = await instance({ idb });
  await first.B.put({ formats: { 'image/png': png() }, source: 'photoslop' }, { system: false });
  const second = await instance({ idb });
  assert.ok(second.B.get().formats['image/png'] instanceof Blob);
  assert.equal(second.B.get().kind, 'image');
});

test('other tabs: a put is heard by the other instance (onChange and get), and clear empties it there too', async () => {
  const idb = fakeIDB();
  const a = await instance({ idb });
  const b = await instance({ idb });
  const seen = [];
  b.B.onChange((r) => seen.push(r && r.source));
  await a.B.put({ formats: { 'text/plain': 'hello' }, source: 'docs' }, { system: false });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(b.B.get().formats['text/plain'], 'hello');
  assert.deepEqual(plain(seen), ['docs']);
  await a.B.clear();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(b.B.get(), null);
  assert.equal(seen[seen.length - 1], null);
});

test('onChange: the unsubscribe stops calls', async () => {
  const { B } = await instance({ idb: fakeIDB(), withClipboard: false });
  let n = 0;
  const off = B.onChange(() => n++);
  await B.put({ formats: { 'text/plain': 'a' } }, { system: false });
  off();
  await B.put({ formats: { 'text/plain': 'b' } }, { system: false });
  assert.equal(n, 1);
});

test('system clipboard: text and table copies write text/plain (a table as TSV); a vector that cannot be drawn is refused', async () => {
  const clip = fakeClipboard();
  const { B } = await instance({ idb: fakeIDB(), clip });
  await B.put({ formats: { 'text/html': '<p>Hi</p>', 'text/plain': 'Hi' }, source: 'docs' });
  assert.deepEqual(plain(clip.writes.at(-1)), { 'text/html': '<p>Hi</p>', 'text/plain': 'Hi' });
  await B.put({ formats: { 'text/csv': 'a,b\n1,"2,5"' }, source: 'tables' });
  assert.deepEqual(plain(clip.writes.at(-1)), { 'text/plain': 'a\tb\n1\t2,5' });
  const ok = await B.writeSystem(B.record({ formats: { 'image/svg+xml': SVG } }));
  assert.equal(ok, false, 'no DOM here, so the PNG cannot be made and the browser refuses the write');
  assert.equal(await B.writeSystem(B.record({ formats: { 'image/png': png() } })).then(() => 'x'), 'x');
  assert.equal(clip.writes.at(-1)['image/png'] instanceof Blob, true);
});

test('system clipboard: no clipboard API or a refused write gives false, and put still stores the item', async () => {
  const idb = fakeIDB();
  const none = await instance({ idb, withClipboard: false });
  assert.equal(await none.B.writeSystem(none.B.record({ formats: { 'text/plain': 'x' } })), false);
  const refused = await instance({ idb, clip: fakeClipboard({ refuse: true }) });
  const rec = await refused.B.put({ formats: { 'text/plain': 'kept' } });
  assert.equal(rec.formats['text/plain'], 'kept');
  assert.equal(refused.B.get().formats['text/plain'], 'kept');
});

test('put with bad input rejects and changes nothing', async () => {
  const { B } = await instance({ idb: fakeIDB(), withClipboard: false });
  await B.put({ formats: { 'text/plain': 'keep' } }, { system: false });
  await assert.rejects(B.put({ formats: {} }), /at least one format/);
  assert.equal(B.get().formats['text/plain'], 'keep');
});

test('drop binding: a buffer drag is accepted and the drop reads the current record; other drags are ignored', async () => {
  const { B } = await instance({ idb: fakeIDB(), withClipboard: false });
  await B.put({ kind: 'text', formats: { 'text/plain': 'drop me' }, source: 'docs' }, { system: false });
  const handlers = {};
  const classes = new Set();
  const el = {
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) },
    contains: () => false,
    addEventListener(type, fn) { handlers[type] = fn; },
  };
  let got = null;
  B.bindDrop(el, (rec, at) => { got = { rec, at }; });
  const ev = (types, extra = {}) => {
    const e = { dataTransfer: { types, dropEffect: '' }, preventDefault() { e.prevented = true; }, clientX: 4, clientY: 9, ...extra };
    return e;
  };
  const over = ev(['application/x-slop-buffer']);
  handlers.dragover(over);
  assert.equal(over.prevented, true);
  assert.equal(over.dataTransfer.dropEffect, 'copy');
  assert.ok(classes.has('buffer-over'));
  const drop = ev(['application/x-slop-buffer']);
  handlers.drop(drop);
  assert.equal(got.rec.formats['text/plain'], 'drop me');
  assert.deepEqual(plain(got.at), { x: 4, y: 9 });
  assert.equal(classes.has('buffer-over'), false);
  got = null;
  const files = ev(['Files']);
  handlers.drop(files);
  assert.equal(files.prevented, undefined);
  assert.equal(got, null);
});
