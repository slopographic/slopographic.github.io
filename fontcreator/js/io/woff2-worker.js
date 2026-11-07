/* Slop Font: Google's WOFF2 encoder or decoder (vendor/woff2, Emscripten builds with the wasm inlined) in a worker of
 * its own, so its 'Module' global never meets another one and the page stays responsive. new Worker(this file,
 * { name: 'compress' | 'decompress' }); post { id, bytes } (Uint8Array), get { id, bytes } or { id, error }. */
/* global importScripts */
'use strict';
const MODE = self.name === 'decompress' ? 'decompress' : 'compress';
const ready = new Promise((resolve) => { self.Module = { onRuntimeInitialized: resolve }; });
importScripts('../../../vendor/woff2/' + MODE + '_binding.js');
self.onmessage = async (e) => {
  const { id, bytes } = e.data || {};
  try {
    await ready;
    const out = self.Module[MODE](bytes);
    if (!out || out === false || !out.length) throw new Error(MODE === 'compress' ? 'The WOFF2 encoder could not pack this font' : 'This WOFF2 file could not be unpacked');
    const copy = new Uint8Array(out);
    self.postMessage({ id, bytes: copy }, [copy.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};
