// The follow-up list: customers with a follow-up date, overdue first, then today, then later.
(function (g) {
  'use strict';
  const NS = (g.SlopCrm = g.SlopCrm || {});
  const UI = g.SlopUI;
  const el = UI.el;
  const tr = (k, v) => NS.tr(k, v);   // the string tables (crm/i18n)
  const $ = (id) => document.getElementById(id);

  function row(c, group, loc) {
    return el('li', { class: `row ${group}`, role: 'listitem' },
      el('button', { type: 'button', class: 'row-open', onclick: () => NS.app.show('customer', c.id) },
        el('b', null, c.name), el('span', { class: 'row-sub' }, group === 'overdue' ? tr('crm.fu.overdue', { date: NS.util.date(c.followUp, loc) }) : NS.util.date(c.followUp, loc))),
      el('span', { class: `stage s-${c.stage}` }, NS.stageLabel(c.stage)),
      el('button', { type: 'button', class: 'btn small', onclick: async () => {   // i18n-ignore: class names
        const r = await NS.customers.setFollowUp(c.id, null);
        UI.toast(r.ok ? tr('crm.fu.cleared') : NS.util.refusal(r));
        } }, tr('crm.fu.done')));
  }

  /** Calendar events (repeats expanded, next 60 days) and open to-do tasks linked to a customer, soonest first. */
  async function linkedRows(customers) {
    const S = g.SlopData, T = g.SlopTime, RR = g.SlopRecur, tz = T.deviceZone(), loc = NS.state.settings.locale;
    const [ev, tk] = await Promise.all([S.store.list('events'), S.store.list('tasks')]);
    if (!ev.ok || !tk.ok) return [];
    const names = new Map(customers.map((c) => [c.id, c.name]));
    const today = T.todayIn(tz);
    const from = T.startOfDay(today, tz), to = T.startOfDay(T.addDays(today, 60), tz);
    const out = [];
    for (const e of ev.value) {
      if (!e.customerId || !names.has(e.customerId)) continue;
      for (const o of RR.occurrences(e, from, to, tz).slice(0, 5)) {
        const at = o.allDay ? T.startOfDay(o.startDay, tz) : o.start;
        out.push({ at, name: names.get(e.customerId), text: e.title, when: o.allDay ? NS.util.date(o.startDay, loc) : T.dateTimeText(o.start, tz, loc), kind: e.kind || 'event' });
      }
    }
    for (const t of tk.value) {
      if (t.done || !t.customerId || !names.has(t.customerId)) continue;
      const at = t.due ? T.dayTimeToUtc(t.due, t.dueTime || '09:00', t.tz || tz) : Infinity;
      out.push({ at, name: names.get(t.customerId), text: t.title, when: t.due ? NS.util.date(t.due, loc) : tr('crm.fu.no_due'), kind: 'task' });
    }
    return out.sort((a, b) => a.at - b.at);
  }

  function linkedRow(r) {
    const kind = tr({ call: 'crm.fu.call', meeting: 'crm.fu.meeting', event: 'crm.fu.event', task: 'crm.fu.task' }[r.kind] || 'crm.fu.event');
    return el('li', { class: 'row', role: 'listitem' }, el('span', { class: 'row-open' }, el('b', null, r.name), el('span', { class: 'row-sub' }, `${kind} · ${r.text} · ${r.when}`)));
  }

  async function render() {
    const r = await NS.customers.load();
    if (!r.ok) { $('fRows').replaceChildren(el('p', { class: 'msg', role: 'alert' }, NS.util.refusal(r))); return; }
    const today = NS.util.today();
    const due = r.value.filter((c) => c.followUp).sort((a, b) => (a.followUp < b.followUp ? -1 : a.followUp > b.followUp ? 1 : 0));
    const group = (c) => (c.followUp < today ? 'overdue' : c.followUp === today ? 'today' : 'later');
    const loc = NS.state.settings.locale;
    $('fRows').replaceChildren(...due.map((c) => row(c, group(c), loc)));
    $('fEmpty').hidden = due.length > 0;
    const extra = await linkedRows(r.value);
    $('fLinkedRows').replaceChildren(...extra.map(linkedRow));
    $('fLinkedEmpty').hidden = extra.length > 0;
    $('fSummary').textContent = tr('crm.fu.summary', { overdue: String(due.filter((c) => group(c) === 'overdue').length), today: String(due.filter((c) => group(c) === 'today').length) });
  }

  NS.views = NS.views || {};
  NS.views.followups = { render };
})(typeof window !== 'undefined' ? window : globalThis);
