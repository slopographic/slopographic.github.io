/* Slop Contacts: bulk changes. Each function takes the list and an optional Set of ids (null = every contact)
 * and returns { list, changed } (plus a count where it makes sense). Nothing is mutated; copies are returned.
 *   cleanup: trim and collapse spaces, title-case names (particles stay lower case), phones to E.164 with the
 *            default country code (empty = keep as typed), lowercase e-mails, remove empty fields.
 *   findReplace, addGroup, removeGroup, removeContacts.
 * Classic script. Adds SlopContacts.bulk. */
(function () {
  'use strict';
  const SC = (window.SlopContacts = window.SlopContacts || {});
  const M = SC.model, T = SC.text, P = SC.phone;
  const PARTICLES = new Set(['van', 'von', 'de', 'del', 'della', 'der', 'den', 'di', 'da', 'du', 'das', 'dos', 'do', 'la', 'le', 'les',
    'el', 'al', 'bin', 'binti', 'ten', 'ter', 'y', 'e', 'zu', 'st']);
  const clone = (c) => JSON.parse(JSON.stringify(c));

  /** One word: already styled words (McDonald, iPhone, DeAngelo) stay; ALL CAPS and lower case get a capital. */
  function titleWord(w, first) {
    if (/^(?:[A-Z]?[a-z]+)(?:[A-Z][a-z]+)+$/.test(w)) return w;
    const lw = w.toLowerCase();
    if (!first && PARTICLES.has(lw)) return lw;
    return lw.replace(/(^|[-'’.])(\p{L})/gu, (m, p, ch) => p + ch.toUpperCase());
  }
  /** Title case for a name: the first word always gets a capital, particles in the middle stay lower case. */
  const titleCase = (s) => T.tidy(s).split(' ').map((w, i) => titleWord(w, i === 0)).join(' ');

  /** Every free-text field of one contact, as get/set pairs (for find and replace). */
  function textFields(c) {
    const out = [];
    const add = (group, get, set) => out.push({ group, get, set });
    for (const k of M.NAME_KEYS) add('name', () => c.name[k], (v) => { c.name[k] = v; });
    add('name', () => c.fn, (v) => { c.fn = v; });
    add('org', () => c.org, (v) => { c.org = v; });
    add('org', () => c.dept, (v) => { c.dept = v; });
    add('title', () => c.title, (v) => { c.title = v; });
    add('note', () => c.note, (v) => { c.note = v; });
    add('url', () => c.url, (v) => { c.url = v; });
    c.emails.forEach((e) => add('email', () => e.value, (v) => { e.value = v; }));
    c.phones.forEach((p) => add('phone', () => p.value, (v) => { p.value = v; }));
    c.adr.forEach((a) => M.ADR_KEYS.forEach((k) => add('address', () => a[k], (v) => { a[k] = v; })));
    c.groups.forEach((g, i) => add('group', () => g, (v) => { c.groups[i] = v; }));
    return out;
  }
  const FIELD_GROUPS = ['all', 'name', 'org', 'title', 'note', 'url', 'email', 'phone', 'address', 'group'];

  /** Clean the selected contacts. opts: { trim, titleCase, e164, cc, lowerEmail, removeEmpty }. */
  function cleanup(list, ids, opts = {}) {
    let changed = 0;
    const out = list.map((orig) => {
      if (ids && !ids.has(orig.id)) return orig;
      const c = clone(orig);
      if (opts.trim) {
        for (const f of textFields(c)) if (f.group !== 'note') f.set(T.tidy(f.get()));
        c.note = T.tidyNote(c.note);
      }
      if (opts.titleCase) {
        for (const k of ['given', 'additional', 'family']) c.name[k] = titleCase(c.name[k]);
        c.fn = titleCase(c.fn);
      }
      if (opts.e164 && P.ccDigits(opts.cc)) c.phones.forEach((p) => { p.value = P.toE164(p.value, opts.cc); });
      if (opts.lowerEmail) c.emails.forEach((e) => { e.value = e.value.toLowerCase(); });
      if (opts.removeEmpty) {
        c.phones = c.phones.filter((p) => T.tidy(p.value));
        c.emails = c.emails.filter((e) => T.tidy(e.value));
        c.adr = c.adr.filter((a) => M.ADR_KEYS.some((k) => T.tidy(a[k])));
        c.groups = c.groups.filter((g) => T.tidy(g));
      }
      const fixed = M.normalise({ ...c, id: orig.id });
      if (M.sameContent(fixed, orig)) return orig;
      changed++;
      return fixed;
    });
    return { list: out, changed };
  }

  /** Find and replace inside a field group ('all' or one of FIELD_GROUPS). Plain text, optional case match. */
  function findReplace(list, ids, { field = 'all', find = '', replace = '', matchCase = false } = {}) {
    if (!find) return { list, changed: 0, count: 0 };
    const re = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), matchCase ? 'g' : 'gi');
    let changed = 0, count = 0;
    const out = list.map((orig) => {
      if (ids && !ids.has(orig.id)) return orig;
      const c = clone(orig);
      let hits = 0;
      for (const f of textFields(c)) {
        if (field !== 'all' && f.group !== field) continue;
        const s = String(f.get() || '');
        const n = s.match(re);
        if (!n) continue;
        hits += n.length;
        f.set(s.replace(re, () => replace));
      }
      if (!hits) return orig;
      count += hits; changed++;
      return M.normalise({ ...c, id: orig.id });
    });
    return { list: out, changed, count };
  }

  /** Add a group to the selected contacts. */
  function addGroup(list, ids, name) {
    const g = T.tidy(name);
    if (!g) return { list, changed: 0 };
    let changed = 0;
    const out = list.map((c) => {
      if ((ids && !ids.has(c.id)) || c.groups.includes(g)) return c;
      changed++;
      return M.normalise({ ...c, groups: [...c.groups, g] });
    });
    return { list: out, changed };
  }
  /** Remove a group from the selected contacts. */
  function removeGroup(list, ids, name) {
    let changed = 0;
    const out = list.map((c) => {
      if ((ids && !ids.has(c.id)) || !c.groups.includes(name)) return c;
      changed++;
      return M.normalise({ ...c, groups: c.groups.filter((g) => g !== name) });
    });
    return { list: out, changed };
  }
  /** Delete the selected contacts. */
  const removeContacts = (list, ids) => ({ list: list.filter((c) => !(ids && ids.has(c.id))), changed: list.length - list.filter((c) => !(ids && ids.has(c.id))).length });

  SC.bulk = { titleCase, titleWord, cleanup, findReplace, addGroup, removeGroup, removeContacts, FIELD_GROUPS };
})();
