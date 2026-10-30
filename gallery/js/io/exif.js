/* Slop Gallery: EXIF reader, written by hand from the JPEG APP1 segment (no library).
 * Reads DateTimeOriginal (falls back to DateTimeDigitized, then DateTime), Orientation (1-8),
 * camera Make and Model. Every read is bounds-checked: a broken file yields partial data, never a throw.
 * Classic script, exposes window.SlopGallery.exif.read(arrayBuffer) -> { takenAt, make, model, orientation }. */
(function () {
  'use strict';
  const G = (window.SlopGallery = window.SlopGallery || {});
  const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  const TAG = { Make: 0x010f, Model: 0x0110, Orientation: 0x0112, DateTime: 0x0132, ExifIFD: 0x8769, DateTimeOriginal: 0x9003, DateTimeDigitized: 0x9004 };

  /** Reads one IFD into a Map of tag -> { type, count, at } where `at` is the absolute offset of the value bytes. */
  function readIfd(dv, base, little, ifdOff) {
    const out = new Map();
    const u16 = (o) => dv.getUint16(o, little), u32 = (o) => dv.getUint32(o, little);
    const n = u16(base + ifdOff);
    for (let i = 0; i < n; i++) {
      const e = base + ifdOff + 2 + i * 12;
      const tag = u16(e), type = u16(e + 2), count = u32(e + 4), size = (TYPE_SIZE[type] || 0) * count;
      if (!size) continue;
      const at = size <= 4 ? e + 8 : base + u32(e + 8);
      out.set(tag, { type, count, at });
    }
    return out;
  }
  function readString(dv, f) {
    if (!f || f.type !== 2) return '';
    let s = '';
    for (let i = 0; i < f.count; i++) { const c = dv.getUint8(f.at + i); if (!c) break; s += String.fromCharCode(c); }
    return s.trim();
  }
  function readShort(dv, f, little) {
    return f && f.type === 3 ? dv.getUint16(f.at, little) : null;
  }
  /** "2019:07:04 12:34:56" → local time in ms, or null. EXIF carries no zone, so it is read as local time. */
  function parseExifDate(s) {
    const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(s || '');
    if (!m) return null;
    const [y, mo, d, h, mi, se] = m.slice(1).map(Number);
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 60) return null;
    const t = new Date(y, mo - 1, d, h, mi, se).getTime();
    return Number.isFinite(t) ? t : null;
  }

  function parseTiff(dv, base) {
    const bom = dv.getUint16(base, false);
    const little = bom === 0x4949;
    if (!little && bom !== 0x4d4d) return {};
    if (dv.getUint16(base + 2, little) !== 42) return {};
    const ifd0 = readIfd(dv, base, little, dv.getUint32(base + 4, little));
    const out = { make: readString(dv, ifd0.get(TAG.Make)), model: readString(dv, ifd0.get(TAG.Model)), orientation: readShort(dv, ifd0.get(TAG.Orientation), little) };
    let exif = new Map();
    const exifPtr = ifd0.get(TAG.ExifIFD);
    if (exifPtr && exifPtr.type === 4) exif = readIfd(dv, base, little, dv.getUint32(exifPtr.at, little));
    const dateStr = readString(dv, exif.get(TAG.DateTimeOriginal)) || readString(dv, exif.get(TAG.DateTimeDigitized)) || readString(dv, ifd0.get(TAG.DateTime));
    out.takenAt = parseExifDate(dateStr);
    return out;
  }

  /** Finds the Exif APP1 segment in a JPEG and parses it. Non-JPEG or missing EXIF gives {}. */
  function read(buffer) {
    try {
      const dv = new DataView(buffer);
      if (buffer.byteLength < 4 || dv.getUint16(0, false) !== 0xffd8) return {};
      let off = 2;
      while (off + 4 <= buffer.byteLength) {
        const marker = dv.getUint16(off, false);
        if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) break; // SOS: image data starts, no more metadata
        const len = dv.getUint16(off + 2, false);
        if (len < 2) break;
        if (marker === 0xffe1 && off + 10 <= buffer.byteLength) {
          const hdr = String.fromCharCode(...new Uint8Array(buffer, off + 4, 6));
          if (hdr === 'Exif\u0000\u0000') return parseTiff(dv, off + 10);
        }
        off += 2 + len;
      }
    } catch (e) { /* truncated or malformed: no EXIF */ }
    return {};
  }

  G.exif = { read, parseExifDate };
})();
