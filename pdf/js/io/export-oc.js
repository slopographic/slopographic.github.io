/* Slop PDF — what a saved PDF keeps from its source files besides the pages (io/export.js E.build): the PDF layers
   (/OCProperties: the groups the copied pages use, their order, and the default view with the layers hidden here, io/ocg.js)
   and the embedded files (the EmbeddedFiles name tree, e.g. a Factur-X / ZUGFeRD invoice, with the catalog's AF list).
   pdf-lib's copyPages has its own object copier, so the pages are copied here with one copier per source file, and the
   catalog parts through the same copier: the layer a page's content names is the very object in /OCProperties. */
(function () {
  'use strict';
  var SP = window.SP, E = SP.engine;
  var copiers = new Map(); // source file id → { copier, src } for the build in progress

  /** Copies pages idx of src into out with one object copier per source file (kept for E.carryCatalog). */
  E.copyPagesWith = async function (out, src, idx, fid) {
    var L = PDFLib;
    await src.flush();
    var copier = L.PDFObjectCopier.for(src.context, out.context), pages = src.getPages();
    copiers.set(fid, { copier: copier, src: src });
    return idx.map(function (i) { var node = copier.copy(pages[i].node), ref = out.context.register(node); return L.PDFPage.of(node, ref, out); });
  };
  function N(k) { return PDFLib.PDFName.of(k); }
  /** The source catalog's value under key, copied into out (null when it has none). */
  function copied(c, key) { var v = c.src.catalog.get(N(key)); return v ? c.copier.copy(v) : null; }
  function arr(ctx, v) { v = v instanceof PDFLib.PDFRef ? ctx.lookup(v) : v; return v instanceof PDFLib.PDFArray ? v : null; }

  /** After the pages are in: the layers and the embedded files of every source file, merged, and the layers hidden in
   * Slop PDF written as the default view (the saved file opens with them hidden). */
  E.carryCatalog = function (out) {
    var L = PDFLib, ctx = out.context, ocgs = [], on = [], off = [], order = [], efs = [], af = [];
    copiers.forEach(function (c, fid) {
      var props = copied(c, 'OCProperties'), d = props && ctx.lookup(props);
      if (d instanceof L.PDFDict) {
        var list = arr(ctx, d.get(N('OCGs'))), def = d.get(N('D')) && ctx.lookup(d.get(N('D'))), hide = new Set(SP.ocg ? SP.ocg.hiddenNames(fid) : []);
        var offSet = new Set(((def && arr(ctx, def.get(N('OFF')))) || { asArray: function () { return []; } }).asArray().map(String));
        var base = def && def.get(N('BaseState')), baseOff = base && base.decodeText && base.decodeText() === 'OFF'; // i18n-ignore: PDF names / font names / producer, not UI
        (list ? list.asArray() : []).forEach(function (r) {
          var g = ctx.lookup(r), nm = g instanceof L.PDFDict && g.get(N('Name')) ? g.lookup(N('Name')).decodeText() : ''; // i18n-ignore: PDF names / font names / producer, not UI
          var known = SP.ocg && SP.ocg.cached(E.files.get(fid)) ? SP.ocg.cached(E.files.get(fid)).some(function (x) { return x.name === nm; }) : false;
          var hidden = known ? hide.has(nm) : (baseOff || offSet.has(String(r)));
          ocgs.push(r); (hidden ? off : on).push(r);
        });
        var ord = def && arr(ctx, def.get(N('Order'))); // i18n-ignore: PDF names / font names / producer, not UI
        if (ord) order = order.concat(ord.asArray());
      }
      // only the EmbeddedFiles tree of /Names is copied (its Dests would drag the source's pages along)
      var sn = c.src.catalog.lookup(N('Names')), st = sn instanceof L.PDFDict ? sn.get(N('EmbeddedFiles')) : null; // i18n-ignore: PDF names / font names / producer, not UI
      if (st) collect(ctx, c.copier.copy(st), efs, 0);
      var a = copied(c, 'AF'); if (a && arr(ctx, a)) af = af.concat(arr(ctx, a).asArray());
    });
    copiers.clear();
    if (ocgs.length) {
      var D = ctx.obj({ Name: L.PDFString.of('Slop PDF'), BaseState: N('ON'), ON: on, OFF: off, Order: order.length ? order : ocgs }); // i18n-ignore: PDF names / font names / producer, not UI
      out.catalog.set(N('OCProperties'), ctx.obj({ OCGs: ocgs, D: D }));
    }
    if (efs.length) {
      var seen = {}, pairs = [];
      efs.sort(function (x, y) { return x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0; }).forEach(function (e) {
        var k = e[0], n = 2; while (seen[k]) k = e[0] + ' (' + n++ + ')';
        seen[k] = 1; pairs.push(L.PDFHexString.fromText(k), e[1]);
      });
      out.catalog.set(N('Names'), ctx.obj({ EmbeddedFiles: ctx.obj({ Names: pairs }) })); // i18n-ignore: PDF names / font names / producer, not UI
    }
    if (af.length) out.catalog.set(N('AF'), ctx.obj(af));
  };
  /** The [name, file spec] pairs of a name tree. */
  function collect(ctx, node, outList, depth) {
    var L = PDFLib;
    node = node instanceof L.PDFRef ? ctx.lookup(node) : node;
    if (!(node instanceof L.PDFDict) || depth > 20) return;
    var names = arr(ctx, node.get(N('Names'))), kids = arr(ctx, node.get(N('Kids'))); // i18n-ignore: PDF names / font names / producer, not UI
    if (names) for (var i = 0; i + 1 < names.size(); i += 2) { var k = ctx.lookup(names.get(i)); outList.push([k && k.decodeText ? k.decodeText() : 'file', names.get(i + 1)]); }
    if (kids) kids.asArray().forEach(function (k) { collect(ctx, k, outList, depth + 1); });
  }
})();
