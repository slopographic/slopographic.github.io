/* Slop Drive — ui/menus: the right-click menu (selection-aware), the internal clipboard (copy / cut / paste)
 * and the keyboard shortcuts dialog. */
'use strict';
(function (DR) {
  const S = DR.S;
  DR.clipCopy = (cut) => { const items = DR.selected().filter((i) => !i.trashedAt); if (!items.length) return; S.clip = { keys: items.map(DR.keyOf), cut }; DR.toast(DR.t(cut ? 'drive.toast.clip_cut_n' : 'drive.toast.clip_copied_n', { n: items.length })); DR.render(); };
  DR.paste = async function (into = DR.dest()) {
    if (!S.clip) return;
    const items = DR.items(S.clip.keys).filter((i) => !i.trashedAt);
    if (!items.length) { S.clip = null; return; }
    if (S.clip.cut) { await DR.move(items, into); S.clip = null; DR.render(); } else await DR.copy(items, into);
  };
  /** The sort menu: each key (the active one with its direction arrow), then the reverse. Alt+S opens it. */
  DR.sortRows = () => [
    ...DR.SORT_KEYS.map(([k]) => { const on = S.sort.key === k, l = DR.colLabel(k); return { label: on ? `${l} ${S.sort.dir > 0 ? '▲' : '▼'}` : l, check: on, act: () => DR.sortClick(k) }; }),
    '-',
    { label: DR.t(S.sort.dir > 0 ? 'drive.menu.descending' : 'drive.menu.ascending'), act: () => DR.setSort(S.sort.key, -S.sort.dir) },
  ];
  DR.openSortMenu = function () {
    const r = DR.$('btnSort').getBoundingClientRect();
    window.SlopUI.menu(DR.sortRows(), r.left, r.bottom + 4);
  };

  /** The target kind decides the menu: 'empty' (the folder's background), 'trash' (items in Trash), 'folder' or 'file'. */
  DR.targetKind = function (items) {
    if (!items.length) return 'empty';
    if (S.section === 'trash' || items.every((i) => i.trashedAt)) return 'trash';
    return items.length === 1 && items[0].isFolder ? 'folder' : 'file';
  };
  const emptyRows = () => [
    { label: DR.t('drive.menu.new_folder'), key: DR.keyLabel('newFolder'), act: () => DR.newFolder(DR.dest()), disabled: !DR.canAddHere() },
    DR.canAddHere() ? DR.newSub(DR.dest()) : null,
    { label: DR.t('drive.menu.upload_files'), key: DR.keyLabel('upload'), act: () => DR.uploadPicker(false) },
    { label: DR.t('drive.menu.paste'), key: DR.keyLabel('paste'), act: () => DR.paste(), disabled: !S.clip || !DR.canAddHere() },
    '-',
    { label: DR.t('drive.menu.select_all'), key: DR.keyLabel('selectAll'), act: () => DR.selectAll() },
    { label: DR.t('menu.view'), sub: DR.VIEWS.map(([v, , k]) => ({ label: DR.viewLabel(v), key: k, check: S.view === v, act: () => DR.setView(v) })) },
    { label: DR.t('drive.menu.sort_by'), sub: DR.sortRows() },
    S.section === 'trash' ? '-' : null,
    S.section === 'trash' ? { label: DR.t('drive.menu.empty_trash'), act: () => DR.emptyTrash() } : null,
  ];
  const trashRows = (items) => [
    { label: DR.t('drive.menu.restore'), act: () => DR.restore(items) },
    { label: DR.t('drive.menu.delete_forever_dots'), act: () => DR.purge(items) },
    '-',
    { label: DR.t('drive.menu.quick_look'), key: 'Space', act: () => DR.quickLook(items[0]), disabled: items.length !== 1 || items[0].isFolder },
    { label: DR.t('ui.download'), act: () => DR.download(items) },
    '-',
    { label: DR.t('drive.menu.empty_trash'), act: () => DR.emptyTrash() },
  ];
  /** The "Open in" submenu for one file: the apps that open it, the default first (marked). Picking one remembers it. */
  DR.openInRows = (r) => {
    const apps = DR.orderedAppsFor(r), d = apps[0];
    return apps.length ? apps.map((a) => ({ label: a === d ? DR.t('drive.menu.app_default', { app: a.name }) : a.name, act: () => DR.openWith(r, a.id, { remember: true }) }))
      : [{ label: DR.t('drive.menu.no_app'), disabled: true }];
  };
  /** Rows for one file or one folder (or several items of both): the open, share and edit rows, then the shared ones. */
  const itemRows = (items) => {
    const one = items.length === 1 ? items[0] : null, file = one && !one.isFolder ? one : null, folder = one && one.isFolder ? one : null;
    const allStarred = items.every((i) => i.starred);
    return [
      folder ? { label: DR.t('menu.open'), key: 'Enter', act: () => DR.open(folder) } : null,
      file ? { label: DR.defaultAppFor(file) ? DR.t('drive.menu.open_in', { app: DR.defaultAppFor(file).name }) : DR.t('menu.open'), key: 'Enter', act: () => DR.open(file) } : null,
      file ? { label: DR.t('drive.menu.open_with'), sub: DR.openInRows(file) } : null,
      ...DR.cleanRows(items),
      items.some(DR.isFaceable) ? { label: DR.t('drive.menu.find_faces'), act: () => DR.findFaces(items) } : null,
      items.some(DR.isFaceable) ? { label: DR.t('drive.menu.faces_people'), act: () => DR.openFaces() } : null,
      file ? { label: DR.t('drive.menu.quick_look'), key: 'Space', act: () => DR.quickLook(file) } : null,
      one && (S.section !== 'folder' || DR.searching()) ? { label: DR.t('drive.menu.show_in_folder'), act: () => DR.reveal(one) } : null,
      '-',
      { label: items.length === 1 && file ? DR.t('ui.download') : DR.t('drive.menu.download_zip'), act: () => DR.download(items) },
      { label: DR.t(allStarred ? 'drive.menu.unstar' : 'drive.menu.star'), key: DR.keyLabel('star'), act: () => DR.setStar(items, !allStarred) },
      one ? { label: DR.t('drive.menu.rename'), key: DR.keyLabel('rename'), act: () => DR.rename(one) } : null,
      items.some((i) => !i.isFolder && !i.trashedAt) ? { label: DR.t('drive.menu.add_tags'), act: () => DR.tagPrompt(items) } : null,
      '-',
      { label: DR.t('drive.menu.copy'), key: DR.keyLabel('copy'), act: () => DR.clipCopy(false) },
      { label: DR.t('drive.menu.cut'), key: DR.keyLabel('cut'), act: () => DR.clipCopy(true) },
      folder ? { label: DR.t('drive.menu.paste_into'), key: DR.keyLabel('paste'), act: () => DR.paste(folder.id), disabled: !S.clip } : null,
      { label: DR.t('drive.menu.duplicate'), key: DR.keyLabel('duplicate'), act: () => DR.duplicate(items) },
      { label: DR.t('drive.menu.move_to'), key: DR.keyLabel('move'), act: () => DR.moveDialog(items) },
      { label: DR.t('drive.menu.copy_to'), act: () => DR.moveDialog(items, true) },
      folder ? { label: DR.t('drive.menu.new_folder_inside'), act: () => DR.newFolder(folder.id) } : null,
      folder ? DR.newSub(folder.id) : null,
      '-',
      { label: DR.t('drive.menu.info'), key: DR.keyLabel('info'), act: () => { DR.toggleInfo(true); if (DR.isMobile()) DR.sheet(true); } },
      { label: DR.t('drive.menu.move_to_trash'), key: DR.keyLabel('trash'), act: () => DR.trash(items) },
    ];
  };
  /** The rows for a target kind, with separators that would lead or repeat dropped. */
  DR.menuRows = function (kind, items) {
    const rows = kind === 'empty' ? emptyRows() : kind === 'trash' ? trashRows(items) : itemRows(items);
    return rows.filter((x, i, a) => x && !(x === '-' && (i === 0 || a[i - 1] === '-')));
  };
  /** The right-click menu for the current selection (More, and a long press on touch). */
  DR.contextMenu = function (x, y) {
    const items = DR.selected();
    window.SlopUI.menu(DR.menuRows(DR.targetKind(items), items), x, y);
  };

  // [keys, what] in English (tests read it); the dialog shows each row through drive.keys.<SC_KEYS[i]>.
  DR.SHORTCUTS = [   // i18n-ignore
    ['Enter / double-click', 'Open folder, or open file in its app'], ['Space', 'Quick look'], ['Backspace / Alt+↑', 'Up one folder'],   // i18n-ignore
    ['Arrows', 'Move the focus (Shift extends)'], ['Ctrl+A', 'Select all'], ['Esc', 'Clear selection'],   // i18n-ignore
    ['F2', 'Rename'], ['Delete', 'Move to Trash (Shift+Delete: delete forever)'], ['S', 'Star / unstar'],   // i18n-ignore
    ['Ctrl+C / X / V', 'Copy, cut, paste'], ['Ctrl+D', 'Duplicate'], ['Ctrl+M', 'Move to…'], ['Ctrl+Alt+Shift+N', 'New folder'], ['Ctrl+U', 'Upload files'],   // i18n-ignore
    ['/ or Ctrl+F', 'Search'], ['1 – 6', 'Grid, list, compact, columns, nodes, disk usage'], ['I', 'Info panel'],   // i18n-ignore
    ['G then R / S / T / D', 'Go to Recent, Starred, Trash, Slop Drive'], ['?', 'This list'],   // i18n-ignore
  ];
  const SC_KEYS = ['open', 'quick_look', 'up', 'arrows', 'select_all', 'clear_sel', 'rename', 'trash', 'star', 'clip', 'duplicate', 'move', 'new_folder', 'upload', 'search', 'views', 'info', 'go', 'this_list'];
  /** The keys that are words (Enter / double-click, Arrows, ...) have a table entry of their own: drive.keys.<name>_k. */
  const KEY_WORDS = { open: 1, arrows: 1, search: 1, go: 1 };
  DR.shortcutRows = () => DR.SHORTCUTS.map(([k], i) => [KEY_WORDS[SC_KEYS[i]] ? DR.t('drive.keys.' + SC_KEYS[i] + '_k') : k, DR.t('drive.keys.' + SC_KEYS[i])]);
  DR.shortcutsDialog = function () {
    if (window.SlopCmd && window.SlopCmd.openKeymap) return window.SlopCmd.openKeymap();
    const el = DR.el;
    window.SlopUI.dialog({ title: DR.t('drive.keys.title'), cls: 'keys-dlg', body: el('div', { class: 'keys' }, DR.shortcutRows().map(([k, d]) => el('div', { class: 'krow' }, el('kbd', null, k), el('span', null, d)))), buttons: [{ label: DR.t('menu.close'), primary: true }] });
  };
})(window.DR);
