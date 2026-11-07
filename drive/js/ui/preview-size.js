/* Slop Drive — ui/preview-size: the height of the preview in the details panel. A grip under the preview is dragged
 * down to show more of the picture (or up to show less). Arrow keys nudge it, Home or a double-click resets it. The
 * height is clamped to 120 px up to 85% of the window and saved in localStorage as { v: 1, data: { h } } (try/catch:
 * storage can be blocked). Pictures and video grow with it; other previews keep their own height. */
'use strict';
(function (DR) {
  const MIN = 120, STEP = 24, KEY = 'slop-drive.pv-height', root = document.documentElement;
  let h = null; // the height the person set, in px; null while the stylesheet's own height applies

  function stored() {
    try {
      const env = JSON.parse(localStorage.getItem(KEY) || 'null');
      const v = env && env.v === 1 && env.data ? Number(env.data.h) : NaN;
      return v > 0 ? v : null;
    } catch (e) { return null; }
  }
  function store(v) { try { localStorage.setItem(KEY, JSON.stringify({ v: 1, data: { h: v } })); } catch (e) { /* blocked: the height lasts for this visit */ } }
  const max = () => Math.max(MIN, Math.floor(innerHeight * 0.85));
  /** Clamp, apply and (optionally) save a height. */
  DR.setPvHeight = function (v, { save = true } = {}) {
    h = Math.round(Math.min(max(), Math.max(MIN, Number(v) || MIN)));
    root.style.setProperty('--pv-h', h + 'px');
    root.classList.add('pv-sized');
    if (save) store(h);
    return h;
  };
  /** Forget the height: the previews go back to their own size. */
  DR.resetPvHeight = function () {
    h = null;
    root.classList.remove('pv-sized');
    root.style.removeProperty('--pv-h');
    try { localStorage.removeItem(KEY); } catch (e) { /* nothing to remove */ }
  };
  /** The grip element put under a preview by ui/info.js. */
  DR.pvGrip = () => {
    const g = document.createElement('div');
    g.className = 'pv-grip';
    g.setAttribute('role', 'separator');
    g.setAttribute('aria-orientation', 'horizontal');
    g.setAttribute('aria-label', DR.t('drive.info.resize_pv'));
    g.setAttribute('tabindex', '0');
    g.title = DR.t('drive.info.resize_pv_tip');
    return g;
  };
  /** Pointer drag on any grip in the details panel (touch-action: none, a 44 px band for a finger: drive/css/preview-size.css). */
  document.addEventListener('pointerdown', (e) => {
    const g = e.target.closest && e.target.closest('#info .pv-grip');
    if (!g || e.button !== 0) return;
    e.preventDefault(); g.focus({ preventScroll: true });
    try { g.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
    const pv = g.previousElementSibling;
    const start = e.clientY, base = h != null ? h : (pv ? Math.round(pv.getBoundingClientRect().height) : MIN);
    document.body.classList.add('resizing');
    const move = (ev) => DR.setPvHeight(base + ev.clientY - start, { save: false });
    const up = () => {
      g.removeEventListener('pointermove', move); document.body.classList.remove('resizing');
      if (h != null) store(h);
    };
    g.addEventListener('pointermove', move);
    g.addEventListener('pointerup', up, { once: true });
    g.addEventListener('pointercancel', up, { once: true });
  });
  document.addEventListener('dblclick', (e) => { if (e.target.closest && e.target.closest('#info .pv-grip')) DR.resetPvHeight(); });
  document.addEventListener('keydown', (e) => {
    const g = e.target.closest && e.target.closest('#info .pv-grip');
    if (!g || !['ArrowUp', 'ArrowDown', 'Home'].includes(e.key)) return;
    e.preventDefault(); e.stopPropagation(); // the arrows resize here, not move the file focus
    if (e.key === 'Home') return DR.resetPvHeight();
    const pv = g.previousElementSibling;
    const cur = h != null ? h : (pv ? Math.round(pv.getBoundingClientRect().height) : MIN);
    DR.setPvHeight(cur + (e.key === 'ArrowDown' ? STEP : -STEP));
  });
  const s = stored();
  if (s) DR.setPvHeight(s, { save: false });
})(window.DR);
