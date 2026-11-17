/* Ported from fmptools, (c) 2020 Evan Miller, MIT licence (see LICENSE-fmptools.txt in this folder).
   SlopFmp.reader: reads the tables, columns and records of a Pro 3 to 12 file (fmptools' fmp_list_tables, fmp_list_columns
   and fmp_read_values in list_tables.c, list_columns.c and read_values.c, which each walk the file once; here one walk
   does all three). Opening walks every leaf sector once, in chain order: it learns the table and column names and counts
   the rows, and keeps a checkpoint of the reading state every CHECKPOINT rows. rows() then starts at the checkpoint
   before the page asked for and reads only a few sectors, so paging forward is fast. The path restarts at every sector,
   so any sector can be read alone.
   openBinary(bytes, info, sectors, opts) -> Promise<reader>:
     reader.tables: [{ id, name, columns: [{ name, type?, index }], rowCount }]   reader.warnings: sectors that could not be read
     reader.rows(tableId, from, count) -> string[][] (one string per column, '' where the record has no value)
   opts: { name (file name, for a Pro 3 to 6 file's table), onProgress(0..1), order: 'file' (read the leaf sectors in file
   order, ignoring the ids: for files whose sectors were rewritten in chain order) }. Pure (Node too). */
(function (root) {
  'use strict';
  const F = (root.SlopFmp = root.SlopFmp || {});
  const { PUSH, POP, REF, SEG, pathValue } = F.chunks;
  const V = F.values;
  const { pv, start2, nameChunk } = V;
  const CHECKPOINT = 64, CACHE = 12, MAX_PAGE = 100000, NAME_MAX = 255;
  const TYPES = ['', 'text', 'number', 'date', 'time', 'container', 'calc', 'summary', 'global'];
  const tick = () => new Promise((r) => (typeof setTimeout === 'function' ? setTimeout(r, 0) : r()));

  /** Run the chunks of one sector with the path they sit at: fn(chunk, path) (path: the pushed chunks, with .pv). */
  function walk(R, chunks, fn) {
    const path = [];
    for (let i = 0; i < chunks.length; i++) {
      const ch = chunks[i];
      if (ch.t === POP) { path.pop(); continue; }
      if (ch.t === PUSH) { ch.pv = pathValue(R.bytes, ch, R.v7); path.push(ch); continue; }
      if (fn(ch, path) === false) return false;
    }
    return true;
  }

  /** What a chunk is, for a table: 1 a table's name, 2 a column's name or type, 3 a record's value, 0 nothing we read. */
  function route(R, ch, path) {
    if (ch.t !== REF && ch.t !== SEG) return 0;
    const p0 = pv(path, 0);
    if (!R.v7) return p0 > 5 ? 0 : ch.t === REF && start2(false, path, 3, 3, 5) ? 2 : 3;
    if (p0 === 3) return path.length >= 4 && pv(path, 1) === 16 && pv(path, 2) === 5 && pv(path, 3) >= 128 && nameChunk(ch, path, 4) ? 1 : 0;
    if (p0 < 128) return 0;
    if (path.length >= 4 && pv(path, 1) === 3 && pv(path, 2) === 5 && nameChunk(ch, path, 4)) return 2;
    return start2(true, path, 3, 3, 5) || start2(true, path, 4, 3, 5) ? 0 : 3;
  }

  function tableState(R, index) {
    let ts = R.states.get(index);
    if (!ts) {
      ts = { index, listed: false, name: '', v7: R.v7, bytes: R.bytes, cols: new Map(), numCols: 0, st: V.newState(), cps: [], nextCp: 0, lastBlock: -1, rowCount: 0 };
      R.states.set(index, ts);
    }
    return ts;
  }
  const text = (R, ch) => F.charset.text(R.bytes, ch.o, ch.n, R.v7).slice(0, NAME_MAX);

  /** A chunk met while walking every sector: names, types, and the records (with a checkpoint at a new sector). */
  function scanChunk(R, ch, path, k) {
    const kind = route(R, ch, path);
    if (!kind) return;
    let ts;
    if (kind === 1) {
      const index = pv(path, 3) - 128;
      if (index === 0 || index > V.MAX_INDEX) return;
      ts = tableState(R, index);
      const first = nameChunk(ch, path, 4) === 2;
      ts.name = (first ? '' : ts.name) + text(R, ch);
      ts.listed = true;
      return;
    }
    ts = tableState(R, R.v7 ? pv(path, 0) - 128 : 1);
    if (kind === 2) {
      const index = pv(path, R.v7 ? 3 : 2);
      if (index === 0 || index > V.MAX_INDEX) return;
      ts.numCols = Math.max(ts.numCols, index);
      const old = ts.cols.get(index);
      if (R.v7) {
        const first = nameChunk(ch, path, 4) === 2;
        ts.cols.set(index, { index, name: (first || !old ? '' : old.name) + text(R, ch) });
      } else if (ch.ref === 1) {
        ts.cols.set(index, { index, name: text(R, ch), type: old && old.type });
      } else if (ch.ref === 2 && old && ch.n > 1) {
        old.type = TYPES[R.bytes[ch.o + 1]] || undefined;
      }
      return;
    }
    if (ts.lastBlock !== k) {
      ts.lastBlock = k;
      if (ts.st.cur >= ts.nextCp) { ts.cps.push({ k, st: V.snapshot(ts.st) }); ts.nextCp = ts.st.cur + CHECKPOINT; }
    }
    V.feed(ts, ts.st, ch, path, null);
  }

  /** The tables in order, with the columns that have a name, and the row counts. */
  function finish(R, opts) {
    const list = [];
    for (const index of [...R.states.keys()].sort((a, b) => a - b)) {
      const ts = R.states.get(index);
      if (R.v7 && !ts.listed) continue;
      const cols = [...ts.cols.values()].sort((a, b) => a.index - b.index);
      ts.pos = new Map(cols.map((c, i) => [c.index, i]));
      ts.rowCount = ts.st.cur;
      const base = String(opts.name || '').replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '');
      const name = R.v7 ? ts.name : base;
      list.push({ id: String(index), name: name || 'Table ' + index, ts, rowCount: ts.rowCount,
        columns: cols.map((c) => ({ name: c.name || 'Field ' + c.index, type: c.type, index: c.index })) });
    }
    R.tables = list;
  }

  /** The chunks of the n-th leaf sector (decoded once, a few kept for paging). */
  function block(R, k, keep) {
    let hit = R.cache.get(k);
    if (hit) return hit;
    const s = R.chain[k];
    const r = F.chunks.decode(R.bytes, R.tbl.off[s], R.tbl.off[s] + R.tbl.len[s], R.v7);
    if (r.error && !keep) R.warnings++;
    if (keep) {
      R.cache.set(k, r.chunks);
      if (R.cache.size > CACHE) R.cache.delete(R.cache.keys().next().value);
    }
    return r.chunks;
  }

  async function rows(R, tableId, from, count) {
    const t = R.tables.find((x) => x.id === String(tableId));
    if (!t) return [];
    const ts = t.ts;
    from = Math.max(0, Math.floor(from) || 0);
    const end = Math.min(t.rowCount, from + Math.min(Math.max(0, Math.floor(count) || 0), MAX_PAGE));
    if (from >= end) return [];
    const out = [];
    for (let i = from; i < end; i++) out.push(new Array(t.columns.length).fill(''));
    let lo = 0, hi = ts.cps.length - 1, at = -1; // the last checkpoint whose row (maybe half read) is before the first wanted one
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (ts.cps[mid].st.cur <= from) { at = mid; lo = mid + 1; } else hi = mid - 1; }
    const s = at < 0 ? V.newState() : V.snapshot(ts.cps[at].st);
    let done = false;
    const deliver = (row, col, items) => {
      if (row > end) { done = true; return; }
      const p = ts.pos.get(col);
      if (row > from && p !== undefined) out[row - from - 1][p] = V.valueText(items, R.v7);
    };
    const target = R.v7 ? ts.index + 128 : 5;
    for (let k = at < 0 ? 0 : ts.cps[at].k; k < R.chain.length && !done; k++) {
      let over = false;
      walk(R, block(R, k, true), (ch, path) => {
        const p0 = pv(path, 0);
        if (p0 > target) { over = true; return false; }
        if (p0 === target && route(R, ch, path) === 3) V.feed(ts, s, ch, path, deliver);
        return !done;
      });
      if (over) break;
    }
    if (!done) V.flush(s, deliver);
    return out;
  }

  async function openBinary(bytes, info, tbl, opts) {
    opts = opts || {};
    let chain = F.sectors.leafChain(tbl, info);
    if (opts.order === 'file') chain = Array.from(tbl.level.keys()).filter((i) => !tbl.bad[i] && tbl.level[i] === 0);
    const R = { bytes, v7: info.v7, tbl, chain, states: new Map(), cache: new Map(), warnings: 0, tables: [], closed: false };
    if (!R.v7) tableState(R, 1);
    let t0 = Date.now();
    for (let k = 0; k < chain.length; k++) {
      walk(R, block(R, k, false), (ch, path) => { scanChunk(R, ch, path, k); });
      if ((k & 31) === 31 && Date.now() - t0 > 30) {
        if (opts.onProgress) opts.onProgress(k / chain.length);
        await tick();
        t0 = Date.now();
      }
    }
    finish(R, opts);
    R.rows = (id, from, count) => (R.closed ? Promise.resolve([]) : rows(R, id, from, count));
    R.close = () => { R.closed = true; R.cache.clear(); R.states.clear(); };
    return R;
  }

  F.reader = { openBinary, walk, route };
})(typeof window !== 'undefined' ? window : globalThis);
