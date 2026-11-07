// Slop Calendar boot: opens the shared store, keeps the period, view, split pair, viewer zone and task layer, draws the
// chosen view from the model, and redraws when the store changes (this tab or another). A drag that moves or resizes an
// event is one undo step (the toast's Undo, or Ctrl+Z). On a phone the week, day and split views show the agenda. Starts
// the reminder engine so due reminders pop up while this tab is open. Exposes window.SlopCal.app.
(function (g) {
  'use strict';
  const S = g.SlopData, T = g.SlopTime, NS = (g.SlopCal = g.SlopCal || {}), UI = g.SlopUI;
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  let ownLocale;   // the company's locale (Admin)
  const KEY = { zone: 'slop-calendar.zone', tasks: 'slop-calendar.tasks', view: 'slop-calendar.view', split: 'slop-calendar.split' };
  const VIEWS = ['year', 'month', 'week', 'day', 'split', 'agenda'];
  const PHONE_AGENDA = ['week', 'day', 'split'];
  const NARROW = g.matchMedia ? g.matchMedia('(max-width: 640px)') : null;
  const get = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } };
  const put = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked: the setting lasts this visit */ } };
  let timer = 0;
  NS.history = g.SlopUndo.create();   // shared/ui/undo.js: one step per drag
  const state = { view: 'month', anchor: '', zone: T.deviceZone(), showTasks: true, locale: undefined, today: '', seq: 0, pair: null };
  NS.state = state;

  const narrow = () => !!(NARROW && NARROW.matches);
  /** The view drawn: on a phone the week, day and split views show the agenda. */
  const effective = () => (narrow() && PHONE_AGENDA.includes(state.view) ? 'agenda' : state.view);
  const titleOf = (view) => NS.periods.titleOf(view, state.anchor, state.locale, state.pair);

  /** Opens an item: an event in the editor, a task in To-do. */
  function open(it) {
    if (it.kind === 'task') { location.href = `../todo/?task=${encodeURIComponent(it.id)}`; return; }
    NS.editor.open({ event: it.rec, zone: state.zone });
  }

  async function complete(it) {
    const r = await g.SlopTaskStore.complete(it.id);
    if (!r.ok) UI.toast(r.message || t('calendar.app.task_failed'));
  }

  /**
   * Saves a drag's change to an event. The values it replaces are kept, so the move is one undo step, and the toast offers
   * Undo for it.
   */
  async function commit(it, change, what) {
    const cur = await S.store.get('events', it.id);
    if (!cur.ok || !cur.value) { UI.toast(t('calendar.app.gone')); return; }
    const before = {};
    for (const k of Object.keys(change)) before[k] = cur.value[k];
    const r = await g.SlopEvents.patch(it.id, change);
    if (!r.ok) { UI.toast(r.message || t('calendar.app.move_failed')); return; }
    NS.history.push(what, () => g.SlopEvents.patch(it.id, before));
    UI.toast(`${what}.`, 6000, { label: t('calendar.app.undo'), run: undo });
  }

  /** Undoes the newest move and says what was undone. */
  async function undo() {
    const r = await NS.history.undo();
    UI.toast(r.ok ? t('calendar.app.undone', { what: r.label }) : r.message);
  }

  function newAt(day, minutes) { NS.editor.open({ day, minutes, zone: state.zone }); }

  /** Draws the current view and the controls. */
  async function render() {
    const seq = ++state.seq;
    state.today = T.todayIn(state.zone);
    // dates in the language the page is read in; in English, the company's locale (Admin) decides the format
    const lang = g.SlopI18n ? g.SlopI18n.get() : 'en';
    state.locale = lang !== 'en' ? lang : ownLocale;
    const view = effective();
    const [a, b] = NS.periods.rangeOf(view, state.anchor, state.pair);
    const r = await NS.model.load(a, b, state.zone, { showTasks: state.showTasks });
    if (seq !== state.seq) return;
    const root = $('cView');
    if (!r.ok) { root.replaceChildren(UI.el('p', { class: 'msg', role: 'alert' }, r.message || t('calendar.app.read_failed'))); return; }
    const ctx = { zone: state.zone, locale: state.locale, items: r.value, today: state.today, open, complete, commit, newAt,
      pair: state.pair, select, openMonth: (d) => setView('month', d),
      dayView: (d) => (state.view === 'split' ? select(d) : setView('day', d)) };
    if (view === 'year') NS.year.render(root, state.anchor, ctx);
    else if (view === 'month') NS.month.render(root, state.anchor, ctx);
    else if (view === 'split') NS.split.render(root, state.anchor, ctx);
    else if (view === 'week' || view === 'day') NS.timegrid.render(root, NS.periods.daysOf(view, state.anchor), ctx);
    else NS.agenda.render(root, state.anchor, ctx);
    $('cTitle').textContent = titleOf(view);
    for (const btn of document.querySelectorAll('[data-view]')) {
      btn.setAttribute('aria-pressed', String(btn.dataset.view === view));
      btn.hidden = narrow() && PHONE_AGENDA.includes(btn.dataset.view);
    }
    $('cSplit').hidden = view !== 'split';
    $('cSplit').value = state.pair.key;
    $('cTasks').checked = state.showTasks;
    if (NS.panel) NS.panel.paint(ctx, state.anchor);   // the day, the choices and New event on the right (ui/panel.js)
    $('cNote').textContent = t('calendar.app.note', { zone: state.zone, label: T.zoneLabel(Date.now(), state.zone) ? ` (${T.zoneLabel(Date.now(), state.zone)})` : '' });
  }
  const refreshSoon = () => { clearTimeout(timer); timer = setTimeout(render, 40); };

  /** Moves the period by one step of the view (a month, a year, a week, a day, the agenda span). dir is -1 or 1. */
  function step(dir) {
    state.anchor = NS.periods.stepAnchor(effective(), state.anchor, dir, state.pair);
    return render();
  }

  function setView(view, day) {
    if (!VIEWS.includes(view)) return;
    state.view = view;
    if (day) state.anchor = day;
    put(KEY.view, view);
    return render();
  }

  /** Makes a day the anchor: the split view's left pane picks it, and the right pane shows it. */
  function select(day) { state.anchor = day; return render(); }

  function setSplit(key) {
    state.pair = NS.periods.pairOf(key);
    put(KEY.split, state.pair.key);
    return render();
  }

  function goToday() { state.anchor = T.todayIn(state.zone); return render(); }

  function setZone(zone) {
    if (!T.isZone(zone)) return;
    state.zone = zone;
    put(KEY.zone, zone);
    return render();
  }

  function toggleTasks(on) {
    state.showTasks = on === undefined ? !state.showTasks : !!on;
    put(KEY.tasks, state.showTasks ? '1' : '0');
    return render();
  }

  /** The zone list: every zone the browser knows, with the viewer's zone first. */
  function fillZones() {
    const sel = $('cZone');
    sel.replaceChildren(...NS.editor.zoneChoices(state.zone).map((z) => UI.el('option', { value: z, selected: z === state.zone }, z)));
  }

  async function importIcs() {
    const n = await NS.ics.importIcs(state.zone, state.locale, () => refreshSoon());
    if (n) refreshSoon();
  }

  function configMenu(e) {
    const items = g.SlopConfigDialog ? g.SlopConfigDialog.menuItems({ app: 'calendar' }) : [];
    const r = e.currentTarget.getBoundingClientRect();
    UI.menu(items, r.left, r.bottom + 4);
  }

  function wire() {
    for (const btn of document.querySelectorAll('[data-view]')) btn.addEventListener('click', () => setView(btn.dataset.view));
    $('cPrev').addEventListener('click', () => step(-1));
    $('cNext').addEventListener('click', () => step(1));
    $('cToday').addEventListener('click', goToday);
    $('cNew').addEventListener('click', () => newAt(state.anchor, 9 * 60));
    $('cSplit').addEventListener('change', (e) => setSplit(e.target.value));
    $('cTasks').addEventListener('change', (e) => toggleTasks(e.target.checked));
    $('cZone').addEventListener('change', (e) => setZone(e.target.value));
    $('cExport').addEventListener('click', () => NS.ics.exportIcs());
    $('cImport').addEventListener('click', importIcs);
    $('cConfig').addEventListener('click', configMenu);
    g.SlopUndo.keys(NS.history, undo);   // Ctrl+Z (Cmd+Z) undoes the last move, unless a text field or a dialog has the focus
    if (NARROW && NARROW.addEventListener) NARROW.addEventListener('change', () => render());
    addEventListener('hashchange', () => { const h = location.hash.slice(1); if (VIEWS.includes(h)) setView(h); });
  }

  async function boot() {
    const ready = await S.store.ready();
    if (!ready.ok) { $('cBoot').textContent = t('calendar.app.storage', { why: ready.message }); return; }
    const st = await S.store.get('settings', 'main');
    ownLocale = (st.ok && st.value && st.value.locale) || undefined;
    const zone = get(KEY.zone, '');
    if (T.isZone(zone)) state.zone = zone;
    state.showTasks = get(KEY.tasks, '1') !== '0';
    state.pair = NS.periods.pairOf(get(KEY.split, ''));
    const v = location.hash.slice(1) || get(KEY.view, narrow() ? 'agenda' : 'month');
    state.view = VIEWS.includes(v) ? v : 'month';
    state.anchor = T.todayIn(state.zone);
    fillZones();
    wire();
    if (NS.panel) NS.panel.mount();
    NS.commands.init();
    S.store.subscribe(() => refreshSoon());
    if (g.SlopReminderEngine) g.SlopReminderEngine.start();
    try { if (g.SlopHub) g.SlopHub.register('calendar'); } catch (e) { /* no hub: the app still works */ }
    await render();
    if (g.SlopI18n) g.SlopI18n.on(() => render());   // the views and the panel in the new language
    $('cBoot').hidden = true;
  }

  NS.app = { boot, render, step, setView, select, setSplit, goToday, toggleTasks, setZone, newAt, importIcs, open, undo };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
