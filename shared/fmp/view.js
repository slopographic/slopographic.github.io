/* SlopFmpView: a read-only viewer for an opened FileMaker file (the Db that SlopFmp.open resolves, shared/fmp). Classic
   script. It draws, into a host element: a header (title, the format's label, "N tables"), a table picker (tabs, or a
   select for more than 8 tables), and for the chosen table a toolbar (Find in this table, the row and column count,
   Export) over the data grid (view-grid.js: rows are fetched in pages as they scroll into view). Words are SlopI18n keys
   ui.fmp.* (English in view-util.js). The styles are view.css, added to the page when it has no link to it.
   Load the files in this order: view-util.js, view-error.js, view-grid.js, view-find.js, view-export.js, view.js; or
   view-load.js alone, whose SlopFmpView.load() and SlopFmpView.show() load the reader and all of these on first use.
     SlopFmpView.mount(host, db, { title?, outtake?, from? }) → { destroy(), select(i), el }
         title: the file's name in the header. outtake: false leaves out the Export button (default true). from: the
         app's id, for the Export menu's SlopOuttake items (default: the page's own).
         The viewer does not close db: whoever opened it does (db.close()).
     SlopFmpView.mountError(host, err, { name? }) → { destroy() }     the screen for an open() that failed (view-error.js) */
(function () {
  'use strict';
  const V = window.SlopFmpView;
  const MAX_TABS = 8; // more tables than this are picked from a select
  let seq = 0;

  V.mount = function (host, db, opts) {
    opts = opts || {};
    V.css();
    const W = V.words(), id = 'sfv' + (++seq), tables = (db && db.tables) || [];
    const title = () => opts.title || V.tr('ui.fmp.untitled');
    const root = V.el('section', 'sfv');
    W.attr(root, 'aria-label', () => V.tr('ui.fmp.region', { name: title() }));
    const heading = V.el('div', 'sfv-title', null, { role: 'heading', 'aria-level': '2' });
    W.text(heading, title);
    W.attr(heading, 'title', title);
    const count = V.el('span', 'sfv-tcount');
    W.text(count, () => V.tr('ui.fmp.tables', { n: tables.length }));
    const top = V.el('div', 'sfv-top'), picker = V.el('div', 'sfv-picker'), panel = V.el('div', 'sfv-panel', null, { id: id + '-p' });
    top.append(heading, V.el('span', 'sfv-fmt', (db && (db.label || db.format)) || ''), count);
    root.append(top, picker);
    const bar = V.el('div', 'sfv-bar'), findSlot = V.el('div', 'sfv-slot'), info = V.el('span', 'sfv-info'), exportSlot = V.el('div', 'sfv-slot');
    bar.append(findSlot, info, exportSlot);
    const warn = V.el('div', 'sfv-alert', null, { role: 'alert' });
    warn.hidden = true;
    const retry = V.el('button', 'sfv-btn', null, { type: 'button' });
    const alertText = V.el('span');
    W.text(alertText, () => V.tr('ui.fmp.rows_failed'));
    W.text(retry, () => V.tr('ui.fmp.retry'));
    warn.append(alertText, retry);

    let cur = null, dead = false, tabs = [], select = null;
    const tabId = (i) => id + '-t' + i;
    const infoText = () => (cur ? V.tr('ui.fmp.rows', { n: cur.table.rowCount }) + ' · ' + V.tr('ui.fmp.columns', { n: (cur.table.columns || []).length }) : '');
    W.text(info, infoText);

    /** Shows table i: a new grid, find box and export button; the old ones are taken down. */
    function pick(i) {
      if (dead || !tables[i]) return;
      if (cur) { cur.finder.destroy(); cur.grid.destroy(); if (cur.exp) cur.exp.destroy(); }
      warn.hidden = true;
      const table = tables[i];
      const grid = V.grid(db, table, { label: table.name, onFail: () => { warn.hidden = false; } });
      cur = { i, table, grid, finder: V.finder(grid, table), exp: opts.outtake === false ? null : V.exporter(db, table, { from: opts.from }) };
      panel.replaceChildren(grid.el);
      findSlot.replaceChildren(cur.finder.el);
      exportSlot.replaceChildren(...(cur.exp ? [cur.exp.el] : []));
      tabs.forEach((b, j) => { b.setAttribute('aria-selected', j === i ? 'true' : 'false'); b.tabIndex = j === i ? 0 : -1; });
      if (tabs.length) panel.setAttribute('aria-labelledby', tabId(i));
      if (select) select.value = String(i);
      info.textContent = infoText();
    }
    retry.addEventListener('click', () => { warn.hidden = true; if (cur) cur.grid.retry(); });

    if (!tables.length) {
      const none = V.el('p', 'sfv-empty');
      W.text(none, () => V.tr('ui.fmp.no_tables'));
      panel.append(none);
    } else if (tables.length <= MAX_TABS) {
      const list = V.el('div', 'sfv-tabs', null, { role: 'tablist' });
      W.attr(list, 'aria-label', () => V.tr('ui.fmp.tables_aria'));
      tabs = tables.map((tb, i) => {
        const b = V.el('button', 'sfv-tab', null, { type: 'button', role: 'tab', id: tabId(i), 'aria-controls': id + '-p', 'aria-selected': 'false', tabindex: '-1', title: tb.name });
        b.append(V.el('span', 'sfv-tn', tb.name), V.el('span', 'sfv-tr', V.num(tb.rowCount || 0)));
        b.addEventListener('click', () => pick(i));
        return b;
      });
      list.append(...tabs);
      list.addEventListener('keydown', (e) => {
        const last = tabs.length - 1, at = cur ? cur.i : 0;
        const to = { ArrowRight: at >= last ? 0 : at + 1, ArrowLeft: at <= 0 ? last : at - 1, Home: 0, End: last }[e.key];
        if (to == null) return;
        e.preventDefault();
        pick(to);
        tabs[to].focus();
      });
      panel.setAttribute('role', 'tabpanel');
      picker.append(list);
    } else {
      select = V.el('select', 'sfv-select');
      W.attr(select, 'aria-label', () => V.tr('ui.fmp.table_pick'));
      tables.forEach((tb, i) => select.append(V.el('option', null, tb.name + ' (' + V.num(tb.rowCount || 0) + ')', { value: String(i) })));
      select.addEventListener('change', () => pick(Number(select.value)));
      picker.append(select);
    }
    root.append(bar, warn, panel);
    host.replaceChildren(root);
    if (tables.length) pick(0);
    else bar.hidden = true;

    return {
      el: root,
      select: pick,
      destroy() {
        if (dead) return;
        dead = true;
        if (cur) { cur.finder.destroy(); cur.grid.destroy(); if (cur.exp) cur.exp.destroy(); }
        W.destroy();
        root.remove();
      },
    };
  };
})();
