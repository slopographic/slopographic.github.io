/* Shared video core (window.SlopVideo.grid): equal-cell grids as regions (fractions of the frame, origin
   top-left). Notation: 'RxC' is ROWS x COLUMNS, so '1x3' is one row of three equal columns and '3x1' is three
   stacked rows. Each axis takes 1 to MAX cells. An optional gap (between cells) and border (around the
   frame) are fractions of the frame size. Regions are listed row by row, left to right: slot i is cell i. */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const SV = (root.SlopVideo = root.SlopVideo || {});
  const G = (SV.grid = {});
  G.MAX = 4;
  G.GAP_MAX = 0.2; G.BORDER_MAX = 0.3;
  const clampInt = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(+v) || lo));
  const num = (v, lo, hi) => Math.min(hi, Math.max(lo, +v || 0));

  /** Regions for `rows` x `cols` equal cells with optional gap and border (fractions of the frame). */
  G.grid = function (rows, cols, o = {}) {
    const R = clampInt(rows, 1, G.MAX), C = clampInt(cols, 1, G.MAX);
    const gap = num(o.gap, 0, G.GAP_MAX), border = num(o.border, 0, G.BORDER_MAX);
    const iw = 1 - 2 * border, ih = 1 - 2 * border;
    const cw = (iw - (C - 1) * gap) / C, ch = (ih - (R - 1) * gap) / R;
    const out = [];
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      out.push({ x: border + c * (cw + gap), y: border + r * (ch + gap), w: cw, h: ch });
    }
    return out;
  };
  /** Parse 'RxC' (or 'grid-RxC') into { rows, cols }, or null when it is not a grid spec. */
  G.parse = function (spec) {
    const m = /^(?:grid-)?(\d)x(\d)$/i.exec(String(spec == null ? '' : spec).trim());
    if (!m) return null;
    const rows = +m[1], cols = +m[2];
    if (rows < 1 || cols < 1 || rows > G.MAX || cols > G.MAX) return null;
    return { rows, cols };
  };
  /** Canonical id of a grid spec: 'grid-RxC'. */
  G.id = (rows, cols) => 'grid-' + rows + 'x' + cols;
  /** All grid specs of the given size range, row by row: ['grid-1x1', 'grid-1x2', …]. */
  G.specs = function (max = G.MAX) {
    const out = [];
    for (let r = 1; r <= max; r++) for (let c = 1; c <= max; c++) out.push(G.id(r, c));
    return out;
  };
})();
