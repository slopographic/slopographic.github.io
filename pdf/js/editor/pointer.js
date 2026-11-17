/* Slop PDF — editor pointer input: drawing new annotations with each tool, and moving,
   resizing or re-pointing existing ones (all committed as single undo steps).
   touch-ok: the page view is a touch surface (data-touch-surface="nav", set in view-zoom.js). */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, Ed = SP.editor, S = Ed._;
  /* ---------------------------------------------------------- interaction */
  S.viewPt = function (e) { var r = S.pageEl.getBoundingClientRect(); return [(e.clientX - r.left) / Ed.zoom, (e.clientY - r.top) / Ed.zoom]; }
  S.pagePt = function (e) { var c = S.ctx(), v = S.viewPt(e); return E.toPage(c.R, c.W, c.H, v[0], v[1]); }
  /** The annotation element (.annots [data-aid]) whose box holds the press, topmost first, or null. Whiteouts and text
   * highlights are skipped: they sit over page text that Edit text should still reach (the covered run is not offered). */
  S.annotElAt = function (e) {
    var p = Ed.page(); if (!p || !S.pageEl) return null;
    var c = S.ctx(), v = S.viewPt(e);
    for (var i = p.annots.length - 1; i >= 0; i--) {
      var a = p.annots[i];
      if (a.hidden || a.type === 'whiteout' || a.type === 'texthl') continue;
      var r = E.annotViewRect(a, c.R, c.W, c.H);
      if (v[0] >= r.x && v[0] <= r.x + r.w && v[1] >= r.y && v[1] <= r.y + r.h) return S.pageEl.querySelector('.annots [data-aid="' + a.id + '"]');
    }
    return null;
  };
  Ed.cancelInteraction = function () {
    if (S.act && S.act.orig) { var a = S.findAnnot(S.act.id); if (a) { Object.keys(a).forEach(function (k) { delete a[k]; }); Object.assign(a, S.act.orig); } }
    S.act = null; S.draft = null; Ed.paint();
  };
  S.onDown = function (e) {
    if (e.button > 0) return;
    if (e.target.closest && e.target.closest('.note-pop')) return; // a comment popup handles its own clicks
    if (S.callDraft) { e.preventDefault(); S.calloutClick(e); return; } // a callout's box is placed: this click sets its tip
    if (S.editing) { if (e.target === S.ta) return; S.finishText(true); }
    var p = Ed.page(); if (!p) return;
    if (S.runEdit && e.target === S.runEdit.input) return; // typing in the run being edited
    if (S.runEdit) S.commitRun();
    var handle = e.target.closest('.handle, .sel-rot'), hitG = e.target.closest('.annots [data-aid]');
    var t = Ed.tool, tbox = t === 'select' && !Ed.selId && S.textBoxHit ? S.textBoxHit(e) : null; // a text selection's box (sel-actions.js)
    // The text layer's spans lie over the annotations, so a press on an annotation over page text reaches a span: with the
    // select tool the press is the annotation's when it is inside its box (select, move, resize), in Edit text mode or not.
    // Edit text mode (edit-text.js): only a press on the page's own text opens a run.
    if (!hitG && !handle && t === 'select' && !tbox) hitG = S.annotElAt(e);
    if (Ed.objMode && t === 'select' && !handle && !hitG && S.objDown && S.objDown(e, p)) return; // a page object (obj-mode.js)
    if (Ed.editText && Ed.paraMode && t === 'select' && !handle && S.paraDown && S.paraDown(e, p, hitG)) return; // Paragraphs (para-mode.js)
    if (Ed.editText && t === 'select' && !handle && !hitG && !tbox) {
      // on the page's text a press that stays put opens the line; a drag (or a long press) selects text instead, and the
      // selection bar (sel-bar.js) offers its actions, Edit text among them
      if (e.target.closest && e.target.closest('.pv-textlayer span')) { S.textPress(e, p); return; }
      e.preventDefault(); S.runDown(e, p); return;
    }
    if (t === 'block') { e.preventDefault(); S.blockDown(e, p); return; } // block copy (editor/block-copy.js)
    if (t === 'select') {
      if (tbox) { S.liftEdit(e, tbox); return; } // the selected text becomes an annotation when it is first moved (sel-actions.js)
      if (handle && Ed.selId) { e.preventDefault(); S.startEdit(e, handle.dataset.h); return; }
      if (hitG) {
        e.preventDefault();
        var hid = hitG.getAttribute('data-aid'), now = Date.now();
        // own double-click/double-tap detection (pointer capture swallows native dblclick)
        if (S.lastTap && S.lastTap.id === hid && now - S.lastTap.t < 450) { S.lastTap = null; var ta0 = S.findAnnot(hid); if (ta0 && !ta0.locked && ta0.type === 'para' && S.paraEditAnnot) { S.paraEditAnnot(ta0); return; } if (ta0 && !ta0.locked && (ta0.type === 'text' || ta0.type === 'callout' || ta0.type === 'step')) { Ed.select(hid); S.editing = { id: hid, isNew: false, before: ta0.text }; S.openTextEditor(ta0); return; } }
        S.lastTap = { id: hid, t: now };
        Ed.select(hid); S.startEdit(e, 'move'); return;
      }
      Ed.select(null);
      if (e.target.closest && e.target.closest('.pv-textlayer span')) return; // text: the browser selects it (no pan, no preventDefault)
      if (Ed.noteUI) Ed.noteUI.close();
      S.startPan(e);
      return;
    }
    e.preventDefault();
    S.pageEl.setPointerCapture(e.pointerId);
    var c = S.ctx(), d = Ed.defaults[t] || {}, pt = S.pagePt(e), vp = S.viewPt(e);
    if (t === 'texthl') { S.texthlDown(e, p, pt); return; }
    if (t === 'note') { S.noteDown(e, p, pt); return; }
    if (t === 'step') { S.stepDown(e, p, pt); return; }
    if (t === 'text') {
      var a = Object.assign({ type: 'text', text: '', rot: c.R, cx: 0, cy: 0, w: 10, h: 10 }, Ed.defaults.text);
      a.id = U.uid('a');
      var tl = E.textLayout(Object.assign({}, a, { text: 'M' }));
      E.setAnnotViewRect(a, { x: vp[0] - tl.pad, y: vp[1] - tl.h / 2, w: tl.w, h: tl.h }, c.R, c.W, c.H);
      p.annots.push(a); // temporary until text is committed
      S.editing = { id: a.id, isNew: true };
      S.openTextEditor(a);
      return;
    }
    if (t === 'pen' || t === 'marker') {
      S.draft = Object.assign({ id: 'draft', type: t, pts: [pt] }, d);
      S.act = { kind: 'draw', pid: e.pointerId };
    } else if (t === 'line' || t === 'arrow') {
      S.draft = Object.assign({ id: 'draft', type: t, pts: [pt, pt.slice()] }, d);
      S.act = { kind: 'line', pid: e.pointerId };
    } else {
      S.draft = Object.assign({ id: 'draft', type: t, rot: c.R, cx: pt[0], cy: pt[1], w: 1, h: 1 }, d);
      S.act = { kind: 'box', start: vp, pid: e.pointerId };
    }
    Ed.paint();
    S.pageEl.addEventListener('pointermove', S.onMove);
    S.pageEl.addEventListener('pointerup', S.onUp);
    S.pageEl.addEventListener('pointercancel', S.onUp);
  }
  S.onMove = function (e) {
    if (!S.act) return;
    if (S.act.kind === 'texthl') { S.texthlMove(e); return; }
    var c = S.ctx();
    if (S.act.kind === 'draw') {
      var pt = S.pagePt(e), last = S.draft.pts[S.draft.pts.length - 1];
      if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) * c.z > 1.5) S.draft.pts.push([U.round(pt[0], 2), U.round(pt[1], 2)]);
    } else if (S.act.kind === 'line') {
      var q = S.pagePt(e);
      if (e.shiftKey) { var v0 = E.toView(c.R, c.W, c.H, S.draft.pts[0][0], S.draft.pts[0][1]), v1 = S.viewPt(e), ang = Math.round(Math.atan2(v1[1] - v0[1], v1[0] - v0[0]) / (Math.PI / 4)) * Math.PI / 4, len = Math.hypot(v1[0] - v0[0], v1[1] - v0[1]); q = E.toPage(c.R, c.W, c.H, v0[0] + Math.cos(ang) * len, v0[1] + Math.sin(ang) * len); }
      S.draft.pts[1] = q;
    } else if (S.act.kind === 'box') {
      var v = S.viewPt(e), s = S.act.start, w = v[0] - s[0], h = v[1] - s[1];
      if (e.shiftKey) { var m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
      E.setAnnotViewRect(S.draft, { x: Math.min(s[0], s[0] + w), y: Math.min(s[1], s[1] + h), w: Math.abs(w), h: Math.abs(h) }, c.R, c.W, c.H);
    }
    Ed.paint();
  }
  S.onUp = function () {
    S.pageEl.removeEventListener('pointermove', S.onMove);
    S.pageEl.removeEventListener('pointerup', S.onUp);
    S.pageEl.removeEventListener('pointercancel', S.onUp);
    if (S.act && S.act.kind === 'texthl') { S.texthlUp(); return; }
    if (!S.act || !S.draft) { S.act = null; S.draft = null; return; }
    var a = S.draft, kind = S.act.kind; S.draft = null; S.act = null;
    var c = S.ctx();
    if (kind === 'box') {
      var r = E.annotViewRect(a, c.R, c.W, c.H);
      if (r.w < 4 && r.h < 4) { var wide = /^(whiteout|hlbox|redact)$/.test(a.type), dw = wide ? 140 : 120, dh = wide ? 28 : 80; E.setAnnotViewRect(a, { x: r.x - dw / 2, y: r.y - dh / 2, w: dw, h: dh }, c.R, c.W, c.H); }
    }
    if (kind === 'box' && a.type === 'callout') { S.calloutPlaced(a); return; }
    if (kind === 'line') {
      var l = Math.hypot(a.pts[1][0] - a.pts[0][0], a.pts[1][1] - a.pts[0][1]);
      if (l < 3) { var v0 = E.toView(c.R, c.W, c.H, a.pts[0][0], a.pts[0][1]); a.pts[1] = E.toPage(c.R, c.W, c.H, v0[0] + 100, v0[1]); }
    }
    a.id = U.uid('a');
    var names = { pen: 'pdf.ed.undo_draw', marker: 'pdf.ed.undo_marker', rect: 'pdf.ed.undo_add_rect', ellipse: 'pdf.ed.undo_add_ellipse', line: 'pdf.ed.undo_add_line', arrow: 'pdf.ed.undo_add_arrow', whiteout: 'pdf.ed.undo_add_whiteout', hlbox: 'pdf.ed.undo_add_hlbox', redact: 'pdf.ed.undo_mark_redaction' };
    Ed.addAnnot(a, names[a.type] && U.t(names[a.type]));
    if (a.type === 'pen' || a.type === 'marker') { Ed.selId = null; Ed.paint(); }
    else if (!/^(whiteout|hlbox|redact)$/.test(a.type)) { Ed.tool = 'select'; S.pageEl.dataset.tool = 'select'; if (SP.app) SP.app.toolChanged(); }
  }

  /* move / resize / endpoints */
  S.startEdit = function (e, h) {
    // a locked layer is selectable but not movable, resizable or re-pointable: no drag starts (Layers unlocks it)
    var a = Ed.getSelected(); if (!a || a.locked) return;
    var c = S.ctx();
    S.act = { kind: 'edit', h: h, id: a.id, orig: JSON.parse(JSON.stringify(a)), start: S.viewPt(e), r0: E.annotViewRect(a, c.R, c.W, c.H), moved: false };
    S.pageEl.setPointerCapture(e.pointerId);
    function mv(ev) {
      if (!S.act) return;
      var v = S.viewPt(ev), dx = v[0] - S.act.start[0], dy = v[1] - S.act.start[1];
      if (!S.act.moved && Math.hypot(dx, dy) * c.z < 2) return;
      S.act.moved = true;
      var x = S.findAnnot(S.act.id); if (!x) return;
      Object.keys(x).forEach(function (k) { delete x[k]; }); Object.assign(x, JSON.parse(JSON.stringify(S.act.orig)));
      var r = S.act.r0, n = { x: r.x, y: r.y, w: r.w, h: r.h };
      if (S.act.h === 'move') { n.x += dx; n.y += dy; E.setAnnotViewRect(x, n, c.R, c.W, c.H); if (S.cross) S.cross.over(ev); }
      else if (S.act.h === 'tip') { x.tip = E.toPage(c.R, c.W, c.H, v[0], v[1]); }
      else if (S.act.h === 'p1' || S.act.h === 'p2') { var k = S.act.h === 'p1' ? 0 : x.pts.length - 1; x.pts[k] = E.toPage(c.R, c.W, c.H, v[0], v[1]); }
      else {
        var hh = S.act.h;
        if (/w/.test(hh)) { n.x = r.x + dx; n.w = r.w - dx; }
        if (/e/.test(hh)) n.w = r.w + dx;
        if (/n/.test(hh)) { n.y = r.y + dy; n.h = r.h - dy; }
        if (/s/.test(hh)) n.h = r.h + dy;
        var keep = x.type === 'text' || x.type === 'image' || ev.shiftKey;
        if (keep && hh.length === 2) {
          var k2 = Math.max(n.w / r.w, n.h / r.h, 0.05);
          n.w = r.w * k2; n.h = r.h * k2;
          if (/w/.test(hh)) n.x = r.x + r.w - n.w;
          if (/n/.test(hh)) n.y = r.y + r.h - n.h;
        }
        if (n.w < 0) { n.x += n.w; n.w = -n.w; } if (n.h < 0) { n.y += n.h; n.h = -n.h; }
        n.w = Math.max(n.w, 2); n.h = Math.max(n.h, 2);
        if (x.type === 'para' && S.paraReflow) n = S.paraReflow(x, n, r, hh); // the text reflows to the new width (para-view.js)
        else if (x.type === 'text') {
          var k3 = n.h / r.h; x.size = U.clamp(U.round(S.act.orig.size * k3, 1), 4, 400);
          var t = E.textLayout(x), va = (((c.R - (x.rot || 0)) % 360) + 360) % 360;
          var tw = va % 180 ? t.h : t.w, th = va % 180 ? t.w : t.h;
          n = { x: /w/.test(hh) ? r.x + r.w - tw : r.x, y: /n/.test(hh) ? r.y + r.h - th : r.y, w: tw, h: th };
        }
        E.setAnnotViewRect(x, n, c.R, c.W, c.H);
      }
      Ed.paint();
    }
    function up(ev) {
      S.pageEl.removeEventListener('pointermove', mv); S.pageEl.removeEventListener('pointerup', up); S.pageEl.removeEventListener('pointercancel', up);
      if (!S.act) return;
      var x = S.findAnnot(S.act.id), A = S.act; S.act = null;
      if (S.cross) S.cross.over(null);
      if (!x || !A.moved) { if (x && x.type === 'note') Ed.noteUI.open(x.id); Ed.paint(); return; }
      var fin = JSON.parse(JSON.stringify(x));
      Object.keys(x).forEach(function (k) { delete x[k]; }); Object.assign(x, A.orig);
      if (A.h === 'move' && ev && ev.type === 'pointerup' && S.cross && S.cross.dropAnnot(ev, A, fin)) return; // onto another page, or Alt: a copy (cross-page.js)
      S.commitPage(U.t(A.h === 'move' ? 'pdf.ed.undo_move_annot' : A.h === 'tip' ? 'pdf.ed.undo_move_tip' : 'pdf.ed.undo_resize_annot'), function (p) { p.annots = p.annots.map(function (y) { return y.id === fin.id ? fin : y; }); });
    }
    S.pageEl.addEventListener('pointermove', mv); S.pageEl.addEventListener('pointerup', up); S.pageEl.addEventListener('pointercancel', up);
  }
  /** A caret position (node, offset) in the text layer under a client point, or null. */
  function caretAt(x, y) {
    var r = document.caretRangeFromPoint ? document.caretRangeFromPoint(x, y) : null;
    if (!r && document.caretPositionFromPoint) { var cp = document.caretPositionFromPoint(x, y); r = cp && { startContainer: cp.offsetNode, startOffset: cp.offset }; }
    var el = r && r.startContainer && (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode);
    return el && el.closest && el.closest('.pv-textlayer') ? { n: r.startContainer, o: r.startOffset } : null;
  }
  /** A press on page text in Edit text ▸ Lines. A press that stays put opens the line on release. A drag selects the text it
   * crosses, and a long press (a finger) the word under it: the selection bar (sel-bar.js) then offers its actions, Edit
   * text among them. The selection is made here (the browser's own is held off, so the page does not pan or open). */
  S.textPress = function (e, p) {
    e.preventDefault();
    var x0 = e.clientX, y0 = e.clientY, moved = false, down = e, from = caretAt(x0, y0), sel = window.getSelection();
    if (sel) sel.removeAllRanges();
    var hold = setTimeout(function () { // a long press: the word under the finger
      if (moved || !from || from.n.nodeType !== 3) return;
      var t = from.n.textContent, a = from.o, b = from.o;
      while (a > 0 && /\S/.test(t[a - 1])) a--;
      while (b < t.length && /\S/.test(t[b])) b++;
      if (b > a) { sel.setBaseAndExtent(from.n, a, from.n, b); held = true; }
    }, 500), held = false;
    function mv(ev) {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) <= 4) return;
      moved = true; clearTimeout(hold);
      var to = caretAt(ev.clientX, ev.clientY);
      if (from && to && sel) sel.setBaseAndExtent(from.n, from.o, to.n, to.o);
    }
    function end(ev) {
      clearTimeout(hold);
      window.removeEventListener('pointermove', mv, true); window.removeEventListener('pointerup', end, true); window.removeEventListener('pointercancel', end, true);
      if (ev.type === 'pointercancel' || moved || held) return;
      S.runDown(down, p);
    }
    window.addEventListener('pointermove', mv, true); window.addEventListener('pointerup', end, true); window.addEventListener('pointercancel', end, true);
  };
  S.onDbl = function (e) {
    // the text layer lies over the annotations: a double click inside an annotation's box is the annotation's
    var g = e.target.closest('.annots [data-aid]') || (S.annotElAt ? S.annotElAt(e) : null);
    // a double click on the page's own text edits that line in place (edit-text.js), without turning Edit text mode on
    if (!g && Ed.tool === 'select' && !Ed.editText && e.target.closest('.pv-textlayer span, .sel-box.is-text') && Ed.page()) { if (S.cancelClick) S.cancelClick(); Ed.editRunAt(e, Ed.page()); return; }
    // with pointer capture the dblclick targets the page, so fall back to the selection
    var id = g ? g.getAttribute('data-aid') : Ed.selId;
    if (!id || Ed.tool !== 'select') return;
    var a = S.findAnnot(id);
    if (a && !a.locked && a.type === 'para' && S.paraEditAnnot) { S.paraEditAnnot(a); return; }
    if (a && !a.locked && (a.type === 'text' || a.type === 'callout' || a.type === 'step')) { S.editing = { id: a.id, isNew: false, before: a.text }; S.openTextEditor(a); }
  }
  Ed.editSelectedText = function () { var a = Ed.getSelected(); if (a && !a.locked && a.type === 'para' && S.paraEditAnnot) { S.paraEditAnnot(a); return true; } if (a && !a.locked && (a.type === 'text' || a.type === 'callout' || a.type === 'step')) { S.editing = { id: a.id, isNew: false, before: a.text }; S.openTextEditor(a); return true; } return false; };

})();
