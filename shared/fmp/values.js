/* Ported from fmptools, (c) 2020 Evan Miller, MIT licence (see LICENSE-fmptools.txt in this folder).
   SlopFmp.values: where things sit in the path, and how the values of a table are put together from chunks (fmptools'
   table_path_match_start*, name_chunk, path_value and process_value in fmp.c and read_values.c).
   Paths. Pro 3 to 6: [5].[row] holds a record (one chunk per field, the key is the column number), [3].[5].[column] the
   column's name (key 1) and type (key 2). Pro 7+: the same under a root number of 128 + table (a table's own name is
   at [3].[16].[5].[128 + table]); that root counts as one level more. A long text is split in segments under
   [..].[5].[row].[column]. A two-byte key above the column count is (column, repetition) of a repeating field.
   State. A value is built from the chunks of one field (and one repetition), and handed over when the next field starts:
   { cur: rows begun, lastRow, lastCol, lastRep, have: a value is waiting, items, part } where items are the finished
   repetitions (a list of byte pieces) and separators, and part the pieces of the repetition in progress.
   Repetitions are joined with the group separator (0x1D), as FileMaker writes them when it exports. Pure (Node too). */
(function (root) {
  'use strict';
  const F = (root.SlopFmp = root.SlopFmp || {});
  const { REF, SEG } = F.chunks;
  const SEP = '\x1D';
  const MAX_INDEX = 100000; // anything past this is corrupt input, not a database with that many columns

  /** The number of the path entry at a level (0 when the path is not that deep). */
  const pv = (path, i) => (i >= 0 && i < path.length ? path[i].pv : 0);
  /** Levels below the table root: Pro 7+ has one more level than Pro 3 to 6. */
  const depth = (v7, path) => (v7 ? path.length - 1 : path.length);
  const start1 = (v7, path, d, a) => depth(v7, path) === d && (v7 ? pv(path, 0) >= 128 && pv(path, 1) === a : pv(path, 0) === a);
  const start2 = (v7, path, d, a, b) => depth(v7, path) === d && (v7 ? pv(path, 0) >= 128 && pv(path, 1) === a && pv(path, 2) === b : pv(path, 0) === a && pv(path, 1) === b);

  /** Does this chunk carry (part of) a name? 0: no, 1: a later part, 2: the first part. node: the level of the object's node. */
  function nameChunk(ch, path, node) {
    if (path.length === node) return ch.t === REF && ch.ref === 16 ? 2 : 0;
    if (path.length === node + 1 && pv(path, node) === 16) {
      if (ch.t === REF && ch.ref >= 1) return ch.ref === 1 ? 2 : 1;
      if (ch.t === SEG && ch.seg >= 1) return ch.seg === 1 ? 2 : 1;
    }
    return 0;
  }

  /** The column and repetition a key stands for ({ col: 0 } when it is not one of the table's columns). */
  function columnKey(v7, key, keyLen, numCols) {
    if (key >= 1 && key <= numCols) return { col: key, rep: 1 };
    if (v7 && keyLen === 2 && key >= 0x80) {
      const col = (key - 0x80) >> 8, rep = (key - 0x80) & 0xFF;
      if (col >= 1 && col <= numCols && rep >= 1) return { col, rep };
    }
    return { col: 0, rep: 1 };
  }
  const keyLen = (v7, ch) => (!v7 ? 1 : ch.t === SEG ? (ch.code === 0x0F ? 2 : 1) : ch.code >= 0x09 && ch.code <= 0x0E ? 2 : 1);

  const newState = () => ({ cur: 0, lastRow: 0, lastCol: 0, lastRep: 0, have: false, items: [], part: [] });
  const snapshot = (s) => Object.assign({}, s, { items: s.items.slice(), part: s.part.slice() });
  const finishRep = (s) => { s.items.push(s.part); s.part = []; };
  const separators = (s, n) => { if (n > 0) s.items.push(SEP.repeat(n)); };

  /** The text of a finished value: each repetition converted on its own, separators between. */
  function valueText(items, v7) {
    let out = '';
    for (const it of items) {
      if (typeof it === 'string') { out += it; continue; }
      let bytes = it[0];
      if (it.length > 1) {
        bytes = new Uint8Array(it.reduce((n, a) => n + a.length, 0));
        let at = 0;
        for (const a of it) { bytes.set(a, at); at += a.length; }
      }
      if (bytes) out += F.charset.text(bytes, 0, bytes.length, v7);
    }
    return out;
  }

  /** Hand the waiting value over: deliver(row, column, items), or nothing when only counting. */
  function flush(s, deliver) {
    if (!s.have) return;
    finishRep(s);
    const items = s.items;
    s.have = false; s.items = [];
    if (deliver) deliver(s.cur, s.lastCol, items);
  }

  /** Long values sit one level deeper; the row must move on in step with the column (read_values.c, path_is_long_string). */
  function inStep(s, row, col) {
    return s.lastCol === 0 || col < s.lastCol ? row > s.lastRow : row === s.lastRow;
  }

  /** One chunk of a table's records (fmptools' process_value). ts: { v7, bytes, cols: Map, numCols }. */
  function feed(ts, s, ch, path, deliver) {
    const v7 = ts.v7;
    let k = { col: 0, rep: 1 }, long = false;
    if (start1(v7, path, 3, 5)) {
      const last = path[path.length - 1];
      k = columnKey(v7, last.pv, last.n, ts.numCols);
      if (k.col === 0 || !inStep(s, pv(path, v7 ? 2 : 1), k.col)) return;
      if (ch.t === REF && ch.ref === 0) return; // rich-text formatting
      long = true;
    } else if (start1(v7, path, 2, 5)) {
      if (ch.t === REF) { if (ch.ref === 252) return; k = columnKey(v7, ch.ref, keyLen(v7, ch), ts.numCols); }
      else if (ch.t === SEG) k = columnKey(v7, ch.seg, keyLen(v7, ch), ts.numCols);
    }
    const col = k.col, rep = k.rep;
    if (col === 0 || !ts.cols.has(col)) return; // not a column, or one with no name
    const row = pv(path, v7 ? 2 : 1);
    if (s.have && (col !== s.lastCol || row !== s.lastRow)) flush(s, deliver); // a different field
    else if (s.have && rep !== s.lastRep) { finishRep(s); separators(s, rep > s.lastRep ? rep - s.lastRep : 1); } // next repetition
    else if (s.have && !long) flush(s, deliver); // a second complete value for the same field
    if (row !== s.lastRow || col < s.lastCol) s.cur++;
    if (!s.have) { separators(s, rep - 1); s.have = true; }
    s.part.push(ts.bytes.subarray(ch.o, ch.o + ch.n));
    s.lastRow = row; s.lastCol = col; s.lastRep = rep;
  }

  F.values = { MAX_INDEX, pv, depth, start1, start2, nameChunk, columnKey, newState, snapshot, valueText, flush, feed };
})(typeof window !== 'undefined' ? window : globalThis);
