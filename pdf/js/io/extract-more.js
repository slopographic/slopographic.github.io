/* Slop PDF — Extract all, beyond the stored images and fonts (assets-save.js): the embedded files as they are, the images
   painted inline in the content (an inline JPEG as its bytes, others drawn as PNG), each page's text (.txt, .md) and each
   page as a picture (PNG at a chosen resolution) or as SVG (its drawing as paths, its pictures embedded, its text as text).
   Pages and text come from the document as it is now (edits, added text and shapes included: E.build), the stored parts
   from the files. X.collect(choice) → { entries: [{ group, path, data }], skipped: [{ name, reason }] } in zip order. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, X = SP.assets, Mod = window.SlopPdfAssets, Sv = window.SlopPdfSvg, Lx = window.SlopPdfLex, Res = window.SlopPdfRes;

  function pad(n, total) { var w = String(total).length; return ('000000' + n).slice(-Math.max(2, w)); }
  /** The inline images of the document's pages: [{ id, p, o, page, name, width, height, kind: 'jpeg' | 'png' }]. */
  X.inlineImages = async function () {
    var O = SP.editor && SP.editor._.obj, out = [];
    if (!O) return out;
    for (var k = 0; k < E.state.pages.length; k++) {
      var p = E.state.pages[k]; if (p.blank || !p.f) continue;
      (await O.load(p)).filter(function (o) { return o.kind === 'inline'; }).forEach(function (o, j) {
        out.push({ id: 'inl' + (out.length + 1), p: p, o: o, page: k + 1, name: 'inline-' + (j + 1), width: o.w, height: o.h, ext: /^DCT/.test(o.filter || '') ? 'jpg' : 'png' });
      });
    }
    return out;
  };
  /** The document as it is now, opened with pdf.js (pages and text), built once per collection. */
  async function built() { var bytes = await E.build({}); return { bytes: bytes, doc: await E.openOutput(bytes) }; }
  /** One page of the built document as SVG: its content's paths, its XObject pictures (as their files), its text. */
  async function pageSvg(lib, pdoc, bytes, i) {
    var doc = lib.doc || (lib.doc = await PDFLib.PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true }));
    var pg = doc.getPage(i), c = Res.contentOf(doc, pg), ops = Lx.lex(c.text), res = Res.of(doc, pg.node.Resources()), mb = pg.getMediaBox();
    var found = await window.SlopPdfParts.scan(PDFLib, doc, [i], { fid: 'svg', file: 'page' }), pics = {};
    for (var im of found.images) {
      if (im.kind === 'skip') continue;
      var e = (await X.entries([im], [])).entries[0];
      if (e) pics[im.name] = U.bytesToDataURL(e.data, im.kind === 'jpeg' ? 'image/jpeg' : 'image/png');
    }
    var tc = await (await pdoc.getPage(i + 1)).getTextContent(), text = '';
    tc.items.forEach(function (it) {
      if (typeof it.str !== 'string' || !it.str.trim()) return;
      var t = it.transform, fs = Math.hypot(t[2], t[3]) || 10;
      text += '<text transform="matrix(' + [t[0] / fs, t[1] / fs, -t[2] / fs, -t[3] / fs, t[4], t[5]].map(function (v) { return +v.toFixed(3); }).join(' ') + ')" font-size="' + fs.toFixed(2) + '" font-family="sans-serif" fill="#000">' + Sv.esc(it.str) + '</text>';
    });
    return Sv.toSVG(ops, { box: [mb.x, mb.y, mb.x + mb.width, mb.y + mb.height], form: function (n) { var x = res.form(n); return x && x.ops ? x : null; },
      image: function (n) { return n && pics[n] ? { href: pics[n] } : null; }, extra: text });
  }
  /** choice: { images, fonts, attachments, inline (the items picked), text: '' | 'txt' | 'md' | 'both', pages: '' | 'png' | 'svg', dpi }. */
  X.collect = async function (choice, progress) {
    var base = await X.entries(choice.images || [], choice.fonts || []), items = base.entries.slice(), skipped = base.skipped.slice();
    (choice.attachments || []).forEach(function (a) {
      if (a.bytes) items.push({ group: 'attachment', path: 'attachments/' + (String(a.name).replace(/[\\/:*?"<>|]+/g, '_') || a.id), data: a.bytes });
      else skipped.push({ name: a.name, reason: a.reason || U.t('pdf.io.not_decoded') });
    });
    for (var inl of choice.inline || []) {
      try { var f = await SP.editor._.obj.file(inl.p, inl.o); items.push({ group: 'image', path: 'images/p' + inl.page + '-' + inl.name + '.' + f.name.split('.').pop(), data: new Uint8Array(await f.blob.arrayBuffer()) }); }
      catch (e) { skipped.push({ name: inl.name + ' (page ' + inl.page + ')', reason: e.message || String(e) }); }
    }
    if (choice.text || choice.pages) {
      var b = await built(), n = b.doc.numPages, lib = {};
      try {
        for (var i = 0; i < n; i++) {
          var pg = await b.doc.getPage(i + 1), nm = 'page-' + pad(i + 1, n);
          if (choice.text) {
            var t = Mod.pageText((await pg.getTextContent()).items, i + 1);
            if (choice.text !== 'md') items.push({ group: 'text', path: 'text/' + nm + '.txt', data: new TextEncoder().encode(t.txt) });
            if (choice.text !== 'txt') items.push({ group: 'text', path: 'text/' + nm + '.md', data: new TextEncoder().encode(t.md) });
          }
          if (choice.pages === 'svg') items.push({ group: 'page', path: 'pages/' + nm + '.svg', data: new TextEncoder().encode(await pageSvg(lib, b.doc, b.bytes, i)) });
          else if (choice.pages) {
            var vp = pg.getViewport({ scale: (choice.dpi || 150) / 72 }), c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(vp.width)); c.height = Math.max(1, Math.round(vp.height));
            var cx = c.getContext('2d', { alpha: false }); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
            await pg.render({ canvasContext: cx, viewport: vp }).promise;
            items.push({ group: 'page', path: 'pages/' + nm + '.png', data: new Uint8Array(await (await U.canvasToBlob(c, 'image/png')).arrayBuffer()) });
            c.width = c.height = 0;
          }
          if (progress) progress((i + 1) / n);
        }
      } finally { await b.doc.destroy(); }
    }
    var paths = Mod.uniquify(items.map(function (e) { return e.path; }));
    return { entries: Mod.planEntries(items.map(function (e, k) { return { group: e.group, path: paths[k], data: e.data }; })), skipped: skipped };
  };
})();
