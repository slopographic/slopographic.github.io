/* SlopDrawer: the full-screen app drawer. Opened from the switcher ("All apps") or SlopShell.drawer.open().
 *   Click or Enter opens an app. Drag an app onto another app to make a folder (or onto a folder to add
 *   it). Drag to the edge of a tile to reorder. Right-click (or long-press) for Rename, Ungroup, Move out.
 * The layout is saved per browser through shell/layout.js (localStorage 'slop.drawer.v1').
 * Only top-level tiles take drag and drop; folders open into a panel of their own. */
(function () {
  'use strict';
  if (window.SlopDrawer) return;
  const S = window.SlopShell, L = window.SlopLayout;
  const DRAG_PX = 6;
  let root = null, grid = null, folderBox = null, folderGrid = null, ghost = null;
  let items = [], drag = null, suppressClick = false, openId = null, returnTo = null, isOpen = false, prevOverflow = '';
  const esc = (s) => window.SlopShell.esc(s);   // the shell's one HTML escape (shell.js)
  const hue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const apps = () => S.apps().filter((a) => a.kind === 'app');
  const appById = (id) => apps().find((a) => a.id === id);
  const ui = () => window.SlopUI;
  /** A word from the shared tables (shared/i18n: ui/<code>/shell.js and the chrome), the key without SlopI18n. */
  const tx = (key, vars) => (window.SlopI18n ? window.SlopI18n.t(key, vars) : key);

  function load() { items = L.normalize(L.read() || [], apps().map((a) => a.id), S.brandOrder()); }
  function save() { L.write(items); }
  const nameOf = (a) => (window.slopAppName ? window.slopAppName(a) : a.name);   // the profile's name, in the chosen language
  function badge(app, cls = 'sh-badge') { return `<span class="${cls}" style="--h:${hue(app.name)}" aria-hidden="true">${esc(app.name[0].toUpperCase())}</span>`; }

  function tileHtml(it) {
    if (it.k === 'app') {
      const a = appById(it.id);
      if (!a) return '';
      return `<button type="button" class="sh-tile" data-key="app:${esc(a.id)}" data-app="${esc(a.id)}" aria-label="${esc(nameOf(a))}">${badge(a)}<span class="sh-name">${esc(nameOf(a))}</span></button>`;
    }
    const names = it.apps.map(appById).filter(Boolean);
    const minis = names.slice(0, 4).map((a) => badge(a, 'sh-badge sh-mini-b')).join('');
    return `<button type="button" class="sh-tile sh-folder" data-key="folder:${esc(it.id)}" data-folder="${esc(it.id)}" aria-label="${esc(tx('ui.shell.folder_aria', { name: it.name, n: names.length }))}"><span class="sh-mini">${minis}</span><span class="sh-name">${esc(it.name)}</span></button>`;
  }

  function render() {
    grid.innerHTML = items.map(tileHtml).join('');
    if (openId) renderFolder();
  }
  function folderOf(id) { return items.find((it) => it.k === 'folder' && it.id === id); }
  function renderFolder() {
    const f = folderOf(openId);
    if (!f) { closeFolder(); return; }
    folderBox.querySelector('.sh-dr-title').textContent = f.name;
    folderGrid.innerHTML = f.apps.map((id) => tileHtml({ k: 'app', id })).join('');
  }
  function commit(next, msg) {
    items = next;
    save();
    render();
    if (msg && ui()) ui().toast(msg);
  }

  /* ---------- drag and drop (top level) ---------- */
  function clearMarks() { grid.querySelectorAll('.sh-drop-combine,.sh-drop-before,.sh-drop-after,.sh-src').forEach((n) => n.classList.remove('sh-drop-combine', 'sh-drop-before', 'sh-drop-after', 'sh-src')); }
  function onDown(e) {
    const t = e.target.closest('.sh-tile');
    if (!t || e.button > 0) return;
    drag = { key: t.dataset.key, x: e.clientX, y: e.clientY, id: e.pointerId, t, on: false, drop: null };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.on) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < DRAG_PX) return;
      drag.on = true;
      ghost = document.createElement('div');
      ghost.className = 'sh-ghost';
      ghost.innerHTML = drag.t.innerHTML;
      document.body.append(ghost);
      drag.t.classList.add('sh-src');
    }
    ghost.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
    const over = document.elementFromPoint(e.clientX, e.clientY);
    const tile = over && over.closest && over.closest('#sh-grid .sh-tile');
    grid.querySelectorAll('.sh-drop-combine,.sh-drop-before,.sh-drop-after').forEach((n) => n.classList.remove('sh-drop-combine', 'sh-drop-before', 'sh-drop-after'));
    drag.drop = null;
    if (!tile || tile.dataset.key === drag.key) return;
    const r = tile.getBoundingClientRect();
    const fx = (e.clientX - r.left) / Math.max(1, r.width);
    if (drag.key.startsWith('app:') && fx > 0.25 && fx < 0.75) { drag.drop = { mode: 'combine', key: tile.dataset.key }; tile.classList.add('sh-drop-combine'); }
    else { drag.drop = { mode: 'reorder', key: tile.dataset.key, after: fx >= 0.5 }; tile.classList.add(fx >= 0.5 ? 'sh-drop-after' : 'sh-drop-before'); }
  }
  function finish() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    if (ghost) ghost.remove();
    ghost = null;
    clearMarks();
  }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag, dropped = d.on && d.drop;
    drag = null;
    finish();
    if (!d.on) return;
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 60);
    if (!dropped) return;
    if (dropped.mode === 'combine') {
      const next = L.combine(items, d.key, dropped.key);
      const made = next.some((it) => it.k === 'folder' && !items.some((o) => o.k === 'folder' && o.id === it.id));
      commit(next, made ? tx('ui.shell.folder_made') : '');
    } else commit(L.reorder(items, d.key, dropped.key, dropped.after));
  }
  function onCancel(e) { if (drag && e.pointerId === drag.id) { drag = null; finish(); } }

  /* ---------- menus and rename ---------- */
  async function renameFolder(id) {
    const f = folderOf(id);
    if (!f || !ui()) return;
    const name = await ui().prompt(tx('ui.shell.rename_folder'), tx('ui.shell.folder_name_label'), f.name, { ok: tx('ui.rename'), placeholder: tx('ui.shell.folder_name') });
    if (name != null && name.trim()) commit(L.rename(items, id, name));
  }
  function menuFor(tile, x, y) {
    if (!ui()) return;
    const inFolder = tile.closest('#sh-folder') !== null;
    const folderId = inFolder ? openId : null;
    const list = [];
    if (tile.dataset.folder) {
      list.push({ label: tx('ui.shell.open_folder'), act: () => openFolder(tile.dataset.folder) }, { label: tx('ui.shell.rename_folder'), act: () => renameFolder(tile.dataset.folder) }, { label: tx('ui.shell.ungroup'), act: () => commit(L.ungroup(items, tile.dataset.folder), tx('ui.shell.ungrouped')) });
    } else {
      const app = appById(tile.dataset.app);
      if (app) list.push({ label: tx('ui.shell.open_app', { app: nameOf(app) }), act: () => S.navigate(S.appUrl(app)) });
      if (inFolder) list.push('-', { label: tx('ui.shell.move_out'), act: () => { commit(L.moveOut(items, folderId, app.id)); if (!folderOf(folderId)) closeFolder(); } });
    }
    ui().menu(list, x, y);
  }

  /* ---------- folder panel ---------- */
  function openFolder(id) {
    if (!folderOf(id)) return;
    openId = id;
    folderBox.hidden = false;
    renderFolder();
    folderBox.querySelector('.sh-dr-back').focus({ preventScroll: true });
  }
  function closeFolder() {
    if (!openId) return;
    openId = null;
    folderBox.hidden = true;
  }

  /* ---------- build and open ---------- */
  function build() {
    root = document.createElement('div');
    root.className = 'sh-dr';
    root.hidden = true;
    // the words are marked for SlopI18n (filled below, and again on a language change); the English is the fallback
    root.innerHTML = `<div class="sh-dr-head"><div><h2 class="sh-dr-h" data-i18n="switcher.all_apps">All apps</h2><p class="sh-dr-hint" data-i18n="ui.shell.drawer_hint">Drag an app onto another to make a folder. Right-click for more.</p></div><button type="button" class="sh-dr-close" aria-label="Close app drawer" data-i18n-attr="aria-label:ui.shell.drawer_close">×</button></div>
      <div class="sh-grid" id="sh-grid" role="list" aria-label="All apps" data-i18n-attr="aria-label:switcher.all_apps"></div>
      <div class="sh-dr-folder" id="sh-folder" hidden role="dialog" aria-modal="true" aria-label="Folder" data-i18n-attr="aria-label:ui.shell.folder">
        <div class="sh-dr-head"><button type="button" class="sh-dr-back"><span aria-hidden="true">‹ </span><span data-i18n="ui.back">Back</span></button><h2 class="sh-dr-title"></h2><button type="button" class="sh-dr-rename" data-i18n="ui.rename">Rename</button></div>
        <div class="sh-grid" id="sh-folder-grid" role="list"></div>
        <div class="sh-dr-foot"><button type="button" class="sh-dr-ungroup" data-i18n="ui.shell.ungroup">Ungroup</button></div>
      </div>`;
    document.body.append(root);
    if (window.SlopI18n) { window.SlopI18n.apply(root); window.SlopI18n.on(() => { if (isOpen) render(); }); }   // the tiles' labels follow a switch
    grid = root.querySelector('#sh-grid');
    folderBox = root.querySelector('#sh-folder');
    folderGrid = root.querySelector('#sh-folder-grid');
    root.querySelector('.sh-dr-close').addEventListener('click', () => close());
    folderBox.querySelector('.sh-dr-back').addEventListener('click', () => closeFolder());
    folderBox.querySelector('.sh-dr-rename').addEventListener('click', () => renameFolder(openId));
    folderBox.querySelector('.sh-dr-ungroup').addEventListener('click', () => { const id = openId; closeFolder(); commit(L.ungroup(items, id), tx('ui.shell.ungrouped')); });
    grid.addEventListener('pointerdown', onDown);
    grid.addEventListener('click', (e) => {
      if (suppressClick) return;
      const t = e.target.closest('.sh-tile');
      if (!t) return;
      if (t.dataset.folder) openFolder(t.dataset.folder);
      else { const a = appById(t.dataset.app); if (a) S.navigate(S.appUrl(a)); }
    });
    folderGrid.addEventListener('click', (e) => {
      const t = e.target.closest('.sh-tile');
      if (!t) return;
      const a = appById(t.dataset.app);
      if (a) S.navigate(S.appUrl(a));
    });
    for (const g of [grid, folderGrid]) {
      g.addEventListener('contextmenu', (e) => { const t = e.target.closest('.sh-tile'); if (!t) return; e.preventDefault(); menuFor(t, e.clientX, e.clientY); });
      g.addEventListener('keydown', (e) => {
        const tiles = [...g.querySelectorAll('.sh-tile')], i = tiles.indexOf(document.activeElement);
        if (i < 0) return;
        const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (step) { e.preventDefault(); tiles[(i + step + tiles.length) % tiles.length].focus(); }
        else if (e.key === 'F2' && tiles[i].dataset.folder) { e.preventDefault(); renameFolder(tiles[i].dataset.folder); }
        else if (e.key === 'ContextMenu') { e.preventDefault(); const r = tiles[i].getBoundingClientRect(); menuFor(tiles[i], r.left, r.bottom); }
      });
    }
    root.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || (ui() && ui().openDialogs > 0)) return;
      e.preventDefault();
      if (openId) closeFolder(); else close();
    });
  }
  function open() {
    if (!root) build();
    if (isOpen) return;
    if (window.SlopSwitcher) window.SlopSwitcher.close();
    load();
    render();
    returnTo = document.activeElement;
    isOpen = true;
    prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root.hidden = false;
    const first = grid.querySelector('.sh-tile');
    if (first) first.focus({ preventScroll: true });
  }
  function close() {
    if (!isOpen) return;
    closeFolder();
    isOpen = false;
    root.hidden = true;
    document.body.style.overflow = prevOverflow;
    if (returnTo && returnTo.focus && document.contains(returnTo)) try { returnTo.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }

  window.SlopDrawer = { open, close, isOpen: () => isOpen, items: () => L.clone(items), reload: () => { load(); if (root) render(); }, openFolder, _render: render };
})();
