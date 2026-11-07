/* Slop PDF — several annotations selected at once (select tool): Shift+click adds or takes one away, a mouse drag on the
   empty page draws a selection rectangle (Shift adds to what is selected). The group moves together (a drag on any of
   them), and Delete, the arrow keys, Duplicate, Copy and Cut (clip.js) act on all of them, one undo step each. The last one
   clicked is Ed.selId (its handles and properties show); the others have a plain outline. A click elsewhere, Escape or
   another tool lets the group go. Classic script, loaded after select-edit.js. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, Ed = SP.editor, S = Ed._, P = S.para;
  var group = []; // annotation ids on the active page (two or more), Ed.selId among them

  /** The selected annotations' ids: the group, or the one selected, or none. */
  S.selectedIds = function () { var a = Ed.getSelected(); return group.length ? group.filter(function (id) { return S.findAnnot(id); }) : a ? [a.id] : []; };
  S.groupClear = function () { if (group.length) { group = []; Ed.paint(); } };
  function setGroup(ids, primary) {
    group = ids.length > 1 ? ids.slice() : [];
    S.groupSetting = true; Ed.select(null); Ed.select(primary || ids[ids.length - 1] || null); S.groupSetting = false;
    Ed.paint();
    if (SP.app) SP.app.editorSelectionChanged();
  }
  /** Adds an annotation to the selection, or takes it away when it is in it. */
  S.groupToggle = function (id) {
    var cur = S.selectedIds(), i = cur.indexOf(id);
    if (i >= 0) cur.splice(i, 1); else cur.push(id);
    setGroup(cur, i >= 0 ? cur[cur.length - 1] : id);
  };
  P.toMulti = function () {
    var sel = P.sel; if (!sel || sel.kind !== 'annot') return false;
    var id = sel.id; P.clear(); S.groupToggle(id); return true;
  };
  var select = Ed.select;
  Ed.select = function (id) { if (!S.groupSetting && group.length && group.indexOf(id) < 0) group = []; return select.apply(this, arguments); };

  function hitId(e) { var g = e.target.closest && (e.target.closest('.annots [data-aid]') || S.annotElAt(e)); return g ? g.getAttribute('data-aid') : null; }
  var down = S.onDown;
  S.onDown = function (e) {
    if (Ed.tool !== 'select' || e.button > 0 || !Ed.page() || S.editing || !e.target.closest || e.target.closest('.handle, .sel-rot, .note-pop')) return down.apply(this, arguments);
    var id = hitId(e);
    if (id && e.shiftKey) { e.preventDefault(); if (P.sel) P.clear(); S.groupToggle(id); return; }
    if (id && group.length && group.indexOf(id) >= 0) { e.preventDefault(); Ed.select(id); moveGroup(e); return; }
    if (group.length) { group = []; Ed.paint(); }
    return down.apply(this, arguments);
  };
  /** Drags every annotation of the group by the pointer's move: one undo step. */
  function moveGroup(e) {
    var p = Ed.page(), c = S.ctx(), s0 = S.viewPt(e), ids = group.slice(), orig = {};
    ids.forEach(function (id) { var a = S.findAnnot(id); if (a && !a.locked) orig[id] = JSON.parse(JSON.stringify(a)); });
    var moved = false, d = [0, 0];
    S.pageEl.setPointerCapture(e.pointerId); // touch-ok: the page view is a touch surface (view-zoom.js)
    function mv(ev) {
      var v = S.viewPt(ev); d = [v[0] - s0[0], v[1] - s0[1]];
      if (!moved && Math.hypot(d[0], d[1]) * c.z < 2) return;
      moved = true;
      Object.keys(orig).forEach(function (id) { var x = S.findAnnot(id); if (x) { Object.assign(x, JSON.parse(JSON.stringify(orig[id]))); S.nudge(x, d[0], d[1]); } });
      Ed.paint();
    }
    function up() {
      S.pageEl.removeEventListener('pointermove', mv); S.pageEl.removeEventListener('pointerup', up); S.pageEl.removeEventListener('pointercancel', up);
      Object.keys(orig).forEach(function (id) { var x = S.findAnnot(id); if (x) { Object.keys(x).forEach(function (k) { delete x[k]; }); Object.assign(x, orig[id]); } });
      if (!moved) { Ed.paint(); return; }
      S.commitPage(U.t('pdf.se.undo_move_n', { n: Object.keys(orig).length }), function (q) { q.annots.forEach(function (x) { if (orig[x.id]) S.nudge(x, d[0], d[1]); }); });
      void p;
    }
    S.pageEl.addEventListener('pointermove', mv); S.pageEl.addEventListener('pointerup', up); S.pageEl.addEventListener('pointercancel', up);
  }
  /** A mouse drag on the empty page: a rectangle; the annotations it touches are selected. A click is a click (false). */
  S.marquee = function (e, p) {
    if (e.pointerType !== 'mouse') return false;
    e.preventDefault();
    var s0 = S.viewPt(e), at = S.pagePt(e), z = Ed.zoom, keep = e.shiftKey ? S.selectedIds() : [], rect = null, box = null;
    function mv(ev) {
      var v = S.viewPt(ev);
      if (!rect && Math.hypot(v[0] - s0[0], v[1] - s0[1]) * z < 4) return;
      rect = { x: Math.min(s0[0], v[0]), y: Math.min(s0[1], v[1]), w: Math.abs(v[0] - s0[0]), h: Math.abs(v[1] - s0[1]) };
      if (!box) { box = U.h('div', { class: 'sel-marquee' }); S.overlay.appendChild(box); }
      box.style.left = rect.x * z + 'px'; box.style.top = rect.y * z + 'px'; box.style.width = rect.w * z + 'px'; box.style.height = rect.h * z + 'px';
    }
    function up() {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      if (box) box.remove();
      // a click: what was selected goes; on the page's text (between its words, or before its text layer is built) its block
      if (!rect) { Ed.select(null); if (S.obj && S.obj.sel) S.obj.select(null); if (Ed.noteUI) Ed.noteUI.close(); if (S.selectTextAt && !keep.length) S.selectTextAt(p, at); return; }
      var c = S.ctx(), ids = keep.slice();
      p.annots.forEach(function (a) {
        if (a.hidden || a.type === 'texthl' || ids.indexOf(a.id) >= 0) return;
        var r = E.annotViewRect(a, c.R, c.W, c.H);
        if (r.x < rect.x + rect.w && r.x + r.w > rect.x && r.y < rect.y + rect.h && r.y + r.h > rect.y) ids.push(a.id);
      });
      setGroup(ids);
    }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    return true;
  };

  // the others of the group: an outline each
  var draw = S.drawSelection;
  S.drawSelection = function () {
    var r = draw.apply(this, arguments);
    if (group.length < 2 || !S.overlay) return r;
    var c = S.ctx(), z = c.z;
    group.forEach(function (id) {
      var a = S.findAnnot(id); if (!a || id === Ed.selId) return;
      var q = E.annotViewRect(a, c.R, c.W, c.H), el = U.h('div', { class: 'sel-box is-member' });
      el.style.left = q.x * z + 'px'; el.style.top = q.y * z + 'px'; el.style.width = q.w * z + 'px'; el.style.height = q.h * z + 'px';
      S.overlay.appendChild(el);
    });
    return r;
  };
  // Delete, the arrows and Duplicate act on the whole group
  function each(label, fn, coalesce) {
    var ids = S.selectedIds().filter(function (id) { var a = S.findAnnot(id); return a && !a.locked; });
    if (!ids.length) return;
    S.commitPage(label(ids.length), function (q) { fn(q, ids); }, coalesce);
  }
  var del = Ed.deleteSelected, nudge = Ed.nudgeSelected, dup = Ed.duplicateSelected;
  Ed.deleteSelected = function () {
    if (group.length < 2) return del.apply(this, arguments);
    each(function (n) { return U.t('pdf.se.undo_delete_n', { n: n }); }, function (q, ids) { q.annots = q.annots.filter(function (a) { return ids.indexOf(a.id) < 0; }); });
    group = []; Ed.select(null);
  };
  Ed.nudgeSelected = function (dx, dy) {
    if (group.length < 2) return nudge.apply(this, arguments);
    each(function (n) { return U.t('pdf.se.undo_move_n', { n: n }); }, function (q, ids) { q.annots.forEach(function (a) { if (ids.indexOf(a.id) >= 0) S.nudge(a, dx, dy); }); }, 'gnudge:' + group.join());
  };
  Ed.duplicateSelected = function () {
    if (group.length < 2) return dup.apply(this, arguments);
    var made = [];
    each(function (n) { return U.t('pdf.se.undo_duplicate_n', { n: n }); }, function (q, ids) {
      q.annots.filter(function (a) { return ids.indexOf(a.id) >= 0; }).forEach(function (a) { var c = JSON.parse(JSON.stringify(a)); c.id = U.uid('a'); delete c.hidden; delete c.locked; S.nudge(c, 12, 12); q.annots.push(c); made.push(c.id); });
    });
    setGroup(made);
  };
  S.groupSet = setGroup;
})();
