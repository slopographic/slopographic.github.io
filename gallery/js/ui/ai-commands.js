/* Slop Gallery for the assistant: SlopCmd commands with arguments (shared/commands/args.js), loaded on demand by
 * SlopCmd.prepare() (ui/main.js). Photos come in the one way every photo does, through the intake
 * (SlopIntake.take, the reader actions.importOne), from Slop Drive records found by shared/commands/sources.js. Albums,
 * tags and removal go through the library (core/library.js), the files out through io/export.js packOf. The checkpoint
 * removes the albums and photos the assistant added and puts changed tags back. */
(function () {
  'use strict';
  const G = window.SlopGallery, C = window.SlopCmd;
  if (!G || !C || G.ai) return;
  const L = () => G.library;
  const log = [];   // { album } | { photos: [ids] } | { retag: [records before] }
  const list = [];
  const add = C.aiAdder('gallery', list);   // shared/commands/commands.js
  const PHOTOS = { name: 'photos', type: 'array', maxItems: 2000, items: { type: 'string' }, description: 'photo ids or file names (app_state); the selection when empty' };
  const ALBUM = { name: 'album', type: 'string', maxLength: 80, description: 'album name or id' };   // i18n-ignore: tool text for the assistant (API)
  const TAGS = (name, d) => ({ name, type: 'array', maxItems: 32, items: { type: 'string' }, description: d });
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  /** Photo ids from ids or names; the selection when none are given. */
  function idsOf(q) {
    if (!q || !q.length) { if (!G.state.selected.length) throw new Error('Give photos (ids or names), or select some first'); return G.state.selected.slice(); }
    const all = L().list();
    return q.map((x) => {
      const s = String(x).toLowerCase(), p = L().photo(String(x)) || all.find((m) => m.name.toLowerCase() === s) || all.find((m) => m.name.toLowerCase().includes(s));
      if (!p) throw new Error(`No photo “${x}” in the library`);
      return p.id;
    });
  }
  function albumOf(q) {
    const s = String(q || '').toLowerCase(), a = L().album(String(q)) || L().albums().find((x) => x.name.toLowerCase() === s);
    if (!a) throw new Error(`No album “${q}”`);
    return a;
  }
  let srcP = null;
  const sources = () => (window.SlopCmdSources ? Promise.resolve() : (srcP = srcP || new Promise((res, rej) => document.head.append(Object.assign(document.createElement('script'),
    { src: new URL('../shared/commands/sources.js', location.href).href, onload: res, onerror: () => { srcP = null; rej(new Error('Could not load sources.js')); } })))));

  add('new_album', 'New album', [{ name: 'name', type: 'string', maxLength: 80, required: true }, PHOTOS], async (a) => {
    const al = await L().createAlbum(a.name);
    log.push({ album: al.id });
    const n = a.photos && a.photos.length ? await L().addToAlbum(al.id, idsOf(a.photos)) : 0;
    return `Made the album “${al.name}”${n ? ` with ${plural(n, 'photo')}` : ''}.`;
  }, { description: 'Make an album, optionally with photos from the library.' });   // i18n-ignore: tool text for the assistant (API)

  add('add_photos', 'Add photos from Slop Drive', [{ name: 'files', type: 'array', required: true, maxItems: 500, items: { type: 'string' }, description: 'Slop Drive file names or ids' },   // i18n-ignore: tool text for the assistant (API)
    Object.assign({}, ALBUM, { description: 'also put them in this album (made when new)' })],   // i18n-ignore: tool text for the assistant (API)
  async (a) => {
    await sources();
    const recs = [];
    for (const f of a.files) recs.push(await window.SlopCmdSources.driveFile(f));
    const before = new Set(L().list().map((p) => p.id));
    await window.SlopIntake.take(recs, { to: 'gallery' });
    const ids = recs.map((r) => { const p = L().list().find((m) => m.driveId === r.id) || L().list().find((m) => m.name === r.name); return p && p.id; }).filter(Boolean);
    log.push({ photos: ids.filter((id) => !before.has(id)) });
    let note = '';
    if (a.album) {
      let al = L().albums().find((x) => x.name.toLowerCase() === a.album.toLowerCase());
      if (!al) { al = await L().createAlbum(a.album); log.push({ album: al.id }); }
      note = ` ${plural(await L().addToAlbum(al.id, ids), 'photo')} went into “${al.name}”.`;
    }
    return { done: `${plural(ids.length, 'photo')} of ${recs.length} are in the library (duplicates are not added twice).${note}`, ids };
  }, { description: 'Import pictures from Slop Drive into the library, optionally into an album.' });   // i18n-ignore: tool text for the assistant (API)

  add('set_tags', 'Tag photos', [PHOTOS, TAGS('tags', 'replace the tags with these'), TAGS('add_tags', 'tags to add'), TAGS('remove_tags', 'tags to take off'),
    { name: 'liked', type: 'enum', values: ['liked', 'disliked', 'none'] }, { name: 'favourite', type: 'boolean' }],
  async (a) => {
    const ids = idsOf(a.photos);
    log.push({ retag: ids.map((id) => Object.assign({}, L().photo(id))) });
    const low = (t) => [].concat(t || []).map((x) => String(x).trim().toLowerCase());
    const rows = await L().retag(ids, (m) => {
      let tags = a.tags ? low(a.tags) : m.tags.slice();
      tags = tags.concat(low(a.add_tags)).filter((t) => !low(a.remove_tags).includes(t));
      const p = { tags };
      if (a.liked) p.liked = a.liked === 'none' ? null : a.liked;
      if (a.favourite != null) p.fav = a.favourite;
      return p;
    });
    return `Updated ${plural(rows.length, 'photo')}.`;
  }, { description: 'Set, add or remove tags, like or dislike, and favourite photos.' });   // i18n-ignore: tool text for the assistant (API)

  add('add_to_album', 'Add photos to an album', [ALBUM, PHOTOS], async (a) => {
    const al = albumOf(a.album), n = await L().addToAlbum(al.id, idsOf(a.photos)); return `Added ${plural(n, 'photo')} to “${al.name}”.`;
  });
  add('reorder_album', 'Reorder an album', [ALBUM, Object.assign({}, PHOTOS, { required: true, description: 'the photos in their new order (the rest follow)' })], async (a) => {   // i18n-ignore: tool text for the assistant (API)
    const al = albumOf(a.album); await L().reorderAlbum(al.id, idsOf(a.photos)); return `“${al.name}” is in the new order.`;
  });
  add('remove_from_album', 'Take photos out of an album', [ALBUM, PHOTOS], async (a) => {
    const al = albumOf(a.album), n = await L().removeFromAlbum(al.id, idsOf(a.photos)); return `Took ${plural(n, 'photo')} out of “${al.name}” (they stay in the library).`;
  });
  add('remove_photos', 'Remove photos from the library', [PHOTOS], async (a) => {
    const n = await G.actions.removeIds(idsOf(a.photos), { ask: false }); return `Removed ${plural(n, 'photo')} from the library (their Slop Drive files are kept).`;
  }, { destructive: true });
  add('delete_album', 'Delete an album', [ALBUM], async (a) => { const al = albumOf(a.album); await L().deleteAlbum(al.id); return `Deleted the album “${al.name}” (its photos stay).`; }, { destructive: true });

  add('export_photos', 'Export photos', [Object.assign({}, ALBUM, { description: 'every photo of this album' }), PHOTOS,   // i18n-ignore: tool text for the assistant (API)
    { name: 'to', type: 'enum', values: ['drive', 'download', 'both'], default: 'drive' }],
  async (a) => {
    const al = a.album ? albumOf(a.album) : null, ids = al ? al.photoIds : idsOf(a.photos);
    const p = await G.export.packOf(ids, (al ? al.name : 'slop-gallery-selection') + '.zip');
    if (!p) throw new Error('None of those photos has its picture stored');
    const out = [];
    if (a.to !== 'download') { await sources(); out.push(`Saved ${p.name} (${plural(p.count, 'photo')}) to Slop Drive (id ${await window.SlopCmdSources.put(p.blob, p.name, 'gallery')})`); }
    if (a.to !== 'drive') { window.SlopUI.download(p.blob, p.name); out.push(`downloaded ${p.name}`); }
    return out.join(' and ') + '.';
  }, { description: 'Save an album or some photos (one photo as itself, several as a zip) to Slop Drive and/or a download.' });   // i18n-ignore: tool text for the assistant (API)

  function state() {
    return { app: 'Slop Gallery', photos: L().size, albums: L().albums().map((a) => ({ id: a.id, name: a.name, photos: a.photoIds.length })), selected: G.state.selected.length,
      list: L().list().slice(0, 200).map((p) => ({ id: p.id, name: p.name, tags: p.tags, liked: p.liked, fav: p.fav, taken: p.takenAt ? new Date(p.takenAt).toISOString().slice(0, 10) : null })) };
  }
  function checkpoint() {
    const mark = log.length;
    return () => {
      const undo = log.splice(mark).reverse();
      (async () => {
        for (const e of undo) {
          if (e.album && L().album(e.album)) await L().deleteAlbum(e.album);
          if (e.photos && e.photos.length) await L().remove(e.photos);
          if (e.retag) { const before = new Map(e.retag.map((r) => [r.id, r])); await L().retag([...before.keys()], (m) => { const b = before.get(m.id); return { tags: b.tags, liked: b.liked, fav: b.fav }; }); }
        }
      })();
      return true;
    };
  }
  C.register(list);
  C.provide({ state, checkpoint });
  G.ai = { list };
})();
