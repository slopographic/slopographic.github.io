/* Slop PDF — Objects mode (Edit ▸ Edit page objects, key O): the images, inline images, placed forms (logos, artwork) and
   vector groups a page's content paints (obj-derive.js reads them) can be pointed at, selected, dragged, resized from
   eight handles (Shift keeps the aspect), turned from the round handle (Shift snaps to 15°), pinched with two fingers and
   nudged with the arrow keys. While it moves, a copy of its pixels follows the pointer; on release the content stream is
   rewritten once (S.objCommit: a derived copy, one undo step). Its actions are in the selection bar (obj-bar.js). Drawn in
   the page layer (unrotated page space, so a turned page turns the handles too). Classic script.
   touch-ok: the page view is a touch surface (data-touch-surface="nav", view-zoom.js); a second finger's pinch reaches the
   object through Ed.nav (the engine's adapter), not the page zoom, while an object is being dragged. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, Ed = SP.editor, S = Ed._, Ob = window.SlopPdfObjs, Mv = window.SlopPdfMove;
  var O = S.obj = { sel: null, hover: null };
  var cache = new Map(), layerEl = null, act = null, HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  Ed.objMode = false;
  var NAMES = { image: 'Image', inline: 'Inline image', form: 'Placed artwork', vector: 'Vector drawing' }; // i18n-ignore: API (ui/ai-objects.js)
  O.name = function (o) { return NAMES[o.kind] || 'Object'; }; // i18n-ignore: API, English for the agent tools
  /** The object's kind as a person reads it inside a sentence ('Selected image', 'Move placed artwork'). */
  O.label = function (o) { return U.t(NAMES[o.kind] ? 'pdf.ed.obj_kind_' + o.kind : 'pdf.ed.obj_kind_object'); };
  // O.apply's verb: a key, or one of the English prefixes ui/ai-objects.js passes ('Move ', 'Turn ', 'Resize ')
  var VERBS = { 'Move ': 'pdf.ed.undo_move_obj', 'Turn ': 'pdf.ed.undo_turn_obj', 'Resize ': 'pdf.ed.undo_resize_obj' }; // i18n-ignore

  /* ------------------------------------------------------------ the objects of a page */
  /** The objects of page p: a Promise of the list (each with its box in page space), read once per file page. */
  O.load = function (p) {
    var f = E.fileOfPage(p), key = f && p.f + ':' + p.i;
    if (!f || p.blank || !window.PDFLib) return Promise.resolve([]);
    if (!cache.has(key)) {
      var pr = docOf(f).then(function (doc) { var l = S.objRead(doc, p.i).list; pr.value = l; return l; })
        .catch(function (e) { console.warn('Slop PDF: page objects not read', e); pr.value = []; return []; });
      cache.set(key, pr);
    }
    return cache.get(key);
  };
  /** The file read with pdf-lib once (only read here, never changed), the last few files kept. */
  var docs = new Map();
  function docOf(f) {
    if (!docs.has(f.id)) { docs.set(f.id, S.strip.load(f.bytes)); if (docs.size > 4) docs.delete(docs.keys().next().value); }
    return docs.get(f.id);
  }
  O.list = function (p) { var pr = p && cache.get(p.f + ':' + p.i); return pr && pr.value ? pr.value : null; };
  /** user space → page space (the annotations' space: from the top-left of the page box, y down). */
  O.toPage = function (p) { var g = E.geom(p); return [1, 0, 0, -1, -g.x0, g.y0 + g.H]; };
  /** The object's corners and box in page space. */
  O.quad = function (p, o) { var A = O.toPage(p); return o.quad.map(function (q) { return Ob.apply(A, q[0], q[1]); }); };
  O.rect = function (p, o) { var b = Ob.boxOf(O.quad(p, o)); return { x: b[0], y: b[1], w: b[2] - b[0], h: b[3] - b[1] }; };
  function inside(q, x, y) { // a point in a convex quad (either winding)
    var sgn = 0;
    for (var i = 0; i < 4; i++) {
      var a = q[i], b = q[(i + 1) % 4], c = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
      if (Math.abs(c) < 1e-9) continue;
      if (!sgn) sgn = Math.sign(c); else if (Math.sign(c) !== sgn) return false;
    }
    return true;
  }
  /** The topmost object under a page-space point (a small object over a big one wins at the same depth). */
  O.at = function (p, pt) {
    var l = O.list(p) || [], hit = null;
    for (var i = l.length - 1; i >= 0; i--) if (inside(O.quad(p, l[i]), pt[0], pt[1])) { hit = l[i]; break; }
    return hit;
  };
  /** Objects show: Objects mode, or one the select tool picked (select-edit.js). */
  O.live = function () { return Ed.objMode || !!(O.sel && Ed.uniOn && Ed.uniOn()); };
  O.selected = function () { var s = O.sel, p = s && Ed.page(); return s && p && p.id === s.pid ? (O.list(p) || []).filter(function (o) { return o.id === s.id; })[0] || null : null; };

  /* ------------------------------------------------------------ the mode */
  Ed.toggleObjects = function (on) {
    Ed.objMode = on == null ? !Ed.objMode : !!on;
    if (Ed.objMode && Ed.editText) Ed.toggleEditText();
    if (Ed.objMode) { Ed.setTool('select'); Ed.select(null); }
    if (!Ed.objMode) { O.sel = null; O.hover = null; }
    if (S.viewer) S.viewer.classList.toggle('obj-mode', Ed.objMode);
    var ob = document.getElementById('btnObjects');
    if (ob) { ob.classList.toggle('on', Ed.objMode); ob.setAttribute('aria-pressed', String(Ed.objMode)); }
    if (window.SlopSelBar) SlopSelBar.update();
    var p = Ed.page();
    if (Ed.objMode && p) O.load(p).then(O.paint);
    O.paint();
    if (SP.app && SP.app.toolChanged) SP.app.toolChanged();
    SlopUI.toast(U.t(Ed.objMode ? 'pdf.ed.obj_on' : 'pdf.ed.obj_off'));
  };
  O.select = function (o) {
    var p = Ed.page();
    O.sel = o && p ? { pid: p.id, id: o.id } : null;
    O.paint();
    if (window.SlopSelBar) SlopSelBar.update();
  };

  /* ------------------------------------------------------------ drawing */
  function layer() {
    var s = Ed.pid && S.slots.get(Ed.pid);
    if (!s) return null;
    if (!layerEl) layerEl = U.h('div', { class: 'obj-layer', 'data-touch-surface': 'nav' });
    if (layerEl.parentNode !== s.layer) s.layer.appendChild(layerEl);
    return layerEl;
  }
  function px(el, x, y, w, h) { var z = Ed.zoom; el.style.left = x * z + 'px'; el.style.top = y * z + 'px'; if (w != null) { el.style.width = w * z + 'px'; el.style.height = h * z + 'px'; } return el; }
  function outline(q, cls) {
    var z = Ed.zoom, svg = U.s('svg', { class: 'obj-outline ' + cls });
    svg.appendChild(U.s('polygon', { points: q.map(function (v) { return v[0] * z + ',' + v[1] * z; }).join(' ') }));
    return svg;
  }
  O.paint = function () {
    var el = layer(); if (!el) return;
    el.innerHTML = '';
    var p = Ed.page();
    el.hidden = !O.live() || !p;
    if (el.hidden) return;
    if (!O.list(p)) { O.load(p).then(function () { if (Ed.page() === p) O.paint(); }); return; }
    var hv = O.hover && O.hover !== (O.sel && O.sel.id) ? (O.list(p) || []).filter(function (o) { return o.id === O.hover; })[0] : null;
    if (hv && !act) el.appendChild(outline(O.quad(p, hv), 'is-hover'));
    var o = O.selected();
    if (!o) return;
    var r = O.rect(p, o), box = px(U.h('div', { class: 'obj-box', role: 'img', 'aria-label': U.t('pdf.ed.obj_selected', { what: O.label(o) }) }), r.x, r.y, r.w, r.h);
    box.addEventListener('pointerdown', function (e) { down(e, 'move'); });
    el.append(outline(O.quad(p, o), 'is-sel'), box);
    HANDLES.forEach(function (hh) {
      var hx = r.x + (/w/.test(hh) ? 0 : /e/.test(hh) ? r.w : r.w / 2), hy = r.y + (/n/.test(hh) ? 0 : /s/.test(hh) ? r.h : r.h / 2);
      var hd = px(U.h('div', { class: 'obj-h obj-h-' + hh + ' slop-hit', 'data-h': hh, 'aria-hidden': 'true' }), hx, hy);
      hd.addEventListener('pointerdown', function (e) { down(e, hh); });
      el.appendChild(hd);
    });
    var rot = px(U.h('div', { class: 'obj-rot slop-hit', title: U.t('pdf.ed.obj_turn_tip'), 'aria-hidden': 'true' }), r.x + r.w / 2, r.y);
    rot.addEventListener('pointerdown', function (e) { down(e, 'rot'); });
    el.appendChild(rot);
  };

  /* ------------------------------------------------------------ dragging */
  /** A copy of the object's pixels from the page's raster, to follow the pointer while it moves. */
  function ghost(p, r) {
    var s = S.slots.get(p.id), src = s && s.canvas, g = E.geom(p), z = Ed.zoom;
    var c = U.h('canvas', { class: 'obj-ghost', 'aria-hidden': 'true' });
    if (src && src.width) {
      var k = src.width / g.W, dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.max(1, Math.round(r.w * z * dpr)); c.height = Math.max(1, Math.round(r.h * z * dpr));
      c.getContext('2d').drawImage(src, r.x * k, r.y * k, r.w * k, r.h * k, 0, 0, c.width, c.height);
    }
    return px(c, r.x, r.y, r.w, r.h);
  }
  /** Places the ghost and the outline for T (page space). */
  function preview(T) {
    var a = act, z = Ed.zoom, P0 = [a.r.x * z, a.r.y * z], P1 = Ob.apply(T, a.r.x, a.r.y);
    a.ghost.style.transform = 'matrix(' + [T[0], T[1], T[2], T[3], P1[0] * z - P0[0], P1[1] * z - P0[1]].join(',') + ')';
    var q = a.q.map(function (v) { return Ob.apply(T, v[0], v[1]); });
    if (a.line) a.line.remove();
    a.line = outline(q, 'is-sel');
    layerEl.appendChild(a.line);
  }
  /** T (page space) for the drag so far. */
  function transformFor(pt, shift) {
    var a = act, r = a.r, dx = pt[0] - a.start[0], dy = pt[1] - a.start[1];
    if (a.h === 'move') return Mv.move(dx, dy);
    if (a.h === 'rot') {
      var cx = r.x + r.w / 2, cy = r.y + r.h / 2, ang = Math.atan2(pt[1] - cy, pt[0] - cx) - Math.atan2(a.start[1] - cy, a.start[0] - cx);
      var deg = ang * 180 / Math.PI;
      if (shift) deg = Math.round(deg / 15) * 15;
      a.deg = deg;
      return Mv.rotateAbout(deg, cx, cy);
    }
    var h = a.h, ax = /w/.test(h) ? r.x + r.w : /e/.test(h) ? r.x : r.x + r.w / 2, ay = /n/.test(h) ? r.y + r.h : /s/.test(h) ? r.y : r.y + r.h / 2;
    var sx = /[we]/.test(h) ? (r.w + (/w/.test(h) ? -dx : dx)) / r.w : 1, sy = /[ns]/.test(h) ? (r.h + (/n/.test(h) ? -dy : dy)) / r.h : 1;
    if (h.length === 2 && (shift || !a.upright)) { var k = Math.max(Math.abs(sx), Math.abs(sy)); sx = Math.sign(sx || 1) * k; sy = Math.sign(sy || 1) * k; }
    sx = Math.abs(sx) < 0.02 ? 0.02 : sx; sy = Math.abs(sy) < 0.02 ? 0.02 : sy;
    return Mv.scaleAbout(sx, sy, ax, ay);
  }
  function down(e, h) {
    if (e.button > 0) return;
    var p = Ed.page(), o = O.selected();
    if (!p || !o) return;
    e.preventDefault(); e.stopPropagation();
    begin(e, p, o, h);
  }
  function begin(e, p, o, h) {
    var r = O.rect(p, o), m = o.ctm, upright = Math.abs(m[1]) < 1e-6 * Math.abs(m[0] || 1) && Math.abs(m[2]) < 1e-6 * Math.abs(m[3] || 1);
    act = { h: h, p: p, o: o, r: r, q: O.quad(p, o), start: S.pagePt(e), T: null, moved: false, upright: upright, id: e.pointerId, pinch: null };
    S.pageEl.setPointerCapture(e.pointerId);
    S.pageEl.addEventListener('pointermove', move);
    S.pageEl.addEventListener('pointerup', up);
    S.pageEl.addEventListener('pointercancel', up);
  }
  function move(e) {
    if (!act || e.pointerId !== act.id) return;
    var pt = S.pagePt(e);
    if (!act.moved && Math.hypot(pt[0] - act.start[0], pt[1] - act.start[1]) * Ed.zoom < 3) return;
    if (!act.moved) { act.moved = true; act.ghost = ghost(act.p, act.r); layerEl.innerHTML = ''; layerEl.appendChild(act.ghost); }
    act.T = act.pinch ? act.T : transformFor(pt, e.shiftKey);
    preview(act.T);
  }
  function up(e) {
    if (!act || (e && e.pointerId !== act.id)) return;
    S.pageEl.removeEventListener('pointermove', move); S.pageEl.removeEventListener('pointerup', up); S.pageEl.removeEventListener('pointercancel', up);
    var a = act; act = null;
    if (!a.moved || !a.T) { O.paint(); return; }
    O.apply(a.p, a.o, a.T, a.h === 'move' ? 'pdf.ed.undo_move_obj' : a.h === 'rot' ? 'pdf.ed.undo_turn_obj' : 'pdf.ed.undo_resize_obj', a.ghost);
  }
  /** Two fingers while dragging the object: the pinch scales it about the fingers and their move moves it (Ed.nav). */
  ['zoomAt', 'panBy'].forEach(function (k) {
    var orig = Ed.nav && Ed.nav[k];
    if (!orig) return;
    Ed.nav[k] = function (a, b, c) {
      if (!act || !act.moved && !act.pinch) return orig.apply(this, arguments);
      if (!act.moved) { act.moved = true; act.ghost = ghost(act.p, act.r); layerEl.innerHTML = ''; layerEl.appendChild(act.ghost); }
      var T = act.T || [1, 0, 0, 1, 0, 0], z = Ed.zoom;
      act.pinch = true;
      if (k === 'zoomAt') { var c0 = S.pagePt({ clientX: S.viewer.getBoundingClientRect().left + b, clientY: S.viewer.getBoundingClientRect().top + c }); T = Ob.mul(T, Mv.scaleAbout(a, a, c0[0], c0[1])); }
      else T = Ob.mul(T, Mv.move(a / z, b / z)); // client px, about the page's own axes on an unturned page
      act.T = T; preview(T);
    };
  });
  var cancel = Ed.cancelInteraction;
  Ed.cancelInteraction = function () { if (act && act.moved) return; return cancel.apply(this, arguments); };

  /** Makes the change T (page space) to object o of page p, one undo step; the ghost stays until the new raster shows.
   * Resolves the object on the new content (or true), false when it could not be changed. */
  O.apply = async function (p, o, T, verb, gh) {
    var A = O.toPage(p), Tu = Ob.mul(Ob.mul(A, T), Ob.inv(A)), want = Ob.boxOf(o.quad.map(function (q) { var v = Ob.apply(Tu, q[0], q[1]); return v; }));
    var label = U.t(VERBS[verb] || verb || 'pdf.ed.undo_change_obj', { what: O.label(o) });
    SP.app.status(label + '…');
    var to = await S.objCommit(p, { op: 'transform', id: o.id, T: Tu.map(function (v) { return +v.toFixed(6); }) }, label);
    if (!to) { if (gh) gh.remove(); SlopUI.toast(U.t('pdf.ed.obj_not_changed_here')); O.paint(); return false; }
    var now = await O.follow(p.id, o, want);
    if (gh) waitRaster(p.id, function () { gh.remove(); });
    SP.app.status('');
    return now || true;
  };
  /** After an edit, selects the same object on the page's new content: same kind and name, nearest to where it should be. */
  O.follow = async function (pid, o, want) {
    var p = E.pageById(pid); if (!p) return;
    var l = await O.load(p), best = null, bd = Infinity;
    l.forEach(function (x) {
      if (x.kind !== o.kind || x.name !== o.name) return;
      var d = Math.abs(x.box[0] - want[0]) + Math.abs(x.box[1] - want[1]) + Math.abs(x.box[2] - want[2]) + Math.abs(x.box[3] - want[3]);
      if (d < bd) { bd = d; best = x; }
    });
    if (Ed.pid === pid && (Ed.objMode || (Ed.uniOn && Ed.uniOn()))) O.select(best);
    return best;
  };
  function waitRaster(pid, done) {
    var t0 = Date.now();
    (function tick() {
      var s = S.slots.get(pid);
      if (!s || (s.key && s.key === S.keyOf(s)) || Date.now() - t0 > 5000) { done(); O.paint(); return; }
      requestAnimationFrame(tick);
    })();
  }

  /* ------------------------------------------------------------ pointer and paint hooks */
  /** A press on the page in Objects mode (pointer.js): an object under it is selected and dragged. */
  S.objDown = function (e, p) {
    if (!Ed.objMode && !(Ed.uniOn && Ed.uniOn())) return false;
    var l = O.list(p);
    if (!l) { O.load(p).then(O.paint); return false; }
    var o = O.at(p, S.pagePt(e));
    if (!o) { if (O.sel) O.select(null); return false; }
    e.preventDefault();
    O.select(o);
    begin(e, p, o, 'move');
    return true;
  };
  document.addEventListener('pointermove', function (e) {
    if (!Ed.objMode || act || e.pointerType !== 'mouse' || !S.pageEl || !e.target.closest || !e.target.closest('.pv-page')) return;
    var p = Ed.page(), o = p && O.list(p) ? O.at(p, S.pagePt(e)) : null, id = o ? o.id : null;
    if (id !== O.hover) { O.hover = id; O.paint(); }
  });
  var paint = Ed.paint;
  Ed.paint = function () { var r = paint.apply(this, arguments); if (O.live() && !act) O.paint(); else if (layerEl && !layerEl.hidden && !act) O.paint(); return r; };
  E.on('change', function () {
    var s = O.sel, p = s && E.pageById(s.pid);
    if (s && (!p || !O.list(p) || !O.selected())) { if (!p) O.sel = null; else O.load(p).then(function () { if (!O.selected()) O.sel = null; O.paint(); if (window.SlopSelBar) SlopSelBar.update(); }); }
  });
})();
