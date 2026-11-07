/* Workspace layouts, pure logic (no DOM, so Node tests can load it): validation, the grid arrangement a preset
 * gives, and the versioned storage envelope { v: 1, data }. Classic script; extends window.SlopLayouts. */
(function (g) {
  'use strict';
  const NS = (g.SlopLayouts = g.SlopLayouts || {});
  const SIDES = ['left', 'center', 'right', 'top', 'bottom'];
  const V = 1;
  const FR = 'minmax(0, 1fr)';

  /** The problems with one preset, as a list of strings (empty when it is valid). */
  NS.validate = function (p) {
    const errs = [];
    if (!p || typeof p.id !== 'string' || !p.id) return ['id is missing'];
    if (!NS.CATEGORIES.some((c) => c.id === p.category)) errs.push(`${p.id}: unknown category "${p.category}"`);
    if (!Array.isArray(p.apps)) errs.push(`${p.id}: apps must be an array`);
    if (!p.name) errs.push(`${p.id}: name is missing`);
    const panels = p.panels || {};
    const ids = Object.keys(panels);
    if (!ids.length) errs.push(`${p.id}: no panels`);
    for (const id of ids) {
      const q = panels[id];
      if (!q || typeof q.show !== 'boolean') { errs.push(`${p.id}.${id}: show must be true or false`); continue; }
      if (!SIDES.includes(q.side)) { errs.push(`${p.id}.${id}: side must be ${SIDES.join(', ')}`); continue; }
      if (q.side === 'center' && q.size !== null) errs.push(`${p.id}.${id}: centre size must be null`);
      if (q.side !== 'center' && q.size !== null && !(Number.isFinite(q.size) && q.size > 0)) errs.push(`${p.id}.${id}: size must be null or a positive px value`);
    }
    if (ids.length && !ids.some((id) => panels[id].show)) errs.push(`${p.id}: no visible panel`);
    return errs;
  };

  /** Presets that an app can use, in preset order. */
  NS.presetsFor = function (app) {
    return NS.PRESETS.filter((p) => p.apps.includes(app));
  };
  NS.preset = function (id) {
    return NS.PRESETS.find((p) => p.id === id) || null;
  };
  /** The default preset for an app: the first one that lists it. */
  NS.defaultFor = function (app) {
    return NS.presetsFor(app)[0] || null;
  };
  /** A ?layout= value (a category id or a preset id) to the preset it means for this app, or null. */
  NS.pick = function (app, want) {
    const byId = NS.PRESETS.find((p) => p.id === want && p.apps.includes(app));
    if (byId) return byId;
    return NS.presetsFor(app).find((p) => p.category === want) || null;
  };

  /**
   * The grid a preset gives for the panels an app has. `present` is the list of panel ids the app can place;
   * `opts.fixedTop` and `opts.fixedBottom` are the number of full-width rows the app keeps for itself (a top bar, a status bar).
   * `opts.sizeVars` maps a panel id to a CSS variable the app already sets (its own drag handle); the track (a row, or a side
   * column holding that panel alone) follows it, with the preset size as fallback.
   * Returns the column and row templates, where each placed panel goes ({ column, row } as grid lines), which
   * panels are off, and the line where the fixed bottom rows start.
   * Rule: left, centre and right share one band of rows; a side with k panels splits the band evenly; top and bottom
   * panels each take a full-width row.
   */
  NS.arrange = function (p, present, opts) {
    const fixedTop = (opts && opts.fixedTop) || 0, fixedBottom = (opts && opts.fixedBottom) || 0;
    const vars = (opts && opts.sizeVars) || {};
    const rowSize = (id) => { const s = p.panels[id].size; if (s === null) return FR; return vars[id] ? `var(${vars[id]}, ${s}px)` : `${s}px`; };
    const panels = p.panels;
    const shown = Object.keys(panels).filter((id) => present.includes(id) && panels[id].show);
    const by = { left: [], center: [], right: [], top: [], bottom: [] };
    for (const id of shown) by[panels[id].side].push(id);
    const sized = (side) => by[side].map((id) => panels[id].size);

    const sideTrack = (side) => {
      if (!by[side].length) return '0px';
      const s = sized(side);
      if (s.includes(null)) return FR;
      const one = by[side].length === 1 && vars[by[side][0]];   // a side panel the person resizes (shared/ui/resize-panel.js)
      return one ? `var(${one}, ${s[0]}px)` : `${Math.max(...s)}px`;
    };
    const centreTrack = !by.center.length && (sized('left').includes(null) || sized('right').includes(null)) ? '0px' : FR;
    const columns = [sideTrack('left'), centreTrack, sideTrack('right')].join(' ');

    const band = Math.max(1, by.left.length, by.center.length, by.right.length);
    const rows = [];
    const placements = {};
    for (let i = 0; i < fixedTop; i++) rows.push('auto');
    let line = fixedTop + 1; // the next grid line to start from
    for (const id of by.top) { rows.push(rowSize(id)); placements[id] = { column: '1 / -1', row: `${line} / ${line + 1}` }; line++; }
    const bandStart = line;
    for (let i = 0; i < band; i++) rows.push(FR);
    const COL = { left: '1 / 2', center: '2 / 3', right: '3 / 4' };
    for (const side of ['left', 'center', 'right']) {
      const k = by[side].length;
      by[side].forEach((id, i) => {
        const a = bandStart + Math.floor((i * band) / k), b = bandStart + Math.floor(((i + 1) * band) / k);
        placements[id] = { column: COL[side], row: `${a} / ${b}` };
      });
    }
    line = bandStart + band;
    for (const id of by.bottom) { rows.push(rowSize(id)); placements[id] = { column: '1 / -1', row: `${line} / ${line + 1}` }; line++; }
    const fixedBottomStart = line;
    for (let i = 0; i < fixedBottom; i++) rows.push('auto');
    const off = present.filter((id) => !placements[id]);
    return { columns, rows: rows.join(' '), placements, off, fixedBottomStart };
  };

  /** The envelope stored per app: { v: 1, data }. Anything else (other version, bad JSON) reads as nothing saved. */
  NS.envelope = function (data) { return JSON.stringify({ v: V, data }); };
  NS.readEnvelope = function (raw) {
    try {
      const o = JSON.parse(raw);
      if (o && o.v === V && o.data && typeof o.data === 'object') return o.data;
    } catch (e) { /* not ours */ }
    return null;
  };
  NS.storageKey = (app) => 'slop.layout.' + app;
  /** The preset an app should use: the saved one when it is still valid for the app, else the default. */
  NS.resolve = function (app, raw) {
    const saved = raw ? NS.readEnvelope(raw) : null;
    const p = saved && typeof saved.preset === 'string' ? NS.preset(saved.preset) : null;
    return p && p.apps.includes(app) ? p : NS.defaultFor(app);
  };
})(typeof window !== 'undefined' ? window : globalThis);
