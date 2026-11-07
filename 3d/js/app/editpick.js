/* Slop 3D element picking in mesh edit mode. A click picks the nearest vertex, edge or face of the edited mesh
 * (Shift adds, Ctrl toggles, Alt on an edge selects its loop). A drag from empty space draws a box (Shift adds, Ctrl
 * removes). Vertices and edges are picked by their screen position; faces by the triangle under the pointer.
 * Sets window.Slop3D.editpick. */
(function () {
  'use strict';
  const S = (window.Slop3D = window.Slop3D || {});
  const E = S.edit, SEL = S.meshsel, MR = S.meshrender;
  const PICK_PX = 9, DRAG_PX = 4;
  let drag = null, rect = null;

  /** Screen position of every vertex (px, relative to the canvas), or null when behind the camera. */
  function screenPoints(env, id, m) {
    const it = env.objects.items.get(id);
    if (!it) return [];
    it.obj.updateWorldMatrix(true, false);
    const r = env.canvas.getBoundingClientRect(), v = new env.THREE.Vector3();
    return m.pos.map((p) => {
      v.set(p[0], p[1], p[2]).applyMatrix4(it.obj.matrixWorld).project(env.stage.camera);
      return v.z < -1 || v.z > 1 ? null : [(v.x + 1) / 2 * r.width, (1 - v.y) / 2 * r.height];
    });
  }
  /** The face under the pointer (through the object's triangles), or null. */
  function faceAt(env, e, id) {
    const it = env.objects.items.get(id);
    if (!it || !it.mesh) return null;
    const r = env.canvas.getBoundingClientRect(), T = env.THREE;
    const rc = new T.Raycaster();
    rc.setFromCamera(new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), env.stage.camera);
    const hit = rc.intersectObject(it.mesh, false)[0];
    if (!hit) return null;
    const tf = MR.build(E.node().geom).triFace;
    return tf[hit.faceIndex] !== undefined ? tf[hit.faceIndex] : null;
  }
  function rectEl(canvas) {
    if (!rect) {
      rect = document.createElement('div');
      rect.setAttribute('aria-hidden', 'true');
      rect.style.cssText = 'position:absolute;pointer-events:none;border:1px dashed #ffb020;background:rgba(255,176,32,.12);display:none;';
      canvas.parentElement.appendChild(rect);
    }
    return rect;
  }
  const hideRect = () => { if (rect) rect.style.display = 'none'; };
  const howOf = (e) => (e.ctrlKey || e.metaKey ? 'toggle' : e.shiftKey ? 'add' : 'replace');

  /** Pointer down in edit mode. Returns true when it took the event. */
  function down(e, env) {
    if (e.button !== 0 || !E.active()) return false;
    const r = env.canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const id = E.node().id, m = E.mesh(), mode = E.mode(), how = howOf(e);
    let hit = null;
    if (mode === 'vertex') hit = SEL.nearestVertex(screenPoints(env, id, m), SEL.elements(m, 'vertex'), x, y, PICK_PX);
    else if (mode === 'edge') hit = SEL.nearestEdge(screenPoints(env, id, m), SEL.elements(m, 'edge'), x, y, PICK_PX);
    else hit = faceAt(env, e, id);
    if (hit !== null && hit !== undefined) {
      if (mode === 'edge' && e.altKey) E.loopSelect([hit], how);
      else E.setSelection([hit], how);
      return true;
    }
    drag = { x0: x, y0: y, x: x, y: y, moved: false, how: e.ctrlKey || e.metaKey ? 'sub' : e.shiftKey ? 'add' : 'replace', env, id, mode };
    return true;
  }
  /** Pointer move during a box drag. Returns true when it took the event. */
  function move(e) {
    if (!drag) return false;
    const r = drag.env.canvas.getBoundingClientRect();
    drag.x = e.clientX - r.left;
    drag.y = e.clientY - r.top;
    if (!drag.moved && Math.hypot(drag.x - drag.x0, drag.y - drag.y0) < DRAG_PX) return true;
    drag.moved = true;
    const el = rectEl(drag.env.canvas), host = drag.env.canvas;
    el.style.display = 'block';
    el.style.left = host.offsetLeft + Math.min(drag.x0, drag.x) + 'px';
    el.style.top = host.offsetTop + Math.min(drag.y0, drag.y) + 'px';
    el.style.width = Math.abs(drag.x - drag.x0) + 'px';
    el.style.height = Math.abs(drag.y - drag.y0) + 'px';
    return true;
  }
  /** Pointer up: finishes a box (or a click on empty space, which clears the selection). */
  function up() {
    if (!drag) return false;
    const d = drag;
    drag = null;
    hideRect();
    if (!E.active()) return true;
    if (!d.moved) { if (d.how === 'replace') E.clear(); return true; }
    const box = { x0: Math.min(d.x0, d.x), x1: Math.max(d.x0, d.x), y0: Math.min(d.y0, d.y), y1: Math.max(d.y0, d.y) };
    const m = E.mesh();
    E.setSelection(SEL.inBox(m, d.mode, screenPoints(d.env, d.id, m), box), d.how);
    return true;
  }
  const dragging = () => !!drag;

  S.editpick = { down, move, up, dragging, screenPoints };
})();
