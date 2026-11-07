/* Slop PDF — the documents behind the tabs (ui/doc-tabs.js). A document record holds one tab's files (pdf.js proxies), its
   assets, its state (pages, meta, stamps, forms), its view and its file name. The record of the tab on screen shares the live
   objects (E.files, E.assets, E.state); when the tab leaves the screen the live objects are kept in its record and the next
   tab's record takes their place. A stored tab (after a reload) is only its saved form until it is opened (load). */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine;
  var D = SP.docs = {};
  var seq = 0;

  /** Every open tab's record. ui/doc-tabs.js replaces this with the strip's list. */
  D.list = function () { return []; };
  /** True when another tab already holds a file with this id (the id must stay unique across tabs: its thumbnails and caches are keyed by it). */
  E.fileIdTaken = function (id, map) {
    return D.list().some(function (doc) { return doc.files !== map && !!doc.files && doc.files.has(id); });
  };
  /** The open tab (on screen or stored) that holds a file with this fingerprint, or null. */
  D.holding = function (fp, except) {
    if (!fp) return null;
    var hit = null;
    D.list().some(function (doc) {
      if (doc === except) return false;
      var fps = doc.pending ? doc.pending.files.map(function (f) { return f.fp; }) : Array.from((doc.files || new Map()).values()).map(function (f) { return f.fp; });
      if (fps.indexOf(fp) >= 0) { hit = doc; return true; }
      return false;
    });
    return hit;
  };

  D.make = function (fileName) {
    return {
      id: 'd' + Date.now().toString(36) + '-' + (seq++).toString(36) + Math.random().toString(36).slice(2, 6),
      files: new Map(), assets: new Map(), state: E.blankState(), colorIdx: 0,
      fileName: fileName || 'document.pdf', fileNameTouched: false,
      view: null, pending: null, live: false, cleanDepth: 0,
    };
  };

  /** The saved form of a record: JSON-safe, with the file bytes (IndexedDB keeps them). Throws when the record is not a document. */
  D.serialize = function (doc) {
    if (doc.pending) return Object.assign({}, doc.pending, { fileName: doc.fileName, view: doc.view || doc.pending.view || null });
    var live = doc.live, files = live ? E.files : doc.files, assets = live ? E.assets : doc.assets, state = live ? E.state : doc.state;
    return {
      v: 1,
      files: Array.from(files.values()).filter(function (f) { return !f.locked; }).map(function (f) { return { id: f.id, name: f.name, bytes: f.bytes, color: f.color, fp: f.fp || null, security: f.security || null }; }),
      assets: Array.from(assets.values()),
      state: JSON.parse(JSON.stringify(state)),
      fileName: live ? SP.app._.els.fileName.value : doc.fileName,
      view: live ? SP.app.viewNow() : (doc.view || null),
    };
  };

  /** A record for a stored form. Nothing is read yet: load() opens its files when the tab is shown. */
  D.fromState = function (st) {
    if (!st || st.v !== 1 || !Array.isArray(st.files) || !st.state) throw new Error('not a PDF document record');
    var doc = D.make(st.fileName || 'document.pdf');
    doc.pending = st; doc.view = st.view || null; doc.fileNameTouched = !!st.fileName;
    return doc;
  };

  /** Opens a stored record's files with pdf.js into fresh maps. Touches no live state, so it can run for a tab that is not on screen. */
  D.load = async function (doc) {
    var st = doc.pending, files = new Map(), assets = new Map(), ids = {};
    (st.assets || []).forEach(function (a) { assets.set(a.id, a); });
    for (var i = 0; i < st.files.length; i++) {
      var fd = st.files[i];
      var wanted = fd.id && !E.fileIdTaken(fd.id, files) ? fd.id : null;
      try {
        var bytes = fd.bytes instanceof Uint8Array ? fd.bytes : new Uint8Array(fd.bytes);
        var rf = await E.registerPdf(bytes, fd.name, null, { id: wanted || undefined, color: fd.color, silent: true, files: files });
        rf.noLog = true; // the saved tab holds these edits; the edit log is for files opened from disk
        if (fd.security) { rf.security = fd.security; rf.decrypted = true; } // what the original's password allowed (no password)
        ids[fd.id] = rf.id;
      } catch (e) { console.warn('Slop PDF: could not restore', fd.name, e); }
    }
    // a page of a file whose id had to change (another tab holds it) follows the new id
    var pages = (st.state.pages || []).filter(function (p) { return p.blank || ids[p.f]; });
    pages.forEach(function (p) {
      if (p.blank || ids[p.f] === p.f) return;
      var old = p.f, nf = ids[old];
      p.id = nf + p.id.slice(old.length); p.f = nf;
    });
    doc.state = Object.assign(E.blankState(), st.state, { pages: pages });
    doc.files = files; doc.assets = assets; doc.colorIdx = files.size; doc.pending = null;
    return doc;
  };

  /** The mirror kept under IndexedDB 'session': the open document's pages and file names, without the file bytes. */
  D.summary = function () {
    return {
      v: 1,
      files: Array.from(E.files.values()).map(function (f) { return { id: f.id, name: f.name, color: f.color }; }),
      state: JSON.parse(JSON.stringify(E.state)),
    };
  };
})();
