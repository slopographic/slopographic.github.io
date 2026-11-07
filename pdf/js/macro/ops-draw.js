/* Slop PDF macros — the steps that draw on pages: Header or footer, Page numbers, Watermark, Stamp.
   Positions are measured on the displayed page (P.frame), so text follows a rotated page. Each op takes
   (bytes, step, ctx) and resolves { bytes, message, warn }. ctx carries date, filename and the page count. */
(function () {
  'use strict';
  var M = window.SlopPdfMacro = window.SlopPdfMacro || {};
  var P = M.pdf, OPS = M.ops = M.ops || {};
  var MARGIN = 28, RAD = Math.PI / 180;
  /** The chosen language's text for a key (SlopI18n), else the English given: a string, or [one, other] for vars.n
   *  (node tests and pages without the tables). */
  function tr(k, en, v) {
    var I = window.SlopI18n;
    if (I && I.has && I.has(k)) return I.t(k, v);
    if (Array.isArray(en)) en = v && v.n === 1 ? en[0] : en[1];
    return String(en).replace(/\{(\w+)\}/g, function (m, n) { return v && n in v ? String(v[n]) : m; });
  }
  function pages(n) { return tr('pdf.macro.n_pages', ['{n} page', '{n} pages'], { n: n }); }
  function odd() { return ' ' + tr('pdf.macro.msg_question_marks', 'Some characters were written as “?”.'); }
  function tokens(text, i, n, ctx) {
    return M.expandTokens(text, { page: i + 1, pages: n, date: ctx.date, filename: ctx.filename });
  }
  function dataBytes(url) {
    var bin = atob(url.slice(url.indexOf(',') + 1)), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  /** Numbers for the page-number formats. total is the last number used. */
  function numberText(format, num, total) {
    switch (format) {
      case 'page': return 'Page ' + num; // i18n-ignore: PDF names / font names / producer, not UI
      case 'n-of': return num + ' / ' + total;
      case 'page-of': return 'Page ' + num + ' of ' + total; // i18n-ignore: PDF names / font names / producer, not UI
      case 'dash': return '– ' + num + ' –';
    }
    return String(num);
  }

  OPS.addHeaderFooter = async function (bytes, s, ctx) {
    var L = P.lib(), doc = await P.load(bytes), n = doc.getPageCount(), idx = M.parsePages(s.pages, n);
    var font = await P.font(doc, 'Helvetica'), col = P.rgb(s.colour), unsupported = 0; // i18n-ignore: PDF names / font names / producer, not UI
    idx.forEach(function (i) {
      var page = doc.getPage(i), fr = P.frame(page), text = tokens(s.text, i, n, ctx);
      if (P.hasUnsupported(font, text)) unsupported++;
      text = P.safeText(font, text);
      if (!text) return;
      var w = font.widthOfTextAtSize(text, s.size);
      var vx = s.align === 'left' ? MARGIN : s.align === 'right' ? fr.VW - MARGIN - w : (fr.VW - w) / 2;
      var vy = s.position === 'header' ? MARGIN + s.size * 0.75 : fr.VH - MARGIN;
      var p = fr.pt(vx, vy);
      page.drawText(text, { x: p[0], y: p[1], size: s.size, font: font, color: col, rotate: L.degrees(fr.rot) });
    });
    return { bytes: await doc.save(), message: (s.position === 'header' ? tr('pdf.macro.msg_header', 'Added a header to {pages}.', { pages: pages(idx.length) }) : tr('pdf.macro.msg_footer', 'Added a footer to {pages}.', { pages: pages(idx.length) })) + (unsupported ? odd() : ''), warn: !!unsupported };
  };

  OPS.addPageNumbers = async function (bytes, s, ctx) {
    var L = P.lib(), doc = await P.load(bytes), n = doc.getPageCount(), idx = M.parsePages(s.pages, n);
    var font = await P.font(doc, 'Helvetica'), col = P.rgb(s.colour); // i18n-ignore: PDF names / font names / producer, not UI
    var where = String(s.position).split('-'), top = where[0] === 'top', align = where[1] || 'center';
    var last = s.start + n - 1;
    idx.forEach(function (i) {
      var page = doc.getPage(i), fr = P.frame(page);
      var text = numberText(s.format, s.start + i, last), w = font.widthOfTextAtSize(text, s.size);
      var vx = align === 'left' ? MARGIN : align === 'right' ? fr.VW - MARGIN - w : (fr.VW - w) / 2;
      var vy = top ? MARGIN + s.size * 0.75 : fr.VH - MARGIN;
      var p = fr.pt(vx, vy);
      page.drawText(text, { x: p[0], y: p[1], size: s.size, font: font, color: col, rotate: L.degrees(fr.rot) });
    });
    return { bytes: await doc.save(), message: tr('pdf.macro.msg_numbered', 'Numbered {pages} ({position}).', { pages: pages(idx.length), position: M.posLabel ? M.posLabel(s.position) : s.position }), warn: false };
  };

  /** Watermark layers, bottom first (core/watermark.js). Each layer that applies to a page is drawn on top of what is
      there: text in its font, or a logo, rotated about its centre, at its opacity. */
  OPS.addWatermark = async function (bytes, s, ctx) {
    var L = P.lib(), WM = window.SlopPdfWm, doc = await P.load(bytes), n = doc.getPageCount();
    var layers = M.layersOf(s), fonts = {}, images = {}, unsupported = 0, touched = new Set();
    async function fontFor(name) { if (!fonts[name]) fonts[name] = await P.font(doc, name); return fonts[name]; }
    async function imageFor(id) {
      if (!images[id]) { var raw = dataBytes(id); images[id] = /^data:image\/png/.test(id) ? await doc.embedPng(raw) : await doc.embedJpg(raw); }
      return images[id];
    }
    for (var i = 0; i < n; i++) {
      var page = doc.getPage(i), fr = P.frame(page);
      for (var k = 0; k < layers.length; k++) {
        var Ly = layers[k];
        if (!WM.appliesTo(Ly, i, n)) continue;
        var font = null, img = null, text = '', content;
        if (Ly.kind === 'image') {
          img = await imageFor(Ly.asset);
          content = { w: Ly.size, h: Ly.size * img.height / img.width };
        } else {
          font = await fontFor(Ly.font);
          text = tokens(Ly.text, i, n, ctx);
          if (P.hasUnsupported(font, text)) unsupported++;
          text = P.safeText(font, text);
          if (!text) continue;
          content = { w: font.widthOfTextAtSize(text, Ly.size), h: Ly.size * 1.2 };
        }
        var b = WM.box(Ly, fr.VW, fr.VH, content), c = fr.pt(b.cx, b.cy), theta = fr.rot + Ly.rot;
        var rad = theta * RAD, ux = Math.cos(rad), uy = Math.sin(rad), vx = -uy, vy = ux, deg = L.degrees(((theta % 360) + 360) % 360);
        if (img) {
          // bottom-left corner of the logo: the centre less half its width and half its height along the box axes
          page.drawImage(img, { x: c[0] - (content.w / 2) * ux - (content.h / 2) * vx, y: c[1] - (content.w / 2) * uy - (content.h / 2) * vy, width: content.w, height: content.h, rotate: deg, opacity: Ly.opacity });
        } else {
          var hh = Ly.size * 0.36; // the baseline sits half a cap height below the centre
          page.drawText(text, { x: c[0] - (content.w / 2) * ux - hh * vx, y: c[1] - (content.w / 2) * uy - hh * vy, size: Ly.size, font: font, color: P.rgb(Ly.colour), opacity: Ly.opacity, rotate: deg });
        }
        touched.add(i);
      }
    }
    return { bytes: await doc.save(), message: tr('pdf.macro.msg_watermark', 'Added {layers} on {pages}.', { layers: tr('pdf.macro.n_wm_layers', ['{n} watermark layer', '{n} watermark layers'], { n: layers.length }), pages: pages(touched.size) }) + (unsupported ? odd() : ''), warn: !!unsupported };
  };

  OPS.stamp = async function (bytes, s, ctx) {
    var L = P.lib(), doc = await P.load(bytes), n = doc.getPageCount(), idx = M.parsePages(s.pages, n);
    var img = null, font = null;
    if (s.imageDataUrl) {
      var raw = dataBytes(s.imageDataUrl);
      img = /^data:image\/png/.test(s.imageDataUrl) ? await doc.embedPng(raw) : await doc.embedJpg(raw);
    } else font = await P.font(doc, 'Helvetica'); // i18n-ignore: PDF names / font names / producer, not UI
    idx.forEach(function (i) {
      var page = doc.getPage(i), fr = P.frame(page), x = fr.VW * s.x / 100, y = fr.VH * s.y / 100;
      if (img) {
        var w = fr.VW * s.width / 100, h = w * img.height / img.width, p = fr.pt(x, y + h);
        page.drawImage(img, { x: p[0], y: p[1], width: w, height: h, rotate: L.degrees(fr.rot) });
      } else {
        var text = P.safeText(font, tokens(s.text, i, n, ctx)), size = 14, q = fr.pt(x, y + size * 0.8);
        page.drawText(text, { x: q[0], y: q[1], size: size, font: font, color: P.rgb(s.colour), rotate: L.degrees(fr.rot) });
      }
    });
    return { bytes: await doc.save(), message: tr('pdf.macro.msg_stamped', 'Stamped {pages}.', { pages: pages(idx.length) }), warn: false };
  };
})();
