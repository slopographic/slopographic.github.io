/* Slop Slides: the document tab strip (shared/doctabs) on the editor. Each tab is a presentation T = { deck, doc, idx, sel,
   hist, untouched }: the deck, its file name and dirty flag, the slide and selection on screen, and its own undo history.
   The open one is A.deck, A.doc, A.idx, A.sel and A.hist. Switching copies those out to the old tab and in from the new
   one. Every change copies out and tells the strip, which keeps the tab on this device (session.js) and saves it to
   Slop Drive (drive.js). The .sslide file is the deck's own JSON (native.js). Exposes SS.tabs. Classic script. */
(function () {
  'use strict';
  var SS = window.SS, A = SS.app, N = SS.native, D = SS.dom;
  var tabs = null;        // the SlopDocTabs api, once mounted
  var switching = false;  // true while a tab is put on screen: the copy-out must not run then

  var stem = function (n) { return String(n || N.DEFAULT_NAME).replace(/\.sslide$/i, '') || 'Untitled presentation'; }; // i18n-ignore
  var cur = function () { return tabs ? tabs.current() : null; };

  /** Puts the Drive id in the address bar (so a reload reopens the same file) or takes it out. */
  function setUrl(id) {
    try {
      var u = new URL(location.href);
      if (id) u.searchParams.set('drive', id); else u.searchParams.delete('drive');
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    } catch (e) { /* not a real URL (file://) */ }
  }
  /** A tab for a deck. doc = { name, dirty }. Its Drive link is kept by the strip, not here. */
  function makeT(deck, doc, untouched) {
    return {
      deck: deck,
      doc: { driveId: null, name: (doc && doc.name) || N.DEFAULT_NAME, dirty: !!(doc && doc.dirty) },
      idx: 0, sel: [], hist: A.makeHist(), untouched: !!untouched,
      title0: deck.title,   // the deck name the tab last followed (followTitle)
    };
  }
  /** The tab follows the deck's name: naming the deck (the title field, or an undo of that) renames the tab, and a deck
   * not linked to a Drive file takes the name as its file name too. A linked one renames its Drive file (the strip does). */
  function followTitle(T) {
    var t = String(T.deck.title || '').trim();
    if (!t || t === T.title0) return;
    T.title0 = t;
    if (!tabs.driveIdOf(T)) T.doc.name = N.fileName(t);
    tabs.rename(T, t);
  }
  function copyOut(T) {
    T.deck = A.deck; T.doc = A.doc; T.doc.dirty = !!A.dirty;
    T.idx = A.idx; T.sel = A.sel; T.hist = A.hist;
  }
  function copyIn(T) {
    A.deck = T.deck; A.doc = T.doc; A.dirty = !!T.doc.dirty;
    A.idx = T.idx; A.sel = T.sel; A.hist = T.hist; A.mode = 'edit';
  }
  function guard() {
    if (window.SlopGuard && tabs) SlopGuard.setUnsaved('slides', tabs.tabs().some(function (t) { return t.dirty; }));
  }

  /** The strip's adapter (the contract is shared/doctabs/HANDOFF.md). */
  var adapter = {
    newDoc: function () { return makeT(N.blank(), {}, true); },
    serialize: function (T) { return { deck: T.deck, name: T.doc.name, dirty: !!T.doc.dirty, untouched: !!T.untouched }; },
    restore: function (s) {
      if (!s || !s.deck || typeof s.deck !== 'object') throw new Error('not a presentation');
      return makeT(N.normalize(s.deck), { name: s.name, dirty: s.dirty }, s.untouched); // throws on a damaged deck
    },
    title: function (T) { return stem(T.doc.name); },
    dirty: function (T) { return !!T.doc.dirty; },
    activate: function (T) {
      switching = true;
      try {
        copyIn(T);
        T.doc.driveId = tabs.driveIdOf(T);
        setUrl(T.doc.driveId);
        A.emit('load');
        A.emit('change');
      } finally { switching = false; }
    },
    deactivate: function (T) { copyOut(T); },
    saved: function (T) {
      T.doc.name = stem(T.doc.name) + '.sslide';
      T.doc.dirty = false;
      T.doc.driveId = tabs.driveIdOf(T);
      if (T === cur()) { A.dirty = false; A.emit('change'); }
    },
    drive: {
      ext: '.sslide',
      mime: N.MIME,
      toBlob: function (T) { return N.toBlob(T.deck); },
      fromBlob: async function (blob, name) {
        var r = await N.read(blob, N.MIME);   // a damaged file throws: the strip reports it and keeps the file as it is
        if (r.kind !== 'deck' && r.kind !== 'blank') throw new Error('not a Slop Slides file');
        return makeT(r.deck, { name: name });
      },
    },
  };

  /** Puts a deck on screen in place of the open one: the open tab takes it (its undo history is cleared). */
  A.load = function (deck, doc) {
    var T = cur();
    if (!T) { SS.tabs.open(deck, doc); return; }
    A.deck = deck; A.idx = 0; A.sel = []; A.mode = 'edit';
    A.doc = { driveId: tabs.driveIdOf(T), name: (doc && doc.name) || N.DEFAULT_NAME, dirty: !!(doc && doc.dirty) };
    A.dirty = A.doc.dirty;
    A.hist.clear();
    T.untouched = false;
    T.title0 = deck.title;
    A.emit('load');
    A.emit('change');
  };

  var session = null;
  SS.tabs = {
    /** Mounts the strip and returns its session. Call session.restore() once, after the fonts are loaded. */
    mount: function () {
      tabs = SlopDocTabs.mount(document.getElementById('tabs'), adapter, { appId: 'slides' });
      A.on('change', function () {
        if (switching || !A.deck || !cur()) return;
        copyOut(cur());
        cur().untouched = false;
        followTitle(cur());
        tabs.changed(cur());
      });
      tabs.on(guard);
      session = SlopDocTabs.session('slides', tabs, { notice: function (msg) { D.toast(msg, 4200); } });
      return session;
    },
    api: function () { return tabs; },
    current: cur,
    /** A blank presentation in a new tab. */
    newTab: function () { return tabs.newTab(); },
    /** A presentation in a new tab; driveId links it to a Drive file. */
    open: function (deck, doc, driveId) { return tabs.openDoc(makeT(deck, doc), { driveId: driveId || null, origName: (doc && doc.origName) || null }); },
    /** A tab nobody has edited and that is not linked to a file (a new one): a launch may replace it. */
    isPristine: function (T) { return !!T && !!T.untouched && !tabs.driveIdOf(T); },
    /** The open presentation's fields are written into its tab (before a save or a close). */
    sync: function () { if (cur()) copyOut(cur()); },
    setUrl: setUrl,
    /** Writes the autosave now (the open tabs, as the session keeps them on this device). */
    flush: function () { return session ? session.flush() : Promise.resolve(false); },
  };
})();
