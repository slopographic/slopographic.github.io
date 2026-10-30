/* Slop PDF — saved edits. Each file's applied commands (page changes, annotations, redactions, text
   highlights …) are kept per file in IndexedDB on this device, keyed by the SHA-256 of the original bytes.
   The log is the diff, not a copy of the PDF: the original file is never written to the store. Opening the
   same file again offers to replay the log on top of it; Discard deletes it. Every storage call is wrapped. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, H = SP.history;
  var L = SP.editLog = {};
  var KEY = 'edits/';

  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  /** SHA-256 of the bytes as hex, or null when crypto.subtle is unavailable (then nothing is logged). */
  L.fingerprint = async function (bytes) {
    try { return window.crypto && crypto.subtle ? hex(await crypto.subtle.digest('SHA-256', bytes)) : null; } catch (e) { return null; }
  };
  /** A file is logged when its id is the stable one for its fingerprint and it is not restored, generated or pending. */
  function loggable(f) { return !!(f && f.fp && f.id === 'f' + f.fp.slice(0, 16) && !f.noLog); }
  /** A file a logged page may point at: a logged file, or a copy derived from one (text taken off a page, text-strip.js),
      which replay makes again from its recipe (rec.derived). */
  function fileOk(id) {
    var f = E.files.get(id);
    return loggable(f) || !!(f && f.derived && f.derived.from !== id && fileOk(f.derived.from));
  }
  /** The recipes of the derived files the entries point at, each after the one it is made from. */
  function derivedOf(entries) {
    var out = [], seen = {};
    function add(id) {
      var f = E.files.get(id);
      if (!f || !f.derived || seen[id]) return;
      seen[id] = 1;
      add(f.derived.from);
      out.push({ id: id, from: f.derived.from, i: f.derived.i, targets: f.derived.targets, edit: f.derived.edit || null });
    }
    entries.forEach(function (en) { Object.keys(en.ch).forEach(function (id) { [0, 1].forEach(function (s) { var o = en.ch[id][s]; if (o && o.f) add(o.f); }); }); });
    return out;
  }

  /** The part of one command that belongs to file f (and the blank pages, for the first logged file only). */
  function restrict(c, f, primary, started) {
    var fid = f.id, ids = Object.keys(c.ch);
    var inS = function (id) { var o = H.owner(id); return o === fid || (primary && o === null); };
    var own = ids.filter(function (id) { return H.owner(id) === fid; }), touches = own.length > 0;
    // a page that now points at a file that cannot be replayed (Apply redactions) ends this log
    var bad = touches && ids.some(function (id) { return [0, 1].some(function (s) { var o = c.ch[id][s]; return !!(o && o.f && !fileOk(o.f)); }); });
    if (bad) return { stop: true };
    // the insertion that opened the file is not logged: replay starts from the fresh pages
    if (!started && !c.scope && touches && own.every(function (id) { return c.ch[id][0] === null && id.indexOf('#') < 0; })) return { touches: true };
    var ch = {}; ids.filter(inS).forEach(function (id) { ch[id] = c.ch[id]; });
    var ord = null;
    if (c.ord) { var a = c.ord[0].filter(inS), b = c.ord[1].filter(inS); if (a.join('\n') !== b.join('\n')) ord = [a, b]; }
    var top = primary ? c.top : {};
    if (!Object.keys(ch).length && !ord && !Object.keys(top).length) return { touches: touches };
    return { touches: touches, entry: { label: c.label, ch: ch, ord: ord, top: top, scope: { file: fid, blank: primary } } };
  }
  /** Per logged file: its entries (oldest first). The first logged file also keeps document-level changes.
      A step that cannot be replayed (Apply redactions) drops the file's whole log, so a reopened file never
      comes back without its redactions while the edits before them do. */
  function build() {
    var out = [];
    Array.from(E.files.values()).filter(loggable).forEach(function (f, k) {
      var entries = [], started = false, primary = k === 0;
      for (var c of H.entries()) {
        var r = restrict(c, f, primary, started);
        if (r.stop) { entries = []; break; }
        started = started || r.touches;
        if (r.entry) entries.push(r.entry);
      }
      out.push({ f: f, primary: primary, entries: entries });
    });
    return out;
  }
  function record(r) {
    var seen = {}, assets = [];
    r.entries.forEach(function (en) {
      Object.keys(en.ch).forEach(function (id) {
        [0, 1].forEach(function (s) { ((en.ch[id][s] || {}).annots || []).forEach(function (a) { if (a.asset && !seen[a.asset] && E.assets.get(a.asset)) { seen[a.asset] = 1; assets.push(E.assets.get(a.asset)); } }); });
      });
      // logos of watermark layers (document-level stamps)
      [0, 1].forEach(function (s) {
        var st = (en.top && en.top.stamps && en.top.stamps[s]) || null;
        if (st && st.watermarks) SlopPdfWm.assetIds(st.watermarks).forEach(function (id) { if (!seen[id] && E.assets.get(id)) { seen[id] = 1; assets.push(E.assets.get(id)); } });
      });
    });
    return { v: 1, fid: r.f.id, fp: r.f.fp, name: r.f.name, primary: r.primary, savedAt: Date.now(), entries: r.entries, assets: assets, derived: derivedOf(r.entries) };
  }
  /** Writes (or deletes, when nothing is left to replay) the log of every logged file that is open. */
  function save() {
    build().forEach(function (r) {
      try {
        if (r.entries.length) U.idb.set(KEY + r.f.fp, record(r)); else U.idb.del(KEY + r.f.fp);
      } catch (e) { console.warn('Slop PDF: edit log not saved', e); }
    });
  }
  var schedule = U.debounce(save, 400);
  E.on('change', function () { schedule(); });
  /** Writes now (before the document is closed). */
  L.flush = function () { schedule.flush(); save(); };
  /** The logs of the open document as they are saved (records, not stored): the change list of a Drive copy. */
  L.snapshot = function () { return build().map(record); };
  /** Deletes the saved log of a file (by fingerprint), e.g. when the document is reverted to its original. */
  L.discard = function (fp) { try { return U.idb.del(KEY + fp); } catch (e) { return null; } };

  /** Makes the derived files a log points at again; resolves the ids that could not be made. */
  async function rebuild(list) {
    var missing = new Set();
    for (var k = 0; k < (list || []).length; k++) {
      var d = list[k], from = E.files.get(d.from), made = null;
      if (E.files.has(d.id)) continue;
      if (from && SP.editor && SP.editor._.strip) made = (await SP.editor._.strip.build(from, d.i, d.targets, d.id, d.edit || null).catch(function () { return { id: null }; })).id;
      if (!made) missing.add(d.id);
    }
    return missing;
  }
  /** Applies a saved log on top of the open file (every step goes on the undo stack). Resolves when it is applied. The
      derived files are made first; a step that needs one that could not be made ends the replay there. */
  L.replay = async function (rec) {
    (rec.assets || []).forEach(function (a) { E.assets.set(a.id, a); });
    var missing = await rebuild(rec.derived), entries = rec.entries;
    if (missing.size) {
      var cut = entries.findIndex(function (en) { var t = JSON.stringify(en.ch); return Array.from(missing).some(function (id) { return t.indexOf('"' + id + '"') >= 0; }); });
      if (cut >= 0) entries = entries.slice(0, cut);
    }
    entries.forEach(function (en) { var c = H.make(en.label, en); H.apply(E.state, c, 1); H.push(c); });
    // text set in an installed font (core/fonts-custom.js): prepare it so it measures and draws as it will be saved
    if (E.prepareAnnotFonts) E.prepareAnnotFonts(E.state.pages, { ask: false }).then(function () { if (SP.editor && SP.editor.paint) SP.editor.paint(); });
  };
  function ask(f, rec) {
    return new Promise(function (res) {
      var choice = null, n = rec.entries.length;
      SlopUI.dialog({
        title: U.t('pdf.io.log_found_title'),
        body: U.t('pdf.io.log_found_body', { n: n, name: f.name }),
        buttons: [
          { label: U.t('pdf.io.log_discard'), danger: true, act: function () { choice = 'discard'; } },
          { label: U.t('pdf.io.log_replay'), primary: true, act: function () { choice = 'replay'; } }
        ],
        onClose: function () { res(choice || 'kept'); }
      });
    });
  }
  /** Called after a file is opened. Resolves 'replay', 'discard', 'kept' (dismissed; the log stays) or 'none'. */
  L.offer = async function (f) {
    if (!loggable(f)) return 'none';
    var rec = null;
    try { rec = await U.idb.get(KEY + f.fp); } catch (e) { rec = null; }
    if (!rec || rec.v !== 1 || rec.fid !== f.id || !rec.entries || !rec.entries.length) return 'none';
    f.noLog = true; // nothing is written for this file until the choice is made
    var choice = await ask(f, rec);
    if (choice === 'replay') { await L.replay(rec); f.noLog = false; E.emit('change', { label: U.t('pdf.io.log_replayed') }); return 'replay'; }
    if (choice === 'discard') { try { await U.idb.del(KEY + f.fp); } catch (e) { /* ignore */ } f.noLog = false; return 'discard'; }
    return 'kept';
  };
})();
