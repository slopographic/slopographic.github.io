/* Slop PDF — the fonts of a paragraph frame (Edit text ▸ Paragraphs) and how the frame is laid out and saved.
   A frame's text is drawn in the document's own font where it can be: the font the paragraph was set in, read from the page
   with pdf-lib (its ToUnicode map gives the code of each character it has, its W or Widths array the advance), so the new
   text is the same face and stays real text (the ToUnicode map makes it searchable and copyable). A character the font does
   not have (a subset holds only the glyphs the old text used), right-to-left lines (they need shaping) and fonts that cannot
   be reused (Type 3, a non-Identity CMap) are set in the substitute font Edit text already uses (font-check.js S.runFont: the
   installed family, the answer for it, or the closest one; language fonts for other scripts, text-intl.js).
   A frame annotation { type: 'para', cx, cy, w, h, fs, lh, asc, align, rtl, first, rest, pgap, color, styles, paras, lines }
   keeps its laid-out lines, so it draws and saves without the document's fonts at hand; each style keeps the codes and
   widths of the characters it uses (cm: { char: [code hex, width per 1000 em] }) and its substitute font (sub, key).
     P.info(f, pageIndex, ps) → Promise<{ two, chars: Map(char → [code, width]) } | null>
     P.relayout(a)            the lines again for the frame's width and text (keeps its top edge)
     E.drawPara(out, page, a, g, ctx)   the export (io/export.js)
     E.paraFontNeeds(a)        the substitute fonts to prepare before saving (core/fonts-custom.js) */
(function () {
  'use strict';
  var SP = window.SP, E = SP.engine, Ed = SP.editor, S = Ed._, L2 = window.SPParaLayout;
  var P = S.para = S.para || {};
  var docs = new WeakMap(), infos = new Map();
  P.faces = new Map(); // PostScript name → the CSS family pdf.js loaded the document font as (screen only)

  function N(k) { return PDFLib.PDFName.of(k); }
  function nameOf(o) { return !o ? '' : o.decodeText ? o.decodeText() : o.asString ? o.asString().replace(/^\//, '') : String(o); }
  function num(o) { return o && o.asNumber ? o.asNumber() : null; }
  function jsArr(ctx, a) {
    a = ctx.lookup(a);
    if (!(a instanceof PDFLib.PDFArray)) return [];
    return a.asArray().map(function (x) { x = ctx.lookup(x); return x instanceof PDFLib.PDFArray ? jsArr(ctx, x) : num(x); });
  }
  function streamText(ctx, ref) {
    var s = ctx.lookup(ref);
    if (!s || !s.dict) return '';
    var b = PDFLib.decodePDFRawStream(s).decode(), out = '';
    for (var i = 0; i < b.length; i++) out += String.fromCharCode(b[i]);
    return out;
  }
  /** Whether two font names are one font (a writer may add "-Identity-H" to a Type 0 font's name). */
  function sameName(a, b) { a = String(a || ''); b = String(b || ''); return !!a && !!b && (a === b || a.indexOf(b + '-') === 0 || b.indexOf(a + '-') === 0); }

  /** Each font dictionary the page's content can use: the page's resources and its forms' (three deep). */
  P.pageFonts = function (ctx, res, out, depth) {
    out = out || []; res = ctx.lookup(res);
    if (!(res instanceof PDFLib.PDFDict)) return out;
    var fd = ctx.lookup(res.get(N('Font')));
    if (fd instanceof PDFLib.PDFDict) fd.entries().forEach(function (e) { // compat-ok: pdf-lib returns an array here, not an iterator
      var d = ctx.lookup(e[1]);
      if (d instanceof PDFLib.PDFDict) out.push({ name: nameOf(d.lookup(N('BaseFont'))), dict: d, ref: e[1] instanceof PDFLib.PDFRef ? e[1] : null });
    });
    var xo = ctx.lookup(res.get(N('XObject')));
    if ((depth || 0) < 3 && xo instanceof PDFLib.PDFDict) xo.entries().forEach(function (e) { // compat-ok: pdf-lib returns an array here, not an iterator
      var st = ctx.lookup(e[1]);
      if (st && st.dict && nameOf(st.dict.lookup(N('Subtype'))) === 'Form') P.pageFonts(ctx, st.dict.get(N('Resources')), out, (depth || 0) + 1);
    });
    return out;
  };

  /** The characters a font dictionary can draw again: { two (two-byte codes), chars }, or null when it cannot be reused. */
  function readFont(ctx, d) {
    var sub = nameOf(d.lookup(N('Subtype'))), chars = new Map(), tu = d.get(N('ToUnicode'));
    var rev = tu ? L2.reverseMap(L2.parseToUnicode(streamText(ctx, tu)).map) : null;
    var embedded = function (fdsc) { fdsc = ctx.lookup(fdsc); return fdsc instanceof PDFLib.PDFDict && ['FontFile', 'FontFile2', 'FontFile3'].some(function (k) { return !!fdsc.get(N(k)); }); };
    if (sub === 'Type0') {
      if (nameOf(d.lookup(N('Encoding'))) !== 'Identity-H' || !rev) return null;
      var desc = ctx.lookup(jsArrRef(ctx, d.get(N('DescendantFonts'))));
      if (!(desc instanceof PDFLib.PDFDict) || !embedded(desc.get(N('FontDescriptor')))) return null;
      var W = L2.parseW(jsArr(ctx, desc.get(N('W')))), dw = num(ctx.lookup(desc.get(N('DW')))) || 1000;
      rev.forEach(function (code, ch) { var c = parseInt(code, 16), w = W.has(c) ? W.get(c) : dw; chars.set(ch, [code.padStart(4, '0'), w]); });
      return { two: true, chars: chars };
    }
    if (sub !== 'TrueType' && sub !== 'Type1' && sub !== 'MMType1') return null;
    var first = num(ctx.lookup(d.get(N('FirstChar')))), widths = jsArr(ctx, d.get(N('Widths')));
    if (first == null || !widths.length || !embedded(d.get(N('FontDescriptor')))) return null;
    var add = function (code, ch) { var w = widths[code - first]; if (w != null && !chars.has(ch)) chars.set(ch, [code.toString(16).toUpperCase().padStart(2, '0'), w]); };
    if (rev) rev.forEach(function (code, ch) { if (code.length <= 2) add(parseInt(code, 16), ch); });
    else {
      var enc = ctx.lookup(d.get(N('Encoding')));
      if (enc instanceof PDFLib.PDFDict) return null; // Differences without a ToUnicode map: the glyph names are not read here
      if (nameOf(enc) !== 'WinAnsiEncoding') return null;
      L2.WIN_ANSI.forEach(function (ch, code) { add(code, ch); });
    }
    return chars.size ? { two: false, chars: chars } : null;
  }
  function jsArrRef(ctx, a) { a = ctx.lookup(a); return a instanceof PDFLib.PDFArray && a.size() ? a.get(0) : null; }

  /** The source document of a file, read once with pdf-lib. */
  function srcDoc(f) {
    if (!docs.has(f)) docs.set(f, PDFLib.PDFDocument.load(f.bytes, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false }));
    return docs.get(f);
  }
  P.info = function (f, i, ps) {
    var key = f.id + ':' + i + ':' + ps;
    if (!infos.has(key)) infos.set(key, srcDoc(f).then(function (doc) {
      var pg = doc.getPage(i), hit = P.pageFonts(doc.context, pg.node.Resources(), [], 0).find(function (x) { return sameName(x.name, ps); });
      return hit ? readFont(doc.context, hit.dict) : null;
    }).catch(function () { return null; }));
    return infos.get(key);
  };

  /* ------------------------------------------------------------ measuring */
  P.has = function (st, ch) { return !!(st.cm && st.cm[ch]); };
  P.width = function (st, t, fs, fb) {
    if (fb) return E.measure(t, st.key, fs);
    var w = 0;
    for (var ch of t) w += st.cm[ch] ? st.cm[ch][1] : 0;
    return w * fs / 1000;
  };
  P.measure = function (st, t, fs) {
    return L2.pieces({ x: 0, t: t, s: 0 }, function (ch) { return P.has(st, ch); }, function (x, s, fb) { return P.width(st, x, fs, fb); }).reduce(function (a, p) { return a + p.w; }, 0);
  };
  P.space = function (st, fs) { return P.has(st, ' ') ? P.width(st, ' ', fs, false) : E.measure(' ', st.key, fs); };
  /** Adds the codes of a text's characters that the style's document font has (info from P.info). */
  P.fillCm = function (st, info, text) {
    if (!info) return;
    st.cm = st.cm || {};
    for (var ch of String(text)) if (!st.cm[ch] && info.chars.has(ch)) st.cm[ch] = info.chars.get(ch);
  };
  var r2 = function (v) { return Math.round(v * 100) / 100; };
  P.relayout = function (a) {
    var top = a.cy - a.h / 2, st = a.styles;
    var ls = L2.layout(a.paras, {
      width: a.w, align: a.align, rtl: !!a.rtl, first: a.first || 0, rest: a.rest || 0,
      measure: function (t, s) { return a.rtl ? E.measure(t, st[s].key, a.fs) : P.measure(st[s], t, a.fs); },
      space: function (s) { return P.space(st[s], a.fs); }
    });
    var b = a.asc, out = [];
    ls.forEach(function (l, i) {
      if (i) b += a.lh + (ls[i - 1].end ? (a.pgap || 0) : 0);
      var segs = [];
      l.segs.forEach(function (sg) {
        L2.pieces(sg, function (ch, s) { return P.has(st[s], ch); }, function (t, s, fb) { return P.width(st[s], t, a.fs, fb); }).forEach(function (p) {
          segs.push({ x: r2(p.x), w: r2(p.w), t: p.t, s: p.s, fb: p.fb, rtl: !!sg.rtl });
        });
      });
      out.push({ b: r2(b), segs: segs });
    });
    a.lines = out;
    a.h = r2(b + 0.3 * a.fs);
    a.cy = top + a.h / 2;
    return a;
  };
  /** The text of each style of a frame, for preparing its fonts. */
  E.paraFontNeeds = function (a) {
    var txt = (a.styles || []).map(function () { return ''; });
    (a.paras || []).forEach(function (pr) { pr.forEach(function (r) { txt[r.s] = (txt[r.s] || '') + r.t; }); });
    return (a.styles || []).map(function (st, i) { return Object.assign({ text: txt[i] || ' ' }, st.sub); });
  };

  /* ---------------------------------------------------------------- saving */
  /** The resource name of the document font ps on an output page (the copied page keeps its fonts), or null. */
  function fontName(out, page, ps, ctx) {
    ctx.paraFonts = ctx.paraFonts || new Map();
    var m = ctx.paraFonts.get(page);
    if (!m) ctx.paraFonts.set(page, (m = new Map()));
    if (!m.has(ps)) {
      var find = function (pg) { return P.pageFonts(out.context, pg.node.Resources(), [], 0).find(function (x) { return sameName(x.name, ps); }); };
      // a frame pasted or dragged onto another page: the font is found on the page it came from (any page of the output)
      var hit = find(page), others = out.getPages(), nm = null;
      for (var oi = 0; !hit && oi < others.length; oi++) if (others[oi] !== page) hit = find(others[oi]);
      if (hit) nm = page.node.newFontDictionary('SlopPara', hit.ref || out.context.register(hit.dict));
      m.set(ps, nm);
    }
    return m.get(ps);
  }
  E.drawPara = async function (out, page, a, g, ctx) {
    var L = PDFLib, c = SP.util.hexToRgb(a.color || '#000000'), col = L.rgb(c.r, c.g, c.b);
    var left = g.x0 + a.cx - a.w / 2, top = g.y0 + g.H - (a.cy - a.h / 2), fs = a.fs, turned = !!(a.rot && a.rot % 360);
    if (turned) { // turned about its centre (counter-clockwise for a positive rot, as the screen draws it: para-view.js)
      var th = a.rot * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th), px = g.x0 + a.cx, py = g.y0 + g.H - a.cy;
      page.pushOperators(L.pushGraphicsState(), L.concatTransformationMatrix(cs, sn, -sn, cs, px - cs * px + sn * py, py - sn * px - cs * py));
    }
    for (var li = 0; li < (a.lines || []).length; li++) {
      var line = a.lines[li], y = top - line.b;
      for (var si = 0; si < line.segs.length; si++) {
        var sg = line.segs[si], st = a.styles[sg.s] || a.styles[0], x = left + sg.x;
        var nm = !sg.fb && st.ps ? fontName(out, page, st.ps, ctx) : null;
        if (nm) {
          var hex = '';
          for (var ch of sg.t) if (st.cm[ch]) hex += st.cm[ch][0];
          page.pushOperators(L.pushGraphicsState(), L.beginText(), L.setFontAndSize(nm, fs), L.setFillingRgbColor(c.r, c.g, c.b),
            L.setTextMatrix(1, 0, 0, 1, x, y), L.showText(L.PDFHexString.of(hex)), L.endText(), L.popGraphicsState());
          continue;
        }
        // the substitute font: one run per font, in visual order (a language font for other scripts, text-intl.js)
        var key = st.key, runs = E.runsOf(E.sanitize(sg.t, key), key, !!st.sub.bold);
        for (var ri = 0; ri < runs.length; ri++) {
          var rf = await E.embedTextFont(out, runs[ri].font, ctx.fonts);
          if (E.face(runs[ri].font)) window.SlopPdfRuns.drawRun(L, page, rf, { text: runs[ri].text, x: x, y: y, size: fs, rtl: !!runs[ri].rtl, shaped: true }, { color: [c.r, c.g, c.b] });
          else page.drawText(runs[ri].text, { x: x, y: y, size: fs, font: rf, color: col });
          x += E.measureRun(runs[ri].text, runs[ri].font, fs);
        }
      }
    }
    if (turned) page.pushOperators(L.popGraphicsState());
  };
})();
