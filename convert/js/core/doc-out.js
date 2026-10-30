/* Text and Markdown to PDF and to Word (DOCX), with Slop Docs' own engine, so the result is what Slop Docs makes: its
 * Markdown and text import (docs/js/io/sdoc.js), its page layout (docs/js/layout), its PDF writer (docs/js/io/pdf.js, which
 * draws text with the shared run drawer shared/fonts/pdf-runs.js) and its DOCX writer (docs/js/io/docx.js). Text in any
 * writing system works: the document faces are the site's own (shared/fonts), and a script they cannot set (Arabic,
 * Chinese, Devanagari…) gets its Noto language font through SlopFontJIT, which asks before the first download.
 * Browser only. Exports textToPdf, textToDocx and DOC_OUT (the catalog entries), and the engine, its classic helpers and
 * docPdf for Word to PDF (office.js) and Slop Slides' engine (slides-engine.js). */
import { stemOf as base } from '../io/files.js';
import { decodeText } from './text.js';
import { tr } from './i18n.js';

const SHARED = new URL('../../../shared/', import.meta.url).href;
// classic scripts the engine reads as globals: scripts and bidi (layout), the run drawer (PDF), JIT language fonts and SlopUI
// (the download question)
const CLASSIC = [['SlopScripts', 'fonts/scripts.js'], ['SlopBidi', 'fonts/bidi.js'], ['SlopPdfRuns', 'fonts/pdf-runs.js'], ['SlopFontJIT', 'fonts/jit.js'], ['SlopUI', 'slopui.js']];
let readyP = null;

/** A classic script from shared/ (or any URL), in order. */
export function script(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = new URL(src, SHARED).href; s.async = false; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src.replace(/^.*\//, ''))); document.head.append(s); });
}
/** The classic helpers every text engine here needs (Slop Docs' and Slop Slides'): scripts, bidi, the PDF run drawer,
 *  the language fonts and SlopUI for the download question. Each is loaded once, and not at all on a page that has it. */
export async function textHelpers() {
  if (!document.querySelector('link[href*="slopui.css"]')) document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: SHARED + 'slopui.css' }));
  for (const [g, src] of CLASSIC) if (!globalThis[g]) await script(src);
}
/** The engine modules, and its classic helpers once. */
export function engine() {
  if (!readyP) {
    readyP = (async () => {
      await textHelpers();
      const [SD, layout, reg, lang, docx, fonts] = await Promise.all([
        import('../../../docs/js/io/sdoc.js'), import('../../../docs/js/layout/index.js'), import('../../../docs/js/fonts/registry.js'),
        import('../../../docs/js/fonts/lang-doc.js'), import('../../../docs/js/io/docx.js'), import('../../../docs/js/fonts/doc-fonts.js')]);
      return { SD, layoutDoc: layout.layoutDoc, reg, lang, exportDocx: docx.exportDocx, importDocx: docx.importDocx, ensureDocFonts: fonts.ensureDocFonts,
        exportPdf: async (...a) => (await import('../../../docs/js/io/pdf.js')).exportPdf(...a) };
    })();
    readyP.catch(() => { readyP = null; });
  }
  return readyP;
}

const FONTS = { sans: 'Carlito', serif: 'Tinos', mono: 'Cousine' }; // i18n-ignore: font and style names

/** A Slop Docs document from the file: Markdown (headings, lists, quotes, code, bold, italic) or plain text, one paragraph a line. */
async function docOf(E, f, { markdown, page = 'A4', font = 'sans' }) {
  const text = decodeText(new Uint8Array(await f.file.arrayBuffer()));
  const doc = markdown ? E.SD.fromMarkdown(text) : E.SD.fromText(text);
  doc.section = { ...doc.section, size: page === 'letter' ? 'Letter' : 'A4' }; // i18n-ignore: font and style names
  doc.meta.title = base(f.name);
  const face = FONTS[font] || FONTS.sans;
  if (face !== 'Carlito') for (const b of doc.blocks) if (b.type === 'p' && b.style !== 'Code') b.runs = (b.runs || []).map((r) => (r.font ? r : { ...r, font: face })); // i18n-ignore: font and style names
  return doc;
}

/** The faces the runs use, with their styles' marks (fonts/doc-fonts.js), and the heading faces, loaded (the layout measures with them). */
export async function ensureFaces(E, doc) {
  await E.ensureDocFonts(doc);
  const want = new Map();
  for (const b of doc.blocks) for (const r of (b.runs || [])) { const k = `${r.font || ''}|${!!r.b}|${!!r.i}`; if (!want.has(k)) want.set(k, { font: r.font || 'Carlito', b: !!r.b, i: !!r.i }); } // i18n-ignore: font and style names
  for (const h of ['Carlito', 'Caladea', 'Cousine']) { want.set(h + '|b', { font: h, b: true, i: false }); want.set(h + '|', { font: h, b: false, i: false }); } // i18n-ignore: font and style names
  await E.reg.ensureFaces([...want.values()]);
}

export async function textToPdf(files, o = {}, markdown = false) {
  const f = files[0], E = await engine();
  const doc = await docOf(E, f, { markdown, page: o.page, font: o.font });
  await ensureFaces(E, doc);
  return docPdf(E, doc, f.name);
}

/** A Slop Docs document as a PDF, with the language fonts its text needs (SlopFontJIT asks before the first download). */
export async function docPdf(E, doc, name) {
  let info = '';
  if (E.lang.mayNeedLang(doc) && !(await E.lang.ensureDocLang(doc, { force: true }))) info = tr('convert.doc.font_missing');
  const bytes = await E.exportPdf(doc, E.layoutDoc(doc), { title: (doc.meta && doc.meta.title) || base(name), author: (doc.meta && doc.meta.author) || '' });
  const out = [{ name: `${base(name)}.pdf`, blob: new Blob([bytes], { type: 'application/pdf' }) }];
  if (info) out.info = info;
  return out;
}

export async function textToDocx(files, o = {}, markdown = true) {
  const f = files[0], E = await engine();
  const doc = await docOf(E, f, { markdown, page: o.page, font: o.font });
  const made = await E.exportDocx(doc);
  const type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return [{ name: `${base(f.name)}.docx`, blob: new Blob([made], { type }) }];   // a Blob or bytes from the writer, typed either way
}

const PAGE = { key: 'page', type: 'select', get label() { return tr('convert.doc.page_size'); }, value: 'a4',
  get options() { return [['a4', 'A4'], ['letter', tr('convert.doc.us_letter')]]; } };
/** The font option, with its default face (a fresh object: a spread copy would keep the labels of one language). */
const font = (value = 'sans') => ({ key: 'font', type: 'select', get label() { return tr('convert.doc.font'); }, value,
  get options() { return [['sans', tr('convert.doc.font_sans')], ['serif', tr('convert.doc.font_serif')], ['mono', tr('convert.doc.font_mono')]]; } });
const FONT = font();
const mdNote = () => tr('convert.doc.md_note');

export const DOC_OUT = [
  { id: 'md-to-pdf', get label() { return tr('convert.doc.md_to_pdf'); }, group: 'Documents', from: ['md'], ext: 'pdf', mode: 'each', get note() { return mdNote(); }, options: [PAGE, FONT], keywords: ['md', 'print'], run: (f, o) => textToPdf(f, o, true) }, // i18n-ignore: group id (shown through groupLabel)
  { id: 'txt-to-pdf', get label() { return tr('convert.doc.txt_to_pdf'); }, group: 'Documents', from: ['txt'], ext: 'pdf', mode: 'each', options: [PAGE, font('mono')], keywords: ['txt', 'print', 'notepad'], run: (f, o) => textToPdf(f, o, false) }, // i18n-ignore: group id (shown through groupLabel)
  { id: 'md-to-docx', get label() { return tr('convert.doc.md_to_docx'); }, group: 'Documents', from: ['md'], ext: 'docx', mode: 'each', get note() { return mdNote(); }, options: [PAGE, FONT], keywords: ['word', 'md', 'doc'], run: (f, o) => textToDocx(f, o, true) }, // i18n-ignore: group id (shown through groupLabel)
  { id: 'txt-to-docx', get label() { return tr('convert.doc.txt_to_docx'); }, group: 'Documents', from: ['txt'], ext: 'docx', mode: 'each', options: [PAGE, FONT], keywords: ['word', 'txt', 'doc'], run: (f, o) => textToDocx(f, o, false) }, // i18n-ignore: group id (shown through groupLabel)
];
