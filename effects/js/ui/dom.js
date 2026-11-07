// Slop Effects DOM helpers: a tiny element builder, a time formatter and a number parser for inputs. Browser only.
// Classic script: window.SlopEffects.dom.
(function (g) {
  'use strict';
  const ns = (g.SlopEffects = g.SlopEffects || {});

  /** h('button', { class, onclick, title, disabled, aria-pressed }, ...children). null and false children are skipped. */
  function h(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const k of Object.keys(attrs || {})) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (v === true) n.setAttribute(k, '');
      else n.setAttribute(k, String(v));
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return n;
  }

  /** mm:ss.ff and the frame number, for the transport readout. */
  function fmtTime(t, fps) {
    const s = Math.max(0, t);
    const m = Math.floor(s / 60), sec = s - m * 60;
    const frame = Math.round(s * fps);
    return `${String(m).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')} · ` + g.SlopEffects.defs.t('effects.tr.frame_n', { n: String(frame) });
  }

  /** A number typed in an input, or null when it is not one. */
  function numberOf(input) {
    const v = typeof input === 'string' ? input : input.value;
    const n = Number(String(v).replace(',', '.').trim());
    return v === '' || !Number.isFinite(n) ? null : n;
  }

  /** True while a text field has the focus (so keys type text instead of running commands). */
  function typing() {
    const a = document.activeElement;
    if (!a) return false;
    const tag = a.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || a.isContentEditable;
  }

  ns.dom = { h, fmtTime, numberOf, typing };
})(typeof window !== 'undefined' ? window : globalThis);
