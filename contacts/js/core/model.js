/* Slop Contacts: the contact model. Every contact has the same shape, and normalise() is the only place
 * that cleans one up (trims, drops empty entries, fills FN, reads dates). Adds SlopContacts.model.
 *   { id, name: {prefix, given, additional, family, suffix}, fn, org, dept, title,
 *     phones: [{value, types}], emails: [{value, types}], adr: [{types, po, ext, street, locality, region, postal, country}],
 *     bday ('YYYY-MM-DD' or '--MM-DD'), url, note, groups: [string], photo ('' | data: URI | https link),
 *     stage ('lead' | 'contacted' | 'customer' | 'lost'), followUp ('YYYY-MM-DD') when set,
 *     tagIds: [id] (the shared CRM tags; read-only here, kept when a contact is saved) } */
(function () {
  'use strict';
  const SC = (window.SlopContacts = window.SlopContacts || {});
  const T = SC.text;
  const NAME_KEYS = ['prefix', 'given', 'additional', 'family', 'suffix'];
  const ADR_KEYS = ['po', 'ext', 'street', 'locality', 'region', 'postal', 'country'];
  const list = (a) => (Array.isArray(a) ? a : []);
  const types = (a) => T.uniq(list(a).map((t) => String(t || '').toUpperCase().replace(/[^A-Z0-9-]/g, '')).filter(Boolean));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const pad = (n) => String(n).padStart(2, '0');

  /** Read a birthday: ISO (with or without dashes, time ignored), --MM-DD, or US M/D/YYYY. Unknown text is kept. */
  function normBday(v) {
    const s = T.tidy(v);
    if (!s) return '';
    let m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(s);
    if (m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31) return `${m[1]}-${m[2]}-${m[3]}`;
    m = /^--(\d{2})-?(\d{2})$/.exec(s);
    if (m) return `--${m[1]}-${m[2]}`;
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (m && +m[1] >= 1 && +m[1] <= 12 && +m[2] >= 1 && +m[2] <= 31) return `${m[3]}-${pad(m[1])}-${pad(m[2])}`;
    return s;
  }
  const blank = () => ({ id: uid(), name: { prefix: '', given: '', additional: '', family: '', suffix: '' }, fn: '', org: '', dept: '', title: '',
    phones: [], emails: [], adr: [], bday: '', url: '', note: '', groups: [], photo: '' });
  const composed = (c) => NAME_KEYS.map((k) => (c.name && c.name[k]) || '').filter(Boolean).join(' ');
  const adrEntry = (a) => { const x = a || {}; const o = { types: types(x.types) }; for (const k of ADR_KEYS) o[k] = T.tidy(x[k]); return o; };
  const ent = (e, clean) => ({ value: clean(e && e.value), types: types(e && e.types) });

  /** A clean copy of any contact-like object. Keeps the id (or makes one) and fills FN. */
  function normalise(x) {
    const s = x || {}, nm = s.name || {};
    const c = {
      id: T.tidy(s.id) || uid(),
      name: Object.fromEntries(NAME_KEYS.map((k) => [k, T.tidy(nm[k])])),
      fn: T.tidy(s.fn), org: T.tidy(s.org), dept: T.tidy(s.dept), title: T.tidy(s.title),
      phones: list(s.phones).map((p) => ent(p, (v) => T.tidy(v))).filter((p) => p.value),
      emails: list(s.emails).map((e) => ent(e, (v) => T.tidy(v).replace(/^mailto:/i, ''))).filter((e) => e.value),
      adr: list(s.adr).map(adrEntry).filter((a) => ADR_KEYS.some((k) => a[k])),
      bday: normBday(s.bday), url: T.tidy(s.url), note: T.tidyNote(s.note),
      groups: T.uniq(list(s.groups).map((g) => T.tidy(g)).filter(Boolean)),
      photo: SC.photo.normPhoto(s.photo),
      tagIds: T.uniq(list(s.tagIds).map((t) => T.tidy(t)).filter(Boolean)),
    };
    // CRM fields, kept when present (the shared customer record carries them): pipeline stage and follow-up date.
    if (s.stage) c.stage = T.tidy(s.stage);
    if (s.followUp) c.followUp = T.tidy(s.followUp);
    c.fn = c.fn || composed(c) || c.org || (c.emails[0] && c.emails[0].value) || (c.phones[0] && c.phones[0].value) || 'No name';   // i18n-ignore: the stored name of a contact without one (data)
    return c;
  }
  /** True when the raw record has anything worth keeping (used when importing). */
  const hasContent = (c) => !!(composed(c) || c.fn || c.org || c.note || (c.phones || []).length || (c.emails || []).length);
  const displayName = (c) => c.fn || composed(c) || c.org || '(no name)';
  /** Same content, ignoring the id. */
  const sameContent = (a, b) => { const strip = (c) => { const { id, ...rest } = normalise(c); return JSON.stringify(rest); }; return strip(a) === strip(b); };
  /** Text a search box matches against. */
  const haystack = (c) => [c.fn, composed(c), c.org, c.dept, c.title, c.note, c.url, c.bday, ...c.groups,
    ...c.phones.map((p) => p.value), ...c.emails.map((e) => e.value),
    ...c.adr.map((a) => ADR_KEYS.map((k) => a[k]).join(' '))].join(' ').toLowerCase();

  SC.model = { NAME_KEYS, ADR_KEYS, blank, normalise, normBday, composed, hasContent, displayName, sameContent, haystack, uid, types };
})();
