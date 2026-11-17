/* Slop Contacts: the sidebar filters (no DOM). Six facets, combined with AND: group (every chosen group), organisation
 * (exact, ignoring case), e-mail and phone (has or has none), a created or updated date range (inclusive, local days),
 * and tags (the shared CRM tags, by id; every chosen tag). The filter is one plain object, so it can live in the URL
 * as JSON (toParam / fromParam) and as a set of removable chips (chips / without). Classic script.
 * Adds SlopContacts.filters. */
(function () {
  'use strict';
  const SC = (window.SlopContacts = window.SlopContacts || {});
  const EMPTY = { group: [], org: '', email: '', phone: '', date: 'created', from: '', to: '', tag: [] };
  const pad = (n) => String(n).padStart(2, '0');
  const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00'));
  const list = (a) => (Array.isArray(a) ? [...new Set(a.map((x) => String(x)).filter(Boolean))] : []);
  const YN = (v) => (v === 'yes' || v === 'no' ? v : '');

  /** A clean copy of any object: unknown keys dropped, bad values reset to empty. */
  function clean(f) {
    const s = f && typeof f === 'object' ? f : {};
    const from = isDay(s.from) ? s.from : '', to = isDay(s.to) ? s.to : '';
    return { group: list(s.group), org: String(s.org || '').trim(), email: YN(s.email), phone: YN(s.phone),
      date: s.date === 'updated' ? 'updated' : 'created', from, to, tag: list(s.tag) };
  }
  const isSet = (k, v) => (k === 'date' ? false : Array.isArray(v) ? v.length > 0 : !!v);
  /** True when any facet is set (a date field alone is not a filter). */
  const active = (f) => Object.keys(EMPTY).some((k) => isSet(k, f[k])) || !!(f.from || f.to);

  /** Local calendar day (YYYY-MM-DD) of a time in ms, or '' when unknown. */
  function dayOf(ms) {
    if (!ms) return '';
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  /** Does one contact pass the filter? ctx: { created, updated } maps of id to ms. */
  function matches(c, f, ctx) {
    if (f.group.length && !f.group.every((g) => c.groups.includes(g))) return false;
    if (f.org && String(c.org || '').toLowerCase() !== f.org.toLowerCase()) return false;
    if (f.email && (c.emails.length > 0) !== (f.email === 'yes')) return false;
    if (f.phone && (c.phones.length > 0) !== (f.phone === 'yes')) return false;
    if (f.from || f.to) {
      const map = f.date === 'updated' ? ctx.updated : ctx.created;
      const d = dayOf(map ? map.get(c.id) : 0);
      if (!d || (f.from && d < f.from) || (f.to && d > f.to)) return false;
    }
    if (f.tag.length && !f.tag.every((t) => (c.tagIds || []).includes(t))) return false;
    return true;
  }
  /** The contacts that pass every set facet, in their order. */
  function apply(contacts, f, ctx = {}) {
    const g = clean(f);
    return active(g) ? contacts.filter((c) => matches(c, g, ctx)) : contacts;
  }

  /** Chips for the set facets: { id, label }. names maps a tag id to its name. */
  function chips(f, names = {}) {
    const g = clean(f), out = [];
    const tr = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
    for (const x of g.group) out.push({ id: 'group:' + x, label: tr('contacts.chip.group', { name: x }) });
    if (g.org) out.push({ id: 'org', label: tr('contacts.chip.org', { name: g.org }) });
    if (g.email) out.push({ id: 'email', label: tr(g.email === 'yes' ? 'contacts.chip.has_email' : 'contacts.chip.no_email') });
    if (g.phone) out.push({ id: 'phone', label: tr(g.phone === 'yes' ? 'contacts.chip.has_phone' : 'contacts.chip.no_phone') });
    if (g.from || g.to) {
      const range = [g.from && tr('contacts.chip.from', { day: g.from }), g.to && tr('contacts.chip.to', { day: g.to })].filter(Boolean).join(' ');
      out.push({ id: 'date', label: tr(g.date === 'updated' ? 'contacts.chip.updated_range' : 'contacts.chip.created_range', { range }) });
    }
    for (const t of g.tag) out.push({ id: 'tag:' + t, label: tr('contacts.chip.tag', { name: names[t] || t }) });
    return out;
  }
  /** The filter without one chip. */
  function without(f, id) {
    const g = clean(f), i = String(id).indexOf(':'), kind = i < 0 ? id : id.slice(0, i), val = i < 0 ? '' : id.slice(i + 1);
    if (kind === 'group') g.group = g.group.filter((x) => x !== val);
    else if (kind === 'tag') g.tag = g.tag.filter((x) => x !== val);
    else if (kind === 'org') g.org = '';
    else if (kind === 'email') g.email = '';
    else if (kind === 'phone') g.phone = '';
    else if (kind === 'date') { g.from = ''; g.to = ''; }
    return g;
  }

  /** The filter as text for the URL: '' when nothing is set, else JSON with only the set facets. */
  function toParam(f) {
    const g = clean(f), out = {};
    for (const k of Object.keys(EMPTY)) if (isSet(k, g[k])) out[k] = g[k];
    if ((g.from || g.to) && g.date) out.date = g.date;
    if (g.from || g.to) { if (g.from) out.from = g.from; if (g.to) out.to = g.to; }
    return Object.keys(out).length ? JSON.stringify(out) : '';
  }
  /** The filter from URL text. Anything that does not parse gives an empty filter. */
  function fromParam(s) {
    try { return clean(JSON.parse(String(s || ''))); } catch (e) { return clean({}); }
  }

  SC.filters = { EMPTY: clean({}), clean, active, dayOf, matches, apply, chips, without, toParam, fromParam };
})();
