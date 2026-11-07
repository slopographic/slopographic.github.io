/* Slop Slides: the one way files come in (shared/intake, spec 'slides'). A .pptx, .sslide or picture dropped anywhere on
   the editor, File ▸ Open a file from this computer, Open from Slop Drive (a .sslide, linked to its file), Import a
   PowerPoint or picture from Slop Drive, Insert picture (mode 'image'), a pasted picture (inserted on the slide),
   ?drive=<id> (Drive's Open with, another app's Send to…) and a PWA launch all reach one reader: a Slop Drive record opens
   through SS.files.openRecord, a file from this computer through SS.files.openFile (no Drive link, so Save makes a new
   Slop Slides file), a picture in mode 'image' goes on the slide. Files wait for the tabs (SS.fileDrop.launch) and for
   the editor (not during a slide show). The feedback is the shared SlopDrop strip, quiet at rest on the stage. Templates
   (.sslide-template) are a part of their own ('slides.template'). Exposes SS.fileDrop: mount(), choose(), launch(). */
(function () {
  'use strict';
  var SU = window.SS.util;
  var SS = window.SS, N = SS.native, SI = window.SlopIntake;
  var FD = SS.fileDrop = {};
  var PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  var tabsReady = null, mounted = false;

  async function read(file, ctx) {
    if (ctx.mode === 'image') { await SS.ops.placeImage(file); return file.name; }
    var rec = ctx.drive && ctx.drive.record;
    if (rec) { if (!(await SS.files.openRecord(Object.assign({}, rec, { blob: file })))) throw new Error('could not be opened'); }
    else await SS.files.openFile(file);
    return file.name;
  }
  SI.register({
    id: 'slides', process: read,
    accept: { types: [PPTX, N.MIME, 'application/json', 'image/*'], exts: ['.pptx', '.sslide'], get noun() { return SU.t('slides.io.noun'); }, allowEmpty: true },
    gate: function () { if (SS.app.mode !== 'edit') { SS.dom.toast(SU.t('slides.io.end_the_slide_show_first')); return false; } },
    before: function (batch) { if (batch.source === 'paste') batch.mode = 'image'; return tabsReady; }, // a pasted picture goes on the slide
  });
  SI.register({
    id: 'slides.template', main: false, paste: false, toast: false, limit: 1, driveAccept: [SS.templateFile.MIME, 'application/json'],
    accept: { types: [SS.templateFile.MIME, 'application/json'], exts: ['.' + SS.templateFile.EXT], get noun() { return SU.t('slides.io.noun_template'); } },
    process: async function (file) {
      var text;
      try { text = await file.text(); } catch (e) { SlopUI.alert(SU.t('slides.tpl.not_added'), SU.t('slides.tpl.unreadable')); throw e; }
      var rec = await SS.templatesUI.importText(text);
      if (!rec) throw new Error('was not added');
      return rec;
    },
  });

  FD.mount = function () {
    var zone = document.getElementById('ssDrop');
    if (mounted || !zone || !window.SlopDrop) return;
    mounted = true;
    SlopDrop.attach(zone, {
      intake: 'slides', targets: [document.getElementById('app')], compact: true, toast: false, multiple: true,
      label: 'slides.io.drop_a_pptx_or_sslide_file_to_open_it', chooseLabel: 'slides.io.open_a_file',
    });
  };
  /** File ▸ Open a file from this computer. */
  FD.choose = function () { return SI.pick({ to: 'slides', accept: '.pptx,.sslide,' + PPTX + ',' + N.MIME }); };
  FD.openDrive = function () { return SI.fromDrive({ to: 'slides', accept: [N.MIME], title: SU.t('slides.io.open_from_slop_drive') }); };
  FD.importDrive = function () { return SI.fromDrive({ to: 'slides', accept: [PPTX, 'image/*'], title: SU.t('slides.io.import_from_slop_drive') }); };
  FD.addImage = function () { return SI.pick({ to: 'slides', mode: 'image', multiple: false, accept: 'image/*' }); };
  FD.importTemplate = async function () { var r = await SI.pick({ to: 'slides.template', multiple: false, accept: '.' + SS.templateFile.EXT + ',application/json' }); return r.added[0] ? r.added[0].value : null; };
  FD.importTemplateDrive = async function () { var r = await SI.fromDrive({ to: 'slides.template', title: SU.t('slides.io.import_a_template_from_slop_drive') }); return r && r.added[0] ? r.added[0].value : null; };
  /** Boot: what the page was opened with is read at once (the tabs rewrite the address bar), and opens once the tabs are
   *  back (ready()). Resolves the launch's summary. */
  FD.launch = function () {
    var ready;
    tabsReady = new Promise(function (r) { ready = r; });
    var p = SI.launch({ to: 'slides' }).catch(function () { return null; });
    return { ready: function () { ready(); }, done: p };
  };
})();
