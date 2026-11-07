/* Slop Contacts: the card in edit mode. The same card turns into a form in place, in a fixed frame: a header with the
 * title, a body that scrolls (sections: Name, Contact details, Address, Notes, Pipeline and groups), and a footer with
 * Cancel and Save that is always in view. Rows are added inside the body; the add buttons sit at the top of their
 * section, so they do not move as rows appear. Enter saves, Cmd or Ctrl+Enter saves in notes, Escape cancels. The
 * first field has the focus. Adds SlopContacts.cardEdit. */
(function () {
  'use strict';
  const SC = window.SlopContacts;
  const S = SC.state;
  const UI = window.SlopUI;
  const el = UI.el;
  const LABELS = ['mobile', 'work', 'home', 'other'];
  const DATE_RX = /^(\d{4}-\d{2}-\d{2}|--\d{2}-\d{2})$/;
  let snapshot = '', cancelNow = null;
  const tr = (k, v) => SC.tr(k, v);

  /** Text field with a caption. */
  const field = (label, input) => el('label', { class: 'ed-f' }, el('span', { class: 'ed-k' }, label), input);
  const text = (value, attrs = {}) => el('input', { type: 'text', value: value || '', maxlength: 300, autocomplete: 'off', spellcheck: 'false', ...attrs });
  /** Brings a new row's field into view without moving the frame: only the scroll body moves, and only when needed. */
  const reveal = (node) => { node.focus({ preventScroll: true }); node.scrollIntoView({ block: 'nearest' }); };

  /** Rows of labelled values: a label menu, the value and Remove, on one grid so the rows line up. add() appends an empty
   * row and gives it the focus; get() gives { types, value } for each filled row. */
  function multi(kind, items) {
    const rows = [];
    const list = el('div', { class: 'ed-rows' });
    const labelMenu = (label) => {
      const opts = LABELS.includes(label) ? LABELS : [...LABELS, label].filter(Boolean);
      return el('select', { class: 'ed-label', 'aria-label': tr('contacts.ed.label', { kind: tr('contacts.kind.' + kind) }) }, opts.map((o) => el('option', { value: o, selected: o === label }, SC.labelWord(o))));
    };
    const addRow = (it) => {
      const sel = labelMenu(it ? SC.customerMap.labelOf(it.types, kind) : SC.customerMap.DEFAULT[kind]);
      const input = kind === 'address' ? el('textarea', { rows: 2, maxlength: 1000, 'aria-label': tr('contacts.ed.address') }, it ? it.street : '')
        : text(it ? it.value : '', { 'aria-label': tr('contacts.kind.' + kind), type: kind === 'email' ? 'email' : 'text', maxlength: kind === 'email' ? 200 : 60, inputmode: kind === 'phone' ? 'tel' : 'text' });
      const entry = { sel, input };
      const row = el('div', { class: 'ed-row' }, sel, input, el('button', { type: 'button', class: 'text-btn ed-rm', 'aria-label': tr('contacts.ed.remove_kind', { kind: tr('contacts.kind.' + kind) }),
        onclick: () => { row.remove(); rows.splice(rows.indexOf(entry), 1); } }, tr('contacts.ed.remove')));
      rows.push(entry);
      list.append(row);
      return entry;
    };
    for (const it of items) addRow(it);
    const add = () => reveal(addRow(null).input);
    const get = () => rows.map((r) => ({ types: SC.customerMap.typesOf(r.sel.value), value: r.input.value.trim(), street: r.input.value.trim() }))
      .filter((r) => r.value)
      .map((r) => (kind === 'address' ? { types: r.types, street: r.street } : { types: r.types, value: r.value }));
    return { el: list, add, get };
  }

  /** The form's values as a contact. */
  function collect(c, f) {
    const tags = [...new Set(f.groups.value.split(',').map((s) => s.trim()).filter(Boolean))];
    const act = SC.activity.split(c.note).activity;
    return SC.model.normalise({
      ...c,
      name: { prefix: '', given: '', additional: '', family: '', suffix: '' }, fn: f.name.value.trim(),
      org: f.org.value.trim(), dept: f.dept.value.trim(), title: f.title.value.trim(), bday: f.bday.value.trim(),
      url: f.url.value.trim(), groups: tags, photo: f.photo.get(), phones: f.phones.get(), emails: f.emails.get(), adr: f.addrs.get(),
      note: SC.activity.join(f.notes.value, act),
    });
  }
  /** Everything the form holds, for the unsaved-change check. */
  const values = (f) => JSON.stringify([f.name.value, f.org.value, f.dept.value, f.title.value, f.bday.value, f.url.value, f.groups.value,
    f.notes.value, f.photo.get(), f.phones.get(), f.emails.get(), f.addrs.get()]);

  /** A labelled section: the heading, an optional add button on its right, then the content. */
  function section(id, title, add, ...kids) {
    return el('section', { class: 'ed-sec', 'aria-labelledby': id },
      el('div', { class: 'ed-sec-top' }, el('h3', { class: 'ed-sec-h', id }, title), add || null), ...kids);
  }
  const addBtn = (label, fn) => el('button', { type: 'button', class: 'text-btn ed-add', onclick: fn }, label);

  /** Draws the form for contact c. */
  function render(c) {
    const body = document.getElementById('cardBody');
    const plain = SC.activity.split(c.note).plain;
    const photo = SC.photoUi.field(c);
    const f = {
      photo,
      name: text(c.fn, { 'aria-label': tr('contacts.ed.name'), required: false }),
      org: text(c.org, { 'aria-label': tr('contacts.ed.company') }), dept: text(c.dept, { 'aria-label': tr('contacts.ed.dept') }), title: text(c.title, { 'aria-label': tr('contacts.ed.job') }),
      phones: multi('phone', c.phones), emails: multi('email', c.emails), addrs: multi('address', c.adr),
      bday: text(c.bday, { 'aria-label': tr('contacts.ed.bday'), placeholder: tr('contacts.ed.bday_ph') }),
      url: text(c.url, { 'aria-label': tr('contacts.ed.website'), type: 'url' }),
      groups: text(c.groups.join(', '), { 'aria-label': tr('contacts.ed.groups_aria'), maxlength: 600 }),
      notes: el('textarea', { rows: 4, maxlength: 5000, 'aria-label': tr('contacts.ed.notes') }, plain),
    };
    const msg = el('p', { class: 'ed-msg', role: 'alert' });
    const save = () => {
      const bday = f.bday.value.trim();
      if (bday && !DATE_RX.test(bday)) { msg.textContent = tr('contacts.ed.bad_bday'); return; }
      S.replaceMany([collect(c, f)]);
      S.mode = 'view';
      S.emit('render');
    };
    const cancel = async () => {
      if (values(f) !== snapshot && !(await UI.confirm(tr('contacts.ed.discard_q'), tr('contacts.ed.discard_body'), tr('contacts.ed.discard'), { danger: true }))) return;
      S.mode = 'view';
      S.emit('render');
    };
    cancelNow = cancel;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); } // leaves edit mode; the card stays
      else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
    };
    const form = el('form', { class: 'ed-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); save(); }, onkeydown: onKey },
      el('header', { class: 'ed-head' }, el('h2', { class: 'ed-title' }, tr('contacts.ed.title')), SC.card.modeSwitch('edit')),
      el('div', { class: 'ed-body' }, el('div', { class: 'ed-in' },
        section('ed-h-name', tr('contacts.ed.name'), null, photo.el,
          el('div', { class: 'ed-grid' }, field(tr('contacts.ed.name'), f.name), field(tr('contacts.ed.company'), f.org), field(tr('contacts.ed.dept'), f.dept), field(tr('contacts.ed.job'), f.title))),
        section('ed-h-contact', tr('contacts.ed.contact'), null,
          el('div', { class: 'ed-sub' }, el('div', { class: 'ed-sub-top' }, el('span', { class: 'ed-k' }, tr('contacts.ed.phone')), addBtn(tr('contacts.ed.add_phone'), f.phones.add)), f.phones.el),
          el('div', { class: 'ed-sub' }, el('div', { class: 'ed-sub-top' }, el('span', { class: 'ed-k' }, tr('contacts.ed.email')), addBtn(tr('contacts.ed.add_email'), f.emails.add)), f.emails.el),
          el('div', { class: 'ed-grid' }, field(tr('contacts.ed.bday'), f.bday), field(tr('contacts.ed.website'), f.url))),
        section('ed-h-address', tr('contacts.ed.address'), addBtn(tr('contacts.ed.add_address'), f.addrs.add), f.addrs.el),
        section('ed-h-notes', tr('contacts.ed.notes'), null, el('label', { class: 'ed-f' }, f.notes),
          el('p', { class: 'ed-hint' }, tr('contacts.ed.notes_hint'))),
        section('ed-h-groups', tr('contacts.ed.pipe_groups'), null,
          field(tr('contacts.ed.groups'), f.groups),
          el('p', { class: 'ed-hint' }, tr('contacts.ed.pipe_hint'))))),
      el('footer', { class: 'ed-foot' }, msg));
    form.id = 'edForm';
    // Cancel and Save are the card's footer (card.js, the shared footer); Save still submits this form
    SC.cardEdit.buttons = [el('button', { type: 'button', class: 'btn', 'data-act': 'cancel', onclick: cancel }, tr('menu.cancel')),
      el('button', { type: 'submit', class: 'btn primary', form: 'edForm' }, tr('menu.save'))];   // i18n-ignore: class names
    body.replaceChildren(form);
    snapshot = values(f);
    setTimeout(() => f.name.focus({ preventScroll: true }), 30);
  }

  /** Leaves edit mode the way Escape does (asks first when there are unsaved changes). */
  SC.cardEdit = { render, cancel: () => cancelNow && cancelNow(), buttons: [] };
})();
