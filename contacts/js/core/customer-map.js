/* Slop Contacts: maps a shared customer record (SlopData 'customers', see shared/data/HANDOFF.md) to the contact model
 * used by the codecs and the screen, and back. The record's phone, email and address (with phoneLabel, emailLabel and
 * addressLabel) are the first value of each kind, because other apps read them; the rest are in phones, emails and
 * addresses. Labels: mobile, work, home, other, or any text. Pure functions. Adds SlopContacts.customerMap.
 * A contact's name is split on its last word for the vCard N field; an address is kept on one line. */
(function () {
  'use strict';
  const SC = (window.SlopContacts = window.SlopContacts || {});
  const M = SC.model;
  const DEFAULT = { phone: 'mobile', email: 'work', address: 'work' };
  const SKIP = ['VOICE', 'PREF', 'INTERNET'];
  const BY_TYPE = { CELL: 'mobile', MOBILE: 'mobile', WORK: 'work', HOME: 'home', OTHER: 'other' };
  const BY_LABEL = { mobile: 'CELL', work: 'WORK', home: 'HOME', other: 'OTHER' };
  const clip = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);

  /** Contact types for a label: mobile -> CELL, work -> WORK, anything else -> its letters as one type. */
  function typesOf(label) {
    const l = clip(label, 40).toLowerCase();
    if (!l) return [];
    if (BY_LABEL[l]) return [BY_LABEL[l]];
    const t = l.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    return t ? [t] : [];
  }
  /** The label for a contact's types, or the default when it has none. */
  function labelOf(types, kind) {
    const t = (types || []).filter((x) => !SKIP.includes(x));
    if (!t.length) return DEFAULT[kind];
    return BY_TYPE[t[0]] || t[0].toLowerCase();
  }
  /** Splits a display name: the last word is the family name (for the vCard N field). */
  function splitName(name) {
    const w = clip(name, 200).split(' ').filter(Boolean);
    if (w.length < 2) return { prefix: '', given: w.join(' '), additional: '', family: '', suffix: '' };
    return { prefix: '', given: w.slice(0, -1).join(' '), additional: '', family: w[w.length - 1], suffix: '' };
  }
  /** One address on one line from the parts of a contact address. */
  const addressText = (a) => ['po', 'ext', 'street', 'locality', 'region', 'postal', 'country']
    .map((k) => clip(a && a[k], 300)).filter(Boolean).join(', ');

  /** Record fields to contact values: the primary first, then the extra entries. */
  function valuesOut(primary, label, extra, kind) {
    const rows = [];
    if (clip(primary, 1000)) rows.push({ value: clip(primary, 1000), label: label || DEFAULT[kind] });
    for (const e of Array.isArray(extra) ? extra : []) if (e && clip(e.value, 1000)) rows.push({ value: clip(e.value, 1000), label: e.label || DEFAULT[kind] });
    return rows;
  }

  /** A shared customer record to a contact (the shape the codecs and the screen use). */
  function toContact(rec) {
    const phones = valuesOut(rec.phone, rec.phoneLabel, rec.phones, 'phone')
      .map((r) => ({ value: r.value, types: typesOf(r.label) }));
    const emails = valuesOut(rec.email, rec.emailLabel, rec.emails, 'email')
      .map((r) => ({ value: r.value, types: typesOf(r.label) }));
    const adr = valuesOut(rec.address, rec.addressLabel, rec.addresses, 'address')
      .map((r) => ({ types: typesOf(r.label), street: r.value }));
    return M.normalise({
      id: rec.id, name: splitName(rec.name), fn: rec.name, org: rec.company, dept: rec.department, title: rec.title,
      phones, emails, adr, bday: rec.birthday, url: rec.website, note: rec.notes, groups: rec.categories,
      photo: rec.photo, stage: rec.stage, followUp: rec.followUp, tagIds: rec.tagIds,
    });
  }

  /** Field limits of the shared record (schema-defs.js). A value over a limit is cut, so one long value cannot stop a
   *  whole save: the store refuses a transaction when any record in it is invalid. */
  const LIMIT = { phone: 60, email: 200, address: 1000, notes: 5000, photo: 390000, groups: 20, group: 40, entries: 10 };

  /** Contact values to record fields: the first of each kind is the primary, the rest are extra entries. */
  function valuesIn(list, kind, max) {
    const rows = (Array.isArray(list) ? list : []).map((e) => ({ value: clip(e && e.value, max), label: labelOf(e && e.types, kind) }))
      .filter((r) => r.value).slice(0, LIMIT.entries);
    const [first, ...rest] = rows;
    return { primary: first ? first.value : undefined, label: first ? first.label : undefined, extra: rest.length ? rest : undefined };
  }

  /** A contact to the record fields, merged over the stored record (fields the screen does not show are kept). */
  function toRecord(c, cur) {
    const p = valuesIn(c.phones, 'phone', LIMIT.phone), e = valuesIn(c.emails, 'email', LIMIT.email);
    const a = (Array.isArray(c.adr) ? c.adr : []).map((x) => ({ value: clip(addressText(x), LIMIT.address), label: labelOf(x && x.types, 'address') }))
      .filter((x) => x.value).slice(0, LIMIT.entries);
    const [af, ...ar] = a;
    return {
      ...(cur || {}),
      id: c.id, // a new contact keeps its list id (the store would otherwise pick another); the same id as cur for a saved one
      name: clip(c.fn, 200) || 'No name', company: clip(c.org, 200) || undefined, department: clip(c.dept, 200) || undefined,   // i18n-ignore: the stored name of a contact without one (data)
      title: clip(c.title, 200) || undefined, birthday: clip(c.bday, 20) || undefined, website: clip(c.url, 300) || undefined,
      notes: String(c.note || '').trim().slice(0, LIMIT.notes) || undefined, photo: c.photo && c.photo.length <= LIMIT.photo ? c.photo : undefined,
      categories: (Array.isArray(c.groups) ? c.groups : []).map((g) => clip(g, LIMIT.group)).filter(Boolean).slice(0, LIMIT.groups),
      stage: c.stage || 'lead', followUp: c.followUp || undefined,
      phone: p.primary, phoneLabel: p.label, phones: p.extra,
      email: e.primary, emailLabel: e.label, emails: e.extra,
      address: af ? af.value : undefined, addressLabel: af ? af.label : undefined, addresses: ar.length ? ar.map((x) => ({ label: x.label, value: x.value })) : undefined,
    };
  }

  SC.customerMap = { toContact, toRecord, typesOf, labelOf, splitName, addressText, DEFAULT };
})();
