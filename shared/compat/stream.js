/* SlopCompat streams: reading a ReadableStream on every browser of the support target (Safari 16.4, tools/compat/features.mjs).
 * Safari (iOS and macOS, up to 26 at least) cannot `for await` over a ReadableStream: it has no async iterator, and the
 * loop throws "undefined is not a function (near '...t of e...')". pdf.js 5 does exactly that in getTextContent (text
 * search, extraction, OCR, the text layer), so on an iPhone every one of those failed. This file:
 *   - gives ReadableStream.prototype values() and [Symbol.asyncIterator] where the browser has none (on getReader(), with
 *     the standard return(): cancel unless preventCancel), so vendored code that loops over streams works;
 *   - adds SlopCompat.readStream(stream, onChunk) → Promise (reads every chunk in order; onChunk may be async) and
 *     SlopCompat.streamValues(stream, { preventCancel }) → an async iterator, for our own code.
 * A classic script and an importable module at once (no import/export): <script src>, import('./stream.js'), or
 * importScripts in a worker. Safe to run twice. */
(function (root) {
  'use strict';
  /** An async iterator over a stream's chunks, on its reader. */
  function streamValues(stream, opts) {
    const preventCancel = !!(opts && opts.preventCancel), reader = stream.getReader();
    let done = false;
    const finish = () => { if (!done) { done = true; try { reader.releaseLock(); } catch (e) { /* a read still pending */ } } };
    return {
      next() {
        if (done) return Promise.resolve({ done: true, value: undefined });
        return reader.read().then((r) => { if (r.done) finish(); return r.done ? { done: true, value: undefined } : { done: false, value: r.value }; },
          (e) => { finish(); throw e; });
      },
      return(value) {
        if (done) return Promise.resolve({ done: true, value });
        const c = preventCancel ? Promise.resolve() : reader.cancel(value);
        return c.then(() => { finish(); return { done: true, value }; });
      },
      [Symbol.asyncIterator]() { return this; },
    };
  }
  /** Reads a stream to its end, calling onChunk(chunk) for each one (awaited, so a slow consumer applies back-pressure). */
  async function readStream(stream, onChunk) {
    const reader = stream.getReader();
    try {
      for (;;) {
        const r = await reader.read();
        if (r.done) return;
        await onChunk(r.value);
      }
    } finally { try { reader.releaseLock(); } catch (e) { /* already released */ } }
  }
  /** Installs values() and [Symbol.asyncIterator] on ReadableStream where they are missing. True when it did. */
  function installStreamIteration(RS) {
    RS = RS || root.ReadableStream;
    if (!RS || !RS.prototype || typeof RS.prototype[Symbol.asyncIterator] === 'function') return false;
    const values = function (opts) { return streamValues(this, opts); };
    const def = (k, v) => Object.defineProperty(RS.prototype, k, { value: v, writable: true, configurable: true, enumerable: false });
    if (typeof RS.prototype.values !== 'function') def('values', values);
    def(Symbol.asyncIterator, RS.prototype.values);
    return true;
  }
  installStreamIteration();
  root.SlopCompat = Object.assign(root.SlopCompat || {}, { streamValues, readStream, installStreamIteration });
})(typeof globalThis !== 'undefined' ? globalThis : self);
