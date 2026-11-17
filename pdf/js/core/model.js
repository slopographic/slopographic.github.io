/* Slop PDF — document model: state, geometry (view <-> page space) and page operations (undo/redo: core/history.js).
   Annotation geometry lives in the page's unrotated user space measured from the top-left of the
   visible box (pdf.js page.view), in PDF points. Box kinds (text, rect, ellipse, image, whiteout,
   hlbox, redact, note, callout) have cx, cy, w, h, rot (a callout also has tip, its leader-line end); path kinds (pen, marker, line, arrow) have pts [[u,v],...]. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util;
  var E = SP.engine = U.emitter();

  E.COLORS = ['#c6f432', '#ff5fa2', '#38d6ff', '#ff9f1c', '#a98bff', '#2ee6a8', '#ffd23f', '#ff6b5a'];
  E.files = new Map();
  E.assets = new Map();
  E.state = blank();
  function blank() {
    return { pages: [], meta: { title: '', author: '', subject: '', keywords: '' }, stamps: { pageNumbers: null, watermark: null }, forms: {}, flattenForms: false };
  }
  E.SIZES = { a4: [595.28, 841.89], letter: [612, 792], legal: [612, 1008], a5: [419.53, 595.28], a3: [841.89, 1190.55] };
  E._colorIdx = 0;
  E.blankState = blank;
  E.pagesForFile = function (f) {
    var out = [];
    for (var i = 0; i < f.numPages; i++) out.push({ id: f.id + '.' + i, f: f.id, i: i, rot: 0, annots: [] }); // stable ids: the saved log refers to them
    return out;
  };
  E.fileOfPage = function (p) { return p && p.f ? E.files.get(p.f) : null; };

  /* ------------------------------------------------------------ geometry */
  E.geom = function (p) {
    if (p.blank) return { W: p.blank.w, H: p.blank.h, x0: 0, y0: 0, base: 0 };
    var f = E.files.get(p.f), inf = f && f.info[p.i];
    if (!inf) return { W: 612, H: 792, x0: 0, y0: 0, base: 0 };
    var v = inf.view;
    return { W: v[2] - v[0], H: v[3] - v[1], x0: v[0], y0: v[1], base: inf.rotate };
  };
  E.rotation = function (p) { var g = E.geom(p); return (((g.base + (p.rot || 0)) % 360) + 360) % 360; };
  E.viewSize = function (p) { var g = E.geom(p), R = E.rotation(p); return R % 180 ? { w: g.H, h: g.W } : { w: g.W, h: g.H }; };
  /** unrotated page point (u,v) → view point (x,y) at rotation R (clockwise) */
  E.toView = function (R, W, H, u, v) {
    if (R === 90) return [H - v, u];
    if (R === 180) return [W - u, H - v];
    if (R === 270) return [v, W - u];
    return [u, v];
  };
  E.toPage = function (R, W, H, x, y) {
    if (R === 90) return [y, H - x];
    if (R === 180) return [W - x, H - y];
    if (R === 270) return [W - y, x];
    return [x, y];
  };
  E.BOX = { para: 1, text: 1, rect: 1, ellipse: 1, image: 1, whiteout: 1, hlbox: 1, redact: 1, note: 1, callout: 1, step: 1 };
  E.isBox = function (a) { return !!E.BOX[a.type]; };
  /** Axis-aligned rectangle of an annotation in view space (points) for a page at rotation R. */
  E.annotViewRect = function (a, R, W, H) {
    if (E.isBox(a)) {
      var c = E.toView(R, W, H, a.cx, a.cy), va = ((((R - (a.rot || 0)) % 360) + 360) % 360);
      var sw = va % 180 ? a.h : a.w, sh = va % 180 ? a.w : a.h;
      if (va % 90) { var cs = Math.abs(Math.cos(va * Math.PI / 180)), sn = Math.abs(Math.sin(va * Math.PI / 180)); sw = a.w * cs + a.h * sn; sh = a.w * sn + a.h * cs; } // turned freely: its bounds
      return { x: c[0] - sw / 2, y: c[1] - sh / 2, w: sw, h: sh };
    }
    var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    a.pts.forEach(function (pt) { var q = E.toView(R, W, H, pt[0], pt[1]); minx = Math.min(minx, q[0]); miny = Math.min(miny, q[1]); maxx = Math.max(maxx, q[0]); maxy = Math.max(maxy, q[1]); });
    return { x: minx, y: miny, w: maxx - minx, h: maxy - miny };
  };
  /** Moves/resizes annotation so its view rect becomes r (mutates a). */
  E.setAnnotViewRect = function (a, r, R, W, H) {
    if (E.isBox(a)) {
      var c = E.toPage(R, W, H, r.x + r.w / 2, r.y + r.h / 2), va = ((((R - (a.rot || 0)) % 360) + 360) % 360);
      if (va % 90) { var o0 = E.annotViewRect(a, R, W, H); a.cx = c[0]; a.cy = c[1]; if (o0.w > 0.01 && o0.h > 0.01) { a.w *= r.w / o0.w; a.h *= r.h / o0.h; } return a; } // turned freely: scaled with its bounds
      a.cx = c[0]; a.cy = c[1];
      if (va % 180) { a.w = r.h; a.h = r.w; } else { a.w = r.w; a.h = r.h; }
      return a;
    }
    var o = E.annotViewRect(a, R, W, H);
    var sx = o.w > 0.01 ? r.w / o.w : 1, sy = o.h > 0.01 ? r.h / o.h : 1;
    a.pts = a.pts.map(function (pt) {
      var q = E.toView(R, W, H, pt[0], pt[1]);
      var nx = r.x + (q[0] - o.x) * sx, ny = r.y + (q[1] - o.y) * sy;
      var b = E.toPage(R, W, H, nx, ny);
      return [U.round(b[0], 2), U.round(b[1], 2)];
    });
    return a;
  };

  /* --------------------------------------------------- organizer operations */
  function idSet(ids) { var s = new Set(); ids.forEach(function (i) { s.add(i); }); return s; }
  E.ops = {
    rotate: function (st, ids, delta) { var s = idSet(ids); st.pages.forEach(function (p) { if (s.has(p.id)) p.rot = (((p.rot || 0) + delta) % 360 + 360) % 360; }); },
    remove: function (st, ids) { var s = idSet(ids); st.pages = st.pages.filter(function (p) { return !s.has(p.id); }); },
    duplicate: function (st, ids) {
      var s = idSet(ids), out = [], added = [];
      st.pages.forEach(function (p) {
        out.push(p);
        if (s.has(p.id)) {
          var c = JSON.parse(JSON.stringify(p)); c.id = p.id + '#' + U.uid('p');
          c.annots.forEach(function (a) { a.id = U.uid('a'); });
          out.push(c); added.push(c.id);
        }
      });
      st.pages = out; return added;
    },
    /** move pages ids so they sit before the page that is currently at index `before` (0..len) */
    move: function (st, ids, before) {
      var s = idSet(ids), moving = [], rest = [], adj = before;
      st.pages.forEach(function (p, i) { if (s.has(p.id)) { moving.push(p); if (i < before) adj--; } else rest.push(p); });
      adj = U.clamp(adj, 0, rest.length);
      st.pages = rest.slice(0, adj).concat(moving, rest.slice(adj));
    },
    insert: function (st, index, pages) { st.pages.splice(U.clamp(index, 0, st.pages.length), 0, ...pages); },
    reverse: function (st, ids) {
      if (!ids || ids.length < 2) { st.pages.reverse(); return; }
      var s = idSet(ids), pos = [], sel = [];
      st.pages.forEach(function (p, i) { if (s.has(p.id)) { pos.push(i); sel.push(p); } });
      sel.reverse(); pos.forEach(function (i, k) { st.pages[i] = sel[k]; });
    },
    sort: function (st, mode) {
      var a = st.pages.slice(), n = a.length, out = [];
      if (mode === 'collate' || mode === 'collate-same') {
        var h = Math.ceil(n / 2), fronts = a.slice(0, h), backs = a.slice(h);
        if (mode === 'collate') backs.reverse();
        for (var i = 0; i < h; i++) { out.push(fronts[i]); if (backs[i]) out.push(backs[i]); }
      } else if (mode === 'odd-even') {
        out = a.filter(function (_, i) { return i % 2 === 0; }).concat(a.filter(function (_, i) { return i % 2 === 1; }));
      } else if (mode === 'even-odd') {
        out = a.filter(function (_, i) { return i % 2 === 1; }).concat(a.filter(function (_, i) { return i % 2 === 0; }));
      } else if (mode === 'source') {
        var order = Array.from(E.files.keys());
        out = a.map(function (p, i) { return { p: p, i: i }; }).sort(function (x, y) {
          var fx = x.p.f ? order.indexOf(x.p.f) : 1e9, fy = y.p.f ? order.indexOf(y.p.f) : 1e9;
          if (fx !== fy) return fx - fy;
          if (x.p.f && y.p.f && x.p.i !== y.p.i) return x.p.i - y.p.i;
          return x.i - y.i;
        }).map(function (x) { return x.p; });
      } else out = a;
      st.pages = out;
    }
  };
  E.pageById = function (id) { var p = null; E.state.pages.some(function (x) { if (x.id === id) { p = x; return true; } return false; }); return p; };
  E.indexOf = function (id) { for (var i = 0; i < E.state.pages.length; i++) if (E.state.pages[i].id === id) return i; return -1; };
  E.blankPage = function (w, h) { return { id: U.uid('p'), blank: { w: w, h: h }, rot: 0, annots: [] }; };
  E.addAsset = function (a) { a.id = a.id || U.uid('img'); E.assets.set(a.id, a); return a; };
})();
