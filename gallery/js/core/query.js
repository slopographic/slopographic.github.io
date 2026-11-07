/* Slop Gallery: pure helpers over photo records (no DOM, no storage): filter, newest-first sort, month grouping,
 * facets for the filter menus, and exact-duplicate groups by SHA-256. Exposes window.SlopGallery.query.
 * State for filter(): { text, year, month, camera, fav, tag: '' | 'liked' | 'disliked' | 'untagged', album: id | '' } */
(function () {
  'use strict';
  const G = (window.SlopGallery = window.SlopGallery || {});
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const cameraOf = (m) => [m.make, m.model].filter(Boolean).join(' ').trim();
  const yearOf = (m) => new Date(m.takenAt || 0).getFullYear();
  const monthOf = (m) => new Date(m.takenAt || 0).getMonth();

  /** Photos matching the state. albums: array of album records (needed for the album filter). */
  function filter(list, st = {}, albums = []) {
    const text = (st.text || '').trim().toLowerCase();
    const album = st.album ? albums.find((a) => a.id === st.album) : null;
    const inAlbum = album ? new Set(album.photoIds) : null;
    const year = st.year ? Number(st.year) : null;
    const month = st.month !== '' && st.month != null ? Number(st.month) : null;
    return list.filter((m) => {
      if (text && !m.name.toLowerCase().includes(text)) return false;
      if (year != null && yearOf(m) !== year) return false;
      if (month != null && monthOf(m) !== month) return false;
      if (st.camera && cameraOf(m) !== st.camera) return false;
      if (st.fav && !m.fav) return false;
      if (st.tag === 'liked' && m.liked !== 'liked') return false;
      if (st.tag === 'disliked' && m.liked !== 'disliked') return false;
      if (st.tag === 'untagged' && (m.liked || (m.tags && m.tags.length))) return false;
      if (inAlbum && !inAlbum.has(m.id)) return false;
      return true;
    });
  }
  /** Newest first by the date the photo was taken; ties by id so the order is stable. */
  const sortNewest = (list) => list.slice().sort((a, b) => ((b.takenAt || 0) - (a.takenAt || 0)) || (a.id < b.id ? -1 : 1));

  /** Groups a newest-first list by calendar month: [{ key: 'YYYY-MM', label: 'July 2019', items: [...] }]. */
  function groupMonths(list) {
    const out = [];
    let cur = null;
    for (const m of list) {
      const d = new Date(m.takenAt || 0);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      if (!cur || cur.key !== key) { cur = { key, label: MONTHS[d.getMonth()] + ' ' + d.getFullYear(), items: [] }; out.push(cur); }
      cur.items.push(m);
    }
    return out;
  }
  /** Years (newest first) and camera names (A to Z) present in the list. */
  function facets(list) {
    const years = new Set(), cameras = new Set();
    for (const m of list) { years.add(yearOf(m)); const c = cameraOf(m); if (c) cameras.add(c); }
    return {
      years: [...years].filter((y) => y > 1900).sort((a, b) => b - a),
      cameras: [...cameras].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
    };
  }
  /** Groups of exact duplicates (same SHA-256), 2+ each. Inside a group the oldest photo comes first (the default keeper);
 * a stable sort keeps import order when two were added in the same millisecond. */
  function dupeGroups(list) {
    const by = new Map();
    for (const m of list) { if (!by.has(m.sha)) by.set(m.sha, []); by.get(m.sha).push(m); }
    const groups = [];
    for (const [sha, items] of by) if (items.length > 1) groups.push({ sha, items: items.slice().sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0)) });
    return groups.sort((a, b) => (b.items.length - a.items.length) || (a.sha < b.sha ? -1 : 1));
  }

  G.query = { filter, sortNewest, groupMonths, facets, dupeGroups, cameraOf, MONTHS };
})();
