/* Slop Drive for the assistant: SlopCmd commands with argument schemas (shared/commands/args.js), through Drive's own
 * operations (core/ops.js, ui/newdoc.js, core/io.js), so the AI panel, Ctrl+K, macros and WebMCP can make folders and files,
 * move, rename, star, trash and download them. Loaded on demand by SlopCmd.prepare() (ui/commands.js). Items are named by
 * a path ("Work/notes.txt"), a name, an id or a key ('f:<id>', 'd:<id>'). Only delete_item is destructive (it goes to the
 * Trash, and Restore brings it back). The checkpoint undoes what the assistant did. */
'use strict';
(function (DR) {
  const S = DR.S, H = () => window.SlopHub, C = window.SlopCmd;
  if (!C || !C.register) return;
  const log = [];   // { kind, it, before }
  const Str = (name, description, extra) => Object.assign({ name, type: 'string', maxLength: 500, description }, extra);
  const ITEM = Str('item', 'a path like "Work/notes.txt", a name, or an id', { required: true });
  const FOLDER = Str('folder', 'a folder path like "Work/2026" or id; the open folder when empty, "/" for the top');

  const all = () => [...DR.liveFolders(), ...DR.liveFiles()];
  const path = (it) => DR.pathOf(it.isFolder ? it.id : it.parent).map((f) => f.name).concat(it.isFolder ? [] : [it.name]).join('/');
  /** An item by key, id, path or name (exact, then case-insensitive). */
  function find(q, { folders = true, files = true } = {}) {
    const s = String(q || '').trim().replace(/^\/+|\/+$/g, '');
    const list = all().filter((it) => (it.isFolder ? folders : files));
    const hit = DR.item(s) || list.find((it) => it.id === s) || list.find((it) => path(it) === s) || list.find((it) => path(it).toLowerCase() === s.toLowerCase())
      || list.find((it) => it.name === s) || list.find((it) => it.name.toLowerCase() === s.toLowerCase());
    if (!hit) throw new Error(`Nothing called “${q}” in Slop Drive. list_items shows what is there.`);
    return hit;
  }
  /** A folder id from a path or id; '' and '/' are the top, empty is the open folder. */
  function folderOf(q) {
    if (q == null || q === '') return DR.dest();
    if (q === '/' || /^(root|top|slop drive)$/i.test(String(q))) return null;
    return find(q, { files: false }).id;
  }
  const where = (id) => (id ? '“' + DR.pathOf(id).map((f) => f.name).join('/') + '”' : 'the top of Slop Drive');
  const list = [];
  const add = C.aiAdder('drive', list);   // shared/commands/commands.js

  add('list_items', 'List files', [FOLDER, Str('search', 'words in the name (searches every folder)'), { name: 'limit', type: 'number', min: 1, max: 500, default: 100, integer: true }],
    async (a) => {
      await DR.refresh();
      const q = String(a.search || '').toLowerCase(), f = a.search ? undefined : folderOf(a.folder);
      const items = q ? all().filter((it) => it.name.toLowerCase().includes(q)) : [...DR.children(f).folders, ...DR.children(f).files];
      return items.slice(0, a.limit).map((it) => ({ path: path(it), id: it.id, folder: !!it.isFolder, size: it.isFolder ? undefined : it.size, type: it.isFolder ? undefined : it.type, starred: !!it.starred }));
    }, { macro: false, description: 'List the files and folders in a folder, or search them by name.' });   // i18n-ignore: the assistant's tool text (API)

  add('new_folder', 'New folder', [Str('name', 'the folder name', { required: true, maxLength: 200 }), FOLDER], async (a) => {
    const id = await DR.newFolder(folderOf(a.folder), a.name);
    log.push({ kind: 'made', key: 'd:' + id });
    return `Made the folder “${S.folders.get(id).name}” in ${where(S.folders.get(id).parent)} (id ${id}).`;
  });

  add('add_file', 'Add a text file', [Str('name', 'the file name with its extension, e.g. notes.md', { required: true, maxLength: 200 }),
    Str('content', 'the text in the file', { maxLength: 2000000, default: '' }), FOLDER],
  async (a) => {
    const folder = folderOf(a.folder), name = DR.uniqueName(folder, a.name.trim().slice(0, 200), false);
    const type = /\.md$/i.test(name) ? 'text/markdown' : /\.json$/i.test(name) ? 'application/json' : /\.html?$/i.test(name) ? 'text/html' : /\.csv$/i.test(name) ? 'text/csv' : /\.svg$/i.test(name) ? 'image/svg+xml' : (DR.guessType && DR.guessType(name)) || 'text/plain';
    const id = await H().put(new Blob([String(a.content || '')], { type }), { name, from: 'ai', folderId: folder });
    await DR.done();
    log.push({ kind: 'made', key: 'f:' + id });
    return `Created “${name}” in ${where(folder)} (id ${id}).`;
  }, { description: 'Make a text file (any text format: .txt, .md, .csv, .json, .html, .svg…) with its content.' });   // i18n-ignore: the assistant's tool text (API)

  const KINDS = DR.creatables ? DR.creatables().map((c) => [c.app.id, `${c.label} (${c.app.name})`]) : [];
  add('new_document', 'New document of an app', [{ name: 'kind', type: 'enum', options: KINDS, required: true, description: 'the app whose blank file to make (the New menu)' },   // i18n-ignore: the assistant's tool text (API)
    FOLDER, Str('name', 'a name instead of “Untitled …”', { maxLength: 200 }), { name: 'open', type: 'boolean', default: false, description: 'open it in its app' }],   // i18n-ignore: the assistant's tool text (API)
  async (a) => {
    const folder = folderOf(a.folder), id = await DR.createNew(a.kind, folder, { open: false });
    if (!id) throw new Error(`No app makes “${a.kind}” files`);
    log.push({ kind: 'made', key: 'f:' + id });
    if (a.name) await DR.rename(DR.item('f:' + id), a.name.includes('.') ? a.name : a.name + '.' + DR.ext(S.files.get(id).name));
    const it = DR.item('f:' + id);
    if (a.open) await H().sendTo(a.kind, null, it.name, { id });
    return `Created the blank “${it.name}” in ${where(folder)} (id ${id})${a.open ? ' and opened it' : ''}.`;
  }, { description: 'A blank document of an app (presentation, document, spreadsheet, drawing…), as File ▸ New does.' });   // i18n-ignore: the assistant's tool text (API)

  add('move_item', 'Move', [ITEM, Object.assign({}, FOLDER, { name: 'to', required: true, description: 'the folder to move it to; "/" for the top' })], async (a) => {
    const it = find(a.item), before = { parent: it.parent, name: it.name }, to = folderOf(a.to);
    if (!(await DR.move([it], to))) throw new Error(`“${it.name}” is already there, or a folder cannot go inside itself`);
    log.push({ kind: 'moved', key: DR.keyOf(it), before });
    return `Moved “${before.name}” to ${where(to)}.`;
  });
  add('rename_item', 'Rename', [ITEM, Str('name', 'the new name', { required: true, maxLength: 200 })], async (a) => {
    const it = find(a.item), before = it.name;
    await DR.rename(it, a.name);
    log.push({ kind: 'renamed', key: DR.keyOf(it), before });
    return `Renamed “${before}” to “${DR.item(DR.keyOf(it)).name}”.`;
  });
  add('star_item', 'Star or unstar', [ITEM, { name: 'on', type: 'boolean', default: true }], async (a) => {
    const it = find(a.item), before = !!it.starred;
    await DR.setStar([it], a.on);
    log.push({ kind: 'starred', key: DR.keyOf(it), before });
    return `${a.on ? 'Starred' : 'Unstarred'} “${it.name}”.`;
  });
  add('delete_item', 'Move to the Trash', [ITEM], async (a) => {
    const it = find(a.item);
    await DR.trash([it]);
    log.push({ kind: 'trashed', key: DR.keyOf(it) });
    return `Moved “${it.name}” to the Trash (Restore brings it back).`;
  }, { destructive: true });
  add('download_items', 'Download', [{ name: 'items', type: 'array', required: true, maxItems: 200, items: { type: 'string' }, description: 'paths or ids; folders and several items come as one ZIP' }],
    async (a) => { const items = a.items.map((q) => find(q)); await DR.download(items); return `Downloaded ${items.length === 1 && !items[0].isFolder ? '“' + items[0].name + '”' : 'a ZIP of ' + items.length + ' item' + (items.length === 1 ? '' : 's')}.`; },
    { description: 'Download files (one file as it is; folders or several items as a ZIP).', macro: false });   // i18n-ignore: the assistant's tool text (API)

  /** Undo what the assistant did since the mark, newest first: made items go to the Trash, the rest is put back. */
  async function undoTo(mark) {
    for (const e of log.splice(mark).reverse()) {
      const it = DR.item(e.key);
      if (!it) continue;
      if (e.kind === 'made') await DR.trash([it]);
      else if (e.kind === 'trashed') await DR.restore([it]);
      else if (e.kind === 'starred') await DR.setStar([it], e.before);
      else if (e.kind === 'renamed') await DR.rename(it, e.before);
      else if (e.kind === 'moved') { await DR.move([it], e.before.parent); if (DR.item(e.key).name !== e.before.name) await DR.rename(DR.item(e.key), e.before.name); }
    }
  }
  C.register(list);
  C.provide({
    state: () => ({ app: 'Slop Drive', folder: S.section === 'folder' ? (S.cwd ? DR.pathOf(S.cwd).map((f) => f.name).join('/') : '/') : S.section,
      files: DR.liveFiles().length, folders: DR.liveFolders().length, selected: DR.selected().map((it) => path(it)).slice(0, 20),
      newKinds: KINDS.map((k) => k[0]) }),
    checkpoint: () => { const mark = log.length; return () => { undoTo(mark); return true; }; },
  });
  DR.aiUndoTo = undoTo;
})(window.DR);
