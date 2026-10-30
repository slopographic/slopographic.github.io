// The month grid: six weeks starting on Monday, up to three items a day with a "more" link to the day view. A click on an
// empty part of a day adds an event there, or, in the split view (ctx.selectDay), makes that day the one shown beside it.
// An event chip dragged over another day moves there: all-day events shift their days, timed events keep their times.
// The day under the pointer is highlighted and named while dragging. Exposes window.SlopCal.month.
(function (g) {
  'use strict';
  const T = g.SlopTime, UI = g.SlopUI, el = UI.el;
  const tr = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const NS = (g.SlopCal = g.SlopCal || {});
  const SHOW = 3;

  /** The 42 days shown for the month of anchor, and the Monday that starts the grid. */
  function gridDays(anchor) {
    const first = `${anchor.slice(0, 8)}01`;
    const start = T.addDays(first, -((T.dowOf(first) + 6) % 7));
    return Array.from({ length: 42 }, (_, i) => T.addDays(start, i));
  }

  /** Draws the month of anchor into root. ctx: { zone, locale, items, today, open, complete, commit, newAt, dayView, selectDay? }. */
  function render(root, anchor, ctx) {
    const { zone, locale, items, today } = ctx;
    const days = gridDays(anchor);
    const month = anchor.slice(0, 7);
    const names = days.slice(0, 7).map((d) => el('div', { class: 'mo-dow', role: 'columnheader' }, T.dayText(d, locale, { weekday: 'short' })));
    const cells = days.map((d) => cell(d, { ...ctx, month, zone, items, today }));
    root.replaceChildren(el('div', { class: 'mo', role: 'grid', 'aria-label': tr('calendar.views.month_aria') }, el('div', { class: 'mo-head', role: 'row' }, names), el('div', { class: 'mo-days' }, cells)));
  }

  function cell(day, ctx) {
    const { zone, items, today, month } = ctx;
    const list = NS.model.forDay(items, day, zone);
    const shown = list.slice(0, SHOW);
    const more = list.length - shown.length;
    const node = el('div', { class: `mo-cell${day === today ? ' is-today' : ''}${day.slice(0, 7) !== month ? ' is-other' : ''}`, 'data-day': day, role: 'gridcell' },
      el('div', { class: 'mo-num' }, String(T.parseDay(day).d)),
      shown.map((it) => NS.chip(it, { ...ctx, drag: it.kind === 'event' ? (_it, e, n) => dragChip(e, n, it, ctx) : null }, 'mo-chip')),
      more > 0 ? el('button', { type: 'button', class: 'mo-more', onclick: (e) => { e.stopPropagation(); ctx.dayView(day); } }, `${more} more`) : null);
    node.addEventListener('click', (e) => { if (e.target === node || e.target.classList.contains('mo-num')) pickDay(day, ctx); });
    return node;
  }

  /** A click on an empty part of a day: in the split view it picks the day, elsewhere it adds an event at nine. */
  function pickDay(day, ctx) {
    if (ctx.selectDay) ctx.selectDay(day);
    else ctx.newAt(day, 9 * 60);
  }

  /** The viewer day an item starts on (all-day items keep their days). */
  const fromDay = (it, zone) => (it.allDay ? it.startDay : T.parts(it.start, zone).day);

  /** The cell under a viewport point, or null. */
  function cellAt(cells, x, y) {
    return cells.find((c) => { const r = c.getBoundingClientRect(); return x >= r.left && x < r.right && y >= r.top && y < r.bottom; }) || null;
  }

  /** The label while dragging: the day, and the new time for a timed event. */
  function preview(it, day, zone, locale) {
    const when = T.dayText(day, locale, { weekday: 'short', day: 'numeric', month: 'short' });
    if (it.allDay) return when;
    const res = NS.drag.timedMove(it, T.dayDiff(fromDay(it, zone), day), undefined, zone);
    return `${when} · ${T.timeText((res || it).start, zone, locale)}`;
  }

  /** A press on a chip, and a release over another day: the event moves to that day. */
  function dragChip(e, node, it, ctx) {
    const { zone, locale } = ctx;
    const cells = [...node.closest('.mo-days').querySelectorAll('.mo-cell')];
    NS.drag.track(e, node, {
      move(p) {
        const cell = cellAt(cells, p.x, p.y);
        cells.forEach((c) => c.classList.toggle('is-drop', c === cell));
        NS.drag.tip(preview(it, cell ? cell.dataset.day : fromDay(it, zone), zone, locale), p.x, p.y);
      },
      drop(p) {
        const cell = cellAt(cells, p.x, p.y);
        if (!cell) return;
        const n = T.dayDiff(fromDay(it, zone), cell.dataset.day);
        const res = it.allDay ? NS.drag.dayMove(it, n) : NS.drag.timedMove(it, n, undefined, zone);
        if (res) ctx.commit(it, res.change, tr('calendar.views.moved', { title: it.title }));
      },
      end() { cells.forEach((c) => c.classList.remove('is-drop')); NS.drag.tipHide(); },
    });
  }

  NS.month = { render, gridDays };
})(typeof window !== 'undefined' ? window : globalThis);
