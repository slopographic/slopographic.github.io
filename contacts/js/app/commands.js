/* Slop Contacts commands: every main action, registered with SlopCmd (palette, remappable keys) and run from any
 * element with data-cmd. Keys are handled in keys.js, so they work without SlopCmd too. Adds SlopContacts.commands. */
(function () {
  'use strict';
  const SC = window.SlopContacts;
  const S = SC.state;
  const UI = window.SlopUI;
  const hasSel = () => S.sel.size > 0;
  const hasOpen = () => !!(S.open && S.byId(S.open));
  const hasContacts = () => S.list.length > 0;
  const tools = () => SC.tools;
  const tr = (k, v) => SC.tr(k, v);

  function editOpen() { if (hasOpen()) { S.mode = 'edit'; S.emit('render'); } }
  function dupOpen() { const c = hasOpen() && S.byId(S.open); if (c) SC.cardRead.duplicate(c); }
  function selectShown(on) { S.setSel(on ? S.visible().map((c) => c.id) : []); }
  function about() {
    UI.alert('Slop Contacts', tr('contacts.cmd.about_body'));   // i18n-ignore: the app's own name (a brand)
  }

  // title, group and why are keys of the string tables (contacts/i18n/<code>/tools.js), read when the commands are registered
  const COMMANDS = [
    { id: 'contacts.new', title: 'contacts.cmd.new', group: 'contacts.cmd.g_contacts', run: () => SC.newContact.open() },
    { id: 'contacts.edit', title: 'contacts.cmd.edit', group: 'contacts.cmd.g_contacts', run: editOpen, when: hasOpen },
    { id: 'contacts.dup', title: 'contacts.cmd.dup', group: 'contacts.cmd.g_contacts', run: dupOpen, when: hasOpen },
    { id: 'contacts.delete', title: 'contacts.cmd.delete', group: 'contacts.cmd.g_contacts', run: () => SC.select.remove(hasSel() ? new Set(S.sel) : new Set([S.open])), when: () => hasSel() || hasOpen() },
    { id: 'contacts.selectAll', title: 'contacts.cmd.select_all', group: 'contacts.cmd.g_contacts', run: () => selectShown(true), when: hasContacts },
    { id: 'contacts.clearSel', title: 'contacts.cmd.clear_sel', group: 'contacts.cmd.g_contacts', run: () => S.setSel([]), when: hasSel },
    { id: 'contacts.selectMode', title: 'contacts.cmd.select_mode', group: 'contacts.cmd.g_contacts', run: () => { S.selectMode = !S.selectMode; S.emit('render'); } },
    { id: 'import.files', title: 'contacts.cmd.import', group: 'contacts.cmd.g_file', run: () => SC.io.importPick() },
    { id: 'export.open', title: 'contacts.cmd.export', group: 'contacts.cmd.g_file', run: () => SC.io.exportDialog(), when: hasContacts },
    { id: 'biz.sample', title: 'contacts.cmd.sample', group: 'contacts.cmd.g_file', run: () => window.SlopBiz.sampleDialog('contacts'), when: () => !!(window.SlopBiz && window.SlopBiz.sampleDialog) },   // shared/biz/sample.js
    { id: 'drive.save', title: 'contacts.cmd.drive_save', group: 'contacts.cmd.g_file', run: () => SC.drive.save(), when: () => SC.drive.isOn() },
    { id: 'drive.open', title: 'contacts.cmd.drive_open', group: 'contacts.cmd.g_file', run: () => SC.driveLoad.open(), when: () => SC.drive.isOn() },
    { id: 'contacts.dupes', title: 'contacts.cmd.dupes', group: 'contacts.cmd.g_tools', run: () => tools().dupesDialog(), when: () => S.list.length > 1, why: 'contacts.cmd.dupes_why' },
    { id: 'contacts.clean', title: 'contacts.cmd.clean', group: 'contacts.cmd.g_tools', run: () => tools().cleanDialog(), when: hasContacts },
    { id: 'contacts.findReplace', title: 'contacts.cmd.find_replace', group: 'contacts.cmd.g_tools', run: () => tools().findDialog(), when: hasContacts },
    { id: 'groups.add', title: 'contacts.cmd.group_add', group: 'contacts.cmd.g_groups', run: () => tools().addGroupDialog(), when: hasSel },
    { id: 'groups.remove', title: 'contacts.cmd.group_remove', group: 'contacts.cmd.g_groups', run: () => tools().removeGroupDialog(), when: hasSel },
    { id: 'groups.showAll', title: 'contacts.cmd.show_all', group: 'contacts.cmd.g_groups', run: () => { S.group = null; S.query = ''; S.emit('render'); } },
    { id: 'groups.sheet', title: 'contacts.cmd.show_groups', group: 'contacts.cmd.g_groups', run: () => SC.groups.sheet(true) },
    { id: 'settings.country', title: 'contacts.cmd.country', group: 'contacts.cmd.g_settings', run: () => tools().countryDialog() },
    { id: 'view.search', title: 'contacts.cmd.search', group: 'contacts.cmd.g_view', run: () => { const q = document.getElementById('search'); if (q) q.focus(); } },
    { id: 'view.table', title: 'contacts.cmd.table', group: 'contacts.cmd.g_view', run: () => SC.layout.setView('table'), when: hasContacts },
    { id: 'view.cards', title: 'contacts.cmd.cards', group: 'contacts.cmd.g_view', run: () => SC.layout.setView('cards') },
    { id: 'filters.clear', title: 'contacts.cmd.clear_filters', group: 'contacts.cmd.g_view', run: () => { S.filters = SC.filters.clean({}); S.emit('render'); }, when: () => SC.filters.active(S.filters) },
    { id: 'help.about', title: 'contacts.cmd.about', group: 'contacts.cmd.g_help', run: about },
  ];
  const byId = Object.fromEntries(COMMANDS.map((c) => [c.id, c]));

  /** Runs a command by id. Goes through SlopCmd when it is loaded (recents and remapped keys apply). */
  function run(id) {
    const c = byId[id];
    if (!c) return false;
    try {
      if (window.SlopCmd && window.SlopCmd.get(id)) return window.SlopCmd.run(id);
      if (c.when && !c.when()) { UI.toast(c.why ? tr(c.why) : tr('contacts.cmd.nothing_yet', { title: tr(c.title) })); return false; }
      c.run();
      return true;
    } catch (err) {
      console.error(err);
      UI.toast(tr('contacts.cmd.failed', { title: tr(c.title), why: err.message }));
      return false;
    }
  }

  /** Registers with SlopCmd and wires every [data-cmd] element. */
  function init() {
    const C = window.SlopCmd;
    if (C) {
      C.init({ app: 'contacts' });
      const reg = () => {
        C.register(COMMANDS.map((c) => ({ id: c.id, title: tr(c.title), group: tr(c.group), keys: [], when: c.when, why: c.why && tr(c.why), run: () => c.run() })));
        C.register([{ id: 'help.keys', title: tr('contacts.cmd.keys'), group: tr('contacts.cmd.g_help'), run: () => C.openKeymap() }]);
      };
      reg();
      if (window.SlopI18n) window.SlopI18n.on(reg);   // the palette in the new language
      // the assistant's record commands (shared/data/ai-records.js), loaded when the AI panel first asks
      if (C.provide && window.SlopBiz && SlopBiz.assistant) C.provide({ prepare: () => SlopBiz.assistant('contacts') });
    }
    document.addEventListener('click', (e) => {
      const el = e.target.closest && e.target.closest('[data-cmd]');
      if (el && !el.disabled) { e.preventDefault(); run(el.dataset.cmd); }
    });
  }

  SC.commands = { COMMANDS, run, init };
})();
