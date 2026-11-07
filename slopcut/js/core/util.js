/* SlopCut: utilities (DOM helpers, time formatting, events, localStorage, a tiny IndexedDB wrapper).
   Classic script; everything hangs off window.SE. No network access. */
(function () {
  'use strict';
  const SE = window.SE = window.SE || {};
  const U = SE.util = {};
  SE.act = SE.act || {}; // actions run by commands (see ui/commands.js)
  /* Text a person reads: t(key, vars) from the app's tables (slopcut/i18n, shared/i18n/APPS-HOWTO.md), the key itself
     when SlopI18n is missing (node tests). onLang(fn) re-runs fn after a language change, once the new tables are in. */
  U.t = (key, vars) => { const I = window.SlopI18n; return I ? I.t(key, vars) : key; };
  U.onLang = (fn) => { const I = window.SlopI18n; return I && I.on ? I.on(fn) : () => {}; };
  /** A built-in name (a transition, a preset, a template...) in the chosen language, slopedit.def.<kind>.<id>, else en; the
     names themselves stay English (they are data). wl(kind, list) maps [id, label, ...] rows the same way. */
  U.w = (kind, id, en) => { const I = window.SlopI18n, k = 'slopedit.def.' + kind + '.' + String(id).replace(/[^a-z0-9]+/gi, '_').toLowerCase(); return I && I.has(k) ? I.t(k) : en; };
  U.wl = (kind, list) => list.map((r) => [r[0], U.w(kind, r[0], r[1])].concat(r.slice(2)));

  U.$ = (sel, root) => (root || document).querySelector(sel);
  U.$$ = (sel, root) => [...(root || document).querySelectorAll(sel)];
  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach((x) => add(el, x)); return; }
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  /** h('div', { class, style: {}, onclick, dataset }, ...children) */
  U.h = function (tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') for (const p in v) { if (p.startsWith('--')) el.style.setProperty(p, v[p]); else el.style[p] = v[p]; }
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    kids.forEach((c) => add(el, c));
    return el;
  };
  let n = 0;
  U.uid = (p) => (p || 'x') + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 6) + (++n).toString(36);
  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.round = (v, d = 3) => { const m = 10 ** d; return Math.round(v * m) / m; };
  U.debounce = (fn, ms) => { let t = 0; const d = (...a) => { clearTimeout(t); t = setTimeout(() => { t = 0; fn(...a); }, ms); }; d.flush = () => { if (t) { clearTimeout(t); t = 0; fn(); } }; return d; };
  U.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  U.nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
  U.fmtBytes = (b) => (b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : (b / 1048576).toFixed(1) + ' MB');

  /* ------------------------------------------------------------- time */
  /** Snap seconds to the frame grid. */
  U.snapFrame = (t, fps) => Math.round(t * fps) / fps;
  /** SMPTE-style timecode HH:MM:SS:FF (non-drop). */
  U.timecode = function (t, fps) {
    const f = Math.max(0, Math.round(t * fps)), fr = f % fps, s = Math.floor(f / fps);
    const p = (x) => String(x).padStart(2, '0');
    return p(Math.floor(s / 3600)) + ':' + p(Math.floor(s / 60) % 60) + ':' + p(s % 60) + ':' + p(fr);
  };
  /** Short human duration: 4.2s, 1:05, 1:02:03. */
  U.dur = function (t) {
    if (!isFinite(t)) return '—';
    if (t < 10) return t.toFixed(1) + 's';
    const s = Math.round(t), p = (x) => String(x).padStart(2, '0');
    return s >= 3600 ? Math.floor(s / 3600) + ':' + p(Math.floor(s / 60) % 60) + ':' + p(s % 60) : Math.floor(s / 60) + ':' + p(s % 60);
  };
  /** Parse "12.5", "1:02", "00:00:01:15" (with fps) into seconds; NaN if invalid. */
  U.parseTime = function (str, fps) {
    const s = String(str).trim();
    if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
    const parts = s.split(':').map(Number);
    if (parts.some((x) => !isFinite(x))) return NaN;
    if (parts.length === 4) return parts[0] * 3600 + parts[1] * 60 + parts[2] + parts[3] / fps;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return NaN;
  };

  /* ------------------------------------------------------------- events */
  const handlers = new Map();
  SE.on = (type, fn) => { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type).add(fn); return () => handlers.get(type).delete(fn); };
  SE.emit = (type, data) => { for (const fn of handlers.get(type) || []) try { fn(data); } catch (e) { console.error(e); } };

  /* ------------------------------------------------------------- storage */
  U.store = {
    get(k, d) { try { const v = localStorage.getItem('slopedit.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('slopedit.' + k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }
  };
  /** IndexedDB: 'kv' (project autosave) and 'media' (imported files as Blobs). */
  const DB = window.SLOPEDIT_DB || 'slopedit';
  let dbp = null;
  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      if (!window.indexedDB) { rej(new Error('IndexedDB unavailable')); return; }
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('kv'); d.createObjectStore('media', { keyPath: 'id' }); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => { dbp = null; rej(r.error); };
    });
    return dbp;
  }
  /** A full quota shows the storage dialog once (shared/storage/ui.js); the error still goes to the caller. */
  const full = (e) => { try { window.SlopStorage && SlopStorage.handle(e, { what: U.t('slopedit.core.this_media') }); } catch (x) { /* no dialog on this page */ } return e; };
  async function tx(store, mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode), req = fn(t.objectStore(store));
      t.oncomplete = () => res(req && req.result);
      t.onerror = () => rej(full(t.error));
      t.onabort = () => rej(full(t.error || new Error('aborted')));
    });
  }
  U.idb = {
    get: (k) => tx('kv', 'readonly', (s) => s.get(k)),
    set: (k, v) => tx('kv', 'readwrite', (s) => s.put(v, k)),
    del: (k) => tx('kv', 'readwrite', (s) => s.delete(k)),
    putMedia: (rec) => tx('media', 'readwrite', (s) => s.put(rec)),
    getMedia: (id) => tx('media', 'readonly', (s) => s.get(id)),
    delMedia: (id) => tx('media', 'readwrite', (s) => s.delete(id)),
    mediaKeys: () => tx('media', 'readonly', (s) => s.getAllKeys()),
    clearMedia: () => tx('media', 'readwrite', (s) => s.clear())
  };

  /** Canvas helper. */
  U.canvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
  U.ext = (name) => { const m = /\.([a-z0-9]+)$/i.exec(name || ''); return m ? m[1].toLowerCase() : ''; };
  U.baseName = (name) => String(name || 'untitled').replace(/\.[a-z0-9]+$/i, '');
  /** CSS colour → [r,g,b] 0..255 (hex only, the inspector always gives hex). */
  U.hexRGB = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); const v = m ? parseInt(m[1], 16) : 0; return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
})();
