/* Slop Drive — ui/newdoc: the "New ▸" document menu. Every SLOP_APPS entry with `creates`
 * ({ label, ext, mime }) can make an empty file of its type in the current folder
 * ("Untitled document.sdoc" …), which then opens in that app via ?drive=<id>. */
'use strict';
(function (DR) {
  const S = DR.S, H = () => window.SlopHub;
  /** [{ app, label, ext, mime }] for every app that creates a native file type. */
  DR.creatables = () => (window.SLOP_APPS || []).filter((a) => a.kind === 'app' && Array.isArray(a.creates))
    .flatMap((a) => a.creates.map((c) => ({ app: a, label: c.label, ext: c.ext, mime: c.mime })));
  /** A creatable type's name in the chosen language (drive.newdoc.<ext>), else the registry's English label. */
  DR.newLabel = (c) => { const k = 'drive.newdoc.' + c.ext, s = DR.t(k); return s && s !== k ? s : c.label; };
  /** The app's name as the app list shows it, in the chosen language (shared/apps.js). */
  DR.appLabel = (a) => (window.slopAppName ? window.slopAppName(a) : a.name);
  /** The app that natively creates files of this mime / extension, if any. */
  DR.creatorOf = (r) => {
    if (!r || r.isFolder) return null;
    const e = (/\.([a-z0-9]+)$/i.exec(r.name || '') || [])[1];
    const c = DR.creatables().find((x) => x.mime === r.type || (e && x.ext === e.toLowerCase()));
    return c ? c.app : null;
  };
  /** Create an empty file of creatable c (or app id) in folder (default: the open folder), then open it. */
  DR.createNew = async function (c, folder = DR.dest(), { open = true } = {}) {
    if (typeof c === 'string') c = DR.creatables().find((x) => x.app.id === c || x.ext === c);
    if (!c) return null;
    const name = DR.uniqueName(folder, `Untitled ${c.label.toLowerCase()}.${c.ext}`, false);
    const id = await H().put(new Blob([], { type: c.mime }), { name, from: 'drive', folderId: folder });
    S.files.set(id, { id, name, parent: folder, isFolder: false });
    await DR.done(DR.t('drive.toast.created', { name }));
    if (DR.select && folder === DR.dest()) DR.select(['f:' + id]);
    if (open) {
      const r = await H().get(id);
      if (r) await H().update(id, { opened: Date.now() }, { touch: false });
      await window.SlopOuttake.send(c.app.id, { id, name, type: c.mime, from: 'drive' }); // the one way out, no copy
    }
    return id;
  };
  /** Menu rows for SlopUI.menu: one per creatable type. */
  DR.newItems = (folder = DR.dest()) => {
    const list = DR.creatables();
    if (!list.length) return [{ label: DR.t('drive.menu.no_doc_types'), disabled: true }];
    return list.map((c) => ({ label: DR.t('drive.menu.new_doc_of', { label: DR.newLabel(c), app: DR.appLabel(c.app) }), act: () => DR.createNew(c, folder) }));
  };
  DR.newSub = (folder = DR.dest()) => ({ label: DR.t('drive.menu.new'), sub: DR.newItems(folder) });
})(window.DR);
