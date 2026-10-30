/* Word (DOCX) to PDF, HTML, plain text and Markdown, with Slop Docs' own engine (single source): its DOCX import
 * (docs/js/io/docx-in.js), its page layout and PDF writer (through doc-out.js, so every writing system gets its font through
 * shared/fonts/pdf-runs.js and SlopFontJIT, as Markdown to PDF does), and its Markdown, HTML and text writers
 * (docs/js/io/md-out.js, html-out.js, sdoc.js). Slop Docs does not read ODT, so ODT is not offered here.
 * Browser only (the import parses XML with DOMParser). Exports DOCX_IN (the catalog entries) and docxDoc. */
import { stemOf as base } from '../io/files.js';
import { engine, ensureFaces, docPdf } from './doc-out.js';
import { SLIDES_IN } from './slides-out.js';
import { tr } from './i18n.js';
/** A select choice [value, label] whose label is read in the current language. */
const ch = (v, label) => Object.defineProperty([v], 1, { get: label, enumerable: true });

const DOCX_NOTE = () => tr('convert.office.docx_note');

/** The Word file as a Slop Docs document. A file that is not a Word document says so. */
export async function docxDoc(E, f) {
  let doc;
  try { doc = await E.importDocx(new Uint8Array(await f.file.arrayBuffer())); }
  catch (e) { throw new Error(/Not a Word document/.test(e.message) ? tr('convert.office.not_docx', { name: f.name }) : tr('convert.office.could_not_read', { name: f.name, error: e.message })); }
  if (!doc.meta.title) doc.meta.title = base(f.name);
  return doc;
}
const out = (name, data, type) => ({ name, blob: new Blob([data], { type }) });

async function toPdf(files, o = {}) {
  const f = files[0], E = await engine(), doc = await docxDoc(E, f);
  if (o.page === 'a4' || o.page === 'letter') doc.section = { ...doc.section, size: o.page === 'letter' ? 'Letter' : 'A4' }; // i18n-ignore: page size ids
  await ensureFaces(E, doc);
  return docPdf(E, doc, f.name);
}
async function toHtml(files, o = {}) {
  const f = files[0], E = await engine(), doc = await docxDoc(E, f), { toHtml: html } = await import('../../../docs/js/io/html-out.js');
  return [out(`${base(f.name)}.html`, html(doc, { title: base(f.name), standalone: o.standalone !== false }), 'text/html')];
}
async function toText(files) {
  const f = files[0], E = await engine(), doc = await docxDoc(E, f);
  return [out(`${base(f.name)}.txt`, E.SD.toText(doc) + '\n', 'text/plain')];
}
async function toMd(files) {
  const f = files[0], E = await engine(), doc = await docxDoc(E, f), { toMarkdown } = await import('../../../docs/js/io/md-out.js');
  return [out(`${base(f.name)}.md`, toMarkdown(doc, { underline: false }), 'text/markdown')];
}

const PAGE = { key: 'page', type: 'select', get label() { return tr('convert.office.page_size'); }, value: 'doc', options: [ch('doc', () => tr('convert.office.as_in_the_document')), ['a4', 'A4'], ch('letter', () => tr('convert.office.us_letter'))] };
const WORD = ['word', 'doc', 'microsoft word', 'document']; // i18n-ignore: search keywords

export const DOCX_IN = [
  { id: 'docx-to-pdf', get label() { return tr('convert.office.word_to_pdf'); }, group: 'Documents', from: ['docx'], ext: 'pdf', mode: 'each', get note() { return DOCX_NOTE(); }, options: [PAGE], // i18n-ignore: group is an id (groupLabel)
    keywords: [...WORD, 'docx', 'print', 'save as pdf'], run: toPdf }, // i18n-ignore: search keywords
  { id: 'docx-to-html', get label() { return tr('convert.office.word_to_html'); }, group: 'Documents', from: ['docx'], ext: 'html', mode: 'each', // i18n-ignore: group is an id (groupLabel)
    get note() { return tr('convert.office.headings_paragraphs_lists_tables_links_bold'); },
    options: [{ key: 'standalone', type: 'checkbox', get label() { return tr('convert.office.full_web_page_not_just_the'); }, value: true }], keywords: [...WORD, 'docx', 'web', 'page'], run: toHtml },
  { id: 'docx-to-md', get label() { return tr('convert.office.word_to_markdown'); }, group: 'Documents', from: ['docx'], ext: 'md', mode: 'each', // i18n-ignore: group is an id (groupLabel)
    get note() { return tr('convert.office.headings_lists_nested_bold_italic_strikethrough'); },
    options: [], keywords: [...WORD, 'docx', 'md', 'readme', 'github'], run: toMd },
  { id: 'docx-to-text', get label() { return tr('convert.office.word_to_plain_text'); }, group: 'Documents', from: ['docx'], ext: 'txt', mode: 'each', // i18n-ignore: group is an id (groupLabel)
    get note() { return tr('convert.office.one_line_per_paragraph_table_cells'); }, options: [], keywords: [...WORD, 'docx', 'txt', 'extract text'], run: toText }, // i18n-ignore: search keywords
];

/** Every Office conversion (Word, then PowerPoint), for the catalog. */
export const OFFICE = [...DOCX_IN, ...SLIDES_IN];
