/* Slop PDF — the PDF writer's watermark layers (no DOM). A layer is a text or an image (logo) with a position (a 3 by 3
   anchor on the visible page plus an offset in points), a size in points, an opacity, a rotation (degrees,
   counter-clockwise) and a page range. The document keeps the one site-wide watermark spec (shared/watermark/spec.js) in
   state.stamps.wm; SlopWatermarkSpec.toPdfLayers maps it onto these layers for each page, and the macros' Watermark
   step (macro/ops-draw.js) writes them. A document saved before the spec kept these layers in stamps.watermarks (or one
   watermark object in stamps.watermark): fromStamps reads both. Page ranges are the spec's parser (load spec.js first).
   Loaded as a classic script (window.SlopPdfWm) and in a vm for tests/node/pdf-watermark.test.mjs. */
(function () {
  'use strict';
  var W = window.SlopPdfWm = window.SlopPdfWm || {};
  var FONTS = ['Helvetica', 'Times', 'Courier']; // i18n-ignore: PDF names / font names / producer, not UI
  W.ANCHORS = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'];
  W.ANCHOR_LABELS = { tl: 'Top left', tc: 'Top centre', tr: 'Top right', ml: 'Middle left', mc: 'Centre', mr: 'Middle right', bl: 'Bottom left', bc: 'Bottom centre', br: 'Bottom right' }; // i18n-ignore: unused by the UI
  var COL = { l: 0, c: 0.5, r: 1 }, ROW = { t: 0, m: 0.5, b: 1 };
  var seq = 0;
  function num(v, lo, hi, d) { var n = typeof v === 'number' ? v : parseFloat(v); if (!isFinite(n)) n = d; return Math.min(hi, Math.max(lo, n)); }
  W.uid = function () { seq++; return 'w' + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 6) + seq.toString(36); };

  /** Clean copy of a layer: every field in range, unknown fields dropped, an id always present. */
  W.normalize = function (L) {
    L = L || {};
    var anchor = W.ANCHORS.indexOf(L.anchor) >= 0 ? L.anchor : 'mc';
    var colour = /^#[0-9a-f]{6}$/i.test(String(L.colour || '')) ? String(L.colour).toLowerCase() : '#888888';
    return {
      id: typeof L.id === 'string' && L.id ? L.id : W.uid(),
      kind: L.kind === 'image' ? 'image' : 'text',
      text: String(L.text == null ? '' : L.text).slice(0, 200),
      font: FONTS.indexOf(L.font) >= 0 ? L.font : 'Helvetica', // i18n-ignore: PDF names / font names / producer, not UI
      bold: !!L.bold,
      colour: colour,
      size: num(L.size, 4, 1000, 60),
      opacity: num(L.opacity, 0, 1, 0.25),
      rot: num(L.rot, -180, 180, 0),
      anchor: anchor,
      dx: num(L.dx, -5000, 5000, 0),
      dy: num(L.dy, -5000, 5000, 0),
      asset: typeof L.asset === 'string' ? L.asset : '',
      pages: String(L.pages == null ? '' : L.pages).slice(0, 120),
      show: L.show !== false
    };
  };
  W.normalizeList = function (list) {
    return (Array.isArray(list) ? list : []).filter(function (x) { return x && typeof x === 'object'; }).map(W.normalize);
  };
  /** The layers of a document's stamps. A file saved before layers had one watermark object, read as one layer. */
  W.fromStamps = function (stamps) {
    if (!stamps) return [];
    if (Array.isArray(stamps.watermarks)) return W.normalizeList(stamps.watermarks);
    var old = stamps.watermark;
    if (!old || !old.text) return [];
    return [W.normalize({ id: 'wm-legacy', kind: 'text', text: old.text, font: old.font, bold: old.bold !== false, colour: old.color,
      size: old.size || 60, opacity: old.opacity == null ? 0.25 : old.opacity, rot: old.angle == null ? 45 : old.angle, anchor: 'mc' })];
  };

  /** Page indices (0-based, sorted) that a page range names: the spec's one parser (2, 1-3, 4-, last, odd, even, all). */
  W.parsePages = function (spec, n) { return window.SlopWatermarkSpec.parsePages(spec, n); };
  /** Whether a layer is drawn on page `index` (0-based) of `total` pages. A range that cannot be read draws nowhere. */
  W.appliesTo = function (L, index, total) {
    if (!L || !L.show) return false;
    if (!String(L.pages || '').trim()) return true;
    try { return W.parsePages(L.pages, total).indexOf(index) >= 0; } catch (e) { return false; }
  };

  /** Where a layer sits on a visible page W×H (points, top-left origin, y down). content is {w, h}: the size of the
      text or logo at its own scale. Returns the centre, the size and the rotation of the box. The anchor is the
      page point (0, 0.5 or 1 of each side), the box is aligned to it, then the offset (dx right, dy down) is added. */
  W.box = function (L, pageW, pageH, content) {
    var w = content.w, h = content.h, col = COL[L.anchor.charAt(1)], row = ROW[L.anchor.charAt(0)];
    var left = col * pageW - col * w + L.dx, top = row * pageH - row * h + L.dy;
    return { cx: left + w / 2, cy: top + h / 2, w: w, h: h, rot: L.rot };
  };

  /** Ids of the logo assets the layers use (saved with the edit log so a replay finds them). */
  W.assetIds = function (list) {
    var seen = {};
    (list || []).forEach(function (L) { if (L && L.kind === 'image' && L.asset) seen[L.asset] = true; });
    return Object.keys(seen);
  };
})();
