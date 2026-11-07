// The periods the calendar views show: the viewer days a view needs, its title, and how far Previous and Next move. The
// split view has a pair of panes (a left month or week, a right day or week) that both follow one anchor day. Pure
// functions; nothing is drawn here. Exposes window.SlopCal.periods.
(function (g) {
  'use strict';
  const T = g.SlopTime;
  const NS = (g.SlopCal = g.SlopCal || {});
  const PAIRS = {
    'month-day': { left: 'month', right: 'day' },
    'month-week': { left: 'month', right: 'week' },
    'week-day': { left: 'week', right: 'day' },
  };
  const DEFAULT_PAIR = 'month-day';

  /** The pair for a key such as 'month-day'; unknown keys give the default pair. */
  const pairOf = (key) => PAIRS[key] ? { key, ...PAIRS[key] } : { key: DEFAULT_PAIR, ...PAIRS[DEFAULT_PAIR] };

  /** The seven days (Monday first) of the week that holds day. */
  const weekDays = (day) => { const s = T.weekStart(day); return Array.from({ length: 7 }, (_, i) => T.addDays(s, i)); };

  /** The days a single-pane view draws: a week's seven, a day's one. */
  function daysOf(view, anchor) {
    if (view === 'week') return weekDays(anchor);
    if (view === 'day') return [anchor];
    return [];
  }

  /** First and last viewer day a view needs. */
  function rangeOf(view, anchor, pair = pairOf()) {
    if (view === 'year') { const y = anchor.slice(0, 4); return [`${y}-01-01`, `${y}-12-31`]; }
    if (view === 'month') { const days = NS.month.gridDays(anchor); return [days[0], days[41]]; }
    if (view === 'week') { const d = weekDays(anchor); return [d[0], d[6]]; }
    if (view === 'day') return [anchor, anchor];
    if (view === 'split') {
      const a = rangeOf(pair.left, anchor), b = rangeOf(pair.right, anchor);
      return [a[0] < b[0] ? a[0] : b[0], a[1] > b[1] ? a[1] : b[1]];
    }
    return [anchor, T.addDays(anchor, NS.agenda.SPAN - 1)];
  }

  /** "3 to 9 March 2026" within a month, "28 Dec 2026 to 3 Jan 2027" across months. */
  function weekTitle(a, b, loc) {
    const f = (day, opts) => T.dayText(day, loc, opts);
    const tr = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
    if (a.slice(0, 7) === b.slice(0, 7)) return tr('calendar.views.week_range', { from: f(a, { day: 'numeric' }), to: f(b, { day: 'numeric', month: 'long', year: 'numeric' }) });
    const sameYear = a.slice(0, 4) === b.slice(0, 4);
    return tr('calendar.views.week_range', { from: f(a, { day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' }), to: f(b, { day: 'numeric', month: 'short', year: 'numeric' }) });
  }

  /** The title of one view. Split shows the left and right periods together. */
  function titleOf(view, anchor, loc, pair = pairOf()) {
    if (view === 'year') return anchor.slice(0, 4);
    if (view === 'month') return T.dayText(anchor, loc, { month: 'long', year: 'numeric' });
    if (view === 'week') { const d = weekDays(anchor); return weekTitle(d[0], d[6], loc); }
    if (view === 'day') return T.dayText(anchor, loc, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    if (view === 'split') return `${titleOf(pair.left, anchor, loc)} · ${titleOf(pair.right, anchor, loc)}`;
    return g.SlopI18n ? g.SlopI18n.t('calendar.views.agenda.title', { n: NS.agenda.SPAN, day: T.dayText(anchor, loc, { day: 'numeric', month: 'short' }) }) : `${NS.agenda.SPAN}`;
  }

  /** The anchor after one Previous (dir -1) or Next (dir 1) step in a view. */
  function stepAnchor(view, anchor, dir, pair = pairOf()) {
    if (view === 'year') return `${Number(anchor.slice(0, 4)) + dir}-${anchor.slice(5, 7)}-01`;
    if (view === 'month') { const first = `${anchor.slice(0, 8)}01`; return `${T.addDays(first, dir > 0 ? 32 : -1).slice(0, 8)}01`; }
    const n = view === 'week' ? 7 : view === 'split' ? (pair.right === 'week' ? 7 : 1) : view === 'day' ? 1 : NS.agenda.SPAN;
    return T.addDays(anchor, dir * n);
  }

  NS.periods = { PAIRS, pairOf, weekDays, daysOf, rangeOf, titleOf, stepAnchor };
})(typeof window !== 'undefined' ? window : globalThis);
