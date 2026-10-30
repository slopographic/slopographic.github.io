/* Slop Upscale: the before and after slider. The "before" picture sits underneath, the "after" on top and is clipped
 * at the divider. Pointer capture drags it (mouse, pen, touch), so a drag keeps working when the pointer leaves the
 * picture; the handle is a focusable slider for the keyboard (arrows, Shift for 10, Home, End). Classic script; adds
 * SlopUpscale.slider.
 *   show(box, before, after)   before, after: <img>, <canvas> or <video> elements of the same aspect ratio
 *   Replaces the content of box. Calling show again replaces the previous comparison. */
(function (g) {
  'use strict';
  const U = (g.SlopUpscale = g.SlopUpscale || {}), SL = (U.slider = {});
  const clamp = (v) => Math.min(100, Math.max(0, v)), t = (k, v) => (U.t ? U.t(k, v) : k);
  const KEYS = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -10, PageUp: 10 };

  SL.show = function (box, before, after) {
    const cmp = el('div', 'up-cmp');
    const divider = el('div', 'up-divider');
    const handle = el('div', 'up-handle');
    const afterLayer = layer('up-after', after, 'false');
    let pos = 50;

    const setPos = (p) => {
      pos = clamp(Math.round(p * 10) / 10);
      afterLayer.style.clipPath = `inset(0 0 0 ${pos}%)`;
      divider.style.left = handle.style.left = pos + '%';
      handle.setAttribute('aria-valuenow', String(Math.round(pos)));
      handle.setAttribute('aria-valuetext', t('upscale.stage.slider_value', { a: Math.round(pos), b: Math.round(100 - pos) }));
    };
    const fromPointer = (e) => {
      const r = cmp.getBoundingClientRect();
      return r.width ? ((e.clientX - r.left) / r.width) * 100 : pos;
    };

    handle.tabIndex = 0;
    handle.setAttribute('role', 'slider');
    handle.setAttribute('aria-label', t('upscale.stage.slider'));
    handle.setAttribute('aria-valuemin', '0');
    handle.setAttribute('aria-valuemax', '100');

    // touch-ok: .up-cmp has touch-action: pan-y (upscale.css): a sideways finger drags the divider, an upright one scrolls the page
    cmp.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault(); // no text or image selection while dragging
      try { cmp.setPointerCapture(e.pointerId); } catch (err) { /* the pointer already ended */ }
      cmp.classList.add('up-drag');
      handle.focus({ preventScroll: true });
      setPos(fromPointer(e));
    });
    cmp.addEventListener('pointermove', (e) => {
      if (cmp.hasPointerCapture(e.pointerId)) setPos(fromPointer(e));
    });
    const end = (e) => {
      if (cmp.hasPointerCapture(e.pointerId)) cmp.releasePointerCapture(e.pointerId);
      cmp.classList.remove('up-drag');
    };
    cmp.addEventListener('pointerup', end);
    cmp.addEventListener('pointercancel', end);
    cmp.addEventListener('lostpointercapture', () => cmp.classList.remove('up-drag'));
    cmp.addEventListener('dragstart', (e) => e.preventDefault());

    handle.addEventListener('keydown', (e) => {
      const step = KEYS[e.key];
      if (step !== undefined) { e.preventDefault(); setPos(pos + (e.shiftKey && Math.abs(step) === 1 ? step * 10 : step)); }
      else if (e.key === 'Home') { e.preventDefault(); setPos(0); }
      else if (e.key === 'End') { e.preventDefault(); setPos(100); }
    });

    cmp.append(layer('up-before', before, 'true'), afterLayer, divider, handle,
      labelFor(t('upscale.stage.before'), 'up-tag-before'), labelFor(t('upscale.stage.after'), 'up-tag-after'));
    box.replaceChildren(cmp);
    setPos(50);
  };

  function el(tag, cls) {
    const d = document.createElement(tag);
    d.className = cls;
    return d;
  }
  function layer(cls, media, hidden) {
    const d = el('div', 'up-layer ' + cls);
    media.setAttribute('aria-hidden', hidden);
    media.draggable = false;
    d.append(media);
    return d;
  }
  function labelFor(text, cls) {
    const s = el('span', 'up-tag ' + cls);
    s.textContent = text;
    return s;
  }
})(typeof window !== 'undefined' ? window : globalThis);
