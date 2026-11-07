/* Camera RAW: a small, bounds-checked TIFF reader shared by detection (detect.js) and preview extraction (preview.js).
 * Most RAW formats are TIFF inside (CR2, NEF, ARW, DNG, PEF, SRW, 3FR, ORF and RW2 with their own first bytes).
 * Reads the IFD chain, SubIFDs and the EXIF IFD; never follows a loop; a broken file gives fewer entries, never a throw.
 * Also reads the camera settings (make, model, date, ISO, shutter, aperture, focal length, orientation) from the IFDs.
 * Pure, no DOM: Node tests require() it; the browser gets window.SlopRawTiff.
 *   header(bytes, at?) -> { le, first, at } | null          a TIFF header at offset at (0 by default); ORF and RW2 magics too
 *   ifds(bytes, at?) -> [ifd]                                 every IFD reached; ifd = { off, kind, tags: Map(tag -> entry) }
 *   value(bytes, ifd, tag) -> number | number[] | string | null
 *   meta(bytes, at?) -> { make, model, date, iso, shutter, aperture, focal, orientation, dng }   ('' / 0 when missing) */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SlopRawTiff = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 13: 4 };
  const T = { SubIFDs: 0x014a, ExifIFD: 0x8769, Make: 0x010f, Model: 0x0110, Orientation: 0x0112, DateTime: 0x0132, DateTimeOriginal: 0x9003,
    ISO: 0x8827, Exposure: 0x829a, FNumber: 0x829d, Focal: 0x920a, DNGVersion: 0xc612 };
  const MAX_IFDS = 64, MAX_ENTRIES = 1000;

  function dv(bytes) { return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }

  /** The TIFF header at `at`: II or MM, then 42 (TIFF), 0x4f52 / 0x5352 (ORF) or 0x55 (RW2). */
  function header(bytes, at = 0) {
    if (!bytes || bytes.length < at + 8) return null;
    const a = bytes[at], b = bytes[at + 1];
    if (!((a === 0x49 && b === 0x49) || (a === 0x4d && b === 0x4d))) return null;
    const le = a === 0x49, v = dv(bytes), magic = v.getUint16(at + 2, le);
    if (![42, 0x4f52, 0x5352, 0x55].includes(magic)) return null;
    return { le, first: v.getUint32(at + 4, le), at, magic };
  }

  /** One IFD at base + off: its entries, each { type, count, pos } with pos the absolute offset of the value. */
  function readIfd(bytes, v, base, off, le) {
    const p = base + off;
    if (off < 8 || p + 2 > bytes.length) return null;
    const n = v.getUint16(p, le);
    if (!n || n > MAX_ENTRIES || p + 2 + n * 12 > bytes.length) return null;
    const tags = new Map();
    for (let i = 0; i < n; i++) {
      const e = p + 2 + i * 12, type = v.getUint16(e + 2, le), count = v.getUint32(e + 4, le), size = (SIZE[type] || 0) * count;
      if (!size) continue;
      const pos = size <= 4 ? e + 8 : base + v.getUint32(e + 8, le);
      if (pos + size > bytes.length && size > 4) { tags.set(v.getUint16(e, le), { type, count, pos, cut: true }); continue; }
      tags.set(v.getUint16(e, le), { type, count, pos });
    }
    const nextAt = p + 2 + n * 12;
    return { off, tags, next: nextAt + 4 <= bytes.length ? v.getUint32(nextAt, le) : 0 };
  }

  /** A tag's value: a string for ASCII, a number for one value, an array for several (at most 256 read). */
  function value(bytes, ifd, tag, le) {
    const e = ifd && ifd.tags.get(tag);
    if (!e || e.cut) return null;
    const v = dv(bytes), L = le != null ? le : ifd.le;
    if (e.type === 2) { let s = ''; for (let i = 0; i < e.count && e.pos + i < bytes.length; i++) { const c = bytes[e.pos + i]; if (!c) break; s += String.fromCharCode(c); } return s.trim(); }
    const one = (i) => {
      const at = e.pos + i * SIZE[e.type];
      switch (e.type) {
        case 1: case 7: return bytes[at];
        case 3: return v.getUint16(at, L);
        case 4: case 13: return v.getUint32(at, L);
        case 8: return v.getInt16(at, L);
        case 9: return v.getInt32(at, L);
        case 5: { const d = v.getUint32(at + 4, L); return d ? v.getUint32(at, L) / d : 0; }
        case 10: { const d = v.getInt32(at + 4, L); return d ? v.getInt32(at, L) / d : 0; }
        default: return null;
      }
    };
    if (e.count === 1) return one(0);
    const out = [];
    for (let i = 0; i < Math.min(e.count, 256); i++) out.push(one(i));
    return out;
  }

  /** Every IFD reachable from the header at `at`: the main chain, SubIFDs and the EXIF IFD. kind: 'ifd0', 'ifd', 'sub', 'exif'. */
  function ifds(bytes, at = 0) {
    const h = header(bytes, at);
    if (!h) return [];
    const v = dv(bytes), out = [], seen = new Set();
    const queue = [[h.first, 'ifd0']];
    while (queue.length && out.length < MAX_IFDS) {
      const [off, kind] = queue.shift();
      if (!off || seen.has(off)) continue;
      seen.add(off);
      const ifd = readIfd(bytes, v, at, off, h.le);
      if (!ifd) continue;
      ifd.kind = kind; ifd.le = h.le; ifd.base = at;
      out.push(ifd);
      const sub = value(bytes, ifd, T.SubIFDs);
      for (const s of [].concat(sub == null ? [] : sub)) queue.push([s, 'sub']);
      const ex = value(bytes, ifd, T.ExifIFD);
      if (typeof ex === 'number') queue.push([ex, 'exif']);
      if (kind === 'ifd0' || kind === 'ifd') queue.push([ifd.next, 'ifd']);
      if (kind === 'sub' && ifd.next) queue.push([ifd.next, 'sub']);
    }
    return out;
  }

  /** "2024:05:06 07:08:09" -> ISO-like local time string "2024-05-06T07:08:09", or ''. */
  function exifDate(s) {
    const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(s || ''));
    return m && m[1] !== '0000' ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` : '';
  }

  /** The camera settings from the IFDs, with '' or 0 for what is missing. */
  function meta(bytes, at = 0) {
    const list = ifds(bytes, at);
    const first = (tag) => { for (const d of list) { const x = value(bytes, d, tag); if (x != null && x !== '') return x; } return null; };
    const num = (x) => (Array.isArray(x) ? x[0] : x) || 0;
    const ifd0 = list.find((d) => d.kind === 'ifd0');
    const o = ifd0 ? value(bytes, ifd0, T.Orientation) : null;
    return {
      make: String(first(T.Make) || '').trim(), model: String(first(T.Model) || '').trim(),
      date: exifDate(first(T.DateTimeOriginal) || first(T.DateTime)),
      iso: num(first(T.ISO)), shutter: num(first(T.Exposure)), aperture: num(first(T.FNumber)), focal: num(first(T.Focal)),
      orientation: o >= 1 && o <= 8 ? o : 1, dng: !!first(T.DNGVersion),
    };
  }

  return { header, ifds, value, meta, exifDate, TAG: T };
});
