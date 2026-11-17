/* Slop Docs for the assistant: making documents and their content. new_document, build_document (a whole document from an
 * outline in one call), insert_list, insert_table, insert_image (Slop Drive or a picture on this site, through
 * shared/commands/sources.js), insert_page_break, set_alignment and export_document (DOCX, PDF, Markdown, text or .sdoc, to
 * Slop Drive and/or a download, with the File menu's own writers: SlopDocs.exportBlob). Blocks come from model/build.js.
 * Imported by ui/ai-commands.js, which registers the list. made: the tabs the assistant opened (its rollback closes them). */
import { listBlocks, tableBlock, imageBlock, pageBreakBlock, withLists, buildDoc } from '../model/build.js';
import { insertParas } from '../model/ai-edit.js';
import { setParas, ordered } from '../model/ops.js';
import { pageSize, para } from '../model/doc.js';

const S = window.SlopDocs;
export const made = [];
const Str = (name, description, extra) => Object.assign({ name, type: 'string', maxLength: 500, description }, extra);
const WHERE = { name: 'where', type: 'enum', values: ['caret', 'end', 'start'], default: 'end', description: 'caret puts it after the paragraph with the caret' }; // i18n-ignore: assistant tool text (API)
const PAGE = { name: 'page', type: 'enum', values: ['A4', 'Letter', 'Legal', 'A5'], default: 'A4' };
const ITEMS = { name: 'items', type: 'array', required: true, maxItems: 500, items: { type: 'string' }, description: 'one item per entry; two leading spaces per level indent it' };
const BLOCK = { type: 'object', properties: { type: { type: 'string', enum: ['heading', 'paragraph', 'bullets', 'numbered', 'quote', 'code', 'table', 'image', 'page_break'] },
  text: { type: 'string' }, level: { type: 'integer', minimum: 1, maximum: 6 }, items: { type: 'array', items: { type: 'string' } },
  rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } }, header: { type: 'boolean' }, align: { type: 'string', enum: ['left', 'center', 'right', 'justify'] } } };
const width = () => { const sec = S.doc.section, [W] = pageSize(sec); return W - sec.margin.left - sec.margin.right; };

/** Put blocks at a place in one undo step; list definitions the blocks use are added to the document first. */
function put(blocks, where) {
  S.doc = { ...S.doc, lists: withLists({ ...S.doc, blocks }).lists };
  const res = insertParas(S.doc.blocks, S.sel, blocks, where);
  let out = res.blocks, pos = res.pos;
  if (!out[pos.b] || out[pos.b].type !== 'p') {   // a table last: a paragraph after it keeps the caret
    if (!out[pos.b + 1] || out[pos.b + 1].type !== 'p') out = [...out.slice(0, pos.b + 1), para(), ...out.slice(pos.b + 1)];
    pos = { b: pos.b + 1, o: 0 };
  }
  S.edit(out, { a: pos, f: pos }, 'ai');
  return res.pos.b - blocks.length + 2;
}
function openDoc(doc, name) {
  S.openNew(doc, { name: (name || doc.meta.title || 'Untitled document').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 100) + '.sdoc', dirty: true });
  const T = S.tabsApi() && S.tabsApi().current();
  if (T) made.push(T);
}

export function commands(add) {
  add('new_document', 'New document', [Str('title', 'the document name; also a Title paragraph when given', { maxLength: 200 }), PAGE,
    { name: 'landscape', type: 'boolean', default: false }],
  (a) => {
    const doc = buildDoc({ title: a.title, page: a.page, landscape: a.landscape, blocks: [] });
    openDoc(doc, a.title);
    return `Opened a new ${a.page} document${a.title ? ` “${a.title}”` : ''} in a new tab.`;
  }, { description: 'Start a new document in a new tab (the open ones stay as they are).', destructive: false }); // i18n-ignore: assistant tool text (API)

  add('build_document', 'Build document from outline', [Str('title', 'the document title', { maxLength: 200 }), Str('subtitle', 'a line under the title'),
    { name: 'blocks', type: 'array', maxItems: 2000, items: BLOCK, description: 'the content in order: [{ type: heading, text, level } | { type: paragraph, text } | { type: bullets, items } | { type: table, rows, header }…]' },
    Str('markdown', 'or the whole document as Markdown (# headings, - lists, > quotes)', { maxLength: 200000 }), PAGE, Str('author', 'author name', { maxLength: 200 })],
  (a) => {
    if (!(a.blocks && a.blocks.length) && !a.markdown) throw new Error('Give blocks or markdown');
    const doc = buildDoc(a.markdown && !(a.blocks && a.blocks.length) ? a.markdown : { title: a.title, subtitle: a.subtitle, author: a.author, page: a.page, blocks: a.blocks });
    if (a.markdown) doc.section = { ...doc.section, size: a.page };
    if (a.title) doc.meta = { ...doc.meta, title: a.title };
    openDoc(doc, a.title || doc.meta.title);
    return `Built “${a.title || doc.meta.title || 'Untitled document'}”: ${doc.blocks.length} blocks, in a new tab. Use export_document to save it as DOCX or PDF.`;
  }, { description: 'Make a whole document in one step from an outline (title, headings, paragraphs, lists, tables) or from Markdown. Opens it in a new tab.' }); // i18n-ignore: assistant tool text (API)

  add('insert_list', 'Insert list', [ITEMS, { name: 'kind', type: 'enum', values: ['bullets', 'numbered'], default: 'bullets' }, WHERE],
  (a) => {
    const blocks = listBlocks(a.items, a.kind === 'numbered' ? 'num' : 'bul');
    if (!blocks.length) throw new Error('Give at least one list item');
    const b = put(blocks, a.where);
    return `Added a ${a.kind === 'numbered' ? 'numbered' : 'bulleted'} list of ${blocks.length} items from paragraph ${b}.`;
  }, { description: 'Add a bulleted or numbered list (nested by indent).' }); // i18n-ignore: assistant tool text (API)

  add('insert_table', 'Insert table', [{ name: 'rows', type: 'array', required: true, maxItems: 500, items: { type: 'array', items: { type: 'string' } }, description: 'rows of cell texts: [["Name","Price"],["Tea","3"]]' }, // i18n-ignore: assistant tool text (API)
    { name: 'header', type: 'boolean', default: true, description: 'the first row is a header' }, WHERE], // i18n-ignore: assistant tool text (API)
  (a) => {
    const rows = a.rows.map((r) => (Array.isArray(r) ? r : String(r).split(/\t|\s*\|\s*/)));
    const t = tableBlock(rows, { header: a.header, width: width() });
    put([t], a.where);
    return `Added a table of ${t.rows.length} rows × ${t.cols.length} columns.`;
  }, { description: 'Add a table from rows of cell texts.' }); // i18n-ignore: assistant tool text (API)

  add('insert_image', 'Insert picture', [Str('file', 'a Slop Drive file name or id', { maxLength: 300 }), Str('url', 'or the address of a picture on this site', { maxLength: 500 }),
    { name: 'width', type: 'number', min: 8, max: 2000, description: 'width in points (the text column is about 450); the picture\'s own size when empty' },
    Str('alt', 'a short description', { maxLength: 300 }), WHERE],
  async (a) => {
    const p = await window.SlopCmdSources.picture({ file: a.file, url: a.url });
    const w = Math.min(width(), a.width || p.w * 0.75), h = w * p.h / p.w;
    put([imageBlock(p.dataUrl, w, h, a.alt || p.name)], a.where);
    return `Added ${p.name} (${Math.round(w)} × ${Math.round(h)} pt).`;
  }, { description: 'Add a picture from Slop Drive or from this site as its own paragraph.' }); // i18n-ignore: assistant tool text (API)

  add('insert_page_break', 'Insert page break', [WHERE], (a) => { put([pageBreakBlock()], a.where); return 'Added a page break.'; });

  add('set_alignment', 'Set alignment', [{ name: 'align', type: 'enum', values: ['left', 'center', 'right', 'justify'], required: true },
    { name: 'paragraph', type: 'number', min: 1, max: 100000, integer: true, description: 'paragraph number; the selection when empty' },
    { name: 'to', type: 'number', min: 1, max: 100000, integer: true, description: 'last paragraph of a range' }], // i18n-ignore: assistant tool text (API)
  (a) => {
    const n = S.doc.blocks.length, from = a.paragraph ? Math.min(a.paragraph, n) - 1 : ordered(S.sel)[0].b, to = a.to ? Math.min(a.to, n) - 1 : a.paragraph ? from : ordered(S.sel)[1].b;
    const sel = { a: { b: from, o: 0 }, f: { b: Math.max(from, to), o: 0 } };
    S.edit(setParas(S.doc.blocks, sel, (p) => ({ ...p, props: { ...(p.props || {}), align: a.align } })), S.sel, 'ai');
    return `Paragraphs ${from + 1}–${Math.max(from, to) + 1} are aligned ${a.align}.`;
  });

  add('export_document', 'Export document', [{ name: 'format', type: 'enum', values: ['docx', 'pdf', 'md', 'txt', 'sdoc'], default: 'docx' },
    { name: 'to', type: 'enum', options: [['drive', 'Slop Drive'], ['download', 'a download'], ['both', 'both']], default: 'drive' },
    Str('name', 'file name without extension; the document name when empty', { maxLength: 120 })],
  async (a) => {
    const blob = await S.exportBlob(a.format), name = (a.name || S.displayName()) + '.' + a.format, out = [];
    const typed = blob instanceof Blob ? blob : new Blob([blob], { type: a.format === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/octet-stream' });
    if (a.to !== 'download') out.push(`Saved ${name} to Slop Drive (id ${await window.SlopCmdSources.put(typed, name, 'docs')})`);
    if (a.to !== 'drive') { await S.download(a.format); out.push(`downloaded ${S.displayName()}.${a.format}`); }
    return out.join(' and ') + '.';
  }, { description: 'Export the open document as Word (.docx), PDF, Markdown, text or .sdoc, to Slop Drive (other apps can open it there) and/or as a download.' }); // i18n-ignore: assistant tool text (API)
}

/** Closes the tabs the assistant opened after mark (made.length when the checkpoint was taken). */
export function closeMade(mark) {
  const api = S.tabsApi();
  for (const T of made.splice(mark)) { if (T && T.file) T.file.dirty = false; if (api) api.close(T); }
}
