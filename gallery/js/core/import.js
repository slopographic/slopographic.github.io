/* Slop Gallery: the import pipeline. For each file: SHA-256 of the bytes, skip it when the library already has those
 * bytes (unless keepDuplicates is on), read EXIF (date, orientation, camera), fall back to the file's lastModified,
 * decode the size, make the thumbnail, then store one record in a single transaction. Files are handled one at a time
 * so memory stays bounded for big folders. Files from Slop Drive (item.driveId) also get their Drive record synced.
 * Exposes window.SlopGallery.importer.run(items, { keepDuplicates, onProgress }) -> { added, skipped, failed }. */
(function () {
  'use strict';
  const G = (window.SlopGallery = window.SlopGallery || {});

  /** The date, camera and orientation of a camera RAW file (its TIFF, CR3 boxes or embedded JPEG; shared/raw). */
  function rawExif(buf) {
    const m = window.SlopRaw.meta(new Uint8Array(buf)), t = m.date ? new Date(m.date).getTime() : NaN;
    return { takenAt: Number.isFinite(t) ? t : null, make: m.make, model: m.model, orientation: m.orientation };
  }

  /** items: [{ file: Blob, name, driveId? }]. Returns a report; failed holds the names that could not be decoded. */
  async function run(items, { keepDuplicates = false, onProgress = () => {} } = {}) {
    const L = G.library, report = { added: 0, skipped: 0, failed: [], total: items.length };
    const seen = new Set();
    for (let i = 0; i < items.length; i++) {
      const it = items[i], file = it.file, name = it.name || file.name || 'photo';
      onProgress({ done: i, total: items.length, name });
      try {
        const buf = await file.arrayBuffer();
        const sha = await G.hash.sha256(buf);
        if (!keepDuplicates && (L.hasSha(sha) || seen.has(sha))) { report.skipped++; continue; }
        const raw = await G.thumb.isRaw(file);
        const exif = raw ? rawExif(buf) : G.exif.read(buf);
        const thumb = await G.thumb.make(file, exif.orientation || 1);
        const orientation = raw ? 1 : exif.orientation || 1;   // a RAW thumbnail and viewer picture are drawn upright
        const meta = {
          id: L.newId(), name, type: file.type || G.source.mimeOf(name), size: file.size, sha,
          w: thumb.w, h: thumb.h, takenAt: exif.takenAt != null ? exif.takenAt : (file.lastModified || Date.now()),
          dateFrom: exif.takenAt != null ? 'exif' : 'file', modified: file.lastModified || 0,
          make: exif.make || '', model: exif.model || '', orientation,
          fav: false, liked: null, tags: [], addedAt: Date.now(), driveId: it.driveId || null,
        };
        await L.addEntries([{ meta, original: file, thumb: thumb.blob }]);
        if (meta.driveId) L.syncDrive(meta);
        seen.add(sha);
        report.added++;
      } catch (e) {
        console.warn('Import skipped ' + name, e);
        report.failed.push(name);
      }
    }
    onProgress({ done: items.length, total: items.length, name: '' });
    return report;
  }

  G.importer = { run };
})();
