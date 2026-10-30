// The pipeline board: one column per stage, a card per customer. Move a card by dragging it to another column,
// by its Move button, or from the right-click (or Menu key) menu. Every move is saved at once.
(function (g) {
  'use strict';
  const NS = (g.SlopCrm = g.SlopCrm || {});
  const UI = g.SlopUI;
  const el = UI.el;
  const tr = (k, v) => NS.tr(k, v);   // the string tables (crm/i18n)
  let root = null;

  function card(c, cur) {
    const meta = [c.email, c.phone].filter(Boolean).join(' · ');
    const follow = c.followUp ? el('span', { class: 'c-follow' }, tr('crm.bd.follow', { date: NS.util.date(c.followUp, cur.locale) })) : null;
    return el('div', { class: 'card-c', role: 'listitem', draggable: 'true', tabindex: '0', 'data-id': c.id, 'data-stage': c.stage,
      'aria-label': `${c.name}, ${NS.stageLabel(c.stage)}` ,
      ondragstart: (e) => { e.dataTransfer.setData('text/plain', c.id); e.dataTransfer.effectAllowed = 'move'; },
    },
      el('button', { type: 'button', class: 'c-name', onclick: () => NS.app.show('customer', c.id) }, c.name),
      meta ? el('span', { class: 'c-meta' }, meta) : null,
      c.categories && c.categories.length ? el('span', { class: 'chips' }, c.categories.map((t) => el('span', { class: 'chip' }, t))) : null,
      follow,
      el('button', { type: 'button', class: 'c-move', 'aria-label': tr('crm.bd.move_aria', { name: c.name }), title: tr('crm.bd.move_tip'),
      onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); UI.menu(NS.menu.items(c), r.left, r.bottom + 4); } }, tr('crm.bd.move')));
  }

  function column(stage, list, cur) {
    const drop = (e) => { e.preventDefault(); e.currentTarget.classList.remove('over'); const id = e.dataTransfer.getData('text/plain'); if (id) NS.menu.moveTo(id, stage); };
    return el('section', { class: 'col', 'data-stage': stage, 'aria-label': tr('crm.bd.column', { stage: NS.stageLabel(stage) }),
      ondragover: (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; e.currentTarget.classList.add('over'); },
      ondragleave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.classList.remove('over'); },
      ondrop: drop },
      el('h3', { class: 'col-h' }, NS.stageLabel(stage), el('span', { class: 'count' }, String(list.length))),
      el('div', { class: 'col-body', role: 'list' }, list.length ? list.map((c) => card(c, cur)) : el('p', { class: 'empty-col' }, tr('crm.bd.empty'))));
  }

  async function render() {
    if (!root) return;
    const r = await NS.customers.load();
    if (!r.ok) { root.replaceChildren(el('p', { class: 'msg', role: 'alert' }, NS.util.refusal(r))); return; }
    const cur = NS.state.settings;
    // Suppliers (contacts Slop Purchases buys from) are not part of the sales pipeline.
    const people = r.value.filter((c) => !c.supplier);
    const cols = NS.STAGES.map((s) => column(s, people.filter((c) => c.stage === s), cur));
    root.replaceChildren(...cols);
  }

  function mount() {
    root = document.getElementById('board');
    document.getElementById('pAdd').addEventListener('click', () => NS.form.open(null));
    // Right-click, or the Menu key on a focused card, opens the same actions as the Move button.
    g.SlopCtx.bind(root, (t) => {
      const card = t && t.closest && t.closest('.card-c');
      if (!card) return null;
      return NS.menu.items({ id: card.dataset.id, name: card.querySelector('.c-name').textContent, stage: card.dataset.stage });
    });
  }

  NS.views = NS.views || {};
  NS.views.pipeline = { mount, render };
})(typeof window !== 'undefined' ? window : globalThis);
