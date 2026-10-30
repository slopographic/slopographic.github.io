/* SlopVector — tools: pointer/touch/pinch/wheel pipeline and op helpers */
(function () {
  'use strict';
  var G = window.SVGeom, SV = window.SV, S = SV.state, D = SV.dom;
  var abs = Math.abs, min = Math.min, max = Math.max, PI = Math.PI, round = Math.round, hypot = Math.hypot;
  var clone = SV.clone, getObj = SV.getObj, find = SV.find, C = SV.cmd = SV.cmd || {};
  var $ = SV._tools = SV._tools || {};
  var TOOLS = $.TOOLS;

  /* ================= pointer pipeline ================= */
  var pointers = new Map(), gesture = null, lastDown = { t: 0, x: 0, y: 0 };
  function mkEv(e) {
    var r = D.stage.getBoundingClientRect();
    S.pointerKind = e.pointerType || 'mouse';
    return { e: e, p: SV.evDoc(e), sx: e.clientX - r.left, sy: e.clientY - r.top, shift: e.shiftKey, alt: e.altKey, mod: e.ctrlKey || e.metaKey,
      kind: S.pointerKind, pressure: e.pointerType === 'pen' ? (e.pressure || 0.5) : null };
  }
  /** A hit radius in screen px for the last pointer: base for a mouse, at least 22 for a finger and 12 for a pen
   *  (shared/input: SlopTouch.hit; the stage is a touch surface, data-touch-surface="nav" in index.html). */
  SV.hitPx = function (base) {
    var k = S.pointerKind;
    if (window.SlopTouch && SlopTouch.hit) return SlopTouch.hit({ pointerType: k }, base);
    return k === 'touch' ? max(base, 22) : k === 'pen' ? max(base, 12) : base;
  };
  function onDown(e) {
    if (e.button === 2 || e.target === D.textEditor) return;
    if (document.activeElement && document.activeElement !== document.body && document.activeElement !== D.textEditor && document.activeElement.blur) document.activeElement.blur();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { startGesture(); return; }
    if (pointers.size > 2) return;
    e.preventDefault();
    try { D.stage.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
    var ev = mkEv(e);
    var now = Date.now();
    ev.dbl = now - lastDown.t < 420 && hypot(e.clientX - lastDown.x, e.clientY - lastDown.y) < (e.pointerType === 'touch' || e.pointerType === 'pen' ? 24 : 6); // a finger's two taps land further apart
    lastDown = { t: ev.dbl ? 0 : now, x: e.clientX, y: e.clientY };
    if (S.editing) {
      var eo = getObj(S.editing.id);
      var onIt = eo && (S.tool === 'type' || S.tool === 'select') && SV.hitTest(ev.p) && SV.hitTest(ev.p).obj.id === eo.id;
      SV.commitTextEdit();
      if (onIt && S.tool === 'type') { SV.startTextEdit(getObj(eo.id), ev.p); return; }
    }
    if (e.button === 1 || S.spaceHand || S.tool === 'hand') { S.op = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: S.view.x, vy: S.view.y }; SV.updateCursor(); return; }
    S.hover = null;
    var t = TOOLS[S.tool];
    if (t && t.down) t.down(ev);
    SV.requestRender();
  }
  function onMove(e) {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesture) { moveGesture(); return; }
    var ev = mkEv(e);
    if (SV.ui && SV.ui.setCursorPos) SV.ui.setCursorPos(ev.p);
    S.lastPointer = ev;
    if (S.op) {
      if (S.op.kind === 'pan') { S.view.x = S.op.vx + e.clientX - S.op.sx; S.view.y = S.op.vy + e.clientY - S.op.sy; SV.requestRender(); return; }
      var t = TOOLS[S.op.tool || S.tool];
      if (t && t.move) t.move(ev);
      SV.requestRender();
    } else if (e.target === D.stage || D.stage.contains(e.target)) {
      var th = TOOLS[S.spaceHand ? 'hand' : S.tool];
      if (th && th.hover) th.hover(ev); else SV.updateCursor(ev.alt);
      SV.requestRender();
    }
  }
  function onUp(e) {
    var had = pointers.has(e.pointerId);
    pointers.delete(e.pointerId);
    if (gesture) { if (pointers.size < 2) { gesture = null; SV.requestRender(true); } return; }
    if (!had) return;
    var ev = mkEv(e);
    if (S.op) {
      var op = S.op;
      if (op.kind === 'pan') { S.op = null; SV.updateCursor(); SV.requestRender(true); return; }
      var t = TOOLS[op.tool || S.tool];
      if (t && t.up) t.up(ev);
      if (S.op === op) S.op = null;
      S.snapLines = []; S.readout = null; S.marquee = null;
      SV.requestRender(true);
    }
  }
  function onCancel(e) {
    pointers.delete(e.pointerId);
    if (S.op && S.op.kind !== 'pan') { SV.revert(); }
    S.op = null; S.snapLines = []; S.readout = null; S.marquee = null; gesture = null;
    SV.requestRender(true);
  }
  function startGesture() {
    if (S.op && S.op.kind !== 'pan' && S.op.dirty !== false) SV.revert();
    S.op = null; S.marquee = null; S.snapLines = []; S.readout = null;
    var ps = Array.from(pointers.values()), r = D.stage.getBoundingClientRect();
    gesture = { d0: hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) || 1, m0: { x: (ps[0].x + ps[1].x) / 2 - r.left, y: (ps[0].y + ps[1].y) / 2 - r.top }, z0: S.view.zoom, vx: S.view.x, vy: S.view.y };
  }
  function moveGesture() {
    var ps = Array.from(pointers.values()); if (ps.length < 2) return;
    var r = D.stage.getBoundingClientRect();
    var d = hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y), m = { x: (ps[0].x + ps[1].x) / 2 - r.left, y: (ps[0].y + ps[1].y) / 2 - r.top };
    var z = SV.clamp(gesture.z0 * d / gesture.d0, SV.ZOOM_MIN, SV.ZOOM_MAX);
    var docPt = { x: (gesture.m0.x - gesture.vx) / gesture.z0, y: (gesture.m0.y - gesture.vy) / gesture.z0 };
    S.view.zoom = z; S.view.x = m.x - docPt.x * z; S.view.y = m.y - docPt.y * z;
    SV.requestRender(true);
  }
  function onWheel(e) {
    e.preventDefault();
    var r = D.stage.getBoundingClientRect(), cx = e.clientX - r.left, cy = e.clientY - r.top;
    var dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY, dx = e.deltaMode === 1 ? e.deltaX * 16 : e.deltaX;
    if (e.ctrlKey || e.metaKey || e.altKey) {
      SV.zoomBy(Math.exp(-dy * (e.ctrlKey && !e.altKey ? 0.01 : 0.002)), cx, cy);
    } else {
      if (e.shiftKey && !dx) { dx = dy; dy = 0; }
      SV.panView(-dx, -dy);
    }
    if (S.editing) SV.positionEditor();
  }
  SV.bindStage = function () {
    D.stage.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    D.stage.addEventListener('wheel', onWheel, { passive: false });
    D.stage.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    D.stage.addEventListener('pointerleave', function () { if (!S.op) { S.hover = null; if (S.pen) S.pen.cursor = null; SV.requestRender(); } });
  };

  /* ================= helpers for ops ================= */
  function snapshotObjs(ids) { return ids.map(function (id) { return clone(getObj(id)); }).filter(Boolean); }
  function restoreObjs(origs) { origs.forEach(function (o) { SV.replaceObj(o.id, clone(o)); }); }
  function readout(ev, text) { S.readout = { x: ev.sx, y: ev.sy, text: text }; }
  function n1(v) { return (Math.round(v * 10) / 10).toString(); }
  SV.fmtNum = n1;
  function selectableTopIds() { return S.sel.filter(function (id) { var o = getObj(id); return o && SV.isEditable(o); }); }

  $.n1 = n1; $.readout = readout; $.restoreObjs = restoreObjs; $.selectableTopIds = selectableTopIds; $.snapshotObjs = snapshotObjs;
})();
