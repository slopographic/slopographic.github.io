/* Slop PDF — pdf.js loading, opening (with password prompts), source-file registry and the thumbnail render queue. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine;

  /* ------------------------------------------------------------------ pdf.js */
  var libP = null;
  // Resolve vendor/ relative to this script (pdf/js/core/pdfjs.js), so tests and other pages can load it too.
  var SCRIPT_SRC = (document.currentScript && document.currentScript.src) || '';
  E.vendorBase = function () { return SP.vendorBase || new URL(SCRIPT_SRC ? '../../../vendor/pdfjs/' : '../vendor/pdfjs/', SCRIPT_SRC || document.baseURI).href; };
  E.pdfjs = function () {
    if (!libP) {
      libP = (async function () {
        if (window.pdfjsLib) return window.pdfjsLib; // offline single-file build injects it
        var base = E.vendorBase();
        var lib = await import(new URL('../../shared/compat/pdfjs.js', base).href).then(function (m) { return m.loadPdfjs(base); });
        window.pdfjsLib = lib;
        return lib;
      })();
      libP.catch(function () { libP = null; });
    }
    return libP;
  };
  /** pdf-lib (the writer), loaded on first use from <template id="pdf-engine"> in index.html (shared/load), or beside
   *  pdf.js where a page has no such template. Resolves window.PDFLib. The offline copy has it already. */
  var writerP = null;
  E.pdflib = function () {
    if (window.PDFLib) return Promise.resolve(window.PDFLib);
    if (!writerP) {
      var t = document.getElementById('pdf-engine'), tag = t && t.content && t.content.querySelector('script[src]');
      var src = tag ? new URL(tag.getAttribute('src'), document.baseURI).href : new URL('../pdf-lib/pdf-lib.min.js', E.vendorBase()).href;
      writerP = (window.SlopLoad ? SlopLoad.script(src) : new Promise(function (res, rej) {
        var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.append(s);
      })).then(function () { if (!window.PDFLib) throw new Error(U.t('pdf.core.writer_missing')); return window.PDFLib; });
      writerP.catch(function () { writerP = null; });
    }
    return writerP;
  };
  /** Both PDF libraries and the standard fonts: what an open document needs. Every way a document opens waits for it. */
  E.libs = function () { return Promise.all([E.pdflib(), E.pdfjs()]).then(function () { return E.initFonts(); }); };
  E.docParams = function (data, password) {
    var p = { data: data, isEvalSupported: false, enableXfa: false, useSystemFonts: true, verbosity: 0 };
    if (password != null) p.password = password;
    if (SP.offline) {
      p.useWorkerFetch = false;
      if (SP.offline.FontFactory) p.StandardFontDataFactory = SP.offline.FontFactory;
    } else {
      var base = E.vendorBase();
      p.cMapUrl = base + 'cmaps/'; p.cMapPacked = true; p.standardFontDataUrl = base + 'standard_fonts/';
    }
    return p;
  };
  /** Opens bytes with pdf.js. askPassword(name, wrong) → Promise<string|null>. Resolves {doc, password}. */
  E.openPdfjs = function (bytes, name, askPassword) {
    return E.pdfjs().then(function (lib) {
      return new Promise(function (resolve, reject) {
        var last = '', task = lib.getDocument(E.docParams(bytes.slice()));
        task.onPassword = function (update, reason) {
          if (!askPassword) { var e0 = new Error(U.t('pdf.core.needs_password')); e0.code = 'password'; task.destroy(); reject(e0); return; }
          askPassword(name, reason === lib.PasswordResponses.INCORRECT_PASSWORD).then(function (pw) {
            if (pw == null) { var e = new Error('Password entry cancelled.'); e.code = 'cancelled'; task.destroy(); reject(e); return; }
            last = pw; update(pw);
          });
        };
        task.promise.then(function (doc) { resolve({ doc: doc, password: last }); }, reject);
      });
    });
  };
  E.friendlyError = function (e, name) {
    var n = e && e.name, msg = (e && e.message) || String(e);
    if (e && e.code === 'cancelled') return null;
    if (n === 'InvalidPDFException') return U.t('pdf.core.err_invalid', { name: name });
    if (n === 'MissingPDFException') return U.t('pdf.core.err_empty', { name: name });
    if (n === 'PasswordException') return U.t('pdf.core.err_password', { name: name });
    return U.t('pdf.core.err_open', { name: name, msg: msg });
  };

  /* --------------------------------------------------------------- files */
  /** Registers PDF bytes as a source file. Decrypts protected PDFs so they can be rewritten. */
  E.registerPdf = async function (bytes, name, askPassword, opts) {
    opts = opts || {};
    await E.libs();
    var fp = await SP.editLog.fingerprint(bytes); // SHA-256 of the original bytes (null when unavailable)
    var r = await E.openPdfjs(bytes, name, askPassword), doc = r.doc, finalBytes = bytes, locked = null, decrypted = false, security = null;
    // pdf.js says whether the file has a security handler; only then is the password code (shared/pdf-crypto) loaded
    if (r.password || await E.mayBeEncrypted(doc)) {
      try {
        await SP.decrypt.load();
        if (SP.decrypt.isEncrypted(bytes)) {
          var dec = await SP.decrypt.decryptPdf(bytes, r.password);
          if (dec) {
            // what the original had (method, permissions, owner or user password), never the password itself
            security = await SP.decrypt.describe(bytes, r.password).catch(function () { return null; });
            var r2 = await E.openPdfjs(dec, name, null);
            await doc.destroy(); doc = r2.doc; finalBytes = dec; decrypted = true;
          }
        }
      } catch (e) { locked = e.message || U.t('pdf.core.unsupported_encryption'); console.warn('Slop PDF: could not remove encryption', e); }
    }
    // A file's id comes from its fingerprint, so its pages and its saved edits line up when it is opened again.
    // A second copy of the same file in one session (or in another open tab) gets a random id and is not logged.
    // opts.files is the file map of a tab that is not on screen (io/doc-state.js); the default is the open document.
    var files = opts.files || E.files;
    var stable = fp ? 'f' + fp.slice(0, 16) : null;
    var id = opts.id || (stable && !files.has(stable) && !E.fileIdTaken(stable, files) ? stable : U.uid('f'));
    var f = { id: id, name: name, bytes: finalBytes, doc: doc, numPages: doc.numPages, color: opts.color || E.COLORS[E._colorIdx++ % E.COLORS.length], info: [], decrypted: decrypted, security: security, locked: locked, fields: undefined, fp: fp, noLog: false };
    var n = doc.numPages, next = 0;
    async function worker() {
      while (next < n) { var i = next++; var pg = await doc.getPage(i + 1); f.info[i] = { view: pg.view.slice(), rotate: ((pg.rotate % 360) + 360) % 360 }; }
    }
    await Promise.all([worker(), worker(), worker(), worker()]);
    files.set(f.id, f);
    if (!opts.silent) E.emit('files');
    return f;
  };
  /** pdf.js reads the trailer's /Encrypt: its document info names the handler (EncryptFilterName). No info: maybe. */
  E.mayBeEncrypted = async function (doc) {
    try { var md = await doc.getMetadata(); return !md || !md.info || !!md.info.EncryptFilterName; } catch (e) { return true; }
  };
  E.readMeta = async function (f) {
    try {
      var md = await f.doc.getMetadata(), inf = (md && md.info) || {};
      return { title: inf.Title || '', author: inf.Author || '', subject: inf.Subject || '', keywords: inf.Keywords || '' };
    } catch (e) { return null; }
  };

  /* ---------------------------------------------------------- rendering */
  var cache = new Map(), MAXCACHE = 600, MAXBYTES = 192e6, bytes = 0, queue = [], active = 0;
  function pump() {
    while (active < 3 && queue.length) {
      var job = queue.pop(); // LIFO: most recently requested (visible) first
      active++;
      job.run().then(job.res, job.rej).finally(function () { active--; pump(); });
    }
  }
  function schedule(run) { return new Promise(function (res, rej) { queue.push({ run: run, res: res, rej: rej }); pump(); }); }
  E.renderToCanvas = async function (f, i, scale, canvas) {
    var lib = await E.pdfjs(), pg = await f.doc.getPage(i + 1);
    if (f.fields && f.fields.length) E.syncStorage(f);
    var vp = pg.getViewport({ scale: scale, rotation: 0 });
    canvas = canvas || document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(vp.width)); canvas.height = Math.max(1, Math.floor(vp.height));
    var ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    // E.renderOptions(f): more render parameters (the layers shown, io/ocg.js)
    var extra = E.renderOptions ? await E.renderOptions(f) : null;
    var task = pg.render(Object.assign({ canvasContext: ctx, viewport: vp, annotationMode: lib.AnnotationMode.ENABLE_STORAGE, annotationStorage: f.doc.annotationStorage }, extra || {}));
    canvas._task = task;
    await task.promise;
    return canvas;
  };
  /** Resolution buckets (longest side, device px) so thumbnails stay sharp from tiny to full-width. */
  E.BUCKETS = [200, 320, 480, 720, 1000, 1400, 2000, 2800];
  E.bucket = function (px) { for (var i = 0; i < E.BUCKETS.length; i++) if (px <= E.BUCKETS[i]) return E.BUCKETS[i]; return E.BUCKETS[E.BUCKETS.length - 1]; };
  function evict(k0) { var e0 = cache.get(k0); cache.delete(k0); if (e0) { bytes -= e0.size || 0; if (e0.url) setTimeout(function (u) { URL.revokeObjectURL(u); }.bind(null, e0.url), 30000); } }
  /** Cached thumbnail object-URL for a page (unrotated raster). px = longest side in device px. */
  E.thumbURL = function (p, px) {
    if (p.blank) return Promise.resolve(null);
    var f = E.files.get(p.f); if (!f) return Promise.resolve(null);
    var b = E.bucket(px);
    var key = f.id + ':' + p.i + ':' + b + ':' + E.formKey(f.id);
    var hit = cache.get(key);
    if (hit) { cache.delete(key); cache.set(key, hit); return hit.p; }
    var g = E.geom(p), scale = b / Math.max(g.W, g.H);
    var entry = { url: null };
    entry.p = schedule(async function () {
      var c = await E.renderToCanvas(f, p.i, scale);
      // big rasters as JPEG: far smaller and faster to encode/decode than PNG at these sizes
      var blob = b > 1000 ? await U.canvasToBlob(c, 'image/jpeg', 0.9) : await U.canvasToBlob(c, 'image/png');
      entry.url = URL.createObjectURL(blob); entry.size = blob.size; bytes += blob.size;
      while (bytes > MAXBYTES && cache.size > 1) { var kk = cache.keys().next().value; if (kk === key) break; evict(kk); }
      c.width = c.height = 0;
      return entry.url;
    });
    entry.p.catch(function () { if (cache.get(key) === entry) cache.delete(key); });
    cache.set(key, entry);
    while (cache.size > MAXCACHE) evict(cache.keys().next().value);
    return entry.p;
  };
  E.dropCache = function (fid) {
    Array.from(cache.keys()).forEach(function (k) { if (!fid || k.indexOf(fid + ':') === 0) { var e = cache.get(k); cache.delete(k); if (e) { bytes -= e.size || 0; if (e.url) URL.revokeObjectURL(e.url); } } });
  };
})();
