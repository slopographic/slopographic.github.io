/* PhotoSlop filters: the Slop menu and layer styles */
'use strict';

FILTERS.push(
  { id: 'vhs', menu: 'Slop', params: [R('amt', 'wear', 1, 100, 50, { unit: '%' }), R('seed', 'seed', 1, 999, 9)], // i18n-ignore: menu ids
    fn: (s, p) => { const k = p.amt / 100, r = rng(p.seed), w = s.width, hh = s.height, sd = cxr(gaussian(s, 0.8 + k)).getImageData(0, 0, w, hh).data, c = mkCanvas(w, hh), g = cxr(c), img = g.createImageData(w, hh), d = img.data, sh = Math.round(2 + 6 * k);
      let jitter = 0;
      for (let y = 0; y < hh; y++) { if (r() < 0.02 * k) jitter = (r() - 0.5) * 20 * k; else jitter *= 0.9; const line = y % 3 === 0 ? 1 - 0.18 * k : 1;
        for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, sx = clamp(Math.round(x + jitter), 0, w - 1), j = (y * w + sx) * 4, jr = (y * w + clamp(sx + sh, 0, w - 1)) * 4, n = (r() - 0.5) * 40 * k;
          d[i] = (sd[jr] * 0.9 + 20) * line + n; d[i + 1] = (sd[j + 1] * 0.92 + 8) * line + n; d[i + 2] = (sd[j + 2] * 0.85 + 30) * line + n; d[i + 3] = sd[i + 3]; } }
      g.putImageData(img, 0, 0); return c; } },
  { id: 'slopify', menu: 'Slop', params: [R('melt', 'melt', 0, 100, 55, { unit: '%' }), R('tint', 'slime_tint', 0, 100, 45, { unit: '%' }), R('seed', 'seed', 1, 999, 23)], // i18n-ignore: menu ids
    fn: (s, p) => { const w = s.width, hh = s.height, n = valueNoise2D(p.seed), k = p.melt / 100;
      const drip = new Float32Array(w); for (let x = 0; x < w; x++) drip[x] = Math.pow(n(x / 38, 0.5) * 0.7 + n(x / 9, 3.1) * 0.3, 3) * hh * 0.9 * k;
      let c = displace(s, (x, y, o) => { const t = y / hh; o[0] = x + Math.sin(y / 23 + x / 41) * 4 * k; o[1] = y - drip[x] * t * t; });
      if (p.tint > 0) { const g = cx(c); g.globalCompositeOperation = 'source-atop'; g.globalAlpha = p.tint / 100; const gr = g.createLinearGradient(0, 0, 0, hh); gr.addColorStop(0, '#e6ff8c'); gr.addColorStop(0.55, '#9fcc00'); gr.addColorStop(1, '#3d5200'); g.fillStyle = gr; g.globalCompositeOperation = 'source-atop'; g.fillRect(0, 0, w, hh); g.globalAlpha = 1; }
      return c; } },
  /* ---------- Layer styles: the effect renderers of the stack (js/layers/fx.js) ---------- */
  { id: 'shadow', menu: 'style', cover: true, params: [{ k: 'color', lk: 'colour', type: 'color', v: '#000000' }, R('op', 'opacity', 0, 100, 60, { unit: '%' }), R('a', 'angle', -180, 180, 120, { unit: '°' }), R('dist', 'distance', 0, 300, 12, { unit: 'px' }), R('size', 'size', 0, 250, 14, { unit: 'px' })],
    fn: (s, p) => { const sh = silhouette(s, p.color, p.op / 100), c = mkCanvas(s.width, s.height), g = cx(c); const a = (p.a * Math.PI) / 180; g.drawImage(p.size ? gaussian(sh, p.size) : sh, -Math.cos(a) * p.dist, Math.sin(a) * p.dist); g.drawImage(s, 0, 0); return c; } },
  { id: 'glow', menu: 'style', cover: true, params: [{ k: 'color', lk: 'colour', type: 'color', v: '#d4ff3a' }, R('op', 'opacity', 0, 100, 85, { unit: '%' }), R('spread', 'spread', 0, 40, 4, { unit: 'px' }), R('size', 'size', 1, 250, 24, { unit: 'px' })],
    fn: (s, p) => { let sh = silhouette(s, p.color, 1); if (p.spread) sh = rankFilter(sh, p.spread, true, true); sh = gaussian(sh, p.size); const c = mkCanvas(s.width, s.height), g = cx(c); g.globalAlpha = p.op / 100; g.drawImage(sh, 0, 0); g.drawImage(sh, 0, 0); g.globalAlpha = 1; g.drawImage(s, 0, 0); return c; } },
  { id: 'stroke', menu: 'style', cover: true, params: [R('size', 'size', 1, 60, 4, { unit: 'px' }), { k: 'color', lk: 'colour', type: 'color', v: '@fg' }, { k: 'pos', lk: 'position', type: 'select', options: FO('outside', 'inside'), v: 'outside' }],
    fn: (s, p) => { if (p.pos === 'outside') return under(s, silhouette(rankFilter(s, p.size, true, true), p.color)); const inner = rankFilter(s, p.size, false, true), ring = silhouette(s, p.color), g = cx(ring); g.globalCompositeOperation = 'destination-out'; g.drawImage(inner, 0, 0); const c = copyCanvas(s); cx(c).drawImage(ring, 0, 0); return c; } },
  { id: 'overlay', menu: 'style', params: [{ k: 'color', lk: 'colour', type: 'color', v: '@fg' }, R('op', 'opacity', 0, 100, 100, { unit: '%' }), { k: 'blend', lk: 'blend_mode', type: 'select', options: blendOptions(), v: 'normal' }],
    fn: (s, p) => { const c = copyCanvas(s), g = cx(c), f = silhouette(s, p.color, p.op / 100); g.globalCompositeOperation = BLEND_OP[p.blend]; g.drawImage(f, 0, 0); g.globalCompositeOperation = 'destination-in'; g.drawImage(s, 0, 0); return c; } },
  { id: 'bevel', menu: 'style', params: [R('size', 'size', 1, 60, 8, { unit: 'px' }), R('depth', 'depth', 10, 500, 120, { unit: '%' }), R('a', 'light_angle', -180, 180, 120, { unit: '°' })],
    fn: (s, p) => { const w = s.width, hh = s.height, a = cxr(gaussian(silhouette(s, '#fff'), p.size)).getImageData(0, 0, w, hh).data;
      const lx = Math.cos((p.a * Math.PI) / 180), ly = -Math.sin((p.a * Math.PI) / 180), k = (p.depth / 100) * 3;
      return withPixels(s, (d) => { for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (!d[i + 3]) continue;
        const ax = (a[(y * w + Math.min(w - 1, x + 1)) * 4 + 3] - a[(y * w + Math.max(0, x - 1)) * 4 + 3]) / 2, ay = (a[(Math.min(hh - 1, y + 1) * w + x) * 4 + 3] - a[(Math.max(0, y - 1) * w + x) * 4 + 3]) / 2;
        const sh = clamp(-(ax * lx + ay * ly) * k, -160, 160); for (let c = 0; c < 3; c++) d[i + c] = sh > 0 ? d[i + c] + (255 - d[i + c]) * (sh / 160) : d[i + c] * (1 + sh / 160); } }); } }
);

const FILTER_BY_ID = Object.fromEntries(FILTERS.filter((f) => f.id).map((f) => [f.id, f]));
