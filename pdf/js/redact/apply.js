/* Slop PDF — applying redactions for real. Every page with redaction marks is rasterised with pdf.js
   at high resolution, solid black boxes are painted into the bitmap, and the page is replaced by an
   image-only page (same size and rotation) in a new source file. Text, vector content, form fields,
   comments and other annotations on that page are gone; only web links outside the boxes are kept.
   Untouched pages stay vector. Export also prunes unused XObjects from pages that share resources
   with a redacted page (E.pruneXObjects), and always writes a fresh file (no incremental history). */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine;
  var R = SP.redact = SP.redact || {};
  function N(k) { return PDFLib.PDFName.of(k); }
  function hit(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
  R.hit = hit;
  /** Page-space boxes (unrotated, top-left origin) of a page's redaction marks. */
  R.boxes = function (p) {
    var g = E.geom(p);
    return (p.annots || []).filter(function (a) { return a.type === 'redact' && !a.hidden; }).map(function (a) { return E.annotViewRect(a, 0, g.W, g.H); });
  };

  async function deflate(u8) {
    var cs = new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate'));
    return new Uint8Array(await new Response(cs).arrayBuffer());
  }
  /** Renders page p, burns black boxes into the bitmap, returns {rgb (zlib), png, w, h}. */
  R.rasterPage = async function (p, boxes, dpi) {
    var f = E.fileOfPage(p), g = E.geom(p), scale = (dpi || 200) / 72;
    var maxPx = 40e6; if (g.W * g.H * scale * scale > maxPx) scale = Math.sqrt(maxPx / (g.W * g.H));
    var c = await E.renderToCanvas(f, p.i, scale);
    var cx = c.getContext('2d');
    cx.fillStyle = '#000';
    boxes.forEach(function (b) {
      var x0 = Math.floor(b.x * scale) - 1, y0 = Math.floor(b.y * scale) - 1;
      cx.fillRect(x0, y0, Math.ceil((b.x + b.w) * scale) + 1 - x0, Math.ceil((b.y + b.h) * scale) + 1 - y0);
    });
    var out = { w: c.width, h: c.height };
    if (typeof CompressionStream === 'function') {
      var px = cx.getImageData(0, 0, c.width, c.height).data, rgb = new Uint8Array(c.width * c.height * 3);
      for (var i = 0, j = 0; i < px.length; i += 4, j += 3) { rgb[j] = px[i]; rgb[j + 1] = px[i + 1]; rgb[j + 2] = px[i + 2]; }
      out.rgb = await deflate(rgb);
    } else out.png = await U.blobToBytes(await U.canvasToBlob(c, 'image/png'));
    c.width = c.height = 0;
    return out;
  };
  /** Draws a rasterPage result over the whole page (raw Flate RGB image, or PNG via pdf-lib). */
  async function drawRaster(out, page, img, W, H) {
    var L = PDFLib;
    if (img.png) { page.drawImage(await out.embedPng(img.png), { x: 0, y: 0, width: W, height: H }); return; }
    var ref = out.context.register(out.context.stream(img.rgb, { Type: 'XObject', Subtype: 'Image', Width: img.w, Height: img.h, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'FlateDecode' })); // i18n-ignore: PDF names / font names / producer, not UI
    var name = page.node.newXObject('Redacted', ref); // i18n-ignore: PDF names / font names / producer, not UI
    page.pushOperators(L.pushGraphicsState(), L.concatTransformationMatrix(W, 0, 0, H, 0, 0), L.drawObject(name), L.popGraphicsState());
  }

  /** Web links (URI actions) of a source page whose rects stay clear of every box. */
  function keptLinks(src, p, boxes) {
    var L = PDFLib, out = [], pg = src.getPage(p.i), annots = pg.node.Annots(), v = E.files.get(p.f).info[p.i].view;
    if (!annots) return out;
    for (var k = 0; k < annots.size(); k++) {
      var d = src.context.lookup(annots.get(k));
      if (!(d instanceof L.PDFDict)) continue;
      var st = d.lookup(N('Subtype')), act = d.lookup(N('A')), rect = d.lookup(N('Rect')); // i18n-ignore: PDF names / font names / producer, not UI
      if (!st || st.asString() !== '/Link' || !(act instanceof L.PDFDict) || !(rect instanceof L.PDFArray)) continue;
      var s = act.lookup(N('S')), uri = act.lookup(N('URI'));
      if (!s || s.asString() !== '/URI' || !uri || !uri.decodeText) continue;
      var r = rect.asArray().map(function (n) { return n.asNumber ? n.asNumber() : 0; });
      var x0 = Math.min(r[0], r[2]) - v[0], x1 = Math.max(r[0], r[2]) - v[0], y0 = Math.min(r[1], r[3]) - v[1], y1 = Math.max(r[1], r[3]) - v[1];
      var H = v[3] - v[1], box = { x: x0, y: H - y1, w: x1 - x0, h: y1 - y0 };
      if (boxes.some(function (b) { return hit(b, box); })) continue;
      out.push({ rect: [x0, y0, x1, y1], uri: uri.decodeText() });
    }
    return out;
  }

  /** Applies every pending mark. opts {dpi, stripMeta, onProgress, extra: [{p, box}]}. Resolves {pages, marks}. */
  E.applyRedactions = async function (opts) {
    opts = opts || {};
    var L = PDFLib, pend = R.pending(), extra = opts.extra || [], byPage = new Map();
    pend.forEach(function (x) { byPage.set(x.p.id, x.p); });
    extra.forEach(function (x) { byPage.set(x.p.id, x.p); });
    if (!byPage.size) return { pages: 0, marks: 0 };
    // page-space boxes of a page: its marks plus the extra boxes (sel-actions.js Remove), which are never stored as marks
    var boxesOf = function (p) { return R.boxes(p).concat(extra.filter(function (x) { return x.p.id === p.id; }).map(function (x) { return x.box; })); };
    var out = await L.PDFDocument.create({ updateMetadata: false }), map = new Map(), srcs = new Map(), k = 0, done = 0;
    for (var entry of byPage) {
      var p = entry[1], boxes = boxesOf(p);
      if (!p.blank) {
        var g = E.geom(p), img = await R.rasterPage(p, boxes, opts.dpi);
        var page = out.addPage([g.W, g.H]);
        await drawRaster(out, page, img, g.W, g.H);
        page.setRotation(L.degrees(g.base));
        if (!srcs.has(p.f)) srcs.set(p.f, await L.PDFDocument.load(E.files.get(p.f).bytes, { updateMetadata: false, ignoreEncryption: true, throwOnInvalidObject: false }));
        keptLinks(srcs.get(p.f), p, boxes).forEach(function (l) {
          var ref = out.context.register(out.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: l.rect, Border: [0, 0, 0], A: { Type: 'Action', S: 'URI', URI: L.PDFString.of(l.uri) } })); // i18n-ignore: PDF names / font names / producer, not UI
          page.node.addAnnot(ref);
        });
        map.set(p.id, k++);
      }
      if (opts.onProgress) opts.onProgress(++done / byPage.size);
    }
    var file = null;
    if (k) {
      out.setProducer('Slop PDF · slopographic.com/pdf'); // i18n-ignore: PDF names / font names / producer, not UI
      file = await E.registerPdf(await out.save({ useObjectStreams: true }), U.t('pdf.redact.file_name'), null);
      file.noLog = true; // generated: its bytes cannot be replayed
    }
    E.commit(U.t('pdf.redact.apply_cmd'), function (st) {
      st.pages.forEach(function (p) {
        if (!byPage.has(p.id)) return;
        var boxes = boxesOf(p), g = E.geom(p);
        // drop the marks, and any annotation that touches a redacted area
        p.annots = p.annots.filter(function (a) { return a.type !== 'redact' && !boxes.some(function (b) { return hit(b, E.annotViewRect(a, 0, g.W, g.H)); }); });
        if (map.has(p.id)) { p.f = file.id; p.i = map.get(p.id); }
        p.redacted = true;
      });
      if (opts.stripMeta) st.meta = { title: '', author: '', subject: '', keywords: '' };
    });
    return { pages: byPage.size, marks: pend.length + extra.length };
  };

  /* --------------------------------------------- export-time clean-up */
  function contentBytes(s) {
    var L = PDFLib;
    if (s instanceof L.PDFRawStream) return L.decodePDFRawStream(s).decode();
    if (s && s.getUnencodedContents) return s.getUnencodedContents();
    return null;
  }
  /** Keeps only the XObjects a page's content actually paints, so resources shared with a redacted
      page (inherited or common /Resources) cannot carry its content along. Returns false if unsure. */
  E.pruneXObjects = function (doc, page) {
    var L = PDFLib, node = page.node, res = node.Resources();
    if (!(res instanceof L.PDFDict)) return true;
    var xo = res.lookup(N('XObject'));
    if (!(xo instanceof L.PDFDict)) return true;
    var cs = node.Contents(), list = cs instanceof L.PDFArray ? cs.asArray().map(function (r) { return doc.context.lookup(r); }) : [cs], used = new Set(), ok = true;
    list.forEach(function (s) {
      var b = s ? contentBytes(s) : new Uint8Array(0);
      if (!b) { ok = false; return; }
      var txt = '', CH = 0x8000;
      for (var i = 0; i < b.length; i += CH) txt += String.fromCharCode.apply(null, b.subarray(i, i + CH));
      var re = /\/([^\s/[\]()<>{}%]+)\s*Do\b/g, m;
      while ((m = re.exec(txt))) used.add(m[1].replace(/#([0-9a-fA-F]{2})/g, function (_, hx) { return String.fromCharCode(parseInt(hx, 16)); }));
    });
    if (!ok) return false;
    var nx = doc.context.obj({});
    xo.keys().forEach(function (key) { if (used.has(key.decodeText())) nx.set(key, xo.get(key)); }); // compat-ok: pdf-lib returns an array here, not an iterator
    var nr = res.clone(doc.context);
    nr.set(N('XObject'), nx);
    node.set(N('Resources'), nr); // i18n-ignore: PDF names / font names / producer, not UI
    return true;
  };
  /** Page-level entries that can hold stale previews or private data. */
  E.stripPageExtras = function (page) { ['Thumb', 'PieceInfo', 'Metadata'].forEach(function (k) { page.node.delete(N(k)); }); }; // i18n-ignore: PDF names / font names / producer, not UI
})();
