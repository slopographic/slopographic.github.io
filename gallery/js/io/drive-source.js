/* Slop Gallery: the Drive source. Every file in Slop Drive (SlopHub.list, Trash excluded) as light items, read only.
 *  - load()        → [{ id, name, type, size, time, stamp, kind }], newest first. kind comes from shared/kinds/kinds.js.
 *  - thumb(item)   → an object URL for the Drive's own thumbnail, or null when there is none. Read through
 *                    shared/drive/thumb-read.js (the one reader of the Drive's thumbnail cache).
 * Exposes window.SlopGallery.driveSource. */
(function () {
  'use strict';
  const G = (window.SlopGallery = window.SlopGallery || {});
  const stampOf = (r) => r.modified || r.time || 0;

  async function load() {
    const rows = (await window.SlopHub.list()) || []; // intake-ok: the Gallery's Drive library view, not a picker
    return rows.map((r) => ({
      id: r.id, name: r.name || 'Untitled', type: r.type || '', size: r.size || 0, time: r.time || 0,
      stamp: stampOf(r), kind: window.SlopKinds.kindOf(r.name, r.type),
    }));
  }
  /** The Drive's cached thumbnail for an item, as an object URL, or null. Never rejects. */
  async function thumb(item) {
    const blob = await window.SlopDriveThumbs.get(item);
    return blob ? URL.createObjectURL(blob) : null;
  }

  G.driveSource = { load, thumb };
})();
