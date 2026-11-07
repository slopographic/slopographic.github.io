/* Camera RAW: which files are RAW photos, by their content first and their extension second. Pure, no DOM: Node tests
 * require() it; the browser gets window.SlopRawDetect (needs shared/raw/tiff.js loaded first, or require()s it).
 * Content rules: RAF ("FUJIFILMCCD-RAW"), CR3 (ISO-BMFF brand "crx "), CRW (CIFF "HEAPCCDR"), MRW ("\0MRM"), ORF
 * (TIFF magic IIRO / IIRS / MMOR), RW2 and RWL (TIFF magic 0x55), CR2 (TIFF with "CR" at byte 8) and plain TIFF that is a
 * DNG (DNGVersion tag) or has a RAW extension, or names a camera maker and holds a colour filter array (CFA) image.
 * A plain .tif scan or export is not RAW.
 *   FORMATS                                 { ext: { label, maker } } for every extension LibRaw opens here
 *   EXTS / ACCEPT                           ['cr2', ...] and '.cr2,.cr3,...' for file inputs
 *   isRawName(name) -> boolean              by extension only
 *   sniff(bytes, name?) -> { ext, label, maker } | null      bytes: the start of the file (64 KB is plenty) or all of it */
(function (root, factory) {
  const T = root.SlopRawTiff || (typeof require === 'function' ? require('./tiff.js') : null);
  const api = factory(T);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SlopRawDetect = api;
})(typeof window !== 'undefined' ? window : globalThis, function (T) {
  'use strict';
  const FORMATS = {
    cr2: { label: 'Canon CR2', maker: 'Canon' }, cr3: { label: 'Canon CR3', maker: 'Canon' }, crw: { label: 'Canon CRW', maker: 'Canon' },
    nef: { label: 'Nikon NEF', maker: 'Nikon' }, nrw: { label: 'Nikon NRW', maker: 'Nikon' },
    arw: { label: 'Sony ARW', maker: 'Sony' }, sr2: { label: 'Sony SR2', maker: 'Sony' }, srf: { label: 'Sony SRF', maker: 'Sony' },
    dng: { label: 'Adobe DNG', maker: '' }, raf: { label: 'Fujifilm RAF', maker: 'Fujifilm' },
    orf: { label: 'Olympus ORF', maker: 'Olympus' }, rw2: { label: 'Panasonic RW2', maker: 'Panasonic' }, rwl: { label: 'Leica RWL', maker: 'Leica' },
    pef: { label: 'Pentax PEF', maker: 'Pentax' }, srw: { label: 'Samsung SRW', maker: 'Samsung' },
    '3fr': { label: 'Hasselblad 3FR', maker: 'Hasselblad' }, fff: { label: 'Hasselblad FFF', maker: 'Hasselblad' },
    iiq: { label: 'Phase One IIQ', maker: 'Phase One' }, mos: { label: 'Leaf MOS', maker: 'Leaf' }, mrw: { label: 'Minolta MRW', maker: 'Minolta' },
    erf: { label: 'Epson ERF', maker: 'Epson' }, kdc: { label: 'Kodak KDC', maker: 'Kodak' }, dcr: { label: 'Kodak DCR', maker: 'Kodak' },
    mef: { label: 'Mamiya MEF', maker: 'Mamiya' }, gpr: { label: 'GoPro GPR', maker: 'GoPro' },
  };
  const EXTS = Object.keys(FORMATS);
  const ACCEPT = EXTS.map((e) => '.' + e).join(',');
  /** TIFF Make values that name a camera maker, mapped to the extension its RAW files use. */
  const MAKE_EXT = [[/^nikon/i, 'nef'], [/^sony/i, 'arw'], [/^canon/i, 'cr2'], [/^pentax|^ricoh/i, 'pef'], [/^samsung/i, 'srw'],
    [/^hasselblad/i, '3fr'], [/^leica/i, 'dng'], [/^olympus|^om digital/i, 'orf'], [/^panasonic/i, 'rw2'], [/^fujifilm/i, 'raf'],
    [/^phase one/i, 'iiq'], [/^leaf/i, 'mos'], [/^mamiya/i, 'mef'], [/^epson/i, 'erf'], [/^kodak|^eastman/i, 'dcr'], [/^gopro/i, 'gpr']];
  const CFA = 32803, LINEAR_RAW = 34892;

  const extOf = (name) => { const m = /\.([a-z0-9]+)$/i.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; };
  const isRawName = (name) => Object.prototype.hasOwnProperty.call(FORMATS, extOf(name));
  const ascii = (b, at, n) => (b.length >= at + n ? String.fromCharCode(...b.subarray(at, at + n)) : '');
  const hit = (ext, maker) => ({ ext, label: FORMATS[ext].label, maker: maker || FORMATS[ext].maker });

  /** A plain TIFF (II*\0 or MM\0*): a DNG, a RAW by its extension, or a camera maker's file with a CFA image. */
  function tiffKind(bytes, ext) {
    if (!T) return isRawName('.' + ext) ? hit(ext) : null;
    const list = T.ifds(bytes, 0);
    const ifd0 = list.find((d) => d.kind === 'ifd0');
    const make = ifd0 ? String(T.value(bytes, ifd0, T.TAG.Make) || '') : '';
    if (list.some((d) => d.tags.has(T.TAG.DNGVersion))) return hit('dng', make);
    if (ext === 'tif' || ext === 'tiff') return null;
    if (FORMATS[ext]) return hit(ext, make);
    const cfa = list.some((d) => { const p = T.value(bytes, d, 0x0106); return p === CFA || p === LINEAR_RAW; });
    const m = MAKE_EXT.find(([re]) => re.test(make));
    // NEF and ARW keep the CFA image in a SubIFD that can sit past the bytes given, so a maker name with SubIFDs counts too
    if (m && (cfa || (ifd0 && ifd0.tags.has(T.TAG.SubIFDs)))) return hit(m[1], make);
    return null;
  }

  /** The RAW format of the bytes, or null. name (optional) breaks ties the content leaves open. */
  function sniff(bytes, name) {
    if (!bytes || bytes.length < 12) return null;
    const ext = extOf(name);
    if (ascii(bytes, 0, 15) === 'FUJIFILMCCD-RAW') return hit('raf');
    if (ascii(bytes, 4, 8) === 'ftypcrx ') return hit('cr3');
    if (ascii(bytes, 6, 8) === 'HEAPCCDR') return hit('crw');
    if (ascii(bytes, 0, 4) === '\0MRM') return hit('mrw');
    const h = T ? T.header(bytes, 0) : null;
    if (!h) return null;
    if (h.magic === 0x4f52 || h.magic === 0x5352) return hit('orf');
    if (h.magic === 0x55) return hit(ext === 'rwl' ? 'rwl' : 'rw2');
    if (ascii(bytes, 8, 2) === 'CR' && bytes[10] === 2) return hit('cr2');
    return tiffKind(bytes, ext);
  }

  return { FORMATS, EXTS, ACCEPT, isRawName, sniff, extOf };
});
