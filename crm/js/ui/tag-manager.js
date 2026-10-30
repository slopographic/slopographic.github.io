// The tag manager: create, rename, recolour, merge and delete tags in a SlopUI dialog. A tag is one definition, so a
// change here reaches every customer that has it. Categories (free text on each customer) are a different thing and
// are not changed here; the note in the dialog says so.
(function (g) {
  'use strict';
  const NS = (g.SlopCrm = g.SlopCrm || {});
  const UI = g.SlopUI;
  const el = UI.el;
  const tr = (k, v) => NS.tr(k, v);   // the string tables (crm/i18n)
  const COLORS = g.SlopData.schemaDefs.ENUM.tagColor;
  const plural = (n) => tr('crm.bk.n_customers', { n });
  const enter = (fn) => (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); fn(); } };

  function colourSelect(value, label, onChange) {
    return el('select', { 'aria-label': label, onchange: (e) => onChange(e.target.value) },
      COLORS.map((c) => el('option', { value: c, selected: c === value }, tr('crm.col.' + c))));
  }

  /** Opens the manager. The promise resolves when it closes. */
  function open() {
    return new Promise((resolve) => {
      const body = el('div', { class: 'lab-body' });
      const msg = el('p', { class: 'msg', role: 'alert' });
      const say = (r, done) => { msg.textContent = r.ok ? '' : NS.util.refusal(r); if (r.ok && done) UI.toast(done); };
      const newName = el('input', { type: 'text', maxlength: NS.labels.MAX.tag, placeholder: tr('crm.tm.ph'), 'aria-label': tr('crm.tm.name_aria'),
        autocomplete: 'off', onkeydown: enter(() => add()) });
      const newColour = colourSelect('blue', tr('crm.tm.colour_aria'), () => {});
      const addRow = el('div', { class: 'lab-add' }, newName, newColour,
        el('button', { type: 'button', class: 'btn primary', onclick: () => add() }, tr('crm.tm.add')));   // i18n-ignore: class names
        const note = el('p', { class: 'note' }, tr('crm.tm.note1') + ' ', tr('crm.tm.note2'));

      const add = async () => {
        const r = await NS.labels.createTag(newName.value, newColour.value);
        say(r, tr('crm.tm.added'));
        if (r.ok) newName.value = '';
        await draw();
      };
      const row = (t, tags, n) => {
        const run = async (p, done) => { say(await p, done); await draw(); };
        const name = el('input', { type: 'text', value: t.name, maxlength: NS.labels.MAX.tag, autocomplete: 'off',
          'aria-label': tr('crm.tm.name_of', { name: t.name }), onkeydown: enter(() => run(NS.labels.renameTag(t.id, name.value), tr('crm.tm.renamed'))) });
        const others = tags.filter((x) => x.id !== t.id);
        const target = el('select', { 'aria-label': tr('crm.tm.merge_aria', { name: t.name }), disabled: !others.length },
          el('option', { value: '' }, tr(others.length ? 'crm.tm.merge_into' : 'crm.tm.no_other')), others.map((x) => el('option', { value: x.id }, x.name)));
        const merge = async () => {
          const to = others.find((x) => x.id === target.value);
          if (!to) { msg.textContent = tr('crm.tm.pick_first'); return; }
          const yes = await UI.confirm(tr('crm.tm.merge_q', { from: t.name, to: to.name }),
            tr('crm.tm.merge_body', { what: plural(n), from: t.name, to: to.name }), tr('crm.tm.merge'));
          if (yes) await run(NS.labels.mergeTags(t.id, to.id), tr('crm.tm.merged', { name: to.name }));
        };
        const remove = async () => {
          const yes = await UI.confirm(tr('crm.tm.del_q', { name: t.name }),
            tr('crm.tm.del_body', { what: n ? plural(n) : tr('crm.tm.every') }), tr('ui.delete'), { danger: true });
          if (yes) await run(NS.labels.deleteTag(t.id), tr('crm.tm.deleted'));
        };
        return el('li', { class: 'lab-row' },
          el('span', { class: `tag-chip tg-${t.color}`, 'aria-hidden': 'true' }, t.name.slice(0, 14)),
          name,
          colourSelect(t.color, tr('crm.tm.colour_of', { name: t.name }), (c) => run(NS.labels.recolourTag(t.id, c), tr('crm.tm.colour_changed'))),
          el('span', { class: 'lab-count' }, plural(n)),
          el('button', { type: 'button', class: 'btn small', onclick: () => run(NS.labels.renameTag(t.id, name.value), tr('crm.tm.renamed')) }, tr('crm.tm.rename')),   // i18n-ignore: class names
          target, el('button', { type: 'button', class: 'btn small', disabled: !others.length, onclick: merge }, tr('crm.tm.merge')),   // i18n-ignore: class names
          el('button', { type: 'button', class: 'btn small danger', onclick: remove }, tr('ui.delete')));   // i18n-ignore: class names
      };
      const draw = async () => {
        const [lab, cs] = await Promise.all([NS.labels.load(), NS.customers.load()]);
        if (!lab.ok || !cs.ok) { msg.textContent = NS.util.refusal(lab.ok ? cs : lab); return; }
        const counts = NS.labels.countsOf(cs.value, 'tagIds');
        const tags = lab.value.tags;
        body.replaceChildren(note, addRow, msg,
          tags.length
            ? el('ul', { class: 'lab-list', 'aria-label': tr('crm.tm.tags') }, tags.map((t) => row(t, tags, counts.get(t.id) || 0)))
            : el('p', { class: 'empty' }, tr('crm.tm.none')));
      };
      UI.dialog({ title: tr('crm.tm.tags'), cls: 'lab-dlg', body, buttons: [{ label: tr('ui.done'), primary: true }], onClose: () => resolve() });
      draw();
    });
  }

  NS.tagManager = { open };
})(typeof window !== 'undefined' ? window : globalThis);
