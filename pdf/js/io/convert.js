/* Slop PDF — post-processing: lossy rasterise (compress), lossless re-save, pages to images, text extraction, images to PDF. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine;

  /* ------------------------------------------------- post-processing tools */
  async function renderOut(doc, i, dpi, maxPx) {
    var pg = await doc.getPage(i + 1), scale = dpi / 72, vp = pg.getViewport({ scale: scale });
    var lim = maxPx || 7000, k = Math.min(1, lim / Math.max(vp.width, vp.height));
    if (k < 1) { scale *= k; vp = pg.getViewport({ scale: scale }); }
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(vp.width)); c.height = Math.max(1, Math.round(vp.height));
    var cx = c.getContext('2d', { alpha: false }); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
    var lib = await E.pdfjs();
    await pg.render({ canvasContext: cx, viewport: vp, annotationMode: lib.AnnotationMode.ENABLE }).promise;
    return { canvas: c, wPt: vp.width / scale, hPt: vp.height / scale };
  }
  /** Lossy compression: every page becomes a JPEG. */
  E.rasterize = async function (bytes, o) {
    var doc = await E.openOutput(bytes), out = await PDFLib.PDFDocument.create();
    try {
      for (var i = 0; i < doc.numPages; i++) {
        var r = await renderOut(doc, i, o.dpi || 110);
        var jb = await U.blobToBytes(await U.canvasToBlob(r.canvas, 'image/jpeg', o.quality || 0.7));
        r.canvas.width = r.canvas.height = 0;
        var img = await out.embedJpg(jb), pg = out.addPage([r.wPt, r.hPt]);
        pg.drawImage(img, { x: 0, y: 0, width: r.wPt, height: r.hPt });
        if (o.onProgress) o.onProgress((i + 1) / doc.numPages);
      }
    } finally { await doc.destroy(); }
    E.applyMeta(out);
    return out.save({ useObjectStreams: true });
  };
  /** Lossless re-save: object streams + dropping unreachable objects. */
  E.resave = async function (bytes) {
    var d = await PDFLib.PDFDocument.load(bytes, { updateMetadata: false });
    E._gc(d);
    return d.save({ useObjectStreams: true, updateFieldAppearances: false });
  };
  E.toImages = async function (bytes, o) {
    var doc = await E.openOutput(bytes), files = [], mime = o.format === 'jpeg' ? 'image/jpeg' : 'image/png', ext = o.format === 'jpeg' ? 'jpg' : 'png';
    var idx = o.indices || Array.from({ length: doc.numPages }, function (_, i) { return i; });
    try {
      for (var k = 0; k < idx.length; k++) {
        var r = await renderOut(doc, idx[k], o.dpi || 150, 12000);
        var b = await U.blobToBytes(await U.canvasToBlob(r.canvas, mime, o.quality || 0.9));
        r.canvas.width = r.canvas.height = 0;
        files.push({ name: (o.base || 'page') + '-' + String(idx[k] + 1).padStart(String(doc.numPages).length, '0') + '.' + ext, data: b, mime: mime });
        if (o.onProgress) o.onProgress((k + 1) / idx.length);
      }
    } finally { await doc.destroy(); }
    return files;
  };
  E.extractText = async function (bytes) {
    var doc = await E.openOutput(bytes), parts = [];
    try {
      for (var i = 0; i < doc.numPages; i++) {
        var pg = await doc.getPage(i + 1), tc = await pg.getTextContent(), s = '';
        tc.items.forEach(function (it) { if (typeof it.str === 'string') { s += it.str; if (it.hasEOL) s += '\n'; } });
        parts.push('— Page ' + (i + 1) + ' —\n' + s.replace(/[ \t]+\n/g, '\n').trim());
      }
    } finally { await doc.destroy(); }
    return parts.join('\n\n') + '\n';
  };

  /* ------------------------------------------------------------- images */
  function jpegOrientation(b) {
    if (b[0] !== 0xff || b[1] !== 0xd8) return 1;
    var o = 2;
    while (o + 4 < b.length) {
      if (b[o] !== 0xff) return 1;
      var marker = b[o + 1], len = (b[o + 2] << 8) | b[o + 3];
      if (marker === 0xe1 && b[o + 4] === 0x45 && b[o + 5] === 0x78 && b[o + 6] === 0x69 && b[o + 7] === 0x66) {
        var t = o + 10, le = b[t] === 0x49;
        var r16 = function (p) { return le ? b[p] | (b[p + 1] << 8) : (b[p] << 8) | b[p + 1]; };
        var r32 = function (p) { return le ? (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0 : ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0; };
        var ifd = t + r32(t + 4), n = r16(ifd);
        for (var i = 0; i < n; i++) { var e = ifd + 2 + i * 12; if (r16(e) === 0x0112) return r16(e + 8); }
        return 1;
      }
      if (marker === 0xda) return 1;
      o += 2 + len;
    }
    return 1;
  }
  /** Normalises an image file to {mime, bytes, w, h} that pdf-lib can embed (PNG or JPEG). */
  E.prepareImage = async function (bytes, kind) {
    kind = kind || U.sniff(bytes);
    var blob = new Blob([bytes], { type: 'image/' + (kind === 'jpeg' ? 'jpeg' : kind) });
    var bmp = await createImageBitmap(blob);
    var w = bmp.width, h = bmp.height;
    if ((kind === 'jpeg' && jpegOrientation(bytes) === 1) || kind === 'png') { bmp.close(); return { mime: kind === 'jpeg' ? 'image/jpeg' : 'image/png', bytes: bytes, w: w, h: h }; }
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var cx = c.getContext('2d');
    if (kind === 'jpeg') { cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); }
    cx.drawImage(bmp, 0, 0); bmp.close();
    var type = kind === 'jpeg' ? 'image/jpeg' : 'image/png';
    var out = await U.blobToBytes(await U.canvasToBlob(c, type, 0.92));
    c.width = c.height = 0;
    return { mime: type, bytes: out, w: w, h: h };
  };
  /** items: [{bytes, kind}], o: {size:'fit'|'a4'|'letter', margin (pt), orientation:'auto'|'portrait'|'landscape'} */
  E.imagesToPdf = async function (items, o) {
    await E.libs();
    o = o || {};
    var out = await PDFLib.PDFDocument.create();
    for (var i = 0; i < items.length; i++) {
      var im = await E.prepareImage(items[i].bytes, items[i].kind);
      var img = im.mime === 'image/jpeg' ? await out.embedJpg(im.bytes) : await out.embedPng(im.bytes);
      var pw, ph, m = o.margin || 0;
      if (!o.size || o.size === 'fit') {
        pw = im.w * 0.75; ph = im.h * 0.75;
        var k = Math.min(1, 842 / Math.max(pw, ph)); pw *= k; ph *= k;
        pw += 2 * m; ph += 2 * m;
      } else {
        var sz = E.SIZES[o.size] || E.SIZES.a4; pw = sz[0]; ph = sz[1];
        var land = o.orientation === 'landscape' || (o.orientation !== 'portrait' && im.w > im.h);
        if (land) { var t = pw; pw = ph; ph = t; }
      }
      var page = out.addPage([pw, ph]);
      var aw = pw - 2 * m, ah = ph - 2 * m, s = Math.min(aw / im.w, ah / im.h);
      var dw = im.w * s, dh = im.h * s;
      page.drawImage(img, { x: (pw - dw) / 2, y: (ph - dh) / 2, width: dw, height: dh });
    }
    out.setProducer('Slop PDF · slopographic.com/pdf'); // i18n-ignore: PDF names / font names / producer, not UI
    return out.save();
  };
})();
