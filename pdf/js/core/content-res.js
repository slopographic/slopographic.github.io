/* Slop PDF — a page's resources read with pdf-lib for the content readers (core/content-strip.js, content-fills.js,
   content-ink.js): fonts (name → { two, width(code) } or null: Widths/FirstChar, Type 0 Identity-H W/DW, the standard 14
   by pdf-lib's AFM metrics), colour spaces (name → a content-ink.js space: ICCBased as its alternate, Indexed with its
   lookup, Separation / one-ink DeviceN with an exponential tint transform; others null) and XObjects (images, and forms
   with their operators, matrix and own resources, a few levels deep). Classic script, used by editor/text-strip.js. */
(function () {
  'use strict';
  var R = window.SlopPdfRes = {};
  var Lx = window.SlopPdfLex;

  function latin1(b) {
    var s = '';
    for (var i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
    return s;
  }
  R.latin1 = latin1;
  /** A stream's decoded bytes as a latin1 string. */
  function streamText(s) { var L = PDFLib; return latin1(s instanceof L.PDFRawStream ? L.decodePDFRawStream(s).decode() : s.getUnencodedContents()); }
  /** The page's content streams (refs) and their decoded text, joined by a newline. */
  R.contentOf = function (doc, page) {
    var L = PDFLib, c = page.node.Contents(), refs = !c ? [] : c instanceof L.PDFArray ? c.asArray() : [c];
    return { refs: refs, text: refs.map(function (r) { return streamText(doc.context.lookup(r)); }).join('\n') };
  };

  /* ------------------------------------------------------------ fonts: name → { two, width(code) } or null */
  var STD = { Arial: 'Helvetica', ArialMT: 'Helvetica', 'Arial-BoldMT': 'Helvetica-Bold', 'Arial,Bold': 'Helvetica-Bold', TimesNewRoman: 'Times-Roman', TimesNewRomanPSMT: 'Times-Roman', CourierNew: 'Courier', CourierNewPSMT: 'Courier' }; // i18n-ignore: PDF names / font names / producer, not UI
  var stdCodes = new Map();
  function stdFont(base) {
    var n = String(base || '').replace(/^[A-Z]{6}\+/, ''), names = Object.values(PDFLib.StandardFonts);
    n = names.indexOf(n) >= 0 ? n : STD[n];
    if (!n) return null;
    if (!stdCodes.has(n)) {
      var em = PDFLib.StandardFontEmbedder.for(n), map = {};
      em.encoding.supportedCodePoints.forEach(function (cp) { var e = em.encoding.encodeUnicodeCodePoint(cp); if (map[e.code] == null) map[e.code] = em.font.getWidthOfGlyph(e.name) || 0; });
      stdCodes.set(n, map);
    }
    var m = stdCodes.get(n);
    return { two: false, width: function (c) { return m[c] || 0; } };
  }
  function readFont(ctx, d) {
    var L = PDFLib, N = function (k) { return L.PDFName.of(k); }, look = function (o) { return o ? ctx.lookup(o) : null; };
    var val = function (o) { o = look(o); return o instanceof L.PDFNumber ? o.asNumber() : null; };
    var nm = function (o) { o = look(o); return o instanceof L.PDFName ? o.decodeText() : null; };
    var sub = nm(d.get(N('Subtype'))); // i18n-ignore: PDF names / font names / producer, not UI
    if (sub === 'Type0') { // i18n-ignore: PDF names / font names / producer, not UI
      if (nm(d.get(N('Encoding'))) !== 'Identity-H') return null; // i18n-ignore: PDF names / font names / producer, not UI
      var kids = look(d.get(N('DescendantFonts'))), cid = kids instanceof L.PDFArray ? look(kids.get(0)) : null; // i18n-ignore: PDF names / font names / producer, not UI
      if (!(cid instanceof L.PDFDict)) return null;
      var dw = val(cid.get(N('DW'))), w = look(cid.get(N('W'))), map = new Map();
      if (dw == null) dw = 1000;
      if (w instanceof L.PDFArray) {
        var a = w.asArray(), i = 0;
        while (i < a.length) {
          var c0 = val(a[i]), nx = look(a[i + 1]);
          if (nx instanceof L.PDFArray) { nx.asArray().forEach(function (v, j) { map.set(c0 + j, val(v) || 0); }); i += 2; }
          else { var c1 = val(a[i + 1]), wv = val(a[i + 2]); for (var c = c0; c <= c1 && c - c0 < 65536; c++) map.set(c, wv); i += 3; }
        }
      }
      return { two: true, width: function (c) { return map.has(c) ? map.get(c) : dw; } };
    }
    if (sub === 'Type3') return null; // i18n-ignore: PDF names / font names / producer, not UI
    var widths = look(d.get(N('Widths'))), first = val(d.get(N('FirstChar'))); // i18n-ignore: PDF names / font names / producer, not UI
    if (widths instanceof L.PDFArray && first != null) {
      var ws = widths.asArray().map(function (v) { return val(v) || 0; }), fd = look(d.get(N('FontDescriptor'))); // i18n-ignore: PDF names / font names / producer, not UI
      var miss = fd instanceof L.PDFDict ? val(fd.get(N('MissingWidth'))) || 0 : 0; // i18n-ignore: PDF names / font names / producer, not UI
      return { two: false, width: function (c) { var k = c - first; return k >= 0 && k < ws.length ? ws[k] : miss; } };
    }
    return stdFont(nm(d.get(N('BaseFont')))); // i18n-ignore: PDF names / font names / producer, not UI
  }
  /* ------------------------------------------------------------ colour spaces */
  function readSpace(ctx, o, named, depth) {
    var L = PDFLib, Ink = window.SlopPdfInk, look = function (x) { return x ? ctx.lookup(x) : null; };
    o = look(o);
    if (!o || depth > 4) return null;
    if (o instanceof L.PDFName) { var n = o.decodeText(); return Ink.BUILTIN[n] || (named ? named(n) : null); }
    if (!(o instanceof L.PDFArray) || !o.size()) return null;
    var kind = look(o.get(0)), k = kind instanceof L.PDFName ? kind.decodeText() : '';
    var num = function (x) { x = look(x); return x instanceof L.PDFNumber ? x.asNumber() : null; };
    var nums = function (x, d) { x = look(x); return x instanceof L.PDFArray ? x.asArray().map(num) : d; };
    if (k === 'CalRGB') return Ink.BUILTIN.DeviceRGB; // i18n-ignore: PDF names / font names / producer, not UI
    if (k === 'CalGray') return Ink.BUILTIN.DeviceGray; // i18n-ignore: PDF names / font names / producer, not UI
    if (k === 'Pattern') return Ink.BUILTIN.Pattern; // i18n-ignore: PDF names / font names / producer, not UI
    if (k === 'ICCBased') {
      var st = look(o.get(1)), alt = st && st.dict ? st.dict.get(L.PDFName.of('Alternate')) : null, cn = st && st.dict ? num(st.dict.get(L.PDFName.of('N'))) : null; // i18n-ignore: PDF names / font names / producer, not UI
      if (alt) return readSpace(ctx, alt, named, depth + 1);
      return cn === 1 ? Ink.BUILTIN.DeviceGray : cn === 3 ? Ink.BUILTIN.DeviceRGB : cn === 4 ? Ink.BUILTIN.DeviceCMYK : null;
    }
    if (k === 'Indexed' || k === 'I') { // i18n-ignore: PDF names / font names / producer, not UI
      var base = readSpace(ctx, o.get(1), named, depth + 1), lk = look(o.get(3)), bytes = null;
      if (lk instanceof L.PDFString || lk instanceof L.PDFHexString) bytes = latin1(lk.asBytes());
      else if (lk && lk.dict) bytes = streamText(lk);
      return base && bytes != null ? { kind: 'indexed', base: base, hival: num(o.get(2)) || 0, lookup: bytes } : null;
    }
    if (k === 'Separation' || k === 'DeviceN') { // i18n-ignore: PDF names / font names / producer, not UI
      var names = look(o.get(1));
      if (k === 'DeviceN' && !(names instanceof L.PDFArray && names.size() === 1)) return null; // i18n-ignore: PDF names / font names / producer, not UI
      var altSp = readSpace(ctx, o.get(2), named, depth + 1), fn = look(o.get(3)), d = fn && fn.dict ? fn.dict : fn;
      if (!altSp || !(d instanceof L.PDFDict) || num(d.get(L.PDFName.of('FunctionType'))) !== 2) return null; // i18n-ignore: PDF names / font names / producer, not UI
      return { kind: 'sep', base: altSp, c0: nums(d.get(L.PDFName.of('C0')), [0]), c1: nums(d.get(L.PDFName.of('C1')), [1]), N: num(d.get(L.PDFName.of('N'))) };
    }
    return null;
  }

  /** The readers of a resource dictionary: { fonts, space, form, xobj }. parent: the resources a form without its own uses. */
  R.of = function (doc, res, parent, depth) {
    var L = PDFLib, ctx = doc.context, dict = function (k) { return res instanceof L.PDFDict ? res.lookup(L.PDFName.of(k)) : null; };
    if (!(res instanceof L.PDFDict) && parent) return parent;
    depth = depth || 0;
    var fd = dict('Font'), cs = dict('ColorSpace'), xd = dict('XObject'), fonts = {}, spaces = {}, xs = {}; // i18n-ignore: PDF names / font names / producer, not UI
    var out = {
      fonts: function (name) {
        if (!(name in fonts)) { var d = fd instanceof L.PDFDict ? fd.lookup(L.PDFName.of(name)) : null; try { fonts[name] = d instanceof L.PDFDict ? readFont(ctx, d) : null; } catch (e) { fonts[name] = null; } }
        return fonts[name];
      },
      space: function (name) {
        if (!(name in spaces)) { spaces[name] = null; try { spaces[name] = cs instanceof L.PDFDict ? readSpace(ctx, cs.get(L.PDFName.of(name)), out.space, 0) : null; } catch (e) { spaces[name] = null; } }
        return spaces[name];
      },
      /** name → { image: true } or a form { ops, matrix, res, xobj } (null when unknown or too deep). */
      form: function (name) {
        if (name in xs) return xs[name];
        var st = xd instanceof L.PDFDict ? xd.lookup(L.PDFName.of(name)) : null, x = null;
        try {
          var sub = st && st.dict ? st.dict.lookup(L.PDFName.of('Subtype')) : null, kind = sub instanceof L.PDFName ? sub.decodeText() : ''; // i18n-ignore: PDF names / font names / producer, not UI
          if (kind === 'Image') x = { image: true }; // i18n-ignore: PDF names / font names / producer, not UI
          else if (kind === 'Form' && depth < 4) { // i18n-ignore: PDF names / font names / producer, not UI
            var m = st.dict.lookup(L.PDFName.of('Matrix')), mat = m instanceof L.PDFArray ? m.asArray().map(function (v) { return ctx.lookup(v).asNumber(); }) : null; // i18n-ignore: PDF names / font names / producer, not UI
            var sub2 = R.of(doc, st.dict.lookup(L.PDFName.of('Resources')), out, depth + 1); // i18n-ignore: PDF names / font names / producer, not UI
            x = { ops: Lx.lex(streamText(st)), matrix: mat && mat.length === 6 ? mat : null, res: sub2, xobj: sub2.form };
          }
        } catch (e) { x = null; }
        return (xs[name] = x);
      }
    };
    out.xobj = out.form;
    return out;
  };
})();
