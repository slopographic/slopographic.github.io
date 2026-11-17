/* Slop PDF — File ▸ Export as. Word, Excel, PowerPoint and image files open the Convert dialog (shared/convert) with that
   target chosen. The document is converted as it is now, edits included, and the dialog states each target's fidelity
   (its note): Word and Excel are text-based, PowerPoint is one picture per page. Classic script. */
(function () {
  'use strict';
  var SP = window.SP, A = SP.app, E = SP.engine, U = SP.util;
  var TARGETS = [['pdf-to-docx', 'Word (.docx)'], ['pdf-to-xlsx', 'Excel (.xlsx)'], ['pdf-to-pptx', 'PowerPoint (.pptx)'], // i18n-ignore (format names)
    ['pdf-to-png', 'pdf.act.png_images'], ['pdf-to-jpg', 'pdf.act.jpg_images']]; // [1]: a format name or a key
  /** The File ▸ Export as submenu. */
  A.exportItems = function () {
    var has = E.state.pages.length > 0;
    return [{ label: U.t('pdf.act.pdf_download'), act: A.download, disabled: !has }, { label: U.t('pdf.act.pdf_password'), act: function () { A.protect(); }, disabled: !has }, '-']
      .concat(TARGETS.map(function (t) { return { label: U.t(t[1]), act: function () { A.openConvert(t[0]); }, disabled: !has }; }))
      .concat(['-', { label: U.t('pdf.act.other_formats'), act: function () { A.openConvert(null); }, disabled: !has }]);
  };
})();
