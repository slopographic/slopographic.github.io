/* Conversions for mail, calendar and XML files. The readers are shared with the apps: EmlMime (shared/mail/mime.js) and
 * SlopIcs (shared/calendar/ics.js) are classic scripts the converter page loads first; the ZIP code is shared/office/zip.js.
 * Each function takes bytes or text and returns the converted content; the catalogue (catalog.js) wires them to files.
 * The HTML written from a message blocks scripts and remote loads: the body came from someone else, so it goes through
 * SlopSanitize (shared/sanitize/sanitize.js, with DOMPurify) and the page carries a CSP. */
import { writeZip, readZip } from '../../../shared/office/zip.js';
import { htmlToText } from './html-text.js';
import { rowsToCsv } from './csv.js';
import { uniqueName } from '../io/files.js';
import '../../../shared/sanitize/sanitize.js';
import { tr } from './i18n.js';

const SAFE = () => globalThis.SlopSanitize;
const PURIFY = new URL('../../../vendor/dompurify/purify.min.js', import.meta.url).href;

// The shared readers are classic scripts that set a global. They load on first use, from the same folder tree as this
// module, so every converter page gets them without its own script tags.
const SHARED = {
  EmlMime: ['../../../shared/mail/codec.js', '../../../shared/mail/mime.js'],
  SlopIcs: ['../../../shared/calendar/tz.js', '../../../shared/calendar/rrule.js', '../../../shared/calendar/ics.js'],
};
const loading = new Map();
function loadScript(href) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = href;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`Could not load ${href}`));
    document.head.append(el);
  });
}
/** The shared reader called name (EmlMime or SlopIcs), loaded if the page does not have it yet. */
async function reader(name) {
  if (globalThis[name]) return globalThis[name];
  if (!loading.has(name)) loading.set(name, (async () => {
    for (const rel of SHARED[name]) await loadScript(new URL(rel, import.meta.url).href);
    if (!globalThis[name]) throw new Error(`${name} did not load.`);
    return globalThis[name];
  })());
  return loading.get(name);
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:";

/** The message in a file: headers, bodies and attachments, as EmlMime reads them. Bytes in, record out. */
export async function readEml(bytes) {
  return (await reader('EmlMime')).parse(bytes); // i18n-ignore: reader globals and the CSV header written into the file
}

/** A message as one HTML page: the address and date lines, then the HTML body (or the plain text, in a <pre>). */
export async function emlToHtml(bytes) {
  const M = await reader('EmlMime'), msg = M.parse(bytes), s = M.summary(msg); // i18n-ignore: reader globals and the CSV header written into the file
  const rows = [['From', s.from], ['To', s.to], ['Cc', s.cc], ['Date', s.date], ['Subject', s.subject]]
    .filter(([, v]) => v)
    .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
  let body;
  if (msg.html) {
    await SAFE().ready(PURIFY);
    body = SAFE().html(M.embedCids(msg.html, msg.cids).html, { urls: 'local', whole: true });
  } else {
    body = `<pre>${esc(msg.text || '')}</pre>`;
  }
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${CSP}">\n<title>${esc(s.subject || 'Message')}</title>\n` +
    `<style>body{font:15px/1.5 system-ui,sans-serif;margin:24px;color:#111}dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 14px;margin:0 0 16px}dt{color:#555}dd{margin:0}hr{border:0;border-top:1px solid #ddd;margin:16px 0}pre{white-space:pre-wrap}</style>\n` +
    `</head><body><dl>${rows}</dl><hr>${body}</body></html>\n`;
}

/** A message as plain text: the address and date lines, a blank line, then the text body (the HTML body's text when there
 *  is no plain text part). */
export async function emlToText(bytes) {
  const M = await reader('EmlMime'), msg = M.parse(bytes), s = M.summary(msg); // i18n-ignore: reader globals and the CSV header written into the file
  const head = [['From', s.from], ['To', s.to], ['Cc', s.cc], ['Date', s.date], ['Subject', s.subject]]
    .filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n');
  const body = msg.text != null ? msg.text : (msg.html ? htmlToText(msg.html) : '');
  return `${head}\n\n${body}`.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

/** The attachments of a message as one ZIP (names kept, duplicates numbered). Throws when there are none. */
export async function emlAttachmentsZip(bytes) {
  const msg = await readEml(bytes);
  if (!msg.attachments || !msg.attachments.length) throw new Error(tr('convert.mail.no_attachments'));
  const taken = new Set();
  const entries = msg.attachments.map((a, i) => {
    const name = uniqueName(a.name || `attachment-${i + 1}`, taken);
    return { path: name, data: a.bytes };
  });
  return writeZip(entries);
}

/** The events of an iCalendar file as rows: title, start, end, all day, location, notes. Returns { rows, warnings }. */
export async function icsRows(text) {
  const { events, warnings } = (await reader('SlopIcs')).parse(text); // i18n-ignore: reader globals and the CSV header written into the file
  const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');
  const rows = events.map((e) => (e.allDay
    ? [e.title, e.startDay, e.endDay, 'yes', e.location || '', e.notes || '']
    : [e.title, iso(e.start), iso(e.end), 'no', e.location || '', e.notes || '']));
  return { rows, warnings };
}

/** The events as CSV, with a header line. */
export async function icsToCsv(text) {
  const { rows } = await icsRows(text);
  return rowsToCsv([['Title', 'Start', 'End', 'All day', 'Location', 'Notes'], ...rows]); // i18n-ignore: reader globals and the CSV header written into the file
}

/** The events as JSON: the records as the calendar reads them, and the warnings about what was skipped. */
export async function icsToJson(text) {
  const { events, warnings } = (await reader('SlopIcs')).parse(text); // i18n-ignore: reader globals and the CSV header written into the file
  return JSON.stringify({ events: events.map(({ title, uid, allDay, startDay, endDay, start, end, location, notes }) => ({ title, uid, allDay, startDay, endDay, start: start ?? null, end: end ?? null, location, notes })), warnings }, null, 2) + '\n';
}

/** An XML document as JSON: each element is { name, attributes?, text?, children? }. Throws when the XML is not well formed. */
export function xmlToJson(text) {
  const doc = new DOMParser().parseFromString(SAFE().xmlText(text), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error(tr('convert.mail.bad_xml'));
  const node = (el) => {
    const o = { name: el.localName || el.tagName };
    if (el.attributes.length) o.attributes = Object.fromEntries([...el.attributes].map((a) => [a.name, a.value]));
    const kids = [...el.children];
    if (kids.length) o.children = kids.map(node);
    const t = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join('').trim();
    if (t) o.text = t;
    return o;
  };
  return JSON.stringify(node(doc.documentElement), null, 2) + '\n';
}

/** The entries of a ZIP file as separate files (folders are flattened to their file names, duplicates numbered). */
export async function unzipEntries(file) {
  const map = await readZip(file);
  const taken = new Set(), out = [];
  for (const [path, bytes] of map) {
    const base = String(path).split('/').pop() || 'file';
    const name = uniqueName(base, taken);
    out.push({ name, blob: new Blob([bytes]) });
  }
  return out;
}

/** Any files as one ZIP, with their names kept (duplicates numbered). */
export async function zipFiles(files) {
  const taken = new Set();
  const entries = [];
  for (const f of files) {
    const name = uniqueName(f.name, taken);
    entries.push({ path: name, data: new Uint8Array(await f.file.arrayBuffer()) });
  }
  return writeZip(entries);
}
