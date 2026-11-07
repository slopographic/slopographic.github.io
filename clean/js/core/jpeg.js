/* SlopClean core: JPEG. The file is split into marker segments and entropy-coded picture data. Segments are copied
 * byte for byte, except the metadata ones: APP1 (EXIF, XMP), APP2 multi-picture, APP13 (Photoshop, IPTC), other APPn,
 * COM, the JFXX thumbnail and any data after the end of the picture. The colour profile (APP2 ICC) and the JFIF and
 * Adobe headers that decoders need are kept. The picture data is never re-encoded. Classic script; sets window.SlopClean.jpeg. */
(function (root) {
  'use strict';
  const C = (root.SlopClean = root.SlopClean || {});
  const B = C.bytes;
  const EXIF_ID = 'Exif\0\0', XMP_ID = 'http://ns.adobe.com/xap/1.0/\0', XMPX_ID = 'http://ns.adobe.com/xmp/extension/\0';
  const ICC_ID = 'ICC_PROFILE\0', MPF_ID = 'MPF\0';

  function isJpeg(u8) { return u8.length > 3 && u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff; }

  /** Split the file into segments { m (marker or null for picture data), s, e, d (payload start) } and the tail after EOI. */
  function segments(u8) {
    const segs = [], n = u8.length;
    let pos = 2, eoi = -1;
    while (pos < n) {
      if (u8[pos] !== 0xff) break;
      let p = pos;
      while (p < n && u8[p] === 0xff) p++;
      if (p >= n) break;
      const m = u8[p], s = pos;
      pos = p + 1;
      if (m === 0xd9) { segs.push({ m, s, e: pos, d: pos }); eoi = pos; break; }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { segs.push({ m, s, e: pos, d: pos }); continue; }
      if (pos + 2 > n) break;
      const len = (u8[pos] << 8) | u8[pos + 1];
      if (len < 2 || pos + len > n) break;
      const e = pos + len;
      segs.push({ m, s, e, d: pos + 2 });
      pos = e;
      if (m === 0xda) {
        let q = e;
        while (q < n) {
          if (u8[q] !== 0xff) { q++; continue; }
          const nx = u8[q + 1];
          if (nx === 0 || nx === 0xff || (nx >= 0xd0 && nx <= 0xd7)) { q++; continue; }
          break;
        }
        if (q > e) segs.push({ m: null, s: e, e: q, d: e });
        pos = q;
      }
    }
    if (eoi < 0 && pos < n) segs.push({ m: null, s: pos, e: n, d: pos });
    return { segs, tail: eoi >= 0 && eoi < n ? { s: eoi, e: n } : null };
  }

  /** What a segment is: struct (kept), exif, xmp, icc, cat (one category), or block (XMP-style, goes with personal data). */
  function classify(u8, sg) {
    const m = sg.m;
    if (m === null) return { kind: 'struct' };
    if (m === 0xe1) {
      if (B.startsWith(u8, sg.d, EXIF_ID)) return { kind: 'exif' };
      if (B.startsWith(u8, sg.d, XMP_ID) || B.startsWith(u8, sg.d, XMPX_ID)) return { kind: 'xmp' };
      return { kind: 'block', label: 'Application data (APP1)' };
    }
    if (m === 0xe0) return B.startsWith(u8, sg.d, 'JFXX\0') ? { kind: 'cat', cat: 'thumbnail', label: 'Thumbnail picture (JFXX)' } : { kind: 'struct' };
    if (m === 0xe2) {
      if (B.startsWith(u8, sg.d, ICC_ID)) return { kind: 'icc' };
      return { kind: 'block', label: B.startsWith(u8, sg.d, MPF_ID) ? 'Multi-picture (MPF) data' : 'Application data (APP2)' };
    }
    if (m === 0xed) return { kind: 'block', label: 'Photoshop and IPTC data (APP13)' };
    if (m === 0xee) return { kind: 'struct' };
    if (m === 0xfe) return { kind: 'cat', cat: 'description', label: 'JPEG comment' };
    if (m >= 0xe3 && m <= 0xef) return { kind: 'block', label: `Application data (APP${m - 0xe0})` };
    return { kind: 'struct' };
  }

  /** Parse the EXIF payload of a segment. Returns the tree, or throws when it cannot be read. */
  const exifTree = (u8, sg) => C.tiff.parse(u8, { start: sg.d + 6, exifMode: true });

  function analyse(u8) {
    const { segs, tail } = segments(u8), out = [];
    for (const sg of segs) {
      if (sg.m === null) continue;
      const c = classify(u8, sg);
      if (c.kind === 'exif') {
        try { out.push(...C.tiff.fields(exifTree(u8, sg))); }
        catch (err) { out.push({ cat: 'embedded', label: 'Unreadable EXIF block', value: 'Removed to be safe', where: 'EXIF' }); }
      } else if (c.kind === 'xmp') {
        const id = B.startsWith(u8, sg.d, XMP_ID) ? XMP_ID : XMPX_ID;
        out.push(...C.xmp.fields(B.text(u8, sg.d + id.length, sg.e)));
        out.push({ cat: 'embedded', label: 'XMP metadata packet', value: `${sg.e - sg.d} bytes`, where: 'XMP' });
      } else if (c.kind === 'block') out.push({ cat: 'embedded', label: c.label, value: `${sg.e - sg.d} bytes`, where: 'Application data' });
      else if (c.kind === 'cat') out.push({ cat: c.cat, label: c.label, value: 'present', where: 'Comment' });
      else if (c.kind === 'icc') out.push({ cat: 'icc', label: 'Colour profile (ICC)', value: `${sg.e - sg.d} bytes`, where: 'Colour' });
    }
    if (tail) out.push({ cat: 'embedded', label: 'Data after the end of the picture', value: `${tail.e - tail.s} bytes`, where: 'File end' });
    return out;
  }

  /** The rewritten APP1 segment for an EXIF block, or null when nothing is left (or it cannot be read). */
  function exifSegment(u8, sg, remove, bg) {
    let body;
    try {
      body = C.tiff.rewrite(exifTree(u8, sg), remove, bg, true);
      if (!C.tiff.countKept(body, true)) return null;
    } catch (err) { return null; }
    const payload = B.concat([Uint8Array.from(EXIF_ID, (ch) => ch.charCodeAt(0)), body]);
    const len = payload.length + 2;
    if (len > 0xffff) return null;
    return B.concat([Uint8Array.of(0xff, 0xe1, len >> 8, len & 255), payload]);
  }

  function strip(u8, remove) {
    const bg = C.tags.blockGone(remove);
    const { segs, tail } = segments(u8);
    const parts = [u8.subarray(0, 2)], notes = [];
    for (const sg of segs) {
      const seg = u8.subarray(sg.s, sg.e);
      if (sg.m === null) { parts.push(seg); continue; }
      const c = classify(u8, sg);
      if (c.kind === 'struct') parts.push(seg);
      else if (c.kind === 'icc') { if (!remove.icc) parts.push(seg); }
      else if (c.kind === 'cat') { if (!remove[c.cat]) parts.push(seg); }
      else if (c.kind === 'block' || c.kind === 'xmp') { if (!bg) parts.push(seg); }
      else if (c.kind === 'exif') { const rw = exifSegment(u8, sg, remove, bg); if (rw) parts.push(rw); }
    }
    if (tail) notes.push(`Removed ${tail.e - tail.s} bytes of data after the end of the picture`);
    return { bytes: B.concat(parts), notes };
  }

  C.jpeg = { isJpeg, segments, analyse, strip };
})(typeof window !== 'undefined' ? window : globalThis);
