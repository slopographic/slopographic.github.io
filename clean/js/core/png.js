/* SlopClean core: PNG. The file is a list of chunks; each one is copied byte for byte (CRC included) unless it is
 * metadata: tEXt, zTXt and iTXt (by keyword: author, copyright, software, description...), tIME, eXIf (rewritten
 * with only the kept tags), iCCP (colour profile, kept unless chosen), pHYs (DPI, kept unless chosen) and unknown
 * ancillary chunks. Image chunks (IHDR, PLTE, IDAT, IEND, tRNS, gAMA, cHRM, sRGB, bKGD, sBIT, APNG chunks...) are kept.
 * Classic script; sets window.SlopClean.png. */
(function (root) {
  'use strict';
  const C = (root.SlopClean = root.SlopClean || {});
  const B = C.bytes;
  const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
  const KEEP = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'sBIT', 'bKGD', 'hIST', 'sPLT',
    'acTL', 'fcTL', 'fdAT', 'cICP', 'mDCv', 'cLLI']);
  const KEYWORD_CAT = { Author: 'author', Copyright: 'copyright', Software: 'software', 'Creation Time': 'date',
    Description: 'description', Comment: 'description', Title: 'description', Disclaimer: 'description',
    Warning: 'description', Keywords: 'description', Source: 'other' };

  function isPng(u8) { return u8.length > 8 && SIG.every((b, i) => u8[i] === b); }

  function chunks(u8) {
    const out = [], dv = B.view(u8);
    let p = 8;
    while (p + 8 <= u8.length) {
      const len = dv.getUint32(p, false), type = B.ascii(u8, p + 4, p + 8), e = p + 12 + len;
      if (e > u8.length) B.fail('Damaged PNG: a chunk runs past the end of the file');
      out.push({ type, s: p, d: p + 8, n: len, e });
      p = e;
      if (type === 'IEND') break;
    }
    return out;
  }

  const nul = (u8, s, e) => { for (let i = s; i < e; i++) if (u8[i] === 0) return i; return -1; };

  /** Keyword, text (or a note for compressed text) and category of a text chunk. */
  function textOf(u8, ch) {
    const z = nul(u8, ch.d, ch.e);
    if (z < 0) return { kw: B.ascii(u8, ch.d, ch.e), text: '', cat: 'other' };
    const kw = B.ascii(u8, ch.d, z), cat = KEYWORD_CAT[kw] || 'description';
    if (ch.type === 'tEXt') return { kw, text: B.ascii(u8, z + 1, ch.e), cat };
    if (ch.type === 'zTXt') return { kw, text: '(compressed text)', cat };
    const compressed = u8[z + 1] === 1;
    const lang = nul(u8, z + 3, ch.e), tr = lang < 0 ? -1 : nul(u8, lang + 1, ch.e);
    const body = tr < 0 ? ch.e : tr + 1;
    return { kw: B.text(u8, ch.d, z), text: compressed ? '(compressed text)' : B.text(u8, body, ch.e), cat };
  }

  /** What a chunk is: { kind: 'struct' | 'exif' | 'xmp' | 'icc' | 'cat' | 'block', cat?, label? }. */
  function classify(u8, ch) {
    const t = ch.type;
    if (t === 'eXIf') return { kind: 'exif' };
    if (t === 'tEXt' || t === 'zTXt' || t === 'iTXt') {
      const tx = textOf(u8, ch);
      if (tx.kw === 'XML:com.adobe.xmp') return { kind: 'xmp' };
      return { kind: 'cat', cat: tx.cat, label: `Text: ${tx.kw}`, text: tx.text };
    }
    if (t === 'tIME') return { kind: 'cat', cat: 'date', label: 'Last modified time' };
    if (t === 'pHYs') return { kind: 'cat', cat: 'physical', label: 'Pixel density (DPI)' };
    if (t === 'iCCP') return { kind: 'icc' };
    if (KEEP.has(t)) return { kind: 'struct' };
    if (/^[a-z]/.test(t)) return { kind: 'cat', cat: 'other', label: `Unknown chunk ${t}` };
    return { kind: 'struct' };
  }

  /** A whole chunk (length, type, data, CRC) with a CRC over the type and data. */
  function makeChunk(type, data) {
    const t = Uint8Array.from(type, (c) => c.charCodeAt(0));
    return B.concat([B.be32(data.length), t, data, B.be32(B.crc32(B.concat([t, data])))]);
  }

  function analyse(u8) {
    const out = [];
    for (const ch of chunks(u8)) {
      const c = classify(u8, ch);
      if (c.kind === 'exif') {
        try { out.push(...C.tiff.fields(C.tiff.parse(u8, { start: ch.d, exifMode: true }))); }
        catch (err) { out.push({ cat: 'embedded', label: 'Unreadable EXIF chunk', value: 'Removed to be safe', where: 'EXIF' }); }
      } else if (c.kind === 'xmp') {
        const tx = textOf(u8, ch);
        out.push(...C.xmp.fields(tx.text));
        out.push({ cat: 'embedded', label: 'XMP metadata (text chunk)', value: `${ch.n} bytes`, where: 'XMP' });
      } else if (c.kind === 'cat') out.push({ cat: c.cat, label: c.label, value: c.text ? c.text.slice(0, 160) : `${ch.n} bytes`, where: 'Text' });
      else if (c.kind === 'icc') out.push({ cat: 'icc', label: 'Colour profile (ICC)', value: `${ch.n} bytes`, where: 'Colour' });
    }
    return out;
  }

  function strip(u8, remove) {
    const bg = C.tags.blockGone(remove);
    const parts = [u8.subarray(0, 8)];
    for (const ch of chunks(u8)) {
      const raw = u8.subarray(ch.s, ch.e), c = classify(u8, ch);
      if (c.kind === 'struct') parts.push(raw);
      else if (c.kind === 'icc') { if (!remove.icc) parts.push(raw); }
      else if (c.kind === 'cat') { if (!remove[c.cat]) parts.push(raw); }
      else if (c.kind === 'xmp') { if (!bg) parts.push(raw); }
      else if (c.kind === 'exif') {
        try {
          const body = C.tiff.rewrite(C.tiff.parse(u8, { start: ch.d, exifMode: true }), remove, bg, true);
          if (C.tiff.countKept(body, true)) parts.push(makeChunk('eXIf', body));
        } catch (err) { /* unreadable: dropped */ }
      }
    }
    return { bytes: B.concat(parts), notes: [] };
  }

  C.png = { isPng, chunks, analyse, strip };
})(typeof window !== 'undefined' ? window : globalThis);
