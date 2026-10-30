/* Slop Drive — ui/shell: breadcrumbs, view switcher, kind filter, selection bar, status bar, and the
 * New / More menus in the top bar. */
'use strict';
(function (DR) {
  const S = DR.S, el = DR.el, $ = DR.$;
  // [id, label, key]: the labels are read when shown (DR.viewLabel / DR.themeLabel), so they follow a language switch.
  DR.VIEWS = [['grid', 'Grid', '1'], ['list', 'List', '2'], ['compact', 'Compact', '3'], ['columns', 'Columns', '4'], ['nodes', 'Nodes', '5'], ['usage', 'Disk usage', '6']];   // i18n-ignore: English fallback
  DR.THEMES = [['pro', 'Pro (dark)'], ['light', 'Light'], ['classic', 'Classic 98']].filter(([t]) => !window.SlopTheme || SlopTheme.has(t));   // i18n-ignore: English fallback
  DR.viewLabel = (v) => DR.t('drive.view.' + v);
  DR.themeLabel = (t) => DR.t('drive.theme.' + t);

  DR.setView = function (v) { if (!DR.VIEWS.some((x) => x[0] === v)) return; S.view = v; S.sort = S.sorts[v] || { key: 'name', dir: 1 }; DR.savePrefs(); DR.render(); };
  DR.setTheme = function (t) { document.documentElement.setAttribute('data-theme', t); try { localStorage.setItem('slop-drive.theme', JSON.stringify(t)); } catch (e) { /* blocked */ } };

  DR.renderCrumbs = function () {
    const box = $('crumbs'); box.replaceChildren();
    const add = (label, id, sec) => {
      if (box.children.length) box.append(DR.icon('chev', 'ic sep'));
      const b = el('button', { type: 'button', class: 'crumb', title: label }, label);
      if (sec) b.addEventListener('click', () => DR.goSection(sec));
      else { b.dataset.drop = id == null ? 'root' : id; b.addEventListener('click', () => DR.go(id)); }
      box.append(b);
    };
    if (S.section !== 'folder') add(DR.placeName(), null, S.section);
    else {
      add(DR.rootName(), null);
      for (const f of DR.pathOf(S.cwd)) add(f.name, f.id);
      if (DR.searching()) { box.append(DR.icon('chev', 'ic sep')); box.append(el('span', { class: 'crumb' }, DR.t('drive.app.search_crumb', { q: S.query.trim() }))); }
    }
    box.scrollLeft = box.scrollWidth;
  };
  DR.renderTools = function () {
    const seg = $('views');
    if (!seg.children.length) for (const [v, , key] of DR.VIEWS) {
      const label = DR.viewLabel(v);
      const b = el('button', { type: 'button', 'data-view': v, title: DR.t('drive.app.view_tip', { label, key }), 'aria-label': label }, DR.icon(v));
      b.addEventListener('click', () => DR.setView(v));
      seg.append(b);
    }
    for (const b of seg.children) b.setAttribute('aria-pressed', String(b.dataset.view === S.view));
    const k = $('kind');
    if (!k.options.length) {
      k.append(el('option', { value: 'all' }, DR.t('drive.app.all_kinds')));
      for (const x of DR.KINDS) k.append(el('option', { value: x.id }, DR.kindName(x.id)));
      if (!k.dataset.wired) { k.dataset.wired = '1'; k.addEventListener('change', () => { S.kind = k.value; S.sel.clear(); DR.render(); }); }
    }
    k.value = S.kind;
    $('btnInfo').setAttribute('aria-pressed', String(!!S.info));
  };
  DR.renderSelbar = function () {
    const bar = $('selbar'), items = DR.items(S.sel);
    bar.hidden = items.length < (DR.isMobile() ? 1 : 2);
    if (bar.hidden) return;
    const size = items.reduce((n, it) => n + DR.sizeOf(it), 0);
    const btn = (label, act, cls = '') => { const b = el('button', { type: 'button', class: 'btn ' + cls }, label); b.addEventListener('click', act); return b; };
    const kids = [el('b', null, DR.t('drive.app.sel_size', { n: items.length, size: DR.fmtSize(size) }))];
    if (S.section === 'trash') kids.push(btn(DR.t('drive.menu.restore'), () => DR.restore(items)), btn(DR.t('drive.menu.delete_forever'), () => DR.purge(items), 'danger'));
    else kids.push(btn(DR.t('drive.menu.move_to'), () => DR.moveDialog(items)), btn(DR.t('ui.download'), () => DR.download(items)), btn(DR.t('drive.menu.trash'), () => DR.trash(items), 'danger'));
    kids.push(btn(DR.t('drive.app.more_dots'), (e) => { const r = e.currentTarget.getBoundingClientRect(); DR.contextMenu(r.left, r.bottom + 4); }));
    kids.push(btn(DR.t('drive.app.clear'), () => DR.select([])));
    bar.replaceChildren(...kids);
  };
  let msg = '';
  DR.status = (m) => { msg = m || ''; DR.renderStatus(); };
  DR.renderStatus = function () {
    const list = DR.lastVisible || [], nF = list.filter((x) => x.isFolder).length, nf = list.length - nF;
    const parts = [];
    if (nF) parts.push(DR.t('drive.app.folders_n', { n: nF }));
    parts.push(DR.t('drive.app.files_n', { n: nf }));
    const sz = list.reduce((n, it) => n + DR.sizeOf(it), 0);
    $('status').replaceChildren(el('span', null, parts.join(', ') + ' · ' + DR.fmtSize(sz)), S.sel.size ? el('span', null, DR.t('drive.app.selected_n', { n: S.sel.size })) : '', el('span', { class: 'msg' }, msg));
  };

  /* ---------- top bar menus ---------- */
  DR.newMenu = function (x, y) {
    const here = DR.canAddHere();
    window.SlopUI.menu([
      { label: DR.t('drive.menu.new_folder'), key: DR.keyLabel('newFolder'), act: () => DR.newFolder(DR.dest()), disabled: !here && S.section !== 'recent' && S.section !== 'starred' },
      DR.newSub ? DR.newSub(DR.dest()) : null,
      '-',
      { label: DR.t('drive.menu.upload_files'), key: DR.keyLabel('upload'), act: () => DR.uploadPicker(false) },
      { label: DR.t('drive.menu.upload_folder'), act: () => DR.uploadPicker(true) },
      '-',
      { label: DR.t('drive.menu.new_text'), act: async () => { const n = await window.SlopUI.prompt(DR.t('drive.menu.new_text'), DR.t('drive.dlg.name'), DR.t('drive.dlg.notes_txt'), { ok: DR.t('drive.dlg.create') }); if (n) await DR.importFiles([{ file: new File([''], n, { type: 'text/plain' }), path: n }], DR.dest()); } },
    ], x, y);
  };
  DR.moreMenu = function (x, y) {
    const theme = document.documentElement.getAttribute('data-theme');
    window.SlopUI.menu([
      { label: DR.t('drive.menu.backup'), act: () => DR.backupDialog() },
      ...DR.folderMenuRows(),
      { label: DR.t('drive.menu.find_dupes'), act: () => DR.dupesDialog() },
      '-',
      { label: DR.t('menu.view'), sub: DR.VIEWS.map(([v, , k]) => ({ label: DR.viewLabel(v), key: k, check: S.view === v, act: () => DR.setView(v) })) },
      { label: DR.t('drive.menu.theme'), sub: DR.THEMES.map(([t]) => ({ label: DR.themeLabel(t), check: theme === t, act: () => DR.setTheme(t) })) },
      { label: DR.t('drive.menu.info_panel'), key: DR.keyLabel('info'), check: S.info, act: () => DR.toggleInfo() },
      ...(S.view === 'list' ? [{ label: DR.t('drive.menu.list_columns'), sub: DR.columnRows() }] : []),
      '-',
      { label: DR.t('drive.menu.keep_storage'), act: () => DR.requestPersist(true) },
      { label: DR.t('drive.menu.empty_trash'), act: () => DR.emptyTrash() },
      '-',
      { label: DR.t('drive.menu.search_cmds'), key: window.SlopCmd ? 'Ctrl+K' : undefined, act: () => DR.openPalette() },
      { label: DR.t('menu.help'), sub: [{ label: DR.t('drive.menu.shortcuts'), key: '?', act: () => DR.shortcutsDialog() }, { label: DR.t('drive.menu.about_local'), act: () => DR.localDrivesHelp() }, { label: DR.t('drive.menu.search_cmds_k'), act: () => DR.openPalette() }] },
    ], x, y);
  };
  DR.backupDialog = () => window.SlopBackup.openDialog({ onRestored: () => DR.done() });
  DR.toggleInfo = function (on = !S.info) { S.info = on; DR.savePrefs(); DR.render(); };
  /** Move to… and Copy to…: the picker shows every place (Slop Drive, the Local folder, the named drives). */
  DR.moveDialog = async function (items, copy = false) {
    if (!items.length) return;
    const target = await DR.providerPicker({
      title: items.length === 1 ? DR.t(copy ? 'drive.dlg.copy_one_to' : 'drive.dlg.move_one_to', { name: items[0].name }) : DR.t(copy ? 'drive.dlg.copy_n_to' : 'drive.dlg.move_n_to', { n: items.length }),
      ok: DR.t(copy ? 'drive.dlg.copy_here' : 'drive.dlg.move_here'),
      exclude: items.filter((i) => i.isFolder).map((i) => ({ id: 'drive', ref: i.id })),
      start: { id: 'drive', ref: items[0].parent },
    });
    if (target === undefined) return;
    return DR.transferEntries(DR.internalEntries(items), await DR.resolveDest(target), { move: !copy });
  };
})(window.DR);
