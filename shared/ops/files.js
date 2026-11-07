/* Utility and PDF operations for Slop Workflows (registry: shared/ops/registry.js). The rest of the PDF steps (merge,
 * images to PDF, PDF to images, password) are File convert's own conversions and appear on their own.
 *   files.rename   new names from a pattern: {name} the old name, {n} a number, {date} today (YYYY-MM-DD); the extension
 *                  stays. Takes the whole set at once, so {n} counts across the files.
 *   pdf.compress   Lossless: pdf-lib saves the PDF again with object streams (text and vectors stay); Strong: every page
 *                  becomes a JPEG at the chosen resolution (File convert's pdf.js page renderer and its image PDF writer).
 *                  A result that is not smaller keeps the original, and the info line says so.
 *   renameAll(names, pattern, { start, digits, date })  the pure part of Rename: unique names, extensions kept */
import { register } from './registry.js';
import { stem } from './load.js';
import { t, opt } from './i18n.js';
import { loadPdfLib } from '../../convert/js/core/lib.js';
import { pdfToImages } from '../../convert/js/core/pdf-raster.js';
import { imagesToPdf } from '../../convert/js/core/pdf-images.js';

const extOf = (name) => (/\.[^./\\]+$/.exec(String(name)) || [''])[0];
const safe = (s) => String(s).replace(/[\\/:*?"<>|]+/g, '_').replace(/^\s+|\s+$/g, '');
const today = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

export function renameAll(names, pattern = '{name}', { start = 1, digits = 0, date = today() } = {}) {
  const taken = new Set(), pad = Math.max(0, Math.min(8, Number(digits) || 0));
  return names.map((name, i) => {
    const n = String((Number(start) || 0) + i).padStart(pad, '0');
    const base = safe(String(pattern || '{name}').replace(/\{name\}/g, stem(name)).replace(/\{n\}/g, n).replace(/\{date\}/g, date)) || stem(name);
    let out = base + extOf(name), k = 2;
    while (taken.has(out.toLowerCase())) out = `${base}-${k++}${extOf(name)}`;
    taken.add(out.toLowerCase());
    return out;
  });
}

async function rename(files, o) {
  const names = renameAll(files.map((f) => f.name), o.pattern, { start: o.start, digits: o.digits });
  return files.map((f, i) => ({ name: names[i], blob: new File([f.file], names[i], { type: f.file.type }), kind: f.kind }));
}

const pdfBlob = (bytes) => new Blob([bytes], { type: 'application/pdf' });
const kb = (n) => (n < 1048576 ? t('ui.ops.files.kb', { n: Math.max(1, Math.round(n / 1024)) }) : t('ui.ops.files.mb', { n: Math.round(n / 104857.6) / 10 }));

async function compress(files, o, ctx = {}) {
  const f = files[0], src = new Uint8Array(await f.file.arrayBuffer());
  let bytes;
  if (o.mode === 'strong') {
    const dpi = Number(o.dpi) || 110;
    const pages = await pdfToImages(src, { scale: dpi / 72, format: 'jpg', quality: (Number(o.quality) || 70) / 100,
      onPage: (d, total) => { if (ctx.progress) ctx.progress(d / total); } });
    // imagesToPdf reads a picture's size at 96 px to the inch: give it the size that makes each page its own size again
    const items = await Promise.all(pages.map(async (p) => ({ bytes: new Uint8Array(await p.blob.arrayBuffer()), mime: 'image/jpeg', width: (p.width * 96) / dpi, height: (p.height * 96) / dpi })));
    bytes = await imagesToPdf(items, { page: 'fit', margin: 0 });
  } else {
    const { PDFDocument } = await loadPdfLib();
    let doc;
    try { doc = await PDFDocument.load(src, { updateMetadata: false }); } catch (e) {
      throw new Error(/encrypt/i.test(String(e && e.message)) ? t('ui.ops.pdf.has_password') : t('ui.ops.pdf.not_pdf'));
    }
    bytes = await doc.save({ useObjectStreams: true });
  }
  if (bytes.length >= src.length) {
    const out = [{ name: f.name, blob: f.file, kind: 'pdf' }];
    out.info = t('ui.ops.pdf.compact', { name: f.name });
    return out;
  }
  const out = [{ name: `${stem(f.name)}-compressed.pdf`, blob: pdfBlob(bytes), kind: 'pdf' }];
  out.info = t('ui.ops.pdf.smaller', { name: f.name, from: kb(src.length), to: kb(bytes.length) });
  return out;
}

export const FILE_OPS = register([
  { id: 'files.rename', group: 'Files', from: ['*'], mode: 'combine', out: (k) => k,   // i18n-ignore: a group id (search words), an app name
    keywords: ['rename', 'file names', 'numbering', 'batch rename'],
    options: [
      opt('ui.ops.files.pattern', { key: 'pattern', type: 'text', value: '{name}-{n}', placeholder: '{name}-{n}', hint: true }),
      opt('ui.ops.files.start', { key: 'start', type: 'number', min: 0, max: 1e6, value: 1 }),
      opt('ui.ops.files.digits', { key: 'digits', type: 'number', min: 0, max: 8, value: 2 }),
    ], run: rename },
], { app: 'files', label: () => t('ui.ops.files.app') });

export const PDF_OPS = register([
  { id: 'pdf.compress', group: 'PDF', from: ['pdf'], ext: 'pdf', mode: 'each',
    keywords: ['compress pdf', 'smaller', 'reduce size', 'optimise', 'shrink'],
    options: [
      opt('ui.ops.pdf.mode', { key: 'mode', type: 'select', value: 'lossless', options: ['lossless', 'strong'] }),
      opt('ui.ops.pdf.dpi', { key: 'dpi', type: 'select', value: 110, options: [72, [110, '110 dpi'], 150] }),
      opt('ui.ops.pdf.quality', { key: 'quality', type: 'range', min: 20, max: 95, value: 70 }),
    ], run: compress },
], { app: 'pdf', label: 'Slop PDF' });   // i18n-ignore: a group id (search words), an app name
