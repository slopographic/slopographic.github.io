/* Slop retouch: the content-aware fill (shared/retouch/patchmatch.js) off the page's main thread, so the editor stays
 * responsive while a removed object is filled. PhotoSlop's Remove object (photoslop/js/retouch/remove.js) posts
 * { id, data (RGBA), w, h, hole (Uint8Array, 1 = fill) } and gets { id, progress } while it works, then { id, data } or
 * { id, error }. */
/* global importScripts, SlopRetouchPatchMatch */
importScripts('patchmatch.js');
self.onmessage = (e) => {
  const { id, data, w, h, hole, patch } = e.data;
  try {
    const out = SlopRetouchPatchMatch.inpaint(data, w, h, hole, { patch: patch || 7, onProgress: (p) => self.postMessage({ id, progress: p }) });
    self.postMessage({ id, data: out }, [out.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};
