/* SlopIsolate — per-image undo/redo. Every image keeps its own two stacks (item.hist).
 * Entries: { kind: 'stroke', label, tiles, rect } (brush strokes, see brush.js) and
 * { kind: 'look', label, before, after } (edge, background, shadow and crop changes). A label is a string key of the
 * app's tables (cutout.undo.*, cutout.panel.*) or plain text; H.label() gives it in the chosen language.
 * A stroke entry is its own inverse: CO.brush.swap exchanges the bytes, so the same entry
 * goes to the other stack after it is applied.
 * A bulk change (the settings panel editing several images) pushes one entry per image with the same `group`: undoing or
 * redoing one of them does the same to every image whose next entry is of that group, so it is one step for all. */
(function () {
  'use strict';
  const CO = window.CO, U = CO.util;
  const LOOK_KEYS = ['s', 'bg', 'shadow', 'crop'];
  const MAX = 200;
  const H = CO.history = {};
  /* The bytes a picture's undo steps may hold (a stroke keeps the tiles it changed): the oldest go first, the newest always
   * stays. Less on a phone, where the page is reloaded when it uses too much memory. */
  const mem = (typeof navigator !== 'undefined' && navigator.deviceMemory) || 4;
  H.maxBytes = (U.isIOS || mem <= 2 ? 32 : mem <= 4 ? 96 : 192) * 1048576;
  /** Bytes an entry holds: a stroke's tiles (looks are a few small objects). */
  H.bytesOf = (e) => (e && e.kind === 'stroke' ? e.tiles.reduce((n, t) => n + t.bytes.length, 0) : 0);
  /** Bytes all of a picture's undo and redo steps hold. */
  H.bytes = (it) => { const h = it && it.hist; return h ? h.undo.concat(h.redo).reduce((n, e) => n + H.bytesOf(e), 0) : 0; };

  const snap = (it) => { const o = {}; for (const k of LOOK_KEYS) o[k] = { ...it[k] }; return o; };
  H.snapLook = snap;

  function applyLook(it, look) {
    for (const k of LOOK_KEYS) Object.assign(it[k], look[k]);
  }

  /** Run one entry against an image. Returns the entry's rect (for stroke repaints) or null. */
  function apply(it, entry, which) {
    if (entry.kind === 'stroke') return CO.brush.swap(it, entry);
    if (entry.kind === 'look') applyLook(it, entry[which]);
    return null;
  }

  function emit(it, entry, dir, rect) {
    CO.emit('history', { it, entry, dir, rect });
    CO.emit('item', it);
  }

  /** Record a finished change. Looks are pushed after they happen: `before` is the snapshot taken before. */
  H.push = function (it, entry) {
    if (!entry) return;
    const h = it.hist;
    h.undo.push(entry);
    h.redo.length = 0;
    if (h.undo.length > MAX) h.undo.shift();
    let bytes = H.bytes(it);
    while (h.undo.length > 1 && bytes > H.maxBytes) bytes -= H.bytesOf(h.undo.shift());
    CO.emit('history', { it, entry, dir: 'push' });
    CO.emit('item', it);
  };

  /** Record a look change made by a control. `before` is the look snapshot from before the change. group: the id that
   *  ties the entries of one bulk change together (see H.group). Returns true when something changed. */
  H.pushLook = function (it, before, label, group) {
    const after = snap(it);
    if (JSON.stringify(before) === JSON.stringify(after)) return false;
    const e = { kind: 'look', label: label || 'cutout.undo.look', before, after };
    if (group) e.group = group;
    H.push(it, e);
    return true;
  };
  let groups = 0;
  /** A new id for the entries of one bulk change. */
  H.group = () => 'g' + (++groups);

  /** Undo or redo one entry on an image; for a bulk entry, on every image whose next entry has its group. */
  function step(it, from, to, which, dir) {
    const h = it && it.hist, entry = h && h[from][h[from].length - 1];
    if (!entry) return null;
    const all = entry.group && CO.state ? CO.state.items.filter((o) => o.hist && o.hist[from].length && o.hist[from][o.hist[from].length - 1].group === entry.group) : [it];
    for (const o of all.includes(it) ? all : [it].concat(all)) {
      const e = o.hist[from].pop();
      const rect = apply(o, e, which);
      o.hist[to].push(e);
      emit(o, e, dir, rect);
    }
    return entry;
  }
  H.undo = (it) => step(it, 'undo', 'redo', 'before', 'undo');
  H.redo = (it) => step(it, 'redo', 'undo', 'after', 'redo');

  H.can = (it, dir) => !!(it && it.hist && it.hist[dir].length);
  /* ui/edit.js names its two steps in English (tests/node/slopisolate-settings.test.mjs reads them); these are their keys. */
  const NAMED = { 'Paste settings': 'cutout.undo.paste', 'Apply settings to all': 'cutout.undo.apply_all' };
  const tr = (l) => (U.t ? U.t(NAMED[l] || l) : l);
  H.label = (it, dir) => { const e = it && it.hist && it.hist[dir][it.hist[dir].length - 1]; return e ? tr(e.label) : ''; };
  H.clear = (it) => { if (it) it.hist = { undo: [], redo: [] }; };
  U.LOOK_KEYS = LOOK_KEYS;
})();
