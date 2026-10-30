/* Slop Slides: shared helpers (namespace window.SS). Units: the slide model is in points (1/72 in). */
(function () {
  'use strict';
  var SS = window.SS = window.SS || {};
  var U = SS.util = {};
  var counter = 0;
  U.uid = function (p) { return (p || 'o') + Date.now().toString(36).slice(-5) + (counter++).toString(36) + Math.random().toString(36).slice(2, 5); };
  U.clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };
  U.clone = function (o) { return o == null ? o : JSON.parse(JSON.stringify(o)); };
  U.round = function (v, d) { var m = Math.pow(10, d == null ? 2 : d); return Math.round(v * m) / m; };
  U.ease = {
    linear: function (t) { return t; },
    inOut: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    out: function (t) { return 1 - Math.pow(1 - t, 3); },
    in: function (t) { return t * t * t; },
    spring: function (t) { return t === 1 ? 1 : 1 - Math.pow(2, -9 * t) * Math.cos(t * 9.5); }
  };
  /* ---------- language (shared/i18n/APPS-HOWTO.md; the words are in slides/i18n/<code>/*.js) ---------- */
  /** The chosen language's text for a key, English when that language lacks it. Call it when UI is built, never at load. */
  U.t = function (key, vars) { var I = window.SlopI18n; return I ? I.t(key, vars) : key; };
  /** Runs fn after a language change, once the new tables are in (for UI built once: toolbars, panels, the status bar). */
  /** True when the chosen language or English has the key. */
  U.has = function (key) { var I = window.SlopI18n; return !!(I && I.has && I.has(key)); };
  U.onLang = function (fn) { var I = window.SlopI18n; return I && I.on ? I.on(fn) : function () {}; };
  /** Fills a node from keys ({ text, title, 'aria-label', placeholder }) and marks it, so SlopI18n.apply() follows a switch. */
  U.mark = function (n, keys) {
    var at = [];
    Object.keys(keys).forEach(function (a) {
      if (a === 'text') { n.textContent = U.t(keys[a]); n.setAttribute('data-i18n', keys[a]); } else { n.setAttribute(a, U.t(keys[a])); at.push(a + ':' + keys[a]); }
    });
    if (at.length) n.setAttribute('data-i18n-attr', at.join(';'));
    return n;
  };
  /** The name of an object kind as the page shows it (text, shape, image, table, chart, group, audio, video). */
  /** A layout's and a built-in theme's name as the page shows it (the model keeps the English name: it is document data). */
  U.layoutName = function (id) { return U.t(`slides.layout.${String(id).replace(/-/g, '_')}`); };
  U.themeName = function (th) { return th && U.t(`slides.theme.${th.id}`) !== `slides.theme.${th.id}` ? U.t(`slides.theme.${th.id}`) : (th && th.name) || ''; };
  /** A placeholder's hint as the editor shows it: the layouts store their English hint in the deck; the page shows it in
   * the chosen language when the tables have it (slides.prompt.<words>), else as stored. */
  U.promptText = function (en) {
    var k = 'slides.prompt.' + String(en).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40).replace(/_+$/, '');
    return U.has(k) ? U.t(k) : en;
  };
  U.kindName = function (type) { return U.t(`slides.kind.${type || 'object'}`); };
  U.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  /* ---------- colours ---------- */
  U.hexToRgb = function (h) {
    h = String(h || '#000').replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(h.slice(0, 6), 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  U.rgbToHex = function (r, g, b) {
    return '#' + [r, g, b].map(function (v) { return ('0' + Math.round(U.clamp(v, 0, 255)).toString(16)).slice(-2); }).join('');
  };
  U.mix = function (a, b, t) {
    var x = U.hexToRgb(a), y = U.hexToRgb(b);
    return U.rgbToHex(U.lerp(x[0], y[0], t), U.lerp(x[1], y[1], t), U.lerp(x[2], y[2], t));
  };
  U.luma = function (h) { var c = U.hexToRgb(h); return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; };
  U.rgba = function (h, a) { var c = U.hexToRgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a == null ? 1 : a) + ')'; };
  /** Accepts '#rgb', '#rrggbb', 'rgb(…)' and returns '#rrggbb' (lowercase). */
  U.normHex = function (c) {
    if (!c) return null;
    c = String(c).trim();
    var m = /^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/i.exec(c);
    if (m) return U.rgbToHex(+m[1], +m[2], +m[3]);
    if (/^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c)) return U.rgbToHex.apply(null, U.hexToRgb(c));
    return null;
  };

  /* ---------- 2D affine matrices [a, b, c, d, e, f] ---------- */
  var M = U.mat = {};
  M.id = function () { return [1, 0, 0, 1, 0, 0]; };
  M.mul = function (m, n) {
    return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  };
  M.translate = function (x, y) { return [1, 0, 0, 1, x, y]; };
  M.scale = function (sx, sy) { return [sx, 0, 0, sy == null ? sx : sy, 0, 0]; };
  M.rotate = function (deg) { var r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return [c, s, -s, c, 0, 0]; };
  M.apply = function (m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; };
  M.invert = function (m) {
    var det = m[0] * m[3] - m[1] * m[2];
    if (!det) return M.id();
    return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
  };
  /** The transform that places an object's local box (0..w, 0..h) on the slide: rotate about the centre, flip. */
  M.forObject = function (o) {
    var cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    var m = M.mul(M.translate(cx, cy), M.rotate(o.rot || 0));
    m = M.mul(m, M.scale(o.flipH ? -1 : 1, o.flipV ? -1 : 1));
    return M.mul(m, M.translate(-o.w / 2, -o.h / 2));
  };

  /* ---------- bytes / blobs ---------- */
  U.u8ToB64 = function (u8) {
    var s = '';
    for (var i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  };
  U.b64ToU8 = function (b64) { var bin = atob(b64), o = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i); return o; };
  U.dataUrlToU8 = function (url) { var i = url.indexOf(','); return U.b64ToU8(url.slice(i + 1)); };
  U.dataUrlMime = function (url) { var m = /^data:([^;,]+)/.exec(url || ''); return m ? m[1] : 'application/octet-stream'; };
  U.u8ToDataUrl = function (u8, mime) { return 'data:' + mime + ';base64,' + U.u8ToB64(u8); };
  U.blobToDataUrl = function (blob) {
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; r.readAsDataURL(blob); });
  };
  U.utf8 = function (s) { return new TextEncoder().encode(s); };
  U.fromUtf8 = function (u8) { return new TextDecoder().decode(u8); };
  U.sniffMime = function (u8) {
    if (u8[0] === 0x89 && u8[1] === 0x50) return 'image/png';
    if (u8[0] === 0xFF && u8[1] === 0xD8) return 'image/jpeg';
    if (u8[0] === 0x47 && u8[1] === 0x49) return 'image/gif';
    if (u8[0] === 0x52 && u8[1] === 0x49 && u8[8] === 0x57) return 'image/webp';
    if (u8[0] === 0x3C) return 'image/svg+xml';
    if (u8[4] === 0x66 && u8[5] === 0x74 && u8[6] === 0x79 && u8[7] === 0x70) return 'video/mp4';
    if (u8[0] === 0x1A && u8[1] === 0x45) return 'video/webm';
    if (u8[0] === 0x49 && u8[1] === 0x44 && u8[2] === 0x33) return 'audio/mpeg';
    if (u8[0] === 0x4F && u8[1] === 0x67) return 'audio/ogg';
    return 'application/octet-stream';
  };
  U.extFor = function (mime) {
    return { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'video/mp4': 'mp4', 'video/webm': 'webm', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav' }[mime] || 'bin';
  };
  U.download = function (blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  };
  U.debounce = function (fn, ms) { var t; return function () { var a = arguments, self = this; clearTimeout(t); t = setTimeout(function () { fn.apply(self, a); }, ms); }; };
  U.store = {
    get: function (k, d) { try { var v = localStorage.getItem('slop-slides.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('slop-slides.' + k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }
  };
})();
