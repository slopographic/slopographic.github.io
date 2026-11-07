/* Slop Gallery: turns month groups into virtual-list rows. A month header is one row; every `cols` photos form one
 * tile row. Each tile knows its global index (its place in the whole list), which keyboard navigation uses.
 * Exposes window.SlopGallery.rows.build(groups, { cols, cell, gap, headH }) -> { rows, heads, count }. */
(function () {
  'use strict';
  const G = (window.SlopGallery = window.SlopGallery || {});

  /** groups: [{ key, label, items }]. cell: tile edge in px. Returns rows with absolute top and height. */
  function build(groups, { cols = 3, cell = 120, gap = 4, headH = 40 } = {}) {
    const rows = [], heads = [];
    let top = 0, idx = 0;
    const c = Math.max(1, cols | 0);
    for (const g of groups) {
      const head = { key: 'h:' + g.key, kind: 'head', label: g.label, count: g.items.length, top, h: headH };
      rows.push(head); heads.push(head);
      top += headH;
      for (let i = 0, n = 0; i < g.items.length; i += c, n++) {
        const items = g.items.slice(i, i + c).map((meta) => ({ meta, idx: idx++ }));
        rows.push({ key: 't:' + g.key + ':' + n, kind: 'tiles', items, top, h: cell + gap, cell, gap, monthKey: g.key });
        top += cell + gap;
      }
      top += gap;
    }
    return { rows, heads, count: idx };
  }

  G.rows = { build };
})();
