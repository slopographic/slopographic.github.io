/* SlopCut: animated graphics (clip kind 'graphic'). The shape is the SVG path data of shared/graphics (SlopGraphics),
   stroked on a frame-sized canvas like a title, so keyframes, masks, transitions and export treat it the same way.
   gfx.anim: draw (strokes draw on), pulse, bounce, pop or none, all clip-relative. gfx.size is a fraction of the frame
   height; a counter (id 'counter') counts up to gfx.value during the draw-on. Lengths of the sub-paths come from a
   hidden SVG path (getTotalLength), measured once per path. */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util;
  const GF = SE.gfx = {};
  const NS = 'http://www.w3.org/2000/svg';
  const cache = new Map(), lens = new Map(), paths = new Map();
  let meter = null;

  /** Length of one sub-path in the 100 box (measured in the page, once). */
  function lengthOf(d) {
    if (lens.has(d)) return lens.get(d);
    if (!meter) {
      meter = document.createElementNS(NS, 'svg');
      meter.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden');
      document.body.append(meter);
    }
    const el = document.createElementNS(NS, 'path');
    el.setAttribute('d', d); meter.append(el);
    const n = el.getTotalLength ? el.getTotalLength() : 100;
    el.remove(); lens.set(d, n);
    return n;
  }
  const pathOf = (d) => { if (!paths.has(d)) paths.set(d, new Path2D(d)); return paths.get(d); };
  const ease = (x) => 1 - Math.pow(1 - U.clamp(x, 0, 1), 3);
  const back = (x) => { x = U.clamp(x, 0, 1); const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

  /** Motion at clip-relative time u: { p (draw-on 0..1), sc (scale), dy (fraction of the size), value (counter) }. */
  GF.stateAt = function (c, u) {
    const gf = c.gfx, D = Math.min(1.2, Math.max(0.2, c.dur * 0.5));
    const s = { p: 1, sc: 1, dy: 0, value: null };
    if (gf.anim === 'draw') s.p = ease(u / D);
    if (gf.anim === 'pop') s.sc = u < 0.4 ? Math.max(0, back(u / 0.4)) : 1;
    if (gf.anim === 'pulse') s.sc = 1 + 0.12 * Math.sin((2 * Math.PI * u) / 1);
    if (gf.anim === 'bounce') s.dy = -Math.abs(Math.sin((Math.PI * u) / 0.6)) * 0.12 * Math.max(0, 1 - u / 2.5);
    if (gf.id === 'counter') s.value = Math.round((+gf.value || 0) * ease(u / D));
    return s;
  };

  /** Frame-sized canvas (W × H output px, k = output px per project px) with the graphic at clip time u. */
  GF.canvas = function (c, W, H, k, u) {
    const gf = c.gfx, spec = window.SlopGraphics && SlopGraphics.get(gf.id);
    const s = GF.stateAt(c, u), size = Math.max(1, gf.size * H);
    const key = [W, H, gf.id, gf.color, gf.size, gf.value, gf.anim, s.p.toFixed(3), s.sc.toFixed(3), s.dy.toFixed(3), s.value].join('|');
    const hit = cache.get(c.id);
    if (hit && hit.key === key) return hit.cv;
    const cv = hit && hit.cv.width === W && hit.cv.height === H ? hit.cv : U.canvas(W, H);
    const g = cv.getContext('2d');
    g.clearRect(0, 0, W, H);
    if (spec) {
      g.save();
      g.translate(W / 2, H / 2 + s.dy * size);
      g.scale(s.sc, s.sc);
      g.scale(size / 100, size / 100);
      g.translate(-50, -50);
      g.strokeStyle = gf.color; g.lineWidth = SlopGraphics.STROKE; g.lineCap = 'round'; g.lineJoin = 'round';
      for (const d of spec.paths) {
        const L = lengthOf(d);
        g.setLineDash(s.p < 1 ? [L * s.p, L + 1] : []);
        g.stroke(pathOf(d));
      }
      g.restore();
    }
    if (s.value != null) { // counter: the number, counted up over the draw-on
      g.save();
      g.translate(W / 2, H / 2 + s.dy * size);
      g.scale(s.sc, s.sc);
      g.fillStyle = gf.color; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '800 ' + Math.max(1, Math.round(size * 0.36)) + 'px "Archivo", sans-serif';
      g.fillText(String(s.value), 0, 0);
      g.restore();
    }
    cache.set(c.id, { key, cv });
    if (cache.size > 64) cache.delete(cache.keys().next().value);
    return cv;
  };
})();
