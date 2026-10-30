/* Slop Press — File ▸ Place: images into frames (or new frames), text files as threaded stories (autoflow),
   PDF pages as images (rendered with the vendored pdf.js). */
(function () {
  'use strict';
  var PR = window.PR, U = PR.util, S = PR.state, M = PR.model, I = PR.items, H = PR.history, P = PR.pages;
  var PL = PR.place = {};
  var SCRIPT = document.currentScript && document.currentScript.src;

  function targetSurface() { return PR.view.active() || { items: PR.activeItems(), side: P.side(S.doc, S.page), pageIdx: S.page }; }
  function sizeOf(url) { return new Promise(function (res) { var i = new Image(); i.onload = function () { res({ w: i.naturalWidth || 1, h: i.naturalHeight || 1 }); }; i.onerror = function () { res({ w: 400, h: 300 }); }; i.src = url; }); }

  /** Puts an image (data URL) into `frame` (made an image frame) or into a new frame on the active page. */
  PL.image = function (url, frame, name, opts) {
    opts = opts || {};
    var aid = U.uid('A'); S.doc.assets[aid] = url;
    return sizeOf(url).then(function (sz) {
      var it = frame;
      if (it) { it.type = 'image'; it.asset = aid; it.fit = it.fit || 'fill'; if (it.fit === 'custom') it.fit = 'fill'; delete it.story; }
      else {
        var s = opts.surface || targetSurface(), m = P.marginsSide(S.doc, s.side), d = S.doc;
        var bw = opts.fill ? d.size.w : d.size.w - m.left - m.right, bh = opts.fill ? d.size.h : d.size.h - m.top - m.bottom;
        var nw = sz.w * 0.75, nh = sz.h * 0.75, sc = Math.min(1, bw / nw, bh / nh), w = nw * sc, h = nh * sc;
        if (opts.fill) { sc = Math.min(bw / nw, bh / nh); w = nw * sc; h = nh * sc; }
        var x0 = opts.fill ? 0 : m.left, y0 = opts.fill ? 0 : m.top;
        it = M.item('image', x0 + (bw - w) / 2, y0 + (bh - h) / 2, w, h, { asset: aid, fit: 'fill', name: name || '', layer: PR.layers.active || null });
        I.add(S.doc, s.items, it);
      }
      if (!opts.noCommit) { H.commit(U.t('press.edit.undo_place_image')); PR.select([it.id]); }
      return it;
    });
  };
  /** New text frame with `text`, filling the margins of the active page. autoflow: add pages until it fits. */
  PL.text = function (text, opts) {
    opts = opts || {};
    var s = targetSurface(), m = P.marginsSide(S.doc, s.side), d = S.doc;
    var fr = M.item('text', m.left, m.top, d.size.w - m.left - m.right, d.size.h - m.top - m.bottom, { cols: opts.autoflow ? d.columns.count : 1, gutter: d.columns.gutter, layer: PR.layers.active || null });
    if (!opts.autoflow) { fr.w = Math.min(fr.w, 300); fr.h = Math.min(fr.h, 200); fr.x += 12; fr.y += 12; }
    I.add(d, s.items, fr, { text: String(text).replace(/\r\n?/g, '\n'), ps: 'Body' });
    var st = d.stories[fr.story];
    if (st.paras.length > 1 && /^.{1,80}$/.test(st.text.split('\n')[0])) st.paras[0].ps = d.styles.para['Heading 1'] ? 'Heading 1' : st.paras[0].ps;
    PR.touch();
    var added = opts.autoflow && s.pageIdx != null ? PR.engine.autoflow(fr.story) : 0;
    H.commit(U.t('press.edit.undo_place_text')); PR.select([fr.id]);
    if (added) U.toast(U.t('press.io.placed_text', { n: added }));
    return fr;
  };
  /** Renders a PDF's pages to images and places them one per page (adding pages as needed). */
  PL.pdf = function (bytes, name) {
    var base = SCRIPT ? new URL('../../../vendor/pdfjs/', SCRIPT).href : new URL('../vendor/pdfjs/', document.baseURI).href;
    var libP = window.pdfjsLib ? Promise.resolve(window.pdfjsLib) : import(new URL('../../shared/compat/pdfjs.js', base).href).then(function (m) { return m.loadPdfjs(base); }).then(function (lib) { window.pdfjsLib = lib; return lib; });
    U.toast(U.t('press.io.rendering_pdf'));
    return libP.then(function (lib) {
      return lib.getDocument({ data: bytes.slice(), isEvalSupported: false, standardFontDataUrl: base + 'standard_fonts/', cMapUrl: base + 'cmaps/', cMapPacked: true }).promise;
    }).then(function (pdf) {
      var n = Math.min(pdf.numPages, 60), start = S.page, chain = Promise.resolve();
      for (var k = 1; k <= n; k++) (function (k) {
        chain = chain.then(function () { return pdf.getPage(k); }).then(function (pg) {
          var vp = pg.getViewport({ scale: 2 }), c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
          return pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise.then(function () {
            var idx = start + k - 1;
            if (!S.doc.pages[idx]) P.insertPages(S.doc, idx, 1);
            S.page = idx;
            return PL.image(c.toDataURL('image/jpeg', 0.9), null, (name || 'PDF') + ' p' + k, // i18n-ignore: the frame's name in the document
                 { fill: true, noCommit: true, surface: { items: S.doc.pages[idx].items, side: P.side(S.doc, idx), pageIdx: idx } });
          });
        });
      })(k);
      return chain.then(function () { H.commit(U.t('press.edit.undo_place_pdf')); PR.goPage(start); U.toast(U.t('press.io.placed_pdf', { n: n })); });
    }).catch(function (e) { U.toast(U.t('press.io.pdf_failed', { error: e.message })); });
  };
  /** Places files (from a picker, drop or paste). opts.fill: images fill the page. */
  PL.files = function (files, opts) {
    opts = opts || {};
    return files.reduce(function (p, f) {
      return p.then(function () {
        if (/^image\//.test(f.type)) return U.blobToDataURL(f).then(function (url) { return PL.image(url, opts.frame || null, f.name, opts); });
        if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) return f.arrayBuffer().then(function (b) { return PL.pdf(new Uint8Array(b), f.name); });
        if (/\.(slpress)$/i.test(f.name)) return PR.io.openAny(f);
        if (/^text\//.test(f.type) || /\.(txt|md|csv)$/i.test(f.name)) return f.text().then(function (t) { return PL.text(t, { autoflow: true }); });
        if (/\.(ttf|otf)$/i.test(f.name)) return PR.fonts.addFile(S.doc, f).then(function (fam) { H.commit(U.t('press.edit.undo_load_font')); U.toast(U.t('press.io.font_loaded', { name: fam })); });
        U.toast(U.t('press.io.cannot_place', { name: f.name }));
      });
    }, Promise.resolve());
  };
  /** File ▸ Place… (into `frame` when given): a source of the one intake (io/intake.js). */
  PL.pick = function (frame) { return PR.intake.place(frame); };
})();
