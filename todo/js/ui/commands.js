// Slop To-do commands for SlopCmd. Plain letters work outside text fields: t Today, u Upcoming, a All, n new task,
// f find, h show done. Exposes window.SlopTodo.commands.
(function (g) {
  'use strict';
  const NS = (g.SlopTodo = g.SlopTodo || {});
  const A = () => NS.app;
  const $ = (id) => document.getElementById(id);
  const t = (k) => () => (g.SlopI18n ? g.SlopI18n.t(k) : k);   // a title read when the commands are registered
  const COMMANDS = [
    { id: 'todo.today', title: t('todo.cmd.today'), group: t('todo.cmd.g_todo'), keys: ['t'], keywords: ['due', 'overdue'], run: () => A().setView('today') },
    { id: 'todo.upcoming', title: t('todo.cmd.upcoming'), group: t('todo.cmd.g_todo'), keys: ['u'], keywords: ['later', 'future'], run: () => A().setView('upcoming') },
    { id: 'todo.all', title: t('todo.cmd.all'), group: t('todo.cmd.g_todo'), keys: ['a'], run: () => A().setView('all') },
    { id: 'todo.new', title: t('todo.cmd.new'), group: t('todo.cmd.g_todo'), keys: ['n'], keywords: ['add', 'create'], run: () => $('tNew').click() },
    { id: 'todo.find', title: t('todo.cmd.find'), group: t('todo.cmd.g_todo'), keys: ['f'], keywords: ['search', 'filter'], run: () => $('tSearch').focus() },
    { id: 'todo.done', title: t('todo.cmd.done'), group: t('todo.cmd.g_todo'), keys: ['h'], keywords: ['completed', 'finished'], run: () => { $('tDone').click(); } },
    { id: 'todo.calendar', title: t('todo.cmd.calendar'), group: t('todo.cmd.g_goto'), run: () => { location.href = '../calendar/'; } },
    { id: 'todo.reminders', title: t('todo.cmd.reminders'), group: t('todo.cmd.g_goto'), run: () => { location.href = '../reminders/'; } },
  ];

  /** Registers the commands with SlopCmd when it is loaded. */
  function init() {
    if (!g.SlopCmd) return;
    g.SlopCmd.init({ app: 'todo' });
    const reg = () => g.SlopCmd.register(COMMANDS.map((c) => ({ ...c, title: c.title(), group: c.group() })));
    reg();
    if (g.SlopI18n) g.SlopI18n.on(reg);   // the palette in the new language
    // the assistant's record commands (shared/data/ai-records.js through shared/biz/biz.js), loaded when the AI panel first asks
    if (g.SlopCmd.provide && g.SlopBiz && g.SlopBiz.assistant) g.SlopCmd.provide({ prepare: () => g.SlopBiz.assistant('todo') });
  }

  NS.commands = { init, list: COMMANDS };
})(typeof window !== 'undefined' ? window : globalThis);
