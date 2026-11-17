/* Camera RAW: the JPEG preview a camera stores inside its RAW file, found without decoding the sensor data (instant).
 * TIFF-based files (CR2, NEF, ARW, DNG, PEF, SRW, 3FR, ORF, RW2): JPEGInterchangeFormat in any IFD, single JPEG strips
 * (DNG and CR2 previews), and the RW2 JpgFromRaw tag. RAF: the JPEG offset in its header. Every other file, and any
 * TIFF whose previews are small, is scanned for embedded JPEGs (CR3 keeps its full-size JPEG and PRVW in ISO-BMFF
 * boxes; CRW and ORF in maker data). Only baseline, extended and progressive JPEGs count: the lossless JPEG that holds
 * the sensor data (SOF3) is skipped. The largest wins. Also reads the camera settings (meta).
 * Pure, no DOM: Node tests require() it; the browser gets window.SlopRawPreview (load tiff.js first).
 *   candidates(bytes) -> [{ start, end, width, height, from }]   every embedded JPEG, largest first
 *   extract(bytes) -> { jpeg: Uint8Array, width, height, orientation } | null
 *   meta(bytes) -> { make, model, date, iso, shutter, aperture, focal, orientation }
 *   jpegAt(bytes, p, limit?) -> { start, end, width, height, sof } | null */
(function (root, factory) {
  const T = root.SlopRawTiff || (typeof require === 'function' ? require('./tiff.js') : null);
  const api = factory(T);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SlopRawPreview = api;
})(typeof window !== 'undefined' ? window : globalThis, function (T) {
  'use strict';
  const BIG_ENOUGH = 1024;   // a structured preview with a long edge this size ends the search; smaller ones scan on
  const ascii = (b, at, n) => (b.length >= at + n ? String.fromCharCode(...b.subarray(at, at + n)) : '');
  /** The offset of an ASCII box name in the first `to` bytes, or -1. */
  function find(b, s, to) {
    for (let p = b.indexOf(s.charCodeAt(0)); p >= 0 && p + s.length <= to; p = b.indexOf(s.charCodeAt(0), p + 1)) if (ascii(b, p, s.length) === s) return p;
    return -1;
  }

  /** The end of a JPEG's entropy-coded data from r: the offset of the next marker (FF followed by not 00, FF or RSTn). */
  function nextMarker(b, r, limit) {
    for (;;) {
      r = b.indexOf(0xff, r);
      if (r < 0 || r + 1 >= limit) return -1;
      const n = b[r + 1];
      if (n === 0x00 || (n >= 0xd0 && n <= 0xd7)) { r += 2; continue; }
      if (n === 0xff) { r++; continue; }
      return r;
    }
  }

  /** A whole JPEG that starts at p, or null. It needs a quantisation table, a lossy frame header and a scan up to EOI. */
  function jpegAt(b, p, limit) {
    const end = Math.min(b.length, limit || b.length);
    if (p < 0 || p + 4 > end || b[p] !== 0xff || b[p + 1] !== 0xd8 || b[p + 2] !== 0xff) return null;
    let q = p + 2, w = 0, h = 0, sof = 0, dqt = false;
    while (q + 4 <= end) {
      if (b[q] !== 0xff) return null;
      const m = b[q + 1];
      if (m === 0xff) { q++; continue; }
      if (m === 0xd9) return null;
      const len = (b[q + 2] << 8) | b[q + 3];
      if (len < 2 || q + 2 + len > end) return null;
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        if (len < 8) return null;
        sof = m; h = (b[q + 5] << 8) | b[q + 6]; w = (b[q + 7] << 8) | b[q + 8];
      }
      if (m === 0xdb) dqt = true;
      if (m === 0xda) {
        if (!dqt || sof < 0xc0 || sof > 0xc2 || w < 16 || h < 16) return null;
        const r = nextMarker(b, q + 2 + len, end);
        if (r < 0) return null;
        if (b[r + 1] === 0xd9) return { start: p, end: r + 2, width: w, height: h, sof };
        q = r;   // a progressive JPEG: more tables and scans follow
        continue;
      }
      q += 2 + len;
    }
    return null;
  }

  /** JPEGs the TIFF structure points at (base: where the TIFF header is). */
  function fromTiff(b, base) {
    if (!T || !T.header(b, base)) return [];
    const out = [];
    const add = (off, len, from) => { if (off > 0) { const j = jpegAt(b, off, len ? off + len : 0); if (j) out.push({ ...j, from }); } };
    for (const d of T.ifds(b, base)) {
      const at = T.value(b, d, 0x0201), len = T.value(b, d, 0x0202);
      if (typeof at === 'number') add(base + at, len, 'JPEGInterchangeFormat');
      const comp = T.value(b, d, 0x0103), so = T.value(b, d, 0x0111), sc = T.value(b, d, 0x0117);
      if ((comp === 6 || comp === 7) && typeof so === 'number') add(base + so, sc, 'strip');
      const jfr = d.tags.get(0x002e);   // Panasonic RW2: JpgFromRaw, the JPEG is the value itself
      if (jfr && !jfr.cut) add(jfr.pos, jfr.count, 'JpgFromRaw');
    }
    return out;
  }

  /** Every JPEG in the file, in order (a found JPEG is skipped over, so its own EXIF thumbnail is not listed). */
  function scan(b) {
    const out = [];
    for (let p = b.indexOf(0xff); p >= 0 && p + 3 < b.length; p = b.indexOf(0xff, p + 1)) {
      if (b[p + 1] !== 0xd8 || b[p + 2] !== 0xff) continue;
      const j = jpegAt(b, p);
      if (j) { out.push({ ...j, from: 'scan' }); p = j.end - 1; }
    }
    return out;
  }

  const area = (j) => j.width * j.height;
  function candidates(bytes) {
    if (!bytes || bytes.length < 16) return [];
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let list = [];
    if (ascii(b, 0, 15) === 'FUJIFILMCCD-RAW' && b.length > 92) {
      const v = new DataView(b.buffer, b.byteOffset, b.byteLength), off = v.getUint32(84), len = v.getUint32(88);
      const j = jpegAt(b, off, off + len);
      if (j) list.push({ ...j, from: 'RAF header' });
    } else list = fromTiff(b, 0);
    const best = list.reduce((m, j) => Math.max(m, j.width, j.height), 0);
    if (best < BIG_ENOUGH) {
      const seen = new Set(list.map((j) => j.start));
      for (const j of scan(b)) if (!seen.has(j.start)) list.push(j);
    }
    return list.sort((x, y) => area(y) - area(x));
  }

  /** The TIFF inside a JPEG's EXIF segment (APP1 "Exif\0\0"), as an offset into b, or -1. */
  function exifTiffIn(b, j) {
    let q = j.start + 2;
    while (q + 10 < j.end && b[q] === 0xff) {
      const m = b[q + 1], len = (b[q + 2] << 8) | b[q + 3];
      if (m === 0xe1 && ascii(b, q + 4, 6) === 'Exif\0\0') return q + 10;
      if (m === 0xda) break;
      q += 2 + len;
    }
    return -1;
  }

  const EMPTY = { make: '', model: '', date: '', iso: 0, shutter: 0, aperture: 0, focal: 0, orientation: 1 };
  /** Camera settings: the RAW's own TIFF, CR3's CMT1 and CMT2 boxes, or the EXIF of the embedded JPEG. */
  function meta(bytes) {
    if (!bytes || bytes.length < 16 || !T) return { ...EMPTY };
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const fill = (m, more) => { for (const k of Object.keys(EMPTY)) if (!m[k] || (k === 'orientation' && m[k] === 1 && more[k] > 1)) m[k] = more[k] || m[k]; return m; };
    let m = { ...EMPTY };
    if (T.header(b, 0)) m = fill(m, T.meta(b, 0));
    if (ascii(b, 4, 8) === 'ftypcrx ') {
      for (const box of ['CMT1', 'CMT2']) { const at = find(b, box, Math.min(b.length, 65536)); if (at > 0 && T.header(b, at + 4)) m = fill(m, T.meta(b, at + 4)); }
    }
    if (!m.make || !m.date) {
      const j = candidates(b)[0];
      const at = j ? exifTiffIn(b, j) : -1;
      if (at > 0) m = fill(m, T.meta(b, at));
    }
    return m;
  }

  /** The largest embedded JPEG, with its size and the orientation to draw it upright. */
  function extract(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    const j = candidates(b)[0];
    if (!j) return null;
    return { jpeg: b.subarray(j.start, j.end), width: j.width, height: j.height, orientation: meta(b).orientation };
  }

  return { candidates, extract, meta, jpegAt, scan };
});
