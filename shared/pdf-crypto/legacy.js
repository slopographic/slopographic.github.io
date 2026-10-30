/* SlopPdfCrypto, part 1 of 5: byte helpers, and the MD5 and RC4 side of the PDF Standard security handler, revisions 2 to 4
 * (ISO 32000-1 7.6.3: Algorithm 2, the file key from a user password; 3, the owner key; 6 and 7, the password checks). These
 * older revisions are only ever read (Slop PDF opens such files); new files are written with AES-256 (aes256.js).
 * Moved here unchanged from pdf/js/io/decrypt.js so the site has one implementation. Pure; no DOM.
 * Classic script: window.SlopPdfCrypto (merged with the other parts), and module.exports for Node.
 *   md5(bytes) rc4(key, bytes) concat(...bytes) eq(a, b, n) latin1(str) toHex(bytes) fromHex(str) PAD padPw(bytes)
 *   keyR4(paddedPw, enc, id0)       Algorithm 2: the file key (enc: { R, P, O, keyLen, encryptMetadata })
 *   checkUserR4(key, enc, id0)      Algorithms 6 (R2) and 7 (R3, R4): does the key open /U
 *   ownerToUserR4(pw, enc)          Algorithm 7's first half: the padded user password hidden in /O by the owner password */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SlopPdfCrypto = Object.assign(root.SlopPdfCrypto || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* MD5 (RFC 1321) on Uint8Array */
  var K = new Int32Array(64), S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  for (var i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;
  function md5(data) {
    var len = data.length, padLen = ((len + 72) & ~63);
    var buf = new Uint8Array(padLen);
    buf.set(data); buf[len] = 0x80;
    var bits = len * 8;
    buf[padLen - 8] = bits & 255; buf[padLen - 7] = (bits >>> 8) & 255; buf[padLen - 6] = (bits >>> 16) & 255; buf[padLen - 5] = (bits >>> 24) & 255;
    var hi = Math.floor(len / 536870912);
    buf[padLen - 4] = hi & 255; buf[padLen - 3] = (hi >>> 8) & 255; buf[padLen - 2] = (hi >>> 16) & 255; buf[padLen - 1] = (hi >>> 24) & 255;
    var a0 = 0x67452301, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476, w = new Int32Array(16);
    for (var off = 0; off < padLen; off += 64) {
      for (var j = 0; j < 16; j++) { var p = off + j * 4; w[j] = buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16) | (buf[p + 3] << 24); }
      var a = a0, b = b0, c = c0, d = d0, f, g;
      for (var k = 0; k < 64; k++) {
        if (k < 16) { f = (b & c) | (~b & d); g = k; }
        else if (k < 32) { f = (d & b) | (~d & c); g = (5 * k + 1) & 15; }
        else if (k < 48) { f = b ^ c ^ d; g = (3 * k + 5) & 15; }
        else { f = c ^ (b | ~d); g = (7 * k) & 15; }
        var t = d; d = c; c = b;
        var x = (a + f + K[k] + w[g]) | 0, s = S[(k >> 4) * 4 + (k & 3)];
        b = (b + ((x << s) | (x >>> (32 - s)))) | 0; a = t;
      }
      a0 = (a0 + a) | 0; b0 = (b0 + b) | 0; c0 = (c0 + c) | 0; d0 = (d0 + d) | 0;
    }
    var out = new Uint8Array(16), words = [a0, b0, c0, d0];
    for (var q = 0; q < 4; q++) { out[q * 4] = words[q] & 255; out[q * 4 + 1] = (words[q] >>> 8) & 255; out[q * 4 + 2] = (words[q] >>> 16) & 255; out[q * 4 + 3] = (words[q] >>> 24) & 255; }
    return out;
  }

  function rc4(key, data) {
    var s = new Uint8Array(256), j = 0, i, t;
    for (i = 0; i < 256; i++) s[i] = i;
    for (i = 0; i < 256; i++) { j = (j + s[i] + key[i % key.length]) & 255; t = s[i]; s[i] = s[j]; s[j] = t; }
    var out = new Uint8Array(data.length), x = 0, y = 0;
    for (var k = 0; k < data.length; k++) {
      x = (x + 1) & 255; y = (y + s[x]) & 255; t = s[x]; s[x] = s[y]; s[y] = t;
      out[k] = data[k] ^ s[(s[x] + s[y]) & 255];
    }
    return out;
  }

  function concat() {
    var len = 0, i; for (i = 0; i < arguments.length; i++) len += arguments[i].length;
    var out = new Uint8Array(len), o = 0;
    for (i = 0; i < arguments.length; i++) { out.set(arguments[i], o); o += arguments[i].length; }
    return out;
  }
  function eq(a, b, n) { if (!a || !b || a.length < n || b.length < n) return false; for (var i = 0; i < n; i++) if (a[i] !== b[i]) return false; return true; }
  function latin1(s) { var o = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) o[i] = s.charCodeAt(i) & 255; return o; }
  function toHex(b) { var s = ''; for (var i = 0; i < b.length; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16); return s; }
  function fromHex(h) { var o = new Uint8Array(h.length >> 1); for (var i = 0; i < o.length; i++) o[i] = parseInt(h.substr(i * 2, 2), 16); return o; }

  var PAD = new Uint8Array([0x28, 0xBF, 0x4E, 0x5E, 0x4E, 0x75, 0x8A, 0x41, 0x64, 0x00, 0x4E, 0x56, 0xFF, 0xFA, 0x01, 0x08,
    0x2E, 0x2E, 0x00, 0xB6, 0xD0, 0x68, 0x3E, 0x80, 0x2F, 0x0C, 0xA9, 0xFE, 0x64, 0x53, 0x69, 0x7A]);
  function padPw(pw) { var out = new Uint8Array(32), n = Math.min(32, pw.length); out.set(pw.subarray(0, n)); out.set(PAD.subarray(0, 32 - n), n); return out; }

  /* Algorithm 2: the file key from a (padded) user password, R2 to R4 */
  function keyR4(pwPadded, enc, id0) {
    var p = enc.P >>> 0;
    var parts = [pwPadded, enc.O.subarray(0, 32), new Uint8Array([p & 255, (p >>> 8) & 255, (p >>> 16) & 255, (p >>> 24) & 255]), id0];
    if (enc.R >= 4 && !enc.encryptMetadata) parts.push(new Uint8Array([255, 255, 255, 255]));
    var h = md5(concat.apply(null, parts)), n = enc.R === 2 ? 5 : enc.keyLen;
    if (enc.R >= 3) for (var i = 0; i < 50; i++) h = md5(h.subarray(0, n));
    return h.slice(0, n);
  }
  function checkUserR4(key, enc, id0) {
    if (enc.R === 2) return eq(rc4(key, PAD), enc.U, 32);
    var x = rc4(key, md5(concat(PAD, id0)));
    for (var i = 1; i <= 19; i++) { var k2 = new Uint8Array(key.length); for (var j = 0; j < key.length; j++) k2[j] = key[j] ^ i; x = rc4(k2, x); }
    return eq(x, enc.U, 16);
  }
  function ownerToUserR4(pw, enc) {
    var h = md5(padPw(pw)), n = enc.R === 2 ? 5 : enc.keyLen;
    if (enc.R >= 3) for (var i = 0; i < 50; i++) h = md5(h);
    var key = h.slice(0, n), data = enc.O.slice(0, 32);
    if (enc.R === 2) return rc4(key, data);
    for (var r = 19; r >= 0; r--) { var k2 = new Uint8Array(n); for (var j = 0; j < n; j++) k2[j] = key[j] ^ r; data = rc4(k2, data); }
    return data;
  }

  return { md5: md5, rc4: rc4, concat: concat, eq: eq, latin1: latin1, toHex: toHex, fromHex: fromHex, PAD: PAD, padPw: padPw,
    keyR4: keyR4, checkUserR4: checkUserR4, ownerToUserR4: ownerToUserR4 };
});
