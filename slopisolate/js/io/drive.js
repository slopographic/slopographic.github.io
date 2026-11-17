/* SlopIsolate — Slop Drive. Every processed image or video is saved automatically into the Drive folder
 * "Slop Isolate" as separate files: the original (skipped when it already came from Drive), the mask, and the
 * result. Images: <name>-original.<ext>, <name>-mask.png, <name>-result.png (saved when the cut-out is ready).
 * Videos: <name>-original.<ext> and <name>-matte.mp4 (after the matte pass); the result is saved on export.
 * Saving is best-effort: a failure is a toast, never a lost cut-out. CO.drive.* (needs Slop Hub). */
(function () {
  'use strict';
  const CO = window.CO, U = CO.util, D = CO.drive = {};
  const FOLDER = 'Slop Isolate';
  let folderP = null;

  D.ready = () => !!window.SlopHub && !document.documentElement.dataset.offline;
  /** The app's folder at the Drive root (made on first use). */
  D.folder = function () {
    if (!folderP) folderP = (async () => {
      const hit = (await SlopHub.listFolders({ parentId: null })).find((f) => f.name === FOLDER && !f.trashedAt);
      return hit ? hit.id : SlopHub.createFolder(FOLDER, null, { app: 'cutout' });
    })().catch((e) => { folderP = null; throw e; });
    return folderP;
  };
  /** Put one file in the folder. meta.role says what it is (original, mask, result, matte). */
  D.put = async function (blob, name, role, extra = {}) {
    if (!D.ready() || !blob) return null;
    return SlopHub.put(blob, { name, from: 'cutout', meta: Object.assign({ role }, extra), folderId: await D.folder() });
  };
  const stem = (it) => U.baseName(it.name || 'image');
  const extOf = (name, fallback) => (/\.([a-z0-9]+)$/i.exec(name || '') || [0, fallback])[1];

  /** Grey PNG of a 0..255 mask (w × h). */
  D.maskBlob = function (mask, w, h) {
    const c = U.canvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data;
    for (let i = 0; i < w * h; i++) { d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = mask[i]; d[i * 4 + 3] = 255; }
    g.putImageData(img, 0, 0);
    return new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('PNG failed'))), 'image/png'));
  };
  /** PNG of an ImageData (the cut-out with its alpha). */
  D.imageBlob = function (imageData) {
    const c = U.canvas(imageData.width, imageData.height);
    U.ctx(c).putImageData(imageData, 0, 0);
    return new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('PNG failed'))), 'image/png'));
  };

  /** Still image: original, mask and result. r = the engine result (mask, base, cutout, width, height). */
  D.saveImage = async function (it, r) {
    try {
      const base = stem(it);
      const jobs = [];
      if (!it.driveOriginId) jobs.push(D.put(it.file, base + '-original.' + extOf(it.file && it.file.name, 'png'), 'original'));
      jobs.push(D.maskBlob(r.base, r.width, r.height).then((b) => D.put(b, base + '-mask.png', 'mask')));
      jobs.push(D.imageBlob(r.cutout).then((b) => D.put(b, base + '-result.png', 'result')));
      it.driveSaved = await Promise.all(jobs).then((ids) => ids.filter(Boolean).length);
      CO.emit('item', it);
    } catch (e) { console.warn('SlopIsolate: Drive save failed', e); CO.emit('toast', U.t('cutout.drive.save_failed', { error: String(e.message || e) })); }
  };
  /** Video: the original and the matte (grey MP4, the same size as the frames). */
  D.saveVideo = async function (it, src, res) {
    try {
      const base = stem(it), ids = [];
      if (!it.driveOriginId) ids.push(await D.put(it.file, base + '-original.' + extOf(it.file && it.file.name, 'mp4'), 'original'));
      const m = await CO.video.enc.matteMp4(src, res, {});
      ids.push(await D.put(m.blob, base + '-matte.mp4', 'matte'));
      it.driveSaved = ids.filter(Boolean).length;
      CO.emit('item', it);
    } catch (e) { console.warn('SlopIsolate: Drive save failed', e); CO.emit('toast', U.t('cutout.drive.matte_failed', { error: String(e.message || e) })); }
  };
  /** Save an exported result (image or video) next to the rest. */
  D.saveResult = async function (it, blob, name) {
    try { return await D.put(blob, name, 'result'); } catch (e) { CO.emit('toast', U.t('cutout.drive.save_failed_plain')); return null; }
  };
  /** File ▸ Open from Slop Drive: images and videos become queue items. */
  D.open = async function () {
    if (!D.ready()) return;
    await SlopIntake.fromDrive({ to: 'cutout', title: U.t('cutout.menu.drive_title') }); // the intake (io/files.js)
  };
})();
