/* Slop PDF — dragging a selected annotation or paragraph frame onto another page: the drop's page (any page shown, in the
   continuous, single or two-page layout) takes it, at the drop point (the place the pointer held it by stays under the
   pointer). Alt / Option while dropping copies it instead (on the same page too). The page under the pointer is outlined
   while dragging, and near the viewer's top or bottom edge the view scrolls (a finger's drag too). One undo step: the
   annotation leaves its page and joins the other; a paragraph's old text leaves its page's content as on any first change
   (text-strip.js). Called from pointer.js (annotations) and para-xform.js (frames). Classic script. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, Ed = SP.editor, S = Ed._, P = S.para;
  var C = S.cross = {}, hot = null, scrollV = 0, raf = 0, EDGE = 48;

  /** The page shown under a client point: { pid, p, el, view: [x, y] (view points), page: [x, y] (page space) }, or null. */
  C.pageAt = function (x, y) {
    var els = document.elementsFromPoint ? document.elementsFromPoint(x, y) : [];
    for (var i = 0; i < els.length; i++) {
      var el = els[i].closest && els[i].closest('.pv-page'), s = el && el._slot, p = s && E.pageById(s.pid);
      if (!p) continue;
      var r = el.getBoundingClientRect(), z = Ed.zoom, g = E.geom(p), R = E.rotation(p), v = [(x - r.left) / z, (y - r.top) / z];
      return { pid: s.pid, p: p, el: el, R: R, g: g, view: v, page: E.toPage(R, g.W, g.H, v[0], v[1]) };
    }
    return null;
  };
  function tick() {
    raf = 0;
    if (!scrollV || !S.viewer) return;
    S.viewer.scrollTop += scrollV;
    raf = requestAnimationFrame(tick);
  }
  /** While a drag goes on (ev), or once it ends (null): the outline on the page under it, and the scroll near the edges. */
  C.over = function (ev) {
    var t = ev ? C.pageAt(ev.clientX, ev.clientY) : null, el = t && t.pid !== Ed.pid ? t.el : null;
    if (hot !== el) { if (hot) hot.classList.remove('is-drop-target'); hot = el; if (hot) hot.classList.add('is-drop-target'); }
    scrollV = 0;
    if (ev && S.viewer) {
      var r = S.viewer.getBoundingClientRect();
      if (ev.clientY < r.top + EDGE) scrollV = -Math.ceil((r.top + EDGE - ev.clientY) / 4);
      else if (ev.clientY > r.bottom - EDGE) scrollV = Math.ceil((ev.clientY - (r.bottom - EDGE)) / 4);
    }
    if (scrollV && !raf) raf = requestAnimationFrame(tick);
  };
  /** Selects annotation id on page pid (made active). */
  function show(pid, id) { if (Ed.pid !== pid) S.activate(pid); Ed.select(id); Ed.paint(); }

  /** The end of an annotation's move (pointer.js): onto another page, or a copy with Alt. A: the drag (S.act: start, r0, id,
   * orig), fin: the annotation where it was dropped (on its own page). True when this took it. */
  C.dropAnnot = function (ev, A, fin) {
    C.over(null);
    var t = ev && C.pageAt(ev.clientX, ev.clientY), from = Ed.pid, alt = !!(ev && ev.altKey);
    if (!t || t.pid === from) {
      if (!alt) return false;
      var cp = JSON.parse(JSON.stringify(fin)); cp.id = U.uid('a'); delete cp.locked; delete cp.hidden;
      S.commitPage(U.t('pdf.se.undo_copy_annot'), function (q) { q.annots.push(cp); });
      show(from, cp.id);
      return true;
    }
    var src = Ed.page(), sc = S.ctx(), r0 = A.r0, off = [r0.x + r0.w / 2 - A.start[0], r0.y + r0.h / 2 - A.start[1]];
    var a = JSON.parse(JSON.stringify(A.orig)); if (alt) { a.id = U.uid('a'); delete a.locked; delete a.hidden; }
    C.place(a, sc.R, t, [t.view[0] + off[0], t.view[1] + off[1]]);
    C.commitMove(src.id, t.pid, A.orig.id, a, alt);
    show(t.pid, a.id);
    return true;
  };
  /** Puts annotation a (from a page shown at rotation R0) on target t with its centre at view point v, as it looked. */
  C.place = function (a, R0, t, v) {
    if (E.isBox(a)) {
      a.rot = (((a.rot || 0) + t.R - R0) % 360 + 360) % 360; // the same angle on screen
      var c = E.toPage(t.R, t.g.W, t.g.H, v[0], v[1]); a.cx = c[0]; a.cy = c[1];
      if (a.tip) a.tip = null;
    } else {
      var r = E.annotViewRect(a, t.R, t.g.W, t.g.H);
      E.setAnnotViewRect(a, { x: v[0] - r.w / 2, y: v[1] - r.h / 2, w: r.w, h: r.h }, t.R, t.g.W, t.g.H);
    }
    return a;
  };
  /** One undo step: annotation id leaves page `from` (unless copy) and a joins page `to`. */
  C.commitMove = function (from, to, id, a, copy, label) {
    E.commit(label || U.t(copy ? 'pdf.se.undo_copy_to_page' : 'pdf.se.undo_move_to_page'), function (st) {
      st.pages.forEach(function (q) {
        if (q.id === from && !copy) q.annots = q.annots.filter(function (y) { return y.id !== id; });
        if (q.id === to) q.annots.push(JSON.parse(JSON.stringify(a)));
      });
    });
  };

  /** The end of a paragraph frame's move (para-xform.js): another page, or Alt: a copy. True when this took it. */
  C.dropPara = function (ev, sel, base, cur, start) {
    C.over(null);
    var t = ev && C.pageAt(ev.clientX, ev.clientY), alt = !!(ev && ev.altKey), p = E.pageById(sel.pid);
    if (!p || ((!t || t.pid === sel.pid) && !alt)) return false;
    var m = JSON.parse(JSON.stringify(cur)), to = t ? t.pid : sel.pid;
    if (alt) m.id = U.uid('a');
    if (t && t.pid !== sel.pid) { m.cx = t.page[0] + (base.cx - start[0]); m.cy = t.page[1] + (base.cy - start[1]); }
    var derived = sel.kind === 'block' && !alt ? sel.to : null, covers = sel.kind === 'block' && !alt ? sel.covers : null;
    if (derived) sel.to = null; // used by this commit
    E.commit(U.t(alt ? 'pdf.se.undo_copy_para' : 'pdf.se.undo_move_para_page'), function (st) {
      st.pages.forEach(function (q) {
        if (q.id === sel.pid && !alt) {
          S.strip.use(q, derived);
          if (covers) covers.forEach(function (c) { q.annots.push(JSON.parse(JSON.stringify(c))); });
          if (sel.kind === 'annot') q.annots = q.annots.filter(function (y) { return y.id !== base.id; });
        }
        if (q.id === to) q.annots.push(JSON.parse(JSON.stringify(m)));
      });
    });
    P.clear();
    if (Ed.pid !== to) S.activate(to);
    var q = E.pageById(to), made = q && q.annots.filter(function (y) { return y.id === m.id; })[0];
    if (made) P.selectAnnot(q, made, !!sel.uni);
    Ed.paint();
    return true;
  };
})();
