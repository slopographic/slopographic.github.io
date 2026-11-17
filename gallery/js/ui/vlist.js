/* Slop Gallery: a virtual list. Only the rows that are on screen (plus a margin) exist in the DOM, so 10,000 photos stay
 * smooth. Rows carry their own top and height (see ui/rows.js); lookup of the visible range is a binary search.
 *   const v = createVlist({ scroller, content, render(row) -> Element, onScroll(scrollTop) })
 *   v.setRows(rows), v.refresh(), v.scrollToIndex(i), v.rendered(), v.destroy()
 * Classic script, exposes window.SlopGallery.createVlist. */
(function () {
  'use strict';
  const G = (window.SlopGallery = window.SlopGallery || {});
  const OVERSCAN = 600; // px above and below the viewport

  function createVlist({ scroller, content, render, onScroll = () => {} }) {
    let rows = [], total = 0, els = new Map(), raf = 0;

    /** First index whose bottom edge is below y. */
    function lowerBound(y) {
      let lo = 0, hi = rows.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (rows[mid].top + rows[mid].h <= y) lo = mid + 1; else hi = mid; }
      return lo;
    }
    function refresh() {
      raf = 0;
      const st = scroller.scrollTop, vh = scroller.clientHeight || 800;
      const from = lowerBound(Math.max(0, st - OVERSCAN));
      let to = from;
      const top = st + vh + OVERSCAN;
      while (to < rows.length && rows[to].top < top) to++;
      const want = new Map();
      for (let i = from; i < to; i++) want.set(rows[i].key, rows[i]);
      for (const [key, el] of els) if (!want.has(key)) { el.remove(); els.delete(key); }
      for (const [key, row] of want) {
        if (els.has(key)) continue;
        const el = render(row);
        el.style.position = 'absolute';
        el.style.left = '0';
        el.style.right = '0';
        el.style.top = row.top + 'px';
        el.style.height = row.h + 'px';
        el.dataset.rowKey = key;
        content.append(el);
        els.set(key, el);
      }
      onScroll(st);
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(refresh); };
    scroller.addEventListener('scroll', schedule, { passive: true });

    return {
      setRows(next) {
        rows = next;
        const last = rows[rows.length - 1];
        total = last ? last.top + last.h : 0;
        content.style.height = total + 'px';
        // A new row set may change what a key shows, so every rendered row is rebuilt.
        for (const el of els.values()) el.remove();
        els = new Map();
        refresh();
      },
      refresh,
      scrollToIndex(i) {
        const r = rows[Math.max(0, Math.min(rows.length - 1, i))];
        if (!r) return;
        if (r.top < scroller.scrollTop) scroller.scrollTop = r.top;
        else if (r.top + r.h > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = r.top + r.h - scroller.clientHeight;
        refresh();
      },
      rowIndexOf(key) { return rows.findIndex((r) => r.key === key); },
      rendered() { return els.size; },
      get rows() { return rows; },
      get height() { return total; },
      destroy() { scroller.removeEventListener('scroll', schedule); if (raf) cancelAnimationFrame(raf); for (const el of els.values()) el.remove(); els.clear(); },
    };
  }

  G.createVlist = createVlist;
})();
