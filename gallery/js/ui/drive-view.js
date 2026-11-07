/* Slop Gallery — ui/drive-view: the Drive source. The Library / Drive switch, and the Drive grid: one tile per file in
 * Slop Drive. A tile shows the Drive's own thumbnail when one is cached (read only, loaded as the tile scrolls into view),
 * else a card with the file's kind and extension. A click opens the file (ui/drive-open.js). The search, kind chips and
 * sort are in ui/drive-bar.js and reach this module through setQuery(). Exposes window.SlopGallery.driveView:
 * init(), setSource('library' | 'drive'), refresh(), setQuery(patch), query(), source(). */
(function () {
  'use strict';
  const G = (window.SlopGallery = window.SlopGallery || {});
  const $ = (id) => document.getElementById(id);
  const state = {
    source: 'library', items: [], visible: [], byId: new Map(), token: 0, io: null, urls: [],
    query: { text: '', chips: [], sort: 'added' },
  };

  const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
  const fmtSize = (n) => window.SlopHub.fmtSize(n);   // SlopHub.fmtSize (shared/hub.js)
  const fmtDate = (d) => (d ? (window.SlopI18n ? window.SlopI18n.date(d, { dateStyle: 'medium' }) : new Date(d).toLocaleDateString(undefined, { dateStyle: 'medium' })) : t('gallery.drive.unknown_date'));
  const extOf = (name) => window.SlopKinds.extOf(name);

  function revokeThumbs() {
    for (const u of state.urls) URL.revokeObjectURL(u);
    state.urls = [];
  }
  function tileEl(it, idx) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'dtile';
    b.dataset.id = it.id;
    b.dataset.kind = it.kind;
    b.setAttribute('aria-label', `${it.name}, ${window.SlopKinds.label(it.kind)}`);
    b.innerHTML = '<span class="dthumb"><span class="dcard"><span class="dk"></span><span class="dx"></span></span></span>' +
      '<span class="dname"></span><span class="dmeta"></span>';
    b.querySelector('.dk').textContent = window.SlopKinds.label(it.kind);
    const ext = extOf(it.name);
    b.querySelector('.dx').textContent = ext ? '.' + ext : t('gallery.drive.file');
    b.querySelector('.dname').textContent = it.name;
    b.querySelector('.dmeta').textContent = `${fmtSize(it.size)} · ${fmtDate(it.time)}`;
    b.addEventListener('click', () => G.driveOpen.open(it, state.visible, idx));
    return b;
  }
  /** Puts the cached thumbnail in a tile, if the Drive has made one. */
  async function loadThumb(tile) {
    const it = state.byId.get(tile.dataset.id);
    if (!it) return;
    const url = await G.driveSource.thumb(it);
    if (!url) return;
    if (!tile.isConnected) { URL.revokeObjectURL(url); return; }
    state.urls.push(url);
    const img = document.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    img.src = url;
    tile.querySelector('.dthumb').replaceChildren(img);
    tile.classList.add('has-img');
  }
  function observe(tiles) {
    if (state.io) state.io.disconnect();
    if (!('IntersectionObserver' in window)) { for (const tile of tiles.children) loadThumb(tile); return; }
    state.io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { state.io.unobserve(e.target); loadThumb(e.target); }
    }, { root: $('dgrid'), rootMargin: '240px' });
    for (const tile of tiles.children) state.io.observe(tile);
  }

  /** Redraws the grid for the current query. */
  function render() {
    if (state.source !== 'drive') return;
    const { visible, counts } = G.driveQuery.shape(state.items, state.query);
    state.visible = visible;
    state.byId = new Map(visible.map((it) => [it.id, it]));
    revokeThumbs();
    const tiles = $('dtiles');
    tiles.replaceChildren(...visible.map((it, idx) => tileEl(it, idx)));
    observe(tiles);
    $('dempty').hidden = visible.length > 0;
    $('dEmptyText').textContent = state.items.length
      ? t('gallery.drive.empty_filtered')
      : t('gallery.drive.empty');
    G.driveBar.sync(counts, state.query, state.items.length, visible.length);
    $('status').textContent = t('gallery.drive.status', { shown: visible.length, total: state.items.length });
  }

  /** Reads Slop Drive again and redraws. Each switch to the Drive source does this. */
  async function refresh() {
    const my = ++state.token;
    const busy = $('busy');
    busy.hidden = false;
    busy.textContent = t('gallery.drive.reading');
    try {
      const items = await G.driveSource.load();
      if (my !== state.token) return;
      state.items = items;
    } catch (e) {
      if (my !== state.token) return;
      state.items = [];
      if (window.SlopUI) SlopUI.toast(t('gallery.drive.read_failed'));
    } finally {
      if (my === state.token) busy.hidden = true;
    }
    render();
  }

  function setSource(name) {
    const drive = name === 'drive';
    state.source = drive ? 'drive' : 'library';
    document.body.classList.toggle('src-drive', drive);
    $('grid').hidden = drive;
    $('dgrid').hidden = !drive;
    $('dbar').hidden = !drive;
    $('srcLibrary').setAttribute('aria-pressed', String(!drive));
    $('srcDrive').setAttribute('aria-pressed', String(drive));
    if (drive) { refresh(); return; }
    G.driveOpen.stop();
    G.driveViewer.close();
    if (G.timeline && G.timeline.render) G.timeline.render();
  }
  function setQuery(patch) {
    Object.assign(state.query, patch);
    render();
  }

  function init() {
    $('srcLibrary').addEventListener('click', () => setSource('library'));
    $('srcDrive').addEventListener('click', () => setSource('drive'));
    if (window.SlopI18n) window.SlopI18n.on(() => render()); // the tiles, the empty text and the status
  }

  G.driveView = {
    init, setSource, refresh, setQuery, render,
    query: () => state.query,
    source: () => state.source,
  };
})();
