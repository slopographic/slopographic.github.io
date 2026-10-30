/* Slop Gallery test helpers: real JPEG bytes with a hand-built EXIF APP1 block, an independent CRC-32 reference,
 * fresh test databases, and small blobs for bulk fixtures. Exposes window.GT. */
(function () {
  'use strict';
  const GT = (window.GT = {});

  /** Builds a TIFF/EXIF block (little-endian) with Make, Model, Orientation and DateTimeOriginal. */
  function exifPayload({ make, model, orientation, date }) {
    const enc = new TextEncoder();
    const ifd0 = [], exif = [];
    const ascii = (s) => enc.encode(s + '\0');
    if (make) ifd0.push({ tag: 0x010f, type: 2, bytes: ascii(make) });
    if (model) ifd0.push({ tag: 0x0110, type: 2, bytes: ascii(model) });
    if (orientation) ifd0.push({ tag: 0x0112, type: 3, short: orientation });
    ifd0.push({ tag: 0x8769, type: 4, long: 0 }); // patched to the Exif IFD offset below
    if (date) exif.push({ tag: 0x9003, type: 2, bytes: ascii(date) });
    ifd0.sort((a, b) => a.tag - b.tag);
    const ifd0Off = 8, ifd0Size = 2 + ifd0.length * 12 + 4;
    const exifOff = ifd0Off + ifd0Size, exifSize = 2 + exif.length * 12 + 4;
    let cursor = exifOff + exifSize;
    const data = [];
    const place = (bytes) => { const at = cursor; data.push(bytes); cursor += bytes.length + (bytes.length & 1); return at; };
    for (const e of ifd0) if (e.bytes && e.bytes.length > 4) e.at = place(e.bytes);
    for (const e of exif) if (e.bytes.length > 4) e.at = place(e.bytes);
    const total = cursor;
    const buf = new Uint8Array(total), dv = new DataView(buf.buffer);
    dv.setUint16(0, 0x4949, false); dv.setUint16(2, 42, true); dv.setUint32(4, ifd0Off, true);
    const writeIfd = (off, entries) => {
      dv.setUint16(off, entries.length, true);
      entries.forEach((e, i) => {
        const p = off + 2 + i * 12;
        dv.setUint16(p, e.tag, true); dv.setUint16(p + 2, e.type, true);
        const count = e.type === 2 ? e.bytes.length : 1;
        dv.setUint32(p + 4, count, true);
        if (e.type === 2) { if (e.bytes.length <= 4) buf.set(e.bytes, p + 8); else dv.setUint32(p + 8, e.at, true); }
        else if (e.type === 3) dv.setUint16(p + 8, e.short, true);
        else if (e.type === 4) dv.setUint32(p + 8, exifOff, true);
      });
      dv.setUint32(off + 2 + entries.length * 12, 0, true);
    };
    writeIfd(ifd0Off, ifd0);
    writeIfd(exifOff, exif);
    let at = exifOff + exifSize;
    for (const d of data) { buf.set(d, at); at += d.length + (d.length & 1); }
    return buf;
  }

  /** Inserts an APP1 Exif segment straight after the SOI marker of a JPEG. */
  function injectExif(jpeg, meta) {
    const tiff = exifPayload(meta);
    const head = [0x45, 0x78, 0x69, 0x66, 0, 0];
    const payload = new Uint8Array(head.length + tiff.length);
    payload.set(head, 0); payload.set(tiff, head.length);
    const len = payload.length + 2;
    const seg = new Uint8Array(4 + payload.length);
    seg.set([0xff, 0xe1, (len >> 8) & 0xff, len & 0xff], 0); seg.set(payload, 4);
    const out = new Uint8Array(jpeg.length + seg.length);
    out.set(jpeg.subarray(0, 2), 0); out.set(seg, 2); out.set(jpeg.subarray(2), 2 + seg.length);
    return out;
  }

  /** A real JPEG (canvas-encoded) of w x h with a colour pattern, optionally carrying an EXIF block. */
  async function jpegBytes(w, h, { colour = '#3a7bd5', exif = null } = {}) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, colour); g.addColorStop(1, '#f2c14e');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#111'; ctx.fillRect(w * 0.1, h * 0.1, w * 0.2, h * 0.2);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.9));
    const raw = new Uint8Array(await blob.arrayBuffer());
    return exif ? injectExif(raw, exif) : raw;
  }
  const jpegFile = async (name, w, h, opts = {}) => new File([await jpegBytes(w, h, opts)], name, { type: 'image/jpeg', lastModified: opts.modified || Date.UTC(2020, 0, 2) });

  /** CRC-32 written from the definition, independent of the app's own table. */
  function crc32Ref(bytes) {
    let crc = 0xffffffff;
    for (const b of bytes) {
      crc ^= b;
      for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
  /** A fresh, empty library database name for each test page. */
  GT.dbName = 'gallery-test-' + Math.random().toString(36).slice(2, 8);
  async function freshLibrary() {
    await SlopGallery.db.destroy();
    SlopGallery.library._reset();
    await SlopGallery.library.load();
    return SlopGallery.library;
  }
  /** Small blob of n bytes for fixtures (thumbnails and originals in bulk tests). */
  const blobOf = (n, type = 'image/jpeg') => new Blob([new Uint8Array(n).fill(7)], { type });
  /** A fake 64-hex hash for index n. */
  const shaOf = (n) => n.toString(16).padStart(64, '0');

  Object.assign(GT, { exifPayload, injectExif, jpegBytes, jpegFile, crc32Ref, freshLibrary, blobOf, shaOf });
})();
