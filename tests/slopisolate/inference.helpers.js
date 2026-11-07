/* Slop Cutout inference test helpers (window.CT): synthetic scenes and a guarded model loader. */
(function () {
  'use strict';
  const CT = window.CT = {};
  SlopCutout.configure({ backend: 'wasm' }); // WebGPU in headless Chromium is a software adapter: test WebAssembly
  /** A W×H canvas: contrasting background with one coloured shape. Returns { canvas, inside(x,y) }. */
  CT.scene = function (W = 640, H = 480, { shape = 'circle', bg = '#1e5ac8', fg = '#f03c28' } = {}) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'), cx = W / 2, cy = H / 2, r = Math.min(W, H) * 0.25;
    x.fillStyle = bg; x.fillRect(0, 0, W, H); x.fillStyle = fg; x.beginPath();
    if (shape === 'circle') x.arc(cx, cy, r, 0, Math.PI * 2); else x.rect(cx - r, cy - r * 0.8, r * 2, r * 1.6);
    x.fill();
    const inside = shape === 'circle' ? (px, py) => Math.hypot(px - cx, py - cy) < r : (px, py) => Math.abs(px - cx) < r && Math.abs(py - cy) < r * 0.8;
    return { canvas: c, inside, cx, cy, r };
  };
  /** Mean mask value well inside and well outside the shape (ignoring an 8 % band around the edge). */
  CT.score = function (mask, W, H, sc) {
    let si = 0, ni = 0, so = 0, no = 0;
    for (let y = 2; y < H; y += 4) for (let x = 2; x < W; x += 4) {
      const d = Math.hypot(x - sc.cx, y - sc.cy), band = sc.r * 0.15;
      const ins = sc.inside(x, y), deep = ins ? sc.inside(x + band, y) && sc.inside(x - band, y) && sc.inside(x, y + band) && sc.inside(x, y - band) : !sc.inside(x + band, y) && !sc.inside(x - band, y) && !sc.inside(x, y + band) && !sc.inside(x, y - band);
      if (!deep || d < 0) continue;
      if (ins) { si += mask[y * W + x]; ni++; } else { so += mask[y * W + x]; no++; }
    }
    return { inside: si / ni, outside: so / no };
  };
  /** Load a model; resolve false (and warn) if the runtime cannot start here, so the suite skips. */
  CT.tryLoad = async function (model) {
    try { const r = await SlopCutout.load(model); console.log('[cutout] ' + model + ' ready on ' + r.backend + ' (init ' + Math.round(r.initMs) + ' ms)'); return true; }
    catch (e) { console.warn('[cutout] SKIP: model ' + model + ' failed to load in this browser: ' + e.message); return false; }
  };
})();
