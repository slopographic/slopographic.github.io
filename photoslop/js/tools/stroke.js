/* PhotoSlop tools: brush dabs, stroke buffers and shape helpers */
'use strict';

const dabCache = new Map();
/** Brush tips. 'round' is the classic soft/hard round; the others are shaped tips. */
const TIPS = [['round', 'Round'], ['square', 'Square'], ['flat', 'Flat (calligraphy)'], ['spray', 'Spray'], ['chalk', 'Chalk'], ['slime', 'Slime drip']]; // i18n-ignore: not shown (the brush panel shows brushes/engine.js ALL_TIPS)
const TIP_VARIANTS = { spray: 6, chalk: 4 };
function tipPath(g, tip, cxp, cyp, r) {
  g.beginPath();
  if (tip === 'square') g.rect(cxp - r * 0.88, cyp - r * 0.88, r * 1.76, r * 1.76);
  else if (tip === 'flat') g.ellipse(cxp, cyp, r, Math.max(0.6, r * 0.26), -Math.PI / 4, 0, Math.PI * 2);
  else if (tip === 'slime') {
    g.arc(cxp, cyp - r * 0.25, r * 0.7, 0, Math.PI * 2);
    for (const [dx, len, w] of [[-0.38, 0.95, 0.16], [0.05, 1.2, 0.2], [0.42, 0.75, 0.14]]) { g.moveTo(cxp + dx * r + w * r, cyp); g.ellipse(cxp + dx * r, cyp + (len - 0.6) * r * 0.5, w * r, len * r * 0.62, 0, 0, Math.PI * 2); }
  } else g.arc(cxp, cyp, Math.max(0.5, r), 0, Math.PI * 2);
}
function dabCanvas(size, hardness, color, tip = 'round', variant = 0) {
  const key = `${Math.ceil(size)}|${hardness.toFixed(2)}|${color}|${tip}|${variant}`;
  if (dabCache.has(key)) return dabCache.get(key);
  if (dabCache.size > 80) dabCache.clear();
  const d = Math.max(2, Math.ceil(size) + 2), c = mkCanvas(d, d), g = cx(c), r = size / 2;
  const [R0, G, B] = hexToRgb(color);
  g.fillStyle = color;
  if (tip === 'round' && (hardness >= 0.99 || size < 3)) { g.beginPath(); g.arc(d / 2, d / 2, Math.max(0.5, r), 0, Math.PI * 2); g.fill(); }
  else if (tip === 'round') {
    const gr = g.createRadialGradient(d / 2, d / 2, 0, d / 2, d / 2, r);
    gr.addColorStop(0, `rgba(${R0},${G},${B},1)`); gr.addColorStop(clamp(hardness, 0, 0.98), `rgba(${R0},${G},${B},1)`);
    for (let i = 1; i <= 6; i++) { const t = i / 6, a = Math.pow(1 - t, 1.6); gr.addColorStop(hardness + (1 - hardness) * t, `rgba(${R0},${G},${B},${a})`); }
    g.fillStyle = gr; g.fillRect(0, 0, d, d);
  } else if (tip === 'spray') {
    const rnd = rng(variant * 977 + 13), n = Math.max(6, Math.round(size * 1.4)), dot = Math.max(0.6, size * 0.025);
    for (let i = 0; i < n; i++) { const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * (r - dot); g.globalAlpha = 0.5 + rnd() * 0.5; g.beginPath(); g.arc(d / 2 + Math.cos(a) * rr, d / 2 + Math.sin(a) * rr, dot * (0.6 + rnd()), 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = 1;
  } else {
    // Shaped tips: stack shrinking copies for a soft edge.
    const steps = hardness >= 0.99 ? 1 : 8;
    for (let i = 0; i < steps; i++) { const k = steps === 1 ? 1 : 1 - (i / (steps - 1)) * (1 - hardness); g.globalAlpha = steps === 1 ? 1 : 1 / steps + 0.06; tipPath(g, tip, d / 2, d / 2, r * k); g.fill(); }
    g.globalAlpha = 1;
    if (tip === 'chalk') {
      const rnd = rng(variant * 331 + 7), img = g.getImageData(0, 0, d, d), px = img.data;
      for (let i = 3; i < px.length; i += 4) px[i] *= rnd() < 0.42 ? rnd() * 0.3 : 0.75 + rnd() * 0.25;
      g.putImageData(img, 0, 0);
    }
  }
  dabCache.set(key, c);
  return c;
}
/** A hard, aliased pixel disc for the pencil. */
function pixelDisc(size, color) {
  const key = `px|${size}|${color}`;
  if (dabCache.has(key)) return dabCache.get(key);
  const n = Math.max(1, Math.round(size)), c = mkCanvas(n, n), g = cx(c), r = n / 2;
  g.fillStyle = color;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if ((x + 0.5 - r) ** 2 + (y + 0.5 - r) ** 2 <= r * r + (n <= 2 ? 1 : 0.25)) g.fillRect(x, y, 1, 1);
  dabCache.set(key, c);
  return c;
}

/** Dab spacing/interpolation. onDab(x, y, pressure) is called along the path. */
class Stroker {
  constructor(spacing, onDab) { this.spacing = spacing; this.onDab = onDab; this.last = null; this.rest = 0; }
  begin(p) { this.last = p; this.rest = 0; this.onDab(p.x, p.y, p.pressure); }
  to(p) {
    const a = this.last; if (!a) return this.begin(p);
    const dx = p.x - a.x, dy = p.y - a.y, dist = Math.hypot(dx, dy);
    const step = Math.max(0.5, this.spacing(p.pressure));
    let t = step - this.rest;
    while (t <= dist) { const k = t / dist; this.onDab(a.x + dx * k, a.y + dy * k, lerp(a.pressure, p.pressure, k)); t += step; }
    this.rest = dist - (t - step);
    this.last = p;
  }
}
function maskedBuffer(buf) {
  if (!D.sel) return buf;
  const t = scratchCanvas('c', D.w, D.h), g = cx(t);
  g.drawImage(buf, 0, 0); g.globalCompositeOperation = 'destination-in'; g.drawImage(D.sel.mask, 0, 0); g.globalCompositeOperation = 'source-over';
  return t;
}
/** Apply a doc-space stroke buffer to a layer (or its mask). Returns a new canvas. */
function bakeStroke(L, buf, opts, into) {
  if (opts.mask) return SlopMask.paint(L.mask.canvas, maskedBuffer(buf), opts, L.mask.x, L.mask.y);
  const target = into || L.canvas, ox = L.x, oy = L.y;
  const c = into ? target : copyCanvas(target), g = cx(c);
  const mb = maskedBuffer(buf);
  g.globalAlpha = opts.opacity; g.globalCompositeOperation = opts.erase ? 'destination-out' : BLEND_OP[opts.blend || 'normal'] || 'source-over';
  if (!opts.erase && opts.blend && opts.blend !== 'normal') {
    // Blend modes only apply where the stroke lands: composite through a clipped copy.
    const t = mkCanvas(c.width, c.height), tg = cx(t); tg.drawImage(c, 0, 0); tg.globalCompositeOperation = BLEND_OP[opts.blend]; tg.drawImage(mb, -ox, -oy);
    tg.globalCompositeOperation = 'destination-in'; tg.drawImage(mb, -ox, -oy);
    g.globalCompositeOperation = 'source-over'; g.drawImage(t, 0, 0);
  } else g.drawImage(mb, -ox, -oy);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  return c;
}
let strokePool = null;
/** Start a buffered paint stroke (brush, pencil, eraser, clone). */
function startBufferedStroke(L, opts) {
  // Reuse one stroke buffer instead of allocating a document-sized canvas per stroke.
  if (!strokePool || strokePool.width !== D.w || strokePool.height !== D.h) strokePool = mkCanvas(D.w, D.h);
  const S = { L, buf: strokePool, opts };
  S.g = cx(S.buf); S.g.setTransform(1, 0, 0, 1, 0, 0); S.g.globalAlpha = 1; S.g.globalCompositeOperation = 'source-over'; S.g.clearRect(0, 0, D.w, D.h);
  if (opts.mask) {
    // the mask is painted live: each composite bakes the stroke so far into the mask (SlopMask.live)
    live = { layerId: L.id, maskSurface: SlopMask.live((LL) => LL.mask, () => maskedBuffer(S.buf), opts) };
  } else {
    live = { layerId: L.id, surface: (LL) => { const t = scratchCanvas('b', LL.canvas.width, LL.canvas.height); cx(t).drawImage(LL.canvas, 0, 0); bakeStroke(LL, S.buf, opts, t); return { canvas: t, x: LL.x, y: LL.y, w: LL.canvas.width, h: LL.canvas.height }; } };
  }
  return S;
}
function finishBufferedStroke(S, label) {
  const L = D.layers.find((l) => l.id === S.L.id);
  live = null;
  if (!L) return;
  if (S.opts.mask) patchLayer(L.id, { mask: Object.assign({}, L.mask, { canvas: bakeStroke(L, S.buf, S.opts) }) });
  else patchLayer(L.id, { canvas: bakeStroke(L, S.buf, S.opts) });
  commit(label);
}

/* ---------- flood region (magic wand / bucket) ---------- */
function regionMask(src, sx, sy, tol, contiguous) {
  const w = src.width, hh = src.height, d = cxr(src).getImageData(0, 0, w, hh).data, out = new Uint8Array(w * hh);
  sx = Math.floor(sx); sy = Math.floor(sy);
  if (sx < 0 || sy < 0 || sx >= w || sy >= hh) return null;
  const i0 = (sy * w + sx) * 4, r0 = d[i0], g0 = d[i0 + 1], b0 = d[i0 + 2], a0 = d[i0 + 3];
  const match = (i) => { const j = i * 4; return Math.abs(d[j + 3] - a0) <= tol && (a0 === 0 && d[j + 3] === 0 || (Math.abs(d[j] - r0) <= tol && Math.abs(d[j + 1] - g0) <= tol && Math.abs(d[j + 2] - b0) <= tol)); };
  if (!contiguous) { for (let i = 0; i < w * hh; i++) if (match(i)) out[i] = 1; return out; }
  const stack = [sx, sy];
  while (stack.length) {
    const y = stack.pop(); let x = stack.pop();
    let i = y * w + x;
    while (x >= 0 && !out[i] && match(i)) { x--; i--; }
    x++; i++;
    let up = false, dn = false;
    while (x < w && !out[i] && match(i)) {
      out[i] = 1;
      if (y > 0) { const u = i - w; if (!out[u] && match(u)) { if (!up) { stack.push(x, y - 1); up = true; } } else up = false; }
      if (y < hh - 1) { const v = i + w; if (!out[v] && match(v)) { if (!dn) { stack.push(x, y + 1); dn = true; } } else dn = false; }
      x++; i++;
    }
  }
  return out;
}
function maskToCanvas(m, w, hh) {
  const c = mkCanvas(w, hh), g = cxr(c), img = g.createImageData(w, hh), d = img.data;
  for (let i = 0; i < m.length; i++) if (m[i]) d[i * 4 + 3] = 255;
  g.putImageData(img, 0, 0);
  return c;
}
function modeFrom(e) {
  if (e.shiftKey && e.altKey) return 'int';
  if (e.shiftKey) return 'add';
  if (e.altKey) return 'sub';
  return T.select.mode;
}

/* ---------- shapes ---------- */
function rectFrom(a, b, square, centre) {
  let w = b.x - a.x, hh = b.y - a.y;
  if (square) { const s = Math.max(Math.abs(w), Math.abs(hh)); w = Math.sign(w || 1) * s; hh = Math.sign(hh || 1) * s; }
  if (centre) return { x: a.x - Math.abs(w), y: a.y - Math.abs(hh), w: Math.abs(w) * 2, h: Math.abs(hh) * 2 };
  return { x: Math.min(a.x, a.x + w), y: Math.min(a.y, a.y + hh), w: Math.abs(w), h: Math.abs(hh) };
}
function shapePath(g, kind, r, o = {}) {
  g.beginPath();
  if (kind === 'rect' || kind === 'rounded') SlopShapes.canvasPath(g, { x: r.x, y: r.y, w: r.w, h: r.h, radius: o.radius || 0 });
  else if (kind === 'ellipse') g.ellipse(r.x + r.w / 2, r.y + r.h / 2, Math.max(0.1, r.w / 2), Math.max(0.1, r.h / 2), 0, 0, Math.PI * 2);
  else if (kind === 'polygon' || kind === 'star') {
    const n = Math.max(3, o.sides || 5), cxp = r.x + r.w / 2, cyp = r.y + r.h / 2, pts = kind === 'star' ? n * 2 : n;
    for (let i = 0; i < pts; i++) { const a = -Math.PI / 2 + (i * Math.PI * 2) / pts, k = kind === 'star' && i % 2 ? 0.45 : 1; const x = cxp + Math.cos(a) * (r.w / 2) * k, y = cyp + Math.sin(a) * (r.h / 2) * k; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.closePath();
  } else if (kind === 'heart') {
    const { x, y, w, h: hh } = r;
    g.moveTo(x + w / 2, y + hh * 0.28);
    g.bezierCurveTo(x + w / 2, y, x, y, x, y + hh * 0.32);
    g.bezierCurveTo(x, y + hh * 0.62, x + w / 2, y + hh * 0.8, x + w / 2, y + hh);
    g.bezierCurveTo(x + w / 2, y + hh * 0.8, x + w, y + hh * 0.62, x + w, y + hh * 0.32);
    g.bezierCurveTo(x + w, y, x + w / 2, y, x + w / 2, y + hh * 0.28);
    g.closePath();
  }
}
