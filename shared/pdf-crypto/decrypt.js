/* SlopPdfCrypto, part 4 of 5: removing a PDF's password. Every string and stream is decrypted with the file key the password
 * gives (the user password, the owner password, or the empty password of a file that opens without one but limits printing
 * or copying), the /Encrypt dictionary is dropped, and plain PDF bytes come back. Also reads what a file's protection is.
 * Was pdf/js/io/decrypt.js; Slop PDF and File convert both call this one. Needs legacy.js, aes256.js, security.js, pdf-lib.
 * Classic script: window.SlopPdfCrypto, and module.exports for Node. opts.PDFLib: pdf-lib (default: the global PDFLib).
 *   isEncrypted(bytes) -> boolean                 a cheap scan for /Encrypt (decryptPdf checks with a real parse)
 *   decryptPdf(bytes, password, opts) -> Promise<Uint8Array | null>   null: the file is not encrypted. Throws Error with
 *        .code 'password' (wrong password) or 'unsupported' (a certificate handler, no WebCrypto, a damaged dictionary).
 *        opts.useObjectStreams (default true): how the plain file is saved
 *   inspect(bytes, opts) -> Promise<{ encrypted, R, V, method, bits, P, permissions, needsPassword }>
 *        needsPassword: the file does not open with the empty password; permissions: fromP(P) (aes256.js)
 *   mapStrings(L, obj, fn) -> obj                  replaces every string inside obj (arrays, dictionaries) by fn(bytes);
 *        the /Contents of a signature dictionary is left alone, as the standard says */
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var C = node ? Object.assign({}, require('./legacy.js'), require('./aes256.js'), require('./security.js')) : root.SlopPdfCrypto;
  var api = factory(C, root);
  if (node) module.exports = api;
  else root.SlopPdfCrypto = Object.assign(root.SlopPdfCrypto || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C, root) {
  'use strict';
  var err = C.err;
  // Messages a person reads, in the chosen language (shared/i18n/ui/<code>/print.js); the key where no table is loaded.
  var say = function (k, v) { var I = globalThis.SlopI18n; return I && I.t ? I.t(k, v) : k; };
  var lib = function (opts) { var L = (opts && opts.PDFLib) || root.PDFLib; if (!L) throw err('unsupported', 'pdf-lib is not loaded.'); return L; };

  function isEncrypted(bytes) {
    var pat = [47, 69, 110, 99, 114, 121, 112, 116];   // '/Encrypt'
    outer: for (var i = 0; i + pat.length <= bytes.length; i++) {
      for (var j = 0; j < pat.length; j++) if (bytes[i + j] !== pat[j]) continue outer;
      return true;
    }
    return false;
  }

  function isSignature(L, d) {
    var t = d.lookup(L.PDFName.of('Type')), tn = t && t.asString ? t.asString() : '';
    return !!d.lookup(L.PDFName.of('ByteRange')) && (tn === '/Sig' || tn === '/DocTimeStamp' || !tn) && !!d.get(L.PDFName.of('Contents'));
  }
  async function mapStrings(L, obj, fn) {
    if (obj instanceof L.PDFString || obj instanceof L.PDFHexString) return L.PDFHexString.of(C.toHex(await fn(obj.asBytes())));
    if (obj instanceof L.PDFArray) {
      for (var i = 0; i < obj.size(); i++) { var v = obj.get(i), nv = await mapStrings(L, v, fn); if (nv !== v) obj.set(i, nv); }
      return obj;
    }
    if (obj instanceof L.PDFDict) {
      var sig = isSignature(L, obj), ents = obj.entries();
      for (var j = 0; j < ents.length; j++) {
        if (sig && ents[j][0].asString() === '/Contents') continue;
        var w = await mapStrings(L, ents[j][1], fn);
        if (w !== ents[j][1]) obj.set(ents[j][0], w);
      }
      return obj;
    }
    return obj;
  }
  var typeOf = function (L, stream) { var t = stream.dict.lookup(L.PDFName.of('Type')); return t && t.asString ? t.asString() : ''; };

  async function decryptPdf(bytes, password, opts) {
    var L = lib(opts);
    C.random(1);   // fails early without WebCrypto
    var parsed = await C.parseRaw(L, bytes), ctx = parsed.ctx;
    var enc = C.readEncrypt(L, ctx);
    if (!enc) return null;
    var fk = await C.fileKey(enc, password || '');
    if (!fk) throw err('password', say('ui.pdfc.wrong_password'));
    var cip = C.cipher(enc, fk.key);
    var all = ctx.enumerateIndirectObjects();
    for (var a = 0; a < all.length; a++) {
      var ref = all[a][0], obj = all[a][1];
      if (ref === enc.ref || obj === enc.dict) continue;
      var dec = function (r) { return function (b) { return cip.decrypt(b, r, enc.str); }; }(ref);
      if (obj instanceof L.PDFRawStream) {
        var tn = typeOf(L, obj);
        if (tn === '/XRef') continue;
        await mapStrings(L, obj.dict, dec);
        if (!(tn === '/Metadata' && !enc.encryptMetadata)) obj.contents = await cip.decrypt(obj.contents, ref, enc.stm);
      } else {
        await mapStrings(L, obj, dec);
      }
    }
    // Object streams: decrypted as a whole, then expanded (their members are not encrypted one by one).
    await C.expandObjStms(L, parsed.objStms, function (b, r) { return cip.decrypt(b, r, enc.stm); });
    ctx.trailerInfo.Encrypt = undefined;
    ctx.delete(enc.ref);
    var doc = new L.PDFDocument(ctx, true, false);
    if (!doc.getPageCount()) throw err('unsupported', say('ui.pdfc.no_pages'));
    var objStreams = !opts || opts.useObjectStreams !== false;
    return doc.save({ useObjectStreams: objStreams, addDefaultPage: false, updateFieldAppearances: false });
  }

  async function inspect(bytes, opts) {
    var L = lib(opts);
    if (!isEncrypted(bytes)) return { encrypted: false };
    var enc = C.readEncrypt(L, (await C.parseRaw(L, bytes)).ctx);
    if (!enc) return { encrypted: false };
    var method = enc.V >= 4 ? enc.stm : 'V2';
    var bits = enc.R >= 5 ? 256 : method === 'AESV2' ? 128 : enc.keyLen * 8;
    var open = await C.fileKey(enc, '').catch(function () { return null; });
    return { encrypted: true, R: enc.R, V: enc.V, method: method === 'V2' ? 'RC4' : method, bits: bits, P: enc.P | 0,
      permissions: C.fromP(enc.P | 0), needsPassword: !open };
  }

  return { isEncrypted: isEncrypted, decryptPdf: decryptPdf, inspect: inspect, mapStrings: mapStrings };
});
