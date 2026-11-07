// The agenda: a plain list of the next days that have something on them, one heading per day. Each row shows the time in
// the viewer's zone and in the event's own zone, the place and the repeat. This is the view on a phone. Exposes
// window.SlopCal.agenda.
(function (g) {
  'use strict';
  const T = g.SlopTime, UI = g.SlopUI, el = UI.el;
  const NS = (g.SlopCal = g.SlopCal || {});
  const SPAN = 60;   // days listed from the anchor
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  /** One row of the agenda for an item. */
  function row(it, ctx) {
    const when = it.allDay ? t('calendar.views.all_day') : T.timeText(it.start, ctx.zone, ctx.locale);
    const repeat = it.kind === 'event' && it.rec && it.rec.freq && it.rec.freq !== 'none' ? g.SlopRecur.describe(it.rec) : '';
    const zoneLine = it.allDay ? '' : `${NS.model.zoneNote(it)}${it.zone !== ctx.zone ? ` · ${t('calendar.views.there', { time: T.timeText(it.start, it.zone, ctx.locale) })}` : ''}`;
    const sub = [NS.model.kindText(it), it.location, repeat, zoneLine].filter(Boolean).join(' · ');
    return el('div', { class: `ag-row c-${it.color}`, role: 'button', tabindex: '0', 'data-kind': it.kind, 'data-id': it.id, 'data-key': it.key,
      'aria-label': `${it.title}, ${when}` },
      el('div', { class: 'ag-time' }, when),
      el('div', { class: 'ag-main' }, el('b', null, it.title), el('span', { class: 'ag-sub' }, sub)),
      it.kind === 'task' ? el('input', { type: 'checkbox', class: 'chk', 'aria-label': t('calendar.views.mark_done', { title: it.title }),
        onchange: (e) => { e.stopPropagation(); ctx.complete(it); } }) : null);
  }

  /** Draws the agenda from anchor for SPAN days. items must cover that range. */
  function render(root, anchor, ctx) {
    const { items, zone, locale, today } = ctx;
    const sections = [];
    for (let i = 0; i < SPAN; i++) {
      const day = T.addDays(anchor, i);
      const list = NS.model.forDay(items, day, zone);
      if (!list.length) continue;
      const rows = list.map((it) => {
        const r = row(it, ctx);
        r.addEventListener('click', (e) => { if (e.target.classList.contains('chk')) return; ctx.open(it); });
        r.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ctx.open(it); } });
        return r;
      });
      sections.push(el('section', { class: `ag-day${day === today ? ' is-today' : ''}`, 'data-day': day, 'aria-label': T.dayText(day, locale) },
        el('h3', { class: 'ag-h' }, T.dayText(day, locale, { weekday: 'long', day: 'numeric', month: 'long' }), day === today ? el('span', { class: 'ag-today' }, t('calendar.panel.today')) : null),
        rows));
    }
    root.replaceChildren(sections.length ? el('div', { class: 'ag' }, sections)
      : el('p', { class: 'empty' }, t('calendar.views.agenda.empty', { n: SPAN })));
  }

  NS.agenda = { render, SPAN };
})(typeof window !== 'undefined' ? window : globalThis);
