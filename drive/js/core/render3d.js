/* Slop Drive — core/render3d: the Slop 3D renderer for Drive. Nothing is copied: the 3D sources (3d/js/core and
 * 3d/js/render) and the vendored three.js (vendor/three) load on first use, from this repository, and nothing is uploaded.
 * DR.load3d() → { THREE, S }. DR.scene3d(blob) → the parsed scene. DR.snapshot3d(blob, w, h) → a PNG Blob of the scene from
 * the 3D app's default perspective camera, framed on the scene and drawn offscreen. DR.webgl3d() → true when WebGL exists. */
'use strict';
(function (DR) {
  const CORE = ['core/xform.js', 'core/snap.js', 'core/geometry.js', 'core/blob.js', 'core/model.js', 'core/ops.js', 'core/format.js',
    'render/stage.js', 'render/camera.js', 'render/objects.js'];
  DR.webgl3d = function () {
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
  };
  const script = (src) => new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.async = false;
    s.onload = () => res();
    s.onerror = () => rej(new Error('could not load ' + src));
    document.head.append(s);
  });
  let loading = null;
  /** Loads the 3D sources once. Resolves with the three.js namespace and the Slop3D namespace. */
  DR.load3d = function () {
    if (!loading) loading = (async () => {
      const base = new URL('../3d/js/', document.baseURI).href;
      for (const f of CORE) await script(base + f);
      const S = window.Slop3D, THREE = await S.stage.loadThree();
      return { THREE, S };
    })().catch((e) => { loading = null; throw e; });
    return loading;
  };
  /** The scene in a .s3d blob. Throws with the first problem when the file is not a valid scene. */
  DR.scene3d = async function (blob) {
    const { S } = await DR.load3d();
    const res = S.format.parse(await blob.text());
    if (!res.ok) throw new Error(res.errors[0] || 'not a 3D scene');
    return res.scene;
  };
  /** A picture of the scene, drawn offscreen with the default perspective camera (framed on the whole scene). */
  DR.snapshot3d = async function (blob, w = 320, h = 240) {
    const { THREE, S } = await DR.load3d(), scene = await DR.scene3d(blob);
    const canvas = document.createElement('canvas');
    // The canvas is attached (off screen) so the stage can measure it; it is removed again below.
    Object.assign(canvas.style, { position: 'fixed', left: '-10000px', top: '0', width: w + 'px', height: h + 'px', pointerEvents: 'none' });
    document.body.append(canvas);
    let stage = null;
    try {
      stage = S.stage.create(canvas, THREE);
      S.objects.create(THREE, stage.world, () => {}).sync(scene, { selected: [] });
      const cam = S.camera.create(THREE, stage);
      cam.setView('perspective');
      cam.frame(S.ops.bounds(scene, null));
      cam.apply();
      stage.resize();
      return await stage.capture(1);
    } finally {
      if (stage) { stage.renderer.dispose(); stage.renderer.forceContextLoss(); }
      canvas.remove();
    }
  };
})(window.DR);
