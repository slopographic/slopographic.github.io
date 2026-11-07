/* SlopViewModeGrid: the grid measuring behind SlopViewMode (viewmode.js). When a region hides, these find which tracks
 * of its grid container it gives back and which track takes the freed space. Classic script; load it before viewmode.js.
 * Sets window.SlopViewModeGrid = { shown, isGrid, tracks, overlap, giveBack, flowGrid, fillTrack }. */
(function (win) {
  'use strict';
  if (win.SlopViewModeGrid) return;
  /** Is the element laid out in its parent (not display:none, not taken out of the flow)? */
  const shown = (n) => { const cs = win.getComputedStyle(n); return cs.display !== 'none' && cs.position !== 'fixed' && cs.position !== 'absolute'; };
  const isGrid = (n) => /grid$/.test(win.getComputedStyle(n).display);

  /** The tracks of a grid container, as [start, end] in window pixels, measured in the current layout. */
  function tracks(P, axis) {
    const cs = win.getComputedStyle(P), x = axis === 'col';
    const sizes = (x ? cs.gridTemplateColumns : cs.gridTemplateRows).split(/\s+/).filter((t) => /px$/.test(t)).map(parseFloat);
    const gap = parseFloat(x ? cs.columnGap : cs.rowGap) || 0;
    const box = P.getBoundingClientRect();
    let pos = x ? box.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft)
      : box.top + parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop);
    return sizes.map((s) => { const t = { a: pos, b: pos + s }; pos += s + gap; return t; });
  }
  const overlap = (a1, b1, a2, b2) => Math.min(b1, b2) - Math.max(a1, a2);

  /** Which tracks a hidden region gives back: the ones it alone covers on that axis. An item that spans the whole axis
   *  (a full-width toolbar) is not in the way: it simply gets narrower with the track. */
  function giveBack(list, a, b, others, axis) {
    const lo = axis === 'x' ? 'left' : 'top', hi = axis === 'x' ? 'right' : 'bottom';
    const out = new Set();
    if (!list.length) return out;
    const first = list[0].a, last = list[list.length - 1].b;
    const covered = list.map((t) => overlap(t.a, t.b, a, b) > 1);
    if (covered.every(Boolean)) return out;   // the hidden region spans the whole axis: nothing to give back
    const blockers = others.filter((o) => !(o[lo] <= first + 1 && o[hi] >= last - 1));
    list.forEach((t, i) => {
      if (covered[i] && !blockers.some((o) => overlap(t.a, t.b, o[lo], o[hi]) > 1)) out.add(i);
    });
    return out;
  }
  /** Is this grid placed by flow (no named areas, no explicit lines) with one item per track on this axis? */
  function flowGrid(P, trackCount) {
    const cs = win.getComputedStyle(P);
    if (cs.gridTemplateAreas !== 'none') return false;
    const kids = [...P.children].filter(shown);   // display:none items take no track
    if (!trackCount || kids.length !== trackCount) return false;
    return !kids.some((c) => { const k = win.getComputedStyle(c); return k.gridColumnStart !== 'auto' || k.gridRowStart !== 'auto'; });
  }
  /** The track the freed space goes to: the one under the largest shown item that is not given back. */
  function fillTrack(list, kids, axis, zero, fillEl) {
    const best = fillEl || kids.reduce((m, k) => (!m || k.width * k.height > m.width * m.height ? k : m), null);
    if (!best) return -1;
    const mid = axis === 'x' ? best.left + best.width / 2 : best.top + best.height / 2;
    const i = list.findIndex((t) => mid >= t.a && mid <= t.b);
    return i >= 0 && !zero.has(i) ? i : -1;
  }

  win.SlopViewModeGrid = { shown, isGrid, tracks, overlap, giveBack, flowGrid, fillTrack };
})(window);
