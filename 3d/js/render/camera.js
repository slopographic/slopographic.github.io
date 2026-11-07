/* Slop 3D camera: orbit, pan, zoom, frame and the numbered views. The camera sits on a sphere around `target`
 * (yaw and pitch in radians, dist in scene units). Input methods only change state; apply() moves the camera.
 * Sets window.Slop3D.camera. */
(function () {
  'use strict';
  const S = (window.Slop3D = window.Slop3D || {});
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const VIEWS = {
    front: { yaw: 0, pitch: 0 },
    side: { yaw: Math.PI / 2, pitch: 0 },
    top: { yaw: 0, pitch: Math.PI / 2 - 0.0005 },
    perspective: { yaw: 0.7, pitch: 0.5 },
  };
  const VIEW_KEYS = ['perspective', 'front', 'top', 'side'];

  function create(THREE, stage) {
    const cam = stage.camera;
    const st = { target: new THREE.Vector3(0, 0.5, 0), yaw: VIEWS.perspective.yaw, pitch: VIEWS.perspective.pitch, dist: 9, view: 'perspective' };
    let moving = false;
    const tmp = new THREE.Vector3();

    function apply() {
      const cp = Math.cos(st.pitch);
      cam.position.set(st.target.x + st.dist * cp * Math.sin(st.yaw), st.target.y + st.dist * Math.sin(st.pitch), st.target.z + st.dist * cp * Math.cos(st.yaw));
      cam.lookAt(st.target);
      cam.updateMatrixWorld();
    }
    /** Rotates around the target. dx, dy are pixels. */
    function orbit(dx, dy) { st.yaw -= dx * 0.008; st.pitch = clamp(st.pitch + dy * 0.008, -1.5607, 1.5607); st.view = null; }
    /** Slides the target across the screen. dx, dy are pixels. */
    function pan(dx, dy) {
      const k = 2 * st.dist * Math.tan(cam.fov * Math.PI / 360) / Math.max(1, stage.size.h); // world units per pixel
      tmp.setFromMatrixColumn(cam.matrixWorld, 0).multiplyScalar(-dx * k);
      st.target.add(tmp);
      tmp.setFromMatrixColumn(cam.matrixWorld, 1).multiplyScalar(dy * k);
      st.target.add(tmp);
    }
    /** Zooms by a wheel delta (positive = away). */
    function zoom(delta) { st.dist = clamp(st.dist * Math.exp(delta * 0.0012), 0.05, 4000); }
    /** Centres on a world box { min, max } (or a point with radius). Keeps the current angle. */
    function frame(box) {
      if (!box) return;
      const c = [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2];
      const r = Math.max(0.2, Math.hypot(box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]) / 2);
      st.target.set(c[0], c[1], c[2]);
      st.dist = clamp(r / Math.sin((cam.fov * Math.PI / 180) / 2) * 1.15, 0.2, 4000);
    }
    /** Switches to a named view: front, side, top or perspective. */
    function setView(name) {
      const v = VIEWS[name];
      if (!v) return false;
      st.yaw = v.yaw; st.pitch = v.pitch; st.view = name;
      return true;
    }
    const viewIndex = (name) => VIEW_KEYS.indexOf(name) + 1;
    return { st, apply, orbit, pan, zoom, frame, setView, viewIndex, VIEW_KEYS, VIEWS, setMoving(v) { moving = v; }, get moving() { return moving; } };
  }

  S.camera = { create, VIEWS, VIEW_KEYS };
})();
