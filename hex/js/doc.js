/* Slop Hex: the document model. A file is a Blob that is read in pages (64 KB, at most 64 kept), so a large file
 * opens without loading it all. Edits are an overlay of changed bytes; undo and redo work on groups of byte changes.
 * Saving builds a new Blob from the original slices and the changed runs, so the file is never copied whole.
 * Classic script, no DOM. Exposes window.HexDoc.create(blob, { name, type, crypto }).
 *   create(blob, { name, type, crypto, dirty })  dirty: the content is not known to be saved (a restored unsaved tab)
 *   load(offset, len)            async: make sure the pages under that range are in memory
 *   has(offset, len)             are those pages in memory?
 *   byte(i)                      the current value (edits applied), or undefined when its page is not loaded
 *   write([{ at, value }], { coalesce })   one undo group; coalesce merges into the last group with the same key
 *   splice(at, remove, bytes)    insert and/or delete bytes (the size changes): one undo group that swaps the whole content
 *   undo() / redo()              return { at } (the first byte changed) or null
 *   dirty() / markSaved()        changed since the last save?
 *   toBlob()                     the current content as a Blob
 *   sha256()                     async: SHA-256 hex of the current content (crypto.subtle)
 *   readRange(offset, len)       async: current bytes of a range, read without the page cache (used by find)
 *   find(pattern, from, dir, stop)  async: index of the next (dir 1) or previous (dir -1) match, or -1. */
(function () {
  'use strict';
  if (window.HexDoc) return;
  const PAGE = 65536, MAX_PAGES = 64, CHUNK = 1 << 20;

  function create(blob, opts = {}) {
    const B = window.HexBytes;
    const cr = opts.crypto || window.crypto;
    const st = {
      blob, size: blob.size, name: opts.name || 'untitled.bin', type: opts.type || blob.type || 'application/octet-stream',
      pages: new Map(), loading: new Map(), edits: new Map(), undo: [], redo: [], idSeq: 0, gen: 0,
      savedId: opts.dirty ? -1 : 0, // dirty: a restored unsaved file differs from its saved copy, which is unknown
    };
    const top = () => (st.undo.length ? st.undo[st.undo.length - 1] : null);

    async function fetchPage(p) {
      const start = p * PAGE, end = Math.min(st.size, start + PAGE), gen = st.gen;
      const buf = new Uint8Array(await st.blob.slice(start, end).arrayBuffer());
      if (gen !== st.gen) return;   // the content was swapped (splice) while this page was read
      st.pages.delete(p); st.pages.set(p, buf);
      while (st.pages.size > MAX_PAGES) st.pages.delete(st.pages.keys().next().value);
    }
    function load(offset, len) {
      if (len <= 0 || st.size === 0) return Promise.resolve();
      const end = Math.min(st.size, offset + len);
      const jobs = [];
      for (let p = Math.floor(offset / PAGE); p <= Math.floor((end - 1) / PAGE); p++) {
        if (st.pages.has(p)) { const v = st.pages.get(p); st.pages.delete(p); st.pages.set(p, v); continue; }
        if (!st.loading.has(p)) st.loading.set(p, fetchPage(p).finally(() => st.loading.delete(p)));
        jobs.push(st.loading.get(p));
      }
      return Promise.all(jobs).then(() => undefined);
    }
    function has(offset, len) {
      if (st.size === 0 || len <= 0) return true;
      const end = Math.min(st.size, offset + len);
      for (let p = Math.floor(offset / PAGE); p <= Math.floor((end - 1) / PAGE); p++) if (!st.pages.has(p)) return false;
      return true;
    }
    function base(i) {
      const page = st.pages.get(Math.floor(i / PAGE));
      return page ? page[i % PAGE] : undefined;
    }
    function byte(i) {
      if (i < 0 || i >= st.size) return undefined;
      return st.edits.has(i) ? st.edits.get(i) : base(i);
    }

    function write(changes, { coalesce = null } = {}) {
      const ops = [];
      for (const c of changes) {
        if (!(c.at >= 0 && c.at < st.size)) continue;
        const from = byte(c.at);
        if (from === undefined) throw new Error('The bytes at 0x' + c.at.toString(16) + ' are not loaded');
        if (from !== c.value) ops.push({ at: c.at, from, to: c.value });
      }
      if (!ops.length) return false;
      const last = top();
      st.redo = [];
      if (coalesce && last && last.key === coalesce) {
        for (const o of ops) {
          const old = last.ops.find((x) => x.at === o.at);   // (a splice group never has a coalesce key)
          if (old) old.to = o.to; else last.ops.push(o);
        }
        last.id = ++st.idSeq;
      } else {
        st.undo.push({ key: coalesce, ops, id: ++st.idSeq });
      }
      for (const o of ops) st.edits.set(o.at, o.to);
      return true;
    }
    /** The whole content at once: a splice swaps the Blob, the size and the edits (undo restores the old ones). */
    function swap(c) {
      st.blob = c.blob; st.size = c.size; st.edits = new Map(c.edits);
      st.pages = new Map(); st.loading = new Map(); st.gen++;
    }
    const near = (at) => ({ at: Math.max(0, Math.min(at, st.size - 1)) });
    function splice(at, remove, bytes) {
      remove = Math.max(0, Math.min(remove || 0, st.size - at));
      const add = bytes || new Uint8Array(0);
      if (!(at >= 0 && at <= st.size)) throw new Error('The offset is outside the file');
      if (!remove && !add.length) return false;
      const cur = toBlob(), before = { blob: st.blob, size: st.size, edits: new Map(st.edits) };
      const blob = new Blob([cur.slice(0, at), add, cur.slice(at + remove)], { type: st.type });
      const after = { blob, size: blob.size, edits: new Map() };
      st.redo = [];
      st.undo.push({ key: null, ops: [], swap: { before, after, at }, id: ++st.idSeq });
      swap(after);
      return true;
    }
    function undo() {
      const g = st.undo.pop();
      if (!g) return null;
      st.redo.push(g);
      if (g.swap) { swap(g.swap.before); return near(g.swap.at); }
      for (const o of g.ops) st.edits.set(o.at, o.from);
      return { at: Math.min(...g.ops.map((o) => o.at)) };
    }
    function redo() {
      const g = st.redo.pop();
      if (!g) return null;
      if (g.swap) { st.undo.push(g); swap(g.swap.after); return near(g.swap.at); }
      for (const o of g.ops) st.edits.set(o.at, o.to);
      st.undo.push(g);
      return { at: Math.min(...g.ops.map((o) => o.at)) };
    }
    const dirty = () => (top() ? top().id : 0) !== st.savedId;
    const markSaved = () => { st.savedId = top() ? top().id : 0; };

    function toBlob() {
      const parts = [], keys = [...st.edits.keys()].sort((a, b) => a - b);
      let pos = 0;
      for (let i = 0; i < keys.length;) {
        let j = i;
        while (j + 1 < keys.length && keys[j + 1] === keys[j] + 1) j++;
        const start = keys[i], end = keys[j] + 1;
        if (start > pos) parts.push(st.blob.slice(pos, start));
        const run = new Uint8Array(end - start);
        for (let k = i; k <= j; k++) run[keys[k] - start] = st.edits.get(keys[k]);
        parts.push(run);
        pos = end; i = j + 1;
      }
      if (pos < st.size) parts.push(st.blob.slice(pos, st.size));
      return new Blob(parts, { type: st.type });
    }

    async function sha256() {
      const buf = await toBlob().arrayBuffer();
      const d = new Uint8Array(await cr.subtle.digest('SHA-256', buf));
      return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
    }

    async function readRange(offset, len) {
      const end = Math.min(st.size, offset + len);
      if (end <= offset) return new Uint8Array(0);
      const out = new Uint8Array(await st.blob.slice(offset, end).arrayBuffer());
      for (const [at, v] of st.edits) if (at >= offset && at < end) out[at - offset] = v;
      return out;
    }

    async function find(pat, from, dir = 1, stop = () => false) {
      const m = pat.length, size = st.size;
      if (!m || m > size) return -1;
      if (dir >= 0) {
        for (let pos = Math.max(0, from); pos <= size - m;) {
          if (stop()) return null;
          const end = Math.min(size, pos + CHUNK + m - 1);
          const idx = B.indexOf(await readRange(pos, end - pos), pat, 0);
          if (idx >= 0) return pos + idx;
          if (end >= size) break;
          pos += CHUNK;
        }
        return -1;
      }
      for (let hi = Math.min(from, size - m); hi >= 0;) {
        if (stop()) return null;
        const lo = Math.max(0, hi - CHUNK + 1);
        const data = await readRange(lo, Math.min(size, hi + m) - lo);
        const idx = B.lastIndexOf(data, pat, hi - lo);
        if (idx >= 0) return lo + idx;
        if (lo === 0) break;
        hi = lo - 1;
      }
      return -1;
    }

    return {
      get size() { return st.size; },
      get name() { return st.name; },
      set name(v) { st.name = v; },
      get type() { return st.type; },
      get changed() { return st.edits.size; },
      load, has, base, byte, write, splice, undo, redo, dirty, markSaved, toBlob, sha256, readRange, find,
      canUndo: () => st.undo.length > 0,
      undoDepth: () => st.undo.length,   // how many undo steps there are (the assistant's checkpoint)
      canRedo: () => st.redo.length > 0,
    };
  }

  window.HexDoc = { create, PAGE };
})();
