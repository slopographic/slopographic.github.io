/* Slop Docs — ui/geom: document positions ↔ page points, from the same line boxes the pages are drawn from: the caret box,
 * hit-testing, vertical moves and the selection's rectangles. Frags are in visual order and a right-to-left frag (frag.rtl)
 * runs from its right edge, so every lookup goes by offset ranges, not by frag order. Classic script; extends SlopDocs.R
 * (ui/render.js draws). */
(function () {
  'use strict';
  const S = window.SlopDocs, R = S.R;
  const E = () => window.SlopDocEngine;
  const CARET = (f) => f.kind !== 'label' && f.kind !== 'float';
  const TEXT = (f) => (f.kind === 'text' || f.kind === 'space') && !f.atomic;

  /** Flat list of the body's laid-out lines in document order: { pi, b, y, x, last, line }. */
  R.buildLines = function () {
    S.lineList = [];
    if (!S.layout) return;
    S.layout.pages.forEach((pg, pi) => {
      for (const it of pg.items) {
        if (it.kind !== 'line' || it.story !== 'body' || !it.path || it.path.length !== 1) continue;
        S.lineList.push({ pi, b: it.path[0], y: it.y, x: it.x, last: it.last, line: it.line });
      }
    });
  };
  /** x of offset o inside one frag. */
  function fragX(f, o) {
    if (o <= f.start) return f.rtl ? f.x + f.w : f.x;
    if (o >= f.end) return f.rtl ? f.x : f.x + f.w;
    if (!TEXT(f)) return f.x;
    const d = E().textWidth(f.st.face, f.text.slice(0, o - f.start), f.st.size);
    return f.rtl ? f.x + f.w - d : f.x + d;
  }
  /** x (content-box space) of an offset in a line. */
  function xOf(line, o) {
    const fr = line.frags.filter(CARET);
    if (!fr.length) return line.startX ?? line.left ?? 0;
    const f = fr.find((g) => o > g.start && o < g.end) || fr.find((g) => g.start === o && g.end > o) || fr.find((g) => g.end === o) || fr.find((g) => g.start === o);
    if (f) return fragX(f, o);
    let lo = fr[0], hi = fr[0];
    for (const g of fr) { if (g.start < lo.start) lo = g; if (g.end > hi.end) hi = g; }
    return o < lo.start ? fragX(lo, lo.start) : fragX(hi, hi.end);
  }
  /** Offset at x (content-box space) in a line. */
  function offsetAt(line, x) {
    const fr = line.frags.filter((f) => CARET(f) && f.kind !== 'img');
    if (!fr.length) return line.end;
    let f = fr.find((g) => x >= g.x && x <= g.x + g.w);
    if (!f) {
      let bd = Infinity;
      for (const g of fr) { const d = x < g.x ? g.x - x : x - (g.x + g.w); if (d < bd) { bd = d; f = g; } }
    }
    const local = f.rtl ? f.x + f.w - x : x - f.x;
    if (!TEXT(f)) return local < f.w / 2 ? f.start : f.end;
    let acc = 0, i = f.start;
    for (const ch of f.text) {
      const cw = E().textWidth(f.st.face, ch, f.st.size);
      if (local < acc + cw / 2) return i;
      acc += cw; i += ch.length;
    }
    return f.end;
  }
  /** The x ranges [x1, x2] that offsets from..to cover in a line (one per frag they touch, merged when they meet). */
  function rangeXs(line, from, to) {
    const out = [];
    for (const f of line.frags) {
      if (!CARET(f) || f.end <= from || f.start >= to) continue;
      const a = fragX(f, Math.max(from, f.start)), b = fragX(f, Math.min(to, f.end));
      out.push([Math.min(a, b), Math.max(a, b)]);
    }
    out.sort((p, q) => p[0] - q[0]);
    const merged = [];
    for (const r of out) { const l = merged[merged.length - 1]; if (l && r[0] <= l[1] + 0.01) l[1] = Math.max(l[1], r[1]); else merged.push(r); }
    return merged;
  }
  /** Index in S.lineList of the line that shows position pos, or -1. */
  function lineIndex(pos) {
    const L = S.lineList;
    for (let i = 0; i < L.length; i++) if (L[i].b === pos.b && pos.o >= L[i].line.start && pos.o < L[i].line.end) return i;
    for (let i = 0; i < L.length; i++) if (L[i].b === pos.b && pos.o === L[i].line.end) return i;
    return -1;
  }
  R.lineIndex = lineIndex;
  R.lineAt = (i) => S.lineList[i] || null;
  R.offsetAt = offsetAt;
  R.xOf = xOf;
  R.rangeXs = rangeXs;
  /** Caret box for pos in page points: { pi, x, top, h } (x absolute on the page). */
  R.caretBox = function (pos) {
    const i = lineIndex(pos);
    if (i < 0) return null;
    const L = S.lineList[i], ln = L.line;
    return { pi: L.pi, x: L.x + xOf(ln, pos.o), top: L.y + ln.baseline - ln.asc, h: ln.asc + ln.desc || ln.h, i };
  };
  /** Position reached by moving up (dir -1) or down (dir 1) from pos, aiming at page x goalX. */
  R.vertical = function (pos, dir, goalX) {
    const i = lineIndex(pos);
    const t = i < 0 ? null : S.lineList[i + dir];
    if (!t) return null;
    return { b: t.b, o: offsetAt(t.line, goalX - t.x) };
  };
  /** Position under a client point (clamped to the nearest page and line). */
  R.hit = function (cx, cy) {
    const pages = [...document.querySelectorAll('#pages .page')];
    if (!pages.length) return null;
    let el = null, bd = Infinity;
    for (const p of pages) {
      const r = p.getBoundingClientRect();
      const d = cy < r.top ? r.top - cy : cy > r.bottom ? cy - r.bottom : 0;
      if (d < bd) { bd = d; el = p; }
      if (d === 0) break;
    }
    const pi = +el.dataset.pi, r = el.getBoundingClientRect(), k = R.k();
    const x = (cx - r.left) / k, y = (cy - r.top) / k;
    let best = null, dist = Infinity;
    for (const L of S.lineList) {
      if (L.pi !== pi) continue;
      const d = y < L.y ? L.y - y : y > L.y + L.line.h ? y - (L.y + L.line.h) : 0;
      if (d < dist) { dist = d; best = L; }
      if (d === 0) break;
    }
    if (!best) return null;
    return { b: best.b, o: offsetAt(best.line, x - best.x), pi, x, y };
  };
  /** Selection rectangles in page points, one or more per line the selection crosses. */
  R.segments = function () {
    const sel = S.sel;
    if (E().O.collapsed(sel)) return [];
    const [a, f] = E().O.ordered(sel), out = [];
    for (const L of S.lineList) {
      if (L.b < a.b || L.b > f.b) continue;
      const ln = L.line;
      if (L.b === a.b && a.o > ln.end) continue;
      if (L.b === f.b && f.o < ln.start) continue;
      const from = L.b === a.b ? Math.max(a.o, ln.start) : ln.start;
      const to = L.b === f.b ? Math.min(f.o, ln.end) : ln.end;
      const xs = rangeXs(ln, from, to);
      if (L.last && L.b < f.b && to >= ln.end) { // the paragraph mark, at the line's end side
        const end = xOf(ln, ln.end);
        xs.push(ln.rtl ? [end - 4, end] : [end, end + 4]);
      }
      for (const [x1, x2] of xs) if (x2 - x1 > 0.01 || L.b < f.b) out.push({ pi: L.pi, x: L.x + x1, y: L.y, w: Math.max(x2 - x1, 3), h: ln.h });
    }
    return out;
  };
})();
