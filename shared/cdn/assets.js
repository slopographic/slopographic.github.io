/* Slopographic's own file host (the github.com/slopographic/cdn repository): the one place that knows where its files are
 * served from, and the one download path for them. See shared/cdn/HANDOFF.md.
 * An asset is named by its path in that repository ('models/ocr/ppocr-det-v4/ch_PP-OCRv4_det_infer.onnx'). urls(path) gives
 * the places to fetch it from, in order: jsDelivr (cdn.jsdelivr.net, pinned to the release tag, cached for a year) and
 * raw.githubusercontent.com at the same tag as the fallback. jsDelivr refuses GitHub files over 20 MB, so those (OVER) skip
 * it; a Hugging Face copy goes first for them once HF below is set.
 * fetchVerified(target, want, deps) downloads one file from those places in order, with progress, and checks its length and
 * SHA-256: a failed place (network error, HTTP error, wrong bytes, a redirect off the allowed hosts) falls through to the next.
 * Pure (no DOM), so Node tests load it (module.exports); the browser gets window.SlopCdn. Classic script; an ES module can
 * import it for the side effect and use globalThis.SlopCdn. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SlopCdn = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const REPO = 'slopographic/cdn';
  /** The release of the cdn repository the site uses. A new asset version: push it there, tag it, change this line. */
  const TAG = 'v2026.10.27';
  /** jsDelivr's limit for one file from GitHub ("File size exceeded the configured limit of 20 MB", 403). */
  const JSDELIVR_MAX = 20 * 1024 * 1024;
  /** A Hugging Face copy of the repository, for the files over JSDELIVR_MAX: { repo: 'datasets/<owner>/<name>', rev: TAG }.
   *  null until it exists; then those files are fetched from it first and raw.githubusercontent.com stays the fallback. */
  const HF = null;
  /** The files over jsDelivr's limit, with their sizes in bytes: these come from raw.githubusercontent.com (and HF once set). */
  const OVER = {
    'engines/ffmpeg/0.12.10/ffmpeg-core.wasm': 32232419,
    'models/depth/depth-anything-v2-small.onnx': 27258801,
    'models/ocr/ppocr-v6-small/PP-OCRv6_rec_small.onnx': 21234383,
    'models/upscale/realesrgan-x4plus.onnx': 67051618,
    'models/whisper/kb-whisper-base/decoder_model_merged_quantized.onnx': 52726027,
    'models/whisper/kb-whisper-base/encoder_model_quantized.onnx': 23123019,
    'models/whisper/kb-whisper-small/decoder_model_merged_quantized.onnx.part1': 94371840,
    'models/whisper/kb-whisper-small/decoder_model_merged_quantized.onnx.part2': 60790145,
    'models/whisper/kb-whisper-small/encoder_model_quantized.onnx': 92169288,
    'models/whisper/nb-whisper-base/decoder_model_merged_quantized.onnx': 52728917,
    'models/whisper/nb-whisper-base/encoder_model_quantized.onnx': 23123020,
    'models/whisper/nb-whisper-small/decoder_model_merged_quantized.onnx.part1': 94371840,
    'models/whisper/nb-whisper-small/decoder_model_merged_quantized.onnx.part2': 60795099,
    'models/whisper/nb-whisper-small/encoder_model_quantized.onnx': 92169277,
    'models/whisper/whisper-base/decoder_model_merged_quantized.onnx': 53693315,
    'models/whisper/whisper-base/encoder_model_quantized.onnx': 23201314,
    'models/whisper/whisper-base-en/decoder_model_merged_quantized.onnx': 53692803,
    'models/whisper/whisper-base-en/encoder_model_quantized.onnx': 23201320,
    'models/whisper/whisper-small/decoder_model_merged_quantized.onnx.part1': 94371840,
    'models/whisper/whisper-small/decoder_model_merged_quantized.onnx.part2': 62379005,
    'models/whisper/whisper-small/encoder_model_quantized.onnx': 92326160,
    'models/whisper/whisper-small-en/decoder_model_merged_quantized.onnx.part1': 94371840,
    'models/whisper/whisper-small-en/decoder_model_merged_quantized.onnx.part2': 62378236,
    'models/whisper/whisper-small-en/encoder_model_quantized.onnx': 92326170,
    'models/whisper/whisper-tiny/decoder_model_merged_quantized.onnx': 30727765,
  };

  const JSD_HOST = 'cdn.jsdelivr.net', RAW_HOST = 'raw.githubusercontent.com';
  const JSD = `https://${JSD_HOST}/gh/${REPO}@${TAG}/`;
  const RAW = `https://${RAW_HOST}/${REPO}/${TAG}/`;
  const HFB = HF ? `https://huggingface.co/${HF.repo}/resolve/${HF.rev}/` : null;
  /** The hosts a cdn file is served from (Hugging Face then redirects to its storage hosts, hf.co and xethub.hf.co). */
  const HOSTS = [JSD_HOST, RAW_HOST].concat(HF ? ['huggingface.co'] : []);
  const PATH = /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*\/?$/;

  /** True when path is a plain repository path (no "..", no leading slash, no query). */
  const validPath = (path) => typeof path === 'string' && PATH.test(path) && !path.split('/').includes('..');
  function check(path) { if (!validPath(path)) throw new Error('Not a cdn asset path: ' + path); return path; }
  /** True when the file is over jsDelivr's limit (so it is not fetched from there). */
  const over = (path) => Object.prototype.hasOwnProperty.call(OVER, path);

  /** The URLs to fetch path from, best first. A folder path (ending in /) gives the folder's base URLs. */
  function urls(path) {
    check(path);
    if (over(path)) return (HFB ? [HFB + path] : []).concat(RAW + path);
    return [JSD + path, RAW + path];
  }
  /** The first URL of path: what a model index shows and what a cache keys on. */
  const url = (path) => urls(path)[0];
  /** The asset path of one of the URLs above (any of the bases, at the current tag), or null. */
  function pathOf(u) {
    const s = String(u || '');
    for (const base of [JSD, RAW, HFB]) if (base && s.startsWith(base) && validPath(s.slice(base.length))) return s.slice(base.length);
    return null;
  }
  /** The URLs to try for a URL: every place of a cdn asset at the current tag, else the URL alone. */
  const candidates = (u) => { const p = pathOf(u); return p ? urls(p) : [String(u)]; };
  /** True for https URLs of this repository on its hosts, at any ref (tests serve fakes at made-up refs). */
  function isCdnUrl(u) {
    try {
      const x = new URL(u);
      if (x.protocol !== 'https:') return false;
      if (x.hostname === JSD_HOST) return x.pathname.startsWith(`/gh/${REPO}@`);
      if (x.hostname === RAW_HOST) return x.pathname.startsWith(`/${REPO}/`);
      return !!HFB && u.startsWith(HFB);
    } catch (e) { return false; }
  }

  const cancelled = () => Object.assign(new Error('Download cancelled'), { name: 'AbortError' });

  /** Reads a response body, telling onBytes(n) the bytes read so far. */
  async function bodyOf(r, onBytes, signal) {
    if (!r.body || !r.body.getReader) { const b = new Uint8Array(await r.arrayBuffer()); onBytes(b.byteLength); return b; }
    const reader = r.body.getReader(), chunks = [];
    let n = 0;
    for (;;) {
      if (signal && signal.aborted) { try { reader.cancel(); } catch (e) { /* already closed */ } throw cancelled(); }
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); n += value.byteLength; onBytes(n);
    }
    const out = new Uint8Array(n);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.byteLength; }
    return out;
  }

  async function sha256Hex(bytes) {
    const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    let s = '';
    for (const b of d) s += b.toString(16).padStart(2, '0');
    return s;
  }

  /** One URL: fetched, host checked after redirects, then checked (deps.verify, or want.size and want.sha256). */
  async function fetchOne(u, want, deps, onBytes) {
    const label = want.label || want.name || u;
    if (deps.signal && deps.signal.aborted) throw cancelled();
    let r;
    const init = Object.assign({ credentials: 'omit', redirect: 'follow', cache: 'no-cache' }, deps.init || {}, deps.signal ? { signal: deps.signal } : {});
    try { r = await (deps.fetch || ((x, o) => globalThis.fetch(x, o)))(u, init); }
    catch (e) { if (deps.signal && deps.signal.aborted) throw cancelled(); throw new Error(`${label}: ${e.message || 'network error'}`); }
    if (!r.ok) throw new Error(`${label}: HTTP ${r.status}`);
    if (deps.allowedUrl && !deps.allowedUrl(r.url || u)) throw new Error(`${label}: redirected to a host that is not allowed`);
    const bytes = await bodyOf(r, onBytes, deps.signal);
    if (deps.verify) { const v = await deps.verify(bytes); if (!v.ok) throw new Error(v.reason); return bytes; }
    if (want.size !== undefined && bytes.byteLength !== want.size) throw new Error(`${label}: ${bytes.byteLength} bytes, expected ${want.size}`);
    if (want.sha256 && (await (deps.sha256Hex || sha256Hex)(bytes)) !== want.sha256) throw new Error(`${label}: SHA-256 does not match ${want.index || 'the index'}`);
    return bytes;
  }

  /** Downloads one file and checks it. Resolves its bytes (Uint8Array); rejects with the last place's reason.
   *  target: a URL (a cdn URL tries every place of that asset), or a list of URLs to try in order.
   *  want: { label, size, sha256 } (size and sha256 are checked when given).
   *  deps: { fetch, sha256Hex, allowedUrl(finalUrl), verify(bytes) -> { ok, reason }, signal, onBytes(n), init, onFallback(err, nextUrl) }.
   *  onBytes counts from 0 again when a place fails and the next one starts. A cancel (signal) never falls through. */
  async function fetchVerified(target, want, deps) {
    const list = Array.isArray(target) ? target : candidates(target), d = deps || {}, onBytes = d.onBytes || (() => {});
    let last = null;
    for (let i = 0; i < list.length; i++) {
      if (i) { onBytes(0); if (d.onFallback) d.onFallback(last, list[i]); }
      try { return await fetchOne(list[i], want || {}, d, onBytes); }
      catch (e) { if (e && e.name === 'AbortError') throw e; last = e; }
    }
    throw last || new Error('nothing to download');
  }

  return { REPO, TAG, JSDELIVR_MAX, HF, OVER, HOSTS, urls, url, pathOf, candidates, isCdnUrl, validPath, over, fetchVerified, sha256Hex };
});
