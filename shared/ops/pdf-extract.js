/* Slop PDF's headless "PDF → extract images, attachments and fonts" (registry: shared/ops/registry.js), for File convert's
 * catalog of operations, Slop Workflows and the assistant. It reads the PDF with pdf-lib through Slop PDF's own reader
 * (pdf/js/core/pdf-parts.js, the same one File ▸ Extract all… uses): every stored image once (a JPEG as stored, other
 * 8-bit images as PNG), the embedded files (the document's and the pages' attachments, e.g. a ZUGFeRD / Factur-X invoice)
 * as they are, and the embedded font programs. Items that cannot be decoded are named in the result's info line.
 *   extractParts(bytes, { parts: 'all' | 'images' | 'attachments' | 'fonts' }) → { files: [{ name, data, type }], skipped }
 * The scripts load on first use (nothing runs at import time). */
import { register } from './registry.js';
import { scripts, stem } from './load.js';
import { t, opt } from './i18n.js';
import { loadPdfLib } from '../../convert/js/core/lib.js';

const ready = () => !!(globalThis.SlopPdfParts && globalThis.SlopPdfAssets);
const need = () => scripts(['pdf/js/io/assets-model.js', 'pdf/js/core/pdf-parts.js'], ready);
const EXT_TYPE = { jpg: 'image/jpeg', png: 'image/png', ttf: 'font/ttf', otf: 'font/otf', cff: 'application/octet-stream', pfb: 'application/x-font-type1', pfa: 'application/x-font-type1' };

/** PNG bytes of RGBA pixels: an OffscreenCanvas, else a canvas. */
async function encodePng(rgba, w, h) {
  const c = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  c.getContext('2d').putImageData(new ImageData(rgba, w, h), 0, 0);
  const blob = c.convertToBlob ? await c.convertToBlob({ type: 'image/png' }) : await new Promise((r) => c.toBlob(r, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}
const safe = (s, d) => String(s || '').replace(/[\\/:*?"<>|]+/g, '_').replace(/^\s+|\s+$/g, '') || d;

export async function extractParts(bytes, { parts = 'all' } = {}) {
  await need();
  const PL = await loadPdfLib(), P = globalThis.SlopPdfParts, Mod = globalThis.SlopPdfAssets;
  let doc;
  try { doc = await PL.PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true, throwOnInvalidObject: false }); }
  catch (e) { throw new Error(t('ui.ops.pdf.not_pdf')); }
  const idx = doc.getPages().map((p, i) => i), files = [], skipped = [];
  const want = (k) => parts === 'all' || parts === k;
  const found = await P.scan(PL, doc, idx, { fid: 'op', file: 'pdf' });
  if (want('images')) for (const im of found.images) {
    try { const f = await P.imageFile(im, encodePng); files.push({ name: `images/p${im.page}-${Mod.safePart(im.name, 'image')}.${f.ext}`, data: f.data, type: f.type }); }
    catch (e) { skipped.push(`${im.name}: ${e.message || e}`); }
  }
  if (want('attachments')) for (const a of await P.attachments(PL, doc, idx)) {
    if (a.bytes) files.push({ name: `attachments/${safe(a.name, a.id)}`, data: a.bytes, type: a.mime });
    else skipped.push(`${a.name}: ${a.reason}`);
  }
  if (want('fonts')) for (const f of found.fonts) {
    if (f.embedded && f.bytes) files.push({ name: `fonts/${Mod.safePart(f.name, 'font')}.${f.ext}`, data: f.bytes, type: EXT_TYPE[f.ext] || 'application/octet-stream' });
  }
  const names = Mod.uniquify(files.map((f) => f.name));
  return { files: files.map((f, i) => Object.assign(f, { name: names[i] })), skipped };
}

async function run(files, o) {
  const out = [], notes = [];
  for (const f of files) {
    const r = await extractParts(new Uint8Array(await f.file.arrayBuffer()), { parts: o.parts });
    if (r.skipped.length) notes.push(t('ui.ops.extract.skipped', { name: f.name, n: r.skipped.length, list: r.skipped.slice(0, 3).join('; ') }));
    if (!r.files.length) { notes.push(t('ui.ops.extract.nothing', { name: f.name })); continue; }
    if (o.zip) {
      const { writeZip } = await import('../office/zip.js');
      out.push({ name: `${stem(f.name)}-extracted.zip`, blob: await writeZip(r.files.map((x) => ({ path: x.name, data: x.data }))), kind: 'zip' });
    } else {
      for (const x of r.files) {
        const name = `${stem(f.name)}-${x.name.split('/').pop()}`, ext = (/\.([a-z0-9]+)$/i.exec(name) || [, 'file'])[1].toLowerCase();
        out.push({ name, blob: new Blob([x.data], { type: x.type }), kind: ext === 'jpeg' ? 'jpg' : ext });
      }
    }
  }
  out.info = notes.join(' ') || t('ui.ops.extract.done', { n: out.length });
  return out;
}

export const PDF_EXTRACT_OPS = register([
  { id: 'pdf.extract', group: 'PDF', from: ['pdf'], mode: 'each',
    out: (k, o) => (o.zip ? 'zip' : o.parts === 'images' ? 'png' : 'file'),
    keywords: ['extract images', 'extract attachments', 'embedded files', 'pdf attachments', 'factur-x', 'zugferd', 'fonts', 'pictures from pdf'],
    options: [
      opt('ui.ops.extract.parts', { key: 'parts', type: 'select', value: 'all', options: ['all', 'images', 'attachments', 'fonts'] }),
      opt('ui.ops.extract.zip', { key: 'zip', type: 'checkbox', value: false }),
    ], run },
], { app: 'pdf', label: 'Slop PDF' });   // i18n-ignore: a group id (search words), an app name
