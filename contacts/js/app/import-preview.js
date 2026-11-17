/* Slop Contacts: the import preview. Lists what will be added. Each contact that matches one already in the list on
 * e-mail or phone is flagged as a duplicate, and the person picks what happens to those: skip, merge into the existing
 * contact, or add a new one. Import applies the whole choice in one change. Undo (in the toast) puts the list back,
 * while nothing else has changed since the import (the revision counter in state.js). Adds SlopContacts.importPreview. */
(function () {
  'use strict';
  const SC = window.SlopContacts;
  const S = SC.state;
  const UI = window.SlopUI;
  const el = UI.el;
  let undo = null; // { before, rev } for the last import
  const tr = (k, v) => SC.tr(k, v);

  /** Puts the list back as it was before the last import. Refused when anything was changed since. */
  function undoLast() {
    const u = undo;
    undo = null;
    if (!u) return;
    if (S.rev !== u.rev) { UI.toast(tr('contacts.pv.changed')); return; }
    S.setList(u.before);
    UI.toast(tr('contacts.pv.undone'));
  }

  /* (counts are formatted by the string tables: contacts.pv.*) */
  /** A line under a name: the company, else the first e-mail or phone. */
  const subOf = (c) => c.org || (c.emails[0] && c.emails[0].value) || (c.phones[0] && c.phones[0].value) || '';

  /** The preview for incoming contacts. sourceLabel names the files; errors lists files that could not be read.
   *  opts.keepIds: an added contact keeps its incoming id when no contact in the list has it (the Drive bundle, whose
   *  X-SLOP-ID makes a later import a match). Resolves with true when the import was applied. */
  function show(incoming, sourceLabel, errors = [], { keepIds = false } = {}) {
    return new Promise((resolve) => {
      const cc = S.cc, rows = SC.importPlan.plan(S.list, incoming, cc);
      const taken = new Set(S.list.map((c) => c.id));
      const idFor = (c) => { const id = keepIds && c.id && !taken.has(c.id) ? c.id : SC.records.newId(); taken.add(id); return id; };
      const dups = rows.filter((r) => r.match).length, fresh = rows.length - dups;
      let choice = 'skip', applied = false;
      const summary = el('p', { class: 'sui-p imp-sum', 'aria-live': 'polite' });
      const list = el('ul', { class: 'imp-list', role: 'list' });
      const statusOf = (r) => {
        if (!r.match) return tr('contacts.pv.new');
        const what = tr(choice === 'skip' ? 'contacts.pv.skipped' : choice === 'merge' ? 'contacts.pv.merged' : 'contacts.pv.as_new');
        return tr('contacts.pv.dup_of', { name: r.match.fn, why: r.why.join(', '), what });
      };
      const paint = () => {
        const add = fresh + (choice === 'add' ? dups : 0), merge = choice === 'merge' ? dups : 0, skip = choice === 'skip' ? dups : 0;
        summary.textContent = tr('contacts.pv.summary', { fresh: String(fresh), dups: String(dups), add: String(add), merge: String(merge), skip: String(skip) });
        list.replaceChildren(...rows.map((r) => el('li', { class: 'imp-row' + (r.match ? ' is-dup' : '') },
          el('span', { class: 'imp-name' }, r.c.fn), el('span', { class: 'imp-sub' }, subOf(r.c)), el('span', { class: 'imp-status' }, statusOf(r)))));
      };
      const radio = (value, label) => {
        const input = el('input', { type: 'radio', name: 'imp-dup', value, checked: value === choice });
        input.addEventListener('change', () => { if (input.checked) { choice = value; paint(); } });
        return el('label', { class: 'sui-check' }, input, el('span', null, label));
      };
      const choices = dups ? el('fieldset', { class: 'imp-choice' }, el('legend', null, tr('contacts.pv.dupes')),
        radio('skip', tr('contacts.pv.skip')),
        radio('merge', tr('contacts.pv.merge')),
        radio('add', tr('contacts.pv.add'))) : null;
      const body = el('div', null,
        el('p', { class: 'sui-p' }, tr('contacts.pv.from', { source: sourceLabel })),
        errors.length ? el('p', { class: 'sui-p imp-warn' }, tr('contacts.pv.unread', { list: errors.join(' ') })) : null,
        summary, choices, el('div', { class: 'imp-wrap' }, list));
      paint();
      const apply = () => {
        if (applied) return false;
        applied = true;
        const before = S.list;
        const res = SC.importPlan.apply(before, rows, choice, idFor, cc);
        S.setList(res.list);
        const bits = [];
        if (res.added) bits.push(tr('contacts.pv.n_added', { n: String(res.added) }));
        if (res.merged) bits.push(tr('contacts.pv.n_merged', { n: String(res.merged) }));
        if (res.skipped) bits.push(tr('contacts.pv.n_skipped', { n: String(res.skipped) }));
        undo = { before, rev: S.rev };
        UI.toast(tr('contacts.pv.imported', { what: bits.join(', ') || tr('contacts.pv.nothing_new') }), 6000, bits.length ? { label: tr('contacts.pv.undo'), run: undoLast } : null);
        return undefined;
      };
      UI.dialog({ title: tr('contacts.pv.title', { n: rows.length }), body, cls: 'imp-dlg', buttons: [
        { label: tr('menu.cancel') }, { label: tr('contacts.pv.import'), primary: true, act: apply }],
      onClose: (ok) => resolve(!!ok && applied) });
    });
  }

  SC.importPreview = { show, undo: undoLast };
})();
