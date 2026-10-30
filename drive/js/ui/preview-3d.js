/* Slop Drive — ui/preview-3d: the live 3D preview of a .s3d file (Quick look and the details panel), with the same
 * renderer, objects and camera as Slop 3D (core/render3d.js). Drag to orbit, Shift- or right-drag to pan, wheel to zoom,
 * and Reset view frames the scene again. A WebGL context is limited by the browser, so a preview releases its context
 * when it leaves the page (a sweep), and the oldest one gives way when more than MAX_LIVE are open. */
'use strict';
(function (DR) {
  const el = DR.el, MAX_LIVE = 4;
  const live = new Set();
  let sweeper = 0;
  function release(p, note) {
    if (p.done) return;
    p.done = true; live.delete(p);
    p.stage.renderer.dispose(); p.stage.renderer.forceContextLoss();
    if (note && p.box.isConnected) p.box.replaceChildren(el('p', { class: 'pv-note' }, note));
  }
  function sweep() {
    for (const p of [...live]) if (!p.box.isConnected) release(p);
    if (!live.size) { clearInterval(sweeper); sweeper = 0; }
  }
  function track(p) {
    live.add(p);
    while (live.size > MAX_LIVE) release([...live][0], DR.t('drive.pv.paused3d'));
    if (!sweeper) sweeper = setInterval(sweep, 1000);
  }
  /** A 3D preview element for a .s3d file. big: the Quick look size. */
  DR.preview3d = function (r, big = false) {
    if (!DR.webgl3d()) return DR.cardPreview(r, DR.t('drive.pv.no_webgl'));
    const box = el('div', { class: 'pv3d' + (big ? ' big' : '') }, el('p', { class: 'pv-note' }, DR.t('drive.pv.loading3d')));
    DR.load3d().then(async ({ THREE, S }) => {
      if (!box.isConnected) return;
      const scene = await DR.scene3d(r.blob);
      const canvas = el('canvas', { class: 'pv3d-cv', role: 'img', 'aria-label': DR.t('drive.pv.view3d_of', { name: r.name }) });
      const reset = el('button', { type: 'button', class: 'btn pv3d-reset', title: DR.t('drive.pv.reset_tip') }, DR.t('drive.pv.reset'));
      box.replaceChildren(canvas, reset, el('p', { class: 'pv3d-hint' }, DR.t('drive.pv.hint3d')));
      const stage = S.stage.create(canvas, THREE), cam = S.camera.create(THREE, stage);
      S.objects.create(THREE, stage.world, stage.request).sync(scene, { selected: [] });
      const frame = () => { cam.setView('perspective'); cam.frame(S.ops.bounds(scene, null)); stage.request(); };
      frame();
      stage.setOnFrame(() => cam.apply());
      reset.addEventListener('click', frame);
      let drag = null;
      canvas.addEventListener('pointerdown', (e) => {
        drag = { x: e.clientX, y: e.clientY, pan: e.shiftKey || e.button !== 0 };
        canvas.setPointerCapture(e.pointerId); cam.setMoving(true); canvas.classList.add('grabbing');
      });
      canvas.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        drag.x = e.clientX; drag.y = e.clientY;
        if (drag.pan) cam.pan(dx, dy); else cam.orbit(dx, dy);
        stage.request();
      });
      const up = () => { drag = null; cam.setMoving(false); canvas.classList.remove('grabbing'); };
      canvas.addEventListener('pointerup', up);
      canvas.addEventListener('pointercancel', up);
      canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.zoom(e.deltaY); stage.request(); }, { passive: false });
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      // Touch (shared/input): a drag orbits, never scrolls; two fingers pinch to zoom (the camera's dist × 1/scale) and pan.
      canvas.setAttribute('data-touch-surface', '');
      canvas.touchSurface = { zoom(k) { cam.zoom(-Math.log(k) / 0.0012); stage.request(); }, pan(dx, dy) { cam.pan(dx, dy); stage.request(); } };
      const p = { box, stage, cam, done: false };
      box.s3dView = p; // the tests read the camera through this
      track(p);
      stage.request();
    }).catch((err) => {
      console.error('Slop Drive: the 3D view could not be opened', err);
      if (box.isConnected) box.replaceChildren(el('p', { class: 'pv-note' }, DR.t('drive.pv.open3d_failed', { msg: err.message })));
    });
    return box;
  };
})(window.DR);
