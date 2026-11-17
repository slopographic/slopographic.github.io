// The week and day time grid: an all-day strip, hour lines, timed blocks in columns, a now line on today, and a click on
// an empty slot to add an event there. A block is dragged to another time (and, in a week, another day). Moves land on the
// half hour and the new time shows while dragging. The bottom edge resizes it. Days are the viewer's days. A column
// heading is a click target when ctx.selectDay is set (the split view). Exposes window.SlopCal.timegrid.
(function (g) {
  'use strict';
  const T = g.SlopTime, UI = g.SlopUI, el = UI.el;
  const tr = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const NS = (g.SlopCal = g.SlopCal || {});
  const HOUR = 48;   // pixels per hour
  const HOURS = 24, DAY_MIN = 1440;
  const PX_MIN = HOUR / 60;

  /** Draws the grid for days (YYYY-MM-DD) into root. ctx: { zone, locale, items, today, open, complete, commit, newAt, selectDay? }. */
  function render(root, days, ctx) {
    const { zone, locale, items, today, selectDay } = ctx;
    const allDay = items.filter((it) => it.allDay);
    const timed = items.filter((it) => !it.allDay);
    const head = el('div', { class: 'tg-head', style: `--cols:${days.length}` }, el('div', { class: 'tg-gut' }),
      days.map((d) => el('div', { class: `tg-dh${d === today ? ' is-today' : ''}${selectDay ? ' is-pick' : ''}`, 'data-day': d,
        onclick: selectDay ? () => selectDay(d) : null },
      T.dayText(d, locale, { weekday: 'short', day: 'numeric', month: 'short' }))));
    const strip = el('div', { class: 'tg-allday', style: `--cols:${days.length}` }, el('div', { class: 'tg-gut' }, tr('calendar.views.all_day')),
      days.map((d) => el('div', { class: 'tg-ad', 'data-day': d }, NS.model.forDay(allDay, d, zone).map((it) => NS.chip(it, ctx)))));
    const labels = el('div', { class: 'tg-gut tg-hours', style: `height:${HOURS * HOUR}px` },
      Array.from({ length: HOURS }, (_, h) => el('span', { class: 'tg-hour', style: `top:${h * HOUR}px` },
        T.timeText(Date.UTC(2026, 0, 1, h, 0), 'UTC', locale))));
    const cols = days.map((d) => column(d, timed, ctx));
    const body = el('div', { class: 'tg-body', style: `--cols:${days.length}` }, labels, cols);
    root.replaceChildren(el('div', { class: 'tg', role: 'region', 'aria-label': tr('calendar.views.grid_aria') }, head, strip, el('div', { class: 'tg-scroll' }, body)));
    const now = root.querySelector('.tg-col.is-today');
    if (now) {
      const line = el('div', { class: 'tg-now', 'aria-hidden': 'true' });
      now.append(line);
      placeNow(line, zone);
    }
  }

  function placeNow(line, zone) {
    const day = line.parentElement.dataset.day;
    const start = T.startOfDay(day, zone), len = T.startOfDay(T.addDays(day, 1), zone) - start;
    line.style.top = `${((Date.now() - start) / len) * HOURS * HOUR}px`;
  }

  /** One day column: hour lines (CSS), timed blocks laid out side by side, and a click to add at that time. */
  function column(day, timed, ctx) {
    const { zone } = ctx;
    const s = T.startOfDay(day, zone), e = T.startOfDay(T.addDays(day, 1), zone), len = e - s;
    const wrapped = NS.model.forDay(timed, day, zone).map((it) => ({ start: Math.max(it.start, s), end: Math.min(it.end, e), it }));
    const laid = NS.columns(wrapped);
    const col = el('div', { class: `tg-col${day === ctx.today ? ' is-today' : ''}`, 'data-day': day, style: `height:${HOURS * HOUR}px` });
    col.addEventListener('click', (ev) => {
      if (ev.target !== col) return;
      const mins = Math.floor((ev.offsetY / HOUR) * 60 / 30) * 30;
      ctx.newAt(day, mins);
    });
    for (const { item, col: c, cols } of laid) {
      const it = item.it;
      const top = ((item.start - s) / len) * HOURS * HOUR;
      const h = Math.max(18, ((item.end - item.start) / len) * HOURS * HOUR);
      const block = NS.chip(it, { ...ctx, drag: it.kind === 'event' ? (_item, ev, node) => startDrag(ev, node, it, 'move', ctx) : null }, 'tg-block');
      Object.assign(block.style, { top: `${top}px`, height: `${h}px`, left: `${(c / cols) * 100}%`, width: `calc(${100 / cols}% - 3px)` });
      if (it.kind === 'event') {
        const handle = el('div', { class: 'rz', 'aria-hidden': 'true' });
        handle.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); startDrag(ev, block, it, 'resize', ctx); });
        block.append(handle);
      }
      col.append(block);
    }
    return col;
  }

  function startDrag(ev, node, it, mode, ctx) {
    if (mode === 'resize') resizeDrag(ev, node, it, ctx);
    else moveDrag(ev, node, it, ctx);
  }

  /** The index of the column under x, or fallback when x is outside the grid. */
  function colAt(cols, x, fallback) {
    const i = cols.findIndex((c) => { const r = c.getBoundingClientRect(); return x >= r.left && x < r.right; });
    return i < 0 ? fallback : i;
  }

  const timeRange = (a, b, zone, locale) => `${T.timeText(a, zone, locale)}–${T.timeText(b, zone, locale)}`;

  /** Drag a block to another time, and to another day column in a week. The drop is saved as a change to the record. */
  function moveDrag(e, block, it, ctx) {
    const { zone, locale } = ctx;
    const cols = [...block.closest('.tg-body').querySelectorAll('.tg-col')];
    const from = cols.indexOf(block.parentElement);
    const origMin = NS.drag.minuteOf(it, zone), snap = NS.drag.MOVE_SNAP;
    const plan = (p) => {
      const at = colAt(cols, p.x, from);
      const dayShift = T.dayDiff(cols[from].dataset.day, cols[at].dataset.day);
      const dyMin = p.dy / PX_MIN;
      if (!dayShift && Math.abs(dyMin) < snap / 2) return null;
      const toMin = Math.max(0, Math.min(DAY_MIN - snap, Math.round((origMin + dyMin) / snap) * snap));
      const res = NS.drag.timedMove(it, dayShift, toMin, zone);
      return { res, toMin, day: cols[at].dataset.day };
    };
    NS.drag.track(e, block, {
      move(p) {
        const r = plan(p);
        block.style.transform = `translate(${p.dx}px, ${r ? (r.toMin - origMin) * PX_MIN : 0}px)`;
        const text = r && r.res
          ? `${T.dayText(r.day, locale, { weekday: 'short', day: 'numeric', month: 'short' })} · ${timeRange(r.res.start, r.res.end, zone, locale)}`
          : timeRange(it.start, it.end, zone, locale);
        NS.drag.tip(text, p.x, p.y);
      },
      drop(p) {
        const r = plan(p);
        if (r && r.res) ctx.commit(it, r.res.change, tr('calendar.views.moved', { title: it.title }));
      },
      end() { block.style.transform = ''; NS.drag.tipHide(); },
    });
  }

  /** Drag the bottom edge to change the end time, in 15-minute steps. */
  function resizeDrag(e, block, it, ctx) {
    const baseH = block.offsetHeight;
    NS.drag.track(e, block, {
      move(p) {
        const r = NS.drag.resizeEnd(it, p.dy / PX_MIN);
        block.style.height = `${Math.max(NS.drag.RESIZE_SNAP * PX_MIN, baseH + (r ? (r.end - it.end) / 60000 : 0) * PX_MIN)}px`;
        NS.drag.tip(tr('calendar.views.ends', { time: T.timeText(r ? r.end : it.end, ctx.zone, ctx.locale) }), p.x, p.y);
      },
      drop(p) {
        const r = NS.drag.resizeEnd(it, p.dy / PX_MIN);
        if (r) ctx.commit(it, r.change, tr('calendar.views.resized', { title: it.title }));
      },
      end() { block.style.height = ''; NS.drag.tipHide(); },
    });
  }

  NS.timegrid = { render, HOUR };
})(typeof window !== 'undefined' ? window : globalThis);
