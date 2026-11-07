/* Slop Image to 3D: orbit camera controls with no three.js dependency (vendor/three has no OrbitControls).
 * Left drag orbits, right or middle drag (or Shift + drag) pans, the wheel zooms, a double click frames the model.
 * Touch (shared/input): the element is a touch surface; one finger orbits, two fingers pinch-zoom and pan, a double tap frames.
 * new Orbit(element, onChange): apply(camera) places a three.js camera; frame({ center, radius }) fits the model.
 * Sets window.SlopImg3D.Orbit. */
(function (root) {
  'use strict';
  const ns = (root.SlopImg3D = root.SlopImg3D || {});
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function Orbit(el, onChange) {
    this.theta = 0.35; this.phi = 1.25; this.radius = 3; this.target = [0, 0, 0];
    this.el = el; this.onChange = onChange || (() => {}); this.drag = null;
    el.style.touchAction = 'none';
    el.setAttribute('data-touch-surface', '');
    el.touchSurface = { zoom: (s) => { this.radius = clamp(this.radius / s, 0.05, 200); this.onChange(); }, pan: (dx, dy) => { this.pan(dx, dy); this.onChange(); } };
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      const pan = e.button === 1 || e.button === 2 || e.shiftKey;
      this.drag = { x: e.clientX, y: e.clientY, pan };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      this.drag.x = e.clientX; this.drag.y = e.clientY;
      if (this.drag.pan) this.pan(dx, dy);
      else { this.theta -= dx * 0.008; this.phi = clamp(this.phi - dy * 0.008, 0.05, Math.PI - 0.05); }
      this.onChange();
    });
    const end = () => { this.drag = null; };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.radius = clamp(this.radius * Math.exp(e.deltaY * 0.001), 0.05, 200); this.onChange(); }, { passive: false });
  }
  Orbit.prototype.eye = function () {
    const s = Math.sin(this.phi);
    return [this.target[0] + this.radius * s * Math.sin(this.theta), this.target[1] + this.radius * Math.cos(this.phi), this.target[2] + this.radius * s * Math.cos(this.theta)];
  };
  /** Pans the target in the screen plane, scaled to the distance. */
  Orbit.prototype.pan = function (dx, dy) {
    const k = this.radius * 0.0015;
    const fwd = this.eye().map((v, i) => this.target[i] - v);
    const len = Math.hypot(...fwd) || 1, f = fwd.map((v) => v / len);
    const right = [f[2], 0, -f[0]], rl = Math.hypot(...right) || 1, r = right.map((v) => v / rl);
    const up = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    for (let i = 0; i < 3; i++) this.target[i] += (-dx * r[i] + dy * up[i]) * k;
  };
  /** Sets the camera position and look-at point (three.js camera: any object with position and lookAt). */
  Orbit.prototype.apply = function (cam) {
    const e = this.eye();
    cam.position.set(e[0], e[1], e[2]);
    cam.lookAt(this.target[0], this.target[1], this.target[2]);
  };
  /** Frames a sphere: centre and radius in model units, for a vertical field of view fovDeg. */
  Orbit.prototype.frame = function (sphere, fovDeg = 40) {
    this.target = sphere.center.slice();
    this.radius = Math.max(0.2, sphere.radius / Math.sin((fovDeg * Math.PI) / 360) * 1.1);
    this.onChange();
  };

  ns.Orbit = Orbit;
})(typeof window !== 'undefined' ? window : globalThis);
