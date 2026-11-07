/* Slop PDF — Slop Hub integration (shared Slop Drive, "Send to…", launching with ?drive=<id>)
   and the ?drive= launch (A.launch, run by A.bootRest in ui/app.js). Loaded last. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, A = SP.app, S = A._, t = U.t;
  function hub() { return window.SlopHub || null; }
  // A.driveId: the Slop Drive record the open document came from (or was saved to). Only a document that was empty when
  // a Drive file arrived takes that file's id (the intake's onNew, ui/drop.js), so Save never overwrites a different file.
  A.driveId = null;
  /** Open from Slop Drive: a source of the one intake (ui/drop.js), like a drop. */
  A.openFromDrive = function () { return SlopIntake.fromDrive({ to: 'pdf' }); };
  // Starting a different document unlinks the Drive file.
  ['closeAll', 'loadSample'].forEach(function (k) {
    var orig = A[k]; if (!orig) return;
    A[k] = function () { A.driveId = null; return orig.apply(this, arguments); };
  });
  /** File ▸ Save: the edited PDF and its change list go to Slop Drive beside the original (io/drive-docs.js). A document
   * that is not in Drive yet asks for a folder, and that first copy is then the document's original. */
  A.saveToDrive = function () {
    var H = hub(); if (!H || !E.state.pages.length) return Promise.resolve(null);
    return S.guarded(t('pdf.app.saving_drive'), function () { return A.currentPdfBlob(); }).then(function (blob) {
      var name = U.safeName(S.els.fileName.value || 'document.pdf', 'pdf');
      S.els.fileName.value = name;
      return SP.driveDocs.save(A.driveId, blob, name).then(function (r) {
        if (r) { SlopUI.toast(t('pdf.app.saved_drive', { name: name })); return r.editedId; }
        return H.saveToDrive(blob, name, { from: 'pdf' }).then(function (id) { if (id) A.driveId = id; return id; });
      });
    }).catch(function (e) { SlopUI.toast(t('pdf.app.save_drive_failed', { error: String(e.message || e) })); return null; });
  };
  /** Opened PDFs go to Slop Drive at once (their original bytes, or the copy already there). When the document was empty
   * the first file is its link (A.driveId). Without Drive the work stays on this device, and the person is told so. */
  A.autosaveOpened = async function (sources, linkFirst) {
    if (!SP.driveDocs.enabled()) return;
    // The link goes to the tab these files were opened into, even if the person has switched tabs by the time Drive answers
    var owner = SP.tabs && SP.tabs.current ? SP.tabs.current() : null;
    for (var k = 0; k < sources.length; k++) {
      var r = null;
      try { r = await SP.driveDocs.keepOriginal(sources[k].bytes, sources[k].name); }
      catch (e) { console.warn('Slop PDF: Slop Drive is not available', e); SlopUI.toast(t('pdf.app.drive_unavailable')); return; }
      if (k === 0 && linkFirst) A.setDriveIdOf(owner, r.id);
    }
    // A successful background save says nothing: a toast here would sit over page 1 for seconds, and the top bar's
    // Slop Drive link is always there. Failures (above) are still shown.
  };
  /** The current document as a validated PDF blob. */
  A.currentPdfBlob = async function () {
    var bytes = await E.build();
    await E.validate(bytes, E.state.pages.length);
    return new Blob([bytes], { type: 'application/pdf' });
  };
  /** One page rendered as a PNG blob (150 dpi), annotations and stamps included. */
  A.pagePngBlob = async function (id) {
    var p = E.pageById(id); if (!p) throw new Error('That page no longer exists.');
    var idx = E.indexOf(id), all = E.state.pages;
    var bytes = await E.build({ pages: all });
    var files = await E.toImages(bytes, { format: 'png', dpi: 150, indices: [idx], base: 'page' });
    return new Blob([files[0].data], { type: 'image/png' });
  };
  function wrap(label, fn) { return function () { return S.guarded(label, function () { return fn(); }).then(function (b) { if (!b) throw new Error('nothing to send'); return b; }); }; }
  /** "Send to <App>" items for the whole PDF (File menu). */
  A.sendItems = function () {
    var H = hub(); if (!H || SP.offline || !E.state.pages.length) return [];
    return H.sendMenuItems(wrap(t('pdf.app.preparing_pdf'), A.currentPdfBlob), function () { return U.safeName(S.els.fileName.value || 'document.pdf', 'pdf'); }, 'application/pdf');
  };
  /** "Send page as image to <App>" items (page context menu). */
  A.sendPageItems = function (id) {
    var H = hub(); if (!H || SP.offline || !id) return [];
    var n = E.indexOf(id) + 1;
    return H.sendMenuItems(wrap(t('pdf.app.rendering_page', { n: String(n) }), function () { return A.pagePngBlob(id); }), function () { return U.baseName(S.els.fileName.value || 'document') + '-page-' + n + '.png'; }, 'image/png');
  };
  /** ?drive=<id> (Send to…) and a PWA launch: sources of the intake. */
  async function launch() {
    var H = hub();
    if (H) { try { H.register('pdf'); } catch (e) { console.warn('Slop PDF: hub register failed', e); } }
    await A.tabsReady; // the stored tabs are open first; the launched file gets a tab of its own
    var r = await SlopIntake.launch({ to: 'pdf', mode: 'new', data: { tab: true } });
    if (r && r.added.length) SlopUI.toast(t('pdf.app.opened_drive', { name: r.added[0].name }));
  }
  A.launch = launch; // run by A.bootRest (ui/app.js) once the app is wired
})();
