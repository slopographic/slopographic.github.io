/* SlopClean core: WebP (RIFF). Chunks are copied byte for byte. EXIF and XMP chunks are removed (EXIF is rewritten
 * with only the kept tags), the colour profile ICCP is kept unless chosen, the VP8X feature flags are cleared for
 * what is gone and the RIFF size is recalculated. Classic script; sets window.SlopClean.webp. */
(function (root) {
  'use strict';
  const C = (root.SlopClean = root.SlopClean || {});
  const B = C.bytes;
  const FLAG = { EXIF: 0x08, 'XMP ': 0x04, ICCP: 0x20 };

  function isWebp(u8) { return u8.length > 12 && B.ascii(u8, 0, 4) === 'RIFF' && B.ascii(u8, 8, 12) === 'WEBP'; }

  function chunks(u8) {
    const out = [], dv = B.view(u8), end = Math.min(u8.length, 8 + dv.getUint32(4, true));
    let p = 12;
    while (p + 8 <= end) {
      const type = B.ascii(u8, p, p + 4), n = dv.getUint32(p + 4, true), e = p + 8 + n;
      if (e > end) B.fail('Damaged WebP: a chunk runs past the end of the file');
      out.push({ type, s: p, d: p + 8, n, e, pad: n & 1 });
      p = e + (n & 1);
    }
    return out;
  }
  /** EXIF payloads may or may not start with the "Exif\0\0" marker. */
  const exifStart = (u8, ch) => ch.d + (B.startsWith(u8, ch.d, 'Exif\0\0') ? 6 : 0);

  function analyse(u8) {
    const out = [];
    for (const ch of chunks(u8)) {
      if (ch.type === 'EXIF') {
        try { out.push(...C.tiff.fields(C.tiff.parse(u8, { start: exifStart(u8, ch), exifMode: true }))); }
        catch (err) { out.push({ cat: 'embedded', label: 'Unreadable EXIF chunk', value: 'Removed to be safe', where: 'EXIF' }); }
      } else if (ch.type === 'XMP ') {
        out.push(...C.xmp.fields(B.text(u8, ch.d, ch.e)));
        out.push({ cat: 'embedded', label: 'XMP metadata chunk', value: `${ch.n} bytes`, where: 'XMP' });
      } else if (ch.type === 'ICCP') out.push({ cat: 'icc', label: 'Colour profile (ICC)', value: `${ch.n} bytes`, where: 'Colour' });
    }
    return out;
  }

  /** Bytes of one chunk with its pad byte, or null when it is dropped. */
  function chunkBytes(type, data) {
    const head = new Uint8Array(8);
    for (let i = 0; i < 4; i++) head[i] = type.charCodeAt(i);
    new DataView(head.buffer).setUint32(4, data.length, true);
    return B.concat([head, data, data.length & 1 ? Uint8Array.of(0) : new Uint8Array(0)]);
  }

  function strip(u8, remove) {
    const bg = C.tags.blockGone(remove);
    let flags = 0, vp8x = null;
    const parts = [];
    for (const ch of chunks(u8)) {
      const raw = u8.subarray(ch.s, ch.e + ch.pad);
      if (ch.type === 'VP8X') { vp8x = raw.slice(); parts.push(vp8x); continue; }
      let keep = true, body = null;
      if (ch.type === 'EXIF') {
        try {
          body = C.tiff.rewrite(C.tiff.parse(u8, { start: exifStart(u8, ch), exifMode: true }), remove, bg, true);
          if (!C.tiff.countKept(body, true)) keep = false;
        } catch (err) { keep = false; }
      } else if (ch.type === 'XMP ') keep = !bg;
      else if (ch.type === 'ICCP') keep = !remove.icc;
      if (!keep) { flags |= FLAG[ch.type] || 0; continue; }
      parts.push(body ? chunkBytes(ch.type, body) : raw);
    }
    if (vp8x && flags) vp8x[8] &= ~flags;
    const body = B.concat(parts);
    const head = new Uint8Array(12);
    head.set([0x52, 0x49, 0x46, 0x46], 0);
    new DataView(head.buffer).setUint32(4, body.length + 4, true);
    head.set([0x57, 0x45, 0x42, 0x50], 8);
    return { bytes: B.concat([head, body]), notes: [] };
  }

  C.webp = { isWebp, chunks, analyse, strip };
})(typeof window !== 'undefined' ? window : globalThis);
