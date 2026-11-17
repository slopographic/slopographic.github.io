/* Slop Contacts: read CSV exports. Recognises the Google (Phone 1 - Type / Value, Group Membership),
 * Outlook (Business Phone, E-mail Address, Business Street, Categories) and Apple-style headers
 * (Phone (mobile), E-mail (work)), plus a generic fallback. Quoted fields, doubled quotes and line
 * breaks inside quotes are handled. Classic script. Adds SlopContacts.csv.read(text) -> { contacts, variant }. */
(function () {
  'use strict';
  const SC = (window.SlopContacts = window.SlopContacts || {});
  const T = SC.text;

  /** RFC 4180 parser. Blank rows are dropped. */
  function parseCsv(text, delim) {
    const s = String(text || '').replace(/^﻿/, ''), rows = [];
    let row = [], field = '', q = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (q) {
        if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else field += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { row.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && s[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += ch;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((v) => v.trim() !== ''));
  }
  /** The delimiter that appears most in the header line: comma, semicolon or tab. */
  function sniffDelim(text) {
    const head = (String(text || '').slice(0, 4000).split(/\r\n|\r|\n/)[0]) || '';
    const n = (ch) => head.split(ch).length - 1;
    return [[',', n(',')], [';', n(';')], ['\t', n('\t')]].sort((a, b) => b[1] - a[1])[0][0];
  }

  const WORD = { mobile: 'CELL', cell: 'CELL', iphone: 'CELL', home: 'HOME', work: 'WORK', business: 'WORK', main: 'MAIN',
    fax: 'FAX', pager: 'PAGER', other: 'OTHER', car: 'CAR' };
  /** A CSV type label ("Mobile", "Home Fax", "* Custom", "_$!<Work>!$_") to vCard-style types. */
  function typesFromText(text) {
    const s = String(text || '').trim();
    if (!s) return [];
    if (s.startsWith('_$!<')) return SC.vcard.labelTypes(s);
    return T.uniq(s.replace(/^\*\s*/, '').split(/[\s/,]+/).map((w) => WORD[w.toLowerCase()] || w.toUpperCase().replace(/[^A-Z0-9-]/g, '')).filter(Boolean));
  }
  /** "* myContacts ::: Work" or "Friends;Work" to group names (the system group is dropped). */
  function groupsFrom(text) {
    return String(text || '').split(/\s*:::\s*|;/).map((g) => g.trim().replace(/^\*\s*/, '').trim())
      .filter((g) => g && g.toLowerCase() !== 'mycontacts');
  }

  const norm = (h) => String(h || '').replace(/^﻿/, '').trim().toLowerCase().replace(/\s+/g, ' ');
  const SIMPLE = { 'first name': ['name', 'given'], 'given name': ['name', 'given'], 'middle name': ['name', 'additional'],   // i18n-ignore: CSV and vCard column names (file formats)
    'additional name': ['name', 'additional'], 'last name': ['name', 'family'], 'family name': ['name', 'family'], surname: ['name', 'family'],   // i18n-ignore: CSV and vCard column names (file formats)
    title: ['name', 'prefix'], 'name prefix': ['name', 'prefix'], suffix: ['name', 'suffix'], 'name suffix': ['name', 'suffix'],   // i18n-ignore: CSV and vCard column names (file formats)
    name: ['fn'], company: ['org'], organization: ['org'], 'organization 1 - name': ['org'], department: ['dept'],
    'organization 1 - department': ['dept'], 'job title': ['title'], 'organization 1 - title': ['title'], birthday: ['bday'],   // i18n-ignore: CSV and vCard column names (file formats)
    notes: ['note'], note: ['note'], 'web page': ['url'], website: ['url'], 'website 1 - value': ['url'], categories: ['groups'],   // i18n-ignore: CSV and vCard column names (file formats)
    labels: ['groups'], 'group membership': ['groups'] };   // i18n-ignore: CSV and vCard column names (file formats)
  const OUTLOOK_PHONE = { 'business phone': 'WORK', 'business phone 2': 'WORK', 'home phone': 'HOME', 'home phone 2': 'HOME',   // i18n-ignore: CSV and vCard column names (file formats)
    'mobile phone': 'CELL', 'other phone': 'OTHER', pager: 'PAGER', 'business fax': 'WORK,FAX', 'home fax': 'HOME,FAX',   // i18n-ignore: CSV and vCard column names (file formats)
    'car phone': 'CAR', 'primary phone': 'MAIN' };   // i18n-ignore: CSV and vCard column names (file formats)
  const OUTLOOK_ADR = { business: 'WORK', home: 'HOME', other: 'OTHER' };
  const ADR_PART = { street: 'street', city: 'locality', state: 'region', region: 'region', 'postal code': 'postal',   // i18n-ignore: CSV and vCard column names (file formats)
    'country/region': 'country', country: 'country', 'po box': 'po', 'extended address': 'ext', type: 'type', formatted: 'formatted' };   // i18n-ignore: CSV and vCard column names (file formats)

  /** Classify one header. Returns null for a column we do not use. */
  function classify(h) {
    const n = norm(h);
    if (SIMPLE[n]) return { kind: 'simple', to: SIMPLE[n] };
    let m = /^phone (\d+) - (type|value|label)$/.exec(n);
    if (m) return { kind: 'phone', key: 'g' + m[1], part: m[2] === 'value' ? 'value' : 'type' };
    m = /^e-mail (\d+) - (type|value|label)$/.exec(n);
    if (m) return { kind: 'email', key: 'g' + m[1], part: m[2] === 'value' ? 'value' : 'type' };
    m = /^address (\d+) - (type|street|city|region|postal code|country|po box|extended address|formatted)$/.exec(n);
    if (m) return { kind: 'adr', key: 'g' + m[1], part: ADR_PART[m[2]] };
    if (OUTLOOK_PHONE[n]) return { kind: 'phone', key: 'o:' + n, part: 'value', fixed: OUTLOOK_PHONE[n].split(',') };
    if (/^e-?mail( \d+)? address$/.test(n)) return { kind: 'email', key: 'o:' + n, part: 'value', fixed: [] };
    m = /^(business|home|other) (street|city|state|postal code|country\/region)$/.exec(n);
    if (m) return { kind: 'adr', key: 'o:' + m[1], part: ADR_PART[m[2]], fixed: OUTLOOK_ADR[m[1]].split(',') };
    m = /^(phone|mobile|cell|tel)(?: \((.+)\))?$/.exec(n);
    if (m) return { kind: 'phone', key: 'o:' + n, part: 'value', fixed: m[2] ? typesFromText(m[2]) : (m[1] === 'phone' || m[1] === 'tel' ? [] : ['CELL']) };
    m = /^(e-?mail)(?: \((.+)\))?$/.exec(n);
    if (m) return { kind: 'email', key: 'o:' + n, part: 'value', fixed: m[2] ? typesFromText(m[2]) : [] };
    return null;
  }
  /** Which program wrote the file, from its headers (for the report only). */
  function detect(headers) {
    const h = new Set(headers.map(norm));
    if (h.has('phone 1 - value') || h.has('given name') || h.has('group membership')) return 'Google';   // i18n-ignore: CSV and vCard column names (file formats)
    if (h.has('business phone') || h.has('e-mail address') || h.has('mobile phone') || h.has('first name') && h.has('business street')) return 'Outlook';   // i18n-ignore: CSV and vCard column names (file formats)
    if ([...h].some((x) => /\((mobile|home|work|cell|other)\)/.test(x))) return 'Apple';   // i18n-ignore: CSV and vCard column names (file formats)
    return 'generic';
  }

  /** Build one raw contact from a row, using the column plan. */
  function rowContact(cls, row) {
    const c = SC.model.blank(), phones = new Map(), emails = new Map(), adrs = new Map();
    const slot = (map, key, make) => { if (!map.has(key)) map.set(key, make()); return map.get(key); };
    cls.forEach((k, i) => {
      if (!k) return;
      const v = row[i] == null ? '' : String(row[i]);
      if (k.kind === 'simple') {
        const [to, field] = k.to;
        if (to === 'name') c.name[field] = T.tidy(v) || c.name[field];
        else if (to === 'groups') c.groups.push(...groupsFrom(v));
        else if (to === 'fn') c.fn = T.tidy(v) || c.fn;
        else c[to] = to === 'note' ? (v || c.note) : (T.tidy(v) || c[to]);
      } else if (k.kind === 'phone' || k.kind === 'email') {
        const e = slot(k.kind === 'phone' ? phones : emails, k.key, () => ({ value: '', typeText: '', fixed: k.fixed }));
        if (k.part === 'value') e.value = v; else e.typeText = v;
      } else if (k.kind === 'adr') {
        const a = slot(adrs, k.key, () => ({ typeText: '', fixed: k.fixed, f: {} }));
        if (k.part === 'type') a.typeText = v; else a.f[k.part] = v;
      }
    });
    for (const p of phones.values()) if (T.tidy(p.value)) c.phones.push({ value: p.value, types: p.fixed || typesFromText(p.typeText) });
    for (const e of emails.values()) if (T.tidy(e.value)) c.emails.push({ value: e.value, types: e.fixed || typesFromText(e.typeText) });
    for (const a of adrs.values()) {
      const f = a.f, parts = ['po', 'ext', 'street', 'locality', 'region', 'postal', 'country'].map((x) => f[x] || '');
      const street = parts[2] || f.formatted || '';
      if (!parts.some((x) => T.tidy(x)) && !T.tidy(street)) continue;
      c.adr.push({ types: a.fixed || typesFromText(a.typeText), po: parts[0], ext: parts[1], street, locality: parts[3], region: parts[4], postal: parts[5], country: parts[6] });
    }
    return c;
  }

  /** Read CSV text. Returns { contacts, variant, columns (used), unknown (headers we ignored) }. */
  function read(text) {
    const rows = parseCsv(text, sniffDelim(text));
    if (!rows.length) return { contacts: [], variant: 'none', columns: 0, unknown: [] };
    const headers = rows[0], cls = headers.map(classify), contacts = [];
    for (const row of rows.slice(1)) {
      const c = rowContact(cls, row);
      if (SC.model.hasContent(c)) contacts.push(SC.model.normalise(c));
    }
    return { contacts, variant: detect(headers), columns: cls.filter(Boolean).length, unknown: headers.filter((h, i) => !cls[i] && norm(h)) };
  }

  SC.csv = Object.assign(SC.csv || {}, { read, parseCsv, sniffDelim, typesFromText, groupsFrom });
})();
