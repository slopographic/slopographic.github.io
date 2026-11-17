// The year: twelve mini months, and a dot on each day that has something on it. A click on a month's name, or on a day,
// opens that month in the month view. Exposes window.SlopCal.year.
(function (g) {
  'use strict';
  const T = g.SlopTime, UI = g.SlopUI, el = UI.el;
  const NS = (g.SlopCal = g.SlopCal || {});
  const pad = (n) => String(n).padStart(2, '0');

  /** The days of the year (YYYY-MM-DD, viewer zone) on which some item falls. */
  function busyDays(items, zone, first, last) {
    const set = new Set();
    for (const it of items) {
      const a = it.allDay ? it.startDay : T.parts(it.start, zone).day;
      const b = it.allDay ? it.endDay : T.parts(Math.max(it.start, it.end - 1), zone).day;
      for (let d = a < first ? first : a, end = b > last ? last : b; d <= end; d = T.addDays(d, 1)) set.add(d);
    }
    return set;
  }

  /** Draws the year of anchor into root. ctx: { zone, locale, items, today, openMonth(day) }. */
  function render(root, anchor, ctx) {
    const y = anchor.slice(0, 4);
    const busy = busyDays(ctx.items, ctx.zone, `${y}-01-01`, `${y}-12-31`);
    const months = Array.from({ length: 12 }, (_, i) => mini(Number(y), i + 1, busy, ctx));
    root.replaceChildren(el('div', { class: 'yr', role: 'region', 'aria-label': g.SlopI18n ? g.SlopI18n.t('calendar.views.year_aria', { year: String(y) }) : String(y) }, months));
  }

  /** One month: its name, a weekday row and the days, Monday first. */
  function mini(y, m, busy, ctx) {
    const { locale, today } = ctx;
    const first = `${y}-${pad(m)}-01`;
    const lead = (T.dowOf(first) + 6) % 7;
    const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const monday = T.addDays(first, -lead);
    const heads = Array.from({ length: 7 }, (_, i) => el('span', { class: 'yr-dow', 'aria-hidden': 'true' }, T.dayText(T.addDays(monday, i), locale, { weekday: 'narrow' })));
    const days = Array.from({ length: count }, (_, i) => {
      const day = `${y}-${pad(m)}-${pad(i + 1)}`;
      const has = busy.has(day);
      const label = T.dayText(day, locale, { weekday: 'long', day: 'numeric', month: 'long' }) + (has ? ', has events' : '');
      return el('button', { type: 'button', class: `yr-d${day === today ? ' is-today' : ''}${has ? ' has-dot' : ''}`, 'data-day': day,
        'aria-label': label, title: label, onclick: () => ctx.openMonth(day) }, String(i + 1));
    });
    const blanks = Array.from({ length: lead }, () => el('span', { class: 'yr-blank', 'aria-hidden': 'true' }));
    return el('section', { class: 'yr-m', 'data-month': first.slice(0, 7) },
      el('h3', { class: 'yr-h' }, el('button', { type: 'button', class: 'yr-name', onclick: () => ctx.openMonth(first) },
        T.dayText(first, locale, { month: 'long' }))),
      el('div', { class: 'yr-grid' }, heads, blanks, days));
  }

  NS.year = { render, busyDays };
})(typeof window !== 'undefined' ? window : globalThis);
