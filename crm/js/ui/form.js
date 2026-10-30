// The customer form, in a SlopUI dialog with six sections: Contact, Company, Addresses, Tags and groups, Notes and
// Follow-up. Each field shows its own message next to it. Saving with a bad field keeps the dialog open at that field.
// Reset puts the values back from when the form opened (SlopFormReset, shared).
(function (g) {
  'use strict';
  const NS = (g.SlopCrm = g.SlopCrm || {});
  const UI = g.SlopUI;
  const el = UI.el;
  const tr = (k, v) => NS.tr(k, v);   // the string tables (crm/i18n)
  const FIELD_NAMES = ['name', 'company', 'department', 'title', 'website', 'followUp', 'notes', 'photo', 'stage'];
  const sub = (title, ...kids) => el('div', { class: 'sub' }, el('span', { class: 'sub-t' }, title), kids);

  /** Removes every message from the form. */
  function clearErrors(form) {
    for (const e of form.querySelectorAll('.fld-err')) e.textContent = '';
    for (const i of form.querySelectorAll('[aria-invalid="true"]')) i.removeAttribute('aria-invalid');
  }

  /** Shows one message per field key, marks those inputs, and moves focus to the first one. */
  function showErrors(form, errs) {
    clearErrors(form);
    for (const [key, msg] of Object.entries(errs)) {
      const err = form.querySelector(`[data-err="${key}"]`);
      if (err) err.textContent = msg;
      const input = form.querySelector(`[data-key="${key}"]`);
      if (input) input.setAttribute('aria-invalid', 'true');
    }
    const first = form.querySelector('[aria-invalid="true"]');
    if (first) first.focus();
  }

  /** Reads every field back from the form before a save, so a value set without an input event (a paste, a script) counts. */
  function readBack(body, v) {
    for (const i of body.querySelectorAll('[data-key]')) {
      const key = i.dataset.key;
      const row = /^(phone|email|address):(\d+)$/.exec(key);
      if (row) { const r = v[NS.fields.PLURAL[row[1]]][Number(row[2])]; if (r) r.value = i.value; }
      else if (key === 'categories') v.categories = NS.util.tags(i.value);
      else if (typeof v[key] === 'string') v[key] = i.value;
    }
  }

  /** The messages for a refused save: the field errors the store names, else the refusal text under the form. */
  function serverErrors(r) {
    const list = r.errors || [];
    const out = {};
    for (const e of list) if (FIELD_NAMES.includes(e.field)) out[e.field] = e.message;
    if (!list.length || Object.keys(out).length < list.length) out.form = NS.util.refusal(r);
    return out;
  }

  /** Opens the form for a new customer (id null) or an existing one. */
  async function open(id) {
    let cur = {};
    if (id) {
      const r = await NS.customers.get(id);
      if (!r.ok || !r.value) { UI.toast(r.ok ? tr('crm.fm.gone') : NS.util.refusal(r)); return; }
      cur = r.value;
    }
    const P = NS.parts;
    const v = NS.fields.toForm(cur);
    const bind = (input, key, ev = 'input') => { input.addEventListener(ev, () => { v[key] = input.value; }); return input; };
    const text = (key, max = 200) => bind(el('input', { type: 'text', value: v[key], maxlength: max, autocomplete: 'off' }), key);
    const stage = bind(UI.select(NS.STAGES.map((s) => [s, NS.stageLabel(s)]), v.stage), 'stage', 'change');
    const followUp = bind(el('input', { type: 'date', value: v.followUp }), 'followUp');
    const cats = el('input', { type: 'text', value: v.categories.join(', '), maxlength: 400, autocomplete: 'off' });
    cats.addEventListener('input', () => { v.categories = NS.util.tags(cats.value); });
    const notes = el('textarea', { rows: 5, maxlength: 5000 }, v.notes);
    notes.addEventListener('input', () => { v.notes = notes.value; });

    const body = el('form', { class: 'crm-form', novalidate: true, onsubmit: (e) => e.preventDefault(),
      oninput: () => clearErrors(body), onchange: () => clearErrors(body) },
    P.section(tr('crm.fm.contact'),
    P.fld('name', tr('crm.fm.name'), text('name')),
      P.photo(v),
      sub(tr('crm.fm.phones'), P.entries('phone', v.phones)),
      sub(tr('crm.fm.emails'), P.entries('email', v.emails))),
      P.section(tr('crm.fm.company_sec'),
      P.fld('company', tr('crm.fm.company'), text('company')),
      P.fld('department', tr('crm.fm.dept'), text('department')),
      P.fld('title', tr('crm.fm.job'), text('title')),
      P.fld('website', tr('crm.fm.website'), text('website', 300), tr('crm.fm.website_hint'))),
      P.section(tr('crm.fm.addresses'), sub(tr('crm.fm.postal'), P.entries('address', v.addresses))),
      P.section(tr('crm.fm.tags_groups'),
      el('p', { class: 'note' }, tr('crm.fm.tg_note')),
      sub(tr('crm.fm.tags'), P.labelPicker('tag', v.tagIds, (ids) => { v.tagIds = ids; })),
      sub(tr('crm.fm.groups'), P.labelPicker('group', v.groupIds, (ids) => { v.groupIds = ids; })),
      P.fld('categories', tr('crm.fm.cats'), cats, tr('crm.fm.cats_hint'))),
      P.section(tr('crm.fm.notes'),
      P.fld('notes', tr('crm.fm.notes'), notes, tr('crm.fm.notes_hint'))),
      P.section(tr('crm.fm.followup'),
      P.fld('stage', tr('crm.fm.stage'), stage),
      P.fld('followUp', tr('crm.fm.follow_date'), followUp, tr('crm.fm.follow_hint'))),
    el('p', { class: 'msg fld-err', 'data-err': 'form', role: 'alert' }));

    const save = async () => {
      readBack(body, v);
      const errs = NS.fields.validate(v);
      if (Object.keys(errs).length) { showErrors(body, errs); return false; }
      const r = await NS.customers.save(id, NS.fields.toChanges(v));
      if (!r.ok) { showErrors(body, serverErrors(r)); return false; }
      UI.toast(tr(id ? 'crm.fm.saved' : 'crm.fm.added'));
      return true;
    };
    SlopFormReset.snapshot(body);
    UI.dialog({
      title: tr(id ? 'crm.fm.edit' : 'crm.fm.add'), cls: 'crm-dlg', body,
      buttons: [{ label: tr('menu.cancel') }, SlopFormReset.dialogButton(body), { label: tr('menu.save'), primary: true, act: save }],
    });
  }

  NS.form = { open };
})(typeof window !== 'undefined' ? window : globalThis);
