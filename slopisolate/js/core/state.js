/* SlopIsolate — app state: the image list, per-image settings, tool/view state and a tiny event bus.
 * Light per-image data lives on the item (file, base mask, brush edits, settings). The heavy data of the
 * image on screen (decoded bitmap, pixels, cutout canvas, worker job) lives in CO.active (io/process.js). */
(function () {
  'use strict';
  const CO = window.CO, U = CO.util;
  const S = CO.state = {
    items: [], activeId: null, sel: new Set(), anchor: null, // sel: bulk selection (ids), anchor: the last plain or ctrl click
    tool: 'pan', view: 'result', split: 0.5,
    brush: Object.assign({ size: 48, hardness: 0.6 }, U.store.get('brush', {})),
    model: U.store.get('model', 'fast'),
    exportOpts: Object.assign({ format: 'png', quality: 0.92, jpgBg: '#ffffff' }, U.store.get('export', {})),
  };

  /* ---------- events ---------- */
  const handlers = new Map();
  CO.on = (type, fn) => { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type).add(fn); return () => handlers.get(type).delete(fn); };
  CO.emit = (type, data) => { for (const fn of handlers.get(type) || []) try { fn(data); } catch (e) { console.error(e); } };

  /* ---------- per-image look (edges, background, shadow, crop) ---------- */
  const DEFAULT_LOOK = {
    s: { threshold: 0.5, softness: 1, feather: 0, decontaminate: true, refine: true },
    bg: { mode: 'transparent', color: '#ffffff', blur: 24, image: null, gradA: '#d4ff3a', gradB: '#2b6cff', angle: 135 },
    shadow: { on: false, opacity: 0.45, blur: 3, x: 0, y: 2, color: '#000000' },
    crop: { mode: 'original', pad: 8 },
  };
  const clone = (o) => ({ s: { ...o.s }, bg: { ...o.bg }, shadow: { ...o.shadow }, crop: { ...o.crop } });
  /** The look new images start with: the last one the user set (minus a background image). */
  S.defaults = (() => { const d = clone(DEFAULT_LOOK), saved = U.store.get('look', null); if (saved) for (const k of ['s', 'bg', 'shadow', 'crop']) Object.assign(d[k], saved[k] || {}); d.bg.image = null; if (d.bg.mode === 'image') d.bg.mode = 'transparent'; return d; })();
  /** A task page's preset in the address (?bg=white&format=jpg): the background new images start with and the export
   *  format, for this visit only (nothing is saved). Unknown values are ignored. Pure: { bg?, format? } from a query string. */
  S.presetOf = (search) => {
    const q = new URLSearchParams(search || ''), out = {}, bg = q.get('bg'), fmt = q.get('format');
    if (bg === 'transparent') out.bg = { mode: 'transparent' };
    else if (bg === 'white') out.bg = { mode: 'color', color: '#ffffff' };
    else if (bg === 'blur') out.bg = { mode: 'blur' };
    if (['png', 'jpg', 'webp'].includes(fmt)) out.format = fmt;
    return out;
  };
  const preset = S.presetOf(typeof location !== 'undefined' ? location.search : '');
  if (preset.bg) Object.assign(S.defaults.bg, preset.bg);
  if (preset.format) S.exportOpts.format = preset.format;
  S.DEFAULT_LOOK = DEFAULT_LOOK;
  S.cloneLook = clone;
  S.lookOf = (it) => ({ s: it.s, bg: it.bg, shadow: it.shadow, crop: it.crop });
  S.rememberLook = U.debounce((it) => { const l = clone(S.lookOf(it)); l.bg.image = null; S.defaults = clone(l); U.store.set('look', l); }, 400);

  let seq = 0;
  /** A new list entry for a file. */
  S.createItem = function (file, name) {
    const look = clone(S.defaults);
    return Object.assign({
      id: 'i' + (++seq), file, name: name || file.name || 'image', w: 0, h: 0,
      status: 'queued', error: '', progress: null, model: null, modelUsed: null,
      base: null, edit: null, thumb: null, timings: null, hist: { undo: [], redo: [] },
    }, look);
  };
  /** The model an image runs with: its own (set by the bulk bar's Re-run model) or else the app's model, read when its
   *  run starts. A new image has none of its own, so every image of a batch runs with the model one image would get. */
  S.modelOf = (it) => (it && it.model) || S.model;
  S.get = (id) => S.items.find((it) => it.id === id) || null;
  S.current = () => S.get(S.activeId);
  /** What the settings panel edits: every selected picture when two or more are selected (bulk editing; videos have no
   *  look), else the image on screen. */
  S.targets = () => {
    if (S.sel.size >= 2) return S.items.filter((it) => S.sel.has(it.id) && it.kind !== 'video');
    const it = S.current();
    return it ? [it] : [];
  };
  S.bulk = () => S.sel.size >= 2;
  S.index = (id) => S.items.findIndex((it) => it.id === id);
  S.setStatus = (it, status, extra) => { Object.assign(it, { status }, extra || {}); CO.emit('item', it); };
  S.setTool = (t) => { S.tool = t; CO.emit('tool', t); };
  S.setView = (v) => { S.view = v; CO.emit('view', v); };
  S.setBrush = (patch) => { Object.assign(S.brush, patch); U.store.set('brush', S.brush); CO.emit('brush', S.brush); };
  S.setExport = (patch) => { Object.assign(S.exportOpts, patch); U.store.set('export', S.exportOpts); CO.emit('export', S.exportOpts); };
})();
