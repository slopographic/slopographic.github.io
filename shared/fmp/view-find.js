/* SlopFmpView.finder(grid, table): the "Find in this table" box. Enter finds the next row with the text in any cell
   (Shift+Enter the previous), looking at the pages already loaded first and then paging onward until it is found,
   round the end of the table once. The row is scrolled to and marked. A new text starts where the person is looking.
   Typing, Escape and destroy() stop a search under way. When shared/patterns is on the page a list beside the box finds a kind of
   text instead (an IP address, an e-mail address, a key...): the next row with a cell that holds one (and the box text, if any).
   → { el, destroy() }   Classic script, after view-grid.js. */
(function () {
  'use strict';
  const V = window.SlopFmpView;

  V.finder = function (grid) {
    const W = V.words(), n = grid.rowCount;
    const wrap = V.el('div', 'sfv-find', null, { role: 'search' });
    const input = V.el('input', 'sfv-find-in', null, { type: 'search', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'search' });
    W.attr(input, 'aria-label', () => V.tr('ui.fmp.find'));
    W.attr(input, 'placeholder', () => V.tr('ui.fmp.find'));
    const prev = V.el('button', 'sfv-btn', null, { type: 'button' }), next = V.el('button', 'sfv-btn', null, { type: 'button' });
    W.text(prev, () => V.tr('ui.fmp.find_prev'));
    W.text(next, () => V.tr('ui.fmp.find_next'));
    const status = V.el('span', 'sfv-find-st', null, { role: 'status', 'aria-live': 'polite' });
    const P = window.SlopPatterns;
    let kind = '', hit = '';   // kind: the kind of text chosen ('' is the box's own text); hit: the text found, to mark in the cell
    const sel = P && P.KINDS ? V.el('select', 'sfv-select sfv-find-kind', null, { 'aria-label': '' }) : null;
    if (sel) {
      const none = V.el('option', null, null, { value: '' });
      W.text(none, () => V.tr('ui.fmp.pattern_none'));
      sel.append(none);
      for (const k of P.KINDS) { const o = V.el('option', null, null, { value: k.id }); W.text(o, () => V.tr('ui.patterns.' + k.id)); sel.append(o); }
      W.attr(sel, 'aria-label', () => V.tr('ui.fmp.pattern'));
    }
    wrap.append(input, ...(sel ? [sel] : []), prev, next, status);
    let cur = null, lastQ = '', token = 0;
    const key = () => kind + '\u0000' + input.value.toLowerCase();

    const say = (key, vars) => { status.textContent = key ? V.tr(key, vars) : ''; };
    /** The first column of the row that holds q (lower case) or, with a kind chosen, a match of that kind that holds q, or -1. `hit` is the text to mark. */
    const colOf = (row, q) => {
      for (let i = 0; i < row.length; i++) {
        if (row[i] == null) continue;
        const text = String(row[i]);
        if (kind) { const m = P.scan(text, { kinds: [kind], limit: 50 }).find((x) => !q || x.text.toLowerCase().includes(q)); if (m) { hit = m.text; return i; } }
        else if (text.toLowerCase().includes(q)) { hit = q; return i; }
      }
      return -1;
    };

    async function run(dir) {
      const q = input.value.toLowerCase();
      if ((!q && !kind) || !n) { say(''); return; }
      const my = ++token;
      let row = (((cur !== null && key() === lastQ ? cur + dir : grid.topRow()) % n) + n) % n, left = n;
      say('ui.fmp.searching', { done: 0, total: n });
      try {
        while (left > 0) {
          const p = Math.floor(row / V.PAGE), rows = await grid.page(p);
          if (my !== token) return;
          const base = p * V.PAGE, before = left;
          let i = row - base;
          if (dir > 0) { for (; i < rows.length && left > 0; i++, left--) { const c = colOf(rows[i], q); if (c >= 0) return found(base + i, c); } }
          else { for (i = Math.min(i, rows.length - 1); i >= 0 && left > 0; i--, left--) { const c = colOf(rows[i], q); if (c >= 0) return found(base + i, c); } }
          if (left === before) break; // a page with fewer rows than the table says: nowhere further to look
          row = (((dir > 0 ? base + rows.length : base - 1) % n) + n) % n;
          say('ui.fmp.searching', { done: n - left, total: n });
        }
        cur = null;
        grid.clear();
        say('ui.fmp.not_found');
      } catch (e) {
        if (my === token) say('ui.fmp.find_failed');
      }
    }
    function found(row, col) {
      cur = row;
      lastQ = key();
      grid.show(row, col, hit);
      say('ui.fmp.found', { row: row + 1 });
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); run(e.shiftKey ? -1 : 1); }
      else if (e.key === 'Escape' && status.textContent) { token++; say(''); }
    });
    input.addEventListener('input', () => { token++; cur = null; grid.clear(); say(''); });
    if (sel) sel.addEventListener('change', () => { kind = sel.value; token++; cur = null; grid.clear(); say(''); if (kind) run(1); });
    prev.addEventListener('click', () => run(-1));
    next.addEventListener('click', () => run(1));
    return { el: wrap, destroy() { token++; W.destroy(); } };
  };
})();
