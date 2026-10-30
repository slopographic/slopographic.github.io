/* Slop PDF — page objects (images, inline images, forms, vector groups) read from a page and edited in its content stream:
   the object edits of Objects mode go through the same derived-copy path as Edit text (editor/text-strip.js X.build: a
   copy of the file with the page's content rewritten, checked with pdf.js, the page pointed at it in one commit, undo
   points it back, the edit log makes it again on replay). The rewrites are core/content-move.js on the objects of
   core/content-objs.js; every other operator stays byte for byte.
     S.objRead(doc, i) → { text, refs, ops, list }   the objects of page i of a pdf-lib document
     edit: { kind: 'obj', op: 'transform' | 'delete' | 'duplicate' | 'order' | 'replace', id (the object's id on the page
       the edit is made from), T (user-space matrix: transform, duplicate), dir (order), image: { mime, url, w, h } (replace) }
   Classic script. */
(function () {
  'use strict';
  var SP = window.SP, Ed = SP.editor, S = Ed._, X = S.strip, Lx = window.SlopPdfLex, Ob = window.SlopPdfObjs, Mv = window.SlopPdfMove;
  var U = SP.util, Res = window.SlopPdfRes;

  function num(ctx, o) { o = ctx.lookup(o); return o && o.asNumber ? o.asNumber() : null; }
  function numsOf(ctx, a) { a = a ? ctx.lookup(a) : null; return a instanceof PDFLib.PDFArray ? a.asArray().map(function (v) { return num(ctx, v); }) : null; }
  /** The XObjects of a resource dictionary by name: { kind, w, h } for an image, { kind, bbox, matrix } for a form. */
  S.objInfo = function (doc, res) {
    var L = PDFLib, ctx = doc.context, xd = res instanceof L.PDFDict ? res.lookup(L.PDFName.of('XObject')) : null, memo = {};
    return function (name) {
      if (name in memo) return memo[name];
      var st = xd instanceof L.PDFDict ? xd.lookup(L.PDFName.of(name)) : null, d = st && st.dict, out = null;
      if (d) {
        var sub = d.lookup(L.PDFName.of('Subtype')), k = sub instanceof L.PDFName ? sub.decodeText() : '';
        if (k === 'Image') out = { kind: 'image', w: num(ctx, d.get(L.PDFName.of('Width'))) || 0, h: num(ctx, d.get(L.PDFName.of('Height'))) || 0, ref: xd.get(L.PDFName.of(name)) };
        else if (k === 'Form') {
          var m = numsOf(ctx, d.get(L.PDFName.of('Matrix'))), bb = numsOf(ctx, d.get(L.PDFName.of('BBox')));
          out = { kind: 'form', matrix: m && m.length === 6 ? m : null, bbox: bb && bb.length === 4 ? [Math.min(bb[0], bb[2]), Math.min(bb[1], bb[3]), Math.max(bb[0], bb[2]), Math.max(bb[1], bb[3])] : null, ref: xd.get(L.PDFName.of(name)) };
        }
      }
      return (memo[name] = out);
    };
  };
  S.objRead = function (doc, i) {
    var page = doc.getPage(i), c = Res.contentOf(doc, page), ops = Lx.lex(c.text), res = page.node.Resources();
    var mb = page.getMediaBox(), info = S.objInfo(doc, res);
    var list = Ob.objects(c.text, ops, info, { page: [mb.x, mb.y, mb.x + mb.width, mb.y + mb.height] });
    list.forEach(function (o) { var x = o.name != null ? info(o.name) : null; if (x && x.ref) o.ref = String(x.ref); });
    return { text: c.text, refs: c.refs, ops: ops, list: list, info: info, res: res };
  };

  /** The new content of page i for an edit, or null when it cannot be made (the object is not there, already in front …). */
  async function rewrite(doc, i, r, edit) {
    var o = r.list.filter(function (x) { return x.id === edit.id; })[0];
    if (!o) return null;
    switch (edit.op) {
      case 'transform': return Mv.transform(r.text, r.ops, o, edit.T);
      case 'delete': return Mv.remove(r.text, r.ops, o);
      case 'duplicate': return Mv.duplicate(r.text, r.ops, o, edit.T || Mv.move(12, -12));
      case 'order': return Mv.order(r.text, r.ops, r.list, o, edit.dir);
      case 'replace':
        if (o.kind !== 'image' && o.kind !== 'inline') return null;
        var bytes = U.dataURLToBytes(edit.image.url), jpg = /jpe?g/.test(edit.image.mime);
        var img = jpg ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
        var name = doc.getPage(i).node.newXObject('SlopImg', img.ref).decodeText();
        return Mv.replace(r.text, r.ops, o, name, (edit.image.w || img.width) / (edit.image.h || img.height));
    }
    return null;
  }
  X.kinds.obj = {
    derive: async function (f, i, edit) {
      var doc = await X.load(f.bytes), r = S.objRead(doc, i), text = await rewrite(doc, i, r, edit);
      if (text == null || text === r.text) return null;
      X.putContent(doc, i, r.refs, text);
      return doc.save({ useObjectStreams: true });
    },
    /** The edited page still opens and draws in pdf.js (its operators read to the end). */
    verify: async function (f, made, i) {
      var ol = await (await made.doc.getPage(i + 1)).getOperatorList();
      return !!(ol && ol.fnArray && ol.fnArray.length);
    }
  };

  /** Makes an object edit on page p and commits it as one undo step. Resolves the derived file's id, or null. */
  S.objCommit = async function (p, edit, label) {
    var r = await X.edit(p, Object.assign({ kind: 'obj' }, edit));
    if (!r.to) return null;
    var pid = p.id;
    SP.engine.commit(label, function (st) { var q = st.pages.filter(function (x) { return x.id === pid; })[0]; if (q) X.use(q, r.to); });
    return r.to;
  };
})();
