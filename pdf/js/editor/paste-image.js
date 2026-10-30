/* Slop PDF — images: one way to turn an image file into an image on the current page. The image tool (Ed.pickImage) and
   pasting both come in through the shared intake (shared/intake, spec 'pdf.image') and use Ed.addImageFile. A pasted
   image (or one copied from a web page) goes on the current page, or opens as a new PDF. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, Ed = SP.editor;

  /** One image file → an asset in the document, placed on the current page. Throws if the picture cannot be read. */
  Ed.addImageFile = async function (file) {
    var bytes = await U.readFile(file), im = await E.prepareImage(bytes);
    var asset = E.addAsset({ mime: im.mime, url: U.bytesToDataURL(im.bytes, im.mime), w: im.w, h: im.h, name: file.name });
    Ed.placeImage(asset, U.t('pdf.ed.undo_add_image'));
  };

  // A picture for the current page is a part of the intake of its own (shared/intake, 'pdf.image'), reached by a paste
  // (first: before the 'pdf' spec, so a pasted picture belongs on the page) and by the image tool's picker (Ed.pickImage).
  // With a page open the intake asks: Add to this page, or New document (the picture opens as a PDF of its own, through
  // the 'pdf' spec). With no PDF open it opens as a new PDF at once.
  SlopIntake.register({
    id: 'pdf.image', main: false, first: true, toast: false,
    accept: { types: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], get noun() { return U.t('pdf.ed.noun_picture'); } },
    hasOpen: function () { return !!(E.state && E.state.pages.length) && !!Ed.page(); },
    openName: function () { return U.t('pdf.ed.open_name_page'); },
    onAdd: async function (files) {
      for (var i = 0; i < files.length; i++) {
        try { await Ed.addImageFile(files[i]); } catch (e) { SlopUI.alert(U.t('pdf.ed.img_not_added'), U.t('pdf.ed.img_unreadable', { err: String(e.message || e) })); }
      }
    },
    onNew: function (files, ctx) { return SlopIntake.take(files, { to: 'pdf', source: ctx.source, mode: 'new', data: { tab: !!(E.state && E.state.pages.length) } }); },
  });
})();
