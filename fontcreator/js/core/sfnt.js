/* Slop Font: the font file container (sfnt: TrueType and OpenType), read and written table by table, and WOFF 1.0 around
 * it. Pure, no DOM, no dependencies; the deflate for WOFF is passed in (the page and Node use CompressionStream).
 *   read(bytes) → { flavor, tables: { tag: Uint8Array } }       flavor 0x00010000 (TrueType) or 'OTTO' (CFF)
 *   write(flavor, tables) → Uint8Array   tables sorted, padded and check-summed; head.checkSumAdjustment set
 *   kern(pairs) → Uint8Array | null      a 'kern' table (format 0) from [[leftIndex, rightIndex, value]]
 *   woff(bytes, deflate) → Promise<Uint8Array>   deflate(Uint8Array) → Promise<Uint8Array> (zlib); a table that does
 *                                        not get smaller is stored as it is
 *   unwoff(bytes, inflate) → Promise<Uint8Array>  the sfnt inside a WOFF 1.0 file
 *   sniff(bytes) → 'ttf' | 'otf' | 'woff' | 'woff2' | null
 *   u16, i16, u32 helpers on a DataView; tag(dv, at) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else (root.SlopFont = root.SlopFont || {}).sfnt = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const OTTO = 0x4f54544f, TRUE = 0x00010000;
  const tag = (dv, at) => String.fromCharCode(dv.getUint8(at), dv.getUint8(at + 1), dv.getUint8(at + 2), dv.getUint8(at + 3));
  const tagNum = (t) => ((t.charCodeAt(0) << 24) | (t.charCodeAt(1) << 16) | (t.charCodeAt(2) << 8) | t.charCodeAt(3)) >>> 0;
  const view = (b) => new DataView(b.buffer, b.byteOffset, b.byteLength);
  const pad4 = (n) => (n + 3) & ~3;

  function sniff(bytes) {
    if (!bytes || bytes.length < 12) return null;
    const s = view(bytes).getUint32(0);
    if (s === TRUE || s === 0x74727565) return 'ttf';
    if (s === OTTO) return 'otf';
    if (s === 0x774f4646) return 'woff';
    if (s === 0x774f4632) return 'woff2';
    return null;
  }
  function read(bytes) {
    const dv = view(bytes), flavor = dv.getUint32(0), n = dv.getUint16(4), tables = {};
    if (flavor !== TRUE && flavor !== OTTO && flavor !== 0x74727565) throw new Error('Not a TrueType or OpenType font');
    for (let i = 0; i < n; i++) {
      const at = 12 + i * 16, off = dv.getUint32(at + 8), len = dv.getUint32(at + 12);
      if (off + len > bytes.length) throw new Error('The font file is cut short');
      tables[tag(dv, at)] = bytes.subarray(off, off + len);
    }
    return { flavor, tables };
  }
  function checksum(bytes) {
    const n = pad4(bytes.length), b = new Uint8Array(n);
    b.set(bytes);
    const dv = view(b);
    let s = 0;
    for (let i = 0; i < n; i += 4) s = (s + dv.getUint32(i)) >>> 0;
    return s;
  }
  function write(flavor, tables) {
    const tags = Object.keys(tables).sort();
    const n = tags.length;
    let es = 0; while ((1 << (es + 1)) <= n) es++;
    const sr = (1 << es) * 16;
    let size = 12 + n * 16;
    for (const t of tags) size += pad4(tables[t].length);
    const out = new Uint8Array(size), dv = view(out);
    dv.setUint32(0, typeof flavor === 'string' ? tagNum(flavor) : flavor);
    dv.setUint16(4, n); dv.setUint16(6, sr); dv.setUint16(8, es); dv.setUint16(10, n * 16 - sr);
    let off = 12 + n * 16, headAt = -1;
    tags.forEach((t, i) => {
      let data = tables[t];
      if (t === 'head') { data = data.slice(); view(data).setUint32(8, 0); headAt = off; }
      const at = 12 + i * 16;
      dv.setUint32(at, tagNum(t)); dv.setUint32(at + 4, checksum(data)); dv.setUint32(at + 8, off); dv.setUint32(at + 12, data.length);
      out.set(data, off);
      off += pad4(data.length);
    });
    if (headAt >= 0) dv.setUint32(headAt + 8, (0xb1b0afba - checksum(out)) >>> 0);
    return out;
  }
  function kern(pairs) {
    const list = pairs.filter((p) => p[2]).slice(0, 10000).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (!list.length) return null;
    const n = list.length, len = 14 + n * 6, out = new Uint8Array(4 + len), dv = view(out);
    let es = 0; while ((1 << (es + 1)) <= n) es++;
    dv.setUint16(0, 0); dv.setUint16(2, 1);                         // version 0, one subtable
    dv.setUint16(4, 0); dv.setUint16(6, len); dv.setUint16(8, 1);    // subtable version 0, length, coverage: horizontal, format 0
    dv.setUint16(10, n); dv.setUint16(12, (1 << es) * 6); dv.setUint16(14, es); dv.setUint16(16, n * 6 - (1 << es) * 6);
    list.forEach(([a, b, v], i) => { dv.setUint16(18 + i * 6, a); dv.setUint16(20 + i * 6, b); dv.setInt16(22 + i * 6, v); });
    return out;
  }
  async function woff(bytes, deflate) {
    const { flavor, tables } = read(bytes), tags = Object.keys(tables).sort(), n = tags.length;
    const parts = [];
    for (const t of tags) {
      const orig = tables[t];
      let comp = await deflate(orig);
      if (comp.length >= orig.length) comp = orig;
      parts.push({ t, orig, comp });
    }
    let size = 44 + n * 20;
    for (const p of parts) size += pad4(p.comp.length);
    const out = new Uint8Array(size), dv = view(out);
    let sfntSize = 12 + n * 16;
    for (const p of parts) sfntSize += pad4(p.orig.length);
    dv.setUint32(0, 0x774f4646); dv.setUint32(4, flavor); dv.setUint32(8, size); dv.setUint16(12, n);
    dv.setUint32(16, sfntSize); dv.setUint16(20, 1); dv.setUint16(22, 0);
    const sdv = view(bytes), sums = {};
    for (let k = 0; k < sdv.getUint16(4); k++) sums[tag(sdv, 12 + k * 16)] = sdv.getUint32(12 + k * 16 + 4);
    let off = 44 + n * 20;
    parts.forEach((p, i) => {
      const at = 44 + i * 20;
      dv.setUint32(at, tagNum(p.t)); dv.setUint32(at + 4, off); dv.setUint32(at + 8, p.comp.length); dv.setUint32(at + 12, p.orig.length); dv.setUint32(at + 16, sums[p.t]);
      out.set(p.comp, off);
      off += pad4(p.comp.length);
    });
    return out;
  }
  async function unwoff(bytes, inflate) {
    const dv = view(bytes), n = dv.getUint16(12), tables = {};
    for (let i = 0; i < n; i++) {
      const at = 44 + i * 20, off = dv.getUint32(at + 4), clen = dv.getUint32(at + 8), olen = dv.getUint32(at + 12);
      const data = bytes.subarray(off, off + clen);
      tables[tag(dv, at)] = clen < olen ? await inflate(data) : data;
    }
    return write(dv.getUint32(4), tables);
  }
  const u16 = (dv, at) => dv.getUint16(at), i16 = (dv, at) => dv.getInt16(at), u32 = (dv, at) => dv.getUint32(at);
  return { OTTO, TRUE, read, write, kern, woff, unwoff, sniff, checksum, tag, view, u16, i16, u32 };
});
