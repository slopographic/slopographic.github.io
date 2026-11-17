/* Slop PDF — extract assets, as plain data (no DOM, no pdf-lib): how an embedded image is stored and whether it can be
   saved (JPEG bytes as they are, other 8-bit images decoded to PNG, the rest skipped with a reason), the pixels of a
   decoded image, PNG predictors, the list rows of the dialog, and the zip entries of a selection. */
(function (root) {
  'use strict';
  var M = {};
  var COMPS = { DeviceGray: 1, CalGray: 1, DeviceRGB: 3, CalRGB: 3 };
  function skip(reason) { return { kind: 'skip', reason: reason }; }
  /** The chosen language's text for a key (SlopI18n), else the English given (no tables: tests, workers). */
  function tr(k, en, v) { var I = root.SlopI18n; if (I && I.has && I.has(k)) return I.t(k, v); return String(en).replace(/\{(\w+)\}/g, function (m, n) { return v && n in v ? String(v[n]) : m; }); }

  /** How an image is saved. r: { filters: [names], bpc, colorSpace, comps, base, mask, imageMask, width, height }.
      DCTDecode (one filter) is kept as JPEG; FlateDecode with 8-bit gray, RGB or palette samples is decoded to PNG. */
  M.imageKind = function (r) {
    var f = r.filters || [], unknown = tr('pdf.io.unknown', 'unknown'), none = tr('pdf.io.none', 'none');
    if (r.imageMask) return skip(tr('pdf.io.skip_stencil', 'Stencil mask (1 bit) is not decoded'));
    if (f.length === 1 && f[0] === 'DCTDecode') return { kind: 'jpeg', ext: 'jpg' };
    if (f.indexOf('JPXDecode') >= 0) return skip(tr('pdf.io.skip_jpx', 'JPEG 2000 images are not decoded'));
    if (f.indexOf('JBIG2Decode') >= 0) return skip(tr('pdf.io.skip_jbig2', 'JBIG2 images are not decoded'));
    if (f.indexOf('CCITTFaxDecode') >= 0) return skip(tr('pdf.io.skip_ccitt', 'CCITT fax images are not decoded'));
    if (f.length > 1 || (f.length === 1 && f[0] !== 'FlateDecode')) return skip(tr('pdf.io.skip_filter', 'Filter {filter} is not decoded', { filter: f.join(' + ') || none }));
    if (!f.length && r.comps !== 1 && r.comps !== 3) return skip(tr('pdf.io.skip_raw', 'Uncompressed images of this kind are not decoded'));
    if (r.bpc !== 8) return skip(tr('pdf.io.skip_bpc', '{bpc}-bit samples are not decoded', { bpc: String(r.bpc) }));
    if (r.colorSpace === 'Indexed') return r.base === 'DeviceRGB' || r.base === 'RGB' ? { kind: 'raw', ext: 'png', comps: 1 } : skip(tr('pdf.io.skip_palette', 'Palette in {cs} is not decoded', { cs: r.base || unknown }));
    if (r.comps === 1 || r.comps === 3) return { kind: 'raw', ext: 'png', comps: r.comps };
    return skip(tr('pdf.io.skip_colour', 'Colour space {cs} is not decoded', { cs: r.colorSpace || unknown }));
  };
  M.COMPS = COMPS;

  /** Reverses a PNG predictor (Predictor >= 10) on Flate data. p: { Predictor, Colors, BitsPerComponent, Columns }. */
  M.unpredict = function (data, p) {
    var pred = p.Predictor || 1;
    if (pred < 10) return data;
    var colors = p.Colors || 1, bpc = p.BitsPerComponent || 8, cols = p.Columns || 1;
    var bpp = Math.max(1, Math.ceil(colors * bpc / 8)), stride = Math.ceil(colors * bpc * cols / 8);
    var rows = Math.floor(data.length / (stride + 1)), out = new Uint8Array(rows * stride), prev = new Uint8Array(stride);
    for (var y = 0; y < rows; y++) {
      var type = data[y * (stride + 1)], src = y * (stride + 1) + 1, cur = new Uint8Array(stride);
      for (var x = 0; x < stride; x++) {
        var raw = data[src + x], a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0, v;
        if (type === 0) v = raw;
        else if (type === 1) v = raw + a;
        else if (type === 2) v = raw + b;
        else if (type === 3) v = raw + ((a + b) >> 1);
        else { var pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v = raw + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
        cur[x] = v & 255;
      }
      out.set(cur, y * stride); prev = cur;
    }
    return out;
  };

  /** RGBA pixels from 8-bit samples. comps 1 (gray, or palette indexes with palette: RGB bytes) or 3 (RGB). */
  M.toRGBA = function (samples, width, height, comps, palette) {
    var n = width * height, out = new Uint8ClampedArray(n * 4);
    for (var i = 0; i < n; i++) {
      var r, g, b;
      if (palette) { var k = samples[i] * 3; r = palette[k] || 0; g = palette[k + 1] || 0; b = palette[k + 2] || 0; }
      else if (comps === 1) { r = g = b = samples[i]; }
      else { r = samples[i * 3]; g = samples[i * 3 + 1]; b = samples[i * 3 + 2]; }
      out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = 255;
    }
    return out;
  };

  /** A size for people: 512 B, 84 KB, 3.2 MB. */
  M.sizeText = function (b) {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return Math.round(b / 1024) + ' KB';
    return (b / 1024 / 1024).toFixed(1) + ' MB';
  };
  /** A file-name part from a PDF name: letters, digits, dash and underscore only. */
  M.safePart = function (s, fallback) {
    var t = String(s || '').replace(/^\/+/, '').replace(/[^A-Za-z0-9._+-]+/g, '_').replace(/^_+|_+$/g, '');
    return t.slice(0, 80) || fallback;
  };
  /** Makes names unique in a list: a second "a.png" becomes "a-2.png". */
  M.uniquify = function (names) {
    var seen = Object.create(null);
    return names.map(function (n) {
      var k = n.toLowerCase(), out = n, i = 2;
      while (seen[out.toLowerCase()]) { out = n.replace(/(\.[^./]+)?$/, function (ext) { return '-' + i + (ext || ''); }); i++; }
      seen[out.toLowerCase()] = true; seen[k] = true;
      return out;
    });
  };
  /** How a font file is stored and what its extension is. f: { key: 'FontFile'|'FontFile2'|'FontFile3', subtype, firstByte }. */
  M.fontKind = function (f) {
    if (!f.key) return { ext: null, label: tr('pdf.io.not_embedded', 'not embedded') };
    if (f.key === 'FontFile') return { ext: f.firstByte === 0x80 ? 'pfb' : 'pfa', label: 'Type 1' }; // i18n-ignore: PDF names / font names / producer, not UI
    if (f.key === 'FontFile2') return { ext: 'ttf', label: 'TrueType' }; // i18n-ignore: PDF names / font names / producer, not UI
    if (f.subtype === 'OpenType') return { ext: 'otf', label: 'OpenType' }; // i18n-ignore: PDF names / font names / producer, not UI
    return { ext: 'cff', label: 'CFF' };
  };
  /** Subset fonts carry a six-letter tag before the name ("ABCDEF+Helvetica"). */
  M.subsetOf = function (name) { return /^[A-Z]{6}\+/.test(name || ''); };

  /** The dialog's rows. images: [{ id, name, page, file, width, height, colorSpace, bpc, size, kind, ext, reason, mask }].
      fonts: [{ id, name, type, embedded, size, subset, ext, file }]. Skipped and not embedded items are listed, not selectable. */
  M.rows = function (images, fonts) {
    var imgs = images.map(function (im) {
      var skipped = im.kind === 'skip';
      return { id: im.id, group: 'image', checked: !skipped, disabled: skipped, reason: im.reason || '', title: im.name,
        meta: [im.width + '×' + im.height, im.colorSpace || '?', im.bpc ? im.bpc + ' bpc' : '', im.filterText, M.sizeText(im.size), (im.pageText || tr('pdf.io.meta_page', 'page {n}', { n: String(im.page) })) + (im.file ? ' · ' + im.file : ''), im.mask ? tr('pdf.io.mask_excluded', 'mask not included') : ''].filter(Boolean) };
    });
    var fts = fonts.map(function (f) {
      var can = !!f.embedded;
      return { id: f.id, group: 'font', checked: can, disabled: !can, reason: can ? '' : tr('pdf.io.font_not_embedded', 'Not embedded: the PDF refers to the font, so there is no file to save'), title: f.name,
        meta: [f.type, can ? M.sizeText(f.size) : tr('pdf.io.not_embedded', 'not embedded'), f.subset ? tr('pdf.io.font_subset', 'subset: may be incomplete') : ''].filter(Boolean) };
    });
    return { images: imgs, fonts: fts, counts: { images: imgs.length, fonts: fts.length, selectable: imgs.concat(fts).filter(function (r) { return !r.disabled; }).length } };
  };
  /** The rows of embedded files: { id, title, meta, reason, checked, disabled }. */
  M.attachmentRows = function (list) {
    return list.map(function (a) {
      var meta = [a.mime, M.sizeText(a.size || 0), a.from === 'annotation' ? tr('pdf.io.att_on_page', 'attached on page {n}', { n: String(a.page) }) : tr('pdf.io.att_document', 'attached to the document'), a.einvoice ? tr('pdf.io.att_einvoice', 'e-invoice (ZUGFeRD / Factur-X)') : '', a.rel ? tr('pdf.io.att_rel', 'relationship: {rel}', { rel: a.rel }) : '', a.desc, a.file].filter(Boolean);
      return { id: a.id, group: 'attachment', checked: !!a.bytes, disabled: !a.bytes, reason: a.bytes ? '' : a.reason, title: a.name, meta: meta };
    });
  };
  /** A page's text from pdf.js text items ({ str, hasEOL, transform: [a, b, c, d, x, y] }): { txt, md }. A gap between lines
      bigger than 1.6 lines starts a paragraph (a blank line in both); md has a heading for the page. */
  M.pageText = function (items, n) {
    var lines = [], cur = '', lastY = null;
    items.forEach(function (it) {
      if (typeof it.str !== 'string') return;
      var y = it.transform ? it.transform[5] : null, fs = it.transform ? Math.hypot(it.transform[2], it.transform[3]) : 0;
      cur += it.str;
      if (it.hasEOL) { lines.push({ t: cur, y: y, fs: fs }); cur = ''; }
      lastY = y;
    });
    if (cur.trim()) lines.push({ t: cur, y: lastY, fs: 0 });
    var paras = [], para = [];
    lines.forEach(function (l, i) {
      var prev = lines[i - 1], gap = prev && prev.y != null && l.y != null ? prev.y - l.y : 0, pitch = (l.fs || prev && prev.fs || 12) * 1.2;
      if (para.length && gap > pitch * 1.6) { paras.push(para); para = []; }
      if (l.t.trim()) para.push(l.t.replace(/\s+$/, ''));
    });
    if (para.length) paras.push(para);
    var txt = paras.map(function (p) { return p.join('\n'); }).join('\n\n');
    var md = '## Page ' + n + '\n\n' + paras.map(function (p) { return p.join(' ').replace(/([*_#`\\])/g, '\\$1'); }).join('\n\n');
    return { txt: txt + '\n', md: md + '\n' };
  };
  /** The zip entries of a selection, images first (so a JPEG or PNG is the first entry). items: [{ group, path, ext, data }]. */
  M.planEntries = function (items) {
    var order = { image: 0, attachment: 1, font: 2, text: 3, page: 4 };
    return items.slice().sort(function (a, b) { return order[a.group] - order[b.group]; });
  };

  root.SlopPdfAssets = M;
  return M;
})(typeof window !== 'undefined' ? window : globalThis);
