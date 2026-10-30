/* Slop Drive — ui/list-cols: the List view's columns. Pick which show (right-click the header), reorder them by
 * dragging a header, and resize one by dragging its right edge or with the arrow keys on that edge. The choice, the
 * order and the widths persist in the prefs (S.cols). On a phone only Name and Size show. */
'use strict';
(function (DR) {
  const S = DR.S, el = DR.el;
  const ALL = [
    // label: the English fallback; shown through DR.colLabel(key)
    { key: 'name', label: 'Name', sort: true, w: 320, min: 160 },   // i18n-ignore
    { key: 'type', label: 'Type', sort: true, w: 150, min: 70 },   // i18n-ignore
    { key: 'size', label: 'Size', sort: true, w: 90, min: 60 },   // i18n-ignore
    { key: 'modified', label: 'Modified', sort: true, w: 130, min: 70 },   // i18n-ignore
    { key: 'added', label: 'Added', sort: true, w: 130, min: 70 },   // i18n-ignore
    { key: 'opened', label: 'Opened', sort: true, w: 130, min: 70 },   // i18n-ignore
    { key: 'tags', label: 'Tags', w: 180, min: 70 },   // i18n-ignore
    { key: 'location', label: 'Location', w: 200, min: 70 },   // i18n-ignore
  ];
  const BY = Object.fromEntries(ALL.map((c) => [c.key, c]));
  const DEF_ON = ['name', 'type', 'size', 'modified', 'location'];
  const MAX_W = 1200;
  DR.LIST_COLS = ALL;

  /** The saved config, normalised: every known column once, in the saved order (new ones at the end). */
  function cfg() {
    const c = S.cols || (S.cols = {});
    const seen = new Set();
    c.order = [...(Array.isArray(c.order) ? c.order : []), ...ALL.map((x) => x.key)].filter((k) => BY[k] && !seen.has(k) && seen.add(k));
    c.on = c.on || {}; c.widths = c.widths || {};
    return c;
  }
  const shownOn = (k) => k === 'name' || (cfg().on[k] != null ? !!cfg().on[k] : DEF_ON.includes(k));
  const widthOf = (c) => Math.max(c.min, Math.min(MAX_W, cfg().widths[c.key] || c.w));
  const setWidth = (c, w) => { cfg().widths[c.key] = Math.round(Math.max(c.min, Math.min(MAX_W, w))); };

  /** The columns as shown now, in order. On a phone: Name and Size. */
  DR.listCols = function () {
    if (DR.isMobile()) return ['name', 'size'].map((k) => BY[k]);
    return cfg().order.filter(shownOn).map((k) => BY[k]);
  };
  /** grid-template-columns for the header and the rows; the last column takes the rest of the row. */
  DR.listTemplate = function () {
    if (DR.isMobile()) return 'minmax(0, 1fr) 70px';
    const cols = DR.listCols();
    return cols.map((c, i) => (i === cols.length - 1 ? `minmax(${widthOf(c)}px, 1fr)` : `${widthOf(c)}px`)).join(' ');
  };
  const where = (it) => (it.parent ? DR.pathOf(it.parent).map((f) => f.name).join(' / ') : DR.rootName());
  const CELL = {
    name: (it) => [DR.iconOf(it, 'badge sm'), el('span', { class: 'nm' }, it.name), it.starred ? DR.icon('star', 'ic st') : ''],
    type: (it) => DR.kindLabel(it),
    size: (it) => DR.fmtSize(DR.sizeOf(it)),
    modified: (it) => DR.fmtDate(it.modified || it.time),
    added: (it) => DR.fmtDate(it.time),
    opened: (it) => (it.opened ? DR.fmtDate(it.opened) : '—'),
    tags: (it) => (it.isFolder ? '' : DR.tagsOf(it).join(', ')),
    location: (it) => (S.section === 'trash' ? DR.fmtDate(it.trashedAt) : where(it)),
  };
  /** One cell of a row. */
  DR.listCell = function (key, it) {
    const v = CELL[key](it);
    return el('div', { class: 'c-' + key }, ...(Array.isArray(v) ? v : [v]));
  };

  /* ---------- header ---------- */
  DR.listHead = function () {
    const h = el('div', { class: 'lhead', role: 'row' });
    for (const c of DR.listCols()) h.append(headCell(c));
    return h;
  };
  function headCell(c) {
    const label = DR.colLabel(c.key === 'location' && S.section === 'trash' ? 'trashed' : c.key);
    const on = !!c.sort && S.section !== 'recent' && S.sort.key === c.key;
    const cell = el('div', { class: 'hcell c-' + c.key, role: 'columnheader', 'data-col': c.key, 'aria-sort': on ? (S.sort.dir > 0 ? 'ascending' : 'descending') : null });
    if (c.sort) {
      const b = el('button', { type: 'button', class: 'hcol' + (on ? ' on' : ''), 'data-sort': c.key, title: DR.t('drive.col.sort_tip', { label }) }, label,
        on ? el('span', { class: 'arrow', 'aria-hidden': 'true' }, S.sort.dir > 0 ? '▲' : '▼') : '');
      b.addEventListener('click', () => DR.sortClick(c.key));
      cell.append(b);
    } else cell.append(el('span', { class: 'hcol' }, label));
    const grip = el('span', { class: 'col-grip', role: 'separator', 'aria-orientation': 'vertical', 'aria-label': DR.t('drive.col.resize', { label }), 'aria-valuenow': String(widthOf(c)), tabindex: '0', 'data-grip': c.key });
    grip.addEventListener('pointerdown', (e) => startResize(e, c));
    grip.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault(); e.stopPropagation();
      setWidth(c, widthOf(c) + (e.key === 'ArrowRight' ? 10 : -10)); DR.savePrefs(); applyTemplate();
    });
    cell.addEventListener('pointerdown', (e) => { if (!e.target.closest('.col-grip')) startMove(e, c, cell); });
    cell.append(grip);
    return cell;
  }
  /** Keep the header and rows in step with the widths while a column is resized. */
  function applyTemplate() {
    const wrap = document.querySelector('#pane .files');
    if (wrap) wrap.style.setProperty('--cols', DR.listTemplate());
    for (const g of document.querySelectorAll('#pane [data-grip]')) { const c = BY[g.dataset.grip]; if (c) g.setAttribute('aria-valuenow', String(widthOf(c))); }
  }
  function startResize(e, c) {
    e.stopPropagation();
    if (e.button !== 0) return;
    e.preventDefault();
    const x0 = e.clientX, w0 = widthOf(c);
    const move = (ev) => { setWidth(c, w0 + ev.clientX - x0); applyTemplate(); };
    const up = () => { removeEventListener('pointermove', move); DR.savePrefs(); DR.render(); };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up, { once: true });
    addEventListener('pointercancel', up, { once: true });
  }
  /** Drag a header to a new place. The drop point is the header cell whose left edge the pointer has passed. */
  let movedAt = 0;
  function startMove(e, c, cell) {
    if (e.button !== 0 || e.pointerType === 'touch') return;
    const x0 = e.clientX, head = cell.parentElement;
    let moving = false, before = null;
    const move = (ev) => {
      if (!moving && Math.abs(ev.clientX - x0) < 6) return;
      moving = true;
      cell.classList.add('col-moving'); cell.style.transform = `translateX(${ev.clientX - x0}px)`;
      const others = [...head.querySelectorAll('.hcell')].filter((n) => n !== cell);
      const k = others.filter((n) => { const r = n.getBoundingClientRect(); return r.left + r.width / 2 < ev.clientX; }).length;
      before = k < others.length ? others[k].dataset.col : null;
      head.querySelectorAll('.col-drop').forEach((n) => n.classList.remove('col-drop'));
      if (before) head.querySelector(`[data-col="${before}"]`).classList.add('col-drop');
    };
    const up = () => {
      removeEventListener('pointermove', move);
      cell.classList.remove('col-moving'); cell.style.transform = '';
      head.querySelectorAll('.col-drop').forEach((n) => n.classList.remove('col-drop'));
      if (!moving) return;
      movedAt = Date.now();
      const order = cfg().order.filter((k) => k !== c.key), i = before ? order.indexOf(before) : order.length;
      order.splice(i, 0, c.key);
      cfg().order = order; DR.savePrefs(); DR.render();
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up, { once: true });
    addEventListener('pointercancel', up, { once: true });
  }
  // A header drag must not also sort: swallow the click that ends it.
  document.addEventListener('click', (e) => {
    if (Date.now() - movedAt < 400 && e.target.closest && e.target.closest('.lhead')) { e.stopPropagation(); e.preventDefault(); }
  }, true);

  /** The header's right-click menu: which columns show, and reset. */
  DR.columnRows = function () {
    return [
      ...ALL.map((x) => ({ label: DR.colLabel(x.key), check: shownOn(x.key), disabled: x.key === 'name', act: () => { cfg().on[x.key] = !shownOn(x.key); DR.savePrefs(); DR.render(); } })),
      '-',
      { label: DR.t('drive.col.reset'), act: () => { S.cols = {}; DR.savePrefs(); DR.render(); } },
    ];
  };
})(window.DR);
