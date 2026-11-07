// Slop Projects boot: the business router (shared/biz/router.js) with the views board, timeline and list (#board,
// #timeline, #list), the state they draw from (the open project, its tasks, the filters, the zoom, the sort, today), and
// the empty page when there is no project yet. The open project is remembered in this browser. Redraws when the store
// changes (this tab or another). Ctrl+Z undoes the last change. Exposes window.SlopProjects.app and .state.
(function (g) {
  'use strict';
  const NS = (g.SlopProjects = g.SlopProjects || {});
  const S = g.SlopData, T = g.SlopTime;
  const $ = (id) => document.getElementById(id);
  const KEY = 'slop-projects.project';
  const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const put = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked: lasts this visit */ } };
  const state = NS.state = {
    pid: get(KEY), project: null, projects: [], tasks: [], visible: [], customers: new Map(),
    filter: { assignee: '', tag: '', text: '' }, zoom: NS.bars.ZOOMS[get('slop-projects.zoom')] ? get('slop-projects.zoom') : 'day',
    sort: NS.listView.stored(), today: T.todayIn(T.deviceZone()), locale: undefined, view: 'board', seq: 0,
  };
  let first = null, own;
  /** Dates in the language the page is read in; in English, the company's locale (Admin) decides the format. */
  const locale = () => { const l = g.SlopI18n ? g.SlopI18n.get() : 'en'; return l !== 'en' ? l : own; };
  if (g.SlopI18n) g.SlopI18n.on(() => { state.locale = locale(); if (state.project !== undefined) draw(); });   // the views in the new language

  /** Reads the projects, the open project's tasks and the customers' names. */
  async function load() {
    const seq = ++state.seq;
    state.today = T.todayIn(T.deviceZone());
    const pr = await NS.store.projects();
    const projects = pr.ok ? pr.value : [];
    const project = projects.find((p) => p.id === state.pid) || projects[0] || null;
    const [tk, cu] = await Promise.all([project ? NS.store.tasks(project.id) : { ok: true, value: [] }, S.store.list('customers')]);
    if (seq !== state.seq) return false;
    state.projects = projects;
    state.project = project;
    state.pid = project ? project.id : null;
    // A card whose column was removed shows in the first column.
    state.tasks = (tk.ok ? tk.value : []).map((t) => ({ ...t, column: NS.board.columnOf(project, t) }));
    state.customers = new Map((cu.ok ? cu.value : []).filter((c) => !c.supplier).map((c) => [c.id, c.name]));
    return true;
  }

  /** Draws the bar and the current view from the state (no reading). */
  function draw() {
    const empty = !state.project;
    state.visible = empty ? [] : NS.board.filter(state.tasks, state.filter);
    $('pBar').hidden = empty;
    $('pEmpty').hidden = !empty;
    document.body.dataset.projects = empty ? 'empty' : 'open';
    if (empty) NS.files.mountEmpty();
    for (const v of ['board', 'timeline', 'list']) { const panel = $(`view-${v}`); if (empty) panel.hidden = true; else panel.hidden = v !== state.view; }
    NS.toolbar.render();
    if (empty) return;
    if (state.view === 'board') NS.boardView.render();
    else if (state.view === 'timeline') NS.timeline.render();
    else NS.listView.render();
  }

  async function reload() { if (await load()) draw(); }

  /** Opens a project by id (and remembers it). */
  async function open(id) {
    state.pid = id;
    put(KEY, id);
    await reload();
  }

  const view = (name, mod) => ({
    mount: () => mod().mount(),
    async show() { state.view = name; await first; draw(); },
  });
  NS.views = { board: view('board', () => NS.boardView), timeline: view('timeline', () => NS.timeline), list: view('list', () => NS.listView) };

  function parse(h) {
    const [v] = h.split('/');
    return { view: ['board', 'timeline', 'list'].includes(v) ? v : 'board' };
  }

  g.SlopBiz.router.start({
    ns: NS, app: 'projects', parse,
    mount() {
      NS.toolbar.mount();
      g.SlopUndo.keys(NS.actions.history, () => NS.actions.undo());
      first = (async () => {
        const st = await S.store.get('settings', 'main');
        own = (st.ok && st.value && st.value.locale) || undefined;
        state.locale = locale();
        await load();
      })();
    },
    start: async () => get('slop-projects.view') || 'board',
    after: (t) => put('slop-projects.view', t.view),
    refresh: () => reload(),
  });
  Object.assign(NS.app, { reload, open, draw, load });
})(typeof window !== 'undefined' ? window : globalThis);
