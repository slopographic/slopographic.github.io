/* Video conversion with ffmpeg.wasm (ffmpeg compiled for the browser). Browser only.
 * The small JavaScript part is vendored (vendor/ffmpeg, MIT). The ffmpeg core (about 30 MB of WebAssembly, GPL-2.0-or-later)
 * is fetched the first time a video conversion runs, from the Slopographic cdn repository at its release tag (jsDelivr, then
 * GitHub; shared/cdn/assets.js). Both are checked against the SHA-256 below before ffmpeg runs; the licence and source are in the cdn repo
 * (engines/ffmpeg/0.12.10). Every file is converted in memory: nothing is uploaded. One ffmpeg runs at a time (requests queue).
 * Used by File convert's video and audio conversions and by the watermark's video renderer (shared/watermark/apply-video.js).
 *   convertVideo(file, { name, args, output, fallback, inputs, progress, signal })   inputs: more files for ffmpeg
 *       ([{ name, data }], such as an overlay picture); progress(0..1); signal: an AbortSignal that stops the engine
 *   firstUseGate()   the engine's first-download notice (once per browser; cancelling asks again next time) */

import '../../../shared/cdn/assets.js';   // window.SlopCdn: where the cdn files are served from, and the checked download
import { tr } from './i18n.js';

export const CORE_VERSION = '0.12.10';
/** The core's folder in the cdn repository (the release tag in shared/cdn/assets.js keeps the files fixed). */
export const CORE_DIR = 'engines/ffmpeg/0.12.10/';
/** The checksums and sizes of the two files (also in the cdn repo's manifest.json). */
export const CORE_FILES = {
  'ffmpeg-core.js': { sha256: '67a48f11645f85439f3fde4f2119042c16b374b910206b7a7a24f342e28dcae3', size: 111804 },
  'ffmpeg-core.wasm': { sha256: '9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7', size: 32232419 },
};
/** Larger inputs are refused before any work: the whole file must fit in the browser's memory for ffmpeg. */
export const MAX_INPUT_BYTES = 400 * 1024 * 1024;

/** Downloads one core file from the cdn (each of its places in turn) and checks its SHA-256. Returns a blob URL for ffmpeg. */
async function fetchCoreFile(name) {
  const C = globalThis.SlopCdn;
  const bytes = await C.fetchVerified(C.urls(CORE_DIR + name), { label: name, ...CORE_FILES[name] }, { init: { cache: 'force-cache' } });
  const type = name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript';
  return URL.createObjectURL(new Blob([bytes], { type }));
}

let instance = null;
let loading = null;
let queue = Promise.resolve();
let logTail = [];

/** Loads ffmpeg once, with its log kept so a failure can say why. */
export function loadFFmpeg() {
  if (instance) return Promise.resolve(instance);
  if (!loading) {
    loading = (async () => {
      const mod = await import(new URL('../../../vendor/ffmpeg/index.js', import.meta.url).href);
      const ff = new mod.FFmpeg();
      ff.on('log', ({ message }) => { logTail.push(message); if (logTail.length > 40) logTail.shift(); });
      try {
        const coreURL = await fetchCoreFile('ffmpeg-core.js');
        const wasmURL = await fetchCoreFile('ffmpeg-core.wasm');
        await ff.load({ coreURL, wasmURL });
      } catch (e) {
        loading = null;
        throw new Error(tr('convert.ff.load_failed'));
      }
      instance = ff;
      return ff;
    })();
  }
  return loading;
}

/** One ffmpeg run: writes the inputs, runs ffmpeg with args, reads the output and cleans up. Returns { ok, bytes | log }. */
async function attempt(inputName, data, args, outputName, o = {}) {
  const ff = await loadFFmpeg();
  logTail = [];
  const extra = o.inputs || [];
  // a copy each time: writeFile hands the buffer to the worker, so a retry needs its own bytes
  await ff.writeFile(inputName, data.slice());
  for (const x of extra) await ff.writeFile(x.name, x.data.slice());
  const onProgress = ({ progress }) => { if (o.progress && progress >= 0 && progress <= 1) o.progress(progress); };
  ff.on('progress', onProgress);
  try {
    const code = await ff.exec(args);
    if (code !== 0) return { ok: false, log: logTail.slice(-12).join('\n') };
    const out = await ff.readFile(outputName);
    return { ok: true, bytes: out instanceof Uint8Array ? out : new TextEncoder().encode(String(out)) };
  } finally {
    ff.off('progress', onProgress);
    await ff.deleteFile(inputName).catch(() => {});
    for (const x of extra) await ff.deleteFile(x.name).catch(() => {});
    await ff.deleteFile(outputName).catch(() => {});
  }
}

/** Stops the engine so the next job starts a fresh one (after a runtime error inside ffmpeg.wasm the instance can be left unusable). */
function resetEngine() {
  const old = instance;
  instance = null;
  loading = null;
  try { if (old) old.terminate(); } catch (e) { /* already stopped */ }
}

const cancelled = () => new DOMException('Cancelled', 'AbortError'); // i18n-ignore: a DOMException for code
/** Runs one job, queued behind the others. A runtime error restarts the engine and tries once more on a fresh one.
 *  An abort stops the engine at once (the next job starts a fresh one). */
function job(inputName, data, args, outputName, o = {}) {
  const sig = o.signal, stop = () => resetEngine();
  const run = queue.then(async () => {
    if (sig && sig.aborted) throw cancelled();
    if (sig) sig.addEventListener('abort', stop, { once: true });
    try {
      return await attempt(inputName, data, args, outputName, o);
    } catch (e) {
      if (sig && sig.aborted) throw cancelled();
      resetEngine();
      return await attempt(inputName, data, args, outputName, o);
    } finally { if (sig) sig.removeEventListener('abort', stop); }
  });
  queue = run.catch(() => {});
  return run;
}

/** Converts one file. opts: { args(inName, outName) -> string[], output: 'mp4', fallback?: same shape (tried when the first fails) }. */
export async function convertVideo(file, { name, args, output, fallback, inputs, progress, signal }) {
  if (file.size > MAX_INPUT_BYTES) throw new Error(tr('convert.ff.too_big'));
  const inName = 'input' + extOf(file.name);
  const outName = 'output.' + output;
  const data = new Uint8Array(await file.arrayBuffer());
  const o = { inputs, progress, signal };
  let r = await job(inName, data, args(inName, outName), outName, o);
  if (!r.ok && fallback) r = await job(inName, data, fallback(inName, outName), outName, o);
  if (!r.ok) throw new Error(tr('convert.ff.failed', { why: lastLine(r.log) }));
  return { name: name + '.' + output, blob: new Blob([r.bytes], { type: MIME[output] || 'application/octet-stream' }) };
}

const MIME = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', gif: 'image/gif', webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', ogg: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac', m4a: 'audio/mp4' };
const extOf = (n) => { const m = /\.[A-Za-z0-9]{1,5}$/.exec(String(n || '')); return m ? m[0].toLowerCase() : '.bin'; };
/** The last ffmpeg line that names an error, for the message. */
function lastLine(log) {
  const lines = String(log || '').split('\n').filter((l) => /error|invalid|no such|unable|not |failed|unknown/i.test(l));
  return lines.length ? lines[lines.length - 1].trim() : tr('convert.ff.unreadable');
}

/** The notice before the video engine's first download: shown once, and only when a video job runs. */
export const FIRST_USE = {
  get title() { return tr('convert.ff.notice_title'); },
  get lines() { return [tr('convert.ff.notice_text')]; },
  get downloads() { return [{ name: tr('convert.ff.engine_name'), bytes: 32344223 }]; },
};
let firstUse = null;
/** Resolves true when the work may go on. Cancelling clears the gate, so the next try asks again. */
export function firstUseGate() {
  if (!firstUse) firstUse = globalThis.SlopFirstRun ? globalThis.SlopFirstRun.once('convert', FIRST_USE) : Promise.resolve(true);
  return firstUse.then((ok) => { if (!ok) firstUse = null; return ok; });
}
