/* Slop Contacts: the tools dialogs. Duplicate review (merge a group or all), clean up (bulk fixes), find and replace,
 * add or remove a group on the selection, delete the selection, and the default country code.
 * Bulk changes act on the selection when there is one, otherwise on every contact. Adds SlopContacts.tools. */
(function () {
  'use strict';
  const SC = window.SlopContacts;
  const S = SC.state;
  const UI = window.SlopUI;
  const el = UI.el;
  const tr = (k, v) => SC.tr(k, v);
  const scopeName = (sel) => (sel ? tr('contacts.tl.selected', { n: String(S.sel.size) }) : tr('contacts.tl.all_n', { n: String(S.list.length) }));

  /** Radios for "selection" or "all". Returns { el, value() }. */
  function scopeRadios(hasSel) {
    let v = hasSel ? 'sel' : 'all';
    const mk = (value, label) => {
      const r = el('input', { type: 'radio', name: 'bulk-scope', value, checked: v === value });
      r.addEventListener('change', () => { if (r.checked) v = value; });
      return el('label', { class: 'sui-check' }, r, el('span', null, label));
    };
    return { el: el('div', { class: 'ed-scope' }, mk('sel', tr('contacts.tl.sel_n', { n: String(S.sel.size) })), mk('all', tr('contacts.tl.all_count', { n: String(S.list.length) }))), value: () => v };
  }

  /** Duplicate review: a list of groups, each with Merge, and Merge all. Exact copies are already merged on import.
   * Merge and Merge all open a review list first (one line per proposed merge, checked), and only the checked merges
   * are applied. The toast after a merge can undo it. */
  function dupesDialog() {
    const cc = S.cc;
    const RV = window.SlopReview;
    const key = (g) => g.map((c) => c.id).join('|');
    let groups = SC.dedupe.findGroups(S.list, cc);
    if (!groups.length) { UI.alert(tr('contacts.tl.no_dupes_title'), tr('contacts.tl.no_dupes')); return; }
    const box = el('div', { class: 'dupes' });
    const head = el('p', { class: 'sui-p' });
    const paint = () => {
      groups = SC.dedupe.findGroups(S.list, cc);
      const exact = groups.filter(SC.dedupe.isExact).length;
      head.textContent = groups.length
        ? tr(exact ? 'contacts.tl.groups_exact' : 'contacts.tl.groups_found', { n: groups.length, exact: String(exact) })
        : tr('contacts.tl.none_left');
      box.replaceChildren(...groups.map((g) => {
        const names = g.map((c) => SC.model.displayName(c)).join(' + ');
        const why = SC.dedupe.reasonsOf(g, cc).join(', ');
        const mergeBtn = el('button', { type: 'button', class: 'sui-btn sui-primary' }, tr('contacts.tl.merge'));
        mergeBtn.addEventListener('click', () => reviewMerge([g], tr('contacts.tl.merge_one_q')));
        return el('div', { class: 'dupe' }, el('div', { class: 'dn' }, names), el('div', { class: 'dr' }, why || tr('contacts.tl.matching')), mergeBtn);
      }));
    };
    /** Lists the proposed merges, then applies the ones left checked. */
    async function reviewMerge(gs, title) {
      const items = gs.map((g) => ({ id: key(g), label: g.map((c) => SC.model.displayName(c)).join(' + '),
        detail: SC.dedupe.reasonsOf(g, cc).join(', ') || tr('contacts.tl.matching'), checked: true }));
        const ids = await RV.open({ title, items, intro: tr('contacts.tl.review_intro'),
          confirmLabel: (n) => tr('contacts.tl.merge_n', { n }) });
      if (!ids) return;
      const want = new Set(ids);
      const apply = gs.filter((g) => want.has(key(g)));
      if (!apply.length) return;
      const before = S.list;
      S.setList(SC.dedupe.applyMerges(S.list, apply, cc));
      paint();
      UI.toast(tr('contacts.tl.merged', { n: apply.length }), 6000, { label: tr('contacts.tl.undo'), run: () => { S.setList(before); paint(); } });
    }
    paint();
    const all = { label: tr('contacts.tl.merge_all'), act: () => { reviewMerge(groups, tr('contacts.tl.merge_all_q')); return false; } };
    UI.dialog({ title: tr('contacts.tl.find_dupes'), cls: 'dupe-dlg', body: el('div', null, head, box), buttons: [{ label: tr('contacts.tl.close') }, all] });
  }

  /** Clean up: the bulk fixes. */
  function cleanDialog() {
    const hasSel = S.sel.size > 0;
    const o = { trim: true, titleCase: false, e164: false, lowerEmail: true, removeEmpty: true };
    const check = (key, label) => {
      const c = UI.check(label, o[key]);
      c.input.addEventListener('change', () => { o[key] = c.input.checked; });
      return c.el;
    };
    const cc = UI.field(tr('contacts.tl.cc'), el('input', { class: 'sui-input', id: 'cleanCc', value: S.cc, placeholder: tr('contacts.tl.cc_ph'), 'aria-label': tr('contacts.tl.cc'), autocomplete: 'off' }));
    const ccIn = cc.querySelector('input');
    const scope = scopeRadios(hasSel);
    const body = el('div', null,
      el('p', { class: 'sui-p' }, tr('contacts.tl.applies', { scope: scopeName(hasSel) })),
      scope.el,
      check('trim', tr('contacts.tl.trim')),
      check('titleCase', tr('contacts.tl.title_case')),
      check('e164', tr('contacts.tl.e164')),
      check('lowerEmail', tr('contacts.tl.lower_email')),
      check('removeEmpty', tr('contacts.tl.remove_empty')),
      cc);
    UI.dialog({ title: tr('contacts.tl.clean_title'), body, buttons: [{ label: tr('menu.cancel') }, { label: tr('contacts.tl.apply'), primary: true, act: () => {
      S.setCc(ccIn.value);
      const r = SC.bulk.cleanup(S.list, scope.value() === 'sel' ? S.scope() : null, { ...o, cc: S.cc });
      if (r.changed) S.setList(r.list);
      UI.toast(r.changed ? tr('contacts.tl.cleaned', { n: r.changed }) : tr('contacts.tl.nothing'));
      return undefined;
    } }] });
  }

  /** Find and replace inside one field group, plain text. */
  function findDialog() {
    const hasSel = S.sel.size > 0;
    const field = UI.select(SC.bulk.FIELD_GROUPS.map((f) => [f, tr('contacts.tl.f_' + f)]), 'all');
    const find = el('input', { class: 'sui-input', id: 'findText', placeholder: tr('contacts.tl.find'), 'aria-label': tr('contacts.tl.find'), autocomplete: 'off' });
    const rep = el('input', { class: 'sui-input', id: 'replaceText', placeholder: tr('contacts.tl.replace_with'), 'aria-label': tr('contacts.tl.replace_with'), autocomplete: 'off' });
    const cs = UI.check(tr('contacts.tl.match_case'), false);
    const scope = scopeRadios(hasSel);
    const body = el('div', null, scope.el, UI.field(tr('contacts.tl.field'), field), UI.field(tr('contacts.tl.find'), find), UI.field(tr('contacts.tl.replace_with'), rep), cs.el);
    UI.dialog({ title: tr('contacts.tl.find_replace'), body, buttons: [{ label: tr('menu.cancel') }, { label: tr('contacts.tl.replace_all'), primary: true, act: () => {
      if (!find.value) { UI.toast(tr('contacts.tl.type_find')); return false; }
      const r = SC.bulk.findReplace(S.list, scope.value() === 'sel' ? S.scope() : null,
        { field: field.value, find: find.value, replace: rep.value, matchCase: cs.input.checked });
      if (r.changed) S.setList(r.list);
      UI.toast(r.count ? tr('contacts.tl.replaced', { count: String(r.count), n: r.changed }) : tr('contacts.tl.no_matches'));
      return undefined;
    } }] });
  }

  /** Add a group to the selection. */
  async function addGroupDialog() {
    if (!S.sel.size) { UI.toast(tr('contacts.tl.select_first')); return; }
    const name = await UI.prompt(tr('contacts.tl.add_group'), tr('contacts.tl.group_for', { n: S.sel.size }), '', { ok: tr('contacts.tl.add'), placeholder: tr('contacts.tl.group_ph') });
    if (!name || !name.trim()) return;
    const r = SC.bulk.addGroup(S.list, S.scope(), name);
    if (r.changed) S.setList(r.list);
    UI.toast(tr('contacts.tl.added_to', { name: name.trim(), n: r.changed }));
  }

  /** Remove a group from the selection (only groups the selection has). */
  function removeGroupDialog() {
    if (!S.sel.size) { UI.toast(tr('contacts.tl.select_first')); return; }
    const names = [...new Set(S.selected().flatMap((c) => c.groups))].sort();
    if (!names.length) { UI.toast(tr('contacts.tl.no_groups')); return; }
    const pick = UI.select(names.map((n) => [n, n]), names[0]);
    UI.dialog({ title: tr('contacts.tl.remove_group'), body: UI.field(tr('contacts.tl.group'), pick), buttons: [{ label: tr('menu.cancel') }, { label: tr('contacts.tl.remove'), primary: true, act: () => {
      const r = SC.bulk.removeGroup(S.list, S.scope(), pick.value);
      if (r.changed) S.setList(r.list);
      UI.toast(tr('contacts.tl.removed_from', { name: pick.value, n: String(r.changed) }));
      return undefined;
    } }] });
  }

  /** Delete the selected contacts after a confirm (the same dialog as the Delete key). */
  async function deleteSelected() {
    if (!S.sel.size) { UI.toast(tr('contacts.tl.select_first')); return; }
    const n = S.sel.size;
    if (await SC.select.remove(new Set(S.sel))) UI.toast(tr('contacts.tl.deleted', { n: String(n) }));
  }

  /** The default country code for E.164 (per viewer, kept in the draft). */
  async function countryDialog() {
    const v = await UI.prompt(tr('contacts.tl.cc'), tr('contacts.tl.cc_body'), S.cc, { ok: tr('contacts.tl.save'), placeholder: '+44' });
    if (v === null) return;
    S.setCc(v);
    UI.toast(S.cc ? tr('contacts.tl.cc_set', { cc: S.cc }) : tr('contacts.tl.cc_kept'));
  }

  SC.tools = { dupesDialog, cleanDialog, findDialog, addGroupDialog, removeGroupDialog, deleteSelected, countryDialog };
})();
