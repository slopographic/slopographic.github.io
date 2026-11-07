/* Slop PDF — the parts stored in a PDF, read with pdf-lib: the images and fonts its pages use (following Form XObjects, each
   object once, with the pages it is on) and its embedded files (the EmbeddedFiles name tree and FileAttachment annotations,
   with file name, MIME type, description, relationship and dates; a ZUGFeRD / Factur-X invoice is one of them). No DOM:
   the editor (io/assets-scan.js) and the headless operation (shared/ops/pdf-extract.js) both use it. pdf.js renders and
   decodes pages but does not expose stored streams, so the bytes come from here. Needs SlopPdfAssets (io/assets-model.js).
     SlopPdfParts.scan(PL, doc, pageIndices, ctx) → { images, fonts }   ctx: { fid, file, multi } (labels, dedup keys)
     SlopPdfParts.attachments(PL, doc, pageIndices) → [attachment]
     SlopPdfParts.imageFile(image, encodePng) → { data, ext, type }   a JPEG as stored, other images as PNG
     SlopPdfParts.inflate(bytes), streamBytes(stream, filters, parms), reader(context, PL) */
(function (root) {
  'use strict';
  var P = {};
  function Mod() { return root.SlopPdfAssets; }
  function tr(k, en, v) { var I = root.SlopI18n; if (I && I.has && I.has(k)) return I.t(k, v); return String(en).replace(/\{(\w+)\}/g, function (m, n) { return v && n in v ? String(v[n]) : m; }); }

  /** Inflates zlib (Flate) data with the platform's DecompressionStream. */
  P.inflate = async function (bytes) {
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  };
  /** The stream's bytes after its filters (raw, or Flate with an optional predictor). Null for filters that are not decoded. */
  P.streamBytes = async function (stream, filters, parms) {
    if (!filters.length) return stream.contents;
    if (filters.length === 1 && filters[0] === 'FlateDecode') { // i18n-ignore: PDF names / font names / producer, not UI
      try { return Mod().unpredict(await P.inflate(stream.contents), parms || {}); } catch (e) { return null; }
    }
    return null;
  };

  /** The reading of one file: resolves references and reads names, numbers, strings, arrays and colour spaces. */
  P.reader = function (ctx, PL) {
    var lk = function (o) { return o instanceof PL.PDFRef ? ctx.lookup(o) : o; };
    var nm = function (o) { o = lk(o); return o && o.decodeText ? o.decodeText() : ''; };
    var num = function (d, k) { var v = lk(d.get(PL.PDFName.of(k))); return v && v.asNumber ? v.asNumber() : undefined; };
    var has = function (d, k) { return d.get(PL.PDFName.of(k)) !== undefined; };
    var get = function (d, k) { return lk(d.get(PL.PDFName.of(k))); };
    var str = function (d, k) { var v = get(d, k); return v && v.decodeText ? v.decodeText() : ''; };
    var filters = function (d) {
      var f = get(d, 'Filter'); if (!f) return []; // i18n-ignore: PDF names / font names / producer, not UI
      if (f instanceof PL.PDFArray) { var out = []; for (var i = 0; i < f.size(); i++) out.push(nm(f.get(i))); return out; }
      return [nm(f)];
    };
    var parms = function (d) {
      var p = get(d, 'DecodeParms') || get(d, 'DP'); if (p instanceof PL.PDFArray) p = lk(p.get(0)); // i18n-ignore: PDF names / font names / producer, not UI
      if (!(p instanceof PL.PDFDict)) return {};
      var o = {}; ['Predictor', 'Colors', 'BitsPerComponent', 'Columns'].forEach(function (k) { var v = num(p, k); if (v !== undefined) o[k] = v; }); // i18n-ignore: PDF names / font names / producer, not UI
      return o;
    };
    /** Colour space: name, component count, and for palettes the base and the lookup bytes. */
    var colour = function (cs) {
      cs = lk(cs);
      if (cs instanceof PL.PDFName) { var n = cs.decodeText(); return { colorSpace: n, comps: Mod().COMPS[n] || (n === 'DeviceCMYK' ? 4 : 0) }; } // i18n-ignore: PDF names / font names / producer, not UI
      if (cs instanceof PL.PDFArray) {
        var first = nm(cs.get(0));
        if (first === 'ICCBased') { var st = lk(cs.get(1)); return { colorSpace: 'ICCBased', comps: st && st.dict ? (num(st.dict, 'N') || 0) : 0 }; }
        if (first === 'Indexed') { // i18n-ignore: PDF names / font names / producer, not UI
          var base = colour(cs.get(1)), look = lk(cs.get(3)), bytes = null;
          if (look && look.contents) bytes = look.contents;
          else if (look && look.asBytes) bytes = look.asBytes();
          return { colorSpace: 'Indexed', comps: 1, base: base.comps === 3 ? 'DeviceRGB' : base.comps === 1 ? 'DeviceGray' : base.colorSpace, palette: bytes }; // i18n-ignore: PDF names / font names / producer, not UI
        }
        return { colorSpace: first, comps: 0 };
      }
      return { colorSpace: '', comps: 0 };
    };
    return { lk: lk, nm: nm, num: num, has: has, get: get, str: str, filters: filters, parms: parms, colour: colour };
  };

  /** The images and fonts of pages idxs of a loaded pdf-lib document. */
  P.scan = async function (PL, doc, idxs, ctx, acc) {
    var out = acc || { images: [], fonts: [], seen: new Set(), n: 0 }, R = P.reader(doc.context, PL), pages = doc.getPages();
    if (!out.seen) out.seen = new Set();
    var next = function () { return ++out.n; };
    for (var i of idxs.slice().sort(function (a, b) { return a - b; })) {
      var pg = pages[i]; if (!pg) continue;
      var c = Object.assign({}, ctx, { page: i + 1 });
      await walk(PL, R, R.lk(pg.node.Resources ? pg.node.Resources() : null), c, out, next, 0);
    }
    out.images.forEach(function (im) { im.pageText = im.pages.length > 1 ? tr('pdf.io.meta_pages', 'pages {list}', { list: im.pages.join(', ') }) : tr('pdf.io.meta_page', 'page {n}', { n: String(im.pages[0]) }); });
    return out;
  };
  async function walk(PL, R, res, ctx, out, next, depth) {
    if (!res || depth > 12) return;
    var xo = R.lk(R.get(res, 'XObject'));
    if (xo instanceof PL.PDFDict) {
      for (var [name, ref] of xo.entries()) {
        var key = ctx.fid + ':' + String(ref), obj = R.lk(ref);
        if (!obj || !obj.dict) continue;
        var sub = R.nm(obj.dict.get(PL.PDFName.of('Subtype'))); // i18n-ignore: PDF names / font names / producer, not UI
        if (sub === 'Image') { // i18n-ignore: PDF names / font names / producer, not UI
          if (out.seen.has(key)) { var old = out.images.find(function (x) { return x.key === key; }); if (old && old.pages.indexOf(ctx.page) < 0) old.pages.push(ctx.page); continue; }
          out.seen.add(key); out.images.push(imageItem(PL, R, name.decodeText(), key, obj, ctx, next()));
        } else if (sub === 'Form' && !out.seen.has(key)) { // i18n-ignore: PDF names / font names / producer, not UI
          out.seen.add(key);
          await walk(PL, R, R.lk(obj.dict.get(PL.PDFName.of('Resources'))), ctx, out, next, depth + 1); // i18n-ignore: PDF names / font names / producer, not UI
        }
      }
    }
    var fonts = R.lk(R.get(res, 'Font')); // i18n-ignore: PDF names / font names / producer, not UI
    if (fonts instanceof PL.PDFDict) {
      for (var [, fref] of fonts.entries()) {
        var fkey = ctx.fid + ':font:' + String(fref);
        if (out.seen.has(fkey)) continue;
        out.seen.add(fkey);
        var fd = R.lk(fref); if (fd instanceof PL.PDFDict) out.fonts.push(await fontItem(PL, R, fd, fkey, ctx, next()));
      }
    }
  }
  function imageItem(PL, R, name, key, s, ctx, n) {
    var d = s.dict, bpc = R.num(d, 'BitsPerComponent'); // i18n-ignore: PDF names / font names / producer, not UI
    var im = R.get(d, 'ImageMask'), imageMask = !!(im && im.asBoolean && im.asBoolean()); // i18n-ignore: PDF names / font names / producer, not UI
    var cs = R.has(d, 'ColorSpace') ? R.colour(d.get(PL.PDFName.of('ColorSpace'))) : { colorSpace: imageMask ? 'Mask' : '', comps: 1 }; // i18n-ignore: PDF names / font names / producer, not UI
    var fl = R.filters(d), w = R.num(d, 'Width') || 0, h = R.num(d, 'Height') || 0; // i18n-ignore: PDF names / font names / producer, not UI
    if (imageMask) bpc = 1; else if (bpc === undefined) bpc = 8;
    var kind = Mod().imageKind({ filters: fl, bpc: bpc, colorSpace: cs.colorSpace, comps: cs.comps, base: cs.base, imageMask: imageMask });
    return {
      id: 'img' + n, key: key, name: name, file: ctx.multi ? ctx.file : '', pages: [ctx.page], page: ctx.page, pageText: '',
      width: w, height: h, colorSpace: cs.colorSpace, bpc: bpc,
      filterText: fl.join('+') || 'raw', size: s.contents ? s.contents.length : 0,
      kind: kind.kind, ext: kind.ext || null, reason: kind.reason || '', mask: R.has(d, 'SMask') || R.has(d, 'Mask'), // i18n-ignore: PDF names / font names / producer, not UI
      comps: cs.comps, base: cs.base, palette: cs.palette || null, filters: fl, parms: R.parms(d), contents: s.contents, fileId: ctx.fid
    };
  }
  async function fontItem(PL, R, fd, key, ctx, n) {
    var sub = R.nm(fd.get(PL.PDFName.of('Subtype'))), base = R.nm(fd.get(PL.PDFName.of('BaseFont'))) || 'Font'; // i18n-ignore: PDF names / font names / producer, not UI
    var desc = fd;
    if (sub === 'Type0') { var df = R.lk(fd.get(PL.PDFName.of('DescendantFonts'))), cid = df instanceof PL.PDFArray ? R.lk(df.get(0)) : null; if (cid instanceof PL.PDFDict) desc = cid; } // i18n-ignore: PDF names / font names / producer, not UI
    var fdesc = R.get(desc, 'FontDescriptor'), file = null, fkey = null; // i18n-ignore: PDF names / font names / producer, not UI
    if (fdesc instanceof PL.PDFDict) {
      for (var k of ['FontFile', 'FontFile2', 'FontFile3']) { var v = fdesc.get(PL.PDFName.of(k)); if (v !== undefined) { file = R.lk(v); fkey = k; break; } } // i18n-ignore: PDF names / font names / producer, not UI
    }
    var bytes = null, reason = '', fsub = '';
    if (file && file.contents) {
      fsub = R.nm(file.dict.get(PL.PDFName.of('Subtype'))); // i18n-ignore: PDF names / font names / producer, not UI
      bytes = await P.streamBytes(file, R.filters(file.dict), R.parms(file.dict));
      if (!bytes) reason = tr('pdf.io.font_stream_raw', 'This font stream is stored in a way that is not decoded');
    }
    var kind = Mod().fontKind({ key: fkey, subtype: fsub, firstByte: bytes ? bytes[0] : 0 });
    var type = fkey ? kind.label : tr('pdf.io.not_embedded', 'not embedded');
    if (sub === 'Type0') type = tr('pdf.io.font_composite', 'Composite ({type})', { type: type });
    return { id: 'font' + n, key: key, name: base, type: type, embedded: !!bytes, size: bytes ? bytes.length : 0, bytes: bytes,
      subset: Mod().subsetOf(base), ext: bytes ? kind.ext : null, reason: reason, file: ctx.multi ? ctx.file : '', pages: [ctx.page] };
  }

  /** An image item's file: a JPEG as stored, else its decoded samples as PNG through encodePng(rgba, w, h) → Promise of
   * bytes (a canvas in the page, an OffscreenCanvas headless). Throws with a reason when it cannot be decoded. */
  P.imageFile = async function (im, encodePng) {
    if (im.kind === 'skip') throw new Error(im.reason || tr('pdf.io.not_decoded', 'Not decoded'));
    if (im.kind === 'jpeg') return { data: im.contents, ext: 'jpg', type: 'image/jpeg' };
    var bytes = await P.streamBytes({ contents: im.contents }, im.filters, im.parms);
    if (!bytes) throw new Error(tr('pdf.io.image_undecodable', 'The image data could not be decompressed'));
    var w = im.width, h = im.height, comps = im.palette ? 1 : im.comps;
    if (!w || !h) throw new Error(tr('pdf.io.image_no_size', 'The image has no size'));
    if (bytes.length < w * h * comps) throw new Error(tr('pdf.io.image_short', 'The image data is shorter than its size'));
    return { data: await encodePng(Mod().toRGBA(bytes, w, h, comps, im.palette), w, h), ext: 'png', type: 'image/png' };
  };

  /* ------------------------------------------------------------------ embedded files */
  var MIME = { xml: 'application/xml', pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', json: 'application/json', png: 'image/png',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', zip: 'application/zip', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', html: 'text/html' };
  /** A file specification as an attachment, or null when it has no embedded stream. */
  async function fileSpec(PL, R, spec, from, page, n) {
    spec = R.lk(spec);
    if (!(spec instanceof PL.PDFDict)) return null;
    var ef = R.get(spec, 'EF'), st = ef instanceof PL.PDFDict ? R.get(ef, 'UF') || R.get(ef, 'F') : null;
    if (!st || !st.dict) return null;
    var name = R.str(spec, 'UF') || R.str(spec, 'F') || 'attachment-' + n, sub = R.nm(st.dict.get(PL.PDFName.of('Subtype'))); // i18n-ignore: PDF names / font names / producer, not UI
    var ext = (/\.([a-z0-9]+)$/i.exec(name) || [])[1], params = R.get(st.dict, 'Params'), bytes = await P.streamBytes(st, R.filters(st.dict), R.parms(st.dict)); // i18n-ignore: PDF names / font names / producer, not UI
    var mime = sub ? sub.replace(/#2F/gi, '/') : MIME[String(ext || '').toLowerCase()] || 'application/octet-stream';
    var rel = R.nm(spec.get(PL.PDFName.of('AFRelationship'))), date = function (k) { return params instanceof PL.PDFDict ? R.str(params, k) : ''; };
    var lower = name.toLowerCase(), einvoice = /^(factur-x|zugferd-invoice|xrechnung|order-x)\.xml$/.test(lower) || lower === 'zugferd-invoice.xml';
    return { id: 'att' + n, name: name, desc: R.str(spec, 'Desc'), mime: mime, size: bytes ? bytes.length : (st.contents || []).length, // i18n-ignore: PDF names / font names / producer, not UI
      bytes: bytes, reason: bytes ? '' : tr('pdf.io.att_raw', 'This attachment is stored in a way that is not decoded'), from: from, page: page || 0,
      rel: rel, created: date('CreationDate'), modified: date('ModDate'), einvoice: einvoice }; // i18n-ignore: PDF names / font names / producer, not UI
  }
  /** Every name → value pair of a name tree. */
  function treeValues(PL, R, node, out, depth) {
    node = R.lk(node);
    if (!(node instanceof PL.PDFDict) || depth > 20) return out;
    var names = R.get(node, 'Names'), kids = R.get(node, 'Kids'); // i18n-ignore: PDF names / font names / producer, not UI
    if (names instanceof PL.PDFArray) for (var i = 0; i + 1 < names.size(); i += 2) out.push(names.get(i + 1));
    if (kids instanceof PL.PDFArray) kids.asArray().forEach(function (k) { treeValues(PL, R, k, out, depth + 1); });
    return out;
  }
  /** The document's embedded files (name tree, then the AF array) and the file attachment annotations of pages idxs. */
  P.attachments = async function (PL, doc, idxs) {
    var R = P.reader(doc.context, PL), out = [], seen = new Set(), n = 0;
    async function take(spec, from, page) {
      var key = String(spec);
      if (spec instanceof PL.PDFRef && seen.has(key)) return;
      if (spec instanceof PL.PDFRef) seen.add(key);
      var a = await fileSpec(PL, R, spec, from, page, ++n);
      if (a) out.push(a);
    }
    var names = R.get(doc.catalog, 'Names'), ef = names instanceof PL.PDFDict ? R.get(names, 'EmbeddedFiles') : null; // i18n-ignore: PDF names / font names / producer, not UI
    for (var spec of treeValues(PL, R, ef, [], 0)) await take(spec, 'document', 0);
    var af = R.get(doc.catalog, 'AF');
    if (af instanceof PL.PDFArray) for (var s of af.asArray()) await take(s, 'document', 0);
    var pages = doc.getPages(), list = idxs || pages.map(function (p, i) { return i; });
    for (var i of list) {
      var pg = pages[i], annots = pg && pg.node.Annots ? pg.node.Annots() : null;
      if (!annots) continue;
      for (var k = 0; k < annots.size(); k++) {
        var an = R.lk(annots.get(k));
        if (an instanceof PL.PDFDict && R.nm(an.get(PL.PDFName.of('Subtype'))) === 'FileAttachment') await take(an.get(PL.PDFName.of('FS')), 'annotation', i + 1); // i18n-ignore: PDF names / font names / producer, not UI
      }
    }
    return out;
  };

  root.SlopPdfParts = P;
})(typeof window !== 'undefined' ? window : globalThis);
