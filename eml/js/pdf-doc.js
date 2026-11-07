/* Slop EML: messages as a Slop Docs document (docs/js/model/doc.js), which Slop Docs' own layout and PDF writer turn into
 * the PDF (eml/js/pdf-out.js). One message per section, each starting on a new page with its subject as a heading (a PDF
 * bookmark), its address and date lines, its text, and its attachment names. With a cover: a title, the date span, and a
 * table of the messages with the page each starts on (links to it). Text in any writing system is set by the Docs engine.
 *   messagesDoc(entries, { cover, list, title, subtitle, pages }) → doc
 *     entry = { pid, subject, rows: [[label, value]], dateShort, from, text, atts: [{ name, type, size, note }],
 *               images: [{ name, src, w, h }] }      pages: Map pid → page number (the cover's last column)
 *   BODY: the text width in points (A4 with these margins). */
import { newDoc, uid, OBJ } from '../../docs/js/model/doc.js';

const W = 595.28, H = 841.89;
export const MARGIN = { top: 54, right: 54, bottom: 64, left: 54, header: 28, footer: 28 };
export const BODY = W - MARGIN.left - MARGIN.right;
export const BODY_H = H - MARGIN.top - MARGIN.bottom;
const GREY = '#555555';

const p = (runs, props = {}, style = 'Normal') => ({ type: 'p', id: uid(), style, props, runs: runs.filter((r) => r.text) });
const size = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB');
const cell = (runs, props = {}) => ({ blocks: [p(runs, { after: 0, line: 1.05, ...props })] });

function cover(entries, o) {
  const out = [p([{ text: o.title || 'Messages' }], {}, 'Title')];
  if (o.subtitle) out.push(p([{ text: o.subtitle }], {}, 'Subtitle'));
  const cols = [24, 84, 120, 0, 40];
  cols[3] = BODY - cols.reduce((a, b) => a + b, 0);
  const head = { header: true, cells: ['#', 'Date', 'From', 'Subject', 'Page'].map((t, i) => ({ ...cell([{ text: t, b: true, size: 9 }], i === 4 ? { align: 'right' } : {}), shade: '#eeeeee' })) };
  const rows = entries.map((e, i) => ({ header: false, cells: [
    cell([{ text: String(i + 1), size: 9, color: GREY }]),
    cell([{ text: e.dateShort || '', size: 9 }]),
    cell([{ text: e.from || '', size: 9 }]),
    cell([{ text: e.subject, size: 9, link: '#' + e.pid, color: '#1f3a5f' }]),
    cell([{ text: o.pages && o.pages.has(e.pid) ? String(o.pages.get(e.pid)) : '000', size: 9 }], { align: 'right' }),
  ] }));
  out.push({ type: 'table', id: uid('t'), cols, border: { w: 0.5, color: '#bbbbbb' }, rows: [head, ...rows] });
  return out;
}

function message(e, first, o) {
  const out = [p([{ text: e.subject }], { pageBreakBefore: !first, before: 0 }, 'H1')];
  e.rows.forEach(([k, v], i) => {
    const last = i === e.rows.length - 1;
    out.push(p([{ text: k + ': ', b: true, size: 10, color: '#333333' }, { text: v, size: 10 }],
      { after: last ? 10 : 1, line: 1.1, keepNext: true, ...(last ? { borderBottom: { w: 0.6, color: '#999999' } } : {}) }));
  });
  out.push(p([{ text: '' }], { after: 4 }));
  const lines = String(e.text || '').replace(/\r\n?/g, '\n').split('\n');
  if (!lines.some((l) => l.trim())) out.push(p([{ text: '(This message has no text body.)', i: true, color: GREY }]));
  else for (const l of lines) out.push(p([{ text: l.replace(/\t/g, '    ') }], { after: 0, line: 1.2 }));
  if (o.list !== false && e.atts.length) {
    out.push(p([{ text: 'Attachments (' + e.atts.length + ')' }], { before: 14 }, 'H3'));   // i18n-ignore: text in the PDF
    for (const a of e.atts) {
      out.push(p([{ text: '• ' + a.name, size: 10 }, { text: '  ' + (a.type || 'file') + ', ' + size(a.size || 0) + (a.note ? ' · ' + a.note : ''), size: 9, color: GREY }],
        { after: 1, indL: 10, indF: -10 }));
    }
  }
  for (const im of e.images || []) {
    out.push(p([{ text: 'Attachment: ' + im.name, size: 9, color: GREY }], { pageBreakBefore: true, keepNext: true, after: 6 }));   // i18n-ignore: text in the PDF
    const k = Math.min(1, BODY / im.w, (BODY_H - 40) / im.h);
    out.push(p([{ text: OBJ, obj: 'img', src: im.src, w: Math.max(1, Math.round(im.w * k)), h: Math.max(1, Math.round(im.h * k)), alt: im.name }], { after: 0 }));
  }
  return out;
}

export function messagesDoc(entries, o = {}) {
  const doc = newDoc({ size: 'A4' });
  doc.section = { ...doc.section, margin: { ...MARGIN } };
  doc.meta.title = o.title || (entries[0] && entries[0].subject) || 'Messages';
  const blocks = o.cover ? cover(entries, o) : [];
  entries.forEach((e, i) => blocks.push(...message(e, !o.cover && i === 0, o)));
  blocks.push(p([]));
  doc.blocks = blocks;
  return doc;
}
