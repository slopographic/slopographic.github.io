/* Slop Slides: files. Each presentation is a tab (ui/tabs.js). Save and Open from Slop Drive go through the strip, so a
   tab saves to its own Drive file (drive.js: the same id, in place) and a file opened with ?drive=<id> or from the Drive
   picker opens in a tab linked to it. A zero-byte .sslide (Drive's New menu) opens as a blank deck. Pictures open as a
   one-slide deck and other formats open as a blank deck, in a tab with no link, so Save can never overwrite a file this
   editor did not write. A PowerPoint file (Drive, a drop or Open a file) is imported into a tab with no link, and what was left
   out is reported. Files come in through the intake (file-drop.js). Also: the .sslide download, PowerPoint, PDF and PNG export, and the boot. Exposes SS.files. */
(function () {
  'use strict';
  var SU = window.SS.util;
  var SS = window.SS, A = SS.app, N = SS.native, U = SS.util, D = SS.dom, R = SS.canvasRender;
  var F = SS.files = {};
  var hub = function () { return window.SlopHub || null; };
  var api = function () { return SS.tabs.api(); };

  F.newDeck = function () { SS.tabs.newTab(); D.toast(SU.t('slides.io.new_presentation')); };
  /** A new presentation built from one of the starter templates (they are ordinary, editable decks). */
  F.fromTemplate = function (id) {
    var t = SS.templates.byId(id);
    if (!t) return;
    SS.tabs.open(t.build(), {});
    D.toast(SU.t('slides.io.new_from', { name: t.name }));
  };
  /** A new presentation from one of "My templates" (a record from SS.templateStore; its deck is re-checked and copied). */
  F.fromStored = function (rec) {
    SS.tabs.open(N.normalize(U.clone(rec.deck)), {});
    D.toast(SU.t('slides.io.new_from', { name: rec.name }));
  };
  /** File ▸ Open (a native .sslide from Slop Drive, linked) and Import (a PowerPoint or picture): the intake (file-drop.js). */
  F.openDrive = function () { return SS.fileDrop.openDrive(); };
  F.importDrive = function () { return SS.fileDrop.importDrive(); };
  /** Opens a Drive record (full or summary) in a tab. A tab already showing that file is brought forward. Resolves true when a deck is open. */
  F.openRecord = async function (rec) {
    var full = rec.blob !== undefined ? rec : await hub().get(rec.id);
    if (!full) { D.toast(SU.t('slides.io.that_file_is_no_longer_in_slop_drive')); return false; }
    var res;
    try { res = await N.read(full.blob, full.type, full.name); }
    catch (e) { D.toast(SU.t('slides.io.could_not_open', { name: full.name, error: e.message }), 4200); return false; }
    if (res.kind === 'deck' || res.kind === 'blank') {
      var open = api().tabs().find(function (t) { return t.driveId === full.id; });
      if (open) api().activate(open.doc);
      else SS.tabs.open(res.deck, { name: full.name, origName: full.name }, full.id);
      return true;
    }
    return shown(res, full.name);
  };
  /** A deck read from a file this editor did not write (PowerPoint, a picture, another format): a tab with no Drive link. */
  function shown(res, name) {
    SS.tabs.open(res.deck, { name: N.fileName(res.deck.title), origName: name });
    if (res.kind === 'foreign') D.toast(res.type ? SU.t('slides.io.foreign', { type: res.type }) : SU.t('slides.io.foreign_this'), 4200);
    else if (res.kind === 'image') D.toast(SU.t('slides.io.picture_added_to_a_new_presentation'));
    else if (res.kind === 'pptx') {
      var n = res.deck.slides.length, left = SS.pptxIn.summary(res.report);
      D.toast(SU.t('slides.io.opened_pptx', { name: name, n: n }) + ' ' + (left ? left + ' ' : '') + SU.t('slides.io.save_keeps'), left ? 9000 : 4200);
    }
    return true;
  }
  /** Opens a file from this computer (a drop, or Open a file): a .pptx or .sslide, in a tab with no Drive link. Throws with the reason. */
  F.openFile = async function (file) {
    var res = await N.read(file, file.type, file.name);
    if (res.kind === 'deck' || res.kind === 'blank') { SS.tabs.open(res.deck, { name: file.name, origName: file.name }); return true; }
    if (res.kind === 'foreign') throw new Error(SU.t('slides.io.not_deck', { name: file.name }));
    return shown(res, file.name);
  };

  /** Saves the open presentation to Slop Drive: its own file (in place), or a new one. asNew: always a new file (Save as). Resolves true when written. */
  F.save = async function (asNew) {
    if (!hub()) { D.toast(SU.t('slides.io.slop_drive_is_not_available_here')); return false; }
    var T = SS.tabs.current();
    if (!T) return false;
    SS.tabs.sync();
    var prev = api().driveIdOf(T);
    try {
      if (asNew) api().setDriveId(T, null);
      var id = await api().saveToDrive(T);
      if (!id && asNew) api().setDriveId(T, prev); // a cancelled Save as keeps the link
      return !!id;
    } catch (e) { D.toast(SU.t('slides.io.could_not_save', { error: e.message }), 4000); return false; }
  };
  F.download = function () {
    U.download(N.toBlob(A.deck), A.doc.name || N.fileName(A.deck.title));
    SlopSupport.afterExport('slides');
  };
  F.exportPptx = async function () {
    try {
      var r = await SS.pptx.write(A.deck);
      U.download(r.blob, N.fileName(A.deck.title).replace(/\.sslide$/, '.pptx'));
      SlopSupport.afterExport('slides');
      var left = r.skipped ? SU.t('slides.io.left_out', { n: r.skipped }) + ' ' : '';
      D.toast(left + SU.t('slides.io.no_anims_pptx'), 5200);
    } catch (e) { D.toast(SU.t('slides.io.export_failed', { error: e.message }), 4000); }
  };
  /** File ▸ Download PDF: one page per visible slide (io/pdf.js). Language fonts the text needs are fetched first (asked once). */
  F.exportPdf = async function () {
    if (F.pdfBusy) return null;
    F.pdfBusy = true;
    D.toast(SU.t('slides.io.making_the_pdf'), 2000);
    try {
      var r = await SS.pdfExport.write(A.deck);
      U.download(r.blob, N.fileName(A.deck.title).replace(/\.sslide$/, '.pdf'));
      SlopSupport.afterExport('slides');
      var hidden = A.deck.slides.filter(function (s) { return s.hidden; }).length;
      var notes = [SU.t('slides.io.pdf_ready', { n: r.pages })];
      if (hidden) notes.push(SU.t('slides.io.hidden_left_out', { n: hidden }));
      if (r.missing.length) notes.push(SU.t('slides.io.missing_font', { fonts: SU.list ? SU.list(r.missing) : r.missing.join(', ') }));
      D.toast(notes.join(' '), r.missing.length ? 7000 : 3600);
      return r;
    } catch (e) { D.toast(SU.t('slides.io.pdf_export_failed', { error: e.message }), 4200); return null; }
    finally { F.pdfBusy = false; }
  };
  F.exportPng = function () {
    var s = A.slide();
    if (!s) return;
    var cv = R.slideToCanvas(A.deck, s, 1920, { scene: { editor: false } });
    cv.toBlob(function (b) { U.download(b, (A.doc.name || 'slide').replace(/\.sslide$/, '') + ' ' + (A.idx + 1) + '.png'); SlopSupport.afterExport('slides'); }, 'image/png');
  };

  /** Boot: the tabs come back (session.js). A launch from Slop Drive opens in a tab of its own, and an untouched blank tab it
   * replaces is closed. The launch was read before this (main.js), because showing a tab rewrites the address bar. */
  /** Boot: the tabs come back, then what the page was opened with (launch: SS.fileDrop.launch(), read before the tabs)
   *  opens, and an untouched blank tab it replaces is closed. */
  F.boot = async function (launch) {
    var session = SS.tabs.mount();
    try { await session.restore(); } catch (e) { console.warn('Slop Slides: restore failed', e); }
    if (!SS.tabs.current()) SS.tabs.newTab();
    var blank = SS.tabs.isPristine(SS.tabs.current()) ? SS.tabs.current() : null;
    if (!launch) return;
    launch.ready();
    var r = await launch.done;
    if (r && r.added && r.added.length && blank && SS.tabs.current() !== blank) await api().close(blank);
  };
  /** Convert… in the header (shared/convert/provided.js): the open deck, as PPTX. */
  addEventListener('slop:convert-files', function (e) {
    e.detail.provide(async function () {
      if (!A.deck) return null;
      var r = await SS.pptx.write(A.deck);
      return [{ name: N.fileName(A.deck.title).replace(/\.sslide$/, '.pptx'), blob: r.blob }];
    });
  });
})();
