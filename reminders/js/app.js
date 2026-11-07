// Slop Reminders: one timeline of every reminder from Calendar events, To-do tasks and custom reminders, in three groups
// (overdue, today, later). Snooze (5 minutes, 1 hour, tomorrow), dismiss, add a custom reminder, and allow browser
// notifications from a button. The list is read from the store on every change. Exposes window.SlopReminders.ui.
(function (g) {
  'use strict';
  const S = g.SlopData, T = g.SlopTime, NR = g.SlopReminders, E = g.SlopReminderEngine, UI = g.SlopUI, el = UI.el;
  const NS = (g.SlopRemindersUI = g.SlopRemindersUI || {});
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  /** Dates in the language the page is read in; in English, the company's locale (Admin) decides the format. */
  const loc = () => { const l = g.SlopI18n ? g.SlopI18n.get() : 'en'; return l !== 'en' ? l : state.locale; };
  const SOURCE = { event: 'reminders.src.event', task: 'reminders.src.task', custom: 'reminders.src.custom' };
  const GROUPS = [['overdue', 'reminders.group.overdue'], ['today', 'reminders.group.today'], ['later', 'reminders.group.later']];
  const SNOOZE = { '5m': 'reminders.row.snooze_5m', '1h': 'reminders.row.snooze_1h', tomorrow: 'reminders.row.snooze_tomorrow' };
  const state = { zone: T.deviceZone(), locale: undefined, show: 'open', timer: 0 };

  /** A row of the timeline: when, what, where it came from, and its snooze and dismiss controls. */
  function row(it, now) {
    const snoozed = it.snoozedUntil && it.snoozedUntil > now;
    const snooze = el('select', { class: 'snooze', 'aria-label': t('reminders.row.snooze_aria', { title: it.title }), onchange: async (e) => {
      const v = e.target.value; e.target.value = '';
      if (!v) return;
      const r = await E.snooze(it, v);
      UI.toast(r.ok ? t('reminders.row.snoozed_until', { when: T.dateTimeText(NR.snoozeUntil(v, NR.now(), state.zone), state.zone, loc()) }) : r.message);
      } }, el('option', { value: '' }, t('reminders.row.snooze')), NR.SNOOZES.map((s) => el('option', { value: s.id }, SNOOZE[s.id] ? t(SNOOZE[s.id]) : s.label)));
    return el('li', { class: `rm-row src-${it.source}${it.dismissed ? ' is-dismissed' : ''}`, 'data-key': it.key, 'data-source': it.source },
      el('div', { class: 'rm-when' }, T.dateTimeText(it.at, state.zone, loc()), el('span', { class: 'rm-zone' }, state.zone)),
      el('div', { class: 'rm-main' }, el('b', null, it.title || t('reminders.row.untitled')),
      el('span', { class: 'rm-sub' }, [t(SOURCE[it.source] || 'reminders.src.custom'), it.repeat, it.more && t('reminders.row.next_one'), snoozed && t('reminders.row.sub_snoozed', { time: T.timeText(it.snoozedUntil, state.zone, loc()) }), it.firedAt && !snoozed && t('reminders.row.shown')].filter(Boolean).join(' · '))),
      el('div', { class: 'rm-acts' }, snooze,
        el('button', { type: 'button', class: 'btn small', onclick: async () => {   // i18n-ignore: a class name
          const r = await E.dismiss(it);
          if (!r.ok) UI.toast(r.message || t('reminders.row.dismiss_failed'));
          } }, t('reminders.row.dismiss'))));
  }

  /** Draws the timeline: overdue, today and later, each sorted by time. */
  async function render() {
    const now = NR.now();
    const snap = await E.snapshot(now, state.zone);
    if (!snap.ok) { $('rList').replaceChildren(el('p', { class: 'msg', role: 'alert' }, snap.message)); return; }
    const today = T.todayIn(state.zone, now);
    const items = snap.value.items.filter((it) => state.show === 'all' || !it.dismissed);   // dismissed rows show only with 'Show dismissed'
    const counts = { overdue: 0, today: 0, later: 0 };   // counts open (not dismissed) reminders
    const groups = { overdue: [], today: [], later: [] };
    for (const it of items) groups[NR.group(it, today, state.zone)].push(it);
    groups.later = NR.nextOnly(groups.later);   // a repeating event shows its next occurrence once, not every week for a year
    for (const k of Object.keys(groups)) counts[k] = groups[k].filter((it) => !it.dismissed).length;
    const blocks = GROUPS.map(([k, key]) => el('section', { class: 'rm-group', 'aria-label': t(key) },
      el('h3', { class: 'rm-h' }, t(key), el('span', { class: 'side-n' }, String(counts[k]))),
      groups[k].length ? el('ul', { class: 'rm-list', role: 'list' }, groups[k].map((it) => row(it, now)))
        : el('p', { class: 'empty' }, t('reminders.empty.' + k))));
    $('rList').replaceChildren(...blocks);
    $('rPerm').textContent = permissionText();
    $('rNote').textContent = t('reminders.app.note');
  }

  function permissionText() {
    const p = E.permission();
    if (p === 'granted') return t('reminders.perm.on');
    if (p === 'denied') return t('reminders.perm.blocked');
    if (p === 'unsupported') return t('reminders.perm.none');
    return t('reminders.perm.off');
  }

  async function addCustom(e) {
    e.preventDefault();
    const title = $('rTitle').value.trim();
    const day = $('rDate').value, time = $('rTime').value;
    if (!title) { UI.toast(t('reminders.toast.need_name')); return; }
    if (!T.parseDay(day) || !/^\d{2}:\d{2}$/.test(time)) { UI.toast(t('reminders.toast.need_when')); return; }
    const at = T.dayTimeToUtc(day, time, state.zone);
    const r = await E.addCustom(title, at);
    if (!r.ok) { UI.toast(r.message || t('reminders.toast.add_failed')); return; }
    $('rTitle').value = '';
    UI.toast(t('reminders.toast.added'));
  }

  async function allowNotifications() {
    const p = await E.requestPermission();
    UI.toast(t(p === 'granted' ? 'reminders.toast.perm_on' : p === 'denied' ? 'reminders.toast.perm_blocked' : 'reminders.toast.perm_none'));
    render();
  }

  function refreshSoon() { clearTimeout(state.timer); state.timer = setTimeout(render, 40); }

  async function boot() {
    const ready = await S.store.ready();
    if (!ready.ok) { $('rBoot').textContent = t('reminders.err.storage', { why: ready.message }); return; }
    const st = await S.store.get('settings', 'main');
    state.locale = (st.ok && st.value && st.value.locale) || undefined;
    const now = NR.now();
    $('rDate').value = T.todayIn(state.zone, now);
    $('rTime').value = '09:00';
    $('rAdd').addEventListener('submit', addCustom);
    $('rPermBtn').addEventListener('click', allowNotifications);
    $('rShow').addEventListener('change', (e) => { state.show = e.target.checked ? 'all' : 'open'; render(); });
    S.store.subscribe(() => refreshSoon());
    E.start();
    try { if (g.SlopHub) g.SlopHub.register('reminders'); } catch (e) { /* no hub */ }
    // SlopCmd: the assistant's record commands (shared/data/ai-records.js through shared/biz/biz.js), loaded when the AI panel first asks
    if (g.SlopCmd) { g.SlopCmd.init({ app: 'reminders' }); if (g.SlopCmd.provide && g.SlopBiz && g.SlopBiz.assistant) g.SlopCmd.provide({ prepare: () => g.SlopBiz.assistant('reminders') }); }
    await render();
    if (g.SlopI18n) g.SlopI18n.on(render);   // the timeline in the new language
    $('rBoot').hidden = true;
    setInterval(render, 30000);
  }

  NS.app = { boot, render };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
