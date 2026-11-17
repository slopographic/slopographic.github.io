/* SlopClean core: the entry point. detect() names the format from its first bytes; inspect() lists what the file
 * holds (plain findings: category, label, value, where); strip() returns a copy with the chosen categories removed
 * and re-checks it. Formats: JPEG, PNG, WebP and TIFF. HEIC/HEIF/AVIF and RAW are reported as unsupported.
 * Classic script, no dependencies. Sets window.SlopClean (Node: globalThis.SlopClean):
 *   SlopClean.inspect(u8)            -> { format, label, supported, findings, notes }
 *   SlopClean.strip(u8, { remove })  -> { format, bytes, before, after, notes }   remove: { category: true|false }
 *   SlopClean.summary(findings)      -> { category: count }
 *   SlopClean.detect(u8), SlopClean.CATS, SlopClean.resolve(remove) */
(function (root) {
  'use strict';
  const C = (root.SlopClean = root.SlopClean || {});
  const B = C.bytes;
  const LABEL = { jpeg: 'JPEG', png: 'PNG', webp: 'WebP', tiff: 'TIFF' };
  const MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', tiff: 'image/tiff' };
  const EXT = { jpeg: 'jpg', png: 'png', webp: 'webp', tiff: 'tif' };

  /** The format of a file from its first bytes: jpeg, png, webp, tiff, heic (HEIC/HEIF), avif, or null. */
  function detect(u8) {
    if (!u8 || u8.length < 12) return null;
    if (C.jpeg.isJpeg(u8)) return 'jpeg';
    if (C.png.isPng(u8)) return 'png';
    if (C.webp.isWebp(u8)) return 'webp';
    if ((u8[0] === 0x49 && u8[1] === 0x49 && u8[2] === 42 && u8[3] === 0) || (u8[0] === 0x4d && u8[1] === 0x4d && u8[2] === 0 && u8[3] === 42)) return 'tiff';
    if (B.ascii(u8, 4, 8) === 'ftyp') return B.ascii(u8, 8, 12) === 'avif' ? 'avif' : 'heic';
    return null;
  }

  /** TIFF files: the picture data is copied as it is; only the tags are filtered. */
  const tiffFile = {
    analyse: (u8) => C.tiff.fields(C.tiff.parse(u8, { exifMode: false })),
    strip: (u8, remove) => ({ bytes: C.tiff.rewrite(C.tiff.parse(u8, { exifMode: false }), remove, C.tags.blockGone(remove), false), notes: [] }),
  };
  const MODS = { jpeg: C.jpeg, png: C.png, webp: C.webp, tiff: tiffFile };

  function inspect(u8) {
    const format = detect(u8);
    if (!format) return { format: null, label: 'Unknown', supported: false, findings: [], notes: [] };
    if (!MODS[format]) return { format, label: format.toUpperCase(), supported: false, findings: [], notes: [] };
    return { format, label: LABEL[format], supported: true, findings: MODS[format].analyse(u8), notes: [] };
  }

  function strip(u8, options = {}) {
    const format = detect(u8);
    if (!format || !MODS[format]) B.fail(format ? `${format.toUpperCase()} files are not supported. Export them as JPEG, PNG, WebP or TIFF first.` : 'This is not a JPEG, PNG, WebP or TIFF image');
    const remove = C.tags.resolve(options.remove);
    const before = MODS[format].analyse(u8);
    const res = MODS[format].strip(u8, remove);
    const after = inspect(res.bytes);
    if (!after.format) B.fail('The cleaned file could not be read back, so nothing was written');
    return { format, label: LABEL[format], mime: MIME[format], ext: EXT[format], bytes: res.bytes, before, after: after.findings, notes: res.notes };
  }

  /** Counts per category, in the order of CATS. */
  function summary(findings) {
    const out = {};
    for (const c of C.tags.CATS) { const n = findings.filter((f) => f.cat === c.id).length; if (n) out[c.id] = n; }
    return out;
  }

  C.detect = detect;
  C.inspect = inspect;
  C.strip = strip;
  C.summary = summary;
  C.CATS = C.tags.CATS;
  C.resolve = C.tags.resolve;
  C.mimeOf = (format) => MIME[format] || 'application/octet-stream';
})(typeof window !== 'undefined' ? window : globalThis);
