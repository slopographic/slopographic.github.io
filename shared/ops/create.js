/* Operations that make a new file from an outline, with the apps' own engines run headlessly (no app window):
 *   outline-to-presentation   Slop Slides: the outline (JSON or Markdown, slides/js/core/outline.js) → a deck → PowerPoint,
 *                             PDF or .sslide, through the editor's own writers (slides/js/io/pptx.js, pdf.js). The engine is
 *                             File convert's loader of Slop Slides' scripts (convert/js/core/slides-out.js slidesEngine).
 *   outline-to-document       Slop Docs: the outline (JSON or Markdown, docs/js/model/build.js) → a document → Word, PDF,
 *                             Markdown or .sdoc, through Slop Docs' own writers (convert/js/core/doc-out.js engine).
 * The input is the outline as a .json, .md or .txt file (the assistant saves it to Slop Drive first). The outline's shapes
 * are in the headers of slides/js/core/outline.js and docs/js/model/build.js. */
import { register } from './registry.js';
import { stem } from './load.js';
import { t, opt } from './i18n.js';

const SLIDE_SIZES = ['', ['16:9', '16:9'], ['4:3', '4:3'], ['16:10', '16:10'], ['A4', 'A4']];
const THEMES = ['', ['slop', 'Slopographic'], 'paper', 'midnight', 'editorial', 'aurora', 'terminal', 'sunset', 'chalk'];
const IN = ['json', 'md', 'txt'];
const text = async (f) => (await f.file.text()).replace(/^\uFEFF/, '');
// The outline formats, for the step's description (the assistant reads it): code, not words
const SLIDE_HELP = 'JSON { "title", "subtitle", "theme", "slides": [{ "title", "bullets": [..], "notes", "layout" }] }; Markdown: "# Title", "## Slide", "- bullet", "> note".';   // i18n-ignore: format
const DOC_HELP = 'JSON { "title", "subtitle", "blocks": [{ "type": "heading", "text", "level" } | { "type": "paragraph", "text" } | { "type": "bullets", "items": [..] } | { "type": "table", "rows": [[..]] }] }; Markdown.';   // i18n-ignore: format

let slidesP = null;
/** window.SS with the outline builder and both writers. */
async function slides() {
  if (!slidesP) slidesP = (async () => {
    const { slidesEngine } = await import('../../convert/js/core/slides-out.js');
    const { script } = await import('../../convert/js/core/doc-out.js');
    const S = await slidesEngine();
    if (!S.pptx) await script(new URL('../../slides/js/io/pptx.js', import.meta.url).href);
    if (!S.outline) await script(new URL('../../slides/js/core/outline.js', import.meta.url).href);
    return globalThis.SS;
  })().catch((e) => { slidesP = null; throw e; });
  return slidesP;
}

async function toPresentation(files, o = {}) {
  const f = files[0], S = await slides();
  const outline = S.outline.parse(await text(f));
  if (o.theme) outline.theme = o.theme;
  if (o.size) outline.size = o.size;
  if (!outline.title) outline.title = stem(f.name);
  const deck = S.outline.build(outline), fmt = o.format || 'pptx', name = `${stem(f.name)}.${fmt}`;
  const n = t('ui.ops.create.slides_n', { n: deck.slides.length });
  if (fmt === 'pdf') {
    const r = await S.pdfExport.write(deck);
    const out = [{ name, blob: r.blob, kind: 'pdf' }];
    out.info = r.missing.length ? t('ui.ops.create.missing_fonts', { slides: n, fonts: r.missing.join(', ') }) : n;
    return out;
  }
  if (fmt === 'sslide') return Object.assign([{ name, blob: new Blob([JSON.stringify(deck)], { type: 'application/x-slop-slides' }), kind: 'sslide' }], { info: n });
  const r = await S.pptx.write(deck);
  return Object.assign([{ name, blob: r.blob, kind: 'pptx' }], { info: t('ui.ops.create.notes_pptx', { slides: n }) });
}

async function toDocument(files, o = {}) {
  const f = files[0];
  const [{ engine, ensureFaces, docPdf }, { buildDoc, parseOutline }] = await Promise.all([import('../../convert/js/core/doc-out.js'), import('../../docs/js/model/build.js')]);
  const E = await engine(), outline = parseOutline(await text(f));
  if (o.page) outline.page = o.page;
  const doc = buildDoc(outline);
  if (o.page) doc.section = { ...doc.section, size: o.page };
  if (!doc.meta.title) doc.meta = { ...doc.meta, title: stem(f.name) };
  const fmt = o.format || 'docx', name = `${stem(f.name)}.${fmt}`;
  if (fmt === 'pdf') { await ensureFaces(E, doc); const out = await docPdf(E, doc, name); out[0].kind = 'pdf'; return out; }
  if (fmt === 'md') return [{ name, blob: new Blob([E.SD.toMarkdown(doc)], { type: 'text/markdown' }), kind: 'md' }];
  if (fmt === 'sdoc') return [{ name, blob: E.SD.sdocBlob(doc), kind: 'sdoc' }];
  const made = await E.exportDocx(doc);
  return [{ name, blob: new Blob([made], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), kind: 'docx' }];
}

export const CREATE_SLIDES = register([
  { id: 'outline-to-presentation', group: 'Create', from: IN, mode: 'each', ext: 'pptx',   // i18n-ignore: a group id (search words), an app name
    get description() { return t('ui.ops.step.outline_to_presentation_desc', { format: SLIDE_HELP }); },
    keywords: ['presentation', 'slides', 'deck', 'powerpoint', 'pptx', 'keynote', 'outline', 'create', 'make', 'generate', 'slideshow'],
    options: [opt('ui.ops.create.make', { key: 'format', type: 'select', value: 'pptx', options: [['pptx', 'PowerPoint (.pptx)'], ['pdf', 'PDF'], ['sslide', 'Slop Slides (.sslide)']] }),
      opt('ui.ops.create.theme', { key: 'theme', type: 'select', value: '', options: THEMES }), opt('ui.ops.create.size', { key: 'size', type: 'select', value: '', options: SLIDE_SIZES })],
    run: toPresentation },
], { app: 'slides', label: 'Slop Slides' });   // i18n-ignore: a group id (search words), an app name

export const CREATE_DOCS = register([
  { id: 'outline-to-document', group: 'Create', from: IN, mode: 'each', ext: 'docx',   // i18n-ignore: a group id (search words), an app name
    get description() { return t('ui.ops.step.outline_to_document_desc', { format: DOC_HELP }); },
    keywords: ['document', 'word', 'docx', 'report', 'letter', 'essay', 'outline', 'create', 'make', 'generate', 'write'],
    options: [opt('ui.ops.create.make', { key: 'format', type: 'select', value: 'docx', options: [['docx', 'Word (.docx)'], ['pdf', 'PDF'], ['md', 'Markdown'], ['sdoc', 'Slop Docs (.sdoc)']] }),
      opt('ui.ops.create.page', { key: 'page', type: 'select', value: '', options: ['', ['A4', 'A4'], 'Letter'] })],
    run: toDocument },
], { app: 'docs', label: 'Slop Docs' });   // i18n-ignore: a group id (search words), an app name
