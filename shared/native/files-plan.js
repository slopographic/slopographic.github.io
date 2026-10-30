/* Slop Drive in the iPhone/iPad app's folder (Files › On My iPhone/iPad › the app, or its iCloud Drive folder): the pure
 * part of the sync (shared/native/files-sync.js). Slop Drive stays the store every app uses; the folder holds a real
 * file for each live Drive file, at the path of its Drive folders, and what changes on either side goes to the other.
 * UMD: window.SlopNativePlan in a page, require() in Node (tests/node/native-files-plan.test.mjs).
 *   safeName(name)                          a name the Files app takes (no / or :, not hidden, not empty)
 *   layout(files, folders)                  { files: Map id → path, folders: Map id → path } for everything not in the
 *                                           Trash; two files with one name in a folder get "name (2).ext"
 *   plan({ files, folders, tree, state })   the steps of one sync, in order: [{ op, ... }]
 * state (what the last sync left, kept by files-sync.js): { files: { id: { p, m, s, d } }, dirs: { folderId: path } }
 *   p the file's path, m and s its modified time and size in the folder, d its Drive modified time, at that sync.
 * Steps: mkdir path (a Drive folder) · newFolder path (a folder made in Files) · trashFolder id (an empty Drive folder
 * whose folder was deleted in Files) · write id path [old] (Drive to the folder; old: the file's previous path, removed
 * after) · move id from to · remove id path (gone from Drive) · import path (new in Files) · update id path (changed in
 * Files) · conflict id path (changed on both sides: the folder's copy comes in as a new Drive file, then the Drive file
 * is written) · trash id (deleted in Files: the Drive file goes to the Trash) · adopt id path (already there, the same
 * size: the first sync after a move between places) · forget id · dirs map (last: the live Drive folders' paths). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SlopNativePlan = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function safeName(name) {
    const s = String(name == null ? '' : name).replace(/[\/:\u0000-\u001f]+/g, '-').trim().replace(/^\.+/, '_').slice(0, 200);
    return s || 'Untitled';
  }
  const lower = (s) => s.toLowerCase();
  /** "a.pdf" taken → "a (2).pdf", the first free one in taken (a Set of lower-case names). */
  function freeName(taken, name) {
    if (!taken.has(lower(name))) return name;
    const m = /^(.*?)(\.[^.]{1,8})?$/.exec(name), stem = m[1], ext = m[2] || '';
    for (let i = 2; ; i++) { const n = `${stem} (${i})${ext}`; if (!taken.has(lower(n))) return n; }
  }

  const dirOf = (p) => { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); };
  const nameOf = (p) => p.slice(p.lastIndexOf('/') + 1);
  /** Is path p the wanted path w, or w with a " (n)" a name clash gave it? */
  function fits(p, w) {
    if (dirOf(lower(p)) !== dirOf(lower(w))) return false;
    const a = lower(nameOf(p)), b = lower(nameOf(w)), m = /^(.*?)(\.[^.]{1,8})?$/.exec(b);
    return a === b || new RegExp('^' + m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\(\\d+\\)' + (m[2] || '').replace(/\./g, '\\.') + '$').test(a);
  }

  /** Live folders and files (nothing in the Trash, nor under a folder in it) and their paths. prev (id → path): a file
   * keeps its earlier path while it still fits its name and folder; taken: paths of strangers (files in the folder Slop
   * Drive does not know yet), which no Drive file takes. */
  function layout(files, folders, prev, taken0) {
    const byId = new Map(folders.map((f) => [f.id, f])), fpath = new Map();
    const pathOf = (id, n = 0) => {
      if (id == null) return '';
      if (fpath.has(id)) return fpath.get(id);
      const f = byId.get(id);
      if (!f || f.trashedAt || n > 64) return null;
      const up = pathOf(f.parentId == null ? null : f.parentId, n + 1);
      const p = up == null ? null : (up ? up + '/' : '') + safeName(f.name);
      fpath.set(id, p);
      return p;
    };
    const live = new Map();
    for (const f of folders) { const p = pathOf(f.id); if (p != null) live.set(f.id, p); }
    const taken = new Map(), out = new Map();
    const set = (d) => { if (!taken.has(d)) taken.set(d, new Set()); return taken.get(d); };
    for (const p of [...live.values(), ...(taken0 || [])]) set(dirOf(p)).add(lower(nameOf(p)));
    const dirFor = (r) => pathOf(r.folderId == null ? null : r.folderId);
    const alive = files.filter((r) => !r.trashedAt && dirFor(r) != null)
      .sort((a, b) => (a.time || 0) - (b.time || 0) || String(a.id).localeCompare(String(b.id)));
    const want = (r) => { const d = dirFor(r); return (d ? d + '/' : '') + safeName(r.name); };
    for (const r of alive) {
      const p = prev && prev.get(r.id);
      if (p && fits(p, want(r)) && !set(dirOf(p)).has(lower(nameOf(p)))) { set(dirOf(p)).add(lower(nameOf(p))); out.set(r.id, p); }
    }
    for (const r of alive) {
      if (out.has(r.id)) continue;
      const w = want(r), d = dirOf(w), n = freeName(set(d), nameOf(w));
      set(d).add(lower(n));
      out.set(r.id, (d ? d + '/' : '') + n);
    }
    return { files: out, folders: live };
  }

  const changedOnDisk = (n, s) => !!n && !n.placeholder && (n.size !== s.s || Math.abs((n.mtime || 0) - (s.m || 0)) > 1);
  const under = (p, dir) => p.startsWith(dir + '/');

  function plan({ files, folders, tree, state }) {
    const st = state || {}, known = st.files || {}, dirs = st.dirs || {};
    files = files || []; folders = folders || []; tree = tree || [];
    const recs = new Map(files.map((r) => [r.id, r])), disk = new Map(tree.map((e) => [e.path, e]));
    const prev = new Map(Object.keys(known).map((id) => [id, known[id].p]));
    const knownPaths = new Set(prev.values()), adopted = new Set(), waiting = new Set(), steps = [];
    /* a file the folder already has at its place, the same size, that no earlier sync wrote: taken as it is (an iCloud
     * file still on its way waits for the next sync, so neither side is written over) */
    for (const [id, p] of layout(files, folders, prev).files) {
      const n = disk.get(p);
      if (known[id] || !n || n.dir || knownPaths.has(p)) continue;
      if (n.placeholder) { prev.set(id, p); waiting.add(id); knownPaths.add(p); }
      else if (n.size === (recs.get(id).size || 0)) { prev.set(id, p); adopted.add(id); knownPaths.add(p); }
    }
    const strangers = tree.filter((e) => !e.dir && !knownPaths.has(e.path)).map((e) => e.path);
    const { files: paths, folders: fpaths } = layout(files, folders, prev, strangers);
    const isDir = (p) => { const e = disk.get(p); return !!e && e.dir; };
    const driveChanged = (id) => !known[id] || (recs.get(id).modified || 0) !== known[id].d;

    /* folders: each Drive folder has one in the folder; one deleted in Files takes its Drive folder to the Trash (unless
     * something in it is new or changed in Drive); one made in Files becomes a Drive folder */
    const gone = [];
    for (const [id, p] of fpaths) {
      if (isDir(p) || gone.some((g) => under(p, g))) continue;
      if (dirs[id] === p && ![...paths].some(([fid, q]) => under(q, p) && driveChanged(fid))) { steps.push({ op: 'trashFolder', id }); gone.push(p); }
      else steps.push({ op: 'mkdir', id, path: p });
    }
    const folderAt = new Set(fpaths.values());
    for (const e of tree) if (e.dir && !folderAt.has(e.path)) steps.push({ op: 'newFolder', path: e.path });

    /* files Slop Drive has */
    const claimed = new Set(), wanted = new Set(paths.values());
    const owner = new Map(Object.keys(known).map((id) => [known[id].p, id]));   // path → the file an earlier sync put there
    for (const [id, p] of paths) {
      if (gone.some((g) => under(p, g))) { if (known[id]) steps.push({ op: 'forget', id }); continue; }
      claimed.add(p);
      if (waiting.has(id)) continue;
      if (adopted.has(id)) { steps.push({ op: 'adopt', id, path: p }); continue; }
      const s = known[id];
      if (!s) { steps.push({ op: 'write', id, path: p }); continue; }
      const n = disk.get(s.p);
      claimed.add(s.p);
      // the old copy goes once the file is at its new path, unless another file is about to take that path
      const old = s.p === p || wanted.has(s.p) ? null : s.p, taken = owner.has(p) && owner.get(p) !== id;
      if (!n) { steps.push(driveChanged(id) ? { op: 'write', id, path: p } : { op: 'trash', id }); continue; }
      if (n.placeholder) continue;                                        // an iCloud file on its way: next time
      const there = changedOnDisk(n, s);
      if (there && driveChanged(id)) steps.push({ op: 'conflict', id, path: s.p }, { op: 'write', id, path: p, old });
      else if (there) steps.push({ op: 'update', id, path: s.p });
      else if (driveChanged(id)) steps.push({ op: 'write', id, path: p, old });
      else if (s.p !== p) steps.push(taken ? { op: 'write', id, path: p, old } : { op: 'move', id, from: s.p, to: p });
    }
    /* files an earlier sync wrote that are gone from Drive or in its Trash */
    for (const id of Object.keys(known)) {
      if (paths.has(id)) continue;
      const s = known[id], n = disk.get(s.p);
      if (n && !n.dir && !n.placeholder && !changedOnDisk(n, s)) { steps.push({ op: 'remove', id, path: s.p }); claimed.add(s.p); }
      else steps.push({ op: 'forget', id });                               // changed there since: it comes in as new
    }
    /* files new in the folder */
    for (const e of tree) if (!e.dir && !e.placeholder && !claimed.has(e.path) && !/(^|\/)\.[^/]*\.part$/.test(e.path)) steps.push({ op: 'import', path: e.path });
    /* last: the Drive folders the folder now has (the next sync's state.dirs) */
    steps.push({ op: 'dirs', map: Object.fromEntries([...fpaths].filter(([, p]) => !gone.some((g) => p === g || under(p, g)))) });
    return steps;
  }

  return { safeName, freeName, layout, plan };
});
