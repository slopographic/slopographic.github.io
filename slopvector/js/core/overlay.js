/* SlopVector — core: selection overlay (bounding boxes, anchors, guides) */
(function () {
  'use strict';
  var G = window.SVGeom;
  var SV = window.SV = window.SV || {};
  var SVGNS = 'http://www.w3.org/2000/svg';
  var abs = Math.abs, min = Math.min, max = Math.max, PI = Math.PI, round = Math.round;
  var fmt = G.fmt;
  var IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  var $ = SV._core = SV._core || {};
  function V() { return $.V.apply(this, arguments); }
  function docSubs() { return $.docSubs.apply(this, arguments); }
  function esc() { return $.esc.apply(this, arguments); }
  function getObj() { return $.getObj.apply(this, arguments); }
  function layerOf() { return $.layerOf.apply(this, arguments); }
  function localBox() { return $.localBox.apply(this, arguments); }
  function selBBox() { return $.selBBox.apply(this, arguments); }
  function selObjs() { return $.selObjs.apply(this, arguments); }
  function stageRect() { return $.stageRect.apply(this, arguments); }
  function toScreen() { return $.toScreen.apply(this, arguments); }
  var D = $.D;
  var LAYER_COLORS = $.LAYER_COLORS;
  var S = $.S;

  /* ================= overlay (selection UI) ================= */
  function scr(p) { return toScreen(p); }
  /** The selection colour of the object's layer (a #rrggbb; a layer from a file may say anything, so it is checked). */
  function selColorOf(id) { var L = layerOf(id); return L && /^#[0-9a-f]{3,8}$/i.test(L.color) ? L.color : LAYER_COLORS[0]; }
  SV.HANDLE_NAMES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  function handlePositions(b) {
    var x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h, xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
    return { nw: [x0, y0], n: [xm, y0], ne: [x1, y0], e: [x1, ym], se: [x1, y1], s: [xm, y1], sw: [x0, y1], w: [x0, ym] };
  }
  SV.handlePositions = handlePositions;
  function screenBox(b) { var a = scr({ x: b.x, y: b.y }); return { x: a.x, y: a.y, w: b.w * S.view.zoom, h: b.h * S.view.zoom }; }
  SV.screenBox = screenBox;
  function outlineD(o) {
    if (o.type === 'group') return o.children.filter(function (c) { return !c.hidden; }).map(outlineD).join('');
    return G.toD(docSubs(o), V());
  }
  SV.outlineD = outlineD;
  function renderOverlay() {
    if (!D.overlay) return;
    var out = [], r = stageRect(), z = S.view.zoom, tool = S.tool;
    // guides
    if (S.prefs.guides) {
      S.doc.guides.v.forEach(function (gx) { var x = round(gx * z + S.view.x) + 0.5; out.push('<line class="guide" x1="' + x + '" y1="0" x2="' + x + '" y2="' + r.height + '"/>'); });
      S.doc.guides.h.forEach(function (gy) { var y = round(gy * z + S.view.y) + 0.5; out.push('<line class="guide" x1="0" y1="' + y + '" x2="' + r.width + '" y2="' + y + '"/>'); });
    }
    if (S.guidePreview && S.guidePreview.length) S.guidePreview.forEach(function (g) {
      var p = round(g.pos * z + (g.o === 'v' ? S.view.x : S.view.y)) + 0.5;
      out.push(g.o === 'v' ? '<line class="guide preview" x1="' + p + '" y1="0" x2="' + p + '" y2="' + r.height + '"/>' : '<line class="guide preview" x1="0" y1="' + p + '" x2="' + r.width + '" y2="' + p + '"/>');
    });
    if (S.guideDrag) {
      var gd = S.guideDrag;
      if (gd.axis === 'v') { var gx2 = round(gd.pos * z + S.view.x) + 0.5; out.push('<line class="guide active" x1="' + gx2 + '" y1="0" x2="' + gx2 + '" y2="' + r.height + '"/>'); }
      else { var gy2 = round(gd.pos * z + S.view.y) + 0.5; out.push('<line class="guide active" x1="0" y1="' + gy2 + '" x2="' + r.width + '" y2="' + gy2 + '"/>'); }
    }
    // hover highlight
    if (S.hover && S.sel.indexOf(S.hover) < 0 && !S.op) {
      var ho = getObj(S.hover);
      if (ho) out.push('<path class="hover" d="' + outlineD(ho) + '" stroke="' + selColorOf(ho.id) + '"/>');
    }
    var direct = tool === 'direct' || tool === 'addAnchor' || tool === 'deleteAnchor' || tool === 'convertAnchor' || tool === 'pen' || tool === 'scissors';
    var objs = selObjs();
    if (!S.editing) {
      objs.forEach(function (o) {
        var col = selColorOf(o.id);
        if (o.type === 'text' || o.type === 'image') {
          var lb = localBox(o), M = G.mul(V(), o.m);
          var pts = [[lb.x, lb.y], [lb.x + lb.w, lb.y], [lb.x + lb.w, lb.y + lb.h], [lb.x, lb.y + lb.h]].map(function (p) { var q = G.ap(M, p[0], p[1]); return fmt(q.x) + ',' + fmt(q.y); });
          out.push('<polygon class="selo" points="' + pts.join(' ') + '" stroke="' + col + '"/>');
          if (o.type === 'text') { var a = G.ap(M, lb.x, o.y), bpt = G.ap(M, lb.x + lb.w, o.y); out.push('<line class="selo" x1="' + fmt(a.x) + '" y1="' + fmt(a.y) + '" x2="' + fmt(bpt.x) + '" y2="' + fmt(bpt.y) + '" stroke="' + col + '"/>'); }
        } else {
          out.push('<path class="selo" d="' + outlineD(o) + '" stroke="' + col + '"/>');
        }
        if (direct) out.push(anchorsSVG(o, col));
      });
      // bounding box
      if ((tool === 'select' || tool === 'rotate' || tool === 'scale') && objs.length && !S.pen) {
        var b = selBBox();
        if (b) {
          var sb = screenBox(b), col = selColorOf(objs[0].id);
          out.push('<rect class="bbox" x="' + fmt(sb.x) + '" y="' + fmt(sb.y) + '" width="' + fmt(sb.w) + '" height="' + fmt(sb.h) + '" stroke="' + col + '"/>');
          if (tool === 'select' && (b.w * z > 6 || b.h * z > 6)) {
            var hp = handlePositions(sb);
            SV.HANDLE_NAMES.forEach(function (n) { out.push('<rect class="handle" x="' + fmt(hp[n][0] - 3.5) + '" y="' + fmt(hp[n][1] - 3.5) + '" width="7" height="7" stroke="' + col + '"/>'); });
          }
          if ((tool === 'rotate' || tool === 'scale')) {
            var org = S.origin || { x: b.x + b.w / 2, y: b.y + b.h / 2 }, so = scr(org);
            out.push('<g class="origin" transform="translate(' + fmt(so.x) + ' ' + fmt(so.y) + ')"><circle r="5"/><path d="M-9 0H9M0 -9V9"/></g>');
          }
        }
      }
    }
    // pen in progress
    if (S.pen && tool === 'pen') {
      var po = getObj(S.pen.id);
      if (po && S.pen.cursor && !S.op) {
        var sp = po.subpaths[S.pen.sub], last = sp.pts[sp.pts.length - 1], c = S.pen.cursor;
        var p0 = scr(last), p1 = scr({ x: last.ox, y: last.oy }), p3 = scr(c);
        out.push('<path class="rubber" d="M' + fmt(p0.x) + ' ' + fmt(p0.y) + 'C' + fmt(p1.x) + ' ' + fmt(p1.y) + ' ' + fmt(p3.x) + ' ' + fmt(p3.y) + ' ' + fmt(p3.x) + ' ' + fmt(p3.y) + '"/>');
      }
    }
    // pencil preview
    if (S.op && S.op.kind === 'pencil' && S.op.pts.length > 1) {
      out.push('<path class="pencil" d="M' + S.op.pts.map(function (p) { var q = scr(p); return fmt(q.x) + ' ' + fmt(q.y); }).join('L') + '"/>');
    }
    // gradient annotator
    if (tool === 'gradient' && objs.length === 1 && objs[0].style && objs[0].style.fill && typeof objs[0].style.fill === 'object') {
      var go = objs[0], gp = go.style.fill, gb = localBox(go.type === 'group' ? go : go), GM = G.mul(V(), go.type === 'path' ? G.I() : go.m);
      if (go.type === 'path') gb = G.subsBBox(go.subpaths);
      if (gb) {
        var gs1, gs2;
        if (gp.type === 'radial') { gs1 = [gp.cx, gp.cy]; gs2 = [gp.cx + gp.r, gp.cy]; } else { gs1 = [gp.x1, gp.y1]; gs2 = [gp.x2, gp.y2]; }
        var A1 = G.ap(GM, gb.x + gs1[0] * gb.w, gb.y + gs1[1] * gb.h), A2 = G.ap(GM, gb.x + gs2[0] * gb.w, gb.y + gs2[1] * gb.h);
        out.push('<line class="gradline" x1="' + fmt(A1.x) + '" y1="' + fmt(A1.y) + '" x2="' + fmt(A2.x) + '" y2="' + fmt(A2.y) + '"/><circle class="gradend" cx="' + fmt(A1.x) + '" cy="' + fmt(A1.y) + '" r="5"/><rect class="gradend" x="' + fmt(A2.x - 4) + '" y="' + fmt(A2.y - 4) + '" width="8" height="8"/>');
      }
    }
    // marquee
    if (S.marquee) {
      var mq = S.marquee, m0 = scr({ x: mq.x, y: mq.y });
      out.push('<rect class="marquee' + (S.marquee.zoom ? ' zoom' : '') + '" x="' + fmt(m0.x) + '" y="' + fmt(m0.y) + '" width="' + fmt(mq.w * z) + '" height="' + fmt(mq.h * z) + '"/>');
    }
    // smart guides
    S.snapLines.forEach(function (l) {
      var a = scr({ x: l[0], y: l[1] }), bq = scr({ x: l[2], y: l[3] });
      out.push('<line class="smart" x1="' + fmt(a.x) + '" y1="' + fmt(a.y) + '" x2="' + fmt(bq.x) + '" y2="' + fmt(bq.y) + '"/>');
    });
    // readout
    if (S.readout) {
      var ro = S.readout, lines = ro.text.split('\n'), w = max.apply(null, lines.map(function (l) { return l.length; })) * 6.4 + 14, h = lines.length * 14 + 8;
      var rx = min(ro.x + 16, r.width - w - 4), ry = min(ro.y + 18, r.height - h - 4);
      out.push('<g class="readout" transform="translate(' + fmt(rx) + ' ' + fmt(ry) + ')"><rect width="' + fmt(w) + '" height="' + h + '" rx="3"/>' + lines.map(function (l, i) { return '<text x="7" y="' + (15 + i * 14) + '">' + esc(l) + '</text>'; }).join('') + '</g>');
    }
    D.overlay.innerHTML = out.join('');
  }
  SV.renderOverlay = renderOverlay;
  function anchorsSVG(o, col) {
    if (o.type === 'group') return o.children.map(function (c) { return anchorsSVG(c, col); }).join('');
    if (o.type === 'text' || o.type === 'image') return '';
    var subs = docSubs(o), selp = S.psel[o.id] || [], out = '';
    subs.forEach(function (sp, si) {
      var n = sp.pts.length;
      sp.pts.forEach(function (a, i) {
        var isSel = selp.indexOf(si + ':' + i) >= 0;
        var prevSel = selp.indexOf(si + ':' + ((i - 1 + n) % n)) >= 0 && (sp.closed || i > 0);
        var nextSel = selp.indexOf(si + ':' + ((i + 1) % n)) >= 0 && (sp.closed || i < n - 1);
        var s = scr(a);
        if (o.type === 'path' && (isSel || prevSel || nextSel || (S.pen && S.pen.id === o.id))) {
          if (G.hasIn(a) && (isSel || prevSel || (S.pen && S.pen.id === o.id))) { var hi = scr({ x: a.ix, y: a.iy }); out += '<line class="hline" x1="' + fmt(s.x) + '" y1="' + fmt(s.y) + '" x2="' + fmt(hi.x) + '" y2="' + fmt(hi.y) + '" stroke="' + col + '"/><circle class="hdot" cx="' + fmt(hi.x) + '" cy="' + fmt(hi.y) + '" r="3" stroke="' + col + '"/>'; }
          if (G.hasOut(a) && (isSel || nextSel || (S.pen && S.pen.id === o.id))) { var ho = scr({ x: a.ox, y: a.oy }); out += '<line class="hline" x1="' + fmt(s.x) + '" y1="' + fmt(s.y) + '" x2="' + fmt(ho.x) + '" y2="' + fmt(ho.y) + '" stroke="' + col + '"/><circle class="hdot" cx="' + fmt(ho.x) + '" cy="' + fmt(ho.y) + '" r="3" stroke="' + col + '"/>'; }
        }
        out += '<rect class="anchor' + (isSel ? ' sel' : '') + '" x="' + fmt(s.x - 3) + '" y="' + fmt(s.y - 3) + '" width="6" height="6" stroke="' + col + '"' + (isSel ? ' fill="' + col + '"' : '') + '/>';
      });
    });
    return out;
  }

  $.renderOverlay = renderOverlay;
})();
