/* vCard conversions, pure part: the header rule for CSV and XLSX tables, the contacts that a table makes, and the
 * table that a vCard export makes. No DOM and no Contacts code (vcf.js loads that). A header is matched after it is
 * lower-cased and every run of characters that is not a letter or digit becomes one space, so "E-mail", "e_mail" and
 * "E MAIL" all read as "e mail". Recognised fields: name, first name, last name, organisation, job title, e-mail,
 * phone, address, website, note. Several e-mail, phone or address columns are all kept (a type word in the header,
 * such as Mobile or Work, sets the vCard TYPE). For the other fields the first non-empty column wins.
 * Exports: mapHeaders, contactsFromTable, contactsToTable, FIELD_LABEL. */

export const FIELD_LABEL = { fn: 'Name', given: 'First name', family: 'Last name', org: 'Organisation', title: 'Job title', // i18n-ignore: CSV column names in the file, and header aliases (data)
  email: 'E-mail', phone: 'Phone', address: 'Address', url: 'Website', note: 'Note' }; // i18n-ignore: CSV column names in the file, and header aliases (data)

const SYNONYMS = {
  fn: ['name', 'full name', 'display name', 'fn', 'contact name'], // i18n-ignore: CSV column names in the file, and header aliases (data)
  given: ['first name', 'given name', 'firstname', 'forename'], // i18n-ignore: CSV column names in the file, and header aliases (data)
  family: ['last name', 'surname', 'family name', 'lastname'], // i18n-ignore: CSV column names in the file, and header aliases (data)
  org: ['organisation', 'organization', 'company', 'org', 'business', 'employer'],
  title: ['title', 'job title', 'position'], // i18n-ignore: CSV column names in the file, and header aliases (data)
  email: ['email', 'e mail', 'email address', 'e mail address', 'mail'], // i18n-ignore: CSV column names in the file, and header aliases (data)
  phone: ['phone', 'telephone', 'tel', 'phone number', 'mobile', 'mobile phone', 'cell', 'cell phone', 'work phone', 'home phone', 'business phone', 'main phone'], // i18n-ignore: CSV column names in the file, and header aliases (data)
  address: ['address', 'street', 'street address', 'postal address', 'mailing address', 'home address', 'work address', 'business address'], // i18n-ignore: CSV column names in the file, and header aliases (data)
  url: ['website', 'web site', 'web page', 'url', 'homepage', 'web'], // i18n-ignore: CSV column names in the file, and header aliases (data)
  note: ['note', 'notes', 'comment', 'comments', 'memo'],
};
const FIELD_OF = new Map(Object.entries(SYNONYMS).flatMap(([field, names]) => names.map((n) => [n, field])));
/** Header words that set the vCard TYPE of a phone, e-mail or address column. */
const TYPE_WORD = { mobile: 'CELL', cell: 'CELL', work: 'WORK', business: 'WORK', home: 'HOME' };
const SINGLE = ['fn', 'given', 'family', 'org', 'title', 'url', 'note'];

export const norm = (h) => String(h == null ? '' : h).replace(/^﻿/, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** The field a header maps to, and its TYPE words. Returns { field, types } or null when no field matches. */
function classify(header) {
  const key = norm(header);
  const field = FIELD_OF.get(key);
  if (!field) return null;
  const types = key.split(' ').map((w) => TYPE_WORD[w]).filter(Boolean);
  return { field, types: [...new Set(types)] };
}

/** Maps a header row. Returns { columns: [{ index, header, field, types }], recognised: [{ header, field, label }],
 *  unrecognised: [header] }. Blank headers are ignored. */
export function mapHeaders(headers) {
  const columns = [], recognised = [], unrecognised = [];
  (headers || []).forEach((header, index) => {
    const text = String(header == null ? '' : header).trim();
    if (!norm(text)) return;
    const hit = classify(text);
    columns.push({ index, header: text, field: hit ? hit.field : null, types: hit ? hit.types : [] });
    if (hit) recognised.push({ header: text, field: hit.field, label: FIELD_LABEL[hit.field] });
    else unrecognised.push(text);
  });
  return { columns, recognised, unrecognised };
}

const splitList = (v) => v.split(';').map((s) => s.trim()).filter(Boolean);

/** A table (first row = headers, then the data rows) to contact records for SlopContacts.vcard.write. Rows with no
 *  mapped value are skipped. Returns { contacts, mapping }. */
export function contactsFromTable(table) {
  const [headers = [], ...body] = table || [];
  const mapping = mapHeaders(headers), contacts = [];
  for (const row of body) {
    const c = { given: '', family: '', fn: '', org: '', title: '', url: '', note: '', emails: [], phones: [], adr: [] };
    let any = false;
    for (const col of mapping.columns) {
      const v = String(row && row[col.index] != null ? row[col.index] : '').trim();
      if (!col.field || !v) continue;
      any = true;
      if (col.field === 'email') for (const value of splitList(v)) c.emails.push({ value, types: col.types });
      else if (col.field === 'phone') for (const value of splitList(v)) c.phones.push({ value, types: col.types });
      else if (col.field === 'address') c.adr.push({ types: col.types, street: v });
      else if (SINGLE.includes(col.field) && !c[col.field]) c[col.field] = v;
    }
    if (!any) continue;
    contacts.push({ name: { given: c.given, family: c.family }, fn: c.fn, org: c.org, title: c.title, url: c.url, note: c.note,
      emails: c.emails, phones: c.phones, adr: c.adr });
  }
  return { contacts, mapping };
}

/** A read vCard contact to one export row: the headers are the names the import above recognises, so a CSV or XLSX
 *  written here reads back the same. Several values in a column are joined with "; ". */
export function contactsToTable(contacts) {
  const headers = ['Name', 'First name', 'Last name', 'Organisation', 'Job title', 'E-mail', 'Phone', 'Address', 'Website', 'Note']; // i18n-ignore: CSV column names in the file, and header aliases (data)
  const rows = (contacts || []).map((c) => {
    const n = c.name || {};
    return [c.fn || '', n.given || '', n.family || '', c.org || '', c.title || '',
      (c.emails || []).map((e) => e.value).join('; '), (c.phones || []).map((p) => p.value).join('; '),
      (c.adr || []).map((a) => [a.po, a.ext, a.street, a.locality, a.region, a.postal, a.country].filter(Boolean).join(', ')).filter(Boolean).join('; '),
      c.url || '', c.note || ''];
  });
  return { headers, rows };
}
