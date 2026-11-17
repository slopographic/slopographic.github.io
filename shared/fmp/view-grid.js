/* SlopFmpView.grid(db, table, o): the data grid of one table. Only the rows in view (plus a few more above and below)
   are in the page: the scroller is as tall as all the rows, and the rows drawn sit at their place in it. Rows come from
   db.rows(id, from, count) in pages of 200, kept in a small cache (the pages in view are never dropped); a placeholder
   row shows while its page loads. The first page sets the column widths (80 to 360 px). A table with so many rows that
   the scroller would pass what browsers can lay out (12 million px) is scrolled at a scale instead of row for row.
     o: { label? (the grid's accessible name), onFail?() (rows in view could not be read: told on each draw while that is so) }
     → { el, ready (Promise: first page in), rowCount, page(p) (Promise of that page's rows), show(row, col, query)
         (scrolls to the row and marks it), clear() (unmarks it), topRow(), retry() (read failed pages again), destroy() }
   Classic script, after view-util.js. */
(function () {
  'use strict';
  const V = window.SlopFmpView;
  const ROW_H = 28, PAGE = 200, OVER = 6, MAX_PAGES = 30, MAX_PX = 12e6, MIN_W = 80, MAX_W = 360, DEF_W = 140, SAMPLE = 60;
  V.PAGE = PAGE;

  /** The width of each column from its name, type and the first rows, between MIN_W and MAX_W (canvas text metrics). */
  function widthsFor(scroller, cols, rows) {
    let ctx = null;
    try { ctx = document.createElement('canvas').getContext('2d'); } catch (e) { /* no canvas: estimate by characters */ }
    const cs = getComputedStyle(scroller), size = cs.fontSize || '13px', fam = cs.fontFamily || 'system-ui';
    const wide = (s, weight) => { if (!ctx) return s.length * 7.4; ctx.font = weight + ' ' + size + ' ' + fam; return ctx.measureText(s).width; };
    return cols.map((c, ci) => {
      let m = Math.max(wide(c.name || '', 600), c.type ? wide(c.type, 400) : 0);
      for (let r = 0; r < Math.min(rows.length, SAMPLE); r++) { const v = rows[r] && rows[r][ci]; if (v) m = Math.max(m, wide(String(v).slice(0, 80), 400)); }
      return Math.max(MIN_W, Math.min(MAX_W, Math.ceil(m) + 30)); // 24 px of padding, and room for values a little longer than the first page's
    });
  }

  V.grid = function (db, table, o) {
    o = o || {};
    const cols = table.columns || [], n = Math.max(0, table.rowCount | 0);
    const typed = cols.some((c) => c.type), headH = typed ? 46 : 34;
    const k = Math.max(1, (n * ROW_H) / MAX_PX); // rows per scroll pixel, 1 unless the table is huge
    const cache = new Map(), failed = new Set(), W = V.words();
    let widths = cols.map(() => DEF_W), rnW = Math.max(48, String(n).length * 9 + 22);
    let dead = false, dirty = true, raf = 0, hit = null, win = { first: 0, last: -1 }, ro = null;

    const scroller = V.el('div', 'sfv-scroll', null, { tabindex: '0', role: 'grid', 'data-touch-surface': '', 'aria-rowcount': String(n + 1), 'aria-colcount': String(cols.length + 1) });
    if (o.label) scroller.setAttribute('aria-label', o.label);
    const sizer = V.el('div', 'sfv-sizer'), head = V.el('div', 'sfv-hrow', null, { role: 'row', 'aria-rowindex': '1' }), body = V.el('div', 'sfv-body');
    const rnHead = V.el('div', 'sfv-h sfv-n', '#', { role: 'columnheader', 'aria-colindex': '1' });
    W.attr(rnHead, 'aria-label', () => V.tr('ui.fmp.row_no'));
    sizer.append(head, body);
    scroller.append(sizer);

    const pageOf = (i) => Math.floor(i / PAGE);
    const schedule = () => { if (!raf && !dead) raf = requestAnimationFrame(render); };
    /** Draw again with what changed (a page came in, the widths, a marked row), not only because the scroll moved. */
    const redraw = () => { dirty = true; schedule(); };

    /** One page of rows: from the cache, or read now (the same promise for everyone who asks). */
    function load(p) {
      const have = cache.get(p);
      if (have) { cache.delete(p); cache.set(p, have); return Promise.resolve(have); } // most recently used goes last
      const from = p * PAGE, count = Math.max(0, Math.min(PAGE, n - from));
      const pr = Promise.resolve().then(() => db.rows(table.id, from, count)).then((rows) => {
        const list = Array.isArray(rows) ? rows : [];
        if (cache.get(p) === pr) cache.set(p, list);
        failed.delete(p);
        trim();
        return list;
      }, (e) => {
        if (cache.get(p) === pr) cache.delete(p);
        failed.add(p);
        throw e;
      });
      cache.set(p, pr);
      return pr;
    }
    /** Drops the oldest loaded pages beyond MAX_PAGES, except the ones in view and the one on each side. */
    function trim() {
      if (cache.size <= MAX_PAGES) return;
      const lo = pageOf(win.first) - 1, hi = pageOf(win.last) + 1;
      for (const p of Array.from(cache.keys())) {
        if (cache.size <= MAX_PAGES) break;
        if (Array.isArray(cache.get(p)) && (p < lo || p > hi)) cache.delete(p);
      }
    }

    function cellsOf(row, i) {
      const isHit = hit && hit.row === i, out = [];
      for (let c = 0; c < cols.length; c++) {
        const v = row[c] == null ? '' : String(row[c]);
        const d = V.el('div', 'sfv-c', v, { role: 'gridcell', 'aria-colindex': String(c + 2) });
        d.style.width = widths[c] + 'px';
        if (v) d.title = v; // the whole value, for text the cell cuts off
        if (isHit && hit.q && v.toLowerCase().includes(hit.q)) d.classList.add('sfv-m');
        out.push(d);
      }
      return out;
    }
    function rowEl(i) {
      const p = pageOf(i), data = cache.get(p), loaded = Array.isArray(data);
      const r = V.el('div', 'sfv-r' + (i % 2 ? ' sfv-odd' : '') + (hit && hit.row === i ? ' sfv-hit' : ''), null, { role: 'row', 'aria-rowindex': String(i + 2) });
      const num = V.el('div', 'sfv-n', String(i + 1), { role: 'rowheader' });
      num.style.width = rnW + 'px';
      r.append(num);
      if (loaded) r.append(...cellsOf(data[i - p * PAGE] || [], i));
      else { // a placeholder while the page loads
        const ph = V.el('div', 'sfv-c sfv-skel', null, { role: 'gridcell', 'aria-label': V.tr('ui.fmp.loading_rows') });
        ph.style.width = widths.reduce((a, b) => a + b, 0) + 'px';
        r.setAttribute('aria-busy', 'true');
        r.append(ph);
      }
      return r;
    }

    /** Draws the rows in view and asks for their pages (and the next one). */
    function render() {
      raf = 0;
      if (dead || !n) return;
      const H = scroller.clientHeight || 480, y = scroller.scrollTop;
      const vis = Math.max(1, Math.ceil((H - headH) / ROW_H) + 1);
      let r0 = Math.floor((y * k) / ROW_H), frac = (y * k) / ROW_H - r0;
      if (k > 1 && y >= scroller.scrollHeight - H - 1) { r0 = Math.max(0, n - vis + 1); frac = 0; } // the end of a huge table
      r0 = Math.min(r0, n - 1);
      const first = Math.max(0, r0 - OVER), last = Math.min(n - 1, r0 + vis + OVER);
      const same = first === win.first && last === win.last;
      win = { first, last };
      body.style.top = (k === 1 ? headH + first * ROW_H : headH + y - (frac + r0 - first) * ROW_H) + 'px';
      if (same && !dirty) return;
      dirty = false;
      const rows = [];
      for (let i = first; i <= last; i++) rows.push(rowEl(i));
      body.replaceChildren(...rows);
      for (let p = pageOf(first); p <= Math.min(pageOf(last) + 1, pageOf(n - 1)); p++) if (!cache.has(p) && !failed.has(p)) load(p).then(redraw, redraw);
      for (let p = pageOf(first); p <= pageOf(last); p++) if (failed.has(p) && o.onFail) { o.onFail(); break; } // rows in view that could not be read
    }

    /** The header and the sizes, from the widths known now. */
    function layout() {
      const total = rnW + widths.reduce((a, b) => a + b, 0);
      sizer.style.width = total + 'px';
      sizer.style.height = Math.ceil(headH + (n * ROW_H) / k + (n ? 0 : 64)) + 'px';
      head.style.height = headH + 'px';
      sizer.style.setProperty('--sfv-row', ROW_H + 'px');
      rnHead.style.width = rnW + 'px';
      head.replaceChildren(rnHead, ...cols.map((c, i) => {
        const h = V.el('div', 'sfv-h', null, { role: 'columnheader', 'aria-colindex': String(i + 2), title: c.type ? c.name + ' (' + c.type + ')' : c.name });
        h.style.width = widths[i] + 'px';
        h.append(V.el('span', 'sfv-hn', c.name));
        if (c.type) h.append(V.el('span', 'sfv-ht', c.type));
        return h;
      }));
      if (!n) {
        const none = V.el('div', 'sfv-empty');
        W.text(none, () => V.tr('ui.fmp.no_rows'));
        body.style.top = headH + 'px';
        body.replaceChildren(none);
      } else { dirty = true; render(); }
    }

    scroller.addEventListener('scroll', schedule, { passive: true });
    if (window.ResizeObserver) { ro = new ResizeObserver(schedule); ro.observe(scroller); }
    layout();
    const ready = n ? load(0).then((rows) => { if (!dead) { widths = widthsFor(scroller, cols, rows); layout(); } }, () => {}) : Promise.resolve();

    /** Scrolls row i (and the column col, when given) into view and marks the row; query marks the cells that match. */
    function show(row, col, query) {
      hit = { row, col, q: query || '' };
      dirty = true;
      const H = scroller.clientHeight || 480;
      scroller.scrollTop = Math.max(0, (row * ROW_H) / k + ROW_H / 2 - (H - headH) / 2);
      if (col != null && col >= 0) {
        const left = rnW + widths.slice(0, col).reduce((a, b) => a + b, 0), right = left + widths[col];
        if (left < scroller.scrollLeft + rnW) scroller.scrollLeft = left - rnW;
        else if (right > scroller.scrollLeft + scroller.clientWidth) scroller.scrollLeft = right - scroller.clientWidth;
      }
      render();
    }
    /** Takes the mark off the row found. */
    function clear() { hit = null; redraw(); }
    return {
      el: scroller, ready, rowCount: n, page: load, show, clear,
      topRow: () => Math.max(0, Math.min(n - 1, Math.floor((scroller.scrollTop * k) / ROW_H))),
      retry() { failed.clear(); redraw(); },
      destroy() { dead = true; if (raf) cancelAnimationFrame(raf); if (ro) ro.disconnect(); W.destroy(); cache.clear(); },
    };
  };
})();
