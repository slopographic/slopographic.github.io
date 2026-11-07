/* Camera RAW: the decoding worker (a module worker started by shared/raw/engine.js). It runs LibRaw compiled to
 * WebAssembly (libraw-wasm 1.6.0, LibRaw 0.22.1), off the page's thread. The engine's two files arrive from the page,
 * already checked against their SHA-256: libraw.js as a blob URL (imported here, and handed to LibRaw's own threads as
 * mainScriptUrlOrBlob) and libraw.wasm as bytes, so nothing is fetched by this worker.
 * Messages in:  { id, op: 'init', jsUrl, wasm }   { id, op: 'decode', bytes, settings }
 * Messages out: { id, ok: true, out } or { id, ok: false, error }, plus { id, progress } while decoding (error: LibRaw's
 *   text, or a ui.raw.* key the page translates; progress: a step, ui.raw.step_<step>).
 * decode's out: { width, height, bits, data, meta }. 8-bit data is RGBA (Uint8ClampedArray, ready for ImageData);
 * 16-bit data is RGB (Uint16Array, three values per pixel). The orientation is already applied by LibRaw. */
let lib = null;

function rgba(src, w, h) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0, j = 0, n = w * h; i < n; i++, j += 3) {
    const k = i * 4;
    out[k] = src[j]; out[k + 1] = src[j + 1]; out[k + 2] = src[j + 2]; out[k + 3] = 255;
  }
  return out;
}
/** A one-channel image (monochrome sensors) as RGB. */
function grey(src, n) {
  const out = new src.constructor(n * 3);
  for (let i = 0; i < n; i++) out[i * 3] = out[i * 3 + 1] = out[i * 3 + 2] = src[i];
  return out;
}

function metaOf(m) {
  m = m || {};
  return {
    make: String(m.camera_make || '').trim(), model: String(m.camera_model || '').trim(),
    iso: m.iso_speed || 0, shutter: m.shutter || 0, aperture: m.aperture || 0, focal: m.focal_len || 0,
    date: m.timestamp ? new Date(m.timestamp * 1000).toISOString() : '', flip: m.flip || 0,
    rawWidth: m.raw_width || 0, rawHeight: m.raw_height || 0,
  };
}

async function init(jsUrl, wasm) {
  const factory = (await import(jsUrl)).default;
  // locateFile: the loader would resolve libraw.wasm against its own (blob) URL, which fails; the bytes are given instead
  const mod = await factory({ wasmBinary: wasm, mainScriptUrlOrBlob: jsUrl, locateFile: (p) => p, print: () => {}, printErr: () => {} });
  lib = mod;
}

function decode(id, bytes, settings) {
  if (!lib) throw new Error('ui.raw.missing');
  const p = new lib.LibRaw();
  try {
    self.postMessage({ id, progress: 'open' });
    p.open(bytes, settings || {});
    const meta = metaOf(p.metadata(false));
    self.postMessage({ id, progress: 'develop' });
    const img = p.imageData();
    if (!img || !img.data) throw new Error('ui.raw.undecodable');
    const w = img.width, h = img.height;
    let data = img.colors === 1 ? grey(img.data, w * h) : img.data;
    if (img.bits === 8) data = rgba(data, w, h);
    // a view into the engine's (shared) memory cannot be transferred: give the page its own copy
    else if (!(data.buffer instanceof ArrayBuffer) || data.byteLength !== data.buffer.byteLength) data = data.slice();
    return { width: w, height: h, bits: img.bits, data, meta };
  } finally {
    try { p.delete(); } catch (e) { /* already freed */ }
  }
}

self.onmessage = async ({ data: msg }) => {
  const { id, op } = msg || {};
  try {
    if (op === 'init') { await init(msg.jsUrl, msg.wasm); self.postMessage({ id, ok: true, out: null }); return; }
    if (op === 'decode') {
      const out = decode(id, msg.bytes, msg.settings);
      self.postMessage({ id, ok: true, out }, [out.data.buffer]);
      return;
    }
    throw new Error('Unknown request ' + op);
  } catch (e) {
    // LibRaw's C++ errors arrive as plain objects with no message
    self.postMessage({ id, ok: false, error: e instanceof Error && e.message ? e.message : 'ui.raw.unreadable' });
  }
};
