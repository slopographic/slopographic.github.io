/* Slop Gallery: album dialogs. Create, rename, delete, and add the selection to an album. An album holds links to
 * photos; adding a photo never copies its bytes, and deleting an album never deletes photos.
 * Exposes window.SlopGallery.albums. */
(function () {
  'use strict';
  const G = (window.SlopGallery = window.SlopGallery || {});
  const toast = (m) => window.SlopUI && SlopUI.toast(m);
  const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);

  async function create() {
    const name = await SlopUI.prompt(t('gallery.album.new_title'), t('gallery.album.name'), '', { ok: t('gallery.album.create'), placeholder: t('gallery.album.name_ph') });
    if (name == null) return null;
    const a = await G.library.createAlbum(name);
    G.state.setView('album', a.id);
    return a;
  }
  async function rename(id) {
    const a = G.library.album(id); if (!a) return null;
    const name = await SlopUI.prompt(t('gallery.album.rename_title'), t('gallery.album.name'), a.name, { ok: t('gallery.album.rename_ok') });
    if (name == null || !name.trim()) return null;
    return G.library.renameAlbum(id, name);
  }
  async function remove(id) {
    const a = G.library.album(id); if (!a) return false;
    const ok = await SlopUI.confirm(t('gallery.album.delete_title'), t('gallery.album.delete_body', { name: a.name, n: a.photoIds.length }), t('ui.delete'), { danger: true });
    if (!ok) return false;
    await G.library.deleteAlbum(id);
    if (G.state.state.query.album === id) G.state.setView('photos');
    toast(t('gallery.album.deleted'));
    return true;
  }
  /** Asks which album, or offers a new one. ids: photo ids to add (links only). */
  async function addIds(ids) {
    if (!ids.length) return 0;
    const albums = G.library.albums();
    if (!albums.length) { const a = await create(); if (a) { const n = await G.library.addToAlbum(a.id, ids); toast(t('gallery.album.added_to', { n, name: a.name })); return n; } return 0; }
    const sel = SlopUI.select([...albums.map((a) => [a.id, a.name]), ['__new', t('gallery.menu.new_album')]], albums[0].id);
    const body = SlopUI.el('div', null, SlopUI.field(t('gallery.album.album'), sel));
    let added = 0;
    await new Promise((res) => SlopUI.dialog({ title: t('gallery.album.add_title', { n: ids.length }), body,
      buttons: [{ label: t('menu.cancel') }, { label: t('gallery.album.add'), primary: true, act: async () => {
        if (sel.value === '__new') { const a = await create(); if (a) added = await G.library.addToAlbum(a.id, ids); }
        else added = await G.library.addToAlbum(sel.value, ids);
        return true;
      } }], onClose: () => res() }));
    toast(added ? t('gallery.album.added_n', { n: added }) : t('gallery.album.already'));
    return added;
  }

  G.albums = { create, rename, remove, addIds };
})();
