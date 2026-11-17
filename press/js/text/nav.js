/* Slop Press — caret geometry over laid-out text: offset ↔ position, hit testing, line navigation, selection rects.
   All coordinates are frame-local (the frame's own space before rotation). */
(function () {
  'use strict';
  var PR = window.PR, EN = PR.engine, M = PR.model;
  var N = PR.nav = {};

  function real(g) { return !g.syn && !g.hy; }
  /** All lines of a story in order, each tagged with its frame. */
  N.lines = function (sid) {
    var doc = PR.state.doc, r = EN.story(sid); if (!r) return [];
    var frames = M.storyFrames(doc, sid), out = [];
    frames.forEach(function (fr) { (r.frames[fr.id] || { lines: [] }).lines.forEach(function (l) { out.push({ l: l, fr: fr }); }); });
    return out;
  };
  /** x of offset o within line l. */
  N.xIn = function (l, o) {
    for (var i = 0; i < l.g.length; i++) { var g = l.g[i]; if (real(g) && g.o === o && !g.drop) return g.x; }
    for (var j = 0; j < l.g.length; j++) { var d = l.g[j]; if (d.drop && d.o === o) return d.x; }
    // end of line: after the last visible glyph
    var x = l.x;
    l.g.forEach(function (g) { if (real(g) && !g.hidden && !g.nl && g.o < o) x = Math.max(x, g.x + (g.drop ? g.w : g.w)); });
    return x;
  };
  /** Where offset o is: { fr, l, x, y0, y1 } or null (overset text). */
  N.locate = function (sid, o) {
    var ls = N.lines(sid), hit = null;
    for (var i = 0; i < ls.length; i++) {
      var l = ls[i].l, nextStart = i + 1 < ls.length ? ls[i + 1].l.o0 : Infinity;
      if (o >= l.o0 && (o < l.o1 || (o === l.o1 && (l.end || o < nextStart || i === ls.length - 1)))) { hit = ls[i]; break; }
    }
    if (!hit) {
      if (!ls.length) return null;
      var last = ls[ls.length - 1];
      if (o > last.l.o1) return null;
      hit = last;
    }
    var L = hit.l;
    return { fr: hit.fr, l: L, x: N.xIn(L, o), y0: L.y - L.asc, y1: L.y + L.desc };
  };
  /** Offset nearest to a frame-local point. */
  N.hit = function (fr, lx, ly) {
    var lay = EN.frame(fr), ls = lay.lines;
    if (!ls.length) {
      var r = EN.story(fr.story); return r ? Math.min(r.end, PR.state.doc.stories[fr.story].text.length) : 0;
    }
    // nearest line by vertical distance, preferring the column under x
    var best = null, bd = Infinity;
    ls.forEach(function (l) {
      var dy = ly < l.y - l.asc ? l.y - l.asc - ly : ly > l.y + l.desc ? ly - l.y - l.desc : 0;
      var dx = lx < l.x ? l.x - lx : lx > l.x + l.w ? lx - l.x - l.w : 0;
      var d = dy * 3 + dx;
      if (d < bd) { bd = d; best = l; }
    });
    return N.hitLine(best, lx);
  };
  N.hitLine = function (l, lx) {
    var best = l.o0, bd = Infinity;
    var cand = [];
    l.g.forEach(function (g) { if (real(g) && !g.hidden && !g.nl) { cand.push({ o: g.o, x: g.x }); cand.push({ o: g.o + 1, x: g.x + g.w, after: true }); } });
    cand.push({ o: l.o1, x: N.xIn(l, l.o1) });
    if (!cand.length) return l.o0;
    cand.forEach(function (c) { var d = Math.abs(c.x - lx); if (d < bd) { bd = d; best = c.o; } });
    if (!l.end && best >= l.o1) best = Math.max(l.o0, l.o1 - (l.hy ? 0 : 0));
    return Math.min(best, l.o1);
  };
  /** Offset on the line above/below (dir -1/+1) at x. Returns null at the edges. */
  N.vertical = function (sid, o, dir, x) {
    var ls = N.lines(sid), at = N.locate(sid, o); if (!at) return null;
    var idx = -1;
    for (var i = 0; i < ls.length; i++) if (ls[i].l === at.l) { idx = i; break; }
    var t = ls[idx + dir]; if (!t) return dir < 0 ? 0 : PR.state.doc.stories[sid].text.length;
    return N.hitLine(t.l, x == null ? at.x : x);
  };
  N.lineEdge = function (sid, o, end) {
    var at = N.locate(sid, o); if (!at) return o;
    if (!end) return at.l.o0;
    var e = at.l.o1;
    if (!at.l.end) { var t = PR.state.doc.stories[sid].text; while (e > at.l.o0 && t[e - 1] === ' ') e--; }
    return e;
  };
  /** Selection rectangles [{ fr, x, y, w, h }] for [a, b). */
  N.rects = function (sid, a, b) {
    if (a > b) { var t = a; a = b; b = t; }
    var out = [];
    if (a === b) return out;
    N.lines(sid).forEach(function (e) {
      var l = e.l;
      if (l.o1 < a || l.o0 >= b) return;
      if (l.o1 === a && !l.end) return;
      var x0 = a <= l.o0 ? N.xIn(l, l.o0) : N.xIn(l, a), x1 = b >= l.o1 ? (l.end && b > l.o1 ? Math.max(N.xIn(l, l.o1) + 4, x0 + 4) : N.xIn(l, l.o1)) : N.xIn(l, b);
      if (b > l.o1 && !l.end) x1 = Math.max(x1, l.right || x1);
      if (x1 > x0) out.push({ fr: e.fr, x: x0, y: l.y - l.asc, w: x1 - x0, h: l.asc + l.desc });
    });
    return out;
  };
})();
