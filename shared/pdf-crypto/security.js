/* SlopPdfCrypto, part 3 of 5: the Standard security handler of a parsed PDF (pdf-lib's context): its /Encrypt dictionary,
 * the file key a password gives (every revision: RC4 40 and 128, AES-128, AES-256 R5 and R6), and the cipher of each
 * object. Needs legacy.js and aes256.js first, and pdf-lib (passed in as L). Classic script: window.SlopPdfCrypto, Node too.
 *   parseRaw(L, bytes, plain) -> { ctx, objStms }   pdf-lib's parse, with object streams held back unparsed (their bytes
 *                                            are encrypted as a whole, so they are expanded only after decryption); plain: a
 *                                            file with no encryption, parsed as pdf-lib does (object streams expanded)
 *   expandObjStms(L, objStms, decrypt)        decrypt(raw, ref) -> plain bytes; parses each into the context
 *   readEncrypt(L, ctx) -> enc | null         { ref, dict, V, R, P, O, U, OE, UE, Perms, keyLen, encryptMetadata, stm, str, id0 }
 *   fileKey(enc, password) -> { key, owner } | null
 *   cipher(enc, key) -> { decrypt(bytes, ref, method), encrypt(bytes, ref, method) }   method: 'V2' | 'AESV2' | 'AESV3' | 'Identity' */
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var C = node ? Object.assign({}, require('./legacy.js'), require('./aes256.js')) : root.SlopPdfCrypto;
  var api = factory(C);
  if (node) module.exports = api;
  else root.SlopPdfCrypto = Object.assign(root.SlopPdfCrypto || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  'use strict';
  var err = C.err;
  // Messages a person reads, in the chosen language (shared/i18n/ui/<code>/print.js); the key where no table is loaded.
  var say = function (k, v) { var I = globalThis.SlopI18n; return I && I.t ? I.t(k, v) : k; };

  /* pdf-lib parses object streams as it meets them; an encrypted one would give garbage, so its parser is swapped for one
     that keeps the raw stream and its reference. The swap is global, so parses run one at a time (queue). */
  var queue = Promise.resolve();
  function parseRaw(L, bytes, plain) {
    var run = queue.then(async function () {
      if (plain) return { ctx: await L.PDFParser.forBytesWithOptions(bytes, Infinity, false, false).parseDocument(), objStms: [] };
      var OSP = L.PDFObjectStreamParser, PP = L.PDFParser.prototype;
      var origFor = OSP.forStream, origHeader = PP.parseIndirectObjectHeader, lastRef = null, objStms = [];
      PP.parseIndirectObjectHeader = function () { var r = origHeader.call(this); lastRef = r; return r; };
      OSP.forStream = function (raw) { objStms.push({ ref: lastRef, raw: raw }); return { parseIntoContext: function () { return Promise.resolve(); } }; };
      try {
        var ctx = await L.PDFParser.forBytesWithOptions(bytes, Infinity, false, false).parseDocument();
        return { ctx: ctx, objStms: objStms };
      } finally { OSP.forStream = origFor; PP.parseIndirectObjectHeader = origHeader; }
    });
    queue = run.catch(function () { /* keep the queue alive */ });
    return run;
  }

  async function expandObjStms(L, objStms, decrypt) {
    for (var s = 0; s < objStms.length; s++) {
      var os = objStms[s], plain = await decrypt(os.raw.contents, os.ref);
      try { await L.PDFObjectStreamParser.forStream(L.PDFRawStream.of(os.raw.dict, plain)).parseIntoContext(); }
      catch (e) { if (typeof console !== 'undefined') console.warn('SlopPdfCrypto: skipped a damaged object stream', e); }
    }
  }

  function readEncrypt(L, ctx) {
    var ref = ctx.trailerInfo.Encrypt, dict = ref ? ctx.lookup(ref) : null;
    if (!dict || !(dict instanceof L.PDFDict)) return null;
    var N = function (k) { return L.PDFName.of(k); };
    var num = function (k, d) { var v = dict.lookup(N(k)); return v instanceof L.PDFNumber ? v.asNumber() : d; };
    var str = function (k) { var v = dict.lookup(N(k)); return v && v.asBytes ? v.asBytes() : null; };
    var filter = dict.lookup(N('Filter'));
    if (!filter || filter.asString() !== '/Standard') throw err('unsupported', filter ? say('ui.pdfc.handler', { name: filter.asString() }) : say('ui.pdfc.handler_none'));
    var enc = { ref: ref, dict: dict, V: num('V', 0), R: num('R', 2), P: num('P', 0), O: str('O'), U: str('U'), OE: str('OE'), UE: str('UE'), Perms: str('Perms'),
      keyLen: num('Length', 40) / 8, encryptMetadata: true, stm: 'V2', str: 'V2', id0: new Uint8Array(0) };
    var em = dict.lookup(N('EncryptMetadata'));
    if (em && em.asBoolean && em.asBoolean() === false) enc.encryptMetadata = false;
    if (enc.V >= 4) {
      var cf = dict.lookup(N('CF')), stmF = dict.lookup(N('StmF')), strF = dict.lookup(N('StrF'));
      var method = function (nm) {
        if (!nm) return 'Identity';
        var name = nm.asString().slice(1);
        if (name === 'Identity') return 'Identity';
        var d = cf && cf.lookup(N(name)), cfm = d && d.lookup(N('CFM'));
        var m = cfm ? cfm.asString().slice(1) : 'None';
        if (m === 'AESV2' || m === 'AESV3' || m === 'V2') return m;
        if (m === 'None') return 'Identity';
        throw err('unsupported', say('ui.pdfc.filter', { name: String(m) }));
      };
      enc.stm = method(stmF); enc.str = method(strF);
      if (enc.V === 4) {
        var cfd = cf && stmF && cf.lookup(N(stmF.asString().slice(1))), ln = cfd && cfd.lookup(N('Length'));
        if (ln) { var lv = ln.asNumber(); enc.keyLen = lv > 40 ? lv / 8 : lv; }
        if (!enc.keyLen || enc.keyLen < 5) enc.keyLen = 16;
      }
    }
    if (!enc.O || !enc.U) throw err('unsupported', say('ui.pdfc.dict_damaged'));
    if (enc.R >= 5 && (!enc.UE || !enc.OE)) throw err('unsupported', say('ui.pdfc.dict_incomplete'));
    var idArr = ctx.trailerInfo.ID ? ctx.lookup(ctx.trailerInfo.ID) : null;
    if (idArr && idArr.size && idArr.size() > 0) { var first = idArr.lookup(0); if (first && first.asBytes) enc.id0 = first.asBytes(); }
    return enc;
  }

  async function fileKey(enc, password) {
    if (enc.R >= 5) return C.keyR6(password || '', enc);
    var pw = C.latin1(password || '');
    var k1 = C.keyR4(C.padPw(pw), enc, enc.id0);
    if (C.checkUserR4(k1, enc, enc.id0)) return { key: k1, owner: false };
    var k2 = C.keyR4(C.ownerToUserR4(pw, enc), enc, enc.id0);
    if (C.checkUserR4(k2, enc, enc.id0)) return { key: k2, owner: true };
    return null;
  }

  /* Algorithm 1 (R2 to R4): a key per object from the file key, the object and generation numbers ('sAlT' for AES).
     Revisions 5 and 6 use the file key itself for every object (Algorithm 1.A). */
  function cipher(enc, key) {
    var cache = new Map();
    async function objKey(ref, aes) {
      if (enc.R >= 5) { if (!cache.has('v5')) cache.set('v5', await C.importAes(key)); return cache.get('v5'); }
      var n = ref.objectNumber, g = ref.generationNumber;
      var extra = new Uint8Array([n & 255, (n >> 8) & 255, (n >> 16) & 255, g & 255, (g >> 8) & 255]);
      var k = C.md5(aes ? C.concat(key, extra, C.latin1('sAlT')) : C.concat(key, extra)).slice(0, Math.min(key.length + 5, 16));
      return aes ? C.importAes(k) : k;
    }
    return {
      decrypt: async function (data, ref, method) {
        if (method === 'Identity') return data;
        if (method === 'V2') return C.rc4(await objKey(ref, false), data);
        return C.aesDecryptPdf(await objKey(ref, true), data);
      },
      encrypt: async function (data, ref, method, iv) {
        if (method === 'Identity') return data;
        if (method === 'V2') return C.rc4(await objKey(ref, false), data);
        return C.aesEncryptPdf(await objKey(ref, true), data, iv);
      },
    };
  }

  return { parseRaw: parseRaw, expandObjStms: expandObjStms, readEncrypt: readEncrypt, fileKey: fileKey, cipher: cipher };
});
