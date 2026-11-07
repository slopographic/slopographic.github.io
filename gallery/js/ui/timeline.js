/* Slop Gallery: the timeline. Photos grouped by month, newest first, with a sticky month header and a virtual grid.
 * Click opens the viewer; ctrl/cmd or shift click (or select mode) toggles selection; arrow keys move between tiles.
 * It also owns the visible order (visibleIds) that the viewer and Sort mode use as their queue.
 * Exposes window.SlopGallery.timeline. */
(function () {
  'use strict';
  const G = (window.SlopGallery = window.SlopGallery || {});
  const GAP = 4, HEAD_H = 40;
  let els = null, vl = null, cur = { ids: [], rows: [], heads: [], cols: 1, cell: 120, count: 0 };
  let lastCols = -1, lastCell = -1, lastKey = '';

  const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
  const I = () => window.SlopI18n || null;
  const nPhotos = (n) => (I() ? t('gallery.grid.photos_n', { n }) : n + (n === 1 ? ' photo' : ' photos'));
  /** A group's heading in the chosen language: the month (Intl) or the People group; English without SlopI18n. */
  const GROUPS = { 'faces-1': 'gallery.people.group_faces_1', 'faces-2': 'gallery.people.group_faces_2', 'faces-0': 'gallery.people.group_faces_0' };
  function labelOf(g, people) {
    if (!I()) return g.label;
    if (people) return GROUPS[g.key] ? t(GROUPS[g.key]) : g.label;
    const [y, m] = g.key.split('-').map(Number);
    return isFinite(y) && isFinite(m) ? I().date(new Date(y, m - 1, 1), { month: 'long', year: 'numeric' }) : g.label;
  }
  const tileSize = () => (window.matchMedia && matchMedia('(max-width: 600px)').matches ? 104 : 150);

  /** The filtered, newest-first photo list for the current view and filters. */
  function photos() {
    const L = G.library, st = G.state.state;
    const base = G.query.sortNewest(L.list());
    const shown = G.query.filter(base, st.query, L.albums());
    if (st.view === 'dupes') return G.query.dupeGroups(L.list()).flatMap((g) => g.items).sort((a, b) => (a.sha < b.sha ? -1 : a.sha > b.sha ? 1 : 0));
    if (st.view === 'people') return G.people.checked(shown);
    return shown;
  }
  function layout() {
    const w = Math.max(120, els.scroller.clientWidth - 16);
    const target = tileSize();
    const cols = Math.max(1, Math.floor((w + GAP) / (target + GAP)));
    const cell = Math.floor((w - GAP * (cols - 1)) / cols);
    return { cols, cell };
  }

  function tileEl(item, cell) {
    const m = item.meta, st = G.state.state;
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'tile' + (st.selected.has(m.id) ? ' sel' : '');
    tile.dataset.id = m.id;
    tile.dataset.idx = String(item.idx);
    tile.tabIndex = -1;
    tile.setAttribute('aria-label', m.name + ', ' + new Date(m.takenAt || 0).toLocaleDateString(I() && I().get() !== 'en' ? I().get() : undefined));
    tile.style.width = cell + 'px'; tile.style.height = cell + 'px';
    const img = document.createElement('img');
    img.alt = ''; img.decoding = 'async'; img.draggable = false;
    G.urls.thumb(m.id).then((u) => { if (u && tile.isConnected) img.src = u; });
    tile.append(img);
    if (m.fav) tile.insertAdjacentHTML('beforeend', '<span class="mk fav" aria-hidden="true">★</span>');
    if (m.liked) tile.insertAdjacentHTML('beforeend', '<span class="mk ' + m.liked + '" aria-hidden="true"></span>');
    tile.insertAdjacentHTML('beforeend', '<span class="tick" aria-hidden="true"></span>');
    return tile;
  }
  function renderRow(row) {
    if (row.kind === 'head') {
      const h = document.createElement('div');
      h.className = 'vhead';
      h.dataset.month = row.key;
      h.innerHTML = '<span class="vhead-l"></span><span class="vhead-n"></span>';
      h.firstChild.textContent = row.label;
      h.lastChild.textContent = nPhotos(row.count);
      return h;
    }
    const r = document.createElement('div');
    r.className = 'vrow';
    r.style.gridTemplateColumns = `repeat(${row.items.length ? cur.cols : 1}, ${row.cell}px)`;
    r.style.gap = GAP + 'px';
    for (const it of row.items) r.append(tileEl(it, row.cell));
    return r;
  }

  function onScroll(st) {
    const heads = cur.heads;
    let lo = 0, hi = heads.length - 1, found = null;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (heads[mid].top <= st + 1) { found = heads[mid]; lo = mid + 1; } else hi = mid - 1; }
    els.sticky.hidden = !found;
    if (found) {
      const label = els.sticky.querySelector('.sticky-l'), n = els.sticky.querySelector('.sticky-n');
      if (label.textContent !== found.label) label.textContent = found.label;
      const txt = nPhotos(found.count);
      if (n.textContent !== txt) n.textContent = txt;
    }
  }

  /** Recomputes the list and the rows. Called on library, filter and view changes, and when the width changes. */
  function render() {
    if (!vl) return;
    const list = photos();
    const people = G.state.state.view === 'people';
    const { cols, cell } = layout();
    // People groups by face count (core/people.js); every other view groups by month. The grid order is the groups' order.
    const groups = (people ? G.people.groups(list) : G.query.groupMonths(list)).map((g) => Object.assign({}, g, { label: labelOf(g, people) }));
    const ids = groups.flatMap((g) => g.items.map((m) => m.id));
    const key = ids.length + '|' + cols + '|' + cell + '|' + ids.join(',') + (people ? '|people|' + groups.map((g) => g.key + ':' + g.items.length).join(',') : '') + '|' + (I() ? I().get() : '');
    const sameLayout = key === lastKey;
    lastKey = key;
    if (!sameLayout || cols !== lastCols || cell !== lastCell) {
      const built = G.rows.build(groups, { cols, cell, gap: GAP, headH: HEAD_H });
      cur = { ids, rows: built.rows, heads: built.heads, cols, cell, count: built.count };
      lastCols = cols; lastCell = cell;
      vl.setRows(built.rows);
    }
    G.state.pruneSelection({ has: (id) => !!G.library.photo(id) }); // hidden by a filter is not gone: only removed photos leave the selection
    els.empty.hidden = people || list.length > 0 || !G.library.loaded; // People explains its own empty state in the bar
    els.empty.querySelector('[data-empty-text]').textContent = t(G.library.size ? 'gallery.grid.empty_filtered' : 'gallery.grid.empty');
    for (const n of els.empty.querySelectorAll('[data-empty-intro]')) n.hidden = G.library.size > 0; // the preview is for an empty library
    markSelection();
  }
  function markSelection() {
    const sel = G.state.state.selected;
    for (const tile of els.content.querySelectorAll('.tile')) tile.classList.toggle('sel', sel.has(tile.dataset.id));
    const vars = { shown: cur.ids.length, total: G.library.size, sel: sel.size };
    els.status.textContent = G.library.size ? t(sel.size ? 'gallery.grid.status_sel' : 'gallery.grid.status', vars) : '';
  }

  function tileOf(target) { return target && target.closest ? target.closest('.tile') : null; }
  function openAt(idx) { G.viewer && G.viewer.open(cur.ids, idx); }
  function onClick(e) {
    const tile = tileOf(e.target);
    if (!tile) return;
    const id = tile.dataset.id, st = G.state.state;
    if (e.ctrlKey || e.metaKey || e.shiftKey || st.selectMode) {
      if (e.shiftKey && st.lastId && cur.ids.includes(st.lastId)) {
        const a = cur.ids.indexOf(st.lastId), b = cur.ids.indexOf(id);
        G.state.select(cur.ids.slice(Math.min(a, b), Math.max(a, b) + 1), true);
      } else G.state.select(id, !st.selected.has(id));
      st.lastId = id;
      markSelection();
      return;
    }
    st.lastId = id;
    openAt(Number(tile.dataset.idx));
  }
  function onKey(e) {
    const tile = tileOf(document.activeElement);
    if (e.key === 'Enter' && tile) { e.preventDefault(); openAt(Number(tile.dataset.idx)); return; }
    if (e.key === ' ' && tile) { e.preventDefault(); G.state.select(tile.dataset.id, !G.state.state.selected.has(tile.dataset.id)); markSelection(); return; }
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cur.cols, ArrowUp: -cur.cols }[e.key];
    if (!step) return;
    e.preventDefault();
    const from = tile ? Number(tile.dataset.idx) : -1;
    const to = Math.max(0, Math.min(cur.ids.length - 1, from < 0 ? 0 : from + step));
    focusIndex(to);
  }
  function focusIndex(i) {
    const id = cur.ids[i];
    if (id == null) return;
    const rowIdx = cur.rows.findIndex((r) => r.kind === 'tiles' && r.items.some((x) => x.idx === i));
    if (rowIdx < 0) return;
    vl.scrollToIndex(rowIdx);
    requestAnimationFrame(() => {
      const el = els.content.querySelector(`.tile[data-id="${CSS.escape(id)}"]`);
      if (el) { els.content.querySelectorAll('.tile[tabindex="0"]').forEach((x) => (x.tabIndex = -1)); el.tabIndex = 0; el.focus({ preventScroll: true }); }
    });
  }

  /** Mounts the timeline on the given elements and renders. */
  function init(opts) {
    els = opts;
    vl = G.createVlist({ scroller: els.scroller, content: els.content, render: renderRow, onScroll });
    els.scroller.addEventListener('click', onClick);
    els.scroller.addEventListener('keydown', onKey);
    els.scroller.addEventListener('focusin', (e) => { const tile = tileOf(e.target); if (tile) { els.content.querySelectorAll('.tile[tabindex="0"]').forEach((x) => (x.tabIndex = -1)); tile.tabIndex = 0; } });
    let w = els.scroller.clientWidth;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { if (els.scroller.clientWidth !== w) { w = els.scroller.clientWidth; render(); } }) : null;
    if (ro) ro.observe(els.scroller); else window.addEventListener('resize', render);
    G.state.subscribe((what) => { if (what === 'selection') markSelection(); else render(); });
    G.library.on(() => render());
    if (I()) I().on(() => render()); // a language switch: the headings, counts and status
    G.people.subscribe(() => { if (G.state.state.view === 'people') render(); }); // a face result arrives: regroup
    render();
  }

  G.timeline = {
    init, render, focusIndex,
    visibleIds: () => cur.ids.slice(),
    get count() { return cur.ids.length; },
    /** Scrolls the grid to a month header, by its key 'YYYY-MM'. */
    jumpToMonth(key) { const i = vl && vl.rowIndexOf('h:' + key); if (i >= 0) vl.scrollToIndex(i); },
    /** Rendered tile count (tests use it to check that the grid is virtualised). */
    rendered: () => (vl ? els.content.querySelectorAll('.tile').length : 0),
    tileOf: (id) => (els ? els.content.querySelector(`.tile[data-id="${CSS.escape(id)}"]`) : null),
  };
})();
