/* Slop 3D move gizmo: three coloured arrows (X red, Y green, Z blue) at the selection's origin, drawn on top of
 * the scene. It stays the same size on screen (the viewport scales it by camera distance). The hit test returns the
 * axis under the pointer; the viewport does the dragging. Sets window.Slop3D.gizmo. */
(function () {
  'use strict';
  const S = (window.Slop3D = window.Slop3D || {});
  const COLORS = { x: 0xff5a5a, y: 0x5fd068, z: 0x5b9bff };
  const ACTIVE = 0xffd23a;

  function create(THREE, overlay) {
    const root = new THREE.Group();
    root.name = 'gizmo';
    root.visible = false;
    overlay.add(root);
    const handles = {}, hitObjs = [], mats = {};
    for (const k of ['x', 'y', 'z']) {
      const mat = new THREE.MeshBasicMaterial({ color: COLORS[k], depthTest: false, transparent: true, opacity: 0.95 });
      mats[k] = mat;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 10), mat);
      shaft.position.y = 0.5;
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 14), mat);
      head.position.y = 1.11;
      const g = new THREE.Group();
      g.add(shaft, head);
      if (k === 'x') g.rotation.z = -Math.PI / 2;
      if (k === 'z') g.rotation.x = Math.PI / 2;
      shaft.userData.axis = head.userData.axis = k;
      handles[k] = g;
      root.add(g);
      hitObjs.push(shaft, head);
    }
    /** Puts the gizmo at pos (world) with a screen-constant scale, or hides it when on is false. */
    function place(pos, scale, on = true) {
      root.visible = on;
      if (!on) return;
      root.position.set(pos[0], pos[1], pos[2]);
      root.scale.setScalar(scale);
    }
    /** The axis ('x' | 'y' | 'z') under ndc, or null. */
    function hit(ndc, camera) {
      if (!root.visible) return null;
      const rc = new THREE.Raycaster();
      rc.setFromCamera(ndc, camera);
      const h = rc.intersectObjects(hitObjs, false)[0];
      return h ? h.object.userData.axis : null;
    }
    /** Colours the active axis yellow while dragging (pass null to reset). */
    function highlight(axis) {
      for (const k of ['x', 'y', 'z']) mats[k].color.setHex(k === axis ? ACTIVE : COLORS[k]);
    }
    const dirOf = (k) => (k === 'x' ? [1, 0, 0] : k === 'y' ? [0, 1, 0] : [0, 0, 1]);
    return { root, place, hit, highlight, dirOf, get visible() { return root.visible; } };
  }

  S.gizmo = { create, COLORS };
})();
