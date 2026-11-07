/* SlopPdfCrypto, part 5 of 5: adding a password to a PDF with the Standard security handler, AES-256 (ISO 32000-2, V 5,
 * R 6, crypt filter AESV3 for strings and streams). pdf-lib writes PDFs but cannot encrypt, so this works on pdf-lib's parsed
 * objects: the file is parsed (object streams expanded), every string and stream of every indirect object is encrypted with
 * the file key (a fresh random IV each), the /Encrypt dictionary is added (itself not encrypted) and the file is written
 * again with a classic cross-reference table (no object or XRef streams, so nothing needs the per-member rules).
 * A file that already has a password is decrypted first with opts.currentPassword (or the empty password).
 * Needs legacy.js, aes256.js, security.js, decrypt.js and pdf-lib. Classic script: window.SlopPdfCrypto, module.exports.
 *   encryptPdf(bytes, opts) -> Promise<Uint8Array>
 *     opts.userPassword     to open the file ('' = anyone may open it; the permissions still apply in readers)
 *     opts.ownerPassword    to change the permissions or remove them; blank = 32 random characters nobody knows
 *     opts.permissions      { print, copy, modify, annotate, fillForms, accessibility, assemble, printHigh }: false forbids
 *     opts.encryptMetadata  default true (the XMP metadata stream is encrypted too)
 *     opts.currentPassword  the password of a file that is already protected
 *     opts.PDFLib, opts.random(n)   pdf-lib (default: the global) and a bytes source (tests pass a fixed one) */
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var C = node ? Object.assign({}, require('./legacy.js'), require('./aes256.js'), require('./security.js'), require('./decrypt.js')) : root.SlopPdfCrypto;
  var api = factory(C, root);
  if (node) module.exports = api;
  else root.SlopPdfCrypto = Object.assign(root.SlopPdfCrypto || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C, root) {
  'use strict';
  var err = C.err;
  // Messages a person reads, in the chosen language (shared/i18n/ui/<code>/print.js); the key where no table is loaded.
  var say = function (k, v) { var I = globalThis.SlopI18n; return I && I.t ? I.t(k, v) : k; };

  function randomPassword(rnd) {
    var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789', b = rnd(32), s = '';
    for (var i = 0; i < b.length; i++) s += abc[b[i] % abc.length];
    return s;
  }

  /* AES-256 is PDF 2.0, or PDF 1.7 with Adobe's extension level 8; the 1.7 form keeps older readers happy (as Acrobat and qpdf do). */
  function markVersion(L, ctx) {
    var m = /%PDF-(\d+)\.(\d+)/.exec(ctx.header.toString()), major = m ? +m[1] : 1, minor = m ? +m[2] : 7;
    if (major >= 2) return;
    if (minor < 7) ctx.header = L.PDFHeader.forVersion(1, 7);
    var cat = ctx.lookup(ctx.trailerInfo.Root);
    if (!(cat instanceof L.PDFDict)) throw err('unsupported', say('ui.pdfc.no_catalog'));
    var ext = cat.lookup(L.PDFName.of('Extensions'));
    if (!(ext instanceof L.PDFDict)) { ext = ctx.obj({}); cat.set(L.PDFName.of('Extensions'), ext); }
    ext.set(L.PDFName.of('ADBE'), ctx.obj({ BaseVersion: '1.7', ExtensionLevel: 8 }));
  }

  async function encryptPdf(bytes, opts) {
    opts = opts || {};
    var L = opts.PDFLib || root.PDFLib;
    if (!L) throw err('unsupported', 'pdf-lib is not loaded.');
    var rnd = opts.random || C.random;
    rnd(1);   // fails early without WebCrypto
    if (C.isEncrypted(bytes)) {
      var plain = await C.decryptPdf(bytes, opts.currentPassword || '', { PDFLib: L, useObjectStreams: false });
      if (plain) bytes = plain;
    }
    var ctx = (await C.parseRaw(L, bytes, true)).ctx;
    if (!ctx.trailerInfo.Root || !(ctx.lookup(ctx.trailerInfo.Root) instanceof L.PDFDict)) throw err('unsupported', say('ui.pdfc.not_pdf'));
    var info = ctx.trailerInfo.Info;
    if (info instanceof L.PDFDict) ctx.trailerInfo.Info = ctx.register(info);   // strings of a direct Info would have no object number
    markVersion(L, ctx);

    var P = C.toP(opts.permissions);
    var sec = await C.makeR6({ userPassword: opts.userPassword || '', ownerPassword: opts.ownerPassword || randomPassword(rnd), P: P,
      encryptMetadata: opts.encryptMetadata !== false, random: rnd });
    var enc = { R: 6 }, cip = C.cipher(enc, sec.fileKey);
    var str = function (b) { return cip.encrypt(b, null, 'AESV3', rnd(16)); };
    var all = ctx.enumerateIndirectObjects();
    for (var a = 0; a < all.length; a++) {
      var ref = all[a][0], obj = all[a][1];
      if (obj instanceof L.PDFStream) {
        var t = obj.dict.lookup(L.PDFName.of('Type')), tn = t && t.asString ? t.asString() : '';
        if (tn === '/XRef' || tn === '/ObjStm') { ctx.delete(ref); continue; }   // written again as a table; members already expanded
        var contents = obj.getContents();
        await C.mapStrings(L, obj.dict, str);
        var out = (tn === '/Metadata' && opts.encryptMetadata === false) ? contents : await cip.encrypt(contents, ref, 'AESV3', rnd(16));
        if (!(obj instanceof L.PDFRawStream)) ctx.assign(ref, L.PDFRawStream.of(obj.dict, out));
        else obj.contents = out;
      } else {
        await C.mapStrings(L, obj, str);
      }
    }

    var hex = function (b) { return L.PDFHexString.of(C.toHex(b)); };
    var encDict = ctx.obj({ Filter: 'Standard', V: 5, R: 6, Length: 256, P: P,
      CF: { StdCF: { AuthEvent: 'DocOpen', CFM: 'AESV3', Length: 32 } }, StmF: 'StdCF', StrF: 'StdCF' });
    encDict.set(L.PDFName.of('O'), hex(sec.O)); encDict.set(L.PDFName.of('U'), hex(sec.U));
    encDict.set(L.PDFName.of('OE'), hex(sec.OE)); encDict.set(L.PDFName.of('UE'), hex(sec.UE));
    encDict.set(L.PDFName.of('Perms'), hex(sec.Perms));
    if (opts.encryptMetadata === false) encDict.set(L.PDFName.of('EncryptMetadata'), L.PDFBool.False);
    ctx.trailerInfo.Encrypt = ctx.register(encDict);
    var id = ctx.trailerInfo.ID && ctx.lookup(ctx.trailerInfo.ID);
    if (!(id instanceof L.PDFArray) || id.size() < 2) { var x = C.toHex(rnd(16)); id = ctx.obj([L.PDFHexString.of(x), L.PDFHexString.of(x)]); }
    ctx.trailerInfo.ID = id;   // a direct array in the trailer: never encrypted
    return L.PDFWriter.forContext(ctx, 50).serializeToBuffer();
  }

  return { encryptPdf: encryptPdf };
});
