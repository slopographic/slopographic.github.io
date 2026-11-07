/* Slop Drive — ui/info-width: the details panel's width. A grip on its left edge resizes it: drag it, or focus it and
 * use the arrow keys (Home and End for the limits), or double-click it to reset. The width is clamped to 260 px up to
 * 60% of the window and remembered in localStorage (try/catch: storage can be blocked). Under 300 px the panel
 * collapses to a narrow rail. On a phone the panel stays a bottom sheet and the grip is only its handle. */
'use strict';
(function (DR) {
  const MIN = 260, DEFAULT = 300, RAIL = 300, RAIL_W = 56, STEP = 16, KEY = 'slop-drive.info-width';
  const root = document.documentElement;
  let shown = null; // the width the person set, in px; null while the stylesheet's default applies

  function stored() { try { const v = parseFloat(localStorage.getItem(KEY)); return v > 0 ? v : null; } catch (e) { return null; } }
  function store(v) { try { localStorage.setItem(KEY, String(v)); } catch (e) { /* blocked: the width lasts for this visit */ } }
  /** 60% of the window, and never less than 260 px. */
  DR.infoMax = () => Math.max(MIN, Math.floor(innerWidth * 0.6));
  /** Clamp and apply a width. save: false while dragging, so the value is stored once on release. */
  DR.setInfoWidth = function (w, { save = true } = {}) {
    shown = Math.round(Math.min(DR.infoMax(), Math.max(MIN, Number(w) || DEFAULT)));
    root.style.setProperty('--info-w', shown + 'px');
    if (save) store(shown);
    paint();
    return shown;
  };
  /** Re-clamp after the window changes size. */
  DR.clampInfoWidth = () => { if (shown != null) DR.setInfoWidth(shown, { save: false }); };
  /** The rail: under 300 px the panel narrows to a strip, and its content is hidden by CSS. Never on a phone. */
  function paint() {
    const info = DR.$('info'), grip = DR.$('infoGrip');
    const rail = shown != null && shown < RAIL && !DR.isMobile();
    if (info) { info.classList.toggle('rail', rail); info.style.setProperty('--rail-w', RAIL_W + 'px'); }
    if (grip) {
      grip.setAttribute('aria-valuemin', String(MIN));
      grip.setAttribute('aria-valuemax', String(DR.infoMax()));
      grip.setAttribute('aria-valuenow', String(shown != null ? shown : DEFAULT));
      grip.setAttribute('aria-label', DR.t(rail ? 'drive.info.rail_label' : 'drive.info.resize_panel'));
    }
  }
  function nudge(key) {
    const info = DR.$('info');
    const cur = shown != null ? shown : Math.round(info ? info.getBoundingClientRect().width : DEFAULT);
    if (key === 'Home') DR.setInfoWidth(MIN);
    else if (key === 'End') DR.setInfoWidth(DR.infoMax());
    else if (key === 'ArrowLeft') DR.setInfoWidth(shown != null && shown < RAIL ? DEFAULT : cur + STEP);
    else if (key === 'ArrowRight') DR.setInfoWidth(cur - STEP);
  }
  // The grip has touch-action: none and a 44 px hit area for a finger (drive/css/panels.css).
  function wire(grip) {
    grip.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || DR.isMobile()) return;
      e.preventDefault(); grip.focus({ preventScroll: true });
      try { grip.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
      document.body.classList.add('resizing');
      const move = (ev) => DR.setInfoWidth(innerWidth - ev.clientX, { save: false });
      const up = () => {
        grip.removeEventListener('pointermove', move); document.body.classList.remove('resizing');
        if (shown != null) store(shown);
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up, { once: true });
      grip.addEventListener('pointercancel', up, { once: true });
    });
    grip.addEventListener('dblclick', () => DR.setInfoWidth(DEFAULT));
    grip.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation(); // the arrows resize here, not move the file focus
      nudge(e.key);
    });
  }
  const s = stored();
  if (s) DR.setInfoWidth(s, { save: false });
  const grip = DR.$('infoGrip');
  if (grip) { wire(grip); paint(); DR.onLang(paint); }
})(window.DR);
