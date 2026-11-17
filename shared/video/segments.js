/* Shared video core (window.SlopVideo.segments): layout switches over time. A timeline is a list of
   switches { start, layout } (layout is a template id: a named one or 'grid-RxC'). Each switch holds until
   the next one; the last holds until the end. norm() turns the list into segments
   { start, end, layout, slots } that cover [0, total). Every function here is pure: it returns new arrays. */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const SV = (root.SlopVideo = root.SlopVideo || {});
  const SEG = (SV.segments = {});
  const T = SV.templates;
  const EPS = 1e-6;

  /** Switches sorted by start, duplicate starts resolved (last wins), unknown layouts dropped, start >= 0. */
  SEG.clean = function (list) {
    const byStart = new Map();
    for (const s of Array.isArray(list) ? list : []) {
      if (!s || !T.get(s.layout)) continue;
      const start = Math.max(0, +s.start || 0);
      byStart.set(Math.round(start * 1000) / 1000, { start: Math.round(start * 1000) / 1000, layout: T.get(s.layout).id });
    }
    return [...byStart.values()].sort((a, b) => a.start - b.start);
  };
  /** Segments over [0, total): each { start, end, layout, slots }. A layout before the first switch is none. */
  SEG.norm = function (list, total) {
    const sw = SEG.clean(list).filter((s) => s.start < total - EPS);
    if (!sw.length) return [];
    return sw.map((s, i) => {
      const end = i + 1 < sw.length ? sw[i + 1].start : total;
      return { start: s.start, end, layout: s.layout, slots: T.slotCount(s.layout) };
    });
  };
  /** The segment active at time t (or null). */
  SEG.at = function (segs, t) {
    for (const s of segs) if (t >= s.start - EPS && t < s.end - EPS) return s;
    return segs.length && t >= segs[segs.length - 1].end - EPS ? null : (segs[0] || null);
  };
  /** Add (or replace the one at the same start) a switch. */
  SEG.add = (list, start, layout) => SEG.clean((list || []).concat([{ start, layout }]));
  /** Move switch i to a new start. Returns the cleaned list (the switch keeps its layout). */
  SEG.move = function (list, i, start) {
    const c = SEG.clean(list);
    if (!c[i]) return c;
    c[i] = { start: Math.max(0, start), layout: c[i].layout };
    return SEG.clean(c);
  };
  /** Remove switch i. */
  SEG.remove = (list, i) => SEG.clean(SEG.clean(list).filter((_, k) => k !== i));
  /** Largest slot count over the segments (1 when there are none). */
  SEG.maxSlots = (segs) => segs.reduce((m, s) => Math.max(m, s.slots), 1);
})();
