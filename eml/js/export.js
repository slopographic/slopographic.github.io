/* Slop EML: every export of one or many messages, as files ready to download or to send to another app. ES module, loaded
 * on first use by eml/js/export-ui.js. The message readers are the shared ones: File convert's emlToHtml and emlToText
 * (convert/js/core/mail.js) for HTML and text, EmlPdf (eml/js/pdf-out.js) for PDF, SlopZip for ZIPs. Names come from
 * EmlBatch (safe, unique, "2024-03-01 Subject").
 *   FORMATS: [{ id, label, ext, pdf? }]
 *   make(id, docs, { attachments, append }) → Promise<{ blob, name, info?, count }>
 *     pdf       one PDF (several messages: oldest first, a contents page, each from a new page)
 *     pdfzip    one PDF per message, in a ZIP
 *     txt, html, md   one file for one message; several in a ZIP
 *     csv       the list: date, from, to, subject, attachment names
 *     eml       the original files (one as it is; several in a ZIP)
 *     atts      the attachments (one message: flat; several: a folder per message), in a ZIP */
import { emlToHtml, emlToText } from '../../convert/js/core/mail.js';

export const FORMATS = [
  { id: 'pdf', label: 'PDF, one file', ext: 'pdf', pdf: true },   // i18n-ignore: not on screen (the Export menu has its own words)
  { id: 'pdfzip', label: 'PDF, one per message (ZIP)', ext: 'zip', pdf: true, many: true },   // i18n-ignore: not on screen (the Export menu has its own words)
  { id: 'txt', label: 'Plain text', ext: 'txt' },   // i18n-ignore: not on screen (the Export menu has its own words)
  { id: 'html', label: 'HTML', ext: 'html' },   // i18n-ignore: not on screen (the Export menu has its own words)
  { id: 'md', label: 'Markdown', ext: 'md' },   // i18n-ignore: not on screen (the Export menu has its own words)
  { id: 'csv', label: 'List of messages (CSV)', ext: 'csv' },   // i18n-ignore: not on screen (the Export menu has its own words)
  { id: 'eml', label: 'Original .eml files', ext: 'eml' },   // i18n-ignore: not on screen (the Export menu has its own words)
  { id: 'atts', label: 'Attachments (ZIP)', ext: 'zip' },   // i18n-ignore: not on screen (the Export menu has its own words)
];
const B = () => window.EmlBatch;
const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
const zip = (entries) => window.SlopZip.zip(entries);

/** A message as Markdown: the subject as a heading, the address lines, the text, and the attachment names. */
export function toMarkdown(d) {
  const s = d.summary, m = d.msg;
  const esc = (str) => String(str || '').replace(/([\\`*_[\]<>#|])/g, '\\$1');
  const head = [['From', s.from], ['To', s.to], ['Cc', s.cc], ['Date', s.date]].filter((r) => r[1]).map(([k, v]) => '**' + k + ':** ' + esc(v));
  const body = m.text != null ? m.text : m.html != null ? window.EmlText.htmlToText(m.html) : '';
  const atts = m.attachments.length ? ['', '## Attachments', '', ...m.attachments.map((a) => '- ' + esc(a.name))] : [];
  return ['# ' + esc(s.subject || '(no subject)'), '', head.join('  \n'), '', '---', '', body.trimEnd(), ...atts].join('\n').trimEnd() + '\n';
}

async function textOf(id, d) {
  if (id === 'txt') return emlToText(d.bytes);
  if (id === 'html') return emlToHtml(d.bytes);
  return toMarkdown(d);
}
const TYPE = { txt: 'text/plain', html: 'text/html', md: 'text/markdown', csv: 'text/csv', pdf: 'application/pdf', zip: 'application/zip', eml: 'message/rfc822' };

/** Each message's stem, in the order given (the list's order, or oldest first for PDFs). */
const stemsOf = (docs) => B().stems(docs);

export async function make(id, docs, o = {}) {
  if (!docs.length) throw new Error('No messages to export.');
  const one = docs.length === 1, P = window.EmlPdf;
  const zipName = (what) => (one ? stemsOf(docs)[0] : docs.length + ' messages') + ' ' + what + '.zip';
  if (id === 'pdf') {
    const r = one ? await P.build(docs[0], o) : await P.combine(docs, o);
    return { blob: new Blob([r.bytes], { type: TYPE.pdf }), name: one ? P.fileName(docs[0]) : P.combinedName(docs), info: r.info, count: docs.length, pages: r.pages };
  }
  if (id === 'pdfzip') {
    const list = B().chrono(docs), names = stemsOf(list), entries = [];
    let info = '';
    for (let i = 0; i < list.length; i++) {
      const r = await P.build(list[i], o);
      if (r.info) info = r.info;
      entries.push({ name: names[i] + '.pdf', data: r.bytes, time: list[i].time || Date.now() });
    }
    return { blob: await zip(entries), name: zipName('PDF'), info, count: list.length };
  }
  if (id === 'txt' || id === 'html' || id === 'md') {
    const names = stemsOf(docs), files = [];
    for (let i = 0; i < docs.length; i++) files.push({ name: names[i] + '.' + id, data: await textOf(id, docs[i]), time: docs[i].time || Date.now() });
    if (one) return { blob: new Blob([files[0].data], { type: TYPE[id] + ';charset=utf-8' }), name: files[0].name, count: 1 };
    return { blob: await zip(files), name: zipName(id.toUpperCase()), count: docs.length };
  }
  if (id === 'csv') {
    return { blob: new Blob(['﻿' + B().csv(B().csvRows(docs))], { type: TYPE.csv + ';charset=utf-8' }), name: (one ? stemsOf(docs)[0] : docs.length + ' messages') + '.csv', count: docs.length };
  }
  if (id === 'eml') {
    const names = stemsOf(docs).map((n) => n + '.eml');
    if (one) return { blob: new Blob([docs[0].bytes], { type: TYPE.eml }), name: /\.eml$/i.test(docs[0].name) ? B().safeName(docs[0].name) : names[0], count: 1 };
    return { blob: await zip(docs.map((d, i) => ({ name: names[i], data: d.bytes, time: d.time || Date.now() }))), name: zipName('EML'), count: docs.length };
  }
  if (id === 'atts') {
    const withAtts = docs.filter((d) => d.msg.attachments.length);
    if (!withAtts.length) throw new Error(one ? t('eml.err.no_atts_one') : t('eml.err.no_atts'));
    const folders = stemsOf(withAtts), entries = [];
    withAtts.forEach((d, i) => {
      const names = B().uniqueNames(d.msg.attachments.map((a) => a.name), 'attachment');
      d.msg.attachments.forEach((a, k) => entries.push({ name: (one ? '' : folders[i] + '/') + names[k], data: a.bytes, time: d.time || Date.now() }));
    });
    return { blob: await zip(entries), name: zipName('attachments'), count: entries.length };
  }
  throw new Error('Unknown format ' + id);
}
