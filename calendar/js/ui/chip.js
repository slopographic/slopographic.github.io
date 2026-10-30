// The small block that stands for one calendar item in the month, agenda and time views. Events open the editor. Tasks
// show a checkbox that completes them through the shared store (the To-do app sees the same change). Also the column
// layout used by the time grid: overlapping items sit side by side.
(function (g) {
  'use strict';
  const T = g.SlopTime, UI = g.SlopUI, el = UI.el;
  const NS = (g.SlopCal = g.SlopCal || {});

  /**
   * One chip. ctx: { zone, locale, open(item), complete(item), drag?(item, event) }. Tasks get a checkbox; the rest of the
   * chip opens the item. data-kind, data-id and data-key let the page and the tests find it.
   */
  function chip(it, ctx, extra = '') {
    const time = it.allDay ? '' : `${T.timeText(it.start, ctx.zone, ctx.locale)} `;
    const isTask = it.kind === 'task';
    const node = el('div', {
      class: `chip c-${it.color} ${isTask ? 'is-task' : 'is-event'} ${extra}`.trim(), role: 'button', tabindex: '0',
      'data-kind': it.kind, 'data-id': it.id, 'data-key': it.key, 'data-day': it.startDay,
      title: `${it.title}${it.allDay ? '' : ` · ${NS.model.timeLabel(it, ctx.zone, ctx.locale)}`}${it.zone && it.zone !== ctx.zone ? ` · ${NS.model.zoneNote(it)}` : ''}`,
      'aria-label': `${it.title}${it.allDay ? ', all day' : `, ${NS.model.timeLabel(it, ctx.zone, ctx.locale)}`}`,
    },
      isTask ? el('input', { type: 'checkbox', class: 'chk', 'aria-label': g.SlopI18n ? g.SlopI18n.t('calendar.views.mark_done', { title: it.title }) : it.title, onclick: (e) => e.stopPropagation(),
        onchange: (e) => { e.stopPropagation(); ctx.complete(it); } }) : null,
      el('span', { class: 'chip-t' }, `${time}${it.title}`));
    node.addEventListener('click', (e) => { if (e.target.classList.contains('chk')) return; ctx.open(it); });
    node.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ctx.open(it); } });
    // can-drag: a finger drag moves the event instead of scrolling the view (calendar.css; shared/input/HANDOFF.md)
    if (!isTask && ctx.drag) { node.classList.add('can-drag'); node.addEventListener('pointerdown', (e) => ctx.drag(it, e, node)); }
    return node;
  }

  /**
   * Places timed items of one day in columns so that overlapping items sit side by side. items: [{ start, end }].
   * Returns the same items with col (0-based) and cols (columns in their cluster), in the order given.
   */
  function columns(items) {
    const sorted = items.slice().sort((a, b) => a.start - b.start || b.end - a.end);
    const out = new Map();
    let cluster = [], clusterEnd = -Infinity;
    const flush = () => {
      const n = Math.max(1, ...cluster.map((c) => c.col + 1));
      for (const c of cluster) out.set(c.item, { col: c.col, cols: n });
      cluster = [];
    };
    for (const it of sorted) {
      if (cluster.length && it.start >= clusterEnd) flush();
      const used = new Set(cluster.filter((c) => c.end > it.start).map((c) => c.col));
      let col = 0;
      while (used.has(col)) col++;
      cluster.push({ item: it, start: it.start, end: it.end, col });
      clusterEnd = Math.max(clusterEnd, it.end);
    }
    if (cluster.length) flush();
    return items.map((it) => ({ item: it, ...(out.get(it) || { col: 0, cols: 1 }) }));
  }

  NS.chip = chip;
  NS.columns = columns;
})(typeof window !== 'undefined' ? window : globalThis);
