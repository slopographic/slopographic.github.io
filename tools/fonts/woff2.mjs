// Reads the tables of a WOFF2 file in Node (no font library): the header, the table directory and the Brotli stream,
// enough to check a built font's name table, its OS/2 weight class, its cmap size and its features. Transformed tables
// (glyf, loca, hmtx) are returned as their transformed bytes; the checks never need them.
//   import { woff2Tables, nameRecords, featureTags } from './woff2.mjs'
// Node only. Tests: tests/node/brand-font.test.mjs, tests/node/whitelabel-font.test.mjs.
import { brotliDecompressSync } from 'node:zlib';

const TAGS = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT',
  'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC',
  'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar',
  'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];

/** UIntBase128 at offset: [value, next offset]. */
function base128(buf, at) {
  let v = 0;
  for (let i = 0; i < 5; i++) {
    const b = buf[at + i];
    v = v * 128 + (b & 0x7f);
    if (!(b & 0x80)) return [v, at + i + 1];
  }
  throw new Error('bad UIntBase128');
}

/** { tag: Buffer } of a WOFF2 file's tables. */
export function woff2Tables(buf) {
  if (buf.toString('latin1', 0, 4) !== 'wOF2') throw new Error('not a WOFF2 file');
  const numTables = buf.readUInt16BE(12), compressed = buf.readUInt32BE(20);
  let at = 48;
  const dir = [];
  for (let i = 0; i < numTables; i++) {
    const flags = buf[at++];
    let tag = TAGS[flags & 0x3f];
    if ((flags & 0x3f) === 63) { tag = buf.toString('latin1', at, at + 4); at += 4; }
    const version = flags >> 6;
    let length, transformed;
    [length, at] = base128(buf, at);
    const isTransformed = (tag === 'glyf' || tag === 'loca') ? version !== 3 : version !== 0;
    if (isTransformed) [transformed, at] = base128(buf, at);
    dir.push({ tag, length: isTransformed ? transformed : length });
  }
  const data = brotliDecompressSync(buf.subarray(at, at + compressed));
  const out = {};
  let off = 0;
  for (const t of dir) { out[t.tag] = data.subarray(off, off + t.length); off += t.length; }
  return out;
}

/** The name table's records: [{ nameID, platformID, text }] (Windows records decoded as UTF-16BE). */
export function nameRecords(tables) {
  const t = tables.name, count = t.readUInt16BE(2), strings = t.readUInt16BE(4), out = [];
  for (let i = 0; i < count; i++) {
    const r = 6 + i * 12;
    const platformID = t.readUInt16BE(r), nameID = t.readUInt16BE(r + 6), len = t.readUInt16BE(r + 8), off = t.readUInt16BE(r + 10);
    const raw = t.subarray(strings + off, strings + off + len);
    let text = '';
    if (platformID === 3 || platformID === 0) for (let k = 0; k + 1 < raw.length; k += 2) text += String.fromCharCode(raw.readUInt16BE(k));
    else text = raw.toString('latin1');
    out.push({ nameID, platformID, text });
  }
  return out;
}

/** One name (Windows English first). */
export const nameOf = (tables, id) => (nameRecords(tables).find((r) => r.nameID === id && r.platformID === 3) || {}).text;

/** The OpenType feature tags of a layout table (GSUB or GPOS), sorted and unique. */
export function featureTags(tables, tag = 'GSUB') {
  const t = tables[tag];
  if (!t) return [];
  const list = t.readUInt16BE(6), n = t.readUInt16BE(list), tags = new Set();
  for (let i = 0; i < n; i++) tags.add(t.toString('latin1', list + 2 + i * 6, list + 6 + i * 6));
  return [...tags].sort();
}

/** The usWeightClass of OS/2 and the variation axes of fvar ([{ tag, min, def, max }]). */
export function weightClass(tables) { return tables['OS/2'].readUInt16BE(4); }
export function axes(tables) {
  const t = tables.fvar;
  if (!t) return [];
  const off = t.readUInt16BE(4), n = t.readUInt16BE(8), size = t.readUInt16BE(10), fixed = (o) => t.readInt32BE(o) / 65536;
  return Array.from({ length: n }, (_, i) => { const o = off + i * size; return { tag: t.toString('latin1', o, o + 4), min: fixed(o + 4), def: fixed(o + 8), max: fixed(o + 12) }; });
}
