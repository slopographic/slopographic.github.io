/* Slop Gallery: the side panel. Views (all photos, favourites, duplicates), albums (with right-click), filters (name,
 * year, month, camera, tag: liked, disliked or untagged), and the library tools (import, backup, restore, sort).
 * On a phone the panel folds into a drawer (the Filters button in the top bar). Exposes window.SlopGallery.sidebar.init(el). */
(function () {
  'use strict';
  const G = (window.SlopGallery = window.SlopGallery || {});
  const $ = (id) => document.getElementById(id);
  const MONTH_NAMES = G.query.MONTHS;
  const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
  /** The month names in the chosen language (Intl), English without SlopI18n. */
  const monthNames = () => (window.SlopI18n ? MONTH_NAMES.map((n, i) => window.SlopI18n.date(new Date(2000, i, 1), { month: 'long' })) : MONTH_NAMES);

  function fillSelect(sel, options, keep) {
    const cur = keep != null ? String(keep) : sel.value;
    sel.innerHTML = '';
    for (const [v, label] of options) { const o = document.createElement('option'); o.value = v; o.textContent = label; sel.append(o); }
    sel.value = [...sel.options].some((o) => o.value === cur) ? cur : '';
  }
  function renderFacets() {
    const L = G.library, list = L.list();
    const f = G.query.facets(list), st = G.state.state.query;
    fillSelect($('fYear'), [['', t('gallery.side.all_years')], ...f.years.map((y) => [String(y), String(y)])], st.year);
    fillSelect($('fCamera'), [['', t('gallery.side.all_cameras')], ...f.cameras.map((c) => [c, c])], st.camera);
    const dupes = G.query.dupeGroups(list).reduce((n, g) => n + g.items.length - 1, 0);
    $('cntAll').textContent = String(list.length);
    $('cntFav').textContent = String(list.filter((m) => m.fav).length);
    $('cntDupes').textContent = dupes ? String(dupes) : '';
    const albums = $('albumList');
    albums.innerHTML = '';
    for (const a of L.albums()) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'nav-item' + (G.state.state.view === 'album' && st.album === a.id ? ' on' : '');
      b.dataset.album = a.id;
      b.innerHTML = '<span class="nav-l"></span><span class="nav-n"></span>';
      b.firstChild.textContent = a.name; b.lastChild.textContent = String(a.photoIds.length);
      b.addEventListener('click', () => G.state.setView('album', a.id));
      li.append(b); albums.append(li);
    }
    $('albumEmpty').hidden = L.albums().length > 0;
  }
  function syncViewButtons() {
    const v = G.state.state.view;
    for (const b of document.querySelectorAll('[data-view]')) b.classList.toggle('on', b.dataset.view === v);
    const sel = $('fTag'), q = G.state.state.query;
    if (sel.value !== q.tag) sel.value = q.tag;
    if ($('fText').value !== q.text) $('fText').value = q.text;
    $('fMonth').value = q.month === '' ? '' : String(q.month);
    $('fYear').value = q.year || '';
    $('fCamera').value = q.camera || '';
  }

  function bindControls() {
    for (const b of document.querySelectorAll('[data-view]')) b.addEventListener('click', () => {
      G.state.setView(b.dataset.view);
      closeDrawer();
    });
    $('fText').addEventListener('input', (e) => G.state.setQuery({ text: e.target.value }));
    $('fYear').addEventListener('change', (e) => G.state.setQuery({ year: e.target.value }));
    $('fMonth').addEventListener('change', (e) => G.state.setQuery({ month: e.target.value }));
    $('fCamera').addEventListener('change', (e) => G.state.setQuery({ camera: e.target.value }));
    $('fTag').addEventListener('change', (e) => G.state.setQuery({ tag: e.target.value }));
    fillMonths();
    $('btnNewAlbum').addEventListener('click', () => G.albums.create());
    $('btnClearFilters').addEventListener('click', () => G.state.setQuery({ text: '', year: '', month: '', camera: '', tag: '' }));
    $('btnDupes').addEventListener('click', () => G.actions.dupes());
    $('btnImport').addEventListener('click', () => G.actions.importFiles());
    $('btnFolder').addEventListener('click', () => G.actions.importFolder());
    $('btnDrive').addEventListener('click', () => G.actions.importDrive());
    $('btnBackup').addEventListener('click', () => G.actions.backup());
    $('btnRestore').addEventListener('click', () => G.actions.restoreBackup());
    $('btnSort').addEventListener('click', () => G.actions.sortIds(G.state.selected.length ? G.state.selected : []));
    if (!window.showDirectoryPicker) $('btnFolder').hidden = true;
    if (!window.SlopHub) $('btnDrive').hidden = true;
  }
  /** Phones: the panel is a drawer from the left. SlopSheet (shared/ui/sheet.js) does the Filters button, the ×, Escape, a
   * tap outside and the swipe; a view picked in it closes it. */
  let sheet = null;
  function fillMonths() {
    const keep = $('fMonth').value;
    $('fMonth').replaceChildren(...[['', t('gallery.side.any_month')], ...monthNames().map((n, i) => [String(i), n])].map(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; return o; }));
    $('fMonth').value = keep;
  }
  function closeDrawer() { if (sheet) sheet.close(); }

  function init(side) {
    sheet = G.sidebar.sheet = SlopSheet.attach({ root: document.body, panel: side, side: 'start', phone: '(max-width: 700px)', toggles: [$('btnFilters')], label: t('gallery.app.filters') });
    bindControls();
    G.menus.bind(side);
    const refresh = () => { renderFacets(); syncViewButtons(); };
    G.library.on(refresh);
    G.state.subscribe(() => { syncViewButtons(); renderFacets(); });
    refresh();
    if (window.SlopI18n) window.SlopI18n.on(() => { fillMonths(); refresh(); });
  }

  G.sidebar = { init, closeDrawer, renderFacets, sheet: null };
})();
