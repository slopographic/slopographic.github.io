/* Slop Drive pickers used by every app through SlopHub.pickFromDrive() and SlopHub.pickFolder() (an app's Open from
 * Slop Drive is SlopIntake.fromDrive, which opens this one picker). Loaded on first use by shared/hub.js. Needs
 * window.SlopHub and window.SlopUI. Exposes window.SlopDrivePicker.
 * Both dialogs browse nested folders with breadcrumbs; the file picker also searches every folder, lists only the types
 * the caller accepts, and shows each file as a picture: Slop Drive's own cached thumbnail when there is one (PDF first
 * pages, pictures, videos, made by the Drive app), else the picture itself, a video's first frame, or a card with the
 * file's kind. Hovering (or a long press) shows a larger preview. */
(function () {
  'use strict';
  if (window.SlopDrivePicker) return;
  const H = () => window.SlopHub, UI = () => window.SlopUI;
  const css = document.createElement('style');
  css.textContent = '.hub-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;max-height:55vh;overflow:auto;align-content:start;min-height:120px}'
    + '.hub-item{display:grid;gap:3px;text-align:left;padding:8px;border-radius:8px;border:1px solid var(--s-line);background:var(--s-bg2);color:var(--s-fg);cursor:pointer;font:inherit;min-width:0}'
    + '.hub-item:hover,.hub-item:focus-visible{border-color:var(--s-accent)}.hub-thumb{display:grid;place-items:center;height:88px;border-radius:5px;background:repeating-conic-gradient(#3a3a3a 0 25%,#2a2a2a 0 50%) 0 0/12px 12px;overflow:hidden}'
    + '.hub-thumb img{max-width:100%;max-height:88px}.hub-ext{font:700 18px var(--s-mono);color:var(--s-dim)}.hub-item b{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '.hub-item small{color:var(--s-faint);font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hub-folder .hub-thumb{background:var(--s-input)}'
    + '.hub-fold-ic{width:44px;height:36px;border-radius:3px 6px 6px 6px;background:var(--s-accent);opacity:.85;position:relative}.hub-fold-ic::before{content:"";position:absolute;left:0;top:-6px;width:18px;height:8px;border-radius:3px 3px 0 0;background:inherit}'
    + '.hub-bar{display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap}.hub-crumbs{display:flex;gap:2px;align-items:center;flex:1;min-width:0;overflow:auto;white-space:nowrap}'
    + '.hub-crumbs button{border:0;background:none;color:var(--s-dim);font:inherit;padding:3px 6px;border-radius:4px;cursor:pointer}.hub-crumbs button:hover{background:var(--s-hover);color:var(--s-fg)}.hub-crumbs button:last-child{color:var(--s-fg);font-weight:600}'
    + '.hub-crumbs i{color:var(--s-faint);font-style:normal}.hub-search{width:170px}.hub-rows{display:grid;gap:2px;max-height:45vh;overflow:auto;min-height:120px;align-content:start}'
    + '.hub-row{display:flex;gap:8px;align-items:center;padding:7px 9px;border:0;border-radius:5px;background:none;color:var(--s-fg);font:inherit;text-align:left;cursor:pointer}.hub-row:hover,.hub-row:focus-visible{background:var(--s-hover)}'
    + '.hub-row .hub-fold-ic{width:18px;height:14px}.hub-row .hub-fold-ic::before{top:-3px;width:8px;height:4px}@media(max-width:500px){.hub-search{width:100%}.hub-grid{grid-template-columns:repeat(2,1fr)}}';
  css.textContent += '.hub-thumb video{max-width:100%;max-height:88px;pointer-events:none}.hub-kind{display:grid;gap:2px;place-items:center;font:700 16px var(--s-mono);color:var(--s-dim)}'
    + '.hub-kind small{font:11px system-ui;color:var(--s-faint)}.hub-pick-body{position:relative}.hub-peek{position:absolute;inset:0;display:grid;place-items:center;background:color-mix(in srgb,var(--s-bg) 88%,transparent);z-index:2;pointer-events:none;border-radius:8px}'
    + '.hub-peek img,.hub-peek video{max-width:92%;max-height:60vh;border-radius:6px;box-shadow:0 8px 30px #0008}.hub-peek .hub-kind{font-size:42px}';
  document.head.append(css);

  /* ---------- previews ---------- */
  const cachedThumb = (r) => (window.SlopDriveThumbs ? window.SlopDriveThumbs.get(r) : Promise.resolve(null)); // shared/drive/thumb-read.js
  const extOf = (r) => (r.name.includes('.') ? r.name.split('.').pop() : String(r.type || '').split('/').pop() || '?').slice(0, 4).toUpperCase();
  const kindName = (r) => { const K = window.SlopKinds; try { return K ? K.label(K.kindOf(r.name, r.type)) : ''; } catch (e) { return ''; } };
  /** The picture for one file (a cached thumbnail, the picture, a video's first frame, or a kind card), into box. */
  async function preview(r, box, urls, big) {
    const el = UI().el, url = (b) => { const u = URL.createObjectURL(b); urls.push(u); return u; };
    const cached = await cachedThumb(r);
    const isImg = /^image\//.test(r.type) && r.type !== 'image/vnd.adobe.photoshop';
    let node;
    if (cached && !(big && isImg && r.blob)) node = el('img', { src: url(cached), alt: '', loading: 'lazy' });
    else if (isImg && r.blob) node = el('img', { src: url(r.blob), alt: '', loading: 'lazy' });
    else if (/^video\//.test(r.type) && r.blob) { node = el('video', { src: url(r.blob) + '#t=0.1', preload: 'metadata', playsinline: true, 'aria-hidden': 'true' }); node.muted = true; }
    else node = el('span', { class: 'hub-kind' }, extOf(r), kindName(r) ? el('small', null, kindName(r)) : null);
    box.replaceChildren(node);
    return node;
  }
  /** The larger preview over the grid while the pointer rests on a file (or a finger holds it). */
  function peekOn(item, r, host, urls) {
    let timer = 0, layer = null;
    const show = async () => { layer = UI().el('div', { class: 'hub-peek', 'aria-hidden': 'true' }); host.append(layer); await preview(r, layer, urls, true); };
    const hide = () => { clearTimeout(timer); if (layer) { layer.remove(); layer = null; } };
    item.addEventListener('mouseenter', () => { clearTimeout(timer); timer = setTimeout(show, 450); });
    item.addEventListener('mouseleave', hide);
    item.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') { clearTimeout(timer); timer = setTimeout(show, 500); } });
    item.addEventListener('pointerup', hide);
    item.addEventListener('pointercancel', hide);
    return hide;
  }

  // Words: shared/i18n/ui/<code>/backup3.js (keys ui.dpick.*). A caller's title or ok may be an i18n key (SlopI18n.label).
  const tr = (key, vars) => (window.SlopI18n ? window.SlopI18n.t(key, vars) : key);
  const lab = (v) => (window.SlopI18n && window.SlopI18n.label ? window.SlopI18n.label(v) : v);
  function crumbs(path, go) {
    const el = UI().el, box = el('nav', { class: 'hub-crumbs', 'aria-label': tr('ui.dpick.path') });
    box.append(el('button', { type: 'button', onclick: () => go(null) }, 'Slop Drive'));
    for (const f of path) box.append(el('i', null, '›'), el('button', { type: 'button', onclick: () => go(f.id) }, f.name));
    return box;
  }
  const folderIcon = () => UI().el('span', { class: 'hub-fold-ic', 'aria-hidden': 'true' });
  const visibleFolders = async () => { const all = await H().listFolders(); const m = new Map(all.map((f) => [f.id, f])); return { all: all.filter((f) => !H().inTrash(f, m)), map: m }; };

  /** pickFile({ accept, title }): resolves with a file record or null. */
  function pickFile({ accept, title = 'ui.dpick.open_title' } = {}) {
    return new Promise((res) => {
      const UIx = UI(), el = UIx.el, urls = [];
      let chosen = null, cwd = null, query = '', gen = 0;
      const peeks = new Set();
      const search = el('input', { class: 'sui-input hub-search', type: 'search', placeholder: tr('ui.dpick.search_all'), 'aria-label': tr('ui.dpick.search') });
      const bar = el('div', { class: 'hub-bar' }), grid = el('div', { class: 'hub-grid' });
      const note = el('p', { class: 'sui-p' }, tr('ui.dpick.note'));
      const body = el('div', { class: 'hub-pick-body' }, note, bar, grid);
      search.addEventListener('input', () => { query = search.value.trim().toLowerCase(); render(); });
      async function render() {
        const my = ++gen; // a newer draw (typing in the search) wins over one still reading Slop Drive
        const { all, map } = await visibleFolders().catch(() => ({ all: [], map: new Map() }));
        const files = (await H().list({ accept }).catch(() => [])).filter((r) => !H().inTrash(r, map)); // intake-ok: the shared picker itself
        const path = cwd ? await H().folderPath(cwd) : [];
        if (my !== gen) return;
        peeks.forEach((hide) => hide()); peeks.clear();
        urls.splice(0).forEach((u) => URL.revokeObjectURL(u));
        bar.replaceChildren(crumbs(path, (id) => { cwd = id; search.value = query = ''; render(); }), search);
        grid.replaceChildren(); grid.dataset.query = query; // what the grid shows now (tests wait for it)
        const folders = query ? all.filter((f) => f.name.toLowerCase().includes(query)) : all.filter((f) => f.parentId === cwd);
        const shown = query ? files.filter((r) => r.name.toLowerCase().includes(query)) : files.filter((r) => (map.has(r.folderId) ? r.folderId : null) === cwd);
        for (const f of folders) {
          const n = files.filter((r) => r.folderId === f.id).length;
          const b = el('button', { type: 'button', class: 'hub-item hub-folder', 'data-folder': f.id }, el('span', { class: 'hub-thumb' }, folderIcon()), el('b', null, f.name), el('small', null, tr('ui.dpick.n_files', { n })));
          b.addEventListener('click', () => { cwd = f.id; search.value = query = ''; render(); });
          grid.append(b);
        }
        for (const r of shown) {
          const app = H().appById(r.from), thumb = el('span', { class: 'hub-thumb' });
          preview(r, thumb, urls);
          const b = el('button', { type: 'button', class: 'hub-item', 'data-id': r.id }, thumb, el('b', { title: r.name }, r.name), el('small', null, `${app ? app.name : r.from} · ${H().fmtSize(r.size)} · ${window.SlopI18n && window.SlopI18n.date ? window.SlopI18n.date(r.time, { dateStyle: 'medium', timeStyle: 'short' }) : new Date(r.time).toLocaleString()}`));
          const unpeek = peekOn(b, r, body, urls);
          peeks.add(unpeek);
          b.addEventListener('click', () => { unpeek(); chosen = r; H().touch(r.id); d.close(true); });
          b.addEventListener('contextmenu', (e) => { e.preventDefault(); UIx.menu([{ label: tr('ui.dpick.trash'), act: async () => { await H().update(r.id, { trashedAt: Date.now() }); b.remove(); } }], e.clientX, e.clientY); });
          grid.append(b);
        }
        if (!grid.children.length) grid.append(el('p', { class: 'sui-p hub-empty' }, query ? tr('ui.dpick.no_match', { q: search.value }) : cwd ? tr('ui.dpick.empty_folder')
          : tr('ui.dpick.empty_drive')));
      }
      const d = UIx.dialog({ title: lab(title), cls: 'sui-wide', body,
        buttons: [{ label: tr('ui.dpick.open_drive'), act: () => { window.open(new URL('drive/', H().ROOT).href, '_blank'); return false; } }, { label: tr('menu.cancel') }],
        onClose: () => { urls.forEach((u) => URL.revokeObjectURL(u)); res(chosen); } });
      // the Drive's cached thumbnails (shared/drive/thumb-read.js) and the kind names of the file cards (shared/kinds)
      // come in before the first draw (small, and loaded once); without them the grid still draws
      const more = ['shared/drive/thumb-read.js', 'shared/kinds/kinds.js'].filter((p, i) => !(i ? window.SlopKinds : window.SlopDriveThumbs));
      Promise.all(H().loadScript ? more.map((p) => H().loadScript(p).catch(() => null)) : []).then(render);
    });
  }

  /** pickFolder({ title, ok, start }): resolves with a folder id, null for the root, or undefined if cancelled. */
  function pickFolder({ title = 'ui.dpick.folder_title', ok = 'ui.dpick.save_here', start = null, exclude = [] } = {}) {
    return new Promise((res) => {
      const UIx = UI(), el = UIx.el;
      let cwd = start, result;
      const bar = el('div', { class: 'hub-bar' }), rows = el('div', { class: 'hub-rows', role: 'list' });
      async function render() {
        const { all } = await visibleFolders().catch(() => ({ all: [] }));
        if (cwd && !all.some((f) => f.id === cwd)) cwd = null;
        const newBtn = el('button', { type: 'button', class: 'sui-btn' }, tr('ui.dpick.new_folder'));
        newBtn.addEventListener('click', async () => { const n = await UIx.prompt(tr('ui.dpick.new_folder'), tr('ui.dpick.name'), tr('ui.dpick.new_folder')); if (n && n.trim()) { cwd = await H().createFolder(n.trim(), cwd); render(); } });
        bar.replaceChildren(crumbs(cwd ? await H().folderPath(cwd) : [], (id) => { cwd = id; render(); }), newBtn);
        rows.replaceChildren();
        for (const f of all.filter((x) => x.parentId === cwd && !exclude.includes(x.id))) {
          const b = el('button', { type: 'button', class: 'hub-row', role: 'listitem', 'data-folder': f.id }, folderIcon(), el('span', null, f.name));
          b.addEventListener('click', () => { cwd = f.id; render(); });
          rows.append(b);
        }
        if (!rows.children.length) rows.append(el('p', { class: 'sui-p' }, tr('ui.dpick.no_folders')));
      }
      UIx.dialog({ title: lab(title), body: el('div', null, bar, rows), buttons: [{ label: tr('menu.cancel') }, { label: lab(ok), primary: true, act: () => { result = cwd; } }],
        onClose: (okd) => res(okd ? result : undefined) });
      render();
    });
  }
  window.SlopDrivePicker = { pickFile, pickFolder };
})();
