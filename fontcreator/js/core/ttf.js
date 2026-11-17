/* Slop Font: TrueType outlines. opentype.js writes CFF (PostScript) outlines only, so a .ttf is made here: every cubic
 * curve becomes quadratic ones (each within TOL font units of it), and the glyf, loca, maxp and hmtx tables are written
 * from them. Pure; needs the paths module (in Node, pass it).
 *   quads(p0, c1, c2, p3, tol) → [[ctrl, end]]   a cubic as quadratic pieces
 *   points(contours) → [[{ x, y, on }]]        the contours (already in TrueType's direction) as TrueType points
 *   tables(glyphs) → { glyf, loca, maxp, hmtx, box: { xMin, yMin, xMax, yMax } }   glyphs: [{ contours, advance }] in
 *                                               font order; loca is the long format (head.indexToLocFormat = 1) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else { const F = root.SlopFont; F.ttf = factory(F.paths); }
})(typeof window !== 'undefined' ? window : globalThis, function (P) {
  'use strict';
  const TOL = 0.5;
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  function split(p0, c1, c2, p3, t) {
    const l = (a, b) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    const a = l(p0, c1), b = l(c1, c2), c = l(c2, p3), d = l(a, b), e = l(b, c), f = l(d, e);
    return [[p0, a, d, f], [f, e, c, p3]];
  }
  function quads(p0, c1, c2, p3, tol = TOL) {
    // the error of one quadratic for a cubic is √3/36 · |p3 − 3c2 + 3c1 − p0|, and falls with the cube of the pieces
    const dx = p3.x - 3 * c2.x + 3 * c1.x - p0.x, dy = p3.y - 3 * c2.y + 3 * c1.y - p0.y;
    const err = (Math.sqrt(3) / 36) * Math.hypot(dx, dy);
    const n = Math.max(1, Math.min(32, Math.ceil(Math.cbrt(err / tol))));
    const out = [];
    let rest = [p0, c1, c2, p3];
    for (let i = n; i >= 1; i--) {
      let piece;
      if (i === 1) piece = rest; else { const s = split(rest[0], rest[1], rest[2], rest[3], 1 / i); piece = s[0]; rest = s[1]; }
      const [a, b, c, d] = piece;
      out.push([{ x: (3 * (b.x + c.x) - a.x - d.x) / 4, y: (3 * (b.y + c.y) - a.y - d.y) / 4 }, d]);
    }
    return out;
  }
  const isLine = (a, b) => a.ox === a.x && a.oy === a.y && b.ix === b.x && b.iy === b.y;
  function points(contours) {
    const out = [];
    for (const c of contours) {
      const p = c.pts, n = p.length;
      if (n < 2) continue;
      const pts = [{ x: p[0].x, y: p[0].y, on: true }];
      for (let i = 0; i < n; i++) {
        const a = p[i], b = p[(i + 1) % n], last = i === n - 1;
        if (isLine(a, b)) { if (!last) pts.push({ x: b.x, y: b.y, on: true }); continue; }
        const qs = quads(a, { x: a.ox, y: a.oy }, { x: b.ix, y: b.iy }, b);
        qs.forEach(([q, e], k) => { pts.push({ x: q.x, y: q.y, on: false }); if (!(last && k === qs.length - 1)) pts.push({ x: e.x, y: e.y, on: true }); });
      }
      const r = pts.map((q) => ({ x: Math.round(q.x), y: Math.round(q.y), on: q.on }))
        .filter((q, i, a) => i === 0 || q.x !== a[i - 1].x || q.y !== a[i - 1].y || q.on !== a[i - 1].on);
      while (r.length > 1 && r[r.length - 1].on && r[r.length - 1].x === r[0].x && r[r.length - 1].y === r[0].y) r.pop();
      if (r.length > 1) out.push(r);
    }
    return out;
  }
  /** One glyph's glyf record (simple glyph, no instructions), or an empty array for a glyph with no outline. */
  function glyphData(cs) {
    if (!cs.length) return { bytes: new Uint8Array(0), box: null, n: 0, c: 0 };
    const all = cs.flat();
    const box = { xMin: Math.min(...all.map((q) => q.x)), yMin: Math.min(...all.map((q) => q.y)), xMax: Math.max(...all.map((q) => q.x)), yMax: Math.max(...all.map((q) => q.y)) };
    const flags = [], xs = [], ys = [];
    let px = 0, py = 0;
    for (const q of all) {
      let f = q.on ? 1 : 0;
      const dx = q.x - px, dy = q.y - py;
      if (dx === 0) f |= 16; else if (Math.abs(dx) < 256) { f |= 2; if (dx > 0) f |= 16; xs.push([1, Math.abs(dx)]); } else xs.push([2, dx]);
      if (dy === 0) f |= 32; else if (Math.abs(dy) < 256) { f |= 4; if (dy > 0) f |= 32; ys.push([1, Math.abs(dy)]); } else ys.push([2, dy]);
      flags.push(f); px = q.x; py = q.y;
    }
    const size = 10 + cs.length * 2 + 2 + flags.length + [...xs, ...ys].reduce((s, [w]) => s + w, 0);
    const out = new Uint8Array(size), dv = new DataView(out.buffer);
    dv.setInt16(0, cs.length); dv.setInt16(2, box.xMin); dv.setInt16(4, box.yMin); dv.setInt16(6, box.xMax); dv.setInt16(8, box.yMax);
    let at = 10, end = -1;
    for (const c of cs) { end += c.length; dv.setUint16(at, end); at += 2; }
    dv.setUint16(at, 0); at += 2;   // no instructions
    for (const f of flags) out[at++] = f;
    for (const [w, v] of [...xs, ...ys]) { if (w === 1) out[at++] = v; else { dv.setInt16(at, v); at += 2; } }
    return { bytes: out, box, n: all.length, c: cs.length };
  }
  function tables(glyphs) {
    const recs = glyphs.map((g) => glyphData(points(P.reverse(P.orient(g.contours)))));
    const total = recs.reduce((s, r) => s + ((r.bytes.length + 3) & ~3), 0);
    const glyf = new Uint8Array(total), loca = new Uint8Array((recs.length + 1) * 4), ldv = new DataView(loca.buffer);
    let off = 0;
    recs.forEach((r, i) => { ldv.setUint32(i * 4, off); glyf.set(r.bytes, off); off += (r.bytes.length + 3) & ~3; });
    ldv.setUint32(recs.length * 4, off);
    const maxp = new Uint8Array(32), mdv = new DataView(maxp.buffer);
    mdv.setUint32(0, 0x00010000); mdv.setUint16(4, glyphs.length);
    mdv.setUint16(6, Math.max(0, ...recs.map((r) => r.n))); mdv.setUint16(8, Math.max(0, ...recs.map((r) => r.c)));
    mdv.setUint16(14, 2);   // maxZones
    const hmtx = new Uint8Array(glyphs.length * 4), hdv = new DataView(hmtx.buffer);
    glyphs.forEach((g, i) => { hdv.setUint16(i * 4, Math.max(0, Math.round(g.advance))); hdv.setInt16(i * 4 + 2, recs[i].box ? recs[i].box.xMin : 0); });
    const boxes = recs.map((r) => r.box).filter(Boolean);
    const box = boxes.length ? { xMin: Math.min(...boxes.map((b) => b.xMin)), yMin: Math.min(...boxes.map((b) => b.yMin)), xMax: Math.max(...boxes.map((b) => b.xMax)), yMax: Math.max(...boxes.map((b) => b.yMax)) } : { xMin: 0, yMin: 0, xMax: 0, yMax: 0 };
    return { glyf, loca, maxp, hmtx, box };
  }
  return { TOL, quads, points, tables, mid };
});
