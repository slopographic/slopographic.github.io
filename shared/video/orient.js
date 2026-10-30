/* Shared video core (window.SlopVideo.orient): clip orientation, the choice of grids by orientation, the order of
   clips in cells, and the fill mode of a cell. Pure, no DOM. Ratios are w/h. Orientation: landscape (ratio >= 1.1),
   portrait (<= 0.9), square otherwise. A clip with no size is unknown: it never changes a choice.
   A grid cell has the shape (rows / cols) * frame ratio. Grids are kept when their cells suit the clips' shapes. */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const SV = (root.SlopVideo = root.SlopVideo || {});
  const O = (SV.orient = {});
  const G = SV.grid;

  /** Fill modes a cell can use. 'auto' is the default: cover for photos, blur when the orientations are mixed. */
  O.FILLS = ['auto', 'cover', 'fit', 'stretch', 'blur'];
  O.LANDSCAPE = 1.1; O.PORTRAIT = 0.9;
  /** Grids within this share of the best score are kept as choices. */
  O.SLACK = 0.15;

  O.ratio = (w, h) => (+w > 0 && +h > 0 ? +w / +h : null);
  O.classify = (r) => (r >= O.LANDSCAPE ? 'landscape' : r <= O.PORTRAIT ? 'portrait' : 'square');
  /** Orientation of a media item ({ w, h }): 'landscape', 'portrait', 'square', or null when its size is unknown. */
  O.of = (m) => { const r = O.ratio(m && m.w, m && m.h); return r == null ? null : O.classify(r); };
  /** True when the media mix more than one orientation. */
  O.mixed = (media) => new Set((media || []).map(O.of).filter(Boolean)).size > 1;
  /** Share of the area kept when a ratio a is cropped to ratio b (min / max, 0 to 1). */
  O.kept = (a, b) => Math.min(a, b) / Math.max(a, b);
  /** Ratio of a cell of a rows x cols grid in a frame of ratio frameR. */
  O.cellRatio = (rows, cols, frameR) => (rows / cols) * frameR;
  /** Mean share kept when each clip ratio fills a cell of the grid (1 is a perfect match). */
  O.gridScore = (rows, cols, frameR, ratios) => {
    const cr = O.cellRatio(rows, cols, frameR);
    return ratios.reduce((s, r) => s + O.kept(cr, r), 0) / ratios.length;
  };
  /**
   * The layouts of a list worth choosing for these clips: grid ids whose score is within SLACK of the best one.
   * Named templates and unknown ids are kept as they are. With no sized clips, or no frame size, the list is unchanged.
   */
  O.prefer = function (list, size, media) {
    const frameR = O.ratio(size && size.w, size && size.h);
    const ratios = (media || []).map((m) => O.ratio(m.w, m.h)).filter((r) => r != null);
    if (!frameR || !ratios.length) return list.slice();
    const score = (g) => O.gridScore(g.rows, g.cols, frameR, ratios);
    const best = Math.max(-Infinity, ...list.map((id) => { const g = G.parse(id); return g ? score(g) : -Infinity; }));
    return list.filter((id) => { const g = G.parse(id); return !g || score(g) >= best - O.SLACK; });
  };
  /**
   * Order picks so each clip sits in the cell it suits best (greedy, most-kept first, ties keep the pick order).
   * cellRatios: one ratio per slot. Returns a new array; clips with no size keep their order.
   */
  O.assign = function (picks, cellRatios) {
    if (!cellRatios || cellRatios.length !== picks.length) return picks.slice();
    const left = picks.slice(), out = [];
    for (const cr of cellRatios) {
      let bi = 0, bs = -1;
      left.forEach((m, i) => { const r = O.ratio(m.w, m.h); const s = r == null ? 0 : O.kept(cr, r); if (s > bs) { bs = s; bi = i; } });
      out.push(left.splice(bi, 1)[0]);
    }
    return out;
  };
  /**
   * The fill a cell really uses. An explicit mode wins. 'auto' gives blur when the clips' orientations are mixed,
   * and cover otherwise (cover leaves no black bars).
   */
  O.resolve = (fill, mixed) => (fill && fill !== 'auto' ? fill : mixed ? 'blur' : 'cover');
})();
