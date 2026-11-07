/* Slop PDF — extract, reading: the embedded images, fonts and attached files of the pages in the document. The reading is
   core/pdf-parts.js (pdf-lib, shared with the headless operation); this keeps it to the pages still in the document, one
   pass per source file, each object once. Decoding is in assets-save.js. */
(function () {
  'use strict';
  var SP = window.SP, E = SP.engine, P = window.SlopPdfParts, A = SP.assets = {};

  A.inflate = P.inflate;
  A.streamBytes = P.streamBytes;
  /** The file a derived copy (text or objects edited, editor/text-strip.js) was made from, down to the opened one. */
  function rootOf(fid) { while (E.files.get(fid) && E.files.get(fid).derived) fid = E.files.get(fid).derived.from; return fid; }
  A.rootOf = rootOf;
  function load(f) { return window.PDFLib.PDFDocument.load(f.bytes, { updateMetadata: false, ignoreEncryption: true, throwOnInvalidObject: false }); }
  /** The source files the document's pages come from, each with the page indices still in it. */
  function byFile() {
    var m = new Map();
    E.state.pages.forEach(function (p) {
      if (!p.f || p.blank || !E.files.get(p.f)) return;
      if (!m.has(p.f)) m.set(p.f, new Set());
      m.get(p.f).add(p.i);
    });
    return m;
  }

  /** Reads the images and fonts of the document's pages. Resolves { images, fonts }, each item once (with the pages it is on). */
  A.scan = async function () {
    var PL = window.PDFLib, files = byFile(), acc = { images: [], fonts: [], seen: new Set(), n: 0 };
    for (var [fid, idxs] of files) {
      var f = E.files.get(fid), doc = await load(f);
      // keyed by the opened file: a derived copy keeps its images' object numbers, so an image is listed once
      await P.scan(PL, doc, Array.from(idxs), { fid: rootOf(fid), file: f.name || 'document', multi: files.size > 1 }, acc);
    }
    return { images: acc.images, fonts: acc.fonts };
  };
  /** The embedded files of the document's source files (name tree and file attachment annotations), each file once. */
  A.attachments = async function () {
    var PL = window.PDFLib, files = byFile(), out = [], seen = new Set();
    for (var [fid, idxs] of files) {
      var f = E.files.get(fid), root = rootOf(fid);
      var list = await P.attachments(PL, await load(f), Array.from(idxs));
      list.forEach(function (a) {
        var key = root + ':' + a.name + ':' + a.size + ':' + a.from + a.page;
        if (seen.has(key)) return;
        seen.add(key);
        a.id = 'att' + (out.length + 1);
        if (files.size > 1) a.file = f.name;
        out.push(a);
      });
    }
    return out;
  };
})();
