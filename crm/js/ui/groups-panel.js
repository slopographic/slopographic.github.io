// The Groups panel: create, rename and delete groups in a SlopUI dialog. A customer can be in many groups. Groups
// filter the list in the sidebar, and bulk actions add or remove them. Deleting a group only takes it off customers.
(function (g) {
  'use strict';
  const NS = (g.SlopCrm = g.SlopCrm || {});
  const UI = g.SlopUI;
  const el = UI.el;
  const tr = (k, v) => NS.tr(k, v);   // the string tables (crm/i18n)
  const plural = (n) => tr('crm.bk.n_customers', { n });
  const enter = (fn) => (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); fn(); } };

  /** Opens the panel. The promise resolves when it closes. */
  function open() {
    return new Promise((resolve) => {
      const body = el('div', { class: 'lab-body' });
      const msg = el('p', { class: 'msg', role: 'alert' });
      const say = (r, done) => { msg.textContent = r.ok ? '' : NS.util.refusal(r); if (r.ok && done) UI.toast(done); };
      const nameIn = el('input', { type: 'text', maxlength: NS.labels.MAX.group, placeholder: tr('crm.gp.ph'), 'aria-label': tr('crm.gp.ph'),
        autocomplete: 'off', onkeydown: enter(() => add()) });
      const addRow = el('div', { class: 'lab-add' }, nameIn, el('button', { type: 'button', class: 'btn primary', onclick: () => add() }, tr('crm.gp.add')));   // i18n-ignore: class names

      const add = async () => {
        const r = await NS.labels.createGroup(nameIn.value);
        say(r, tr('crm.gp.added'));
        if (r.ok) nameIn.value = '';
        await draw();
      };
      const row = (x, n) => {
        const name = el('input', { type: 'text', value: x.name, maxlength: NS.labels.MAX.group, autocomplete: 'off',
          'aria-label': tr('crm.gp.name_of', { name: x.name }), onkeydown: enter(() => rename()) });
          const rename = async () => { const r = await NS.labels.renameGroup(x.id, name.value); say(r, tr('crm.gp.renamed')); await draw(); };
        const remove = async () => {
          const yes = await UI.confirm(tr('crm.gp.del_q', { name: x.name }),
            n ? tr('crm.gp.del_body_n', { what: plural(n) }) : tr('crm.gp.del_body'), tr('ui.delete'), { danger: true });
          if (!yes) return;
          const r = await NS.labels.deleteGroup(x.id);
          say(r, tr('crm.gp.deleted'));
          await draw();
        };
        return el('li', { class: 'lab-row' }, name, el('span', { class: 'lab-count' }, plural(n)),
          el('button', { type: 'button', class: 'btn small', onclick: rename }, tr('crm.gp.rename')),   // i18n-ignore: class names
          el('button', { type: 'button', class: 'btn small danger', onclick: remove }, tr('ui.delete')));   // i18n-ignore: class names
      };
      const draw = async () => {
        const [lab, cs] = await Promise.all([NS.labels.load(), NS.customers.load()]);
        if (!lab.ok || !cs.ok) { msg.textContent = NS.util.refusal(lab.ok ? cs : lab); return; }
        const counts = NS.labels.countsOf(cs.value, 'groupIds');
        body.replaceChildren(
          el('p', { class: 'note' }, tr('crm.gp.note')),
          addRow, msg,
          lab.value.groups.length
            ? el('ul', { class: 'lab-list', 'aria-label': tr('crm.gp.groups') }, lab.value.groups.map((x) => row(x, counts.get(x.id) || 0)))
            : el('p', { class: 'empty' }, tr('crm.gp.none')));
      };
      UI.dialog({ title: tr('crm.gp.groups'), cls: 'lab-dlg', body, buttons: [{ label: tr('ui.done'), primary: true }], onClose: () => resolve() });
      draw();
    });
  }

  NS.groupsPanel = { open };
})(typeof window !== 'undefined' ? window : globalThis);
