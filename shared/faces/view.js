/* SlopFaces view: what the person sees of the faces on a photo. Three global modes (Show faces):
 *   'off'    nothing on the photos: no count badge, no boxes
 *   'count'  (the default) a badge with the count ("3 faces"); a click draws that photo's boxes, and the choice is kept
 *   'boxes'  the boxes on every photo; a photo's badge hides them for that photo
 * The choice per photo is remembered in localStorage ('slop-faces-photos', a versioned envelope { v: 1, data }) and the
 * mode in 'slop-faces-view' ({ v: 1, data: { mode } }). Both are a per-browser convenience: a storage failure falls back
 * to the defaults. attachPhoto(host, opts) puts the badge and the boxes for one picture on a page; it returns { refresh,
 * destroy }. Classic script; adds to window.SlopFaces.view. Needs overlay.js (drawBoxes) for the boxes. */
(function (g) {
  'use strict';
  const tr = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);   // words: shared/i18n/ui/<code>/preview.js
  const F = (g.SlopFaces = g.SlopFaces || {});
  const V = (F.view = F.view || {});
  const MODES = ['off', 'count', 'boxes'];
  const KEY_MODE = 'slop-faces-view', KEY_PHOTOS = 'slop-faces-photos', MAX_PHOTOS = 2000;
  const listeners = new Set();

  /** Reads a versioned envelope; anything else (or no storage) gives the fallback. */
  function read(key, fallback) {
    try {
      const raw = g.localStorage.getItem(key);
      const env = raw ? JSON.parse(raw) : null;
      return env && env.v === 1 && env.data && typeof env.data === 'object' ? env.data : fallback;
    } catch (e) { return fallback; }
  }
  function write(key, data) {
    try { g.localStorage.setItem(key, JSON.stringify({ v: 1, data })); } catch (e) { /* storage blocked: the choice lasts this page */ }
  }
  let photos = null;
  const photoMap = () => (photos || (photos = read(KEY_PHOTOS, {})));
  const keyOf = (scope, id) => scope + ':' + id;
  const emit = () => { for (const fn of [...listeners]) try { fn(); } catch (e) { console.error(e); } };

  V.modes = () => MODES.slice();
  V.mode = () => { const m = read(KEY_MODE, {}).mode; return MODES.includes(m) ? m : 'count'; };
  V.setMode = function (m) {
    if (!MODES.includes(m)) return false;
    write(KEY_MODE, { mode: m });
    emit();
    return true;
  };
  /** Whether a photo's boxes are shown: its own choice, else the mode's default (on for 'boxes', off otherwise). */
  V.shown = function (scope, id) {
    const k = keyOf(scope, id), v = photoMap()[k];
    if (v === true || v === false) return v;
    return V.mode() === 'boxes';
  };
  V.setShown = function (scope, id, on) {
    const m = photoMap(), k = keyOf(scope, id);
    delete m[k];
    m[k] = !!on;
    const keys = Object.keys(m);
    for (const old of keys.slice(0, Math.max(0, keys.length - MAX_PHOTOS))) delete m[old];
    write(KEY_PHOTOS, m);
    emit();
  };
  V.onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
  // Another tab changed the choice.
  try { g.addEventListener('storage', (e) => { if (e.key === KEY_MODE || e.key === KEY_PHOTOS) { photos = null; emit(); } }); } catch (e) { /* no storage events */ }

  /** The badge and the boxes for one picture. host: the element that holds the picture (its boxes go in it).
   * opts: { scope, id, faces, badgeHost } (the badge is appended to badgeHost; it is left out when there are no faces or
   * the mode is off). Returns { refresh(faces?), destroy() }. */
  V.attachPhoto = function (host, opts) {
    let faces = (opts && opts.faces) || [];
    const { scope, id } = opts;
    let undraw = null, badge = null, gone = false;
    const clear = () => { if (undraw) { undraw(); undraw = null; } };
    const draw = () => {
      clear();
      if (gone || !host || !faces.length || !V.shown(scope, id) || V.mode() === 'off') return;
      if (F.drawBoxes) undraw = F.drawBoxes(host, faces);
    };
    const label = (n) => tr('ui.faces.faces_n', { n });
    function paintBadge() {
      if (!badge) return;
      const on = V.shown(scope, id);
      badge.textContent = label(faces.length);
      badge.setAttribute('aria-pressed', on ? 'true' : 'false');
      badge.title = tr(on ? 'ui.faces.hide_boxes' : 'ui.faces.show_boxes');
      badge.classList.toggle('on', on);
    }
    const onMode = () => { if (badge && V.mode() === 'off') { badge.remove(); badge = null; } else if (!badge && opts.badgeHost && faces.length && V.mode() !== 'off') mountBadge(); clearOrDraw(); };
    function mountBadge() {
      badge = g.document.createElement('button');
      badge.type = 'button';
      badge.className = 'face-badge';
      badge.addEventListener('click', () => { V.setShown(scope, id, !V.shown(scope, id)); });
      if (opts.badgeHost) opts.badgeHost.append(badge);
      paintBadge();
    }
    const clearOrDraw = () => { draw(); paintBadge(); };
    const off = V.onChange(onMode);
    if (V.mode() !== 'off' && faces.length && opts.badgeHost) mountBadge();
    draw();
    return {
      refresh(next) { if (next) faces = next; if (badge && !faces.length) { badge.remove(); badge = null; } else if (!badge && faces.length && V.mode() !== 'off' && opts.badgeHost) mountBadge(); clearOrDraw(); },
      destroy() { gone = true; off(); clear(); if (badge) badge.remove(); badge = null; },
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
