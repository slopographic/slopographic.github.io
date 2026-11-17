/* Slop Press — Slop Hub: register, ?drive= launches, Open/Place from Slop Drive, Save to Drive, Send to. */
(function () {
  'use strict';
  var PR = window.PR, U = PR.util, S = PR.state;
  var HB = PR.hub = {};
  HB.available = function () { return !!window.SlopHub; };
  HB.canSend = function () { return HB.available() && location.protocol !== 'file:'; };
  // Open / Place from Slop Drive and ?drive= are sources of the one intake (io/intake.js); a Drive project stays linked there.
  HB.openFromDrive = function () { return PR.intake.openFromDrive(); };
  HB.placeFromDrive = function () { return PR.intake.placeFromDrive(); };
  /** File ▸ Save to Slop Drive…: a new file in a folder of your choice, which Save then keeps writing to. */
  HB.saveToDrive = function () {
    return PR.io.projectBlob().then(function (b) {
      return window.SlopHub.saveToDrive(b, PR.io.baseName() + '.slpress', { from: 'press' }).then(function (id) { if (id) { S.driveId = id; S.dirty = false; PR.emit('commit', 'save'); } return id; });
    });
  };
  /** File ▸ Save: writes back to the linked Drive file (first time: asks for a folder); the .slpress download when Drive is off. */
  HB.save = function () {
    if (!HB.available()) return PR.io.save();
    return PR.io.projectBlob().then(function (b) {
      var name = PR.io.baseName() + '.slpress', H = window.SlopHub;
      if (!S.driveId) return H.saveToDrive(b, name, { from: 'press' }).then(function (id) { if (id) S.driveId = id; return id; });
      return H.update(S.driveId, { blob: b, name: name, type: b.type }).then(function (rec) {
        if (!rec) return H.put(b, { id: S.driveId, name: name, from: 'press' }).then(function (id) { return id; });
        U.toast(U.t('press.io.saved_drive', { name: name })); return S.driveId;
      });
    }).then(function (id) { if (id) { S.dirty = false; PR.emit('commit', 'save'); } return id; });
  };
  HB.pdfBlob = function () { return PR.pdf.export({ pages: null, marks: false, bleed: false }).then(function (bytes) { return new Blob([bytes], { type: 'application/pdf' }); }); };
  HB.pngBlob = function () { return PR.raster.pageBlob(S.page, 150); };
  /** Items for File ▸ Send to (the one builder, SlopOuttake): the PDF to every app that takes it (and Slop Workflows), then
   *  the current page as a PNG to every app that takes pictures. */
  HB.sendItems = function () {
    if (!HB.available() || !window.SlopOuttake) return [{ label: U.t('press.menu.hub_unavailable'), disabled: true }];
    var name = function () { return PR.io.baseName(); }, O = window.SlopOuttake;
    var pdf = O.items({ get: HB.pdfBlob, name: function () { return name() + '.pdf'; }, type: 'application/pdf', from: 'press', verb: 'press.io.send_pdf_to', folder: false });
    // the page PNG lists the apps only: the workflow items are already there once, for the PDF
    var png = O.items({ get: HB.pngBlob, name: function () { return name() + '-p' + PR.pages.label(S.doc, S.page) + '.png'; }, type: 'image/png', from: 'press', verb: 'press.io.send_png_to', folder: false })
      .filter(function (it) { return it.plain; });
    var items = pdf.concat(pdf.length && png.length ? ['-'] : [], png, ['-', { label: U.t('press.cmd.file_save_drive'), act: HB.saveToDrive }]);
    if (!HB.canSend()) items = items.map(function (it) { return it === '-' ? it : { label: it.label, disabled: true }; });
    return items;
  };
  HB.init = function () {
    if (HB.available()) { try { window.SlopHub.register('press'); } catch (e) { /* bus unavailable */ } }
  };
  /* Convert… in the header (shared/convert/provided.js): the document as a PDF, the same file Send to makes. */
  addEventListener('slop:convert-files', function (e) {
    e.detail.provide(function () { return S.doc ? HB.pdfBlob().then(function (blob) { return [{ name: PR.io.baseName() + '.pdf', blob: blob }]; }) : null; });
  });
})();
