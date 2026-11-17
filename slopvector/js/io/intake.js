/* SlopVector — the one way files come in (shared/intake, spec 'vector'). File ▸ Open (Ctrl+O), Place (Ctrl+Shift+P), Open
   and Place from Slop Drive, a drop on the window or the strip at the foot of the stage (and its Choose files), a pasted
   picture, ?drive=<id> (another app's Send to…) and a PWA launch all call SlopIntake.take and reach one reader. Mode 'new'
   opens the file as a document (an SVG, or a picture as a new artboard; one from Slop Drive stays linked, so Save writes
   back to it); otherwise it is placed: at the drop point (offset for each extra file), or in the middle of the view.
   The app's own clipboard copies (SlopBuffer) are left to its paste (except). */
(function () {
  'use strict';
  var SV = window.SV, IO = SV.io, SI = function () { return window.SlopIntake; };
  var IN = SV.intake = {};
  // noun: how a refusal reads ("notes.txt is not <noun>"), in the current language.
  IN.RULES = { types: ['image/*'], exts: ['.svg'], get noun() { return SV.t('vector.io.noun'); } };
  function read(file, ctx) {
    if (ctx.mode === 'new') {
      return IO.openAsDocument(file).then(function (ok) {
        if (!ok) throw new Error('could not be opened');
        if (ctx.drive && SV.hub) SV.hub.linked = ctx.drive.id;
        return file.name;
      });
    }
    var pt = null;
    if (ctx.at) { var r = SV.dom.stage.getBoundingClientRect(), at = SV.toDoc(ctx.at.x - r.left, ctx.at.y - r.top); pt = { x: at.x + ctx.index * 20, y: at.y + ctx.index * 20 }; }
    return IO.placeFile(file, pt, ctx.batch.take.length === 1).then(function (o) { if (!o) throw new Error('could not be placed'); return o; });
  }
  SI().register({
    id: 'vector', accept: IN.RULES, driveAccept: ['image/svg+xml', 'image/*'], process: read,
    except: function (f) { return !!(SV.buffer && SV.buffer.ownsPasteFile(f)); }, // its own clipboard copies stay with its paste
  });
  IN.open = function () { return SI().pick({ to: 'vector', mode: 'new', multiple: false, accept: '.svg,image/svg+xml' }); };
  IN.place = function () { return SI().pick({ to: 'vector', accept: '.svg,image/svg+xml,image/png,image/jpeg,image/gif,image/webp' }); };
  IN.openFromDrive = function () { return SI().fromDrive({ to: 'vector', mode: 'new', title: SV.t('vector.act.file_open_drive').replace(/…$/, '') }); };
  IN.placeFromDrive = function () { return SI().fromDrive({ to: 'vector', title: SV.t('vector.act.file_place_drive').replace(/…$/, '') }); };
  IN.launch = function () { return SI().launch({ to: 'vector', mode: 'new' }); };
  IN.bindDrop = function () {
    window.SlopDrop.attach(document.getElementById('svDrop'), { intake: 'vector', compact: true, targets: [document.getElementById('app')] });
  };
})();
