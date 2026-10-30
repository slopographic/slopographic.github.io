/* Slop Press — core utilities: namespace, units, ids, events, small DOM helpers.
   Every coordinate in a document is stored in points (1/72 in); units only matter for display. */
(function () {
  'use strict';
  var PR = window.PR = window.PR || {};
  var U = PR.util = {};

  /* ---------- units ---------- */
  // InDesign convention: 1 px = 1 pt.
  U.UNITS = { pt: 1, px: 1, mm: 72 / 25.4, cm: 72 / 2.54, in: 72, pc: 12 };
  /** Names read in the current language on every use (keys press.core.*, press/i18n/<code>/core.js). */
  U.named = function (o, map) { Object.keys(map).forEach(function (k) { Object.defineProperty(o, k, { enumerable: true, configurable: true, get: function () { return U.t(map[k]); } }); }); return o; };
  U.UNIT_NAMES = U.named({}, { pt: 'press.core.unit_pt', px: 'press.core.unit_px', mm: 'press.core.unit_mm', cm: 'press.core.unit_cm', in: 'press.core.unit_in', pc: 'press.core.unit_pc' });
  U.toPt = function (v, unit) { return (+v || 0) * (U.UNITS[unit] || 1); };
  U.fromPt = function (pt, unit) { return pt / (U.UNITS[unit] || 1); };
  U.round = function (v, d) { var m = Math.pow(10, d == null ? 3 : d); return Math.round(v * m) / m; };
  /** Formats a point value in a unit with sensible precision ("210 mm"). */
  U.fmt = function (pt, unit, withUnit) {
    var v = U.fromPt(pt, unit), d = unit === 'in' ? 4 : unit === 'pt' || unit === 'px' ? 2 : 3;
    var s = String(U.round(v, d));
    return withUnit ? s + ' ' + unit : s;
  };
  /** Parses "12mm", "1in", "3p6" (picas) or a bare number in the default unit. Returns points or NaN. */
  U.parse = function (str, unit) {
    var s = String(str).trim().toLowerCase().replace(',', '.');
    var pc = /^(-?\d*\.?\d*)p(\d*\.?\d*)$/.exec(s);
    if (pc && (pc[1] || pc[2])) return (+pc[1] || 0) * 12 + (+pc[2] || 0);
    var m = /^(-?\d*\.?\d+(?:e-?\d+)?)\s*(pt|px|mm|cm|in|pc|")?$/.exec(s);
    if (!m) return NaN;
    var u = m[2] === '"' ? 'in' : m[2] || unit;
    return U.toPt(+m[1], u);
  };

  /* ---------- page size presets (points) ---------- */
  U.PRESETS = [
    { id: 'a4', name: 'A4', w: 595.276, h: 841.89 },
    { id: 'a5', name: 'A5', w: 419.528, h: 595.276 },
    { id: 'a3', name: 'A3', w: 841.89, h: 1190.551 },
    U.named({ id: 'letter', w: 612, h: 792 }, { name: 'press.core.size_letter' }),
    U.named({ id: 'legal', w: 612, h: 1008 }, { name: 'press.core.size_legal' }),
    U.named({ id: 'tabloid', w: 792, h: 1224 }, { name: 'press.core.size_tabloid' }),
    U.named({ id: 'halfletter', w: 396, h: 612 }, { name: 'press.core.size_halfletter' }),
    U.named({ id: 'card', w: 252, h: 144 }, { name: 'press.core.size_card' }),
    U.named({ id: 'cardeu', w: 240.945, h: 155.906 }, { name: 'press.core.size_cardeu' }),
    U.named({ id: 'a6', w: 297.638, h: 419.528 }, { name: 'press.core.size_a6' })
  ];
  U.presetFor = function (w, h) {
    for (var i = 0; i < U.PRESETS.length; i++) {
      var p = U.PRESETS[i];
      if ((Math.abs(p.w - w) < 0.6 && Math.abs(p.h - h) < 0.6) || (Math.abs(p.w - h) < 0.6 && Math.abs(p.h - w) < 0.6)) return p;
    }
    return null;
  };

  /* ---------- ids, cloning ---------- */
  var seq = 0;
  U.uid = function (p) { seq = (seq + 1) % 1e6; return (p || 'i') + Date.now().toString(36).slice(-5) + seq.toString(36) + Math.random().toString(36).slice(2, 5); };
  U.clone = function (o) { return o == null ? o : JSON.parse(JSON.stringify(o)); };
  U.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  U.esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  U.assign = function (t) { for (var i = 1; i < arguments.length; i++) { var s = arguments[i]; if (s) for (var k in s) if (s[k] !== undefined) t[k] = s[k]; } return t; };

  /* ---------- colours ---------- */
  // Colours are '#rrggbb', 'cmyk(c,m,y,k)' with 0–100 components, or null (none).
  U.parseCMYK = function (c) {
    var m = /^cmyk\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/i.exec(c || '');
    return m ? [+m[1] / 100, +m[2] / 100, +m[3] / 100, +m[4] / 100] : null;
  };
  U.rgbOf = function (c) {
    if (!c) return null;
    var k = U.parseCMYK(c);
    if (k) return [255 * (1 - k[0]) * (1 - k[3]), 255 * (1 - k[1]) * (1 - k[3]), 255 * (1 - k[2]) * (1 - k[3])].map(Math.round);
    var h = String(c).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h.slice(0, 6), 16);
    return isNaN(n) ? [0, 0, 0] : [n >> 16 & 255, n >> 8 & 255, n & 255];
  };
  U.css = function (c) { var r = U.rgbOf(c); return r ? 'rgb(' + r.join(',') + ')' : 'transparent'; };
  U.hex = function (c) { var r = U.rgbOf(c) || [0, 0, 0]; return '#' + r.map(function (v) { return (256 + v).toString(16).slice(1); }).join(''); };

  /* ---------- events ---------- */
  var handlers = {};
  PR.on = function (type, fn) { (handlers[type] = handlers[type] || []).push(fn); return function () { handlers[type] = handlers[type].filter(function (f) { return f !== fn; }); }; };
  PR.emit = function (type, data) { (handlers[type] || []).slice().forEach(function (fn) { try { fn(data); } catch (e) { console.error(e); } }); };

  /* ---------- DOM ---------- */
  U.h = function (tag, attrs) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'style' && typeof v === 'object') U.assign(n.style, v);
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (v === true) n.setAttribute(k, '');
      else n.setAttribute(k, v);
    }
    for (var i = 2; i < arguments.length; i++) {
      var kid = arguments[i];
      [].concat(kid).forEach(function (c) { if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c))); });
    }
    return n;
  };
  U.$ = function (sel, root) { return (root || document).querySelector(sel); };
  U.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  /* ---------- language (shared/i18n/APPS-HOWTO.md; the words are in press/i18n/<code>/*.js) ---------- */
  /** The chosen language's text for a key, English when that language lacks it. Call it when UI is built, never at load. */
  U.t = function (key, vars) { var I = window.SlopI18n; return I ? I.t(key, vars) : key; };
  /** Runs fn after a language change, once the new tables are in (for UI built once: toolbars, panels, the status bar). */
  U.onLang = function (fn) { var I = window.SlopI18n; return I && I.on ? I.on(fn) : function () {}; };
  U.toast = function (msg, ms) { if (window.SlopUI) window.SlopUI.toast(msg, ms); };
  U.debounce = function (fn, ms) { var t = 0; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); }; };

  /* ---------- binary helpers ---------- */
  U.blobToDataURL = function (blob) {
    return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = function () { rej(fr.error); }; fr.readAsDataURL(blob); });
  };
  U.dataURLToBytes = function (url) {
    var i = url.indexOf(','), meta = url.slice(5, i), body = url.slice(i + 1);
    var type = meta.split(';')[0];
    if (/;base64/.test(meta)) { var bin = atob(body), out = new Uint8Array(bin.length); for (var j = 0; j < bin.length; j++) out[j] = bin.charCodeAt(j); return { type: type, bytes: out }; }
    return { type: type, bytes: new TextEncoder().encode(decodeURIComponent(body)) };
  };
  U.bytesToDataURL = function (bytes, type) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return 'data:' + (type || 'application/octet-stream') + ';base64,' + btoa(s);
  };
  U.IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
})();
