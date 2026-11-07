// Slop To-do boot: opens the shared store, draws the views (Today, Upcoming, All and each list) from the task rules, and
// redraws when the store changes, including changes from the Calendar. A link from the Calendar (?task=id) opens that
// task. Exposes window.SlopTodo.app.
(function (g) {
  'use strict';
  const S = g.SlopData, T = g.SlopTime, TK = g.SlopTasks, TS = g.SlopTaskStore, UI = g.SlopUI, el = UI.el;
  const NS = (g.SlopTodo = g.SlopTodo || {});
  const $ = (id) => document.getElementById(id);
  const state = { view: 'today', showDone: false, text: '', zone: T.deviceZone(), locale: undefined, seq: 0, timer: 0 };
  NS.state = state;

  /** The view name for the sidebar and the page title: 'today', 'upcoming', 'all' or 'list:<name>'. */
  const viewArg = () => (state.view.startsWith('list:') ? { list: state.view.slice(5) } : state.view);
  const tr = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  /** Dates in the language the page is read in; in English, the company's locale (Admin) decides the format. */
  const loc = () => { const l = g.SlopI18n ? g.SlopI18n.get() : 'en'; return l !== 'en' ? l : state.locale; };
  const titleOf = () => (state.view.startsWith('list:') ? state.view.slice(5) : tr({ today: 'todo.view.today', upcoming: 'todo.view.upcoming', all: 'todo.view.all_tasks' }[state.view]));

  /** Re-draws the sidebar counts, the list and the title. */
  async function render() {
    const seq = ++state.seq;
    const r = await S.store.list('tasks');
    if (seq !== state.seq) return;
    const cu = await S.store.list('customers');
    if (!r.ok) { $('tList').replaceChildren(el('p', { class: 'msg', role: 'alert' }, r.message)); return; }
    const all = r.value;
    const today = T.todayIn(state.zone);
    const customers = new Map((cu.ok ? cu.value : []).map((c) => [c.id, c.name]));
    const lists = TK.listsOf(all);
    const count = (v) => TK.forView(all, v, today).length;
    const side = [['today', tr('todo.view.today'), count('today')], ['upcoming', tr('todo.view.upcoming'), count('upcoming')], ['all', tr('todo.view.all'), count('all')]];
    $('tSide').replaceChildren(
      el('ul', { class: 'side-list', role: 'list' }, side.map(([v, label, n]) => viewButton(v, label, n))),
      el('h3', { class: 'side-h' }, tr('todo.side.lists')),
      el('ul', { class: 'side-list', role: 'list' }, lists.map((name) => viewButton(`list:${name}`, name, count({ list: name })))),
      el('button', { type: 'button', class: 'btn small', onclick: newList }, tr('todo.side.new_list')));   // i18n-ignore: a class name
    $('tTitle').textContent = titleOf();
    const visible = TK.forView(all, viewArg(), today, { showDone: state.showDone, text: state.text });
    NS.list.render($('tList'), visible, all, { view: viewArg(), today, locale: loc(), customers, showDone: state.showDone,
      toggle, edit });
    $('tDone').checked = state.showDone;
    $('tSearch').value = state.text;
    $('tNote').textContent = tr('todo.app.note', { n: visible.length });
  }

  function viewButton(v, label, n) {
    const on = state.view === v;
    return el('li', null, el('button', { type: 'button', class: 'side-btn', 'aria-pressed': String(on), 'data-view': v,
      onclick: () => setView(v) }, el('span', null, label), el('span', { class: 'side-n' }, String(n))));
  }

  function setView(v) {
    state.view = v;
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* not available */ }
    render();
  }

  async function toggle(t) {
    const r = t.done ? await TS.reopen(t.id) : await TS.complete(t.id);
    if (!r.ok) UI.toast(r.message || tr('todo.toast.update_failed'));
  }

  function edit(t) { NS.editor.open({ task: t, onDone: () => render() }); }

  /** Creates a task from the quick-add field, in the list being viewed (Inbox otherwise), due today in the Today view. */
  async function quickAdd() {
    const input = $('tAdd');
    const title = input.value.trim();
    if (!title) return;
    const list = state.view.startsWith('list:') ? state.view.slice(5) : 'Inbox';   // i18n-ignore: the stored name of the default list
    const due = state.view === 'today' ? T.todayIn(state.zone) : undefined;
    const r = await TS.save({ title, list, due, done: false, priority: 'none', tags: [] });
    if (!r.ok) { UI.toast(r.message || tr('todo.toast.add_failed')); return; }
    input.value = '';
  }

  async function newList() {
    const name = await UI.prompt(tr('todo.dlg.new_list'), tr('todo.dlg.list_name'), '');
    if (name === null || !String(name).trim()) return;
    NS.editor.open({ list: String(name).trim().slice(0, 40), onDone: () => render() });
    state.view = `list:${String(name).trim().slice(0, 40)}`;
    render();
  }

  function refreshSoon() { clearTimeout(state.timer); state.timer = setTimeout(render, 40); }

  /** The page's controls and their events. */
  function wire() {
    $('tAdd').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); quickAdd(); } });
    $('tAddBtn').addEventListener('click', quickAdd);
    $('tNew').addEventListener('click', () => NS.editor.open({ list: state.view.startsWith('list:') ? state.view.slice(5) : 'Inbox', due: state.view === 'today' ? T.todayIn(state.zone) : undefined, onDone: () => render() }));   // i18n-ignore: the stored name of the default list
    $('tDone').addEventListener('change', (e) => { state.showDone = e.target.checked; render(); });
    $('tSearch').addEventListener('input', (e) => { state.text = e.target.value; render(); });
    $('tConfig').addEventListener('click', (e) => {
      const items = g.SlopConfigDialog ? g.SlopConfigDialog.menuItems({ app: 'todo' }) : [];
      const r = e.currentTarget.getBoundingClientRect();
      UI.menu(items, r.left, r.bottom + 4);
    });
  }

  /** A link from the Calendar: ?task=id opens that task's editor. */
  async function openFromLink() {
    const id = new URLSearchParams(location.search).get('task');
    if (!id) return;
    const r = await S.store.get('tasks', id);
    if (r.ok && r.value) edit(r.value);
  }

  async function boot() {
    const ready = await S.store.ready();
    if (!ready.ok) { $('tBoot').textContent = tr('todo.err.storage', { why: ready.message }); return; }
    const st = await S.store.get('settings', 'main');
    state.locale = (st.ok && st.value && st.value.locale) || undefined;
    wire();
    NS.commands.init();
    S.store.subscribe(() => refreshSoon());
    try { if (g.SlopHub) g.SlopHub.register('todo'); } catch (e) { /* no hub */ }
    if (g.SlopReminderEngine) g.SlopReminderEngine.start();
    await render();
    if (g.SlopI18n) g.SlopI18n.on(render);   // the views and the list in the new language
    $('tBoot').hidden = true;
    openFromLink();
  }

  NS.app = { boot, render, setView, toggle, edit, quickAdd, newList };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
