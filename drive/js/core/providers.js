/* Slop Drive — core/providers: the places the Drive copies to and from, and the glue between them and the UI.
 * Providers: Slop Drive (prov-internal.js), the Local folder (the folder Cloud backup and the sidebar box use, read from
 * its IndexedDB handle) and each named local drive (drives-store.js). Google Drive and Dropbox are not listed: browsing
 * their folders needs network calls, and this app makes none. A drop target for a provider folder is 'pv:<id>|<ref>'. */
'use strict';
(function (DR) {
  const nr = (r) => (r == null || r === '' ? null : r);

  /** The handle of the Local folder connection (the same one Cloud backup uses), or null. Reads IndexedDB only. */
  DR.mirrorHandle = function () {
    return new Promise((resolve) => {
      let r;
      try { r = indexedDB.open('slop-sync-local', 1); } catch (e) { return resolve(null); }
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('handles')) r.result.createObjectStore('handles'); };
      r.onerror = () => resolve(null);
      r.onsuccess = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('handles')) { db.close(); return resolve(null); }
        const q = db.transaction('handles', 'readonly').objectStore('handles').get('dir');
        q.onsuccess = () => { db.close(); resolve(q.result || null); };
        q.onerror = () => { db.close(); resolve(null); };
      };
    });
  };

  const dirDesc = (id, label, group, handle) => ({ id, label, group, handle, provider: DR.makeDirProvider(id, label, async () => handle), status: 'gone' });

  /** Every provider in sidebar order, each with its permission state. The state is only queried, never asked. */
  DR.providerList = async function () {
    const out = [{ id: 'drive', label: DR.rootName(), group: 'drive', handle: null, provider: DR.internalProvider, status: 'granted' }];
    const mh = await DR.mirrorHandle().catch(() => null);
    if (mh) out.push(dirDesc('mirror', DR.t('drive.folder.local_of', { name: mh.name }), 'mirror', mh));
    for (const d of await DR.drivesAll()) out.push(dirDesc('dir:' + d.id, d.name, 'drive', d.handle || null));
    for (const d of out) if (d.handle) d.status = await DR.dirPermission(d.handle);
    return out;
  };
  DR.providerById = async (id) => (await DR.providerList()).find((d) => d.id === id) || null;

  DR.pv = (id, ref) => 'pv:' + id + '|' + (ref == null ? '' : ref);
  DR.isPvTarget = (v) => typeof v === 'string' && v.indexOf('pv:') === 0;
  /** The destination a target value names: { provider, ref, label }. Throws a message when the place is gone or locked. */
  DR.resolveDest = async function (v) {
    const s = String(v).slice(3), i = s.indexOf('|'), id = s.slice(0, i), ref = s.slice(i + 1);
    const d = await DR.providerById(id);
    if (!d || d.status === 'gone') throw new Error(DR.t('drive.prov.place_gone'));
    if (d.status !== 'granted') throw new Error(DR.t('drive.prov.allow_first', { name: d.label }));
    return { provider: d.provider, ref: d.provider.kind === 'internal' ? nr(ref) : ref, label: d.label };
  };
  /** Can these Slop Drive items be dropped on target value v? (The folder rules are checked by the move itself.) */
  DR.canDrop = (items, v) => (DR.isPvTarget(v) ? true : v === 'trash' || v === 'star' || DR.canMove(items, v === 'root' ? null : v));

  /* ---------- entries: what a transfer copies or moves ---------- */
  DR.internalEntry = (it) => ({ provider: DR.internalProvider, ref: it.id, name: it.name, isFolder: !!it.isFolder, parent: it.parent, from: it.from, meta: it.meta, item: DR.keyOf(it) });
  DR.internalEntries = (items) => items.map(DR.internalEntry);
  const parentRef = (ref) => { const i = ref.lastIndexOf('/'); return i < 0 ? '' : ref.slice(0, i); };
  /** A folder or file of a local provider, from its listing row. */
  DR.dirEntry = (d, node) => ({ provider: d.provider, ref: node.ref, name: node.name, isFolder: node.isFolder, parent: parentRef(node.ref) });

  /** Copies or moves entries into dst ({provider, ref, label}). Slop Drive to Slop Drive keeps the records as before. */
  DR.transferEntries = async function (entries, dst, { move = false } = {}) {
    if (!entries.length) return null;
    const internal = dst.provider.kind === 'internal' || entries.some((e) => e.provider.kind === 'internal');
    if (dst.provider.kind === 'internal' && entries.every((e) => e.provider.kind === 'internal')) {
      const items = entries.map((e) => DR.item(e.item)).filter(Boolean);
      return move ? DR.move(items, dst.ref) : DR.copy(items, dst.ref);
    }
    const res = await DR.copyTree(entries, dst, { move });
    const n = res.done, msg = n ? DR.t(move ? 'drive.toast.moved_to_n' : 'drive.toast.copied_to_n', { n, place: dst.label }) : null;
    if (internal) await DR.done(msg); else if (msg) DR.toast(msg);
    if (DR.provChanged) DR.provChanged();
    if (res.errors.length) window.SlopUI.alert(DR.t(res.failed ? 'drive.prov.some_failed' : 'drive.prov.some_skipped'), res.errors.slice(0, 6).join('\n'));
    return res;
  };
  /** A drop of entries on a target value (a 'pv:' place, or a Slop Drive folder id / 'root'). */
  DR.dropToProvider = async function (entries, v, copy = false) {
    const target = DR.isPvTarget(v) ? v : DR.pv('drive', v == null || v === 'root' ? '' : v);
    try { return await DR.transferEntries(entries, await DR.resolveDest(target), { move: !copy }); } catch (e) { return window.SlopUI.alert(DR.t('drive.prov.not_copied'), e.message); }
  };

  /** Files dropped from the computer onto a provider folder. Folders in the drop are made as they are met. */
  DR.uploadToProvider = async function (list, v) {
    let dst;
    try { dst = await DR.resolveDest(v); } catch (e) { return window.SlopUI.alert(DR.t('drive.prov.not_uploaded'), e.message); }
    const p = dst.provider, made = new Map();
    const folderFor = async (parts) => {
      let ref = dst.ref, key = '';
      for (const part of parts) {
        key += '/' + part;
        if (!made.has(key)) made.set(key, await p.mkdir(ref, await p.uniqueName(ref, part, true)));
        ref = made.get(key);
      }
      return ref;
    };
    let n = 0;
    const errors = [];
    for (const { file, path } of list) {
      try {
        const parts = String(path || file.name).split('/').filter(Boolean), name = parts.pop() || file.name;
        const ref = await folderFor(parts);
        await p.write(ref, await p.uniqueName(ref, name, false), file, { from: 'upload', meta: { lastModified: file.lastModified || 0 } });
        n++;
      } catch (e) { errors.push(`${file.name}: ${e.message}`); }
    }
    if (dst.provider.kind === 'internal') await DR.done(n ? DR.t('drive.toast.uploaded_n', { n }) : null);
    else if (DR.provChanged) DR.provChanged();
    if (errors.length) window.SlopUI.alert(DR.t('drive.prov.files_failed'), errors.slice(0, 6).join('\n'));
    return n;
  };
})(window.DR);
