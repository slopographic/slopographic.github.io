/* Slop PDF — utilities: DOM helpers, icons, storage, zip writer, range parsing.
   Classic script; everything hangs off window.SP. No network access. */
(function () {
  'use strict';
  var SP = window.SP = window.SP || {};
  var U = SP.util = {};

  /* Words (pdf/i18n/<code>/*.js, shared/i18n/APPS-HOWTO.md): t('pdf.<area>.<name>') in the chosen language, English when it
     lacks the key. onLang(fn) re-runs fn after a language change, once the new tables are in (for UI built once). */
  U.t = function (key, vars) { var I = window.SlopI18n; return I ? I.t(key, vars) : key; };
  U.onLang = function (fn) { var I = window.SlopI18n; return I && I.on ? I.on(fn) : function () {}; };

  U.$ = function (sel, root) { return (root || document).querySelector(sel); };
  U.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function append(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { append(el, x); }); return; }
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  function setAttrs(el, attrs, isSvg) {
    if (!attrs) return;
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class' || k === 'className') { if (isSvg) el.setAttribute('class', v); else el.className = v; }
      else if (k === 'style' && typeof v === 'object') { Object.keys(v).forEach(function (p) { if (p.indexOf('--') === 0) el.style.setProperty(p, v[p]); else el.style[p] = v[p]; }); }
      else if (k === 'dataset') { Object.keys(v).forEach(function (d) { el.dataset[d] = v[d]; }); }
      else if (k.indexOf('on') === 0 && typeof v === 'function') { el.addEventListener(k.slice(2).toLowerCase(), v); }
      else if (k === 'html') { el.innerHTML = v; }
      else if (k === 'text') { el.textContent = v; }
      else if (!isSvg && (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden')) { el[k] = v; }
      else el.setAttribute(k, v === true ? '' : v);
    });
  }
  /** h('div', {class:'x', onclick: fn}, 'text', child, [children]) */
  U.h = function (tag) {
    var el = document.createElement(tag);
    setAttrs(el, arguments[1], false);
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  };
  var SVGNS = 'http://www.w3.org/2000/svg';
  U.SVGNS = SVGNS;
  U.s = function (tag) {
    var el = document.createElementNS(SVGNS, tag);
    setAttrs(el, arguments[1], true);
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  };

  var n = 0;
  U.uid = function (p) { n++; return (p || 'i') + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 7) + n.toString(36); };
  U.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  U.round = function (v, d) { var m = Math.pow(10, d || 0); return Math.round(v * m) / m; };
  U.fmtBytes = function (b) { return window.SlopHub.fmtSize(b); };   // SlopHub.fmtSize (shared/hub.js)
  U.debounce = function (fn, ms) {
    var t = null;
    var d = function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { t = null; fn.apply(s, a); }, ms); };
    d.flush = function () { if (t) { clearTimeout(t); t = null; fn(); } };
    return d;
  };
  U.nextFrame = function () { return new Promise(function (r) { requestAnimationFrame(function () { r(); }); }); };
  U.sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  U.esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  /* ---------- storage (always try/catch: private mode, blocked storage, previews) ---------- */
  U.store = {
    get: function (k, def) { try { var v = localStorage.getItem('slop-pdf.' + k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
    set: function (k, v) { try { localStorage.setItem('slop-pdf.' + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del: function (k) { try { localStorage.removeItem('slop-pdf.' + k); } catch (e) { /* ignore */ } }
  };

  /* Tiny IndexedDB key/value store. Every call resolves (null on failure). */
  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res) {
      try {
        if (!window.indexedDB) return res(null);
        var rq = indexedDB.open('slop-pdf', 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore('kv'); };
        rq.onsuccess = function () { res(rq.result); };
        rq.onerror = function () { res(null); };
        rq.onblocked = function () { res(null); };
      } catch (e) { res(null); }
    });
    return dbp;
  }
  function tx(mode, fn) {
    return db().then(function (d) {
      if (!d) return null;
      return new Promise(function (res) {
        try {
          var t = d.transaction('kv', mode), st = t.objectStore('kv'), out = fn(st);
          t.oncomplete = function () { res(out && 'result' in out ? out.result : true); };
          t.onerror = t.onabort = function () { res(null); };
        } catch (e) { res(null); }
      });
    }).catch(function () { return null; });
  }
  U.idb = {
    get: function (k) { return tx('readonly', function (st) { return st.get(k); }); },
    set: function (k, v) { return tx('readwrite', function (st) { st.put(v, k); }); },
    del: function (k) { return tx('readwrite', function (st) { st.delete(k); }); }
  };

  /* ---------- bytes ---------- */
  U.readFile = function (file) {
    if (file.arrayBuffer) return file.arrayBuffer().then(function (b) { return new Uint8Array(b); });
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(new Uint8Array(r.result)); }; r.onerror = function () { rej(r.error); }; r.readAsArrayBuffer(file); });
  };
  U.dataURLToBytes = function (url) {
    var b64 = url.slice(url.indexOf(',') + 1), bin = atob(b64), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };
  U.bytesToBase64 = function (bytes) {
    var s = '', CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  };
  U.bytesToDataURL = function (bytes, mime) { return 'data:' + mime + ';base64,' + U.bytesToBase64(bytes); };
  U.canvasToBlob = function (canvas, type, q) {
    return new Promise(function (res, rej) {
      canvas.toBlob(function (b) { if (b) res(b); else rej(new Error('Could not encode image')); }, type, q);
    });
  };
  U.blobToBytes = function (blob) { return U.readFile(blob); };
  U.sniff = function (b) {
    if (!b || b.length < 4) return 'unknown';
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'gif';
    if (b[0] === 0x42 && b[1] === 0x4d) return 'bmp';
    var lim = Math.min(b.length - 4, 1024);
    for (var i = 0; i < lim; i++) if (b[i] === 0x25 && b[i + 1] === 0x50 && b[i + 2] === 0x44 && b[i + 3] === 0x46) return 'pdf';
    return 'unknown';
  };
  U.indexOfBytes = function (hay, needle, from) {
    var n0 = needle[0], nl = needle.length;
    outer: for (var i = from || 0, e = hay.length - nl; i <= e; i++) {
      if (hay[i] !== n0) continue;
      for (var j = 1; j < nl; j++) if (hay[i + j] !== needle[j]) continue outer;
      return i;
    }
    return -1;
  };
  U.ascii = function (s) { var o = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) o[i] = s.charCodeAt(i) & 255; return o; };

  U.download = function (data, name, mime) {
    var blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener'; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 4000);
  };

  U.safeName = function (s, ext) {
    s = String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim();
    if (!s) s = 'document';
    if (ext) { var re = new RegExp('\\.' + ext + '$', 'i'); if (!re.test(s)) s += '.' + ext; }
    return s;
  };
  U.baseName = function (s) { return String(s || 'document').replace(/\.[a-z0-9]{1,5}$/i, ''); };

  /* ---------- colour ---------- */
  U.hexToRgb = function (hex) {
    hex = String(hex || '#000').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    var v = parseInt(hex, 16) || 0;
    return { r: ((v >> 16) & 255) / 255, g: ((v >> 8) & 255) / 255, b: (v & 255) / 255 };
  };

  /* ---------- page ranges: "1-3, 5, 8-" → [[0,1,2],[4],[7..n-1]] ---------- */
  U.parseRanges = function (str, max) {
    var parts = String(str || '').split(/[,;]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (!parts.length) throw new Error('Enter at least one page range, like 1-3, 5, 8-');
    return parts.map(function (p) {
      var m = /^(\d*)\s*(?:(-|–|—|to|\.\.)\s*(\d*))?$/i.exec(p);
      if (!m || (!m[1] && !m[3])) throw new Error('“' + p + '” is not a page range');
      var a = m[1] ? parseInt(m[1], 10) : 1;
      var b = m[2] ? (m[3] ? parseInt(m[3], 10) : max) : a;
      if (a < 1 || b < 1 || a > max || b > max) throw new Error('“' + p + '” is outside 1–' + max);
      var out = [];
      if (a <= b) for (var i = a; i <= b; i++) out.push(i - 1);
      else for (var j = a; j >= b; j--) out.push(j - 1);
      return out;
    });
  };
  U.describeIdx = function (idx) {
    // [0,1,2,4] -> "1–3, 5"
    var out = [], i = 0;
    while (i < idx.length) {
      var j = i;
      while (j + 1 < idx.length && idx[j + 1] === idx[j] + 1) j++;
      out.push(j > i ? (idx[i] + 1) + '–' + (idx[j] + 1) : String(idx[i] + 1));
      i = j + 1;
    }
    return out.join(', ');
  };


  /* ---------- tiny event emitter ---------- */
  U.emitter = function () {
    var m = {};
    return {
      on: function (ev, fn) { (m[ev] = m[ev] || []).push(fn); return function () { m[ev] = (m[ev] || []).filter(function (f) { return f !== fn; }); }; },
      emit: function (ev, a, b) { (m[ev] || []).slice().forEach(function (fn) { try { fn(a, b); } catch (e) { console.warn(e); } }); }
    };
  };

})();
