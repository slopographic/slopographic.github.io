// Helpers for the fmp-*.test.mjs files (not a test itself): loads shared/fmp/*.js into a vm context the way a page loads
// them (classic scripts, in the order of shared/fmp/HANDOFF.md), and builds small FileMaker files out of chunks, so the
// reader is tested on files whose contents are known. The builders follow shared/fmp/HANDOFF.md (the format as fmptools
// describes it): Pro 7+ sectors of 4096 bytes with text XOR 0x5A, Pro 3 to 6 sectors of 1024 bytes.
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const FILES = ['scsu.js', 'charset.js', 'sectors.js', 'chunks.js', 'chunks7.js', 'values.js', 'reader.js', 'xml.js', 'export.js', 'fmp.js'];

/** A fresh SlopFmp, loaded from the repo's files (the objects come from another realm: compare plain copies). */
export function loadFmp(files = FILES) {
  const ctx = { console, Blob, TextDecoder, TextEncoder, setTimeout, Date };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of files) vm.runInContext(readFileSync(path.join(ROOT, 'shared', 'fmp', f), 'utf8'), ctx, { filename: f });
  return ctx.SlopFmp;
}
export const plain = (v) => JSON.parse(JSON.stringify(v));
export const ascii = (s) => Array.from(s, (c) => c.charCodeAt(0));
/** Text as SCSU: single bytes when every letter is below U+0100, else Unicode mode (SCU, then UTF-16BE). */
export function scsu(s) {
  if (!/[^\u0000-\u00FF]/.test(s)) return ascii(s);
  return [0x0F, ...Array.from(s, (c) => [c.charCodeAt(0) >> 8, c.charCodeAt(0) & 255]).flat()];
}
/** Text as Pro 7+ stores it: SCSU with every byte XOR 0x5A. */
export const x5a = (s) => scsu(s).map((b) => b ^ 0x5A);
const be16 = (n) => [(n >> 8) & 255, n & 255];
const be32 = (n) => [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
/** A Pro 7+ "path integer" of two bytes (n >= 128). */
const pint = (n) => [((n - 0x80) >> 8) & 0x7F, (n - 0x80) & 255];
const MAGIC = [0x00, 0x01, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0x00, 0x05, 0x00, 0x02, 0x00, 0x02, 0xC0];

/** Chunks of Pro 7+ (codes as in shared/fmp/chunks7.js). Values are byte arrays: use x5a(text) for text. */
export const c7 = {
  push: (n) => (n < 128 ? [0x20, n] : [0x28, ...pint(n)]),
  pop: () => [0x40],
  /** key (a column number, or a pair for a repetition) and value: code 0x06 for a short key, 0x0E for a long one. */
  ref: (key, v) => (key < 128 ? [0x06, key, v.length, ...v] : [0x0E, ...pint(key), v.length, ...v]),
  seg: (i, v) => [0x07, i, ...be16(v.length), ...v],
  data: (v) => [0x00, ...v],
};
/** Chunks of Pro 3 to 6. */
export const c3 = {
  push: (bytes) => [0xC0 + bytes.length, ...bytes],
  pop: () => [0xC0],
  ref: (key, v) => [0x40 + key, v.length, ...v],
  long: (k, v) => [k.length, ...k, v.length, ...v],
};

/** The header sector shared by both kinds. */
function header(size, v7, version) {
  const h = new Uint8Array(size);
  h.set(MAGIC, 0);
  if (v7) { h.set(ascii('HBAM7'), 15); h[521] = 0x1E; }
  h[541] = version.length;
  h.set(ascii(version), 542);
  return h;
}

/** A Pro 7+ file from leaf payloads in reading order. ids: the sector id of each leaf (default 2, 3, ...; give a shuffle
 *  to scatter them); index: put an index sector at id 2 (so the first leaf is elsewhere). */
export function buildV7(leaves, { ids, version = 'Pro 12.0', index = false, hbam = 'HBAM7' } = {}) {
  const base = index ? 3 : 2;
  const at = ids || leaves.map((_, i) => base + i);
  const count = Math.max(1, ...at) + (index ? 0 : 0);
  const out = new Uint8Array((count + 1) * 4096);
  out.set(header(4096, true, version), 0);
  if (hbam !== 'HBAM7') out.set(ascii(hbam), 15);
  const put = (id, level, prev, next, payload) => {
    const o = id * 4096;
    out.set([...be32(prev)], o + 4); out.set(be32(next), o + 8); out.set(be16(level), o + 12);
    out.set(payload, o + 20);
  };
  put(1, 2, 0, count, []);
  if (index) put(2, 1, 0, 0, []);
  leaves.forEach((p, i) => put(at[i], 0, i ? at[i - 1] : 0, i < leaves.length - 1 ? at[i + 1] : 0, p));
  return out;
}

/** A Pro 3 to 6 file from leaf payloads in reading order (sector ids 2, 3, ... unless ids says otherwise). */
export function buildV3(leaves, { ids, version = 'Pro 5.0' } = {}) {
  const at = ids || leaves.map((_, i) => 2 + i);
  const count = Math.max(1, ...at);
  const out = new Uint8Array((count + 2) * 1024);
  out.set(header(1024, false, version), 0);
  const put = (id, level, prev, next, payload) => {
    const o = 1024 + id * 1024;
    out[o + 1] = level; out.set(be32(prev), o + 2); out.set(be32(next), o + 6); out.set(be16(payload.length), o + 12);
    out.set(payload, o + 14);
  };
  put(1, 1, 0, count, []);
  leaves.forEach((p, i) => put(at[i], 0, i ? at[i - 1] : 0, i < leaves.length - 1 ? at[i + 1] : 0, p));
  return out;
}

/** The payload of a Pro 7+ table: the name at [3].[16].[5].[128+n], the columns at [128+n].[3].[5].[i] and the records at
 *  [128+n].[5].[row]. rows: arrays of strings (null = no value); a string in a row may also be { rep: [..] } for a
 *  repeating field or { long: 'text' } for a long value. Split into leaves with maxRows. */
export function tableV7(n, name, columns, rows, { maxRows = 1e9 } = {}) {
  const root = 128 + n;
  const leaves = [];
  const head = [...c7.push(3), ...c7.push(16), ...c7.push(5), ...c7.push(root), ...c7.ref(16, x5a(name)), ...c7.pop(), ...c7.pop(), ...c7.pop(), ...c7.pop()];
  const cols = [...c7.push(root), ...c7.push(3), ...c7.push(5)];
  columns.forEach((c, i) => cols.push(...c7.push(i + 1), ...c7.ref(16, x5a(c)), ...c7.pop()));
  cols.push(...c7.pop(), ...c7.pop(), ...c7.pop());
  let cur = [...head, ...cols];
  for (let r = 0; r < rows.length; r += maxRows) {
    if (r) { leaves.push(cur); cur = []; }
    for (let i = r; i < Math.min(rows.length, r + maxRows); i++) cur.push(...recordV7(root, i + 1, rows[i]));
  }
  leaves.push(cur);
  return leaves;
}
function recordV7(root, row, values) {
  const out = [...c7.push(root), ...c7.push(5), ...c7.push(row)];
  values.forEach((v, i) => {
    const col = i + 1;
    if (v === null) return;
    if (typeof v === 'string') out.push(...c7.ref(col, x5a(v)));
    else if (v.rep) v.rep.forEach((s, k) => out.push(...c7.ref(k ? col * 256 + 0x80 + (k + 1) : col, x5a(s))));
    else { // a long value: segments of 4 bytes under [..].[row].[col], after the chunks of the columns before it
      out.push(...c7.push(col), ...c7.ref(0, [0]));
      for (let k = 0; k * 4 < v.long.length; k++) out.push(...c7.seg(k + 1, x5a(v.long.slice(k * 4, k * 4 + 4))));
      out.push(...c7.pop());
    }
  });
  out.push(...c7.pop(), ...c7.pop(), ...c7.pop());
  return out;
}

/** The payload of a Pro 3 to 6 table: columns [3].[5].[i] (key 1 name, key 2 type) and records [5].[row]. */
export function tableV3(columns, rows) {
  const out = [...c3.push([3]), ...c3.push([5])];
  columns.forEach((c, i) => out.push(...c3.push([i + 1]), ...c3.ref(1, ascii(c.name)), ...c3.ref(2, [0, c.type || 1, 0, 0]), ...c3.pop()));
  out.push(...c3.pop(), ...c3.pop(), ...c3.push([5]));
  rows.forEach((r, i) => {
    out.push(...c3.push([i + 1]));
    r.forEach((v, k) => { if (v !== null) out.push(...c3.ref(k + 1, ascii(v))); });
    out.push(...c3.pop());
  });
  out.push(...c3.pop());
  return out;
}
