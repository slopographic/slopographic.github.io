/* The preview model. Runs the real converter on the first input (or on every input for a combined run), using
 * the first part of a large text file and a smaller copy of a large picture, and returns the before and after
 * panels. Browser only. The panels are plain data; view.js draws them. */
import { tr } from '../core/i18n.js';
import { KIND_LABEL, TEXT_KINDS } from '../core/detect.js';
import { decodeBytes } from '../../../shared/finance/text.js';

// Finance files are text in an old code page (SIE: CP437), so they are decoded before they are shown.
const FINANCE_KINDS = ['sie', 'ofx', 'qif', 'camt053', 'mt940'];
import { pdfToImages } from '../core/pdf-raster.js';
import { parseCsv } from '../core/csv.js';
import { fmtSize } from '../io/files.js';
import { changedLines } from './diff.js';
import { is3d, modelBefore, modelAfter } from './model3d.js';
import { RAW_KINDS, rawPreviewBlob } from '../core/raw.js';
import { IMAGE_KINDS, TEXT_LIMIT, IMAGE_LIMIT, PREVIEW_PX, MAX_LINES, FIRST_PAGE_ONLY, LINE_DIFF } from './spec.js';

const PICTURE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'svg', 'ico'];
const extOf = (name) => (/\.([^.]+)$/.exec(String(name)) || [, ''])[1].toLowerCase();

/** The items a conversion runs on: all of them for a combined run, otherwise the first. Originals, untouched. */
export function pickInputs(conv, items) {
  return (conv.mode === 'combine' ? items : items.slice(0, 1))
    .map((i) => ({ name: i.name, file: i.file, kind: i.kind, size: i.size }));
}

// Zip-based files (Word, PowerPoint, workbooks) cannot be read from their first part, so they are kept whole like PDFs
const WHOLE = ['pdf', 'docx', 'pptx', 'xlsx', 'ods', 'odt', 'odp', 'zip', 'epub'];
/** The same input, cut down for the preview. Text keeps its first part; pictures, PDFs and zip-based files are kept whole. */
export function previewInput(i) {
  if (IMAGE_KINDS.includes(i.kind) || WHOLE.includes(i.kind)) return { ...i, truncated: false, large: i.size > IMAGE_LIMIT };
  const large = i.size > TEXT_LIMIT;
  return { ...i, file: large ? i.file.slice(0, TEXT_LIMIT) : i.file, truncated: large, large };
}

/** Page 1 of a PDF as a PNG at 72 dpi. */
async function firstPage(blob) {
  const [page] = await pdfToImages(new Uint8Array(await blob.arrayBuffer()), { pages: '1', scale: 1, format: 'png' });
  if (!page) throw new Error(tr('convert.pv.no_pages'));
  return page.blob;
}

async function looksBinary(blob) {
  return new Uint8Array(await blob.slice(0, 512).arrayBuffer()).includes(0);
}

/** A text panel: the first lines for display, the full (already cut) text for diffs and copies. */
function textPanel(text, { size, truncated = false, label = '' } = {}) {
  const all = (text.endsWith('\n') ? text.slice(0, -1) : text).split('\n');   // a final newline is not a line
  const notes = [];
  if (all.length > MAX_LINES) notes.push(tr('convert.pv.first_lines', { n: MAX_LINES, total: all.length }));
  if (truncated) notes.push(tr('convert.pv.large_text', { size: fmtSize(TEXT_LIMIT) }));
  return { kind: 'text', text, lines: all.slice(0, MAX_LINES), size, label, note: notes.join(' ') };
}

export async function beforePanel(p) {
  if (RAW_KINDS.includes(p.kind)) {   // a camera RAW photo: its embedded JPEG (the RAW engine runs on Convert only)
    const blob = await rawPreviewBlob(p.file);
    if (blob) return { kind: 'image', blob, size: p.size, label: KIND_LABEL[p.kind], note: tr('convert.pv.raw_note') };
  }
  if (IMAGE_KINDS.includes(p.kind)) {
    return { kind: 'image', blob: p.file, size: p.size, label: KIND_LABEL[p.kind] || tr('convert.pv.picture') };
  }
  if (p.kind === 'pdf') {
    return { kind: 'image', blob: await firstPage(p.file), size: p.size, label: tr('convert.pv.pdf_p1'), note: p.large ? tr('convert.pv.large_pdf') : '' };
  }
  if (FINANCE_KINDS.includes(p.kind)) {
    return textPanel(decodeBytes(new Uint8Array(await p.file.arrayBuffer())).text, { size: p.size, truncated: p.truncated, label: KIND_LABEL[p.kind] });
  }
  if (TEXT_KINDS.includes(p.kind)) {
    return textPanel(await p.file.text(), { size: p.size, truncated: p.truncated, label: KIND_LABEL[p.kind] });
  }
  const kind = KIND_LABEL[p.kind] || tr('convert.row.file');
  return { kind: 'info', text: tr('convert.pv.not_shown', { kind, size: fmtSize(p.size) }), size: p.size, label: kind };
}

export async function afterPanel(outs, inputText) {
  const o = outs[0], ext = extOf(o.name);
  const more = outs.length > 1 ? tr('convert.pv.one_of', { n: outs.length }) : '';
  const size = o.blob.size;
  if (PICTURE_EXT.includes(ext)) return { kind: 'image', blob: o.blob, size, label: tr('convert.pv.ext_picture', { ext: ext.toUpperCase() }) + more };
  if (ext === 'pdf') return { kind: 'image', blob: await firstPage(o.blob), size, label: tr('convert.pv.pdf_p1') + more };
  if (ext === 'xlsx' && outs.preview) return textPanel(outs.preview, { size, label: tr('convert.pv.sheet_main') });   // the converter's own view
  if (ext === 'xlsx') {
    const rows = parseCsv(inputText);
    return textPanel(rows.map((r) => r.join('\t')).join('\n'), { size, label: tr('convert.pv.sheet_first') });
  }
  if (await looksBinary(o.blob)) return { kind: 'info', text: tr('convert.pv.binary', { size: fmtSize(size) }), size, label: tr('convert.pv.binary_label') };
  const truncated = size > TEXT_LIMIT;
  const text = await o.blob.slice(0, TEXT_LIMIT).text();
  return textPanel(text, { size, truncated, label: `${(ext || 'text').toUpperCase()}${more}` });
}

/**
 * Builds the preview for one conversion. Returns { before, after, note, outputs }.
 * outputs is the full result (same as Download) when the preview ran the whole job, otherwise null.
 * An error from the converter is returned as after.kind 'error', shown in place.
 */
export async function buildPreview(conv, items, opts) {
  // an engine conversion (ffmpeg) is not run for a preview: its first download asks first, on Convert
  if (conv.engine) return { before: await beforePanel(previewInput(pickInputs(conv, items)[0])).catch((e) => ({ kind: 'error', message: e.message || String(e) })),
    after: { kind: 'info', text: tr('convert.pv.engine') }, note: '', outputs: null };
  // a password conversion (Protect PDF, Remove PDF password) runs on Convert only, so a password is not used while it is typed
  if (conv.secret) return { before: await beforePanel(previewInput(pickInputs(conv, items)[0])).catch(() => ({ kind: 'info', text: tr('convert.pv.locked') })),
    after: { kind: 'info', text: tr('convert.pv.secret') }, note: '', outputs: null, secret: true };
  // 3D models are read whole (a cut model, .bin or .mtl cannot be read at all)
  const inputs = pickInputs(conv, items).map((i) => (is3d(conv) ? { ...i, truncated: false, large: false } : previewInput(i)));
  const runOpts = { ...opts };
  let cut = inputs.some((i) => i.truncated);
  if (inputs.some((i) => RAW_KINDS.includes(i.kind))) { runOpts.rawPreview = true; cut = true; }   // no engine download from a preview
  if (inputs.some((i) => i.kind === 'heic')) { runOpts.heicPreview = true; cut = true; }   // the HEIC decoder is not downloaded for a preview
  if (FIRST_PAGE_ONLY.includes(conv.id) && !String(opts.pages || '').trim()) { runOpts.pages = '1'; cut = true; }
  const drawSmaller = inputs.some((i) => i.large) && conv.options.some((o) => o.key === 'width') && !opts.width && !opts.height;
  if (drawSmaller) { runOpts.width = PREVIEW_PX; cut = true; }
  const before = await (is3d(conv) ? Promise.resolve(modelBefore(inputs)) : beforePanel(inputs[0])).catch((e) => ({ kind: 'error', message: e.message || String(e) }));
  let after, outputs = null;
  try {
    const outs = await conv.run(inputs.map(({ name, file, kind }) => ({ name, file, kind })), runOpts);
    after = !outs.length ? { kind: 'info', text: tr('convert.pv.none') } : is3d(conv) ? modelAfter(outs) : await afterPanel(outs, before.text || '');
    if (!cut) outputs = outs;
  } catch (e) {
    after = { kind: 'error', message: (e && e.message) || String(e) };
    if (cut) after.hint = tr('convert.pv.cut_hint');
  }
  const notes = [];
  if (drawSmaller) notes.push(tr('convert.pv.large_pic', { px: PREVIEW_PX }));
  else if (cut) notes.push(tr('convert.pv.cut_note'));
  if (LINE_DIFF.includes(conv.id) && before.kind === 'text' && after.kind === 'text') {
    const d = changedLines(before.lines, after.lines);
    if (d) { before.changed = d.a; after.changed = d.b; }
    else notes.push(tr('convert.pv.too_long'));
  }
  if (before.note) notes.push(before.note);
  if (after.note) notes.push(after.note);
  return { before, after, note: notes.join(' '), outputs };
}
