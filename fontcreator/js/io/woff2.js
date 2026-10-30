/* Slop Font: WOFF2 in and out, through the worker (js/io/woff2-worker.js), started on first use, one for packing and
 * one for unpacking. Also zlib deflate and inflate for WOFF 1.0 (the browser's CompressionStream). Classic script.
 *   FC.woff2.compress(ttfBytes) → Promise<Uint8Array>     decompress(woff2Bytes) → Promise<Uint8Array> (a .ttf or .otf)
 *   FC.zlib.deflate(bytes), inflate(bytes) → Promise<Uint8Array> */
(function (g) {
  'use strict';
  const HERE = (document.currentScript && document.currentScript.src) || location.href;
  const workers = {}, waiting = new Map();
  let next = 1;
  function worker(mode) {
    if (workers[mode]) return workers[mode];
    const w = new Worker(new URL('woff2-worker.js', HERE).href, { name: mode });
    w.onmessage = (e) => {
      const job = waiting.get(e.data.id);
      if (!job) return;
      waiting.delete(e.data.id);
      if (e.data.error) job.reject(new Error(e.data.error)); else job.resolve(e.data.bytes);
    };
    w.onerror = (e) => {
      for (const [id, job] of waiting) if (job.mode === mode) { waiting.delete(id); job.reject(new Error('The WOFF2 tool could not start: ' + (e.message || 'blocked'))); }
      workers[mode] = null;
    };
    workers[mode] = w;
    return w;
  }
  function run(mode, bytes) {
    return new Promise((resolve, reject) => {
      const id = next++, copy = new Uint8Array(bytes);
      waiting.set(id, { resolve, reject, mode });
      worker(mode).postMessage({ id, bytes: copy }, [copy.buffer]);
      setTimeout(() => { if (waiting.has(id)) { waiting.delete(id); reject(new Error('WOFF2 took too long')); } }, 60000);
    });
  }
  const pump = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
  g.FC.woff2 = { compress: (b) => run('compress', b), decompress: (b) => run('decompress', b) };
  g.FC.zlib = { deflate: (b) => pump(b, new CompressionStream('deflate')), inflate: (b) => pump(b, new DecompressionStream('deflate')) };
})(window);
