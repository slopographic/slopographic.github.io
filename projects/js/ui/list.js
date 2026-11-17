// The list view: the tasks that match the filters in a table: title, column, assignee, priority, start, end, due,
// checklist and tags. A column heading is a button that sorts by it (again for the other way); aria-sort says which.
// The sort is kept in this browser. The table scrolls sideways inside its own box on a phone.
// Exposes window.SlopProjects.listView.
(function (g) {
  'use strict';
  const NS = (g.SlopProjects = g.SlopProjects || {});
  const UI = g.SlopUI, el = UI.el;
  const KEY = 'slop-projects.sort';
  const tr = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  // [sort key, the heading's key in the string tables]
  const COLS = [['title', 'projects.list.task'], ['column', 'projects.list.column'], ['assignee', 'projects.list.assignee'], ['priority', 'projects.list.priority'], ['start', 'projects.list.start'], ['end', 'projects.list.end'], ['due', 'projects.list.due'], [null, 'projects.list.checklist'], [null, 'projects.list.tags']];
  const st = () => NS.state;
  let root = null;

  function sortBy(key) {
    const s = st().sort;
    st().sort = s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' };
    try { localStorage.setItem(KEY, JSON.stringify(st().sort)); } catch (e) { /* storage blocked: the sort lasts this visit */ }
    render();
    const b = root.querySelector(`th[data-key="${key}"] button`);
    if (b) b.focus();
  }

  function render() {
    if (!root) return;
    const s = st(), p = s.project;
    if (!p) { root.replaceChildren(); return; }
    const rows = NS.board.sort(s.visible, s.sort.key, s.sort.dir, p);
    const colName = new Map(p.columns.map((c) => [c.id, c.name]));
    const day = (d) => (d ? NS.card.day(d, s.locale) : '');
    const head = el('tr', null, COLS.map(([key, lk]) => {
      const label = tr(lk);
      if (!key) return el('th', { scope: 'col' }, label);
      const on = s.sort.key === key;
      return el('th', { scope: 'col', 'data-key': key, 'aria-sort': on ? (s.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none' },
        el('button', { type: 'button', class: 'sort', onclick: () => sortBy(key) }, label, el('span', { class: 'sort-i', 'aria-hidden': 'true' }, on ? (s.sort.dir === 'asc' ? '▲' : '▼') : '')));
    }));
    const body = rows.map((t) => {
      const pr = NS.board.progress(t), done = NS.board.isDone(p, t);
      const late = !done && ((t.due && t.due < s.today) || (t.end && t.end < s.today));
      return el('tr', { 'data-id': t.id, class: `${done ? 'is-done' : ''}${late ? ' is-late' : ''}` },
        el('td', null, el('button', { type: 'button', class: 'linkish', onclick: () => NS.editor.open({ task: t }) }, t.title)),
        el('td', null, colName.get(t.column) || ''),
        el('td', null, t.assignee || ''),
        el('td', null, NS.card.PRIORITY[t.priority || 'none']),
        el('td', { class: 'num' }, day(t.start)), el('td', { class: `num${late && t.end && t.end < s.today ? ' late' : ''}` }, day(t.end)),
        el('td', { class: `num${late && t.due && t.due < s.today ? ' late' : ''}` }, day(t.due)),
        el('td', { class: 'num' }, pr.total ? `${pr.done}/${pr.total}` : ''),
        el('td', null, (t.tags || []).join(', ')));
    });
    root.replaceChildren(el('table', { class: 'grid-t plist', 'aria-label': tr('projects.list.aria', { name: p.name }) },
      el('thead', null, head),
      el('tbody', null, body.length ? body : el('tr', null, el('td', { colspan: COLS.length, class: 'note' }, tr(s.tasks.length ? 'projects.list.no_match' : 'projects.list.none'))))));
  }

  /** The stored sort, or by column (board order). */
  function stored() {
    try { const v = JSON.parse(localStorage.getItem(KEY)); if (v && NS.board.SORTS.includes(v.key) && ['asc', 'desc'].includes(v.dir)) return v; } catch (e) { /* none or blocked */ }
    return { key: 'column', dir: 'asc' };
  }

  function mount() { root = document.getElementById('listWrap'); }

  NS.listView = { mount, render, sortBy, stored };
})(typeof window !== 'undefined' ? window : globalThis);
