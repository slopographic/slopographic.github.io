// The worker behind pdf.mjs: the vendored pdf.js (vendor/pdfjs, the legacy build, which runs in Node) reading one PDF at a
// time: the text of every page, the document information and the XMP metadata. It answers on the port it was given and
// then wakes the caller, which waits on a shared flag (pdf.mjs). Its console is silent: pdf.js's warnings can quote a
// file's own words, and the content check's output must not.
// Node only. Tests: tests/node/content-check-unpack.test.mjs.
import { workerData } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const { port, flag } = workerData;
for (const k of ['log', 'info', 'warn', 'error', 'debug']) console[k] = () => {};
// pdf.js 5 reads a few browser geometry classes when it loads; text needs none of them, so stand-ins do
if (!globalThis.DOMMatrix) globalThis.DOMMatrix = class DOMMatrix { constructor(m) { [this.a, this.b, this.c, this.d, this.e, this.f] = Array.isArray(m) ? m : [1, 0, 0, 1, 0, 0]; } };
if (!globalThis.ImageData) globalThis.ImageData = class ImageData { constructor(w, h) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); } };
if (!globalThis.Path2D) globalThis.Path2D = class Path2D {};

const VENDOR = new URL('../../vendor/pdfjs/', import.meta.url);
// the files are ES modules named .js (served as they are on the site), so they are imported as data
const load = (f) => import('data:text/javascript;base64,' + readFileSync(new URL(f, VENDOR)).toString('base64'));
let pdfjs = null;
try {
  globalThis.pdfjsWorker = { WorkerMessageHandler: (await load('pdf.worker.min.js')).WorkerMessageHandler };
  pdfjs = await load('pdf.min.js');
} catch (e) { /* every file is then unreadable: the answer says so */ }

/** [{ label, text }]: the info dictionary and XMP metadata, then each page's text (its runs as drawn, a line per line). */
async function texts(data) {
  const doc = await pdfjs.getDocument({
    data, verbosity: 0, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, stopAtErrors: true,
    cMapUrl: fileURLToPath(new URL('cmaps/', VENDOR)), cMapPacked: true, standardFontDataUrl: fileURLToPath(new URL('standard_fonts/', VENDOR)),
  }).promise;
  try {
    const meta = await doc.getMetadata(), out = [{ label: 'info', text: JSON.stringify(meta.info || {}) }];
    if (meta.metadata) out.push({ label: 'metadata', text: typeof meta.metadata.getRaw === 'function' ? String(meta.metadata.getRaw()) : JSON.stringify(meta.metadata.getAll()) });
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i), content = await page.getTextContent();
      out.push({ label: `page ${i}`, text: content.items.map((it) => (it.str || '') + (it.hasEOL ? '\n' : '')).join('') });
      page.cleanup();
    }
    return out;
  } finally {
    await doc.destroy();
  }
}

port.on('message', async (data) => {
  let answer;
  if (!pdfjs) answer = { error: 'pdf.js could not load' };
  else try { answer = { texts: await texts(data) }; } catch (e) {
    answer = { error: e && e.name === 'PasswordException' ? 'it needs a password' : `pdf.js could not read it (${(e && e.name) || 'error'})` };
  }
  port.postMessage(answer);
  Atomics.store(flag, 0, 1);
  Atomics.notify(flag, 0);
});
