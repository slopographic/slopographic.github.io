// Slop Projects timeline geometry, with no DOM: the days the timeline shows, the zoom (pixels per day), where a task's bar
// sits, what a drag of some pixels does to its dates (move, or resize either end; a task is at least one day long), the
// scale's labels and the path of a dependency arrow. Days are YYYY-MM-DD (SlopTime). Exposes window.SlopProjects.bars.
(function (g) {
  'use strict';
  const T = g.SlopTime;
  const NS = (g.SlopProjects = g.SlopProjects || {});
  const ZOOMS = { day: 36, week: 16, month: 5 };
  const MIN_DAYS = { day: 21, week: 56, month: 180 };

  const ppdOf = (zoom) => ZOOMS[zoom] || ZOOMS.day;

  /**
   * The first and last day shown: from a few days before the earliest date (project, tasks, today) to a few after the
   * latest, starting on a Monday, and at least a few weeks long for the zoom.
   */
  function span(project, tasks, today, zoom = 'day') {
    const days = [today];
    if (project && project.start) days.push(project.start);
    if (project && project.end) days.push(project.end);
    for (const t of tasks) { if (t.start) days.push(t.start, t.end); if (t.due) days.push(t.due); }
    days.sort();
    const from = T.weekStart(T.addDays(days[0], -3));
    let to = T.addDays(days[days.length - 1], 7);
    const min = MIN_DAYS[zoom] || MIN_DAYS.day;
    if (T.dayDiff(from, to) < min) to = T.addDays(from, min);
    return { from, to, days: T.dayDiff(from, to) + 1 };
  }

  /** The left edge of a day, in pixels from the first day shown. */
  const xOf = (from, day, ppd) => T.dayDiff(from, day) * ppd;
  /** The day under a pixel offset. */
  const dayAt = (from, x, ppd) => T.addDays(from, Math.floor(x / ppd));

  /** A task's bar: { x, w } in pixels (end day included), or null when it has no dates. */
  function box(from, task, ppd) {
    if (!task.start || !task.end) return null;
    return { x: xOf(from, task.start, ppd), w: (T.dayDiff(task.start, task.end) + 1) * ppd };
  }

  /** Whole days for a drag of dx pixels. */
  const daysFor = (dx, ppd) => Math.round(dx / ppd);

  /**
   * The dates after a drag of `days`: 'move' shifts both, 'start' and 'end' move that end only, and never past the
   * other end (a task is at least one day). Returns { start, end }.
   */
  function drag(mode, task, days) {
    if (mode === 'move') return { start: T.addDays(task.start, days), end: T.addDays(task.end, days) };
    if (mode === 'start') { const s = T.addDays(task.start, days); return { start: s > task.end ? task.end : s, end: task.end }; }
    const e = T.addDays(task.end, days);
    return { start: task.start, end: e < task.start ? task.start : e };
  }

  /**
   * The scale's labels: { top: [{ x, w, text }], bottom: [{ x, w, text, weekend?, today? }] }. Day zoom: months over
   * days; week zoom: months over weeks (the Monday's date); month zoom: years over months.
   */
  function ticks(sp, zoom, today, locale) {
    const ppd = ppdOf(zoom), top = [], bottom = [];
    const label = (day, opts) => T.dayText(day, locale, opts);
    const push = (list, start, endExcl, text, extra) => list.push({ x: xOf(sp.from, start, ppd), w: T.dayDiff(start, endExcl) * ppd, text, ...extra });
    const last = T.addDays(sp.to, 1);
    const monthStart = (d) => d.slice(0, 8) + '01';
    const nextMonth = (d) => { const [y, m] = d.split('-').map(Number); return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`; };
    const clip = (d) => (d > last ? last : d);
    if (zoom === 'month') {
      for (let d = sp.from; d < last; d = clip(`${Number(d.slice(0, 4)) + 1}-01-01`)) push(top, d, clip(`${Number(d.slice(0, 4)) + 1}-01-01`), d.slice(0, 4));
      for (let d = sp.from; d < last; d = clip(nextMonth(monthStart(d)))) push(bottom, d, clip(nextMonth(monthStart(d))), label(d, { month: 'short' }));
      return { top, bottom };
    }
    for (let d = sp.from; d < last; d = clip(nextMonth(monthStart(d)))) push(top, d, clip(nextMonth(monthStart(d))), label(d, { month: 'long', year: 'numeric' }));
    if (zoom === 'week') {
      for (let d = sp.from; d < last; d = clip(T.addDays(d, 7))) push(bottom, d, clip(T.addDays(d, 7)), label(d, { day: 'numeric', month: 'short' }), { today: today >= d && today < T.addDays(d, 7) });
      return { top, bottom };
    }
    for (let d = sp.from; d < last; d = T.addDays(d, 1)) {
      const dow = T.dowOf(d);
      push(bottom, d, T.addDays(d, 1), String(Number(d.slice(8))), { weekend: dow === 0 || dow === 6, today: d === today });
    }
    return { top, bottom };
  }

  /**
   * The SVG path of an arrow from the end of bar a (row ra) to the start of bar b (row rb); rows are rowH tall. When b
   * starts after a ends the arrow runs right, down and right; otherwise it loops back between the rows.
   */
  function arrow(a, ra, b, rb, rowH) {
    const x1 = a.x + a.w, y1 = ra * rowH + rowH / 2, x2 = b.x, y2 = rb * rowH + rowH / 2, gap = 8;
    if (x2 - x1 >= gap * 2) {
      const mid = x1 + gap;
      return `M${x1} ${y1}H${mid}V${y2}H${x2}`;
    }
    const between = (rb > ra ? rb : ra) * rowH;
    return `M${x1} ${y1}H${x1 + gap}V${between}H${x2 - gap}V${y2}H${x2}`;
  }

  NS.bars = { ZOOMS, ppdOf, span, xOf, dayAt, box, daysFor, drag, ticks, arrow };
})(typeof window !== 'undefined' ? window : globalThis);
