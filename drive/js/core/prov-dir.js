/* Slop Drive — core/prov-dir: a provider over a folder on this computer (a File System Access directory handle).
 * Refs are paths inside the folder: '' is the root, 'Photos/2026' a subfolder. Each call walks the path from the root
 * handle, so nothing is cached and a folder that has gone is reported as gone. Permission is only queried here; asking
 * is DR.dirAllow, which needs a button press. Every name is one path segment. */
'use strict';
(function (DR) {
  const err = (message, code) => Object.assign(new Error(message), { code });
  // The words come from drive/i18n (DR.t, core/util.js); Node tests load this file alone and read the English.
  const tr = (key, en) => (DR.t ? DR.t(key) : en);
  const segs = (ref) => String(ref || '').split('/').filter(Boolean);
  const join = (ref, name) => (ref ? ref + '/' : '') + name;
  const cmp = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  function safe(name) {
    const s = String(name == null ? '' : name).trim();
    if (!s || s.length > 200 || s === '.' || s === '..' || /[\/\\\u0000-\u001f]/.test(s)) throw err(tr('drive.prov.bad_name', 'That name cannot be used in a folder on this computer.'), 'name');
    return s;
  }
  DR.joinRef = join;
  /** "photo.png" becomes "photo (2).png": the first name not in names (a Set of lower-case names). */
  DR.dirUniqueName = function (names, name, isFolder) {
    if (!names.has(name.toLowerCase())) return name;
    const m = isFolder ? null : /^(.*?)(\.[^.]{1,8})$/.exec(name), base = m ? m[1] : name, ext = m ? m[2] : '';
    for (let i = 2; i < 10000; i++) { const n = `${base} (${i})${ext}`; if (!names.has(n.toLowerCase())) return n; }
    return name + ' ' + Date.now();
  };
  /** 'granted' | 'prompt' | 'denied' | 'gone'. Only queries: safe to call on every render. */
  DR.dirPermission = async function (h) {
    if (!h) return 'gone';
    if (!h.queryPermission) return 'granted';
    return h.queryPermission({ mode: 'readwrite' }).catch(() => 'prompt');
  };
  /** Asks the browser for read and write access. Needs a button press (user activation). */
  DR.dirAllow = async function (h) {
    if (!h) return 'gone';
    if (!h.requestPermission) return 'granted';
    return h.requestPermission({ mode: 'readwrite' }).catch(() => 'denied');
  };

  /** rootOf: async () => the folder's directory handle, or null when it is no longer kept. */
  DR.makeDirProvider = function (id, label, rootOf) {
    const dirAt = async (ref, create = false) => {
      const h = await rootOf();
      if (!h) throw err(tr('drive.prov.gone', 'This folder is no longer connected. Remove it and add it again.'), 'gone');
      if (h.queryPermission && (await h.queryPermission({ mode: 'readwrite' })) !== 'granted') {
        throw err(tr('drive.prov.no_access', 'Access to this folder is not granted. Press “Allow access” on its name.'), 'permission');
      }
      let d = h;
      for (const s of segs(ref)) d = await d.getDirectoryHandle(s, { create });
      return d;
    };
    return {
      id, label, kind: 'dir',
      rootRef: () => '',
      /** Is ref at or inside ancestor? The root ('') contains everything. */
      within: (ancestor, ref) => ancestor === '' || ref === ancestor || String(ref).startsWith(ancestor + '/'),
      async list(ref) {
        const d = await dirAt(ref), folders = [], files = [];
        for await (const [name, h] of d.entries()) {
          if (h.kind === 'directory') { folders.push({ name, ref: join(ref, name), isFolder: true }); continue; }
          try {
            const f = await h.getFile();
            files.push({ name, ref: join(ref, name), isFolder: false, size: f.size || 0, modified: f.lastModified || 0 });
          } catch (e) { /* removed while listing: skip it */ }
        }
        return { folders: folders.sort(cmp), files: files.sort(cmp) };
      },
      async readBlob(ref) {
        const s = segs(ref), name = s.pop();
        const fh = await (await dirAt(s.join('/'))).getFileHandle(name);
        return fh.getFile();
      },
      /** A name that no entry in folderRef has (ignoring case). */
      async uniqueName(folderRef, name, isFolder) {
        const names = new Set();
        for await (const [n] of (await dirAt(folderRef)).entries()) names.add(n.toLowerCase());
        return DR.dirUniqueName(names, name, isFolder);
      },
      /** Writes through createWritable, which replaces the file only on close: a failed write keeps the old file. */
      async write(folderRef, name, blob) {
        const n = safe(name);
        const fh = await (await dirAt(folderRef)).getFileHandle(n, { create: true });
        const w = await fh.createWritable();
        try { await w.write(blob); await w.close(); } catch (e) { try { await w.abort(); } catch (x) { /* already closed */ } throw e; }
        return join(folderRef, n);
      },
      async mkdir(parentRef, name) {
        const n = safe(name);
        await (await dirAt(parentRef)).getDirectoryHandle(n, { create: true });
        return join(parentRef, n);
      },
      /** Deletes a file or a folder with everything in it. Only used after a move has copied the item. */
      async remove(ref) {
        const s = segs(ref), name = s.pop();
        if (!name) throw err(tr('drive.prov.root', 'The folder itself cannot be removed here.'), 'root');
        await (await dirAt(s.join('/'))).removeEntry(name, { recursive: true });
      },
    };
  };
})(window.DR);
