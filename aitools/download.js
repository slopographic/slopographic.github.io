/* Slop AI Tools: downloads one model file and checks it, as one piece or in parts. No DOM and no storage: the fetch, the
 * SHA-256 and the host check are passed in, so a Node test runs it with fakes (module.exports); the browser gets
 * window.SlopAIDownload. Classic script; load shared/cdn/assets.js first (the download itself, with its fallback hosts).
 * Used by models.js (install).
 *   fetchFile(f, deps) -> Promise<ArrayBuffer>
 *     f: { name, size, sha256, url } or { name, size, sha256, parts: [{ url, size, sha256 }] } (an index entry)
 *     deps: { fetch, sha256Hex(buf), allowedUrl(url), signal, onBytes(loaded) }
 * A file in parts (GitHub refuses files over 100 MB, so big models are kept in pieces of 90 MiB) is downloaded part after
 * part; each part must have its exact length and SHA-256, then the joined bytes must have the file's length and SHA-256.
 * A place that fails (jsDelivr down, wrong bytes) falls through to the next place of the same file; when every place fails,
 * or on a cancel (signal), it rejects, and nothing is kept. */
(function (root, factory) {
  const api = factory(root.SlopCdn || (typeof module === 'object' && module.exports ? require('../shared/cdn/assets.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SlopAIDownload = api;
})(typeof window !== 'undefined' ? window : globalThis, function (cdn) {
  'use strict';

  /** One URL (a cdn URL tries each of its places, shared/cdn/assets.js): host checked after redirects, length and SHA-256
   *  checked. Returns the bytes (Uint8Array). */
  const piece = (url, want, label, deps, onBytes) => (cdn || globalThis.SlopCdn).fetchVerified(url, { label, size: want.size, sha256: want.sha256 },
    { fetch: deps.fetch, sha256Hex: deps.sha256Hex, allowedUrl: deps.allowedUrl, signal: deps.signal, onBytes });

  async function fetchFile(f, deps) {
    const onBytes = deps.onBytes || (() => {});
    if (!f.parts) return (await piece(f.url, f, f.name, deps, onBytes)).buffer;
    const all = new Uint8Array(f.size);
    let at = 0;
    for (let i = 0; i < f.parts.length; i++) {
      const p = f.parts[i], base = at;
      if (base + p.size > f.size) throw new Error(`${f.name}: the parts are longer than the file`);
      const bytes = await piece(p.url, p, `${f.name} part ${i + 1} of ${f.parts.length}`, deps, (n) => onBytes(base + n));
      all.set(bytes, base);
      at += bytes.byteLength;
    }
    if (at !== f.size) throw new Error(`${f.name}: ${at} bytes after joining, expected ${f.size}`);
    if ((await deps.sha256Hex(all)) !== f.sha256) throw new Error(`${f.name}: SHA-256 of the joined parts does not match the index`);
    return all.buffer;
  }

  return { fetchFile };
});
