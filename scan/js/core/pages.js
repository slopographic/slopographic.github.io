/* Slop Scan: the list of pages and the document's settings, one source of truth with listeners. Pure (no DOM); a page
 * gets window.SlopScan.pages (one shared list), Node tests make their own with create().
 * A page: { id, name, quad (0..1, top-left first), found, turn (quarter turns, 0..3), style, brightness, contrast, auto,
 *   photo (the app's decoded picture, opaque here), v (bumped on every change, so caches know) }.
 *   create() → list
 *   list.add(photo, { name, quad, found, turn }) → page   with the look of the page chosen last (new scans keep it)
 *   list.set(id, patch) / list.replace(id, photo, info)   change a page; a retake keeps its place and its look
 *   list.remove(id), list.move(id, to), list.get(id), list.all(), list.index(id), list.size()
 *   list.select(id), list.current()                       the page shown
 *   list.applyAll(id)                                     every page takes that page's look (style, brightness, contrast)
 *   list.doc, list.setDoc(patch)                          { size: auto | a4 | letter, margin, quality (0.3..0.95), ocr, name, autoTurn }
 *   list.on(fn) → off                                     fn(event) after every change ('add', 'set', 'remove', 'move', 'select', 'doc') */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.SlopScan = root.SlopScan || {}).pages = api.create();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const LOOK = ['style', 'brightness', 'contrast'];
  const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
  function create() {
    let pages = [], seq = 0, cur = null;
    const fns = new Set();
    let last = { style: 'color', brightness: 0, contrast: 0 };
    const doc = { size: 'auto', margin: 'none', quality: 0.8, ocr: false, name: '', autoTurn: true };
    const emit = (type, page) => { for (const f of [...fns]) f({ type, page }); };
    const get = (id) => pages.find((p) => p.id === id) || null;
    const clean = (patch) => {
      const o = Object.assign({}, patch);
      if ('turn' in o) o.turn = ((Math.round(o.turn) % 4) + 4) % 4;
      if ('brightness' in o) o.brightness = clampInt(o.brightness, -100, 100);
      if ('contrast' in o) o.contrast = clampInt(o.contrast, -100, 100);
      return o;
    };
    const api = {
      create,
      doc,
      add(photo, info = {}) {
        const p = Object.assign({ id: 'p' + ++seq, name: info.name || 'Page', quad: info.quad || null, found: !!info.found, turn: 0, auto: !!info.auto, photo, v: 1 }, last, clean({ turn: info.turn || 0 }));
        pages.push(p);
        cur = p.id;
        emit('add', p);
        return p;
      },
      set(id, patch) {
        const p = get(id);
        if (!p) return null;
        const o = clean(patch);
        Object.assign(p, o);
        p.v++;
        if (LOOK.some((k) => k in o)) for (const k of LOOK) last[k] = p[k];
        emit('set', p);
        return p;
      },
      replace(id, photo, info = {}) {
        const p = get(id);
        if (!p) return null;
        Object.assign(p, { photo, name: info.name || p.name, quad: info.quad || null, found: !!info.found, turn: clean({ turn: info.turn || 0 }).turn, auto: !!info.auto });
        p.v++;
        emit('set', p);
        return p;
      },
      remove(id) {
        const i = pages.findIndex((p) => p.id === id);
        if (i < 0) return false;
        const [p] = pages.splice(i, 1);
        if (cur === id) cur = pages.length ? pages[Math.min(i, pages.length - 1)].id : null;
        emit('remove', p);
        return true;
      },
      move(id, to) {
        const i = pages.findIndex((p) => p.id === id);
        if (i < 0) return false;
        const j = Math.max(0, Math.min(pages.length - 1, to));
        if (i === j) return false;
        const [p] = pages.splice(i, 1);
        pages.splice(j, 0, p);
        emit('move', p);
        return true;
      },
      applyAll(id) {
        const src = get(id);
        if (!src) return 0;
        let n = 0;
        for (const p of pages) if (p !== src && LOOK.some((k) => p[k] !== src[k])) { for (const k of LOOK) p[k] = src[k]; p.v++; n++; }
        emit('set', src);
        return n;
      },
      setDoc(patch) {
        const o = Object.assign({}, patch);
        if ('quality' in o) o.quality = Math.max(0.3, Math.min(0.95, Number(o.quality) || 0.8));
        Object.assign(doc, o);
        emit('doc', null);
        return doc;
      },
      select(id) { if (get(id)) { cur = id; emit('select', get(id)); } },
      current: () => get(cur) || pages[0] || null,
      get,
      all: () => pages.slice(),
      index: (id) => pages.findIndex((p) => p.id === id),
      size: () => pages.length,
      clear() { pages = []; cur = null; emit('remove', null); },
      on(fn) { fns.add(fn); return () => fns.delete(fn); },
    };
    return api;
  }
  return { create };
});
