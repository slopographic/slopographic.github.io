// Slop Photo Sorter: the photos and what was decided about each, in memory. Pure (no page); the Node tests load it.
// Exposes SlopSorter.model:
//   create() -> set: set.add(files) -> added items; set.get(id); set.items; set.setLiked(id, 'liked' | 'disliked' | null);
//     set.addTag(id, tag); set.removeTag(id, tag); set.remove(id); set.clear(); set.on(fn) (fn('photos' | 'tags'))
//   An item: { id, name, path, file, size, type, liked: 'liked' | 'disliked' | null, tags: [] }
//   filter(items, which)  which: 'all' | 'unsorted' | 'liked' | 'disliked' | 'tag:<name>'
//   counts(items) -> { all, unsorted, liked, disliked, tags: [[tag, n], …] (most used first) }
//   csv(items) -> 'Photo,Folder,Decision,Tags' and one line per photo
//   isImage(file) -> true for the pictures a browser can show (by type, or by name when the type is empty)
(function (g) {
  'use strict';
  const NS = (g.SlopSorter = g.SlopSorter || {});
  const EXT = /\.(jpe?g|png|webp|gif|bmp|avif|svg)$/i;
  const isImage = (f) => !!f && (/^image\//.test(f.type || '') ? !/heic|heif|tiff/i.test(f.type) : EXT.test(f.name || ''));

  function create() {
    let items = [], seq = 0;
    const subs = new Set(), byId = new Map();
    const emit = (what) => { for (const fn of subs) try { fn(what); } catch (e) { /* a listener's own trouble */ } };
    const set = {
      add(files) {
        const added = [...(files || [])].filter(isImage).map((file) => {
          const path = String(file.webkitRelativePath || file.slopPath || file.name);
          return { id: 'p' + ++seq, name: file.name, path, file, size: file.size || 0, type: file.type || '', liked: null, tags: [] };
        });
        for (const it of added) byId.set(it.id, it);
        items = items.concat(added);
        if (added.length) emit('photos');
        return added;
      },
      get: (id) => byId.get(id) || null,
      get items() { return items.slice(); },
      setLiked(id, v) { const it = byId.get(id); if (it) { it.liked = v === 'liked' || v === 'disliked' ? v : null; emit('tags'); } return Promise.resolve(it); },
      addTag(id, tag) {
        const it = byId.get(id), t = String(tag || '').trim().toLowerCase();
        if (it && t && !it.tags.includes(t)) { it.tags.push(t); emit('tags'); }
        return Promise.resolve(it);
      },
      removeTag(id, tag) { const it = byId.get(id); if (it) { it.tags = it.tags.filter((x) => x !== tag); emit('tags'); } return Promise.resolve(it); },
      remove(id) { if (!byId.has(id)) return false; byId.delete(id); items = items.filter((x) => x.id !== id); emit('photos'); return true; },
      clear() { items = []; byId.clear(); emit('photos'); },
      on(fn) { subs.add(fn); return () => subs.delete(fn); },
    };
    return set;
  }

  function filter(items, which = 'all') {
    if (which === 'unsorted') return items.filter((x) => !x.liked);
    if (which === 'liked' || which === 'disliked') return items.filter((x) => x.liked === which);
    if (String(which).startsWith('tag:')) { const t = which.slice(4); return items.filter((x) => x.tags.includes(t)); }
    return items.slice();
  }
  function counts(items) {
    const tags = new Map();
    for (const x of items) for (const t of x.tags) tags.set(t, (tags.get(t) || 0) + 1);
    return { all: items.length, unsorted: items.filter((x) => !x.liked).length, liked: items.filter((x) => x.liked === 'liked').length,
      disliked: items.filter((x) => x.liked === 'disliked').length, tags: [...tags].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)) };
  }
  const cell = (v) => { const s = String(v == null ? '' : v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  function csv(items) {
    const folder = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
    return [['Photo', 'Folder', 'Decision', 'Tags'], ...items.map((x) => [x.name, folder(x.path), x.liked || '', x.tags.join('; ')])]
      .map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
  }

  NS.model = { create, filter, counts, csv, isImage };
})(typeof window !== 'undefined' ? window : globalThis);
