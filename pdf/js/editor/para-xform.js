/* Slop PDF — the paragraph frame on the page (para-mode.js selects it) and its transform handles: the body moves it, the left
   and right handles change its width (the text reflows), the corners scale it (font size, pitch and width together, the
   opposite corner stays), the round handle above it turns it (Shift: 15° steps). The handles stay on while the text is typed
   in it (para-edit.js). Keys on the frame: Enter / F2 or any letter types (the letter goes in), arrows nudge (Shift: 10 pt),
   Delete removes the text, Escape lets it go. Every change is one undo step (P.commit); a move whose drop is on another page
   goes there (cross-page.js). The math is SlopPdfXform (xform.js). Classic script. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, Ed = SP.editor, S = Ed._, P = S.para = S.para || {}, X = window.SlopPdfXform;
  var ALIGN = { left: 'pdf.ed.pm_align_left', right: 'pdf.ed.pm_align_right', center: 'pdf.ed.pm_align_center', justify: 'pdf.ed.pm_align_justify' };
  var CORNERS = ['nw', 'ne', 'se', 'sw'];

  function handle(cls, h, tip) { return U.h('div', { class: cls, 'data-h': h, title: U.t(tip), 'data-i18n-attr': 'title:' + tip }); }
  P.draw = function (rect) {
    var sel = P.sel, s = sel && S.slots.get(sel.pid);
    if (!sel || !s || (sel.kind === 'annot' && !S.findAnnot(sel.id))) { if (sel && !P.editor) P.clear(); return; }
    var el = U.$('.para-frame', s.layer), z = Ed.zoom, r = rect || P.rectOf(sel);
    if (!el) {
      el = U.h('div', { class: 'para-frame', tabindex: '0', role: 'group', 'aria-label': U.t('pdf.ed.pm_frame'), 'data-i18n-attr': 'aria-label:pdf.ed.pm_frame' },
        handle('para-h', 'w', 'pdf.ed.pm_drag_width'), handle('para-h', 'e', 'pdf.ed.pm_drag_width'),
        CORNERS.map(function (c) { return handle('para-c slop-hit', c, 'pdf.se.drag_scale'); }), handle('para-r slop-hit', 'rot', 'pdf.se.drag_turn'),
        U.h('span', { class: 'para-tag' }));
      wire(el);
      s.layer.appendChild(el);
    }
    var a = r.a || sel.model;
    el.classList.toggle('is-busy', !a);
    el.classList.toggle('is-editing', !!P.editor);
    el.classList.toggle('is-locked', !!(a && a.locked));
    U.$('.para-tag', el).textContent = a ? U.t(a.rtl ? 'pdf.ed.pm_tag_rtl' : 'pdf.ed.pm_tag', { align: ALIGN[a.align] ? U.t(ALIGN[a.align]) : String(a.align) }) : U.t('pdf.ed.pm_tag_busy');
    el.style.left = (r.x * z) + 'px'; el.style.top = (r.y * z) + 'px'; el.style.width = (r.w * z) + 'px'; el.style.height = (r.h * z) + 'px';
    var rot = a && a.rot ? -a.rot : 0; // page space, y down: a positive rot turns counter-clockwise (para-view.js)
    el.style.transform = rot ? 'rotate(' + rot + 'deg)' : '';
    if (P.editor && P.editor.place) P.editor.place();
    if (P.onDraw) P.onDraw();
  };

  /* ------------------------------------------------- pointer and keys */
  function wire(el) {
    var lastTap = 0;
    el.addEventListener('pointerdown', function (e) {
      if (e.button > 0) return;
      var h = e.target.closest('.para-h, .para-c, .para-r');
      if (P.editor && !h) return; // typing: the press is the editor's (its box lies over the frame)
      e.stopPropagation(); e.preventDefault();
      if (P.still) P.still(null); // a new press: a second click waiting to select a word (block-mark.js) is not one
      var now = Date.now();
      if (!h && now - lastTap < 450 && !e.shiftKey) { lastTap = 0; P.edit({ at: [e.clientX, e.clientY] }); return; }
      lastTap = now;
      if (e.shiftKey && P.toMulti && P.toMulti(e)) return; // Shift adds it to a group (multi-sel.js)
      if (!P.editor) el.focus({ preventScroll: true });
      var go = function () { drag(e, h ? h.dataset.h : 'move', h ? null : P.still); }; // a press that stays put: P.still
      if (P.editor) P.editor.commit().then(go); else go(); // typing: what was typed is applied first, then the drag
    });
    el.addEventListener('dblclick', function (e) { e.stopPropagation(); e.preventDefault(); if (P.still) P.still(null); if (!P.editor) P.edit({ at: [e.clientX, e.clientY] }); });
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); if (window.SlopSelBar && SlopSelBar.update) SlopSelBar.update(); }); // a long press: the bar
  }
  // keys on the focused frame, before the app's shortcuts (window, capture: SlopCmd listens further down), so a letter types
  // into the text instead of switching tools and the arrows move the frame instead of turning pages
  window.addEventListener('keydown', function (e) {
    var el = e.target && e.target.classList && e.target.classList.contains('para-frame') ? e.target : document.activeElement;
    if (P.editor || !P.sel || !el || !el.classList || !el.classList.contains('para-frame') || e.isComposing) return;
    var k = e.key, step = e.shiftKey ? 10 : 1, arrows = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (k === 'Enter' || k === 'F2') P.edit();
    else if (k === 'Escape') P.clear();
    else if (arrows[k]) P.nudge(arrows[k][0], arrows[k][1]);
    else if (k === 'Delete' || k === 'Backspace') P.remove();
    else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) P.edit({ type: k }); // typing starts editing
    else return;
    e.preventDefault(); e.stopPropagation();
  }, true);
  /** A copy of a frame model with its styles' fonts (not saved, so not copied by JSON). */
  P.clone = function (base) {
    var m = JSON.parse(JSON.stringify(base));
    m.styles.forEach(function (st, i) { Object.defineProperty(st, 'info', { value: base.styles[i] && base.styles[i].info, enumerable: false, writable: true }); });
    return m;
  };
  /** The frame's base (its annotation, or the model of a block being set up: null until it is ready). */
  P.base = function (sel) { return sel ? (sel.kind === 'annot' ? S.findAnnot(sel.id) : sel.model) : null; };
  function scale(m, k) { ['fs', 'lh', 'asc', 'first', 'rest', 'pgap', 'w'].forEach(function (key) { if (m[key]) m[key] *= k; }); }
  /** The model after dragging handle h of base by (dx, dy) page points, turning from `from` to `to` for the round handle. */
  P.transformed = function (base, h, dx, dy, from, to, shift) {
    var m = P.clone(base), b0 = { cx: base.cx, cy: base.cy, w: base.w, h: base.h, ang: -(base.rot || 0) };
    if (h === 'move') { m.cx += dx; m.cy += dy; return m; }
    if (h === 'rot') { m.rot = -X.turn(b0, from[0], from[1], to[0], to[1], shift) || 0; return m; }
    var sx, sy = -1;
    if (h === 'w' || h === 'e') { m.w = Math.max(2 * m.fs, base.w + (h === 'e' ? 1 : -1) * X.toLocal(b0.ang, dx, dy)[0]); sx = h === 'e' ? -1 : 1; }
    else { var r = X.resize(b0, h, dx, dy, { keep: true, min: 2 * base.fs }); scale(m, r.k); sx = /w/.test(h) ? 1 : -1; sy = /n/.test(h) ? 1 : -1; }
    P.relayout(m);
    var c = X.keepAnchor(b0, sx, sy, m.w, m.h); m.cx = c[0]; m.cy = c[1];
    return m;
  };
  /** Drags handle h from the press e; still(release) is called when the press is let go without moving. */
  function drag(e, h, still) {
    var sel = P.sel, p = sel && E.pageById(sel.pid), base = P.base(sel);
    if (!p || !base || base.locked) return; // still being set up, or a locked layer
    var start = S.pagePt(e), saved = p.annots.slice(), moved = false, cur = null, last = e;
    function mv(ev) {
      var q = S.pagePt(ev), dx = q[0] - start[0], dy = q[1] - start[1];
      if (!moved && Math.hypot(dx, dy) * Ed.zoom < 2) return;
      moved = true; last = ev;
      cur = P.transformed(base, h, dx, dy, start, q, ev.shiftKey);
      p.annots = sel.kind === 'block' ? saved.concat(sel.preview || sel.covers, [cur]) : saved.map(function (y) { return y.id === cur.id ? cur : y; });
      Ed.paint();
      if (h === 'move' && S.cross) S.cross.over(ev);
    }
    function up(ev) {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      p.annots = saved;
      if (S.cross) S.cross.over(null);
      if (!moved || !cur) { Ed.paint(); if (!moved && still && ev && ev.type === 'pointerup') still(ev); return; }
      if (h === 'move' && S.cross && S.cross.dropPara(ev || last, sel, base, cur, start)) return; // onto another page, or Alt: a copy
      P.commit(p, sel, cur, U.t(h === 'move' ? 'pdf.ed.undo_move_para' : h === 'rot' ? 'pdf.se.undo_turn_para' : /^[we]$/.test(h) ? 'pdf.ed.undo_resize_para' : 'pdf.se.undo_scale_para'));
    }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }
  P.drag = drag; P.scale = scale;
  /** Moves the selected frame by (dx, dy) points (a run of presses is one undo step). */
  P.nudge = function (dx, dy) {
    var sel = P.sel, p = sel && E.pageById(sel.pid), base = P.base(sel);
    if (!p || !base || base.locked) return;
    P.commit(p, sel, P.transformed(base, 'move', dx, dy), U.t('pdf.ed.undo_move_para'), 'pnudge:' + (sel.id || base.id));
  };
  /** Changes the selected frame with fn(model) (the panel's size, colour, alignment and position), one undo step. */
  P.change = async function (fn, label) {
    var sel = P.sel; if (!sel) return;
    await sel.ready;
    var p = E.pageById(sel.pid), base = P.base(sel);
    if (!p || !base || base.locked || P.sel !== sel) return;
    var m = P.clone(base);
    fn(m);
    P.commit(p, sel, m, label);
  };
  /** Takes the selected text off the page (or its frame away), one undo step. */
  P.remove = async function () {
    var sel = P.sel; if (!sel) return;
    await sel.ready;
    var p = E.pageById(sel.pid), base = P.base(sel);
    if (!p || !base || base.locked) return;
    var to = sel.kind === 'block' ? sel.to : null, covers = sel.kind === 'block' ? sel.covers : null, id = base.id;
    sel.to = null; // used by the commit: not released
    E.commit(U.t('pdf.se.undo_delete_text'), function (st) {
      var q = st.pages.filter(function (x) { return x.id === p.id; })[0]; if (!q) return;
      S.strip.use(q, to);
      if (covers) covers.forEach(function (c) { q.annots.push(JSON.parse(JSON.stringify(c))); });
      else q.annots = q.annots.filter(function (y) { return y.id !== id; });
    });
    P.clear();
    Ed.paint();
  };
})();
