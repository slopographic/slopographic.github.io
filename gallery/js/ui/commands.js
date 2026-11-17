/* Slop Gallery: SlopCmd commands. Every main action is in the command palette (Mod+K) and can be rebound in the
 * keyboard settings. Keys are only Mod combinations, Escape and Delete, so typing in a field is never hijacked.
 * Each command checks its own precondition (selection present, no overlay open) through `when`.
 * Exposes window.SlopGallery.commands.list() for the tests. */
(function () {
  'use strict';
  const G = (window.SlopGallery = window.SlopGallery || {});
  const A = () => G.actions;
  const overlayOpen = () => !!(G.viewer.current() || (G.sortmode.state().open));
  const typing = () => { const a = document.activeElement; return !!(a && a.closest && a.closest('input, textarea, select, [contenteditable="true"]')); };
  const idle = () => !overlayOpen() && !typing();
  const hasSel = () => G.state.selected.length > 0;
  const ids = () => A().targets(null);
  const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);

  const COMMANDS = [
    { id: 'gallery.import', title: 'gallery.cmd.import', group: 'gallery.cmd.group_file', keys: ['Mod+O'], run: () => A().importFiles(), when: idle },
    { id: 'gallery.importFolder', title: 'gallery.cmd.import_folder', group: 'gallery.cmd.group_file', run: () => A().importFolder(), when: idle },
    { id: 'gallery.importDrive', title: 'gallery.cmd.import_drive', group: 'gallery.cmd.group_file', run: () => A().importDrive(), when: () => idle() && !!window.SlopHub },
    { id: 'gallery.backup', title: 'gallery.cmd.backup', group: 'gallery.cmd.group_file', run: () => A().backup(), when: idle },
    { id: 'gallery.restore', title: 'gallery.cmd.restore', group: 'gallery.cmd.group_file', run: () => A().restoreBackup(), when: idle },
    { id: 'gallery.export', title: 'gallery.cmd.export', group: 'gallery.cmd.group_edit', run: () => A().exportIds(ids()), when: () => idle() && hasSel() },
    { id: 'gallery.selectAll', title: 'gallery.cmd.select_all', group: 'gallery.cmd.group_edit', keys: ['Mod+A'], run: () => A().selectAll(), when: idle },
    { id: 'gallery.clearSelection', title: 'gallery.cmd.clear_selection', group: 'gallery.cmd.group_edit', keys: ['Escape'], run: () => A().clearSelection(), when: () => idle() && hasSel() && !(G.sidebar && G.sidebar.sheet && G.sidebar.sheet.isOpen()) },
    { id: 'gallery.remove', title: 'gallery.cmd.remove', group: 'gallery.cmd.group_edit', keys: ['Delete'], run: () => A().removeIds(ids()), when: () => idle() && hasSel() },
    { id: 'gallery.reel', title: 'gallery.cmd.reel', group: 'gallery.cmd.group_photo', run: () => A().makeReel(ids()), when: () => idle() && G.state.selected.length >= 2 },
    { id: 'gallery.favourite', title: 'gallery.cmd.favourite', group: 'gallery.cmd.group_photo', run: () => A().toggleFav(ids()), when: () => idle() && hasSel() },
    { id: 'gallery.like', title: 'gallery.cmd.like', group: 'gallery.cmd.group_photo', run: () => A().like(ids(), 'liked'), when: () => idle() && hasSel() },
    { id: 'gallery.dislike', title: 'gallery.cmd.dislike', group: 'gallery.cmd.group_photo', run: () => A().like(ids(), 'disliked'), when: () => idle() && hasSel() },
    { id: 'gallery.tag', title: 'gallery.cmd.tag', group: 'gallery.cmd.group_photo', run: () => A().tagPrompt(ids()), when: () => idle() && hasSel() },
    { id: 'gallery.sort', title: 'gallery.cmd.sort', group: 'gallery.cmd.group_organise', keys: ['Alt+S'], run: () => A().sortIds(hasSel() ? ids() : []), when: idle },
    { id: 'gallery.dupes', title: 'gallery.cmd.dupes', group: 'gallery.cmd.group_organise', keys: ['Mod+Shift+D'], run: () => A().dupes(), when: idle },
    { id: 'gallery.album.new', title: 'gallery.cmd.album_new', group: 'gallery.cmd.group_albums', run: () => G.albums.create(), when: idle },
    { id: 'gallery.album.add', title: 'gallery.cmd.album_add', group: 'gallery.cmd.group_albums', run: () => G.albums.addIds(ids()), when: () => idle() && hasSel() },
    { id: 'gallery.view.photos', title: 'gallery.cmd.view_photos', group: 'gallery.cmd.group_view', run: () => G.state.setView('photos'), when: idle },
    { id: 'gallery.view.favourites', title: 'gallery.cmd.view_favourites', group: 'gallery.cmd.group_view', run: () => G.state.setView('favourites'), when: idle },
    { id: 'gallery.view.dupes', title: 'gallery.cmd.view_dupes', group: 'gallery.cmd.group_view', run: () => G.state.setView('dupes'), when: idle },
    { id: 'gallery.filter.liked', title: 'gallery.cmd.filter_liked', group: 'gallery.cmd.group_view', run: () => G.state.setQuery({ tag: 'liked' }), when: idle },
    { id: 'gallery.filter.disliked', title: 'gallery.cmd.filter_disliked', group: 'gallery.cmd.group_view', run: () => G.state.setQuery({ tag: 'disliked' }), when: idle },
    { id: 'gallery.filter.untagged', title: 'gallery.cmd.filter_untagged', group: 'gallery.cmd.group_view', run: () => G.state.setQuery({ tag: 'untagged' }), when: idle },
    { id: 'gallery.filter.clear', title: 'gallery.cmd.filter_clear', group: 'gallery.cmd.group_view', run: () => G.state.setQuery({ text: '', year: '', month: '', camera: '', tag: '' }), when: idle },
  ];

  /** Registers the commands with SlopCmd when it is present. */
  function register() {
    if (!window.SlopCmd) return;
    const all = () => COMMANDS.map((c) => Object.assign({}, c, { title: t(c.title), group: t(c.group), keys: c.keys || [] }));
    SlopCmd.register(all());
    if (window.SlopI18n) window.SlopI18n.on(() => SlopCmd.register(all())); // the palette follows a language switch
    // the assistant's commands with arguments (ui/ai-commands.js), loaded when the AI panel first asks
    if (SlopCmd.provide) SlopCmd.provide({ prepare: () => (G.ai ? null : new Promise((res, rej) => document.head.append(Object.assign(document.createElement('script'),
      { src: new URL('js/ui/ai-commands.js', location.href).href, onload: res, onerror: () => rej(new Error('Could not load ai-commands.js')) })))) });
  }
  G.commands = { register, list: () => COMMANDS.map((c) => ({ id: c.id, title: t(c.title), keys: c.keys || [] })) };
})();
