/* Slop PDF — the document's watermark on a page. The document keeps the site-wide watermark spec (shared/watermark/spec.js)
   in stamps.wm; each page maps it onto PDF watermark layers at its own size (SlopWatermarkSpec.toPdfLayers: sizes from
   the page's shorter side, like a picture), and each layer that applies to the page becomes a synthetic text or image
   annotation (one renderer for the on-screen preview and the exporter), drawn into the page content bottom layer first.
   Geometry: core/watermark.js. A document from before the spec (stamps.watermarks or stamps.watermark) is read through
   SlopWatermarkSpec.fromPdfLayers on its first page.
     E.watermarkSpec(stamps) → spec ; E.watermarkAnnots(p, index, total, stamps) → [annotation] ; E.logoAsset(layer) → asset */
(function () {
  'use strict';
  var SP = window.SP, E = SP.engine, WM = window.SlopPdfWm, S = window.SlopWatermarkSpec;
  var ids = new Map(); // logo data URL → asset id

  /** The spec of a document's stamps (a copy, normalised). */
  E.watermarkSpec = function (stamps) {
    stamps = stamps || E.state.stamps || {};
    if (stamps.wm) return S.normalize(stamps.wm);
    var layers = WM.fromStamps(stamps);
    if (!layers.length) return S.normalize({ layers: [] });
    var p0 = E.state.pages && E.state.pages[0], vs = p0 ? E.viewSize(p0) : { w: 612, h: 792 };
    return S.fromPdfLayers(layers, { w: vs.w, h: vs.h, asset: function (id) { return E.assets.get(id) || null; } });
  };
  /** The asset that holds a logo layer's picture (made once per logo, kept with the document's assets). */
  E.logoAsset = function (L) {
    var id = ids.get(L.logo);
    if (id && E.assets.get(id)) return E.assets.get(id);
    var mime = (/^data:([^;,]+)/.exec(L.logo) || [])[1] || 'image/png';
    var a = E.addAsset({ mime: mime, url: L.logo, w: L.logoW || 100, h: L.logoH || 100, name: L.logoName || 'logo' });
    ids.set(L.logo, a.id);
    return a;
  };
  function measure(font, text, size, L) { return E.measure(text, E.fontKey({ font: font, bold: !!(L && L.bold) }), size); }

  /** Size of a layer's content at its own scale: text measured with the standard font, or the logo's width. */
  function contentOf(P) {
    if (P.kind === 'image') {
      var as = E.assets.get(P.asset);
      if (!as || !as.w || !as.h) return null;
      return { w: P.size, h: P.size * as.h / as.w };
    }
    var t = E.textLayout({ text: P.text || ' ', font: P.font, bold: P.bold, size: P.size });
    return { w: t.w, h: t.h };
  }
  /** Synthetic annotations for the watermark layers that apply to page `index` of `total`, bottom first. */
  E.watermarkAnnots = function (p, index, total, stamps) {
    var spec = E.watermarkSpec(stamps), out = [];
    if (!S.visible(spec).length) return out;
    var g = E.geom(p), R = E.rotation(p), vs = E.viewSize(p);
    var layers = S.toPdfLayers(spec, vs.w, vs.h, { measure: measure, asset: function (L) { return E.logoAsset(L).id; } });
    layers.forEach(function (P) {
      var L = WM.normalize(P);
      if (!WM.appliesTo(L, index, total)) return;
      var content = contentOf(L);
      if (!content) return;
      var b = WM.box(L, vs.w, vs.h, content), c = E.toPage(R, g.W, g.H, b.cx, b.cy);
      out.push({
        id: 'wm:' + L.id, type: L.kind === 'image' ? 'image' : 'text', asset: L.asset, text: L.text, font: L.font, bold: L.bold,
        size: L.size, color: L.colour, opacity: L.opacity, rot: R + L.rot, cx: c[0], cy: c[1], w: content.w, h: content.h
      });
    });
    return out;
  };
})();
