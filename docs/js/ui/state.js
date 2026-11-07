/* Slop Docs — ui/state: the open document, its selection, the undo history and the layout. Classic script.
 * Every edit goes through SlopDocs.edit(blocks, sel, kind), which records undo, re-lays out and emits 'change'.
 * Events: 'layout' (new layout), 'sel' (selection moved), 'change' (document changed), 'doc' (document replaced).
 * Exposes window.SlopDocs. */
(function () {
  'use strict';
  const S = (window.SlopDocs = {});
  const ev = {};
  const E = () => window.SlopDocEngine;
  S.on = (n, fn) => { (ev[n] = ev[n] || []).push(fn); };
  S.emit = (n, d) => { for (const fn of ev[n] || []) try { fn(d); } catch (e) { console.error(e); } };
  /** The app's words (docs/i18n, shared/i18n/APPS-HOWTO.md); onLang(fn) re-runs fn once a new language's tables are in. */
  S.t = (key, vars) => (window.SlopI18n ? window.SlopI18n.t(key, vars) : key);
  S.onLang = (fn) => (window.SlopI18n && window.SlopI18n.on ? window.SlopI18n.on(fn) : () => {});
  S.untitled = () => S.t('docs.app.untitled');

  S.doc = null;
  S.sel = { a: { b: 0, o: 0 }, f: { b: 0, o: 0 } };
  S.pending = null;      // marks for the next typed text when the caret is collapsed (bold on, size 14 …)
  S.layout = null;
  S.zoom = 1;
  S.goalX = null;        // the x an up/down move aims for; cleared by any other move
  S.undoStack = []; S.redoStack = []; S.lastKind = ''; S.lastAt = 0;
  S.file = { id: null, folderId: null, name: S.untitled(), dirty: false, saved: 0 };

  S.blocks = () => S.doc.blocks;
  S.caret = () => S.sel.f;
  S.isCollapsed = () => E().O.collapsed(S.sel);

  /** Replace the open document. file: { id, folderId, name }. */
  S.setDoc = function (doc, { file, sel, keepHistory } = {}) {
    S.doc = doc;
    S.sel = sel || { a: { b: 0, o: 0 }, f: { b: 0, o: 0 } };
    S.pending = null; S.goalX = null;
    if (!keepHistory) { S.undoStack = []; S.redoStack = []; S.lastKind = ''; }
    S.file = Object.assign({ id: null, folderId: null, name: S.untitled(), dirty: false, saved: 0 }, file || {});
    S.registerOwnFonts(doc);
    S.relayout();
    E().ensureDocFonts(doc).catch(() => {});
    S.emit('doc');
  };
  /** The document's own fonts (doc.fonts: { family, weight, italic, file, data }) are registered with the engine and listed in the
   * shared catalogue as "own". The engine gets them at once, before setDoc lays the document out and loads its faces (waiting
   * for the catalogue first let the stand-in face load in their place); the catalogue once it is ready. */
  S.registerOwnFonts = async function (doc) {
    const own = [];
    for (const r of (doc && doc.fonts) || []) {
      try { const bytes = fromDataURL(r.data); E().F.addUserFamily(r.family, bytes); own.push({ family: r.family, weight: r.weight, italic: r.italic, bytes }); }
      catch (e) { console.warn('Slop Docs: ' + r.family + ' is not used: ' + e.message); }
    }
    if (window.SlopFonts) await SlopFonts.ready();
    const C = window.SlopFontCatalog;
    if (C) C.setDocumentFonts(own, { only: true });
    if (doc && doc === S.doc && own.length) { S.relayout(); S.emit('doc'); }
  };
  /** Adds a font file the person owns to the open document: a TrueType file, named as the missing family it answers (forName) or by
   * its own family name. Kept in the document, so it is saved with it. Resolves the family name. */
  S.addOwnFont = async function (file, forName) {
    await SlopFonts.ready();
    const C = window.SlopFontCatalog, f = await C.readFontFile(file, 'Slop Docs'), name = forName || f.family, doc = S.doc;
    try { E().F.addUserFamily(name, f.bytes); } catch (e) {
      throw new Error(e.message === 'Not a TrueType font' ? S.t('docs.fonts.ttf_only') : e.message);
    }
    doc.fonts = (doc.fonts || []).filter((r) => r.family !== name).concat({ family: name, weight: f.weight, italic: f.italic, file: file.name, data: C.toDataURL(f.bytes) });
    S.file.dirty = true;
    await S.registerOwnFonts(doc);
    return name;
  };
  function fromDataURL(url) {
    const b = atob(String(url).slice(String(url).indexOf(',') + 1)), u = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    return u;
  }
  S.relayout = function () {
    if (!S.doc) return;
    S.layout = E().layoutDoc(S.doc);
    S.emit('layout');
  };
  /** Move the selection to anchor a, focus f. Typing marks are dropped unless keepPending; goal is the x an up/down move aims for. */
  S.select = function (a, f, { keepPending = false, goal = null } = {}) {
    S.sel = { a, f };
    if (!keepPending) S.pending = null;
    S.goalX = goal;
    S.emit('sel');
  };
  /** Record one undoable step. Typing and deleting coalesce while they keep going; replacing a selection starts a new step. */
  function snapshot(kind, replacing) {
    const now = Date.now(), typing = kind === 'type' || kind === 'del';
    if (replacing || !(typing && kind === S.lastKind && now - S.lastAt < 1500)) {
      S.undoStack.push({ blocks: S.doc.blocks, sel: S.sel });
      if (S.undoStack.length > 300) S.undoStack.shift();
    }
    S.redoStack = [];
    S.lastAt = now;
  }
  /** Change the document: blocks and the new selection. Returns false when nothing changed. */
  S.edit = function (blocks, sel, kind = 'edit', { keepPending = false } = {}) {
    const same = blocks === S.doc.blocks && E().O.cmpPos(sel.a, S.sel.a) === 0 && E().O.cmpPos(sel.f, S.sel.f) === 0;
    if (same) return false;
    if (blocks !== S.doc.blocks) snapshot(kind, !E().O.collapsed(S.sel));
    S.lastKind = kind;
    S.doc = Object.assign({}, S.doc, { blocks, meta: Object.assign({}, S.doc.meta, { modified: Date.now() }) });
    S.sel = sel;
    if (!keepPending) S.pending = null;
    S.file.dirty = true;
    S.relayout();
    S.emit('change');
    return true;
  };
  S.undo = function () {
    if (!S.undoStack.length) return;
    S.redoStack.push({ blocks: S.doc.blocks, sel: S.sel });
    const s = S.undoStack.pop();
    S.doc = Object.assign({}, S.doc, { blocks: s.blocks });
    S.sel = s.sel; S.pending = null; S.lastKind = ''; S.file.dirty = true;
    S.relayout(); S.emit('change');
  };
  S.redo = function () {
    if (!S.redoStack.length) return;
    S.undoStack.push({ blocks: S.doc.blocks, sel: S.sel });
    const s = S.redoStack.pop();
    S.doc = Object.assign({}, S.doc, { blocks: s.blocks });
    S.sel = s.sel; S.pending = null; S.lastKind = ''; S.file.dirty = true;
    S.relayout(); S.emit('change');
  };
  S.canUndo = () => S.undoStack.length > 0;
  S.canRedo = () => S.redoStack.length > 0;

  /** Display name without the .sdoc suffix. */
  S.displayName = () => String(S.file.name || S.untitled()).replace(/\.sdoc$/i, '') || S.untitled();

  // Re-lay out when a font finishes loading (its metrics change every line that uses it).
  window.addEventListener('slopdocs:fonts', () => S.relayout());
})();
