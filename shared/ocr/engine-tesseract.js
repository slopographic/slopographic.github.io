/* Text recognition with Tesseract: the engine 'tesseract' of shared/ocr/engines.js (imported the first time it reads).
 * tesseract.js 7.0.0 (Apache-2.0) is vendored in vendor/tesseract: its module, its worker and the WebAssembly core (the
 * LSTM-only build with SIMD, tesseract-core-simd-lstm.wasm.js, about 3.7 MB), all from this site. The language data is a
 * model of the OCR list (aitools/ocr-models.js, tesseract-<code>): downloaded only from the Language and model dialog,
 * checked and kept by the model manager (aitools/models.js) and handed to tesseract.js as bytes, so tesseract.js fetches
 * nothing itself (no CDN, no cache of its own).
 * One tesseract.js worker at a time, for the model last read with; another model ends it and starts a fresh one.
 *   load(model, onStatus)                     readies the worker with the model's data
 *   recognize(image, { model, onProgress })   image: { bitmap, w, h } (the bitmap is closed after) -> lines in reading
 *                                             order [{ text, score (0..1), box: { x, y, w, h } }] with .skipped
 *   linesOf(blocks)                           pure: tesseract.js's blocks -> those lines (Node tests) */
const VENDOR = new URL('../../vendor/tesseract/', import.meta.url).href;
const T = (k, v) => (globalThis.SlopI18n ? globalThis.SlopI18n.t(k, v) : k);
let lib = null, current = null, progress = null;

/** The tesseract.js module (vendor/tesseract/tesseract.esm.min.js), loaded once. */
function tesseract() {
  lib = lib || import(VENDOR + 'tesseract.esm.min.js').then((m) => m.default).catch((e) => { lib = null; throw e; });
  return lib;
}
/** tesseract.js's progress messages, for the page: the share of the page read so far. */
function logger(m) {
  if (progress && m && m.status === 'recognizing text') progress({ stage: 'detect', done: m.progress || 0, total: 1 });
}

/** Readies a worker with the model's data. The model manager reads it from this device (and shows the first-use notice). */
export function load(model, onStatus) {
  if (current && current.model === model) return current.ready;
  const old = current;
  if (old) old.ready.then((w) => w.terminate(), () => {});
  const entry = { model };
  entry.ready = (async () => {
    const M = globalThis.SlopAIManager, R = globalThis.SlopAIModels, m = R && R.byId(model);
    if (!M || !m || m.engine !== 'tesseract') throw new Error(T('ocrengine.unknown_model', { model }));
    if (onStatus) onStatus(T('ocrengine.reading'));
    const files = await M.readAll(model);
    if (onStatus) onStatus(T('ocrengine.starting'));
    const { createWorker } = await tesseract();
    // The data goes in as a blob URL. tesseract.js 7 also takes { code, data } as a language, but then starts Tesseract with
    // the bytes as the language's name and never resolves; so the language is named and its "folder" is the blob URL with
    // an empty fragment: it fetches <folder>/<code>.traineddata.gz, and a blob URL is looked up without its fragment.
    const blob = URL.createObjectURL(new Blob([files[m.files[0].name]], { type: 'application/gzip' }));
    try {
      // OEM 1: the LSTM engine, the one the data and the core are made for
      return await createWorker(m.tess, 1, {
        workerPath: VENDOR + 'worker.min.js', corePath: VENDOR + 'tesseract-core-simd-lstm.wasm.js',
        langPath: blob + '#', gzip: true, workerBlobURL: false, cacheMethod: 'none', logger,
      });
    } finally { URL.revokeObjectURL(blob); }
  })();
  entry.ready.catch(() => { if (current === entry) current = null; });
  current = entry;
  return entry.ready;
}

/** Pure: tesseract.js's blocks (paragraphs of lines, each with its text, confidence 0..100 and bbox) as the lines every
 *  engine gives, in the order Tesseract read them. Empty lines are counted in .skipped. */
export function linesOf(blocks) {
  const out = [];
  let skipped = 0;
  for (const b of blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) {
    const text = String(l.text || '').replace(/\s+$/, ''), bb = l.bbox || {};
    if (!text.trim()) { skipped++; continue; }
    out.push({ text, score: Math.max(0, Math.min(1, (l.confidence || 0) / 100)), box: { x: bb.x0 || 0, y: bb.y0 || 0, w: Math.max(1, (bb.x1 || 0) - (bb.x0 || 0)), h: Math.max(1, (bb.y1 || 0) - (bb.y0 || 0)) } });
  }
  out.skipped = skipped;
  return out;
}

/** Reads one picture with the model's worker. */
export async function recognize(image, o = {}) {
  const worker = await load(o.model);
  const c = new OffscreenCanvas(image.w, image.h);
  c.getContext('2d').drawImage(image.bitmap, 0, 0);
  if (image.bitmap.close) image.bitmap.close();
  progress = o.onProgress || null;
  try {
    const r = await worker.recognize(c, {}, { blocks: true, text: false });
    return linesOf(r.data.blocks);
  } finally { progress = null; }
}
