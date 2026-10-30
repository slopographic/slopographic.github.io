/* Slop Docs — fonts/ttf: a small TrueType (glyf) reader and subsetter.
 * parseTTF(bytes) → font { upm, asc, desc, gap, capH, xH, italicAngle, ulPos, ulThick, bbox, psName,
 *   numGlyphs, adv(gid), gid(codepoint), u8, tables }
 * subsetTTF(font, gids) → Uint8Array: a valid TrueType file that keeps glyph ids (unused glyphs are
 *   emptied), so a PDF can use CIDToGIDMap /Identity with CID = GID. Composite glyph parts are kept. */
const tag = (u8, o) => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);

export function parseTTF(input) {
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const ver = dv.getUint32(0);
  if (ver !== 0x00010000 && ver !== 0x74727565) throw new Error('Not a TrueType font');
  const n = dv.getUint16(4), tables = {};
  for (let i = 0; i < n; i++) {
    const o = 12 + i * 16;
    tables[tag(u8, o)] = { off: dv.getUint32(o + 8), len: dv.getUint32(o + 12) };
  }
  const T = (t) => { if (!tables[t]) throw new Error('Font is missing the ' + t + ' table'); return tables[t].off; };
  const head = T('head'), hhea = T('hhea'), maxp = T('maxp'), hmtx = T('hmtx');
  const upm = dv.getUint16(head + 18);
  const bbox = [dv.getInt16(head + 36), dv.getInt16(head + 38), dv.getInt16(head + 40), dv.getInt16(head + 42)];
  const locFmt = dv.getInt16(head + 50);
  const asc = dv.getInt16(hhea + 4), desc = -dv.getInt16(hhea + 6), gap = dv.getInt16(hhea + 8);
  const nHM = dv.getUint16(hhea + 34), numGlyphs = dv.getUint16(maxp + 4);
  const advs = new Uint16Array(numGlyphs);
  let last = 0;
  for (let g = 0; g < numGlyphs; g++) { if (g < nHM) last = dv.getUint16(hmtx + g * 4); advs[g] = last; }
  let capH = Math.round(asc * 0.7), xH = Math.round(asc * 0.5), flags = 0, weight = 400;
  if (tables['OS/2']) {
    const os = tables['OS/2'].off, v = dv.getUint16(os);
    weight = dv.getUint16(os + 4);
    if (v >= 2 && tables['OS/2'].len >= 96) { xH = dv.getInt16(os + 86); capH = dv.getInt16(os + 88); }
  }
  let italicAngle = 0, ulPos = -Math.round(upm * 0.1), ulThick = Math.round(upm * 0.05), fixed = false;
  if (tables.post) {
    const p = tables.post.off;
    italicAngle = dv.getInt32(p + 4) / 65536; ulPos = dv.getInt16(p + 8); ulThick = dv.getInt16(p + 10); fixed = dv.getUint32(p + 12) !== 0;
  }
  const cmap = readCmap(dv, T('cmap'));
  const psName = readName(dv, u8, tables.name && tables.name.off, 6) || 'SlopFont';
  return {
    u8, dv, tables, upm, asc, desc, gap, capH, xH, italicAngle, ulPos, ulThick, bbox, psName, numGlyphs, locFmt, weight, fixed, flags,
    gid: (cp) => cmap.get(cp) || 0,
    has: (cp) => cmap.has(cp),
    adv: (g) => advs[g] || 0,
    cmap,
  };
}

function readCmap(dv, off) {
  const n = dv.getUint16(off + 2), map = new Map();
  let best = null, bestScore = -1;
  for (let i = 0; i < n; i++) {
    const pid = dv.getUint16(off + 4 + i * 8), eid = dv.getUint16(off + 6 + i * 8), so = off + dv.getUint32(off + 8 + i * 8);
    const fmt = dv.getUint16(so);
    const score = fmt === 12 ? 3 : fmt === 4 && (pid === 3 || pid === 0) ? 2 : 0;
    if (score > bestScore && (pid === 3 && (eid === 1 || eid === 10) || pid === 0)) { best = so; bestScore = score; }
  }
  if (best == null) return map;
  const fmt = dv.getUint16(best);
  if (fmt === 4) {
    const segX2 = dv.getUint16(best + 6), ends = best + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
    for (let s = 0; s < segX2 / 2; s++) {
      const end = dv.getUint16(ends + s * 2), start = dv.getUint16(starts + s * 2), delta = dv.getInt16(deltas + s * 2), ro = dv.getUint16(ranges + s * 2);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let g;
        if (!ro) g = (c + delta) & 0xffff;
        else { const gi = ranges + s * 2 + ro + (c - start) * 2; g = dv.getUint16(gi); if (g) g = (g + delta) & 0xffff; }
        if (g) map.set(c, g);
      }
    }
  } else if (fmt === 12) {
    const groups = dv.getUint32(best + 12);
    for (let i = 0; i < groups; i++) {
      const o = best + 16 + i * 12, a = dv.getUint32(o), b = dv.getUint32(o + 4), g0 = dv.getUint32(o + 8);
      for (let c = a; c <= b; c++) map.set(c, g0 + (c - a));
    }
  }
  return map;
}

function readName(dv, u8, off, want) {
  if (off == null) return null;
  const count = dv.getUint16(off + 2), store = off + dv.getUint16(off + 4);
  for (let i = 0; i < count; i++) {
    const r = off + 6 + i * 12;
    if (dv.getUint16(r + 6) !== want) continue;
    const pid = dv.getUint16(r), len = dv.getUint16(r + 8), so = store + dv.getUint16(r + 10);
    let s = '';
    if (pid === 3 || pid === 0) for (let k = 0; k < len; k += 2) s += String.fromCharCode(dv.getUint16(so + k));
    else for (let k = 0; k < len; k++) s += String.fromCharCode(u8[so + k]);
    return s.replace(/[^\x21-\x7e]/g, '');
  }
  return null;
}

function glyphRange(f, g) {
  const loca = f.tables.loca.off, dv = f.dv;
  return f.locFmt ? [dv.getUint32(loca + g * 4), dv.getUint32(loca + g * 4 + 4)] : [dv.getUint16(loca + g * 2) * 2, dv.getUint16(loca + g * 2 + 2) * 2];
}
/** Glyph ids referenced by a composite glyph. */
function components(f, g) {
  const [a, b] = glyphRange(f, g), out = [];
  if (b <= a) return out;
  const dv = f.dv, base = f.tables.glyf.off + a;
  if (dv.getInt16(base) >= 0) return out;
  let p = base + 10;
  for (;;) {
    const flags = dv.getUint16(p), gi = dv.getUint16(p + 2);
    out.push(gi);
    p += 4 + (flags & 1 ? 4 : 2) + (flags & 8 ? 2 : flags & 0x40 ? 4 : flags & 0x80 ? 8 : 0);
    if (!(flags & 0x20)) break;
  }
  return out;
}

const pad4 = (n) => (n + 3) & ~3;
function checksum(u8) {
  let s = 0;
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  for (let i = 0; i < u8.length; i += 4) s = (s + (i + 4 <= u8.length ? dv.getUint32(i) : ((u8[i] << 24) | ((u8[i + 1] || 0) << 16) | ((u8[i + 2] || 0) << 8)) >>> 0)) >>> 0;
  return s;
}

/** A TrueType file holding only the given glyphs (ids unchanged). */
export function subsetTTF(f, gidSet) {
  const keep = new Set([0, ...gidSet]);
  for (const g of [...keep]) { const stack = [g]; while (stack.length) for (const c of components(f, stack.pop())) if (!keep.has(c)) { keep.add(c); stack.push(c); } }
  const parts = [], loca = new Uint32Array(f.numGlyphs + 1);
  let size = 0;
  const glyfOff = f.tables.glyf.off;
  for (let g = 0; g < f.numGlyphs; g++) {
    loca[g] = size;
    if (!keep.has(g)) continue;
    const [a, b] = glyphRange(f, g);
    if (b > a) { const d = f.u8.subarray(glyfOff + a, glyfOff + b); parts.push(d); size += d.length; if (size & 3) { const p = 4 - (size & 3); parts.push(new Uint8Array(p)); size += p; } }
  }
  loca[f.numGlyphs] = size;
  const glyf = new Uint8Array(size); let o = 0; for (const p of parts) { glyf.set(p, o); o += p.length; }
  const locaB = new Uint8Array((f.numGlyphs + 1) * 4), ldv = new DataView(locaB.buffer);
  for (let i = 0; i <= f.numGlyphs; i++) ldv.setUint32(i * 4, loca[i]);
  const copy = (t) => (f.tables[t] ? f.u8.slice(f.tables[t].off, f.tables[t].off + f.tables[t].len) : null);
  const head = copy('head'); new DataView(head.buffer).setInt16(50, 1); new DataView(head.buffer).setUint32(8, 0);
  const out = { head, hhea: copy('hhea'), maxp: copy('maxp'), hmtx: copy('hmtx'), loca: locaB, glyf };
  for (const t of ['cvt ', 'fpgm', 'prep', 'OS/2', 'cmap', 'name']) { const c = copy(t); if (c) out[t] = c; }
  const post = new Uint8Array(32); post.set(copy('post') ? copy('post').subarray(0, 32) : post); new DataView(post.buffer).setUint32(0, 0x00030000); out.post = post;
  const tags = Object.keys(out).sort(), nt = tags.length;
  let off = 12 + nt * 16;
  const total = tags.reduce((s, t) => s + pad4(out[t].length), off);
  const file = new Uint8Array(total), dv = new DataView(file.buffer);
  const es = Math.floor(Math.log2(nt));
  dv.setUint32(0, 0x00010000); dv.setUint16(4, nt); dv.setUint16(6, 16 * 2 ** es); dv.setUint16(8, es); dv.setUint16(10, nt * 16 - 16 * 2 ** es);
  tags.forEach((t, i) => {
    const d = out[t], r = 12 + i * 16;
    for (let k = 0; k < 4; k++) file[r + k] = t.charCodeAt(k);
    dv.setUint32(r + 4, checksum(d)); dv.setUint32(r + 8, off); dv.setUint32(r + 12, d.length);
    file.set(d, off); off += pad4(d.length);
  });
  const headOff = dv.getUint32(12 + tags.indexOf('head') * 16 + 8);
  dv.setUint32(headOff + 8, (0xb1b0afba - checksum(file)) >>> 0);
  return file;
}
