/* Slop PDF — extract assets, saving: a JPEG is written as stored (DCTDecode bytes), other 8-bit images are decoded and
   encoded as PNG through a canvas, fonts are written as the font file the PDF embeds. Items that cannot be decoded are
   skipped with a reason and do not stop the others. Output: one zip (shared/office/zip.js writeZip), one file each, or
   Slop Drive (a folder named after the PDF in the Slop PDF folder). */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, Mod = window.SlopPdfAssets, A = SP.assets, X = A;

  /** The name of the PDF for the Drive folder and the zip: its file name without .pdf, or "PDF assets". */
  A.baseName = function () {
    var p = E.state.pages.find(function (x) { return x.f && E.files.get(x.f); });
    var n = p ? String(E.files.get(p.f).name || '').replace(/\.pdf$/i, '').trim() : '';
    return n || U.t('pdf.io.assets_name');
  };
  /** PNG bytes of RGBA pixels, through a canvas. */
  async function encodePng(rgba, w, h) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').putImageData(new ImageData(rgba, w, h), 0, 0);
    var png = new Uint8Array(await (await U.canvasToBlob(c, 'image/png')).arrayBuffer());
    c.width = c.height = 0;
    return png;
  }
  X.encodePng = encodePng;
  /** The entries of a selection: [{ group, path, data }] in order (images first) and the skipped items with reasons. */
  A.entries = async function (images, fonts) {
    var items = [], skipped = [];
    for (var im of images) {
      var label = 'p' + im.page + '-' + Mod.safePart(im.name, 'image');
      if (im.kind === 'skip') { skipped.push({ name: im.name, reason: im.reason }); continue; }
      try {
        var data = (await window.SlopPdfParts.imageFile(im, encodePng)).data;
        items.push({ group: 'image', name: label, ext: im.ext, data: data });
      } catch (e) { skipped.push({ name: im.name + ' (' + im.pageText + ')', reason: e.message || String(e) }); }
    }
    for (var f of fonts) {
      if (!f.embedded || !f.bytes) { skipped.push({ name: f.name, reason: f.reason || U.t('pdf.io.no_font_file') }); continue; }
      items.push({ group: 'font', name: Mod.safePart(f.name, 'font'), ext: f.ext, data: f.bytes });
    }
    var names = Mod.uniquify(items.map(function (it) { return (it.group === 'image' ? 'images/' : 'fonts/') + it.name + '.' + it.ext; }));
    var entries = items.map(function (it, i) { return { group: it.group, path: names[i], data: it.data }; });
    return { entries: Mod.planEntries(entries), skipped: skipped };
  };
  /** A zip of the entries: shared/office/zip.js (ES module, loaded on demand); offline, the app's own store-only zip. */
  A.zipBlob = async function (entries) {
    try {
      var z = await import('../shared/office/zip.js');
      return await z.writeZip(entries.map(function (e) { return { path: e.path, data: e.data }; }));
    } catch (e) {
      console.warn('Slop PDF: shared zip unavailable, using the built-in one', e);
      return U.makeZip(entries.map(function (e) { return { name: e.path, data: e.data }; }));
    }
  };
  /** The Drive folder for a PDF's assets: a folder named after the PDF in the Slop PDF folder (made on first use). */
  A.driveFolder = async function (base) {
    var H = window.SlopHub;
    return H.appSubfolderId('pdf', base);
  };
  /** Saves entries to Slop Drive, one file each, into the PDF's folder. Resolves with the number of files. */
  A.saveToDrive = async function (entries, zipName, base, asZip) {
    var H = window.SlopHub, folderId = await A.driveFolder(base), n = 0;
    if (asZip) { await H.put(await A.zipBlob(entries), { name: zipName, from: 'pdf', folderId: folderId }); return 1; }
    for (var e of entries) {
      var name = e.path.split('/').pop();
      await H.put(new Blob([e.data]), { name: name, from: 'pdf', folderId: folderId }); n++;
    }
    return n;
  };
  /** Downloads entries as one zip, or as one file each (the browser may ask to allow several downloads). */
  A.download = async function (entries, zipName, asZip) {
    if (asZip) return U.download(await A.zipBlob(entries), zipName, 'application/zip');
    for (var e of entries) { U.download(new Blob([e.data]), e.path.split('/').pop(), 'application/octet-stream'); await U.sleep(350); }
  };
})();
