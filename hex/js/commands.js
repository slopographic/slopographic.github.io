/* Slop Hex: SlopCmd commands, the Menu button's menu and the right-click menu for the bytes.
 * Classic script; exposes window.HexCommands. Shortcuts are bound here through SlopCmd only, so the keys are not
 * handled twice (Ctrl+C in the byte grid is the one exception, see grid.js). */
(function () {
  'use strict';
  if (window.HexCommands) return;
  const A = () => window.HexApp;
  const has = () => !!A().doc();
  const canUndo = () => has() && A().doc().canUndo();
  const canRedo = () => has() && A().doc().canRedo();
  const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
  const focusEl = (id) => () => { const el = document.getElementById(id); if (el) { el.focus(); el.select && el.select(); } };

  function commandList() {
    // title and group are keys, read in the current language each time the list is built (a language change registers it again)
    const C = (id, title, group, keys, extra = {}) => Object.assign({ id: 'hex.' + id, title: t(title), group: t(group), keys, run: () => {} }, extra);
    return [
      C('open', 'hex.cmd.open', 'menu.file', ['Mod+O'], { keywords: ['load', 'computer', 'picker'], run: () => A().pickComputer() }),
      C('drive', 'hex.cmd.drive', 'menu.file', [], { keywords: ['load', 'drive'], run: () => A().pickDrive() }),
      C('save', 'hex.cmd.save', 'menu.file', ['Mod+S'], { keywords: ['write', 'drive', 'version'], when: has, run: () => A().saveVersion() }),
      C('saveas', 'hex.cmd.saveas', 'menu.file', [], { keywords: ['drive', 'new', 'folder'], when: has, run: () => A().saveAs() }),
      C('download', 'hex.cmd.download', 'menu.file', ['Mod+Alt+S'], { keywords: ['save', 'computer'], when: has, run: () => A().download() }),
      C('rename', 'ui.rename_dots', 'menu.file', [], { keywords: ['name', 'title'], when: has, run: () => window.SlopDocTabs.rename(null) }),
      C('undo', 'ui.undo', 'menu.edit', ['Mod+Z'], { keywords: ['back'], when: canUndo, run: () => A().undo() }),
      C('redo', 'ui.redo', 'menu.edit', ['Mod+Y', 'Mod+Shift+Z'], { keywords: ['forward'], when: canRedo, run: () => A().redo() }),
      C('copy', 'hex.cmd.copy', 'menu.edit', [], { keywords: ['clipboard'], when: has, run: () => A().copySel() }),
      C('goto', 'hex.cmd.goto', 'hex.cmd.g_go', ['Mod+G'], { keywords: ['jump', 'seek', 'address'], run: focusEl('hx-goto') }),
      C('find', 'hex.cmd.find', 'hex.cmd.g_go', ['Mod+F'], { keywords: ['search', 'bytes', 'text'], run: focusEl('hx-q') }),
      C('next', 'hex.cmd.next', 'hex.cmd.g_go', ['F3'], { keywords: ['search'], when: has, run: () => A().find(1) }),
      C('prev', 'hex.cmd.prev', 'hex.cmd.g_go', ['Shift+F3'], { keywords: ['search', 'back'], when: has, run: () => A().find(-1) }),
      C('sha', 'hex.cmd.sha', 'hex.cmd.g_info', [], { keywords: ['hash', 'checksum', 'digest'], when: has, run: () => A().computeSha() }),
    ];
  }

  const HERE = (document.currentScript && document.currentScript.src) || location.href;
  function register() {
    if (!window.SlopCmd) return;
    SlopCmd.init({ app: 'hex' });
    SlopCmd.register(commandList());
    // a language change: the palette's titles and groups again, in the new language
    if (window.SlopI18n && window.SlopI18n.on) window.SlopI18n.on(() => SlopCmd.register(commandList()));
    // the assistant's commands with arguments (ai-commands.js), loaded when the AI panel first asks
    if (SlopCmd.provide) SlopCmd.provide({ prepare: () => new Promise((res, rej) => {
      const s = Object.assign(document.createElement('script'), { src: new URL('ai-commands.js', HERE).href });
      s.onload = res; s.onerror = () => rej(new Error('Could not load ai-commands.js')); document.head.append(s);
    }) });
  }

  const key = (id) => (window.SlopCtx ? SlopCtx.keyFor('hex.' + id) : '');
  const editItems = () => [
    { label: t('ui.undo'), key: key('undo'), disabled: !canUndo(), act: () => A().undo() },
    { label: t('ui.redo'), key: key('redo'), disabled: !canRedo(), act: () => A().redo() },
    { label: t('hex.cmd.copy'), key: key('copy'), disabled: !has(), act: () => A().copySel() },
    '-',
    { label: t('hex.cmd.goto'), key: key('goto'), act: focusEl('hx-goto') },
    { label: t('hex.cmd.find'), key: key('find'), act: focusEl('hx-q') },
    { label: t('hex.cmd.next'), key: key('next'), disabled: !has(), act: () => A().find(1) },
    { label: t('hex.cmd.prev'), key: key('prev'), disabled: !has(), act: () => A().find(-1) },
  ];

  /** The Menu button: files first, then the editing commands. */
  function menuItems() {
    return [
      { label: t('hex.cmd.open'), key: key('open'), act: () => A().pickComputer() },
      { label: t('hex.cmd.drive'), act: () => A().pickDrive() },
      '-',
      { label: t('hex.cmd.save'), key: key('save'), disabled: !has(), act: () => A().saveVersion() },
      { label: t('hex.cmd.saveas'), disabled: !has(), act: () => A().saveAs() },
      { label: t('hex.cmd.download'), disabled: !has(), act: () => A().download() },
      { label: t('ui.rename_dots'), disabled: !has(), act: () => window.SlopDocTabs.rename(null) },
      '-',
      ...editItems(),
      '-',
      { label: t('hex.cmd.sha'), disabled: !has(), act: () => A().computeSha() },
    ];
  }

  /** Right-click on the bytes: the editing commands. */
  function contextItems() {
    if (!has()) return null;
    return editItems();
  }

  window.HexCommands = { commandList, register, menuItems, contextItems };
})();
