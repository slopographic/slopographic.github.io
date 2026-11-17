/* SlopVector — io: the shared copy-and-drop buffer (window.SlopBuffer, see shared/buffer/).
 * Copy as buffer and Export to buffer put SVG in the buffer. Drop and Paste place the buffer: an SVG comes in as one
 * group, a PNG as an image object. Nothing here imports another app's code. */
(function () {
  'use strict';
  var SV = window.SV, S = SV.state, IO = SV.io;
  var SB = window.SlopBuffer;
  var BUF = SV.buffer = {};

  function toast(msg, kind) { if (SV.ui && SV.ui.toast) SV.ui.toast(msg, kind); }
  function selectedEditable() {
    return (S.sel || []).filter(function (id) { var o = SV.getObj(id); return o && SV.isEditable(o); });
  }
  function dataUrl(blob) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(fr.result); };
      fr.onerror = function () { rej(fr.error); };
      fr.readAsDataURL(blob);
    });
  }

  /** Edit ▸ Copy as buffer: the selection as SVG. The ordinary clipboard copy happens too. */
  BUF.copyAsBuffer = function () {
    var ids = selectedEditable();
    if (!ids.length) { toast(SV.t('vector.msg.buffer_select'), 'warn'); return false; }
    SV.cmd.copy();
    var svg = IO.exportSVG({ ids: ids });
    SB.put({ kind: 'vector', formats: { 'image/svg+xml': svg }, source: 'vector' });
    toast(SV.t('vector.msg.buffer_copied'));
    return true;
  };

  /** File ▸ Export ▸ Export to buffer: the whole artboard as SVG. */
  BUF.exportToBuffer = function () {
    SB.put({ kind: 'vector', formats: { 'image/svg+xml': IO.exportSVG({}) }, source: 'vector' });
    toast(SV.t('vector.msg.buffer_artboard'));
  };

  /** Places a buffer record at a document point (or the view centre). Returns true when something was placed. */
  BUF.place = function (rec, at) {
    var c = SB.choose(rec, ['image/svg+xml', 'image/png']);
    if (!c) return false;
    var done;
    if (c.type === 'image/svg+xml') {
      done = IO.importSVGText(c.data, { name: 'Buffer SVG', group: true, at: at || null }); // i18n-ignore: a name stored in the document
    } else {
      done = Promise.resolve(c.data).then(dataUrl).then(function (u) { return IO.placeImageURL(u, 'Buffer image', at || null); }); // i18n-ignore: a name stored in the document
    }
    if (c.simplified) toast(c.note, 'warn');
    return !!done;
  };

  /** Edit ▸ Paste and Ctrl+V: the buffer wins when it is newer than this app's own clipboard. */
  BUF.pasteIfNewer = function () {
    var rec = SB.get();
    if (!rec || (S.clipboard && S.clipboard.t >= rec.t)) return false;
    return BUF.place(rec, null);
  };

  /** The native paste event carries the buffer's PNG as a file. True when that file is the buffer's own copy. */
  BUF.ownsPasteFile = function (file) { return SB.isSystemCopyOf(file); };

  /** Drop target: the whole app. Coordinates come in client pixels and are turned into document points. */
  BUF.bindDrop = function () {
    var app = document.getElementById('app');
    if (!app || !SB) return;
    SB.bindDrop(app, function (rec, p) {
      var r = SV.dom.stage.getBoundingClientRect();
      BUF.place(rec, SV.toDoc(p.x - r.left, p.y - r.top));
    });
  };

})();
