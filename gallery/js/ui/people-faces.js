/* Slop Gallery: the Faces and people dialog (shared/faces/panel.js) and the face badge on the viewer's photos
 * (shared/faces/view.js). The photos' faces come from G.people (the background scan); the groups from the shared people
 * model for 'gallery'. Nothing leaves the device. Classic script; exposes window.SlopGallery.facesUi. */
(function () {
  'use strict';
  const G = (window.SlopGallery = window.SlopGallery || {});
  const F = () => window.SlopFaces || null;
  let adapter = null, badge = null, unsub = null;

  /** What the shared panel needs from Gallery: the photo's stamp (its SHA-256), its original, its name, and a way to open it. */
  function ad() {
    if (adapter) return adapter;
    adapter = {
      scope: 'gallery', get title() { return window.SlopI18n ? window.SlopI18n.t('gallery.people.title') : 'Faces and people'; },
      stampOf: (id) => { const m = G.library && G.library.photo(id); return m ? m.sha : null; },
      blobOf: async (id) => { const row = await G.db.get('originals', id); return (row && row.blob) || null; },
      nameOf: (id) => ((G.library && G.library.photo(id)) || {}).name || '',
      openPhoto: (id) => {
        F().panel.close();
        const ids = G.library.list().map((m) => m.id);
        G.viewer.open(ids, Math.max(0, ids.indexOf(id)));
      },
    };
    return adapter;
  }
  /** The people of the library, loaded; refreshed when the background scan finishes while the dialog is open. */
  function people() {
    if (!F() || !F().peopleFor) return null;
    const P = F().peopleFor('gallery', ad());
    if (!unsub && G.people) unsub = G.people.subscribe(() => { if (F().panel.isOpen() && !G.people.stats().running) P.refresh(); });
    return P;
  }

  G.facesUi = {
    /** Opens the dialog (the groups are loaded from the store first). */
    open() {
      if (!F() || !F().panel) return;
      const d = F().panel.open(ad());
      if (d) people().load();
    },
    /** The badge and boxes for the photo in the viewer. Replaces the one before it. */
    attach(host, badgeHost, id) {
      if (badge) { badge.destroy(); badge = null; }
      if (!F() || !F().view || !host) return;
      badge = F().view.attachPhoto(host, { scope: 'gallery', id, faces: (G.people && G.people.facesOf(id)) || [], badgeHost });
    },
    detach() { if (badge) { badge.destroy(); badge = null; } },
    people,
  };
})();
