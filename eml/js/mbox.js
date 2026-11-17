/* Slop EML: mailbox files (.mbox, the export format of Thunderbird, Apple Mail and Google Takeout) split into messages.
 * Pure, no DOM: window.EmlMbox in the page, module.exports for the Node tests (tests/node/eml-batch.test.mjs).
 *   isMbox(name, head)  true for a .mbox / .mbx file, or bytes that start with an mbox "From " separator line
 *   split(bytes)        Uint8Array[]: one message per separator ("From " at the start of a line that follows a blank
 *                       line, or the first line). The separator line is dropped, ">From " lines are unquoted (mboxrd and
 *                       mboxo both write them), and the newline before the next separator goes with it.
 * Works on the bytes as they are (a message keeps its own charset and line ends). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.EmlMbox = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const F = 0x46, R = 0x72, O = 0x6f, M = 0x6d, SP = 0x20, LF = 0x0a, CR = 0x0d, GT = 0x3e;
  const isFrom = (b, i) => b[i] === F && b[i + 1] === R && b[i + 2] === O && b[i + 3] === M && b[i + 4] === SP;

  function isMbox(name, head) {
    if (/\.(mbox|mbx)$/i.test(String(name || ''))) return true;
    return !!head && head.length > 5 && isFrom(head, 0);
  }

  /** Index of the next LF at or after i, or the length. */
  function eol(b, i) { while (i < b.length && b[i] !== LF) i++; return i; }

  /** Start offsets of the separator lines. */
  function separators(b) {
    const out = [];
    if (isFrom(b, 0)) out.push(0);
    for (let i = eol(b, 0) + 1; i < b.length; i = eol(b, i) + 1) {
      if (!isFrom(b, i)) continue;
      // the line before is blank: "\n\n" or "\r\n\r\n" just before i
      const blank = (b[i - 1] === LF && b[i - 2] === LF) || (b[i - 1] === LF && b[i - 2] === CR && b[i - 3] === LF);
      if (blank) out.push(i);
    }
    return out;
  }

  /** One message's bytes, with each ">From " (any number of >) line losing one >. */
  function unquote(b, start, end) {
    const out = new Uint8Array(end - start);
    let n = 0, lineStart = true;
    for (let i = start; i < end; i++) {
      if (lineStart && b[i] === GT) {
        let j = i;
        while (j < end && b[j] === GT) j++;
        if (isFrom(b, j)) { i++; lineStart = false; out[n++] = b[i]; continue; }
      }
      out[n++] = b[i];
      lineStart = b[i] === LF;
    }
    return out.subarray(0, n);
  }

  function split(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const seps = separators(b);
    if (!seps.length) return b.length ? [b] : [];
    const out = [];
    seps.forEach((s, k) => {
      const start = eol(b, s) + 1;
      let end = k + 1 < seps.length ? seps[k + 1] : b.length;
      // the blank line before the next separator belongs to the separator
      if (k + 1 < seps.length) { if (b[end - 1] === LF) end--; if (b[end - 1] === CR) end--; }
      if (start < end) {
        const msg = unquote(b, start, end);
        if (msg.some((c) => c !== LF && c !== CR && c !== SP)) out.push(msg);
      }
    });
    return out;
  }

  return { isMbox, split };
});
