/* PhotoSlop layer styles added to the stack (js/layers/fx.js): Inner Shadow, Inner Glow and
 * Gradient Overlay. Same contract as the styles in slop.js: fn(canvas, params, env) → canvas, where
 * the canvas holds the layer's pixels (padded) and the result is drawn in place of it. */
'use strict';

/** The shadow or glow that lies inside a shape's edge: the inverse of the shape, moved by (dx, dy),
 *  blurred, coloured, and kept inside the shape. Returns a canvas with the effect alone. */
function innerEdge(s, color, opacity, dx, dy, size) {
  const w = s.width, hh = s.height, hole = mkCanvas(w, hh), hg = cx(hole);
  hg.fillStyle = '#000'; hg.fillRect(0, 0, w, hh);
  hg.globalCompositeOperation = 'destination-out'; hg.drawImage(s, dx, dy);
  const shade = silhouette(size ? gaussian(hole, size) : hole, color, opacity);
  const sg = cx(shade); sg.globalCompositeOperation = 'destination-in'; sg.drawImage(s, 0, 0);
  return shade;
}

FILTERS.push(
  { id: 'inner-shadow', menu: 'style', cover: true, params: [{ k: 'color', lk: 'colour', type: 'color', v: '#000000' }, R('op', 'opacity', 0, 100, 75, { unit: '%' }), R('a', 'angle', -180, 180, 120, { unit: '°' }), R('dist', 'distance', 0, 300, 8, { unit: 'px' }), R('size', 'size', 0, 250, 10, { unit: 'px' })],
    fn: (s, p) => {
      const a = (p.a * Math.PI) / 180;
      const shade = innerEdge(s, p.color, p.op / 100, -Math.cos(a) * p.dist, Math.sin(a) * p.dist, p.size);
      const c = copyCanvas(s); cx(c).drawImage(shade, 0, 0); return c;
    } },
  { id: 'inner-glow', menu: 'style', cover: true, params: [{ k: 'color', lk: 'colour', type: 'color', v: '#fff5b0' }, R('op', 'opacity', 0, 100, 75, { unit: '%' }), R('size', 'size', 1, 250, 12, { unit: 'px' })],
    fn: (s, p) => {
      const glow = innerEdge(s, p.color, p.op / 100, 0, 0, p.size);
      const c = copyCanvas(s); cx(c).drawImage(glow, 0, 0); return c;
    } },
  { id: 'gradient', menu: 'style', params: [{ k: 'c1', lk: 'start_colour', type: 'color', v: '@fg' }, { k: 'c2', lk: 'end_colour', type: 'color', v: '@bg' }, R('op', 'opacity', 0, 100, 100, { unit: '%' }), R('a', 'angle', -180, 180, 90, { unit: '°' }), R('scale', 'scale', 10, 300, 100, { unit: '%' }), { k: 'blend', lk: 'blend_mode', type: 'select', options: blendOptions(), v: 'normal' }],
    fn: (s, p) => {
      const w = s.width, hh = s.height, a = (p.a * Math.PI) / 180, ux = Math.cos(a), uy = Math.sin(a);
      const len = (Math.abs(w * ux) + Math.abs(hh * uy)) / 2 / (p.scale / 100);
      const t = mkCanvas(w, hh), tg = cx(t), gr = tg.createLinearGradient(w / 2 - ux * len, hh / 2 - uy * len, w / 2 + ux * len, hh / 2 + uy * len);
      gr.addColorStop(0, p.c1); gr.addColorStop(1, p.c2);
      tg.fillStyle = gr; tg.fillRect(0, 0, w, hh);
      const c = copyCanvas(s), g = cx(c);
      g.globalAlpha = p.op / 100; g.globalCompositeOperation = BLEND_OP[p.blend] || 'source-over'; g.drawImage(t, 0, 0);
      g.globalAlpha = 1; g.globalCompositeOperation = 'destination-in'; g.drawImage(s, 0, 0);
      return c;
    } }
);
