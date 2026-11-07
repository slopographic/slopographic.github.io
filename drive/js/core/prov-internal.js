/* Slop Drive — core/prov-internal: Slop Drive's own store as a provider, with the same methods as prov-dir.js. Refs are
 * record ids, and a null or empty ref is the root. Reads come from the in-memory mirror (store.js); writes go through
 * SlopHub. Moving out of Slop Drive sends the original to the Trash, so the move can be undone there. */
'use strict';
(function (DR) {
  const S = DR.S, H = () => window.SlopHub;
  const nr = (r) => (r == null || r === '' ? null : r);
  const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

  DR.internalProvider = {
    id: 'drive', kind: 'internal',
    get label() { return DR.rootName(); },   // the drive's name in the chosen language
    rootRef: () => null,
    within: (ancestor, ref) => nr(ref) != null && DR.contains(ancestor, ref),
    async list(ref) {
      const { folders, files } = DR.children(nr(ref));
      return {
        folders: folders.map((f) => ({ name: f.name, ref: f.id, isFolder: true })).sort(byName),
        files: files.map((r) => ({ name: r.name, ref: r.id, isFolder: false, size: r.size || 0, modified: r.modified || r.time || 0, from: r.from, meta: r.meta })).sort(byName),
      };
    },
    async readBlob(ref) {
      const r = S.files.get(ref) || (await H().get(ref));
      if (!r || !r.blob) throw new Error(DR.t('drive.prov.file_gone'));
      return r.blob;
    },
    async uniqueName(folderRef, name, isFolder) { return DR.uniqueName(nr(folderRef), name, isFolder); },
    /* A new item is added to the in-memory mirror at once, so the next name in the same batch sees it (the next
     * refresh replaces the mirror with the stored records anyway). */
    async mkdir(parentRef, name) {
      const id = await H().createFolder(name, nr(parentRef)), now = Date.now();
      S.folders.set(id, { id, name, parentId: nr(parentRef), parent: nr(parentRef), isFolder: true, starred: false, trashedAt: null, created: now, modified: now });
      return id;
    },
    async write(folderRef, name, blob, extra = {}) {
      const now = Date.now(), from = extra.from || 'upload', meta = extra.meta || {};
      const id = await H().put(blob, { name, from, meta, folderId: nr(folderRef) });
      S.files.set(id, { id, name, type: blob.type || 'application/octet-stream', size: blob.size || 0, from, meta, blob, time: now, modified: now, opened: 0, folderId: nr(folderRef), parent: nr(folderRef), starred: false, trashedAt: null, isFolder: false });
      return id;
    },
    async remove(ref, isFolder) {
      const now = Date.now();
      if (isFolder) await H().updateFolder(ref, { trashedAt: now });
      else await H().update(ref, { trashedAt: now }, { touch: false });
    },
  };
})(window.DR);
