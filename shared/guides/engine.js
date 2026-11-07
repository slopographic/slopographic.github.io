/* SlopGuides engine: GuideGuide-style guide maths. Pure functions, no DOM.
 * Classic script: exposes window.SlopGuides (and module.exports under Node).
 *
 * A guide is { o: 'v' | 'h', pos } in document pixels: 'v' = vertical line at x = pos,
 * 'h' = horizontal line at y = pos. A rect is { x, y, w, h }.
 * Lengths are numbers (in the default unit) or strings with a unit: '10px', '5%', '2mm', '1in', '12pt'. */
(function (root) {
  'use strict';
  const SG = root.SlopGuides = root.SlopGuides || {};
  const UNITS = ['px', '%', 'mm', 'in', 'pt'];
  const EPS = 1e-6;

  /** '10px' → { v: 10, u: 'px' }; plain numbers take `unit`. Returns null for blanks and junk. */
  function parseLen(s, unit = 'px') {
    if (s == null) return null;
    if (typeof s === 'number') return isFinite(s) ? { v: s, u: unit } : null;
    const m = String(s).trim().toLowerCase().match(/^(-?(?:\d+\.?\d*|\.\d+))\s*(px|%|mm|in|pt|cm)?$/);
    if (!m) return null;
    let v = parseFloat(m[1]), u = m[2] || unit;
    if (u === 'cm') { v *= 10; u = 'mm'; }
    return { v, u };
  }
  /** Convert a length to pixels. ref = the length that 100% means; dpi = pixels per inch (72: 1pt = 1px). */
  function toPx(len, { ref = 0, dpi = 72, unit = 'px' } = {}) {
    const l = typeof len === 'object' && len ? len : parseLen(len, unit);
    if (!l) return 0;
    switch (l.u) {
      case '%': return (l.v / 100) * ref;
      case 'in': return l.v * dpi;
      case 'mm': return (l.v / 25.4) * dpi;
      case 'pt': return (l.v / 72) * dpi;
      default: return l.v;
    }
  }
  function fromPx(px, unit, { ref = 0, dpi = 72 } = {}) {
    switch (unit) {
      case '%': return ref ? (px / ref) * 100 : 0;
      case 'in': return px / dpi;
      case 'mm': return (px / dpi) * 25.4;
      case 'pt': return (px / dpi) * 72;
      default: return px;
    }
  }
  /** Split an integer total into n integer parts that differ by at most 1, spreading the extras evenly. */
  function distribute(total, n) {
    const out = [];
    if (n <= 0) return out;
    total = Math.round(total);
    for (let i = 0; i < n; i++) out.push(Math.floor(((i + 1) * total) / n) - Math.floor((i * total) / n));
    return out;
  }
  /** Sort, round to 1/1000 px and drop duplicates. */
  function normalize(guides) {
    const seen = new Set(), out = [];
    for (const g of guides) {
      if (!g || (g.o !== 'v' && g.o !== 'h') || !isFinite(g.pos)) continue;
      const pos = Math.round(g.pos * 1000) / 1000, k = g.o + pos;
      if (seen.has(k)) continue;
      seen.add(k); out.push({ o: g.o, pos });
    }
    return out.sort((a, b) => (a.o === b.o ? a.pos - b.pos : a.o === 'v' ? -1 : 1));
  }
  /** Merge two guide lists (dedupe). */
  const merge = (a, b) => normalize((a || []).concat(b || []));

  /**
   * Lay out `count` tracks of `size` with `gutter` between them inside [start, start + len].
   * Missing size → tracks fill the space; missing count → as many as fit (centred). Fixed size + count → centred.
   * Returns [{ a, b }] track edges. snap: 'off' | 'round' | 'distribute'.
   */
  function tracks(start, len, count, size, gutter, snap) {
    count = Math.max(0, Math.floor(count || 0)); gutter = Math.max(0, gutter || 0);
    if (!count && !(size > 0)) return [];
    if (!count) count = Math.max(1, Math.floor((len + gutter + EPS) / (size + gutter)));
    if (snap !== 'off') gutter = Math.round(gutter);
    let widths;
    if (size > 0) {
      const w = snap !== 'off' ? Math.round(size) : size;
      widths = new Array(count).fill(w);
    } else {
      const free = Math.max(0, len - gutter * (count - 1));
      if (snap === 'distribute') {
        const s0 = Math.round(start), e0 = Math.round(start + len);
        widths = distribute(Math.max(0, e0 - s0 - gutter * (count - 1)), count);
        start = s0; len = e0 - s0;
      } else widths = new Array(count).fill(free / count);
    }
    const used = widths.reduce((a, b) => a + b, 0) + gutter * (count - 1);
    let x = start + (size > 0 ? (len - used) / 2 : 0);
    if (snap === 'distribute') x = Math.round(x);
    const out = [];
    for (let i = 0; i < count; i++) {
      const a = x, b = x + widths[i];
      out.push(snap === 'round' ? { a: Math.round(a), b: Math.round(b) } : { a, b });
      x = b + gutter;
    }
    return out;
  }

  /**
   * GuideGuide's form. opts:
   *   unit ('px'), dpi (72), snap ('off' | 'round' | 'distribute')
   *   margins: { top, right, bottom, left }   lengths; % of the rect's width (left/right) or height (top/bottom)
   *   cols: { count, width, gutter }, rows: { count, height, gutter }
   *   colMid, rowMid: a guide in the middle of every column / row
   *   midV, midH: centre lines of the (margin-inset) area
   *   edges: guides on the rect's outer edges; marginGuides (default true): guides on the margins
   *   baseline: { step, offset }: horizontal guides every `step` from the area's top (+ offset)
   */
  function compute(rect, opts = {}) {
    const unit = opts.unit || 'px', dpi = opts.dpi || 72, snap = opts.snap || 'off';
    const W = (v) => toPx(v, { ref: rect.w, dpi, unit }), H = (v) => toPx(v, { ref: rect.h, dpi, unit });
    const m = opts.margins || {};
    const ml = W(m.left), mr = W(m.right), mt = H(m.top), mb = H(m.bottom);
    const inner = { x: rect.x + ml, y: rect.y + mt, w: Math.max(0, rect.w - ml - mr), h: Math.max(0, rect.h - mt - mb) };
    const out = [];
    const v = (pos) => out.push({ o: 'v', pos }), hz = (pos) => out.push({ o: 'h', pos });
    if (opts.edges) { v(rect.x); v(rect.x + rect.w); hz(rect.y); hz(rect.y + rect.h); }
    if (opts.marginGuides !== false) {
      if (ml) v(inner.x); if (mr) v(inner.x + inner.w);
      if (mt) hz(inner.y); if (mb) hz(inner.y + inner.h);
    }
    const c = opts.cols || {}, r = opts.rows || {};
    const ct = tracks(inner.x, inner.w, +c.count, W(c.width), W(c.gutter), snap);
    const rt = tracks(inner.y, inner.h, +r.count, H(r.height), H(r.gutter), snap);
    for (const t of ct) { v(t.a); v(t.b); if (opts.colMid) v((t.a + t.b) / 2); }
    for (const t of rt) { hz(t.a); hz(t.b); if (opts.rowMid) hz((t.a + t.b) / 2); }
    if (opts.midV) v(inner.x + inner.w / 2);
    if (opts.midH) hz(inner.y + inner.h / 2);
    const bl = opts.baseline;
    if (bl && H(bl.step) > 0.5) {
      const step = H(bl.step);
      for (let y = inner.y + H(bl.offset); y <= inner.y + inner.h + EPS; y += step) hz(y);
    }
    return finish(out, snap);
  }
  function finish(out, snap) {
    if (snap === 'round' || snap === 'distribute') for (const g of out) g.pos = Math.round(g.pos);
    return normalize(out);
  }

  /** A guide every `step` from `origin`, across the rect, both ways. opts: { x: { step, origin }, y: { step, origin }, unit, dpi, snap }. */
  function intervals(rect, opts = {}) {
    const unit = opts.unit || 'px', dpi = opts.dpi || 72, out = [];
    const axis = (o, spec, a, len) => {
      if (!spec) return;
      const step = toPx(spec.step, { ref: len, dpi, unit });
      if (!(step >= 0.5)) return;
      const origin = a + toPx(spec.origin || 0, { ref: len, dpi, unit });
      const n0 = Math.ceil((a - origin) / step - EPS), n1 = Math.floor((a + len - origin) / step + EPS);
      if (n1 - n0 > 5000) return; // refuse absurd counts
      for (let n = n0; n <= n1; n++) out.push({ o, pos: origin + n * step });
    };
    axis('v', opts.x, rect.x, rect.w);
    axis('h', opts.y, rect.y, rect.h);
    return finish(out, opts.snap || 'off');
  }

  /** Convert between a guide list and SlopVector's { h: [y…], v: [x…] }. */
  function toHV(list) { const o = { h: [], v: [] }; for (const g of normalize(list)) o[g.o].push(g.pos); return o; }
  function fromHV(hv) { const out = []; for (const k of ['v', 'h']) for (const pos of (hv && hv[k]) || []) out.push({ o: k, pos }); return normalize(out); }

  /** Nearest snap target to `value` within `tol`: returns { pos, d } or null. targets: numbers. */
  function nearest(targets, value, tol) {
    let best = null;
    for (const t of targets) { const d = t - value; if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.d))) best = { pos: t, d }; }
    return best;
  }

  Object.assign(SG, { UNITS, parseLen, toPx, fromPx, distribute, normalize, merge, tracks, compute, intervals, toHV, fromHV, nearest });
  if (typeof module === 'object' && module.exports) module.exports = SG;
})(typeof window !== 'undefined' ? window : globalThis);
