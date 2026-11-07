/* Slop Contacts: the CSV column mapping step. Each column shows its header, an example value and the field it will go
 * to (guessed; the person can change it). Next gives the contacts for the preview; Cancel imports nothing.
 * Adds SlopContacts.importMap.dialog(name, parsed) -> Promise<contacts | null>. */
(function () {
  'use strict';
  const SC = window.SlopContacts;
  const UI = window.SlopUI;
  const el = UI.el;

  /** One example value for a column: the first value that is not blank, shortened. */
  const example = (rows, i) => {
    const v = (rows.map((r) => (r[i] == null ? '' : String(r[i]))).find((x) => SC.text.tidy(x)) || '');
    return SC.text.tidy(v).slice(0, 48);
  };

  /** Shows the mapping for one parsed CSV ({ headers, rows }). Resolves with the contacts, [] when the file has no
   *  rows, or null when the person cancels. */
  function dialog(name, parsed) {
    return new Promise((resolve) => {
      const { headers, rows } = parsed;
      if (!headers.length || !rows.length) { resolve([]); return; }
      const tr = (k, v) => SC.tr(k, v);
      const selects = headers.map((h) => el('select', { class: 'sui-input', 'aria-label': tr('contacts.map.import_as', { name: h || tr('contacts.map.untitled') }) },
        SC.csvMap.TARGETS.map(([v]) => el('option', { value: v, selected: v === SC.csvMap.guessOne(h) }, tr('contacts.tgt.' + v)))));
      const table = el('table', { class: 'imp-map' },
        el('thead', null, el('tr', null, el('th', { scope: 'col' }, tr('contacts.map.column')), el('th', { scope: 'col' }, tr('contacts.map.example')), el('th', { scope: 'col' }, tr('contacts.map.as')))),
        el('tbody', null, headers.map((h, i) => el('tr', null,
          el('td', null, h || tr('contacts.map.col_n', { n: String(i + 1) })), el('td', { class: 'imp-ex' }, example(rows, i)), el('td', null, selects[i])))));
      const body = el('div', null,
        el('p', { class: 'sui-p' }, tr('contacts.map.rows', { n: rows.length, name })),
        el('div', { class: 'imp-wrap' }, table));
      let out = null;
      UI.dialog({ title: tr('contacts.map.title'), body, cls: 'imp-dlg', buttons: [{ label: tr('menu.cancel') }, { label: tr('contacts.map.next'), primary: true, act: () => {
        const targets = selects.map((s) => s.value);
        if (!targets.some((x) => x !== 'ignore')) { UI.toast(tr('contacts.map.need_one')); return false; }
        const contacts = SC.csvMap.contactsFrom(rows, targets);
        if (!contacts.length) { UI.toast(tr('contacts.map.no_rows')); return false; }
        out = contacts;
        return undefined;
      } }], onClose: (ok) => resolve(ok ? out : null) });
    });
  }

  SC.importMap = { dialog };
})();
