/* Slop PDF — the open documents as tabs. The strip is shared/doctabs (SlopDocTabs); each tab is one document record
   (io/doc-state.js). Switching saves the document on screen (its files, pages, view, file name, undo stack and edit log)
   and shows the other one. The tabs and their documents come back after a reload (the strip's session). Classic script. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, H = SP.history, O = SP.organizer, Ed = SP.editor, A = SP.app, S = A._, D = SP.docs;
  var $ = U.$, t = U.t;
  var DT = SP.tabs = {};
  var api = null, session = null, shown = null, lastLoad = Promise.resolve(), locks = 0, driveVal = null;

  D.list = function () { return api ? api.tabs().map(function (tab) { return tab.doc; }) : []; };

  /* A.driveId is the Drive file of the open tab (the strip keeps it per tab, across reloads). */
  Object.defineProperty(A, 'driveId', {
    configurable: true,
    get: function () { return shown && api ? api.driveIdOf(shown) : driveVal; },
    set: function (v) { if (shown && api) api.setDriveId(shown, v || null); else driveVal = v || null; },
  });

  /* The Drive file of a given tab (its record), not of the tab on screen: an async result (a Drive answer) goes here. */
  A.setDriveIdOf = function (doc, id) {
    if (doc && api) api.setDriveId(doc, id || null); else A.driveId = id || null;
  };

  /* A file that is opening (or a tab that is loading) must not land in another tab: the strip waits meanwhile. */
  function lock(d) { locks = Math.max(0, locks + d); document.documentElement.classList.toggle('is-locked', locks > 0); }
  A.isLocked = function () { return locks > 0; };
  A.lockedOpen = async function (fn) { lock(1); try { return await fn(); } finally { lock(-1); } };
  window.addEventListener('keydown', function (e) {
    if (!locks) return;
    var k = String(e.key || '');
    if (((e.ctrlKey || e.metaKey) && (/^[tw]$/i.test(k) || k === 'Tab')) || k === 'F2') { e.preventDefault(); e.stopPropagation(); }
  }, true);

  function pagesOf(doc) { return doc.pending ? doc.pending.state.pages.length : (doc.live ? E.state : doc.state).pages.length; }
  function titleOf(doc) {
    if (!pagesOf(doc) && !doc.fileNameTouched) return t('ui.untitled');
    return U.baseName((doc.live ? S.els.fileName.value : doc.fileName) || 'document.pdf');
  }

  /* The strip's adapter: a record is the document; see HANDOFF.md for the contract. */
  var adapter = {
    newDoc: function () { return D.make(); },
    serialize: function (doc) { if (!U.store.get('autosave', true)) throw new Error('autosave is off'); return D.serialize(doc); },
    restore: function (st) { return D.fromState(st); },
    title: titleOf,
    dirty: function (doc) { return !doc.pending && H.depth(doc.id) !== doc.cleanDepth; },
    activate: activate,
    deactivate: function (doc) { if (doc.live) swapOut(doc); },
    saved: function (doc) { doc.cleanDepth = H.depth(doc.id); },
    drive: { ext: '.pdf', mime: 'application/pdf', toBlob: function () { return A.currentPdfBlob(); } },
  };

  /** The tab on screen goes into its record; the editor is emptied until the next tab is shown. */
  function swapOut(doc) {
    if (Ed.isEditingText()) Ed.commitText();
    SP.editLog.flush(); // this document's saved edits, written while its files are still the open ones
    doc.view = A.viewNow();
    doc.fileName = S.els.fileName.value; doc.fileNameTouched = S.fileNameTouched;
    doc.files = E.files; doc.assets = E.assets; doc.state = E.state; doc.colorIdx = E._colorIdx;
    Ed.hide();
    SP.editLog.flush();
    doc.live = false; shown = null;
    E.files = new Map(); E.assets = new Map(); E.state = E.blankState();
  }
  /** The record becomes the open document: its files, state, undo stack and view. */
  function swapIn(doc) {
    E.files = doc.files; E.assets = doc.assets; E.state = doc.state; E._colorIdx = doc.colorIdx;
    S.els.fileName.value = doc.fileName; S.fileNameTouched = doc.fileNameTouched;
    H.useStack(doc.id);
    doc.live = true; shown = doc;
    O.setSelection([]);
    if (A.mode === 'page') A.showGrid(true);
    E.emit('files');
    E.emit('change', {});
    A.applyView(doc.view || { tool: 'organize' });   // a new document opens on Organize, or on the tool a ?tool= link named (route.js)
    S.updateChrome();
    if (SP.panes) SP.panes.onDocShown(doc);   // a split view's previews take the document that left (ui/panes.js)
  }
  function activate(doc) {
    if (!doc.pending) { swapIn(doc); lastLoad = Promise.resolve(); return; }
    lock(1);
    S.busy(t('pdf.app.opening_doc'), 0);
    lastLoad = D.load(doc).catch(function (e) {
      console.warn('Slop PDF: a tab could not be opened', e);
      doc.files = new Map(); doc.assets = new Map(); doc.state = E.blankState(); doc.pending = null;
      A.status(t('pdf.app.tab_restore_failed'), 'err');
    }).then(function () {
      lock(-1); if (!A.isLocked()) S.busy(null); // another tab may still be loading
      if (api && api.current() === doc && !doc.live) swapIn(doc);
    });
  }

  /** The strip's events: a closed tab frees its files and undo stack; a rename (strip) sets the file name. */
  function onStrip(why, tab) {
    if (!api || !tab) return;
    if (why === 'close') {
      H.dropStack(tab.doc.id);
      if (tab.doc.files && !tab.doc.live) tab.doc.files.forEach(function (f) { if (f.doc) Promise.resolve(f.doc.destroy()).catch(function () {}); });
      return;
    }
    if (why !== 'content') return;
    var row = api.tabs().find(function (r) { return r.doc === tab.doc; });
    if (!row || !row.name) return;
    var fn = U.safeName(row.name + '.pdf', 'pdf');
    if (tab.doc === shown) { S.els.fileName.value = fn; S.fileNameTouched = true; } else tab.doc.fileName = fn;
    tab.doc.fileNameTouched = true;
  }

  /** File > Rename, the top-bar name field: the open tab takes the name (its strip title, file name and Drive file). */
  DT.rename = function (base) {
    if (!api || !shown) { S.els.fileName.value = U.safeName(base + '.pdf', 'pdf'); S.fileNameTouched = true; return Promise.resolve(true); }
    return api.rename(shown, base);
  };
  DT.current = function () { return shown; };
  DT.api = function () { return api; };
  A.newDocTab = function (origName) { return api.openDoc(adapter.newDoc(), { origName: origName || null }).doc; };
  A.newTab = function () { return api.newTab().doc; };
  A.closeTab = function () { return api.close(); };
  A.tabsFlush = function () { return session ? session.flush() : Promise.resolve(false); };
  /** Autosave off deletes the stored tabs; on writes every open tab again. */
  A.setAutosave = function (on) {
    if (!api) return;
    if (on) api.tabs().forEach(function (tab) { api.changed(tab.doc); }); else session.clear();
  };

  /** Mounts the strip and restores the stored tabs. A.tabsReady resolves once the tab on screen is open. */
  A.startTabs = function () {
    api = SlopDocTabs.mount($('#tabs'), adapter, { appId: 'pdf' });
    session = SlopDocTabs.session('pdf', api, { notice: function (m) { SlopUI.toast(m, 4200); } });
    api.on(onStrip);
    E.on('change', function () { if (shown && api) api.changed(shown); });
    // A file opened into an empty tab is the tab's starting point, not an unsaved change. The name is set after the
    // pages are committed, so the strip is drawn again once an open or a sample has finished.
    ['addFiles', 'loadSample'].forEach(function (k) {
      var run = A[k];
      A[k] = function (files, opts) {
        var doc = shown, wasEmpty = !E.state.pages.length;
        return run.call(A, files, opts).then(function (r) {
          if (wasEmpty && doc && doc.live && E.state.pages.length) doc.cleanDepth = H.depth(doc.id);
          if (shown && api) api.changed(shown);
          return r;
        });
      };
    });
    var save = A.saveToDrive; // a save to Slop Drive is a clean point for the tab
    A.saveToDrive = function () {
      var doc = shown;
      return save.apply(A, arguments).then(function (id) { if (id && doc && api) api.markSaved(doc); return id; });
    };
    var go = U.store.get('autosave', true) ? session.restore() : Promise.resolve(api.newTab());
    A.tabsReady = Promise.resolve(go).then(function () { return lastLoad; });
  };
})();
