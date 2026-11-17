/* Slop Contacts: the .scontacts file (JSON, an import and export format) and the export table. Each export returns
 * { blob, name } so the app can download it and save the same file to Slop Drive.
 * Classic script. Adds SlopContacts.format. */
(function () {
  'use strict';
  const SC = (window.SlopContacts = window.SlopContacts || {});
  const M = SC.model;
  const MIME = 'application/x-slop-contacts', EXT = 'scontacts';
  const enc = new TextEncoder();

  /** The saved list. Contacts are normalised on the way out and on the way back in. */
  function toScontacts(list, meta = {}) {
    return JSON.stringify({ format: 'slop-contacts', version: 1, saved: new Date().toISOString(), meta, contacts: list.map(M.normalise) }, null, 1);
  }
  function fromScontacts(text) {
    const d = JSON.parse(String(text || ''));
    if (!d || d.format !== 'slop-contacts' || !Array.isArray(d.contacts)) throw new Error('This is not a Slop Contacts file.');
    return d.contacts.map(M.normalise);
  }

  /** A file name safe on every system: no slashes, no control characters, at most 80 characters. */
  const safe = (s) => String(s || '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Contact';   // i18n-ignore: file names and the format list the exporter keeps (the page shows contacts.io.f_<id>)
  const textBlob = (text, type) => new Blob([text], { type });

  /** One zip entry per contact, named after its display name (duplicates get " (2)"). */
  function zipOf(list, version) {
    const files = list.map((c) => ({ name: safe(M.displayName(c)) + '.vcf', data: enc.encode(SC.vcard.one(M.normalise(c), version)) }));
    return new Blob([SC.zip.store(files)], { type: 'application/zip' });
  }

  /** The export table. base is the list name without extension. XLSX is not here: it is built by the app (async). */
  const FORMATS = [
    { id: 'vcf', label: 'vCard 3.0 (.vcf), one file for iOS and Android', ext: 'vcf',   // i18n-ignore: file names and the format list the exporter keeps (the page shows contacts.io.f_<id>)
      build: (list, base) => ({ blob: textBlob(SC.vcard.write(list, '3.0'), 'text/vcard'), name: `${safe(base)}.vcf` }) },
    { id: 'vcf40', label: 'vCard 4.0 (.vcf), one file', ext: 'vcf',   // i18n-ignore: file names and the format list the exporter keeps (the page shows contacts.io.f_<id>)
      build: (list, base) => ({ blob: textBlob(SC.vcard.write(list, '4.0'), 'text/vcard'), name: `${safe(base)} (4.0).vcf` }) },
    { id: 'zip', label: 'vCard 3.0, one file per contact (.zip)', ext: 'zip',   // i18n-ignore: file names and the format list the exporter keeps (the page shows contacts.io.f_<id>)
      build: (list, base) => ({ blob: zipOf(list, '3.0'), name: `${safe(base)} vcards.zip` }) },
    { id: 'zip40', label: 'vCard 4.0, one file per contact (.zip)', ext: 'zip',   // i18n-ignore: file names and the format list the exporter keeps (the page shows contacts.io.f_<id>)
      build: (list, base) => ({ blob: zipOf(list, '4.0'), name: `${safe(base)} vcards 4.0.zip` }) },
    { id: 'csv', label: 'CSV (.csv), one column per e-mail and phone', ext: 'csv',   // i18n-ignore: file names and the format list the exporter keeps (the page shows contacts.io.f_<id>)
      build: (list, base) => ({ blob: textBlob(SC.csv.genericCsv(list), 'text/csv'), name: `${safe(base)}.csv` }) },
    { id: 'google', label: 'Google Contacts CSV', ext: 'csv',   // i18n-ignore: file names and the format list the exporter keeps (the page shows contacts.io.f_<id>)
      build: (list, base) => ({ blob: textBlob(SC.csv.googleCsv(list), 'text/csv'), name: `${safe(base)} (Google).csv` }) },
    { id: 'outlook', label: 'Outlook CSV', ext: 'csv',   // i18n-ignore: file names and the format list the exporter keeps (the page shows contacts.io.f_<id>)
      build: (list, base) => ({ blob: textBlob(SC.csv.outlookCsv(list), 'text/csv'), name: `${safe(base)} (Outlook).csv` }) },
  ];
  const formatById = (id) => FORMATS.find((f) => f.id === id) || FORMATS[0];
  /** The export for a format id. Returns { blob, name, count }. */
  function exportAs(id, list, base = 'Contacts') {   // i18n-ignore: file names and the format list the exporter keeps (the page shows contacts.io.f_<id>)
    const f = formatById(id);
    return { ...f.build(list, base), count: list.length };
  }

  SC.format = { MIME, EXT, toScontacts, fromScontacts, safe, FORMATS, formatById, exportAs };
})();
