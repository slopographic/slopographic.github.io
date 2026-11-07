/* PhotoSlop core: image size, canvas size and resampling (one history step each) */
'use strict';

/** Resampling choices shared by Image Size and Free Transform. */
const RESAMPLE_MODES = trPairs([['nearest', ''], ['bilinear', ''], ['bicubic', '']], 'photoslop.core.resample_');
/** Canvas only offers three quality levels: 'low' is bilinear, 'high' is the browser's bicubic-class filter. */
function setInterp(g, mode) {
  g.imageSmoothingEnabled = mode !== 'nearest';
  g.imageSmoothingQuality = mode === 'bilinear' ? 'low' : 'high';
}
/** Scale a canvas to w × h. Bicubic steps down in halves first, so large reductions stay smooth. */
function resampleCanvas(c, w, hh, mode = 'bicubic') {
  if (mode === 'bicubic') {
    while (c.width / 2 >= w && c.height / 2 >= hh && c.width > 2) {
      const t = mkCanvas(c.width / 2, c.height / 2), tg = cx(t); setInterp(tg, 'bicubic'); tg.drawImage(c, 0, 0, t.width, t.height); c = t;
    }
  }
  const out = mkCanvas(w, hh), g = cx(out); setInterp(g, mode); g.drawImage(c, 0, 0, w, hh);
  return out;
}
/** Image Size: every layer, mask and text model scaled to w × h px. mode: nearest | bilinear | bicubic (true/false = bicubic/nearest). */
function imageSize(w, hh, mode = 'bicubic') {
  mode = mode === true ? 'bicubic' : mode === false ? 'nearest' : mode;
  const sx = w / D.w, sy = hh / D.h;
  const sc = (c) => resampleCanvas(c, Math.max(1, Math.round(c.width * sx)), Math.max(1, Math.round(c.height * sy)), mode);
  D.layers = D.layers.map((L) => {
    const mask = L.mask && Object.assign({}, L.mask, { canvas: sc(L.mask.canvas), x: Math.round(L.mask.x * sx), y: Math.round(L.mask.y * sy) });
    return Object.assign({}, L, { canvas: sc(L.canvas), x: Math.round(L.x * sx), y: Math.round(L.y * sy), mask, text: L.text && scaleTextModel(L.text, sx, sy), shape: null });
  });
  remapGuides((g) => ({ o: g.o, pos: g.pos * (g.o === 'v' ? sx : sy) }));
  D.w = Math.round(w); D.h = Math.round(hh); D.sel = null;
  commit(tr('photoslop.core.step_image_size'));
}
/** The new area of a canvas resize as one layer at the bottom (the other layers are untouched). null when nothing is new. */
function canvasFillLayer(nw, nh, dx, dy, color) {
  const cl = (v, a, b) => Math.min(b, Math.max(a, v));
  // The old canvas lands at (dx, dy) in the new one: the new area is the new rectangle minus that rectangle.
  const y0 = cl(dy, 0, nh), y1 = cl(dy + D.h, 0, nh), x0 = cl(dx, 0, nw), x1 = cl(dx + D.w, 0, nw);
  const strips = [[0, 0, nw, y0], [0, y1, nw, nh], [0, y0, x0, y1], [x1, y0, nw, y1]].filter(([a, b, c, d]) => c > a && d > b);
  if (!strips.length) return null;
  const c = mkCanvas(nw, nh), g = cx(c); g.fillStyle = color;
  for (const [a, b, e, f] of strips) g.fillRect(a, b, e - a, f - b);
  return newLayerRecord({ name: 'Canvas Fill', canvas: c, x: 0, y: 0 }); // i18n-ignore: layer name
}
/** Canvas Size: resize the document. dx,dy = where the old (0,0) lands. fill: a colour for the new area (a bottom layer), or null for transparent. */
function resizeCanvas(w, hh, dx, dy, label = tr('photoslop.core.step_canvas_size'), fill = null) {
  const nw = Math.round(w), nh = Math.round(hh);
  const bottom = fill ? canvasFillLayer(nw, nh, dx, dy, fill) : null;
  D.layers = (bottom ? [bottom] : []).concat(D.layers.map((L) => Object.assign({}, L, {
    x: L.x + dx, y: L.y + dy,
    mask: L.mask && Object.assign({}, L.mask, { x: L.mask.x + dx, y: L.mask.y + dy }),
    text: L.text && Object.assign({}, L.text, { x: L.text.x + dx, y: L.text.y + dy }),
  })));
  D.w = nw; D.h = nh;
  D.sel = null; remapGuides((g) => ({ o: g.o, pos: g.pos + (g.o === 'v' ? dx : dy) }));
  commit(label);
}
