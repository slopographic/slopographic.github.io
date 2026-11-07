// The board view: one column per project column (its name, WIP count against its limit, a menu), the cards that match
// the filters in board order, and an "Add a task" field at the foot. Cards move by drag (board-drag.js), by keys on a
// focused card (Shift with an arrow; the arrows alone move the focus; Enter opens; Delete deletes, with Undo) and by
// the card menu (the ⋯ button, a right-click or the Menu key). The board scrolls sideways inside itself.
// Exposes window.SlopProjects.boardView.
(function (g) {
  'use strict';
  const NS = (g.SlopProjects = g.SlopProjects || {});
  const UI = g.SlopUI, el = UI.el;
  const st = () => NS.state, A = () => NS.actions, B = () => NS.board;
  let root = null, focusId = null;
  const tr = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  /** Where a card dropped before `beforeId` (null: after the last card shown) lands among all of a column's cards. */
  function indexFor(column, beforeId, movingId) {
    const all = B().inColumn(st().tasks, column).filter((t) => t.id !== movingId);
    if (beforeId) { const i = all.findIndex((t) => t.id === beforeId); if (i >= 0) return i; }
    const shown = new Set(st().visible.map((t) => t.id));
    for (let i = all.length - 1; i >= 0; i--) if (shown.has(all[i].id)) return i + 1;
    return all.length;
  }

  function cardMenu(t) {
    const p = st().project, cols = p.columns;
    const at = B().indexOf(st().tasks, t), n = B().inColumn(st().tasks, t.column).length, ci = cols.findIndex((c) => c.id === t.column);
    return [
      { label: tr('projects.board.open'), act: () => NS.editor.open({ task: t }) },
      { label: tr('projects.board.move_to'), sub: cols.map((c) => ({ label: c.name, check: c.id === t.column, disabled: c.id === t.column,
        act: () => { focusId = t.id; A().moveCard(t.id, c.id, B().inColumn(st().tasks, c.id).length); } })) },
      { label: tr('projects.board.move_left'), key: 'Shift+←', disabled: ci <= 0, act: () => { focusId = t.id; A().nudge(t.id, -1, 0); } },
      { label: tr('projects.board.move_right'), key: 'Shift+→', disabled: ci >= cols.length - 1, act: () => { focusId = t.id; A().nudge(t.id, 1, 0); } },
      { label: tr('projects.board.move_up'), key: 'Shift+↑', disabled: at <= 0, act: () => { focusId = t.id; A().nudge(t.id, 0, -1); } },
      { label: tr('projects.board.move_down'), key: 'Shift+↓', disabled: at >= n - 1, act: () => { focusId = t.id; A().nudge(t.id, 0, 1); } },
      t.start ? null : { label: tr('projects.board.on_timeline'), act: () => A().schedule(t.id) },
      '-',
      { label: tr('ui.delete'), key: 'Delete', act: () => A().deleteTask(t.id) },
    ].filter(Boolean);
  }

  function columnMenu(c, i) {
    const p = st().project, cols = p.columns;
    const save = (columns, moves) => A().saveProject({ ...p, columns }, moves);
    return [
      { label: tr('projects.board.rename_dots'), act: async () => { const nm = await UI.prompt(tr('projects.board.rename_col'), tr('projects.board.name'), c.name); if (nm && nm.trim()) save(cols.map((x) => (x.id === c.id ? { ...x, name: nm.trim().slice(0, 40) } : x))); } },
      { label: tr('projects.board.wip_dots'), act: async () => {
        const v = await UI.prompt(tr('projects.board.wip'), tr('projects.board.wip_q', { name: c.name }), String(c.wip || 0));
        if (v === null) return;
        const n = Math.max(0, Math.min(999, parseInt(v, 10) || 0));
        save(cols.map((x) => (x.id === c.id ? { ...x, wip: n || undefined } : x)));
      } },
      { label: tr('projects.board.done_col'), check: !!c.done, act: () => save(cols.map((x) => (x.id === c.id ? { ...x, done: !c.done || undefined } : x))) },
      { label: tr('projects.board.move_left'), disabled: i === 0, act: () => save(B().moveColumn(cols, c.id, i - 1)) },
      { label: tr('projects.board.move_right'), disabled: i === cols.length - 1, act: () => save(B().moveColumn(cols, c.id, i + 1)) },
      '-',
      { label: tr('projects.board.del_col'), disabled: cols.length <= 1, act: () => {
        const r = B().removeColumn(cols, st().tasks, c.id);
        if (r.ok) save(r.columns, r.moves); else UI.toast(r.message);
      } },
    ];
  }

  function column(c, i) {
    const s = st(), p = s.project;
    const shown = B().inColumn(s.visible, c.id);
    const w = B().wip(s.tasks, c);
    const done = B().isDone(p, { column: c.id });
    const isDone = (t) => B().isDone(p, t);
    const input = el('input', { type: 'text', maxlength: 200, placeholder: tr('projects.board.add_task'), 'aria-label': tr('projects.board.add_task_to', { name: c.name }), autocomplete: 'off' });
    const add = (e) => { e.preventDefault(); const v = input.value.trim(); if (!v) return; input.value = ''; NS.boardView.keepAdd = c.id; A().addTask(v, c.id); };
    return el('section', { class: `pcol${w.over ? ' is-over' : ''}`, 'data-col': c.id, 'aria-label': tr('projects.board.col_aria', { name: c.name, n: w.count }) },
      el('header', { class: 'pcol-h' },
        el('h3', null, c.name, done ? el('span', { class: 'sr' }, ' ' + tr('projects.board.finished')) : null),
        el('span', { class: `wip${w.over ? ' over' : ''}`, title: w.limit ? tr('projects.board.wip_tip', { n: w.count, limit: w.limit }) : tr('projects.board.n_cards', { n: w.count }) }, w.limit ? `${w.count} / ${w.limit}` : String(w.count)),
        el('button', { type: 'button', class: 'pcol-more', 'aria-label': tr('projects.board.col_actions', { name: c.name }), onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); UI.menu(columnMenu(c, i), r.left, r.bottom + 4); } }, '⋯')),
      el('div', { class: 'pcol-body', role: 'list', 'aria-label': c.name },
        shown.map((t) => NS.card.build(t, { locale: s.locale, today: s.today, done, columnName: c.name, customer: t.customerId ? s.customers.get(t.customerId) : '',
          blockers: NS.deps.blockers(s.tasks, t, isDone), open: (x) => NS.editor.open({ task: x }) }))),
      el('form', { class: 'pcol-add', onsubmit: add }, input));
  }

  function render() {
    if (!root) return;
    const s = st();
    if (!s.project) { root.replaceChildren(); return; }
    const scroll = root.scrollLeft;
    const act = document.activeElement, had = act && root.contains(act) && act.closest('.pcard');   // keep the focus on a redraw
    if (!focusId && had) focusId = had.dataset.id;
    const cols = s.project.columns.map(column);
    const addCol = el('button', { type: 'button', class: 'padd-col', onclick: async () => {
      const nm = await UI.prompt(tr('projects.board.new_col'), tr('projects.board.name'), '');
      if (nm === null) return;
      const r = B().addColumn(s.project.columns, nm);
      if (r.ok) A().saveProject({ ...s.project, columns: r.value }); else UI.toast(r.message);
    } }, tr('projects.board.add_col'));
    root.replaceChildren(...cols, addCol);
    root.scrollLeft = scroll;
    if (focusId) { const c = root.querySelector(`.pcard[data-id="${CSS.escape(focusId)}"]`); if (c) c.focus({ preventScroll: false }); focusId = null; }
    if (NS.boardView.keepAdd) { const f = root.querySelector(`.pcol[data-col="${CSS.escape(NS.boardView.keepAdd)}"] .pcol-add input`); if (f) f.focus(); NS.boardView.keepAdd = null; }
  }

  /** Moves the focus to a card: the next or previous in its column, or the nearest place in the next column over. */
  function focusNear(card, dx, dy) {
    const col = card.closest('.pcol');
    if (dy) { const list = [...col.querySelectorAll('.pcard')], i = list.indexOf(card); const n = list[i + dy]; if (n) n.focus(); return; }
    const cols = [...root.querySelectorAll('.pcol')];
    let ci = cols.indexOf(col) + dx;
    const at = [...col.querySelectorAll('.pcard')].indexOf(card);
    while (cols[ci]) {
      const list = cols[ci].querySelectorAll('.pcard');
      if (list.length) { list[Math.min(at, list.length - 1)].focus(); return; }
      ci += dx;
    }
  }

  function onKey(e) {
    const card = e.target.closest && e.target.closest('.pcard');
    if (!card || e.target.tagName === 'INPUT') return;
    const t = st().tasks.find((x) => x.id === card.dataset.id);
    if (!t) return;
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[e.key] && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const [dx, dy] = arrows[e.key];
      if (e.shiftKey) { focusId = t.id; A().nudge(t.id, dx, dy); } else focusNear(card, dx, dy);
    } else if ((e.key === 'Enter' || e.key === ' ') && e.target === card) { e.preventDefault(); NS.editor.open({ task: t }); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); focusNear(card, 0, 1); A().deleteTask(t.id); }
    else if (e.key === 'm' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); e.stopPropagation(); const r = card.getBoundingClientRect(); UI.menu(cardMenu(t), r.left + 12, r.bottom - 4); }
  }

  function mount() {
    root = document.getElementById('board');
    root.addEventListener('keydown', onKey);
    root.addEventListener('click', (e) => {
      const b = e.target.closest('.pc-more');
      if (!b) return;
      const t = st().tasks.find((x) => x.id === b.dataset.menu);
      const r = b.getBoundingClientRect();
      if (t) UI.menu(cardMenu(t), r.left, r.bottom + 4);
    });
    if (g.SlopCtx) g.SlopCtx.bind(root, (target) => {
      const card = target && target.closest && target.closest('.pcard');
      const t = card && st().tasks.find((x) => x.id === card.dataset.id);
      return t ? cardMenu(t) : null;
    });
    NS.boardDrag.attach(root);
  }

  NS.boardView = { mount, render, indexFor, cardMenu, keepAdd: null, focus: (id) => { focusId = id; } };
  NS.views = NS.views || {};
})(typeof window !== 'undefined' ? window : globalThis);
