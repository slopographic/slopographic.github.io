/* Slop Paint, part 02: aliased pixel primitives: lines, spans, shapes, beziers.
 * Split from the old paint.js (one IIFE). Loaded in order by index.html; state and helpers are shared through window.SlopPaint (P). */
(() => {
'use strict';
const P = window.SlopPaint;

/* =====================================================================
 * Aliased pixel primitives (everything is drawn with fillRect spans,
 * so the bitmap stays crisp like real Paint)
 * ===================================================================== */
function bres(x0, y0, x1, y1, fn) {
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let guard = 0; guard < 100000; guard++) {
    fn(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
function stamp(ctx, x, y, spans) {
  for (let i = 0; i < spans.length; i++) { const s = spans[i]; ctx.fillRect(x + s[0], y + s[1], s[2], 1); }
}
const spanCache = new Map();
function discSpans(d) {
  const key = 'd' + d;
  if (spanCache.has(key)) return spanCache.get(key);
  const r = d / 2, off = (d - 1) / 2, o = Math.floor(off), out = [];
  for (let j = 0; j < d; j++) {
    const yy = j - off; let xl = -1, len = 0;
    for (let i = 0; i < d; i++) { const xx = i - off; if (xx * xx + yy * yy <= r * r + 0.01) { if (xl < 0) xl = i; len++; } }
    if (len) out.push([xl - o, j - o, len]);
  }
  spanCache.set(key, out);
  return out;
}
function squareSpans(d) { const o = Math.floor((d - 1) / 2); return Array.from({ length: d }, (_, j) => [-o, j - o, d]); }
function slashSpans(n, back) {
  const o = Math.floor(n / 2), out = [];
  for (let i = 0; i < n; i++) out.push([(back ? i : n - 1 - i) - o, i - o, 1]);
  return out;
}
function line(ctx, x0, y0, x1, y1, w) {
  if (w <= 1) bres(x0, y0, x1, y1, (x, y) => ctx.fillRect(x, y, 1, 1));
  else { const sp = discSpans(w); bres(x0, y0, x1, y1, (x, y) => stamp(ctx, x, y, sp)); }
}
function polyline(ctx, pts, w, closed) {
  if (pts.length === 1) line(ctx, pts[0].x, pts[0].y, pts[0].x, pts[0].y, w);
  for (let i = 1; i < pts.length; i++) line(ctx, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, w);
  if (closed && pts.length > 2) line(ctx, pts[pts.length - 1].x, pts[pts.length - 1].y, pts[0].x, pts[0].y, w);
}
function hline(ctx, x0, x1, y) { if (x1 >= x0) ctx.fillRect(x0, y, x1 - x0 + 1, 1); }

// Shapes as per-row spans {y0, n, xl[], xr[]}
const RR = 9; // rounded-rect corner radius
function rowsOf(type, x0, y0, x1, y1, t) {
  const a = x0 + t, b = y0 + t, c = x1 - t, d = y1 - t;
  if (c < a || d < b) return null;
  const n = d - b + 1, xl = new Array(n), xr = new Array(n);
  if (type === 'ellipse') {
    const ra = (c - a + 1) / 2, rb = n / 2, cx = a + ra, cy = b + rb;
    for (let i = 0; i < n; i++) {
      const dy = (b + i + 0.5 - cy) / rb, k = Math.max(0, 1 - dy * dy), dx = ra * Math.sqrt(k);
      let l = Math.round(cx - dx), r = Math.round(cx + dx) - 1;
      if (r < l) { const tmp = l; l = r; r = tmp; }
      xl[i] = l; xr[i] = r;
    }
  } else if (type === 'rrect') {
    const w = c - a + 1, rr = Math.min(Math.max(0, RR - t), w / 2, n / 2);
    for (let i = 0; i < n; i++) {
      const yy = i + 0.5; let dd = 0;
      if (yy < rr) dd = rr - yy; else if (yy > n - rr) dd = yy - (n - rr);
      const off = dd > 0 ? Math.round(rr - Math.sqrt(Math.max(0, rr * rr - dd * dd))) : 0;
      xl[i] = a + off; xr[i] = c - off;
    }
  } else {
    for (let i = 0; i < n; i++) { xl[i] = a; xr[i] = c; }
  }
  return { y0: b, n, xl, xr };
}
function fillRows(ctx, R) { if (R) for (let i = 0; i < R.n; i++) hline(ctx, R.xl[i], R.xr[i], R.y0 + i); }
// mode 0 = outline, 1 = outline (fg) + fill (bg), 2 = fill only (fg)
function drawShape(ctx, type, x0, y0, x1, y1, t, mode, fg, bg) {
  const out = rowsOf(type, x0, y0, x1, y1, 0);
  if (!out) return;
  if (mode === 2) { ctx.fillStyle = fg; fillRows(ctx, out); return; }
  const inn = rowsOf(type, x0, y0, x1, y1, t);
  if (mode === 1 && inn) { ctx.fillStyle = bg; fillRows(ctx, inn); }
  ctx.fillStyle = fg;
  for (let i = 0; i < out.n; i++) {
    const y = out.y0 + i, xl = out.xl[i], xr = out.xr[i];
    const j = inn ? y - inn.y0 : -1;
    if (!inn || j < 0 || j >= inn.n) hline(ctx, xl, xr, y);
    else { hline(ctx, xl, inn.xl[j] - 1, y); hline(ctx, inn.xr[j] + 1, xr, y); }
  }
}
function polySpans(pts) {
  let mn = Infinity, mx = -Infinity;
  for (const p of pts) { mn = Math.min(mn, p.y); mx = Math.max(mx, p.y); }
  const spans = [];
  for (let y = mn; y <= mx; y++) {
    const yc = y + 0.5, xs = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const ay = a.y + 0.5, by = b.y + 0.5;
      if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(a.x + 0.5 + (yc - ay) / (by - ay) * (b.x - a.x));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) spans.push([y, Math.ceil(xs[k] - 0.5), Math.floor(xs[k + 1] - 0.5)]);
  }
  return spans;
}
function drawPolygon(ctx, pts, t, mode, fg, bg) {
  if (pts.length < 3) { ctx.fillStyle = fg; polyline(ctx, pts, t, false); return; }
  if (mode >= 1) {
    ctx.fillStyle = mode === 1 ? bg : fg;
    for (const [y, l, r] of polySpans(pts)) hline(ctx, l, r, y);
  }
  ctx.fillStyle = fg;
  if (mode < 2) polyline(ctx, pts, t, true);
  else polyline(ctx, pts, 1, true);
}
function bezierPts(p0, p1, p2, p3) {
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const n = Math.max(8, Math.ceil((d(p0, p1) + d(p1, p2) + d(p2, p3)) / 3));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, m = 1 - t;
    const x = m * m * m * p0.x + 3 * m * m * t * p1.x + 3 * m * t * t * p2.x + t * t * t * p3.x;
    const y = m * m * m * p0.y + 3 * m * m * t * p1.y + 3 * m * t * t * p2.y + t * t * t * p3.y;
    const q = { x: Math.round(x), y: Math.round(y) };
    if (!out.length || out[out.length - 1].x !== q.x || out[out.length - 1].y !== q.y) out.push(q);
  }
  return out;
}
function snap45(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const oct = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
  if (oct === 0 || oct === 4) return { x: b.x, y: a.y };
  if (oct === 2 || oct === 6) return { x: a.x, y: b.y };
  const d = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: a.x + Math.sign(dx || 1) * d, y: a.y + Math.sign(dy || 1) * d };
}
function boxOf(a, b, square) {
  let bx = b.x, by = b.y;
  if (square) {
    const d = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    bx = a.x + (b.x < a.x ? -d : d); by = a.y + (b.y < a.y ? -d : d);
  }
  return { x0: Math.min(a.x, bx), y0: Math.min(a.y, by), x1: Math.max(a.x, bx), y1: Math.max(a.y, by) };
}

Object.assign(P, { bezierPts, boxOf, bres, discSpans, drawPolygon, drawShape, line, polyline, slashSpans, snap45, spanCache, squareSpans, stamp });
})();
