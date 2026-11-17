/* Slop Drive — ui/commands: every action as a command for the shared palette and shortcut editor
 * (shared/commands, window.SlopCmd). Without SlopCmd the private map in keys.js still works. */
'use strict';
(function (DR) {
  const S = DR.S;
  const HERE = (document.currentScript && document.currentScript.src) || new URL('js/ui/commands.js', location.href).href;
  const sel = () => DR.selected(), one = () => (S.sel.size === 1 ? sel()[0] : null);
  const live = () => sel().filter((i) => !i.trashedAt);
  const has = () => live().length > 0;
  const inFolder = () => S.section === 'folder';
  /** The command list (also used for the menus' key labels and the fallback shortcuts dialog). */
  DR.commands = function () {
    const C = (id, title, group, keys, run, extra = {}) => Object.assign({ id: 'drive.' + id, title, group, keys, run }, extra);
    const t = DR.t, G = { file: t('drive.cmd.group_file'), edit: t('drive.cmd.group_edit'), go: t('drive.cmd.group_go'), view: t('drive.cmd.group_view'), tools: t('drive.cmd.group_tools'), help: t('drive.cmd.group_help') };
    const list = [
      C('newFolder', t('drive.cmd.new_folder'), G.file, ['Alt+Shift+Mod+N'], () => DR.newFolder(DR.dest()), { keywords: ['create', 'mkdir'] }),
      ...(DR.creatables ? DR.creatables() : []).map((c) => C('new.' + c.app.id, t('drive.cmd.new_doc', { label: DR.newLabel(c), app: DR.appLabel(c.app) }), G.file, [], () => DR.createNew(c), { keywords: ['create', 'new', c.ext, c.label] })),
      C('upload', t('drive.cmd.upload'), G.file, ['Mod+U'], () => DR.uploadPicker(false), { keywords: ['import', 'add'] }),
      C('uploadFolder', t('drive.cmd.upload_folder'), G.file, [], () => DR.uploadPicker(true)),
      C('open', t('drive.cmd.open'), G.file, [], () => DR.open(one()), { when: () => !!one() }),
      C('quickLook', t('drive.cmd.quick_look'), G.file, [], () => DR.quickLook(one()), { when: () => !!one() && !one().isFolder, keywords: ['preview'] }),
      C('download', t('drive.cmd.download'), G.file, [], () => DR.download(sel()), { when: () => S.sel.size > 0, keywords: ['zip', 'save'] }),
      C('rename', t('drive.cmd.rename'), G.edit, ['F2'], () => DR.rename(one()), { when: () => !!one() && !one().trashedAt }),
      C('copy', t('drive.cmd.copy'), G.edit, ['Mod+C'], () => DR.clipCopy(false), { when: has }),
      C('cut', t('drive.cmd.cut'), G.edit, ['Mod+X'], () => DR.clipCopy(true), { when: has }),
      C('paste', t('drive.cmd.paste'), G.edit, ['Mod+V'], () => { const o = one(); DR.paste(o && o.isFolder && !o.trashedAt ? o.id : DR.dest()); }, { when: () => !!S.clip }),
      C('duplicate', t('drive.cmd.duplicate'), G.edit, ['Mod+D'], () => DR.duplicate(live()), { when: has }),
      C('move', t('drive.cmd.move'), G.edit, ['Mod+M'], () => DR.moveDialog(live()), { when: has }),
      C('copyTo', t('drive.cmd.copy_to'), G.edit, [], () => DR.moveDialog(live(), true), { when: has }),
      C('star', t('drive.cmd.star'), G.edit, ['S'], () => { const i = live(); DR.setStar(i, !i.every((x) => x.starred)); }, { when: has, keywords: ['favourite', 'favorite'] }),
      C('trash', t('drive.cmd.trash'), G.edit, ['Delete'], () => (S.section === 'trash' ? DR.purge(sel()) : DR.trash(sel())), { when: () => S.sel.size > 0, keywords: ['delete', 'remove'] }),
      C('purge', t('drive.cmd.purge'), G.edit, ['Shift+Delete'], () => DR.purge(sel()), { when: () => S.sel.size > 0 }),
      C('restore', t('drive.cmd.restore'), G.edit, [], () => DR.restore(sel()), { when: () => sel().some((i) => i.trashedAt) }),
      C('selectAll', t('drive.cmd.select_all'), G.edit, ['Mod+A'], () => DR.selectAll()),
      C('search', t('drive.cmd.search'), G.go, ['Mod+F'], () => DR.$('search').focus(), { keywords: ['find'] }),
      C('up', t('drive.cmd.up'), G.go, ['Backspace', 'Alt+ArrowUp'], () => DR.up(), { when: () => !!S.cwd || !inFolder() }),
      C('goDrive', t('drive.cmd.go_drive'), G.go, ['G D'], () => DR.go(null), { keywords: ['home', 'root'] }),
      C('goRecent', t('drive.cmd.go_recent'), G.go, ['G R'], () => DR.goSection('recent')),
      C('goStarred', t('drive.cmd.go_starred'), G.go, ['G S'], () => DR.goSection('starred')),
      C('goTrash', t('drive.cmd.go_trash'), G.go, ['G T'], () => DR.goSection('trash')),
      C('showInFolder', t('drive.cmd.show_in_folder'), G.go, [], () => DR.reveal(one()), { when: () => !!one() && (!inFolder() || DR.searching()) }),
      C('copyLink', t('drive.cmd.copy_link'), G.go, [], () => DR.copyLink(), { keywords: ['share', 'url', 'address', 'link', 'bookmark'] }),
      ...DR.VIEWS.map(([v, , k]) => C('view.' + v, t('drive.cmd.view_of', { view: DR.viewLabel(v) }), G.view, [k], () => DR.setView(v), { checked: () => S.view === v, keywords: v === 'usage' ? ['treemap', 'sunburst', 'size', 'space'] : v === 'nodes' ? ['graph', 'tree'] : [] })),
      C('view.treemap', t('drive.cmd.view_treemap'), G.view, [], () => { S.usageMode = 'treemap'; DR.savePrefs(); DR.setView('usage'); }, { checked: () => S.view === 'usage' && S.usageMode === 'treemap' }),
      C('view.sunburst', t('drive.cmd.view_sunburst'), G.view, [], () => { S.usageMode = 'sunburst'; DR.savePrefs(); DR.setView('usage'); }, { checked: () => S.view === 'usage' && S.usageMode === 'sunburst' }),
      C('info', t('drive.cmd.info'), G.view, ['I'], () => DR.toggleInfo(), { checked: () => !!S.info, keywords: ['details', 'properties'] }),
      C('sort', t('drive.cmd.sort'), G.view, ['Alt+S'], () => DR.openSortMenu(), { keywords: ['order', 'arrange', 'sort by'] }),
      C('tags', t('drive.cmd.tags'), G.edit, [], () => DR.tagPrompt(live().filter((i) => !i.isFolder)), { when: () => live().some((i) => !i.isFolder), keywords: ['label', 'tag'] }),
      ...DR.THEMES.map(([th]) => C('theme.' + th, t('drive.cmd.theme_of', { theme: DR.themeLabel(th) }), G.view, [], () => DR.setTheme(th), { checked: () => document.documentElement.getAttribute('data-theme') === th })),
      C('dupes', t('drive.cmd.dupes'), G.tools, [], () => DR.dupesDialog(), { keywords: ['duplicate', 'same', 'space', 'clean'] }),
      C('connectFolder', t('drive.cmd.connect_folder'), G.tools, [], DR.folderAct(() => DR.connectFolder()), { when: () => !DR.noFolders(), keywords: ['local', 'disk', 'computer', 'folder', 'save'] }),
      C('folderLoadConfig', t('drive.cmd.folder_load_config'), G.tools, [], DR.folderAct(() => DR.folderLoadConfig()), { when: () => !!DR.folderState.name && DR.folderState.perm === 'granted', keywords: ['settings', 'slopographic', 'import'] }),
      C('folderSaveConfig', t('drive.cmd.folder_save_config'), G.tools, [], DR.folderAct(() => DR.folderSaveConfig()), { when: () => !!DR.folderState.name && DR.folderState.perm === 'granted', keywords: ['settings', 'slopographic', 'export'] }),
      C('disconnectFolder', t('drive.cmd.disconnect_folder'), G.tools, [], DR.folderAct(() => DR.folderDisconnectAsk()), { when: () => !!DR.folderState.name, keywords: ['forget', 'local'] }),
      C('backup', t('drive.cmd.backup'), G.tools, [], () => DR.backupDialog(), { keywords: ['import', 'export'] }),
      C('exportBackup', t('drive.cmd.export_backup'), G.tools, [], () => window.SlopBackup.exportNow().then((r) => DR.toast(DR.t('drive.toast.saved', { name: r.name }))), { keywords: ['save everything', 'download'] }),
      C('persist', t('drive.cmd.persist'), G.tools, [], () => DR.requestPersist(true), { keywords: ['persist', 'storage'] }),
      C('emptyTrash', t('drive.cmd.empty_trash'), G.tools, [], () => DR.emptyTrash()),
      C('shortcuts', t('drive.cmd.shortcuts'), G.help, ['?'], () => DR.shortcutsDialog()),
    ];
    return list;
  };
  /** Display label for a command's shortcut (SlopCmd's, which reflects the person's own bindings). */
  DR.keyLabel = function (id) {
    if (window.SlopCmd && window.SlopCmd.keyFor) { try { return window.SlopCmd.keyFor('drive.' + id) || undefined; } catch (e) { /* fall through */ } }
    const c = DR.commands().find((x) => x.id === 'drive.' + id);
    return c && c.keys[0] ? c.keys[0].replace('Mod', 'Ctrl') : undefined;
  };
  DR.openPalette = (q) => (window.SlopCmd && window.SlopCmd.open ? window.SlopCmd.open(q) : DR.$('search').focus());

  /** Files as palette results, when the palette supports providers. */
  function fileProvider() {
    return { id: 'drive.files', title: DR.t('drive.cmd.files'), search: (query) => {
      const q = String(query || '').trim().toLowerCase();
      if (q.length < 2) return [];
      return [...DR.liveFolders(), ...DR.liveFiles()].filter((it) => it.name.toLowerCase().includes(q)).slice(0, 20)
        .map((it) => ({ id: 'drive.item.' + DR.keyOf(it), title: it.name, group: DR.t(it.isFolder ? 'drive.cmd.folders' : 'drive.cmd.files'), keywords: [DR.kindLabel(it)], run: () => DR.reveal(it) }));
    } };
  }
  DR.wireCommands = function () {
    const C = window.SlopCmd;
    DR.cmdActive = false;
    if (!C || !C.register) return false;
    try {
      if (C.init) C.init({ app: 'drive', target: document });
      C.register(DR.commands());
      // a language change: the same ids again with the new titles and groups (register replaces by id)
      DR.onLang(() => C.register(DR.commands()));
      const p = fileProvider();
      if (C.addProvider) C.addProvider(p); else if (C.provider) C.provider(p);
      // the assistant's commands with arguments (ai-commands.js), loaded when the AI panel first asks
      if (C.provide) C.provide({ prepare: () => (C.get && C.get('drive.ai.list-items') ? null : new Promise((res, rej) => {
        const s = Object.assign(document.createElement('script'), { src: new URL('ai-commands.js', HERE).href, async: false });
        s.onload = res; s.onerror = () => rej(new Error('Could not load ai-commands.js')); document.head.append(s);
      })) });
      DR.cmdActive = true;
      const b = DR.$('btnCmd'); if (b) b.hidden = false;
    } catch (e) { console.warn('Slop Drive: command palette unavailable', e); }
    return DR.cmdActive;
  };
})(window.DR);
