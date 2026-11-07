/* Slop Contacts: write CSV in the Google Contacts and Outlook layouts. UTF-8 with a byte-order mark (so Excel
 * reads accents), CRLF line ends, fields quoted when they hold a comma, quote or line break.
 * Outlook has fixed slots, so extra phones, e-mails and addresses beyond them are not written (see HANDOFF.md).
 * Classic script. Adds SlopContacts.csv.googleCsv, outlookCsv, genericCsv(contacts) and sheetOf(contacts) (XLSX rows). */
(function () {
  'use strict';
  const SC = (window.SlopContacts = window.SlopContacts || {});
  const q = (v) => { const s = v == null ? '' : String(v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const line = (cells) => cells.map(q).join(',');
  const table = (header, rows) => '﻿' + [line(header), ...rows.map(line)].join('\r\n') + '\r\n';
  const ymdUS = (b) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(b || ''); return m ? `${m[2]}/${m[3]}/${m[1]}` : ''; };

  const LABEL = { CELL: 'Mobile', HOME: 'Home', WORK: 'Work', MAIN: 'Main', FAX: 'Fax', PAGER: 'Pager', OTHER: 'Other', CAR: 'Car' };   // i18n-ignore: CSV and vCard column names (file formats)
  /** Types to a Google label: ['HOME', 'FAX'] to "Home Fax", custom 'DAD' to "Dad". */
  const googleLabel = (types) => (types || []).map((t) => LABEL[t] || t.charAt(0) + t.slice(1).toLowerCase()).join(' ');
  const groupsG = (groups) => (groups || []).map((g) => '* ' + g).join(' ::: ');

  /** Google Contacts export layout (the phone, e-mail and address columns grow to the largest contact). */
  function googleCsv(contacts) {
    const list = (contacts || []).map((c) => SC.model.normalise(c));
    const nP = Math.max(1, ...list.map((c) => c.phones.length)), nE = Math.max(1, ...list.map((c) => c.emails.length));
    const nA = Math.max(1, ...list.map((c) => c.adr.length));
    const head = ['Name', 'Given Name', 'Additional Name', 'Family Name', 'Name Prefix', 'Name Suffix', 'Birthday', 'Notes', 'Website 1 - Value',   // i18n-ignore: CSV and vCard column names (file formats)
      'Organization 1 - Name', 'Organization 1 - Department', 'Organization 1 - Title', 'Group Membership'];   // i18n-ignore: CSV and vCard column names (file formats)
    for (let i = 1; i <= nP; i++) head.push(`Phone ${i} - Type`, `Phone ${i} - Value`);   // i18n-ignore: CSV and vCard column names (file formats)
    for (let i = 1; i <= nE; i++) head.push(`E-mail ${i} - Type`, `E-mail ${i} - Value`);
    for (let i = 1; i <= nA; i++) head.push(`Address ${i} - Type`, `Address ${i} - Street`, `Address ${i} - City`, `Address ${i} - PO Box`,   // i18n-ignore: CSV and vCard column names (file formats)
      `Address ${i} - Region`, `Address ${i} - Postal Code`, `Address ${i} - Country`, `Address ${i} - Extended Address`);   // i18n-ignore: CSV and vCard column names (file formats)
    const rows = list.map((c) => {
      const n = c.name;
      const r = [SC.model.composed(c) || c.fn, n.given, n.additional, n.family, n.prefix, n.suffix, c.bday, c.note, c.url, c.org, c.dept, c.title, groupsG(c.groups)];
      for (let i = 0; i < nP; i++) { const p = c.phones[i]; r.push(p ? googleLabel(p.types) : '', p ? p.value : ''); }
      for (let i = 0; i < nE; i++) { const e = c.emails[i]; r.push(e ? googleLabel(e.types) : '', e ? e.value : ''); }
      for (let i = 0; i < nA; i++) {
        const a = c.adr[i];
        r.push(a ? googleLabel(a.types) : '', a ? a.street : '', a ? a.locality : '', a ? a.po : '', a ? a.region : '', a ? a.postal : '', a ? a.country : '', a ? a.ext : '');
      }
      return r;
    });
    return table(head, rows);
  }

  const OUTLOOK_HEAD = ['First Name', 'Middle Name', 'Last Name', 'Title', 'Suffix', 'Company', 'Department', 'Job Title',   // i18n-ignore: CSV and vCard column names (file formats)
    'Business Street', 'Business City', 'Business State', 'Business Postal Code', 'Business Country/Region',   // i18n-ignore: CSV and vCard column names (file formats)
    'Home Street', 'Home City', 'Home State', 'Home Postal Code', 'Home Country/Region',   // i18n-ignore: CSV and vCard column names (file formats)
    'Other Street', 'Other City', 'Other State', 'Other Postal Code', 'Other Country/Region',   // i18n-ignore: CSV and vCard column names (file formats)
    'Business Phone', 'Business Phone 2', 'Home Phone', 'Home Phone 2', 'Mobile Phone', 'Other Phone', 'Business Fax', 'Home Fax', 'Pager',   // i18n-ignore: CSV and vCard column names (file formats)
    'E-mail Address', 'E-mail 2 Address', 'E-mail 3 Address', 'Web Page', 'Birthday', 'Notes', 'Categories'];   // i18n-ignore: CSV and vCard column names (file formats)
  /** The Outlook phone columns a phone may go in, best first. */
  function phoneSlots(types) {
    const t = types || [];
    let pref;
    if (t.includes('FAX') && t.includes('WORK')) pref = ['Business Fax'];
    else if (t.includes('FAX') && t.includes('HOME')) pref = ['Home Fax'];
    else if (t.includes('CELL')) pref = ['Mobile Phone'];
    else if (t.includes('PAGER')) pref = ['Pager'];
    else if (t.includes('WORK')) pref = ['Business Phone', 'Business Phone 2'];   // i18n-ignore: CSV and vCard column names (file formats)
    else if (t.includes('HOME')) pref = ['Home Phone', 'Home Phone 2'];   // i18n-ignore: CSV and vCard column names (file formats)
    else pref = [];
    return pref.concat(['Other Phone']);
  }
  /** Outlook layout: one row per contact in the fixed slots. */
  function outlookCsv(contacts) {
    const rows = (contacts || []).map((x) => {
      const c = SC.model.normalise(x), n = c.name, v = {};
      for (const p of c.phones) { const slot = phoneSlots(p.types).find((s) => !v[s]); if (slot) v[slot] = p.value; }
      c.emails.slice(0, 3).forEach((e, i) => { v[['E-mail Address', 'E-mail 2 Address', 'E-mail 3 Address'][i]] = e.value; });
      const byType = { WORK: 'Business', HOME: 'Home' };   // i18n-ignore: CSV and vCard column names (file formats)
      for (const a of c.adr) {
        const pre = (a.types || []).map((t) => byType[t]).find((p) => p && !v[p + ' Street']) || ['Business', 'Home', 'Other'].find((p) => !v[p + ' Street']);   // i18n-ignore: CSV and vCard column names (file formats)
        if (!pre) continue;
        Object.assign(v, { [pre + ' Street']: a.street, [pre + ' City']: a.locality, [pre + ' State']: a.region,   // i18n-ignore: CSV and vCard column names (file formats)
          [pre + ' Postal Code']: a.postal, [pre + ' Country/Region']: a.country });   // i18n-ignore: CSV and vCard column names (file formats)
      }
      return [n.given, n.additional, n.family, n.prefix, n.suffix, c.org, c.dept, c.title,
        v['Business Street'], v['Business City'], v['Business State'], v['Business Postal Code'], v['Business Country/Region'],
        v['Home Street'], v['Home City'], v['Home State'], v['Home Postal Code'], v['Home Country/Region'],
        v['Other Street'], v['Other City'], v['Other State'], v['Other Postal Code'], v['Other Country/Region'],
        v['Business Phone'], v['Business Phone 2'], v['Home Phone'], v['Home Phone 2'], v['Mobile Phone'], v['Other Phone'],
        v['Business Fax'], v['Home Fax'], v['Pager'], v['E-mail Address'], v['E-mail 2 Address'], v['E-mail 3 Address'],
        c.url, ymdUS(c.bday), c.note, c.groups.join(';')];
    });
    return table(OUTLOOK_HEAD, rows);
  }

  const STAGE_LABEL = { lead: 'Lead', contacted: 'Contacted', customer: 'Customer', lost: 'Lost' };   // i18n-ignore: CSV and vCard column names (file formats)
  /** The plain layout: one column per e-mail and phone (numbered, so a re-import maps them), the address on one line,
   *  groups separated by semicolons, the pipeline stage. Reads back through the CSV column mapping. */
  function genericCsv(contacts) {
    const list = (contacts || []).map((c) => SC.model.normalise(c));
    const nE = Math.max(1, ...list.map((c) => c.emails.length)), nP = Math.max(1, ...list.map((c) => c.phones.length));
    const head = ['Name', 'First name', 'Last name', 'Company', 'Job title'];   // i18n-ignore: CSV and vCard column names (file formats)
    for (let i = 1; i <= nE; i++) head.push('E-mail ' + i);
    for (let i = 1; i <= nP; i++) head.push('Phone ' + i);   // i18n-ignore: CSV and vCard column names (file formats)
    head.push('Address', 'Groups', 'Birthday', 'Website', 'Notes', 'Pipeline');   // i18n-ignore: CSV and vCard column names (file formats)
    const rows = list.map((c) => {
      const n = c.name, r = [c.fn, n.given, n.family, c.org, c.title];
      for (let i = 0; i < nE; i++) r.push(c.emails[i] ? c.emails[i].value : '');
      for (let i = 0; i < nP; i++) r.push(c.phones[i] ? c.phones[i].value : '');
      r.push(c.adr.map((a) => [a.po, a.ext, a.street, a.locality, a.region, a.postal, a.country].filter(Boolean).join(', ')).join('; '),
        c.groups.join(';'), c.bday, c.url, c.note, c.stage ? STAGE_LABEL[c.stage] || c.stage : '');
      return r;
    });
    return table(head, rows);
  }

  /** The worksheet for an .xlsx export, in the shape shared/sheets/write.js takes: { name, rows, fmt, bold }. One row per
   *  contact; several e-mails or phones share a cell, separated by semicolons. The header row is bold. */
  const SHEET_HEAD = ['Name', 'Organisation', 'Job title', 'E-mail', 'Phone', 'Groups', 'Notes', 'Birthday', 'Website', 'Pipeline'];   // i18n-ignore: CSV and vCard column names (file formats)
  function sheetOf(contacts, name = 'Contacts') {   // i18n-ignore: CSV and vCard column names (file formats)
    const rows = [SHEET_HEAD.slice()];
    for (const x of contacts || []) {
      const c = SC.model.normalise(x);
      const cell = (v) => (v === '' || v == null ? null : v);
      rows.push([c.fn, c.org, c.title, c.emails.map((e) => e.value).join('; '), c.phones.map((p) => p.value).join('; '),
        c.groups.join('; '), cell(c.note), cell(c.bday), cell(c.url), c.stage ? STAGE_LABEL[c.stage] || c.stage : null]);
    }
    const bold = new Set(SHEET_HEAD.map((_, i) => i));
    return { name, rows, fmt: new Map(), bold };
  }

  SC.csv = Object.assign(SC.csv || {}, { googleCsv, outlookCsv, genericCsv, sheetOf, OUTLOOK_HEAD });
})();
