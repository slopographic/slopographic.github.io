/* Slop PDF — SP.decrypt: a thin shim onto the site's one PDF security handler (shared/pdf-crypto/, window.SlopPdfCrypto).
   pdf.js renders encrypted files by itself, but pdf-lib cannot read them, so core/pdfjs.js removes the encryption with
   the password the user typed (or the empty password of an owner-restricted file); ui/protect.js adds a password on
   download. The crypto code is not part of the first view: load() fetches it from <template id="pdf-crypto"> in
   index.html (shared/load) when a protected file is opened or a protected download is asked for. The offline copy runs
   it at boot. Runs locally; no password is kept here.
     load() -> Promise<SlopPdfCrypto>
     isEncrypted(bytes) -> boolean               a cheap scan for /Encrypt (needs load() first; false before it)
     decryptPdf(bytes, password) -> Promise<Uint8Array | null>   null: not encrypted; errors .code 'password' | 'unsupported'
     inspect(bytes) -> Promise<{ encrypted, R, V, method, bits, P, permissions, needsPassword }>
     describe(bytes, password) -> Promise<inspect() + { owner }>   owner: the password given was the owner password
     encryptPdf(bytes, opts) -> Promise<Uint8Array>                SlopPdfCrypto.encryptPdf */
(function () {
  'use strict';
  var SP = window.SP = window.SP || {};
  var PARTS = ['legacy', 'aes256', 'security', 'decrypt', 'encrypt'];
  var SELF = (document.currentScript && document.currentScript.src) || '';
  var readyP = null;
  /** The chosen language's text for a key (this file may run before core/util.js). */
  function tr(k, en, v) { var I = window.SlopI18n; if (I && I.has && I.has(k)) return I.t(k, v); return String(en).replace(/\{(\w+)\}/g, function (m, n) { return v && n in v ? String(v[n]) : m; }); }
  function C() { var c = window.SlopPdfCrypto; return c && c.encryptPdf ? c : null; }
  /** The script URLs, from the template (so the precache and the offline build see them) or beside this file. */
  function urls() {
    var t = document.getElementById('pdf-crypto'), tags = t && t.content ? t.content.querySelectorAll('script[src]') : [];
    if (tags.length) return Array.prototype.map.call(tags, function (s) { return new URL(s.getAttribute('src'), document.baseURI).href; });
    return PARTS.map(function (p) { return new URL('../../../shared/pdf-crypto/' + p + '.js', SELF || document.baseURI).href; });
  }
  function one(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src; s.async = false;
      s.onload = res; s.onerror = function () { s.remove(); rej(new Error(tr('pdf.io.crypto_load_failed', 'Could not load the PDF password code.'))); };
      document.head.append(s);
    });
  }
  function load() {
    if (C()) return Promise.resolve(C());
    if (!readyP) {
      var list = urls();
      readyP = (window.SlopLoad ? SlopLoad.scripts(list) : Promise.all(list.map(one))).then(function () {
        if (!C()) throw new Error(tr('pdf.io.crypto_not_loaded', 'The PDF password code did not load.'));
        return C();
      });
      readyP.catch(function () { readyP = null; });
    }
    return readyP;
  }
  /** What the file's security handler allows, and whether `password` opened it as its owner. Never keeps the password. */
  async function describe(bytes, password) {
    var c = await load(), info = await c.inspect(bytes);
    if (!info.encrypted) return info;
    var owner = false;
    try {
      var L = window.PDFLib, enc = c.readEncrypt(L, (await c.parseRaw(L, bytes)).ctx), k = enc && await c.fileKey(enc, password || '');
      owner = !!(k && k.owner);
    } catch (e) { /* the handler was read above; owner stays false */ }
    info.owner = owner;
    return info;
  }
  SP.decrypt = {
    load: load,
    isEncrypted: function (bytes) { return C() ? C().isEncrypted(bytes) : false; },
    decryptPdf: function (bytes, pw) { return load().then(function (c) { return c.decryptPdf(bytes, pw || ''); }); },
    inspect: function (bytes) { return load().then(function (c) { return c.inspect(bytes); }); },
    describe: describe,
    encryptPdf: function (bytes, opts) { return load().then(function (c) { return c.encryptPdf(bytes, opts); }); }
  };
})();
