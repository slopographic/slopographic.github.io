/* SlopPdfCrypto, part 2 of 5: AES with WebCrypto, and the AES-256 Standard security handler (revision 6, ISO 32000-2
 * 7.6.4.3: Algorithm 2.A, the file key from a password; 2.B, the hash; 8, 9 and 10, the /U /UE, /O /OE and /Perms entries;
 * 11, 12 and 13, the checks). Revision 5 (Adobe's deprecated AES-256) is read too: its hash is one SHA-256. Pure; needs
 * globalThis.crypto (browsers, Node 19+). Needs legacy.js first. Classic script: window.SlopPdfCrypto, module.exports for Node.
 *   importAes(key) aesCbcRaw(cryptoKey, iv, data) aesEncryptRaw(cryptoKey, iv, data)      no padding, data in 16-byte blocks
 *   aesDecryptPdf(cryptoKey, ivAndData) aesEncryptPdf(cryptoKey, data, iv?)              PDF form: 16-byte IV, then PKCS#7 data
 *   pwBytes(password)              the password as revision 6 takes it: NFKC (SASLprep), UTF-8, at most 127 bytes
 *   hashR6(pw, salt, udata, R)     Algorithm 2.B (R 6) or SHA-256 (R 5); 32 bytes
 *   keyR6(password, enc)           Algorithm 2.A: { key, owner } or null; enc: { R, O, U, OE, UE } (Uint8Array)
 *   makeR6({ userPassword, ownerPassword, P, encryptMetadata, random })   Algorithms 8 to 10: { fileKey, U, UE, O, OE, Perms }
 *   readPerms(fileKey, Perms)      Algorithm 13: { P, encryptMetadata } or null when /Perms does not decrypt to 'adb'
 *   toP(perms) fromP(P) PERMS       permission flags (Table 22) and the 32-bit /P value
 *   random(n)                      n random bytes */
(function (root, factory) {
  var C = typeof module === 'object' && module.exports ? require('./legacy.js') : root.SlopPdfCrypto;
  var api = factory(C);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SlopPdfCrypto = Object.assign(root.SlopPdfCrypto || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  'use strict';
  var concat = C.concat, eq = C.eq;

  function err(code, msg) { var e = new Error(msg); e.code = code; return e; }
  // Messages a person reads, in the chosen language (shared/i18n/ui/<code>/print.js); the key where no table is loaded.
  var say = function (k, v) { var I = globalThis.SlopI18n; return I && I.t ? I.t(k, v) : k; };
  function subtle() {
    var c = globalThis.crypto;
    if (!c || !c.subtle) throw err('unsupported', say('ui.pdfc.no_webcrypto'));
    return c.subtle;
  }
  function random(n) { var b = new Uint8Array(n); globalThis.crypto.getRandomValues(b); return b; }

  function importAes(key) { return subtle().importKey('raw', key, { name: 'AES-CBC' }, false, ['encrypt', 'decrypt']); }
  /* CBC-decrypt without padding checks: append one crafted block that decrypts to a full PKCS#7 padding block, so WebCrypto
     strips exactly that block and returns the raw plaintext. */
  async function aesCbcRaw(cryptoKey, iv, data) {
    if (!data.length) return new Uint8Array(0);
    var last = data.subarray(data.length - 16), x = new Uint8Array(16);
    for (var i = 0; i < 16; i++) x[i] = last[i] ^ 16;
    var enc = new Uint8Array(await subtle().encrypt({ name: 'AES-CBC', iv: new Uint8Array(16) }, cryptoKey, x));
    return new Uint8Array(await subtle().decrypt({ name: 'AES-CBC', iv: iv }, cryptoKey, concat(data, enc.subarray(0, 16))));
  }
  /* CBC-encrypt without padding (data a multiple of 16 bytes): WebCrypto adds one padding block at the end; drop it. */
  async function aesEncryptRaw(cryptoKey, iv, data) {
    var full = new Uint8Array(await subtle().encrypt({ name: 'AES-CBC', iv: iv }, cryptoKey, data));
    return full.slice(0, data.length);
  }
  async function aesDecryptPdf(cryptoKey, data) {
    if (data.length < 32) return new Uint8Array(0);
    var iv = data.slice(0, 16), body = data.subarray(16, 16 + Math.floor((data.length - 16) / 16) * 16);
    var raw = await aesCbcRaw(cryptoKey, iv, body);
    var pad = raw[raw.length - 1];
    if (pad >= 1 && pad <= 16 && pad <= raw.length) {
      var ok = true; for (var i = raw.length - pad; i < raw.length; i++) if (raw[i] !== pad) { ok = false; break; }
      if (ok) return raw.slice(0, raw.length - pad);
    }
    return raw;
  }
  async function aesEncryptPdf(cryptoKey, data, iv) {
    iv = iv || random(16);
    return concat(iv, new Uint8Array(await subtle().encrypt({ name: 'AES-CBC', iv: iv }, cryptoKey, data)));
  }
  async function sha(name, data) { return new Uint8Array(await subtle().digest(name, data)); }

  function pwBytes(password) {
    var s = String(password == null ? '' : password);
    return new TextEncoder().encode(s.normalize ? s.normalize('NFKC') : s).subarray(0, 127);
  }

  /* Algorithm 2.B. udata: the 48-byte /U when hashing an owner password, else empty. */
  async function hashR6(pw, salt, udata, R) {
    var k = await sha('SHA-256', concat(pw, salt, udata));
    if (R === 5) return k;
    var i = 0, e = null;
    while (i < 64 || e[e.length - 1] > i - 32) {
      var unit = concat(pw, k, udata), k1 = new Uint8Array(unit.length * 64);
      for (var j = 0; j < 64; j++) k1.set(unit, j * unit.length);
      e = await aesEncryptRaw(await importAes(k.slice(0, 16)), k.slice(16, 32), k1);
      var sum = 0; for (var q = 0; q < 16; q++) sum += e[q];   // the first 16 bytes as a big number, mod 3 (256 ≡ 1 mod 3)
      var m = sum % 3;
      k = await sha(m === 0 ? 'SHA-256' : m === 1 ? 'SHA-384' : 'SHA-512', e);
      i++;
    }
    return k.slice(0, 32);
  }

  /* Algorithm 2.A: the owner password first (Algorithm 12), then the user password (Algorithm 11). */
  async function keyR6(password, enc) {
    var pw = pwBytes(password), R = enc.R;
    var U = enc.U.subarray(0, 48), O = enc.O.subarray(0, 48), zero = new Uint8Array(16);
    if (eq(await hashR6(pw, O.subarray(32, 40), U, R), O, 32)) {
      var ok = await hashR6(pw, O.subarray(40, 48), U, R);
      return { key: await aesCbcRaw(await importAes(ok), zero, enc.OE.subarray(0, 32)), owner: true };
    }
    if (eq(await hashR6(pw, U.subarray(32, 40), new Uint8Array(0), R), U, 32)) {
      var ik = await hashR6(pw, U.subarray(40, 48), new Uint8Array(0), R);
      return { key: await aesCbcRaw(await importAes(ik), zero, enc.UE.subarray(0, 32)), owner: false };
    }
    return null;
  }

  /* Table 22: bit numbers (1 = lowest) of the user access permissions. */
  var PERMS = { print: 3, modify: 4, copy: 5, annotate: 6, fillForms: 9, accessibility: 10, assemble: 11, printHigh: 12 };
  /** perms: { print, modify, copy, annotate, fillForms, accessibility, assemble, printHigh }, each allowed unless false.
   *  printHigh follows print and assemble follows modify when not given. Bits 7, 8 and 13 to 32 are 1, bits 1 and 2 are 0. */
  function toP(perms) {
    perms = perms || {};
    var allow = function (k, dflt) { return perms[k] === undefined ? dflt : !!perms[k]; };
    var on = { print: allow('print', true), modify: allow('modify', true), copy: allow('copy', true), annotate: allow('annotate', true),
      fillForms: allow('fillForms', true), accessibility: allow('accessibility', true) };
    on.assemble = allow('assemble', on.modify); on.printHigh = allow('printHigh', on.print);
    var p = 0xFFFFF0C0;
    for (var k in PERMS) if (on[k]) p |= 1 << (PERMS[k] - 1);
    return p | 0;
  }
  function fromP(P) { var o = {}; for (var k in PERMS) o[k] = !!(P & (1 << (PERMS[k] - 1))); return o; }

  /* Algorithms 8 (U, UE), 9 (O, OE) and 10 (Perms). random(n): bytes source (tests pass a fixed one). */
  async function makeR6(opts) {
    var rnd = opts.random || random;
    var upw = pwBytes(opts.userPassword), opw = pwBytes(opts.ownerPassword);
    var fileKey = opts.fileKey || rnd(32), zero = new Uint8Array(16), none = new Uint8Array(0);
    var uvs = rnd(8), uks = rnd(8);
    var U = concat(await hashR6(upw, uvs, none, 6), uvs, uks);
    var UE = await aesEncryptRaw(await importAes(await hashR6(upw, uks, none, 6)), zero, fileKey);
    var ovs = rnd(8), oks = rnd(8);
    var O = concat(await hashR6(opw, ovs, U, 6), ovs, oks);
    var OE = await aesEncryptRaw(await importAes(await hashR6(opw, oks, U, 6)), zero, fileKey);
    var P = opts.P | 0, blk = new Uint8Array(16);
    for (var i = 0; i < 4; i++) blk[i] = (P >>> (8 * i)) & 255;
    for (i = 4; i < 8; i++) blk[i] = 255;
    blk[8] = opts.encryptMetadata === false ? 0x46 : 0x54;   // 'F' or 'T'
    blk[9] = 0x61; blk[10] = 0x64; blk[11] = 0x62;            // 'adb'
    blk.set(rnd(4), 12);
    var Perms = await aesEncryptRaw(await importAes(fileKey), zero, blk);   // one block: CBC with a zero IV is ECB
    return { fileKey: fileKey, U: U, UE: UE, O: O, OE: OE, Perms: Perms, P: P };
  }

  async function readPerms(fileKey, Perms) {
    if (!Perms || Perms.length < 16) return null;
    var b = await aesCbcRaw(await importAes(fileKey), new Uint8Array(16), Perms.subarray(0, 16));
    if (b[9] !== 0x61 || b[10] !== 0x64 || b[11] !== 0x62) return null;
    return { P: (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) | 0, encryptMetadata: b[8] !== 0x46 };
  }

  return { err: err, random: random, importAes: importAes, aesCbcRaw: aesCbcRaw, aesEncryptRaw: aesEncryptRaw, aesDecryptPdf: aesDecryptPdf,
    aesEncryptPdf: aesEncryptPdf, sha: sha, pwBytes: pwBytes, hashR6: hashR6, keyR6: keyR6, makeR6: makeR6, readPerms: readPerms,
    PERMS: PERMS, toP: toP, fromP: fromP };
});
