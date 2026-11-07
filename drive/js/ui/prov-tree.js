/* Slop Drive — ui/prov-tree: the "Drives" part of the sidebar. The Local folder and each named local drive is an
 * expandable node. Opened, it lists its folders and files, read from the folder when it opens. Each node and folder is
 * a drop target ('pv:' values). Dragging a row (prov-dnd.js) or its menu (prov-actions.js) moves or copies it. Slop Drive's
 * own folders stay in the Folders tree above. Which nodes are open is kept for this visit only. */
'use strict';
(function (DR) {
  const S = DR.S, el = DR.el, $ = DR.$;
  S.pOpen = S.pOpen || new Set();
  let descs = [];                    // the providers, from DR.providerList (refreshed by DR.refreshProviders)
  let cache = new Map();             // 'id|ref' -> { folders, files } or { error }
  let pending = new Set();           // listings on their way
  let rows = new Map();              // 'id|ref' -> entry, for drag, the menu and the picker of this paint
  const pk = (id, ref) => id + '|' + (ref || '');
  DR.pkey = pk;
  DR.provEntryFor = (k) => rows.get(k) || null;
  DR.providerRows = () => descs.filter((d) => d.provider.kind !== 'internal');

  /** Loads the providers and their permission state, then paints. Called at boot, on focus and after a change. */
  DR.refreshProviders = async function () {
    descs = await DR.providerList().catch(() => []);
    cache = new Map();
    DR.renderProviders();
  };
  DR.provChanged = () => { DR.refreshProviders().catch((e) => console.warn('Slop Drive: places', e)); };

  const twisty = (open, on) => el('span', { class: 'twisty' + (on ? '' : ' none') + (open ? ' open' : ''), 'aria-hidden': 'true' }, DR.icon('chev'));
  const note = (depth, text) => el('div', { class: 'pv-note', style: `--d:${depth}` }, text);

  function rowEl(entry, depth, open) {
    const unavailable = entry.root && entry.desc.status !== 'granted';
    const r = el('div', {
      class: 'node pvrow' + (entry.root ? ' pv-root' : '') + (entry.isFolder ? '' : ' pv-file') + (unavailable ? ' off' : ''),
      role: 'treeitem', tabindex: '0', 'data-pkey': entry.key, 'data-drop': entry.isFolder && !unavailable ? DR.pv(entry.desc.id, entry.ref) : null,
      'aria-expanded': entry.isFolder && !unavailable ? String(!!open) : null, 'aria-selected': 'false', style: `--d:${depth}`, title: entry.title || entry.name,
    }, twisty(open, entry.isFolder && !unavailable), DR.icon(entry.root ? 'folder' : entry.isFolder ? 'folder' : 'file'), el('span', { class: 'nm' }, entry.name));
    if (unavailable) {
      const st = entry.desc.status, txt = DR.t(['prompt', 'denied', 'gone'].includes(st) ? 'drive.prov.state_' + st : 'drive.prov.state_na');
      const b = el('button', { type: 'button', class: 'linkish pv-allow' }, txt);
      if (entry.desc.status === 'prompt') b.addEventListener('click', (e) => { e.stopPropagation(); DR.providerAllow(entry.desc); });
      else b.disabled = true;
      r.append(b);
    }
    return r;
  }

  function load(d, ref) {
    const k = pk(d.id, ref);
    if (pending.has(k)) return;
    pending.add(k);
    d.provider.list(ref)
      .then((r) => cache.set(k, r), (e) => cache.set(k, { error: e.message || DR.t('drive.prov.unreadable') }))
      .then(() => { pending.delete(k); DR.renderProviders(); });
  }

  /** The rows under folder ref of provider d, depth-first. An open folder's rows come straight after it. */
  function childRows(d, ref, depth) {
    const k = pk(d.id, ref), c = cache.get(k);
    if (!c) { load(d, ref); return [note(depth, DR.t('drive.prov.reading'))]; }
    if (c.error) return [note(depth, c.error)];
    const out = [];
    for (const f of c.folders) {
      const e = { desc: d, provider: d.provider, ref: f.ref, name: f.name, isFolder: true, parent: ref, key: pk(d.id, f.ref) };
      rows.set(e.key, e);
      const open = S.pOpen.has(e.key);
      out.push(rowEl(e, depth, open));
      if (open) out.push(...childRows(d, f.ref, depth + 1));
    }
    for (const f of c.files) {
      const e = { desc: d, provider: d.provider, ref: f.ref, name: f.name, isFolder: false, parent: ref, key: pk(d.id, f.ref), size: f.size };
      rows.set(e.key, e);
      out.push(rowEl(e, depth, false));
    }
    if (!out.length) out.push(note(depth, DR.t('drive.empty.folder_h')));
    return out;
  }

  function nodeRows(d) {
    const root = { root: true, desc: d, provider: d.provider, ref: '', name: d.label, title: d.label, isFolder: true, parent: '', key: pk(d.id, '') };
    rows.set(root.key, root);
    const ok = d.status === 'granted', open = ok && S.pOpen.has(root.key);
    return [rowEl(root, 0, open), ...(open ? childRows(d, '', 1) : [])];
  }

  /** The sidebar section: one node per local provider, then the add and help links. */
  DR.renderProviders = function () {
    const box = $('providers'); if (!box) return;
    rows = new Map();
    const list = DR.providerRows();
    const out = list.flatMap(nodeRows);
    if (!list.length) out.push(note(0, DR.t('drive.prov.none')));
    out.push(el('div', { class: 'pv-actions' },
      el('button', { type: 'button', class: 'linkish pv-add', 'data-act': 'add-drive' }, DR.t('drive.prov.add')),
      el('button', { type: 'button', class: 'linkish pv-help', 'data-act': 'drives-help' }, DR.t('drive.prov.about'))));
    box.replaceChildren(...out);
  };

  const toggle = (k) => { if (S.pOpen.has(k)) S.pOpen.delete(k); else S.pOpen.add(k); DR.renderProviders(); };
  /** Clicks, keys and the menu on the rows. A drag that just ended is not a click. */
  DR.wireProviders = function () {
    const box = $('providers'); if (!box) return;
    box.addEventListener('click', (e) => {
      if (e.target.closest('.pv-add')) return DR.addLocalDrive();
      if (e.target.closest('.pv-help')) return DR.localDrivesHelp();
      const n = e.target.closest('[data-pkey]');
      if (!n || e.target.closest('.pv-allow') || (DR.provDragEnded && DR.provDragEnded())) return;
      const entry = rows.get(n.dataset.pkey);
      if (entry && entry.isFolder && (!entry.root || entry.desc.status === 'granted')) toggle(entry.key);
    });
    box.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const n = e.target.closest('[data-pkey]'), entry = n && rows.get(n.dataset.pkey);
      if (!entry || !entry.isFolder || (entry.root && entry.desc.status !== 'granted')) return;
      e.preventDefault();
      toggle(entry.key);
    });
    box.addEventListener('contextmenu', (e) => {
      const n = e.target.closest('[data-pkey]'), entry = n && rows.get(n.dataset.pkey);
      if (!entry) return;
      e.preventDefault();
      DR.providerMenu(entry, e.clientX, e.clientY);
    });
    addEventListener('focus', () => DR.refreshProviders().catch(() => {}));
  };
})(window.DR);
