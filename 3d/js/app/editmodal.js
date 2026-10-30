/* Slop 3D transform modal for mesh edit mode: G move, R rotate, S scale and E extrude then move along the normal.
 * The mouse moves it, typed numbers set it (type X, Y or Z first to pick the axis, or leave it free for the mouse),
 * Enter or a left click confirms, Escape or a right click cancels. Each step replaces the last, so the whole
 * gesture is one undo step. Keys are taken in the capture phase while it runs. Sets window.Slop3D.editmodal. */
(function () {
  'use strict';
  const S = (window.Slop3D = window.Slop3D || {});
  const E = S.edit, MX = S.meshxf, X = S.xform, st = S.state;
  const AX = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
  const tr = S.t;
  let M = null;

  const env = () => S.editenv;
  const active = () => !!M;
  const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  /** Screen position (px, relative to the canvas) of a world point. */
  function project(p) {
    const e = env(), v = new e.THREE.Vector3(p[0], p[1], p[2]).project(e.stage.camera), r = e.canvas.getBoundingClientRect();
    return [(v.x + 1) / 2 * r.width, (1 - v.y) / 2 * r.height];
  }
  /** Axis vector for the current constraint (null = free). */
  function axisVec() {
    if (!M.axis) return null;
    return M.axis === 'n' ? M.nrm : AX[M.axis];
  }
  const num = (t) => (t !== '' && t !== '-' && t !== '.' && t !== '-.' && Number.isFinite(Number(t)) ? Number(t) : null);

  /** Builds the world matrix for the current input and applies it. */
  function step() {
    const e = env(), cam = e.stage.camera, P = M.sess.pivot, av = axisVec();
    const hasBase = !!(M.base && M.last);
    const dx = hasBase ? M.last[0] - M.base[0] : 0, dy = hasBase ? M.last[1] - M.base[1] : 0;
    const t = num(M.typed);
    let A, text;
    cam.updateMatrixWorld();
    if (M.kind === 'move') {
      let d;
      if (av) {
        let amt = t;
        if (amt === null) {
          const a0 = project(P), a1 = project([P[0] + av[0], P[1] + av[1], P[2] + av[2]]);
          const sx = a1[0] - a0[0], sy = a1[1] - a0[1], l2 = sx * sx + sy * sy;
          amt = l2 > 1e-9 ? (dx * sx + dy * sy) / l2 : 0;
        }
        d = av.map((c) => c * amt);
        text = tr('3d.edit.move_axis', { axis: M.axis === 'n' ? tr('3d.edit.normal') : M.axis.toUpperCase(), amount: amt.toFixed(3) });
      } else {
        const el = cam.matrixWorld.elements, dist = Math.hypot(cam.position.x - P[0], cam.position.y - P[1], cam.position.z - P[2]);
        const k = 2 * dist * Math.tan(cam.fov * Math.PI / 360) / Math.max(1, env().canvas.getBoundingClientRect().height);
        const right = [el[0], el[1], el[2]], up = [el[4], el[5], el[6]];
        d = [0, 1, 2].map((i) => right[i] * dx * k - up[i] * dy * k);
        text = tr('3d.edit.move_free');
      }
      A = MX.translate(d);
    } else if (M.kind === 'rotate') {
      const deg = t !== null ? t : dx * 0.5;
      const dir = av || (() => { const v = new e.THREE.Vector3(); cam.getWorldDirection(v); return [v.x, v.y, v.z]; })();
      A = MX.about(P, MX.rotation(dir, deg));
      text = M.axis ? tr('3d.edit.rotate_axis', { deg: deg.toFixed(1), axis: M.axis.toUpperCase() }) : tr('3d.edit.rotate_by', { deg: deg.toFixed(1) });
    } else {
      let f = t;
      if (f === null) {
        const p0 = project(P);
        if (!M.base) f = 1;
        else {
          const d0 = Math.max(4, dist2(M.base, p0));
          f = dist2(M.last || M.base, p0) / d0;
        }
      }
      A = MX.about(P, MX.scale(f, M.axis && M.axis !== 'n' ? AX[M.axis] : null));
      text = M.axis ? tr('3d.edit.scale_axis', { f: f.toFixed(3), axis: M.axis.toUpperCase() }) : tr('3d.edit.scale_by', { f: f.toFixed(3) });
    }
    M.sess.apply(A);
    E.setInfo(text);
  }
  /** Starts a gesture. kind: 'move' | 'rotate' | 'scale' | 'extrude' (extrude, then move along the normal). */
  function start(kind) {
    if (M || !E.active() || !env()) return false;
    if (!E.hasSel()) { if (window.SlopUI) SlopUI.toast(tr('3d.edit.select_first')); return false; }
    let axis = null, nrm = null;
    if (kind === 'extrude') {
      if (!E.extrude()) return false;
      kind = 'move';
      nrm = E.worldNormal();
      axis = nrm ? 'n' : null;
    }
    const sess = E.begin();
    if (!sess) return false;
    M = { kind, sess, axis, nrm, typed: '', base: null, last: null };
    E.setInfo(tr(kind === 'move' ? '3d.edit.move' : kind === 'rotate' ? '3d.edit.rotate' : '3d.edit.scale'));
    return true;
  }
  function confirm() { if (!M) return; M = null; E.setInfo(''); }
  function cancel() {
    if (!M) return;
    M.sess.apply(X.identity());   // back to the start: the gesture's step is replaced with the original
    M = null;
    E.setInfo('');
  }
  function refresh() { if (M) { step(); st.emit('edit'); } }

  /** Keyboard while a gesture runs (capture phase, so no other command sees these keys). */
  function onKey(e) {
    if (!M) return;
    if (e.ctrlKey || e.metaKey || e.altKey) { cancel(); return; }
    e.preventDefault();
    e.stopImmediatePropagation();
    const k = e.key;
    if (k === 'Enter') confirm();
    else if (k === 'Escape') cancel();
    else if (k === 'Backspace') { M.typed = M.typed.slice(0, -1); refresh(); }
    else if (/^[0-9]$/.test(k) || (k === '.' && !M.typed.includes('.'))) { M.typed += k; refresh(); }
    else if (k === '-') { M.typed = M.typed.startsWith('-') ? M.typed.slice(1) : '-' + M.typed; refresh(); }
    else if (/^[xyz]$/i.test(k)) { const a = k.toLowerCase(); M.axis = M.axis === a ? null : a; refresh(); }
  }
  /** Pointer while a gesture runs. Returns true when it took the event. */
  function pointerMove(e) {
    if (!M) return false;
    const r = env().canvas.getBoundingClientRect();
    M.last = [e.clientX - r.left, e.clientY - r.top];
    if (!M.base) M.base = M.last.slice();
    refresh();
    return true;
  }
  function pointerDown(e) {
    if (!M) return false;
    e.preventDefault();
    if (e.button === 0) confirm();
    else if (e.button === 2) cancel();
    st.emit('edit');
    return true;
  }
  window.addEventListener('keydown', onKey, true);

  S.editmodal = { start, confirm, cancel, active, pointerMove, pointerDown };
})();
