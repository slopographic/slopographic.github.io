// One task card on the board: a grip to drag it by, its title (opens the editor), and a facts line: priority, tags,
// the person's initials, its dates or due day (overdue in red), the checklist count, and what it waits for. The card is
// focusable; its keys and its menu are wired by board.js. Also the small text helpers the other views use. Exposes
// window.SlopProjects.card.
(function (g) {
  'use strict';
  const NS = (g.SlopProjects = g.SlopProjects || {});
  const UI = g.SlopUI, el = UI.el, T = g.SlopTime;
  const tr = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  // the words of each priority (a getter: read in the chosen language each time)
  const PRIORITY = { none: '', get low() { return tr('projects.card.low'); }, get medium() { return tr('projects.card.medium'); }, get high() { return tr('projects.card.high'); } };

  const initials = (name) => String(name || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();
  const day = (d, locale) => T.dayText(d, locale, { day: 'numeric', month: 'short' });
  /** "3 Nov – 6 Nov", "3 Nov", or ''. */
  const range = (t, locale) => (t.start ? (t.start === t.end ? day(t.start, locale) : `${day(t.start, locale)} – ${day(t.end, locale)}`) : '');

  /** The words a screen reader says for a card: title, column, person, dates. */
  function label(t, ctx) {
    const bits = [t.title, ctx.columnName];
    if (t.assignee) bits.push(tr('projects.card.assigned', { name: t.assignee }));
    if (t.start) bits.push(range(t, ctx.locale));
    if (t.due) bits.push(tr('projects.card.due_lc', { day: day(t.due, ctx.locale) }));
    if (ctx.blockers.length) bits.push(tr('projects.card.waits_lc', { names: ctx.blockers.map((b) => b.title).join(', ') }));
    return bits.join(', ');
  }

  /**
   * The card. ctx: { locale, today, done (in a done column), columnName, blockers (open tasks it waits for),
   * customer (name), open(t) }.
   */
  function build(t, ctx) {
    const P = NS.board.progress(t);
    const overdue = !ctx.done && ((t.due && t.due < ctx.today) || (t.end && t.end < ctx.today));
    const facts = [];
    if (t.priority && t.priority !== 'none') facts.push(el('span', { class: `chip pri-${t.priority}` }, PRIORITY[t.priority]));
    for (const tag of (t.tags || []).slice(0, 4)) facts.push(el('span', { class: 'chip tag' }, tag));   // i18n-ignore: class names
    if (ctx.customer) facts.push(el('span', { class: 'chip cust', title: tr('projects.card.customer') }, ctx.customer));   // i18n-ignore: class names
    const meta = [];
    if (t.start) meta.push(el('span', { class: overdue && t.end < ctx.today ? 'late' : '' }, range(t, ctx.locale)));
    if (t.due) meta.push(el('span', { class: overdue && t.due < ctx.today ? 'late' : '' }, tr('projects.card.due', { day: day(t.due, ctx.locale) })));
    if (P.total) meta.push(el('span', { class: P.done === P.total ? 'ok' : '', title: tr('projects.card.checklist') }, `☑ ${P.done}/${P.total}`));
    if (ctx.blockers.length) meta.push(el('span', { class: 'wait', title: tr('projects.card.waits_tip', { names: ctx.blockers.map((b) => b.title).join(', ') }) }, tr('projects.card.waits_n', { n: String(ctx.blockers.length) })));
    return el('article', { class: `pcard${ctx.done ? ' is-done' : ''}${overdue ? ' is-late' : ''}`, tabindex: '0', role: 'listitem', 'data-id': t.id,
      'aria-label': label(t, ctx), 'aria-roledescription': tr('projects.card.role') },
      el('span', { class: 'pgrip', 'aria-hidden': 'true', title: tr('projects.card.drag') }, '⠿'),
      el('div', { class: 'pc-main' },
        el('button', { type: 'button', class: 'pc-title', tabindex: '-1', onclick: () => ctx.open(t) }, t.title),
        facts.length ? el('div', { class: 'pc-chips' }, facts) : null,
        meta.length || t.assignee ? el('div', { class: 'pc-meta' }, meta,
          t.assignee ? el('span', { class: 'avatar', title: t.assignee, 'aria-hidden': 'true' }, initials(t.assignee)) : null) : null),
      el('button', { type: 'button', class: 'pc-more', tabindex: '-1', 'aria-label': tr('projects.card.actions', { title: t.title }), title: tr('projects.card.more_tip'), 'data-menu': t.id }, '⋯'));
  }

  NS.card = { build, initials, day, range, PRIORITY };
})(typeof window !== 'undefined' ? window : globalThis);
