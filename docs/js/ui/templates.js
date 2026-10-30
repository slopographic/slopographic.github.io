/* Slop Docs — ui/templates: My templates. A saved template is kept in two places: IndexedDB (store 'templates' of
 * 'slop-docs', so File ▸ New ▸ My templates lists it on every launch in this browser) and Slop Drive, as a
 * .sdoc-template file in a "Templates" folder. Classic script; window.SlopDocs. */
(function () {
  'use strict';
  const S = window.SlopDocs;
  const FOLDER = 'Templates', TYPE = 'application/x-slop-doc-template';
  S.tplList = [];

  /** Load the saved templates (newest first) and tell the menus. */
  S.tplLoad = async function () {
    const rows = await S.tplStore('readonly', (s) => s.getAll()).catch(() => null);
    S.tplList = (rows || []).sort((a, b) => b.created - a.created);
    S.emit('tpl');
    return S.tplList;
  };
  /** The copy in Slop Drive, in the Templates folder (created on first use). Resolves with the Drive id, or null. */
  async function driveCopy(rec) {
    const H = window.SlopHub;
    if (!H) return null;
    const top = await H.listFolders({ parentId: null, trashed: false });
    const found = top.find((f) => f.name === FOLDER);
    const folderId = found ? found.id : await H.createFolder(FOLDER, null);
    const blob = new Blob([JSON.stringify({ kind: 'sdoc-template', v: 1, name: rec.name, seed: rec.seed, doc: rec.doc })], { type: TYPE });
    return H.put(blob, { name: rec.name + '.sdoc-template', from: 'docs', folderId, meta: { template: true, seed: rec.seed } });
  }
  /** Save a design as a template under name. Resolves with the record. */
  S.tplSave = async function (name, seed, doc) {
    const rec = { id: 'tpl' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), name, seed, doc: JSON.parse(JSON.stringify(doc)), created: Date.now(), driveId: null };
    await S.tplStore('readwrite', (s) => s.put(rec));
    try {
      rec.driveId = await driveCopy(rec);
      if (rec.driveId) await S.tplStore('readwrite', (s) => s.put(rec));
    } catch (e) { console.warn('Slop Docs: the template is only in this browser', e); }
    await S.tplLoad();
    return rec;
  };
  S.tplLoad();
})();
