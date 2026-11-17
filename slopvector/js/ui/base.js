/* SlopVector — ui: DOM helper, icons, toasts, key labels */
(function () {
  'use strict';
  var G = window.SVGeom, SV = window.SV, S = SV.state, D = SV.dom, IO = SV.io, C = SV.cmd;
  var clone = SV.clone, getObj = SV.getObj, esc = SV.esc, fmt = G.fmt;
  var abs = Math.abs, min = Math.min, max = Math.max, round = Math.round, PI = Math.PI;
  var UI = SV.ui = SV.ui || {}; UI.st = UI.st || {};
  var IS_MAC = SV.IS_MAC;
  var $ = UI._p = UI._p || {};

  /* ================= DOM helper ================= */
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k]; if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'i18n') SV.mark(el, v);   // { text: key, title: key, ... }: the words, kept live (core/state.js)
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.keys(v).forEach(function (s) { el.style.setProperty(s, v[s]); });
      else el.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c != null && c !== false) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  UI.h = h;
  function svgIcon(inner, cls) { return '<svg viewBox="0 0 24 24" class="' + (cls || 'ic') + '" aria-hidden="true">' + inner + '</svg>'; }
  var I = {
    eye: svgIcon('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
    eyeOff: svgIcon('<path d="M3 3l18 18M10.6 6c.5-.1.9-.1 1.4-.1 6 0 9.5 6.1 9.5 6.1a17 17 0 0 1-2.6 3.3M6.5 7.3C4 9 2.5 12 2.5 12S6 18.5 12 18.5c1.9 0 3.5-.6 4.9-1.5"/>'),
    lock: svgIcon('<rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    unlock: svgIcon('<rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 7.6-1.7"/>'),
    plus: svgIcon('<path d="M12 5v14M5 12h14"/>'),
    trash: svgIcon('<path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/>'),
    caret: svgIcon('<path d="M9 6l6 6-6 6"/>'),
    folder: svgIcon('<path d="M3 7h6l2 2h10v10H3z"/>'),
    link: svgIcon('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
    flipH: svgIcon('<path d="M12 3v18M9 7L4 17h5zM15 7l5 10h-5z"/>'),
    flipV: svgIcon('<path d="M3 12h18M7 9L17 4v5zM7 15l10 5v-5z"/>'),
    alignL: svgIcon('<path d="M4 3v18"/><rect x="7" y="6" width="12" height="4"/><rect x="7" y="14" width="7" height="4"/>'),
    alignHC: svgIcon('<path d="M12 3v18"/><rect x="5" y="6" width="14" height="4"/><rect x="8" y="14" width="8" height="4"/>'),
    alignR: svgIcon('<path d="M20 3v18"/><rect x="5" y="6" width="12" height="4"/><rect x="10" y="14" width="7" height="4"/>'),
    alignT: svgIcon('<path d="M3 4h18"/><rect x="6" y="7" width="4" height="12"/><rect x="14" y="7" width="4" height="7"/>'),
    alignVC: svgIcon('<path d="M3 12h18"/><rect x="6" y="5" width="4" height="14"/><rect x="14" y="8" width="4" height="8"/>'),
    alignB: svgIcon('<path d="M3 20h18"/><rect x="6" y="5" width="4" height="12"/><rect x="14" y="10" width="4" height="7"/>'),
    distH: svgIcon('<path d="M4 4v16M20 4v16M12 4v16"/><rect x="9.5" y="8" width="5" height="8"/>'),
    distV: svgIcon('<path d="M4 4h16M4 20h16M4 12h16"/><rect x="8" y="9.5" width="8" height="5"/>'),
    spaceH: svgIcon('<rect x="3" y="7" width="4" height="10"/><rect x="10" y="7" width="4" height="10"/><rect x="17" y="7" width="4" height="10"/>'),
    spaceV: svgIcon('<rect x="7" y="3" width="10" height="4"/><rect x="7" y="10" width="10" height="4"/><rect x="7" y="17" width="10" height="4"/>'),
    unite: svgIcon('<path d="M4 4h10v6h6v10H10v-6H4z" class="f"/>', 'ic-fill'),
    minus: svgIcon('<path d="M4 4h10v6h-4v4H4z" class="f"/><path d="M10 10h10v10H10z" class="o"/>', 'ic-mix'),
    intersect: svgIcon('<path d="M4 4h10v10H4zM10 10h10v10H10z" class="o"/><path d="M10 10h4v4h-4z" class="f"/>', 'ic-mix'),
    exclude: svgIcon('<path d="M4 4h10v6h-4v4H4zM14 10h6v10H10v-6h4z" class="f"/><path d="M10 10h4v4h-4z" class="o"/>', 'ic-mix'),
    capButt: svgIcon('<path d="M6 12h12" stroke-width="7" stroke-linecap="butt" class="thick"/><path d="M6 4v16" class="thin"/>'),
    capRound: svgIcon('<path d="M8 12h10" stroke-width="7" stroke-linecap="round" class="thick"/><path d="M8 4v16" class="thin"/>'),
    capSquare: svgIcon('<path d="M8 12h10" stroke-width="7" stroke-linecap="square" class="thick"/><path d="M8 4v16" class="thin"/>'),
    joinMiter: svgIcon('<path d="M5 19V6h13" stroke-width="5" stroke-linejoin="miter" class="thick"/>'),
    joinRound: svgIcon('<path d="M5 19V6h13" stroke-width="5" stroke-linejoin="round" class="thick"/>'),
    joinBevel: svgIcon('<path d="M5 19V6h13" stroke-width="5" stroke-linejoin="bevel" class="thick"/>'),
    txtL: svgIcon('<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>'),
    txtC: svgIcon('<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>'),
    txtR: svgIcon('<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>'),
    swap: svgIcon('<path d="M7 4h9a4 4 0 0 1 4 4v9M17 14l3 3 3-3M7 4l3-3M7 4l3 3" />'),
    drop: '<svg viewBox="0 0 32 32" class="brand-mark" aria-hidden="true"><path d="M16 2C16 2 6 13.5 6 20a10 10 0 0 0 20 0C26 13.5 16 2 16 2z"/><path class="shine" d="M11.5 20.5a4.5 4.5 0 0 0 3.5 4.4"/></svg>',
    panels: svgIcon('<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M15 4v16M17.5 8h1.5M17.5 11h1.5"/>'),
    menu: svgIcon('<path d="M4 7h16M4 12h16M4 17h16"/>'),
    slop: svgIcon('<path d="M4 9c0-3 3-5 8-5s8 2 8 5v4c0 1-1 1.5-1.5 1.5S17 14 17 15v3a1.5 1.5 0 0 1-3 0v-2c0-.8-1-.8-1 0v4a1.5 1.5 0 0 1-3 0v-5c0-.8-1-.8-1 0v1a1.5 1.5 0 0 1-3 0v-2.5C5 13 4 12.5 4 11z"/>')
  };
  UI.I = I;

  /* ================= toasts (shared SlopUI kit) ================= */
  UI.toast = function (msg, kind) { if (window.SlopUI) window.SlopUI.toast(String(msg), kind === 'warn' ? 4200 : 2600); };

  /* ================= keys display ================= */
  function keyLabel(combo) {
    if (!combo) return '';
    return combo.split('+').map(function (p) {
      if (p === 'mod') return IS_MAC ? '⌘' : 'Ctrl';
      if (p === 'alt') return IS_MAC ? '⌥' : 'Alt';
      if (p === 'shift') return IS_MAC ? '⇧' : 'Shift';
      if (p === '=') return '+';
      if (p === 'delete') return 'Del';
      return p.length === 1 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1);
    }).join(IS_MAC ? '' : '+');
  }
  UI.keyLabel = keyLabel;

  $.I = I; $.h = h; $.keyLabel = keyLabel;
})();
