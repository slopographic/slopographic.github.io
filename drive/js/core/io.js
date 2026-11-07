/* Slop Drive — core/io: upload from the computer (files and whole folders), download (files, or folders
 * and selections as a .zip), and "Open with…" any Slopographic app that accepts the type. */
'use strict';
(function (DR) {
  const S = DR.S, H = () => window.SlopHub;

  /** Import [{ file, path: 'a/b/c.png' }] into folder dest, creating subfolders from the paths. */
  DR.importFiles = async function (list, dest = S.section === 'folder' ? S.cwd : null) {
    if (!list.length) return [];
    const made = new Map(), ids = [];
    async function folderFor(parts) {
      let parent = dest, key = '';
      for (const p of parts) {
        key += '/' + p;
        if (!made.has(key)) {
          const existing = [...S.folders.values()].find((f) => f.parent === parent && !f.trashedAt && f.name === p);
          let id = existing && existing.id;
          if (!id) { id = await H().createFolder(p, parent); S.folders.set(id, { id, name: p, parent, isFolder: true }); }
          made.set(key, id);
        }
        parent = made.get(key);
      }
      return parent;
    }
    DR.status && DR.status(DR.t('drive.toast.uploading_n', { n: list.length }));
    for (const { file, path } of list) {
      const parts = (path || file.name).split('/').filter(Boolean);
      const name = parts.pop() || file.name, folder = await folderFor(parts);
      const type = DR.guessType(name, file.type);
      const blob = file.type === type ? file : new Blob([file], { type });
      const id = await H().put(blob, { name: DR.uniqueName(folder, name, false), from: 'upload', folderId: folder, meta: { lastModified: file.lastModified } });
      S.files.set(id, { id, name, parent: folder, isFolder: false });
      ids.push('f:' + id);
    }
    await DR.done(DR.t('drive.toast.uploaded_n', { n: list.length }));
    if (DR.select) DR.select(ids.filter((k) => DR.item(k) && DR.item(k).parent === (S.section === 'folder' ? S.cwd : null)));
    return ids;
  };
  /** Upload files… / Upload a folder…: the intake's picker (ui/dnd.js), into the open folder. */
  DR.uploadPicker = (folders = false) => window.SlopIntake.pick({ to: 'drive', folder: !!folders, data: { dest: DR.dest() } });
  /** Read a drop: DataTransferItems may hold folders (webkitGetAsEntry). */
  DR.readDrop = async function (dt) {
    const out = [], entries = [...(dt.items || [])].map((it) => it.webkitGetAsEntry && it.webkitGetAsEntry()).filter(Boolean);
    if (!entries.length) return [...(dt.files || [])].map((f) => ({ file: f, path: f.name }));
    const fileOf = (e) => new Promise((res, rej) => e.file(res, rej));
    const readAll = (dir) => new Promise((res) => { const r = dir.createReader(), acc = []; const step = () => r.readEntries((b) => { if (!b.length) res(acc); else { acc.push(...b); step(); } }, () => res(acc)); step(); });
    async function walk(e, prefix) {
      if (e.isFile) { try { out.push({ file: await fileOf(e), path: prefix + e.name }); } catch (err) { /* unreadable */ } }
      else if (e.isDirectory) for (const c of await readAll(e)) await walk(c, prefix + e.name + '/');
    }
    for (const e of entries) await walk(e, '');
    return out;
  };

  /* ---------- download ---------- */
  DR.downloadFile = (r) => { window.SlopUI.download(r.blob, r.name); DR.touch(r); };
  /** Zip entries for a set of items (folders recurse; trashed children are skipped unless in the Trash view). */
  function zipEntries(items, prefix = '', out = []) {
    for (const it of items) {
      if (it.isFolder) {
        const { folders, files } = DR.children(it.id);
        out.push({ name: prefix + it.name + '/', data: null, time: it.modified });
        zipEntries([...folders, ...files], prefix + it.name + '/', out);
      } else out.push({ name: prefix + it.name, data: it.blob, time: it.modified });
    }
    return out;
  }
  DR.zipEntries = zipEntries;
  DR.download = async function (items) {
    if (!items.length) return;
    if (items.length === 1 && !items[0].isFolder) return DR.downloadFile(items[0]);
    DR.status && DR.status(DR.t('drive.toast.zipping'));
    const blob = await window.SlopZip.zip(zipEntries(items));
    window.SlopUI.download(blob, (items.length === 1 ? items[0].name : 'Slop Drive') + '.zip');   // i18n-ignore: a file name
    DR.status && DR.status('');
  };

  /* ---------- open in ---------- */
  const OPEN_PREF = 'slop-drive.openIn';
  /** The app remembered per file type (by extension, else MIME type): { png: 'vector', … }. */
  const remembered = () => { try { return JSON.parse(localStorage.getItem(OPEN_PREF)) || {}; } catch (e) { return {}; } };
  const typeKey = (r) => DR.ext(r.name) || (r.type || '').toLowerCase();
  /** The apps that open a file: an accepts pattern matches its MIME type, or a creates entry matches its type or
   * extension. The app that made it comes first, then the most specific match (creates, exact MIME, then wildcard). */
  DR.appsFor = (r) => {
    if (!r || r.isFolder) return [];
    const e = DR.ext(r.name);
    const rank = (a) => {
      if ((a.creates || []).some((c) => c.mime === r.type || (!!e && c.ext === e))) return 3;
      let best = 0;
      for (const p of a.accepts || []) if (H().matches(r.type, p)) best = Math.max(best, p.includes('*') || a.tool ? 1 : 2); // tools never become the default app
      return best;
    };
    const own = DR.creatorOf ? DR.creatorOf(r) : null;
    const rest = window.SLOP_APPS.filter((a) => a.kind === 'app' && a.id !== 'drive' && a !== own && rank(a) > 0).sort((x, y) => rank(y) - rank(x));
    return own ? [own, ...rest] : rest;
  };
  /** The default app for a file: the one remembered for its type if it still opens the file, else the first. */
  DR.defaultAppFor = (r) => { const apps = DR.appsFor(r), id = remembered()[typeKey(r)]; return apps.find((a) => a.id === id) || apps[0] || null; };
  /** Every app that opens a file, the default first. */
  DR.orderedAppsFor = (r) => { const apps = DR.appsFor(r), d = DR.defaultAppFor(r); return d ? [d, ...apps.filter((a) => a !== d)] : []; };
  /** Remember appId as the app for this file's type (localStorage; a blocked store just forgets it). */
  DR.rememberApp = (r, appId) => { try { localStorage.setItem(OPEN_PREF, JSON.stringify({ ...remembered(), [typeKey(r)]: appId })); } catch (e) { /* storage blocked */ } };
  DR.openWith = async function (r, appId, { remember = false } = {}) {
    if (!r || r.isFolder) return;
    if (remember) DR.rememberApp(r, appId);
    r.opened = Date.now();
    await H().update(r.id, { opened: r.opened }, { touch: false });
    // the one way out (shared/intake/outtake.js): the file is already in Slop Drive, so the app opens it (no copy)
    await window.SlopOuttake.send(appId, { id: r.id, name: r.name, type: r.type, from: 'drive' });
  };
  /** Double-click / Enter: folders open, files open in their default app, or in Quick Look if no app takes them. */
  DR.open = function (it) {
    if (!it) return;
    if (it.isFolder) { if (it.trashedAt || DR.hidden(it)) return DR.toast(DR.t('drive.toast.restore_to_open')); return DR.go(it.id); }
    const app = it.trashedAt ? null : DR.defaultAppFor(it);
    if (app) return DR.openWith(it, app.id);
    DR.quickLook && DR.quickLook(it);
  };
})(window.DR);
