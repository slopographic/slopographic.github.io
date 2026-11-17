/* Slop PDF — Convert. The open document (its edits included, as Download would write it) goes to the Slop Convert dialog
   (shared/convert/dialog.js, window.SlopConvert) from the toolbar button and File ▸ Convert…. The dialog runs the converters
   on this device; a Drive-linked document offers Save to Slop Drive for the results. Classic script. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, A = SP.app, S = A._;

  A.openConvert = function (target) {
    if (!window.SlopConvert) { SlopUI.toast(U.t('pdf.act.convert_offline')); return; }
    if (!E.state.pages.length) return;
    return S.guarded(U.t('pdf.act.preparing_doc'), function () { return A.currentPdfBlob(); }).then(function (blob) {
      if (!blob) return;
      var name = U.safeName(S.els.fileName.value || 'document.pdf', 'pdf');
      window.SlopConvert.open({ file: new File([blob], name, { type: 'application/pdf' }), drive: !!A.driveId, target: typeof target === 'string' ? target : null });
    });
  };

  /** Dropped files that are not PDFs or images (ui/drop.js): the Convert dialog opens with them, its target set to PDF
   *  (Images to PDF for images and SVG, Picture PDF for HTML). The PDF it makes comes back here, to open in a new tab (A.openConverted). */
  A.convertFiles = function (files) {
    if (!window.SlopConvert) { SlopUI.toast(U.t('pdf.act.convert_offline')); return; }
    window.SlopConvert.open({ files: files, target: 'images-to-pdf', onPdf: function (outs, names) { A.openConverted(outs, names); } });
  };

})();
