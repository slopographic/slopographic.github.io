/* SlopIsolate — compose the final picture from an active cutout: background (transparent, colour,
 * gradient or blurred original), drop shadow and crop. Pure canvas work, no DOM state. */
(function () {
  'use strict';
  const CO = window.CO, U = CO.util;
  const C = CO.compose = {};

  /** Tight box around the alpha (mask > 8) of an image. Returns { x, y, w, h } or null if empty. */
  C.bbox = function (mask, w, h) {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        if (mask[row + x] <= 8) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  };

  /** The matte maths of the main thread (the live brush preview and the queue's result thumbnails): threshold and
   *  softness on the base mask, then the brush edit (128 = untouched). Returns alpha(base, edit) → 0..255. The worker does
   *  the same, plus feather and decontamination, for the full result. */
  C.alphaFn = function (s) {
    s = s || {};
    const th = s.threshold == null ? 0.5 : s.threshold, sf = s.softness == null ? 1 : s.softness;
    const lo = (th - sf / 2) * 255, hi = (th + sf / 2) * 255, hard = hi - lo < 1, k = hard ? 0 : 255 / (hi - lo), cut = th * 255;
    return (b, e) => {
      let a = hard ? (b >= cut ? 255 : 0) : Math.min(255, Math.max(0, (b - lo) * k));
      if (e > 128) a = a + (255 - a) * (e - 128) / 127; else if (e < 128) a = a * e / 128;
      return a;
    };
  };

  /** Mark part of the cut-out as changed (rect {x, y, x1, y1}; null: all of it). The next cutCanvas() copies only that
   *  part into the canvas it keeps: a brush step never makes a new full-size canvas (on an iPhone, a new 12 MP canvas
   *  per finger move ran the page out of memory within seconds and iOS reloaded it). */
  C.touch = function (act, rect) {
    act.rev = (act.rev || 0) + 1;
    if (!rect || act.cutAll) { act.cutAll = true; act.cutRect = null; return; }
    const d = act.cutRect;
    act.cutRect = d ? { x: Math.min(d.x, rect.x), y: Math.min(d.y, rect.y), x1: Math.max(d.x1, rect.x1), y1: Math.max(d.y1, rect.y1) } : { x: rect.x, y: rect.y, x1: rect.x1, y1: rect.y1 };
  };

  /** The canvas for a cutout's ImageData: one per active record, updated in place (see C.touch). */
  C.cutCanvas = function (act) {
    let c = act.cut;
    if (!c || c.width !== act.w || c.height !== act.h) { c = act.cut = U.canvas(act.w, act.h); act.cutAll = true; }
    const r = act.cutRect;
    if (act.cutAll) U.ctx(c).putImageData(act.cutout, 0, 0);
    else if (r && r.x1 > r.x && r.y1 > r.y) U.ctx(c).putImageData(act.cutout, 0, 0, r.x, r.y, r.x1 - r.x, r.y1 - r.y);
    act.cutAll = false; act.cutRect = null;
    return c;
  };

  /** Output rectangle in image pixels: the whole image, or the subject plus padding. */
  C.boxOf = function (it, act) {
    if (it.crop.mode !== 'subject' || !act.bbox) return { x: 0, y: 0, w: act.w, h: act.h };
    const p = Math.max(0, it.crop.pad | 0), b = act.bbox;
    const x = Math.max(0, b.x - p), y = Math.max(0, b.y - p);
    const x1 = Math.min(act.w, b.x + b.w + p), y1 = Math.min(act.h, b.y + b.h + p);
    return { x, y, w: x1 - x, h: y1 - y };
  };

  function paintBackground(g, it, act, box) {
    const bg = it.bg;
    if (bg.mode === 'color') { g.fillStyle = bg.color; g.fillRect(0, 0, box.w, box.h); }
    else if (bg.mode === 'gradient') {
      const a = (bg.angle || 0) * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a);
      const half = (Math.abs(box.w * dx) + Math.abs(box.h * dy)) / 2, cx = box.w / 2, cy = box.h / 2;
      const grad = g.createLinearGradient(cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half);
      grad.addColorStop(0, bg.gradA); grad.addColorStop(1, bg.gradB);
      g.fillStyle = grad; g.fillRect(0, 0, box.w, box.h);
    } else if (bg.mode === 'blur' && act.bitmap) {
      g.filter = `blur(${Math.max(0, bg.blur)}px)`;
      g.drawImage(act.bitmap, -box.x, -box.y, act.w, act.h);
      g.filter = 'none';
    }
  }

  /** Full-resolution picture for an item's look. Transparent backgrounds keep alpha. */
  /** into: a canvas to draw on again when it has the right size (the view's last one), so no new canvas is made. */
  C.render = function (it, act, into) {
    const box = C.boxOf(it, act), W = Math.max(1, Math.round(box.w)), H = Math.max(1, Math.round(box.h));
    const c = into && into.width === W && into.height === H ? into : U.canvas(box.w, box.h), g = U.ctx(c);
    if (c === into) { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H); }
    paintBackground(g, it, act, box);
    const sh = it.shadow;
    if (sh.on && sh.opacity > 0) {
      g.shadowColor = U.rgba(sh.color, sh.opacity);
      g.shadowBlur = Math.max(0, sh.blur) * 4;
      g.shadowOffsetX = sh.x; g.shadowOffsetY = sh.y;
    }
    g.drawImage(C.cutCanvas(act), -box.x, -box.y);
    g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetX = 0; g.shadowOffsetY = 0;
    return c;
  };

  /** Grey view of the mask (white = keep), cropped like the result. into: the last one, drawn again when the size fits;
   *  its full-size grey picture and pixels stay on the record, so a brush step in this view makes no new ones. */
  C.maskCanvas = function (it, act, into) {
    const box = C.boxOf(it, act), n = act.w * act.h;
    if (!act.greyImg || act.greyImg.width !== act.w || act.greyImg.height !== act.h) { act.greyImg = new ImageData(act.w, act.h); act.greyImg.data.fill(255); }
    if (!act.grey || act.grey.width !== act.w || act.grey.height !== act.h) act.grey = U.canvas(act.w, act.h);
    const d = act.greyImg.data, m = act.mask;
    for (let i = 0; i < n; i++) { const v = m[i]; d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v; }
    U.ctx(act.grey).putImageData(act.greyImg, 0, 0);
    const W = Math.max(1, Math.round(box.w)), H = Math.max(1, Math.round(box.h));
    const c = into && into.width === W && into.height === H ? into : U.canvas(box.w, box.h), g = U.ctx(c);
    g.clearRect(0, 0, W, H);
    g.drawImage(act.grey, -box.x, -box.y);
    return c;
  };
})();
