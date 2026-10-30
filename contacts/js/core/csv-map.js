/* Slop Contacts: CSV column mapping. Each header is guessed to a contact field (full name, first and last name,
 * company, job title, e-mail, phone, address, notes, groups, birthday, website). The import dialog lets the person
 * change any column, and the rows become contacts. Google, Outlook and the plain layout from this app all guess well.
 * Several e-mail or phone columns each add a value; address columns join into one line. Classic script.
 * Adds SlopContacts.csvMap: parse(text) -> { headers, rows }, guess(headers), contactsFrom(rows, targets). */
(function () {
  'use strict';
  const SC = (window.SlopContacts = window.SlopContacts || {});
  const T = SC.text, M = SC.model;

  /** The fields a column can go to, in the order the dialog lists them. */
  const TARGETS = [
    ['ignore', 'Do not import'], ['name', 'Full name'], ['given', 'First name'], ['family', 'Last name'],   // i18n-ignore: CSV and vCard column names (file formats)
    ['org', 'Company'], ['title', 'Job title'], ['email', 'E-mail'], ['phone', 'Phone'], ['address', 'Address'],   // i18n-ignore: CSV and vCard column names (file formats)
    ['note', 'Notes'], ['groups', 'Groups'], ['bday', 'Birthday'], ['url', 'Website'],   // i18n-ignore: CSV and vCard column names (file formats)
  ];
  const norm = (h) => String(h || '').replace(/^﻿/, '').trim().toLowerCase().replace(/\s+/g, ' ');

  /** The field a header most likely holds. Type and label columns (Phone 1 - Type) are ignored: their values are
   *  not needed to import the number itself. A plain "Title" column is an honorific, so it is ignored too. */
  function guessOne(header) {
    const h = norm(header);
    if (!h) return 'ignore';
    if (/^(full |display )?name$/.test(h)) return 'name';
    if (/^(first|given) name$/.test(h)) return 'given';
    if (/^(last|family) name$|^surname$/.test(h)) return 'family';
    if (/^(company|organi[sz]ation|org)$|organi[sz]ation( \d+)? - name$/.test(h)) return 'org';
    if (/job title|organi[sz]ation( \d+)? - title/.test(h)) return 'title';
    if (/^(group membership|groups?|labels?|categories|tags?)$/.test(h)) return 'groups';
    if (/type|label|^title$|department/.test(h)) return 'ignore';
    if (/e-?mail/.test(h)) return 'email';
    if (/phone|mobile|cell|\btel\b|\bfax\b|pager/.test(h)) return 'phone';
    if (/street|address|city|state|region|postal|zip|country|po box/.test(h)) return 'address';
    if (/^(notes?|comments?)$/.test(h)) return 'note';
    if (/^(birthday|birth date|bday)$/.test(h)) return 'bday';
    if (/^(web ?page|website|url|homepage)( \d+)?( - value)?$/.test(h)) return 'url';
    return 'ignore';
  }
  /** One target per header. */
  const guess = (headers) => (headers || []).map(guessOne);

  /** The header and data rows of a CSV text (delimiter sniffed; blank rows dropped). */
  function parse(text) {
    const rows = SC.csv.parseCsv(text, SC.csv.sniffDelim(text));
    return { headers: rows.length ? rows[0] : [], rows: rows.slice(1) };
  }

  /** Contacts from data rows, by the target of each column. Rows with no content are dropped. */
  function contactsFrom(rows, targets) {
    const out = [];
    for (const row of rows || []) {
      const c = M.blank(), addr = [], notes = [];
      targets.forEach((t, i) => {
        const raw = row[i] == null ? '' : String(row[i]);
        const v = T.tidy(raw);
        if (!v || t === 'ignore') return;
        switch (t) {
          case 'name': c.fn = v; break;
          case 'given': c.name.given = v; break;
          case 'family': c.name.family = v; break;
          case 'org': c.org = v; break;
          case 'title': c.title = v; break;
          case 'email': c.emails.push({ value: v.replace(/^mailto:/i, ''), types: [] }); break;
          case 'phone': c.phones.push({ value: v, types: [] }); break;
          case 'address': addr.push(v); break;
          case 'note': notes.push(T.tidyNote(raw)); break;
          case 'groups': c.groups.push(...SC.csv.groupsFrom(raw)); break;
          case 'bday': c.bday = M.normBday(v); break;
          case 'url': c.url = v; break;
          default: break;
        }
      });
      if (addr.length) c.adr.push({ types: [], street: addr.join(', ') });
      if (notes.length) c.note = notes.filter(Boolean).join('\n');
      if (M.hasContent(c)) out.push(M.normalise(c));
    }
    return out;
  }

  SC.csvMap = { TARGETS, guess, guessOne, parse, contactsFrom };
})();
