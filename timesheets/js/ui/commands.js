// Slop Timesheets commands (the palette and [data-cmd] buttons), through SlopBiz.commands (shared/biz/biz.js).
(function (g) {
  'use strict';
  const NS = (g.SlopTimesheets = g.SlopTimesheets || {});
  const editing = () => !!(NS.editor && NS.editor.current()) && location.hash.startsWith('#t/');
  const t = (k) => () => (g.SlopI18n ? g.SlopI18n.t(k) : k);   // read when the commands are registered
  const GO = t('timesheets.cmd.g_goto'), TI = t('timesheets.cmd.g_time'), EN = t('timesheets.cmd.g_entry');
  const COMMANDS = [
    { id: 'view.list', title: t('timesheets.cmd.list'), group: GO, run: () => NS.app.go('list') },
    { id: 'view.bill', title: t('timesheets.cmd.bill'), group: GO, keywords: ['invoice', 'billing'], run: () => NS.app.go('bill') },
    { id: 'time.new', title: t('timesheets.cmd.new'), group: TI, keywords: ['add', 'hours', 'entry'], run: () => NS.app.go('new') },
    { id: 'time.timer', title: t('timesheets.cmd.timer'), group: TI, keywords: ['clock', 'track', 'stopwatch'],
      run: () => { if (NS.timer.running()) NS.timer.stop(); else { NS.app.go('list'); NS.timer.start(); } } },
    { id: 'time.csv', title: t('timesheets.cmd.csv'), group: TI, keywords: ['export', 'spreadsheet', 'report'], run: () => NS.listView.downloadCsv() },
    { id: 'entry.copy', title: t('timesheets.cmd.copy'), group: EN, when: editing, run: () => NS.app.go(`new/${NS.editor.current().id}`) },
    { id: 'entry.delete', title: t('timesheets.cmd.delete'), group: EN, when: () => editing() && NS.editor.current().state !== 'billed', run: () => NS.editor.remove() },
  ];
  NS.commands = { init: () => { NS.commands.run = g.SlopBiz.commands('timesheets', COMMANDS); }, list: COMMANDS };
})(typeof window !== 'undefined' ? window : globalThis);
