/* Slop PDF — the change list of a saved document. It is JSON (format "slop-pdf-changes", version 1) and turns the
   original file into the edited one: `log` is the edit log the app keeps for the open file (io/edit-log.js, the same
   commands that replay on the original, assets as data URLs), and `layers` is the layer stack as it was saved (each
   page's annotations with their hidden and locked flags, numbers, short strings and number lists only). The original
   bytes are not in the list; they are the original Drive file. Classic script. */
(function () {
  'use strict';
  var SP = window.SP, E = SP.engine;
  var C = SP.docChanges = {};
  C.FORMAT = 'slop-pdf-changes';

  /** The parts of an annotation that can be written as JSON: numbers, booleans, short strings and number lists. */
  function plain(a) {
    var o = {};
    Object.keys(a).forEach(function (k) {
      var v = a[k];
      if (typeof v === 'number' || typeof v === 'boolean' || (typeof v === 'string' && v.length < 500) ||
          (Array.isArray(v) && v.every(function (n) { return typeof n === 'number'; }))) o[k] = v;
    });
    return o;
  }
  /** The layer stack of a document state: one entry per page, in page order. */
  C.layers = function (state) {
    return state.pages.map(function (p, i) {
      return { page: p.id, index: i, rot: p.rot || 0, blank: !!p.blank, annots: (p.annots || []).map(plain) };
    });
  };
  /** The change list for the open document. `edited` is { name, sha256, size } of the saved bytes; `original` likewise. */
  C.build = function (original, edited) {
    return { format: C.FORMAT, version: 1, savedAt: new Date().toISOString(), original: original, edited: edited,
      layers: C.layers(E.state), log: SP.editLog.snapshot() };
  };
  /** The parsed change list from text, or null when it is not one of ours. */
  C.parse = function (text) {
    try {
      var d = JSON.parse(text);
      return d && d.format === C.FORMAT && d.version === 1 && Array.isArray(d.log) ? d : null;
    } catch (e) { return null; }
  };
  /** Replays the change list's edits for one open file (the same fingerprint as the original). Resolves the count. */
  C.replayOn = function (f, changes) {
    var rec = (changes.log || []).find(function (r) { return r.fp && r.fp === f.fp; });
    if (!rec || !rec.entries || !rec.entries.length) return 0;
    // The log names its pages by the file's stable id ('f' + fingerprint). Another open tab holds that id, so this copy
    // gets a random one (pdfjs.js registerPdf); its pages are then named by that id instead.
    var stable = 'f' + f.fp.slice(0, 16);
    var named = { entries: rec.entries, derived: rec.derived || [] };
    if (f.id !== stable) named = JSON.parse(JSON.stringify(named).replace(new RegExp('"' + stable + '(?=[."])', 'g'), '"' + f.id));
    SP.editLog.replay(Object.assign({}, rec, named)).then(function () { E.emit('change', { label: SP.util.t('pdf.io.changes_replayed') }); });
    return rec.entries.length;
  };
})();
