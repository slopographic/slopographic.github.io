// Project settings: a SlopUI dialog for the name, colour, dates, people, notes, CRM customer and the board's columns
// (rename, limit of cards, which one holds finished work, reorder, remove, add). A removed column's cards go to the
// column before it, in the same save, which is one undo step. Also New project (a name, then the default columns).
// make(name, opts) is the same without the question (the AI commands). Exposes window.SlopProjects.projectDialog.
(function (g) {
  'use strict';
  const NS = (g.SlopProjects = g.SlopProjects || {});
  const UI = g.SlopUI, el = UI.el;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const COLORS = ['blue', 'green', 'amber', 'red', 'violet', 'teal', 'pink', 'grey'].map((c) => [c, 'projects.pr.' + c]);   // [id, its key]
  const field = (label, node, cls) => el('label', { class: `field${cls ? ` ${cls}` : ''}` }, el('span', null, label), node);

  /** The columns editor. Returns { el, value(): { columns, removed: [ids] } }. */
  function columnsEditor(cols) {
    let list = cols.map((c) => ({ ...c }));
    const removed = [];
    const ul = el('ol', { class: 'pc-cols', 'aria-label': t('projects.pr.columns') });
    const draw = (focus) => {
      ul.replaceChildren(...list.map((c, i) => el('li', null,
        el('input', { type: 'text', value: c.name, maxlength: 40, 'aria-label': t('projects.pr.col_name', { n: String(i + 1) }), oninput: (e) => { c.name = e.target.value; } }),
        el('input', { type: 'number', min: 0, max: 999, value: c.wip || '', placeholder: t('projects.pr.no_limit'), class: 'wip-in', 'aria-label': t('projects.pr.limit_in', { name: c.name }), oninput: (e) => { c.wip = Math.max(0, Math.min(999, parseInt(e.target.value, 10) || 0)) || undefined; } }),
        el('label', { class: 'pc-done', title: t('projects.pr.done_tip') }, el('input', { type: 'checkbox', checked: !!c.done, onchange: (e) => { c.done = e.target.checked || undefined; } }), t('projects.pr.done')),
        el('button', { type: 'button', class: 'pe-x', 'aria-label': t('projects.pr.up', { name: c.name }), disabled: i === 0, onclick: () => { list = NS.board.moveColumn(list, c.id, i - 1); draw(`up${i - 1}`); } }, '↑'),
        el('button', { type: 'button', class: 'pe-x', 'aria-label': t('projects.pr.down', { name: c.name }), disabled: i === list.length - 1, onclick: () => { list = NS.board.moveColumn(list, c.id, i + 1); draw(`dn${i + 1}`); } }, '↓'),
        el('button', { type: 'button', class: 'pe-x', 'aria-label': t('projects.pr.remove', { name: c.name }), disabled: list.length <= 1, onclick: () => { removed.push(c.id); list = list.filter((x) => x !== c); draw(); } }, '×'))));
      if (focus) { const [k, n] = [focus.slice(0, 2), Number(focus.slice(2))]; const b = ul.children[n] && ul.children[n].querySelectorAll('button')[k === 'up' ? 0 : 1]; if (b && !b.disabled) b.focus(); }
    };
    const add = () => { const r = NS.board.addColumn(list, t('projects.pr.col_n', { n: String(list.length + 1) })); if (!r.ok) { UI.toast(r.message); return; } list = r.value; draw(); const last = ul.lastElementChild.querySelector('input'); last.focus(); last.select(); };
    draw();
    return {
      el: el('div', { class: 'pe-sec' }, el('div', { class: 'pe-sec-h' }, el('span', null, t('projects.pr.board_cols')), el('span', { class: 'note' }, t('projects.pr.board_note'))), ul,
        el('button', { type: 'button', class: 'btn small', onclick: add }, t('projects.pr.add_col'))),   // i18n-ignore: class names
      value: () => ({ columns: list.map((c) => ({ id: c.id, name: String(c.name || '').trim().slice(0, 40) || c.id, ...(c.wip ? { wip: c.wip } : {}), ...(c.done ? { done: true } : {}) })), removed: removed.slice() }),
    };
  }

  /** Opens the settings of the current project. */
  function open() {
    const s = NS.state, p = s.project;
    if (!p) return null;
    const cols = columnsEditor(p.columns);
    const customers = [...s.customers.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    const v = (id) => body.querySelector(`#${id}`).value.trim();
    const body = el('form', { class: 'pe-form', onsubmit: (e) => e.preventDefault() },
      field(t('projects.pr.name'), el('input', { id: 'ppName', type: 'text', value: p.name, maxlength: 120, required: true }), 'wide'),
      field(t('projects.pr.colour'), el('select', { id: 'ppColor' }, COLORS.map(([c, k]) => el('option', { value: c, selected: c === (p.color || 'blue') }, t(k))))),
      customers.length ? field(t('projects.pr.customer'), el('select', { id: 'ppCustomer' }, [['', t('projects.pr.no_customer')], ...customers].map(([id, n]) => el('option', { value: id, selected: id === (p.customerId || '') }, n)))) : el('span'),
      field(t('projects.pr.start'), el('input', { id: 'ppStart', type: 'date', value: p.start || '' })),
      field(t('projects.pr.end'), el('input', { id: 'ppEnd', type: 'date', value: p.end || '' })),
      field(t('projects.pr.people'), el('input', { id: 'ppPeople', type: 'text', value: (p.people || []).join(', '), maxlength: 2000 }), 'wide'),
      field(t('projects.pr.notes'), el('textarea', { id: 'ppNotes', rows: 2, maxlength: 5000 }, p.notes || ''), 'wide'),
      el('div', { class: 'wide' }, cols.el));
    const save = async () => {
      const name = v('ppName');
      if (!name) { UI.toast(t('projects.pr.no_name')); return false; }
      const start = v('ppStart') || undefined, end = v('ppEnd') || undefined;
      if (start && end && end < start) { UI.toast(t('projects.pr.end_before')); return false; }
      const { columns, removed } = cols.value();
      // The cards of a removed column go to the end of the nearest column before it that stays (else the first one).
      const keep = new Set(columns.map((c) => c.id)), moves = [];
      const dest = (id) => { const i = p.columns.findIndex((c) => c.id === id); for (let k = i - 1; k >= 0; k--) if (keep.has(p.columns[k].id)) return p.columns[k].id; return columns[0].id; };
      const count = new Map(columns.map((c) => [c.id, NS.board.inColumn(s.tasks, c.id).length]));
      for (const id of removed) for (const x of NS.board.inColumn(s.tasks, id)) { const to = dest(id); moves.push({ id: x.id, column: to, order: count.get(to) }); count.set(to, count.get(to) + 1); }
      const people = [...new Set(v('ppPeople').split(',').map((x) => x.trim().slice(0, 80)).filter(Boolean))].slice(0, 50);
      const cust = body.querySelector('#ppCustomer');
      const ok = await NS.actions.saveProject({ ...p, name: name.slice(0, 120), color: v('ppColor'), start, end, people, notes: v('ppNotes') || undefined, columns,
        customerId: (cust && cust.value) || undefined }, moves);
      return ok ? undefined : false;
    };
    return UI.dialog({ title: t('projects.pr.settings'), body, cls: 'pe-dlg', dismissable: true, buttons: [
      { label: t('projects.pr.delete'), danger: true, act: () => { NS.actions.deleteProject(p); } },
      { label: t('menu.cancel') }, { label: t('menu.save'), primary: true, act: save }] });
  }

  /** New project: asks for a name, then makes it with To do, Doing and Done, starting today. */
  async function create() {
    const name = await UI.prompt(t('projects.pr.new'), t('projects.pr.new_name'), '', { ok: t('projects.pr.create'), placeholder: t('projects.pr.new_ph') });
    if (name === null || !String(name).trim()) return false;
    // the default columns, named in the chosen language (they are the person's own data from then on)
    return make(name, { columns: NS.board.DEFAULT_COLUMNS.map((c) => ({ ...c, name: t('projects.col.' + c.id) })) });
  }

  /** Makes and opens a project: a name, and optionally { columns, color, start } (default To do, Doing, Done, today). */
  function make(name, opts = {}) {
    const p = { id: NS.store.newId(), name: String(name).trim().slice(0, 120), color: opts.color || 'blue', start: opts.start || NS.state.today,
      columns: (opts.columns || NS.board.DEFAULT_COLUMNS).map((c) => ({ ...c })), people: [] };
    return NS.actions.addBundle({ project: p, tasks: [] }, t('projects.pr.made', { name: p.name }));
  }

  NS.projectDialog = { open, create, make, columnsEditor, COLORS };
})(typeof window !== 'undefined' ? window : globalThis);
