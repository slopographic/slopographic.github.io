// The Customers sidebar: All customers, then the groups and the tags, each with its count. Pick one to filter the list;
// a group and a tag can be picked together. On phones the sidebar is a row of chips above the list.
(function (g) {
  'use strict';
  const NS = (g.SlopCrm = g.SlopCrm || {});
  const UI = g.SlopUI;
  const el = UI.el;
  const tr = (k, v) => NS.tr(k, v);   // the string tables (crm/i18n)
  const $ = (id) => document.getElementById(id);
  NS.listFilter = { group: '', tag: '' };

  const item = (label, n, on, onClick, dot) => el('button', { type: 'button', class: 'side-item', 'aria-pressed': String(on), onclick: onClick },
    dot ? el('span', { class: `tag-dot tg-${dot}`, 'aria-hidden': 'true' }) : null,
    el('span', { class: 'side-name' }, label), el('span', { class: 'side-count' }, String(n)));

  /** Repaints the sidebar from the customers and the labels. The list is then filtered again. */
  function render(all, labels) {
    const f = NS.listFilter;
    const groups = NS.labels.countsOf(all, 'groupIds'), tags = NS.labels.countsOf(all, 'tagIds');
    const again = () => NS.views.customers.render();
    const pick = (kind, id) => { f[kind] = f[kind] === id ? '' : id; again(); };
    $('cSide').replaceChildren(
      el('div', { class: 'side-sec' }, item(tr('crm.sd.all'), all.length, !f.group && !f.tag, () => { f.group = ''; f.tag = ''; again(); })),
      el('section', { class: 'side-sec', 'aria-label': tr('crm.sd.groups') },
        el('div', { class: 'side-h' }, el('span', null, tr('crm.sd.groups')),
          el('button', { type: 'button', class: 'side-manage', onclick: () => NS.groupsPanel.open() }, tr('crm.sd.manage'))),
        labels.groups.length
          ? labels.groups.map((x) => item(x.name, groups.get(x.id) || 0, f.group === x.id, () => pick('group', x.id)))
          : el('p', { class: 'side-empty' }, tr('crm.sd.no_groups'))),
          el('section', { class: 'side-sec', 'aria-label': tr('crm.sd.tags') },
            el('div', { class: 'side-h' }, el('span', null, tr('crm.sd.tags')),
              el('button', { type: 'button', class: 'side-manage', onclick: () => NS.tagManager.open() }, tr('crm.sd.manage'))),
        labels.tags.length
          ? labels.tags.map((x) => item(x.name, tags.get(x.id) || 0, f.tag === x.id, () => pick('tag', x.id), x.color))
          : el('p', { class: 'side-empty' }, tr('crm.sd.no_tags'))));
  }

  NS.sidebar = { render };
})(typeof window !== 'undefined' ? window : globalThis);
