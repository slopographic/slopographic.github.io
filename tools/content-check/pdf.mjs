// A PDF's text for the content checks, synchronously: a PDF draws its text from glyph ids in compressed streams, so its
// bytes can hide a word that every page shows. The vendored pdf.js reads it in a worker (pdf-worker.mjs, loaded once);
// this side posts the file and waits on a shared flag until the answer is there.
//   pdfTexts(bytes) -> { texts: [{ label, text }] } (the document information, its metadata, each page) or { error }
// Node only. Tests: tests/node/content-check-unpack.test.mjs.
import { Worker, MessageChannel, receiveMessageOnPort } from 'node:worker_threads';

const WAIT = 120000;   // ms for one file; a file that takes longer counts as unreadable
let W = null;

function worker() {
  if (W) return W;
  const { port1, port2 } = new MessageChannel(), flag = new Int32Array(new SharedArrayBuffer(4));
  const w = new Worker(new URL('./pdf-worker.mjs', import.meta.url), { workerData: { port: port2, flag }, transferList: [port2], stdout: true, stderr: true });
  w.unref();
  w.on('error', () => {});   // a worker that failed is noticed by the next wait: no answer
  W = { w, port: port1, flag };
  return W;
}

/** { texts } or { error } for one PDF file's bytes. */
export function pdfTexts(bytes) {
  const { w, port, flag } = worker();
  Atomics.store(flag, 0, 0);
  port.postMessage(new Uint8Array(bytes));   // a copy: pdf.js takes the buffer over
  const waited = Atomics.wait(flag, 0, 0, WAIT);
  const answer = receiveMessageOnPort(port);
  if (waited === 'timed-out' || !answer) {     // stuck or gone: a fresh worker for the next file
    w.terminate();
    W = null;
    return { error: waited === 'timed-out' ? 'pdf.js took too long' : 'pdf.js stopped' };
  }
  return answer.message;
}
