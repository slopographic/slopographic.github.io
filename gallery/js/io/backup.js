/* Slop Gallery: the whole library in one file, and back again.
 * Format: a store-only zip (io/zip.js) holding
 *   manifest.json        { format: 'slop-gallery-backup', version: 1, created, photos: [...], albums: [...] }
 *   originals/<id>       the original bytes of each photo
 *   thumbs/<id>          its JPEG thumbnail
 * Restore is all-or-nothing: every entry is read (every CRC checked), the manifest is validated, and every original is
 * hashed and compared with its recorded SHA-256 BEFORE anything is written. Then one IndexedDB transaction writes it all.
 * A photo whose bytes are already in the library is merged, not duplicated; tags, liked state and favourites are kept.
 * Exposes window.SlopGallery.backup.exportLibrary() -> Blob and .restore(file) -> report. */
(function () {
  'use strict';
  const G = (window.SlopGallery = window.SlopGallery || {});
  const FORMAT = 'slop-gallery-backup', VERSION = 1;
  const LIKED = [null, 'liked', 'disliked'];
  const isStr = (v, max = 200) => typeof v === 'string' && v.length > 0 && v.length <= max;

  async function exportLibrary() {
    const L = G.library, photos = L.list(), albums = L.albums();
    const entries = [];
    const manifest = {
      format: FORMAT, version: VERSION, created: new Date().toISOString(),
      photos: photos.map((p) => ({ id: p.id, name: p.name, type: p.type, size: p.size, sha: p.sha, w: p.w, h: p.h, takenAt: p.takenAt,
        dateFrom: p.dateFrom || 'file', modified: p.modified || 0, make: p.make || '', model: p.model || '', orientation: p.orientation || 1,
        fav: !!p.fav, liked: p.liked || null, tags: p.tags || [], addedAt: p.addedAt || 0, driveId: p.driveId || null })),
      albums: albums.map((a) => ({ id: a.id, name: a.name, photoIds: a.photoIds, time: a.time || 0 })),
    };
    entries.push({ name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(manifest)) });
    for (const p of photos) {
      const o = await G.db.get('originals', p.id), t = await G.db.get('thumbs', p.id);
      if (!o || !o.blob) throw new Error('Missing original for ' + p.name);
      entries.push({ name: 'originals/' + p.id, data: o.blob });
      if (t && t.blob) entries.push({ name: 'thumbs/' + p.id, data: t.blob });
    }
    return G.zip.write(entries);
  }

  /** Validates a parsed manifest. Throws a readable error naming the first problem. */
  function validateManifest(m) {
    if (!m || typeof m !== 'object' || m.format !== FORMAT) throw new Error('This is not a Slop Gallery backup.');
    if (m.version !== VERSION) throw new Error('Unsupported backup version ' + m.version + '.');
    if (!Array.isArray(m.photos) || !Array.isArray(m.albums)) throw new Error('Backup manifest is incomplete.');
    const ids = new Set();
    for (const p of m.photos) {
      if (!p || !isStr(p.id, 80) || ids.has(p.id)) throw new Error('Backup has a bad or repeated photo id.');
      ids.add(p.id);
      if (!isStr(p.name, 500) || !G.hash.isHex64(p.sha) || !Number.isInteger(p.size) || p.size < 0) throw new Error('Bad record for ' + (p.name || p.id) + '.');
      if (p.takenAt !== null && typeof p.takenAt !== 'number') throw new Error('Bad date for ' + p.name + '.');
      if (!Array.isArray(p.tags) || !p.tags.every((t) => typeof t === 'string' && t.length <= 64)) throw new Error('Bad tags for ' + p.name + '.');
      if (!LIKED.includes(p.liked) || typeof p.fav !== 'boolean') throw new Error('Bad tag state for ' + p.name + '.');
      if (!Number.isInteger(p.orientation) || p.orientation < 1 || p.orientation > 8) throw new Error('Bad orientation for ' + p.name + '.');
      if (p.driveId != null && !isStr(p.driveId, 80)) throw new Error('Bad Drive id for ' + p.name + '.');
    }
    for (const a of m.albums) {
      if (!a || !isStr(a.id, 80) || !isStr(a.name, 200) || !Array.isArray(a.photoIds)) throw new Error('Bad album in backup.');
      for (const id of a.photoIds) if (!ids.has(id)) throw new Error('An album refers to a photo that is not in the backup.');
    }
  }

  /** Reads and checks a backup file. Returns { manifest, files } without writing anything. */
  async function readBackup(file) {
    const entries = G.zip.read(await file.arrayBuffer());
    const files = new Map(entries.map((e) => [e.name, e.bytes]));
    const raw = files.get('manifest.json');
    if (!raw) throw new Error('This is not a Slop Gallery backup (no manifest).');
    let manifest;
    try { manifest = JSON.parse(new TextDecoder().decode(raw)); } catch (e) { throw new Error('The backup manifest is damaged.'); }
    validateManifest(manifest);
    for (const p of manifest.photos) {
      const bytes = files.get('originals/' + p.id);
      if (!bytes) throw new Error('Backup is missing the file for ' + p.name + '.');
      if (bytes.length !== p.size) throw new Error('Size of ' + p.name + ' does not match the backup.');
      if ((await G.hash.sha256(bytes.buffer)) !== p.sha) throw new Error('Checksum of ' + p.name + ' does not match. The backup is damaged.');
      const th = files.get('thumbs/' + p.id);
      if (!th || !th.length) throw new Error('Backup is missing the thumbnail for ' + p.name + '.');
    }
    return { manifest, files };
  }

  /** Plans and writes the restore in one transaction. Resolves with counts. Rejects (library unchanged) on any problem. */
  async function restore(file) {
    const L = G.library;
    const { manifest, files } = await readBackup(file);
    const bySha = new Map(L.list().map((p) => [p.sha, p]));
    const idMap = new Map(), adds = [], updates = [];
    let merged = 0;
    for (const p of manifest.photos) {
      const have = bySha.get(p.sha);
      if (have && have.id) {
        idMap.set(p.id, have.id); merged++;
        const tags = [...new Set([...have.tags, ...p.tags])];
        const liked = have.liked || p.liked || null, fav = have.fav || p.fav;
        if (tags.length !== have.tags.length || liked !== have.liked || fav !== have.fav) updates.push(Object.assign({}, have, { tags, liked, fav }));
        continue;
      }
      const id = L.photo(p.id) ? L.newId() : p.id;
      idMap.set(p.id, id);
      const row = Object.assign({}, p, { id, addedAt: p.addedAt || Date.now() });
      adds.push({ row, bytes: files.get('originals/' + p.id), thumb: files.get('thumbs/' + p.id), type: p.type });
      bySha.set(p.sha, { id, tags: [], liked: null, fav: false });
    }
    const albums = manifest.albums.map((a) => ({ id: L.newId(), name: a.name, time: a.time || Date.now(),
      photoIds: [...new Set(a.photoIds.map((id) => idMap.get(id)))] }));
    await G.db.write(['photos', 'originals', 'thumbs', 'albums'], (s) => {
      for (const a of adds) {
        s.photos.put(a.row);
        s.originals.put({ id: a.row.id, blob: new Blob([a.bytes], { type: a.type || 'application/octet-stream' }) });
        s.thumbs.put({ id: a.row.id, blob: new Blob([a.thumb], { type: 'image/jpeg' }) });
      }
      for (const u of updates) s.photos.put(u);
      for (const a of albums) s.albums.put(a);
    });
    await L.load();
    for (const a of adds) if (a.row.driveId) L.syncDrive(L.photo(a.row.id));
    return { added: adds.length, merged, albums: albums.length };
  }

  G.backup = { exportLibrary, restore, readBackup, validateManifest, FORMAT, VERSION };
})();
