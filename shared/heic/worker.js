/* HEIC and HEIF photos: the decoding worker (a classic worker started by shared/heic/engine.js). It runs libheif with the
 * libde265 HEVC decoder compiled to WebAssembly (libheif-js 1.23.5), off the page's thread. The two files arrive from the
 * page, already checked against their SHA-256: libheif.js as a blob URL (loaded with importScripts; it defines the
 * global `libheif` factory) and libheif.wasm as bytes, so nothing is fetched by this worker.
 * Messages in:  { id, op: 'init', jsUrl, wasm }   { id, op: 'decode', bytes }
 * Messages out: { id, ok: true, out } or { id, ok: false, error } (error: libheif's text, or a ui.heic.* key the page
 *   translates).
 * decode's out: { width, height, data (RGBA, Uint8ClampedArray), count }: the file's primary (first top-level) picture, with
 * its rotation and mirroring applied by libheif; count is the number of top-level pictures (a burst or a live photo). */
let lib = null;

function init(jsUrl, wasm) {
  importScripts(jsUrl);
  return new Promise((resolve, reject) => {
    // the module object gets its classes (HeifDecoder) only after the factory returns, so wait a tick after start-up
    let mod = null;
    const done = () => setTimeout(() => { if (mod && mod.HeifDecoder) { lib = mod; resolve(); } else reject(new Error('ui.heic.crashed')); }, 0);
    try {
      mod = self.libheif({ wasmBinary: wasm, locateFile: (p) => p, print: () => {}, printErr: () => {}, onRuntimeInitialized: done });
    } catch (e) { reject(e); }
  });
}

function decode(bytes) {
  if (!lib) throw new Error('ui.heic.missing');
  const dec = new lib.HeifDecoder();
  const images = dec.decode(bytes);
  if (!images || !images.length) throw new Error('ui.heic.unreadable');
  const img = images[0];
  const width = img.get_width(), height = img.get_height();
  return new Promise((resolve, reject) => {
    img.display({ data: new Uint8ClampedArray(width * height * 4), width, height }, (r) => {
      try { for (const i of images) if (i.free) i.free(); } catch (e) { /* freed with the context */ }
      if (!r) { reject(new Error('ui.heic.undecodable')); return; }
      resolve({ width, height, data: r.data, count: images.length });
    });
  });
}

self.onmessage = async ({ data: msg }) => {
  const { id, op } = msg || {};
  try {
    if (op === 'init') { await init(msg.jsUrl, msg.wasm); self.postMessage({ id, ok: true, out: null }); return; }
    if (op === 'decode') {
      const out = await decode(msg.bytes);
      self.postMessage({ id, ok: true, out }, [out.data.buffer]);
      return;
    }
    throw new Error('Unknown request ' + op);
  } catch (e) {
    self.postMessage({ id, ok: false, error: e instanceof Error && e.message ? e.message : 'ui.heic.unreadable' });
  }
};
