/* Slop 3D viewport input: orbit (drag), pan (Shift-drag or middle drag), zoom (wheel), click to select (Shift adds),
 * double-click to frame, gizmo arrows to move the selection along an axis (snapped), and the right-click menu.
 * In mesh edit mode the same gizmo moves the selected elements, a click or box picks elements (editpick.js), Alt-drag
 * orbits, and a running transform (editmodal.js) takes the pointer until it is confirmed or cancelled.
 * Touch (shared/input): the canvas is a touch surface; one finger orbits or taps to select, two fingers pinch-zoom and pan,
 * a double tap frames, a long press opens the menu; a finger grabs the gizmo arrows from 22 px away.
 * Sets window.Slop3D.viewport: create({ canvas, stage, cam, gizmo, objects, menus }) → { redraw, frame, setView, pickAt }. */
(function () {
  'use strict';
  const S = (window.Slop3D = window.Slop3D || {});
  const M = S.model, A = S.actions, st = S.state, s = st.s;
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

  /** Parameter t of the point on the line origin + t·dir nearest to the ray (ray: { o, d }), or null when parallel. */
  function closestParam(origin, dir, ray) {
    const w0 = sub(origin, ray.o);
    const a = dot(dir, dir), b = dot(dir, ray.d), c = dot(ray.d, ray.d), d = dot(dir, w0), e = dot(ray.d, w0);
    const den = a * c - b * b;
    return Math.abs(den) < 1e-9 ? null : (b * e - c * d) / den;
  }

  function create({ canvas, stage, cam, gizmo, objects, menus }) {
    const THREE = stage.THREE;
    let drag = null, hover = null;
    S.editenv = { THREE, canvas, stage, cam, objects };
    const editOn = () => S.edit.active();

    const ndcOf = (e) => {
      const r = canvas.getBoundingClientRect();
      return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    /** A world ray through the pointer, as plain arrays. */
    function rayFrom(ndc) {
      const rc = new THREE.Raycaster();
      rc.setFromCamera(ndc, stage.camera);
      return { o: [rc.ray.origin.x, rc.ray.origin.y, rc.ray.origin.z], d: [rc.ray.direction.x, rc.ray.direction.y, rc.ray.direction.z] };
    }
    const pickAt = (e) => stage.pick(ndcOf(e), stage.camera, objects.pickables());
    /** The gizmo axis under the pointer; a finger or a pen also tries points around it (a thin arrow is hard to hit). */
    const RING = [[0, 0], [8, 0], [-8, 0], [0, 8], [0, -8], [14, 14], [-14, 14], [14, -14], [-14, -14], [20, 0], [-20, 0], [0, 20], [0, -20]];
    function gizmoHit(e) {
      const R = window.SlopTouch ? SlopTouch.hit(e, 0) : 0;
      for (const [dx, dy] of RING) {
        if (Math.hypot(dx, dy) > R) continue;
        const a = gizmo.hit(ndcOf({ clientX: e.clientX + dx, clientY: e.clientY + dy }), stage.camera);
        if (a) return a;
      }
      return null;
    }
    canvas.setAttribute('data-touch-surface', '');
    canvas.touchSurface = { // two fingers (shared/input): the layer has cancelled the first finger's orbit
      zoom: (scale) => { cam.zoom(-Math.log(scale) / 0.0012); redraw(); },
      pan: (dx, dy) => { cam.pan(dx, dy); redraw(); },
    };

    /** Keeps the gizmo on the primary selection (or the element pivot in edit mode) at a constant on-screen size. */
    function refreshGizmo() {
      const p = editOn() ? S.edit.pivot() : null;
      if (p) { gizmo.place(p, cam.st.dist * 0.11, true); return; }
      const id = st.primary();
      if (editOn() || !id || !s.doc.nodes[id]) { gizmo.place([0, 0, 0], 1, false); return; }
      const W = M.worldMatrix(s.doc, id);
      gizmo.place([W[12], W[13], W[14]], cam.st.dist * 0.11, true);
    }
    /** Applies the camera, refreshes the gizmo and asks for a frame. */
    function redraw() {
      cam.apply();
      refreshGizmo();
      stage.request();
    }
    function frame(ids = s.sel) {
      const b = S.ops.bounds(s.doc, ids && ids.length ? ids : null);
      if (b) cam.frame(b);
      redraw();
    }
    function setView(name) { cam.setView(name); redraw(); }
    const toggle = (id) => { const cur = s.sel.slice(), i = cur.indexOf(id); if (i >= 0) cur.splice(i, 1); else cur.push(id); return cur; };

    canvas.addEventListener('pointerdown', (e) => {
      if (S.editmodal.pointerDown(e)) { redraw(); return; }
      if (e.button === 2) return;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer: no capture */ }
      e.preventDefault();
      const ndc = ndcOf(e);
      const axis = e.button === 0 && !e.shiftKey && !e.altKey && (editOn() ? S.edit.hasSel() : s.sel.length) ? gizmoHit(e) : null;
      if (axis) {
        const origin = editOn() ? S.edit.pivot() : (() => { const W = M.worldMatrix(s.doc, st.primary()); return [W[12], W[13], W[14]]; })();
        const dir = gizmo.dirOf(axis), r = rayFrom(ndc);
        const t0 = closestParam(origin, dir, r), sess = editOn() ? S.edit.begin() : null;
        if (t0 !== null && (sess || !editOn())) {
          drag = { mode: 'axis', origin, dir, t0, applied: 0, key: A.beginDrag(), sess, x: e.clientX, y: e.clientY };
          gizmo.highlight(axis);
          canvas.style.cursor = 'grabbing';
          return;
        }
      }
      if (e.button === 0 && editOn() && !e.altKey && S.editpick.down(e, S.editenv)) return;
      if (e.button === 1 || (e.button === 0 && e.shiftKey && !editOn()) || (e.button === 0 && e.altKey && editOn())) drag = { mode: 'pan', x: e.clientX, y: e.clientY };
      else if (e.button === 0) drag = { mode: 'orbit', x: e.clientX, y: e.clientY, moved: 0 };
    });
    canvas.addEventListener('pointermove', (e) => {
      if (S.editmodal.pointerMove(e)) { redraw(); return; }
      if (S.editpick.dragging()) { S.editpick.move(e); stage.request(); return; }
      if (!drag) {
        const a = (editOn() ? S.edit.hasSel() : s.sel.length) ? gizmo.hit(ndcOf(e), stage.camera) : null;
        if (a !== hover) { hover = a; gizmo.highlight(a); stage.request(); }
        canvas.style.cursor = a ? 'move' : '';
        return;
      }
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      if (drag.mode === 'orbit') { drag.moved += Math.abs(dx) + Math.abs(dy); cam.orbit(dx, dy); redraw(); }
      else if (drag.mode === 'pan') { cam.pan(dx, dy); redraw(); }
      else if (drag.mode === 'axis') {
        const t = closestParam(drag.origin, drag.dir, rayFrom(ndcOf(e)));
        if (t === null) return;
        const amount = S.snap.snap(t - drag.t0, s.snapStep);
        if (drag.sess) drag.sess.apply(S.meshxf.translate(drag.dir.map((v) => v * amount)));
        else {
          const d = amount - drag.applied;
          if (Math.abs(d) > 1e-12) { drag.applied = amount; A.move(drag.dir.map((v) => v * d), drag.key); }
        }
        refreshGizmo();
        stage.request();
      }
    });
    const endDrag = (e, click) => {
      if (S.editpick.up()) { redraw(); return; }
      if (!drag) return;
      const d = drag;
      drag = null;
      try { if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId); } catch (err) { /* no capture to release */ }
      canvas.style.cursor = '';
      if (d.mode === 'axis') gizmo.highlight(null);
      if (click && d.mode === 'orbit' && d.moved < (e.pointerType === 'touch' ? 12 : 5) && !editOn()) {
        const hit = pickAt(e);
        if (hit) st.select(e.shiftKey ? toggle(hit.id) : [hit.id]);
        else if (!e.shiftKey) st.select([]);
      }
      redraw();
    };
    canvas.addEventListener('pointerup', (e) => endDrag(e, true));
    canvas.addEventListener('pointercancel', (e) => endDrag(e, false));
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      cam.zoom(e.deltaY * (e.deltaMode ? 33 : 1));
      redraw();
    }, { passive: false });
    canvas.addEventListener('dblclick', (e) => {
      if (editOn()) return;
      const hit = pickAt(e);
      if (hit) { st.select([hit.id]); frame([hit.id]); }
    });
    if (window.SlopCtx) SlopCtx.bind(canvas, (target, ev) => {
      if (ev) {
        const hit = pickAt(ev);
        if (hit && !editOn()) { if (!s.sel.includes(hit.id)) st.select([hit.id]); return menus.objectItems(); }
        return menus.viewportItems();
      }
      return s.sel.length && !editOn() ? menus.objectItems() : menus.viewportItems();
    });
    st.on('doc', () => { refreshGizmo(); stage.request(); });
    st.on('sel', () => { refreshGizmo(); stage.request(); });
    st.on('edit', () => { refreshGizmo(); stage.request(); });
    return { redraw, frame, setView, pickAt, refreshGizmo };
  }

  S.viewport = { create, closestParam };
})();
