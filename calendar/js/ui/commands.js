// Slop Calendar commands for SlopCmd (the palette and remappable keys). Plain letters work outside text fields. The keys
// are: arrows to move, t today, y, m, w, d, s, a for the views, n a new event, k to show or hide to-dos. Ctrl+Z undoes a move
// (app.js handles it, so it works only outside text fields). Exposes window.SlopCal.commands.
(function (g) {
  'use strict';
  const NS = (g.SlopCal = g.SlopCal || {});
  const A = () => NS.app;
  const t = (k) => () => (g.SlopI18n ? g.SlopI18n.t(k) : k);   // a title read when the commands are registered
  const CAL = t('calendar.cmd.g_cal'), GO = t('calendar.cmd.g_goto');
  const COMMANDS = [
    { id: 'cal.prev', title: t('calendar.cmd.prev'), group: CAL, keys: ['ArrowLeft'], keywords: ['back', 'earlier'], run: () => A().step(-1) },
    { id: 'cal.next', title: t('calendar.cmd.next'), group: CAL, keys: ['ArrowRight'], keywords: ['forward', 'later'], run: () => A().step(1) },
    { id: 'cal.today', title: t('calendar.cmd.today'), group: CAL, keys: ['t'], run: () => A().goToday() },
    { id: 'cal.year', title: t('calendar.cmd.year'), group: CAL, keys: ['y'], run: () => A().setView('year') },
    { id: 'cal.month', title: t('calendar.cmd.month'), group: CAL, keys: ['m'], run: () => A().setView('month') },
    { id: 'cal.split', title: t('calendar.cmd.split'), group: CAL, keys: ['s'], keywords: ['two', 'panes', 'side'], run: () => A().setView('split') },
    { id: 'cal.undo', title: t('calendar.cmd.undo'), group: CAL, keys: [], keywords: ['back', 'revert', 'drag'], run: () => A().undo() },
    { id: 'cal.week', title: t('calendar.cmd.week'), group: CAL, keys: ['w'], run: () => A().setView('week') },
    { id: 'cal.day', title: t('calendar.cmd.day'), group: CAL, keys: ['d'], run: () => A().setView('day') },
    { id: 'cal.agenda', title: t('calendar.cmd.agenda'), group: CAL, keys: ['a'], run: () => A().setView('agenda') },
    { id: 'cal.new', title: t('calendar.cmd.new'), group: CAL, keys: ['n'], keywords: ['add', 'create', 'event'], run: () => A().newAt(NS.state.anchor, 9 * 60) },
    { id: 'cal.tasks', title: t('calendar.cmd.tasks'), group: CAL, keys: ['k'], keywords: ['task', 'todo', 'layer'], run: () => A().toggleTasks() },
    { id: 'cal.import', title: t('calendar.cmd.import'), group: CAL, keywords: ['ics', 'ical', 'load'], run: () => A().importIcs() },
    { id: 'cal.export', title: t('calendar.cmd.export'), group: CAL, keywords: ['ics', 'ical', 'download', 'save'], run: () => NS.ics.exportIcs() },
    { id: 'cal.todo', title: t('calendar.cmd.todo'), group: GO, run: () => { location.href = '../todo/'; } },
    { id: 'cal.reminders', title: t('calendar.cmd.reminders'), group: GO, run: () => { location.href = '../reminders/'; } },
    { id: 'cal.crm', title: t('calendar.cmd.crm'), group: GO, run: () => { location.href = '../crm/#followups'; } },
  ];

  /** Registers the commands and starts SlopCmd for this app. Without SlopCmd the buttons still work. */
  function init() {
    if (!g.SlopCmd) return;
    g.SlopCmd.init({ app: 'calendar' });
    const reg = () => g.SlopCmd.register(COMMANDS.map((c) => ({ ...c, title: c.title(), group: c.group() })));
    reg();
    if (g.SlopI18n) g.SlopI18n.on(reg);   // the palette in the new language
    // the assistant's record commands (shared/data/ai-records.js through shared/biz/biz.js), loaded when the AI panel first asks
    if (g.SlopCmd.provide && g.SlopBiz && g.SlopBiz.assistant) g.SlopCmd.provide({ prepare: () => g.SlopBiz.assistant('calendar') });
  }

  NS.commands = { init, list: COMMANDS };
})(typeof window !== 'undefined' ? window : globalThis);
