/* Slop Drive — core/folder: a local folder the person chose (the same folder the cloud-backup panel uses, through
 * shared/sync/providers/local.js). While it is connected and access is granted, every new or changed Drive file is
 * written there as a real file in a "Slop Drive" subfolder. On open, the folder is read back: files in it that Drive
 * does not have are listed, and the person imports them. Nothing is deleted from the folder or from Drive by this.
 * Renames and deletes leave the old copy in the folder. The config lives at the folder root (shared/config/folder.js).
 * The settings and config scripts load the first time a config action runs. */
'use strict';
(function (DR) {
  const H = () => window.SlopHub;
  const L = () => (window.SlopSyncProviders && window.SlopSyncProviders.local) || null;
  const SUB = 'Slop Drive';
  const CONFIG_SCRIPTS = [
    'shared/data/money.js', 'shared/data/barcode.js', 'shared/data/schema-checks.js', 'shared/data/schema-defs.js', 'shared/data/schema.js', 'shared/data/currency.js',
    'shared/data/store.js', 'shared/data/numbering.js', 'shared/data/ledger.js', 'shared/data/fx.js',
    'shared/config/schema.js', 'shared/config/validate.js', 'shared/config/io.js', 'shared/config/kinds.js', 'shared/config/folder.js',
  ];
  const queue = new Set();
  let muted = false, timer = 0, configP = null;
  /** What the sidebar and menus show. name: the folder's name or null; perm: none | prompt | granted | denied. */
  DR.folderState = { supported: true, name: null, perm: 'none', missing: [] };
  /** Why there is no Local folder here (no showDirectoryPicker), in the current language. */
  DR.folderUnsupported = () => DR.t('drive.folder.unsupported');
  DR.folderSupported = () => { const l = L(); return !!l && l.supported(); };

  /** A name a file has in the folder: its Drive name, or with the id's last six characters when another file shares it. */
  function nameCounts(all) {
    const n = new Map();
    for (const r of all) { const k = r.name.toLowerCase(); n.set(k, (n.get(k) || 0) + 1); }
    return n;
  }
  function folderName(r, counts) {
    if ((counts.get(r.name.toLowerCase()) || 0) <= 1) return r.name;
    const m = /^(.*?)(\.[^.]{1,8})?$/.exec(r.name), stem = m[1], ext = m[2] || '';
    return stem ? `${stem} (${r.id.slice(-6)})${ext}` : `${r.name} (${r.id.slice(-6)})`;
  }
  const allRecords = () => H().list({ trashed: 'any' }); // intake-ok: Slop Drive itself

  /** Writes the queued records into the folder. Nothing is written without granted access. */
  async function flush() {
    const l = L();
    if (!l || muted || !queue.size || !DR.folderState.name) return;
    if ((await l.permission()) !== 'granted') return;
    const ids = [...queue];
    queue.clear();
    const counts = nameCounts(await allRecords());
    let wrote = 0, failed = 0;
    for (const id of ids) {
      const r = await H().get(id).catch(() => null);
      if (!r || r.isFolder || r.trashedAt || !r.blob) continue;
      try { await l.upload(null, folderName(r, counts), r.blob, { folder: SUB }); wrote++; } catch (e) { failed++; }
    }
    if (failed) DR.toast(DR.t('drive.folder.write_failed_n', { n: failed }));
    else if (wrote && DR.status) DR.status(DR.t('drive.folder.saved_n', { n: wrote }));
  }
  function enqueue(id) {
    if (muted || !id || !DR.folderState.name) return;
    queue.add(id);
    clearTimeout(timer);
    timer = setTimeout(() => { flush().catch((e) => console.warn('Slop Drive: folder write', e)); }, 400);
  }
  // Writes made in this tab, and writes from other apps and tabs (their 'drive:change' reaches this page).
  const put = H().put;
  H().put = async function (...a) { const id = await put.apply(this, a); enqueue(id); return id; };
  H().on('drive:change', (d) => { if (d && (d.what === 'put' || d.what === 'update') && d.id) enqueue(d.id); });

  /** Every file in Drive goes into the folder (connect, or access granted). */
  DR.folderMirrorAll = async function () {
    for (const r of await allRecords()) if (!r.trashedAt) queue.add(r.id);
    await flush();
  };

  /** Files in the folder that no Drive file has, by name. A renamed file's old copy shows here too. */
  async function missing() {
    const all = await allRecords(), counts = nameCounts(all), have = new Set();
    for (const r of all) { have.add(r.name); have.add(folderName(r, counts)); }
    const files = await L().list(null, '', { folder: SUB });
    return files.filter((f) => !have.has(f.name)).map((f) => ({ name: f.name, size: f.size }));
  }

  /** Reads the chosen folder and the permission state. Never asks the person. */
  DR.folderRefresh = async function () {
    const l = L();
    if (!l || !l.supported()) return Object.assign(DR.folderState, { supported: false, name: null, perm: 'none', missing: [] });
    const ch = await l.chosen(), name = ch ? ch.name : null, perm = await l.permission();
    let list = [];
    if (name && perm === 'granted') list = await missing().catch(() => []);
    return Object.assign(DR.folderState, { supported: true, name, perm, missing: list });
  };

  /** Imports the folder's files that Drive does not have, as new Drive files. */
  DR.folderImport = async function () {
    const l = L(), files = DR.folderState.missing.slice();
    await DR.refresh();
    muted = true;
    let n = 0;
    try {
      for (const f of files) {
        const blob = await l.download(null, f.name, { folder: SUB });
        if (!blob) continue;
        await H().put(blob, { name: DR.uniqueName(null, f.name, false), from: 'upload', folderId: null, meta: { lastModified: blob.lastModified || 0 } });
        n++;
      }
    } finally { muted = false; }
    await DR.refresh();
    await DR.folderRefresh();
    DR.render();
    DR.toast(DR.t('drive.folder.imported_n', { n }));
  };

  DR.folderAllow = async function () {
    const p = await L().allow();
    if (p !== 'granted') return window.SlopUI.alert(DR.t('drive.folder.not_granted'), DR.t('drive.folder.not_granted_body'));
    await DR.folderRefresh();
    await DR.folderMirrorAll();
    await DR.folderRefresh();
    DR.renderFolder();
  };

  DR.folderDisconnect = async function () {
    await L().forget();
    queue.clear();
    clearTimeout(timer);
    await DR.folderRefresh();
    DR.renderFolder();
    DR.toast(DR.t('drive.folder.disconnected'));
  };

  /** Loads the settings and config scripts once, on the first config action (boot stays as light as before). */
  DR.ensureConfig = function () {
    if (!configP) {
      configP = (async () => { for (const s of CONFIG_SCRIPTS) await H().loadScript(s); })().catch((e) => { configP = null; throw e; });
    }
    return configP;
  };
})(window.DR);
