// SlopList: the record list every business app shows (orders, invoices, expenses, customers...). One row per record: a
// title, an amount on the right, and a line of meta (text and status chips). A click or Enter opens a row; the arrow keys,
// Home and End move between rows; right-click or the Menu key opens the row's menu (SlopCtx when the page has it, else
// SlopUI.menu). The app gives the rows; the list draws them, the count and the empty message. Styles: shared/ui/list.css.
// Classic script. Exposes window.SlopList.mount(host, opts) -> { set(rows), rows(), focusRow(i), destroy() }.
//   opts: { key = 'id', label, count: the count line, an i18n plural family ('expenses.li.count' with '#one', '#few',
//           ...: SlopI18n.t(key, { n }) picks the form, so "2 faktury" and "5 faktur" both read right) or count(n);
//           without one "3 items" (ui.list.count),
//           empty (text, or an element such as a message with a button),
//           label and a text empty may be i18n keys (SlopI18n.label): drawn again on a language change,
//           summary (an element for the count), open(rec), menu(rec) -> SlopUI menu items,
//           row(rec) -> { title, amount, meta: [string | { chip, cls }], cls, selected (the record shown beside the list) } }
(function (g) {
  'use strict';
  /** A word from the shared tables (shared/i18n/ui), the key without SlopI18n. */
  const tr = (key, vars) => (globalThis.SlopI18n ? globalThis.SlopI18n.t(key, vars) : key);
  /** A word the app gave: an i18n key, a function or its own text. */
  const lab = (v) => { const I = globalThis.SlopI18n; return I && I.label ? I.label(v) : typeof v === 'function' ? v() : v; };
  const doc = g.document;

  function el(tag, cls, text) { const n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

  /** One row's element from the app's description of it. */
  function rowEl(rec, d, key) {
    const r = el('div', 'sl-row' + (d.cls ? ' ' + d.cls : '') + (d.selected ? ' is-selected' : ''));
    r.setAttribute('role', 'listitem'); r.tabIndex = -1; r.dataset.key = String(rec[key]);
    if (d.selected) r.setAttribute('aria-current', 'true');
    r.append(el('span', 'sl-title', d.title || ''));
    if (d.amount != null) r.append(el('span', 'sl-amount', d.amount));
    const meta = (d.meta || []).filter((m) => m != null && m !== '');
    if (meta.length) {
      const m = el('div', 'sl-meta');
      for (const x of meta) m.append(typeof x === 'string' ? el('span', null, x) : el('span', 'sl-chip' + (x.cls ? ' ' + x.cls : ''), x.chip));
      r.append(m);
    }
    return r;
  }

  function mount(host, opts = {}) {
    const key = opts.key || 'id';
    const box = el('div', 'sl-list' + (opts.open ? '' : ' is-static'));
    const own = !(opts.empty && opts.empty.nodeType), empty = own ? el('p', 'sl-empty') : opts.empty;
    /** "3 expenses": the app's plural family (a key, or a function of n), else "3 items". */
    const countText = (n) => (typeof opts.count === 'function' ? opts.count(n) : tr(opts.count || 'ui.list.count', { n }));
    box.setAttribute('role', 'list');
    let recs = [], drawn = false;   // drawn: set() has run (the count shows from then on)
    /** The list's own words, in the current language (again on every switch). */
    function words() {
      if (opts.label) box.setAttribute('aria-label', lab(opts.label));
      if (own) empty.textContent = opts.empty ? lab(opts.empty) : tr('ui.list.empty_any');
      if (opts.summary && drawn) opts.summary.textContent = countText(recs.length);
    }
    words();
    const I = g.SlopI18n, offLang = I && I.on ? I.on(words) : null;
    empty.hidden = true;
    host.replaceChildren(box, empty);
    let byKey = new Map(), active = 0;

    const rowsEls = () => [...box.children];
    const recOf = (node) => { const r = node && node.closest ? node.closest('.sl-row') : null; return r ? byKey.get(r.dataset.key) : null; };
    /** Moves the keyboard focus to row i (one row is tabbable at a time). */
    function focusRow(i, focus = true) {
      const els = rowsEls(); if (!els.length) return;
      active = Math.max(0, Math.min(els.length - 1, i));
      els.forEach((n, j) => { n.tabIndex = j === active ? 0 : -1; });
      if (focus) els[active].focus();
    }
    function openMenu(rec, x, y) {
      const items = opts.menu ? opts.menu(rec) : null;
      if (items && items.length && g.SlopUI) g.SlopUI.menu(items, x, y);
    }

    box.addEventListener('click', (e) => { const rec = recOf(e.target); if (rec && opts.open) opts.open(rec); });
    box.addEventListener('keydown', (e) => {
      const els = rowsEls(), i = els.indexOf(e.target);
      if (i < 0) return;
      const rec = byKey.get(e.target.dataset.key);
      if (e.key === 'Enter' && opts.open) { e.preventDefault(); opts.open(rec); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); focusRow(i + (e.key === 'ArrowDown' ? 1 : -1)); }
      else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); focusRow(e.key === 'Home' ? 0 : els.length - 1); }
      else if (!g.SlopCtx && (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey))) {
        e.preventDefault(); const b = e.target.getBoundingClientRect(); openMenu(rec, b.left + 16, b.bottom);
      }
    });
    if (opts.menu && g.SlopCtx) g.SlopCtx.bind(box, (t) => { const rec = recOf(t); return rec ? opts.menu(rec) : null; });
    else if (opts.menu) box.addEventListener('contextmenu', (e) => { const rec = recOf(e.target); if (rec) { e.preventDefault(); openMenu(rec, e.clientX, e.clientY); } });

    /** Draws the rows (in the given order), the count and the empty message. Keeps the focused row where it can. */
    function set(list) {
      const had = box.contains(doc.activeElement);
      recs = list || []; drawn = true; byKey = new Map(recs.map((r) => [String(r[key]), r]));
      box.replaceChildren(...recs.map((r) => rowEl(r, opts.row ? opts.row(r) : { title: String(r[key]) }, key)));
      empty.hidden = recs.length > 0;
      if (opts.summary) opts.summary.textContent = countText(recs.length);
      focusRow(Math.min(active, recs.length - 1), had);
    }

    return { set, rows: () => recs.slice(), focusRow, element: box, destroy() { if (offLang) offLang(); host.replaceChildren(); } };
  }

  g.SlopList = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
