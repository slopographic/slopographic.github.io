// The bar over the views: the project picker (with its colour), the Project menu (settings and columns, new project,
// backup, CSV, open a backup, sample, delete), the filters (find, assignee, tag; kept for this visit) and New task.
// Exposes window.SlopProjects.toolbar.
(function (g) {
  'use strict';
  const NS = (g.SlopProjects = g.SlopProjects || {});
  const UI = g.SlopUI, el = UI.el;
  const $ = (id) => document.getElementById(id);
  const st = () => NS.state;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  function menuItems() {
    const p = st().project, F = NS.files;
    return [
      { label: t('projects.bar.settings'), disabled: !p, act: () => NS.projectDialog.open() },
      { label: t('projects.bar.new_project'), act: () => NS.projectDialog.create() },
      '-',
      { label: t('projects.bar.dl_backup'), disabled: !p, act: F.exportJson },
      { label: t('projects.bar.dl_csv'), disabled: !p, act: F.exportCsv },
      { label: t('projects.bar.open_backup'), act: F.importFile },
      { label: t('projects.bar.sample'), act: F.trySample },
      '-',
      { label: t('projects.bar.delete'), disabled: !p, act: () => NS.actions.deleteProject(p) },
    ];
  }

  /** Draws the picker and the filter choices from the state. */
  function render() {
    const s = st(), p = s.project;
    $('pPick').replaceChildren(...s.projects.map((x) => el('option', { value: x.id, selected: p && x.id === p.id }, x.name)));
    $('pDot').className = `pdot c-${(p && p.color) || 'blue'}`;
    if (!p) return;
    const who = NS.board.peopleOf(p, s.tasks), tags = NS.board.tagsOf(s.tasks), f = s.filter;
    if (f.assignee && f.assignee !== '-' && !who.includes(f.assignee)) f.assignee = '';
    if (f.tag && !tags.includes(f.tag)) f.tag = '';
    $('fWho').replaceChildren(el('option', { value: '' }, t('projects.bar.anyone')), el('option', { value: '-', selected: f.assignee === '-' }, t('projects.bar.nobody')),
      ...who.map((n) => el('option', { value: n, selected: f.assignee === n }, n)));
    $('fTag').replaceChildren(el('option', { value: '' }, t('projects.bar.any_tag')), ...tags.map((n) => el('option', { value: n, selected: f.tag === n }, n)));
    $('fTag').disabled = !tags.length;
    if ($('fText').value !== f.text) $('fText').value = f.text;
  }

  function mount() {
    $('pPick').addEventListener('change', (e) => NS.app.open(e.target.value));
    $('pMenu').addEventListener('click', (e) => { const r = e.currentTarget.getBoundingClientRect(); UI.menu(menuItems(), r.left, r.bottom + 4); });
    $('pNew').addEventListener('click', () => NS.editor.open({}));
    $('fText').addEventListener('input', (e) => { st().filter.text = e.target.value; NS.app.draw(); });
    $('fWho').addEventListener('change', (e) => { st().filter.assignee = e.target.value; NS.app.draw(); });
    $('fTag').addEventListener('change', (e) => { st().filter.tag = e.target.value; NS.app.draw(); });
    $('pFirst').addEventListener('click', () => NS.projectDialog.create());
  }

  NS.toolbar = { mount, render, menuItems };
})(typeof window !== 'undefined' ? window : globalThis);
