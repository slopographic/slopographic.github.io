/* Slop 3D stage: the WebGL renderer, the scene, the perspective camera and a render-on-demand loop.
 * three.js r170 is loaded from vendor/three/ (MIT, see vendor/three/LICENSE); nothing comes from a CDN.
 * loadThree() → the THREE namespace. create(canvas, THREE) → stage. Sets window.Slop3D.stage. */
(function () {
  'use strict';
  const S = (window.Slop3D = window.Slop3D || {});

  /** Loads the vendored three.js ES module (relative to this page, so it works from any host path). */
  function loadThree() {
    return import(new URL('../vendor/three/three.module.min.js', location.href).href);
  }

  /** True when this browser can create a WebGL2 context. */
  function hasWebGL() {
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
  }

  function create(canvas, THREE) {
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    } catch (e) { throw new Error(window.SlopI18n ? SlopI18n.t('3d.app.err_webgl') : 'WebGL is not available in this browser'); }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.autoClear = false;           // we clear once per frame, so the overlay pass keeps the picture
    renderer.setClearColor('#1d1e22');
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 5000);
    const world = new THREE.Group();          // every object of the document lives under here
    world.name = 'world';
    scene.add(world);
    const grid = new THREE.GridHelper(40, 40, 0x6b6e78, 0x3a3c44);
    grid.material.transparent = true;
    grid.material.opacity = 0.9;
    scene.add(grid);
    const axes = new THREE.AxesHelper(2.5);
    scene.add(axes);
    const overlay = new THREE.Scene();         // gizmo and selection boxes: drawn on top, never picked
    let dirty = true, raf = 0, onFrame = null;
    let w = 1, h = 1;

    function resize() {
      const cw = Math.max(1, canvas.clientWidth), ch = Math.max(1, canvas.clientHeight);
      if (cw === w && ch === h) return;
      w = cw; h = ch;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      dirty = true;
    }
    function draw() {
      renderer.clear();
      renderer.render(scene, camera);
      renderer.clearDepth();
      renderer.render(overlay, camera);
    }
    function loop() {
      raf = 0;
      resize();
      if (onFrame) onFrame();
      if (dirty) { dirty = false; draw(); }
    }
    /** Schedules one frame. Cheap to call often. */
    function request() {
      dirty = true;
      if (!raf) raf = requestAnimationFrame(loop);
    }
    /** Lets camera or gizmo code run before each frame (it returns true when it changed something). */
    function setOnFrame(fn) { onFrame = fn; }

    /** Nearest hit among objects (raycast against the world), as { id, point, distance } or null. */
    const ray = new THREE.Raycaster();
    function pick(ndc, camRef, objs) {
      ray.setFromCamera(ndc, camRef);
      const hit = ray.intersectObjects(objs, false)[0];
      if (!hit) return null;
      let o = hit.object;
      while (o && !(o.userData && o.userData.nodeId)) o = o.parent;
      return o ? { id: o.userData.nodeId, point: hit.point.clone(), distance: hit.distance } : null;
    }

    /** PNG of the viewport at `scale` times its CSS size (1 or 2). Resolves with a Blob. */
    function capture(scale = 1) {
      return new Promise((resolve, reject) => {
        const prev = renderer.getPixelRatio();
        renderer.setPixelRatio(scale);
        renderer.setSize(w, h, false);
        draw();
        canvas.toBlob((b) => {
          renderer.setPixelRatio(prev);
          renderer.setSize(w, h, false);
          dirty = true;
          b ? resolve(b) : reject(new Error(window.SlopI18n ? SlopI18n.t('3d.app.err_picture') : 'The picture could not be made'));
        }, 'image/png');
      });
    }

    return { renderer, scene, camera, world, grid, axes, overlay, request, setOnFrame, resize, pick, capture, THREE,
      get size() { return { w, h }; }, setBackground(hex) { renderer.setClearColor(hex); request(); },
      setGrid(on) { grid.visible = on; request(); }, setAxes(on) { axes.visible = on; request(); },
      setWireframe(on, objs) { for (const o of objs) if (o.material) o.material.wireframe = on; request(); } };
  }

  S.stage = { loadThree, hasWebGL, create };
})();
