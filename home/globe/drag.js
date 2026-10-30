/* The app globe's drag (home/globe/globe.js): a mouse, pen or finger on the globe turns it with the pointer, and a fling
 * slows back to the idle turn. Vertical swipes still scroll the page (touch-action: pan-y on the globe); a drag is never
 * a click; a finger pressing an icon shows its name. Classic script, after globe.js. Sets SlopGlobe.dragging(). */
(function () {
  'use strict';
  const api = window.SlopGlobe, D = api && api._drag;
  if (!D) return;
  let drag = null, moved = 0;
  api.dragging = () => !!drag && moved >= 6;
  D.layer.addEventListener('pointerdown', (e) => {
    if (D.still() || e.button > 0) return;
    drag = { x: e.clientX, y: e.clientY, t: performance.now(), vel: 0, id: e.pointerId };
    moved = 0;
    if (e.pointerType !== 'mouse') D.focusAt(e.target);
  });
  addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const now = performance.now(), dx = e.clientX - drag.x, dy = e.clientY - drag.y, dt = Math.max(1, now - drag.t), r = D.radius();
    moved += Math.abs(dx) + Math.abs(dy);
    if (moved < 6) return;
    D.turn(dy / r / 2, dx / r);
    drag.vel = drag.vel * 0.6 + (dx / r / dt) * 0.4;
    Object.assign(drag, { x: e.clientX, y: e.clientY, t: now });
  }, { passive: true });
  const release = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (moved >= 6) D.fling(drag.vel);
    drag = null;
  };
  addEventListener('pointerup', release);
  addEventListener('pointercancel', release);
  D.layer.addEventListener('click', (e) => { if (moved >= 6) { e.preventDefault(); moved = 0; } }, true);
})();
