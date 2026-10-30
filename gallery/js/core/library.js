/* Slop Gallery: the library in memory, kept in step with IndexedDB. Every change is written to storage first (one
 * transaction per change) and only then reflected in memory, so a failed write leaves both unchanged.
 * Photo tags (liked / disliked / free text) and favourites live in the photo record. A photo imported from Slop Drive
 * also gets them written into its Drive record (meta.gallery), so they travel with the Drive file and its backups.
 * Albums hold photo ids. Adding a photo to an album never copies its bytes.
 * Exposes window.SlopGallery.library. */
(function () {
  'use strict';
  const G = (window.SlopGallery = window.SlopGallery || {});
  const photos = new Map(), albums = new Map(), shas = new Map();
  const listeners = new Set();
  let loaded = false;

  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const emit = (what) => { for (const fn of [...listeners]) try { fn(what); } catch (e) { console.error(e); } };
  const countSha = (sha, d) => { const n = (shas.get(sha) || 0) + d; if (n > 0) shas.set(sha, n); else shas.delete(sha); };
  const cleanTags = (list) => [...new Set([].concat(list || []).map((t) => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, 32);

  async function load() {
    const [ps, as] = await Promise.all([G.db.all('photos'), G.db.all('albums')]);
    photos.clear(); albums.clear(); shas.clear();
    for (const p of ps) { photos.set(p.id, normal(p)); countSha(p.sha, 1); }
    for (const a of as) albums.set(a.id, { id: a.id, name: a.name, photoIds: [...new Set(a.photoIds || [])], time: a.time || 0 });
    loaded = true;
    emit('load');
    return api;
  }
  function normal(p) {
    return Object.assign({ fav: false, liked: null, tags: [], driveId: null, takenAt: null, make: '', model: '', orientation: 1 }, p, { tags: cleanTags(p.tags) });
  }

  /** Mirrors the gallery tags into the Slop Drive record of this photo, when there is one and Drive is open. */
  async function syncDrive(meta) {
    if (!meta || !meta.driveId || !window.SlopHub) return;
    try {
      const rec = await window.SlopHub.get(meta.driveId);
      if (!rec) return;
      const gallery = { liked: meta.liked, tags: meta.tags, fav: meta.fav };
      await window.SlopHub.update(meta.driveId, { meta: Object.assign({}, rec.meta || {}, { gallery }) }, { touch: false });
    } catch (e) { console.warn('Slop Drive tag sync skipped', e); }
  }

  /** entries: [{ meta, original: Blob, thumb: Blob }]. Writes all of them in one transaction. */
  async function addEntries(entries) {
    const rows = entries.map((e) => normal(e.meta));
    await G.db.write(['photos', 'originals', 'thumbs'], (s) => {
      for (let i = 0; i < entries.length; i++) {
        s.photos.put(rows[i]);
        s.originals.put({ id: rows[i].id, blob: entries[i].original });
        s.thumbs.put({ id: rows[i].id, blob: entries[i].thumb });
      }
    });
    for (const r of rows) { photos.set(r.id, r); countSha(r.sha, 1); }
    emit('photos');
    return rows;
  }
  /** Removes photos (bytes, thumbnails and album links). Slop Drive files are not touched. */
  async function remove(ids) {
    const gone = new Set(ids.filter((id) => photos.has(id)));
    if (!gone.size) return 0;
    const touched = [...albums.values()].filter((a) => a.photoIds.some((id) => gone.has(id)));
    const nextAlbums = touched.map((a) => Object.assign({}, a, { photoIds: a.photoIds.filter((id) => !gone.has(id)) }));
    await G.db.write(['photos', 'originals', 'thumbs', 'albums'], (s) => {
      for (const id of gone) { s.photos.delete(id); s.originals.delete(id); s.thumbs.delete(id); }
      for (const a of nextAlbums) s.albums.put(a);
    });
    for (const id of gone) { countSha(photos.get(id).sha, -1); photos.delete(id); }
    for (const a of nextAlbums) albums.set(a.id, a);
    emit('photos');
    return gone.size;
  }
  /** Applies patch(meta) -> partial record to each id. Returns the updated records. */
  async function retag(ids, patchFn) {
    const rows = [];
    for (const id of ids) {
      const m = photos.get(id);
      if (!m) continue;
      const patch = patchFn(m) || {};
      rows.push(normal(Object.assign({}, m, patch, { tags: cleanTags(patch.tags || m.tags) })));
    }
    if (!rows.length) return [];
    await G.db.write('photos', (s) => { for (const r of rows) s.photos.put(r); });
    for (const r of rows) photos.set(r.id, r);
    for (const r of rows) await syncDrive(r);
    emit('tags');
    return rows;
  }
  const setLiked = (ids, liked) => retag(ids, () => ({ liked: liked || null }));
  const toggleFav = (ids) => retag(ids, (m) => ({ fav: !m.fav }));
  const addTag = (ids, tag) => retag(ids, (m) => ({ tags: [...m.tags, tag] }));
  const removeTag = (ids, tag) => retag(ids, (m) => ({ tags: m.tags.filter((t) => t !== tag) }));

  async function writeAlbum(a) { await G.db.write('albums', (s) => s.albums.put(a)); albums.set(a.id, a); emit('albums'); return a; }
  async function createAlbum(name) {
    const clean = String(name || '').trim().slice(0, 80) || 'Untitled album';
    return writeAlbum({ id: newId(), name: clean, photoIds: [], time: Date.now() });
  }
  async function renameAlbum(id, name) {
    const a = albums.get(id); if (!a) return null;
    return writeAlbum(Object.assign({}, a, { name: String(name || '').trim().slice(0, 80) || a.name }));
  }
  async function deleteAlbum(id) {
    if (!albums.has(id)) return false;
    await G.db.write('albums', (s) => s.albums.delete(id));
    albums.delete(id); emit('albums'); return true;
  }
  /** Adds ids to an album (links only: the photo bytes stay where they are). */
  async function addToAlbum(albumId, ids) {
    const a = albums.get(albumId); if (!a) return 0;
    const set = new Set(a.photoIds);
    const add = ids.filter((id) => photos.has(id) && !set.has(id));
    if (!add.length) return 0;
    await writeAlbum(Object.assign({}, a, { photoIds: [...a.photoIds, ...add] }));
    return add.length;
  }
  async function removeFromAlbum(albumId, ids) {
    const a = albums.get(albumId); if (!a) return 0;
    const drop = new Set(ids);
    const next = a.photoIds.filter((id) => !drop.has(id));
    if (next.length === a.photoIds.length) return 0;
    await writeAlbum(Object.assign({}, a, { photoIds: next }));
    return a.photoIds.length - next.length;
  }

  /** Puts an album's photos in this order (ids first, in the order given; the album's other photos keep theirs after them). */
  async function reorderAlbum(albumId, ids) {
    const a = albums.get(albumId); if (!a) return null;
    const first = ids.filter((id) => a.photoIds.includes(id)), rest = a.photoIds.filter((id) => !first.includes(id));
    return writeAlbum(Object.assign({}, a, { photoIds: [...new Set(first)].concat(rest) }));
  }

  const api = {
    load, get loaded() { return loaded; },
    photo: (id) => photos.get(id) || null,
    list: () => [...photos.values()],
    get size() { return photos.size; },
    albums: () => [...albums.values()].sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true, sensitivity: 'base' })),
    album: (id) => albums.get(id) || null,
    hasSha: (sha) => shas.has(sha),
    addEntries, remove, retag, setLiked, toggleFav, addTag, removeTag, syncDrive,
    createAlbum, renameAlbum, deleteAlbum, addToAlbum, removeFromAlbum, reorderAlbum, newId,
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    _reset() { photos.clear(); albums.clear(); shas.clear(); loaded = false; },
  };
  G.library = api;
})();
