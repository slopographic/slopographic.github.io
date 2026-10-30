/* PhotoSlop: view rotation. The whole viewport turns about its centre. It is a view setting only: the
 * document, the export and the undo history never see it. V.ox, V.oy and V.zoom stay in unrotated view
 * space, so the overlays keep drawing with them and draw() rotates the context (rotateCtx). Pointer input is
 * mapped back once, here (viewLocal, viewPt, viewDelta), and toDoc, the tools' hit tests and the selections
 * all go through that mapping. Loaded after view.js (its functions run on input, after boot). */
'use strict';

V.rot = 0; // degrees, -180 to 180 (view only)

const rotNorm = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const rotRad = () => (V.rot * Math.PI) / 180;
/** Canvas rotate(a) of the point (x, y) about the origin. */
function rotXY(x, y, a) { const c = Math.cos(a), s = Math.sin(a); return { x: x * c - y * s, y: x * s + y * c }; }
/** A viewport point (CSS px, relative to the viewport) → unrotated view space, where V.ox, V.oy and the zoom apply. */
function viewPt(x, y) {
  const p = rotXY(x - V.W / 2, y - V.H / 2, -rotRad());
  return { x: p.x + V.W / 2, y: p.y + V.H / 2 };
}
/** Unrotated view space → a viewport point (for DOM placed over the canvas, and for the rotated overlays). */
function hostPt(x, y) {
  const p = rotXY(x - V.W / 2, y - V.H / 2, rotRad());
  return { x: p.x + V.W / 2, y: p.y + V.H / 2 };
}
/** A pointer event → unrotated view space. Replaces "clientX minus the viewport's left". */
function viewLocal(e) {
  const r = V.el.getBoundingClientRect();
  return viewPt(e.clientX - r.left, e.clientY - r.top);
}
/** A move on screen (dx, dy) → the same move in unrotated view space (pans and wheel scrolls). */
function viewDelta(dx, dy) { return rotXY(dx, dy, -rotRad()); }
/** Applies the rotation to a 2D context that is already at device-pixel scale. Call before drawing the view. */
function rotateCtx(g) {
  if (!V.rot) return;
  g.translate(V.W / 2, V.H / 2); g.rotate(rotRad()); g.translate(-V.W / 2, -V.H / 2);
}
/** Rulers are axis-aligned bands along the screen edges with ticks from the unrotated view, so they show only at 0°. */
const rulersShown = () => !!GUIDE_PREFS.rulers && !V.rot;

/** Sets the angle (the slider): clamped to -180..180. */
function setRotation(deg) {
  V.rot = clamp(Math.round(deg), -180, 180);
  emit('zoom'); dirty();
}
/** Turns the view by a step (View ▸ Rotate Left/Right and the toolbar buttons). */
function rotateView(step) {
  V.rot = rotNorm(V.rot + step);
  emit('zoom'); dirty();
}
/** Back to the defaults: no rotation, the page fitted and centred (the same as opening a document). */
function resetView() {
  V.rot = 0;
  fitView(true);
  emit('zoom'); dirty();
}

/** The viewport toolbar: a strip above the canvas with rotate left and right, the slider, the angle and Reset View. */
function buildViewBar() {
  const bar = h('div', { class: 'view-bar', role: 'toolbar', 'aria-label': tr('photoslop.view.rotation'), 'data-i18n-attr': 'aria-label:photoslop.view.rotation' });
  const btn = (label, k, act, lk) => { const title = tr(k), b = h('button', { type: 'button', class: 'vb-btn', title, 'aria-label': title, 'data-i18n-attr': 'title:' + k + ';aria-label:' + k, 'data-i18n': lk }, lk ? tr(lk) : label); b.addEventListener('click', act); return b; };
  const slider = h('input', { type: 'range', class: 'vb-slider', min: -180, max: 180, step: 1, title: tr('photoslop.view.rotation'), 'aria-label': tr('photoslop.view.rotation'), 'data-i18n-attr': 'title:photoslop.view.rotation;aria-label:photoslop.view.rotation' });
  const num = h('span', { class: 'vb-angle', 'aria-live': 'off' });
  slider.addEventListener('input', () => setRotation(+slider.value));
  bar.append(
    btn('⟲', 'photoslop.view.rotate_left', () => rotateView(-90)),
    btn('⟳', 'photoslop.view.rotate_right', () => rotateView(90)),
    slider, num,
    btn('', 'photoslop.view.reset_tip', () => resetView(), 'photoslop.view.reset'));
  // The bar sits outside the viewport, so a press on it never starts a stroke or a pan.
  const sync = () => { slider.value = Math.round(V.rot); num.textContent = Math.round(V.rot) + '°'; };
  listeners.add((w) => { if (w === 'zoom') sync(); });
  sync();
  return bar;
}
