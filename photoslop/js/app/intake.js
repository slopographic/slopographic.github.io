/* PhotoSlop: the one way files come in (shared/intake). Open… (Ctrl+O), Place Image as Layer…, the Open… tab button, a
 * drop on the document area (its zone says Open as new tabs or Place as layers), a picture dragged from another web page,
 * a paste (Add to the open document or New document), Open from Slop Drive, ?drive=<id> from another app, and the
 * welcome card's sample all call SlopIntake.take, and every file is read here by one reader: handleFiles (io/files.js).
 * mode 'add' places the file as a layer of the open document, otherwise it opens in a tab of its own; a file from Slop
 * Drive opened in a tab keeps its record (CUR.driveId), so Save writes back to it.
 * The parts with files of their own (brushes here; the watermark logo 'photoslop.logo', registered by the shared watermark panel; the pictures of a config's layers in io/config.js;
 * effect presets in layers/fx-preset-picker.js) are specs of their own, reached by name (SlopIntake.pick({ to })). Classic script, after app/tabs.js; registerIntake() runs
 * at boot (app/main.js). */
'use strict';

const PS_RULES = () => ({
  types: ['image/*'],
  exts: ['.psd', '.psb', '.ora', '.kra', '.tif', '.tiff', '.svg', '.ico', '.avif', '.bmp', '.gif', '.webp', '.jfif', ...(window.SlopRaw ? SlopRaw.EXTS.map((e) => '.' + e) : [])],
  noun: 'photoslop.app.noun_picture',
});

function registerIntake() {
  const SI = window.SlopIntake;
  SI.register({
    id: 'photoslop', accept: PS_RULES(), ask: ['paste'],
    driveAccept: ['image/*', 'image/vnd.adobe.photoshop', 'application/x-openraster'],
    except: (f) => !!(window.SlopBuffer && SlopBuffer.isSystemCopyOf(f)), // our own buffer copies stay with onPaste
    hasOpen: () => D.layers.length > 0,
    openName: () => D.name || tr('photoslop.app.open_document'),
    process: async (file, ctx) => {
      const before = CUR, place = ctx.mode === 'add';
      const failed = await handleFiles([file], place);
      if (failed.length) throw new Error(failed[0]);
      if (!place && ctx.drive && CUR && CUR !== before) CUR.driveId = ctx.drive.id;
      return file.name;
    },
  });
  // Brushes: .abr, .slopbrush packs and picture tips, all of a pick at once (one toast).
  SI.register({ id: 'photoslop.brushes', main: false, paste: false, toast: false,
    accept: { types: ['image/*', 'application/json'], exts: ['.abr', '.slopbrush', '.json'], noun: 'photoslop.app.noun_brush' },
    processAll: (files) => importBrushFiles(files) });
  // The watermark's logo ('photoslop.logo') is the shared watermark panel's own part (shared/watermark/panel.js, watermark/panel.js).
}
