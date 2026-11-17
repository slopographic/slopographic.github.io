/* Slop Drive — core/store: an in-memory mirror of the Drive (via SlopHub) plus tree helpers.
 * Every record gets isFolder and parent (its folder id, or null when at the root or orphaned). */
'use strict';
(function (DR) {
  const S = DR.S, H = () => window.SlopHub;
  let version = 0, sizeCache = new Map(), sizeVer = -1;

  /** Reload everything from IndexedDB. */
  DR.refresh = async function () {
    const [files, folders] = await Promise.all([H().list({ trashed: 'any' }), H().listFolders()]); // intake-ok: Slop Drive itself
    S.folders = new Map(folders.map((f) => [f.id, Object.assign(f, { isFolder: true })]));
    for (const f of S.folders.values()) f.parent = S.folders.has(f.parentId) && f.parentId !== f.id ? f.parentId : null;
    S.files = new Map(files.map((r) => [r.id, Object.assign(r, { isFolder: false, parent: S.folders.has(r.folderId) ? r.folderId : null })]));
    version++;
    if (DR.pruneThumbs) DR.pruneThumbs([...S.files.keys()]).catch(() => { /* the cache is optional */ });
    if (S.cwd && (!S.folders.has(S.cwd) || DR.hidden(S.folders.get(S.cwd)))) S.cwd = null;
    for (const k of [...S.sel]) { const it = DR.item(k); if (!it) S.sel.delete(k); }
    return version;
  };
  DR.version = () => version;
  DR.item = (key) => (!key ? null : key[0] === 'd' ? S.folders.get(key.slice(2)) : S.files.get(key.slice(2))) || null;
  DR.items = (keys) => [...keys].map(DR.item).filter(Boolean);
  /** In the Trash, or inside a folder that is. */
  DR.hidden = (it) => !!it && H().inTrash(it, S.folders);
  /** Direct children of a folder (null = root), excluding trashed ones. */
  DR.children = function (id, { trashed = false } = {}) {
    const ok = (x) => x.parent === id && (trashed || !x.trashedAt);
    return { folders: [...S.folders.values()].filter(ok), files: [...S.files.values()].filter(ok) };
  };
  DR.hasSubfolders = (id) => { for (const f of S.folders.values()) if (f.parent === id && !f.trashedAt) return true; return false; };
  /** Every folder and file below a folder, trashed or not. */
  DR.descendants = function (id) {
    const folders = [], files = [], stack = [id];
    while (stack.length) {
      const cur = stack.pop();
      for (const f of S.folders.values()) if (f.parent === cur && f.id !== id) { folders.push(f); stack.push(f.id); }
      for (const r of S.files.values()) if (r.parent === cur) files.push(r);
      if (folders.length > 100000) break;
    }
    return { folders, files };
  };
  /** Folders from the root down to id. */
  DR.pathOf = function (id) { const out = []; for (let f = S.folders.get(id), n = 0; f && n < 64; f = S.folders.get(f.parent), n++) out.unshift(f); return out; };
  /** Is folder a the same as, or above, folder b? */
  DR.contains = function (a, b) { for (let f = S.folders.get(b), n = 0; f && n < 64; f = S.folders.get(f.parent), n++) if (f.id === a) return true; return false; };
  /** Total bytes of a folder (live items only), cached per refresh. */
  DR.sizeOf = function (it) {
    if (!it.isFolder) return it.size || 0;
    if (sizeVer !== version) { sizeCache = new Map(); sizeVer = version; }
    if (sizeCache.has(it.id)) return sizeCache.get(it.id);
    const { folders, files } = DR.children(it.id);
    const n = files.reduce((a, r) => a + (r.size || 0), 0) + folders.reduce((a, f) => a + DR.sizeOf(f), 0);
    sizeCache.set(it.id, n);
    return n;
  };
  DR.countOf = (id) => { const c = DR.children(id); return c.folders.length + c.files.length; };
  /** A name that does not clash with siblings: "photo (2).png". */
  DR.uniqueName = function (parent, name, isFolder, exceptId) {
    const sib = new Set();
    const src = isFolder ? S.folders.values() : S.files.values();
    for (const x of src) if (x.parent === parent && !x.trashedAt && x.id !== exceptId) sib.add(x.name.toLowerCase());
    if (!sib.has(name.toLowerCase())) return name;
    const m = isFolder ? null : /^(.*?)(\.[^.]{1,8})$/.exec(name), base = m ? m[1] : name, ext = m ? m[2] : '';
    const root = base.replace(/ \(\d+\)$/, '');
    for (let i = 2; i < 10000; i++) { const n = `${root} (${i})${ext}`; if (!sib.has(n.toLowerCase())) return n; }
    return name + ' ' + Date.now();
  };
  /** The drive's own name, at its root and in paths: the app list's name in the chosen language (slopAppName). */
  DR.rootName = () => (window.slopAppName ? window.slopAppName('drive') : 'Slop Drive');
  DR.parentName = (it) => (it.parent ? (S.folders.get(it.parent) || {}).name : DR.rootName());
  DR.liveFiles = () => [...S.files.values()].filter((r) => !DR.hidden(r));
  DR.liveFolders = () => [...S.folders.values()].filter((f) => !DR.hidden(f));
  DR.appName = (from) => { const a = H().appById(from); return a ? (window.slopAppName ? window.slopAppName(a) : a.name) : from === 'drive' ? DR.rootName() : from === 'upload' ? DR.t('drive.app.uploaded') : from && from !== 'unknown' ? from : '—'; };
})(window.DR);
