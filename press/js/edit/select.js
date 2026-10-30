/* Slop Press — the Selection tool: select, move (with snapping, Alt-duplicate, page-to-page), resize,
   marquee, ruler-guide dragging and text threading through frame ports. */
(function () {
  'use strict';
  var PR = window.PR, V = PR.view, S = PR.state, I = PR.items, M = PR.model, T = PR.tools, SN = PR.snap, PT = PR.paint, H = PR.history;
  var SEL = PR.selectTool = { loaded: null };

  function activate(s) {
    if (!s) return;
    if (s.pageIdx != null && S.page !== s.pageIdx) { S.page = s.pageIdx; PR.emit('page', S.page); }
    if (s.master && S.editMaster && S.editMaster.side !== s.mside) S.editMaster.side = s.mside;
  }
  SEL.activate = activate;
  function local(it, s, w) { return I.toLocal(it, w.x - s.x, w.y - s.y); }

  /** e: the pointer event, so a finger gets a 44 px handle (SlopTouch.hit) where a mouse gets 10 px. */
  function handleAt(w, e) {
    var r = (PT.HANDLE + 3) / 2, hs = 2 * (e && window.SlopTouch ? SlopTouch.hit(e, r) : r) / V.zoom, sel = PR.selected();
    if (S.text) return null;
    for (var k = 0; k < sel.length; k++) {
      var it = sel[k], s = PT.surfaceOf(it); if (!s) continue;
      var p = local(it, s, w), hd = PT.handles(it);
      for (var j = 0; j < hd.length; j++) if (Math.abs(p.x - hd[j][1]) <= hs / 2 && Math.abs(p.y - hd[j][2]) <= hs / 2) return { it: it, s: s, h: hd[j][0] };
      if (it.type === 'text') {
        var P2 = PT.ports(it);
        for (var nm in P2) { var b = P2[nm]; if (p.x >= b.x - 2 / V.zoom && p.x <= b.x + b.s + 2 / V.zoom && p.y >= b.y - 2 / V.zoom && p.y <= b.y + b.s + 2 / V.zoom) return { it: it, s: s, port: nm }; }
      }
    }
    return null;
  }
  SEL.guideAt = function (w) {
    var s = V.surfaceAt(w.x, w.y), tol = 4 / V.zoom; if (!s) return null;
    for (var k = (s.guides || []).length - 1; k >= 0; k--) {
      var g = s.guides[k], v = g.axis === 'x' ? w.x - s.x : w.y - s.y;
      if (Math.abs(v - g.pos) <= tol) return { s: s, g: g, k: k };
    }
    return null;
  };
  /** Drag that moves a guide; dropping it on a ruler deletes it. */
  SEL.guideDrag = function (s, g) {
    PR.guides = PR.guides || {}; PR.guides.selected = null;
    return {
      move: function (w) { var p = SN.point(s, w.x - s.x, w.y - s.y); g.pos = PR.util.round(g.axis === 'x' ? p.x : p.y, 3); PR.touch(); },
      up: function (w, e) {
        var sp = T.screen(e);
        if (sp.x < 0 || sp.y < 0) s.guides.splice(s.guides.indexOf(g), 1);
        H.commit(PR.util.t('press.edit.undo_move_guide'));
      }
    };
  };

  function moveDrag(start, items, alt) {
    var s0 = PT.surfaceOf(items[0]), orig = items.map(function (it) { return { it: it, x: it.x, y: it.y }; });
    var ub = I.unionBounds(items), moved = false, dup = alt;
    return {
      move: function (w, e) {
        var dx = w.x - start.x, dy = w.y - start.y;
        if (!moved && Math.hypot(dx, dy) * V.zoom < 3) return;
        if (!moved && dup) { // Alt-drag: duplicate, then move the copies
          var copies = I.duplicate(S.doc, items.map(function (it) { return it.id; }), 0, 0);
          orig = copies.map(function (c) { return { it: c, x: c.x, y: c.y }; }); items = copies; S.sel = copies.map(function (c) { return c.id; });
        }
        moved = true;
        if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        var sn = SN.rect(s0, { x: ub.x + dx, y: ub.y + dy, w: ub.w, h: ub.h }, items.map(function (it) { return it.id; }));
        dx += sn.dx; dy += sn.dy;
        orig.forEach(function (o) { o.it.x = o.x + dx; o.it.y = o.y + dy; });
        PR.touch();
      },
      up: function () {
        if (!moved) return;
        // dropped onto another page? move the items there
        var c = I.center(items[0]), tgt = V.surfaceAt(s0.x + c.x, s0.y + c.y, true);
        if (tgt && tgt.key !== s0.key) { // V.surfaces() builds new objects on every call: compare by key
          items.forEach(function (it) { it.x += s0.x - tgt.x; it.y += s0.y - tgt.y; });
          I.moveTo(S.doc, items.map(function (it) { return it.id; }), tgt.items);
          activate(tgt);
        }
        H.commit(PR.util.t(dup ? 'press.edit.undo_duplicate' : 'press.edit.undo_move'));
      }
    };
  }
  function resizeDrag(hd) {
    var it = hd.it, s = hd.s, o = { x: it.x, y: it.y, w: it.w, h: it.h }, h = hd.h;
    return {
      move: function (w, e) {
        var p = I.toLocal(U_(o, it), w.x - s.x, w.y - s.y);
        if (!it.rot) { var sp = SN.point(s, w.x - s.x, w.y - s.y, [it.id]); p = { x: sp.x - o.x, y: sp.y - o.y }; }
        var x0 = 0, y0 = 0, x1 = o.w, y1 = o.h;
        if (/w/.test(h)) x0 = Math.min(p.x, x1 - 1); if (/e/.test(h)) x1 = Math.max(p.x, x0 + 1);
        if (/^n/.test(h)) y0 = Math.min(p.y, y1 - 1); if (/^s/.test(h)) y1 = Math.max(p.y, y0 + 1);
        if (e.shiftKey && h.length === 2) { // keep proportions
          var r = o.w / o.h, nw = x1 - x0, nh = y1 - y0;
          if (nw / nh > r) nh = nw / r; else nw = nh * r;
          if (/w/.test(h)) x0 = x1 - nw; else x1 = x0 + nw;
          if (/^n/.test(h)) y0 = y1 - nh; else y1 = y0 + nh;
        }
        it.x = o.x + x0; it.y = o.y + y0; it.w = x1 - x0; it.h = y1 - y0;
        PR.touch();
      },
      up: function () { H.commit(PR.util.t('press.edit.undo_resize')); }
    };
  }
  function U_(o, it) { return { x: o.x, y: o.y, w: o.w, h: o.h, rot: it.rot }; }
  function marquee(start) {
    var cur = start;
    T.preview = function (ctx) {
      ctx.save(); ctx.strokeStyle = PT.ACCENT; ctx.fillStyle = 'rgba(79,140,255,.08)'; ctx.lineWidth = 1 / V.zoom;
      ctx.fillRect(start.x, start.y, cur.x - start.x, cur.y - start.y); ctx.strokeRect(start.x, start.y, cur.x - start.x, cur.y - start.y); ctx.restore();
    };
    return {
      move: function (w) { cur = w; },
      up: function (w, e) {
        T.preview = null;
        var x0 = Math.min(start.x, w.x), x1 = Math.max(start.x, w.x), y0 = Math.min(start.y, w.y), y1 = Math.max(start.y, w.y), ids = [];
        if (x1 - x0 > 2 / V.zoom || y1 - y0 > 2 / V.zoom) V.surfaces().forEach(function (s) {
          s.items.forEach(function (it) {
            if (PR.layers.locked(S.doc, it) || !PR.layers.visible(S.doc, it)) return;
            var b = I.bounds(it);
            if (b.x + s.x < x1 && b.x + b.w + s.x > x0 && b.y + s.y < y1 && b.y + b.h + s.y > y0) ids.push(it.id);
          });
        });
        PR.select(e.shiftKey ? S.sel.concat(ids) : ids);
        var s2 = V.surfaceAt(start.x, start.y); if (s2) activate(s2);
      }
    };
  }

  /* ---------- threading ---------- */
  SEL.linkTo = function (target) {
    var from = SEL.loaded; SEL.loaded = null; V.canvas.classList.remove('loaded');
    if (!from || !target || target.type !== 'text') return false;
    var ok = I.link(S.doc, from, target.id);
    if (ok) { H.commit(PR.util.t('press.edit.undo_thread_frames')); PR.select([target.id]); } else PR.util.toast(PR.util.t('press.app.cannot_thread'));
    return ok;
  };
  function loadThread(it) { SEL.loaded = it.id; V.canvas.classList.add('loaded'); PR.util.toast(PR.util.t('press.app.thread_hint')); }

  T.define('select', {
    down: function (w, e) {
      if (SEL.loaded) {
        var hit = T.hit(w.x, w.y);
        if (hit && hit.it.type === 'text') { SEL.linkTo(hit.it); return null; }
        return PR.createTool.drag('text', w, e, function (fr) { SEL.linkTo(fr); });
      }
      var hd = handleAt(w, e);
      if (hd && hd.h) return resizeDrag(hd);
      if (hd && hd.port === 'out') { loadThread(hd.it); return null; }
      if (hd && hd.port === 'inp' && hd.it.prev) { I.breakAfter(S.doc, hd.it.prev); H.commit(PR.util.t('press.edit.undo_break_thread')); return null; }
      var h = T.hit(w.x, w.y);
      if (h) {
        if (S.text && S.text.frame !== h.it.id) PR.textEdit.exit();
        activate(h.s);
        if (e.shiftKey) { var i = S.sel.indexOf(h.it.id); PR.select(i >= 0 ? S.sel.filter(function (x) { return x !== h.it.id; }) : S.sel.concat(h.it.id)); return null; }
        if (S.sel.indexOf(h.it.id) < 0) PR.select([h.it.id]);
        return moveDrag(w, PR.selected().filter(function (it) { var s = PT.surfaceOf(it); return s && s.key === h.s.key; }), e.altKey);
      }
      var gd = SEL.guideAt(w);
      if (gd) return SEL.guideDrag(gd.s, gd.g);
      if (S.text) PR.textEdit.exit();
      if (!e.shiftKey) PR.select([]);
      return marquee(w);
    },
    dbl: function (w) {
      var h = T.hit(w.x, w.y);
      if (h && h.it.type === 'text') { PR.tools.set('text'); PR.textEdit.enterAt(h.it, h.s, w); }
      else if (h && h.it.type === 'image') PR.ui && PR.ui.placeImage && PR.ui.placeImage(h.it);
    },
    hover: function (w) {
      var hd = handleAt(w), c = '';
      if (hd && hd.h) c = { n: 'ns', s: 'ns', e: 'ew', w: 'ew', nw: 'nwse', se: 'nwse', ne: 'nesw', sw: 'nesw' }[hd.h] + '-resize';
      else if (hd && hd.port) c = 'pointer';
      else if (SEL.guideAt(w)) c = 'move';
      var hv = T.hit(w.x, w.y);
      if (hv) c = 'move';
      var hid = hv && S.sel.indexOf(hv.it.id) < 0 ? hv.it.id : null;
      if (hid !== T.hover) { T.hover = hid; V.request(); }
      V.canvas.style.cursor = SEL.loaded ? 'copy' : c;
    }
  });
  void M;
})();
