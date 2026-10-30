/* Slop Docs — ui/tabs: the document tab strip (shared/doctabs) and its adapter. Each tab is an app object
 * T = { doc, file, sel, undo, redo, lastKind, lastAt }: the engine's document, its file, its caret and its undo history.
 * The open document (SlopDocs.doc, file, sel, undoStack ...) belongs to the current tab. Switching copies those fields
 * out of the old tab and into the new one; every edit copies them out and tells the strip (changed), which saves the
 * tab for the session (shared/doctabs/session.js). Saving to and opening from Slop Drive go through the strip too.
 * Classic script, loaded after ui/files.js and before ui/main.js. Exposes SlopDocs.mountTabs, tabs, makeTab, openNew. */
(function () {
  'use strict';
  const S = window.SlopDocs;
  const E = () => window.SlopDocEngine;
  const SDOC_MIME = 'application/x-slop-doc';
  let tabs = null;        // the SlopDocTabs api, once mounted
  let switching = false;  // true while a tab is being put on screen: the copy-out must not run then

  const baseName = (n) => String(n || S.untitled()).replace(/\.sdoc$/i, '') || S.untitled();
  const current = () => (tabs ? tabs.current() : null);

  /** A new tab object: the document, its file (name, folder, dirty) and an empty caret and undo history. */
  function makeTab(doc, file) {
    return {
      doc,
      file: Object.assign({ id: null, folderId: null, name: S.untitled(), dirty: false, saved: 0 }, file || {}),
      sel: { a: { b: 0, o: 0 }, f: { b: 0, o: 0 } },
      undo: [], redo: [], lastKind: '', lastAt: 0,
    };
  }
  /** The open document's fields -> the tab (T), and back (before a tab is shown). */
  function copyOut(T) {
    T.doc = S.doc; T.file = S.file; T.sel = S.sel;
    T.undo = S.undoStack; T.redo = S.redoStack; T.lastKind = S.lastKind; T.lastAt = S.lastAt;
  }
  function copyIn(T) {
    S.doc = T.doc; S.file = T.file; S.sel = T.sel;
    S.undoStack = T.undo; S.redoStack = T.redo; S.lastKind = T.lastKind; S.lastAt = T.lastAt;
    S.pending = null; S.goalX = null;
  }

  /** The strip's adapter (the contract is shared/doctabs/HANDOFF.md). */
  const adapter = {
    newDoc: () => makeTab(E().M.newDoc(), { name: S.untitled() }),
    serialize: (T) => ({
      doc: T.doc,
      file: { folderId: T.file.folderId == null ? null : T.file.folderId, name: T.file.name, dirty: !!T.file.dirty, saved: T.file.saved || 0 },
    }),
    restore(state) {
      if (!state || !state.doc || !Array.isArray(state.doc.blocks)) throw new Error('not a Slop Docs document');
      const f = state.file || {};
      return makeTab(E().M.normalizeDoc(state.doc), {
        folderId: f.folderId == null ? null : f.folderId,
        name: typeof f.name === 'string' ? f.name : S.untitled(),
        dirty: !!f.dirty, saved: f.saved || 0,
      });
    },
    title: (T) => baseName(T.file.name),
    dirty: (T) => !!T.file.dirty,
    activate(T) {
      switching = true;
      try {
        copyIn(T);
        T.file.id = tabs.driveIdOf(T);
        if (S.setUrl) S.setUrl(T.file.id || null);
        S.registerOwnFonts(T.doc);
        S.relayout();
        E().ensureDocFonts(T.doc).catch(() => {});
        S.emit('doc');
        S.emit('view');
      } finally { switching = false; }
    },
    deactivate(T) { copyOut(T); },
    saved(T) {
      T.file.name = baseName(T.file.name) + '.sdoc';
      T.file.dirty = false;
      T.file.saved = Date.now();
      T.file.id = tabs.driveIdOf(T);
      if (T === current()) S.emit('view');
    },
    drive: {
      ext: '.sdoc',
      mime: SDOC_MIME,
      toBlob: (T) => E().SD.sdocBlob(T.doc),
      fromBlob: async (blob, name) => {
        const r = await S.readRecord({ blob, name, type: SDOC_MIME });
        return makeTab(r.doc, { name });
      },
    },
  };

  /** A tab that holds nothing: no edits, no Drive file, one empty paragraph. */
  S.isPristine = (T) => !!T && !T.file.dirty && !tabs.driveIdOf(T) && T.doc.blocks.length === 1 && E().M.paraText(T.doc.blocks[0]) === '';
  S.makeTab = makeTab;
  /** A document in a new tab (a template, a launch). */
  S.openNew = (doc, file) => tabs.openDoc(makeTab(doc, file));
  S.newDoc = () => { tabs.newTab(); if (S.focusIme) S.focusIme(); };
  S.driveId = () => (current() ? tabs.driveIdOf(current()) : null);
  S.syncTab = () => { if (current()) copyOut(current()); };
  S.tabsApi = () => tabs;

  /** Mount the strip and its session. Returns the session: call session.restore() once, after the engine is ready. */
  S.mountTabs = function () {
    const host = document.getElementById('tabs');
    tabs = SlopDocTabs.mount(host, adapter, { appId: 'docs' });
    const sync = () => { if (!switching && S.doc && current()) { copyOut(current()); tabs.changed(current()); } };
    S.on('change', sync);
    S.on('doc', sync);
    const guard = () => { if (window.SlopGuard) SlopGuard.setUnsaved('docs', tabs.tabs().some((t) => t.dirty)); };
    tabs.on(guard);
    return SlopDocTabs.session('docs', tabs, { notice: (msg) => { if (window.SlopUI) SlopUI.toast(msg, 4200); } });
  };
})();
