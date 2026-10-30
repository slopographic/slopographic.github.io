/* Shared video core (window.SlopVideo.templates): layout templates as data. Each template has slot regions as
   fractions of the frame (x, y, w, h), a default cut length (s) and an optional frame aspect. Named templates
   (Single, Split, Picture-in-picture, Three-up, Vertical reel) sit beside any grid: 'grid-RxC' is a grid made
   on demand (see grid.js), so Custom grid… and random edits use the same ids. Tiling templates cover the frame
   exactly once; layered ones (picture-in-picture) put later slots on top of earlier ones. */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const SV = (root.SlopVideo = root.SlopVideo || {});
  const T = (SV.templates = {});
  const G = SV.grid, P = SV.presets;
  const FULL = { x: 0, y: 0, w: 1, h: 1 };

  T.ASPECTS = P.ASPECTS;
  T.aspectSize = (name) => P.aspectSize(name);
  const DATA = [
    { id: 'single', slots: [FULL], dur: 4, layered: false },
    { id: 'split-h', slots: G.grid(1, 2), dur: 4, layered: false },
    { id: 'split-v', slots: G.grid(2, 1), dur: 4, layered: false },
    { id: 'pip', slots: [FULL, { x: 0.6, y: 0.6, w: 0.36, h: 0.36 }], dur: 6, layered: true },
    { id: 'grid2', slots: G.grid(2, 2), dur: 3, layered: false },
    { id: 'grid3', slots: G.grid(3, 3), dur: 2, layered: false },
    { id: 'three-up', slots: G.grid(1, 3), dur: 3, layered: false },
    { id: 'reel', slots: G.grid(2, 1), dur: 2, layered: false, aspect: '9:16' },
    { id: 'title-two', slots: [{ x: 0, y: 0, w: 1, h: 0.28 }, { x: 0, y: 0.28, w: 0.5, h: 0.72 }, { x: 0.5, y: 0.28, w: 0.5, h: 0.72 }], dur: 4, layered: false }
  ];
  /** A template with its name and desc in the chosen language (ui.video.tpl.<id> and ui.video.tpl_desc.<id>). */
  const named = (t) => Object.assign({ name: SV.word('tpl', t.id), desc: SV.word('tpl_desc', t.id) }, t);
  /** The named templates [{ id, name, desc, slots, dur, layered, aspect? }] (a getter: the words follow the language). */
  Object.defineProperty(T, 'list', { enumerable: true, get: () => DATA.map(named) });
  /** A grid template for 'RxC' (rows x columns). Its name is 'Grid R×C' (ui.video.tpl.grid). */
  T.grid = function (rows, cols, o = {}) {
    const g = G.parse(G.id(rows, cols));
    if (!g) return null;
    const dur = o.dur || 3, v = { rows: String(g.rows), cols: String(g.cols) };
    return { id: G.id(g.rows, g.cols), name: SV.word('tpl', 'grid', v), desc: SV.word('tpl_desc', 'grid', Object.assign({ n: g.rows * g.cols }, v)), slots: G.grid(g.rows, g.cols, o), dur, layered: false };
  };
  /** Template by id: a named one, or any grid id ('grid-RxC' or 'RxC'). Null when unknown. */
  T.get = function (id) {
    const d = DATA.find((t) => t.id === id);
    if (d) return named(d);
    const g = G.parse(id);
    return g ? T.grid(g.rows, g.cols) : null;
  };
  /** Region of slot i of a template (or null). */
  T.region = (tpl, i) => (tpl && tpl.slots[i]) || null;
  /** Number of slots of a layout id (1 when there is no layout). */
  T.slotCount = (id) => { const t = id ? T.get(id) : null; return t ? t.slots.length : 1; };
  /** Label for a layout id (a template's name, a grid's, or ui.video.tpl.none when there is no layout). */
  T.label = (id) => { const t = id ? T.get(id) : null; return t ? t.name : SV.word('tpl', 'none'); };
  /** True when a tiling template covers the frame exactly once: areas sum to 1, no pair overlaps, all inside. */
  T.tiles = function (tpl) {
    const eps = 1e-9;
    const inside = tpl.slots.every((r) => r.x >= -eps && r.y >= -eps && r.x + r.w <= 1 + eps && r.y + r.h <= 1 + eps && r.w > 0 && r.h > 0);
    const area = tpl.slots.reduce((s, r) => s + r.w * r.h, 0);
    let overlap = false;
    for (let i = 0; i < tpl.slots.length; i++) for (let j = i + 1; j < tpl.slots.length; j++) {
      const a = tpl.slots[i], b = tpl.slots[j];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > eps && oy > eps) overlap = true;
    }
    return inside && !overlap && Math.abs(area - 1) < eps;
  };
})();
