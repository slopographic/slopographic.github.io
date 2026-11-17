// Parts shared by the customer form and the detail panel: a labelled field with its message, a section, the editable
// rows of phones, emails and addresses, the photo, avatars, and the picker of tags or groups. Each message element
// carries data-err="<field key>" and each input data-key="<field key>", so the form can show a message by key.
(function (g) {
  'use strict';
  const NS = (g.SlopCrm = g.SlopCrm || {});
  const UI = g.SlopUI;
  const el = UI.el;
  const tr = (k, v) => NS.tr(k, v);   // the string tables (crm/i18n)
  const NOUN = { phone: 'crm.fp.phone', email: 'crm.fp.email', address: 'crm.fp.address' };   // keys; lower case: crm.fp.k_<kind>
  const INPUT_TYPE = { phone: 'tel', email: 'email', address: 'text' };

  /** A labelled field. The key names the message under it and the input for focus and invalid marks. */
  function fld(key, label, input, hint) {
    input.setAttribute('data-key', key);
    return el('div', { class: 'fld' },
      el('label', { class: 'fld-l' }, el('span', { class: 'fld-t' }, label), input),
      hint ? el('span', { class: 'fld-hint' }, hint) : null,
      el('span', { class: 'fld-err', 'data-err': key, role: 'alert' }));
  }

  /** A titled group of fields. */
  const section = (title, ...kids) => el('fieldset', { class: 'fs' }, el('legend', { class: 'fs-h' }, title), el('div', { class: 'fs-body' }, kids));

  /** The initials of a name, for an avatar without a photo. */
  function initials(name) {
    return String(name || '').trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0)).join('').toUpperCase() || '?';
  }

  /** A customer's photo, or its initials. cls is the css class for the size. */
  function avatar(c, cls) {
    return c.photo
      ? el('img', { class: cls, src: c.photo, alt: '', loading: 'lazy' })
      : el('span', { class: `${cls} av-none`, 'aria-hidden': 'true' }, initials(c.name));
  }

  /**
   * Rows of one kind (phone, email or address), edited in place. The first row is the main one. An empty list shows
   * one blank row. Remove takes a row out; the last one is replaced by a blank row.
   */
  function entries(kind, rows) {
    const box = el('div', { class: 'entries' });
    const blank = () => ({ label: NS.fields.DEFAULT_LABEL[kind], value: '' });
    const draw = () => {
      if (!rows.length) rows.push(blank());
      box.replaceChildren(...rows.map((r, i) => {
        const key = `${kind}:${i}`;
        const opts = NS.fields.LABELS[kind].includes(r.label) ? NS.fields.LABELS[kind] : [r.label, ...NS.fields.LABELS[kind]];
        const label = el('select', { 'aria-label': tr('crm.fp.label_n', { kind: tr(NOUN[kind]), n: String(i + 1) }), onchange: (e) => { r.label = e.target.value; } },
          opts.map((x) => el('option', { value: x, selected: x === r.label }, NS.labelWord(x))));
        const value = el('input', { type: INPUT_TYPE[kind], value: r.value, maxlength: NS.fields.LIMIT[kind], autocomplete: 'off',
          'aria-label': tr('crm.fp.value_n', { kind: tr(NOUN[kind]), n: String(i + 1) }), 'data-key': key, oninput: (e) => { r.value = e.target.value; } });
          const remove = el('button', { type: 'button', class: 'btn small', 'aria-label': tr('crm.fp.remove_n', { kind: tr('crm.fp.k_' + kind), n: String(i + 1) }),   // i18n-ignore: class names
          onclick: () => { rows.splice(i, 1); draw(); } }, '×');
        return el('div', { class: 'entry' }, label, value, remove, el('span', { class: 'fld-err', 'data-err': key, role: 'alert' }));
      }), el('button', { type: 'button', class: 'btn small add-row', disabled: rows.length >= NS.fields.MAX_ROWS,
        onclick: () => { rows.push(blank()); draw(); } }, tr('crm.fp.add_kind', { kind: tr('crm.fp.k_' + kind) })));
    };
    draw();
    return box;
  }

  /** A customer's photo comes in one way (shared/intake, spec 'crm', no paste): the button's picker. Resolves the take's
   *  summary; its value is the shrunk picture (or null when it is too large). */
  function pickPhoto() {
    const SI = g.SlopIntake;
    if (!SI.spec('crm')) SI.register({ id: 'crm', limit: 1, paste: false, toast: false, accept: { types: ['image/*'], get noun() { return tr('crm.fp.picture'); } }, process: (f) => NS.photo.shrink(f) });
    return SI.pick({ to: 'crm', multiple: false, accept: 'image/*' });
  }
  /** The photo: the picture or the initials, with Add, Change and Remove. The value is kept in v.photo. */
  function photo(v) {
    const box = el('div', { class: 'photo' });
    let note = '';
    const draw = () => {
      box.replaceChildren(avatar({ photo: v.photo, name: v.name }, 'av av-lg'), el('div', { class: 'photo-ctl' },
        el('button', { type: 'button', class: 'btn small', onclick: async () => {   // i18n-ignore: class names
          const r = await pickPhoto();
          if (r.cancelled && !r.added.length) return;
          const url = r.added[0] && r.added[0].value;
          note = url ? '' : tr(r.skipped[0] ? 'crm.fp.not_pic' : 'crm.fp.too_large');
          if (url) v.photo = url;
          draw();
        } }, tr(v.photo ? 'crm.fp.change_photo' : 'crm.fp.add_photo')),
        v.photo ? el('button', { type: 'button', class: 'btn small', onclick: () => { v.photo = ''; note = ''; draw(); } }, tr('crm.fp.remove_photo')) : null,   // i18n-ignore: class names
        el('span', { class: 'fld-err', 'data-err': 'photo', role: 'alert' }, note)));
    };
    draw();
    return box;
  }

  const chip = (kind, x, onX) => el('span', { class: kind === 'tag' ? `tag-chip tg-${x.color}` : 'tag-chip grp' }, x.name,
    el('button', { type: 'button', class: 'chip-x', 'aria-label': tr('crm.fp.remove', { name: x.name }), onclick: onX }, '×'));

  /**
   * Tags or groups of one customer: chips to remove, a picker to add, and a link to the manager. onChange gets the
   * new list of ids each time it changes. The picker reloads the labels, so a new tag shows at once.
   */
  function labelPicker(kind, ids, onChange) {
    const tagKind = kind === 'tag';
    const box = el('div', { class: 'lp' });
    let cur = (ids || []).slice();
    const set = (next) => { cur = next; onChange(next); draw(); };
    const draw = async () => {
      const r = await NS.labels.load();
      if (!r.ok) { box.replaceChildren(el('p', { class: 'msg' }, NS.util.refusal(r))); return; }
      const all = kind === 'tag' ? r.value.tags : r.value.groups;
      const on = all.filter((x) => cur.includes(x.id));
      const free = all.filter((x) => !cur.includes(x.id));
      const pick = el('select', { 'aria-label': tr(tagKind ? 'crm.fp.add_tag' : 'crm.fp.add_group'), disabled: !free.length },
        el('option', { value: '' }, free.length ? tr(tagKind ? 'crm.fp.add_tag_dots' : 'crm.fp.add_group_dots') : tr('crm.fp.none_left')), free.map((x) => el('option', { value: x.id }, x.name)));
      box.replaceChildren(
        on.length ? el('div', { class: 'chips' }, on.map((x) => chip(kind, x, () => set(cur.filter((i) => i !== x.id))))) : el('p', { class: 'note' }, tr('crm.fp.none_yet')),
        el('div', { class: 'inline' }, pick,
          el('button', { type: 'button', class: 'btn small', onclick: () => { if (pick.value) set(NS.labels.withId(cur, pick.value)); } }, tr('crm.fp.add')),   // i18n-ignore: class names
          el('button', { type: 'button', class: 'btn small', onclick: async () => {   // i18n-ignore: class names
            await (kind === 'tag' ? NS.tagManager.open() : NS.groupsPanel.open());
            draw();
          } }, tr(kind === 'tag' ? 'crm.fp.manage_tags' : 'crm.fp.manage_groups'))));
    };
    draw();
    return box;
  }

  NS.parts = { fld, section, initials, avatar, entries, photo, labelPicker };
})(typeof window !== 'undefined' ? window : globalThis);
