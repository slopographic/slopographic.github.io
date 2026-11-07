/* Slop PDF — a page object as a file of its own: an image as its stored stream (a JPEG stays the JPEG the PDF holds, an
   8-bit Flate image is decoded to PNG; an inline JPEG is its own bytes), anything else as a PNG cut from the page drawn at
   the image's resolution; a placed form or a vector group as SVG (core/content-svg.js, its paths in their colours).
     S.obj.file(p, o) → Promise { blob, name, type }      S.obj.svg(p, o) → Promise SVG text (forms and vector groups)
   Used by the selection bar (Save image, Open in…, obj-bar.js) and the assistant commands. Classic script. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, Ed = SP.editor, S = Ed._, O = S.obj, Res = window.SlopPdfRes, Sv = window.SlopPdfSvg, Lx = window.SlopPdfLex;

  function base(p) { var f = E.fileOfPage(p); while (f && f.derived && E.files.get(f.derived.from)) f = E.files.get(f.derived.from); return String((f && f.name) || 'page').replace(/\.pdf$/i, ''); }
  function nameOf(p, o, ext) { return base(p) + '-p' + (E.indexOf(p.id) + 1) + '-' + (o.name || o.kind) + '.' + ext; }

  /** The object's area of the page drawn by pdf.js, as a PNG (scale: device px per point). */
  async function cut(p, o, scale) {
    var f = E.fileOfPage(p), r = O.rect(p, o), g = E.geom(p), k = Math.max(1, Math.min(scale || 2, 8, Math.sqrt(40e6 / (g.W * g.H))));
    var big = await E.renderToCanvas(f, p.i, k), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(r.w * k)); c.height = Math.max(1, Math.round(r.h * k));
    c.getContext('2d').drawImage(big, r.x * k, r.y * k, r.w * k, r.h * k, 0, 0, c.width, c.height);
    big.width = big.height = 0;
    var blob = await U.canvasToBlob(c, 'image/png');
    c.width = c.height = 0;
    return blob;
  }
  /** The scale that draws the object at about its own pixels (an image), else 2 px per point. */
  function scaleFor(p, o) {
    if (!o.w || !o.h) return 2;
    var r = O.rect(p, o);
    return Math.max(1, Math.min(8, Math.max(o.w / Math.max(r.w, 1), o.h / Math.max(r.h, 1))));
  }
  O.file = async function (p, o) {
    var f = E.fileOfPage(p);
    if (o.kind === 'image' && o.ref) {
      var doc = await S.strip.load(f.bytes), found = await window.SlopPdfParts.scan(PDFLib, doc, [p.i], { fid: 'obj', file: f.name });
      var im = found.images.filter(function (x) { return x.key === 'obj:' + o.ref; })[0];
      if (im && im.kind !== 'skip') {
        var out = await SP.assets.entries([im], []);
        if (out.entries.length) { var jpg = im.kind === 'jpeg'; return { blob: new Blob([out.entries[0].data], { type: jpg ? 'image/jpeg' : 'image/png' }), name: nameOf(p, o, jpg ? 'jpg' : 'png'), type: jpg ? 'image/jpeg' : 'image/png' }; }
      }
    }
    if (o.kind === 'inline' && /^(DCT|DCTDecode)$/.test(o.filter || '')) {
      var c = await O.source(p), op = c.ops[o.a], t = c.text.slice(op.s, op.e), at = t.indexOf('ID') + 3, end = t.lastIndexOf('EI');
      var bytes = new Uint8Array(end - at); for (var i = 0; i < bytes.length; i++) bytes[i] = t.charCodeAt(at + i) & 255;
      while (bytes.length && /\s/.test(String.fromCharCode(bytes[bytes.length - 1]))) bytes = bytes.subarray(0, bytes.length - 1);
      return { blob: new Blob([bytes], { type: 'image/jpeg' }), name: nameOf(p, o, 'jpg'), type: 'image/jpeg' };
    }
    if (o.kind === 'form' || o.kind === 'vector') return { blob: new Blob([await O.svg(p, o)], { type: 'image/svg+xml' }), name: nameOf(p, o, 'svg'), type: 'image/svg+xml' };
    return { blob: await cut(p, o, scaleFor(p, o)), name: nameOf(p, o, 'png'), type: 'image/png' };
  };
  /** A PNG of any object (for an app that takes pictures: PhotoSlop), at about its own resolution. */
  O.png = async function (p, o) { return { blob: await cut(p, o, scaleFor(p, o)), name: nameOf(p, o, 'png'), type: 'image/png' }; };

  /** The page's content text, operators and resources (read once per file page). */
  var src = new Map();
  O.source = function (p) {
    var key = p.f + ':' + p.i;
    if (!src.has(key)) src.set(key, S.strip.load(E.fileOfPage(p).bytes).then(function (doc) {
      var pg = doc.getPage(p.i), c = Res.contentOf(doc, pg);
      return { text: c.text, ops: Lx.lex(c.text), res: Res.of(doc, pg.node.Resources()), doc: doc };
    }));
    return src.get(key);
  };
  /** A form or vector group as SVG, the size of its box in points. */
  O.svg = async function (p, o) {
    var c = await O.source(p), form = function (n) { var x = c.res.form(n); return x && x.ops ? x : null; };
    if (o.kind === 'form') {
      var fx = c.res.form(o.name);
      if (!fx || !fx.ops) throw new Error('This artwork could not be read');
      var nested = function (n) { var y = fx.res && fx.res.form(n); return y && y.ops ? y : null; };
      return Sv.toSVG(fx.ops, { box: o.box, ctm0: o.ctm, form: nested });
    }
    return Sv.toSVG(c.ops, { box: o.box, from: o.a, to: o.b, ctm0: window.SlopPdfObjs.ctms(c.ops)[o.a], form: form });
  };
})();
