/* Slop Slides: the PDF writer's drawing of the display list (render/scene.js) with pdf-lib operators: groups (their
   matrix, opacity and clip), paths (solid fills, linear and radial gradients as PDF shadings, outlines with width, dash
   and caps), pictures (embedded once per file, cropped or "cover" by a clip) and text (pdf-text.js). Opacity uses
   ExtGState dictionaries, one per value on each page. Shadows are left out (a PDF has no blur). Exposes SS.pdfPaint:
   page(env, scene) draws one scene; env carries doc, page, ops, fonts, images and the per-page resource caches. */
(function () {
  'use strict';
  var SS = window.SS, PM = SS.pdfMath, U = SS.util;
  var G = SS.pdfPaint = {};

  function L() { return window.PDFLib; }
  function pathOps(ops, path) {
    var l = L();
    path.forEach(function (c) {
      if (c[0] === 'M') ops.push(l.moveTo(c[1], c[2]));
      else if (c[0] === 'L') ops.push(l.lineTo(c[1], c[2]));
      else if (c[0] === 'C') ops.push(l.appendBezierCurve(c[1], c[2], c[3], c[4], c[5], c[6]));
      else ops.push(l.closePath());
    });
  }
  /** A PDF function for gradient stops (one exponential piece, or a stitching function of several). */
  function gradFn(ctx, stops) {
    var s = PM.stops(stops), parts = s.pieces.map(function (p) { return ctx.obj({ FunctionType: 2, Domain: [0, 1], C0: p[0], C1: p[1], N: 1 }); });
    if (parts.length === 1) return parts[0];
    return ctx.obj({ FunctionType: 3, Domain: [0, 1], Functions: parts, Bounds: s.bounds, Encode: s.encode });
  }
  function resource(env, kind, prefix, obj) {
    var l = L(), res = env.page.node.normalizedEntries().Resources, dict = res.lookupMaybe(l.PDFName.of(kind), l.PDFDict);
    if (!dict) { dict = env.doc.context.obj({}); res.set(l.PDFName.of(kind), dict); }
    var name = prefix + (++env.seq);
    dict.set(l.PDFName.of(name), env.doc.context.register(obj));
    return name;
  }
  /** The ExtGState name for a fill and stroke opacity a (cached per page). */
  function alphaName(env, a) {
    var k = Math.round(a * 1000) / 1000;
    if (!env.gs[k]) env.gs[k] = resource(env, 'ExtGState', 'GSa', env.doc.context.obj({ Type: 'ExtGState', ca: k, CA: k })); // i18n-ignore
    return env.gs[k];
  }
  function shading(env, p) {
    var ctx = env.doc.context, fn = gradFn(ctx, p.stops);
    var sh = p.type === 'radial' ? { ShadingType: 3, ColorSpace: 'DeviceRGB', Coords: [p.cx, p.cy, 0, p.cx, p.cy, p.r], Function: fn, Extend: [true, true] } // i18n-ignore
      : { ShadingType: 2, ColorSpace: 'DeviceRGB', Coords: [p.x0, p.y0, p.x1, p.y1], Function: fn, Extend: [true, true] }; // i18n-ignore
    return resource(env, 'Shading', 'Sh', ctx.obj(sh)); // i18n-ignore
  }

  function drawPath(env, n, alpha) {
    var l = L(), ops = env.ops;
    if (n.fill) {
      var f = n.fill, a = alpha * (f.alpha == null ? 1 : f.alpha);
      ops.push(l.pushGraphicsState());
      if (a < 1) ops.push(l.setGraphicsState(alphaName(env, a)));
      pathOps(ops, n.path);
      if (f.type === 'solid') {
        var c = PM.rgb(f.color);
        ops.push(l.setFillingRgbColor(c[0], c[1], c[2]), n.fillRule === 'evenodd' ? l.PDFOperator.of('f*') : l.fill());
      } else {
        ops.push(n.fillRule === 'evenodd' ? l.clipEvenOdd() : l.clip(), l.endPath(), l.PDFOperator.of('sh', [l.PDFName.of(shading(env, f))]));
      }
      ops.push(l.popGraphicsState());
    }
    if (n.stroke && n.stroke.width > 0) {
      var s = n.stroke, sa = alpha * (s.alpha == null ? 1 : s.alpha), sc = PM.rgb(s.color);
      ops.push(l.pushGraphicsState());
      if (sa < 1) ops.push(l.setGraphicsState(alphaName(env, sa)));
      ops.push(l.setStrokingRgbColor(sc[0], sc[1], sc[2]), l.setLineWidth(s.width), l.setDashPattern(PM.dash(s.dash, s.width), 0),
        l.setLineCap(s.dash === 'dot' || s.cap === 'round' ? l.LineCapStyle.Round : l.LineCapStyle.Butt), l.setLineJoin(s.join === 'round' ? l.LineJoinStyle.Round : l.LineJoinStyle.Miter));
      pathOps(ops, n.path);
      ops.push(l.stroke(), l.popGraphicsState());
    }
  }
  function drawImage(env, n, alpha) {
    var l = L(), img = env.images[n.media];
    if (!img) return;
    var at = PM.imagePlace(n, img.width, img.height), m = PM.imageMatrix(at.img), c = at.clip, ops = env.ops;
    ops.push(l.pushGraphicsState());
    if (alpha < 1) ops.push(l.setGraphicsState(alphaName(env, alpha)));
    ops.push(l.moveTo(c.x, c.y), l.lineTo(c.x + c.w, c.y), l.lineTo(c.x + c.w, c.y + c.h), l.lineTo(c.x, c.y + c.h), l.closePath(), l.clip(), l.endPath());
    ops.push(l.concatTransformationMatrix(m[0], m[1], m[2], m[3], m[4], m[5]), l.drawObject(env.imageName(img)), l.popGraphicsState());
  }
  function drawNode(env, n, alpha, m) {
    var l = L();
    if (n.k === 'group') {
      if (n.opacity === 0) return;
      var gm = n.m || [1, 0, 0, 1, 0, 0], a = alpha * (n.opacity == null ? 1 : n.opacity);
      env.ops.push(l.pushGraphicsState(), l.concatTransformationMatrix(gm[0], gm[1], gm[2], gm[3], gm[4], gm[5]));
      if (n.clip) { pathOps(env.ops, n.clip); env.ops.push(l.clip(), l.endPath()); }
      var mm = U.mat.mul(m, gm);
      n.children.forEach(function (c) { drawNode(env, c, a, mm); });
      env.ops.push(l.popGraphicsState());
    } else if (n.k === 'path') drawPath(env, n, alpha);
    else if (n.k === 'image') drawImage(env, n, alpha);
    else if (n.k === 'text') { env.m = m; SS.pdfText.draw(env, n, alpha); }
  }

  /** Draws one scene ({ w, h, items }) onto env.page. */
  G.page = function (env, scene) {
    var l = L(), pm = PM.pageMatrix(scene.h), names = new Map(), fontNames = new Map();
    env.ops = []; env.gs = {}; env.seq = 0;
    env.alpha = function (a) { return alphaName(env, a); };
    env.imageName = function (img) { if (!names.has(img)) names.set(img, env.page.node.newXObject('Im', img.ref)); return names.get(img); }; // i18n-ignore
    env.fontName = function (font) { if (!fontNames.has(font)) fontNames.set(font, env.page.node.newFontDictionary(font.name, font.ref)); return fontNames.get(font); };
    env.link = function (x, y, w, h, url) {
      var pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(function (p) { var q = U.mat.apply(env.m, p[0], p[1]); return [q[0], scene.h - q[1]]; });
      var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; }), ctx = env.doc.context;
      var annot = ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: [Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)], Border: [0, 0, 0], // i18n-ignore
        A: { Type: 'Action', S: 'URI', URI: l.PDFString.of(url) } }); // i18n-ignore
      env.page.node.addAnnot(ctx.register(annot));
    };
    env.ops.push(l.pushGraphicsState(), l.concatTransformationMatrix(pm[0], pm[1], pm[2], pm[3], pm[4], pm[5]));
    scene.items.forEach(function (n) { drawNode(env, n, 1, [1, 0, 0, 1, 0, 0]); });
    env.ops.push(l.popGraphicsState());
    for (var i = 0; i < env.ops.length; i += 2000) env.page.pushOperators.apply(env.page, env.ops.slice(i, i + 2000));
  };
})();
