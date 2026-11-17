/* Slop Contacts: the table view's columns, sorting and cell edits (no DOM). Columns: name, organisation, e-mail,
 * phone, groups, notes. A sort puts empty values last whichever way it goes. A cell edit returns a new contact (or an
 * error to show); a multi-value cell takes a list separated by commas or semicolons, and an entry kept in place keeps
 * its label. Classic script. Adds SlopContacts.tableModel. */
(function () {
  'use strict';
  const SC = (window.SlopContacts = window.SlopContacts || {});
  const M = SC.model, T = SC.text;
  const tr = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);

  const COLS = [
    { id: 'name', get label() { return tr('contacts.tbl.name'); }, get: (c) => c.fn, raw: (c) => c.fn, edit: true },
    { id: 'org', get label() { return tr('contacts.tbl.org'); }, get: (c) => c.org, raw: (c) => c.org, edit: true },
    { id: 'email', get label() { return tr('contacts.tbl.email'); }, get: (c) => c.emails.map((e) => e.value).join(', '), raw: (c) => c.emails.map((e) => e.value).join(', '), edit: true },
    { id: 'phone', get label() { return tr('contacts.tbl.phone'); }, get: (c) => c.phones.map((p) => p.value).join(', '), raw: (c) => c.phones.map((p) => p.value).join(', '), edit: true },
    { id: 'groups', get label() { return tr('contacts.tbl.groups'); }, get: (c) => c.groups.join(', '), raw: (c) => c.groups.join(', '), edit: true },
    { id: 'note', get label() { return tr('contacts.tbl.notes'); }, get: (c) => c.note.replace(/\s+/g, ' ').trim(), raw: (c) => c.note, edit: true, multi: true },
  ];
  const col = (id) => COLS.find((c) => c.id === id) || null;

  /** A copy of the list sorted by a column. dir is 'asc' or 'desc'. Empty values go last in both directions. */
  function sortBy(list, id, dir) {
    const cl = col(id);
    if (!cl) return list.slice();
    const sign = dir === 'desc' ? -1 : 1;
    const opts = { sensitivity: 'base', numeric: true };
    return list.slice().sort((a, b) => {
      const x = cl.get(a), y = cl.get(b);
      if (!x !== !y) return x ? -1 : 1;
      return sign * String(x).localeCompare(String(y), undefined, opts) || (a.fn < b.fn ? -1 : a.fn > b.fn ? 1 : 0);
    });
  }

  /** A list of values from text: split on commas or semicolons, trimmed, empty and repeated entries dropped. */
  const splitList = (s) => T.uniq(String(s || '').split(/[,;]/).map((x) => T.tidy(x)).filter(Boolean));

  /** The contact with one cell replaced by the text. Returns { contact } or { error }. */
  function edit(c, id, text) {
    const v = T.tidy(text);
    switch (id) {
      case 'name':
        if (!v) return { error: tr('contacts.tbl.empty_name') };
        return { contact: M.normalise({ ...c, name: SC.customerMap.splitName(v), fn: v }) };
      case 'org': return { contact: M.normalise({ ...c, org: v }) };
      case 'email': {
        const vals = splitList(text), bad = vals.find((x) => !x.includes('@'));
        if (bad) return { error: tr('contacts.tbl.bad_email', { value: bad }) };
        return { contact: M.normalise({ ...c, emails: vals.map((value, i) => ({ value, types: (c.emails[i] || {}).types || [] })) }) };
      }
      case 'phone': {
        const vals = splitList(text);
        return { contact: M.normalise({ ...c, phones: vals.map((value, i) => ({ value, types: (c.phones[i] || {}).types || [] })) }) };
      }
      case 'groups': return { contact: M.normalise({ ...c, groups: splitList(text) }) };
      case 'note': return { contact: M.normalise({ ...c, note: String(text || '') }) };
      default: return { error: tr('contacts.tbl.not_here') };
    }
  }

  SC.tableModel = { COLS, col, sortBy, edit, splitList };
})();
