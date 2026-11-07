/* Slop Hex: the open files as tabs (the shared strip, shared/doctabs). A tab is one file: T = { doc, version, type, sel,
 * sha, shaStale, shaBusy }. doc is the HexDoc (the file's bytes plus the edits, doc.js). The file's own bytes are the format:
 * toBlob() is the file, and a Drive copy is the same bytes under the file's own name. The strip keeps the tabs across
 * reloads (session.js; a restored unsaved file comes back unsaved) and does Open from Drive and Save as new (drive.js).
 * Save version (actions.js) writes a new file beside the original, never over it. Classic script; exposes window.HexTabs. */
(function () {
  'use strict';
  if (window.HexTabs) return;
  let api = null, session = null, hooks = { activate() {}, deactivate() {}, refresh() {} };

  /** A tab for a HexDoc. version counts this file's saved versions (Save version). */
  function makeT(doc, opts = {}) {
    return { doc, type: opts.type || '', version: opts.version || 1, sel: null, sha: '', shaStale: false, shaBusy: false };
  }
  const newDoc = () => makeT(window.HexDoc.create(new Blob([]), { name: 'untitled.bin', type: 'application/octet-stream', crypto: window.crypto }));

  const adapter = {
    newDoc,
    serialize: (T) => ({ name: T.doc.name, type: T.type, blob: T.doc.toBlob(), dirty: T.doc.dirty(), version: T.version }),
    restore(s) {
      if (!s || !(s.blob instanceof Blob)) throw new Error('not a file');
      const doc = window.HexDoc.create(s.blob, { name: s.name || 'untitled.bin', type: s.type || s.blob.type, crypto: window.crypto, dirty: !!s.dirty });
      return makeT(doc, { type: s.type || s.blob.type, version: s.version });
    },
    title: (T) => T.doc.name,
    dirty: (T) => T.doc.dirty(),
    activate(T) { hooks.activate(T); },
    deactivate(T) { hooks.deactivate(T); },
    saved(T) { T.doc.markSaved(); hooks.refresh(); },
    drive: {
      ext: '', // the file keeps its own name (no extension is added)
      toBlob: (T) => T.doc.toBlob(),
      fromBlob: async (blob, name) => makeT(window.HexDoc.create(blob, { name, type: blob.type, crypto: window.crypto }), { type: blob.type }),
    },
  };

  window.HexTabs = {
    /** Mounts the strip. hooks: { activate(T), deactivate(T), refresh() } are called by the strip's switches and changes. */
    mount(host, h) {
      hooks = Object.assign(hooks, h || {});
      api = SlopDocTabs.mount(host, adapter, { appId: 'hex' });
      api.on(() => hooks.refresh());
      session = SlopDocTabs.session('hex', api, { notice: (m) => { if (window.SlopUI) SlopUI.toast(m, 4200); } });
      return session;
    },
    api: () => api,
    /** Writes the open tabs to this device now. */
    flush: () => (session ? session.flush() : Promise.resolve(false)),
    current: () => (api ? api.current() : null),
    makeT,
    newDoc,
    /** Opens a file in a new tab (or brings up the tab that shows this Drive file). */
    open(blob, name, driveId, version) {
      const T = makeT(window.HexDoc.create(blob, { name, type: blob.type, crypto: window.crypto }), { type: blob.type, version });
      api.openDoc(T, { driveId: driveId || null, origName: name || null });
      return T;
    },
    /** Tells the strip that the open file changed (a byte, an undo): the tab's unsaved dot and the session save follow. */
    changed(T) { if (api && T) api.changed(T); },
    anyDirty: () => (api ? api.tabs().some((t) => t.dirty) : false),
  };
})();
