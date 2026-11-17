// The task list: one row per task, with its subtasks under it. A row has a checkbox (completes the task through the
// shared store, so the Calendar changes too), the title (opens the editor), and a line of facts: due date and time,
// list, repeat, tags, customer and subtask progress. Exposes window.SlopTodo.list.
(function (g) {
  'use strict';
  const T = g.SlopTime, TK = g.SlopTasks, RR = g.SlopRecur, UI = g.SlopUI, el = UI.el;
  const NS = (g.SlopTodo = g.SlopTodo || {});
  const tr = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  /** Due text for a task: "Overdue · Mon 5 Oct 09:00", "Today · 14:30", "Tomorrow", or the date. */
  function dueText(t, today, locale) {
    if (!t.due) return '';
    const tomorrow = T.addDays(today, 1);
    const rel = t.due === today ? tr('todo.due.today') : t.due === tomorrow ? tr('todo.due.tomorrow') : t.due < today ? tr('todo.due.overdue') : '';
    const date = T.dayText(t.due, locale, { weekday: 'short', day: 'numeric', month: 'short' });
    return `${rel ? `${rel} · ` : ''}${date}${t.dueTime ? ` ${t.dueTime}` : ''}`;
  }

  /** The facts line under a title. */
  function facts(t, all, ctx) {
    const out = [];
    const due = dueText(t, ctx.today, ctx.locale);
    if (due) out.push(due);
    if (ctx.view.list === undefined || ctx.view.list !== t.list) out.push(t.list || 'Inbox');   // i18n-ignore: the stored name of the default list
    if (t.freq && t.freq !== 'none') out.push(tr('todo.fact.repeats', { rule: RR.describe(t).toLowerCase() }));
    if (t.priority === 'high') out.push(tr('todo.fact.high'));
    if (t.customerId && ctx.customers.has(t.customerId)) out.push(ctx.customers.get(t.customerId));
    const p = TK.progress(all, t.id);
    if (p.total) out.push(tr('todo.fact.subtasks', { done: p.done, total: p.total }));
    if (t.tags && t.tags.length) out.push(t.tags.map((x) => `#${x}`).join(' '));
    return out;
  }

  /** One row. depth 1 is a subtask. */
  function row(t, all, ctx, depth) {
    const remind = t.remind !== undefined && t.due ? ' · ' + tr('todo.fact.reminder') : '';
    return el('li', { class: `t-row${t.done ? ' is-done' : ''}${depth ? ' is-sub' : ''} p-${t.priority || 'none'}`, 'data-id': t.id, 'data-done': String(!!t.done), role: 'listitem' },
      el('input', { type: 'checkbox', class: 't-check', checked: !!t.done, 'aria-label': tr('todo.row.complete', { title: t.title }),
        onchange: () => ctx.toggle(t) }),
      el('button', { type: 'button', class: 't-main', onclick: () => ctx.edit(t) },
        el('span', { class: 't-title' }, t.title),
        el('span', { class: 't-facts' }, facts(t, all, ctx).join(' · ') + remind)));
  }

  /** The rows for the visible top-level tasks, each followed by its subtasks. */
  function rows(visible, all, ctx) {
    const out = [];
    for (const t of visible) {
      out.push(row(t, all, ctx, 0));
      const kids = TK.children(all, t.id).filter((k) => ctx.showDone || !k.done).sort(TK.compare);
      for (const k of kids) out.push(row(k, all, ctx, 1));
    }
    return out;
  }

  /** Draws the list into root. view is { list } or a view name. */
  function render(root, visible, all, ctx) {
    if (!visible.length) { root.replaceChildren(el('p', { class: 'empty' }, tr('todo.empty.' + (typeof ctx.view === 'string' ? ctx.view : 'list')))); return; }
    root.replaceChildren(el('ul', { class: 't-list', role: 'list', 'aria-label': tr('todo.list.aria') }, rows(visible, all, ctx)));
  }

  NS.list = { render, dueText, facts };
})(typeof window !== 'undefined' ? window : globalThis);
