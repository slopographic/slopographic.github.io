/* Slop Music: the full-track waveform on a canvas, drawn from the cached peaks. Click or drag to seek.
 * Exposes window.SlopMusic.wave = { draw(canvas, peaks, progress), attach(canvas, onSeek) }. */
(function () {
  'use strict';
  const M = (window.SlopMusic = window.SlopMusic || {});
  const BAR = 3;
  function colours(canvas) {
    const cs = getComputedStyle(canvas);
    return { on: cs.getPropertyValue('--mu-accent').trim() || '#d4ff3a', off: cs.getPropertyValue('--mu-line').trim() || '#3d3d3d' };
  }
  /** Draws one bar per 3 px. Bars before progress (0 to 1) use the accent colour. Without peaks: a flat line. */
  function draw(canvas, peaks, progress) {
    const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const c = colours(canvas), bars = Math.max(1, Math.floor(w / BAR)), n = peaks ? peaks.length : 0;
    for (let i = 0; i < bars; i++) {
      const v = n ? peaks[Math.floor((i * n) / bars)] : 0.04;
      const bh = Math.max(2, v * h * 0.92);
      g.fillStyle = (i + 0.5) / bars <= (progress || 0) ? c.on : c.off;
      g.fillRect(i * BAR, (h - bh) / 2, BAR - 1, bh);
    }
  }
  /** Pointer seek: onSeek receives a fraction 0 to 1 of the track. */
  function attach(canvas, onSeek) {
    const at = (e) => { const r = canvas.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); };
    canvas.setAttribute('data-touch-surface', ''); // a finger scrubs the track, never scrolls the page (shared/input)
    canvas.addEventListener('pointerdown', (e) => { try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* a synthetic pointer */ } onSeek(at(e)); });
    canvas.addEventListener('pointermove', (e) => { if (e.buttons & 1) onSeek(at(e)); });
  }
  M.wave = { draw, attach };
})();
